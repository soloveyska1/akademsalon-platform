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
import time
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

WELCOME_PCT = 12
WELCOME_CAP = 5000
WELCOME_MIN_PRICE = 2500
RETENTION_PCT = 10
RETENTION_CAP = 2500
RETENTION_MIN_PRICE = 5000

WEBAPP_MARKER = "first-order-promo-web:20260824"
DB_MARKER = "first-order-promo-db:20260824"
PROMO_MARKER = "first-order-promo-service:20260824"
ECONOMICS_MARKER = "first-order-promo-economics:20260824-v2"
ECONOMICS_SUSPENDED_PREFIX = "upgrading:20260824-v2"
AGGREGATE_WEB_MARKER = "first-order-promo-aggregate-web:20260824-v2"
AGGREGATE_PROMO_MARKER = "first-order-promo-aggregate-service:20260824-v2"
AGGREGATE_BONUS_MARKER = "first-order-promo-aggregate-bonus:20260824-v2"
AGGREGATE_ORDERS_MARKER = "first-order-promo-aggregate-orders:20260824-v2"
AGGREGATE_SUBS_MARKER = "first-order-promo-aggregate-subs:20260824-v2"

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

# Production already contains KNOWN_AFTER from the reviewed v1 launch.  The
# economics upgrade raises the two rates and adds one shared aggregate-benefit
# guard across the API, promo, bonus and order-choice paths.
ECONOMICS_KNOWN_BEFORE = {
    **KNOWN_AFTER,
    "bonus": "b94f7371819f99f3af1f337eb76b346ab59b04a30ab488eebc8f6463846658a7",
    "my_orders": "8911432b940857a2d91e2bdd68c0961b0f1cc262782877e29ad16ddca4318938",
    "subs": "caa4b3129abda8d8b2f27f07cad4d91bd70fba825a83e895399763496747cefb",
}
ECONOMICS_KNOWN_AFTER = {
    "webapp": "346a41ea05dd428f3c02c6566ffdc9407e5f0de618624b43e0735fe19ec8f735",
    "db": "46d34c7dbcd47c65458738b1a0ebac7086515d5abfc2d298e3ff362cc150c776",
    "promo": "b10967c095969099e8ecfbb5679e2e3db8d8993bd5ba9e76b74d32c508c8a00c",
    "bonus": "fff5f7cd61292bc6d76a76e9d5c4e38c0c58b58724566fb29ffb6ef9eb5e24d1",
    "my_orders": "d099f69c8fc9d1f03d991a5eaa13dcfd4a5553275d6a58f2e44715b7484b8209",
    "subs": "1a50d9c926f3e72bbb505a3c55eff9a2e9fc5ed216f5aad2d81d0953096fe123",
}
ECONOMICS_SAFE_ROLLBACK = {
    **ECONOMICS_KNOWN_AFTER,
    # The v2 DB helper is a runtime dependency of the aggregate promo guard.
    # Safe rollback therefore closes the campaign but keeps the coherent v2
    # source set and all already-promised rows intact.
}


def _economics_safe_rollback(
        expected_before: dict[str, str],
        expected_after: dict[str, str]) -> dict[str, str]:
    """Fail closed without creating an incompatible mixed runtime image."""
    del expected_before
    return dict(expected_after)


def _economics_sentinel(transition_id: str) -> str:
    if (len(transition_id) != 64 or
            any(ch not in "0123456789abcdef" for ch in transition_id)):
        raise RuntimeError("invalid economics transition id")
    return f"{ECONOMICS_SUSPENDED_PREFIX}:{transition_id}"


def _economics_transition(value: str | None) -> str | None:
    prefix = ECONOMICS_SUSPENDED_PREFIX + ":"
    if not isinstance(value, str) or not value.startswith(prefix):
        return None
    transition_id = value[len(prefix):]
    try:
        _economics_sentinel(transition_id)
    except RuntimeError:
        return None
    return transition_id

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
        pct, cap, minimum = WELCOME_PCT, WELCOME_CAP, WELCOME_MIN_PRICE
    elif kind == "retention":
        pct, cap, minimum = RETENTION_PCT, RETENTION_CAP, RETENTION_MIN_PRICE
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


