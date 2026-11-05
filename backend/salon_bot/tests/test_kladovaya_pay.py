"""Касса Кладовой (kladovaya_pay.py): ссылка, страница, ResultURL, сверка, уведомление боту, установщик.

Модуль живёт в app/services и импортирует app.config, app.db и
app.services.{mailer,notify,payments} — здесь они подменены. robo_result_ok —
дословная копия живой проверки подписи ResultURL (Password#2), а robo_webhook и
build_app собраны из живых строк (LIVE_WEBAPP) тем же patched(), которым
установщик правит прод: запросы идут ровно через те хуки, что встанут на сервере.
Касса Robokassa (Indexjson, OpStateExt) и бот Кладовой — настоящие HTTP-серверы
aiohttp на 127.0.0.1: касса проверяет подпись формы счёта, бот — подпись
уведомления. Сторож (сверка, повторы, сообщения админам, аудит) проверяется
отдельно, с подменёнными часами.
"""

from __future__ import annotations

import asyncio
import contextlib
import hashlib
import hmac
import importlib.util
import io
import json
import logging
import os
import re
import secrets
import sqlite3
import subprocess
import sys
import tempfile
import time
import types
import unittest
import warnings
from decimal import Decimal, InvalidOperation
from pathlib import Path
from unittest import mock

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

HERE = Path(__file__).resolve().parent
PAGE = HERE.parents[2] / "scripts/kladovaya-pay-20261031/page/main.html"
SECRET = "f3c1" * 16
LOGIN, PASS1, PASS2 = "akademsalon", "password-one", "password-two"
ORDER = "kabcdef1234"

LIVE_WEBAPP = '''"""Срез живого app/webapp.py Салона (31.10.2026): начало robo_webhook и хвост build_app."""
import logging

from aiohttp import web

from . import config
from .services import payments

log = logging.getLogger(__name__)


def _ip(request):
    return request.remote or ""


async def _session_user(request):
    return None


async def handle_options(request):
    return web.Response(status=204)


async def robo_webhook(request: web.Request) -> web.Response:
    """ResultURL Robokassa: подпись MD5 c Password#2; ответ — OK<InvId>."""
    if not config.robokassa_on():
        return web.Response(status=404)
    data = dict(await request.post()) if request.method == "POST" else dict(request.query)
    res = payments.robo_result_ok(data)
    if not res:
        log.warning("robokassa result: bad signature from %s", _ip(request))
        return web.Response(status=400, text="bad sign")
    inv_id, amount = res
    # material-store:20260910-v1
    from .material_store.http import verified_callback as material_callback
    material_response = await material_callback(request.app, inv_id, amount, data)
    if material_response is not None:
        return material_response
    # Robokassa возвращает в ResultURL адрес, который покупатель подтвердил
    # на платёжной странице. Дальше на проде — подписки, подарки, депозиты,
    # чаевые и заказы; в срезе их заменяет один ответ.
    return web.Response(status=400, text="unknown invoice")


def build_app(bot) -> web.Application:
    app = web.Application()
    app["bot"] = bot
    r = app.router
    r.add_post("/api/pay/robokassa", robo_webhook)
    r.add_get("/api/pay/robokassa", robo_webhook)
    from .material_store.http import register as register_material_store
    register_material_store(app, _session_user)
    r.add_options("/api/{tail:.*}", handle_options)
    return app
'''

# что установщик ищет в живых файлах: имена, на которые опирается модуль
STUBS = {
    "app/config.py": ("ROBOKASSA_LOGIN = ''\nROBOKASSA_TEST = False\nDOC_EDITIONS = {}\n\n\n"
                      "def robokassa_on():\n    pass\n\n\ndef robo_pass1():\n    pass\n\n\n"
                      "def robo_pass2():\n    pass\n"),
    "app/db.py": ("async def receipt_invoice_upsert(**kw):\n    pass\n\n\n"
                  "async def receipt_mark_paid(*a, **kw):\n    pass\n"),
    "app/services/payments.py": 'ROBO_INVOICE_URL = ""\nROBO_SHORT_URL = ""\n\n\ndef _robo_sig(*parts):\n    pass\n',
    "app/services/notify.py": "async def notify_admins(bot, text):\n    pass\n",
    "app/services/mailer.py": "def looks_email(s):\n    pass\n",
    "app/material_store/http.py": "async def verified_callback(app, inv_id, amount, data):\n    pass\n",
}


def robo_sig(*parts) -> str:
    return hashlib.md5(":".join(str(p) for p in parts).encode("utf-8")).hexdigest()


def make_robo_result_ok(config):
    def robo_result_ok(data):
        # дословно как services/payments.py на проде (сверено 31.10.2026)
        out = str(data.get("OutSum") or "")
        try:
            inv = int(str(data.get("InvId") or ""))
        except ValueError:
            return None
        got = str(data.get("SignatureValue") or "").lower()
        shp = sorted((k, str(v)) for k, v in data.items() if k.startswith("Shp_"))
        want = robo_sig(out, inv, config.robo_pass2(), *(f"{k}={v}" for k, v in shp))
        if not (got and secrets.compare_digest(want, got)):
            return None
        try:
            parsed = Decimal(out)
            if not parsed.is_finite() or parsed <= 0 \
                    or parsed != parsed.quantize(Decimal("0.01")) \
                    or parsed != parsed.to_integral_value():
                return None
            amount = int(parsed)
        except (InvalidOperation, ValueError):
            return None
        return inv, amount
    return robo_result_ok


