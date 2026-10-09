"""«Кладовой 6 лет»: обмен с ботом Кладовой (kladovaya_6let.py), сторож подарков, установщик.

Модуль живёт в app/services и импортирует app.db и app.services.zero_campaign —
здесь они подменены: база — настоящая SQLite в памяти под асинхронной
обёрткой, подпись не проверяется (её проверяет zero_campaign, у него свои
тесты). Проверяется: оплаты считаются только по именинным заказам и окнам,
кривые подарки не принимаются, повтор подарка не задвоит; сторож включает
подписку, продлевает не ниже тарифа и не трогает тех, кого нет в Салоне;
установщик правит ровно свои места и не ставит второй раз.
"""

import asyncio
import contextlib
import importlib.util
import json
import sqlite3
import sys
import types
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
SALON_SCHEMA = """
CREATE TABLE users(id INTEGER PRIMARY KEY, username TEXT, created_at TEXT, banned INTEGER DEFAULT 0);
CREATE TABLE orders(id INTEGER PRIMARY KEY, user_id INTEGER, status TEXT, work_type TEXT, created_at TEXT,
  deleted INTEGER DEFAULT 0, synthetic INTEGER DEFAULT 0);
CREATE TABLE payments(id INTEGER PRIMARY KEY, order_id INTEGER, kind TEXT, amount INTEGER, method TEXT,
  status TEXT, created_at TEXT, paid_at TEXT);
CREATE TABLE subscriptions(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, plan TEXT, features TEXT, price INTEGER,
  period_days INTEGER, discount_pct INTEGER, discount_cap INTEGER, status TEXT, order_id INTEGER, started_at TEXT,
  expires_at TEXT, via TEXT, pay_method TEXT, auto_renew INTEGER, created_at TEXT);
"""


class AsyncCursor:
    def __init__(self, cursor):
        self.cursor = cursor

    async def fetchall(self):
        return self.cursor.fetchall()

    async def fetchone(self):
        return self.cursor.fetchone()


class AsyncConn:
    def __init__(self, con):
        self.con = con

    async def execute(self, sql, args=()):
        return AsyncCursor(self.con.execute(sql, args))


class CampaignError(RuntimeError):
    def __init__(self, code, status=409):
        super().__init__(code)
        self.code = code
        self.status = status


