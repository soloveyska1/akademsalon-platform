"""Касса Салона для платных услуг Кладовой ГИПСР (kladovaya-pay:20261031-v1).

Ставится как /root/salon_bot/app/services/kladovaya_pay.py установщиком
install_kladovaya_pay.py; webapp.py получает два хука: регистрацию маршрутов в
build_app и вызов verified_callback в robo_webhook сразу после проверки подписи
ResultURL (Password#2) — там же, где хук магазина.

Путь денег:

1. Бот Кладовой (@kladovoygipsrbot) даёт студенту ссылку
   https://akademsalon.ru/kladovaya-oplata.html?o=<заказ>&p=<услуга>&a=<рубли>&e=<unix>&s=<подпись>,
   где s = hex HMAC-SHA256(секрет, "o|p|a|e"). Ссылка живёт не дольше суток.
2. Страница спрашивает GET /api/kladovaya/pay/quote (подпись, срок, прайс, открыт
   ли приём) и показывает Спецификацию позиции по оферте 3.2 (п. 3.3). POST
   /api/kladovaya/pay/checkout (почта для чека, согласие) создаёт счёт Robokassa
   так же, как магазин (Indexjson): InvId = 40 000 000 + id счёта,
   Shp_kind=kladovaya, Shp_order=<заказ>, Receipt — для чека НПД, возврат —
   /api/kladovaya/pay/return/{paid|fail}/<заказ>, оттуда в бота
   (?start=paid_<заказ> / payfail_<заказ>). Бот перед предложением оплаты сам
   спрашивает quote; пока приём закрыт, quote отвечает 503 и бот молчит.
3. ResultURL: сумма равна сумме счёта (то есть подписанной ботом) и есть в
   прайсе; счёт и заказ оплачиваются по одному разу, повтор отвечает OK без
   побочных эффектов, вторая оплата того же заказа — «не распределено» и
   сообщение админам. Аудит чеков — payment_receipts Салона, как у всех оплат,
   но без почты: по строке с почтой Салон шлёт своё «Подтверждение оплаты» с
   личным кабинетом, а чек НПД студенту и так присылает Robokassa. Потерянный
   ResultURL догоняет сверка OpStateExt — до ясного ответа кассы; сутки после
   конца ссылки без ясного ответа — сообщение админам.
4. Боту уходит POST <ACADEMIC_SALON_KLADOVAYA_PAY_NOTIFY_URL> с телом
   {"order","product","amount","inv_id","paid_at"} и заголовком
   X-Kladovaya-Signature = hex HMAC-SHA256(секрет, сырое тело). Не 200 или нет
   ответа — повтор с паузами 30 с … 1 ч в течение суток; через час неудач и
   после суток — сообщение админам Салона. Тело пишется один раз, повторы шлют
   те же байты.

Сообщения админам пишутся в базу в той же транзакции, что и событие, и уходят
фоном с повторами, пока Telegram их не примет: ответ кассе их не ждёт. Секрет —
/etc/kladovaya-pay/secret через LoadCredential=kladovaya_pay (тот же файл лежит
у бота Кладовой). Своя база — data/kladovaya-pay.sqlite3: заказы, счета, очередь
уведомлений, сообщения админам, журнал. Сбой этой базы не роняет Салон: маршруты
кассы отвечают 503. Базу не восстанавливать из копии поверх новых оплат.
Состояние: python -m app.services.kladovaya_pay status.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import os
import re
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET
from contextlib import contextmanager, suppress
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import urlsplit

import aiohttp
from aiohttp import web

from .. import config, db
from . import mailer, notify, payments

log = logging.getLogger(__name__)

MARKER = "kladovaya-pay:20261031-v1"
STATE_KEY = "kladovaya_pay"
# свободный диапазон InvId: магазин — 50M, чаевые — 60M, депозиты — 70M,
# подарки — 80M, подписки — 90M
INV_OFFSET = 40_000_000
INV_SPAN = 10_000_000
MSK = timezone(timedelta(hours=3))
SITE = "https://akademsalon.ru"
BOT = "https://t.me/kladovoygipsrbot"
NOTIFY_URL = "https://studkladovaya.ru/salon/paid"
OPSTATE_URL = "https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt"
LINK_TTL = 24 * 3600        # ссылка из бота живёт не дольше суток
CLOCK_SKEW = 300
REUSE_MARGIN = 600          # готовый счёт отдаём повторно, если ему жить ещё 10 минут
MAX_INVOICES = 10           # новых счетов на один заказ
NOTIFY_WINDOW = 24 * 3600
NOTIFY_WARN = 3600          # бот час не принимает уведомление — сказать админам, повторы идут дальше
RETRY = (30, 60, 120, 300, 600, 1200, 1800, 3600)  # дальше — раз в час
LEASE = 120
FIRST_CHECK = 120
SETTLE_AFTER = 600          # после конца ссылки ясный ответ «не оплачено» закрывает счёт
UNRESOLVED_WARN = 24 * 3600   # сутки после конца ссылки без ясного ответа кассы — сказать админам
UNRESOLVED_LIMIT = 7 * 24 * 3600
NOT_PAID = {"not_found", "5", "10", "60"}  # OpStateExt: нет операции, только начата, отменена, возвращена
RETURN_GAP = 60             # возврат с кассы будит сверку заказа не чаще раза в минуту
RECEIPT_RETRY = 300
ALERT_RETRY = (60, 300, 900, 3600)  # дальше — раз в час
ALERT_WINDOW = 7 * 24 * 3600
SPEC_EDITION = "format_fix 1.0"
# sha256 раздела «Условия услуги» (scripts/kladovaya-pay-20261031/page/main.html, LF):
# любая правка текста — новая редакция и новый хеш, тест сверяет их
SPEC_SHA256 = "6355213d9ca9e5f6af320fe3bd3f350aa928f40bf61bc67a2137ac6b65ad9f32"
SPEC_DOCS = {"oferta": "3.2", "privacy": "3.1"}  # редакции, под которые написана спецификация
ORDER_RE = re.compile(r"k[a-z0-9]{10}")
AMOUNT_RE = re.compile(r"[1-9][0-9]{0,6}")
EXPIRES_RE = re.compile(r"[0-9]{9,11}")
SIG_RE = re.compile(r"[0-9a-f]{64}")
RETURN_ROUTE = "/api/kladovaya/pay/return/{result:paid|fail}/{order}"
PRODUCTS = {
    "format_fix": {
        "title": "Исправление оформления работы",
        "prices": {
            290: "курсовая, НПР, отчёт по практике или самостоятельная работа",
            390: "выпускная квалификационная работа (ВКР)",
        },
        "receipt": "Исправление оформления учебной работы (файл .docx)",
    },
}

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS orders(
  ord TEXT PRIMARY KEY, product TEXT NOT NULL, created_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','paid')),
  paid_inv INTEGER UNIQUE, paid_at TEXT);
CREATE TABLE IF NOT EXISTS invoices(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ord TEXT NOT NULL REFERENCES orders(ord),
  product TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0),
  email TEXT NOT NULL, link_expires INTEGER NOT NULL, spec TEXT NOT NULL,
  receipt TEXT NOT NULL, url TEXT, created_at INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','paid','duplicate','closed')),
  paid_at TEXT, source TEXT, checks INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER NOT NULL DEFAULT 0, next_check INTEGER NOT NULL DEFAULT 0,
  provider_state TEXT, warned INTEGER NOT NULL DEFAULT 0,
  receipt_synced INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS invoices_ord ON invoices(ord);
CREATE TABLE IF NOT EXISTS outbox(
  ord TEXT PRIMARY KEY REFERENCES orders(ord), body TEXT NOT NULL,
  created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','failed')),
  last_error TEXT, sent_at INTEGER, warned INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS alerts(
  id INTEGER PRIMARY KEY, key TEXT NOT NULL UNIQUE, text TEXT NOT NULL,
  created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sent','failed')),
  sent_at INTEGER);
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY, ord TEXT, inv_id INTEGER, event TEXT NOT NULL,
  created_at INTEGER NOT NULL, detail TEXT NOT NULL DEFAULT '{}');
"""