DB_ECONOMICS_HELPERS = '''
async def promo_bonus_reconcile(
        order_id: int, code: str, promo_allowed: bool = True) -> dict:
    """Reprice promo, choose best-of and reconcile points in one transaction."""
    code = str(code or "").strip().upper()
    async with transaction() as c:
        row = await (await c.execute(
            "SELECT id,user_id,price,bonus_spent,promo_code,"
            "promo_discount,sub_discount "
            "FROM orders WHERE id=?",
            (order_id,),
        )).fetchone()
        promo_row = await (await c.execute(
            "SELECT pct,amount,cap,min_price,uses_left,family "
            "FROM promos WHERE code=?",
            (code,),
        )).fetchone()
        if not row:
            return {"promo_discount": 0, "bonus_returned": 0,
                    "first_application": False, "error": "promo_order_missing"}
        price = max(0, int(row["price"] or 0))
        candidate = 0
        if (promo_allowed and promo_row and
                price >= max(0, int(promo_row["min_price"] or 0))):
            if promo_row["amount"]:
                candidate = int(promo_row["amount"])
            else:
                candidate = (price * int(promo_row["pct"] or 0) + 50) // 100
            if promo_row["cap"]:
                candidate = min(candidate, int(promo_row["cap"]))
            candidate = max(0, min(candidate, price))
        spent = max(0, int(row["bonus_spent"] or 0))
        previous_promo = max(0, int(row["promo_discount"] or 0))
        previous_sub = max(0, int(row["sub_discount"] or 0))
        if previous_sub >= candidate:
            promo = 0
            new_sub = previous_sub
        else:
            promo = candidate
            new_sub = 0
        first_application = previous_promo == 0 and promo > 0
        if first_application and promo_row["uses_left"] is not None:
            if int(promo_row["uses_left"] or 0) <= 0:
                # A finite first-order code may be repriced below its threshold
                # and later back above it.  Only its exact already-claimed order
                # may restore that promise without consuming a second use.
                exact_claim = None
                if promo_row["family"]:
                    exact_claim = await (await c.execute(
                        "SELECT 1 FROM promo_first_order_claims "
                        "WHERE family=? AND code=? AND order_id=? LIMIT 1",
                        (promo_row["family"], code, order_id),
                    )).fetchone()
                if not exact_claim:
                    return {"promo_discount": 0, "bonus_returned": 0,
                            "first_application": False,
                            "error": "promo_used_up"}
            else:
                changed_use = await c.execute(
                    "UPDATE promos SET uses_left=uses_left-1 "
                    "WHERE code=? AND uses_left>0",
                    (code,),
                )
                if changed_use.rowcount != 1:
                    return {"promo_discount": 0, "bonus_returned": 0,
                            "first_application": False,
                            "error": "promo_used_up"}
        allowed = min(
            spent,
            price * 20 // 100,
            max(price * 25 // 100 - max(promo, new_sub), 0),
        )
        excess = max(spent - allowed, 0)
        changed_promo = previous_promo != promo
        changed_sub = previous_sub != new_sub
        if excess > 0 and not row["user_id"]:
            raise RuntimeError("bonus reconciliation owner missing")
        now = now_iso()
        if excess > 0:
            expires = (datetime.now(timezone.utc) + timedelta(days=30)).strftime(
                "%Y-%m-%dT%H:%M:%S"
            )
            await c.execute(
                "INSERT INTO bonus_ledger"
                "(user_id,delta,kind,note,order_id,expires_at,created_at) "
                "VALUES(?,?,'restore',?,?,?,?)",
                (
                    row["user_id"], excess,
                    f"корректировка общего лимита · заказ {order_id}",
                    order_id, expires, now,
                ),
            )
        changed = await c.execute(
            "UPDATE orders SET promo_discount=?,sub_discount=?,"
            "bonus_spent=?,updated_at=? WHERE id=? "
            "AND COALESCE(promo_discount,0)=? AND COALESCE(sub_discount,0)=? "
            "AND COALESCE(bonus_spent,0)=?",
            (
                promo, new_sub, allowed, now, order_id,
                previous_promo, previous_sub, spent,
            ),
        )
        if changed.rowcount != 1:
            raise RuntimeError("promo/bonus reconciliation race")
        if excess > 0:
            await c.execute(
                "INSERT INTO order_events(order_id,kind,data,created_at) "
                "VALUES(?,'bonus_reconciled',?,?)",
                (
                    order_id,
                    f"возвращено {excess}; промокод + бонусы не более 25%",
                    now,
                ),
            )
        if changed_sub and previous_sub > 0:
            await c.execute(
                "INSERT INTO order_events(order_id,kind,data,created_at) "
                "VALUES(?,'sub_discount',?,?)",
                (order_id, f"снята: промокод {code} выгоднее", now),
            )
        if changed_promo:
            event_kind = "promo_applied" if promo > 0 else "promo_off"
            event_data = (
                f"{code}: −{promo} ₽" if promo > 0
                else f"{code}: снят после перерасчёта"
            )
            await c.execute(
                "INSERT INTO order_events(order_id,kind,data,created_at) "
                "VALUES(?,?,?,?)",
                (order_id, event_kind, event_data, now),
            )
        return {
            "promo_discount": promo,
            "bonus_returned": excess,
            "first_application": first_application,
            "error": "",
        }


async def subscription_discount_reconcile(
        order_id: int, discount_pct: int, discount_cap: int | None,
        subscription_label: str, bonus_spend_pct: int) -> dict:
    """Apply late subscription best-of without stacking it with a promo."""
    async with transaction() as c:
        row = await (await c.execute(
            "SELECT id,user_id,price,bonus_spent,promo_code,"
            "promo_discount,sub_discount "
            "FROM orders WHERE id=?",
            (order_id,),
        )).fetchone()
        if not row:
            return {"sub_discount": 0, "promo_discount": 0,
                    "bonus_returned": 0, "error": "discount_order_missing"}
        paid = await (await c.execute(
            "SELECT 1 FROM payments WHERE order_id=? AND status='paid' LIMIT 1",
            (order_id,),
        )).fetchone()
        if paid:
            return {
                "sub_discount": int(row["sub_discount"] or 0),
                "promo_discount": int(row["promo_discount"] or 0),
                "bonus_returned": 0, "error": "discount_after_payment",
            }
        price = max(0, int(row["price"] or 0))
        candidate = price * max(0, int(discount_pct or 0)) // 100
        if discount_cap:
            candidate = min(candidate, max(0, int(discount_cap)))
        candidate = max(0, min(candidate, price))
        previous_promo = max(0, int(row["promo_discount"] or 0))
        previous_sub = max(0, int(row["sub_discount"] or 0))
        promo_candidate = 0
        promo_row = None
        exact_claim = None
        promo_code = str(row["promo_code"] or "").strip().upper()
        if promo_code:
            promo_row = await (await c.execute(
                "SELECT pct,amount,cap,min_price,uses_left,expires_at,"
                "active,family FROM promos WHERE code=?",
                (promo_code,),
            )).fetchone()
            if promo_row and promo_row["family"]:
                exact_claim = await (await c.execute(
                    "SELECT 1 FROM promo_first_order_claims "
                    "WHERE family=? AND code=? AND order_id=? LIMIT 1",
                    (promo_row["family"], promo_code, order_id),
                )).fetchone()
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            currently_valid = bool(
                promo_row and promo_row["active"] and
                (not promo_row["expires_at"] or
                 str(promo_row["expires_at"]) >= today)
            )
            may_reprice = bool(exact_claim or (
                previous_promo > 0 and currently_valid
            ))
            if (may_reprice and
                    price >= max(0, int(promo_row["min_price"] or 0))):
                if promo_row["amount"]:
                    promo_candidate = int(promo_row["amount"])
                else:
                    promo_candidate = (
                        price * int(promo_row["pct"] or 0) + 50
                    ) // 100
                if promo_row["cap"]:
                    promo_candidate = min(
                        promo_candidate, int(promo_row["cap"])
                    )
                promo_candidate = max(0, min(promo_candidate, price))
        if promo_candidate >= candidate:
            promo = promo_candidate
            sub = 0
        else:
            promo = 0
            sub = candidate
        if (promo > 0 and previous_promo == 0 and
                promo_row["uses_left"] is not None and
                int(promo_row["uses_left"] or 0) > 0):
            changed_use = await c.execute(
                "UPDATE promos SET uses_left=uses_left-1 "
                "WHERE code=? AND uses_left>0",
                (promo_code,),
            )
            if changed_use.rowcount != 1:
                raise RuntimeError("subscription promo use race")
        spent = max(0, int(row["bonus_spent"] or 0))
        allowed = min(
            spent,
            price * max(0, min(int(bonus_spend_pct or 0), 100)) // 100,
            max(price * 25 // 100 - max(promo, sub), 0),
        )
        excess = max(spent - allowed, 0)
        if excess > 0 and not row["user_id"]:
            raise RuntimeError("subscription bonus reconciliation owner missing")
        now = now_iso()
        if excess > 0:
            expires = (datetime.now(timezone.utc) + timedelta(days=30)).strftime(
                "%Y-%m-%dT%H:%M:%S"
            )
            await c.execute(
                "INSERT INTO bonus_ledger"
                "(user_id,delta,kind,note,order_id,expires_at,created_at) "
                "VALUES(?,?,'restore',?,?,?,?)",
                (
                    row["user_id"], excess,
                    f"корректировка общего лимита · заказ {order_id}",
                    order_id, expires, now,
                ),
            )
        changed = await c.execute(
            "UPDATE orders SET promo_discount=?,sub_discount=?,"
            "bonus_spent=?,updated_at=? WHERE id=? "
            "AND COALESCE(promo_discount,0)=? AND COALESCE(sub_discount,0)=? "
            "AND COALESCE(bonus_spent,0)=?",
            (
                promo, sub, allowed, now, order_id,
                previous_promo, previous_sub, spent,
            ),
        )
        if changed.rowcount != 1:
            raise RuntimeError("subscription reconciliation race")
        if excess > 0:
            await c.execute(
                "INSERT INTO order_events(order_id,kind,data,created_at) "
                "VALUES(?,'bonus_reconciled',?,?)",
                (
                    order_id,
                    f"возвращено {excess}; подписка/промокод + бонусы не более 25%",
                    now,
                ),
            )
        if previous_promo != promo:
            promo_kind = "promo_applied" if promo > 0 else "promo_off"
            promo_data = (
                f"{promo_code}: −{promo} ₽" if promo > 0
                else "подписка выгоднее"
            )
            await c.execute(
                "INSERT INTO order_events(order_id,kind,data,created_at) "
                "VALUES(?,?,?,?)",
                (order_id, promo_kind, promo_data, now),
            )
        if previous_sub != sub:
            await c.execute(
                "INSERT INTO order_events(order_id,kind,data,created_at) "
                "VALUES(?,'sub_discount',?,?)",
                (
                    order_id,
                    f"−{sub} ₽ ({subscription_label}, {discount_pct}%)",
                    now,
                ),
            )
        return {
            "sub_discount": sub, "promo_discount": promo,
            "bonus_returned": excess, "error": "",
        }


async def bonus_apply_with_aggregate_cap(
        user_id: int, order_id: int, requested: int, note: str,
        min_order: int, spend_pct: int) -> dict:
    """Consume points and write order state under the same aggregate-cap lock."""
    async with transaction() as c:
        order = await (await c.execute(
            "SELECT id,user_id,status,work_type,price,bonus_spent,"
            "sub_discount,promo_discount FROM orders WHERE id=?",
            (order_id,),
        )).fetchone()
        if not order or int(order["user_id"] or 0) != int(user_id):
            return {"spent": 0, "error": "bonus_order_missing"}
        if (order["work_type"] or "").startswith("sub_"):
            return {"spent": 0, "error": "bonus_not_for_subs"}
        if order["status"] not in ("priced", "prepay"):
            return {"spent": 0, "error": "bonus_stage"}
        paid = await (await c.execute(
            "SELECT 1 FROM payments WHERE order_id=? AND status='paid' LIMIT 1",
            (order_id,),
        )).fetchone()
        if paid:
            return {"spent": 0, "error": "bonus_after_payment"}
        if int(order["bonus_spent"] or 0) > 0:
            return {"spent": 0, "error": "bonus_once"}
        price = max(0, int(order["price"] or 0))
        minimum = max(0, int(min_order or 0))
        percentage = max(0, min(int(spend_pct or 0), 100))
        if price < minimum:
            return {"spent": 0, "error": "bonus_order_small"}
        applied_discount = max(
            int(order["sub_discount"] or 0),
            int(order["promo_discount"] or 0),
        )
        cap = min(
            price * percentage // 100,
            max(price * 25 // 100 - applied_discount, 0),
        )
        amount = max(0, min(int(requested or 0), cap))
        if amount <= 0:
            return {"spent": 0, "error": "bonus_cap"}
        rows = await (await c.execute(
            "SELECT id,delta,consumed FROM bonus_ledger "
            "WHERE user_id=? AND delta>0 AND consumed<delta "
            "AND (expires_at IS NULL OR expires_at>?) "
            "ORDER BY (expires_at IS NULL),expires_at,id",
            (user_id, now_iso()),
        )).fetchall()
        amount = min(amount, sum(
            int(row["delta"] or 0) - int(row["consumed"] or 0)
            for row in rows
        ))
        if amount <= 0:
            return {"spent": 0, "error": "bonus_empty"}
        left = amount
        for row in rows:
            if left <= 0:
                break
            available = int(row["delta"] or 0) - int(row["consumed"] or 0)
            take = min(available, left)
            changed = await c.execute(
                "UPDATE bonus_ledger SET consumed=consumed+? "
                "WHERE id=? AND consumed=?",
                (take, row["id"], row["consumed"]),
            )
            if changed.rowcount != 1:
                raise RuntimeError("bonus accrual reconciliation race")
            left -= take
        spent = amount - left
        now = now_iso()
        await c.execute(
            "INSERT INTO bonus_ledger"
            "(user_id,delta,kind,note,order_id,expires_at,created_at) "
            "VALUES(?,?,'spend',?,?,NULL,?)",
            (user_id, -spent, str(note or "")[:300] or None, order_id, now),
        )
        changed = await c.execute(
            "UPDATE orders SET bonus_spent=?,updated_at=? "
            "WHERE id=? AND COALESCE(bonus_spent,0)=0",
            (spent, now, order_id),
        )
        if changed.rowcount != 1:
            raise RuntimeError("bonus order reconciliation race")
        await c.execute(
            "INSERT INTO order_events(order_id,kind,data,created_at) "
            "VALUES(?,'bonus_spent',?,?)",
            (order_id, f"{spent} бонусов", now),
        )
        return {"spent": spent, "error": ""}
'''.strip()


