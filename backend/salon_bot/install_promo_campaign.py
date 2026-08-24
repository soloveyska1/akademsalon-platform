#!/usr/bin/env python3
"""Install the reviewed first-order promo contract into Salon's private backend.

The public repository does not contain the full production bot.  This installer
therefore patches only pinned source images, migrates one SQLite contract,
creates an exact backup first and can roll the whole change back.  It does not
print client rows, contacts, tokens or environment values.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable


CAMPAIGN_CODE = "ПЕРВЫЙЛИСТ"
CAMPAIGN_FAMILY = "first-order-2026-08"
CAMPAIGN_START = "2026-08-24T00:00:00"
CAMPAIGN_END = "2026-09-21"
# Public dates are Moscow calendar dates.  Source timestamps remain UTC so the
# exact instant is unambiguous on the server and in both browser clients.
CAMPAIGN_END_AT = "2026-09-21T20:59:59"
RETENTION_ISSUE_END = "2026-09-18T20:59:59"

WEBAPP_MARKER = "first-order-promo-web:20260824"
DB_MARKER = "first-order-promo-db:20260824"
PROMO_MARKER = "first-order-promo-service:20260824"

KNOWN_BEFORE = {
    "webapp": "14a45362e9ce17416c552557f4610546ce23549a4fc35dbbccc46d9e624448ee",
    "db": "7611e08b69bbe283b5614fbaaf5bd3f379b95cefb57dcc033b23446ca051dad9",
    "promo": "6f6047feb78cca469655e8dbd023c09ca1c861c7ec53c3675c0cac9870dd6db9",
}

KNOWN_AFTER = {
    "webapp": "48a1f40a5bf49f88de3e079e3576075d8b08d5e561ad6d7ffdfdbf1d0d67008b",
    "db": "be6bf8c89cb4024590e41f1b698b2cb4839d626648079cfcc0274dd23c1a8899",
    "promo": "f912bec36e1c1cdafae9d5e449919c5414215a782ac2ecc6cbebead74ddd4c21",
}

CAMPAIGN_SCHEMA = f'''
CREATE TABLE IF NOT EXISTS promo_first_order_claims(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family TEXT NOT NULL,
  code TEXT NOT NULL,
  user_id INTEGER,
  contact_key TEXT,
  order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  CHECK(user_id IS NOT NULL OR contact_key IS NOT NULL),
  UNIQUE(family, user_id),
  UNIQUE(family, contact_key)
);
CREATE INDEX IF NOT EXISTS idx_promo_first_order_claims_order
  ON promo_first_order_claims(order_id);
CREATE TABLE IF NOT EXISTS promo_campaign_intents(
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  grant_code TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_promo_campaign_intents_expiry
  ON promo_campaign_intents(expires_at);
CREATE TABLE IF NOT EXISTS promo_retention_grants(
  code TEXT PRIMARY KEY REFERENCES promos(code),
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_order_id INTEGER UNIQUE REFERENCES orders(id)
);
CREATE INDEX IF NOT EXISTS idx_promo_retention_grants_expiry
  ON promo_retention_grants(expires_at);
'''.strip()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def campaign_discount(kind: str, raw_price: int) -> int:
    price = max(0, int(raw_price or 0))
    if kind == "welcome":
        pct, cap, minimum = 2, 2500, 2500
    elif kind == "retention":
        pct, cap, minimum = 1, 1000, 5000
    else:
        raise ValueError("unknown campaign kind")
    if price < minimum:
        return 0
    return max(0, min(cap, (price * pct + 50) // 100, price))


DB_HELPERS = f'''

# {DB_MARKER}
class PromoEligibilityError(RuntimeError):
    """The first-order entitlement stopped matching during order creation."""


def _promo_contact_normalized(contact: str | None) -> str:
    value = str(contact or "").strip().casefold()
    if not value:
        return ""
    social = None
    labelled = re.match(r"^(telegram|телеграм|тг|вк|vk)\\s*:\\s*(.*)$", value)
    if labelled:
        social = "vk" if labelled.group(1) in {{"вк", "vk"}} else "telegram"
        value = labelled.group(2).strip()
    email = re.search(r"[a-z0-9.!#$%&'*+/=?^_`{{|}}~-]+@[a-z0-9.-]+", value)
    if email:
        local, domain = email.group(0).split("@", 1)
        return "email:" + local.split("+", 1)[0] + "@" + domain.strip(".")
    telegram = re.search(
        r"^(?:https?://)?(?:www\\.)?(?:t\\.me|telegram\\.me)/@?([a-z0-9_.]+)", value
    )
    if telegram:
        return "handle:" + telegram.group(1).rstrip(".")
    vk = re.search(
        r"^(?:https?://)?(?:www\\.|m\\.)?vk\\.(?:com|me)/@?([a-z0-9_.]+)", value
    )
    if vk:
        return "vk:" + vk.group(1).rstrip(".")
    digits = "".join(ch for ch in value if ch.isdigit())
    if social is None and len(digits) >= 10:
        return "phone:" + digits[-10:]
    username = value
    for prefix in ("@",):
        if username.startswith(prefix):
            username = username[len(prefix):]
            break
    username = "".join(ch for ch in username if ch.isalnum() or ch in "_.").strip(".")
    if not username:
        return ""
    return ("vk:" if social == "vk" else "handle:") + username


def _promo_contact_key(contact: str | None) -> str | None:
    normalized = _promo_contact_normalized(contact)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest() if normalized else None


def _promo_token_hash(token: str | None) -> str | None:
    value = str(token or "").strip()
    return hashlib.sha256(value.encode("utf-8")).hexdigest() if len(value) >= 32 else None


async def _promo_guest_contact_exists(c, contact: str | None) -> bool:
    wanted = _promo_contact_normalized(contact)
    if not wanted:
        return False
    rows = await (await c.execute(
        "SELECT guest_contact FROM orders WHERE guest_contact IS NOT NULL"
    )).fetchall()
    return any(_promo_contact_normalized(row["guest_contact"]) == wanted for row in rows)


async def _promo_existing_contact(c, contact: str | None) -> bool:
    wanted = _promo_contact_normalized(contact)
    if not wanted:
        return False
    if await _promo_guest_contact_exists(c, contact):
        return True
    rows = await (await c.execute(
        "SELECT email,phone,username FROM users"
    )).fetchall()
    return any(
        _promo_contact_normalized(value) == wanted
        for row in rows for value in (row["email"], row["phone"], row["username"])
        if value
    )


async def _promo_user_has_contact_history(c, user) -> bool:
    contacts = [user[key] for key in ("email", "phone", "username") if user[key]]
    normalized = {{_promo_contact_normalized(value) for value in contacts}}
    normalized.discard("")
    rows = await (await c.execute(
        "SELECT id,email,phone,username FROM users WHERE id<>?", (user["id"],)
    )).fetchall()
    if any(
        _promo_contact_normalized(value) in normalized
        for row in rows for value in (row["email"], row["phone"], row["username"])
        if value
    ):
        return True
    for value in contacts:
        if await _promo_guest_contact_exists(c, value):
            return True
        contact_key = _promo_contact_key(value)
        if contact_key and await (await c.execute(
            "SELECT 1 FROM promo_first_order_claims WHERE family=? AND contact_key=? LIMIT 1",
            ("{CAMPAIGN_FAMILY}", contact_key),
        )).fetchone():
            return True
    return False


async def _promo_claim_validate(c, claim: dict[str, Any] | None) -> None:
    if not claim:
        return
    if claim.get("family") != "{CAMPAIGN_FAMILY}":
        raise PromoEligibilityError("unknown campaign family")
    setting = await (await c.execute(
        "SELECT value FROM settings WHERE key='promo_campaign'"
    )).fetchone()
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    if not setting or setting["value"] != "on" or now_utc > "{CAMPAIGN_END_AT}":
        raise PromoEligibilityError("campaign off")

    code = str(claim.get("code") or "").strip().upper()
    user_id = claim.get("user_id")
    contact = str(claim.get("contact") or "").strip()
    contact_key = claim.get("contact_key") or _promo_contact_key(contact)
    if not code or (not user_id and not contact_key):
        raise PromoEligibilityError("identity required")

    if user_id:
        row = await (await c.execute(
            "SELECT id,created_at,email,phone,username FROM users WHERE id=?", (user_id,)
        )).fetchone()
        if not row or str(row["created_at"] or "") < "{CAMPAIGN_START}":
            raise PromoEligibilityError("existing account")
        if await _promo_user_has_contact_history(c, row):
            raise PromoEligibilityError("existing contact")
        profile_contacts = {{
            _promo_contact_normalized(row[key])
            for key in ("email", "phone", "username") if row[key]
        }}
        claim_contact = _promo_contact_normalized(contact)
        if (claim_contact and claim_contact not in profile_contacts and
                await _promo_existing_contact(c, contact)):
            raise PromoEligibilityError("existing contact")
        if await (await c.execute(
            "SELECT 1 FROM orders WHERE user_id=? LIMIT 1", (user_id,)
        )).fetchone():
            raise PromoEligibilityError("existing order")
        for table, column in (
            ("subscriptions", "user_id"), ("deposits", "user_id"),
            ("gifts", "buyer_user_id"),
        ):
            if await (await c.execute(
                f"SELECT 1 FROM {{table}} WHERE {{column}}=? LIMIT 1", (user_id,)
            )).fetchone():
                raise PromoEligibilityError("existing benefit")
    elif await _promo_existing_contact(c, contact):
        raise PromoEligibilityError("existing contact")

    if await (await c.execute(
        "SELECT 1 FROM promo_first_order_claims WHERE family=? AND "
        "((? IS NOT NULL AND user_id=?) OR (? IS NOT NULL AND contact_key=?)) LIMIT 1",
        (claim["family"], user_id, user_id, contact_key, contact_key),
    )).fetchone():
        raise PromoEligibilityError("campaign already claimed")

    if code == "{CAMPAIGN_CODE}":
        return
    token_hash = claim.get("token_hash")
    grant = await (await c.execute(
        "SELECT 1 FROM promo_retention_grants WHERE code=? AND token_hash=? "
        "AND consumed_order_id IS NULL AND datetime(expires_at)>datetime('now')",
        (code, token_hash),
    )).fetchone()
    if not grant:
        raise PromoEligibilityError("retention not bound")


async def _promo_claim_store(c, claim: dict[str, Any] | None,
                             order_id: int, created_at: str) -> None:
    if not claim:
        return
    code = str(claim.get("code") or "").strip().upper()
    await c.execute(
        "INSERT INTO promo_first_order_claims"
        "(family,code,user_id,contact_key,order_id,created_at) VALUES(?,?,?,?,?,?)",
        (claim["family"], code, claim.get("user_id"),
         claim.get("contact_key") or _promo_contact_key(claim.get("contact")),
         order_id, created_at),
    )
    if code != "{CAMPAIGN_CODE}":
        cur = await c.execute(
            "UPDATE promo_retention_grants SET consumed_order_id=? "
            "WHERE code=? AND token_hash=? AND consumed_order_id IS NULL "
            "AND datetime(expires_at)>datetime('now')",
            (order_id, code, claim.get("token_hash")),
        )
        if cur.rowcount != 1:
            raise PromoEligibilityError("retention already consumed")


async def promo_customer_state(user_id: int | None, campaign_start: str) -> str:
    if not user_id:
        return "provisional"
    c = conn()
    user = await (await c.execute(
        "SELECT id,created_at,email,phone,username FROM users WHERE id=?", (user_id,)
    )).fetchone()
    if not user or str(user["created_at"] or "") < campaign_start:
        return "existing"
    if await _promo_user_has_contact_history(c, user):
        return "existing"
    if await (await c.execute(
        "SELECT 1 FROM orders WHERE user_id=? LIMIT 1", (user_id,)
    )).fetchone():
        return "existing"
    for table, column in (
        ("subscriptions", "user_id"), ("deposits", "user_id"),
        ("gifts", "buyer_user_id"),
    ):
        if await (await c.execute(
            f"SELECT 1 FROM {{table}} WHERE {{column}}=? LIMIT 1", (user_id,)
        )).fetchone():
            return "existing"
    if await (await c.execute(
        "SELECT 1 FROM promo_first_order_claims WHERE family=? AND user_id=? LIMIT 1",
        ("{CAMPAIGN_FAMILY}", user_id),
    )).fetchone():
        return "existing"
    return "eligible"


async def promo_intent_start(token: str) -> bool:
    token_hash = _promo_token_hash(token)
    if not token_hash:
        return False
    now = now_iso()
    expires = (datetime.now(timezone.utc) + timedelta(hours=72)).strftime("%Y-%m-%dT%H:%M:%S")
    async with transaction() as c:
        await c.execute(
            "DELETE FROM promo_campaign_intents WHERE datetime(expires_at)<=datetime('now')"
        )
        await c.execute(
            "INSERT OR IGNORE INTO promo_campaign_intents"
            "(token_hash,created_at,expires_at) VALUES(?,?,?)",
            (token_hash, now, expires),
        )
    return True


async def promo_retention_issue(token: str, code: str, daily_limit: int = 40):
    token_hash = _promo_token_hash(token)
    code = str(code or "").strip().upper()
    if not token_hash or not code:
        return None, "intent_required"
    async with transaction() as c:
        intent = await (await c.execute(
            "SELECT created_at,expires_at,grant_code FROM promo_campaign_intents "
            "WHERE token_hash=? AND datetime(expires_at)>datetime('now')",
            (token_hash,),
        )).fetchone()
        if not intent or str(intent["created_at"]) > (
            datetime.now(timezone.utc) - timedelta(seconds=60)
        ).strftime("%Y-%m-%dT%H:%M:%S"):
            return None, "intent_too_new"
        if intent["grant_code"]:
            row = await (await c.execute(
                "SELECT code,expires_at FROM promo_retention_grants WHERE code=? "
                "AND token_hash=? AND consumed_order_id IS NULL "
                "AND datetime(expires_at)>datetime('now')",
                (intent["grant_code"], token_hash),
            )).fetchone()
            return (row, None) if row else (None, "already_granted")
        setting = await (await c.execute(
            "SELECT value FROM settings WHERE key='promo_campaign'"
        )).fetchone()
        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        if not setting or setting["value"] != "on" or now_utc > "{RETENTION_ISSUE_END}":
            return None, "off"
        count = await (await c.execute(
            "SELECT COUNT(*) AS n FROM promo_retention_grants WHERE created_at>=?",
            (now_utc[:10],),
        )).fetchone()
        if int(count["n"] or 0) >= max(1, int(daily_limit)):
            return None, "day_limit"
        until = (datetime.now(timezone.utc) + timedelta(hours=72)).strftime("%Y-%m-%dT%H:%M:%S")
        await c.execute(
            "INSERT INTO promos(code,pct,amount,cap,min_price,uses_left,expires_at,"
            "active,note,family,created_at) VALUES(?,1,NULL,1000,5000,1,?,1,?,?,?)",
            (code, until, "авто: возврат к первому заказу", "{CAMPAIGN_FAMILY}", now_iso()),
        )
        await c.execute(
            "INSERT INTO promo_retention_grants"
            "(code,token_hash,created_at,expires_at) VALUES(?,?,?,?)",
            (code, token_hash, now_iso(), until),
        )
        await c.execute(
            "UPDATE promo_campaign_intents SET grant_code=? WHERE token_hash=? AND grant_code IS NULL",
            (code, token_hash),
        )
        row = await (await c.execute(
            "SELECT code,expires_at FROM promo_retention_grants WHERE code=?", (code,)
        )).fetchone()
        return row, None


async def promo_retention_valid(code: str, token: str) -> bool:
    token_hash = _promo_token_hash(token)
    if not token_hash:
        return False
    row = await (await conn().execute(
        "SELECT 1 FROM promo_retention_grants WHERE code=? AND token_hash=? "
        "AND consumed_order_id IS NULL AND datetime(expires_at)>datetime('now')",
        (str(code or "").strip().upper(), token_hash),
    )).fetchone()
    return bool(row)


async def promo_claim_matches(family: str, user_id: int | None,
                              contact: str | None, order_id: int) -> bool:
    contact_key = _promo_contact_key(contact)
    row = await (await conn().execute(
        "SELECT user_id,contact_key FROM promo_first_order_claims "
        "WHERE family=? AND order_id=? LIMIT 1", (family, order_id),
    )).fetchone()
    if not row:
        return False
    return bool((user_id and row["user_id"] == user_id) or
                (contact_key and row["contact_key"] == contact_key))
'''


def _patch_create_function(text: str, signature: str, next_signature: str) -> str:
    start = text.find(signature)
    end = text.find(next_signature, start + len(signature))
    if start < 0 or end < 0:
        raise RuntimeError(f"order function anchor missing: {signature}")
    block = text[start:end]
    anchors = {
        "prepare": "    f = _prepare_order_fields(f)\n",
        "begin": '        await c.execute("BEGIN IMMEDIATE")\n',
        "inserted": "        order_id = int(cur.lastrowid)\n",
    }
    for label, anchor in anchors.items():
        if block.count(anchor) != 1:
            raise RuntimeError(f"{signature} {label} anchor: expected one")
    block = block.replace(
        anchors["prepare"],
        '    promo_claim = f.pop("_promo_claim", None)\n' + anchors["prepare"],
        1,
    )
    block = block.replace(
        anchors["begin"],
        anchors["begin"] + "        await _promo_claim_validate(c, promo_claim)\n",
        1,
    )
    block = block.replace(
        anchors["inserted"],
        anchors["inserted"] +
        "        await _promo_claim_store(c, promo_claim, order_id, ts)\n",
        1,
    )
    return text[:start] + block + text[end:]


def patch_db(text: str) -> str:
    if DB_MARKER in text:
        return text
    required = (
        "CREATE TABLE IF NOT EXISTS quote_drafts(",
        '("family", "TEXT"),',
        "import hashlib\nimport json\n",
        "def _prepare_order_fields(",
        "async def create_order(",
        "async def create_order_bundle(",
    )
    for anchor in required:
        if text.count(anchor) != 1:
            raise RuntimeError(f"db anchor {anchor!r}: expected one, got {text.count(anchor)}")

    text = text.replace(
        "CREATE TABLE IF NOT EXISTS quote_drafts(",
        CAMPAIGN_SCHEMA + "\nCREATE TABLE IF NOT EXISTS quote_drafts(",
        1,
    )
    text = text.replace(
        "import hashlib\nimport json\n",
        "import hashlib\nimport json\nimport re\n",
        1,
    )

    helper_start = text.index("def _prepare_order_fields(")
    helper_end = text.index("\n\n", text.index("    return prepared", helper_start))
    text = text[:helper_end] + DB_HELPERS + text[helper_end:]

    text = _patch_create_function(
        text, "async def create_order(", "async def outbox_due(" if "async def outbox_due(" in text else "async def create_order_bundle("
    )
    text = _patch_create_function(
        text, "async def create_order_bundle(", "async def order_by_client_request(" if "async def order_by_client_request(" in text else "async def promo_add("
    )

    compile(text, "db.py", "exec")
    if text.count(DB_MARKER) != 1:
        raise RuntimeError("db candidate marker drift")
    return text


PROMO_CALC = '''def calc(p, price: int) -> int:
    """Сумма скидки кода для цены (без учёта правил валидности)."""
    if not price or price <= 0:
        return 0
    if p["amount"]:
        return max(0, min(int(p["amount"]), price))
    disc = (price * int(p["pct"] or 0) + 50) // 100
    if p["cap"]:
        disc = min(disc, int(p["cap"]))
    return max(0, min(disc, price))
'''

PROMO_LABEL = '''def label(p) -> str:
    """Человеческая подпись выгоды."""
    if p["amount"]:
        out = f"−{fmt_money(p['amount'])} ₽"
    else:
        out = f"−{p['pct']}%"
        if p["cap"]:
            out += f" (до {fmt_money(p['cap'])} ₽)"
    if (p["min_price"] or 0) > 0:
        out += f" · для заказов от {fmt_money(p['min_price'])} ₽"
    return out
'''


def patch_promo(text: str) -> str:
    if PROMO_MARKER in text:
        return text
    for anchor in ("def calc(", "def label(", "async def apply(", "    disc = calc(p, o[\"price\"])"):
        if text.count(anchor) != 1:
            raise RuntimeError(f"promo anchor {anchor!r}: expected one, got {text.count(anchor)}")

    calc_start = text.index("def calc(")
    label_start = text.index("def label(", calc_start)
    apply_start = text.index("async def apply(", label_start)
    prefix = (
        f'# {PROMO_MARKER}\n'
        f'FIRST_ORDER_FAMILY = "{CAMPAIGN_FAMILY}"\n\n\n'
    )
    text = text[:calc_start] + prefix + PROMO_CALC + "\n" + PROMO_LABEL + text[apply_start:]

    apply_start = text.index("async def apply(")
    bad_start = text.index("    bad = why_invalid(", apply_start)
    disc_start = text.index('    disc = calc(p, o["price"])', bad_start)
    claim_block = '''    claimed_first_order = bool(
        p and p["family"] == FIRST_ORDER_FAMILY and
        await db.promo_claim_matches(
            FIRST_ORDER_FAMILY, o["user_id"], o["guest_contact"], order_id
        )
    )
    bad = why_invalid(p, o["price"]) if p is not None else "not_found"
    # A claim is created only while the campaign/code is live.  Pricing may
    # happen later, so an already accepted first order keeps its promised rate.
    if claimed_first_order and bad == "expired":
        bad = None
    if bad and not (prev > 0 and bad == "used_up"):
        if prev:
            await db.update_order(order_id, promo_discount=0)
            await db.add_event(order_id, "promo_off", f"{code}: {bad}")
        return 0
    if p["family"] == FIRST_ORDER_FAMILY and not claimed_first_order:
        await db.add_event(order_id, "promo_off", f"{code}: first-order claim missing")
        return 0
    if prev == 0 and p["family"] and await db.promo_family_used(
            p["family"], o["user_id"], o["guest_contact"], exclude_order=order_id):
        await db.add_event(order_id, "promo_off",
                           f"{code}: код серии «{p['family']}» уже был применён клиентом")
        return 0
'''
    text = text[:bad_start] + claim_block + text[disc_start:]
    compile(text, "promo.py", "exec")
    if text.count(PROMO_MARKER) != 1 or "promo_claim_matches" not in text:
        raise RuntimeError("promo candidate marker drift")
    return text


WEB_PROMO_BLOCK = f'''# {WEBAPP_MARKER}
PROMO_PRIVATE_HEADERS = {{"Cache-Control": "private, no-store"}}
PROMO_INTENT_COOKIE = "__Host-salon_promo_intent"
RETENTION_GLOBAL_PER_DAY = 40
RETENTION_ISSUE_END = "{RETENTION_ISSUE_END}"
PROMO_KLADOVAYA_ORIGINS = {{"https://studkladovaya.ru", "https://www.studkladovaya.ru"}}
_RETENTION_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def _promo_private(data: dict, status: int = 200) -> web.Response:
    return web.json_response(data, status=status, headers={{**CORS, **PROMO_PRIVATE_HEADERS}})


def _promo_kladovaya_status(request: web.Request, data: dict,
                             status: int = 200) -> web.Response:
    origin = request.headers.get("Origin", "")
    headers = {{"Cache-Control": "public, max-age=30", "Vary": "Origin"}}
    if origin in PROMO_KLADOVAYA_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
    return web.json_response(data, status=status, headers=headers)


def _set_promo_intent_cookie(response: web.StreamResponse, token: str) -> None:
    response.set_cookie(
        PROMO_INTENT_COOKIE, token, max_age=72 * 60 * 60,
        secure=True, httponly=True, samesite="Lax", path="/",
    )


async def _promo_known_guest(request: web.Request) -> bool:
    token = request.cookies.get(GUEST_COOKIE, "")
    return bool(token and await db.guest_session_orders(token))


async def promo_check(request: web.Request) -> web.Response:
    """Validate a code; final entitlement is still claimed with the order."""
    if not _rate_ok(_ip(request), cost=2):
        return _err("rate_limited")
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    code = _clean_promo(b.get("code"))
    if not code:
        return _err("empty")
    p = await db.promo_get(code)
    bad = promo_svc.why_invalid(p) if p is not None else "not_found"
    if not bad and p["family"] == "{CAMPAIGN_FAMILY}":
        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        if ((await db.setting_get("promo_campaign", "off")) != "on" or
                now_utc > "{CAMPAIGN_END_AT}"):
            bad = "off"
        user = await _session_user(request)
        if not bad and user and user["id"] in config.ADMIN_IDS:
            bad = "preview_only"
        elif not bad and user and await db.promo_customer_state(
                user["id"], "{CAMPAIGN_START}") != "eligible":
            bad = "already_used"
        elif not bad and not user and await _promo_known_guest(request):
            bad = "already_used"
        elif not bad and code != "{CAMPAIGN_CODE}" and not await db.promo_retention_valid(
                code, request.cookies.get(PROMO_INTENT_COOKIE, "")):
            bad = "expired"
    elif not bad and p["family"]:
        user = await _session_user(request)
        if user and await db.promo_family_used(p["family"], user["id"], None):
            bad = "already_used"
    if bad:
        return _json({{"ok": False, "error": bad}})
    return _json({{"ok": True, "code": code, "label": promo_svc.label(p),
                  "deal": {{"pct": p["pct"] or 0, "cap": p["cap"] or 0,
                           "amount": p["amount"] or 0,
                           "min_price": p["min_price"] or 0}}}})


async def promo_eligibility(request: web.Request) -> web.Response:
    surface = request.query.get("surface")
    page = request.query.get("page")
    if request.query.get("campaign") != "welcome-v1":
        return _promo_private({{"ok": False, "state": "unknown"}}, 400)
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    campaign_on = (await db.setting_get("promo_campaign", "off")) == "on"
    if surface == "kladovaya":
        if page != "home":
            return _promo_kladovaya_status(
                request, {{"ok": False, "state": "unknown"}}, 400
            )
        active = campaign_on and now_utc <= "{CAMPAIGN_END_AT}"
        return _promo_kladovaya_status(request, {{
            "ok": True, "state": "active" if active else "unknown",
            "campaign_id": "welcome-v1", "expires_at": "{CAMPAIGN_END}",
        }})
    if surface != "salon" or page not in {{"home", "configurator"}}:
        return _promo_private({{"ok": False, "state": "unknown"}}, 400)
    user = await _session_user(request)
    if user and user["id"] in config.ADMIN_IDS:
        state = "owner_preview"
    elif not campaign_on or now_utc > "{CAMPAIGN_END_AT}":
        state = "unknown"
    elif user:
        state = await db.promo_customer_state(user["id"], "{CAMPAIGN_START}")
    elif await _promo_known_guest(request):
        state = "existing"
    else:
        # A cleared/new browser cannot be linked before a contact is supplied.
        # Presentation is provisional; the order transaction scans prior
        # contacts and claims the benefit atomically.
        state = "provisional"
    response = _promo_private({{
        "ok": True, "state": state, "code": "{CAMPAIGN_CODE}",
        "campaign_id": "welcome-v1", "expires_at": "{CAMPAIGN_END}",
        "retention_issue_end": RETENTION_ISSUE_END,
        "preview_only": state == "owner_preview",
    }})
    if request.query.get("page") == "configurator" and state in {{"eligible", "provisional"}}:
        token = request.cookies.get(PROMO_INTENT_COOKIE, "")
        if len(token) < 32:
            token = "pi1_" + secrets.token_urlsafe(32)
        if await db.promo_intent_start(token):
            _set_promo_intent_cookie(response, token)
    return response


async def promo_retention(request: web.Request) -> web.Response:
    if not _rate_ok(_ip(request), cost=3):
        return _err("rate_limited", 429)
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    if ((await db.setting_get("promo_campaign", "off")) != "on" or
            now_utc > RETENTION_ISSUE_END):
        return _err("off")
    try:
        b = await request.json()
        assert isinstance(b, dict)
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    allowed = {{
        "campaign_id": {{"retention-v1"}},
        "stage": {{"contact", "review"}},
        "active_seconds_bucket": {{"under_60", "60_119", "120_plus"}},
        "item_count_bucket": {{"0", "1", "2_3", "4_plus"}},
        "quote_band": {{"under_5k", "5_10k", "10_20k", "20_40k", "40_60k", "60_100k", "100k_plus"}},
    }}
    if set(b) != set(allowed) or any(
            str(b.get(key) or "") not in values for key, values in allowed.items()):
        return _err("bad_payload")
    if (b["stage"] != "contact" or b["active_seconds_bucket"] == "under_60" or
            b["quote_band"] == "under_5k"):
        return _err("not_qualified")
    user = await _session_user(request)
    if user and (user["id"] in config.ADMIN_IDS or
                 await db.promo_customer_state(user["id"], "{CAMPAIGN_START}") != "eligible"):
        return _err("promo_ineligible", 409)
    if not user and await _promo_known_guest(request):
        return _err("promo_ineligible", 409)
    token = request.cookies.get(PROMO_INTENT_COOKIE, "")
    if len(token) < 32:
        return _err("intent_required", 409)
    for _ in range(6):
        code = "AS-R" + "".join(secrets.choice(_RETENTION_ALPHABET) for _ in range(8))
        try:
            grant, error = await db.promo_retention_issue(
                token, code, daily_limit=RETENTION_GLOBAL_PER_DAY
            )
        except sqlite3.IntegrityError:
            continue
        if error:
            return _err(error, 409)
        p = await db.promo_get(grant["code"])
        return _promo_private({{
            "ok": True, "code": grant["code"], "label": promo_svc.label(p),
            "until": grant["expires_at"],
        }})
    return _err("busy", 503)
'''


def patch_webapp(text: str) -> str:
    if WEBAPP_MARKER in text:
        return text
    required = (
        "async def promo_check(",
        "# ------------------------------------------------- код возврата к заявке",
        'r.add_post("/api/promo/check", promo_check)',
        'r.add_post("/api/promo/exit", promo_exit_grant)',
    )
    for anchor in required:
        if text.count(anchor) != 1:
            raise RuntimeError(f"webapp anchor {anchor!r}: expected one, got {text.count(anchor)}")

    promo_start = text.index("async def promo_check(")
    visits_anchor = text.find("\n\n# ------------------------------------------------- визиты", promo_start)
    promo_end = visits_anchor if visits_anchor >= 0 else text.index("\ndef build_app", promo_start)
    text = text[:promo_start] + WEB_PROMO_BLOCK.rstrip() + text[promo_end:]

    router_old = (
        '    r.add_post("/api/promo/check", promo_check)\n'
        '    r.add_post("/api/promo/exit", promo_exit_grant)\n'
    )
    router_new = (
        '    r.add_get("/api/promo/eligibility", promo_eligibility)\n'
        '    r.add_post("/api/promo/check", promo_check)\n'
        '    r.add_post("/api/promo/retention", promo_retention)\n'
    )
    if text.count(router_old) != 1:
        raise RuntimeError("webapp router anchor: expected one")
    text = text.replace(router_old, router_new, 1)

    if "async def orders_create(" in text:
        order_start = text.index("async def orders_create(")
        promo_order_start = text.index("    # промокод:", order_start)
        promo_order_end = text.index("    # подарочный сертификат:", promo_order_start)
        order_promo = f'''    # First-order codes remain provisional until this exact contact/account
    # is validated inside the same transaction that inserts the order.
    promo_state = None
    promo_claim = None
    raw_promo = _clean_promo(b.get("promo"))
    promo_code = None
    if raw_promo:
        p = await db.promo_get(raw_promo)
        bad = promo_svc.why_invalid(p) if p is not None else "not_found"
        if not bad and p["family"] == "{CAMPAIGN_FAMILY}":
            now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
            if ((await db.setting_get("promo_campaign", "off")) != "on" or
                    now_utc > "{CAMPAIGN_END_AT}"):
                bad = "off"
            elif user and (user["id"] in config.ADMIN_IDS or
                         await db.promo_customer_state(user["id"], "{CAMPAIGN_START}") != "eligible"):
                bad = "already_used"
            elif not user and await _promo_known_guest(request):
                bad = "already_used"
            elif raw_promo != "{CAMPAIGN_CODE}" and not await db.promo_retention_valid(
                    raw_promo, request.cookies.get(PROMO_INTENT_COOKIE, "")):
                bad = "expired"
            else:
                promo_claim = {{
                    "family": "{CAMPAIGN_FAMILY}", "code": raw_promo,
                    "user_id": user["id"] if user else None,
                    "contact": guest_contact or None,
                    "contact_key": db._promo_contact_key(guest_contact),
                    "token_hash": db._promo_token_hash(
                        request.cookies.get(PROMO_INTENT_COOKIE, "")
                    ) if raw_promo != "{CAMPAIGN_CODE}" else None,
                }}
        elif not bad and p["family"] and await db.promo_family_used(
                p["family"], user["id"] if user else None, guest_contact or None):
            bad = "already_used"
        if bad:
            promo_state = bad
        else:
            promo_code, promo_state = raw_promo, "ok"

'''
        text = text[:promo_order_start] + order_promo + text[promo_order_end:]

        create_anchor = "        _outbox=OUTBOX_NEW_ORDER,\n"
        create_pos = text.index(create_anchor, order_start)
        text = text[:create_pos] + '        _promo_claim=promo_claim,\n' + text[create_pos:]

        try_anchor = "    try:\n        order_id = await create(cart_items, **create_args) if cart_items else await create(**create_args)\n    except sqlite3.IntegrityError as exc:\n"
        try_replacement = "    try:\n        order_id = await create(cart_items, **create_args) if cart_items else await create(**create_args)\n    except db.PromoEligibilityError:\n        return _err(\"promo_ineligible\", 409)\n    except sqlite3.IntegrityError as exc:\n"
        if text.count(try_anchor) != 1:
            raise RuntimeError("webapp order-create exception anchor: expected one")
        text = text.replace(try_anchor, try_replacement, 1)

    compile(text, "webapp.py", "exec")
    if text.count(WEBAPP_MARKER) != 1:
        raise RuntimeError("webapp candidate marker drift")
    return text


PATCHERS: dict[str, Callable[[str], str]] = {
    "webapp": patch_webapp,
    "db": patch_db,
    "promo": patch_promo,
}


def _paths(root: Path) -> dict[str, Path]:
    return {
        "webapp": root / "app" / "webapp.py",
        "db": root / "app" / "db.py",
        "promo": root / "app" / "services" / "promo.py",
    }


def _pinned(values: dict[str, str]) -> None:
    missing = [name for name, value in values.items() if value.startswith("__")]
    if missing:
        raise RuntimeError(f"post-image hashes are not pinned: {missing}")


def _campaign_db_current(path: Path) -> bool:
    if not path.exists():
        return False
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    try:
        tables = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
        if not {"promo_first_order_claims", "promo_campaign_intents",
                "promo_retention_grants"}.issubset(tables):
            return False
        promo = connection.execute(
            "SELECT pct,cap,min_price,expires_at,family,active "
            "FROM promos WHERE code=?", (CAMPAIGN_CODE,),
        ).fetchone()
        setting = connection.execute(
            "SELECT value FROM settings WHERE key='promo_campaign'"
        ).fetchone()
        return bool(
            promo and tuple(promo) == (2, 2500, 2500, CAMPAIGN_END, CAMPAIGN_FAMILY, 1)
            and setting and setting[0] == "on"
        )
    finally:
        connection.close()


def migrate_campaign_db(path: Path) -> dict:
    before = _campaign_db_current(path)
    connection = sqlite3.connect(path, timeout=20)
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("BEGIN IMMEDIATE")
        columns = {row[1] for row in connection.execute("PRAGMA table_info(promos)")}
        if "family" not in columns:
            connection.execute("ALTER TABLE promos ADD COLUMN family TEXT")
        for statement in CAMPAIGN_SCHEMA.split(";"):
            if statement.strip():
                connection.execute(statement)
        connection.execute(
            "INSERT INTO promos(code,pct,amount,cap,min_price,uses_left,expires_at,"
            " active,note,family,created_at) VALUES(?,2,NULL,2500,2500,NULL,?,1,?,?,?) "
            "ON CONFLICT(code) DO UPDATE SET pct=2,amount=NULL,cap=2500,"
            " min_price=2500,uses_left=NULL,expires_at=excluded.expires_at,active=1,"
            " note=excluded.note,family=excluded.family",
            (CAMPAIGN_CODE, CAMPAIGN_END, "первый заказ · приветственный лист", CAMPAIGN_FAMILY,
             datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")),
        )
        connection.execute(
            "INSERT INTO settings(key,value) VALUES('promo_campaign','on') "
            "ON CONFLICT(key) DO UPDATE SET value='on'"
        )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    return {"ok": True, "changed": not before}


def _atomic_text(path: Path, content: str, expected_current: str) -> None:
    if sha256(path) != expected_current:
        raise RuntimeError(f"source drift before replace: {path}")
    temporary = path.with_name(f".{path.name}.{os.getpid()}.promo.tmp")
    temporary.write_text(content, encoding="utf-8")
    try:
        shutil.copystat(path, temporary)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _sqlite_backup(source: Path, target: Path) -> None:
    source_connection = sqlite3.connect(source)
    target_connection = sqlite3.connect(target)
    try:
        source_connection.backup(target_connection)
    finally:
        target_connection.close()
        source_connection.close()


def disable_campaign_db(path: Path) -> None:
    """Fail closed without replacing a live database or deleting later writes."""
    connection = sqlite3.connect(path, timeout=20)
    try:
        connection.execute("BEGIN IMMEDIATE")
        tables = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
        if "settings" in tables:
            connection.execute(
                "INSERT INTO settings(key,value) VALUES('promo_campaign','off') "
                "ON CONFLICT(key) DO UPDATE SET value='off'"
            )
        if "promos" in tables:
            columns = {row[1] for row in connection.execute("PRAGMA table_info(promos)")}
            if "family" in columns:
                connection.execute(
                    "UPDATE promos SET active=0 WHERE family=?", (CAMPAIGN_FAMILY,)
                )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def install(root: Path, backup_root: Path, *, database: Path | None = None,
            expected_before: dict[str, str] = KNOWN_BEFORE,
            expected_after: dict[str, str] = KNOWN_AFTER,
            now: datetime | None = None) -> dict:
    _pinned(expected_after)
    paths = _paths(root)
    database = database or root / "salon.db"
    current = {name: sha256(path) for name, path in paths.items()}
    if all(current[name] == expected_after[name] for name in paths):
        if not _campaign_db_current(database):
            raise RuntimeError("sources are installed but campaign database is incomplete")
        return {"ok": True, "changed": False, "backup": None}
    if not all(current[name] == expected_before[name] for name in paths):
        raise RuntimeError(f"unknown or mixed source state: {current}")

    candidates = {
        name: PATCHERS[name](path.read_text(encoding="utf-8"))
        for name, path in paths.items()
    }
    candidate_hashes = {name: sha256_text(value) for name, value in candidates.items()}
    if candidate_hashes != expected_after:
        raise RuntimeError(f"candidate hash drift: {candidate_hashes}")

    moment = now or datetime.now(timezone.utc)
    backup = backup_root / f"first-order-promo-{moment.strftime('%Y%m%dT%H%M%S%fZ')}"
    backup.mkdir(parents=True, mode=0o700)
    for name, path in paths.items():
        shutil.copy2(path, backup / path.name)
    _sqlite_backup(database, backup / "salon.db")
    manifest = {
        "kind": "first-order-promo",
        "created_at": moment.isoformat(),
        "before_sha256": expected_before,
        "after_sha256": expected_after,
        "database": str(database),
    }
    (backup / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    installed: list[str] = []
    try:
        for name, path in paths.items():
            _atomic_text(path, candidates[name], expected_before[name])
            if sha256(path) != expected_after[name]:
                raise RuntimeError(f"installed source hash mismatch: {name}")
            installed.append(name)
        migrate_campaign_db(database)
    except Exception:
        disable_campaign_db(database)
        for name in reversed(installed):
            target = paths[name]
            if sha256(target) == expected_after[name]:
                _atomic_text(
                    target, (backup / target.name).read_text(encoding="utf-8"),
                    expected_after[name],
                )
        raise
    return {"ok": True, "changed": True, "backup": str(backup),
            "after_sha256": expected_after}


def rollback(root: Path, backup: Path, *, database: Path | None = None,
             expected_before: dict[str, str] = KNOWN_BEFORE,
             expected_after: dict[str, str] = KNOWN_AFTER) -> dict:
    _pinned(expected_after)
    paths = _paths(root)
    database = database or root / "salon.db"
    for name, path in paths.items():
        if sha256(path) != expected_after[name]:
            raise RuntimeError(f"rollback current hash mismatch: {name}")
        if sha256(backup / path.name) != expected_before[name]:
            raise RuntimeError(f"rollback copy hash mismatch: {name}")
    disable_campaign_db(database)
    for name, path in paths.items():
        _atomic_text(
            path, (backup / path.name).read_text(encoding="utf-8"), expected_after[name]
        )
    return {"ok": True, "rolled_back": True, "sha256": expected_before,
            "database": "preserved", "campaign": "off"}


def check_install(root: Path, *, database: Path | None = None,
                  expected_before: dict[str, str] = KNOWN_BEFORE,
                  expected_after: dict[str, str] = KNOWN_AFTER) -> dict:
    """Verify one exact source state and the database contract without writes."""
    _pinned(expected_after)
    paths = _paths(root)
    database = database or root / "salon.db"
    current = {name: sha256(path) for name, path in paths.items()}
    if all(current[name] == expected_after[name] for name in paths):
        if not _campaign_db_current(database):
            raise RuntimeError("sources are installed but campaign database is incomplete")
        return {"ok": True, "changed": False, "source_state": "installed",
                "database_current": True, "sha256": current}
    if not all(current[name] == expected_before[name] for name in paths):
        raise RuntimeError(f"unknown or mixed source state: {current}")
    candidates = {
        name: PATCHERS[name](path.read_text(encoding="utf-8"))
        for name, path in paths.items()
    }
    candidate_hashes = {name: sha256_text(value) for name, value in candidates.items()}
    if candidate_hashes != expected_after:
        raise RuntimeError(f"candidate hash drift: {candidate_hashes}")
    return {"ok": True, "changed": True, "source_state": "ready",
            "database_current": False, "before_sha256": current,
            "after_sha256": candidate_hashes}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("/root/salon_bot"))
    parser.add_argument("--database", type=Path)
    parser.add_argument("--backup-root", type=Path, default=Path("/root/salon_bot/backups"))
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--check", action="store_true")
    action.add_argument("--apply", action="store_true")
    action.add_argument("--rollback", type=Path)
    args = parser.parse_args()
    if args.rollback:
        result = rollback(args.root, args.rollback, database=args.database)
    elif args.apply:
        result = install(args.root, args.backup_root, database=args.database)
    else:
        result = check_install(args.root, database=args.database)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