class PayError(Exception):
    def __init__(self, code: str, status: int = 409, *, detail: str = ""):
        super().__init__(code)
        self.code, self.status, self.detail = code, status, detail


def iso(ts: float) -> str:
    return datetime.fromtimestamp(int(ts), MSK).isoformat(timespec="seconds")


def secret() -> bytes:
    value = os.environ.get("ACADEMIC_SALON_KLADOVAYA_PAY_SECRET", "").strip()
    directory = os.environ.get("CREDENTIALS_DIRECTORY", "").strip()
    if not value and directory:
        with suppress(FileNotFoundError):
            value = (Path(directory) / "kladovaya_pay").read_text(encoding="utf-8").strip()
    if len(value) < 32:
        raise PayError("not_configured", 503)
    return value.encode("utf-8")


def notify_url() -> str:
    url = os.environ.get("ACADEMIC_SALON_KLADOVAYA_PAY_NOTIFY_URL", "").strip() or NOTIFY_URL
    parts = urlsplit(url)
    local = parts.scheme == "http" and parts.hostname in {"127.0.0.1", "localhost"}
    if not (parts.scheme == "https" or local) or not parts.hostname:
        raise PayError("notify_url_invalid", 503)
    return url


def checkout_open() -> bool:
    return os.environ.get("ACADEMIC_SALON_KLADOVAYA_PAY_CHECKOUT", "1").strip() != "0"


def database_path() -> Path:
    custom = os.environ.get("ACADEMIC_SALON_KLADOVAYA_PAY_DB", "").strip()
    return Path(custom) if custom else Path(__file__).resolve().parents[2] / "data" / "kladovaya-pay.sqlite3"


def link_signature(key: bytes, order: str, product: str, amount, expires) -> str:
    message = f"{order}|{product}|{amount}|{expires}".encode("utf-8")
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def verify_link(params, *, key: bytes | None = None, now: float | None = None) -> dict:
    """Ссылка из бота: формат → подпись → срок → прайс. Всё — до любых записей."""
    order, product, amount, expires, sig = (str(params.get(k) or "").strip() for k in "opaes")
    sig = sig.lower()
    if not (ORDER_RE.fullmatch(order) and product in PRODUCTS and AMOUNT_RE.fullmatch(amount)
            and EXPIRES_RE.fullmatch(expires) and SIG_RE.fullmatch(sig)):
        raise PayError("link_invalid", 400)
    if not hmac.compare_digest(link_signature(key or secret(), order, product, amount, expires), sig):
        raise PayError("link_invalid", 400)
    now = time.time() if now is None else now
    if int(expires) <= now:
        raise PayError("link_expired", 410)
    if int(expires) > now + LINK_TTL + CLOCK_SKEW:
        raise PayError("link_invalid", 400)
    if int(amount) not in PRODUCTS[product]["prices"]:
        raise PayError("price_mismatch", 409)
    return {"order": order, "product": product, "amount": int(amount), "expires": int(expires)}


def documents_changed() -> dict:
    """Редакции оферты и политики, которые разошлись с теми, под которые написана спецификация."""
    docs = dict(getattr(config, "DOC_EDITIONS", {}) or {})
    return {key: docs.get(key) for key, want in SPEC_DOCS.items() if str(docs.get(key)) != want}


def specification(link: dict, now: float) -> dict:
    """Снимок Спецификации, показанной до оплаты (оферта 3.2, п. 3.3)."""
    product = PRODUCTS[link["product"]]
    docs = dict(getattr(config, "DOC_EDITIONS", {}) or {})
    return {
        "edition": SPEC_EDITION, "sha256": SPEC_SHA256, "order": link["order"], "mode": "А1",
        "position": product["title"], "variant": product["prices"][link["amount"]],
        "amount": link["amount"], "payment": "100% предоплата",
        "valid_until": iso(link["expires"]), "shown_at": iso(now),
        "documents": {key: docs.get(key, value) for key, value in SPEC_DOCS.items()},
    }


