"""Подарочная подписка по Telegram-нику (backend/salon_bot/gift_watch.py).

Синтетическая база со схемой production (users, subscriptions — как в
/root/salon_bot/salon.db на 09.10.2026), синтетические ники; уведомления —
заглушка. Проверяется: ник нормализуется; подарок ждёт входа; при первом
входе Telegram-аккаунта выдаётся ровно одна действующая подписка с условиями
оплаченного тарифа, ценой 0 и без автопродления; повтор ничего не меняет;
email-аккаунт (id < 0), заблокированный, отозванный и просроченный подарок —
ничего не получают; dry-run ничего не пишет.
"""

import importlib.util
import json
import sqlite3
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("gift_watch", HERE.parent / "gift_watch.py")
gw = importlib.util.module_from_spec(spec)
sys.modules["gift_watch"] = gw
spec.loader.exec_module(gw)

PROD_SCHEMA = """
CREATE TABLE users(
  id INTEGER PRIMARY KEY,
  username TEXT, first_name TEXT, last_name TEXT,
  phone TEXT, source TEXT,
  created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL
, banned INTEGER DEFAULT 0, referrer_id INTEGER, welcome_at TEXT, email TEXT, subscribed INTEGER DEFAULT 1, subscribed_at TEXT);
CREATE TABLE subscriptions(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan TEXT NOT NULL,
  features TEXT,
  price INTEGER NOT NULL,
  period_days INTEGER NOT NULL,
  discount_pct INTEGER DEFAULT 0,
  discount_cap INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  order_id INTEGER,
  started_at TEXT, expires_at TEXT,
  express_used INTEGER DEFAULT 0,
  trainer_used INTEGER DEFAULT 0,
  warned INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
, via TEXT, claimed_at TEXT, paid_at TEXT, pay_method TEXT, canceled_at TEXT, auto_renew INTEGER DEFAULT 0);
"""

NOW = datetime(2026, 10, 9, 9, 0, tzinfo=timezone.utc)
PAID_FEATURES = ["disc10", "prio", "curator", "shelf", "trainer", "express", "cb2"]