def patch_db_economics_v2(text: str) -> str:
    """Upgrade the installed v1 retention issuer without changing its identity."""
    if ECONOMICS_MARKER in text:
        return text
    if text.count(DB_MARKER) != 1:
        raise RuntimeError("economics upgrade requires the exact v1 db marker")
    claim_signature = (
        "async def promo_claim_matches(family: str, user_id: int | None,\n"
        "                              contact: str | None, order_id: int) -> bool:\n"
    )
    claim_signature_exact = (
        "async def promo_claim_matches(family: str, user_id: int | None,\n"
        "                              contact: str | None, order_id: int,\n"
        "                              code: str | None = None) -> bool:\n"
        "    code = str(code or \"\").strip().upper() or None\n"
    )
    claim_query = (
        '        "WHERE family=? AND order_id=? LIMIT 1", (family, order_id),\n'
    )
    claim_query_exact = (
        '        "WHERE family=? AND order_id=? AND (? IS NULL OR code=?) LIMIT 1",\n'
        '        (family, order_id, code, code),\n'
    )
    for label, anchor in (
        ("claim signature", claim_signature), ("claim query", claim_query),
    ):
        if text.count(anchor) != 1:
            raise RuntimeError(
                f"economics {label} anchor: expected one, got {text.count(anchor)}"
            )
    text = text.replace(claim_signature, claim_signature_exact, 1)
    text = text.replace(claim_query, claim_query_exact, 1)
    old = (
        '"active,note,family,created_at) '
        'VALUES(?,1,NULL,1000,5000,1,?,1,?,?,?)",'
    )
    new = (
        f'"active,note,family,created_at) VALUES(?,{RETENTION_PCT},NULL,'
        f'{RETENTION_CAP},{RETENTION_MIN_PRICE},1,?,1,?,?,?)",'
    )
    if text.count(old) != 1:
        raise RuntimeError(
            f"retention economics anchor: expected one, got {text.count(old)}"
        )
    text = text.replace(old, new, 1)
    text = text.replace(
        f"# {DB_MARKER}\n",
        f"# {DB_MARKER}\n# {ECONOMICS_MARKER}\n"
        + DB_ECONOMICS_HELPERS + "\n\n\n",
        1,
    )
    compile(text, "db.py", "exec")
    if text.count(ECONOMICS_MARKER) != 1:
        raise RuntimeError("economics candidate marker drift")
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