def receipt_for(link: dict) -> str:
    """Номенклатура чека НПД: одна позиция-услуга, сумма = OutSum, без НДС."""
    name = f"{PRODUCTS[link['product']]['receipt']}, заказ {link['order']}"[:128]
    return json.dumps({"items": [{"name": name, "quantity": 1, "sum": link["amount"], "tax": "none",
                                  "payment_method": "full_payment", "payment_object": "service"}]},
                      ensure_ascii=False, separators=(",", ":"))


def expiration(expires: int) -> str:
    return datetime.fromtimestamp(int(expires), MSK).strftime("%Y-%m-%dT%H:%M")


def return_urls(order: str) -> tuple[str, str]:
    base = f"{SITE}/api/kladovaya/pay/return"
    return f"{base}/paid/{order}", f"{base}/fail/{order}"


def invoice_form(inv, email: str | None = None) -> dict:
    """Форма Indexjson. Подпись — по сырым значениям, как у магазина (проверено IsTest=1)."""
    inv_id = INV_OFFSET + int(inv["id"])
    out = f"{int(inv['amount']):.2f}"
    success, fail = return_urls(inv["ord"])
    shp = {"Shp_kind": "kladovaya", "Shp_order": inv["ord"]}
    sig = payments._robo_sig(config.ROBOKASSA_LOGIN, out, inv_id, inv["receipt"], success, "GET",
                             fail, "GET", config.robo_pass1(),
                             *(f"{k}={v}" for k, v in sorted(shp.items())))
    form = {"MerchantLogin": config.ROBOKASSA_LOGIN, "InvId": inv_id, "OutSum": out,
            "Description": f"Исправление оформления .docx, заказ {inv['ord']} · Кладовая ГИПСР"[:100],
            "Receipt": inv["receipt"], "SignatureValue": sig,
            "ExpirationDate": expiration(inv["link_expires"]), "Culture": "ru", "Encoding": "utf-8",
            "SuccessUrl2": success, "SuccessUrl2Method": "GET",
            "FailUrl2": fail, "FailUrl2Method": "GET", **shp}
    if email:
        form["Email"] = email
    if config.ROBOKASSA_TEST:
        form["IsTest"] = "1"
    return form


async def create_invoice(inv, email: str | None = None) -> str:
    """Счёт Indexjson. Отказ кассы — PayError с detail: что ответила касса, без секретов."""
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as s:
            async with s.post(payments.ROBO_INVOICE_URL, data=invoice_form(inv, email)) as r:
                status = r.status
                data = await r.json(content_type=None)
    except (aiohttp.ClientError, asyncio.TimeoutError, TimeoutError, ValueError) as exc:
        raise PayError("provider_unavailable", 503, detail=type(exc).__name__) from None
    if not isinstance(data, dict):
        raise PayError("provider_unavailable", 503, detail=f"http {status}")
    code = str(data.get("errorCode") or 0)[:12]
    if code != "0":
        raise PayError("provider_unavailable", 503, detail=f"errorCode {code}")
    invoice = str(data.get("invoiceID") or "")
    if len(invoice) <= 80 and invoice.replace("-", "").isalnum() and invoice.strip("0-"):
        return payments.ROBO_SHORT_URL + invoice
    raise PayError("provider_unavailable", 503, detail=f"http {status}, нет invoiceID")


async def operation(inv_id: int) -> dict:
    """OpStateExt по InvId (Password#2), как сверка магазина."""
    q = {"MerchantLogin": config.ROBOKASSA_LOGIN, "InvoiceID": inv_id,
         "Signature": payments._robo_sig(config.ROBOKASSA_LOGIN, inv_id, config.robo_pass2())}
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=12)) as s:
        async with s.post(OPSTATE_URL, data=q) as r:
            if r.status != 200:
                raise PayError("provider_unavailable", 503)
            raw = await r.text()
    root = ET.fromstring(raw)
    for el in root.iter():
        el.tag = el.tag.split("}")[-1]
    code = root.findtext("Result/Code")
    if code == "3":
        return {"state": "not_found"}
    if code != "0":
        raise PayError("provider_unavailable", 503)
    return {"state": root.findtext("State/Code"), "amount": root.findtext("Info/OutSum"),
            "inc_amount": root.findtext("Info/IncSum"),
            "fields": {f.findtext("Name"): f.findtext("Value") for f in root.findall("UserFields/Field")}}


def operation_amount(observation: dict, inv) -> int:
    """Оплата по OpStateExt: те же Shp_ и сумма счёта — в OutSum или IncSum (смотря кто платит комиссию)."""
    fields = observation.get("fields") or {}
    if fields.get("Shp_kind") != "kladovaya" or fields.get("Shp_order") != inv["ord"]:
        raise PayError("payment_mismatch", 400)
    for raw in (observation.get("amount"), observation.get("inc_amount")):
        try:
            value = Decimal(raw or "")
        except InvalidOperation:
            continue
        if value.is_finite() and value == int(inv["amount"]):
            return int(value)
    raise PayError("payment_mismatch", 400)


async def post_notification(body: str, *, url: str | None = None, key: bytes | None = None) -> tuple[bool, str]:
    """Уведомление боту Кладовой. Успех — только ответ 200."""
    raw = body.encode("utf-8")
    try:
        signature = hmac.new(key or secret(), raw, hashlib.sha256).hexdigest()
        headers = {"Content-Type": "application/json", "X-Kladovaya-Signature": signature}
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as s:
            async with s.post(url or notify_url(), data=raw, headers=headers, allow_redirects=False) as r:
                await r.read()
                return r.status == 200, f"http {r.status}"
    except PayError as exc:
        return False, exc.code
    except (aiohttp.ClientError, asyncio.TimeoutError, TimeoutError, OSError) as exc:
        return False, type(exc).__name__


def retry_delay(attempts: int) -> int:
    return RETRY[min(max(attempts, 1), len(RETRY)) - 1]