class GiftWatchTest(unittest.TestCase):
    def setUp(self):
        self.con = sqlite3.connect(":memory:", isolation_level=None)
        self.con.row_factory = sqlite3.Row
        self.con.executescript(PROD_SCHEMA)
        # Образец оплаченной «Про» на 150 дней — у другого пользователя.
        self.con.execute(
            "INSERT INTO subscriptions(user_id, plan, features, price, period_days, discount_pct, discount_cap, status, created_at)"
            " VALUES(111, 'pro', ?, 2690, 150, 10, 3000, 'active', '2026-07-12T23:00:00')",
            (json.dumps(PAID_FEATURES),),
        )
        self.sent = []

    def tearDown(self):
        self.con.close()

    def notifier(self, gift, user_id, days):
        self.sent.append((gift["id"], user_id, days))
        return True

    def add_user(self, user_id, username, banned=0):
        self.con.execute(
            "INSERT INTO users(id, username, created_at, last_seen_at, banned) VALUES(?,?,?,?,?)",
            (user_id, username, "2026-10-09T09:00:00", "2026-10-09T09:00:00", banned),
        )

    def gift_subs(self):
        return self.con.execute("SELECT * FROM subscriptions WHERE via='gift'").fetchall()

    def test_username_forms_are_normalized(self):
        for raw in ("@Synthetic_User", "synthetic_user", "https://t.me/synthetic_user", "t.me/Synthetic_User"):
            self.assertEqual(gw.normalize_username(raw), "synthetic_user")
        for raw in ("", "@ab", "имя", "a b c d", "x" * 33):
            with self.assertRaises(ValueError):
                gw.normalize_username(raw)

    def test_grant_waits_and_refuses_bad_input(self):
        gw.grant(self.con, "@synthetic_user", "pro", 150, 120, "тест", now=NOW)
        with self.assertRaises(ValueError):
            gw.grant(self.con, "synthetic_user", "pro", 150, 120, "второй", now=NOW)
        for days in (0, 367):
            with self.assertRaises(ValueError):
                gw.grant(self.con, "other_user", "pro", days, 120, "", now=NOW)
        with self.assertRaises(ValueError):
            gw.grant(self.con, "other_user", "session", 30, 120, "", now=NOW)
        summary = gw.run(self.con, now=NOW, notifier=self.notifier)
        self.assertEqual(summary, {"pending": 1, "claimed": 0, "lapsed": 0})
        self.assertEqual(self.gift_subs(), [])

    def test_first_telegram_login_gets_exactly_one_active_pro(self):
        gift_id = gw.grant(self.con, "synthetic_user", "pro", 150, 120, "", now=NOW)
        self.add_user(7001, "Synthetic_User")
        later = NOW + timedelta(minutes=5)
        self.assertEqual(gw.run(self.con, now=later, notifier=self.notifier)["claimed"], 1)
        self.assertEqual(gw.run(self.con, now=later + timedelta(minutes=1), notifier=self.notifier)["claimed"], 0)
        subs = self.gift_subs()
        self.assertEqual(len(subs), 1)
        sub = subs[0]
        self.assertEqual((sub["user_id"], sub["plan"], sub["price"], sub["period_days"], sub["status"]), (7001, "pro", 0, 150, "active"))
        self.assertEqual((sub["discount_pct"], sub["discount_cap"], sub["auto_renew"], sub["pay_method"]), (10, 3000, 0, "gift"))
        self.assertEqual(json.loads(sub["features"]), PAID_FEATURES)
        self.assertEqual(sub["started_at"], "2026-10-09T09:05:00")
        self.assertEqual(sub["expires_at"], "2027-03-08T09:05:00")
        # то, как Салон ищет действующую подписку (db.sub_active)
        active = self.con.execute(
            "SELECT * FROM subscriptions WHERE user_id=? AND status='active' AND expires_at > ? ORDER BY id DESC LIMIT 1",
            (7001, "2026-10-10T00:00:00"),
        ).fetchone()
        self.assertEqual(active["id"], sub["id"])
        gift = self.con.execute("SELECT * FROM subscription_gifts WHERE id=?", (gift_id,)).fetchone()
        self.assertEqual((gift["state"], gift["claimed_user_id"], gift["subscription_id"]), ("claimed", 7001, sub["id"]))
        self.assertIsNotNone(gift["notified_at"])
        self.assertEqual(self.sent, [(gift_id, 7001, 150)])

    def test_email_banned_revoked_lapsed_and_dry_run_get_nothing(self):
        gw.grant(self.con, "email_user", "pro", 150, 120, "", now=NOW)
        self.add_user(-5, "email_user")
        gw.grant(self.con, "banned_user", "pro", 150, 120, "", now=NOW)
        self.add_user(7002, "banned_user", banned=1)
        revoked = gw.grant(self.con, "revoked_user", "pro", 150, 120, "", now=NOW)
        self.assertTrue(gw.revoke(self.con, revoked))
        self.add_user(7003, "revoked_user")
        gw.grant(self.con, "late_user", "pro", 150, 1, "", now=NOW)
        dry = gw.grant(self.con, "dry_user", "pro", 150, 120, "", now=NOW)
        self.add_user(7004, "dry_user")
        # dry-run ничего не пишет, даже для того, кто уже вошёл
        self.assertEqual(gw.run(self.con, dry_run=True, now=NOW, notifier=self.notifier)["claimed"], 0)
        self.assertEqual(self.gift_subs(), [])
        # через двое суток: окно «late» истекло, «dry» выдан, остальные — ничего
        summary = gw.run(self.con, now=NOW + timedelta(days=2), notifier=self.notifier)
        self.assertEqual(summary, {"pending": 2, "claimed": 1, "lapsed": 1})
        self.assertEqual([row["user_id"] for row in self.gift_subs()], [7004])
        self.assertEqual(self.sent, [(dry, 7004, 150)])
        states = {row["username_norm"]: row["state"] for row in self.con.execute("SELECT username_norm, state FROM subscription_gifts")}
        self.assertEqual(states, {"email_user": "pending", "banned_user": "pending", "revoked_user": "revoked", "late_user": "lapsed", "dry_user": "claimed"})

    def test_fallback_terms_without_a_paid_sample(self):
        self.con.execute("DELETE FROM subscriptions")
        gw.grant(self.con, "synthetic_user", "pro", 150, 120, "", now=NOW)
        self.add_user(7005, "synthetic_user")
        gw.run(self.con, now=NOW, notifier=self.notifier)
        sub = self.gift_subs()[0]
        self.assertEqual(json.loads(sub["features"]), PAID_FEATURES)
        self.assertEqual((sub["discount_pct"], sub["discount_cap"]), (10, 3000))

    def test_failed_notification_still_keeps_the_gift(self):
        gw.grant(self.con, "synthetic_user", "pro", 150, 120, "", now=NOW)
        self.add_user(7006, "synthetic_user")
        gw.run(self.con, now=NOW, notifier=lambda gift, user_id, days: False)
        gift = self.con.execute("SELECT * FROM subscription_gifts").fetchone()
        self.assertEqual(gift["state"], "claimed")
        self.assertIsNone(gift["notified_at"])
        self.assertEqual(len(self.gift_subs()), 1)


if __name__ == "__main__":
    unittest.main()