PROMO_WHY_INVALID = '''def why_invalid(p, price: int | None = None) -> str | None:
    """None means the code is currently valid; otherwise return a safe reason."""
    if p is None:
        return "not_found"
    if not p["active"]:
        return "inactive"
    if p["uses_left"] is not None and p["uses_left"] <= 0:
        return "used_up"
    if p["expires_at"]:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if str(p["expires_at"]) < today:
            return "expired"
    if (price is not None and (p["min_price"] or 0) > 0 and
            price < p["min_price"]):
        return "min_price"
    return None
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


def _economics_paths(root: Path) -> dict[str, Path]:
    paths = _paths(root)
    paths.update({
        "bonus": root / "app" / "services" / "bonus.py",
        "my_orders": root / "app" / "handlers" / "my_orders.py",
        "subs": root / "app" / "services" / "subs.py",
    })
    return paths


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


def _campaign_economics_db_current(
        path: Path, *, allow_suspended: bool = False) -> bool:
    """Check economics only; the operational on/off state is intentionally free."""
    if not path.exists():
        return False
    connection = sqlite3.connect(path)
    try:
        tables = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
        required = {"promos", "settings", "promo_retention_grants"}
        if not required.issubset(tables):
            return False
        welcome = connection.execute(
            "SELECT pct,amount,cap,min_price,expires_at,family FROM promos WHERE code=?",
            (CAMPAIGN_CODE,),
        ).fetchone()
        setting = connection.execute(
            "SELECT value FROM settings WHERE key='promo_campaign'"
        ).fetchone()
        bad_retention = connection.execute(
            "SELECT COUNT(*) FROM promo_retention_grants g "
            "LEFT JOIN promos p ON p.code=g.code "
            "WHERE p.code IS NULL OR COALESCE(p.family,'')<>? "
            "OR COALESCE(p.pct,-1)<>? OR p.amount IS NOT NULL "
            "OR COALESCE(p.cap,-1)<>? OR COALESCE(p.min_price,-1)<>?",
            (CAMPAIGN_FAMILY, RETENTION_PCT, RETENTION_CAP, RETENTION_MIN_PRICE),
        ).fetchone()[0]
        return bool(
            welcome == (
                WELCOME_PCT, None, WELCOME_CAP, WELCOME_MIN_PRICE,
                CAMPAIGN_END, CAMPAIGN_FAMILY,
            )
            and setting and (
                setting[0] in {"on", "off"}
                or (allow_suspended and _economics_transition(setting[0]) is not None)
            )
            and bad_retention == 0
        )
    finally:
        connection.close()


def _suspend_campaign_with_snapshot(
        path: Path, *, transition_id: str | None = None) -> dict:
    """Atomically snapshot the live switch/rows and fail the campaign closed."""
    transition_id = transition_id or hashlib.sha256(os.urandom(32)).hexdigest()
    suspended_value = _economics_sentinel(transition_id)
    suspended_at_ns = time.time_ns()
    connection = sqlite3.connect(path, timeout=20)
    try:
        connection.execute("BEGIN IMMEDIATE")
        setting = connection.execute(
            "SELECT value FROM settings WHERE key='promo_campaign'"
        ).fetchone()
        if not setting or setting[0] not in {"on", "off"}:
            raise RuntimeError("campaign switch is missing or invalid")
        actives = connection.execute(
            "SELECT code,active FROM promos WHERE family=? ORDER BY code",
            (CAMPAIGN_FAMILY,),
        ).fetchall()
        retention_count = connection.execute(
            "SELECT COUNT(*) FROM promo_retention_grants"
        ).fetchone()[0]
        snapshot = {
            "setting": setting[0],
            "actives": [(row[0], int(row[1] or 0)) for row in actives],
            "retention_count": int(retention_count),
            "transition_id": transition_id,
            "suspended_value": suspended_value,
            "suspended_at_ns": suspended_at_ns,
            "staged_at_ns": None,
        }
        connection.execute(
            "UPDATE settings SET value=? WHERE key='promo_campaign'",
            (suspended_value,),
        )
        connection.execute(
            "UPDATE promos SET active=0 WHERE family=?", (CAMPAIGN_FAMILY,)
        )
        connection.commit()
        return snapshot
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _assert_suspended_snapshot(connection: sqlite3.Connection, snapshot: dict) -> None:
    setting = connection.execute(
        "SELECT value FROM settings WHERE key='promo_campaign'"
    ).fetchone()
    if not setting or setting[0] != snapshot["suspended_value"]:
        raise RuntimeError("economics transition backup does not match live sentinel")
    current = connection.execute(
        "SELECT code,active FROM promos WHERE family=? ORDER BY code",
        (CAMPAIGN_FAMILY,),
    ).fetchall()
    expected = [(code, 0) for code, _active in snapshot["actives"]]
    if current != expected:
        raise RuntimeError("campaign family rows changed during economics upgrade")
    retention_count = connection.execute(
        "SELECT COUNT(*) FROM promo_retention_grants"
    ).fetchone()[0]
    if int(retention_count) != snapshot["retention_count"]:
        raise RuntimeError("retention grants changed during economics upgrade")


def _restore_campaign_state(path: Path, snapshot: dict) -> None:
    connection = sqlite3.connect(path, timeout=20)
    try:
        connection.execute("BEGIN IMMEDIATE")
        _assert_suspended_snapshot(connection, snapshot)
        for code, active in snapshot["actives"]:
            changed = connection.execute(
                "UPDATE promos SET active=? WHERE code=? AND family=?",
                (active, code, CAMPAIGN_FAMILY),
            ).rowcount
            if changed != 1:
                raise RuntimeError("campaign row compare-and-swap failed")
        updated = connection.execute(
            "UPDATE settings SET value=? WHERE key='promo_campaign' AND value=?",
            (snapshot["setting"], snapshot["suspended_value"]),
        ).rowcount
        if updated != 1:
            raise RuntimeError("campaign switch compare-and-swap failed")
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _campaign_setting_value(path: Path) -> str | None:
    connection = sqlite3.connect(path)
    try:
        row = connection.execute(
            "SELECT value FROM settings WHERE key='promo_campaign'"
        ).fetchone()
        return str(row[0]) if row else None
    finally:
        connection.close()


def _open_discount_anomalies(path: Path) -> dict[str, int]:
    """Count only unsafe open-order states; never expose client/order rows."""
    connection = sqlite3.connect(path)
    try:
        common = (
            " FROM orders o WHERE o.status IN ('new','priced','prepay') "
            "AND COALESCE(o.price,0)>0 AND NOT EXISTS "
            "(SELECT 1 FROM payments p WHERE p.order_id=o.id "
            "AND p.status='paid') AND "
        )
        stacked = connection.execute(
            "SELECT COUNT(*)" + common +
            "COALESCE(o.sub_discount,0)>0 AND COALESCE(o.promo_discount,0)>0"
        ).fetchone()[0]
        over_cap = connection.execute(
            "SELECT COUNT(*)" + common +
            "COALESCE(o.bonus_spent,0)+COALESCE(o.sub_discount,0)+"
            "COALESCE(o.promo_discount,0)>o.price*25/100"
        ).fetchone()[0]
        return {"stacked_open": int(stacked), "over_cap_open": int(over_cap)}
    finally:
        connection.close()


def _assert_no_open_discount_anomalies(path: Path) -> dict[str, int]:
    counts = _open_discount_anomalies(path)
    if any(counts.values()):
        raise RuntimeError(f"open-order discount preflight failed: {counts}")
    return counts


def _write_campaign_state(backup: Path, snapshot: dict) -> None:
    target = backup / "campaign-state.json"
    temporary = backup / f".campaign-state.{os.getpid()}.tmp"
    try:
        temporary.write_text(
            json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8",
        )
        os.chmod(temporary, 0o600)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def _write_campaign_manifest(backup: Path, manifest: dict) -> None:
    target = backup / "manifest.json"
    temporary = backup / f".manifest.{os.getpid()}.tmp"
    try:
        temporary.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        os.chmod(temporary, 0o600)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def _read_campaign_state(backup: Path) -> dict:
    raw = json.loads((backup / "campaign-state.json").read_text(encoding="utf-8"))
    expected_keys = {
        "setting", "actives", "retention_count", "transition_id",
        "suspended_value", "suspended_at_ns", "staged_at_ns",
    }
    if set(raw) != expected_keys:
        raise RuntimeError("campaign state backup shape mismatch")
    if raw["setting"] not in {"on", "off"} or not isinstance(raw["actives"], list):
        raise RuntimeError("campaign state backup value mismatch")
    actives: list[tuple[str, int]] = []
    seen: set[str] = set()
    for row in raw["actives"]:
        if (not isinstance(row, list) or len(row) != 2 or
                not isinstance(row[0], str) or row[1] not in {0, 1} or
                row[0] in seen):
            raise RuntimeError("campaign active-row backup mismatch")
        seen.add(row[0])
        actives.append((row[0], row[1]))
    if raw["suspended_value"] != _economics_sentinel(raw["transition_id"]):
        raise RuntimeError("campaign transition binding mismatch")
    if (not isinstance(raw["retention_count"], int) or
            raw["retention_count"] < 0 or
            not isinstance(raw["suspended_at_ns"], int) or
            raw["suspended_at_ns"] <= 0 or
            (raw["staged_at_ns"] is not None and
             (not isinstance(raw["staged_at_ns"], int) or
              raw["staged_at_ns"] < raw["suspended_at_ns"]))):
        raise RuntimeError("campaign transition timestamp mismatch")
    return {
        "setting": raw["setting"], "actives": actives,
        "retention_count": raw["retention_count"],
        "transition_id": raw["transition_id"],
        "suspended_value": raw["suspended_value"],
        "suspended_at_ns": raw["suspended_at_ns"],
        "staged_at_ns": raw["staged_at_ns"],
    }


def _find_transition_backup(backup_root: Path, transition_id: str) -> Path:
    matches: list[Path] = []
    if backup_root.is_dir():
        for candidate in backup_root.iterdir():
            if not candidate.is_dir():
                continue
            try:
                state = _read_campaign_state(candidate)
            except (OSError, ValueError, RuntimeError):
                continue
            if state["transition_id"] == transition_id:
                matches.append(candidate)
    if len(matches) != 1:
        raise RuntimeError(
            f"expected one backup for economics transition, found {len(matches)}"
        )
    return matches[0]


def close_campaign_new_claims(path: Path) -> None:
    """Close presentation/issuance/claims without invalidating promised rows."""
    connection = sqlite3.connect(path, timeout=20)
    try:
        connection.execute("BEGIN IMMEDIATE")
        connection.execute(
            "INSERT INTO settings(key,value) VALUES('promo_campaign','off') "
            "ON CONFLICT(key) DO UPDATE SET value='off'"
        )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _fail_closed_preserving_promises(path: Path, snapshot: dict) -> None:
    connection = sqlite3.connect(path, timeout=20)
    try:
        connection.execute("BEGIN IMMEDIATE")
        _assert_suspended_snapshot(connection, snapshot)
        for code, active in snapshot["actives"]:
            changed = connection.execute(
                "UPDATE promos SET active=? WHERE code=? AND family=?",
                (active, code, CAMPAIGN_FAMILY),
            ).rowcount
            if changed != 1:
                raise RuntimeError("campaign promise restoration failed")
        connection.execute(
            "INSERT INTO settings(key,value) VALUES('promo_campaign','off') "
            "ON CONFLICT(key) DO UPDATE SET value='off'"
        )
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def migrate_campaign_economics(path: Path) -> dict:
    """Raise v1 rates in place while preserving claims, grants and order prices."""
    before = _campaign_economics_db_current(path)
    connection = sqlite3.connect(path, timeout=20)
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("BEGIN IMMEDIATE")
        tables = {row[0] for row in connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
        if not {"promos", "settings", "promo_retention_grants"}.issubset(tables):
            raise RuntimeError("base campaign database is incomplete")
        welcome = connection.execute(
            "SELECT pct,amount,cap,min_price,expires_at,family FROM promos WHERE code=?",
            (CAMPAIGN_CODE,),
        ).fetchone()
        allowed_welcome = {
            (2, None, 2500, 2500, CAMPAIGN_END, CAMPAIGN_FAMILY),
            (
                WELCOME_PCT, None, WELCOME_CAP, WELCOME_MIN_PRICE,
                CAMPAIGN_END, CAMPAIGN_FAMILY,
            ),
        }
        if welcome not in allowed_welcome:
            raise RuntimeError("welcome campaign row drift")
        bad_retention = connection.execute(
            "SELECT COUNT(*) FROM promo_retention_grants g "
            "LEFT JOIN promos p ON p.code=g.code "
            "WHERE p.code IS NULL OR COALESCE(p.family,'')<>? OR p.amount IS NOT NULL "
            "OR (COALESCE(p.pct,-1),COALESCE(p.cap,-1),COALESCE(p.min_price,-1)) "
            "NOT IN ((1,1000,5000),(?,?,?))",
            (CAMPAIGN_FAMILY, RETENTION_PCT, RETENTION_CAP, RETENTION_MIN_PRICE),
        ).fetchone()[0]
        if bad_retention:
            raise RuntimeError("retention campaign row drift")
        connection.execute(
            "UPDATE promos SET pct=?,amount=NULL,cap=?,min_price=? "
            "WHERE code=? AND family=?",
            (
                WELCOME_PCT, WELCOME_CAP, WELCOME_MIN_PRICE,
                CAMPAIGN_CODE, CAMPAIGN_FAMILY,
            ),
        )
        updated_retention = connection.execute(
            "UPDATE promos SET pct=?,amount=NULL,cap=?,min_price=? "
            "WHERE family=? AND code IN (SELECT code FROM promo_retention_grants)",
            (
                RETENTION_PCT, RETENTION_CAP, RETENTION_MIN_PRICE,
                CAMPAIGN_FAMILY,
            ),
        ).rowcount
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    if not _campaign_economics_db_current(path, allow_suspended=True):
        raise RuntimeError("economics database verification failed")
    return {
        "ok": True,
        "changed": not before,
        "retention_rows_checked": int(updated_retention),
    }


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


def patch_webapp_aggregate_v2(text: str) -> str:
    if AGGREGATE_WEB_MARKER in text:
        return text
    if text.count(WEBAPP_MARKER) != 1:
        raise RuntimeError("aggregate web patch requires the exact promo web marker")
    old = '        d["bonus_cap"] = 0 if subs.is_sub_order(o) else bonus.spend_cap(o["price"])\n'
    new = (
        '        d["bonus_cap"] = 0 if subs.is_sub_order(o) else bonus.spend_cap(\n'
        '            o["price"], _row_int_w(o, "sub_discount"),\n'
        '            _row_int_w(o, "promo_discount"),\n'
        '        )\n'
    )
    if text.count(old) != 1:
        raise RuntimeError(f"aggregate web cap anchor: expected one, got {text.count(old)}")
    text = text.replace(old, new, 1)
    text = text.replace(
        f"# {WEBAPP_MARKER}\n",
        f"# {WEBAPP_MARKER}\n# {AGGREGATE_WEB_MARKER}\n",
        1,
    )
    compile(text, "webapp.py", "exec")
    return text


def patch_promo_aggregate_v2(text: str) -> str:
    if AGGREGATE_PROMO_MARKER in text:
        return text
    if text.count(PROMO_MARKER) != 1:
        raise RuntimeError("aggregate promo patch requires the exact promo service marker")
    why_invalid_anchor = "def calc(p, price: int) -> int:\n"
    if text.count("def why_invalid(") != 0 or text.count(why_invalid_anchor) != 1:
        raise RuntimeError("aggregate promo validity anchor drift")
    claim_match = '''        await db.promo_claim_matches(
            FIRST_ORDER_FAMILY, o["user_id"], o["guest_contact"], order_id
        )