def check_gap(age: float) -> int:
    """Пауза между сверками OpStateExt по возрасту счёта; первая — через FIRST_CHECK."""
    if age < 1800:
        return 300
    if age < 3 * 3600:
        return 1800
    return 7200


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.read() as c:
            c.executescript(SCHEMA)

    def connect(self):
        c = sqlite3.connect(str(self.path), timeout=15, isolation_level=None)
        c.row_factory = sqlite3.Row
        c.execute("PRAGMA busy_timeout=15000")
        c.execute("PRAGMA synchronous=FULL")
        return c

    @contextmanager
    def read(self):
        c = self.connect()
        try:
            yield c
        finally:
            c.close()

    @contextmanager
    def tx(self):
        c = self.connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            yield c
            c.commit()
        except BaseException:
            c.rollback()
            raise
        finally:
            c.close()

    @staticmethod
    def log(c, ord_, inv_id, event, now, detail=None):
        c.execute("INSERT INTO audit(ord,inv_id,event,created_at,detail) VALUES(?,?,?,?,?)",
                  (ord_, inv_id, event, int(now), json.dumps(detail or {}, ensure_ascii=False)))

    @staticmethod
    def alert(c, key, text, now):
        """Сообщение админам — в той же транзакции, что и событие; отправляет сторож, повтор по key не пишется."""
        c.execute("INSERT OR IGNORE INTO alerts(key,text,created_at,next_at) VALUES(?,?,?,?)",
                  (key, text, int(now), int(now)))

    def add_alert(self, key, text, now):
        with self.tx() as c:
            self.alert(c, key, text, now)

    def order(self, ord_):
        with self.read() as c:
            row = c.execute("SELECT * FROM orders WHERE ord=?", (ord_,)).fetchone()
            return dict(row) if row else None

    def open_invoice(self, link, email, spec, receipt, now):
        """Счёт для оплаты по ссылке: готовый живой — тот же, иначе новый."""
        with self.tx() as c:
            order = c.execute("SELECT * FROM orders WHERE ord=?", (link["order"],)).fetchone()
            if order is None:
                c.execute("INSERT INTO orders(ord,product,created_at) VALUES(?,?,?)",
                          (link["order"], link["product"], int(now)))
            elif order["product"] != link["product"]:
                raise PayError("order_mismatch", 409)
            elif order["state"] == "paid":
                raise PayError("already_paid", 409)
            same = c.execute(
                "SELECT * FROM invoices WHERE ord=? AND state='pending' AND amount=? AND email=? "
                "ORDER BY id DESC LIMIT 1", (link["order"], link["amount"], email)).fetchone()
            if same and same["url"] and same["link_expires"] >= now + REUSE_MARGIN:
                return dict(same)
            if same and not same["url"]:
                # счёт не дошёл до кассы — повторяем его же с новой ссылкой
                c.execute("UPDATE invoices SET link_expires=?, spec=? WHERE id=?",
                          (link["expires"], spec, same["id"]))
                return dict(c.execute("SELECT * FROM invoices WHERE id=?", (same["id"],)).fetchone())
            count = c.execute("SELECT COUNT(*) FROM invoices WHERE ord=?", (link["order"],)).fetchone()[0]
            if count >= MAX_INVOICES:
                raise PayError("too_many_attempts", 429)
            cur = c.execute(
                "INSERT INTO invoices(ord,product,amount,email,link_expires,spec,receipt,created_at,next_check) "
                "VALUES(?,?,?,?,?,?,?,?,?)",
                (link["order"], link["product"], link["amount"], email, link["expires"], spec, receipt, int(now),
                 int(now) + FIRST_CHECK))
            self.log(c, link["order"], INV_OFFSET + cur.lastrowid, "invoice", now, {"amount": link["amount"]})
            return dict(c.execute("SELECT * FROM invoices WHERE id=?", (cur.lastrowid,)).fetchone())

    def set_url(self, local_id, url):
        with self.tx() as c:
            c.execute("UPDATE invoices SET url=? WHERE id=? AND url IS NULL", (url, local_id))
            return c.execute("SELECT url FROM invoices WHERE id=?", (local_id,)).fetchone()["url"]

    def confirm(self, inv_id, amount, order, source, now):
        """Деньги пришли (подпись Robokassa уже проверена). Идемпотентно по InvId и заказу."""
        if not INV_OFFSET < inv_id < INV_OFFSET + INV_SPAN:
            raise PayError("unknown_invoice", 400)
        with self.tx() as c:
            result = self._confirm(c, inv_id, amount, order, source, now)
        if "error" in result:
            raise PayError(result["error"], 400)
        return result

    def _confirm(self, c, inv_id, amount, order, source, now):
        inv = c.execute("SELECT * FROM invoices WHERE id=?", (inv_id - INV_OFFSET,)).fetchone()
        # расхождения пишем и не откатываем: по живым деньгам они должны остаться в журнале
        if inv is None:
            self.log(c, order or None, inv_id, "unknown_invoice", now, {"amount": amount, "source": source})
            self.alert(c, f"unknown:{inv_id}", f"⚠️ Кладовая: касса подтвердила InvId {inv_id} на {amount} ₽ "
                       f"(заказ {order or '—'}), а такого счёта в базе кассы нет. Деньги не распределены — "
                       "сверьте операцию в кабинете Robokassa.", now)
            return {"error": "unknown_invoice"}
        error = None
        if order != inv["ord"]:
            error = "payment_mismatch"
        elif amount != inv["amount"] or amount not in PRODUCTS[inv["product"]]["prices"]:
            error = "bad_amount"
        if error:
            self.log(c, inv["ord"], inv_id, error, now, {"amount": amount, "order": order, "source": source})
            self.alert(c, f"{error}:{inv_id}:{amount}:{order}",
                       f"⚠️ Кладовая: касса подтвердила InvId {inv_id} на {amount} ₽ (заказ {order or '—'}), "
                       f"а счёт выписан на {inv['amount']} ₽ по заказу {inv['ord']}. Деньги не распределены — "
                       "сверьте операцию в кабинете Robokassa.", now)
            return {"error": error}
        result = {"order": inv["ord"], "product": inv["product"], "amount": inv["amount"], "inv_id": inv_id,
                  "synced": bool(inv["receipt_synced"])}
        if inv["state"] in ("paid", "duplicate"):
            return {**result, "result": "repeat", "allocated": inv["state"] == "paid"}
        # pending или closed: деньги пришли и по закрытому сверкой счёту — их надо учесть
        paid_at = iso(now)
        if c.execute("SELECT state FROM orders WHERE ord=?", (inv["ord"],)).fetchone()["state"] == "paid":
            c.execute("UPDATE invoices SET state='duplicate', paid_at=?, source=? WHERE id=?",
                      (paid_at, source, inv["id"]))
            self.log(c, inv["ord"], inv_id, "duplicate_payment", now, {"source": source})
            self.alert(c, f"duplicate:{inv_id}", f"⚠️ Кладовая: повторная оплата заказа {inv['ord']} — "
                       f"{inv['amount']} ₽, InvId {inv_id}. Заказ уже оплачен другим счётом; деньги не "
                       "распределены — верните их через кабинет Robokassa.", now)
            return {**result, "result": "duplicate", "allocated": False}
        c.execute("UPDATE invoices SET state='paid', paid_at=?, source=? WHERE id=?",
                  (paid_at, source, inv["id"]))
        c.execute("UPDATE orders SET state='paid', paid_inv=?, paid_at=? WHERE ord=?",
                  (inv_id, paid_at, inv["ord"]))
        body = json.dumps({"order": inv["ord"], "product": inv["product"], "amount": inv["amount"],
                           "inv_id": inv_id, "paid_at": paid_at}, ensure_ascii=False, separators=(",", ":"))
        c.execute("INSERT INTO outbox(ord,body,created_at,next_at) VALUES(?,?,?,?)",
                  (inv["ord"], body, int(now), int(now)))
        self.log(c, inv["ord"], inv_id, "paid", now, {"source": source})
        title = PRODUCTS[inv["product"]]["title"].lower()
        self.alert(c, f"paid:{inv_id}", f"💳 Кладовая: оплачено «{title}» — {inv['amount']} ₽, заказ "
                   f"{inv['ord']}, InvId {inv_id}. Чек НПД формирует Robokassa, бот Кладовой получит "
                   "уведомление и пришлёт файл сам.", now)
        return {**result, "result": "paid", "allocated": True, "paid_at": paid_at}

    def due_checks(self, now, limit=20):
        with self.read() as c:
            return [dict(r) for r in c.execute(
                "SELECT * FROM invoices WHERE state='pending' AND url IS NOT NULL AND next_check<=? "
                "ORDER BY next_check LIMIT ?", (int(now), limit))]

    def observe(self, local_id, state, now):
        """Ответ кассы по неоплаченному счёту: следующая сверка, закрытие или сообщение админам."""
        state = str(state)[:40]
        with self.tx() as c:
            inv = c.execute("SELECT * FROM invoices WHERE id=?", (local_id,)).fetchone()
            if inv is None or inv["state"] != "pending":
                return
            inv_id, after = INV_OFFSET + local_id, now - inv["link_expires"]
            if state == "mismatch":
                self.alert(c, f"opstate_mismatch:{inv_id}", f"⚠️ Кладовая: касса считает счёт InvId {inv_id} "
                           f"оплаченным, но заказ или сумма в ответе не сходятся со счётом ({inv['ord']}, "
                           f"{inv['amount']} ₽). Деньги не распределены — сверьте операцию в кабинете Robokassa.", now)
            if state == "mismatch" or (state in NOT_PAID and after >= SETTLE_AFTER) or after >= UNRESOLVED_LIMIT:
                c.execute("UPDATE invoices SET state='closed', checks=checks+1, checked_at=?, provider_state=? "
                          "WHERE id=?", (int(now), state, local_id))
                self.log(c, inv["ord"], inv_id, "closed", now, {"provider_state": state})
                return
            c.execute("UPDATE invoices SET checks=checks+1, checked_at=?, next_check=?, provider_state=? "
                      "WHERE id=?", (int(now), int(now + check_gap(now - inv["created_at"])), state, local_id))
            if after >= UNRESOLVED_WARN and not inv["warned"]:
                c.execute("UPDATE invoices SET warned=1 WHERE id=?", (local_id,))
                self.alert(c, f"unresolved:{inv_id}", f"⚠️ Кладовая: касса сутки не даёт ясного ответа по "
                           f"счёту InvId {inv_id} (заказ {inv['ord']}, {inv['amount']} ₽, последний ответ: "
                           f"{state}). Если в кабинете Robokassa он оплачен — бот о нём не знает; сверка "
                           "продолжается ещё неделю.", now)

    def check_soon(self, ord_, now):
        """Студент вернулся с кассы: сверить счета заказа на следующем шаге сторожа, не чаще раза в RETURN_GAP."""
        query = ("FROM invoices WHERE ord=? AND state='pending' AND url IS NOT NULL AND checked_at<=? "
                 "AND next_check>0")
        args = (ord_, int(now) - RETURN_GAP)
        with self.read() as c:  # чужой или уже ждущий сверки заказ — без пишущей транзакции
            if c.execute(f"SELECT 1 {query} LIMIT 1", args).fetchone() is None:
                return False
        with self.tx() as c:
            return c.execute(f"UPDATE invoices SET next_check=0 WHERE id IN (SELECT id {query})", args).rowcount > 0

    def unsynced_receipts(self, limit=10):
        with self.read() as c:
            return [dict(r) for r in c.execute(
                "SELECT id, state FROM invoices WHERE state IN ('paid','duplicate') AND receipt_synced=0 "
                "ORDER BY id LIMIT ?", (limit,))]

    def receipt_synced(self, local_id):
        with self.tx() as c:
            c.execute("UPDATE invoices SET receipt_synced=1 WHERE id=?", (local_id,))

    def claim_notification(self, now):
        with self.tx() as c:
            job = c.execute("SELECT * FROM outbox WHERE state='pending' AND next_at<=? AND lease_until<=? "
                            "ORDER BY next_at LIMIT 1", (int(now), int(now))).fetchone()
            if job is None:
                return None
            c.execute("UPDATE outbox SET attempts=attempts+1, lease_until=? WHERE ord=?",
                      (int(now) + LEASE, job["ord"]))
            return dict(c.execute("SELECT * FROM outbox WHERE ord=?", (job["ord"],)).fetchone())

    def finish_notification(self, ord_, ok, error, now):
        with self.tx() as c:
            job = c.execute("SELECT * FROM outbox WHERE ord=?", (ord_,)).fetchone()
            if job is None or job["state"] != "pending":
                return job["state"] if job else None
            if ok:
                c.execute("UPDATE outbox SET state='sent', sent_at=?, lease_until=0, last_error=NULL WHERE ord=?",
                          (int(now), ord_))
                self.log(c, ord_, None, "notified", now, {"attempts": job["attempts"]})
                return "sent"
            error = str(error)[:200]
            deadline = job["created_at"] + NOTIFY_WINDOW
            if now >= deadline:
                c.execute("UPDATE outbox SET state='failed', lease_until=0, last_error=? WHERE ord=?", (error, ord_))
                self.log(c, ord_, None, "notify_failed", now, {"attempts": job["attempts"], "error": error})
                self.alert(c, f"notify_failed:{ord_}:{job['created_at']}", f"⚠️ Кладовая: бот за сутки не принял "
                           f"оплату заказа {ord_} ({job['attempts']} попыток, последняя: {error}). Студент оплатил "
                           "и ждёт файл — проверьте бота Кладовой, затем: python -m "
                           f"app.services.kladovaya_pay requeue {ord_}", now)
                return "failed"
            c.execute("UPDATE outbox SET next_at=?, lease_until=0, last_error=? WHERE ord=?",
                      (int(min(now + retry_delay(job["attempts"]), deadline)), error, ord_))
            if now - job["created_at"] >= NOTIFY_WARN and not job["warned"]:
                c.execute("UPDATE outbox SET warned=1 WHERE ord=?", (ord_,))
                self.alert(c, f"notify_slow:{ord_}:{job['created_at']}", f"⚠️ Кладовая: бот уже час не принимает "
                           f"уведомление об оплате заказа {ord_} (последняя ошибка: {error}). Повторы идут до "
                           "суток, а файл студенту обещан в течение 24 часов — проверьте бота Кладовой.", now)
            return "retry"

    def requeue(self, ord_, now):
        """Ручной повтор после починки бота: новое окно в сутки, тело то же. Бот на повтор отвечает 200."""
        with self.tx() as c:
            changed = c.execute("UPDATE outbox SET state='pending', created_at=?, next_at=?, lease_until=0, "
                                "attempts=0, warned=0 WHERE ord=?", (int(now), int(now), ord_)).rowcount
            if changed:
                self.log(c, ord_, None, "requeued", now)
            return bool(changed)

    def due_alerts(self, now, limit=10):
        with self.read() as c:
            return [dict(r) for r in c.execute(
                "SELECT * FROM alerts WHERE state='pending' AND next_at<=? ORDER BY id LIMIT ?", (int(now), limit))]

    def finish_alert(self, alert_id, ok, now):
        with self.tx() as c:
            row = c.execute("SELECT * FROM alerts WHERE id=?", (alert_id,)).fetchone()
            if row is None or row["state"] != "pending":
                return
            if ok:
                c.execute("UPDATE alerts SET state='sent', sent_at=?, attempts=attempts+1 WHERE id=?",
                          (int(now), alert_id))
            elif now - row["created_at"] >= ALERT_WINDOW:
                c.execute("UPDATE alerts SET state='failed', attempts=attempts+1 WHERE id=?", (alert_id,))
            else:
                delay = ALERT_RETRY[min(row["attempts"], len(ALERT_RETRY) - 1)]
                c.execute("UPDATE alerts SET attempts=attempts+1, next_at=? WHERE id=?", (int(now) + delay, alert_id))

    def status(self):
        with self.read() as c:
            def count(table):
                return {r[0]: r[1] for r in c.execute(f"SELECT state, COUNT(*) FROM {table} GROUP BY state")}
            return {
                "orders": count("orders"), "invoices": count("invoices"), "outbox": count("outbox"),
                "alerts": count("alerts"),
                "failed": [dict(r) for r in c.execute(
                    "SELECT ord, attempts, last_error FROM outbox WHERE state='failed' ORDER BY created_at")],
                "unresolved": [dict(r) for r in c.execute(
                    "SELECT id + ? AS inv_id, ord, amount, provider_state FROM invoices "
                    "WHERE state='pending' AND warned=1 ORDER BY id", (INV_OFFSET,))],
            }


