"""Доставка фирменного подтверждения оплаты по трём клиентским каналам.

Официальный чек НПД не создаётся этим модулем: при Robokassa его формирует
провайдер/«Мой налог». Здесь формируется отдельный документ по делу заказа,
который всегда честно помечен как подтверждение, а не налоговый чек.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from aiogram import Bot
from aiogram.types import BufferedInputFile

from .. import config, db
from . import mailer, payment_document

log = logging.getLogger(__name__)

_TASKS: set[asyncio.Task] = set()
_ACTIVE_KEYS: set[tuple[int, int]] = set()
_ACTIVE_RECEIPT_KEYS: set[tuple[str, int]] = set()
_PROVIDER_RE = re.compile(r"[^a-z0-9_-]+")
_SCOPE_NAMES = {
    "order": "Услуги по согласованной спецификации заказа",
    "subscription": "Подписка «Салон+»",
    "gift": "Подарочный сертификат мастерской (аванс на услуги)",
    "deposit": "Аванс на услуги мастерской (пополнение депозита)",
    "tip": "Добровольная благодарность за оказанные услуги",
}
_SCOPE_PREFIXES = {
    "order": "ЗАКАЗ",
    "subscription": "ПОДПИСКА",
    "gift": "СЕРТИФИКАТ",
    "deposit": "ДЕПОЗИТ",
    "tip": "БЛАГОДАРНОСТЬ",
}


def _value(row: Any, key: str, default=None):
    try:
        value = row[key]
    except Exception:  # noqa: BLE001 - sqlite Row/dict compatibility
        return default
    return default if value is None else value


def _provider(payment: Any) -> str:
    raw = str(_value(payment, "method", "") or "manual").strip().lower()
    clean = _PROVIDER_RE.sub("", raw)[:32]
    return clean or "manual"


def _filename(order_id: int, payment_id: int) -> str:
    return f"podtverzhdenie-oplaty-{order_id}-{payment_id}.pdf"


def _receipt_filename(receipt: Any) -> str:
    scope = _PROVIDER_RE.sub(
        "", str(_value(receipt, "scope", "") or "payment").lower()
    )[:24] or "payment"
    scope_id = int(_value(receipt, "scope_id", 0) or 0)
    inv_id = int(_value(receipt, "inv_id", 0) or 0)
    return f"podtverzhdenie-oplaty-{scope}-{scope_id}-{inv_id}.pdf"


def _receipt_service(receipt: Any) -> str:
    scope = str(_value(receipt, "scope", "") or "").lower()
    return _SCOPE_NAMES.get(scope, "Оплата услуг мастерской")


def _receipt_reference(receipt: Any) -> tuple[str, str]:
    scope = str(_value(receipt, "scope", "") or "").lower()
    prefix = _SCOPE_PREFIXES.get(scope, "ОПЕРАЦИЯ")
    scope_id = int(_value(receipt, "scope_id", 0) or 0)
    return prefix, str(scope_id)


def _confirmation_context(order: Any, payment: Any) -> dict:
    return {
        "status": "paid",
        "id": int(_value(payment, "id", 0) or 0),
        "order_id": int(_value(order, "id", 0) or 0),
        "amount": int(_value(payment, "amount", 0) or 0),
        "paid_at": (
            _value(payment, "paid_at")
            or _value(payment, "created_at")
            or db.now_iso()
        ),
        "method": _provider(payment),
        "service_name": (
            str(_value(order, "work_label", "") or "").strip()
            or "Услуги по согласованной спецификации заказа"
        ),
    }


def _receipt_confirmation_context(receipt: Any) -> dict:
    reference_label, reference_value = _receipt_reference(receipt)
    return {
        "status": "paid",
        "id": int(_value(receipt, "inv_id", 0) or 0),
        # Старые версии PDF используют order_id; новые понимают также
        # reference_label/reference_value и печатают нейтральное основание.
        "order_id": f"{reference_label}-{reference_value}",
        "reference_label": reference_label,
        "reference_value": reference_value,
        "amount": int(_value(receipt, "amount", 0) or 0),
        "paid_at": _value(receipt, "paid_at") or db.now_iso(),
        "method": str(_value(receipt, "provider", "") or "manual"),
        "service_name": _receipt_service(receipt),
    }


async def prepare_for_payment(
    order: Any,
    payment: Any,
):
    """Зафиксировать outbox до проводки и отметить его после получения денег.

    Снимок создаётся ещё для pending/claimed-счёта. Это намеренно: если процесс
    упадёт сразу после перевода ``payments`` в ``paid``, повторный callback
    увидит существующий ledger и безопасно продолжит бизнес-эффекты.
    """
    if not order or not payment \
            or str(_value(payment, "status", "")) not in ("pending", "claimed", "paid"):
        return None
    order_id = int(_value(order, "id", 0) or 0)
    payment_id = int(_value(payment, "id", 0) or 0)
    if order_id <= 0 or payment_id <= 0:
        return None

    recipient = await mailer.order_recipient(order)
    receipt = await db.receipt_for_payment(payment_id)
    if not receipt:
        provider = _provider(payment)
        payload = json.dumps(
            {
                "document": "payment_confirmation",
                "order_id": order_id,
                "payment_id": payment_id,
                "kind": str(_value(payment, "kind", "") or ""),
                "amount": int(_value(payment, "amount", 0) or 0),
                "service": str(_value(order, "work_label", "") or ""),
            },
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        receipt = await db.receipt_invoice_upsert(
            provider=provider,
            inv_id=payment_id,
            scope="order",
            scope_id=order_id,
            order_id=order_id,
            user_id=int(_value(order, "user_id", 0) or 0) or None,
            payment_id=payment_id,
            kind=str(_value(payment, "kind", "") or "payment"),
            amount=int(_value(payment, "amount", 0) or 0),
            buyer_email=recipient,
            receipt_payload=payload,
        )
        if str(_value(payment, "status", "")) == "paid":
            receipt = await db.receipt_mark_paid(
                provider,
                payment_id,
                payment_method=provider,
                allocated=True,
            )
    elif recipient and not _value(receipt, "buyer_email"):
        await db.receipt_set_buyer_email(int(receipt["id"]), recipient)
        receipt = await db.receipt_for_payment(payment_id)
    if receipt and str(_value(payment, "status", "")) == "paid" \
            and str(_value(receipt, "payment_status", "")) != "paid":
        receipt = await db.receipt_mark_paid(
            str(_value(receipt, "provider", "") or _provider(payment)),
            int(_value(receipt, "inv_id", payment_id) or payment_id),
            payment_method=_provider(payment),
            allocated=True,
        )
    return receipt


async def confirmation_bytes(order: Any, payment: Any) -> bytes:
    """Сформировать PDF вне event loop."""
    context = _confirmation_context(order, payment)
    return await asyncio.to_thread(
        payment_document.build_payment_confirmation,
        context,
    )


async def confirmation_bytes_for_receipt(receipt: Any) -> bytes:
    """PDF для любой оплаченной операции, включая подписку/депозит/подарок."""
    payment_id = int(_value(receipt, "payment_id", 0) or 0)
    order_id = int(_value(receipt, "order_id", 0) or 0)
    if payment_id > 0 and order_id > 0:
        order = await db.get_order(order_id)
        payment = await db.payment_get(payment_id)
        if order and payment and payment["status"] == "paid":
            return await confirmation_bytes(order, payment)
    return await asyncio.to_thread(
        payment_document.build_payment_confirmation,
        _receipt_confirmation_context(receipt),
    )


async def deliver_for_payment(
    bot: Bot,
    order_id: int,
    payment_id: int,
) -> dict[str, str]:
    """Доставить недостающие каналы; безопасно повторяется scheduler-ом."""
    result: dict[str, str] = {"email": "skipped", "telegram": "skipped"}
    try:
        order = await db.get_order(int(order_id))
        payment = await db.payment_get(int(payment_id))
        if not order or not payment or payment["order_id"] != int(order_id) \
                or payment["status"] != "paid":
            return result
        receipt = await prepare_for_payment(order, payment)
        if not receipt:
            return result
        pdf = await confirmation_bytes(order, payment)
        receipt_id = int(receipt["id"])
        filename = _filename(int(order_id), int(payment_id))
        provider = str(receipt["provider"] or _provider(payment))

        recipient = str(receipt["buyer_email"] or "").strip().lower()
        if recipient and not receipt["confirmation_email_at"]:
            sent = await mailer.order_event(
                order,
                "payment",
                pay_kind=payment["kind"],
                amount=payment["amount"],
                provider=provider,
                recipient=recipient,
                attachments=[{
                    "data": pdf,
                    "maintype": "application",
                    "subtype": "pdf",
                    "filename": filename,
                }],
            )
            if sent:
                await db.receipt_delivery_mark(receipt_id, "email")
                result["email"] = "sent"
            else:
                await db.receipt_delivery_mark(
                    receipt_id, "email", error="email delivery unavailable")
                result["email"] = "retry"

        user_id = int(_value(order, "user_id", 0) or 0)
        if user_id > 0 and not receipt["confirmation_tg_at"]:
            if provider == "robokassa":
                note = (
                    "Официальный чек НПД Robokassa отправляет отдельно на e-mail, "
                    "указанный при оплате."
                )
            else:
                note = "Официальный чек НПД направляется отдельно."
            try:
                await bot.send_document(
                    user_id,
                    BufferedInputFile(pdf, filename=filename),
                    caption=(
                        f"✅ Оплата по заказу {config.order_no(order_id)} "
                        f"подтверждена.\n\n"
                        "PDF выше — подтверждение платежа мастерской, "
                        f"не налоговый чек. {note}"
                    ),
                )
            except Exception as exc:  # noqa: BLE001 - очередь повторит доставку
                await db.receipt_delivery_mark(
                    receipt_id,
                    "tg",
                    error=f"telegram delivery: {exc.__class__.__name__}",
                )
                result["telegram"] = "retry"
                log.warning(
                    "payment confirmation Telegram delivery failed "
                    "order=%s payment=%s",
                    order_id,
                    payment_id,
                    exc_info=True,
                )
            else:
                await db.receipt_delivery_mark(receipt_id, "tg")
                result["telegram"] = "sent"
    except Exception as exc:  # noqa: BLE001 - платёж не откатывается из-за доставки
        log.exception(
            "payment confirmation delivery failed order=%s payment=%s: %s",
            order_id,
            payment_id,
            exc.__class__.__name__,
        )
        result["error"] = exc.__class__.__name__
    return result


async def deliver_for_receipt(
    bot: Bot,
    provider: str,
    inv_id: int,
) -> dict[str, str]:
    """Доставить подтверждение для любого Robokassa-контура."""
    receipt = await db.receipt_get(provider, int(inv_id))
    if not receipt or receipt["payment_status"] != "paid":
        return {"email": "skipped", "telegram": "skipped"}
    if receipt["order_id"] and receipt["payment_id"]:
        return await deliver_for_payment(
            bot, int(receipt["order_id"]), int(receipt["payment_id"])
        )

    result: dict[str, str] = {"email": "skipped", "telegram": "skipped"}
    try:
        pdf = await confirmation_bytes_for_receipt(receipt)
        receipt_id = int(receipt["id"])
        filename = _receipt_filename(receipt)
        service = _receipt_service(receipt)
        reference_label, reference_value = _receipt_reference(receipt)

        recipient = str(receipt["buyer_email"] or "").strip().lower()
        if recipient and not receipt["confirmation_email_at"]:
            sent = await mailer.send(
                recipient,
                f"Подтверждение оплаты — {service}",
                "Здравствуйте!\n\n"
                f"Оплата получена: {service}, "
                f"{config.fmt_money(int(receipt['amount'] or 0))} ₽.\n"
                f"Основание: {reference_label.lower()} {reference_value}.\n\n"
                "PDF приложен к письму и остаётся доступен в личном кабинете. "
                "Это подтверждение платежа мастерской, не налоговый чек НПД. "
                "Официальный чек Robokassa направляет отдельным письмом на e-mail, "
                "указанный при оплате.",
                attachments=[{
                    "data": pdf,
                    "maintype": "application",
                    "subtype": "pdf",
                    "filename": filename,
                }],
            )
            if sent:
                await db.receipt_delivery_mark(receipt_id, "email")
                result["email"] = "sent"
            else:
                await db.receipt_delivery_mark(
                    receipt_id, "email", error="email delivery unavailable"
                )
                result["email"] = "retry"

        user_id = int(receipt["user_id"] or 0)
        if user_id > 0 and not receipt["confirmation_tg_at"]:
            try:
                await bot.send_document(
                    user_id,
                    BufferedInputFile(pdf, filename=filename),
                    caption=(
                        f"✅ Оплата получена: {service}.\n"
                        f"Сумма: {config.fmt_money(int(receipt['amount'] or 0))} ₽.\n\n"
                        "PDF — подтверждение платежа мастерской, не налоговый чек. "
                        "Официальный чек НПД Robokassa отправляет отдельно на e-mail, "
                        "указанный при оплате."
                    ),
                )
            except Exception as exc:  # noqa: BLE001 - scheduler повторит
                await db.receipt_delivery_mark(
                    receipt_id,
                    "tg",
                    error=f"telegram delivery: {exc.__class__.__name__}",
                )
                result["telegram"] = "retry"
                log.warning(
                    "generic payment confirmation Telegram delivery failed "
                    "provider=%s inv=%s",
                    provider,
                    inv_id,
                    exc_info=True,
                )
            else:
                await db.receipt_delivery_mark(receipt_id, "tg")
                result["telegram"] = "sent"
    except Exception as exc:  # noqa: BLE001 - scheduler повторит
        log.exception(
            "generic payment confirmation failed provider=%s inv=%s: %s",
            provider,
            inv_id,
            exc.__class__.__name__,
        )
        result["error"] = exc.__class__.__name__
    return result


async def schedule_for_payment(
    bot: Bot,
    order_id: int,
    payment_id: int,
) -> None:
    """Сначала надёжно записать outbox, затем отправить без задержки webhook."""
    order = await db.get_order(int(order_id))
    payment = await db.payment_get(int(payment_id))
    if not order or not payment:
        return
    try:
        await prepare_for_payment(order, payment)
    except Exception:  # noqa: BLE001 - scheduler сможет поднять существующую запись
        log.exception(
            "payment confirmation prepare failed order=%s payment=%s",
            order_id,
            payment_id,
        )
        return
    key = (int(order_id), int(payment_id))
    if key in _ACTIVE_KEYS:
        return
    _ACTIVE_KEYS.add(key)
    task = asyncio.get_running_loop().create_task(
        deliver_for_payment(bot, int(order_id), int(payment_id)),
        name=f"payment-confirmation:{order_id}:{payment_id}",
    )
    _TASKS.add(task)

    def completed(done: asyncio.Task) -> None:
        _TASKS.discard(done)
        _ACTIVE_KEYS.discard(key)

    task.add_done_callback(completed)


async def schedule_for_receipt(bot: Bot, provider: str, inv_id: int) -> None:
    """Поставить доставку произвольной оплаченной операции без задержки webhook."""
    provider = str(provider).strip().lower()
    receipt = await db.receipt_get(provider, int(inv_id))
    if not receipt or receipt["payment_status"] != "paid":
        return
    if receipt["order_id"] and receipt["payment_id"]:
        await schedule_for_payment(
            bot, int(receipt["order_id"]), int(receipt["payment_id"])
        )
        return
    key = (provider, int(inv_id))
    if key in _ACTIVE_RECEIPT_KEYS:
        return
    _ACTIVE_RECEIPT_KEYS.add(key)
    task = asyncio.get_running_loop().create_task(
        deliver_for_receipt(bot, provider, int(inv_id)),
        name=f"payment-confirmation:{provider}:{inv_id}",
    )
    _TASKS.add(task)

    def completed(done: asyncio.Task) -> None:
        _TASKS.discard(done)
        _ACTIVE_RECEIPT_KEYS.discard(key)

    task.add_done_callback(completed)


async def retry_pending(bot: Bot, limit: int = 30) -> int:
    """Повторить доставку после SMTP/Telegram-сбоя."""
    rows = await db.receipt_pending_deliveries(limit)
    for row in rows:
        await deliver_for_receipt(bot, str(row["provider"]), int(row["inv_id"]))
    return len(rows)


__all__ = [
    "confirmation_bytes",
    "confirmation_bytes_for_receipt",
    "deliver_for_payment",
    "deliver_for_receipt",
    "prepare_for_payment",
    "retry_pending",
    "schedule_for_payment",
    "schedule_for_receipt",
]