'''
    claim_match_exact = '''        await db.promo_claim_matches(
            FIRST_ORDER_FAMILY, o["user_id"], o["guest_contact"], order_id,
            code=code,
        )
'''
    claimed_expiry = '''    if claimed_first_order and bad == "expired":
        bad = None
'''
    claimed_promise = '''    if claimed_first_order and bad in (
            "expired", "inactive", "used_up"):
        # The deployment switch blocks new claims, but an accepted order keeps
        # its promised rate through restart and later price revisions.
        bad = None
'''
    invalid = '''    if bad and not (prev > 0 and bad == "used_up"):
        if prev:
            await db.update_order(order_id, promo_discount=0)
            await db.add_event(order_id, "promo_off", f"{code}: {bad}")
        return 0
'''
    invalid_atomic = '''    if bad and not (prev > 0 and bad == "used_up"):
        # Invalid, missing and below-minimum codes must clear their old value
        # and refund excess points under the same authoritative DB lock.
        result = await db.promo_bonus_reconcile(
            order_id, code, promo_allowed=False
        )
        return int(result["promo_discount"] or 0)
'''
    claim_missing = '''    if p["family"] == FIRST_ORDER_FAMILY and not claimed_first_order:
        await db.add_event(order_id, "promo_off", f"{code}: first-order claim missing")
        return 0
'''
    claim_missing_atomic = '''    if p["family"] == FIRST_ORDER_FAMILY and not claimed_first_order:
        result = await db.promo_bonus_reconcile(
            order_id, code, promo_allowed=False
        )
        return int(result["promo_discount"] or 0)
'''
    family_used = '''    if prev == 0 and p["family"] and await db.promo_family_used(
            p["family"], o["user_id"], o["guest_contact"], exclude_order=order_id):
        await db.add_event(order_id, "promo_off",
                           f"{code}: код серии «{p['family']}» уже был применён клиентом")
        return 0
'''
    family_used_atomic = '''    if prev == 0 and p["family"] and await db.promo_family_used(
            p["family"], o["user_id"], o["guest_contact"], exclude_order=order_id):
        result = await db.promo_bonus_reconcile(
            order_id, code, promo_allowed=False
        )
        return int(result["promo_discount"] or 0)
'''
    old = '''    disc = calc(p, o["price"])
    sub_disc = int(o["sub_discount"] or 0)
    if sub_disc >= disc:
        # подписка выгоднее — промо в этот раз отдыхает
        if prev:
            await db.update_order(order_id, promo_discount=0)
            await db.add_event(order_id, "promo_off",
                               f"{code}: скидка подписки выгоднее")
        return 0
    if sub_disc:
        # промо выгоднее — правило «действует бо́льшая из двух»
        await db.update_order(order_id, sub_discount=0)
        await db.add_event(order_id, "sub_discount",
                           f"снята: промокод {code} выгоднее")
    if disc != prev:
        await db.update_order(order_id, promo_discount=disc)
        await db.add_event(order_id, "promo_applied", f"{code}: −{disc} ₽")
    if prev == 0 and disc > 0:
        await db.promo_dec_uses(code)
    return disc
'''
    new = '''    # Fresh price, best-of choice, use count and points are committed
    # under one DB lock; stale service snapshots cannot over-discount an order.
    result = await db.promo_bonus_reconcile(
        order_id, code, promo_allowed=True
    )
    if result["error"]:
        return 0
    return int(result["promo_discount"] or 0)
