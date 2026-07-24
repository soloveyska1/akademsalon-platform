"""Подписка «Салон+»: планы, конструктор, СВОЙ платёжный контур, скидки, куратор.

Как устроено (подписка — НЕ заказ, у неё собственный порядок оплаты):
— оформление создаёт строку subscriptions со статусом pending: клиент видит
  «платёж за подписку» (одна сумма, без этапов и плана оплат) и реквизиты;
— «Я оплатил подписку» → claimed_at, мастер получает кнопку активации;
  подтверждение (или онлайн-провайдер) → active на свой период;
— бонусы к подписке НЕ применяются ни в какую сторону: списание запрещено
  (правила лояльности §5), кэшбэк/рефералка с оплаты подписки не идут;
— скидка активной подписки применяется к обычным заказам автоматически
  в момент назначения цены (apply_discount из flow.set_price): процент
  с ПОТОЛКОМ в рублях, совместный потолок с бонусами — 25% заказа;
— фичи-обещания (тренажёр, экспресс, SOS) исполняет мастер руками,
  подписка ведёт учёт (express_used/trainer_used);
— легаси: старые подписки-«заказы» (work_type sub_*, order_id в строке)
  дорабатывают через payments.confirm → maybe_activate.
"""
from __future__ import annotations

import logging

from aiogram import Bot

from .. import config, db

log = logging.getLogger(__name__)

PLAN_EMOJI = {"plus": "⭐", "pro": "🌟", "session": "🎓", "custom": "🛠"}


def plan_label(plan: str) -> str:
    p = config.SUB_PLAN_BY_ID.get(plan)
    if p:
        return p.label
    return "Салон+ (своя сборка)" if plan == "custom" else plan


def features_lines(features: list[str]) -> list[str]:
    out = []
    for fid in features:
        f = config.SUB_FEATURE_BY_ID.get(fid)
        if f:
            out.append(f[1])
    return out


def compose(plan_id: str, features: list[str] | None, period: str) -> dict | None:
    """Собрать параметры подписки: цена, срок, скидка. None — некорректно."""
    if plan_id == "custom":
        feats = [f for f in (features or []) if f in config.SUB_FEATURE_BY_ID]
        # из скидочных фич действует одна, самая жирная — уберём дубли
        discs = [f for f in feats if f in config.SUB_DISCOUNTS]
        if len(discs) > 1:
            best = max(discs, key=lambda f: config.SUB_DISCOUNTS[f][0])
            feats = [f for f in feats if f not in config.SUB_DISCOUNTS or f == best]
        if not feats:
            return None
        days, plabel, _ = config.SUB_PERIODS.get(period, config.SUB_PERIODS["month"])
        price = config.sub_custom_price(feats, period)
        pct, cap = config.sub_discount_for(feats)
        return {"plan": "custom", "label": plan_label("custom"), "features": feats,
                "price": price, "period_days": days, "period_label": plabel,
                "discount_pct": pct, "discount_cap": cap}
    p = config.SUB_PLAN_BY_ID.get(plan_id)
    if not p:
        return None
    feats = list(p.features)
    pct, cap = config.sub_discount_for(feats)
    if p.once:
        return {"plan": p.id, "label": p.label, "features": feats,
                "price": p.month_price, "period_days": p.period_days,
                "period_label": f"{p.period_days} дней",
                "discount_pct": pct, "discount_cap": cap}
    if period == "sem" and p.sem_price:
        days, plabel, _ = config.SUB_PERIODS["sem"]
        return {"plan": p.id, "label": p.label, "features": feats,
                "price": p.sem_price, "period_days": days, "period_label": plabel,
                "discount_pct": pct, "discount_cap": cap}
    days, plabel, _ = config.SUB_PERIODS["month"]
    return {"plan": p.id, "label": p.label, "features": feats,
            "price": p.month_price, "period_days": days, "period_label": plabel,
            "discount_pct": pct, "discount_cap": cap}


def period_label(days: int) -> str:
    for _pid, (d, lbl, _k) in config.SUB_PERIODS.items():
        if d == days:
            return lbl
    return f"{days} дней"