def load_file(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def load(tmp: Path) -> types.SimpleNamespace:
    if hasattr(web, "NotAppKeyWarning"):  # живой webapp.py тоже держит строковые ключи app["bot"]
        warnings.filterwarnings("ignore", category=web.NotAppKeyWarning)
    for name in [n for n in sys.modules if n == "app" or n.startswith("app.")]:
        del sys.modules[name]
    app = types.ModuleType("app")
    app.__path__ = []
    services = types.ModuleType("app.services")
    services.__path__ = []
    material = types.ModuleType("app.material_store")
    material.__path__ = []

    config = types.ModuleType("app.config")
    config.ROBOKASSA_LOGIN, config.ROBOKASSA_TEST = LOGIN, False
    config.robo_pass1, config.robo_pass2 = (lambda: PASS1), (lambda: PASS2)
    config.robokassa_on = lambda: True
    config.DOC_EDITIONS = {"privacy": "3.1", "oferta": "3.2"}

    db = types.ModuleType("app.db")
    db.calls, db.fail_mark, db.fail_upsert = [], 0, False

    async def receipt_invoice_upsert(**kwargs):
        if db.fail_upsert:
            raise RuntimeError("database is locked")
        db.calls.append(("invoice", kwargs))

    async def receipt_mark_paid(provider, inv_id, *, payment_method=None, allocated=True):
        if db.fail_mark:
            db.fail_mark -= 1
            raise RuntimeError("database is locked")
        db.calls.append(("paid", provider, inv_id, allocated))

    db.receipt_invoice_upsert, db.receipt_mark_paid = receipt_invoice_upsert, receipt_mark_paid

    payments = types.ModuleType("app.services.payments")
    payments._robo_sig = robo_sig
    payments.robo_result_ok = make_robo_result_ok(config)
    payments.ROBO_INVOICE_URL = "http://127.0.0.1:9/never"
    payments.ROBO_SHORT_URL = "https://auth.robokassa.ru/Merchant/Index/"

    notify = types.ModuleType("app.services.notify")
    notify.sent, notify.attempts, notify.result, notify.delay = [], [], 1, 0.0

    async def notify_admins(bot, text, **kwargs):
        # как живой: число доставленных личек, 0 — Telegram не принял
        notify.attempts.append(text)
        if notify.delay:
            await asyncio.sleep(notify.delay)
        if notify.result is None or notify.result > 0:
            notify.sent.append(text)
        return notify.result

    notify.notify_admins = notify_admins
    mailer = types.ModuleType("app.services.mailer")
    mailer.looks_email = lambda s: bool(s and re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", s.strip()))

    http = types.ModuleType("app.material_store.http")

    async def material_callback(app_, inv_id, amount, data):
        if not 50_000_000 < inv_id < 60_000_000:
            return None
        return web.Response(text=f"OK{inv_id}")

    http.verified_callback = material_callback
    http.register = lambda app_, identity: None

    app.config, app.db, app.services, app.material_store = config, db, services, material
    services.payments, services.notify, services.mailer, material.http = payments, notify, mailer, http
    sys.modules.update({
        "app": app, "app.config": config, "app.db": db, "app.services": services,
        "app.services.payments": payments, "app.services.notify": notify, "app.services.mailer": mailer,
        "app.material_store": material, "app.material_store.http": http,
    })
    kp = load_file("app.services.kladovaya_pay", HERE.parent / "kladovaya_pay.py")
    logging.getLogger(kp.__name__).setLevel(logging.CRITICAL)  # повторы и отказы здесь ожидаемы
    services.kladovaya_pay = kp
    inst = load_file("install_kladovaya_pay", HERE.parent / "install_kladovaya_pay.py")
    source = tmp / "webapp.py"
    source.write_bytes(inst.patched(LIVE_WEBAPP).encode("utf-8"))
    webapp = load_file("app.webapp", source)
    return types.SimpleNamespace(kp=kp, inst=inst, webapp=webapp, config=config, db=db,
                                 payments=payments, notify=notify)


def link(order=ORDER, product="format_fix", amount=290, expires=None, key=SECRET) -> dict:
    expires = int(time.time()) + 3600 if expires is None else expires
    sig = hmac.new(key.encode(), f"{order}|{product}|{amount}|{expires}".encode(), hashlib.sha256).hexdigest()
    return {"o": order, "p": product, "a": str(amount), "e": str(expires), "s": sig}


def result_form(inv_id, out_sum, order=ORDER, kind="kladovaya", password=PASS2) -> dict:
    shp = {"Shp_kind": kind, "Shp_order": order}
    sig = robo_sig(out_sum, inv_id, password, *(f"{k}={v}" for k, v in sorted(shp.items())))
    return {"OutSum": out_sum, "InvId": str(inv_id), "SignatureValue": sig.upper(),
            "EMail": "student@example.com", **shp}


def paid_answer(order=ORDER, out="290.000000", inc=None) -> dict:
    return {"state": "100", "amount": out, "inc_amount": inc or out,
            "fields": {"Shp_kind": "kladovaya", "Shp_order": order}}


@contextlib.contextmanager
def quiet():
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        yield


class Clock:
    def __init__(self, now=1_793_000_000.0):
        self.now = now

    def __call__(self):
        return self.now


class FakeRobokassa:
    """Indexjson проверяет подпись формы, как касса; OpStateExt отдаёт заданное состояние."""

    def __init__(self):
        self.forms, self.states, self.opstate_calls = [], {}, 0

    def app(self):
        a = web.Application()
        a.router.add_post("/Indexjson.aspx", self.indexjson)
        a.router.add_post("/OpStateExt", self.opstate)
        return a

    async def indexjson(self, request):
        form = dict(await request.post())
        self.forms.append(form)
        shp = sorted((k, v) for k, v in form.items() if k.startswith("Shp_"))
        want = robo_sig(form["MerchantLogin"], form["OutSum"], form["InvId"], form["Receipt"],
                        form["SuccessUrl2"], form["SuccessUrl2Method"], form["FailUrl2"],
                        form["FailUrl2Method"], PASS1, *(f"{k}={v}" for k, v in shp))
        if form.get("SignatureValue") != want:
            return web.json_response({"errorCode": 29})
        return web.json_response({"invoiceID": f"inv-{form['InvId']}-{len(self.forms)}", "errorCode": 0})

    async def opstate(self, request):
        self.opstate_calls += 1
        form = dict(await request.post())
        inv = int(form["InvoiceID"])
        if form["Signature"] != robo_sig(LOGIN, inv, PASS2):
            return web.Response(status=403)
        ns = 'xmlns="http://merchant.roboxchange.com/WebService/"'
        if inv not in self.states:
            return web.Response(text=f"<OperationStateResponse {ns}><Result><Code>3</Code></Result></OperationStateResponse>")
        code, out, fields, *inc = self.states[inv]
        user = "".join(f"<Field><Name>{k}</Name><Value>{v}</Value></Field>" for k, v in fields.items())
        return web.Response(text=(f"<OperationStateResponse {ns}><Result><Code>0</Code></Result>"
                                  f"<State><Code>{code}</Code></State><Info><IncSum>{inc[0] if inc else out}"
                                  f"</IncSum><OutSum>{out}</OutSum></Info>"
                                  f"<UserFields>{user}</UserFields></OperationStateResponse>"))


class FakeKladovayaBot:
    """POST /salon/paid бота Кладовой: проверяет подпись сырого тела, отвечает заданными статусами."""

    def __init__(self):
        self.received, self.raw, self.statuses = [], [], []

    def app(self):
        a = web.Application()
        a.router.add_post("/salon/paid", self.paid)
        return a

    async def paid(self, request):
        raw = await request.read()
        want = hmac.new(SECRET.encode(), raw, hashlib.sha256).hexdigest()
        if request.headers.get("X-Kladovaya-Signature") != want:
            return web.Response(status=403)
        self.raw.append(raw)
        self.received.append(json.loads(raw))
        return web.Response(status=self.statuses.pop(0) if self.statuses else 200)


class Env(unittest.TestCase):
    """Общая подготовка: временная папка, подменённые модули, секрет в окружении."""

    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.addCleanup(self._cleanup)
        self.env = mock.patch.dict(os.environ, {
            "ACADEMIC_SALON_KLADOVAYA_PAY_SECRET": SECRET,
            "ACADEMIC_SALON_KLADOVAYA_PAY_DB": str(self.tmp / "pay.sqlite3"),
            "ACADEMIC_SALON_KLADOVAYA_PAY_CHECKOUT": "1",
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        self.m = load(self.tmp)
        self.kp = self.m.kp

    def _cleanup(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)


class LinkTests(Env):
    def test_signed_live_link_is_accepted(self):
        now = time.time()
        got = self.kp.verify_link(link(amount=390), now=now)
        self.assertEqual(got["order"], ORDER)
        self.assertEqual(got["amount"], 390)
        self.assertEqual(self.kp.PRODUCTS["format_fix"]["prices"][390], "выпускная квалификационная работа (ВКР)")
        self.assertEqual(self.kp.verify_link(link(), now=now)["amount"], 290)

    def test_any_changed_field_breaks_the_signature(self):
        good = link()
        for field, value in (("o", "kabcdef1235"), ("a", "390"), ("e", str(int(good["e"]) + 1)),
                             ("s", "0" * 64)):
            with self.subTest(field=field):
                with self.assertRaises(self.kp.PayError) as caught:
                    self.kp.verify_link({**good, field: value})
                self.assertEqual((caught.exception.code, caught.exception.status), ("link_invalid", 400))
        foreign = link(key="другой секрет, не Салона и не бота, достаточно длинный")
        with self.assertRaises(self.kp.PayError):
            self.kp.verify_link(foreign)

    def test_expired_link_and_link_longer_than_a_day(self):
        now = 1_793_000_000
        for expires in (now, now - 1):
            with self.assertRaises(self.kp.PayError) as caught:
                self.kp.verify_link(link(expires=expires), now=now)
            self.assertEqual((caught.exception.code, caught.exception.status), ("link_expired", 410))
        self.assertTrue(self.kp.verify_link(link(expires=now + 24 * 3600), now=now))
        with self.assertRaises(self.kp.PayError) as caught:
            self.kp.verify_link(link(expires=now + 24 * 3600 + 301), now=now)
        self.assertEqual(caught.exception.code, "link_invalid")

    def test_price_outside_the_list_is_refused_even_when_signed(self):
        for amount in (300, 289, 1, 3900):
            with self.subTest(amount=amount):
                with self.assertRaises(self.kp.PayError) as caught:
                    self.kp.verify_link(link(amount=amount))
                self.assertEqual((caught.exception.code, caught.exception.status), ("price_mismatch", 409))

    def test_malformed_links(self):
        good = link()
        for field, value in (("o", "Kabcdef1234"), ("o", "kabcdef123"), ("o", "kabc-ef1234"),
                             ("p", "format"), ("a", "0290"), ("a", "-290"), ("a", "290.00"),
                             ("e", "17930000000000"), ("s", "z" * 64), ("s", "ab")):
            with self.subTest(field=field, value=value):
                with self.assertRaises(self.kp.PayError) as caught:
                    self.kp.verify_link({**good, field: value})
                self.assertEqual(caught.exception.code, "link_invalid")
        upper = {**good, "s": good["s"].upper()}
        self.assertEqual(self.kp.verify_link(upper)["order"], ORDER)

    def test_secret_comes_from_the_systemd_credential(self):
        credentials = self.tmp / "credentials"
        credentials.mkdir()
        (credentials / "kladovaya_pay").write_text(SECRET + "\n", encoding="utf-8")
        with mock.patch.dict(os.environ, {"ACADEMIC_SALON_KLADOVAYA_PAY_SECRET": "",
                                          "CREDENTIALS_DIRECTORY": str(credentials)}):
            self.assertEqual(self.kp.secret(), SECRET.encode())
            self.assertEqual(self.kp.verify_link(link())["order"], ORDER)
            (credentials / "kladovaya_pay").write_text("short", encoding="utf-8")
            with self.assertRaises(self.kp.PayError) as caught:
                self.kp.verify_link(link())
            self.assertEqual((caught.exception.code, caught.exception.status), ("not_configured", 503))


class SpecTests(Env):
    def test_page_conditions_match_the_edition_kept_with_every_invoice(self):
        if not PAGE.exists():
            self.skipTest("нет scripts/kladovaya-pay-20261031 рядом с backend")
        page = PAGE.read_bytes().decode("utf-8").replace("\r\n", "\n")
        section = re.search(r'<section class="kp-spec".*?</section>', page, re.S).group(0)
        # правка текста условий без новой редакции не пройдёт: хеш хранится в снимке каждого счёта
        self.assertEqual(hashlib.sha256(section.encode("utf-8")).hexdigest(), self.kp.SPEC_SHA256)
        self.assertIn(f"ред. {self.kp.SPEC_EDITION.split()[-1]}", section)
        for edition in self.kp.SPEC_DOCS.values():
            self.assertIn(f"ред. {edition}", section)
        spec = self.kp.specification({"order": ORDER, "product": "format_fix", "amount": 290,
                                      "expires": 1_793_003_600}, 1_793_000_000)
        self.assertEqual((spec["edition"], spec["sha256"], spec["documents"]),
                         ("format_fix 1.0", self.kp.SPEC_SHA256, {"oferta": "3.2", "privacy": "3.1"}))


class StoreTests(Env):
    def setUp(self):
        super().setUp()
        self.store = self.kp.Store(self.tmp / "store.sqlite3")
        self.now = 1_793_000_000

    def invoice(self, email="student@example.com", amount=290, order=ORDER):
        lk = {"order": order, "product": "format_fix", "amount": amount, "expires": self.now + 3600}
        inv = self.store.open_invoice(lk, email, "{}", self.kp.receipt_for(lk), self.now)
        self.store.set_url(inv["id"], f"https://pay.example/{inv['id']}")
        return self.kp.INV_OFFSET + inv["id"]

    def alerts(self):
        with self.store.read() as c:
            return [r[0] for r in c.execute("SELECT key FROM alerts ORDER BY id")]

    def test_paid_once_by_invoice_and_by_order(self):
        first = self.invoice()
        second = self.invoice(email="other@example.com")
        self.assertNotEqual(first, second)
        paid = self.store.confirm(first, 290, ORDER, "result", self.now + 60)
        self.assertEqual((paid["result"], paid["allocated"]), ("paid", True))
        self.assertTrue(paid["paid_at"].endswith("+03:00"))
        repeat = self.store.confirm(first, 290, ORDER, "result", self.now + 61)
        self.assertEqual((repeat["result"], repeat["allocated"]), ("repeat", True))
        duplicate = self.store.confirm(second, 290, ORDER, "result", self.now + 62)
        self.assertEqual((duplicate["result"], duplicate["allocated"]), ("duplicate", False))
        self.assertEqual(self.store.confirm(second, 290, ORDER, "opstate", self.now + 63)["result"], "repeat")
        with self.store.read() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM outbox").fetchone()[0], 1)
            self.assertEqual(c.execute("SELECT paid_inv FROM orders").fetchone()[0], first)
        # сообщения админам — в той же транзакции и по одному на событие
        self.assertEqual(self.alerts(), [f"paid:{first}", f"duplicate:{second}"])
        with self.assertRaises(self.kp.PayError) as caught:
            self.invoice(email="third@example.com")
        self.assertEqual(caught.exception.code, "already_paid")

    def test_foreign_amount_and_order_are_logged_and_not_paid(self):
        inv = self.invoice()
        for amount, order, code in ((390, ORDER, "bad_amount"), (29000, ORDER, "bad_amount"),
                                    (290, "kzzzzzzzzzz", "payment_mismatch"), (290, "", "payment_mismatch")):
            with self.subTest(amount=amount, order=order):
                with self.assertRaises(self.kp.PayError) as caught:
                    self.store.confirm(inv, amount, order, "result", self.now)
                self.assertEqual(caught.exception.code, code)
        with self.assertRaises(self.kp.PayError) as caught:
            self.store.confirm(self.kp.INV_OFFSET + 999, 290, ORDER, "result", self.now)
        self.assertEqual(caught.exception.code, "unknown_invoice")
        with self.store.read() as c:
            self.assertEqual(c.execute("SELECT state FROM orders").fetchone()[0], "open")
            events = [r[0] for r in c.execute("SELECT event FROM audit ORDER BY id")]
        self.assertEqual(events.count("bad_amount"), 2)
        self.assertEqual(events.count("payment_mismatch"), 2)
        self.assertEqual(len(self.alerts()), 5)  # каждое расхождение по живым деньгам — админам

    def test_same_live_invoice_is_reused_and_attempts_are_bounded(self):
        first = self.invoice()
        self.assertEqual(self.invoice(), first)
        for n in range(self.kp.MAX_INVOICES - 1):
            self.invoice(email=f"s{n}@example.com")
        with self.assertRaises(self.kp.PayError) as caught:
            self.invoice(email="last@example.com")
        self.assertEqual((caught.exception.code, caught.exception.status), ("too_many_attempts", 429))


class HttpTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.robokassa, self.bot = FakeRobokassa(), FakeKladovayaBot()
        self.rk_server, self.bot_server = TestServer(self.robokassa.app()), TestServer(self.bot.app())
        await self.rk_server.start_server()
        await self.bot_server.start_server()
        self.env = mock.patch.dict(os.environ, {
            "ACADEMIC_SALON_KLADOVAYA_PAY_SECRET": SECRET,
            "ACADEMIC_SALON_KLADOVAYA_PAY_DB": str(self.tmp / "pay.sqlite3"),
            "ACADEMIC_SALON_KLADOVAYA_PAY_NOTIFY_URL": str(self.bot_server.make_url("/salon/paid")),
            "ACADEMIC_SALON_KLADOVAYA_PAY_CHECKOUT": "1",
        })
        self.env.start()
        self.m = load(self.tmp)
        self.kp = self.m.kp
        self.m.payments.ROBO_INVOICE_URL = str(self.rk_server.make_url("/Indexjson.aspx"))
        self.kp.OPSTATE_URL = str(self.rk_server.make_url("/OpStateExt"))
        self.client = TestClient(TestServer(self.m.webapp.build_app(object())))
        await self.client.start_server()
        self.runtime = self.client.app[self.kp.STATE_KEY]

    async def asyncTearDown(self):
        await self.client.close()
        await self.rk_server.close()
        await self.bot_server.close()
        self.env.stop()
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    async def checkout(self, email="student@example.com", **link_args):
        response = await self.client.post("/api/kladovaya/pay/checkout",
                                          json={**link(**link_args), "email": email, "accept": True})
        return response.status, await response.json()

    async def result(self, form):
        response = await self.client.post("/api/pay/robokassa", data=form)
        return response.status, await response.text()

    async def quote(self, params=None):
        response = await self.client.get("/api/kladovaya/pay/quote", params=link() if params is None else params)
        return response.status, await response.json()

    async def received(self, count=1, timeout=5.0):
        deadline = time.monotonic() + timeout
        while len(self.bot.received) < count and time.monotonic() < deadline:
            await asyncio.sleep(0.05)
        return self.bot.received

    async def alerted(self, needle, timeout=5.0):
        """Сообщения админам шлёт сторож фоном — ждём, пока дойдут."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            found = [text for text in self.m.notify.sent if needle in text]
            if found:
                return found
            await asyncio.sleep(0.05)
        return []

    def table(self, sql):
        con = sqlite3.connect(str(self.tmp / "pay.sqlite3"))
        try:
            return con.execute(sql).fetchall()
        finally:
            con.close()

    async def test_page_quote_checks_signature_expiry_and_price(self):
        status, data = await self.quote()
        self.assertEqual(status, 200)
        self.assertEqual((data["order"], data["amount"], data["state"]), (ORDER, 290, "open"))
        self.assertIn("курсовая", data["variant"])
        self.assertTrue(data["valid_until"].endswith("+03:00"))
        self.assertEqual(data["bot"], f"https://t.me/kladovoygipsrbot?start=paid_{ORDER}")
        cases = (({**link(), "a": "390"}, 400, "link_invalid"),
                 (link(expires=int(time.time()) - 5), 410, "link_expired"),
                 (link(amount=300), 409, "price_mismatch"),
                 ({}, 400, "link_invalid"))
        for params, status, error in cases:
            with self.subTest(error=error):
                self.assertEqual(((got := await self.quote(params))[0], got[1]["error"]), (status, error))

    async def test_quote_closes_with_the_switch_and_with_new_documents(self):
        # проба бота: пока приём закрыт, quote отвечает 503 — бот не предлагает оплату
        with mock.patch.dict(os.environ, {"ACADEMIC_SALON_KLADOVAYA_PAY_CHECKOUT": "0"}):
            status, data = await self.quote(link(order="kprobe00000"))
        self.assertEqual((status, data["error"]), (503, "checkout_closed"))
        self.m.config.DOC_EDITIONS = {"privacy": "3.1", "oferta": "3.3"}
        for _ in range(2):
            status, data = await self.quote()
            self.assertEqual((status, data["error"]), (503, "checkout_closed"))
        status, data = await self.checkout()
        self.assertEqual((status, data["error"]), (503, "checkout_closed"))
        self.assertEqual(self.robokassa.forms, [])
        self.assertEqual(len(await self.alerted("DOC_EDITIONS")), 1)
        # оплаченный заказ показывает «Уже оплачено» и при закрытом приёме
        self.m.config.DOC_EDITIONS = {"privacy": "3.1", "oferta": "3.2"}
        await self.checkout()
        inv_id = int(self.robokassa.forms[0]["InvId"])
        self.assertEqual(await self.result(result_form(inv_id, "290.00")), (200, f"OK{inv_id}"))
        with mock.patch.dict(os.environ, {"ACADEMIC_SALON_KLADOVAYA_PAY_CHECKOUT": "0"}):
            status, data = await self.quote()
        self.assertEqual((status, data["state"]), (200, "paid"))

    async def test_checkout_creates_one_signed_invoice_with_receipt(self):
        status, data = await self.checkout()
        self.assertEqual(status, 200, data)
        self.assertTrue(data["url"].startswith("https://auth.robokassa.ru/Merchant/Index/inv-4000000"))
        form = self.robokassa.forms[0]
        inv_id = int(form["InvId"])
        self.assertTrue(self.kp.INV_OFFSET < inv_id < self.kp.INV_OFFSET + self.kp.INV_SPAN)
        self.assertEqual((form["OutSum"], form["Shp_kind"], form["Shp_order"], form["Email"]),
                         ("290.00", "kladovaya", ORDER, "student@example.com"))
        self.assertEqual(form["SuccessUrl2"], f"https://akademsalon.ru/api/kladovaya/pay/return/paid/{ORDER}")
        self.assertEqual(form["FailUrl2"], f"https://akademsalon.ru/api/kladovaya/pay/return/fail/{ORDER}")
        self.assertNotIn("IsTest", form)
        item = json.loads(form["Receipt"])["items"][0]
        self.assertEqual((item["sum"], item["tax"], item["payment_object"], item["payment_method"]),
                         (290, "none", "service", "full_payment"))
        self.assertIn(ORDER, item["name"])
        audit = [c for c in self.m.db.calls if c[0] == "invoice"]
        self.assertEqual(len(audit), 1)
        self.assertEqual((audit[0][1]["inv_id"], audit[0][1]["scope"], audit[0][1]["kind"], audit[0][1]["amount"]),
                         (inv_id, "kladovaya", "format_fix", 290))
        self.assertEqual(audit[0][1]["receipt_payload"], form["Receipt"])
        # без почты: по ней планировщик Салона прислал бы студенту своё подтверждение с личным кабинетом
        self.assertNotIn("buyer_email", audit[0][1])
        spec = json.loads(self.table("SELECT spec FROM invoices")[0][0])
        self.assertEqual((spec["edition"], spec["mode"], spec["documents"]["oferta"], spec["sha256"]),
                         ("format_fix 1.0", "А1", "3.2", self.kp.SPEC_SHA256))
        again_status, again = await self.checkout()
        self.assertEqual((again_status, again["url"]), (200, data["url"]))
        self.assertEqual(len(self.robokassa.forms), 1)
        _, other = await self.checkout(email="other@example.com")
        self.assertNotEqual(other["url"], data["url"])
        self.assertEqual(len(self.robokassa.forms), 2)

    async def test_checkout_refuses_bad_input(self):
        for body, status, error in (
            ({**link(), "email": "нет почты", "accept": True}, 400, "email_invalid"),
            ({**link(), "email": "student@example.com"}, 400, "accept_required"),
            ({**link(), "email": "student@example.com", "accept": "true"}, 400, "accept_required"),
            ({**link(amount=300), "email": "student@example.com", "accept": True}, 409, "price_mismatch"),
            ([1, 2], 400, "bad_request"),
        ):
            with self.subTest(error=error):
                response = await self.client.post("/api/kladovaya/pay/checkout", json=body)
                self.assertEqual((response.status, (await response.json())["error"]), (status, error))
        response = await self.client.post("/api/kladovaya/pay/checkout", data=b"{oops",
                                          headers={"Content-Type": "application/json"})
        self.assertEqual(response.status, 400)
        with mock.patch.dict(os.environ, {"ACADEMIC_SALON_KLADOVAYA_PAY_CHECKOUT": "0"}):
            status, data = await self.checkout()
        self.assertEqual((status, data["error"]), (503, "checkout_closed"))
        self.assertEqual(self.robokassa.forms, [])

    async def test_kassa_refusal_and_server_errors_reach_the_page_and_the_owner(self):
        self.m.config.robo_pass1 = lambda: "не тот пароль"  # касса отвергнет подпись формы
        status, data = await self.checkout()
        self.assertEqual((status, data["error"]), (503, "provider_unavailable"))
        self.assertTrue(await self.alerted("errorCode 29"))
        self.m.db.fail_upsert = True
        status, data = await self.checkout(email="other@example.com")
        self.assertEqual((status, data["error"]), (500, "server_error"))

    async def test_result_url_pays_once_and_bot_gets_one_signed_notice(self):
        _, data = await self.checkout()
        inv_id = int(self.robokassa.forms[0]["InvId"])
        status, text = await self.result(result_form(inv_id, "290.000000"))
        self.assertEqual((status, text), (200, f"OK{inv_id}"))
        got = await self.received()
        self.assertEqual(len(got), 1)
        body = got[0]
        self.assertEqual(list(body), ["order", "product", "amount", "inv_id", "paid_at"])
        self.assertEqual((body["order"], body["product"], body["amount"], body["inv_id"]),
                         (ORDER, "format_fix", 290, inv_id))
        self.assertRegex(body["paid_at"], r"^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+03:00$")
        self.assertIn(("paid", "robokassa", inv_id, True), self.m.db.calls)
        self.assertTrue(await self.alerted(f"заказ {ORDER}"))
        # повтор ResultURL: тот же ответ, ни второй записи, ни второго уведомления, ни второго аудита
        status, text = await self.result(result_form(inv_id, "290.00"))
        self.assertEqual((status, text), (200, f"OK{inv_id}"))
        await asyncio.sleep(0.3)
        self.assertEqual(len(self.bot.received), 1)
        self.assertEqual(self.table("SELECT state, attempts FROM outbox"), [("sent", 1)])
        self.assertEqual(len([c for c in self.m.db.calls if c[0] == "paid"]), 1)
        self.assertEqual(len([t for t in self.m.notify.sent if "оплачено" in t]), 1)
        status, quote = await self.quote()
        self.assertEqual(quote["state"], "paid")
        status, again = await self.checkout()
        self.assertEqual((status, again["error"]), (409, "already_paid"))

    async def test_admin_messages_do_not_hold_the_answer_to_the_kassa(self):
        await self.checkout()
        inv_id = int(self.robokassa.forms[0]["InvId"])
        self.m.notify.delay = 2.0  # Telegram тормозит
        started = time.monotonic()
        self.assertEqual(await self.result(result_form(inv_id, "290.00")), (200, f"OK{inv_id}"))
        self.assertLess(time.monotonic() - started, 1.5)
        self.assertTrue(await self.alerted("оплачено", timeout=8))

    async def test_result_url_with_bad_signature_changes_nothing(self):
        await self.checkout()
        inv_id = int(self.robokassa.forms[0]["InvId"])
        for form in (result_form(inv_id, "290.00", password=PASS1),
                     {**result_form(inv_id, "290.00"), "Shp_order": "kzzzzzzzzzz"},
                     {**result_form(inv_id, "290.00"), "OutSum": "390.00"}):
            status, text = await self.result(form)
            self.assertEqual((status, text), (400, "bad sign"))
        self.assertEqual(self.table("SELECT state FROM orders"), [("open",)])
        self.assertFalse([c for c in self.m.db.calls if c[0] == "paid"])
        await asyncio.sleep(0.2)
        self.assertEqual(self.bot.received, [])
        self.assertEqual(self.table("SELECT COUNT(*) FROM alerts"), [(0,)])

    async def test_result_url_with_foreign_amount_is_refused(self):
        await self.checkout()
        inv_id = int(self.robokassa.forms[0]["InvId"])
        status, text = await self.result(result_form(inv_id, "390.00"))  # подпись кассы верная, сумма чужая
        self.assertEqual((status, text), (400, "bad amount"))
        self.assertEqual(self.table("SELECT state FROM orders"), [("open",)])
        self.assertEqual(self.table("SELECT event FROM audit WHERE event='bad_amount'"), [("bad_amount",)])
        self.assertTrue(await self.alerted("на 390 ₽"))
        status, text = await self.result(result_form(inv_id, "290.00", order="kzzzzzzzzzz"))
        self.assertEqual((status, text), (400, "payment mismatch"))
        await asyncio.sleep(0.2)
        self.assertEqual(self.bot.received, [])

    async def test_second_paid_invoice_of_a_paid_order_goes_to_the_owner(self):
        await self.checkout()
        await self.checkout(email="other@example.com")
        first, second = (int(f["InvId"]) for f in self.robokassa.forms)
        self.assertEqual(await self.result(result_form(first, "290.00")), (200, f"OK{first}"))
        self.assertEqual(await self.result(result_form(second, "290.00")), (200, f"OK{second}"))
        self.assertIn(("paid", "robokassa", second, False), self.m.db.calls)
        self.assertTrue(await self.alerted("повторная оплата"))
        await self.received()
        await asyncio.sleep(0.3)
        self.assertEqual(len(self.bot.received), 1)
        self.assertEqual(self.bot.received[0]["inv_id"], first)

    async def test_other_payment_kinds_are_not_touched(self):
        status, text = await self.result(result_form(70_000_001, "5000.00", order="12", kind="deposit"))
        self.assertEqual((status, text), (400, "unknown invoice"))  # хук вернул None — дальше старая ветка
        self.assertEqual(await self.result(result_form(50_000_001, "690.00", order="1", kind="material")),
                         (200, "OK50000001"))
        await self.checkout()
        inv_id = int(self.robokassa.forms[0]["InvId"])
        self.assertEqual(await self.result(result_form(inv_id, "290.00", kind="deposit")), (400, "payment mismatch"))
        self.assertEqual(await self.result(result_form(70_000_001, "290.00")), (400, "payment mismatch"))
        self.assertEqual(self.table("SELECT state FROM orders"), [("open",)])
        self.assertTrue(await self.alerted("Shp_kind=deposit"))

    async def test_return_from_robokassa_leads_to_the_bot(self):
        for path, location in (
            (f"/api/kladovaya/pay/return/paid/{ORDER}", f"https://t.me/kladovoygipsrbot?start=paid_{ORDER}"),
            (f"/api/kladovaya/pay/return/fail/{ORDER}?OutSum=290.00&InvId=40000001&Shp_order={ORDER}",
             f"https://t.me/kladovoygipsrbot?start=payfail_{ORDER}"),
            ("/api/kladovaya/pay/return/paid/K<script>", "https://t.me/kladovoygipsrbot"),
        ):
            with self.subTest(path=path):
                response = await self.client.get(path, allow_redirects=False)
                self.assertEqual((response.status, response.headers["Location"]), (302, location))
        response = await self.client.get(f"/api/kladovaya/pay/return/maybe/{ORDER}", allow_redirects=False)
        self.assertIn(response.status, (404, 405))  # не наш маршрут: дальше только OPTIONS /api/*

    async def test_lost_result_url_is_caught_by_opstate_when_student_returns(self):
        await self.checkout()
        inv_id = int(self.robokassa.forms[0]["InvId"])
        self.robokassa.states[inv_id] = ("100", "290.000000", {"Shp_kind": "kladovaya", "Shp_order": ORDER})
        response = await self.client.get(f"/api/kladovaya/pay/return/paid/{ORDER}", allow_redirects=False)
        self.assertEqual(response.status, 302)
        got = await self.received()
        self.assertEqual([(b["order"], b["inv_id"]) for b in got], [(ORDER, inv_id)])
        self.assertEqual(self.table("SELECT state, source FROM invoices"), [("paid", "opstate")])
        self.assertIn(("paid", "robokassa", inv_id, True), self.m.db.calls)

    async def test_return_from_the_kassa_is_throttled(self):
        await self.checkout()
        for _ in range(10):
            await self.client.get(f"/api/kladovaya/pay/return/paid/{ORDER}", allow_redirects=False)
        deadline = time.monotonic() + 3
        while self.robokassa.opstate_calls < 1 and time.monotonic() < deadline:
            await asyncio.sleep(0.05)
        await asyncio.sleep(0.3)
        self.assertEqual(self.robokassa.opstate_calls, 1)
        # заказ без счетов: ни пишущей транзакции, ни сверки
        audit = self.table("SELECT COUNT(*) FROM audit")
        for _ in range(5):
            response = await self.client.get("/api/kladovaya/pay/return/paid/kunknown001", allow_redirects=False)
            self.assertEqual(response.headers["Location"], "https://t.me/kladovoygipsrbot?start=paid_kunknown001")
        await asyncio.sleep(0.3)
        self.assertEqual((self.table("SELECT COUNT(*) FROM audit"), self.robokassa.opstate_calls), (audit, 1))

    async def test_broken_database_keeps_the_salon_up(self):
        broken = self.tmp / "broken.sqlite3"
        broken.write_bytes(b"not a database, " * 64)
        with mock.patch.dict(os.environ, {"ACADEMIC_SALON_KLADOVAYA_PAY_DB": str(broken)}):
            client = TestClient(TestServer(self.m.webapp.build_app(object())))
            await client.start_server()
        try:
            response = await client.get("/api/kladovaya/pay/quote", params=link())
            self.assertEqual((response.status, (await response.json())["error"]), (503, "not_configured"))
            response = await client.post("/api/pay/robokassa", data=result_form(40_000_001, "290.00"))
            self.assertEqual(response.status, 503)
            response = await client.post("/api/pay/robokassa", data=result_form(50_000_001, "690.00", kind="material"))
            self.assertEqual((response.status, await response.text()), (200, "OK50000001"))
            response = await client.get(f"/api/kladovaya/pay/return/paid/{ORDER}", allow_redirects=False)
            self.assertEqual(response.headers["Location"], f"https://t.me/kladovoygipsrbot?start=paid_{ORDER}")
            self.assertTrue(await self.alerted("не открылась"))
        finally:
            await client.close()


class WorkerTests(unittest.IsolatedAsyncioTestCase):
    """Сторож без HTTP: часы, касса и бот подменены, шаги вызываются по одному."""

    async def asyncSetUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.env = mock.patch.dict(os.environ, {"ACADEMIC_SALON_KLADOVAYA_PAY_SECRET": SECRET})
        self.env.start()
        self.m = load(self.tmp)
        self.kp = self.m.kp
        self.clock = Clock()
        self.answer, self.asked, self.bot_got = None, [], []

        async def opstate(inv_id):
            self.asked.append(self.clock.now)
            if self.answer is None:
                raise self.kp.PayError("provider_unavailable", 503)
            return self.answer

        async def send(body):
            self.bot_got.append(body)
            return True, "http 200"

        self.runtime = self.kp.Runtime({"bot": object()}, self.tmp / "worker.sqlite3", clock=self.clock,
                                       opstate=opstate, send=send)
        self.store = self.runtime.store

    async def asyncTearDown(self):
        self.env.stop()
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def invoice(self, order=ORDER, amount=290):
        lk = {"order": order, "product": "format_fix", "amount": amount, "expires": int(self.clock.now) + 3600}
        inv = self.store.open_invoice(lk, "student@example.com", "{}", self.kp.receipt_for(lk), self.clock.now)
        self.store.set_url(inv["id"], f"https://pay.example/{inv['id']}")
        return inv["id"], lk["expires"]

    def row(self, local_id):
        with self.store.read() as c:
            return dict(c.execute("SELECT * FROM invoices WHERE id=?", (local_id,)).fetchone())

    def alert_keys(self):
        with self.store.read() as c:
            return [r[0] for r in c.execute("SELECT key FROM alerts ORDER BY id")]

    async def test_reconcile_keeps_asking_past_the_link_and_tells_the_owner_after_a_day(self):
        local, expires = self.invoice()
        while self.clock.now < expires + 30 * 3600:  # касса молчит полтора дня
            self.clock.now = max(self.clock.now, self.row(local)["next_check"])
            await self.runtime.reconcile()
        self.assertTrue(any(t > expires + 2 * 3600 for t in self.asked))
        self.assertEqual([k for k in self.alert_keys() if k.startswith("unresolved:")],
                         [f"unresolved:{self.kp.INV_OFFSET + local}"])
        self.answer = paid_answer()
        self.clock.now = self.row(local)["next_check"]
        await self.runtime.reconcile()
        self.assertEqual((self.row(local)["state"], self.row(local)["source"]), ("paid", "opstate"))
        await self.runtime.deliver()
        self.assertEqual(len(self.bot_got), 1)

    async def test_clear_not_paid_after_the_link_closes_the_invoice_but_late_money_still_counts(self):
        local, expires = self.invoice()
        self.answer = {"state": "not_found"}
        self.clock.now = self.row(local)["next_check"]
        await self.runtime.reconcile()  # ссылка ещё жива — счёт ждёт
        self.assertEqual(self.row(local)["state"], "pending")
        self.answer = {"state": "5"}
        while self.row(local)["state"] == "pending":
            self.clock.now = self.row(local)["next_check"]
            await self.runtime.reconcile()
        self.assertGreaterEqual(self.clock.now, expires + self.kp.SETTLE_AFTER)
        self.assertEqual((self.row(local)["state"], self.row(local)["provider_state"]), ("closed", "5"))
        self.assertEqual(self.store.due_checks(self.clock.now + 10 ** 6), [])
        result = self.store.confirm(self.kp.INV_OFFSET + local, 290, ORDER, "result", self.clock.now)
        self.assertEqual(result["result"], "paid")

    async def test_kassa_sum_may_come_in_incsum_and_foreign_fields_close_with_an_alert(self):
        local, _ = self.invoice()
        self.answer = paid_answer(out="281.300000", inc="290.000000")  # OutSum за вычетом комиссии
        self.clock.now = self.row(local)["next_check"]
        await self.runtime.reconcile()
        self.assertEqual(self.row(local)["state"], "paid")
        for order, answer in (("kother00001", paid_answer(order="kforeign001")),
                              ("kother00002", paid_answer(order="kother00002", out="390", inc="390"))):
            with self.subTest(order=order):
                other, _ = self.invoice(order=order)
                self.answer = answer
                self.clock.now = self.row(other)["next_check"]
                await self.runtime.reconcile()
                self.assertEqual((self.row(other)["state"], self.row(other)["provider_state"]), ("closed", "mismatch"))
                self.assertIn(f"opstate_mismatch:{self.kp.INV_OFFSET + other}", self.alert_keys())
                self.assertEqual(self.store.order(order)["state"], "open")

    async def test_admin_alerts_wait_for_telegram(self):
        self.store.add_alert("t1", "первое", self.clock.now)
        self.store.add_alert("t1", "первое", self.clock.now)  # тот же ключ второй раз не пишется
        self.m.notify.result = 0
        await self.runtime.send_alerts()
        self.clock.now += 59
        await self.runtime.send_alerts()
        self.assertEqual((len(self.m.notify.attempts), self.m.notify.sent), (1, []))
        self.clock.now += 1
        self.m.notify.result = 1
        await self.runtime.send_alerts()
        self.assertEqual(self.m.notify.sent, ["первое"])
        self.runtime.app = {}  # бота нет — сообщение ждёт
        self.store.add_alert("t2", "второе", self.clock.now)
        await self.runtime.send_alerts()
        self.assertEqual(self.store.status()["alerts"], {"sent": 1, "pending": 1})

    async def test_receipt_audit_failure_is_carried_by_the_worker(self):
        local, _ = self.invoice()
        inv_id = self.kp.INV_OFFSET + local
        self.m.db.fail_mark = 1
        result = await self.runtime.confirm(inv_id, 290, order=ORDER, source="result")
        self.assertEqual(result["result"], "paid")
        self.assertEqual(self.row(local)["receipt_synced"], 0)
        await self.runtime.sync_receipts()
        self.assertFalse([c for c in self.m.db.calls if c[0] == "paid"])
        self.clock.now += self.kp.RECEIPT_RETRY
        await self.runtime.sync_receipts()
        self.assertEqual([c for c in self.m.db.calls if c[0] == "paid"], [("paid", "robokassa", inv_id, True)])
        self.assertEqual(self.row(local)["receipt_synced"], 1)
        await self.runtime.confirm(inv_id, 290, order=ORDER, source="result")
        self.assertEqual(len([c for c in self.m.db.calls if c[0] == "paid"]), 1)


class NotifyTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.env = mock.patch.dict(os.environ, {"ACADEMIC_SALON_KLADOVAYA_PAY_SECRET": SECRET})
        self.env.start()
        self.m = load(self.tmp)
        self.kp = self.m.kp
        self.bot = FakeKladovayaBot()
        self.server = TestServer(self.bot.app())
        await self.server.start_server()
        self.url = str(self.server.make_url("/salon/paid"))

    async def asyncTearDown(self):
        await self.server.close()
        self.env.stop()
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def paid_runtime(self, sends):
        clock = Clock()
        calls = []

        async def send(body):
            calls.append((clock.now, body))
            return sends.pop(0) if sends else (False, "http 503")

        app = {"bot": object()}
        runtime = self.kp.Runtime(app, self.tmp / "notify.sqlite3", clock=clock, send=send)
        lk = {"order": ORDER, "product": "format_fix", "amount": 390, "expires": int(clock.now) + 3600}
        inv = runtime.store.open_invoice(lk, "student@example.com", "{}", self.kp.receipt_for(lk), clock.now)
        runtime.store.set_url(inv["id"], "https://pay.example/1")
        runtime.store.confirm(self.kp.INV_OFFSET + inv["id"], 390, ORDER, "result", clock.now)
        return runtime, clock, calls

    async def test_post_signs_the_raw_body_and_needs_200(self):
        body = '{"order":"kabcdef1234","product":"format_fix","amount":290,"inv_id":40000001,"paid_at":"2026-10-31T12:00:00+03:00"}'
        self.assertEqual(await self.kp.post_notification(body, url=self.url), (True, "http 200"))
        self.assertEqual(self.bot.raw, [body.encode()])
        self.bot.statuses = [500, 302, 201, 404, 409]
        for expected in ("http 500", "http 302", "http 201", "http 404", "http 409"):
            self.assertEqual(await self.kp.post_notification(body, url=self.url), (False, expected))
        ok, error = await self.kp.post_notification(body, url=self.url, key=b"x" * 64)
        self.assertEqual((ok, error), (False, "http 403"))
        await self.server.close()
        ok, error = await self.kp.post_notification(body, url=self.url)
        self.assertFalse(ok)
        self.assertTrue(error)

    async def test_retries_with_pauses_until_the_bot_answers(self):
        runtime, clock, calls = self.paid_runtime([(False, "http 502"), (False, "ClientConnectorError"),
                                                   (True, "http 200")])
        start = clock.now
        await runtime.deliver()
        clock.now = start + 29
        await runtime.deliver()
        self.assertEqual(len(calls), 1)
        clock.now = start + 30
        await runtime.deliver()
        clock.now = start + 30 + 59
        await runtime.deliver()
        self.assertEqual(len(calls), 2)
        clock.now = start + 90
        await runtime.deliver()
        self.assertEqual([t - start for t, _ in calls], [0, 30, 90])
        self.assertEqual(len({body for _, body in calls}), 1)  # повторы шлют те же байты
        state = runtime.store.status()
        self.assertEqual(state["outbox"], {"sent": 1})
        with runtime.store.read() as c:  # минута сбоев — админов не дёргаем
            self.assertFalse([r for r in c.execute("SELECT key FROM alerts WHERE key LIKE 'notify%'")])

    async def test_warns_after_an_hour_gives_up_after_a_day_and_can_be_requeued(self):
        runtime, clock, calls = self.paid_runtime([])
        start = clock.now
        for _ in range(100):
            await runtime.deliver()
            with runtime.store.read() as c:
                row = c.execute("SELECT state, next_at FROM outbox").fetchone()
            if row["state"] != "pending":
                break
            clock.now = row["next_at"]
        offsets = [t - start for t, _ in calls]
        self.assertEqual(offsets[:9], [0, 30, 90, 210, 510, 1110, 2310, 4110, 7710])
        self.assertEqual(offsets[-1], 24 * 3600)
        self.assertTrue(all(b - a <= 3600 for a, b in zip(offsets, offsets[1:])))
        self.assertEqual(runtime.store.status()["outbox"], {"failed": 1})
        with runtime.store.read() as c:
            alerts = {r["key"].split(":")[0]: (r["created_at"] - start, r["text"])
                      for r in c.execute("SELECT key, created_at, text FROM alerts")}
        self.assertEqual(set(alerts), {"paid", "notify_slow", "notify_failed"})
        self.assertEqual(alerts["notify_slow"][0], 4110)  # первая неудача позже часа
        self.assertIn("час", alerts["notify_slow"][1])
        self.assertIn(f"requeue {ORDER}", alerts["notify_failed"][1])
        await runtime.send_alerts()
        self.assertEqual(len(self.m.notify.sent), 3)
        await runtime.deliver()
        await runtime.send_alerts()
        self.assertEqual(len(self.m.notify.sent), 3)
        self.assertTrue(runtime.store.requeue(ORDER, clock.now))
        runtime.send = self.kp.post_notification
        with mock.patch.dict(os.environ, {"ACADEMIC_SALON_KLADOVAYA_PAY_NOTIFY_URL": self.url}):
            await runtime.deliver()
            self.assertEqual(runtime.store.status()["outbox"], {"sent": 1})
            # доставленное тоже можно повторить: бот на повтор отвечает 200
            self.assertTrue(runtime.store.requeue(ORDER, clock.now))
            await runtime.deliver()
        self.assertEqual([b["amount"] for b in self.bot.received], [390, 390])
        self.assertFalse(runtime.store.requeue("knothing0001", clock.now))

    async def test_notify_url_must_be_https_or_local(self):
        for url in ("http://studkladovaya.ru/salon/paid", "ftp://127.0.0.1/x", "https://"):
            with mock.patch.dict(os.environ, {"ACADEMIC_SALON_KLADOVAYA_PAY_NOTIFY_URL": url}):
                self.assertEqual(await self.kp.post_notification("{}"), (False, "notify_url_invalid"))
        with mock.patch.dict(os.environ, {"ACADEMIC_SALON_KLADOVAYA_PAY_NOTIFY_URL": ""}):
            self.assertEqual(self.kp.notify_url(), "https://studkladovaya.ru/salon/paid")


class InstallerTests(Env):
    def setUp(self):
        super().setUp()
        self.inst = self.m.inst
        self.root = self.tmp / "salon_bot"
        for rel, text in STUBS.items():
            (self.root / rel).parent.mkdir(parents=True, exist_ok=True)
            (self.root / rel).write_bytes(text.encode("utf-8"))
        (self.root / "app/webapp.py").write_bytes(LIVE_WEBAPP.encode("utf-8"))
        live_hash = hashlib.sha256(LIVE_WEBAPP.encode()).hexdigest()
        self.known = mock.patch.object(self.inst, "KNOWN_BEFORE", {"app/webapp.py": {live_hash}})
        self.known.start()
        self.addCleanup(self.known.stop)
        self.secret, self.zero = self.tmp / "etc/kladovaya-pay/secret", self.tmp / "zero_campaign_hmac"
        self.zero.write_text("z" * 48 + "\n", encoding="utf-8")
        self.dropin = self.tmp / "salon-bot-v2.service.d/kladovaya-pay.conf"

    def apply(self, **kwargs):
        options = dict(derive=True, do_restart=False, base="http://127.0.0.1:9",
                       notify_url="https://studkladovaya.ru/salon/paid", dropin=self.dropin,
                       secret_path=self.secret, zero=self.zero)
        options.update(kwargs)
        with quiet():
            return self.inst.apply(self.root, **options)

    def rollback(self, backup, **kwargs):
        with quiet():
            self.inst.rollback(self.root, backup, do_restart=False, base="http://127.0.0.1:9", dropin=self.dropin,
                               **kwargs)

    def assert_clean(self):
        self.assertEqual((self.root / "app/webapp.py").read_bytes(), LIVE_WEBAPP.encode("utf-8"))
        self.assertFalse((self.root / "app/services/kladovaya_pay.py").exists())
        self.assertFalse(self.dropin.exists())

    def test_hooks_sit_after_the_signature_check_and_come_off_exactly(self):
        text = self.inst.patched(LIVE_WEBAPP)
        self.assertEqual(text.count(self.inst.MARKER), 2)
        hook = text.index("kladovaya_callback(request.app")
        self.assertLess(text.index('return web.Response(status=400, text="bad sign")'), hook)
        self.assertLess(text.index("material_response = await material_callback"), hook)
        self.assertLess(hook, text.index("# Robokassa возвращает в ResultURL"))
        self.assertLess(text.index("register_kladovaya_pay(app)"), text.index('r.add_options("/api/{tail:.*}"'))
        self.assertEqual(self.inst.unpatched(text), LIVE_WEBAPP)
        with self.assertRaises(SystemExit):
            self.inst.patched(text)

    def test_check_refuses_unknown_or_moved_source(self):
        self.assertEqual(set(self.inst.check(self.root, dropin=self.dropin)), {"app/webapp.py"})
        (self.root / "app/webapp.py").write_bytes((LIVE_WEBAPP + "\n# правка\n").encode("utf-8"))
        with self.assertRaises(SystemExit) as caught:
            self.inst.check(self.root, dropin=self.dropin)
        self.assertIn("незнакомый", str(caught.exception))
        moved = LIVE_WEBAPP.replace("    register_material_store(app, _session_user)\n", "")
        with mock.patch.object(self.inst, "KNOWN_BEFORE", {"app/webapp.py": {hashlib.sha256(moved.encode()).hexdigest()}}):
            (self.root / "app/webapp.py").write_bytes(moved.encode("utf-8"))
            with self.assertRaises(SystemExit) as caught:
                self.inst.check(self.root, dropin=self.dropin)
        self.assertIn("найдено 0 раз", str(caught.exception))

    def test_check_requires_what_the_module_relies_on(self):
        payments = self.root / "app/services/payments.py"
        payments.write_bytes(STUBS["app/services/payments.py"].replace("ROBO_INVOICE_URL", "ROBO_PAY_URL").encode())
        with self.assertRaises(SystemExit) as caught:
            self.inst.check(self.root, dropin=self.dropin)
        self.assertIn("ROBO_INVOICE_URL", str(caught.exception))
        (self.root / "app/db.py").unlink()
        with self.assertRaises(SystemExit) as caught:
            self.inst.check(self.root, dropin=self.dropin)
        self.assertIn("app/db.py", str(caught.exception))

    def test_apply_then_rollback_keeps_payments_and_foreign_edits(self):
        backup = self.apply()
        webapp = self.root / "app/webapp.py"
        self.assertEqual(webapp.read_bytes(), self.inst.patched(LIVE_WEBAPP).encode("utf-8"))
        module = self.root / "app/services/kladovaya_pay.py"
        # рабочая копия на Windows может быть с CRLF (autocrlf); на сервер модуль уходит с LF
        self.assertEqual(module.read_bytes(), (HERE.parent / "kladovaya_pay.py").read_text(encoding="utf-8").encode("utf-8"))
        dropin = self.dropin.read_text(encoding="utf-8")
        self.assertIn("LoadCredential=kladovaya_pay:/etc/kladovaya-pay/secret\n", dropin)
        self.assertIn("Environment=ACADEMIC_SALON_KLADOVAYA_PAY_NOTIFY_URL=https://studkladovaya.ru/salon/paid\n", dropin)
        expected = hmac.new(b"z" * 48, b"kladovaya-pay-2026-10", hashlib.sha256).hexdigest()
        self.assertEqual(self.secret.read_text(encoding="utf-8"), expected + "\n")
        if os.name == "posix":
            self.assertEqual(self.secret.stat().st_mode & 0o777, 0o600)
        manifest = json.loads((backup / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["secret"], "derived")
        self.assertNotIn(expected, (backup / "manifest.json").read_text(encoding="utf-8"))
        # чужая правка webapp.py после установки переживает откат
        webapp.write_bytes(webapp.read_bytes() + "# чужой релиз\n".encode("utf-8"))
        (self.root / "data").mkdir(exist_ok=True)
        (self.root / "data/kladovaya-pay.sqlite3").write_bytes(b"payments")
        with self.assertRaises(SystemExit):  # база не читается — без --force не откатываем
            self.rollback(backup)
        self.rollback(backup, force=True)
        self.assertEqual(webapp.read_bytes(), (LIVE_WEBAPP + "# чужой релиз\n").encode("utf-8"))
        self.assertFalse(module.exists())
        self.assertFalse(self.dropin.exists())
        self.assertTrue(self.secret.exists())
        self.assertEqual((self.root / "data/kladovaya-pay.sqlite3").read_bytes(), b"payments")

    def test_rollback_refuses_while_the_kassa_has_invoices(self):
        backup = self.apply()
        store = self.kp.Store(self.root / "data/kladovaya-pay.sqlite3")
        lk = {"order": ORDER, "product": "format_fix", "amount": 290, "expires": int(time.time()) + 3600}
        store.open_invoice(lk, "student@example.com", "{}", self.kp.receipt_for(lk), time.time())
        with self.assertRaises(SystemExit) as caught:
            self.rollback(backup)
        self.assertIn("счетов: 1", str(caught.exception))
        self.assertTrue((self.root / "app/services/kladovaya_pay.py").exists())
        self.rollback(backup, force=True)
        self.assert_clean()

    def test_failed_restart_or_probe_rolls_back_by_itself(self):
        failures = {
            "systemctl": (mock.Mock(side_effect=[None, subprocess.CalledProcessError(1, "systemctl"), None, None]),
                          True, "ok"),
            "health": (mock.Mock(), False, "ok"),
            "probe": (mock.Mock(), True, "http 503 checkout_closed"),
        }
        for name, (systemctl, healthy, answer) in failures.items():
            with self.subTest(name), mock.patch.object(self.inst, "systemctl", systemctl), \
                    mock.patch.object(self.inst, "health", return_value=healthy), \
                    mock.patch.object(self.inst, "probe", return_value=answer):
                with self.assertRaises(SystemExit):
                    self.apply(do_restart=True)
                self.assert_clean()
        with mock.patch.object(self.inst, "systemctl"), mock.patch.object(self.inst, "health", return_value=True), \
                mock.patch.object(self.inst, "probe", return_value="ok"):
            self.apply(do_restart=True)
        self.assertTrue((self.root / "app/services/kladovaya_pay.py").exists())

    def test_existing_secret_is_kept_and_missing_one_needs_the_flag(self):
        with self.assertRaises(SystemExit):
            self.apply(derive=False)
        self.assertFalse((self.root / "app/services/kladovaya_pay.py").exists())
        self.assertEqual(self.inst.unpatched(self.inst.patched(LIVE_WEBAPP)), LIVE_WEBAPP)
        if os.name == "posix":
            self.secret.parent.mkdir(parents=True)
            self.secret.write_text("k" * 64 + "\n", encoding="utf-8")
            self.secret.chmod(0o600)
            self.apply()
            self.assertEqual(self.secret.read_text(encoding="utf-8"), "k" * 64 + "\n")


if __name__ == "__main__":
    unittest.main()
