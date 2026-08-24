from __future__ import annotations

import asyncio
import hashlib
import re
import sqlite3
import sys
import tempfile
import unittest
from contextlib import asynccontextmanager, closing
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[1]))

from install_promo_campaign import (  # noqa: E402
    CAMPAIGN_CODE,
    CAMPAIGN_END,
    CAMPAIGN_END_AT,
    CAMPAIGN_FAMILY,
    CAMPAIGN_SCHEMA,
    DB_HELPERS,
    DB_MARKER,
    PROMO_MARKER,
    RETENTION_ISSUE_END,
    WEBAPP_MARKER,
    campaign_discount,
    check_install,
    install,
    migrate_campaign_db,
    patch_db,
    patch_promo,
    patch_webapp,
    rollback,
    sha256,
    sha256_text,
)


class AsyncCursor:
    def __init__(self, cursor):
        self.cursor = cursor
        self.rowcount = cursor.rowcount

    async def fetchone(self):
        return self.cursor.fetchone()

    async def fetchall(self):
        return self.cursor.fetchall()


class AsyncConnection:
    def __init__(self, connection):
        self.connection = connection

    async def execute(self, sql, args=()):
        return AsyncCursor(self.connection.execute(sql, tuple(args)))


def executed_db_helpers(path: Path):
    raw = sqlite3.connect(path, isolation_level=None)
    raw.row_factory = sqlite3.Row
    wrapper = AsyncConnection(raw)

    @asynccontextmanager
    async def transaction():
        raw.execute("BEGIN IMMEDIATE")
        try:
            yield wrapper
            raw.commit()
        except Exception:
            raw.rollback()
            raise

    namespace = {
        "Any": Any,
        "datetime": datetime,
        "timedelta": timedelta,
        "timezone": timezone,
        "hashlib": hashlib,
        "re": re,
        "transaction": transaction,
        "conn": lambda: wrapper,
        "now_iso": lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
    }
    exec(DB_HELPERS, namespace)
    return raw, wrapper, namespace


WEBAPP_SOURCE = '''from __future__ import annotations
import secrets
from datetime import datetime, timedelta, timezone

async def promo_check(request):
    return None

# ------------------------------------------------- код возврата к заявке

# Экономика согласована требованием «не в ущерб»: −5% с потолком 1 000 ₽
# (мягче подписки «Салон+», с которой всё равно не суммируется), только для
# работ от 5 000 ₽ (дешёвые услуги и рефераты — мимо), срок 3 дня, код
# одноразовый + серия «exit» не выдаётся к применению дважды одному клиенту.
EXIT_PCT, EXIT_CAP, EXIT_MIN_PRICE, EXIT_DAYS = 5, 1000, 5000, 3
EXIT_IP_PER_DAY = 3        # NAT общежития — не 1; фермить смысла нет, код-то один на клиента
EXIT_GLOBAL_PER_DAY = 40   # стоп-кран: больше 40 кодов в сутки — что-то пошло не так
_EXIT_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"  # без похожих 0/O, 1/I/L


async def promo_exit_grant(request):
    """Гость уходит с недооформленной заявкой — выписываем персональный код.

    Код криптослучайный (перебор бессмыслен), одноразовый, короткоживущий;
    лимиты на IP и на сутки, рубильник — /promo exit off в боте.
    """
    return None

def build_app(bot):
    app = type("App", (), {})()
    r = app.router
    r.add_post("/api/promo/check", promo_check)
    r.add_post("/api/promo/exit", promo_exit_grant)
    r.add_get("/api/quote/{token}", quote_get)
    return app
'''