async def create_pending(user_id: int, spec: dict, via: str = "бот"):
    """Оформление подписки: собственный платёжный контур, БЕЗ заказа.

    Незавершённое прежнее оформление отменяется — действует последнее
    (клиент передумал и выбрал другой план — не плодим хвосты).
    """
    old = await db.sub_pending_for_user(user_id)
    if old:
        await db.sub_mark(old["id"], status="canceled", canceled_at=db.now_iso())
    sub_id = await db.sub_create(user_id, spec["plan"], spec["features"],
                                 spec["price"], spec["period_days"],
                                 spec["discount_pct"], spec["discount_cap"],
                                 order_id=None, via=via)
    log.info("subscription %s pending (%s, %s ₽, via %s) for user %s",
             sub_id, spec["plan"], spec["price"], via, user_id)
    return await db.sub_get(sub_id)


async def sub_json(s) -> dict:
    """Платёжная карточка оформления — для кабинета сайта и админки."""
    feats = await db.sub_features(s)
    return {
        "id": s["id"], "plan": s["plan"], "label": plan_label(s["plan"]),
        "emoji": PLAN_EMOJI.get(s["plan"], "⭐"),
        "price": s["price"], "period_days": s["period_days"],
        "period_label": period_label(s["period_days"]),
        "features": feats, "feature_lines": features_lines(feats),
        "status": s["status"],
        "claimed": bool(_row_get(s, "claimed_at")),
        "created_at": s["created_at"],
    }


def admin_confirm_kb(sub_id: int):
    """Кнопки сверки для мастера (DM): активировать или вернуть на оплату."""
    from aiogram.types import InlineKeyboardButton as Btn
    from aiogram.types import InlineKeyboardMarkup as Kb
    return Kb(inline_keyboard=[
        [Btn(text="✅ Оплата получена — активировать", callback_data=f"sb:adok:{sub_id}")],
        [Btn(text="↩️ Оплата не найдена", callback_data=f"sb:adno:{sub_id}")],
    ])


async def claim_paid(bot: Bot, s, via: str = "бот") -> None:
    """Клиент отметил «я оплатил подписку» — зовём мастера сверить."""
    from . import notify  # локальный импорт против циклов
    from .. import texts
    await db.sub_mark(s["id"], claimed_at=db.now_iso())
    u = await db.get_user(s["user_id"])
    who = texts.user_link(s["user_id"], u["first_name"] if u else None,
                          u["username"] if u else None)
    await notify.notify_admins(
        bot,
        f"⭐ <b>Оплата подписки на сверке.</b> {who} отметил(а) перевод "
        f"<b>{config.fmt_money(s['price'])} ₽</b> за «{plan_label(s['plan'])}» "
        f"({period_label(s['period_days'])}, {via}).\n"
        "Деньги пришли — жмите активацию, подписка включится сама.",
        reply_markup=admin_confirm_kb(s["id"]),
        map_client=(s["user_id"], None) if s["user_id"] > 0 else None)


async def unclaim(s) -> None:
    """Снять отметку «оплатил» (клиент передумал или мастер не нашёл перевод)."""
    await db.sub_mark(s["id"], claimed_at=None)


