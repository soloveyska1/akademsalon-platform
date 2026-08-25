#!/usr/bin/env python3
"""Fail-closed installer for a dedicated SQLite single-statement write lane.

The bot's ordinary aiosqlite connection serves long-lived reads while
Analytics v2 writes through short-lived sqlite3 connections.  In WAL mode an
ordinary connection cannot upgrade an old read snapshot after another writer
commits: SQLite raises ``database is locked`` immediately (BUSY_SNAPSHOT).

The patch keeps reads on the ordinary connection and makes that connection
runtime query-only.  All single-statement writes use the existing ``_exec``
helper, now backed by a dedicated autocommit connection guarded by one asyncio
lock.  Existing multi-statement write groups are made explicit isolated
transactions.  The writer never serves reads, so it cannot own a stale read
snapshot; autocommit also removes the execute/commit await gap that previously
let tasks share one implicit transaction.  There is deliberately no replay and
no cross-task rollback, and the query-only reader fails closed if a future
direct write bypasses the reviewed lane.

The installer never reads SQLite data, environment values, sessions, contacts
or client files.  The source file is hash-pinned, backed up and replaced
atomically; rollback restores its exact pre-image.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path


KNOWN_BEFORE = {
    "db": "46d34c7dbcd47c65458738b1a0ebac7086515d5abfc2d298e3ff362cc150c776",
    "webapp": "346a41ea05dd428f3c02c6566ffdc9407e5f0de618624b43e0735fe19ec8f735",
    "handlers_admin": "09d5fb5c10586e2266d3b84ce029d38248408878aa2e2de393260823be04f205",
    "handlers_channel_feed": "dd5d582609d29ac4e342c35084b1509917c9780fc01e0f8ea09005482b8fb30a",
    "handlers_client": "0a59af19d1f7c8fd8ce05bcce01b94f6e9409ea6be8f4fbbd46877ad4d2fd435",
    "handlers_group": "4f5c6ce0bd2926c85a2b72816dcdecc1d45d625903c196c50577fa729392f3c1",
    "services_bonus": "fff5f7cd61292bc6d76a76e9d5c4e38c0c58b58724566fb29ffb6ef9eb5e24d1",
    "services_deposit": "78e08f255b9b4872fe51c9738ced4659c10b6cabb7bbb3dadd20324c185d35c1",
    "services_handoff": "342133cb6867045be14af31363f9b503fcabab8c358fc2391dd4f4514e704023",
    "services_scheduler": "dcbd048e2d8bbd47d0339e03a49574de1e4dd3ca79bf56d33ff02def130bcc27",
}
KNOWN_AFTER = {
    "db": "51702018cf8bf97d3bfa97675133bf8dc21d8d5b2692577cb079d0609588b2a1",
    "webapp": "2d2bebb3a0a363cdff5d060c6d459834f8d2d1efb6f01426c003cd1ca8435d0e",
    "handlers_admin": "a257727e84fb5ece8163449d7d6e87b23f39adc15225e8d82862491ed10a3a2c",
    "handlers_channel_feed": "864db83fd7fd56411f86914c02e911f0aa9894cd5ff56bb85a7f740c59067349",
    "handlers_client": "a98da93fd7a790d6b32d57591f71e5dd1d8ef6b96105d7fb91dc32d354f75fac",
    "handlers_group": "2603315f59898f6f10a27b334bcae5f1ad79cdc7a2c12e957e72f406a69dd9ef",
    "services_bonus": "7e2f09f59dc1de1a0722f50a97805f7df2c23aa818547ed26e2708d9cbec99d6",
    "services_deposit": "8ecfa3492bef54bb4501db65c59bb0a403ef2c5ba798b04426c1636a1b24d816",
    "services_handoff": "fcc0d5a63dd507bf8774a354b001c8ce949d82ae9756fecfc2ebeb5ccc8390dd",
    "services_scheduler": "1a6c8cabe90e881e90be3111e841508c052e77ee641b4167dc3f474ad45031f3",
}

DB_MARKER = "sqlite-dedicated-writer:20260825"
MODULE_MARKER = "sqlite-write-lane-migration:20260825"


OLD_IMPORT_BLOCK = '''import hashlib
import json
import re
'''


NEW_IMPORT_BLOCK = '''import asyncio
import hashlib
import json
import re
'''


OLD_GLOBAL_BLOCK = '''_conn: aiosqlite.Connection | None = None
_db_path: str | None = None
'''


NEW_GLOBAL_BLOCK = '''_conn: aiosqlite.Connection | None = None
_write_conn: aiosqlite.Connection | None = None
_write_lock: asyncio.Lock | None = None
_db_path: str | None = None
'''


OLD_INIT_HEAD = '''async def init(path: str) -> None:
    global _conn, _db_path
'''


NEW_INIT_HEAD = '''async def init(path: str) -> None:
    global _conn, _write_conn, _write_lock, _db_path
'''


OLD_INIT_TAIL = '''    await _conn.execute(
        "DELETE FROM geo_cache WHERE at IS NOT NULL AND at < ?",
        (analytics_cutoff,),
    )
    await _conn.commit()
'''


NEW_INIT_TAIL = '''    await _conn.execute(
        "DELETE FROM geo_cache WHERE at IS NOT NULL AND at < ?",
        (analytics_cutoff,),
    )
    await _conn.commit()

    # Single-statement helpers use a connection that never serves reads.  With
    # autocommit there is no execute/commit await gap and therefore no shared
    # implicit transaction for another asyncio task to commit or roll back.
    writer = None
    try:
        writer = await aiosqlite.connect(path, isolation_level=None)
        writer.row_factory = _secure_row_factory
        pragma = await writer.execute("PRAGMA foreign_keys=ON")
        await pragma.close()
        pragma = await writer.execute("PRAGMA busy_timeout=5000")
        await pragma.close()
        # Every runtime write must use the dedicated lane or an explicit
        # isolated transaction.  Any missed legacy direct DML now fails closed
        # instead of poisoning the shared reader snapshot.
        pragma = await _conn.execute("PRAGMA query_only=ON")
        await pragma.close()
    except BaseException:
        if writer is not None:
            await writer.close()
        await _conn.close()
        _conn = None
        _db_path = None
        raise
    _write_conn = writer
    _write_lock = asyncio.Lock()
'''


OLD_CLOSE_BLOCK = '''async def close() -> None:
    if _conn:
        await _conn.close()
'''


NEW_CLOSE_BLOCK = '''async def close() -> None:
    global _conn, _write_conn, _write_lock, _db_path
    writer, ordinary = _write_conn, _conn
    _write_conn = None
    _write_lock = None
    _conn = None
    _db_path = None
    try:
        if writer:
            await writer.close()
    finally:
        if ordinary:
            await ordinary.close()
'''


OLD_DB_BLOCK = '''async def _commit() -> None:
    """Commit an ordinary helper, or defer to the outer unit-of-work."""
    if _transaction_connection.get() is None:
        await conn().commit()


async def _exec(sql: str, args: Iterable[Any] = ()) -> aiosqlite.Cursor:
    cur = await conn().execute(sql, tuple(args))
    await _commit()
    return cur
'''


NEW_DB_BLOCK = '''async def _commit() -> None:
    """Commit an ordinary helper, or defer to the outer unit-of-work."""
    if _transaction_connection.get() is None:
        await conn().commit()


async def _exec(sql: str, args: Iterable[Any] = ()) -> aiosqlite.Cursor:
    parameters = tuple(args)
    transactional = _transaction_connection.get()
    if transactional is not None:
        return await transactional.execute(sql, parameters)
    writer = _write_conn
    lock = _write_lock
    assert writer is not None and lock is not None, "db.init() не вызван"
    # sqlite-dedicated-writer:20260825
    async with lock:
        return await writer.execute(sql, parameters)
'''


OLD_SESSION_FETCH = '''    row = await cur.fetchone()
    if row:
        idle_ttl = (
'''


NEW_SESSION_FETCH = '''    row = await cur.fetchone()
    await cur.close()
    if row:
        idle_ttl = (
'''


OLD_QA_DELETE = '''async def qa_delete(qa_id: int) -> None:
    await conn().execute("DELETE FROM qa_votes WHERE qa_id=?", (qa_id,))
    await conn().execute("DELETE FROM qa WHERE id=?", (qa_id,))
    await _commit()
    bus_bump()
'''


NEW_QA_DELETE = '''async def qa_delete(qa_id: int) -> None:
    async with transaction():
        await _exec("DELETE FROM qa_votes WHERE qa_id=?", (qa_id,))
        await _exec("DELETE FROM qa WHERE id=?", (qa_id,))
'''


OLD_QA_VOTE = '''async def qa_vote(qa_id: int, vid: str) -> int | None:
    """«У меня такой же вопрос»: один голос на браузер; None — уже голосовал."""
    cur = await conn().execute(
        "INSERT OR IGNORE INTO qa_votes(qa_id, vid, created_at) VALUES(?,?,?)",
        (qa_id, vid, now_iso()))
    if not cur.rowcount:
        await _commit()
        return None
    await conn().execute(
        "UPDATE qa SET same_count = same_count + 1 WHERE id=?", (qa_id,))
    await _commit()
    bus_bump()
    cur = await conn().execute("SELECT same_count FROM qa WHERE id=?", (qa_id,))
    row = await cur.fetchone()
    return int(row["same_count"]) if row else None
'''


NEW_QA_VOTE = '''async def qa_vote(qa_id: int, vid: str) -> int | None:
    """«У меня такой же вопрос»: один голос на браузер; None — уже голосовал."""
    async with transaction():
        cur = await _exec(
            "INSERT OR IGNORE INTO qa_votes(qa_id, vid, created_at) VALUES(?,?,?)",
            (qa_id, vid, now_iso()))
        if not cur.rowcount:
            return None
        await _exec(
            "UPDATE qa SET same_count = same_count + 1 WHERE id=?", (qa_id,))
        cur = await conn().execute("SELECT same_count FROM qa WHERE id=?", (qa_id,))
        row = await cur.fetchone()
    return int(row["same_count"]) if row else None
'''


OLD_QA_BAN = '''async def qa_ban(vid: str, ip: str, note: str = "") -> None:
    for key in (f"vid:{vid}" if vid else "", f"ip:{ip}" if ip else ""):
        if key:
            await conn().execute(
                "INSERT OR REPLACE INTO qa_bans(key, note, created_at) VALUES(?,?,?)",
                (key, note, now_iso()))
    await _commit()
'''


NEW_QA_BAN = '''async def qa_ban(vid: str, ip: str, note: str = "") -> None:
    async with transaction():
        for key in (f"vid:{vid}" if vid else "", f"ip:{ip}" if ip else ""):
            if key:
                await _exec(
                    "INSERT OR REPLACE INTO qa_bans(key, note, created_at) VALUES(?,?,?)",
                    (key, note, now_iso()))
'''


OLD_ADMIN_CLIENT_BAN = '''async def admin_client_ban(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    uid = int(request.match_info["id"])
    if uid in config.ADMIN_IDS:
        return _err("not_yourself")
    try:
        b = await request.json()
        on = bool(b.get("banned"))
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    await db.conn().execute("UPDATE users SET banned=? WHERE id=?", (1 if on else 0, uid))
    if on:
        # рвём уже открытые сессии, иначе вошедший клиент продолжал бы
        # работать до истечения сессии (а они были бессрочны)
        await db.conn().execute("DELETE FROM sessions WHERE user_id=?", (uid,))
    await db.conn().commit()
    return _json({"ok": True, "banned": on})
'''


NEW_ADMIN_CLIENT_BAN = '''async def admin_client_ban(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    uid = int(request.match_info["id"])
    if uid in config.ADMIN_IDS:
        return _err("not_yourself")
    try:
        b = await request.json()
        on = bool(b.get("banned"))
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    async with db.transaction():
        await db._exec("UPDATE users SET banned=? WHERE id=?", (1 if on else 0, uid))
        if on:
            # рвём уже открытые сессии, иначе вошедший клиент продолжал бы
            # работать до истечения сессии (а они были бессрочны)
            await db._exec("DELETE FROM sessions WHERE user_id=?", (uid,))
    return _json({"ok": True, "banned": on})
'''


OLD_DEPOSIT_CREATE_WRITES = '''    await db.conn().execute(
        "UPDATE deposits SET status='canceled', "
        "note=COALESCE(note,'') || ' · перекрыт новым' "
        "WHERE user_id=? AND status='pending'", (user_id,))
    pct = rate_for(amount)
    cur = await db.conn().execute(
        "INSERT INTO deposits(user_id, amount, bonus_pct, bonus_amount, "
        "status, via, created_at) VALUES(?,?,?,?, 'pending', ?, ?)",
        (user_id, amount, pct, amount * pct // 100, via, db.now_iso()))
    await db.conn().commit()
'''


NEW_DEPOSIT_CREATE_WRITES = '''    pct = rate_for(amount)
    async with db.transaction():
        await db._exec(
            "UPDATE deposits SET status='canceled', "
            "note=COALESCE(note,'') || ' · перекрыт новым' "
            "WHERE user_id=? AND status='pending'", (user_id,))
        cur = await db._exec(
            "INSERT INTO deposits(user_id, amount, bonus_pct, bonus_amount, "
            "status, via, created_at) VALUES(?,?,?,?, 'pending', ?, ?)",
            (user_id, amount, pct, amount * pct // 100, via, db.now_iso()))
'''


OLD_DEPOSIT_ACTIVATE_WRITES = '''async def activate_paid(bot: Bot, dep_id: int, method: str = "manual",
                        actor: str = "мастер"):
    """Деньги пришли: зачислить кошелёк и бонусы. Идемпотентно."""
    d = await dep_get(dep_id)
    if not d:
        return None
    if d["status"] == "active":
        return d
    if d["status"] != "pending":
        return None
    await db.conn().execute(
        "UPDATE deposits SET status='active', paid_at=?, pay_method=? WHERE id=?",
        (db.now_iso(), method, dep_id))
    await db.conn().execute(
        "INSERT INTO deposit_ledger(user_id, delta, kind, deposit_id, note, "
        "created_at) VALUES(?,?, 'topup', ?, ?, ?)",
        (d["user_id"], d["amount"], dep_id,
         f"пополнение · {method} · {actor}", db.now_iso()))
    await db.conn().commit()
    if d["bonus_amount"] > 0:
        await db.bonus_add(d["user_id"], d["bonus_amount"], "deposit",
                           f"+{d['bonus_pct']}% за пополнение депозита №{dep_id}",
                           ttl_days=BONUS_TTL)
    bal = await balance(d["user_id"])
    if d["user_id"] and d["user_id"] > 0:
        await notify.notify_client(
            bot, d["user_id"],
            f"💼 <b>Депозит пополнен на {config.fmt_money(d['amount'])} ₽.</b>\\n"
            f"Бонусами сверху — <b>{config.fmt_money(d['bonus_amount'])}</b> "
            f"(+{d['bonus_pct']}%), бонусы живут {BONUS_TTL} дней.\\n"
            f"На кошельке сейчас: <b>{config.fmt_money(bal)} ₽</b> — им можно "
            "оплачивать этапы заказов в один клик. Данные для официального чека "
            "переданы при пополнении; подтверждение платежа придёт отдельно.")
    log.info("deposit %s activated (%s ₽, %s, %s)",
             dep_id, d["amount"], method, actor)
    return await dep_get(dep_id)
'''


NEW_DEPOSIT_ACTIVATE_WRITES = '''async def activate_paid(bot: Bot, dep_id: int, method: str = "manual",
                        actor: str = "мастер"):
    """Деньги пришли: зачислить кошелёк и бонусы. Идемпотентно."""
    async with db.transaction():
        d = await dep_get(dep_id)
        if not d:
            return None
        if d["status"] == "active":
            return d
        if d["status"] != "pending":
            return None
        transitioned = await db._exec(
            "UPDATE deposits SET status='active', paid_at=?, pay_method=? "
            "WHERE id=? AND status='pending'",
            (db.now_iso(), method, dep_id))
        if transitioned.rowcount != 1:
            raise RuntimeError(f"deposit {dep_id} activation CAS failed")
        await db._exec(
            "INSERT INTO deposit_ledger(user_id, delta, kind, deposit_id, note, "
            "created_at) VALUES(?,?, 'topup', ?, ?, ?)",
            (d["user_id"], d["amount"], dep_id,
             f"пополнение · {method} · {actor}", db.now_iso()))
        if d["bonus_amount"] > 0:
            await db.bonus_add(d["user_id"], d["bonus_amount"], "deposit",
                               f"+{d['bonus_pct']}% за пополнение депозита №{dep_id}",
                               ttl_days=BONUS_TTL)
    bal = await balance(d["user_id"])
    if d["user_id"] and d["user_id"] > 0:
        await notify.notify_client(
            bot, d["user_id"],
            f"💼 <b>Депозит пополнен на {config.fmt_money(d['amount'])} ₽.</b>\\n"
            f"Бонусами сверху — <b>{config.fmt_money(d['bonus_amount'])}</b> "
            f"(+{d['bonus_pct']}%), бонусы живут {BONUS_TTL} дней.\\n"
            f"На кошельке сейчас: <b>{config.fmt_money(bal)} ₽</b> — им можно "
            "оплачивать этапы заказов в один клик. Данные для официального чека "
            "переданы при пополнении; подтверждение платежа придёт отдельно.")
    log.info("deposit %s activated (%s ₽, %s, %s)",
             dep_id, d["amount"], method, actor)
    return await dep_get(dep_id)
'''


OLD_DEPOSIT_REFUND_WRITES = '''async def refund(dep_id: int, actor: str = "мастер") -> tuple[bool, str, int]:
    """Возврат пополнения (правила 5а.6): снять остаток с кошелька, аннулировать
    неистраченные бонусы начисления, истраченные — удержать из возвращаемой
    суммы. Деньги мастер переводит клиенту сам; функция готовит расчёт.
    Возвращает (ok, отчёт для мастера, сумма к возврату деньгами)."""
    d = await dep_get(dep_id)
    if not d:
        return False, f"депозит №{dep_id} не найден", 0
    if d["status"] != "active":
        return False, f"депозит №{dep_id} в статусе {d['status']} — возврат не к чему", 0
    uid = d["user_id"]
    bal = await balance(uid)
    money_back = min(bal, d["amount"])          # больше остатка кошелька не вернуть
    # бонусное начисление этого пополнения: гасим живой остаток, считаем истраченное
    cur = await db.conn().execute(
        "SELECT id, delta, consumed FROM bonus_ledger "
        "WHERE user_id=? AND kind='deposit' AND note LIKE ? "
        "ORDER BY id DESC LIMIT 1", (uid, f"%№{dep_id}"))
    acc = await cur.fetchone()
    spent_bonus = 0
    if acc:
        unspent = max(0, acc["delta"] - acc["consumed"])
        spent_bonus = acc["delta"] - unspent
        await db.conn().execute(
            "UPDATE bonus_ledger SET consumed=? WHERE id=?", (acc["delta"], acc["id"]))
        if unspent > 0:
            await db.conn().execute(
                "INSERT INTO bonus_ledger(user_id, delta, kind, note, consumed, created_at) "
                "VALUES(?,?, 'revoke', ?, 0, ?)",
                (uid, -unspent, f"возврат депозита №{dep_id}: бонусы аннулированы",
                 db.now_iso()))
    money_back = max(0, money_back - spent_bonus)
    if money_back > 0:
        await db.conn().execute(
            "INSERT INTO deposit_ledger(user_id, delta, kind, deposit_id, note, created_at) "
            "VALUES(?,?, 'refund', ?, ?, ?)",
            (uid, -money_back, dep_id, f"возврат · {actor}", db.now_iso()))
    await db.conn().execute(
        "UPDATE deposits SET status='refunded', refunded_at=?, refund_note=? WHERE id=?",
        (db.now_iso(), f"возврат · {actor}", dep_id))
    await db.conn().commit()
    report = (f"Депозит №{dep_id} ({config.fmt_money(d['amount'])} ₽) закрыт.\\n"
              f"К возврату клиенту деньгами: <b>{config.fmt_money(money_back)} ₽</b>"
              + (f" (удержано за потраченные бонусы: {config.fmt_money(spent_bonus)} ₽)"
                 if spent_bonus else "")
              + f".\\nОстаток кошелька клиента теперь: {config.fmt_money(await balance(uid))} ₽.")
    log.info("deposit %s refunded by %s: money_back=%s, spent_bonus=%s",
             dep_id, actor, money_back, spent_bonus)
    return True, report, money_back
'''


NEW_DEPOSIT_REFUND_WRITES = '''async def refund(dep_id: int, actor: str = "мастер") -> tuple[bool, str, int]:
    """Возврат пополнения (правила 5а.6): снять остаток с кошелька, аннулировать
    неистраченные бонусы начисления, истраченные — удержать из возвращаемой
    суммы. Деньги мастер переводит клиенту сам; функция готовит расчёт.
    Возвращает (ok, отчёт для мастера, сумма к возврату деньгами)."""
    async with db.transaction():
        d = await dep_get(dep_id)
        if not d:
            return False, f"депозит №{dep_id} не найден", 0
        if d["status"] != "active":
            return False, f"депозит №{dep_id} в статусе {d['status']} — возврат не к чему", 0
        transitioned = await db._exec(
            "UPDATE deposits SET status='refunded', refunded_at=?, refund_note=? "
            "WHERE id=? AND status='active'",
            (db.now_iso(), f"возврат · {actor}", dep_id))
        if transitioned.rowcount != 1:
            raise RuntimeError(f"deposit {dep_id} refund CAS failed")
        uid = d["user_id"]
        bal = await balance(uid)
        money_back = min(bal, d["amount"])      # больше остатка кошелька не вернуть
        # бонусное начисление этого пополнения: гасим живой остаток, считаем истраченное
        cur = await db.conn().execute(
            "SELECT id, delta, consumed FROM bonus_ledger "
            "WHERE user_id=? AND kind='deposit' AND note LIKE ? "
            "ORDER BY id DESC LIMIT 1", (uid, f"%№{dep_id}"))
        acc = await cur.fetchone()
        spent_bonus = 0
        if acc:
            unspent = max(0, acc["delta"] - acc["consumed"])
            spent_bonus = acc["delta"] - unspent
            await db._exec(
                "UPDATE bonus_ledger SET consumed=? WHERE id=?", (acc["delta"], acc["id"]))
            if unspent > 0:
                await db._exec(
                    "INSERT INTO bonus_ledger(user_id, delta, kind, note, consumed, created_at) "
                    "VALUES(?,?, 'revoke', ?, 0, ?)",
                    (uid, -unspent, f"возврат депозита №{dep_id}: бонусы аннулированы",
                     db.now_iso()))
        money_back = max(0, money_back - spent_bonus)
        if money_back > 0:
            await db._exec(
                "INSERT INTO deposit_ledger(user_id, delta, kind, deposit_id, note, created_at) "
                "VALUES(?,?, 'refund', ?, ?, ?)",
                (uid, -money_back, dep_id, f"возврат · {actor}", db.now_iso()))
    report = (f"Депозит №{dep_id} ({config.fmt_money(d['amount'])} ₽) закрыт.\\n"
              f"К возврату клиенту деньгами: <b>{config.fmt_money(money_back)} ₽</b>"
              + (f" (удержано за потраченные бонусы: {config.fmt_money(spent_bonus)} ₽)"
                 if spent_bonus else "")
              + f".\\nОстаток кошелька клиента теперь: {config.fmt_money(await balance(uid))} ₽.")
    log.info("deposit %s refunded by %s: money_back=%s, spent_bonus=%s",
             dep_id, actor, money_back, spent_bonus)
    return True, report, money_back
'''


OLD_HANDOFF_ENSURE_ROWS = '''    for pos, _item in enumerate(items):
        for channel in channels:
            await db.conn().execute(
                "INSERT OR IGNORE INTO handoff_deliveries(artifact_id,position,kind,"
                "channel,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                (a["id"], pos, kind, channel, "pending", now, now))
    await db.conn().commit()
'''


NEW_HANDOFF_ENSURE_ROWS = '''    async with db.transaction():
        for pos, _item in enumerate(items):
            for channel in channels:
                await db._exec(
                    "INSERT OR IGNORE INTO handoff_deliveries(artifact_id,position,kind,"
                    "channel,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                    (a["id"], pos, kind, channel, "pending", now, now))
'''


OLD_HANDOFF_DELIVER_CABINET = '''async def _deliver_cabinet(order_id: int, a, items: list[dict], kind: str,
                           caption: str) -> bool:
    """Каноническая выдача в кабинете: message + receipt одной транзакцией."""
    c = db.conn()
    for pos, item in enumerate(items):
        cur = await c.execute(
            "SELECT status FROM handoff_deliveries WHERE artifact_id=? AND position=? "
            "AND kind=? AND channel='cabinet'", (a["id"], pos, kind))
        row = await cur.fetchone()
        if row and row["status"] == "sent":
            continue
        send_id = item["preview_file_id"] if kind == "preview" else item["source_file_id"]
        name = (f"proverka-{os.path.splitext(item['source_file_name'])[0]}.pdf"
                if kind == "preview" else item["source_file_name"])
        now = db.now_iso()
        await c.execute(
            "INSERT INTO messages(order_id,sender,text,kind,file_name,tg_file_id,"
            "seen_client,created_at) VALUES(?,?,?,?,?,?,0,?)",
            (order_id, "master", caption if pos == 0 else None,
             "document", name, send_id, now))
        await c.execute(
            "UPDATE handoff_deliveries SET status='sent',attempts=attempts+1,"
            "last_error=NULL,updated_at=?,sent_at=? WHERE artifact_id=? AND position=? "
            "AND kind=? AND channel='cabinet'",
            (now, now, a["id"], pos, kind))
    await c.commit()
    db.bus_bump()
    return True
'''


NEW_HANDOFF_DELIVER_CABINET = '''async def _deliver_cabinet(order_id: int, a, items: list[dict], kind: str,
                           caption: str) -> bool:
    """Каноническая выдача в кабинете: message + receipt одной транзакцией."""
    async with db.transaction() as c:
        for pos, item in enumerate(items):
            cur = await c.execute(
                "SELECT status FROM handoff_deliveries WHERE artifact_id=? AND position=? "
                "AND kind=? AND channel='cabinet'", (a["id"], pos, kind))
            row = await cur.fetchone()
            if row and row["status"] == "sent":
                continue
            send_id = item["preview_file_id"] if kind == "preview" else item["source_file_id"]
            name = (f"proverka-{os.path.splitext(item['source_file_name'])[0]}.pdf"
                    if kind == "preview" else item["source_file_name"])
            now = db.now_iso()
            await c.execute(
                "INSERT INTO messages(order_id,sender,text,kind,file_name,tg_file_id,"
                "seen_client,created_at) VALUES(?,?,?,?,?,?,0,?)",
                (order_id, "master", caption if pos == 0 else None,
                 "document", name, send_id, now))
            await c.execute(
                "UPDATE handoff_deliveries SET status='sent',attempts=attempts+1,"
                "last_error=NULL,updated_at=?,sent_at=? WHERE artifact_id=? AND position=? "
                "AND kind=? AND channel='cabinet'",
                (now, now, a["id"], pos, kind))
    return True
'''


OLD_HANDOFF_PREPARE_WRITES = '''    if prev and prev["phase"] in ("master_review", "fix_requested"):
        await db.conn().execute(
            "UPDATE delivery_artifacts SET phase='superseded' WHERE id=?",
            (prev["id"],))
    primary = rendered_items[0]
    cur = await db.conn().execute(
        "INSERT INTO delivery_artifacts(order_id,version,source_file_id,"
        "source_file_name,source_file_size,source_sha256,mode,phase,created_at) "
        "VALUES(?,?,?,?,?,?,?,?,?)",
        (order_id, version, primary["source_file_id"], primary["source_name"],
         primary["source_size"], primary["source_sha256"], mode,
         "master_review", db.now_iso()))
    artifact_id = cur.lastrowid
    for pos, item in enumerate(rendered_items):
        await db.conn().execute(
            "INSERT INTO delivery_artifact_files(artifact_id,position,source_file_id,"
            "source_file_name,source_file_size,source_sha256,created_at) "
            "VALUES(?,?,?,?,?,?,?)",
            (artifact_id, pos, item["source_file_id"], item["source_name"],
             item["source_size"], item["source_sha256"], db.now_iso()))
    await db.conn().commit()
'''


NEW_HANDOFF_PREPARE_WRITES = '''    primary = rendered_items[0]
    async with db.transaction():
        if prev and prev["phase"] in ("master_review", "fix_requested"):
            await db._exec(
                "UPDATE delivery_artifacts SET phase='superseded' WHERE id=?",
                (prev["id"],))
        cur = await db._exec(
            "INSERT INTO delivery_artifacts(order_id,version,source_file_id,"
            "source_file_name,source_file_size,source_sha256,mode,phase,created_at) "
            "VALUES(?,?,?,?,?,?,?,?,?)",
            (order_id, version, primary["source_file_id"], primary["source_name"],
             primary["source_size"], primary["source_sha256"], mode,
             "master_review", db.now_iso()))
        artifact_id = cur.lastrowid
        for pos, item in enumerate(rendered_items):
            await db._exec(
                "INSERT INTO delivery_artifact_files(artifact_id,position,source_file_id,"
                "source_file_name,source_file_size,source_sha256,created_at) "
                "VALUES(?,?,?,?,?,?,?)",
                (artifact_id, pos, item["source_file_id"], item["source_name"],
                 item["source_size"], item["source_sha256"], db.now_iso()))
'''


OLD_HANDOFF_REVIEW_WRITES = '''    await db.conn().execute(
        "UPDATE delivery_artifacts SET preview_file_id=? "
        "WHERE id=? AND phase='master_review'", (file_ids[0], artifact_id))
    for pos, file_id in enumerate(file_ids):
        await db.conn().execute(
            "UPDATE delivery_artifact_files SET preview_file_id=? "
            "WHERE artifact_id=? AND position=?", (file_id, artifact_id, pos))
    await db.conn().commit()
'''


NEW_HANDOFF_REVIEW_WRITES = '''    async with db.transaction():
        await db._exec(
            "UPDATE delivery_artifacts SET preview_file_id=? "
            "WHERE id=? AND phase='master_review'", (file_ids[0], artifact_id))
        for pos, file_id in enumerate(file_ids):
            await db._exec(
                "UPDATE delivery_artifact_files SET preview_file_id=? "
                "WHERE artifact_id=? AND position=?", (file_id, artifact_id, pos))
'''


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one anchor, got {count}")
    return text.replace(old, new, 1)


WRITE_FUNCTIONS = {
    "db": {
        "claim_order_to_user", "receipt_invoice_upsert", "receipt_mark_paid",
        "receipt_effects_claim", "payment_claim_paid_exact",
        "payment_record_duplicate", "channel_upsert", "channel_trim",
        "qa_add", "qa_mark",
    },
    "webapp": {"orders_create", "admin_client_ban"},
    "handlers_admin": {"cb_lead_done"},
    "handlers_channel_feed": {"on_channel_edit"},
    "handlers_client": {"_handle_ref_link", "cmd_stopnews", "cmd_startnews"},
    "handlers_group": {"g_deliver_confirm"},
    "services_bonus": {"grant_welcome", "sweep_expiring"},
    "services_deposit": {
        "create_pending", "activate_paid", "refund", "pay_order",
    },
    "services_handoff": {
        "_ensure_delivery_rows", "_deliver_telegram", "retry_pending",
        "prepare_bundle", "set_review_files", "publish", "accept",
        "request_fixes", "release_if_paid",
    },
    "services_scheduler": {"_curator_reminders"},
}

DYNAMIC_READ_FUNCTIONS = {
    "db": {
        "promo_family_used", "visits_list", "visits_stats", "geo_labels",
        "active_orders_by_user", "active_orders", "orders_where",
        "search_orders", "files_new_for_orders", "unread_for_orders",
        "orders_by_tokens", "receipts_for_user", "specification_for_payment",
        "offers_for_orders",
    },
    "webapp": {"_slots_taken", "_segment_ids", "admin_orders"},
    "handlers_admin": set(),
    "handlers_channel_feed": set(),
    "handlers_client": set(),
    "handlers_group": set(),
    "services_bonus": set(),
    "services_deposit": set(),
    "services_handoff": set(),
    "services_scheduler": set(),
}

_WRITE_VERBS = {"INSERT", "UPDATE", "DELETE", "REPLACE", "CREATE", "ALTER", "DROP"}
_READ_VERBS = {"SELECT", "PRAGMA", "EXPLAIN"}


def _leading_sql(node: ast.AST) -> str:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        out = []
        for value in node.values:
            if not isinstance(value, ast.Constant) or not isinstance(value.value, str):
                break
            out.append(value.value)
        return "".join(out)
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return _leading_sql(node.left) + _leading_sql(node.right)
    return ""


def _sql_verb(node: ast.AST) -> str:
    leading = _leading_sql(node).lstrip()
    return leading.split(None, 1)[0].upper() if leading else ""


class _DirectDmlVisitor(ast.NodeVisitor):
    def __init__(self, module: str) -> None:
        self.module = module
        self.function_stack: list[str] = []
        self.calls: list[ast.Call] = []
        self.direct_calls: list[ast.Call] = []
        self.alias_assignments: dict[str, set[str]] = {}

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        self.function_stack.append(node.name)
        self.generic_visit(node)
        self.function_stack.pop()

    visit_FunctionDef = visit_AsyncFunctionDef

    def visit_Assign(self, node: ast.Assign) -> None:
        if self.function_stack and ast.unparse(node.value) in {"conn()", "db.conn()"}:
            for target in node.targets:
                if isinstance(target, ast.Name):
                    self.alias_assignments.setdefault(
                        self.function_stack[-1], set()
                    ).add(target.id)
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        if self.function_stack and isinstance(node.func, ast.Attribute):
            receiver = ast.unparse(node.func.value)
            if node.func.attr == "execute" and receiver in {"conn()", "db.conn()"}:
                self.direct_calls.append(node)
                if node.args and _sql_verb(node.args[0]) in _WRITE_VERBS:
                    self.calls.append(node)
        self.generic_visit(node)


def _char_offset(lines: list[str], starts: list[int], line: int, byte_col: int) -> int:
    prefix = lines[line - 1].encode("utf-8")[:byte_col].decode("utf-8")
    return starts[line - 1] + len(prefix)


def _rewrite_direct_dml(text: str, module: str) -> str:
    tree = ast.parse(text)
    visitor = _DirectDmlVisitor(module)
    visitor.visit(tree)
    allowed = WRITE_FUNCTIONS[module]
    lines = text.splitlines(keepends=True)
    starts: list[int] = []
    cursor = 0
    for line in lines:
        starts.append(cursor)
        cursor += len(line)
    replacements: list[tuple[int, int, str, str]] = []
    parents: dict[ast.AST, ast.AST] = {}
    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            parents[child] = parent
    for call in visitor.calls:
        parent: ast.AST = call
        while parent in parents and not isinstance(
            parent, (ast.FunctionDef, ast.AsyncFunctionDef)
        ):
            parent = parents[parent]
        function = parent.name if isinstance(
            parent, (ast.FunctionDef, ast.AsyncFunctionDef)
        ) else ""
        if function not in allowed:
            continue
        receiver = ast.unparse(call.func.value)
        replacement = "_exec" if receiver == "conn()" else "db._exec"
        start = _char_offset(lines, starts, call.func.lineno, call.func.col_offset)
        end = _char_offset(lines, starts, call.func.end_lineno, call.func.end_col_offset)
        replacements.append((start, end, replacement, function))
    if not replacements:
        raise RuntimeError(f"{module}: no direct runtime DML rewrite found")
    for start, end, replacement, _function in sorted(replacements, reverse=True):
        text = text[:start] + replacement + text[end:]
    return text


def _assert_no_direct_runtime_dml(text: str, module: str) -> None:
    tree = ast.parse(text)
    visitor = _DirectDmlVisitor(module)
    visitor.visit(tree)
    init_only = {
        "init", "_sync_consent_contract", "_harden_session_tokens",
        "_harden_order_access_tokens",
    }
    parents: dict[ast.AST, ast.AST] = {}
    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            parents[child] = parent
    leftovers = []
    for call in visitor.calls:
        parent: ast.AST = call
        while parent in parents and not isinstance(
            parent, (ast.FunctionDef, ast.AsyncFunctionDef)
        ):
            parent = parents[parent]
        function = parent.name if isinstance(
            parent, (ast.FunctionDef, ast.AsyncFunctionDef)
        ) else ""
        if module == "db" and function in init_only:
            continue
        leftovers.append(f"{function}:{call.lineno}")
    unknown_direct = []
    for call in visitor.direct_calls:
        if not call.args:
            unknown_direct.append(f"missing-sql:{call.lineno}")
            continue
        verb = _sql_verb(call.args[0])
        if verb in _READ_VERBS or verb in _WRITE_VERBS:
            continue
        parent: ast.AST = call
        while parent in parents and not isinstance(
            parent, (ast.FunctionDef, ast.AsyncFunctionDef)
        ):
            parent = parents[parent]
        function = parent.name if isinstance(
            parent, (ast.FunctionDef, ast.AsyncFunctionDef)
        ) else ""
        if function not in DYNAMIC_READ_FUNCTIONS[module]:
            unknown_direct.append(f"{function}:{call.lineno}")
    alias_leftovers = []
    for function, aliases in visitor.alias_assignments.items():
        fn = next(
            node for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
            and node.name == function
        )
        for call in ast.walk(fn):
            if (
                isinstance(call, ast.Call)
                and isinstance(call.func, ast.Attribute)
                and isinstance(call.func.value, ast.Name)
                and call.func.value.id in aliases
                and call.func.attr == "execute"
                and call.args
                and _sql_verb(call.args[0]) not in _READ_VERBS
            ):
                alias_leftovers.append(f"{function}:{call.lineno}")
    if leftovers or alias_leftovers or unknown_direct:
        raise RuntimeError(
            f"{module}: unsafe direct runtime SQL remains: "
            f"{leftovers + alias_leftovers + unknown_direct}"
        )


def patch_db(text: str) -> str:
    if DB_MARKER in text:
        return text
    candidate = _replace_once(
        text, OLD_IMPORT_BLOCK, NEW_IMPORT_BLOCK, "db asyncio import"
    )
    candidate = _replace_once(
        candidate, OLD_GLOBAL_BLOCK, NEW_GLOBAL_BLOCK, "db writer globals"
    )
    candidate = _replace_once(
        candidate, OLD_INIT_HEAD, NEW_INIT_HEAD, "db init globals"
    )
    candidate = _replace_once(
        candidate, OLD_INIT_TAIL, NEW_INIT_TAIL, "db writer init"
    )
    candidate = _replace_once(
        candidate, OLD_CLOSE_BLOCK, NEW_CLOSE_BLOCK, "db writer close"
    )
    candidate = _replace_once(
        candidate, OLD_DB_BLOCK, NEW_DB_BLOCK, "db dedicated writer"
    )
    candidate = _replace_once(
        candidate, OLD_SESSION_FETCH, NEW_SESSION_FETCH, "session cursor close"
    )
    candidate = _replace_once(
        candidate, OLD_QA_DELETE, NEW_QA_DELETE, "qa delete transaction"
    )
    candidate = _replace_once(
        candidate, OLD_QA_VOTE, NEW_QA_VOTE, "qa vote transaction"
    )
    candidate = _replace_once(
        candidate, OLD_QA_BAN, NEW_QA_BAN, "qa ban transaction"
    )
    candidate = _rewrite_direct_dml(candidate, "db")
    _assert_no_direct_runtime_dml(candidate, "db")
    compile(candidate, "db.py", "exec")
    if candidate.count(DB_MARKER) != 1:
        raise RuntimeError("db recovery marker drift")
    return candidate


def _patch_runtime_module(
    text: str,
    module: str,
    replacements: tuple[tuple[str, str, str], ...] = (),
) -> str:
    marker = f"# {MODULE_MARKER}:{module}\n"
    if marker in text:
        return text
    candidate = text
    for old, new, label in replacements:
        candidate = _replace_once(candidate, old, new, label)
    candidate = _rewrite_direct_dml(candidate, module)
    candidate = _replace_once(
        candidate,
        "from __future__ import annotations\n",
        "from __future__ import annotations\n\n" + marker,
        f"{module} marker",
    )
    _assert_no_direct_runtime_dml(candidate, module)
    compile(candidate, f"{module}.py", "exec")
    if candidate.count(marker) != 1:
        raise RuntimeError(f"{module}: marker drift")
    return candidate


def patch_webapp(text: str) -> str:
    return _patch_runtime_module(
        text,
        "webapp",
        ((OLD_ADMIN_CLIENT_BAN, NEW_ADMIN_CLIENT_BAN, "admin ban transaction"),),
    )


def patch_handlers_admin(text: str) -> str:
    return _patch_runtime_module(text, "handlers_admin")


def patch_handlers_channel_feed(text: str) -> str:
    return _patch_runtime_module(text, "handlers_channel_feed")


def patch_handlers_client(text: str) -> str:
    return _patch_runtime_module(text, "handlers_client")


def patch_handlers_group(text: str) -> str:
    return _patch_runtime_module(text, "handlers_group")


def patch_services_bonus(text: str) -> str:
    return _patch_runtime_module(text, "services_bonus")


def patch_services_deposit(text: str) -> str:
    return _patch_runtime_module(
        text,
        "services_deposit",
        (
            (OLD_DEPOSIT_CREATE_WRITES, NEW_DEPOSIT_CREATE_WRITES,
             "deposit create transaction"),
            (OLD_DEPOSIT_ACTIVATE_WRITES, NEW_DEPOSIT_ACTIVATE_WRITES,
             "deposit activate transaction"),
            (OLD_DEPOSIT_REFUND_WRITES, NEW_DEPOSIT_REFUND_WRITES,
             "deposit refund transaction"),
        ),
    )


def patch_services_handoff(text: str) -> str:
    return _patch_runtime_module(
        text,
        "services_handoff",
        (
            (OLD_HANDOFF_ENSURE_ROWS, NEW_HANDOFF_ENSURE_ROWS,
             "handoff row transaction"),
            (OLD_HANDOFF_DELIVER_CABINET, NEW_HANDOFF_DELIVER_CABINET,
             "handoff cabinet transaction"),
            (OLD_HANDOFF_PREPARE_WRITES, NEW_HANDOFF_PREPARE_WRITES,
             "handoff prepare transaction"),
            (OLD_HANDOFF_REVIEW_WRITES, NEW_HANDOFF_REVIEW_WRITES,
             "handoff review transaction"),
        ),
    )


def patch_services_scheduler(text: str) -> str:
    return _patch_runtime_module(text, "services_scheduler")


PATCHERS = {
    "db": patch_db,
    "webapp": patch_webapp,
    "handlers_admin": patch_handlers_admin,
    "handlers_channel_feed": patch_handlers_channel_feed,
    "handlers_client": patch_handlers_client,
    "handlers_group": patch_handlers_group,
    "services_bonus": patch_services_bonus,
    "services_deposit": patch_services_deposit,
    "services_handoff": patch_services_handoff,
    "services_scheduler": patch_services_scheduler,
}


def _paths(root: Path, names: Iterable[str] | None = None) -> dict[str, Path]:
    app = root / "app"
    paths = {
        "db": app / "db.py",
        "webapp": app / "webapp.py",
        "handlers_admin": app / "handlers" / "admin.py",
        "handlers_channel_feed": app / "handlers" / "channel_feed.py",
        "handlers_client": app / "handlers" / "client.py",
        "handlers_group": app / "handlers" / "group.py",
        "services_bonus": app / "services" / "bonus.py",
        "services_deposit": app / "services" / "deposit.py",
        "services_handoff": app / "services" / "handoff.py",
        "services_scheduler": app / "services" / "scheduler.py",
    }
    if names is None:
        return paths
    selected = set(names)
    unknown = selected - paths.keys()
    if unknown:
        raise RuntimeError(f"unknown SQLite recovery source names: {sorted(unknown)}")
    return {name: path for name, path in paths.items() if name in selected}


def _require_hash(path: Path, expected: str) -> str:
    actual = sha256(path)
    if actual != expected:
        raise RuntimeError(f"unknown source {path}: {actual}; expected {expected}")
    return actual


def _require_pinned(expected: dict[str, str]) -> None:
    unpinned = [name for name, value in expected.items() if value.startswith("__")]
    if unpinned:
        raise RuntimeError(f"post-image hashes are not pinned: {unpinned}")


def _candidates(root: Path, names: Iterable[str] | None = None) -> dict[str, str]:
    return {
        name: PATCHERS[name](path.read_text(encoding="utf-8"))
        for name, path in _paths(root, names).items()
    }


def preview(
    root: Path,
    *,
    expected_before: dict[str, str] = KNOWN_BEFORE,
    expected_after: dict[str, str] = KNOWN_AFTER,
) -> dict:
    _require_pinned(expected_after)
    if expected_before.keys() != expected_after.keys():
        raise RuntimeError("before/after source inventory mismatch")
    paths = _paths(root, expected_before)
    current = {name: sha256(path) for name, path in paths.items()}
    if current == expected_after:
        return {"ok": True, "changed": False, "sha256": current}
    if current != expected_before:
        raise RuntimeError(
            f"mixed or unknown SQLite recovery source: {current}; "
            f"expected {expected_before} or {expected_after}"
        )
    candidates = _candidates(root, expected_before)
    candidate_hashes = {
        name: sha256_text(content) for name, content in candidates.items()
    }
    if candidate_hashes != expected_after:
        raise RuntimeError(
            f"candidate hash drift: {candidate_hashes}; expected {expected_after}"
        )
    return {
        "ok": True,
        "changed": True,
        "before_sha256": current,
        "after_sha256": candidate_hashes,
    }


def _atomic_text(path: Path, content: str, expected_current: str) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.sqlite-recovery.tmp")
    metadata = path.stat()
    shutil.copy2(path, temporary)
    try:
        os.chown(temporary, metadata.st_uid, metadata.st_gid)
        temporary.write_text(content, encoding="utf-8")
        _require_hash(path, expected_current)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def install(
    root: Path,
    backup_root: Path,
    *,
    expected_before: dict[str, str] = KNOWN_BEFORE,
    expected_after: dict[str, str] = KNOWN_AFTER,
    now: datetime | None = None,
) -> dict:
    state = preview(
        root,
        expected_before=expected_before,
        expected_after=expected_after,
    )
    if not state["changed"]:
        state["backup"] = None
        return state

    paths = _paths(root, expected_before)
    candidates = _candidates(root, expected_before)
    moment = now or datetime.now(timezone.utc)
    backup = backup_root / f"sqlite-recovery-{moment.strftime('%Y%m%dT%H%M%S%fZ')}"
    backup.mkdir(parents=True, mode=0o700)
    for name, path in paths.items():
        preserved = backup / f"{name}.py"
        shutil.copy2(path, preserved)
        _require_hash(preserved, expected_before[name])
    (backup / "manifest.json").write_text(
        json.dumps(
            {
                "kind": "sqlite-busy-snapshot-recovery",
                "created_at": moment.isoformat(),
                "before_sha256": expected_before,
                "after_sha256": expected_after,
                "source_metadata": {
                    name: {
                        "uid": path.stat().st_uid,
                        "gid": path.stat().st_gid,
                        "mode": path.stat().st_mode & 0o7777,
                    }
                    for name, path in paths.items()
                },
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ) + "\n",
        encoding="utf-8",
    )

    installed: list[str] = []
    try:
        for name, path in paths.items():
            _atomic_text(path, candidates[name], expected_before[name])
            installed.append(name)
            _require_hash(path, expected_after[name])
    except Exception:
        for name in reversed(installed):
            path = paths[name]
            if sha256(path) == expected_after[name]:
                _atomic_text(
                    path,
                    (backup / f"{name}.py").read_text(encoding="utf-8"),
                    expected_after[name],
                )
                _require_hash(path, expected_before[name])
        raise
    state["backup"] = str(backup)
    return state


def rollback(
    root: Path,
    backup: Path,
    *,
    expected_before: dict[str, str] = KNOWN_BEFORE,
    expected_after: dict[str, str] = KNOWN_AFTER,
) -> dict:
    _require_pinned(expected_after)
    if expected_before.keys() != expected_after.keys():
        raise RuntimeError("before/after source inventory mismatch")
    paths = _paths(root, expected_before)
    for name, path in paths.items():
        _require_hash(path, expected_after[name])
        _require_hash(backup / f"{name}.py", expected_before[name])

    restored: list[str] = []
    try:
        for name, path in paths.items():
            _atomic_text(
                path,
                (backup / f"{name}.py").read_text(encoding="utf-8"),
                expected_after[name],
            )
            restored.append(name)
            _require_hash(path, expected_before[name])
    except Exception:
        for name in reversed(restored):
            path = paths[name]
            if sha256(path) == expected_before[name]:
                _atomic_text(path, PATCHERS[name](
                    (backup / f"{name}.py").read_text(encoding="utf-8")
                ), expected_before[name])
                _require_hash(path, expected_after[name])
        raise
    return {"ok": True, "rolled_back": True, "sha256": expected_before}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("/root/salon_bot"))
    parser.add_argument(
        "--backup-root",
        type=Path,
        default=Path("/root/salon_bot/backups"),
    )
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--check", action="store_true")
    action.add_argument("--apply", action="store_true")
    action.add_argument("--rollback", type=Path)
    args = parser.parse_args()

    if args.rollback:
        result = rollback(args.root, args.rollback)
    elif args.apply:
        result = install(args.root, args.backup_root)
    else:
        result = preview(args.root)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
