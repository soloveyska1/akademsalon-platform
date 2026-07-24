"""Депозит мастерской: авансовый кошелёк с бонусным начислением.

Клиент пополняет счёт (20 000–60 000 ₽ за раз), сверху начисляются
БОНУСЫ по ступеням суммы (правила лояльности, раздел 7а). Деньги
кошелька — аванс: тратятся только на оплату этапов заказов; чек НПД
пробивается при пополнении, повторный чек при оплате этапа не нужен.
Архитектура зеркалит сертификаты (deposits + deposit_ledger), трата —
мгновенная оплата ближайшего этапа через payments.confirm(method="deposit").
Возвраты — вручную мастером (правила р. 7а: неиспользованный денежный
остаток возвращается, бонусы пополнения аннулируются/удерживаются).
"""
from __future__ import annotations

import logging

from aiogram import Bot

from . import notify
from .. import config, db

log = logging.getLogger("salon.deposit")

# ступени бонуса: (минимальная сумма, процент), по убыванию
RATES: list[tuple[int, int]] = [(60_000, 15), (45_000, 12), (30_000, 10), (20_000, 8)]
MIN_TOPUP = 20_000
MAX_TOPUP = 60_000
MAX_ACTIVE = 120_000          # потолок живых денег на кошельке, ₽
BONUS_TTL = 180               # дней жизни бонусов пополнения


def rate_for(amount: int) -> int:
    for floor, pct in RATES:
        if amount >= floor:
            return pct
    return 0


def amount_ok(amount: int) -> bool:
    return MIN_TOPUP <= amount <= MAX_TOPUP and amount % 1000 == 0


async def balance(user_id: int) -> int:
    cur = await db.conn().execute(
        "SELECT COALESCE(SUM(delta),0) FROM deposit_ledger WHERE user_id=?",
        (user_id,))
    row = await cur.fetchone()
    return int(row[0] or 0)


async def dep_get(dep_id: int):
    cur = await db.conn().execute("SELECT * FROM deposits WHERE id=?", (dep_id,))
    return await cur.fetchone()


async def create_pending(*, user_id: int, amount: int, via: str = "кабинет"):
    """Заявка на пополнение; прежний незавершённый хвост закрывается."""
    await db.conn().execute(
        "UPDATE deposits SET status='canceled', "
        "note=COALESCE(note,'') || ' · перекрыт новым' "
        "WHERE user_id=? AND status='pending'", (user_id,))
    pct = rate_for(amount)
    cur = await db.conn().execute(
        "INSERT INTO deposits(user_id, amount, bonus_pct, bonus_amount, "
        "status, via, created_at) VALUES(?,?,?,?, 'pending', ?, ?)",
        (user_id, amount, pct, amount * pct // 100, via, db.now_iso()))
    await db.conn().commit()
    d = await dep_get(cur.lastrowid)
    log.info("deposit %s pending (%s ₽ +%s%%, via %s)",
             d["id"], amount, pct, via)
    return d


async def activate_paid(bot: Bot, dep_id: int, method: str = "manual",
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
            f"💼 <b>Депозит пополнен на {config.fmt_money(d['amount'])} ₽.</b>\n"
            f"Бонусами сверху — <b>{config.fmt_money(d['bonus_amount'])}</b> "
            f"(+{d['bonus_pct']}%), бонусы живут {BONUS_TTL} дней.\n"
            f"На кошельке сейчас: <b>{config.fmt_money(bal)} ₽</b> — им можно "
            "оплачивать этапы заказов в один клик, чек уже пробит при пополнении.")
    log.info("deposit %s activated (%s ₽, %s, %s)",
             dep_id, d["amount"], method, actor)
    return await dep_get(dep_id)


async def rows(user_id: int, limit: int = 40):
    cur = await db.conn().execute(
        "SELECT delta, kind, deposit_id, order_id, note, created_at "
        "FROM deposit_ledger WHERE user_id=? ORDER BY id DESC LIMIT ?",
        (user_id, limit))
    return await cur.fetchall()


async def summary(user_id: int) -> dict:
    bal = await balance(user_id)
    return {"balance": bal, "min": MIN_TOPUP, "max": MAX_TOPUP,
            "rates": [{"from": f, "pct": p} for f, p in sorted(RATES)],
            "can_topup": bal < MAX_ACTIVE}


async def refund(dep_id: int, actor: str = "мастер") -> tuple[bool, str, int]:
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
    report = (f"Депозит №{dep_id} ({config.fmt_money(d['amount'])} ₽) закрыт.\n"
              f"К возврату клиенту деньгами: <b>{config.fmt_money(money_back)} ₽</b>"
              + (f" (удержано за потраченные бонусы: {config.fmt_money(spent_bonus)} ₽)"
                 if spent_bonus else "")
              + f".\nОстаток кошелька клиента теперь: {config.fmt_money(await balance(uid))} ₽.")
    log.info("deposit %s refunded by %s: money_back=%s, spent_bonus=%s",
             dep_id, actor, money_back, spent_bonus)
    return True, report, money_back


async def pay_order(bot: Bot, order_id: int,
                    actor: str = "клиент") -> tuple[bool, str, int]:
    """Оплатить ближайший этап заказа с кошелька — целиком, без сдачи."""
    from . import payments
    o = await db.get_order(order_id)
    if not o:
        return False, "заказ не найден", 0
    uid = o["user_id"]
    if not uid:
        return False, "заказ не привязан к аккаунту", 0
    kind, amount = await payments.stage_amount(o)
    if amount <= 0:
        return False, "по заказу сейчас нет платежа к оплате", 0
    bal = await balance(uid)
    if bal < amount:
        return (False,
                f"на кошельке {config.fmt_money(bal)} ₽ — на этап "
                f"{config.fmt_money(amount)} ₽ не хватает", bal)
    await db.conn().execute(
        "INSERT INTO deposit_ledger(user_id, delta, kind, order_id, note, "
        "created_at) VALUES(?,?, 'pay', ?, ?, ?)",
        (uid, -amount, order_id, f"оплата этапа · {actor}", db.now_iso()))
    await db.conn().commit()
    conducted = await payments.confirm(
        bot, order_id, kind, amount, method="deposit",
        actor=f"депозит · {actor}", allow_create=True)
    if not conducted.get("ok"):
        # Не оставляем кошелёк списанным, если точный payment провести не
        # удалось. Компенсационная строка сохраняет полный аудит операции.
        await db.conn().execute(
            "INSERT INTO deposit_ledger(user_id, delta, kind, order_id, note, "
            "created_at) VALUES(?,?, 'pay_rollback', ?, ?, ?)",
            (uid, amount, order_id, f"откат: {conducted.get('error')} · {actor}",
             db.now_iso()))
        await db.conn().commit()
        return False, "платёж не проведён; деньги возвращены на депозит", await balance(uid)
    log.info("deposit pay: order %s, %s ₽, by %s", order_id, amount, actor)
    return True, "", await balance(uid)
