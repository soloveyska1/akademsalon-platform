"""Additive aiohttp integration, existing Salon identity and payment callback."""
import asyncio
from contextlib import suppress
from decimal import Decimal
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import time

from aiohttp import web
from .. import config, db
from ..services import mailer
from .core import Store, StoreError, INV_OFFSET, TERMS_VERSION
from . import provider

log = logging.getLogger(__name__)
ROOT = Path(os.environ.get("MATERIAL_STORE_ROOT", "/var/lib/academic-material-store"))
STATE_KEY = "material_store_runtime"


class Runtime:
    def __init__(self, app, identity, root):
        self.app, self.identity, self.root = app, identity, root.resolve()
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.store = Store(self.root / "store.sqlite3")
        self.invoice_lock = asyncio.Lock()
        self.settings = {}
        manifest = self.root / "catalogue.json"
        if manifest.exists():
            self.settings = json.loads(manifest.read_text())
            for p in self.settings.get("products", []):
                if p.get("published"):
                    self.check_files(p)
            self.store.sync_catalog(self.settings.get("products", []))

    def check_files(self, product):
        for file in product.get("files", {}).values():
            self.file_path(file)
        if not product.get("files"):
            raise StoreError("file_unavailable")

    def file_path(self, file):
        path = (self.root / file["path"]).resolve()
        if not path.is_relative_to(self.root / "private") or not path.is_file():
            raise StoreError("file_unavailable")
        if hashlib.sha256(path.read_bytes()).hexdigest() != file["sha256"]:
            raise StoreError("file_unavailable")
        return path

    def enabled(self):
        return bool(self.settings.get("checkout_enabled") and config.robokassa_on() and not config.ROBOKASSA_TEST and provider.refund_key())

    async def call(self, method, *args, **kwargs):
        return await asyncio.to_thread(getattr(self.store, method), *args, **kwargs)

    async def user(self, request):
        u = await self.identity(request)
        if not u:
            raise web.HTTPUnauthorized(text='{"error":"login_required"}', content_type="application/json")
        if u["banned"] or ("session_imp" in u.keys() and u["session_imp"]):
            raise web.HTTPForbidden(text='{"error":"forbidden"}', content_type="application/json")
        return u

    async def catalogue(self, request):
        return web.json_response({"ok": True, "products": await self.call("catalog"),
            "checkout_enabled": self.enabled(), "terms": TERMS_VERSION,
            "rules": {"cashback_pct": 3, "achievement_pct": 2, "max_discount_pct": 10, "hold_minutes": 15}},
            headers={"Cache-Control": "no-store", "Access-Control-Allow-Origin": "https://studkladovaya.ru"})

    async def body(self, request):
        if request.content_length and request.content_length > 4096:
            raise StoreError("bad_request")
        try:
            b = await request.json()
        except Exception:
            raise StoreError("bad_request") from None
        if not isinstance(b, dict):
            raise StoreError("bad_request")
        return b

    async def quote(self, request):
        u = await self.user(request)
        b = await self.body(request)
        return web.json_response({"ok": True, **await self.call("quote", u["id"], str(b.get("sku") or ""),
            b.get("use_bonus") is True, str(b.get("coupon") or "")[:40])}, headers={"Cache-Control": "no-store"})

    async def checkout(self, request):
        u = await self.user(request)
        if not self.enabled():
            raise StoreError("checkout_unavailable")
        b = await self.body(request)
        if b.get("accept_terms") is not True:
            raise StoreError("terms_required")
        sku = str(b.get("sku") or "")[:64]
        products = await self.call("catalog")
        if sku not in {p["sku"] for p in products}:
            raise StoreError("unavailable")
        attr = {k: str((b.get("attribution") or {}).get(k, "unknown"))
                for k in ("source", "surface")}
        if attr["source"] not in {"kladovaya", "telegram", "salon", "unknown"}:
            attr["source"] = "unknown"
        if attr["surface"] not in {"catalogue", "schedule", "today", "post", "unknown"}:
            attr["surface"] = "unknown"
        p = await self.call("checkout", u["id"], sku, b.get("request_key"), b.get("expected_cash"),
            use_bonus=b.get("use_bonus") is True, coupon=str(b.get("coupon") or "")[:40],
            attribution=attr, terms=str(b.get("terms") or ""))
        p = await self.invoice(p, u)
        return web.json_response({"ok": True, "purchase": self.store.public_purchase(p)}, headers={"Cache-Control": "no-store"})

    async def resume(self, request):
        u = await self.user(request)
        if not self.enabled():
            raise StoreError("checkout_unavailable")
        p = await self.call("get", int(request.match_info["id"]), u["id"])
        p = await self.invoice(p, u)
        return web.json_response({"ok": True, "purchase": self.store.public_purchase(p)}, headers={"Cache-Control": "no-store"})

    async def invoice(self, p, u):
        if p["state"] == "pending" and p["expires_at"] > time.time():
            async with self.invoice_lock:
                p = await self.call("get", p["id"], u["id"])
                if p["state"] != "pending" or p["expires_at"] <= time.time():
                    return p
                if not p["payment_url"]:
                    self.check_files(json.loads(p["snapshot"]))
                    receipt = provider.receipt_for(p)
                    await self.call("set_invoice", p["id"], receipt)
                    email = u["email"] if "email" in u.keys() and mailer.looks_email(u["email"]) else None
                    await db.receipt_invoice_upsert(provider="robokassa", inv_id=INV_OFFSET+p["id"],
                        scope="material_purchase", scope_id=p["id"], user_id=u["id"], kind="material",
                        amount=p["cash"], receipt_payload=receipt, buyer_email=email,
                        expires_at=provider.invoice_form(p, receipt)["ExpirationDate"])
                    url = await provider.create_invoice(p, receipt, email)
                    await self.call("set_invoice", p["id"], receipt, url)
                    p = await self.call("get", p["id"], u["id"])
        return p

    async def account(self, request):
        u = await self.user(request)
        return web.json_response({"ok": True, **await self.call("account", u["id"])}, headers={"Cache-Control": "no-store"})

    async def download(self, request):
        u = await self.user(request)
        pid = int(request.match_info["id"])
        fmt = request.match_info["format"]
        file = await self.call("private_file", pid, u["id"], fmt)
        path = await asyncio.to_thread(self.file_path, file)
        return web.FileResponse(path, headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
            "Content-Disposition": f'attachment; filename="material-{pid}.{fmt}"',
            "Referrer-Policy": "no-referrer"})

    async def confirm(self, pid, amount, op_key=None):
        p = await self.call("confirm", pid, amount, op_key)
        await db.receipt_mark_paid("robokassa", INV_OFFSET+pid, allocated=p["state"] == "paid")
        return p

    async def sweep(self):
        now = time.time()
        for p in await self.call("pending"):
            if p["last_checked"] and now-p["last_checked"] < 60:
                continue
            try:
                obs = await provider.operation(INV_OFFSET+p["id"])
                state = str(obs.get("state"))
                if state == "100":
                    await self.confirm(p["id"], provider.verified_operation_amount(obs, p), obs.get("op_key"))
                elif p["state"] == "pending" and now >= p["expires_at"]+120:
                    if state in {"10", "60"}:
                        await self.call("release", p["id"], "cancelled" if state == "10" else "returned")
                    elif state == "not_found" and p["provider_state"] == "not_found" and p["last_checked"] and now-p["last_checked"] >= 60:
                        await self.call("release", p["id"], "not_found_after_expiry")
                await self.call("observation", p["id"], state, obs.get("op_key"))
                latest = await self.call("get", p["id"])
                if latest["state"] == "paid_unallocated":
                    await self.refund_unallocated(latest)
            except Exception as exc:
                # Rotate failed entries too, so one provider outage cannot
                # permanently starve purchases beyond the first batch.
                await self.call("observation", p["id"], p.get("provider_state") or "unavailable")
                log.warning("material reconciliation pending purchase=%s type=%s", p["id"], type(exc).__name__)
        for _ in range(10):
            job = await self.call("claim_outbox")
            if not job:
                break
            await self.deliver(job["purchase_id"])

    async def refund_unallocated(self, p):
        request_id = p["refund_request"]
        if request_id in {"creating", "needs_review"}:
            # Create has no documented idempotency key or lookup by OpKey.
            # Never send a second refund after an ambiguous network outcome.
            return
        if not request_id:
            def claim():
                with self.store.tx() as c:
                    return c.execute("UPDATE purchases SET refund_request='creating' WHERE id=? AND refund_request IS NULL", (p["id"],)).rowcount == 1
            if not await asyncio.to_thread(claim):
                return
            try:
                request_id = await provider.refund_full(p)
            except Exception:
                def uncertain():
                    with self.store.tx() as c:
                        c.execute("UPDATE purchases SET refund_request='needs_review' WHERE id=? AND refund_request='creating'", (p["id"],))
                        self.store.log(c, p["id"], "refund_outcome_unknown")
                await asyncio.to_thread(uncertain)
                raise
            def save():
                with self.store.tx() as c:
                    c.execute("UPDATE purchases SET refund_request=? WHERE id=? AND refund_request='creating'", (request_id, p["id"]))
            await asyncio.to_thread(save)
        status = await provider.refund_status(request_id)
        if status.get("label") == "finished" and Decimal(str(status.get("amount"))) == p["cash"]:
            await self.call("refund_confirmed", p["id"], p["cash"])

    async def deliver(self, pid):
        success, channel = False, None
        try:
            p = await self.call("get", pid)
            if p["state"] != "paid":
                return
            u = await db.get_user(p["user_id"])
            product = json.loads(p["snapshot"])
            text = (f'Покупка №{pid}: {product["title"]}\n\n'
                    f'Оплата {p["cash"]} ₽ подтверждена. Материалы доступны в «Мои покупки»: '
                    'https://akademsalon.ru/shop.html#purchases\n\n'
                    'Войди тем же способом, которым оформлена покупка. PDF и редактируемый DOCX можно скачать повторно. '
                    f'Начислено {p["reward"]} бонусов магазина.\n\n'
                    'Это учебный материал для личного использования. Лицензия неэксклюзивная; '
                    'состав и требования указаны в карточке. Фискальный чек отправляет Robokassa отдельно.')
            email = u["email"] if u and "email" in u.keys() else None
            if email and mailer.looks_email(email):
                # Attachments go only to the account's verified address, never
                # an unsigned callback Email or an arbitrary checkout field.
                attachments = []
                for fmt, file in product["files"].items():
                    path = await asyncio.to_thread(self.file_path, file)
                    attachments.append({"data": await asyncio.to_thread(path.read_bytes),
                        "filename": f'{p["sku"]}.{fmt}', "maintype": "application",
                        "subtype": {"pdf":"pdf","zip":"zip","docx":"vnd.openxmlformats-officedocument.wordprocessingml.document"}[fmt]})
                success = await mailer.send(email, f'Материал готов: {product["title"]}', text, attachments=attachments)
                channel = "email" if success else None
            if not success and p["user_id"] > 0:
                await self.app["bot"].send_message(p["user_id"], text, parse_mode=None, disable_web_page_preview=True)
                success, channel = True, "telegram"
        except Exception as exc:
            log.warning("material delivery pending purchase=%s type=%s", pid, type(exc).__name__)
        finally:
            await self.call("finish_outbox", pid, success, channel)