DB_SOURCE = '''from __future__ import annotations
import hashlib
import json
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS promos(
  code TEXT PRIMARY KEY,
  pct INTEGER,
  amount INTEGER,
  cap INTEGER,
  min_price INTEGER DEFAULT 0,
  uses_left INTEGER,
  expires_at TEXT,
  active INTEGER DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS quote_drafts(
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resumed_at TEXT
);
"""

MIGRATE_COLUMNS = {
    "promos": [
        ("family", "TEXT"),
    ],
}

def _prepare_order_fields(fields: dict[str, Any]) -> dict[str, Any]:
    prepared = dict(fields)
    return prepared

async def create_order(_outbox: str | None = None, **f) -> int:
    if not _db_path:
        raise RuntimeError("db.init() не вызван")
    f = _prepare_order_fields(f)
    ts = now_iso()
    keys = list(f.keys()) + ["created_at", "updated_at"]
    vals = list(f.values()) + [ts, ts]
    c = await aiosqlite.connect(_db_path)
    try:
        c.row_factory = aiosqlite.Row
        await c.execute("PRAGMA foreign_keys=ON")
        await c.execute("PRAGMA busy_timeout=5000")
        await c.execute("PRAGMA journal_mode=WAL")
        await c.execute("BEGIN IMMEDIATE")
        sql = f"INSERT INTO orders({','.join(keys)}) VALUES({','.join('?' * len(vals))})"
        cur = await c.execute(sql, vals)
        order_id = int(cur.lastrowid)
        await c.execute(
            "INSERT INTO order_events(order_id,kind,data,created_at) VALUES(?,?,?,?)",
            (order_id, "created", (f.get("source") or "bot")[:500], ts),
        )
        if _outbox:
            await c.execute(_outbox_insert_sql(), (order_id, _outbox, ts, ts, ts))
        await c.commit()
    except Exception:
        await c.rollback()
        raise
    finally:
        await c.close()
    bus_bump()
    return order_id

async def create_order_bundle(items: list[dict], _outbox: str | None = None, **f) -> int:
    if not _db_path:
        raise RuntimeError("db.init() не вызван")
    f = _prepare_order_fields(f)
    ts = now_iso()
    keys = list(f.keys()) + ["created_at", "updated_at"]
    vals = list(f.values()) + [ts, ts]
    c = await aiosqlite.connect(_db_path)
    try:
        c.row_factory = aiosqlite.Row
        await c.execute("PRAGMA foreign_keys=ON")
        await c.execute("PRAGMA busy_timeout=5000")
        await c.execute("PRAGMA journal_mode=WAL")
        await c.execute("BEGIN IMMEDIATE")
        sql = f"INSERT INTO orders({','.join(keys)}) VALUES({','.join('?' * len(vals))})"
        cur = await c.execute(sql, vals)
        order_id = int(cur.lastrowid)
        for pos, item in enumerate(items, 1):
            await c.execute("INSERT INTO order_items(order_id,position) VALUES(?,?)", (order_id, pos))
        await c.execute(
            "INSERT INTO order_events(order_id,kind,data,created_at) VALUES(?,?,?,?)",
            (order_id, "created", f.get("source") or "bot", ts),
        )
        if _outbox:
            await c.execute(_outbox_insert_sql(), (order_id, _outbox, ts, ts, ts))
        await c.commit()
    except Exception:
        await c.rollback()
        raise
    finally:
        await c.close()
    bus_bump()
    return order_id

async def promo_add(code: str, *, pct: int | None = None, amount: int | None = None,
                    cap: int | None = None, min_price: int = 0,
                    uses_left: int | None = None, expires_at: str | None = None,
                    note: str | None = None, family: str | None = None) -> None:
    await _exec(
        "INSERT INTO promos(code, pct, amount, cap, min_price, uses_left, expires_at,"
        " active, note, family, created_at) VALUES(?,?,?,?,?,?,?,1,?,?,?) "
        "ON CONFLICT(code) DO UPDATE SET pct=excluded.pct, amount=excluded.amount,"
        " cap=excluded.cap, min_price=excluded.min_price, uses_left=excluded.uses_left,"
        " expires_at=excluded.expires_at, active=1, note=excluded.note,"
        " family=excluded.family",
        (code.strip().upper(), pct, amount, cap, min_price, uses_left, expires_at,
         note, family, now_iso()))
'''