class Runtime:
    def __init__(self, app, path=None, *, clock=time.time, send=None, invoice=None, opstate=None):
        self.app = app
        self.store = Store(path or database_path())
        self.clock = clock
        self.send = send or post_notification
        self.create_invoice = invoice or create_invoice
        self.operation = opstate or operation
        self.wake = asyncio.Event()
        self.invoice_lock = asyncio.Lock()
        self.returns: dict[str, float] = {}
        self.receipts_after = 0.0
        self.documents_alerted = False

    async def call(self, fn, *args):
        return await asyncio.to_thread(fn, *args)

    @staticmethod
    def guarded(handler):
        async def handle(request):
            try:
                return await handler(request)
            except PayError as exc:
                return web.json_response({"ok": False, "error": exc.code}, status=exc.status,
                                         headers={"Cache-Control": "no-store"})
            except Exception as exc:  # noqa: BLE001 - странице нужен ответ, который она поймёт
                log.error("kladovaya pay %s: %s", request.path, type(exc).__name__)
                return web.json_response({"ok": False, "error": "server_error"}, status=500,
                                         headers={"Cache-Control": "no-store"})
        return handle

    async def ensure_open(self) -> None:
        """Приём открыт: флаг CHECKOUT, касса Салона и те редакции документов, под которые написана спецификация."""
        if not checkout_open() or not config.robokassa_on():
            raise PayError("checkout_closed", 503)
        changed = documents_changed()
        if changed:
            if not self.documents_alerted:
                self.documents_alerted = True
                now = self.clock()
                await self.call(self.store.add_alert, f"documents:{json.dumps(changed, sort_keys=True)}",
                                f"⚠️ Кладовая: оплата исправления оформления закрыта — спецификация {SPEC_EDITION} "
                                f"написана под оферту {SPEC_DOCS['oferta']} и политику {SPEC_DOCS['privacy']}, "
                                f"а в DOC_EDITIONS теперь {changed}. Нужна новая редакция спецификации "
                                "(scripts/kladovaya-pay-20261031) и SPEC_DOCS в kladovaya_pay.py.", now)
                self.wake.set()
            raise PayError("checkout_closed", 503)

    async def quote(self, request):
        link = verify_link(request.query, now=self.clock())
        product = PRODUCTS[link["product"]]
        order = await self.call(self.store.order, link["order"])
        paid = bool(order and order["state"] == "paid")
        if not paid:
            await self.ensure_open()  # закрыто — бот видит 503 на своей пробе и не предлагает оплату
        return web.json_response({
            "ok": True, "order": link["order"], "product": link["product"], "title": product["title"],
            "variant": product["prices"][link["amount"]], "amount": link["amount"],
            "expires_at": link["expires"], "valid_until": iso(link["expires"]),
            "state": "paid" if paid else "open",
            "edition": SPEC_EDITION, "bot": f"{BOT}?start=paid_{link['order']}",
        }, headers={"Cache-Control": "no-store"})

    async def checkout(self, request):
        if not checkout_open():
            raise PayError("checkout_closed", 503)
        try:
            body = await request.json()
        except (ValueError, UnicodeDecodeError):
            raise PayError("bad_request", 400) from None
        if not isinstance(body, dict):
            raise PayError("bad_request", 400)
        now = self.clock()
        link = verify_link(body, now=now)
        email = str(body.get("email") or "").strip().lower()[:120]
        if not mailer.looks_email(email):
            raise PayError("email_invalid", 400)
        if body.get("accept") is not True:
            raise PayError("accept_required", 400)
        await self.ensure_open()
        spec = json.dumps(specification(link, now), ensure_ascii=False, separators=(",", ":"))
        async with self.invoice_lock:
            inv = await self.call(self.store.open_invoice, link, email, spec, receipt_for(link), now)
            if not inv["url"]:
                inv_id = INV_OFFSET + inv["id"]
                # без buyer_email: по нему планировщик Салона шлёт своё подтверждение с личным кабинетом
                await db.receipt_invoice_upsert(
                    provider="robokassa", inv_id=inv_id, scope="kladovaya", scope_id=inv["id"],
                    kind=inv["product"], amount=inv["amount"], receipt_payload=inv["receipt"],
                    expires_at=expiration(inv["link_expires"]))
                try:
                    url = await self.create_invoice(inv, email)
                except PayError as exc:
                    log.warning("kladovaya pay: Indexjson InvId %s: %s", inv_id, exc.detail or exc.code)
                    if exc.detail.startswith("errorCode"):
                        await self.call(self.store.add_alert, f"indexjson:{exc.detail}:{int(now) // 3600}",
                                        f"⚠️ Кладовая: Robokassa не выписывает счёт ({exc.detail}, InvId {inv_id}). "
                                        "Студенты видят «Касса не ответила» — проверьте магазин в кабинете "
                                        "Robokassa.", now)
                        self.wake.set()
                    raise
                inv["url"] = await self.call(self.store.set_url, inv["id"], url)
        return web.json_response({"ok": True, "url": inv["url"]}, headers={"Cache-Control": "no-store"})

    async def back(self, request):
        """SuccessUrl2/FailUrl2 Robokassa → бот. Оплату это не подтверждает: только ResultURL/сверка."""
        order = request.match_info.get("order", "")
        if not ORDER_RE.fullmatch(order):
            raise web.HTTPFound(BOT)
        result = request.match_info.get("result")
        now = self.clock()
        if result == "paid" and now - self.returns.get(order, 0) >= RETURN_GAP:
            if len(self.returns) > 1000:
                self.returns.clear()
            self.returns[order] = now
            with suppress(Exception):
                if await self.call(self.store.check_soon, order, now):
                    self.wake.set()
        prefix = "paid_" if result == "paid" else "payfail_"
        raise web.HTTPFound(f"{BOT}?start={prefix}{order}")

    async def confirm(self, inv_id, amount, *, order, source):
        result = await self.call(self.store.confirm, inv_id, amount, order, source, self.clock())
        self.wake.set()  # уведомление боту и сообщения админам шлёт сторож: ответ кассе их не ждёт
        if not result["synced"]:
            await self.sync_receipt(inv_id - INV_OFFSET, result["allocated"])
        return result

    async def sync_receipt(self, local_id, allocated) -> bool:
        """payment_receipts Салона: идемпотентна (paid_at=COALESCE); сбой довезёт сторож."""
        try:
            await db.receipt_mark_paid("robokassa", INV_OFFSET + local_id, allocated=allocated)
        except Exception as exc:  # noqa: BLE001 - оплата уже записана в базе кассы
            log.warning("kladovaya pay: receipt_mark_paid InvId %s: %s", INV_OFFSET + local_id, type(exc).__name__)
            self.receipts_after = self.clock() + RECEIPT_RETRY
            return False
        await self.call(self.store.receipt_synced, local_id)
        return True

    async def sync_receipts(self) -> None:
        if self.clock() < self.receipts_after:
            return
        for row in await self.call(self.store.unsynced_receipts):
            if not await self.sync_receipt(row["id"], row["state"] == "paid"):
                return

    async def send_alerts(self) -> None:
        bot = self.app.get("bot") if hasattr(self.app, "get") else None
        for item in await self.call(self.store.due_alerts, self.clock()):
            ok = False
            if bot is not None:
                try:
                    sent = await notify.notify_admins(bot, item["text"])
                    ok = sent is None or sent > 0  # None — личка не нужна по настройкам, 0 — Telegram не принял
                except Exception as exc:  # noqa: BLE001
                    log.warning("kladovaya pay: admin alert failed type=%s", type(exc).__name__)
            await self.call(self.store.finish_alert, item["id"], ok, self.clock())
            if not ok:
                return  # Telegram не отвечает — остальные подождут следующего шага

    async def deliver(self) -> None:
        for _ in range(20):
            job = await self.call(self.store.claim_notification, self.clock())
            if job is None:
                return
            ok, error = await self.send(job["body"])
            await self.call(self.store.finish_notification, job["ord"], ok, error, self.clock())
            if not ok:
                log.warning("kladovaya pay: notify %s attempt %s failed: %s", job["ord"], job["attempts"], error)

    async def reconcile(self) -> None:
        for inv in await self.call(self.store.due_checks, self.clock()):
            inv_id = INV_OFFSET + inv["id"]
            state = "unavailable"
            try:
                observation = await self.operation(inv_id)
                state = str(observation.get("state"))
                if state == "100":
                    try:
                        amount = operation_amount(observation, inv)
                    except PayError:
                        state = "mismatch"
                    else:
                        await self.confirm(inv_id, amount, order=inv["ord"], source="opstate")
            except Exception as exc:  # noqa: BLE001 - сверка не должна застревать на одном счёте
                state = "unavailable"
                log.warning("kladovaya pay: reconcile InvId %s: %s", inv_id, type(exc).__name__)
            await self.call(self.store.observe, inv["id"], state, self.clock())

    async def run(self) -> None:
        while True:
            self.wake.clear()
            for step in (self.reconcile, self.deliver, self.sync_receipts, self.send_alerts):
                try:
                    await step()
                except Exception as exc:  # noqa: BLE001 - сбой одного шага не останавливает остальные
                    log.error("kladovaya pay worker %s: %s", step.__name__, type(exc).__name__)
            with suppress(asyncio.TimeoutError):
                await asyncio.wait_for(self.wake.wait(), timeout=15)