'''
    for label, anchor in (
        ("claim match", claim_match), ("claimed promise", claimed_expiry),
        ("invalid", invalid),
        ("claim", claim_missing),
        ("family", family_used), ("reconciliation", old),
    ):
        if text.count(anchor) != 1:
            raise RuntimeError(
                f"aggregate promo {label} anchor: expected one, got {text.count(anchor)}"
            )
    text = text.replace(
        why_invalid_anchor,
        PROMO_WHY_INVALID + "\n\n" + why_invalid_anchor,
        1,
    )
    text = text.replace(claim_match, claim_match_exact, 1)
    text = text.replace(claimed_expiry, claimed_promise, 1)
    text = text.replace(invalid, invalid_atomic, 1)
    text = text.replace(claim_missing, claim_missing_atomic, 1)
    text = text.replace(family_used, family_used_atomic, 1)
    text = text.replace(old, new, 1)
    text = text.replace(
        f"# {PROMO_MARKER}\n",
        f"# {PROMO_MARKER}\n# {AGGREGATE_PROMO_MARKER}\n",
        1,
    )
    compile(text, "promo.py", "exec")
    return text


def patch_bonus_aggregate_v2(text: str) -> str:
    if AGGREGATE_BONUS_MARKER in text:
        return text
    signature = "def spend_cap(price: int | None, sub_discount: int = 0) -> int:\n"
    doc = '    """Максимум бонусов к заказу: ≤20% цены И ≤25% вместе со скидкой подписки."""\n'
    room = "    joint_room = max(price * 25 // 100 - (sub_discount or 0), 0)\n"
    old_apply = '''    payments = await db.payments_for_order(order["id"])
    if any(p["status"] == "paid" for p in payments):
        return False, "bonus_after_payment", 0
    if (order["bonus_spent"] or 0) > 0:
        return False, "bonus_once", 0
    try:
        sub_disc = int(order["sub_discount"] or 0)
    except (KeyError, IndexError, TypeError):
        sub_disc = 0
    cap = spend_cap(order["price"], sub_disc)
    if cap <= 0:
        return False, "bonus_order_small", 0
    amount = max(0, min(int(amount), cap))
    if amount <= 0:
        return False, "bonus_cap", 0
    bal = await balance(user_id)
    amount = min(amount, bal)
    if amount <= 0:
        return False, "bonus_empty", 0
    spent = await db.bonus_consume(user_id, amount,
                                   f"заказ {config.order_no(order['id'])}", order["id"])
    if spent <= 0:
        return False, "bonus_empty", 0
    await db.update_order(order["id"], bonus_spent=spent)
    await db.add_event(order["id"], "bonus_spent", f"{spent} бонусов")
    return True, "", spent
'''
    restore_anchor = "async def restore_for_order(order, note: str = \"возврат по заказу\") -> int:\n"
    for label, anchor in (
        ("signature", signature), ("doc", doc), ("room", room),
        ("apply", old_apply), ("restore", restore_anchor),
    ):
        if text.count(anchor) != 1:
            raise RuntimeError(
                f"aggregate bonus {label} anchor: expected one, got {text.count(anchor)}"
            )
    text = text.replace(
        signature,
        "def spend_cap(price: int | None, sub_discount: int = 0, "
        "promo_discount: int = 0) -> int:\n",
        1,
    )
    text = text.replace(
        doc,
        '    """Бонусы: ≤20% цены и ≤25% вместе с большей из скидок."""\n',
        1,
    )
    text = text.replace(
        room,
        "    applied_discount = max(sub_discount or 0, promo_discount or 0)\n"
        "    joint_room = max(price * 25 // 100 - applied_discount, 0)\n",
        1,
    )
    new_apply = '''    # Re-read every price/discount/payment field under the same
    # BEGIN IMMEDIATE lock that consumes points and updates the order.
    result = await db.bonus_apply_with_aggregate_cap(
        user_id, order["id"], amount,
        f"заказ {config.order_no(order['id'])}",
        config.BONUS_MIN_ORDER, config.BONUS_SPEND_CAP_PCT,
    )
    spent = int(result["spent"] or 0)
    if result["error"]:
        return False, str(result["error"]), 0
    return True, "", spent
'''
    text = text.replace(old_apply, new_apply, 1)
    reconcile = '''async def reconcile_for_discount(order) -> dict:
    """Reprice promo + best-of + points in one authoritative transaction."""
    return await db.promo_bonus_reconcile(order["id"], order["promo_code"])


'''
    text = text.replace(restore_anchor, reconcile + restore_anchor, 1)
    marker_anchor = "# --------------------------------------------------------------- списание\n"
    if text.count(marker_anchor) != 1:
        raise RuntimeError("aggregate bonus section anchor: expected one")
    text = text.replace(
        marker_anchor,
        marker_anchor + f"# {AGGREGATE_BONUS_MARKER}\n",
        1,
    )
    compile(text, "bonus.py", "exec")
    return text


def patch_my_orders_aggregate_v2(text: str) -> str:
    if AGGREGATE_ORDERS_MARKER in text:
        return text
    old = '    cap = bonus.spend_cap(o["price"])\n'
    new = (
        '    # Keep the displayed choice equal to the authoritative aggregate cap.\n'
        '    cap = bonus.spend_cap(\n'
        '        o["price"], int(o["sub_discount"] or 0),\n'
        '        int(o["promo_discount"] or 0),\n'
        '    )\n'
    )
    if text.count(old) != 1:
        raise RuntimeError(
            f"aggregate order cap anchor: expected one, got {text.count(old)}"
        )
    text = text.replace(old, f"    # {AGGREGATE_ORDERS_MARKER}\n" + new, 1)
    compile(text, "my_orders.py", "exec")
    return text


def patch_subs_aggregate_v2(text: str) -> str:
    if AGGREGATE_SUBS_MARKER in text:
        return text
    early = '''    if not o or not o["user_id"] or not o["price"] or is_sub_order(o):
        return 0
    sub = await db.sub_active(o["user_id"])
    if not sub or not sub["discount_pct"]:
        if (o["sub_discount"] or 0) != 0:
            await db.update_order(order_id, sub_discount=0)
        return 0
'''
    early_atomic = '''    if not o or not o["user_id"] or is_sub_order(o):
        return 0
    sub = await db.sub_active(o["user_id"])
    if not sub or not sub["discount_pct"]:
        # Removing an absent subscription can expose a promo and can make
        # already-spent points exceed the aggregate cap after repricing.
        result = await db.subscription_discount_reconcile(
            order_id, 0, None, "Салон+", config.BONUS_SPEND_CAP_PCT,
        )
        return int(result["sub_discount"] or 0)