def load_module(con):
    app = types.ModuleType("app")
    app.__path__ = []
    services = types.ModuleType("app.services")
    services.__path__ = []
    fake_db = types.ModuleType("app.db")
    wrapped = AsyncConn(con)
    fake_db.conn = lambda: wrapped
    fake_db.now_iso = lambda: "2026-10-11T09:00:00"

    @contextlib.asynccontextmanager
    async def transaction():
        yield wrapped
        con.commit()

    fake_db.transaction = transaction
    zero = types.ModuleType("app.services.zero_campaign")
    zero.CampaignError = CampaignError
    app.db, services.zero_campaign = fake_db, zero
    aiohttp = types.ModuleType("aiohttp")
    aiohttp.web = types.SimpleNamespace(Request=object, Response=object, json_response=lambda *a, **k: (a, k))
    sys.modules.update({"app": app, "app.services": services, "app.db": fake_db, "app.services.zero_campaign": zero, "aiohttp": aiohttp})
    spec = importlib.util.spec_from_file_location("app.services.kladovaya_6let", HERE.parent / "kladovaya_6let.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["app.services.kladovaya_6let"] = module
    spec.loader.exec_module(module)
    return module


def load_watch():
    spec = importlib.util.spec_from_file_location("kladovaya_6let_watch", HERE.parent / "kladovaya_6let_watch.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def database():
    con = sqlite3.connect(":memory:", isolation_level=None)
    con.row_factory = sqlite3.Row
    con.executescript(SALON_SCHEMA)
    return con


class SyncTest(unittest.TestCase):
    def setUp(self):
        self.con = database()
        self.addCleanup(self.con.close)
        self.k6 = load_module(self.con)
        rows = [
            # заказ, пользователь, статус, тип, создан (UTC)
            (1, 700100200, "work", "kursovaya", "2026-10-09T10:00:00"),
            (2, 700100200, "work", "referat", "2026-10-15T20:00:00"),
            (3, 700100201, "cancel", "vkr", "2026-10-10T10:00:00"),
            (4, 700100202, "work", "sub_plus", "2026-10-10T10:00:00"),
            (5, 700100203, "work", "vkr", "2026-10-08T20:59:59"),  # до окна
            (6, -5, "work", "vkr", "2026-10-10T10:00:00"),            # почтовый аккаунт
            (7, 700100204, "work", "vkr", "2026-10-12T10:00:00"),
        ]
        self.con.executemany("INSERT INTO orders(id,user_id,status,work_type,created_at) VALUES(?,?,?,?,?)", rows)
        pays = [
            (1, "prepay", 7000, "paid", "2026-10-12T10:00:00"),   # ранняя
            (1, "rest", 7000, "paid", "2026-10-15T09:00:00"),     # день рождения
            (2, "prepay", 2500, "paid", "2026-10-16T11:59:00"),   # до 16.10 15:00 МСК — в счёт
            (2, "rest", 500, "paid", "2026-10-16T12:30:00"),      # после — нет
            (3, "prepay", 20000, "paid", "2026-10-10T11:00:00"),  # отменён
            (4, "prepay", 999, "paid", "2026-10-10T11:00:00"),    # подписка
            (5, "prepay", 20000, "paid", "2026-10-10T11:00:00"),  # заказ до окна
            (6, "prepay", 20000, "paid", "2026-10-10T11:00:00"),  # не Telegram
            (7, "prepay", 20000, "pending", None),                # не оплачено
        ]
        self.con.executemany("INSERT INTO payments(order_id,kind,amount,status,paid_at) VALUES(?,?,?,?,?)", pays)

    def test_ledger_counts_only_birthday_orders_and_windows(self):
        result = asyncio.run(self.k6.sync({"grants": []}))
        self.assertTrue(result["ok"])
        self.assertEqual(result["buyers"], [{"tg": 700100200, "paid": 16500, "early": 7000, "bday": 7000, "orders": 2}])

    def test_grants_are_recorded_once_and_reported(self):
        grant = {"tg": 700100200, "reason": "friend", "plan": "plus", "days": 30}
        asyncio.run(self.k6.sync({"grants": [grant], "request_id": "a" * 32}))
        result = asyncio.run(self.k6.sync({"grants": [grant, {"tg": 700100201, "reason": "buyer", "plan": "pro", "days": 150}]}))
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM kladovaya_6let_grants").fetchone()[0], 2)
        self.assertEqual([g["state"] for g in result["grants"]], ["pending", "pending"])

    def test_bad_grants_are_refused(self):
        for bad in (
            [{"tg": 0, "reason": "friend", "plan": "plus", "days": 30}],
            [{"tg": 1, "reason": "Friend!", "plan": "plus", "days": 30}],
            [{"tg": 1, "reason": "friend", "plan": "session", "days": 30}],
            [{"tg": 1, "reason": "friend", "plan": "plus", "days": 400}],
            [{"tg": True, "reason": "friend", "plan": "plus", "days": 30}],
            [{"tg": 1, "reason": "friend", "plan": "plus", "days": 30, "extra": 1}],
            "nope",
        ):
            with self.assertRaises(CampaignError):
                asyncio.run(self.k6.sync({"grants": bad}))
        with self.assertRaises(CampaignError):
            asyncio.run(self.k6.sync({"grants": [], "evil": 1}))

    def test_no_new_grants_after_the_end(self):
        result = asyncio.run(self.k6.sync({"grants": [{"tg": 5, "reason": "friend", "plan": "plus", "days": 30}]}, now="2026-11-01T00:00:00"))
        self.assertFalse(result["grantsAccepted"])
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM kladovaya_6let_grants").fetchone()[0], 0)


class WatchTest(unittest.TestCase):
    def setUp(self):
        self.watch = load_watch()
        self.con = database()
        self.addCleanup(self.con.close)
        self.watch.migrate(self.con)
        self.now = datetime(2026, 10, 11, 9, 0, tzinfo=timezone.utc)
        self.sent = []
        self.watch.telegram = lambda method, payload: self.sent.append(payload) or True

    def grant(self, tg, reason, plan, days):
        self.con.execute("INSERT INTO kladovaya_6let_grants(tg,reason,plan,days,created_at) VALUES(?,?,?,?,?)", (tg, reason, plan, days, "2026-10-11T08:00:00"))
        return self.con.execute("SELECT last_insert_rowid()").fetchone()[0]

    def sub(self, user, plan, expires, price=999):
        self.con.execute("INSERT INTO subscriptions(user_id,plan,features,price,period_days,discount_pct,discount_cap,status,expires_at,via) VALUES(?,?,?,?,?,?,?, 'active', ?, 'бот')",
                         (user, plan, "[]", price, 150, 5, 1000, expires))

    def test_not_in_salon_yet_waits(self):
        gid = self.grant(700100200, "friend", "plus", 30)
        self.assertIsNone(self.watch.apply_one(self.con, gid, self.now))
        self.assertEqual(self.watch.pending_ready(self.con), [])
        self.con.execute("INSERT INTO users(id) VALUES(700100200)")
        self.assertEqual(self.watch.pending_ready(self.con), [gid])

    def test_new_subscription_with_plan_terms(self):
        self.con.execute("INSERT INTO users(id) VALUES(700100200)")
        gid = self.grant(700100200, "friend", "plus", 30)
        done = self.watch.apply_one(self.con, gid, self.now)
        self.assertFalse(done["extended"])
        row = self.con.execute("SELECT * FROM subscriptions WHERE id=?", (self.con.execute("SELECT subscription_id FROM kladovaya_6let_grants WHERE id=?", (gid,)).fetchone()[0],)).fetchone()
        self.assertEqual((row["plan"], row["price"], row["via"], row["pay_method"], row["status"], row["discount_pct"], row["discount_cap"]), ("plus", 0, "kladovaya-6let", "gift", "active", 5, 1000))
        self.assertEqual(json.loads(row["features"]), ["disc5", "prio", "curator", "shelf"])
        self.assertEqual(row["expires_at"], "2026-11-10T09:00:00")
        self.assertIsNone(self.watch.apply_one(self.con, gid, self.now))  # второй раз — ничего

    def test_never_downgrades_and_upgrades_on_top(self):
        self.con.execute("INSERT INTO users(id) VALUES(1),(2)")
        self.sub(1, "pro", "2026-12-01T00:00:00", price=2690)
        done = self.watch.apply_one(self.con, self.grant(1, "friend", "plus", 30), self.now)
        self.assertTrue(done["extended"])
        self.assertEqual(self.con.execute("SELECT plan, expires_at FROM subscriptions WHERE user_id=1").fetchall()[0][:], ("pro", "2026-12-31T00:00:00"))
        self.sub(2, "plus", "2026-10-20T00:00:00")
        done = self.watch.apply_one(self.con, self.grant(2, "buyer", "pro", 150), self.now)
        self.assertFalse(done["extended"])
        active = self.watch.active_subscription(self.con, 2, self.now)
        self.assertEqual(active["plan"], "pro")

    def test_run_applies_and_notifies(self):
        self.con.execute("INSERT INTO users(id) VALUES(700100200)")
        self.grant(700100200, "buyer", "pro", 150)
        self.grant(700100299, "friend", "plus", 30)  # его нет в Салоне
        done = self.watch.run(self.con)
        self.assertEqual(len(done), 1)
        self.assertIn("«Про»", self.sent[0]["text"])
        self.assertIn("спасибо за именинный заказ", self.sent[0]["text"])
        self.assertEqual(self.watch.status(self.con), {"buyer:applied": 1, "friend:pending": 1})


class InstallerTest(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("install_kladovaya_6let", HERE.parent / "install_kladovaya_6let.py")
        self.inst = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.inst)
        self.webapp = (
            "from .services import kladovaya_welcome  # kladovaya-welcome:20261009-v1\n"
            "def _ip(request):\n    return '1.2.3.4'\n"
            "def routes(app):\n"
            "    r = app.router\n"
            '    r.add_post("/api/campaigns/zero-classes-2026-09-01/claim", zero_campaign_claim)\n'
        )
        self.db = (
            "async def promo_customer_state(user_id, campaign_start):\n"
            "    c = conn()\n"
            "    for table, column in (\n"
            '        ("subscriptions", "user_id"), ("deposits", "user_id"),\n'
            '        ("gifts", "buyer_user_id"),\n'
            "    ):\n"
            "        pass\n"
            '    return "eligible"\n'
        )

    def test_patches_exactly_and_compile(self):
        web = self.inst.patched(self.webapp, self.inst.WEBAPP_EDITS, "webapp.py")
        self.assertEqual(web.count(self.inst.MARKER), 2)
        self.assertIn("kladovaya_6let.register(r, _ip)", web)
        compile(web, "webapp.py", "exec")
        db = self.inst.patched(self.db, self.inst.DB_EDITS, "db.py")
        self.assertIn("COALESCE(via,'')<>'kladovaya-6let'", db)
        self.assertNotIn('("subscriptions", "user_id")', db)
        compile(db, "db.py", "exec")
        with self.assertRaises(SystemExit):
            self.inst.patched(web, self.inst.WEBAPP_EDITS, "webapp.py")

    def test_missing_anchor_stops(self):
        with self.assertRaises(SystemExit):
            self.inst.patched(self.db.replace('("gifts", "buyer_user_id"),\n', ""), self.inst.DB_EDITS, "db.py")


if __name__ == "__main__":
    unittest.main()