def register(app, identity, root=None):
    runtime = Runtime(app, identity, Path(root) if root else ROOT)
    app[STATE_KEY] = runtime
    def guarded(handler):
        async def handle(request):
            try:
                return await handler(request)
            except StoreError as exc:
                error = str(exc)
                status = 404 if error in {"not_found", "unavailable"} else 409
                if error in {"file_unavailable", "provider_unavailable", "checkout_unavailable"}:
                    status = 503
                return web.json_response({"ok": False, "error": error}, status=status, headers={"Cache-Control": "no-store"})
        return handle
    app.router.add_get("/api/store/catalogue", guarded(runtime.catalogue))
    app.router.add_get("/api/store/account", guarded(runtime.account))
    app.router.add_post("/api/store/quote", guarded(runtime.quote))
    app.router.add_post("/api/store/checkout", guarded(runtime.checkout))
    app.router.add_post("/api/store/purchases/{id:\\d+}/pay", guarded(runtime.resume))
    app.router.add_get("/api/store/purchases/{id:\\d+}/{format:pdf|docx|zip}", guarded(runtime.download))
    async def lifecycle(app):
        async def loop():
            while True:
                try:
                    await runtime.sweep()
                except Exception as exc:
                    log.error("material worker pending type=%s", type(exc).__name__)
                await asyncio.sleep(30)
        task = asyncio.create_task(loop(), name="material-store-worker")
        yield
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task
    app.cleanup_ctx.append(lifecycle)


async def verified_callback(app, inv_id, amount, data):
    """Called only AFTER the existing robo_result_ok signature check."""
    if not INV_OFFSET < inv_id < INV_OFFSET+10_000_000:
        return None
    runtime = app[STATE_KEY]
    pid = inv_id-INV_OFFSET
    if data.get("Shp_scope") != "material" or str(data.get("Shp_store")) != str(pid):
        return web.Response(status=400, text="payment mismatch")
    try:
        await runtime.confirm(pid, amount)
    except StoreError:
        return web.Response(status=400, text="payment mismatch")
    return web.Response(text=f"OK{inv_id}")
