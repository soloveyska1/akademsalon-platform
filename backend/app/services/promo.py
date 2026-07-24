"""Промокоды: скидка рекламных кампаний и партнёрок.

Правила (согласованы с владельцем 2026-07-15):
- скидка задаётся процентом (с потолком `cap`) ИЛИ фиксом `amount`;
- со скидкой подписки «Салон+» НЕ суммируется — при цене применяется
  бо́льшая из двух (бонусы клиент применяет поверх, как обычно);
- применение списывается из лимита один раз — при первом применении к цене
  (не на заявке: мастер может отклонить, код не должен сгорать зря);
- код с заявки хранится в orders.promo_code, применённая сумма —
  в orders.promo_discount (фиксируется при цене, как sub_discount).
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from .. import db
from ..config import fmt_money

log = logging.getLogger(__name__)


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


def why_invalid(p, price: int | None = None) -> str | None:
    """None — код годен; иначе машинная причина (для тостов сайта)."""
    if p is None:
        return "not_found"
    if not p["active"]:
        return "inactive"
    if p["uses_left"] is not None and p["uses_left"] <= 0:
        return "used_up"
    if p["expires_at"]:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if str(p["expires_at"]) < today:
            return "expired"
    if price is not None and (p["min_price"] or 0) > 0 and price < p["min_price"]:
        return "min_price"
    return None


def label(p) -> str:
    """Человеческая подпись выгоды: «−10% (до 2 000 ₽)» / «−500 ₽»."""
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
    """Применить промокод заказа при назначении цены. Возвращает сумму ₽.

    Звать ПОСЛЕ subs.apply_discount: сравниваем со скидкой подписки и
    оставляем бо́льшую. Повторный вызов (изменение цены) пересчитывает
    сумму, но лимит применений повторно не списывает.
    """
    o = await db.get_order(order_id)
    if not o or not o["price"]:
        return 0
    code = (o["promo_code"] or "").strip()
    if not code:
        return 0
    prev = int(o["promo_discount"] or 0)
    p = await db.promo_get(code)
    bad = why_invalid(p, o["price"]) if p is not None else "not_found"
    # код, уже применённый к этому заказу, не отбираем из-за исчерпания
    # лимита другими заказами — «использован» он был честно
    if bad and not (prev > 0 and bad == "used_up"):
        if prev:
            await db.update_order(order_id, promo_discount=0)
            await db.add_event(order_id, "promo_off", f"{code}: {bad}")
        return 0
    # семейные автокоды («exit») — один раз на клиента: второй такой же код
    # на другом заказе того же человека не применяем (prev>0 — эта скидка
    # уже за этим заказом, пересчёт цены её не трогает)
    if prev == 0 and p["family"] and await db.promo_family_used(
            p["family"], o["user_id"], o["guest_contact"], exclude_order=order_id):
        await db.add_event(order_id, "promo_off",
                           f"{code}: код серии «{p['family']}» уже был применён клиентом")
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
