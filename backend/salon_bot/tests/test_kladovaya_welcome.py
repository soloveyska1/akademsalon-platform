"""Подарок новичку Кладовой: личный код на первый заказ (kladovaya_welcome.py).

Модуль живёт в app/services и импортирует app.db, app.config и
app.services.zero_campaign — здесь они подменены: синтетические пользователи,
синтетический секрет, база — словарь. Проверяется: код — функция Telegram-ID
(у бота Кладовой та же формула), чужой код и вход без Telegram не проходят,
только первый заказ, строка promos — только для владельца кода и один раз,
после 31.12 кампания выключена; установщик правит ровно три места и не ставит
второй раз.
"""

import asyncio
import importlib.util
import sys
import types
import unittest
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
SECRET = b"synthetic-shared-campaign-secret-0123456789"


class FakeDb:
    def __init__(self):
        self.state = {}
        self.inserted = []

    async def promo_customer_state(self, user_id, campaign_start):
        return self.state.get(user_id, "eligible")

    async def _exec(self, sql, args=()):
        self.inserted.append((sql, tuple(args)))


def load():
    app = types.ModuleType("app")
    app.__path__ = []
    services = types.ModuleType("app.services")
    services.__path__ = []
    config = types.ModuleType("app.config")
    config.ADMIN_IDS = [111]
    zero = types.ModuleType("app.services.zero_campaign")
    zero.credential_secret = lambda: SECRET
    fake_db = FakeDb()
    db = types.ModuleType("app.db")
    db.promo_customer_state = fake_db.promo_customer_state
    db._exec = fake_db._exec
    app.config, app.db, services.zero_campaign = config, db, zero
    sys.modules.update({"app": app, "app.services": services, "app.config": config, "app.db": db, "app.services.zero_campaign": zero})
    spec = importlib.util.spec_from_file_location("app.services.kladovaya_welcome", HERE.parent / "kladovaya_welcome.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["app.services.kladovaya_welcome"] = module
    spec.loader.exec_module(module)
    return module, fake_db


def run(coro):
    return asyncio.run(coro)


class WelcomeCodeTest(unittest.TestCase):
    def setUp(self):
        self.kw, self.db = load()
        self.now = datetime(2026, 10, 9, 10, 0, tzinfo=timezone.utc)

    def test_code_is_a_stable_function_of_the_telegram_id(self):
        code = self.kw.code_for(700100200)
        self.assertRegex(code, r"^ЛИСТ-\d{8}$")
        self.assertEqual(code, self.kw.code_for(700100200))
        self.assertNotEqual(code, self.kw.code_for(700100201))
        # та же формула, что у бота Кладовой: HMAC(HMAC(секрет, метка), id) → 8 цифр
        import hashlib, hmac
        key = hmac.new(SECRET, b"kladovaya-welcome-2026-10", hashlib.sha256).digest()
        digest = hmac.new(key, b"700100200", hashlib.sha256).digest()
        self.assertEqual(code, f"ЛИСТ-{int.from_bytes(digest[:8], 'big') % 100_000_000:08d}")

    def test_owner_gets_the_promo_row_once_eligible(self):
        code = self.kw.code_for(700100200)
        self.assertIsNone(run(self.kw.prepare(code, {"id": 700100200}, now=self.now)))
        sql, args = self.db.inserted[-1]
        self.assertIn("INSERT OR IGNORE INTO promos", sql)
        self.assertEqual(args[:5], (code, 12, 5000, 2500, "2026-12-31"))
        self.assertEqual(args[-1], "kladovaya-welcome-2026-10")

    def test_other_codes_and_people_are_refused(self):
        code = self.kw.code_for(700100200)
        self.assertEqual(run(self.kw.prepare(code, {"id": 700100201}, now=self.now)), "not_yours")
        self.assertEqual(run(self.kw.prepare(code, None, now=self.now)), "telegram_login")
        self.assertEqual(run(self.kw.prepare(code, {"id": -42}, now=self.now)), "telegram_login")
        self.assertEqual(run(self.kw.prepare(self.kw.code_for(111), {"id": 111}, now=self.now)), "preview_only")
        self.db.state[700100200] = "existing"
        self.assertEqual(run(self.kw.prepare(code, {"id": 700100200}, now=self.now)), "already_used")
        late = datetime(2026, 12, 31, 21, 1, tzinfo=timezone.utc)  # 1 января по Москве
        self.assertEqual(run(self.kw.prepare(code, {"id": 700100200}, now=late)), "off")
        self.assertEqual(self.db.inserted, [])

    def test_other_promo_codes_pass_through_untouched(self):
        for raw in ("", "ПЕРВЫЙЛИСТ", "ЛИСТ-1234", "ЛИСТ-123456789", "EXIT5ABC"):
            self.assertIsNone(run(self.kw.prepare(raw, {"id": 700100200}, now=self.now)), raw)
        self.assertEqual(self.db.inserted, [])


class InstallerTest(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location("install_kladovaya_welcome", HERE.parent / "install_kladovaya_welcome.py")
        self.inst = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.inst)
        self.source = (
            "from .services import zero_campaign\n"
            "async def order(b, user):\n"
            "    raw_promo = _clean_promo(b.get(\"promo\"))\n"
            "    if raw_promo:\n"
            "        p = await db.promo_get(raw_promo)\n"
            "        bad = promo_svc.why_invalid(p) if p is not None else \"not_found\"\n"
            "        if not bad and p[\"family\"] == \"first-order-2026-08\":\n"
            "            pass\n"
            "async def quote_email(b):\n"
            "    raw_promo = _clean_promo(b.get(\"promo\"))\n"
            "    if raw_promo:\n"
            "        p = await db.promo_get(raw_promo)\n"
            "        if p and not promo_svc.why_invalid(p):\n"
            "            pass\n"
            "async def promo_check(request):\n"
            "    code = _clean_promo(b.get(\"code\"))\n"
            "    p = await db.promo_get(code)\n"
            "    bad = promo_svc.why_invalid(p) if p is not None else \"not_found\"\n"
            "    if not bad and p[\"family\"] == \"first-order-2026-08\":\n"
            "        pass\n"
        )

    def test_patch_touches_exactly_three_places_and_compiles(self):
        out = self.inst.patched(self.source)
        self.assertEqual(out.count(self.inst.MARKER), 3)
        self.assertIn("welcome_bad = await kladovaya_welcome.prepare(raw_promo, user)", out)
        self.assertIn("welcome_bad = await kladovaya_welcome.prepare(code, await _session_user(request))", out)
        self.assertEqual(out.count("bad = welcome_bad or ("), 2)
        compile(out, "webapp.py", "exec")
        with self.assertRaises(SystemExit):
            self.inst.patched(out)

    def test_missing_or_doubled_anchor_stops(self):
        with self.assertRaises(SystemExit):
            self.inst.patched(self.source.replace("    p = await db.promo_get(code)\n", ""))
        with self.assertRaises(SystemExit):
            self.inst.patched(self.source + self.source)


if __name__ == "__main__":
    unittest.main()