async def back_to_bot(request):
    """Возврат с кассы, когда база кассы не открылась: просто в бота."""
    order = request.match_info.get("order", "")
    if not ORDER_RE.fullmatch(order):
        raise web.HTTPFound(BOT)
    prefix = "paid_" if request.match_info.get("result") == "paid" else "payfail_"
    raise web.HTTPFound(f"{BOT}?start={prefix}{order}")


async def unavailable(request):
    return web.json_response({"ok": False, "error": "not_configured"}, status=503,
                             headers={"Cache-Control": "no-store"})


async def store_broken(app):
    """cleanup_ctx при неоткрывшейся базе: сказать админам, пока Telegram не примет (до получаса)."""
    async def tell():
        text = ("⚠️ Кладовая: база кассы data/kladovaya-pay.sqlite3 не открылась — оплата услуг Кладовой "
                "выключена (503), остальные оплаты Салона работают. Проверьте файл, место и права, затем "
                "перезапустите salon-bot-v2.")
        for _ in range(30):
            sent = 0
            with suppress(Exception):
                bot = app.get("bot")
                sent = await notify.notify_admins(bot, text) if bot is not None else 0
            if sent is None or sent > 0:
                return
            await asyncio.sleep(60)

    task = asyncio.create_task(tell(), name="kladovaya-pay-store-broken")
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


