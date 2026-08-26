#!/usr/bin/env python3
"""Hash-pinned installer for the default-off OUT-001 synthetic plane.

The installer patches only reviewed seams in ``db.py`` and ``webapp.py``,
installs three allowlisted assets and applies one additive transactional SQLite
migration. It never reads order rows or secrets. CLI apply/rollback refuse an
active service, a present capability or any active synthetic record.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import pwd
import runpy
import shutil
import sqlite3
import stat
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


KNOWN_BEFORE = {
    "db": "51702018cf8bf97d3bfa97675133bf8dc21d8d5b2692577cb079d0609588b2a1",
    "webapp": "6f36199cf1324dd4b1231034b501bdd157a56447fc79ea3a568a1cc1cb1b123c",
}
KNOWN_AFTER = {
    "db": "b9ac6409c834f6858855d13aba862e3c0dc063c064837e4f5c5d5b75ea4efd6f",
    "webapp": "cb5b2624f9ed9769e9464f2a198ad997127641fba6fa19d30cec9fbc3943a200",
}
KNOWN_ASSETS = {
    "runtime": "7add4843d037f04f0b4098c3e842a5524b4ad76742d830e48b75b2951def28cf",
    "probe": "5dd4cb602f92f4a36511376336b12076a9e0482ec7387ff99c3e30f69ebb452d",
    "migration": "e6500fa4dd68a2a99f357f0a5c8b118d05e12858980354a82452fe0d80cbf8d8",
}
MIGRATION_VERSION = "0010_out001_synthetic"
MARKER = "out001-synthetic-plane:20260826"
SERVICE_NAME = "salon-bot-v2"
CAPABILITY_PATH = Path("/run/salon-bot/out001-capability.json")
PRODUCTION_ROOT = Path("/root/salon_bot")
# The VPS ``app`` directory predates root-managed releases and retains an
# orphaned macOS copy owner.  It is safe only as this exact non-writable tuple;
# a passwd-resolvable UID or any other parent remains forbidden.
LEGACY_APP_UID = 501
LEGACY_APP_GID = 50
LEGACY_APP_MODE = 0o755
ORDER_SCHEMA_SHA256 = "c7b91d09c4a0f4f1ff737d1c650bca508cdb70ba2977bd9ede9775829ca941bb"
PRE_ORDER_SCHEMA_SHA256 = "ea62b6c20bbe8147ec9caaa75830e0540f80d8fd23c829cc1a3bbe2b26db5524"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one anchor, got {count}")
    return text.replace(old, new, 1)


def patch_db(text: str) -> str:
    if f"# {MARKER}:db" in text:
        return text
    text = _replace_once(
        text,
        '        "SELECT guest_contact FROM orders WHERE guest_contact IS NOT NULL"\n',
        '        "SELECT guest_contact FROM orders WHERE guest_contact IS NOT NULL "\n'
        '        "AND coalesce(synthetic,0)=0"\n',
        "promo contact history",
    )
    old = '''async def order_by_client_request(request_id: str) -> aiosqlite.Row | None:
    cur = await conn().execute(
        "SELECT * FROM orders WHERE client_request_id=? LIMIT 1", (request_id,))
    return await cur.fetchone()
'''
    new = '''# out001-synthetic-plane:20260826:db
async def order_by_client_request(
    request_id: str,
    *,
    include_synthetic: bool = False,
) -> aiosqlite.Row | None:
    cur = await conn().execute(
        "SELECT * FROM orders WHERE client_request_id=? "
        "AND (? OR coalesce(synthetic,0)=0) LIMIT 1",
        (request_id, 1 if include_synthetic else 0),
    )
    return await cur.fetchone()
'''
    text = _replace_once(text, old, new, "order idempotency lookup")
    old = '''async def get_order(order_id: int) -> aiosqlite.Row | None:
    cur = await conn().execute("SELECT * FROM orders WHERE id=?", (order_id,))
    return await cur.fetchone()
'''
    new = '''async def get_order(
    order_id: int,
    *,
    include_synthetic: bool = False,
) -> aiosqlite.Row | None:
    cur = await conn().execute(
        "SELECT * FROM orders WHERE id=? AND (? OR coalesce(synthetic,0)=0)",
        (order_id, 1 if include_synthetic else 0),
    )
    return await cur.fetchone()
'''
    text = _replace_once(text, old, new, "order lookup")
    text = _replace_once(
        text,
        '        "SELECT * FROM orders WHERE user_id=? AND coalesce(deleted,0)=0 "\n',
        '        "SELECT * FROM orders WHERE user_id=? AND coalesce(deleted,0)=0 "\n'
        '        "AND coalesce(synthetic,0)=0 "\n',
        "orders by user",
    )
    text = _replace_once(
        text,
        '        f"SELECT * FROM orders WHERE user_id=? AND status IN ({q}) "\n'
        '        "AND coalesce(deleted,0)=0 ORDER BY id DESC",\n',
        '        f"SELECT * FROM orders WHERE user_id=? AND status IN ({q}) "\n'
        '        "AND coalesce(deleted,0)=0 AND coalesce(synthetic,0)=0 "\n'
        '        "ORDER BY id DESC",\n',
        "active orders by user",
    )
    text = _replace_once(
        text,
        '        f"SELECT * FROM orders WHERE status IN ({q}) AND coalesce(deleted,0)=0 "\n',
        '        f"SELECT * FROM orders WHERE status IN ({q}) AND coalesce(deleted,0)=0 "\n'
        '        "AND coalesce(synthetic,0)=0 "\n',
        "active orders",
    )
    old = '''async def orders_where(sql_tail: str, args: Iterable[Any] = ()) -> list[aiosqlite.Row]:
    cur = await conn().execute(f"SELECT * FROM orders {sql_tail}", tuple(args))
    return list(await cur.fetchall())
'''
    new = '''async def orders_where(sql_tail: str, args: Iterable[Any] = ()) -> list[aiosqlite.Row]:
    # The synthetic plane is never an ordinary scheduler/admin data source.
    cur = await conn().execute(
        f"SELECT * FROM (SELECT * FROM orders WHERE coalesce(synthetic,0)=0) "
        f"AS orders {sql_tail}",
        tuple(args),
    )
    return list(await cur.fetchall())
'''
    text = _replace_once(text, old, new, "orders_where isolation")
    old = '''    cur = await conn().execute(
        "SELECT o.* FROM orders o LEFT JOIN users u ON u.id=o.user_id "
        "WHERE o.topic LIKE ? OR o.work_label LIKE ? OR u.username LIKE ? "
        + id_clause + "ORDER BY o.id DESC LIMIT ?",
        (*args, limit),
    )
'''
    new = '''    cur = await conn().execute(
        "SELECT o.* FROM orders o LEFT JOIN users u ON u.id=o.user_id "
        "WHERE coalesce(o.synthetic,0)=0 AND "
        "(o.topic LIKE ? OR o.work_label LIKE ? OR u.username LIKE ? "
        + id_clause + ") ORDER BY o.id DESC LIMIT ?",
        (*args, limit),
    )
'''
    text = _replace_once(text, old, new, "search isolation")
    text = _replace_once(
        text,
        '        "FROM orders WHERE coalesce(deleted,0)=0",\n',
        '        "FROM orders WHERE coalesce(deleted,0)=0 "\n'
        '        "AND coalesce(synthetic,0)=0",\n',
        "stats total",
    )
    text = _replace_once(
        text,
        '        "WHERE coalesce(deleted,0)=0 AND coalesce(archived_admin,0)=0 "\n'
        '        "GROUP BY status")\n',
        '        "WHERE coalesce(deleted,0)=0 AND coalesce(archived_admin,0)=0 "\n'
        '        "AND coalesce(synthetic,0)=0 GROUP BY status")\n',
        "stats by status",
    )
    old = '''async def events_recent(limit: int = 15) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT e.*, o.work_label FROM order_events e "
        "LEFT JOIN orders o ON o.id = e.order_id ORDER BY e.id DESC LIMIT ?", (limit,))
    return list(await cur.fetchall())
'''
    new = '''async def events_recent(limit: int = 15) -> list[aiosqlite.Row]:
    cur = await conn().execute(
        "SELECT e.*, o.work_label FROM order_events e "
        "LEFT JOIN orders o ON o.id = e.order_id "
        "WHERE e.order_id IS NULL OR coalesce(o.synthetic,0)=0 "
        "ORDER BY e.id DESC LIMIT ?", (limit,))
    return list(await cur.fetchall())
'''
    text = _replace_once(text, old, new, "event feed isolation")
    text = _replace_once(
        text,
        '        "SELECT * FROM orders WHERE access_token_digest=? "\n'
        '        "AND coalesce(deleted,0)=0",\n',
        '        "SELECT * FROM orders WHERE access_token_digest=? "\n'
        '        "AND coalesce(deleted,0)=0 AND coalesce(synthetic,0)=0",\n',
        "access token lookup",
    )
    text = _replace_once(
        text,
        '        "SELECT * FROM orders WHERE id=? AND access_token_digest=? "\n'
        '        "AND coalesce(deleted,0)=0",\n',
        '        "SELECT * FROM orders WHERE id=? AND access_token_digest=? "\n'
        '        "AND coalesce(deleted,0)=0 AND coalesce(synthetic,0)=0",\n',
        "order token lookup",
    )
    text = _replace_once(
        text,
        '        f"SELECT * FROM orders WHERE access_token_digest IN ({q}) "\n'
        '        "AND coalesce(deleted,0)=0 ORDER BY id DESC", digests)\n',
        '        f"SELECT * FROM orders WHERE access_token_digest IN ({q}) "\n'
        '        "AND coalesce(deleted,0)=0 AND coalesce(synthetic,0)=0 "\n'
        '        "ORDER BY id DESC", digests)\n',
        "orders by tokens",
    )
    helper_anchor = '''async def guest_session_has_order(token: str, order_id: int) -> bool:
'''
    helper = '''async def synthetic_order_for_guest(
    token: str,
    order_id: int,
) -> aiosqlite.Row | None:
    """Exact read-only cabinet access for the ephemeral OUT-001 guest."""
    row = await _guest_session_row(token)
    if not row:
        return None
    cur = await conn().execute(
        "SELECT o.* FROM web_guest_orders w JOIN orders o ON o.id=w.order_id "
        "WHERE w.token_digest=? AND w.order_id=? AND o.synthetic=1 "
        "AND o.synthetic_sink='isolated-out001' AND coalesce(o.deleted,0)=0",
        (row["token_digest"], order_id),
    )
    return await cur.fetchone()


async def guest_session_has_order(token: str, order_id: int) -> bool:
'''
    text = _replace_once(text, helper_anchor, helper, "synthetic guest helper")
    text = _replace_once(
        text,
        '            "WHERE w.token_digest=? AND o.user_id IS NULL "\n'
        '            "AND coalesce(o.deleted,0)=0",\n',
        '            "WHERE w.token_digest=? AND o.user_id IS NULL "\n'
        '            "AND coalesce(o.deleted,0)=0 AND coalesce(o.synthetic,0)=0",\n',
        "guest claim isolation",
    )
    old = '''async def claim_exchange_create(
    order_id: int,
    channel: str = "web",
    ttl_days: int = 30,
) -> str | None:
'''
    new = '''async def claim_exchange_create(
    order_id: int,
    channel: str = "web",
    ttl_days: int = 30,
    *,
    include_synthetic: bool = False,
) -> str | None:
'''
    text = _replace_once(text, old, new, "claim exchange signature")
    text = _replace_once(
        text,
        '    o = await get_order(order_id)\n'
        '    if not o or (o["deleted"] or 0):\n'
        '        return None\n'
        '    await ensure_access_token(order_id)\n',
        '    o = await get_order(order_id, include_synthetic=include_synthetic)\n'
        '    if not o or (o["deleted"] or 0):\n'
        '        return None\n'
        '    await ensure_access_token(order_id, include_synthetic=include_synthetic)\n',
        "claim exchange lookup",
    )
    text = _replace_once(
        text,
        '''async def ensure_access_token(order_id: int) -> str | None:
''',
        '''async def ensure_access_token(
    order_id: int,
    *,
    include_synthetic: bool = False,
) -> str | None:
''',
        "ensure token signature",
    )
    ensure_start = text.index("async def ensure_access_token(")
    ensure_end = text.index("\n\nasync def claim_order_to_user", ensure_start)
    ensure_block = text[ensure_start:ensure_end]
    ensure_block = _replace_once(
        ensure_block,
        "    o = await get_order(order_id)\n",
        "    o = await get_order(order_id, include_synthetic=include_synthetic)\n",
        "ensure token initial lookup",
    )
    ensure_block = _replace_once(
        ensure_block,
        "    o2 = await get_order(order_id)\n",
        "    o2 = await get_order(order_id, include_synthetic=include_synthetic)\n",
        "ensure token final lookup",
    )
    text = text[:ensure_start] + ensure_block + text[ensure_end:]
    old_query = '''            "WHERE x.state_digest=? AND x.consumed_at IS NULL "
            "AND x.expires_at>? AND coalesce(o.deleted,0)=0",
            (digest, now_iso()),
'''
    new_query = '''            "WHERE x.state_digest=? AND x.consumed_at IS NULL "
            "AND x.expires_at>? AND coalesce(o.deleted,0)=0 "
            "AND (? IS NULL OR coalesce(o.synthetic,0)=0)",
            (digest, now_iso(), user_id),
'''
    text = _replace_once(text, old_query, new_query, "authenticated claim isolation")
    return text


def patch_webapp(text: str) -> str:
    if f"# {MARKER}:webapp" in text:
        return text
    text = _replace_once(
        text,
        "from . import analytics_v2, config, db, keyboards as kb, texts\n",
        "from . import analytics_v2, config, db, keyboards as kb, out001_synthetic, texts\n"
        f"# {MARKER}:webapp\n",
        "webapp import",
    )
    text = _replace_once(
        text,
        'OUTBOX_NEW_ORDER = "new_order"\n',
        'OUTBOX_NEW_ORDER = "new_order"\n'
        'OUTBOX_OUT001 = out001_synthetic.OUTBOX_KIND\n',
        "outbox constant",
    )
    old = '''    for row in rows:
        if row["kind"] != OUTBOX_NEW_ORDER:
            continue
        try:
            await deliver_new_order(bot, row["order_id"])
            log.info("outbox: заявка №%s дослана (попытка %s)",
                     row["order_id"], row["attempts"] + 1)
        except Exception as exc:  # noqa: BLE001
            await db.outbox_failed(row["order_id"], row["kind"], repr(exc))
            log.warning("outbox: заявка №%s не дошла (попытка %s): %s",
                        row["order_id"], row["attempts"] + 1, exc)
'''
    new = '''    for row in rows:
        try:
            if row["kind"] == OUTBOX_OUT001:
                await out001_synthetic.deliver_isolated(config.DB_PATH, row["order_id"])
                log.info("outbox: isolated OUT-001 receipt completed")
                continue
            if row["kind"] != OUTBOX_NEW_ORDER:
                continue
            await deliver_new_order(bot, row["order_id"])
            log.info("outbox: заявка №%s дослана (попытка %s)",
                     row["order_id"], row["attempts"] + 1)
        except Exception as exc:  # noqa: BLE001
            await db.outbox_failed(row["order_id"], row["kind"], repr(exc))
            if row["kind"] == OUTBOX_OUT001:
                log.warning("outbox: isolated OUT-001 delivery failed (attempt %s)",
                            row["attempts"] + 1)
            else:
                log.warning("outbox: заявка №%s не дошла (попытка %s): %s",
                            row["order_id"], row["attempts"] + 1, exc)
'''
    text = _replace_once(text, old, new, "outbox sweep")
    old = '''async def _order_access(request: web.Request, order_id: int):
    """Заказ доступен владельцу сессии или по гостевому токену заказа."""
    o = await db.get_order(order_id)
    if not o:
        return None, None
    user = await _session_user(request)
    if user and (o["user_id"] == user["id"] or user["id"] in config.ADMIN_IDS):
        return o, user
    guest_token = request.cookies.get(GUEST_COOKIE, "")
    if guest_token and await db.guest_session_has_order(guest_token, order_id):
        return o, user
'''
    new = '''async def _order_access(
    request: web.Request,
    order_id: int,
    *,
    allow_synthetic: bool = False,
):
    """Ordinary access plus one read-only exact synthetic cabinet path."""
    o = await db.get_order(order_id)
    user = await _session_user(request)
    guest_token = request.cookies.get(GUEST_COOKIE, "")
    if not o and allow_synthetic and not user and guest_token:
        o = await db.synthetic_order_for_guest(guest_token, order_id)
    if not o:
        return None, None
    if user and (o["user_id"] == user["id"] or user["id"] in config.ADMIN_IDS):
        return o, user
    if guest_token and await db.guest_session_has_order(guest_token, order_id):
        return o, user
'''
    text = _replace_once(text, old, new, "order access")
    text = _replace_once(
        text,
        '''async def order_get(request: web.Request) -> web.Response:
    order_id = int(request.match_info["id"])
    o, user = await _order_access(request, order_id)
''',
        '''async def order_get(request: web.Request) -> web.Response:
    order_id = int(request.match_info["id"])
    o, user = await _order_access(request, order_id, allow_synthetic=True)
''',
        "read-only synthetic detail",
    )
    old = '''async def _order_create_response(
    request: web.Request,
    user,
    payload: dict,
    order_id: int,
    legacy_token: str | None,
) -> web.Response:
'''
    new = '''async def _order_create_response(
    request: web.Request,
    user,
    payload: dict,
    order_id: int,
    legacy_token: str | None,
    *,
    synthetic: bool = False,
) -> web.Response:
'''
    text = _replace_once(text, old, new, "create response signature")
    text = _replace_once(
        text,
        '''    guest_token = await db.guest_session_add_order(
        request.cookies.get(GUEST_COOKIE),
        order_id,
    )
''',
        '''    guest_token = None
    if not synthetic:
        guest_token = await db.guest_session_add_order(
            request.cookies.get(GUEST_COOKIE),
            order_id,
        )
''',
        "synthetic pre-response session isolation",
    )
    text = _replace_once(
        text,
        '''    claim_state = await db.claim_exchange_create(
        order_id,
        channel="order_create",
    )
''',
        '''    claim_state = await db.claim_exchange_create(
        order_id,
        channel="order_create",
        include_synthetic=synthetic,
    )
''',
        "synthetic claim exchange",
    )
    text = _replace_once(
        text,
        '    payload["guest_session"] = True\n',
        '    payload["guest_session"] = not synthetic\n',
        "synthetic session response",
    )
    text = _replace_once(
        text,
        '''    response = _json(payload)
    _set_guest_cookie(response, guest_token)
    return response
''',
        '''    response = _json(payload)
    if guest_token:
        _set_guest_cookie(response, guest_token)
    return response
''',
        "synthetic cookie isolation",
    )
    json_anchor = '''async def orders_create(request: web.Request) -> web.Response:
    ip = _ip(request)
    if not _rate_ok(ip, cost=3):
        return _err("rate_limit", 429)
    try:
        b = await request.json()
        assert isinstance(b, dict)
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    if (b.get("website") or "").strip():  # honeypot
'''
    json_new = '''async def orders_create(request: web.Request) -> web.Response:
    ip = _ip(request)
    if not _rate_ok(ip, cost=3):
        return _err("rate_limit", 429)
    try:
        b = await request.json()
        assert isinstance(b, dict)
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    try:
        synthetic_context = out001_synthetic.authorize_order(request, b)
        if synthetic_context:
            out001_synthetic.ensure_run_available(config.DB_PATH, synthetic_context)
    except out001_synthetic.ProbeError:
        return _err("synthetic_forbidden", 403)
    if (b.get("website") or "").strip():  # honeypot
'''
    text = _replace_once(text, json_anchor, json_new, "synthetic authorization")
    text = _replace_once(
        text,
        '''    if (b.get("website") or "").strip():  # honeypot
        return _json({"ok": True, "id": 0})

    user = await _session_user(request)
    if user and user["banned"]:
''',
        '''    if (b.get("website") or "").strip():  # honeypot
        return _json({"ok": True, "id": 0})

    user = None if synthetic_context else await _session_user(request)
    if user and user["banned"]:
''',
        "synthetic user isolation",
    )
    text = _replace_once(
        text,
        '''    guest_name = str(b.get("name") or "")[:120].strip()
    guest_contact = str(b.get("contact") or "")[:200].strip()
    if not user and not guest_contact:
        return _err("contact_required")
''',
        '''    guest_name = str(b.get("name") or "")[:120].strip()
    guest_contact = str(b.get("contact") or "")[:200].strip()
    if synthetic_context:
        guest_contact = ""
    if not user and not guest_contact and not synthetic_context:
        return _err("contact_required")
''',
        "zero synthetic contact",
    )
    text = _replace_once(
        text,
        '''    if request_id:
        previous = await db.order_by_client_request(request_id)
        same_owner = previous and (
            (user and previous["user_id"] == user["id"]) or
            (not user and previous["user_id"] is None and
             (previous["guest_contact"] or "") == guest_contact)
        )
''',
        '''    if request_id:
        if not synthetic_context and request_id.startswith("syn_"):
            return _err("bad_request_id")
        previous = await db.order_by_client_request(
            request_id,
            include_synthetic=bool(synthetic_context),
        )
        same_owner = previous and (
            (synthetic_context and previous["synthetic"] == 1
             and previous["test_run_id"] == synthetic_context.run_id
             and previous["synthetic_run_hash"] == synthetic_context.run_hash) or
            (user and previous["user_id"] == user["id"]) or
            (not synthetic_context and not user and previous["user_id"] is None and
             (previous["guest_contact"] or "") == guest_contact)
        )
''',
        "synthetic idempotency owner",
    )
    duplicate_anchor = '''            if prior_items:
                resp["bundle"] = {"count": len(prior_items)}
            return await _order_create_response(
'''
    duplicate_new = '''            if prior_items:
                resp["bundle"] = {"count": len(prior_items)}
            if synthetic_context:
                return _json(resp)
            return await _order_create_response(
'''
    text = _replace_once(text, duplicate_anchor, duplicate_new, "synthetic duplicate response")
    text = _replace_once(
        text,
        '''    q = ((cart_low, cart_high) if cart_items else
         (config.quote(type_id, disc or "hum", term or "free", tier or "base") if t else None))
''',
        '''    q = (None if synthetic_context else
         ((cart_low, cart_high) if cart_items else
          (config.quote(type_id, disc or "hum", term or "free", tier or "base") if t else None)))
''',
        "synthetic quote isolation",
    )
    create_anchor = '''    create_args = dict(
        _promo_claim=promo_claim,
        _outbox=OUTBOX_NEW_ORDER,
'''
    create_new = '''    create_args = dict(
        _promo_claim=promo_claim,
        _outbox=OUTBOX_NEW_ORDER,
'''
    text = _replace_once(text, create_anchor, create_new, "create args anchor")
    after_args = '''        request_fingerprint=request_fingerprint,
    )
    try:
'''
    after_new = '''        request_fingerprint=request_fingerprint,
    )
    if synthetic_context:
        create_args.update(
            _promo_claim=None,
            _outbox=OUTBOX_OUT001,
            user_id=None,
            guest_contact=None,
            quote_low=None,
            quote_high=None,
            ref_hint=None,
            promo_code=None,
            gift_code=None,
            synthetic=1,
            test_run_id=synthetic_context.run_id,
            synthetic_run_hash=synthetic_context.run_hash,
            synthetic_sink=synthetic_context.sink,
        )
    try:
'''
    text = _replace_once(text, after_args, after_new, "synthetic create fields")
    text = _replace_once(
        text,
        '        previous = await db.order_by_client_request(request_id) if request_id else None\n',
        '        previous = await db.order_by_client_request(\n'
        '            request_id, include_synthetic=bool(synthetic_context)\n'
        '        ) if request_id else None\n',
        "race idempotency lookup",
    )
    text = _replace_once(
        text,
        '''        if not previous:
            raise
        previous_fp = previous["request_fingerprint"]
''',
        '''        if not previous:
            raise
        if synthetic_context and not (
            previous["synthetic"] == 1
            and previous["test_run_id"] == synthetic_context.run_id
            and previous["synthetic_run_hash"] == synthetic_context.run_hash
        ):
            return _err("request_id_conflict", 409)
        previous_fp = previous["request_fingerprint"]
''',
        "race synthetic identity",
    )
    text = _replace_once(
        text,
        '''        if prior_items:
            resp["bundle"] = {"count": len(prior_items)}
        return await _order_create_response(
''',
        '''        if prior_items:
            resp["bundle"] = {"count": len(prior_items)}
        if synthetic_context:
            return _json(resp)
        return await _order_create_response(
''',
        "race synthetic duplicate response",
    )
    text = _replace_once(
        text,
        '''    _bg(f"order{order_id} create", lambda: deliver_new_order(bot, order_id))
    o = await db.get_order(order_id)
''',
        '''    if synthetic_context:
        _bg("OUT-001 isolated delivery", lambda: out001_synthetic.deliver_isolated(
            config.DB_PATH, order_id))
    else:
        _bg(f"order{order_id} create", lambda: deliver_new_order(bot, order_id))
    o = await db.get_order(order_id, include_synthetic=bool(synthetic_context))
''',
        "isolated quick delivery",
    )
    final_anchor = '''        order_id,
        access_token,
    )


async def orders_list'''
    final_new = '''        order_id,
        access_token,
        synthetic=bool(synthetic_context),
    )


async def orders_list'''
    text = _replace_once(text, final_anchor, final_new, "synthetic response flag")
    text = _replace_once(
        text,
        '        "SELECT count(*) n FROM orders WHERE created_at >= ? "\n'
        '        "AND status != \'cancel\' AND coalesce(deleted,0)=0 "\n',
        '        "SELECT count(*) n FROM orders WHERE created_at >= ? "\n'
        '        "AND status != \'cancel\' AND coalesce(deleted,0)=0 "\n'
        '        "AND coalesce(synthetic,0)=0 "\n',
        "monthly slots isolation",
    )
    return text


def validate_candidate(db_text: str, webapp_text: str) -> None:
    compile(db_text, "db.py", "exec")
    compile(webapp_text, "webapp.py", "exec")
    if db_text.count(f"# {MARKER}:db") != 1:
        raise RuntimeError("db marker cardinality")
    if webapp_text.count(f"# {MARKER}:webapp") != 1:
        raise RuntimeError("webapp marker cardinality")
    required_db = (
        "include_synthetic: bool = False",
        "synthetic_order_for_guest",
        "coalesce(synthetic,0)=0",
        "(? IS NULL OR coalesce(o.synthetic,0)=0)",
    )
    required_webapp = (
        "out001_synthetic.authorize_order",
        "OUTBOX_OUT001",
        "synthetic=bool(synthetic_context)",
        "allow_synthetic=True",
        "if not synthetic:\n        guest_token = await db.guest_session_add_order",
    )
    if any(value not in db_text for value in required_db):
        raise RuntimeError("db candidate contract missing")
    if any(value not in webapp_text for value in required_webapp):
        raise RuntimeError("webapp candidate contract missing")
    tree = ast.parse(webapp_text, filename="webapp.py")
    raw_duplicate_returns = 0
    for node in ast.walk(tree):
        if not isinstance(node, ast.If) or len(node.body) != 1:
            continue
        if not isinstance(node.test, ast.Name) or node.test.id != "synthetic_context":
            continue
        statement = node.body[0]
        if not isinstance(statement, ast.Return) or not isinstance(statement.value, ast.Call):
            continue
        call = statement.value
        if (
            isinstance(call.func, ast.Name)
            and call.func.id == "_json"
            and len(call.args) == 1
            and isinstance(call.args[0], ast.Name)
            and call.args[0].id == "resp"
            and not call.keywords
        ):
            raw_duplicate_returns += 1
    if raw_duplicate_returns != 2:
        raise RuntimeError("synthetic duplicate race contract missing")


def _regular_file(path: Path, *, allow_missing: bool = False) -> None:
    try:
        info = os.lstat(path)
    except FileNotFoundError:
        if allow_missing:
            return
        raise
    if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
        raise RuntimeError(f"unsafe file target: {path}")


def _inside(root: Path, path: Path) -> None:
    root_resolved = root.resolve()
    candidate = path.parent.resolve() / path.name
    if candidate != root_resolved and root_resolved not in candidate.parents:
        raise RuntimeError(f"path escapes root: {path}")


def _require_hash(path: Path, *allowed: str) -> str:
    _regular_file(path)
    actual = sha256(path)
    expected = {value for value in allowed if value and not value.startswith("__")}
    if expected and actual not in expected:
        raise RuntimeError(f"unknown source hash for {path.name}: {actual}")
    return actual


def _asset_paths(assets: Path) -> dict[str, Path]:
    return {
        "runtime": assets / "out001_synthetic.py",
        "probe": assets / "out001_probe.py",
        "migration": assets / "migrations" / "0010_out001_synthetic.sql",
    }


def _target_paths(root: Path) -> dict[str, Path]:
    return {
        "runtime": root / "app" / "out001_synthetic.py",
        "probe": root / "out001_probe.py",
        "migration": root / "migrations" / "0010_out001_synthetic.sql",
    }


def _validate_assets(assets: Path) -> dict[str, str]:
    paths = _asset_paths(assets)
    for path in paths.values():
        _regular_file(path)
    compile(paths["runtime"].read_text(encoding="utf-8"), str(paths["runtime"]), "exec")
    compile(paths["probe"].read_text(encoding="utf-8"), str(paths["probe"]), "exec")
    migration = paths["migration"].read_text(encoding="utf-8")
    if f"VALUES('{MIGRATION_VERSION}'" not in migration or "BEGIN IMMEDIATE;" not in migration:
        raise RuntimeError("migration asset contract")
    hashes = {name: sha256(path) for name, path in paths.items()}
    if hashes != KNOWN_ASSETS:
        raise RuntimeError("OUT-001 executable asset hash mismatch")
    return hashes


def _capability_absent(path: Path) -> None:
    if os.path.lexists(path):
        raise RuntimeError("OUT-001 capability must be absent")


def _active_synthetic_count(database: Path) -> int:
    if not database.exists():
        raise RuntimeError("database missing")
    connection = sqlite3.connect(f"file:{database.resolve()}?mode=ro", uri=True)
    try:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(orders)")}
        if "synthetic" not in columns:
            return 0
        return int(connection.execute(
            "SELECT count(*) FROM orders WHERE synthetic=1"
        ).fetchone()[0])
    finally:
        connection.close()


def _migration_applied(database: Path) -> bool:
    connection = sqlite3.connect(f"file:{database.resolve()}?mode=ro", uri=True)
    try:
        if not connection.execute(
            "SELECT 1 FROM sqlite_schema WHERE type='table' AND name='schema_migrations'"
        ).fetchone():
            return False
        return connection.execute(
            "SELECT 1 FROM schema_migrations WHERE version=?", (MIGRATION_VERSION,)
        ).fetchone() is not None
    finally:
        connection.close()


def _database_checks(
    database: Path,
    runtime_asset: Path,
    *,
    migrated: bool = True,
) -> None:
    _regular_file(runtime_asset)
    runtime_namespace = runpy.run_path(str(runtime_asset))
    if runtime_namespace.get("ORDER_SCHEMA_SHA256") != ORDER_SCHEMA_SHA256:
        raise RuntimeError("OUT-001 runtime schema contract mismatch")
    schema_digest = runtime_namespace.get("order_schema_digest")
    schema_exact = runtime_namespace.get("order_schema_exact")
    surface_schema_exact = runtime_namespace.get("surface_schema_exact")
    order_links = runtime_namespace.get("_order_links")
    known_links = runtime_namespace.get("KNOWN_ORDER_LINKS")
    if (
        not callable(schema_digest)
        or not callable(schema_exact)
        or not callable(surface_schema_exact)
        or not callable(order_links)
        or not isinstance(known_links, frozenset)
    ):
        raise RuntimeError("OUT-001 runtime schema helper missing")
    connection = sqlite3.connect(database)
    try:
        if connection.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise RuntimeError("SQLite quick_check failed")
        if connection.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise RuntimeError("SQLite foreign_key_check failed")
        required = {"synthetic", "test_run_id", "synthetic_run_hash", "synthetic_sink"}
        columns = {row[1] for row in connection.execute("PRAGMA table_info(orders)")}
        if migrated:
            if not required.issubset(columns):
                raise RuntimeError("OUT-001 order schema missing")
            if schema_digest(connection) != ORDER_SCHEMA_SHA256 or not schema_exact(connection):
                raise RuntimeError("OUT-001 order schema drift")
            for table in ("synthetic_delivery_receipts", "synthetic_probe_tombstones"):
                if not connection.execute(
                    "SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?", (table,)
                ).fetchone():
                    raise RuntimeError("OUT-001 table missing")
        else:
            expected_links = known_links - {("synthetic_delivery_receipts", "order_id")}
            if required & columns:
                raise RuntimeError("OUT-001 pre-migration columns present")
            if (
                schema_digest(connection) != PRE_ORDER_SCHEMA_SHA256
                or order_links(connection) != expected_links
                or not surface_schema_exact(connection, migrated=False)
            ):
                raise RuntimeError("OUT-001 pre-migration schema drift")
    finally:
        connection.close()


def _atomic_text(
    path: Path,
    content: str,
    *,
    expected_current: str,
    root: Path,
) -> None:
    _secure_target_parent(root, path, create=False)
    _regular_file(path)
    source_info = os.lstat(path)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.out001.tmp")
    flags = (
        os.O_WRONLY | os.O_CREAT | os.O_EXCL
        | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    )
    descriptor = os.open(temporary, flags, stat.S_IMODE(source_info.st_mode))
    try:
        payload = content.encode("utf-8")
        view = memoryview(payload)
        while view:
            written = os.write(descriptor, view)
            view = view[written:]
        os.fchmod(descriptor, stat.S_IMODE(source_info.st_mode))
        os.fchown(descriptor, source_info.st_uid, source_info.st_gid)
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = -1
        _secure_target_parent(root, path, create=False)
        _regular_file(path)
        if sha256(path) != expected_current:
            raise RuntimeError("source drift before replace")
        os.replace(temporary, path)
        directory_fd = os.open(path.parent, os.O_RDONLY | getattr(os, "O_CLOEXEC", 0))
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        temporary.unlink(missing_ok=True)


def _secure_target_parent(root: Path, target: Path, *, create: bool) -> None:
    lexical_root = root.absolute()
    lexical_target = target.absolute()
    try:
        relative = lexical_target.relative_to(lexical_root)
    except ValueError as exc:
        raise RuntimeError(f"path escapes root: {target}") from exc
    root = root.resolve(strict=True)
    root_info = os.lstat(root)
    if not stat.S_ISDIR(root_info.st_mode) or stat.S_IMODE(root_info.st_mode) & 0o022:
        raise RuntimeError(f"unsafe install root: {root}")
    owner = root_info.st_uid
    current = root
    for part in relative.parts[:-1]:
        current = current / part
        try:
            info = os.lstat(current)
        except FileNotFoundError:
            if not create:
                raise RuntimeError(f"missing target parent: {current}") from None
            os.mkdir(current, 0o750)
            info = os.lstat(current)
        legacy_orphaned_app = False
        if (
            owner == 0
            and os.geteuid() == 0
            and root == PRODUCTION_ROOT
            and current == root / "app"
            and info.st_uid == LEGACY_APP_UID
            and info.st_gid == LEGACY_APP_GID
            and stat.S_IMODE(info.st_mode) == LEGACY_APP_MODE
        ):
            try:
                pwd.getpwuid(info.st_uid)
            except KeyError:
                legacy_orphaned_app = True
        if (
            not stat.S_ISDIR(info.st_mode)
            or (info.st_uid != owner and not legacy_orphaned_app)
            or stat.S_IMODE(info.st_mode) & 0o022
        ):
            raise RuntimeError(f"unsafe target parent: {current}")


def _atomic_asset(source: Path, target: Path, *, root: Path, mode: int) -> None:
    _regular_file(source)
    _secure_target_parent(root, target, create=True)
    if os.path.lexists(target):
        raise RuntimeError(f"asset target already exists: {target}")
    temporary = target.with_name(f".{target.name}.{os.getpid()}.out001.tmp")
    flags = (
        os.O_WRONLY | os.O_CREAT | os.O_EXCL
        | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    )
    descriptor = os.open(temporary, flags, mode)
    try:
        with source.open("rb") as stream:
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                view = memoryview(block)
                while view:
                    written = os.write(descriptor, view)
                    view = view[written:]
        os.fchmod(descriptor, mode)
        os.fsync(descriptor)
        os.close(descriptor)
        descriptor = -1
        if os.path.lexists(target):
            raise RuntimeError(f"asset target appeared before replace: {target}")
        os.replace(temporary, target)
        directory_fd = os.open(target.parent, os.O_RDONLY | getattr(os, "O_CLOEXEC", 0))
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        temporary.unlink(missing_ok=True)


def preview(root: Path, assets: Path, database: Path, capability: Path) -> dict[str, Any]:
    root = root.resolve()
    sources = {"db": root / "app" / "db.py", "webapp": root / "app" / "webapp.py"}
    for path in sources.values():
        _inside(root, path)
    before = {
        name: _require_hash(path, KNOWN_BEFORE[name], KNOWN_AFTER[name])
        for name, path in sources.items()
    }
    db_candidate = patch_db(sources["db"].read_text(encoding="utf-8"))
    webapp_candidate = patch_webapp(sources["webapp"].read_text(encoding="utf-8"))
    validate_candidate(db_candidate, webapp_candidate)
    after = {"db": sha256_text(db_candidate), "webapp": sha256_text(webapp_candidate)}
    for name in after:
        pinned = KNOWN_AFTER[name]
        if not pinned.startswith("__") and after[name] != pinned:
            raise RuntimeError(f"candidate hash drift for {name}")
    assets = assets.resolve()
    asset_hashes = _validate_assets(assets)
    _capability_absent(capability)
    if _active_synthetic_count(database):
        raise RuntimeError("active synthetic record blocks installer")
    migration_applied = _migration_applied(database)
    _database_checks(
        database,
        _asset_paths(assets)["runtime"],
        migrated=migration_applied,
    )
    return {
        "ok": True,
        "changed": before != after,
        "before_sha256": before,
        "after_sha256": after,
        "asset_sha256": asset_hashes,
        "migration_applied": migration_applied,
    }


def _service_stopped(service: str = SERVICE_NAME) -> bool:
    result = subprocess.run(
        ["systemctl", "is-active", "--quiet", service],
        check=False,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return result.returncode != 0


def install(
    root: Path,
    assets: Path,
    database: Path,
    capability: Path,
    backup_root: Path,
    *,
    require_stopped: bool = True,
    now: datetime | None = None,
) -> dict[str, Any]:
    if require_stopped and not _service_stopped():
        raise RuntimeError("service must be stopped for OUT-001 install")
    state = preview(root, assets, database, capability)
    root = root.resolve()
    sources = {"db": root / "app" / "db.py", "webapp": root / "app" / "webapp.py"}
    targets = _target_paths(root)
    asset_paths = _asset_paths(assets.resolve())
    already_sources = all(
        state["before_sha256"][name] == state["after_sha256"][name]
        for name in sources
    )
    already_assets = all(
        target.exists() and sha256(target) == state["asset_sha256"][name]
        for name, target in targets.items()
    )
    if already_sources and already_assets and state["migration_applied"]:
        _database_checks(database, targets["runtime"])
        return {**state, "changed": False, "backup": None}
    if any(path.exists() or path.is_symlink() for path in targets.values()):
        raise RuntimeError("OUT-001 asset target already exists with incomplete install")
    if any(state["before_sha256"][name] != KNOWN_BEFORE[name] for name in sources):
        raise RuntimeError("mixed OUT-001 source state")

    stamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%dT%H%M%S%fZ")
    backup = backup_root.resolve() / f"out001-synthetic-{stamp}"
    backup.mkdir(parents=True, mode=0o700)
    os.chmod(backup, 0o700)
    for name, source in sources.items():
        shutil.copy2(source, backup / source.name)
        os.chmod(backup / source.name, 0o600)
        if sha256(backup / source.name) != KNOWN_BEFORE[name]:
            raise RuntimeError("rollback preimage mismatch")
    manifest = {
        "kind": "out001-synthetic-plane",
        "created_at": (now or datetime.now(timezone.utc)).isoformat(),
        "before_sha256": KNOWN_BEFORE,
        "after_sha256": state["after_sha256"],
        "asset_sha256": state["asset_sha256"],
        "migration": MIGRATION_VERSION,
    }
    (backup / "manifest.json").write_text(
        json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    os.chmod(backup / "manifest.json", 0o600)

    db_candidate = patch_db(sources["db"].read_text(encoding="utf-8"))
    webapp_candidate = patch_webapp(sources["webapp"].read_text(encoding="utf-8"))
    installed_targets: list[Path] = []
    source_replaced: list[str] = []
    try:
        _atomic_text(
            sources["db"], db_candidate,
            expected_current=KNOWN_BEFORE["db"], root=root,
        )
        source_replaced.append("db")
        _atomic_text(
            sources["webapp"], webapp_candidate,
            expected_current=KNOWN_BEFORE["webapp"],
            root=root,
        )
        source_replaced.append("webapp")
        for name, mode in (("runtime", 0o640), ("probe", 0o700), ("migration", 0o640)):
            _atomic_asset(asset_paths[name], targets[name], root=root, mode=mode)
            installed_targets.append(targets[name])
            if sha256(targets[name]) != state["asset_sha256"][name]:
                raise RuntimeError("installed asset hash mismatch")
        if not state["migration_applied"]:
            connection = sqlite3.connect(database)
            try:
                if sha256(targets["migration"]) != state["asset_sha256"]["migration"]:
                    raise RuntimeError("installed migration hash drift")
                connection.executescript(
                    targets["migration"].read_text(encoding="utf-8")
                )
            finally:
                connection.close()
        _database_checks(database, targets["runtime"])
        for name, path in sources.items():
            _require_hash(path, state["after_sha256"][name])
    except Exception:
        for name in reversed(source_replaced):
            source = sources[name]
            if sha256(source) == state["after_sha256"][name]:
                _atomic_text(
                    source,
                    (backup / source.name).read_text(encoding="utf-8"),
                    expected_current=state["after_sha256"][name],
                    root=root,
                )
        for target in reversed(installed_targets):
            _secure_target_parent(root, target, create=False)
            if os.path.lexists(target):
                _regular_file(target)
            if os.path.lexists(target) and sha256(target) in set(state["asset_sha256"].values()):
                _secure_target_parent(root, target, create=False)
                target.unlink()
        raise
    return {**state, "changed": True, "backup": str(backup)}


def rollback(
    root: Path,
    database: Path,
    capability: Path,
    backup: Path,
    *,
    require_stopped: bool = True,
) -> dict[str, Any]:
    if require_stopped and not _service_stopped():
        raise RuntimeError("service must be stopped for OUT-001 rollback")
    _capability_absent(capability)
    if _active_synthetic_count(database):
        raise RuntimeError("active synthetic record blocks rollback")
    root = root.resolve()
    sources = {"db": root / "app" / "db.py", "webapp": root / "app" / "webapp.py"}
    targets = _target_paths(root)
    manifest_path = backup.resolve() / "manifest.json"
    _regular_file(manifest_path)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("kind") != "out001-synthetic-plane":
        raise RuntimeError("wrong rollback manifest")
    after = manifest.get("after_sha256") or {}
    assets = manifest.get("asset_sha256") or {}
    if set(after) != set(sources) or set(assets) != set(targets):
        raise RuntimeError("rollback manifest scope mismatch")
    if after != KNOWN_AFTER or assets != KNOWN_ASSETS:
        raise RuntimeError("rollback manifest hash contract mismatch")
    if manifest.get("before_sha256") != KNOWN_BEFORE:
        raise RuntimeError("rollback manifest preimage contract mismatch")
    source_state: dict[str, str] = {}
    for name, source in sources.items():
        actual = _require_hash(source, after[name], KNOWN_BEFORE[name])
        source_state[name] = "before" if actual == KNOWN_BEFORE[name] else "after"
    target_state: dict[str, str] = {}
    for name, target in targets.items():
        _secure_target_parent(root, target, create=False)
        if not os.path.lexists(target):
            target_state[name] = "absent"
            continue
        _regular_file(target)
        if sha256(target) != assets[name]:
            raise RuntimeError("rollback asset drift")
        target_state[name] = "exact"
    for name, source in sources.items():
        preserved = backup / source.name
        _regular_file(preserved)
        if sha256(preserved) != KNOWN_BEFORE[name]:
            raise RuntimeError("rollback preimage drift")
    restored = False
    for name, source in sources.items():
        if source_state[name] == "before":
            continue
        _atomic_text(
            source,
            (backup / source.name).read_text(encoding="utf-8"),
            expected_current=after[name],
            root=root,
        )
        restored = True
    removed = False
    for name, target in targets.items():
        if target_state[name] == "exact":
            _secure_target_parent(root, target, create=False)
            _regular_file(target)
            if sha256(target) != KNOWN_ASSETS[name]:
                raise RuntimeError("rollback asset drift before unlink")
            target.unlink()
            removed = True
    for name, source in sources.items():
        _require_hash(source, KNOWN_BEFORE[name])
    residue = []
    for path in targets.values():
        _secure_target_parent(root, path, create=False)
        if os.path.lexists(path):
            residue.append(str(path))
    if residue:
        raise RuntimeError("rollback asset residue")
    changed = restored or removed
    return {
        "ok": True,
        "rolled_back": changed,
        "already_rolled_back": not changed,
    }


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("mode", choices=("check", "apply", "rollback"))
    value.add_argument("--root", type=Path, default=Path("/root/salon_bot"))
    value.add_argument("--assets", type=Path, default=Path(__file__).resolve().parent)
    value.add_argument("--database", type=Path)
    value.add_argument("--capability", type=Path, default=CAPABILITY_PATH)
    value.add_argument("--backup-root", type=Path)
    value.add_argument("--backup", type=Path)
    return value


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    database = args.database or args.root / "salon.db"
    backup_root = args.backup_root or args.root / "backups"
    if args.mode == "check":
        result = preview(args.root, args.assets, database, args.capability)
    elif args.mode == "apply":
        result = install(
            args.root, args.assets, database, args.capability, backup_root,
            require_stopped=True,
        )
    else:
        if not args.backup:
            raise SystemExit("--backup is required for rollback")
        result = rollback(
            args.root, database, args.capability, args.backup,
            require_stopped=True,
        )
    sys.stdout.write(json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