PROMO_SOURCE = '''from __future__ import annotations

def calc(p, price: int) -> int:
    """Сумма скидки кода для цены (без учёта правил валидности)."""
    if not price or price <= 0:
        return 0
    if p["amount"]:
        return max(0, min(int(p["amount"]), price))
    disc = round(price * int(p["pct"] or 0) / 100)
    if p["cap"]:
        disc = min(disc, int(p["cap"]))
    return max(0, min(disc, price))

def label(p) -> str:
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

async def apply(order_id: int) -> int:
    o = await db.get_order(order_id)
    if not o or not o["price"]:
        return 0
    code = (o["promo_code"] or "").strip()
    if not code:
        return 0
    prev = int(o["promo_discount"] or 0)
    p = await db.promo_get(code)
    bad = why_invalid(p, o["price"]) if p is not None else "not_found"
    if bad and not (prev > 0 and bad == "used_up"):
        return 0
    if prev == 0 and p["family"] and await db.promo_family_used(
            p["family"], o["user_id"], o["guest_contact"], exclude_order=order_id):
        return 0
    disc = calc(p, o["price"])
    sub_disc = int(o["subscription_discount"] or 0)
    if sub_disc >= disc:
        if prev:
            await db.update_order(order_id, promo_discount=0)
        return 0
    if sub_disc:
        await db.update_order(order_id, subscription_discount=0)
    return disc
'''


def prepare_database(path: Path) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.executescript(
            '''
            CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT, phone TEXT, username TEXT, created_at TEXT NOT NULL);
            CREATE TABLE orders(
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              user_id INTEGER,
              guest_contact TEXT,
              promo_code TEXT,
              created_at TEXT NOT NULL
            );
            CREATE TABLE promos(
              code TEXT PRIMARY KEY, pct INTEGER, amount INTEGER, cap INTEGER,
              min_price INTEGER DEFAULT 0, uses_left INTEGER, expires_at TEXT,
              active INTEGER DEFAULT 1, note TEXT, family TEXT, created_at TEXT NOT NULL
            );
            CREATE TABLE subscriptions(id INTEGER PRIMARY KEY, user_id INTEGER);
            CREATE TABLE deposits(id INTEGER PRIMARY KEY, user_id INTEGER);
            CREATE TABLE gifts(id INTEGER PRIMARY KEY, buyer_user_id INTEGER);
            CREATE TABLE bonus_ledger(id INTEGER PRIMARY KEY, user_id INTEGER);
            CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT);
            ''',
        )
        conn.commit()
    finally:
        conn.close()


class CampaignEconomicsTest(unittest.TestCase):
    def test_schedule_boundaries_and_monotonicity(self):
        self.assertEqual(
            datetime.fromisoformat(CAMPAIGN_END_AT)
            - datetime.fromisoformat(RETENTION_ISSUE_END),
            timedelta(hours=72),
        )
        self.assertEqual(CAMPAIGN_END_AT, "2026-09-21T20:59:59")
        self.assertEqual(RETENTION_ISSUE_END, "2026-09-18T20:59:59")
        self.assertEqual(campaign_discount("welcome", 2499), 0)
        self.assertEqual(campaign_discount("welcome", 2500), 50)
        self.assertEqual(campaign_discount("welcome", 124999), 2500)
        self.assertEqual(campaign_discount("welcome", 125000), 2500)
        self.assertEqual(campaign_discount("retention", 4999), 0)
        self.assertEqual(campaign_discount("retention", 5000), 50)
        self.assertEqual(campaign_discount("retention", 99999), 1000)
        self.assertEqual(campaign_discount("retention", 100000), 1000)
        for kind in ("welcome", "retention"):
            minimum = 2500 if kind == "welcome" else 5000
            prior_discount = 0
            prior_final = minimum - campaign_discount(kind, minimum)
            for price in range(0, 250001):
                amount = campaign_discount(kind, price)
                self.assertGreaterEqual(amount, prior_discount)
                if price >= minimum:
                    self.assertGreaterEqual(price - amount, prior_final)
                    prior_final = price - amount
                prior_discount = amount