async def spawn_renewal(bot: Bot, s) -> dict | None:
    """Автопродление БЕЗ автосписания: подписка истекла с auto_renew=1 —
    собираем новое оформление того же плана и присылаем счёт. Деньги
    списываются только руками клиента (перевод или касса); не оплатит за
    7 дней — pending закроется штатной уборкой, никакого долга."""
    import json as _json
    from . import notify, payments  # локальные импорты против циклов
    if not s["user_id"] or s["user_id"] <= 0:
        return None
    try:
        feats = _json.loads(s["features"]) if s["features"] else []
    except (TypeError, ValueError):
        feats = []
    spec = {"plan": s["plan"], "features": feats, "price": s["price"],
            "period_days": s["period_days"], "discount_pct": s["discount_pct"],
            "discount_cap": s["discount_cap"]}
    fresh = await create_pending(s["user_id"], spec, via="автопродление")
    await db.sub_mark(fresh["id"], auto_renew=1)  # наследуем настройку
    from aiogram.types import InlineKeyboardButton as Btn
    from aiogram.types import InlineKeyboardMarkup as Kb
    rows = []
    pay_url = await payments.online_link_for_sub(fresh)
    if pay_url:
        rows.append([Btn(text=f"💳 Оплатить картой · {config.fmt_money(fresh['price'])} ₽",
                         url=pay_url)])
    rows.append([Btn(text="✅ Я оплатил(а) подписку", callback_data=f"sb:paid:{fresh['id']}")])
    rows.append([Btn(text="✖️ Не продлевать", callback_data=f"sb:cancel:{fresh['id']}")])
    req = await db.setting_get("requisites")
    body = (f"🔁 <b>Автопродление: подписка «{plan_label(s['plan'])}» закончилась — "
            f"собрали новый счёт.</b>\n\n"
            f"Тот же план на {period_label(fresh['period_days'])} — "
            f"<b>{config.fmt_money(fresh['price'])} ₽</b>. Ничего не списывали и не спишем "
            "сами: оплата — только вашими руками, кнопками ниже."
            + (f"\n\n💳 <b>Реквизиты для перевода:</b>\n{req}" if req and not pay_url else "")
            + "\n\nНе планируете продлевать — нажмите «Не продлевать» или просто "
              "игнорируйте: через 7 дней счёт закроется сам, без долгов. Отключить "
              "автопродление насовсем — /plus → «Автопродление».")
    await notify.notify_client(bot, s["user_id"], body,
                               reply_markup=Kb(inline_keyboard=rows))
    return fresh


async def activate_paid(bot: Bot, sub_id: int, method: str = "manual",
                        actor: str = "мастер"):
    """Оплата подписки подтверждена: активировать и поздравить клиента.

    Идемпотентно: активная строка возвращается как есть, отменённая — None.
    """
    s = await db.sub_get(sub_id)
    if not s:
        return None
    if s["status"] == "active":
        return s
    if s["status"] != "pending":
        return None
    await db.sub_mark(sub_id, paid_at=db.now_iso(), pay_method=method)
    s2 = await db.sub_activate(sub_id)
    await _congratulate(bot, s2)
    await _rediscount_open_orders(bot, s2)
    log.info("subscription %s activated (%s, %s) for user %s",
             sub_id, method, actor, s2["user_id"])
    return s2


async def _rediscount_open_orders(bot: Bot, s) -> None:
    """Свежая подписка пересчитывает открытые заказы без оплат.

    Держим обещание витрины «скидка применится уже к этому заказу»:
    у дел в new/priced/prepay с ценой и без единого платежа скидка
    появляется сразу, клиент получает честный пересчёт уведомлением.
    """
    from . import notify, payments  # локальные импорты против циклов
    if not s or not s["user_id"]:
        return
    try:
        orders = await db.orders_where(
            "WHERE user_id=? AND status IN ('new','priced','prepay') "
            "AND coalesce(price,0) > 0", (s["user_id"],))
    except Exception:  # noqa: BLE001
        log.exception("rediscount: orders query failed")
        return
    for o in orders:
        try:
            if is_sub_order(o):
                continue
            pays = await db.payments_for_order(o["id"])
            if any(p["status"] == "paid" for p in pays):
                continue  # оплата пошла — цену не трогаем
            before = o["sub_discount"] or 0
            disc = await apply_discount(o["id"])
            if disc > before and s["user_id"] > 0:
                o2 = await db.get_order(o["id"])
                d = payments.money_due(o2)
                await notify.notify_client(
                    bot, s["user_id"],
                    f"⭐ Скидка подписки применена к заказу {config.order_no(o['id'])}: "
                    f"<b>−{config.fmt_money(disc)} ₽</b>. Деньгами к оплате: "
                    f"<b>{config.fmt_money(d['due_total'])} ₽</b> — план оплат уже пересчитан.")
        except Exception:  # noqa: BLE001
            log.exception("rediscount failed for order %s", o["id"])


