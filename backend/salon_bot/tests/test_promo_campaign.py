from __future__ import annotations

import asyncio
import hashlib
import json
import re
import sqlite3
import sys
import tempfile
import unittest
from contextlib import asynccontextmanager, closing
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from threading import Barrier
from types import SimpleNamespace
from typing import Any

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[1]))

import install_promo_campaign as installer_module  # noqa: E402
from install_promo_campaign import (  # noqa: E402
    CAMPAIGN_CODE,
    CAMPAIGN_END,
    CAMPAIGN_END_AT,
    CAMPAIGN_FAMILY,
    CAMPAIGN_SCHEMA,
    DB_ECONOMICS_HELPERS,
    DB_HELPERS,
    DB_MARKER,
    ECONOMICS_MARKER,
    AGGREGATE_BONUS_MARKER,
    AGGREGATE_ORDERS_MARKER,
    AGGREGATE_PROMO_MARKER,
    AGGREGATE_SUBS_MARKER,
    AGGREGATE_WEB_MARKER,
    PROMO_MARKER,
    RETENTION_ISSUE_END,
    WEBAPP_MARKER,
    _restore_campaign_state,
    _suspend_campaign_with_snapshot,
    _assert_no_open_discount_anomalies,
    campaign_discount,
    check_campaign_economics,
    check_install,
    enable_campaign_economics,
    finalize_campaign_economics,
    install,
    migrate_campaign_db,
    migrate_campaign_economics,
    patch_db,
    patch_db_economics_v2,
    patch_bonus_aggregate_v2,
    patch_my_orders_aggregate_v2,
    patch_promo,
    patch_promo_aggregate_v2,
    patch_subs_aggregate_v2,
    patch_webapp,
    patch_webapp_aggregate_v2,
    rollback,
    rollback_campaign_economics,
    sha256,
    sha256_text,
    upgrade_campaign_economics,
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


def executed_db_economics_helpers(path: Path):
    raw = sqlite3.connect(path, timeout=5, isolation_level=None)
    raw.row_factory = sqlite3.Row
    raw.execute("PRAGMA busy_timeout=5000")
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
        "datetime": datetime,
        "timedelta": timedelta,
        "timezone": timezone,
        "transaction": transaction,
        "now_iso": lambda: datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"),
    }
    exec(DB_ECONOMICS_HELPERS, namespace)
    return raw, namespace


WEBAPP_SOURCE = '''from __future__ import annotations
import secrets
from datetime import datetime, timedelta, timezone

def bonus_view(o):
    d = {}
    if o:
        d["bonus_cap"] = 0 if subs.is_sub_order(o) else bonus.spend_cap(o["price"])
    return d

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


BONUS_SOURCE = '''from __future__ import annotations

# --------------------------------------------------------------- списание

