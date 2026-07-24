"""Бонусный счёт — строго по «Правилам программы лояльности» (loyalty.html).

Параметры (config.BONUS_*): велком 300/30 дн (1 раз на tg-аккаунт),
кэшбэк 5%/90 дн от фактически оплаченного, рефералка 5% пригласившему
с каждого оплаченного заказа + 200 приглашённому после первой оплаты,
списание ≤20% стоимости заказа и только по заказам от 1000 ₽,
FIFO по ближайшему сгоранию, предупреждение о сгорании за 3 дня.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from aiogram import Bot

from .. import config, db
from . import notify

log = logging.getLogger(__name__)

KIND_LABEL = {
    "welcome": "Приветственный бонус",
    "cashback": "Кэшбэк за оплаченный заказ",
    "ref_reward": "Реферальное вознаграждение",
    "ref_gift": "Бонус за первый заказ по приглашению",
    "admin": "Начислено мастерской",
    "spend": "Оплата бонусами",
    "restore": "Возврат бонусов",
    "revoke": "Списано мастерской",
    "expire": "Бонусы сгорели",
}


async def balance(user_id: int) -> int:
    return await db.bonus_balance(user_id)


async def summary(user_id: int) -> dict:
    """Баланс + ближайшие сгорания — для кабинета, бота и админки.

    Порции агрегируются по дате сгорания: клиент видит «до 08.10 — 620»,
    а не хвосты отдельных начислений (17, 603, …) — иначе путаница.
    """
    rows = await db.bonus_active_accruals(user_id)
    bal = sum(r["delta"] - r["consumed"] for r in rows)
    by_date: dict[str, int] = {}
    for r in rows:
        if r["expires_at"]:
            day = r["expires_at"][:10]
            by_date[day] = by_date.get(day, 0) + (r["delta"] - r["consumed"])
    expiring = [{"amount": amt, "at": f"{day}T00:00:00"}
                for day, amt in sorted(by_date.items()) if amt > 0]
    return {"balance": bal, "expiring": expiring[:3],
            "expiring_total": sum(e["amount"] for e in expiring)}


# ------------------------------------------------------------- начисления

async def grant_welcome(user_id: int) -> bool:
    """300 бонусов, один раз на аккаунт. True — если начислили сейчас."""
    if await db.bonus_has(user_id, "welcome"):
        return False
    await db.bonus_add(user_id, config.BONUS_WELCOME, "welcome",
                       "за знакомство с мастерской", ttl_days=config.BONUS_WELCOME_TTL)
    await db.conn().execute("UPDATE users SET welcome_at=? WHERE id=?",
                            (db.now_iso(), user_id))
    await db.conn().commit()
    return True


async def on_payment(bot: Bot, order_id: int) -> None:
    """Хук после подтверждённого платежа: кэшбэк + рефералка.

    Начисляем ТОЛЬКО когда заказ оплачен полностью (правило владельца и
    п. 2.2 правил лояльности: основание — оплаченный заказ, а не платёж).
    Идемпотентно: одно начисление каждого рода на заказ.
    """
    from . import payments as pay_svc  # локальный импорт против цикла bonus↔payments
    order = await db.get_order(order_id)
    if not order or not order["user_id"]:
        return
    pays = await db.payments_for_order(order_id)
    paid_sum = sum(p["amount"] for p in pays if p["status"] == "paid")
    d = pay_svc.money_due(order)
    if d["due_total"] <= 0 or paid_sum < d["due_total"]:
        return  # заказ ещё не оплачен целиком — бонусы после полной оплаты
    user_id = order["user_id"]
    no = config.order_no(order_id)
    base = min(paid_sum, d["due_total"])  # от фактически оплаченного деньгами
    # кэшбэк — один раз на заказ; подписка с фичей «кэшбэк ×2» удваивает
    from . import subs  # локальный импорт против цикла bonus↔subs
    cb_pct = await subs.cashback_pct(user_id)
    cb = int(base * cb_pct / 100)
    if cb > 0 and not await db.bonus_has_order(order_id, "cashback"):
        await db.bonus_add(user_id, cb, "cashback", f"заказ {no} оплачен полностью"
                           + (" · ×2 по подписке" if cb_pct > config.BONUS_CASHBACK_PCT else ""),
                           order_id, ttl_days=config.BONUS_CASHBACK_TTL)
        await notify.notify_client(
            bot, user_id,
            f"💎 Заказ {no} оплачен полностью — на ваш счёт зачислен кэшбэк "
            f"{cb_pct}%{' (×2 по подписке «Салон+»)' if cb_pct > config.BONUS_CASHBACK_PCT else ''}: "
            f"<b>{cb}</b> бонусов. Они действуют "
            f"{config.BONUS_CASHBACK_TTL} дней, баланс: <b>{await balance(user_id)}</b>.")
    # рефералка — тоже от полной оплаты, один раз на заказ («реф-буст» → 7%)
    u = await db.get_user(user_id)
    ref_id = u["referrer_id"] if u else None
    if ref_id and ref_id != user_id:
        r_pct = await subs.ref_pct(ref_id)
        reward = int(base * r_pct / 100)
        if reward > 0 and not await db.bonus_has_order(order_id, "ref_reward"):
            await db.bonus_add(ref_id, reward, "ref_reward",
                               f"оплата приглашённого · заказ {no}", order_id,
                               ttl_days=config.BONUS_REF_TTL)
            await notify.notify_client(
                bot, ref_id,
                f"🤝 Ваш гость полностью оплатил заказ — вам зачислено <b>{reward}</b> "
                f"бонусов ({r_pct}% от оплаты"
                + (", реф-буст по подписке" if r_pct > config.BONUS_REF_PCT else "")
                + f"). Баланс: <b>{await balance(ref_id)}</b>.")
            await notify.notify_admins(
                bot, f"🤝 Реферальное начисление: {reward} бонусов пользователю "
                     f"<code>{ref_id}</code> за оплату по заказу {no}.")
        if not await db.bonus_has(user_id, "ref_gift"):
            await db.bonus_add(user_id, config.BONUS_REF_GIFT, "ref_gift",
                               "первый оплаченный заказ по приглашению", order_id,
                               ttl_days=config.BONUS_REF_TTL)
            await notify.notify_client(
                bot, user_id,
                f"🎁 И ещё <b>{config.BONUS_REF_GIFT}</b> бонусов — за то, что пришли "
                f"по приглашению. Спасибо, что вы с нами!")


# --------------------------------------------------------------- списание

def spend_cap(price: int | None, sub_discount: int = 0) -> int:
    """Максимум бонусов к заказу: ≤20% цены И ≤25% вместе со скидкой подписки."""
    if not price or price < config.BONUS_MIN_ORDER:
        return 0
    cap = price * config.BONUS_SPEND_CAP_PCT // 100
    joint_room = max(price * 25 // 100 - (sub_discount or 0), 0)
    return min(cap, joint_room)


async def apply_to_order(user_id: int, order, amount: int) -> tuple[bool, str, int]:
    """Применить бонусы к заказу — ОДИН раз, до первой оплаты.

    Правило: списание оформляется при подтверждении заказа; в процессе
    (после первого платежа) — нельзя. Передумали — «вернуть бонусы»
    и применить заново, пока оплата не началась. Возвращает (ok, err, spent).
    """
    if (order["work_type"] or "").startswith("sub_"):
        # подписка оплачивается деньгами целиком (правила лояльности §5);
        # актуально для легаси заказов-носителей — новый контур бонусов не знает
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
    """Отказ/возврат: списанные бонусы возвращаются (срок ≥30 дней, п. 3.7)."""
    spent = order["bonus_spent"] or 0
    if spent <= 0 or not order["user_id"]:
        return 0
    await db.bonus_add(order["user_id"], spent, "restore",
                       f"{note} {config.order_no(order['id'])}", order["id"], ttl_days=30)
    await db.update_order(order["id"], bonus_spent=0)
    return spent


async def cancel_spend(order) -> tuple[bool, str, int]:
    """Клиент передумал списывать бонусы: вернуть на счёт (до первой оплаты)."""
    spent = order["bonus_spent"] or 0
    if spent <= 0 or not order["user_id"]:
        return False, "bonus_nothing", 0
    if order["status"] not in ("priced", "prepay"):
        return False, "bonus_stage", 0
    payments = await db.payments_for_order(order["id"])
    if any(p["status"] == "paid" for p in payments):
        return False, "bonus_after_payment", 0
    restored = await restore_for_order(order, "отмена списания")
    await db.add_event(order["id"], "bonus_canceled", f"{restored} бонусов")
    return True, "", restored


# ------------------------------------------------------- сгорание (планировщик)

async def sweep_expiring(bot: Bot) -> None:
    """Раз в день: предупредить о сгорании за N дней; отметить сгоревшее."""
    now = datetime.now(timezone.utc)
    warn_edge = (now + timedelta(days=config.BONUS_EXPIRE_WARN_DAYS)) \
        .strftime("%Y-%m-%dT%H:%M:%S")
    now_s = now.strftime("%Y-%m-%dT%H:%M:%S")

    # предупреждения (по одному на начисление)
    cur = await db.conn().execute(
        "SELECT * FROM bonus_ledger WHERE delta>0 AND consumed<delta AND warned=0 "
        "AND expires_at IS NOT NULL AND expires_at > ? AND expires_at <= ?",
        (now_s, warn_edge))
    for r in await cur.fetchall():
        await db.conn().execute("UPDATE bonus_ledger SET warned=1 WHERE id=?", (r["id"],))
        await db.conn().commit()
        rest = r["delta"] - r["consumed"]
        try:
            d = datetime.strptime(r["expires_at"], "%Y-%m-%dT%H:%M:%S")
            when = d.astimezone(config.MSK).strftime("%d.%m")
        except ValueError:
            when = "скоро"
        await notify.notify_client(
            bot, r["user_id"],
            f"⏳ Напоминание: <b>{rest}</b> бонусов сгорят {when}. "
            f"Успейте применить их к заказу — это скидка деньгами. "
            f"Баланс: <b>{await balance(r['user_id'])}</b>.")

    # фиксация сгоревшего (для журнала клиента)
    cur = await db.conn().execute(
        "SELECT * FROM bonus_ledger WHERE delta>0 AND consumed<delta AND warned<2 "
        "AND expires_at IS NOT NULL AND expires_at <= ?", (now_s,))
    for r in await cur.fetchall():
        rest = r["delta"] - r["consumed"]
        await db.conn().execute(
            "UPDATE bonus_ledger SET warned=2, consumed=delta WHERE id=?", (r["id"],))
        await db.conn().commit()
        await db.bonus_add(r["user_id"], 0, "expire", f"сгорело {rest} бонусов")