'''
    old = '''    price = o["price"]
    disc = min(price * sub["discount_pct"] // 100, sub["discount_cap"] or 10**9)
    # совместный потолок «подписка + бонусы ≤ 25% заказа» (правила 3.4)
    room = max(price * 25 // 100 - (o["bonus_spent"] or 0), 0)
    disc = max(0, min(disc, room))
    if disc != (o["sub_discount"] or 0):
        await db.update_order(order_id, sub_discount=disc)
        if disc > 0:
            await db.add_event(order_id, "sub_discount",
                               f"−{disc} ₽ ({plan_label(sub['plan'])}, {sub['discount_pct']}%)")
    return disc
'''
    new = '''    # Late subscription activation uses the same authoritative best-of
    # and aggregate-benefit transaction as promo pricing and bonus spending.
    result = await db.subscription_discount_reconcile(
        order_id, int(sub["discount_pct"] or 0), sub["discount_cap"],
        plan_label(sub["plan"]), config.BONUS_SPEND_CAP_PCT,
    )
    return int(result["sub_discount"] or 0)
'''
    for label, anchor in (("early", early), ("discount", old)):
        if text.count(anchor) != 1:
            raise RuntimeError(
                f"aggregate subscription {label} anchor: expected one, got {text.count(anchor)}"
            )
    future = "from __future__ import annotations\n"
    if text.count(future) != 1:
        raise RuntimeError("aggregate subscription future-import anchor drift")
    text = text.replace(early, early_atomic, 1)
    text = text.replace(old, new, 1)
    text = text.replace(
        future, future + f"\n# {AGGREGATE_SUBS_MARKER}\n", 1
    )
    compile(text, "subs.py", "exec")
    return text


def _economics_candidates(paths: dict[str, Path]) -> dict[str, str]:
    sources = {
        name: path.read_text(encoding="utf-8") for name, path in paths.items()
    }
    sources["db"] = patch_db_economics_v2(sources["db"])
    sources["webapp"] = patch_webapp_aggregate_v2(sources["webapp"])
    sources["promo"] = patch_promo_aggregate_v2(sources["promo"])
    sources["bonus"] = patch_bonus_aggregate_v2(sources["bonus"])
    sources["my_orders"] = patch_my_orders_aggregate_v2(sources["my_orders"])
    sources["subs"] = patch_subs_aggregate_v2(sources["subs"])
    return sources


def _runtime_start_ns(
        pid: int, *, proc_root: Path = Path("/proc"),
        clock_ticks_per_second: int | None = None) -> int:
    """Read a Linux process start instant without trusting operator timestamps."""
    if pid <= 0:
        raise RuntimeError("runtime pid must be positive")
    try:
        stat_line = (proc_root / str(pid) / "stat").read_text(encoding="utf-8")
        remainder = stat_line.rsplit(")", 1)[1].split()
        start_ticks = int(remainder[19])  # proc_pid_stat(5), field 22
        boot_line = next(
            line for line in (proc_root / "stat").read_text(
                encoding="utf-8"
            ).splitlines() if line.startswith("btime ")
        )
        boot_seconds = int(boot_line.split()[1])
        hz = clock_ticks_per_second or int(os.sysconf("SC_CLK_TCK"))
    except (OSError, ValueError, IndexError, StopIteration) as exc:
        raise RuntimeError("cannot attest restarted service runtime") from exc
    if hz <= 0:
        raise RuntimeError("invalid runtime clock tick rate")
    return boot_seconds * 1_000_000_000 + start_ticks * 1_000_000_000 // hz


def _assert_runtime_identity(
        pid: int, expected_root: Path, *, proc_root: Path = Path("/proc"),
        expected_unit: str = "salon-bot-v2.service") -> None:
    """Bind finalize to the direct systemd bot process for this exact root."""
    process = proc_root / str(pid)
    try:
        cmdline = [part.decode("utf-8") for part in
                   (process / "cmdline").read_bytes().split(b"\0") if part]
        cwd = (process / "cwd").resolve(strict=True)
        cgroup = (process / "cgroup").read_text(encoding="utf-8")
        status = (process / "status").read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as exc:
        raise RuntimeError("cannot attest bot runtime identity") from exc
    expected_command = [str(expected_root / "venv" / "bin" / "python"), "-m", "app.bot"]
    parent = next(
        (line.split(":", 1)[1].strip() for line in status.splitlines()
         if line.startswith("PPid:")),
        None,
    )
    if (cmdline[:3] != expected_command or cwd != expected_root.resolve() or
            f"/{expected_unit}" not in cgroup or parent != "1"):
        raise RuntimeError("runtime pid is not the expected systemd bot process")


def _attest_restarted_runtime(
        snapshot: dict, runtime_pid: int | None, expected_root: Path, *,
        proc_root: Path = Path("/proc"),
        clock_ticks_per_second: int | None = None) -> dict:
    staged_at_ns = snapshot.get("staged_at_ns")
    if not isinstance(staged_at_ns, int) or staged_at_ns <= 0:
        raise RuntimeError("economics transition was not fully staged")
    if runtime_pid is None:
        raise RuntimeError("finalize requires the restarted service pid")
    _assert_runtime_identity(
        runtime_pid, expected_root, proc_root=proc_root,
    )
    started_at_ns = _runtime_start_ns(
        runtime_pid, proc_root=proc_root,
        clock_ticks_per_second=clock_ticks_per_second,
    )
    if started_at_ns <= staged_at_ns:
        raise RuntimeError("service runtime predates the staged v2 source")
    return {"pid": runtime_pid, "started_at_ns": started_at_ns}


def check_campaign_economics(
        root: Path, *, database: Path | None = None,
        expected_before: dict[str, str] = ECONOMICS_KNOWN_BEFORE,
        expected_after: dict[str, str] = ECONOMICS_KNOWN_AFTER) -> dict:
    """Verify the pinned v1→v2 source transition and live DB economics."""
    _pinned(expected_after)
    paths = _economics_paths(root)
    database = database or root / "salon.db"
    preflight = _assert_no_open_discount_anomalies(database)
    current = {name: sha256(path) for name, path in paths.items()}
    if all(current[name] == expected_after[name] for name in paths):
        if _campaign_economics_db_current(database):
            return {
                "ok": True, "changed": False, "source_state": "installed",
                "database_current": True, "campaign": _campaign_setting_value(database),
                "sha256": current, "open_order_preflight": preflight,
            }
        if (_economics_transition(_campaign_setting_value(database)) is not None and
                _campaign_economics_db_current(database, allow_suspended=True)):
            return {
                "ok": True, "changed": True,
                "source_state": "awaiting_restart_and_finalize",
                "database_current": True, "campaign": "suspended",
                "sha256": current,
            }
        raise RuntimeError(
            "economics sources are installed but the database is incomplete"
        )
    safe_rollback = _economics_safe_rollback(expected_before, expected_after)
    ready_states = (expected_before, safe_rollback)
    if not any(all(current[name] == state[name] for name in paths)
               for state in ready_states):
        raise RuntimeError(f"unknown or mixed economics source state: {current}")
    candidates = _economics_candidates(paths)
    candidate_hashes = {
        name: sha256_text(value) for name, value in candidates.items()
    }
    if candidate_hashes != expected_after:
        raise RuntimeError(f"economics candidate hash drift: {candidate_hashes}")
    source_state = (
        "safe_rollback" if all(
            current[name] == safe_rollback[name] for name in paths
        ) else "ready"
    )
    return {
        "ok": True, "changed": True, "source_state": source_state,
        "database_current": _campaign_economics_db_current(database),
        "open_order_preflight": preflight,
        "before_sha256": current, "after_sha256": candidate_hashes,
    }


def upgrade_campaign_economics(
        root: Path, backup_root: Path, *, database: Path | None = None,
        expected_before: dict[str, str] = ECONOMICS_KNOWN_BEFORE,
        expected_after: dict[str, str] = ECONOMICS_KNOWN_AFTER,
        now: datetime | None = None) -> dict:
    """Stage v2 fail-closed; a service restart and explicit finalize follow."""
    _pinned(expected_after)
    paths = _economics_paths(root)
    database = database or root / "salon.db"
    _assert_no_open_discount_anomalies(database)
    current = {name: sha256(path) for name, path in paths.items()}
    moment = now or datetime.now(timezone.utc)
    all_after = all(current[name] == expected_after[name] for name in paths)
    transition_id = _economics_transition(_campaign_setting_value(database))
    recovering = bool(all_after and transition_id)
    if all_after and not recovering:
        if _campaign_economics_db_current(database):
            return {"ok": True, "changed": False, "backup": None}
        raise RuntimeError(
            "economics sources are installed but the database is incomplete"
        )

    if recovering:
        backup = _find_transition_backup(backup_root, transition_id or "")
        state = _read_campaign_state(backup)
        if state["suspended_value"] != _campaign_setting_value(database):
            raise RuntimeError("recovery backup does not match live transition")
        manifest = json.loads(
            (backup / "manifest.json").read_text(encoding="utf-8")
        )
        candidates = {
            name: path.read_text(encoding="utf-8") for name, path in paths.items()
        }
        candidate_hashes = current
        installed: list[str] = []
        if (state["staged_at_ns"] is not None and
                _campaign_economics_db_current(database, allow_suspended=True)):
            manifest["staged_at_ns"] = state["staged_at_ns"]
            manifest["after_sha256"] = expected_after
            _write_campaign_manifest(backup, manifest)
            return {
                "ok": True, "changed": False, "backup": str(backup),
                "requires_restart": True, "requires_finalize": True,
                "campaign": "suspended", "transition_id": state["transition_id"],
            }
    else:
        safe_rollback = _economics_safe_rollback(expected_before, expected_after)
        ready_states = (expected_before, safe_rollback)
        if not any(all(current[name] == state[name] for name in paths)
                   for state in ready_states):
            raise RuntimeError(f"unknown or mixed economics source state: {current}")
        candidates = _economics_candidates(paths)
        candidate_hashes = {
            name: sha256_text(value) for name, value in candidates.items()
        }
        if candidate_hashes != expected_after:
            raise RuntimeError(f"economics candidate hash drift: {candidate_hashes}")
        state = _suspend_campaign_with_snapshot(database)
        backup = backup_root / (
            "first-order-promo-economics-"
            f"{moment.strftime('%Y%m%dT%H%M%S%fZ')}"
        )
        manifest = {
            "kind": "first-order-promo-economics-v2",
            "created_at": moment.isoformat(),
            "before_sha256": current,
            "after_sha256": expected_after,
            "database": str(database),
            "transition_id": state["transition_id"],
            "suspended_at_ns": state["suspended_at_ns"],
            "staged_at_ns": None,
            "campaign_was_on": state["setting"] == "on",
            "active_family_rows": sum(active for _, active in state["actives"]),
            "inactive_family_rows": sum(
                1 for _, active in state["actives"] if not active
            ),
            "retention_grant_rows": state["retention_count"],
        }
        installed = []
    try:
        if not recovering:
            backup.mkdir(parents=True, mode=0o700)
            for name, path in paths.items():
                shutil.copy2(path, backup / path.name)
            _sqlite_backup(database, backup / "salon.db")
            _write_campaign_manifest(backup, manifest)
            _write_campaign_state(backup, state)
        for name, path in paths.items():
            if current[name] == expected_after[name]:
                continue
            _atomic_text(path, candidates[name], current[name])
            if sha256(path) != expected_after[name]:
                raise RuntimeError(f"installed economics source hash mismatch: {name}")
            installed.append(name)
        migration = migrate_campaign_economics(database)
        if (_campaign_setting_value(database) != state["suspended_value"] or
                not _campaign_economics_db_current(
                    database, allow_suspended=True
                )):
            raise RuntimeError("economics verification failed while suspended")
        state["staged_at_ns"] = time.time_ns()
        manifest["staged_at_ns"] = state["staged_at_ns"]
        _write_campaign_state(backup, state)
        _write_campaign_manifest(backup, manifest)
    except Exception as exc:
        complete_v2 = all(
            path.is_file() and sha256(path) == expected_after[name]
            for name, path in paths.items()
        )
        if not complete_v2:
            _fail_closed_preserving_promises(database, state)
            for name in reversed(installed):
                target = paths[name]
                if sha256(target) == expected_after[name]:
                    _atomic_text(
                        target, (backup / target.name).read_text(encoding="utf-8"),
                        expected_after[name],
                    )
        raise RuntimeError(
            f"economics staging failed; recovery backup: {backup}"
        ) from exc
    return {
        "ok": True, "changed": True, "backup": str(backup),
        "after_sha256": expected_after,
        "campaign": "suspended",
        "requires_restart": True,
        "requires_finalize": True,
        "transition_id": state["transition_id"],
        "retention_rows_checked": migration["retention_rows_checked"],
    }


def finalize_campaign_economics(
        root: Path, backup: Path, *, database: Path | None = None,
        expected_after: dict[str, str] = ECONOMICS_KNOWN_AFTER,
        runtime_pid: int | None = None, proc_root: Path = Path("/proc"),
        clock_ticks_per_second: int | None = None) -> dict:
    """Restore the pre-upgrade switch only after the service loaded v2 source."""
    _pinned(expected_after)
    paths = _economics_paths(root)
    database = database or root / "salon.db"
    _assert_no_open_discount_anomalies(database)
    current = {name: sha256(path) for name, path in paths.items()}
    if current != expected_after:
        raise RuntimeError(f"finalize economics source mismatch: {current}")
    state = _read_campaign_state(backup)
    manifest = json.loads((backup / "manifest.json").read_text(encoding="utf-8"))
    if (manifest.get("transition_id") != state["transition_id"] or
            manifest.get("staged_at_ns") != state["staged_at_ns"] or
            manifest.get("after_sha256") != expected_after):
        raise RuntimeError("economics transition manifest binding mismatch")
    if (_campaign_setting_value(database) != state["suspended_value"] or
            not _campaign_economics_db_current(database, allow_suspended=True)):
        raise RuntimeError("economics campaign is not safely suspended")
    runtime = _attest_restarted_runtime(
        state, runtime_pid, root, proc_root=proc_root,
        clock_ticks_per_second=clock_ticks_per_second,
    )
    _restore_campaign_state(database, state)
    if not _campaign_economics_db_current(database):
        raise RuntimeError("economics verification failed after finalize")
    return {
        "ok": True, "finalized": True,
        "campaign": state["setting"], "sha256": current,
        "transition_id": state["transition_id"],
        "runtime": runtime,
    }


def enable_campaign_economics(
        root: Path, *, database: Path | None = None,
        expected_before: dict[str, str] = ECONOMICS_KNOWN_BEFORE,
        expected_after: dict[str, str] = ECONOMICS_KNOWN_AFTER) -> dict:
    """Explicitly reopen a verified finalized campaign after rollback proof."""
    check = check_campaign_economics(
        root, database=database, expected_before=expected_before,
        expected_after=expected_after,
    )
    if check.get("source_state") != "installed":
        raise RuntimeError("economics campaign is not finalized")
    database = database or root / "salon.db"
    _assert_no_open_discount_anomalies(database)
    connection = sqlite3.connect(database, timeout=20)
    try:
        connection.execute("BEGIN IMMEDIATE")
        welcome = connection.execute(
            "SELECT active FROM promos WHERE code=? AND family=?",
            (CAMPAIGN_CODE, CAMPAIGN_FAMILY),
        ).fetchone()
        if not welcome or int(welcome[0] or 0) != 1:
            raise RuntimeError("welcome row is inactive")
        setting = connection.execute(
            "SELECT value FROM settings WHERE key='promo_campaign'"
        ).fetchone()
        if not setting or setting[0] not in {"on", "off"}:
            raise RuntimeError("campaign switch is invalid")
        if setting[0] == "off":
            changed = connection.execute(
                "UPDATE settings SET value='on' "
                "WHERE key='promo_campaign' AND value='off'"
            ).rowcount
            if changed != 1:
                raise RuntimeError("campaign enable compare-and-swap failed")
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()
    return {"ok": True, "campaign": "on"}


def rollback_campaign_economics(
        root: Path, backup: Path, *, database: Path | None = None,
        expected_before: dict[str, str] = ECONOMICS_KNOWN_BEFORE,
        expected_after: dict[str, str] = ECONOMICS_KNOWN_AFTER) -> dict:
    """Fail the campaign closed while preserving one coherent safe v2 image."""
    _pinned(expected_after)
    paths = _economics_paths(root)
    database = database or root / "salon.db"
    for name, path in paths.items():
        if sha256(path) != expected_after[name]:
            raise RuntimeError(f"economics rollback current hash mismatch: {name}")
        if not (backup / path.name).is_file():
            raise RuntimeError(f"economics rollback copy missing: {name}")
    setting = _campaign_setting_value(database)
    if _economics_transition(setting) is not None:
        _fail_closed_preserving_promises(database, _read_campaign_state(backup))
    elif setting not in {"on", "off"}:
        raise RuntimeError("economics rollback campaign state is invalid")
    else:
        close_campaign_new_claims(database)
    target_hashes = _economics_safe_rollback(expected_before, expected_after)
    for name, path in paths.items():
        if expected_after[name] == target_hashes[name]:
            continue
        backup_source = backup / path.name
        if sha256(backup_source) != target_hashes[name]:
            raise RuntimeError(f"economics rollback copy hash mismatch: {name}")
        _atomic_text(
            path, backup_source.read_text(encoding="utf-8"),
            expected_after[name],
        )
    return {
        "ok": True, "rolled_back": True, "sha256": target_hashes,
        "database": "preserved", "promised_rates": "preserved",
        "aggregate_cap": "preserved", "campaign": "off",
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("/root/salon_bot"))
    parser.add_argument("--database", type=Path)
    parser.add_argument("--backup-root", type=Path, default=Path("/root/salon_bot/backups"))
    parser.add_argument(
        "--runtime-pid", type=int,
        help="restarted salon-bot-v2 main PID required by --finalize-economics",
    )
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--check", action="store_true")
    action.add_argument("--apply", action="store_true")
    action.add_argument("--rollback", type=Path)
    action.add_argument("--check-economics", action="store_true")
    action.add_argument("--apply-economics", action="store_true")
    action.add_argument("--finalize-economics", type=Path)
    action.add_argument("--enable-economics", action="store_true")
    action.add_argument("--rollback-economics", type=Path)
    args = parser.parse_args()
    if args.rollback_economics:
        result = rollback_campaign_economics(
            args.root, args.rollback_economics, database=args.database
        )
    elif args.finalize_economics:
        result = finalize_campaign_economics(
            args.root, args.finalize_economics, database=args.database,
            runtime_pid=args.runtime_pid,
        )
    elif args.enable_economics:
        result = enable_campaign_economics(args.root, database=args.database)
    elif args.apply_economics:
        result = upgrade_campaign_economics(
            args.root, args.backup_root, database=args.database
        )
    elif args.check_economics:
        result = check_campaign_economics(args.root, database=args.database)
    elif args.rollback:
        result = rollback(args.root, args.rollback, database=args.database)
    elif args.apply:
        result = install(args.root, args.backup_root, database=args.database)
    else:
        result = check_install(args.root, database=args.database)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