def spend_cap(price: int | None, sub_discount: int = 0) -> int:
    """Максимум бонусов к заказу: ≤20% цены И ≤25% вместе со скидкой подписки."""
    if not price or price < config.BONUS_MIN_ORDER:
        return 0
    pct_cap = price * config.BONUS_SPEND_CAP_PCT // 100
    joint_room = max(price * 25 // 100 - (sub_discount or 0), 0)
    return min(pct_cap, joint_room)

async def apply_to_order(user_id: int, order, amount: int) -> tuple[bool, str, int]:
    if (order["work_type"] or "").startswith("sub_"):
        return False, "bonus_not_for_subs", 0
    if order["status"] not in ("priced", "prepay"):
        return False, "bonus_stage", 0
    payments = await db.payments_for_order(order["id"])
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

async def restore_for_order(order, note: str = "возврат по заказу") -> int:
    return 0
'''


MY_ORDERS_SOURCE = '''from __future__ import annotations

async def choose_bonus(o):
    cap = bonus.spend_cap(o["price"])
    return cap
'''


SUBS_SOURCE = '''from __future__ import annotations

async def apply_discount(order_id: int) -> int:
    o = await db.get_order(order_id)
    if not o or not o["user_id"] or not o["price"] or is_sub_order(o):
        return 0
    sub = await db.sub_active(o["user_id"])
    if not sub or not sub["discount_pct"]:
        if (o["sub_discount"] or 0) != 0:
            await db.update_order(order_id, sub_discount=0)
        return 0
    price = o["price"]
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
              status TEXT DEFAULT 'new',
              work_type TEXT,
              price INTEGER,
              bonus_spent INTEGER DEFAULT 0,
              sub_discount INTEGER DEFAULT 0,
              promo_discount INTEGER DEFAULT 0,
              updated_at TEXT,
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
            CREATE TABLE bonus_ledger(
              id INTEGER PRIMARY KEY, user_id INTEGER, delta INTEGER,
              consumed INTEGER DEFAULT 0, kind TEXT, note TEXT,
              order_id INTEGER, expires_at TEXT, created_at TEXT
            );
            CREATE TABLE order_events(
              id INTEGER PRIMARY KEY, order_id INTEGER, kind TEXT,
              data TEXT, created_at TEXT
            );
            CREATE TABLE payments(
              id INTEGER PRIMARY KEY, order_id INTEGER, status TEXT
            );
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
        self.assertEqual(campaign_discount("welcome", 2500), 300)
        self.assertEqual(campaign_discount("welcome", 5000), 600)
        self.assertEqual(campaign_discount("welcome", 10000), 1200)
        self.assertEqual(campaign_discount("welcome", 20000), 2400)
        self.assertEqual(campaign_discount("welcome", 41666), 5000)
        self.assertEqual(campaign_discount("welcome", 41667), 5000)
        self.assertEqual(campaign_discount("retention", 4999), 0)
        self.assertEqual(campaign_discount("retention", 5000), 500)
        self.assertEqual(campaign_discount("retention", 10000), 1000)
        self.assertEqual(campaign_discount("retention", 20000), 2000)
        self.assertEqual(campaign_discount("retention", 24999), 2500)
        self.assertEqual(campaign_discount("retention", 25000), 2500)
        for kind in ("welcome", "retention"):
            minimum = 2500 if kind == "welcome" else 5000
            prior_discount = 0
            prior_final = minimum - campaign_discount(kind, minimum)
            for price in range(0, 250001):
                amount = campaign_discount(kind, price)
                self.assertGreaterEqual(amount, prior_discount)
                if price >= minimum:
                    self.assertGreaterEqual(price - amount, prior_final)
                    max_share = 0.12 if kind == "welcome" else 0.10
                    self.assertLessEqual(amount, int(price * max_share + 0.999999))
                    prior_final = price - amount
                prior_discount = amount

    def test_aggregate_bonus_cap_uses_best_discount_and_never_exceeds_25_percent(self):
        namespace = {
            "config": SimpleNamespace(
                BONUS_MIN_ORDER=2500, BONUS_SPEND_CAP_PCT=20,
            ),
        }
        exec(patch_bonus_aggregate_v2(BONUS_SOURCE), namespace)
        spend_cap = namespace["spend_cap"]
        self.assertEqual(spend_cap(None), 0)
        self.assertEqual(spend_cap(2499), 0)
        self.assertEqual(spend_cap(30000), 6000)
        self.assertEqual(spend_cap(30000, 3000, 3600), 3900)
        self.assertEqual(spend_cap(30000, 4000, 3600), 3500)
        for price in range(2500, 100001, 137):
            for subscription, promo in ((0, 0), (price // 10, 0), (0, price * 12 // 100)):
                points = spend_cap(price, subscription, promo)
                self.assertLessEqual(points, price * 20 // 100)
                self.assertLessEqual(
                    points + max(subscription, promo), price * 25 // 100
                )


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
        self.assertIn('sub_discount=0', promo)

        economics = patch_db_economics_v2(db)
        self.assertEqual(economics.count(ECONOMICS_MARKER), 1)
        self.assertEqual(patch_db_economics_v2(economics), economics)
        self.assertIn(
            'VALUES(?,10,NULL,2500,5000,1,?,1,?,?,?)', economics
        )
        self.assertNotIn(
            'VALUES(?,1,NULL,1000,5000,1,?,1,?,?,?)', economics
        )
        self.assertIn("async def promo_bonus_reconcile", economics)
        self.assertIn("code: str | None = None", economics)
        self.assertIn("(? IS NULL OR code=?)", economics)
        compile(economics, "db-economics.py", "exec")

        aggregate_web = patch_webapp_aggregate_v2(webapp)
        aggregate_promo = patch_promo_aggregate_v2(promo)
        aggregate_bonus = patch_bonus_aggregate_v2(BONUS_SOURCE)
        aggregate_orders = patch_my_orders_aggregate_v2(MY_ORDERS_SOURCE)
        aggregate_subs = patch_subs_aggregate_v2(SUBS_SOURCE)
        for marker, source, patcher in (
            (AGGREGATE_WEB_MARKER, aggregate_web, patch_webapp_aggregate_v2),
            (AGGREGATE_PROMO_MARKER, aggregate_promo, patch_promo_aggregate_v2),
            (AGGREGATE_BONUS_MARKER, aggregate_bonus, patch_bonus_aggregate_v2),
            (AGGREGATE_ORDERS_MARKER, aggregate_orders, patch_my_orders_aggregate_v2),
            (AGGREGATE_SUBS_MARKER, aggregate_subs, patch_subs_aggregate_v2),
        ):
            self.assertEqual(source.count(marker), 1)
            self.assertEqual(patcher(source), source)
            compile(source, "aggregate-candidate.py", "exec")
        self.assertIn(
            'return await db.promo_bonus_reconcile(',
            aggregate_bonus,
        )
        self.assertNotIn("async with db.transaction()", aggregate_bonus)
        self.assertIn("promo_allowed=False", aggregate_promo)
        self.assertIn("promo_allowed=True", aggregate_promo)
        self.assertIn("def why_invalid(", aggregate_promo)
        self.assertIn('"expired", "inactive", "used_up"', aggregate_promo)
        self.assertIn("code=code", aggregate_promo)
        self.assertNotIn("await db.promo_dec_uses(code)", aggregate_promo)
        self.assertNotIn(
            "await db.update_order(order_id, promo_discount=disc)",
            aggregate_promo,
        )
        self.assertIn("subscription_discount_reconcile", aggregate_subs)
        self.assertNotIn("room = max", aggregate_subs)
        self.assertIn("bonus_apply_with_aggregate_cap", aggregate_bonus)
        self.assertNotIn("await db.bonus_consume", aggregate_bonus)

    def test_invalid_promo_and_missing_subscription_use_atomic_reconciliation(self):
        promo_calls = []

        class PromoDb:
            family = None
            claimed = False
            active = True

            async def get_order(self, order_id):
                return {
                    "id": order_id, "user_id": 7, "guest_contact": None,
                    "price": 2000, "promo_code": "WELCOME12",
                    "promo_discount": 3600, "sub_discount": 0,
                }

            async def promo_get(self, _code):
                return {
                    "family": self.family, "active": self.active,
                    "uses_left": None, "expires_at": None,
                    "min_price": 2500,
                }

            async def promo_claim_matches(self, *_args, **_kwargs):
                return self.claimed

            async def promo_bonus_reconcile(
                    self, order_id, code, promo_allowed=True):
                promo_calls.append((order_id, code, promo_allowed))
                return {"promo_discount": 0, "error": ""}

        promo_db = PromoDb()
        promo_namespace = {
            "db": promo_db,
            "fmt_money": str,
            "datetime": datetime,
            "timezone": timezone,
        }
        exec(patch_promo_aggregate_v2(patch_promo(PROMO_SOURCE)), promo_namespace)
        self.assertEqual(asyncio.run(promo_namespace["apply"](71)), 0)
        self.assertEqual(promo_calls, [(71, "WELCOME12", False)])

        promo_calls.clear()
        promo_db.family = CAMPAIGN_FAMILY
        promo_db.claimed = True
        promo_db.active = False
        self.assertEqual(asyncio.run(promo_namespace["apply"](73)), 0)
        self.assertEqual(promo_calls, [(73, "WELCOME12", True)])

        subscription_calls = []

        class SubscriptionDb:
            async def get_order(self, order_id):
                return {
                    "id": order_id, "user_id": 7, "price": 2000,
                    "work_type": "coursework", "sub_discount": 4500,
                }

            async def sub_active(self, _user_id):
                return None

            async def subscription_discount_reconcile(
                    self, order_id, pct, cap, label, spend_pct):
                subscription_calls.append(
                    (order_id, pct, cap, label, spend_pct)
                )
                return {"sub_discount": 0, "error": ""}

        subscription_namespace = {
            "db": SubscriptionDb(),
            "config": SimpleNamespace(BONUS_SPEND_CAP_PCT=20),
            "is_sub_order": lambda _order: False,
            "plan_label": str,
        }
        exec(patch_subs_aggregate_v2(SUBS_SOURCE), subscription_namespace)
        self.assertEqual(asyncio.run(subscription_namespace["apply_discount"](72)), 0)
        self.assertEqual(subscription_calls, [(72, 0, None, "Салон+", 20)])

    def test_unknown_anchor_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "anchor"):
            patch_webapp(WEBAPP_SOURCE.replace('r.add_post("/api/promo/check"', 'r.add_post("/api/promo/check-v2"'))
        with self.assertRaisesRegex(RuntimeError, "anchor"):
            patch_db(DB_SOURCE.replace('async def create_order(', 'async def create_order_v2('))
        with self.assertRaisesRegex(RuntimeError, "anchor"):
            patch_promo(PROMO_SOURCE.replace('def calc(', 'def calc_v2('))
        with self.assertRaisesRegex(RuntimeError, "v1 db marker"):
            patch_db_economics_v2(DB_SOURCE)
        with self.assertRaisesRegex(RuntimeError, "aggregate bonus"):
            patch_bonus_aggregate_v2(BONUS_SOURCE.replace(
                "def spend_cap(price: int | None, sub_discount: int = 0)",
                "def spend_cap(price: int | None)",
            ))


class DatabaseContractTest(unittest.TestCase):
    def test_open_order_discount_preflight_fails_closed_without_exposing_rows(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "salon.db"
            prepare_database(path)
            with closing(sqlite3.connect(path)) as conn:
                conn.execute(
                    "INSERT INTO orders"
                    "(user_id,status,price,bonus_spent,sub_discount,promo_discount,"
                    "updated_at,created_at) VALUES(41,'priced',10000,1000,1000,1000,?,?)",
                    ("2026-08-24T00:00:00", "2026-08-24T00:00:00"),
                )
                conn.commit()
            with self.assertRaisesRegex(
                    RuntimeError,
                    r"stacked_open': 1.*over_cap_open': 1"):
                _assert_no_open_discount_anomalies(path)

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

    def test_economics_migration_upgrades_rows_and_preserves_operational_state(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "salon.db"
            prepare_database(path)
            migrate_campaign_db(path)
            with closing(sqlite3.connect(path)) as conn:
                order_id = conn.execute(
                    "INSERT INTO orders(user_id,guest_contact,promo_code,created_at) "
                    "VALUES(NULL,?,?,?)",
                    ("kept@example.test", "AS-RKEEP001", "2026-08-24T01:00:00"),
                ).lastrowid
                conn.execute(
                    "INSERT INTO promos(code,pct,amount,cap,min_price,uses_left,"
                    "expires_at,active,note,family,created_at) "
                    "VALUES(?,1,NULL,1000,5000,1,?,1,?,?,?)",
                    (
                        "AS-RKEEP001", "2026-08-27T01:00:00", "retention",
                        CAMPAIGN_FAMILY, "2026-08-24T01:00:00",
                    ),
                )
                conn.execute(
                    "INSERT INTO promo_retention_grants"
                    "(code,token_hash,created_at,expires_at,consumed_order_id) "
                    "VALUES(?,?,?,?,?)",
                    (
                        "AS-RKEEP001", "token-hash-kept", "2026-08-24T01:00:00",
                        "2026-08-27T01:00:00", order_id,
                    ),
                )
                conn.execute(
                    "INSERT INTO promo_first_order_claims"
                    "(family,code,user_id,contact_key,order_id,created_at) "
                    "VALUES(?,?,NULL,?,?,?)",
                    (
                        CAMPAIGN_FAMILY, "AS-RKEEP001", "contact-hash-kept",
                        order_id, "2026-08-24T01:00:00",
                    ),
                )
                conn.execute(
                    "UPDATE settings SET value='off' WHERE key='promo_campaign'"
                )
                conn.execute(
                    "UPDATE promos SET active=0 WHERE code=?", (CAMPAIGN_CODE,)
                )
                conn.commit()

            first = migrate_campaign_economics(path)
            second = migrate_campaign_economics(path)
            self.assertTrue(first["changed"])
            self.assertFalse(second["changed"])
            with closing(sqlite3.connect(path)) as conn:
                self.assertEqual(
                    conn.execute(
                        "SELECT pct,cap,min_price,active FROM promos WHERE code=?",
                        (CAMPAIGN_CODE,),
                    ).fetchone(),
                    (12, 5000, 2500, 0),
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT pct,cap,min_price,active FROM promos WHERE code=?",
                        ("AS-RKEEP001",),
                    ).fetchone(),
                    (10, 2500, 5000, 1),
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT value FROM settings WHERE key='promo_campaign'"
                    ).fetchone()[0],
                    "off",
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT token_hash,consumed_order_id FROM promo_retention_grants"
                    ).fetchone(),
                    ("token-hash-kept", order_id),
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT code,order_id FROM promo_first_order_claims"
                    ).fetchone(),
                    ("AS-RKEEP001", order_id),
                )

    def test_bonus_reconciliation_is_atomic_idempotent_and_two_writer_safe(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "salon.db"
            prepare_database(path)
            with closing(sqlite3.connect(path)) as conn:
                conn.execute(
                    "INSERT INTO promos(code,pct,cap,min_price,uses_left,active,created_at) "
                    "VALUES('AS-RATOMIC',12,5000,2500,2,1,?)",
                    ("2026-08-24T00:00:00",),
                )
                order_id = conn.execute(
                    "INSERT INTO orders(user_id,price,bonus_spent,updated_at,created_at) "
                    "VALUES(7,20000,3900,?,?)",
                    ("2026-08-24T00:00:00", "2026-08-24T00:00:00"),
                ).lastrowid
                conn.execute(
                    "CREATE TRIGGER fail_bonus_reconcile BEFORE UPDATE OF bonus_spent "
                    "ON orders BEGIN SELECT RAISE(ABORT,'injected'); END"
                )
                conn.commit()

            raw, helper = executed_db_economics_helpers(path)
            try:
                with self.assertRaisesRegex(sqlite3.IntegrityError, "injected"):
                    asyncio.run(helper["promo_bonus_reconcile"](
                        order_id, "AS-RATOMIC"
                    ))
            finally:
                raw.close()
            with closing(sqlite3.connect(path)) as conn:
                self.assertEqual(
                    conn.execute(
                        "SELECT bonus_spent FROM orders WHERE id=?", (order_id,)
                    ).fetchone()[0],
                    3900,
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT COUNT(*) FROM bonus_ledger WHERE order_id=?",
                        (order_id,),
                    ).fetchone()[0],
                    0,
                )
                conn.execute("DROP TRIGGER fail_bonus_reconcile")
                conn.commit()

            raw, helper = executed_db_economics_helpers(path)
            try:
                first = asyncio.run(helper["promo_bonus_reconcile"](
                    order_id, "AS-RATOMIC"
                ))
                second = asyncio.run(helper["promo_bonus_reconcile"](
                    order_id, "AS-RATOMIC"
                ))
                self.assertEqual(first["bonus_returned"], 1300)
                self.assertTrue(first["first_application"])
                self.assertEqual(second["bonus_returned"], 0)
                self.assertFalse(second["first_application"])
            finally:
                raw.close()
            with closing(sqlite3.connect(path)) as conn:
                self.assertEqual(
                    conn.execute(
                        "SELECT bonus_spent FROM orders WHERE id=?", (order_id,)
                    ).fetchone()[0],
                    2600,
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT COUNT(*),SUM(delta) FROM bonus_ledger WHERE order_id=?",
                        (order_id,),
                    ).fetchone(),
                    (1, 1300),
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT COUNT(*) FROM order_events WHERE order_id=? "
                        "AND kind='bonus_reconciled'",
                        (order_id,),
                    ).fetchone()[0],
                    1,
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT COUNT(*) FROM order_events WHERE order_id=? "
                        "AND kind='promo_applied'",
                        (order_id,),
                    ).fetchone()[0],
                    1,
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT uses_left FROM promos WHERE code='AS-RATOMIC'"
                    ).fetchone()[0],
                    1,
                )
                concurrent_id = conn.execute(
                    "INSERT INTO orders(user_id,price,bonus_spent,updated_at,created_at) "
                    "VALUES(8,20000,3900,?,?)",
                    ("2026-08-24T00:00:00", "2026-08-24T00:00:00"),
                ).lastrowid
                conn.commit()

            def reconcile(_index: int) -> int:
                worker_raw, worker = executed_db_economics_helpers(path)
                try:
                    return asyncio.run(
                        worker["promo_bonus_reconcile"](
                            concurrent_id, "AS-RATOMIC"
                        )
                    )["bonus_returned"]
                finally:
                    worker_raw.close()

            with ThreadPoolExecutor(max_workers=2) as pool:
                self.assertEqual(sorted(pool.map(reconcile, (1, 2))), [0, 1300])
            with closing(sqlite3.connect(path)) as conn:
                self.assertEqual(
                    conn.execute(
                        "SELECT bonus_spent FROM orders WHERE id=?", (concurrent_id,)
                    ).fetchone()[0],
                    2600,
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT COUNT(*),SUM(delta) FROM bonus_ledger WHERE order_id=?",
                        (concurrent_id,),
                    ).fetchone(),
                    (1, 1300),
                )
                self.assertEqual(2400 + 2600, 20000 * 25 // 100)

    def test_limited_promo_and_fresh_reprice_are_authoritative(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "salon.db"
            prepare_database(path)
            with closing(sqlite3.connect(path)) as conn:
                conn.execute(
                    "INSERT INTO promos(code,pct,cap,min_price,uses_left,active,created_at) "
                    "VALUES('ONELEFT',10,5000,1000,1,1,?)",
                    ("2026-08-24T00:00:00",),
                )
                order_ids = [
                    conn.execute(
                        "INSERT INTO orders(user_id,price,updated_at,created_at) "
                        "VALUES(?,10000,?,?)",
                        (user, "2026-08-24T00:00:00", "2026-08-24T00:00:00"),
                    ).lastrowid
                    for user in (21, 22)
                ]
                conn.execute(
                    "INSERT INTO promos(code,pct,cap,min_price,uses_left,active,created_at) "
                    "VALUES('FRESHPRICE',12,5000,2500,NULL,1,?)",
                    ("2026-08-24T00:00:00",),
                )
                fresh_id = conn.execute(
                    "INSERT INTO orders(user_id,price,updated_at,created_at) "
                    "VALUES(23,2500,?,?)",
                    ("2026-08-24T00:00:00", "2026-08-24T00:00:00"),
                ).lastrowid
                conn.commit()

            gate = Barrier(2)

            def apply_limited(order_id: int) -> dict:
                raw, helper = executed_db_economics_helpers(path)
                try:
                    gate.wait()
                    return asyncio.run(
                        helper["promo_bonus_reconcile"](order_id, "ONELEFT")
                    )
                finally:
                    raw.close()

            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(apply_limited, order_ids))
            self.assertEqual(
                sorted(result["promo_discount"] for result in results), [0, 1000]
            )
            self.assertEqual(
                sorted(result["error"] for result in results), ["", "promo_used_up"]
            )
            raw, helper = executed_db_economics_helpers(path)
            try:
                fresh = asyncio.run(
                    helper["promo_bonus_reconcile"](fresh_id, "FRESHPRICE")
                )
            finally:
                raw.close()
            self.assertEqual(fresh["promo_discount"], 300)
            with closing(sqlite3.connect(path)) as conn:
                self.assertEqual(
                    conn.execute(
                        "SELECT uses_left FROM promos WHERE code='ONELEFT'"
                    ).fetchone()[0],
                    0,
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT COUNT(*) FROM order_events "
                        "WHERE kind='promo_applied' AND order_id IN (?,?)",
                        tuple(order_ids),
                    ).fetchone()[0],
                    1,
                )

    def test_claimed_finite_code_survives_below_minimum_reprice_only_for_its_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "salon.db"
            prepare_database(path)
            with closing(sqlite3.connect(path)) as conn:
                conn.executescript(CAMPAIGN_SCHEMA)
                conn.execute(
                    "INSERT INTO promos"
                    "(code,pct,cap,min_price,uses_left,active,family,created_at) "
                    "VALUES('AS-RCLAIMED',10,2500,5000,1,1,?,?)",
                    (CAMPAIGN_FAMILY, "2026-08-24T00:00:00"),
                )
                conn.execute(
                    "INSERT INTO promos"
                    "(code,pct,cap,min_price,uses_left,active,family,created_at) "
                    "VALUES('AS-RDORMANT',10,2500,5000,1,1,?,?)",
                    (CAMPAIGN_FAMILY, "2026-08-24T00:00:00"),
                )
                order_id = conn.execute(
                    "INSERT INTO orders"
                    "(user_id,status,work_type,price,promo_code,updated_at,created_at) "
                    "VALUES(24,'priced','coursework',10000,'AS-RCLAIMED',?,?)",
                    ("2026-08-24T00:00:00", "2026-08-24T00:00:00"),
                ).lastrowid
                stranger_id = conn.execute(
                    "INSERT INTO orders"
                    "(user_id,status,work_type,price,promo_code,updated_at,created_at) "
                    "VALUES(25,'priced','coursework',10000,'AS-RCLAIMED',?,?)",
                    ("2026-08-24T00:00:00", "2026-08-24T00:00:00"),
                ).lastrowid
                dormant_id = conn.execute(
                    "INSERT INTO orders"
                    "(user_id,status,work_type,price,promo_code,updated_at,created_at) "
                    "VALUES(26,'priced','coursework',10000,'AS-RDORMANT',?,?)",
                    ("2026-08-24T00:00:00", "2026-08-24T00:00:00"),
                ).lastrowid
                conn.execute(
                    "INSERT INTO promo_first_order_claims"
                    "(family,code,user_id,order_id,created_at) VALUES(?,?,?,?,?)",
                    (
                        CAMPAIGN_FAMILY, "AS-RCLAIMED", 24, order_id,
                        "2026-08-24T00:00:00",
                    ),
                )
                conn.execute(
                    "INSERT INTO promo_first_order_claims"
                    "(family,code,user_id,order_id,created_at) VALUES(?,?,?,?,?)",
                    (
                        CAMPAIGN_FAMILY, "AS-RDORMANT", 26, dormant_id,
                        "2026-08-24T00:00:00",
                    ),
                )
                conn.commit()

            raw, helper = executed_db_economics_helpers(path)
            try:
                first = asyncio.run(helper["promo_bonus_reconcile"](
                    order_id, "AS-RCLAIMED"
                ))
                self.assertEqual(first["promo_discount"], 1000)
                raw.execute("UPDATE orders SET price=4000 WHERE id=?", (order_id,))
                below_minimum = asyncio.run(helper["promo_bonus_reconcile"](
                    order_id, "AS-RCLAIMED", promo_allowed=False
                ))
                self.assertEqual(below_minimum["promo_discount"], 0)
                raw.execute("UPDATE orders SET price=10000 WHERE id=?", (order_id,))
                restored = asyncio.run(helper["promo_bonus_reconcile"](
                    order_id, "AS-RCLAIMED", promo_allowed=True
                ))
                stranger = asyncio.run(helper["promo_bonus_reconcile"](
                    stranger_id, "AS-RCLAIMED", promo_allowed=True
                ))
                dormant_sub = asyncio.run(
                    helper["subscription_discount_reconcile"](
                        dormant_id, 15, 10000, "Салон+", 20
                    )
                )
                self.assertEqual(
                    (dormant_sub["sub_discount"], dormant_sub["promo_discount"]),
                    (1500, 0),
                )
                self.assertEqual(
                    raw.execute(
                        "SELECT uses_left FROM promos WHERE code='AS-RDORMANT'"
                    ).fetchone()[0],
                    1,
                )
                dormant_promo = asyncio.run(
                    helper["subscription_discount_reconcile"](
                        dormant_id, 0, None, "Салон+", 20
                    )
                )
            finally:
                raw.close()

            self.assertEqual(
                (restored["promo_discount"], restored["error"]), (1000, "")
            )
            self.assertEqual(
                (stranger["promo_discount"], stranger["error"]),
                (0, "promo_used_up"),
            )
            self.assertEqual(
                (dormant_promo["sub_discount"], dormant_promo["promo_discount"]),
                (0, 1000),
            )
            with closing(sqlite3.connect(path)) as conn:
                self.assertEqual(
                    conn.execute(
                        "SELECT uses_left FROM promos WHERE code='AS-RCLAIMED'"
                    ).fetchone()[0],
                    0,
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT promo_discount FROM orders WHERE id=?", (order_id,)
                    ).fetchone()[0],
                    1000,
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT uses_left FROM promos WHERE code='AS-RDORMANT'"
                    ).fetchone()[0],
                    0,
                )

    def test_promo_bonus_and_late_subscription_never_stack_above_25_percent(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "salon.db"
            prepare_database(path)
            with closing(sqlite3.connect(path)) as conn:
                conn.executescript(CAMPAIGN_SCHEMA)
                conn.execute(
                    "INSERT INTO promos"
                    "(code,pct,cap,min_price,uses_left,active,family,created_at) "
                    "VALUES('WELCOME12',12,5000,2500,NULL,1,?,?)",
                    (CAMPAIGN_FAMILY, "2026-08-24T00:00:00"),
                )

                def new_order(user: int) -> int:
                    order_id = conn.execute(
                        "INSERT INTO orders"
                        "(user_id,status,work_type,price,promo_code,updated_at,created_at) "
                        "VALUES(?,'priced','coursework',30000,'WELCOME12',?,?)",
                        (user, "2026-08-24T00:00:00", "2026-08-24T00:00:00"),
                    ).lastrowid
                    conn.execute(
                        "INSERT INTO bonus_ledger"
                        "(user_id,delta,consumed,kind,created_at) "
                        "VALUES(?,10000,0,'welcome',?)",
                        (user, "2026-08-24T00:00:00"),
                    )
                    return order_id

                promo_first = new_order(31)
                sub_first = new_order(32)
                concurrent = new_order(33)
                repriced = new_order(34)
                invalid_repriced = new_order(35)
                no_sub_repriced = new_order(36)
                dormant_promo = new_order(37)
                conn.execute(
                    "INSERT INTO promo_first_order_claims"
                    "(family,code,user_id,order_id,created_at) VALUES(?,?,?,?,?)",
                    (
                        CAMPAIGN_FAMILY, "WELCOME12", 37, dormant_promo,
                        "2026-08-24T00:00:00",
                    ),
                )
                conn.commit()

            raw, helper = executed_db_economics_helpers(path)
            try:
                self.assertEqual(asyncio.run(
                    helper["promo_bonus_reconcile"](promo_first, "WELCOME12")
                )["promo_discount"], 3600)
                self.assertEqual(asyncio.run(
                    helper["bonus_apply_with_aggregate_cap"](
                        31, promo_first, 6000, "заказ", 1000, 20
                    )
                )["spent"], 3900)
                late = asyncio.run(helper["subscription_discount_reconcile"](
                    promo_first, 15, 10000, "Салон+", 20
                ))
                self.assertEqual(
                    (late["sub_discount"], late["promo_discount"]), (4500, 0)
                )

                self.assertEqual(asyncio.run(
                    helper["subscription_discount_reconcile"](
                        sub_first, 15, 10000, "Салон+", 20
                    )
                )["sub_discount"], 4500)
                self.assertEqual(asyncio.run(
                    helper["promo_bonus_reconcile"](sub_first, "WELCOME12")
                )["promo_discount"], 0)
                self.assertEqual(asyncio.run(
                    helper["bonus_apply_with_aggregate_cap"](
                        32, sub_first, 6000, "заказ", 1000, 20
                    )
                )["spent"], 3000)
                self.assertEqual(asyncio.run(
                    helper["promo_bonus_reconcile"](repriced, "WELCOME12")
                )["promo_discount"], 3600)
                raw.execute("UPDATE orders SET price=2500 WHERE id=?", (repriced,))
                repriced_result = asyncio.run(
                    helper["subscription_discount_reconcile"](
                        repriced, 15, 10000, "Салон+", 20
                    )
                )
                self.assertEqual(
                    (
                        repriced_result["sub_discount"],
                        repriced_result["promo_discount"],
                    ),
                    (375, 0),
                )
                for user_id, order_id in (
                    (35, invalid_repriced), (36, no_sub_repriced),
                ):
                    self.assertEqual(asyncio.run(
                        helper["promo_bonus_reconcile"](order_id, "WELCOME12")
                    )["promo_discount"], 3600)
                    self.assertEqual(asyncio.run(
                        helper["bonus_apply_with_aggregate_cap"](
                            user_id, order_id, 6000, "заказ", 1000, 20
                        )
                    )["spent"], 3900)
                    raw.execute(
                        "UPDATE orders SET price=2000 WHERE id=?", (order_id,)
                    )
                invalid = asyncio.run(helper["promo_bonus_reconcile"](
                    invalid_repriced, "WELCOME12", promo_allowed=False
                ))
                no_subscription = asyncio.run(
                    helper["subscription_discount_reconcile"](
                        no_sub_repriced, 0, None, "Салон+", 20
                    )
                )
                self.assertEqual(
                    (invalid["promo_discount"], invalid["bonus_returned"]),
                    (0, 3500),
                )
                self.assertEqual(
                    (
                        no_subscription["sub_discount"],
                        no_subscription["promo_discount"],
                        no_subscription["bonus_returned"],
                    ),
                    (0, 0, 3500),
                )
                dormant_with_subscription = asyncio.run(
                    helper["subscription_discount_reconcile"](
                        dormant_promo, 15, 10000, "Салон+", 20
                    )
                )
                self.assertEqual(
                    (
                        dormant_with_subscription["sub_discount"],
                        dormant_with_subscription["promo_discount"],
                    ),
                    (4500, 0),
                )
                dormant_restored = asyncio.run(
                    helper["subscription_discount_reconcile"](
                        dormant_promo, 0, None, "Салон+", 20
                    )
                )
                self.assertEqual(
                    (
                        dormant_restored["sub_discount"],
                        dormant_restored["promo_discount"],
                    ),
                    (0, 3600),
                )
            finally:
                raw.close()

            gate = Barrier(3)

            def concurrent_action(kind: str) -> dict:
                worker_raw, worker = executed_db_economics_helpers(path)
                try:
                    gate.wait()
                    if kind == "promo":
                        return asyncio.run(worker["promo_bonus_reconcile"](
                            concurrent, "WELCOME12"
                        ))
                    if kind == "sub":
                        return asyncio.run(worker["subscription_discount_reconcile"](
                            concurrent, 15, 10000, "Салон+", 20
                        ))
                    return asyncio.run(worker["bonus_apply_with_aggregate_cap"](
                        33, concurrent, 6000, "заказ", 1000, 20
                    ))
                finally:
                    worker_raw.close()

            with ThreadPoolExecutor(max_workers=3) as pool:
                list(pool.map(concurrent_action, ("promo", "sub", "bonus")))

            with closing(sqlite3.connect(path)) as conn:
                for order_id in (promo_first, sub_first, concurrent):
                    price, bonus, sub, promo = conn.execute(
                        "SELECT price,bonus_spent,sub_discount,promo_discount "
                        "FROM orders WHERE id=?", (order_id,),
                    ).fetchone()
                    self.assertEqual(max(sub, promo), 4500)
                    self.assertEqual(min(sub, promo), 0)
                    self.assertLessEqual(bonus + max(sub, promo), price * 25 // 100)
                for order_id in (invalid_repriced, no_sub_repriced):
                    price, bonus, sub, promo = conn.execute(
                        "SELECT price,bonus_spent,sub_discount,promo_discount "
                        "FROM orders WHERE id=?", (order_id,),
                    ).fetchone()
                    self.assertEqual((price, bonus, sub, promo), (2000, 400, 0, 0))
                    self.assertLessEqual(
                        bonus + max(sub, promo), price * 25 // 100
                    )
                self.assertEqual(
                    conn.execute(
                        "SELECT sub_discount,promo_discount FROM orders WHERE id=?",
                        (dormant_promo,),
                    ).fetchone(),
                    (0, 3600),
                )

    def test_economics_suspension_is_atomic_and_restore_uses_compare_and_swap(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "salon.db"
            prepare_database(path)
            migrate_campaign_db(path)
            snapshot = _suspend_campaign_with_snapshot(path)
            self.assertEqual(snapshot["setting"], "on")
            with closing(sqlite3.connect(path)) as conn:
                self.assertEqual(
                    conn.execute(
                        "SELECT value FROM settings WHERE key='promo_campaign'"
                    ).fetchone()[0],
                    snapshot["suspended_value"],
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT active FROM promos WHERE code=?", (CAMPAIGN_CODE,)
                    ).fetchone()[0],
                    0,
                )

            raw, _, helper = executed_db_helpers(path)

            async def issue_while_suspended():
                token = "pi1_" + "s" * 40
                self.assertTrue(await helper["promo_intent_start"](token))
                raw.execute(
                    "UPDATE promo_campaign_intents "
                    "SET created_at=datetime('now','-61 seconds')"
                )
                grant, error = await helper["promo_retention_issue"](
                    token, "AS-RSUSPEND", daily_limit=40
                )
                self.assertIsNone(grant)
                self.assertEqual(error, "off")

            try:
                asyncio.run(issue_while_suspended())
            finally:
                raw.close()
            _restore_campaign_state(path, snapshot)
            with closing(sqlite3.connect(path)) as conn:
                self.assertEqual(
                    conn.execute(
                        "SELECT value FROM settings WHERE key='promo_campaign'"
                    ).fetchone()[0],
                    "on",
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT active FROM promos WHERE code=?", (CAMPAIGN_CODE,)
                    ).fetchone()[0],
                    1,
                )

            second = _suspend_campaign_with_snapshot(path)
            with self.assertRaisesRegex(RuntimeError, "transition backup"):
                _restore_campaign_state(path, snapshot)
            with closing(sqlite3.connect(path)) as conn:
                conn.execute(
                    "UPDATE settings SET value='off' WHERE key='promo_campaign'"
                )
                conn.commit()
            with self.assertRaisesRegex(RuntimeError, "transition backup"):
                _restore_campaign_state(path, second)
            with closing(sqlite3.connect(path)) as conn:
                self.assertEqual(
                    conn.execute(
                        "SELECT value FROM settings WHERE key='promo_campaign'"
                    ).fetchone()[0],
                    "off",
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT active FROM promos WHERE code=?", (CAMPAIGN_CODE,)
                    ).fetchone()[0],
                    0,
                )

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
    def test_economics_upgrade_rollback_and_forward_preserve_live_database(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            root = base / "root"
            app = root / "app"
            services = app / "services"
            handlers = app / "handlers"
            services.mkdir(parents=True)
            handlers.mkdir(parents=True)
            v1_sources = {
                "webapp": patch_webapp(WEBAPP_SOURCE),
                "db": patch_db(DB_SOURCE),
                "promo": patch_promo(PROMO_SOURCE),
                "bonus": BONUS_SOURCE,
                "my_orders": MY_ORDERS_SOURCE,
                "subs": SUBS_SOURCE,
            }
            source_paths = {
                "webapp": app / "webapp.py",
                "db": app / "db.py",
                "promo": services / "promo.py",
                "bonus": services / "bonus.py",
                "my_orders": handlers / "my_orders.py",
                "subs": services / "subs.py",
            }
            for name, path in source_paths.items():
                path.write_text(v1_sources[name], encoding="utf-8")
            database = root / "salon.db"
            prepare_database(database)
            migrate_campaign_db(database)
            with closing(sqlite3.connect(database)) as live:
                live.execute(
                    "INSERT INTO promos(code,pct,amount,cap,min_price,uses_left,"
                    "expires_at,active,note,family,created_at) "
                    "VALUES(?,1,NULL,1000,5000,1,?,1,?,?,?)",
                    (
                        "AS-RSECRET42", "2026-08-27T02:00:00", "retention",
                        CAMPAIGN_FAMILY, "2026-08-24T02:00:00",
                    ),
                )
                live.execute(
                    "INSERT INTO promo_retention_grants"
                    "(code,token_hash,created_at,expires_at,consumed_order_id) "
                    "VALUES(?,?,?,?,NULL)",
                    (
                        "AS-RSECRET42", "private-token-hash",
                        "2026-08-24T02:00:00", "2026-08-27T02:00:00",
                    ),
                )
                live.commit()

            expected_before = {
                name: sha256(path) for name, path in source_paths.items()
            }
            v2_sources = {
                "webapp": patch_webapp_aggregate_v2(v1_sources["webapp"]),
                "db": patch_db_economics_v2(v1_sources["db"]),
                "promo": patch_promo_aggregate_v2(v1_sources["promo"]),
                "bonus": patch_bonus_aggregate_v2(v1_sources["bonus"]),
                "my_orders": patch_my_orders_aggregate_v2(v1_sources["my_orders"]),
                "subs": patch_subs_aggregate_v2(v1_sources["subs"]),
            }
            expected_after = {
                name: sha256_text(source) for name, source in v2_sources.items()
            }
            preview = check_campaign_economics(
                root, database=database,
                expected_before=expected_before, expected_after=expected_after,
            )
            self.assertTrue(preview["changed"])
            self.assertFalse(preview["database_current"])

            now = datetime(2026, 8, 24, 3, 0, tzinfo=timezone.utc)
            result = upgrade_campaign_economics(
                root, base / "backups", database=database,
                expected_before=expected_before, expected_after=expected_after,
                now=now,
            )
            self.assertTrue(result["changed"])
            backup = Path(result["backup"])
            manifest = (backup / "manifest.json").read_text(encoding="utf-8")
            self.assertNotIn("AS-RSECRET42", manifest)
            self.assertNotIn("private-token-hash", manifest)
            awaiting = check_campaign_economics(
                root, database=database,
                expected_before=expected_before, expected_after=expected_after,
            )
            self.assertTrue(awaiting["changed"])
            self.assertEqual(
                awaiting["source_state"], "awaiting_restart_and_finalize"
            )
            with closing(sqlite3.connect(database)) as live:
                self.assertEqual(
                    live.execute(
                        "SELECT pct,cap,min_price,active FROM promos WHERE code=?",
                        (CAMPAIGN_CODE,),
                    ).fetchone(),
                    (12, 5000, 2500, 0),
                )
                self.assertEqual(
                    live.execute(
                        "SELECT pct,cap,min_price,active FROM promos WHERE code=?",
                        ("AS-RSECRET42",),
                    ).fetchone(),
                    (10, 2500, 5000, 0),
                )

            # A process that loaded the old issuer cannot mint a 1% code while
            # sources are staged but the service has not restarted.
            raw, _, stale = executed_db_helpers(database)

            async def stale_issue():
                token = "pi1_" + "z" * 40
                self.assertTrue(await stale["promo_intent_start"](token))
                raw.execute(
                    "UPDATE promo_campaign_intents "
                    "SET created_at=datetime('now','-61 seconds')"
                )
                grant, error = await stale["promo_retention_issue"](
                    token, "AS-RSTALE001", daily_limit=40
                )
                self.assertIsNone(grant)
                self.assertEqual(error, "off")

            try:
                asyncio.run(stale_issue())
            finally:
                raw.close()

            state = json.loads(
                (backup / "campaign-state.json").read_text(encoding="utf-8")
            )
            with self.assertRaisesRegex(RuntimeError, "restarted service pid"):
                finalize_campaign_economics(
                    root, backup, database=database,
                    expected_after=expected_after,
                )

            def fake_proc(name: str, boot_seconds: int, pid: int) -> Path:
                proc = base / name
                (proc / str(pid)).mkdir(parents=True)
                (proc / "stat").write_text(
                    f"cpu 1 2 3 4\nbtime {boot_seconds}\n", encoding="utf-8"
                )
                fields = ["S"] + ["0"] * 19
                (proc / str(pid) / "stat").write_text(
                    f"{pid} (salon bot) " + " ".join(fields) + "\n",
                    encoding="utf-8",
                )
                (proc / str(pid) / "cmdline").write_bytes(
                    (str(root / "venv" / "bin" / "python")
                     + "\0-m\0app.bot\0").encode("utf-8")
                )
                (proc / str(pid) / "cwd").symlink_to(
                    root, target_is_directory=True
                )
                (proc / str(pid) / "cgroup").write_text(
                    "0::/system.slice/salon-bot-v2.service\n", encoding="utf-8"
                )
                (proc / str(pid) / "status").write_text(
                    "Name:\tpython\nPPid:\t1\n", encoding="utf-8"
                )
                return proc

            old_proc = fake_proc(
                "proc-old", state["staged_at_ns"] // 1_000_000_000 - 10, 4101
            )
            with self.assertRaisesRegex(RuntimeError, "predates"):
                finalize_campaign_economics(
                    root, backup, database=database,
                    expected_after=expected_after, runtime_pid=4101,
                    proc_root=old_proc, clock_ticks_per_second=100,
                )
            rogue_proc = fake_proc(
                "proc-rogue", state["staged_at_ns"] // 1_000_000_000 + 2, 4199
            )
            (rogue_proc / "4199" / "cmdline").write_bytes(
                b"/bin/sh\0-c\0sleep 60\0"
            )
            with self.assertRaisesRegex(RuntimeError, "expected systemd bot"):
                finalize_campaign_economics(
                    root, backup, database=database,
                    expected_after=expected_after, runtime_pid=4199,
                    proc_root=rogue_proc, clock_ticks_per_second=100,
                )
            new_proc = fake_proc(
                "proc-new", state["staged_at_ns"] // 1_000_000_000 + 2, 4102
            )
            finalized = finalize_campaign_economics(
                root, backup, database=database,
                expected_after=expected_after, runtime_pid=4102,
                proc_root=new_proc, clock_ticks_per_second=100,
            )
            self.assertTrue(finalized["finalized"])
            self.assertEqual(finalized["runtime"]["pid"], 4102)
            installed = check_campaign_economics(
                root, database=database,
                expected_before=expected_before, expected_after=expected_after,
            )
            self.assertFalse(installed["changed"])
            self.assertEqual(installed["campaign"], "on")
            with closing(sqlite3.connect(database)) as live:
                self.assertEqual(
                    live.execute(
                        "SELECT pct,cap,min_price,active FROM promos WHERE code=?",
                        ("AS-RSECRET42",),
                    ).fetchone(),
                    (10, 2500, 5000, 1),
                )
                live.execute(
                    "INSERT INTO orders(user_id,guest_contact,promo_code,created_at) "
                    "VALUES(NULL,?,NULL,?)",
                    ("after-economics-backup@example.test", "2026-08-24T04:00:00"),
                )
                live.commit()

            rolled = rollback_campaign_economics(
                root, backup, database=database,
                expected_before=expected_before, expected_after=expected_after,
            )
            self.assertEqual(rolled["database"], "preserved")
            self.assertEqual(rolled["promised_rates"], "preserved")
            self.assertEqual(
                {name: sha256(path) for name, path in source_paths.items()},
                expected_after,
            )
            with closing(sqlite3.connect(database)) as live:
                self.assertEqual(
                    live.execute(
                        "SELECT COUNT(*) FROM orders WHERE guest_contact=?",
                        ("after-economics-backup@example.test",),
                    ).fetchone()[0],
                    1,
                )
                self.assertEqual(
                    live.execute(
                        "SELECT pct,cap,min_price,active FROM promos WHERE code=?",
                        ("AS-RSECRET42",),
                    ).fetchone(),
                    (10, 2500, 5000, 1),
                )
                self.assertEqual(
                    live.execute(
                        "SELECT value FROM settings WHERE key='promo_campaign'"
                    ).fetchone()[0],
                    "off",
                )

            safe = check_campaign_economics(
                root, database=database,
                expected_before=expected_before, expected_after=expected_after,
            )
            self.assertFalse(safe["changed"])
            self.assertEqual(safe["campaign"], "off")
            enabled = enable_campaign_economics(
                root, database=database,
                expected_before=expected_before, expected_after=expected_after,
            )
            self.assertEqual(enabled["campaign"], "on")
            with closing(sqlite3.connect(database)) as live:
                self.assertEqual(
                    live.execute(
                        "SELECT value FROM settings WHERE key='promo_campaign'"
                    ).fetchone()[0],
                    "on",
                )
            self.assertFalse(check_campaign_economics(
                root, database=database,
                expected_before=expected_before, expected_after=expected_after,
            )["changed"])

    def test_post_migration_failure_keeps_coherent_v2_and_is_recoverable(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            root = base / "root"
            app = root / "app"
            services = app / "services"
            handlers = app / "handlers"
            services.mkdir(parents=True)
            handlers.mkdir(parents=True)
            v1_sources = {
                "webapp": patch_webapp(WEBAPP_SOURCE),
                "db": patch_db(DB_SOURCE),
                "promo": patch_promo(PROMO_SOURCE),
                "bonus": BONUS_SOURCE,
                "my_orders": MY_ORDERS_SOURCE,
                "subs": SUBS_SOURCE,
            }
            source_paths = {
                "webapp": app / "webapp.py",
                "db": app / "db.py",
                "promo": services / "promo.py",
                "bonus": services / "bonus.py",
                "my_orders": handlers / "my_orders.py",
                "subs": services / "subs.py",
            }
            for name, path in source_paths.items():
                path.write_text(v1_sources[name], encoding="utf-8")
            expected_before = {
                name: sha256(path) for name, path in source_paths.items()
            }
            expected_after = {
                "webapp": sha256_text(patch_webapp_aggregate_v2(v1_sources["webapp"])),
                "db": sha256_text(patch_db_economics_v2(v1_sources["db"])),
                "promo": sha256_text(patch_promo_aggregate_v2(v1_sources["promo"])),
                "bonus": sha256_text(patch_bonus_aggregate_v2(v1_sources["bonus"])),
                "my_orders": sha256_text(
                    patch_my_orders_aggregate_v2(v1_sources["my_orders"])
                ),
                "subs": sha256_text(patch_subs_aggregate_v2(v1_sources["subs"])),
            }
            database = root / "salon.db"
            prepare_database(database)
            migrate_campaign_db(database)
            real_write = installer_module._write_campaign_manifest

            def fail_final_manifest(backup: Path, manifest: dict) -> None:
                if manifest.get("staged_at_ns") is not None:
                    raise RuntimeError("injected post-migration failure")
                real_write(backup, manifest)

            from unittest.mock import patch
            with patch.object(
                    installer_module, "_write_campaign_manifest",
                    side_effect=fail_final_manifest):
                with self.assertRaisesRegex(RuntimeError, "recovery backup"):
                    upgrade_campaign_economics(
                        root, base / "backups", database=database,
                        expected_before=expected_before,
                        expected_after=expected_after,
                    )

            self.assertEqual(
                {name: sha256(path) for name, path in source_paths.items()},
                expected_after,
            )
            with closing(sqlite3.connect(database)) as conn:
                setting = conn.execute(
                    "SELECT value FROM settings WHERE key='promo_campaign'"
                ).fetchone()[0]
                self.assertTrue(setting.startswith("upgrading:20260824-v2:"))
                self.assertEqual(
                    conn.execute(
                        "SELECT active FROM promos WHERE code=?", (CAMPAIGN_CODE,)
                    ).fetchone()[0],
                    0,
                )
                self.assertEqual(
                    conn.execute(
                        "SELECT pct,cap FROM promos WHERE code=?", (CAMPAIGN_CODE,)
                    ).fetchone(),
                    (12, 5000),
                )

            recovered = upgrade_campaign_economics(
                root, base / "backups", database=database,
                expected_before=expected_before, expected_after=expected_after,
            )
            self.assertTrue(recovered["requires_finalize"])
            self.assertIsNotNone(recovered["backup"])
            state = json.loads(
                (Path(recovered["backup"]) / "campaign-state.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertIsInstance(state["staged_at_ns"], int)
            rolled = rollback_campaign_economics(
                root, Path(recovered["backup"]), database=database,
                expected_before=expected_before, expected_after=expected_after,
            )
            self.assertEqual(rolled["campaign"], "off")
            self.assertEqual(
                {name: sha256(path) for name, path in source_paths.items()},
                expected_after,
            )

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