def register(app, path=None, *, worker: bool = True, **runtime_options) -> Runtime | None:
    """Маршруты кассы. Сбой своей базы не роняет build_app Салона: касса отвечает 503."""
    try:
        runtime = Runtime(app, path, **runtime_options)
    except Exception as exc:  # noqa: BLE001
        log.error("kladovaya pay: store unavailable: %s: %s", type(exc).__name__, exc)
        runtime = None
    app[STATE_KEY] = runtime
    if runtime is None:
        app.router.add_get("/api/kladovaya/pay/quote", unavailable)
        app.router.add_post("/api/kladovaya/pay/checkout", unavailable)
        app.router.add_get(RETURN_ROUTE, back_to_bot)
        if worker:
            app.cleanup_ctx.append(store_broken)
        return None
    app.router.add_get("/api/kladovaya/pay/quote", runtime.guarded(runtime.quote))
    app.router.add_post("/api/kladovaya/pay/checkout", runtime.guarded(runtime.checkout))
    app.router.add_get(RETURN_ROUTE, runtime.back)

    async def lifecycle(_app):
        task = asyncio.create_task(runtime.run(), name="kladovaya-pay-worker")
        yield
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task

    if worker:
        app.cleanup_ctx.append(lifecycle)
    return runtime


async def verified_callback(app, inv_id, amount, data):
    """Хук robo_webhook. Вызывается ТОЛЬКО после проверки подписи Password#2."""
    ours = INV_OFFSET < inv_id < INV_OFFSET + INV_SPAN
    if not ours and data.get("Shp_kind") != "kladovaya":
        return None
    runtime = app.get(STATE_KEY)
    if runtime is None:
        return web.Response(status=503, text="kladovaya pay unavailable")
    if not ours or data.get("Shp_kind") != "kladovaya":
        log.warning("kladovaya pay: foreign callback InvId %s", inv_id)
        kind = str(data.get("Shp_kind") or "—")[:40]
        await runtime.call(runtime.store.add_alert, f"foreign:{inv_id}:{kind}",
                           f"⚠️ Кладовая: касса подтвердила InvId {inv_id} на {amount} ₽ с Shp_kind={kind} — "
                           "это не счёт кассы Кладовой. Деньги не распределены — сверьте операцию в кабинете "
                           "Robokassa.", runtime.clock())
        runtime.wake.set()
        return web.Response(status=400, text="payment mismatch")
    try:
        await runtime.confirm(inv_id, amount, order=str(data.get("Shp_order") or ""), source="result")
    except PayError as exc:
        log.warning("kladovaya pay: ResultURL InvId %s rejected: %s", inv_id, exc.code)
        runtime.wake.set()  # сообщение админам уже в очереди
        return web.Response(status=400, text="bad amount" if exc.code == "bad_amount" else "payment mismatch")
    return web.Response(text=f"OK{inv_id}")


def main(argv: list[str]) -> int:
    store = Store(database_path())
    if argv[:1] == ["status"]:
        print(json.dumps(store.status(), ensure_ascii=False, indent=2))
        return 0
    if len(argv) == 2 and argv[0] == "requeue" and ORDER_RE.fullmatch(argv[1]):
        ok = store.requeue(argv[1], time.time())
        print("поставлено в очередь, сервис отправит в течение 15 с" if ok else "нет такого оплаченного заказа")
        return 0 if ok else 1
    print("python -m app.services.kladovaya_pay status | requeue <заказ>")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