async def cancel_pending(bot: Bot, s, by: str = "client") -> bool:
    """Отменить неоплаченное оформление (клиент передумал / мастер закрыл)."""
    from . import notify
    if s["status"] != "pending":
        return False
    await db.sub_mark(s["id"], status="canceled", canceled_at=db.now_iso())
    if by == "admin" and s["user_id"] > 0:
        await notify.notify_client(
            bot, s["user_id"],
            f"⭐ Оформление подписки «{plan_label(s['plan'])}» закрыто мастером. "
            "Если это ошибка или перевод всё-таки был — напишите сюда, разберёмся. "
            "Оформить заново: /plus.")
    log.info("subscription %s canceled by %s", s["id"], by)
    return True


async def shelf_link(bot: Bot, user_id: int) -> str | None:
    """Личный вход на «Полку Салона» (закрытый канал подписчиков).

    member_limit=1 — ссылка одноразовая: сработала и погасла, пересылать
    её бесполезно. None — полка выключена или у бота нет прав."""
    if not config.SHELF_CHAT_ID or not user_id or user_id <= 0:
        return None
    try:
        inv = await bot.create_chat_invite_link(
            config.SHELF_CHAT_ID, name=f"Салон+ · {user_id}"[:32], member_limit=1)
        return inv.invite_link
    except Exception as e:  # noqa: BLE001 — полка не должна ломать подписку
        log.warning("shelf invite for %s failed: %s", user_id, e)
        return config.SHELF_INVITE_FALLBACK or None


async def shelf_kick(bot: Bot, user_id: int) -> bool:
    """Закрыть полку: выпустить участника из канала (бан+разбан = мягкий кик).

    Разбан сразу — чтобы при новой подписке личный инвайт снова сработал."""
    if not config.SHELF_CHAT_ID or not user_id or user_id <= 0:
        return False
    if user_id in config.ADMIN_IDS:
        return False  # мастера с полки не выгоняем
    try:
        await bot.ban_chat_member(config.SHELF_CHAT_ID, user_id)
        await bot.unban_chat_member(config.SHELF_CHAT_ID, user_id,
                                    only_if_banned=True)
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("shelf kick for %s failed: %s", user_id, e)
        return False


async def _congratulate(bot: Bot, s) -> None:
    if not s["user_id"]:
        return
    from . import notify  # локальный импорт против циклов
    from .. import keyboards as kb  # локальный импорт против циклов
    features = await db.sub_features(s)
    feats = "\n".join("• " + x for x in features_lines(features))
    body = (f"{PLAN_EMOJI.get(s['plan'], '⭐')} <b>Подписка {plan_label(s['plan'])} "
            f"активна до {_ru_date(s['expires_at'])}!</b>\n\n{feats}\n\n"
            "Скидка применится сама, когда мастер назначит цену заказа. "
            "Статус подписки — в «💎 Мои бонусы» и в кабинете на сайте.")
    markup = None
    if "shelf" in features:
        url = await shelf_link(bot, s["user_id"])
        if url:
            body += ("\n\n📚 <b>«Полка Салона» открыта для вас</b> — закрытый канал "
                     "с шаблонами, чек-листами и материалами к защите. Вход по личной "
                     "кнопке ниже (ссылка одноразовая).")
            markup = kb.Kb(inline_keyboard=[[kb.Btn(
                text="📚 Войти на «Полку Салона»", url=url)]])
    await notify.notify_client(bot, s["user_id"], body, reply_markup=markup)


def is_sub_order(o) -> bool:
    return bool((o["work_type"] or "").startswith("sub_"))


def _row_get(s, key: str):
    try:
        return s[key]
    except (KeyError, IndexError):
        return None