class SourcePatchTest(unittest.TestCase):
    def test_patches_are_idempotent_compilable_and_fail_closed(self):
        webapp = patch_webapp(WEBAPP_SOURCE)
        db = patch_db(DB_SOURCE)
        promo = patch_promo(PROMO_SOURCE)
        for marker, source, patcher in (
            (WEBAPP_MARKER, webapp, patch_webapp),
            (DB_MARKER, db, patch_db),
            (PROMO_MARKER, promo, patch_promo),
        ):
            self.assertEqual(source.count(marker), 1)
            self.assertEqual(patcher(source), source)
            compile(source, "candidate.py", "exec")
        self.assertIn('"Cache-Control": "private, no-store"', webapp)
        self.assertIn('state = "owner_preview"', webapp)
        self.assertIn('state = "provisional"', webapp)
        self.assertIn('surface == "kladovaya"', webapp)
        self.assertIn('PROMO_KLADOVAYA_ORIGINS', webapp)
        self.assertIn('"state": "active" if active else "unknown"', webapp)
        self.assertIn('PROMO_INTENT_COOKIE', webapp)
        self.assertIn('promo_retention_issue', webapp)
        self.assertIn(f'RETENTION_ISSUE_END = "{RETENTION_ISSUE_END}"', webapp)
        self.assertIn('promo_campaign", "off"', webapp)
        self.assertIn('return _err("promo_ineligible", 409)', webapp)
        self.assertIn('active_seconds_bucket', webapp)
        self.assertNotIn('b.get("topic")', webapp)
        self.assertIn('promo_first_order_claims', db)
        self.assertIn('_promo_claim_validate', db)
        self.assertIn('_promo_claim_store', db)
        self.assertNotIn('floor_amount', promo)
        self.assertIn('promo_claim_matches', promo)
        self.assertIn('if sub_disc >= disc:', promo)
        self.assertIn('subscription_discount=0', promo)

    def test_unknown_anchor_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "anchor"):
            patch_webapp(WEBAPP_SOURCE.replace('r.add_post("/api/promo/check"', 'r.add_post("/api/promo/check-v2"'))
        with self.assertRaisesRegex(RuntimeError, "anchor"):
            patch_db(DB_SOURCE.replace('async def create_order(', 'async def create_order_v2('))
        with self.assertRaisesRegex(RuntimeError, "anchor"):
            patch_promo(PROMO_SOURCE.replace('def calc(', 'def calc_v2('))


