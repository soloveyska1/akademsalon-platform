"""Robokassa transport. No secrets or signed payment URLs enter application logs."""
import base64
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
import hashlib
import hmac
import json
import os
from urllib.parse import quote
import xml.etree.ElementTree as ET

import aiohttp

from .. import config
from ..services import payments
from .core import INV_OFFSET, StoreError

RETURN_URL = "https://akademsalon.ru/shop.html"


def refund_key():
    return os.environ.get("ROBOKASSA_PASS3") or os.environ.get("ROBOKASSA_PASSWORD3") or ""


def receipt_for(p):
    product = json.loads(p["snapshot"])
    return json.dumps({"items": [{"name": product["receipt_name"][:96], "quantity": 1,
        "sum": p["cash"], "tax": "none", "payment_method": "full_payment",
        "payment_object": "intellectual_activity"}]}, ensure_ascii=False, separators=(",", ":"))


def invoice_form(p, receipt, *, encoded_receipt=False):
    inv_id = INV_OFFSET + p["id"]
    value = quote(receipt, safe="") if encoded_receipt else receipt
    shp = {"Shp_store": str(p["id"]), "Shp_scope": "material"}
    # URL modifiers use the encoded representation in the signature, as in the
    # official ReturnURL example; the POST fields contain the actual URL.
    sig = payments._robo_sig(config.ROBOKASSA_LOGIN, f"{p['cash']:.2f}", inv_id,
        value, quote(RETURN_URL, safe=""), "GET", quote(RETURN_URL, safe=""), "GET",
        config.robo_pass1(), *(f"{k}={v}" for k,v in sorted(shp.items())))
    expiry = datetime.fromtimestamp(p["expires_at"], timezone(timedelta(hours=3))).strftime("%Y-%m-%dT%H:%M")
    q = dict(MerchantLogin=config.ROBOKASSA_LOGIN, InvId=inv_id, OutSum=f"{p['cash']:.2f}",
             Description=f"Учебный материал {p['sku']} · Академический Салон"[:100],
             Receipt=value, SignatureValue=sig, ExpirationDate=expiry, Culture="ru", Encoding="utf-8",
             SuccessUrl2=RETURN_URL, SuccessUrl2Method="GET", FailUrl2=RETURN_URL, FailUrl2Method="GET", **shp)
    if config.ROBOKASSA_TEST:
        q["IsTest"] = "1"
    return q


async def create_invoice(p, receipt, email=None):
    q = invoice_form(p, receipt)
    if email:
        q["Email"] = email
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as s:
            async with s.post(payments.ROBO_INVOICE_URL, data=q) as r:
                data = await r.json(content_type=None)
        invoice = str(data.get("invoiceID") or "")
        if int(data.get("errorCode") or 0) == 0 and len(invoice) <= 80 and invoice.replace("-", "").isalnum() and invoice.strip("0-"):
            return payments.ROBO_SHORT_URL + invoice
        raise StoreError("provider_unavailable")
    except (aiohttp.ClientError, TimeoutError, ValueError, KeyError):
        raise StoreError("provider_unavailable") from None


async def operation(inv_id):
    signature = payments._robo_sig(config.ROBOKASSA_LOGIN, inv_id, config.robo_pass2())
    q = {"MerchantLogin": config.ROBOKASSA_LOGIN, "InvoiceID": inv_id, "Signature": signature}
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=12)) as s:
        async with s.post("https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt", data=q) as r:
            if r.status != 200:
                raise StoreError("provider_unavailable")
            raw = await r.text()
    root = ET.fromstring(raw)
    for el in root.iter():
        el.tag = el.tag.split("}")[-1]
    code = root.findtext("Result/Code")
    if code == "3":
        return {"state": "not_found"}
    if code != "0":
        raise StoreError("provider_unavailable")
    return {"state": root.findtext("State/Code"), "amount": root.findtext("Info/OutSum"),
            "op_key": root.findtext("Info/OpKey"),
            "fields": {f.findtext("Name"): f.findtext("Value") for f in root.findall("UserFields/Field")}}


def verified_operation_amount(observation, purchase):
    fields = observation.get("fields") or {}
    if fields.get("Shp_store") != str(purchase["id"]) or fields.get("Shp_scope") != "material":
        raise StoreError("payment_mismatch")
    try:
        value = Decimal(observation.get("amount") or "")
        if not value.is_finite() or value != purchase["cash"]:
            raise StoreError("payment_mismatch")
        return int(value)
    except InvalidOperation:
        raise StoreError("payment_mismatch") from None


def _jwt(payload):
    def enc(x):
        return base64.urlsafe_b64encode(json.dumps(x, separators=(",", ":"), ensure_ascii=False).encode()).decode().rstrip("=")
    key = refund_key()
    if not key:
        raise StoreError("refund_not_configured")
    message = enc({"alg": "HS256", "typ": "JWT"}) + "." + enc(payload)
    signature = base64.urlsafe_b64encode(hmac.new(key.encode(), message.encode(), hashlib.sha256).digest()).decode().rstrip("=")
    return message + "." + signature


async def refund_full(p):
    if not p.get("op_key"):
        raise StoreError("provider_operation_pending")
    item = json.loads(p["receipt"])["items"][0]
    payload = {"OpKey": p["op_key"], "InvoiceItems": [{"Name": item["name"], "Quantity": 1,
        "Cost": p["cash"], "Tax": "none", "PaymentMethod": "full_payment", "PaymentObject": "intellectual_activity"}]}
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as s:
        async with s.post("https://services.robokassa.ru/RefundService/Refund/Create", data=_jwt(payload),
                          headers={"Content-Type": "text/plain"}) as r:
            data = await r.json(content_type=None)
    if not data.get("success") or not data.get("requestId"):
        raise StoreError("refund_pending")
    return str(data["requestId"])


async def refund_status(request_id):
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=12)) as s:
        async with s.get("https://services.robokassa.ru/RefundService/Refund/GetState", params={"id": request_id}) as r:
            return await r.json(content_type=None)