async def maybe_activate(bot: Bot, order_id: int) -> bool:
    """Хук из payments.confirm: заказ-носитель оплачен полностью → активировать."""
    o = await db.get_order(order_id)
    if not o or not is_sub_order(o):
        return False
    pays = await db.payments_for_order(order_id)
    paid = sum(p["amount"] for p in pays if p["status"] == "paid")
    if paid < (o["price"] or 0):
        return False
    sub = await db.sub_pending_for_order(order_id)
    if not sub:
        return False
    s = await db.sub_activate(sub["id"])
    await db.set_status(order_id, "done", "подписка активирована")
    await db.add_event(order_id, "sub_activated",
                       f"{s['plan']} до {s['expires_at'][:10]}")
    if o["user_id"]:
        from . import notify  # локальный импорт против циклов
        feats = "\n".join("• " + x for x in features_lines(await db.sub_features(s)))
        await notify.notify_client(
            bot, o["user_id"],
            f"{PLAN_EMOJI.get(s['plan'], '⭐')} <b>Подписка {plan_label(s['plan'])} "
            f"активна до {_ru_date(s['expires_at'])}!</b>\n\n{feats}\n\n"
            "Скидка применится сама, когда мастер назначит цену заказа. "
            "Статус подписки — в «💎 Мои бонусы» и в кабинете на сайте.")
    await _rediscount_open_orders(bot, s)
    log.info("subscription %s activated for user %s", sub["id"], o["user_id"])
    return True


def _ru_date(iso: str | None) -> str:
    if not iso:
        return "—"
    return f"{iso[8:10]}.{iso[5:7]}.{iso[:4]}"


async def apply_discount(order_id: int) -> int:
    """Автоскидка активной подписки при назначении цены. Возвращает сумму ₽.

    Не трогает: заказы-носители подписки, заказы без клиента, повторный вызов
    (скидка уже стоит), случаи, когда скидку съел потолок 25% вместе с бонусами.
    """
    o = await db.get_order(order_id)
    if not o or not o["user_id"] or not o["price"] or is_sub_order(o):
        return 0
    sub = await db.sub_active(o["user_id"])
    if not sub or not sub["discount_pct"]:
        if (o["sub_discount"] or 0) != 0:
            await db.update_order(order_id, sub_discount=0)
        return 0
    price = o["price"]
    disc = min(price * sub["discount_pct"] // 100, sub["discount_cap"] or 10**9)
    # совместный потолок «подписка + бонусы ≤ 25% заказа» (правила 3.4)
    room = max(price * 25 // 100 - (o["bonus_spent"] or 0), 0)
    disc = max(0, min(disc, room))
    if disc != (o["sub_discount"] or 0):
        await db.update_order(order_id, sub_discount=disc)
        if disc > 0:
            await db.add_event(order_id, "sub_discount",
                               f"−{disc} ₽ ({plan_label(sub['plan'])}, {sub['discount_pct']}%)")
    return disc


async def summary(user_id: int) -> dict | None:
    """Карточка подписки для бота/кабинета; None — подписки нет."""
    s = await db.sub_active(user_id)
    if not s:
        return None
    feats = await db.sub_features(s)
    return {
        "id": s["id"],
        "plan": s["plan"], "label": plan_label(s["plan"]),
        "emoji": PLAN_EMOJI.get(s["plan"], "⭐"),
        "expires_at": s["expires_at"], "expires_ru": _ru_date(s["expires_at"]),
        "features": feats, "feature_lines": features_lines(feats),
        "discount_pct": s["discount_pct"], "discount_cap": s["discount_cap"],
        "express_left": (1 if "express" in feats and not s["express_used"] else 0),
        "trainer_left": (1 if "trainer" in feats and not s["trainer_used"] else 0),
        "auto_renew": bool(_row_get(s, "auto_renew")),
    }


async def user_features(user_id: int | None) -> list[str]:
    """Фичи действующей подписки пользователя ([] — подписки нет)."""
    if not user_id:
        return []
    s = await db.sub_active(user_id)
    return await db.sub_features(s) if s else []


async def cashback_pct(user_id: int | None) -> int:
    """Процент кэшбэка: ×2 при фиче «cb2» действующей подписки."""
    feats = await user_features(user_id)
    return config.BONUS_CASHBACK_PCT * 2 if "cb2" in feats else config.BONUS_CASHBACK_PCT


async def ref_pct(inviter_id: int | None) -> int:
    """Реферальный процент пригласившего: 7% при фиче «реф-буст»."""
    feats = await user_features(inviter_id)
    return 7 if "refboost" in feats else config.BONUS_REF_PCT
