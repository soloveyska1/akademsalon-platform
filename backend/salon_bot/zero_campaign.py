"""Server-authoritative 1 September promo drops for Academic Salon.

The campaign is deliberately separate from paid gift certificates.  Each slot
contains a one-use fixed promo code.  Claims are performed only by the
Kladovaya bot through an HMAC-authenticated endpoint; the public endpoint can
read aggregate stock but never sees codes or claimant identifiers.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .. import db


CAMPAIGN_ID = "zero-classes-2026-09-01"
FAMILY = CAMPAIGN_ID
AMOUNT = 1000
MIN_PRICE = 5000
EXPIRES_AT = "2026-09-21T20:59:59"
TERMS_VERSION = "zero-classes-2026-08-31-v1"
DROP_SPECS = (
    ("0901", "1-я пара", "2026-09-01T06:01:00", "2026-09-01T10:00:59"),
    ("1301", "2-я пара", "2026-09-01T10:01:00", "2026-09-01T15:00:59"),
    ("1801", "3-я пара", "2026-09-01T15:01:00", "2026-09-01T20:59:59"),
)
DROP_QUOTA = 10
SIGNATURE_TOLERANCE_SECONDS = 60
NONCE_RETENTION_SECONDS = 300
CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
CLAIM_RATE_WINDOW_SECONDS = 60
CLAIM_RATE_PER_CLAIMANT = 6
CLAIM_RATE_GLOBAL = 120

_claim_rate_lock = threading.Lock()
_claim_rate_global: list[int] = []
_claim_rate_by_claimant: dict[str, list[int]] = {}

SCHEMA = """
CREATE TABLE IF NOT EXISTS zero_campaigns(
  campaign_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  amount INTEGER NOT NULL,
  min_price INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS zero_campaign_drops(
  campaign_id TEXT NOT NULL REFERENCES zero_campaigns(campaign_id),
  drop_id TEXT NOT NULL,
  label TEXT NOT NULL,
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  quota INTEGER NOT NULL CHECK(quota > 0),
  PRIMARY KEY(campaign_id, drop_id)
);
CREATE TABLE IF NOT EXISTS zero_campaign_slots(
  campaign_id TEXT NOT NULL,
  drop_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  public_id TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE REFERENCES promos(code),
  claimant_key TEXT,
  claimed_at TEXT,
  PRIMARY KEY(campaign_id, drop_id, slot),
  FOREIGN KEY(campaign_id, drop_id)
    REFERENCES zero_campaign_drops(campaign_id, drop_id),
  CHECK((claimant_key IS NULL) = (claimed_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_zero_campaign_claimant
  ON zero_campaign_slots(campaign_id, claimant_key)
  WHERE claimant_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS zero_campaign_claims(
  campaign_id TEXT NOT NULL,
  claimant_key TEXT NOT NULL,
  drop_id TEXT NOT NULL,
  slot INTEGER NOT NULL,
  public_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL UNIQUE,
  claimed_at TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  PRIMARY KEY(campaign_id, claimant_key),
  FOREIGN KEY(campaign_id, drop_id, slot)
    REFERENCES zero_campaign_slots(campaign_id, drop_id, slot)
);
CREATE TABLE IF NOT EXISTS zero_campaign_nonces(
  nonce TEXT PRIMARY KEY,
  seen_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_zero_campaign_nonces_seen
  ON zero_campaign_nonces(seen_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_claims_zero_code
  ON promo_first_order_claims(code)
  WHERE family='zero-classes-2026-09-01';
""".strip()


class CampaignError(RuntimeError):
    def __init__(self, code: str, status: int = 409) -> None:
        super().__init__(code)
        self.code = code
        self.status = status


def now_iso(epoch: int | float | None = None) -> str:
    value = time.time() if epoch is None else float(epoch)
    return datetime.fromtimestamp(value, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def credential_secret() -> bytes:
    value = os.environ.get("ACADEMIC_SALON_ZERO_HMAC", "").strip()
    credential_dir = os.environ.get("CREDENTIALS_DIRECTORY", "").strip()
    if not value and credential_dir:
        path = Path(credential_dir) / "zero_campaign_hmac"
        try:
            value = path.read_text(encoding="utf-8").strip()
        except FileNotFoundError:
            pass
    if len(value) < 32:
        raise RuntimeError("zero campaign HMAC credential is not configured")
    return value.encode("utf-8")


def source_ips() -> set[str]:
    raw = os.environ.get("ACADEMIC_SALON_ZERO_SOURCE_IPS", "94.241.143.29")
    return {item.strip() for item in raw.split(",") if item.strip()}


def body_signature(secret: bytes, timestamp: str, nonce: str, body: bytes) -> str:
    body_hash = hashlib.sha256(body).hexdigest()
    canonical = f"{timestamp}\n{nonce}\n{body_hash}".encode("utf-8")
    return hmac.new(secret, canonical, hashlib.sha256).hexdigest()


def claimant_key(secret: bytes, pseudonym: str) -> str:
    return hmac.new(
        secret,
        f"{CAMPAIGN_ID}|{pseudonym}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_request(
    *,
    body: bytes,
    timestamp: str,
    nonce: str,
    signature: str,
    source_ip: str,
    secret: bytes | None = None,
    epoch: int | None = None,
) -> None:
    if source_ip not in source_ips():
        raise CampaignError("source_denied", 403)
    if not re.fullmatch(r"[0-9]{10}", timestamp or ""):
        raise CampaignError("bad_timestamp", 401)
    now = int(time.time()) if epoch is None else int(epoch)
    if abs(now - int(timestamp)) > SIGNATURE_TOLERANCE_SECONDS:
        raise CampaignError("stale_signature", 401)
    if not re.fullmatch(r"[a-f0-9]{32}", nonce or ""):
        raise CampaignError("bad_nonce", 401)
    if not re.fullmatch(r"[a-f0-9]{64}", signature or ""):
        raise CampaignError("bad_signature", 401)
    expected = body_signature(secret or credential_secret(), timestamp, nonce, body)
    if not hmac.compare_digest(expected, signature):
        raise CampaignError("bad_signature", 401)


def allow_claim_request(claimant: str, *, epoch: int | None = None) -> bool:
    """Bound signed requests without treating the shared bot IP as one user."""
    now = int(time.time()) if epoch is None else int(epoch)
    cutoff = now - CLAIM_RATE_WINDOW_SECONDS
    with _claim_rate_lock:
        _claim_rate_global[:] = [stamp for stamp in _claim_rate_global if stamp > cutoff]
        own = [
            stamp
            for stamp in _claim_rate_by_claimant.get(claimant, [])
            if stamp > cutoff
        ]
        if (
            len(own) >= CLAIM_RATE_PER_CLAIMANT
            or len(_claim_rate_global) >= CLAIM_RATE_GLOBAL
        ):
            _claim_rate_by_claimant[claimant] = own
            return False
        own.append(now)
        _claim_rate_by_claimant[claimant] = own
        _claim_rate_global.append(now)
        if len(_claim_rate_by_claimant) > 5_000:
            active = {
                key: [stamp for stamp in stamps if stamp > cutoff]
                for key, stamps in _claim_rate_by_claimant.items()
            }
            _claim_rate_by_claimant.clear()
            _claim_rate_by_claimant.update(
                (key, stamps) for key, stamps in active.items() if stamps
            )
        return True


def authenticated_claim_payload(
    *,
    body: bytes,
    timestamp: str,
    nonce: str,
    signature: str,
    source_ip: str,
    secret: bytes | None = None,
    epoch: int | None = None,
) -> dict[str, str]:
    """Authenticate, parse and rate-limit one HTTP claim before touching SQLite."""
    verify_request(
        body=body,
        timestamp=timestamp,
        nonce=nonce,
        signature=signature,
        source_ip=source_ip,
        secret=secret,
        epoch=epoch,
    )
    try:
        value = json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise CampaignError("bad_payload", 400) from None
    if not isinstance(value, dict) or set(value) != {
        "drop_id",
        "claimant_key",
        "request_id",
    }:
        raise CampaignError("bad_payload", 400)
    drop_id = str(value.get("drop_id") or "")
    claimant = str(value.get("claimant_key") or "")
    request_id = str(value.get("request_id") or "")
    if (
        drop_id not in {item[0] for item in DROP_SPECS}
        or not re.fullmatch(r"[a-f0-9]{64}", claimant)
        or not re.fullmatch(r"[a-f0-9]{32}", request_id)
    ):
        raise CampaignError("bad_payload", 400)
    if not allow_claim_request(claimant, epoch=epoch):
        raise CampaignError("rate_limited", 429)
    return {
        "drop_id": drop_id,
        "claimant_key": claimant,
        "request_id": request_id,
    }


def generated_code(existing: set[str]) -> str:
    while True:
        raw = "".join(secrets.choice(CODE_ALPHABET) for _ in range(12))
        code = f"NP26-{raw[:4]}-{raw[4:8]}-{raw[8:]}"
        if code not in existing:
            existing.add(code)
            return code


def seed_database(path: str | Path, *, enabled: bool = False) -> dict[str, int]:
    """Idempotently seed exactly thirty hidden promo codes in one transaction."""
    database = sqlite3.connect(str(path), timeout=10)
    database.row_factory = sqlite3.Row
    try:
        database.execute("PRAGMA foreign_keys=ON")
        database.execute("PRAGMA busy_timeout=5000")
        database.executescript(SCHEMA)
        database.execute("BEGIN IMMEDIATE")
        created = now_iso()
        database.execute(
            "INSERT OR IGNORE INTO zero_campaigns"
            "(campaign_id,enabled,amount,min_price,expires_at,terms_version,created_at) "
            "VALUES(?,?,?,?,?,?,?)",
            (CAMPAIGN_ID, 1 if enabled else 0, AMOUNT, MIN_PRICE, EXPIRES_AT,
             TERMS_VERSION, created),
        )
        for drop_id, label, opens_at, closes_at in DROP_SPECS:
            database.execute(
                "INSERT OR IGNORE INTO zero_campaign_drops"
                "(campaign_id,drop_id,label,opens_at,closes_at,quota) VALUES(?,?,?,?,?,?)",
                (CAMPAIGN_ID, drop_id, label, opens_at, closes_at, DROP_QUOTA),
            )
        existing = {
            str(row[0]) for row in database.execute("SELECT code FROM promos")
        }
        for drop_index, (drop_id, _label, _opens, _closes) in enumerate(DROP_SPECS):
            for slot in range(1, DROP_QUOTA + 1):
                present = database.execute(
                    "SELECT code FROM zero_campaign_slots "
                    "WHERE campaign_id=? AND drop_id=? AND slot=?",
                    (CAMPAIGN_ID, drop_id, slot),
                ).fetchone()
                if present:
                    continue
                code = generated_code(existing)
                public_id = f"NP-{drop_index * DROP_QUOTA + slot:03d}"
                database.execute(
                    "INSERT INTO promos"
                    "(code,pct,amount,cap,min_price,uses_left,expires_at,active,note,family,created_at) "
                    "VALUES(?,NULL,?,NULL,?,1,?,1,?,?,?)",
                    (code, AMOUNT, MIN_PRICE, EXPIRES_AT[:10],
                     "Нулевые пары 01.09.2026", FAMILY, created),
                )
                database.execute(
                    "INSERT INTO zero_campaign_slots"
                    "(campaign_id,drop_id,slot,public_id,code) VALUES(?,?,?,?,?)",
                    (CAMPAIGN_ID, drop_id, slot, public_id, code),
                )
        claim_count = int(database.execute(
            "SELECT COUNT(*) FROM zero_campaign_claims WHERE campaign_id=?",
            (CAMPAIGN_ID,),
        ).fetchone()[0])
        if claim_count == 0:
            # A pre-launch source rollback deliberately deactivates the hidden
            # codes.  A reviewed forward re-apply may normalize them only while
            # nobody has received one; after the first claim, economics are
            # immutable and integrity must fail closed on any drift.
            database.execute(
                "UPDATE promos SET pct=NULL,amount=?,cap=NULL,min_price=?,"
                "uses_left=1,expires_at=?,active=1,note=?,family=? "
                "WHERE code IN (SELECT code FROM zero_campaign_slots "
                "WHERE campaign_id=?)",
                (AMOUNT, MIN_PRICE, EXPIRES_AT[:10],
                 "Нулевые пары 01.09.2026", FAMILY, CAMPAIGN_ID),
            )
        counts = campaign_integrity(database)
        database.commit()
        return counts
    except Exception:
        database.rollback()
        raise
    finally:
        database.close()


def campaign_integrity(database: sqlite3.Connection) -> dict[str, int]:
    foreign_key_errors = database.execute("PRAGMA foreign_key_check").fetchall()
    if foreign_key_errors:
        raise RuntimeError("zero campaign foreign-key integrity mismatch")
    reservation_index = database.execute(
        "SELECT `unique`,partial FROM pragma_index_list('promo_first_order_claims') "
        "WHERE name='idx_promo_claims_zero_code'"
    ).fetchone()
    reservation_columns = database.execute(
        "SELECT name FROM pragma_index_info('idx_promo_claims_zero_code') "
        "ORDER BY seqno"
    ).fetchall()
    if (
        not reservation_index
        or tuple(reservation_index) != (1, 1)
        or [row[0] for row in reservation_columns] != ["code"]
    ):
        raise RuntimeError("zero campaign code reservation index mismatch")
    campaign = database.execute(
        "SELECT amount,min_price,expires_at,terms_version FROM zero_campaigns "
        "WHERE campaign_id=?",
        (CAMPAIGN_ID,),
    ).fetchone()
    if not campaign or tuple(campaign) != (
        AMOUNT,
        MIN_PRICE,
        EXPIRES_AT,
        TERMS_VERSION,
    ):
        raise RuntimeError("zero campaign contract mismatch")
    drops = database.execute(
        "SELECT drop_id,label,opens_at,closes_at,quota FROM zero_campaign_drops "
        "WHERE campaign_id=? ORDER BY opens_at",
        (CAMPAIGN_ID,),
    ).fetchall()
    expected_drops = [(*spec, DROP_QUOTA) for spec in DROP_SPECS]
    if [tuple(row) for row in drops] != expected_drops:
        raise RuntimeError("zero campaign drop contract mismatch")
    row = database.execute(
        "SELECT COUNT(*) AS total, COUNT(DISTINCT code) AS codes, "
        "COUNT(DISTINCT public_id) AS public_ids FROM zero_campaign_slots "
        "WHERE campaign_id=?",
        (CAMPAIGN_ID,),
    ).fetchone()
    values = {"total": int(row[0]), "codes": int(row[1]), "public_ids": int(row[2])}
    per_drop = database.execute(
        "SELECT drop_id,COUNT(*) FROM zero_campaign_slots "
        "WHERE campaign_id=? GROUP BY drop_id ORDER BY drop_id",
        (CAMPAIGN_ID,),
    ).fetchall()
    if values != {"total": 30, "codes": 30, "public_ids": 30}:
        raise RuntimeError("zero campaign must contain exactly 30 unique slots")
    if [int(row[1]) for row in per_drop] != [10, 10, 10]:
        raise RuntimeError("zero campaign must contain 10 slots per drop")
    mismatched = database.execute(
        "SELECT COUNT(*) FROM zero_campaign_slots s "
        "LEFT JOIN promos p ON p.code=s.code "
        "LEFT JOIN zero_campaign_claims c "
        "ON c.campaign_id=s.campaign_id AND c.code=s.code "
        "WHERE s.campaign_id=? AND ("
        "p.code IS NULL OR p.family IS NOT ? OR p.pct IS NOT NULL OR "
        "p.amount IS NOT ? OR p.cap IS NOT NULL OR p.min_price IS NOT ? OR "
        "p.expires_at IS NOT ? OR p.active IS NOT 1 OR "
        "(c.code IS NULL AND p.uses_left IS NOT 1) OR "
        "(c.code IS NOT NULL AND p.uses_left NOT IN (0,1)))",
        (CAMPAIGN_ID, FAMILY, AMOUNT, MIN_PRICE, EXPIRES_AT[:10]),
    ).fetchone()[0]
    if int(mismatched):
        raise RuntimeError("zero campaign promo economics mismatch")
    return values


def set_enabled(path: str | Path, enabled: bool) -> None:
    database = sqlite3.connect(str(path), timeout=10)
    try:
        database.execute("BEGIN IMMEDIATE")
        if enabled:
            campaign_integrity(database)
        changed = database.execute(
            "UPDATE zero_campaigns SET enabled=? WHERE campaign_id=?",
            (1 if enabled else 0, CAMPAIGN_ID),
        )
        if changed.rowcount != 1:
            raise RuntimeError("zero campaign is not seeded")
        database.commit()
    except Exception:
        database.rollback()
        raise
    finally:
        database.close()


async def public_status(epoch: int | None = None) -> dict[str, Any]:
    now = now_iso(epoch)
    campaign = await (await db.conn().execute(
        "SELECT enabled,amount,min_price,expires_at FROM zero_campaigns WHERE campaign_id=?",
        (CAMPAIGN_ID,),
    )).fetchone()
    drops = await (await db.conn().execute(
        "SELECT d.drop_id,d.label,d.opens_at,d.closes_at,d.quota,"
        "SUM(CASE WHEN s.claimant_key IS NOT NULL THEN 1 ELSE 0 END) AS claimed "
        "FROM zero_campaign_drops d LEFT JOIN zero_campaign_slots s "
        "ON s.campaign_id=d.campaign_id AND s.drop_id=d.drop_id "
        "WHERE d.campaign_id=? GROUP BY d.drop_id ORDER BY d.opens_at",
        (CAMPAIGN_ID,),
    )).fetchall()
    if not campaign:
        return {"ok": True, "campaign_id": CAMPAIGN_ID, "state": "preparing",
                "server_time": now, "drops": []}
    result = []
    for row in drops:
        claimed = int(row["claimed"] or 0)
        remaining = max(0, int(row["quota"]) - claimed)
        if not campaign["enabled"]:
            state = "closed"
        elif now < str(row["opens_at"]):
            state = "upcoming"
        elif now > str(row["closes_at"]):
            state = "ended"
        elif remaining <= 0:
            state = "sold_out"
        else:
            state = "live"
        result.append({
            "id": row["drop_id"], "label": row["label"],
            "opens_at": row["opens_at"] + "Z",
            "closes_at": row["closes_at"] + "Z",
            "quota": int(row["quota"]), "claimed": claimed,
            "remaining": remaining, "state": state,
        })
    return {
        "ok": True, "campaign_id": CAMPAIGN_ID,
        "state": "active" if campaign["enabled"] else "closed",
        "server_time": now + "Z", "amount": int(campaign["amount"]),
        "min_price": int(campaign["min_price"]),
        "expires_at": str(campaign["expires_at"]) + "Z", "drops": result,
    }


async def claim(
    *,
    drop_id: str,
    claimant: str,
    request_id: str,
    nonce: str,
    epoch: int | None = None,
) -> dict[str, Any]:
    if not re.fullmatch(r"[a-f0-9]{64}", claimant or ""):
        raise CampaignError("bad_claimant", 400)
    if not re.fullmatch(r"[a-f0-9]{32}", request_id or ""):
        raise CampaignError("bad_request_id", 400)
    if not re.fullmatch(r"[a-f0-9]{32}", nonce or ""):
        raise CampaignError("bad_nonce", 400)
    now_epoch = int(time.time()) if epoch is None else int(epoch)
    now = now_iso(now_epoch)
    await reserve_nonce(nonce, now_epoch)
    async with db.transaction() as connection:
        campaign = await (await connection.execute(
            "SELECT enabled,amount,min_price,expires_at,terms_version "
            "FROM zero_campaigns WHERE campaign_id=?",
            (CAMPAIGN_ID,),
        )).fetchone()
        if not campaign:
            raise CampaignError("campaign_closed", 409)
        existing = await (await connection.execute(
            "SELECT drop_id,public_id,code,claimed_at FROM zero_campaign_claims "
            "WHERE campaign_id=? AND claimant_key=?",
            (CAMPAIGN_ID, claimant),
        )).fetchone()
        if existing:
            remaining = await _remaining(connection, existing["drop_id"])
            return _claim_response(existing, campaign, remaining, repeated=True)
        if not campaign["enabled"]:
            raise CampaignError("campaign_closed", 409)
        drop = await (await connection.execute(
            "SELECT drop_id,opens_at,closes_at,quota FROM zero_campaign_drops "
            "WHERE campaign_id=? AND drop_id=?",
            (CAMPAIGN_ID, drop_id),
        )).fetchone()
        if not drop:
            raise CampaignError("unknown_drop", 404)
        if now < str(drop["opens_at"]):
            raise CampaignError("not_open_yet", 409)
        if now > str(drop["closes_at"]):
            raise CampaignError("drop_ended", 409)
        slot = await (await connection.execute(
            "SELECT slot,public_id,code FROM zero_campaign_slots "
            "WHERE campaign_id=? AND drop_id=? AND claimant_key IS NULL "
            "ORDER BY slot LIMIT 1",
            (CAMPAIGN_ID, drop_id),
        )).fetchone()
        if not slot:
            raise CampaignError("sold_out", 409)
        changed = await connection.execute(
            "UPDATE zero_campaign_slots SET claimant_key=?,claimed_at=? "
            "WHERE campaign_id=? AND drop_id=? AND slot=? AND claimant_key IS NULL",
            (claimant, now, CAMPAIGN_ID, drop_id, slot["slot"]),
        )
        if changed.rowcount != 1:
            raise CampaignError("claim_race", 409)
        await connection.execute(
            "INSERT INTO zero_campaign_claims"
            "(campaign_id,claimant_key,drop_id,slot,public_id,code,request_id,claimed_at,terms_version) "
            "VALUES(?,?,?,?,?,?,?,?,?)",
            (CAMPAIGN_ID, claimant, drop_id, slot["slot"], slot["public_id"],
             slot["code"], request_id, now, campaign["terms_version"]),
        )
        row = {"drop_id": drop_id, "public_id": slot["public_id"],
               "code": slot["code"], "claimed_at": now}
        remaining = await _remaining(connection, drop_id)
        return _claim_response(row, campaign, remaining, repeated=False)


async def reserve_nonce(nonce: str, now_epoch: int) -> None:
    """Commit replay protection independently of the claim outcome.

    A rejected early or sold-out request must still consume its signed nonce;
    otherwise the same authenticated payload could be replayed later within the
    signature tolerance window and unexpectedly win a slot.
    """
    async with db.transaction() as connection:
        await connection.execute(
            "DELETE FROM zero_campaign_nonces WHERE seen_at<?",
            (now_epoch - NONCE_RETENTION_SECONDS,),
        )
        try:
            await connection.execute(
                "INSERT INTO zero_campaign_nonces(nonce,seen_at) VALUES(?,?)",
                (nonce, now_epoch),
            )
        except sqlite3.IntegrityError as exc:
            raise CampaignError("replayed_nonce", 409) from exc


async def _remaining(connection, drop_id: str) -> int:
    row = await (await connection.execute(
        "SELECT COUNT(*) FROM zero_campaign_slots "
        "WHERE campaign_id=? AND drop_id=? AND claimant_key IS NULL",
        (CAMPAIGN_ID, drop_id),
    )).fetchone()
    return int(row[0] or 0)


def _claim_response(row, campaign, remaining: int, *, repeated: bool) -> dict[str, Any]:
    return {
        "ok": True, "state": "claimed", "repeated": repeated,
        "campaign_id": CAMPAIGN_ID, "drop_id": row["drop_id"],
        "public_id": row["public_id"], "code": row["code"],
        "claimed_at": row["claimed_at"] + "Z", "remaining": remaining,
        "amount": int(campaign["amount"]),
        "min_price": int(campaign["min_price"]),
        "expires_at": str(campaign["expires_at"]) + "Z",
        "terms_version": campaign["terms_version"],
    }