class DatabaseContractTest(unittest.TestCase):
    def test_migration_seeds_exact_bounded_campaign_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "salon.db"
            prepare_database(path)
            first = migrate_campaign_db(path)
            second = migrate_campaign_db(path)
            self.assertTrue(first["changed"])
            self.assertFalse(second["changed"])
            conn = sqlite3.connect(path)
            conn.row_factory = sqlite3.Row
            try:
                promo = conn.execute("SELECT * FROM promos WHERE code=?", (CAMPAIGN_CODE,)).fetchone()
                self.assertEqual(promo["family"], CAMPAIGN_FAMILY)
                self.assertEqual(promo["pct"], 2)
                self.assertEqual(promo["cap"], 2500)
                self.assertEqual(promo["min_price"], 2500)
                self.assertEqual(promo["expires_at"], CAMPAIGN_END)
                self.assertEqual(conn.execute("SELECT value FROM settings WHERE key='promo_campaign'").fetchone()[0], "on")
            finally:
                conn.close()

    def test_claim_uniqueness_survives_two_concurrent_writers(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "salon.db"
            prepare_database(path)
            migrate_campaign_db(path)

            def claim(index: int) -> str:
                conn = sqlite3.connect(path, timeout=5, isolation_level=None)
                try:
                    conn.execute("BEGIN IMMEDIATE")
                    order_id = conn.execute(
                        "INSERT INTO orders(user_id,guest_contact,promo_code,created_at) VALUES(NULL,?,?,?)",
                        ("new@example.test", CAMPAIGN_CODE, f"2026-08-24T00:00:0{index}"),
                    ).lastrowid
                    conn.execute(
                        "INSERT INTO promo_first_order_claims(family,code,user_id,contact_key,order_id,created_at) "
                        "VALUES(?,?,NULL,?,?,?)",
                        (CAMPAIGN_FAMILY, CAMPAIGN_CODE, "new@example.test", order_id,
                         "2026-08-24T00:00:00"),
                    )
                    conn.commit()
                    return "ok"
                except sqlite3.IntegrityError:
                    conn.rollback()
                    return "conflict"
                finally:
                    conn.close()

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = sorted(pool.map(claim, (1, 2)))
            self.assertEqual(results, ["conflict", "ok"])
            conn = sqlite3.connect(path)
            try:
                self.assertEqual(conn.execute("SELECT count(*) FROM promo_first_order_claims").fetchone()[0], 1)
                self.assertEqual(conn.execute("SELECT count(*) FROM orders").fetchone()[0], 1)
            finally:
                conn.close()

    def test_executed_helpers_bind_retention_and_claim_order_atomically(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "salon.db"
            prepare_database(path)
            migrate_campaign_db(path)
            raw, wrapper, helper = executed_db_helpers(path)

            async def scenario():
                token = "pi1_" + "a" * 40
                copied_token = "pi1_" + "b" * 40
                self.assertTrue(await helper["promo_intent_start"](token))
                raw.execute(
                    "UPDATE promo_campaign_intents SET created_at=datetime('now','-61 seconds')"
                )
                grant, error = await helper["promo_retention_issue"](
                    token, "AS-RBOUND001", daily_limit=40
                )
                self.assertIsNone(error)
                self.assertEqual(grant["code"], "AS-RBOUND001")
                self.assertTrue(await helper["promo_retention_valid"]("AS-RBOUND001", token))
                self.assertFalse(
                    await helper["promo_retention_valid"]("AS-RBOUND001", copied_token)
                )

                claim = {
                    "family": CAMPAIGN_FAMILY,
                    "code": "AS-RBOUND001",
                    "user_id": None,
                    "contact": "+7 (999) 123-45-67",
                    "token_hash": helper["_promo_token_hash"](token),
                }
                raw.execute("BEGIN IMMEDIATE")
                try:
                    await helper["_promo_claim_validate"](wrapper, claim)
                    order_id = raw.execute(
                        "INSERT INTO orders(user_id,guest_contact,promo_code,created_at) "
                        "VALUES(NULL,?,?,?)",
                        (claim["contact"], claim["code"], "2026-08-24T00:00:00"),
                    ).lastrowid
                    await helper["_promo_claim_store"](
                        wrapper, claim, order_id, "2026-08-24T00:00:00"
                    )
                    raw.commit()
                except Exception:
                    raw.rollback()
                    raise
                consumed = raw.execute(
                    "SELECT consumed_order_id FROM promo_retention_grants WHERE code=?",
                    (claim["code"],),
                ).fetchone()[0]
                self.assertEqual(consumed, order_id)
                self.assertFalse(await helper["promo_retention_valid"](claim["code"], token))

                raw.execute(
                    "INSERT INTO promo_campaign_intents(token_hash,created_at,expires_at) "
                    "VALUES(?,datetime('now','-61 seconds'),datetime('now','+72 hours'))",
                    (helper["_promo_token_hash"](copied_token),),
                )
                with self.assertRaisesRegex(helper["PromoEligibilityError"], "not bound"):
                    await helper["_promo_claim_validate"](wrapper, {
                        **claim,
                        "contact": "new-person@example.test",
                        "contact_key": None,
                        "token_hash": helper["_promo_token_hash"](copied_token),
                    })

            try:
                asyncio.run(scenario())
            finally:
                raw.close()

    def test_executed_helpers_enforce_switch_and_contact_canonicalization(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "salon.db"
            prepare_database(path)
            migrate_campaign_db(path)
            raw, wrapper, helper = executed_db_helpers(path)

            async def scenario():
                self.assertEqual(
                    helper["_promo_contact_normalized"]("Telegram: https://t.me/Foo_Bar"),
                    helper["_promo_contact_normalized"]("@foo_bar"),
                )
                self.assertEqual(
                    helper["_promo_contact_normalized"]("ВК: https://vk.com/Id123"),
                    helper["_promo_contact_normalized"]("ВК: id123"),
                )
                self.assertEqual(
                    helper["_promo_contact_normalized"]("ВК: https://vk.me/Id123"),
                    helper["_promo_contact_normalized"]("ВК: id123"),
                )
                raw.execute(
                    "INSERT INTO orders(user_id,guest_contact,promo_code,created_at) "
                    "VALUES(NULL,?,NULL,?)",
                    ("+7 (999) 123-45-67", "2026-08-01T00:00:00"),
                )
                claim = {
                    "family": CAMPAIGN_FAMILY,
                    "code": CAMPAIGN_CODE,
                    "user_id": None,
                    "contact": "8 999 123 45 67",
                }
                with self.assertRaisesRegex(helper["PromoEligibilityError"], "existing contact"):
                    await helper["_promo_claim_validate"](wrapper, claim)

                raw.execute(
                    "INSERT INTO orders(user_id,guest_contact,promo_code,created_at) "
                    "VALUES(NULL,?,NULL,?)",
                    ("Telegram: https://t.me/OldGuest", "2026-08-01T00:00:00"),
                )
                raw.execute(
                    "INSERT INTO users(id,email,phone,username,created_at) VALUES(?,?,?,?,?)",
                    (1, "fresh@example.test", None, "fresh_user", "2026-08-24T00:00:01"),
                )
                with self.assertRaisesRegex(helper["PromoEligibilityError"], "existing contact"):
                    await helper["_promo_claim_validate"](wrapper, {
                        **claim, "user_id": 1, "contact": "@oldguest",
                    })

                raw.execute(
                    "INSERT INTO orders(user_id,guest_contact,promo_code,created_at) "
                    "VALUES(NULL,?,NULL,?)",
                    ("historic+old@example.test", "2026-08-01T00:00:00"),
                )
                raw.execute(
                    "INSERT INTO users(id,email,phone,username,created_at) VALUES(?,?,?,?,?)",
                    (2, "historic@example.test", None, "new_handle", "2026-08-24T00:00:02"),
                )
                with self.assertRaisesRegex(helper["PromoEligibilityError"], "existing contact"):
                    await helper["_promo_claim_validate"](wrapper, {
                        **claim, "user_id": 2, "contact": "historic@example.test",
                    })
                self.assertEqual(await helper["promo_customer_state"](
                    2, "2026-08-24T00:00:00"
                ), "existing")

                raw.execute(
                    "INSERT INTO users(id,email,phone,username,created_at) VALUES(?,?,?,?,?)",
                    (3, "brand-new@example.test", None, "brand_new", "2026-08-24T00:00:03"),
                )
                # The ordinary 300-point Telegram welcome accrual is compatible
                # with the public rules and must not turn a new account into an
                # old customer before its first work order.
                raw.execute("INSERT INTO bonus_ledger(user_id) VALUES(?)", (3,))
                self.assertEqual(await helper["promo_customer_state"](
                    3, "2026-08-24T00:00:00"
                ), "eligible")
                await helper["_promo_claim_validate"](wrapper, {
                    **claim, "user_id": 3, "contact": "brand-new@example.test",
                })

                raw.execute(
                    "INSERT INTO users(id,email,phone,username,created_at) VALUES(?,?,?,?,?)",
                    (4, "older-account@example.test", "+7 (901) 555-44-33", "shared_name",
                     "2026-08-01T00:00:00"),
                )
                raw.execute(
                    "INSERT INTO users(id,email,phone,username,created_at) VALUES(?,?,?,?,?)",
                    (5, "new-phone@example.test", "8 901 555 44 33", "unique_name",
                     "2026-08-24T00:00:05"),
                )
                self.assertEqual(await helper["promo_customer_state"](
                    5, "2026-08-24T00:00:00"
                ), "existing")
                with self.assertRaisesRegex(helper["PromoEligibilityError"], "existing contact"):
                    await helper["_promo_claim_validate"](wrapper, {
                        **claim, "user_id": 5, "contact": "new-phone@example.test",
                    })

                raw.execute(
                    "INSERT INTO users(id,email,phone,username,created_at) VALUES(?,?,?,?,?)",
                    (6, "new-handle@example.test", None, "@shared_name",
                     "2026-08-24T00:00:06"),
                )
                self.assertEqual(await helper["promo_customer_state"](
                    6, "2026-08-24T00:00:00"
                ), "existing")

                raw.execute("UPDATE settings SET value='off' WHERE key='promo_campaign'")
                with self.assertRaisesRegex(helper["PromoEligibilityError"], "campaign off"):
                    await helper["_promo_claim_validate"](wrapper, claim)

            try:
                asyncio.run(scenario())
            finally:
                raw.close()


class InstallerLifecycleTest(unittest.TestCase):
    def test_exact_backup_apply_and_rollback_include_sources_and_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            root = base / "root"
            app = root / "app"
            services = app / "services"
            services.mkdir(parents=True)
            (app / "webapp.py").write_text(WEBAPP_SOURCE, encoding="utf-8")
            (app / "db.py").write_text(DB_SOURCE, encoding="utf-8")
            (services / "promo.py").write_text(PROMO_SOURCE, encoding="utf-8")
            database = root / "salon.db"
            prepare_database(database)
            before = {
                "webapp": sha256(app / "webapp.py"),
                "db": sha256(app / "db.py"),
                "promo": sha256(services / "promo.py"),
            }
            expected_after = {
                "webapp": sha256_text(patch_webapp(WEBAPP_SOURCE)),
                "db": sha256_text(patch_db(DB_SOURCE)),
                "promo": sha256_text(patch_promo(PROMO_SOURCE)),
            }
            preview = check_install(
                root,
                database=database,
                expected_before=before,
                expected_after=expected_after,
            )
            self.assertTrue(preview["changed"])
            self.assertEqual(preview["source_state"], "ready")
            now = datetime(2026, 8, 24, 0, 0, tzinfo=timezone.utc)
            result = install(
                root,
                base / "backups",
                database=database,
                expected_before=before,
                expected_after=expected_after,
                now=now,
            )
            self.assertTrue(result["changed"])
            backup = Path(result["backup"])
            self.assertTrue((backup / "salon.db").is_file())
            installed_preview = check_install(
                root,
                database=database,
                expected_before=before,
                expected_after=expected_after,
            )
            self.assertFalse(installed_preview["changed"])
            self.assertTrue(installed_preview["database_current"])
            again = install(
                root,
                base / "backups",
                database=database,
                expected_before=before,
                expected_after=expected_after,
                now=now,
            )
            self.assertFalse(again["changed"])
            with closing(sqlite3.connect(database)) as live:
                live.execute(
                    "INSERT INTO orders(user_id,guest_contact,promo_code,created_at) "
                    "VALUES(NULL,?,NULL,?)",
                    ("after-backup@example.test", "2026-08-24T12:00:00"),
                )
                live.commit()
            rolled = rollback(
                root,
                backup,
                database=database,
                expected_before=before,
                expected_after=expected_after,
            )
            self.assertTrue(rolled["rolled_back"])
            self.assertEqual(rolled["database"], "preserved")
            with closing(sqlite3.connect(database)) as live:
                self.assertEqual(
                    live.execute(
                        "SELECT COUNT(*) FROM orders WHERE guest_contact=?",
                        ("after-backup@example.test",),
                    ).fetchone()[0],
                    1,
                )
                self.assertEqual(
                    live.execute(
                        "SELECT value FROM settings WHERE key='promo_campaign'"
                    ).fetchone()[0],
                    "off",
                )
            for name, digest in before.items():
                target = {
                    "webapp": app / "webapp.py",
                    "db": app / "db.py",
                    "promo": services / "promo.py",
                }[name]
                self.assertEqual(sha256(target), digest)
            (app / "webapp.py").write_text(
                WEBAPP_SOURCE + "\n# unpinned drift\n", encoding="utf-8"
            )
            with self.assertRaisesRegex(RuntimeError, "unknown or mixed source state"):
                check_install(
                    root,
                    database=database,
                    expected_before=before,
                    expected_after=expected_after,
                )


if __name__ == "__main__":
    unittest.main()
