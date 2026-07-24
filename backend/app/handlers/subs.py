"""Подписка «Салон+» в боте: витрина, конструктор, оформление, куратор сессии.

Callback-формат: sb:<действие>[:аргументы]. Оформление живёт в СОБСТВЕННОМ
платёжном контуре подписки (без заказов и этапов): pending → «я оплатил» →
кнопка активации у мастера → active. Бонусы к подписке не применяются.
"""
from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from .. import config, db, keyboards as kb, texts
from ..services import notify, payments, subs
from .order_wizard import parse_ru_date

log = logging.getLogger(__name__)
router = Router(name="subs")

Btn, Kb = kb.Btn, kb.Kb


class Curator(StatesGroup):
    adding = State()   # ждём «Название — дата»


# ------------------------------------------------------------------ витрина

def _fmt(n: int) -> str:
    return config.fmt_money(n)


def _vitrina_kb() -> "Kb":
    rows = []
    for p in config.SUB_PLANS:
        price = (f"{_fmt(p.month_price)} ₽ / {p.period_days} дн." if p.once
                 else f"от {_fmt(p.month_price)} ₽/мес")
        rows.append([Btn(text=f"{subs.PLAN_EMOJI.get(p.id, '⭐')} {p.label} · {price}",
                         callback_data=f"sb:plan:{p.id}")])
    rows.append([Btn(text="🛠 Собрать свою подписку", callback_data="sb:ctor")])
    rows.append([Btn(text="📅 Куратор сессии", callback_data="sb:cur"),
                 Btn(text="⬅️ В меню", callback_data="cl:menu")])
    return Kb(inline_keyboard=rows)


async def show_home(m: Message, user_id: int) -> None:
    """Витрина подписок; при активной подписке — её карточка сверху."""
    pending = await db.sub_pending_for_user(user_id)
    if pending:
        # незавершённое оформление — сперва его платёж, витрина ниже
        head = (f"⏳ <b>Подписка {subs.plan_label(pending['plan'])} ждёт оплату</b> · "
                f"{_fmt(pending['price'])} ₽ ({subs.period_label(pending['period_days'])}).\n"
                + ("Ваша отметка об оплате на сверке у мастера — активируем, как подтвердит."
                   if pending["claimed_at"] else
                   "Реквизиты и кнопки — по кнопке ниже. Передумали — там же можно отменить.")
                + "\n\nИли выберите другой план: прежнее оформление закроется само.")
        kb_rows = _vitrina_kb().inline_keyboard
        kb_rows.insert(0, [Btn(text=f"💳 Оплата подписки · {_fmt(pending['price'])} ₽",
                               callback_data=f"sb:pend:{pending['id']}")])
        await m.answer(head, reply_markup=Kb(inline_keyboard=kb_rows))
        return
    s = await subs.summary(user_id)
    shelf_on = False
    if s:
        feats = "\n".join("• " + x for x in s["feature_lines"])
        extra = []
        if s["express_left"]:
            extra.append("🎙 Экспресс-разбор в этом периоде ещё не использован — просто напишите мастеру.")
        if s["trainer_left"]:
            extra.append("🎓 Тренажёр защиты доступен: по вашему материалу подготовим вопросы комиссии.")
        shelf_on = "shelf" in await subs.user_features(user_id)
        if shelf_on:
            extra.append("📚 «Полка Салона» открыта — вход по кнопке ниже.")
        ar_line = ("🔁 Автопродление включено: когда период закончится, пришлём счёт "
                   "на тот же план — деньги спишутся только вашими руками."
                   if s["auto_renew"] else
                   "🔁 Автопродление выключено: закончится — просто напомним про /plus.")
        head = (f"{s['emoji']} <b>Ваша подписка: {s['label']}</b> · до {s['expires_ru']}\n\n"
                f"{feats}\n\n" + ("\n".join(extra) + "\n\n" if extra else "") +
                ar_line + "\n\n"
                "Скидка применяется сама, когда мастер называет цену. "
                "Продлить или сменить план можно заранее — новая подписка начнётся "
                "после оплаты.")
    else:
        head = (
            "⭐ <b>Салон+ — подписка мастерской</b>\n\n"
            "Скидка на каждый заказ, приоритетная очередь, куратор сессии, "
            "подготовка к защите. Оформляется за минуту, без автосписаний: "
            "закончилась — просто продлите.\n\n"
            "Выберите готовый план или соберите свой:")
    markup = _vitrina_kb()
    if s:
        markup.inline_keyboard.insert(0, [Btn(
            text=("🔁 Автопродление: вкл ✅ — выключить" if s["auto_renew"]
                  else "🔁 Автопродление: выкл — включить"),
            callback_data=f"sb:ar:{s['id']}")])
    if shelf_on:
        markup.inline_keyboard.insert(0, [Btn(text="📚 Полка Салона — войти",
                                              callback_data="sb:shelf")])
    await m.answer(head, reply_markup=markup)


@router.callback_query(F.data.startswith("sb:ar:"))
async def cb_auto_renew(cb: CallbackQuery) -> None:
    """Тумблер автопродления активной подписки (счёт сам, списание — руками)."""
    sub_id = int(cb.data.split(":")[2])
    s = await db.sub_get(sub_id)
    if not s or s["user_id"] != cb.from_user.id or s["status"] != "active":
        await cb.answer("Эта подписка уже не активна", show_alert=True)
        return
    new_val = 0 if s["auto_renew"] else 1
    await db.sub_mark(sub_id, auto_renew=new_val)
    await cb.answer("Автопродление включено ✅ Счёт пришлём сами, спишете руками"
                    if new_val else "Автопродление выключено — просто напомним про /plus",
                    show_alert=False)
    await show_home(cb.message, cb.from_user.id)


@router.callback_query(F.data == "sb:shelf")
async def cb_shelf(cb: CallbackQuery) -> None:
    """Личный одноразовый вход на «Полку Салона» — по запросу подписчика."""
    feats = await subs.user_features(cb.from_user.id)
    if "shelf" not in feats:
        await cb.answer("«Полка Салона» входит в подписку «Салон+» — "
                        "оформите план с полкой", show_alert=True)
        return
    url = await subs.shelf_link(cb.bot, cb.from_user.id)
    if not url:
        await cb.answer("Полка настраивается — загляните чуть позже", show_alert=True)
        return
    await cb.message.answer(
        "📚 <b>Полка Салона</b>\n\n"
        "Закрытый канал мастерской: шаблоны, чек-листы, материалы к защите. "
        "Ваш личный вход — кнопкой ниже. Ссылка одноразовая: сработает один раз "
        "и погаснет (уже внутри — просто откройте канал в списке чатов).",
        reply_markup=Kb(inline_keyboard=[[Btn(text="📚 Войти на Полку", url=url)]]))
    await cb.answer()


@router.message(Command("plus"))
async def cmd_plus(m: Message, state: FSMContext) -> None:
    await state.clear()
    await show_home(m, m.from_user.id)


@router.callback_query(F.data == "sb:home")
async def cb_home(cb: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    s = await subs.summary(cb.from_user.id)
    # перерисовываем витрину на месте
    try:
        await cb.message.delete()
    except Exception:  # noqa: BLE001
        pass
    await show_home(cb.message, cb.from_user.id)
    await cb.answer()


# ------------------------------------------------------------------- планы

def _plan_text(p) -> str:
    feats = "\n".join("• " + config.SUB_FEATURE_BY_ID[f][1] for f in p.features)
    if p.once:
        price = f"<b>{_fmt(p.month_price)} ₽</b> разово · действует {p.period_days} дней"
    else:
        price = (f"<b>{_fmt(p.month_price)} ₽/мес</b> или "
                 f"<b>{_fmt(p.sem_price)} ₽ за семестр</b> (150 дней — "
                 "почти 3 месяца в подарок)")
    return (f"{subs.PLAN_EMOJI.get(p.id, '⭐')} <b>{p.label}</b> — {p.tagline}\n\n"
            f"{feats}\n\n{price}\n\n"
            "Оплата разовая, автосписаний нет. Скидка суммируется с бонусами "
            "(вместе — до 25% заказа).")


def _plan_kb(p) -> "Kb":
    rows = []
    if p.once:
        rows.append([Btn(text=f"🎓 Оформить · {_fmt(p.month_price)} ₽",
                         callback_data=f"sb:buy:{p.id}:month")])
    else:
        rows.append([Btn(text=f"Оформить на месяц · {_fmt(p.month_price)} ₽",
                         callback_data=f"sb:buy:{p.id}:month")])
        rows.append([Btn(text=f"На семестр · {_fmt(p.sem_price)} ₽ (выгоднее)",
                         callback_data=f"sb:buy:{p.id}:sem")])
    rows.append([Btn(text="⬅️ К планам", callback_data="sb:home")])
    return Kb(inline_keyboard=rows)


@router.callback_query(F.data.startswith("sb:plan:"))
async def cb_plan(cb: CallbackQuery) -> None:
    p = config.SUB_PLAN_BY_ID.get(cb.data.split(":")[2])
    if not p:
        await cb.answer("План не найден", show_alert=True)
        return
    await cb.message.edit_text(_plan_text(p), reply_markup=_plan_kb(p))
    await cb.answer()


@router.callback_query(F.data.startswith("sb:buy:"))
async def cb_buy(cb: CallbackQuery) -> None:
    _, _, plan_id, period = cb.data.split(":")
    spec = subs.compose(plan_id, None, period)
    if not spec:
        await cb.answer("Не получилось собрать план", show_alert=True)
        return
    await _checkout(cb, spec)


# -------------------------------------------------------------- конструктор

def _ctor_kb(feats: list[str], period: str) -> "Kb":
    rows = []
    for fid, label, price, _hint in config.SUB_FEATURES:
        on = fid in feats
        mark = "✅" if on else "➕"
        rows.append([Btn(text=f"{mark} {label} · {price} ₽",
                         callback_data=f"sb:ct:{fid}")])
    m_on = "◉" if period == "month" else "○"
    s_on = "◉" if period == "sem" else "○"
    rows.append([Btn(text=f"{m_on} Месяц", callback_data="sb:ctp:month"),
                 Btn(text=f"{s_on} Семестр ×2.2", callback_data="sb:ctp:sem")])
    total = config.sub_custom_price(feats, period) if feats else 0
    rows.append([Btn(text=(f"🧾 Оформить за {_fmt(total)} ₽" if feats
                           else "Выберите хотя бы одну опцию"),
                     callback_data="sb:ctbuy")])
    rows.append([Btn(text="⬅️ К планам", callback_data="sb:home")])
    return Kb(inline_keyboard=rows)


def _ctor_text(feats: list[str], period: str) -> str:
    days, plabel, _ = config.SUB_PERIODS[period]
    lines = [f"🛠 <b>Своя подписка</b> · база {config.SUB_BASE_PRICE} ₽/мес + опции",
             f"Период: {plabel}", ""]
    if feats:
        total = config.sub_custom_price(feats, period)
        pct, cap = config.sub_discount_for(feats)
        lines.append(f"Итого: <b>{_fmt(total)} ₽</b>"
                     + (f" · скидка {pct}% (до {_fmt(cap)} ₽ с заказа)" if pct else ""))
        if pct:
            # покажем клиенту его выгоду: скидка окупает подписку с одного заказа
            sample = 20_000
            save = min(sample * pct // 100, cap)
            lines.append(f"<i>Например, курсовая за {_fmt(sample)} ₽ → выгода "
                         f"{_fmt(save)} ₽ уже с одного заказа.</i>")
    else:
        lines.append("Отмечайте опции кнопками — цена соберётся сама.")
    lines.append("\nГотовые планы обычно выгоднее набора тех же опций на 10–15%.")
    return "\n".join(lines)


@router.callback_query(F.data == "sb:ctor")
async def cb_ctor(cb: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(ctor_feats=[], ctor_period="month")
    await cb.message.edit_text(_ctor_text([], "month"),
                               reply_markup=_ctor_kb([], "month"))
    await cb.answer()


@router.callback_query(F.data.startswith("sb:ct:"))
async def cb_ctor_toggle(cb: CallbackQuery, state: FSMContext) -> None:
    fid = cb.data.split(":")[2]
    if fid not in config.SUB_FEATURE_BY_ID:
        await cb.answer()
        return
    data = await state.get_data()
    feats: list = list(data.get("ctor_feats") or [])
    period = data.get("ctor_period") or "month"
    if fid in feats:
        feats.remove(fid)
    else:
        if fid in config.SUB_DISCOUNTS:  # скидка одна — заменяем прежнюю
            feats = [f for f in feats if f not in config.SUB_DISCOUNTS]
        feats.append(fid)
    await state.update_data(ctor_feats=feats)
    try:
        await cb.message.edit_text(_ctor_text(feats, period),
                                   reply_markup=_ctor_kb(feats, period))
    except Exception:  # noqa: BLE001 — not modified
        pass
    await cb.answer()


@router.callback_query(F.data.startswith("sb:ctp:"))
async def cb_ctor_period(cb: CallbackQuery, state: FSMContext) -> None:
    period = cb.data.split(":")[2]
    if period not in config.SUB_PERIODS:
        await cb.answer()
        return
    data = await state.get_data()
    feats: list = list(data.get("ctor_feats") or [])
    await state.update_data(ctor_period=period)
    try:
        await cb.message.edit_text(_ctor_text(feats, period),
                                   reply_markup=_ctor_kb(feats, period))
    except Exception:  # noqa: BLE001
        pass
    await cb.answer()


@router.callback_query(F.data == "sb:ctbuy")
async def cb_ctor_buy(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    feats: list = list(data.get("ctor_feats") or [])
    period = data.get("ctor_period") or "month"
    if not feats:
        await cb.answer("Отметьте хотя бы одну опцию", show_alert=True)
        return
    spec = subs.compose("custom", feats, period)
    if not spec:
        await cb.answer("Не получилось собрать подписку", show_alert=True)
        return
    await state.clear()
    await _checkout(cb, spec)


# ------------------------------------------------------------- оформление
# Подписка — не заказ: одна сумма, свои кнопки, без этапов и бонусов.

async def _pay_kb(s) -> "Kb":
    rows = []
    pay_url = await payments.online_link_for_sub(s)
    if pay_url:
        rows.append([Btn(text=f"💳 Оплатить картой онлайн · {_fmt(s['price'])} ₽",
                         url=pay_url)])
    rows.append([Btn(text="✅ Я оплатил(а) подписку", callback_data=f"sb:paid:{s['id']}")])
    rows.append([Btn(text="✖️ Отменить оформление", callback_data=f"sb:cancel:{s['id']}"),
                 Btn(text="⬅️ К планам", callback_data="sb:home")])
    return Kb(inline_keyboard=rows)


def _claimed_kb(sub_id: int) -> "Kb":
    return Kb(inline_keyboard=[
        [Btn(text="↩️ Я ещё не оплатил — снять отметку",
             callback_data=f"sb:unpaid:{sub_id}")],
        [Btn(text="⬅️ К подписке", callback_data="sb:home")],
    ])


async def _payment_text(s) -> str:
    req = await db.setting_get("requisites")
    feats = "\n".join("• " + x for x in subs.features_lines(await db.sub_features(s)))
    how = ("Картой по кнопке — чек и активация сами; переводом — после него "
           "нажмите «Я оплатил(а) подписку», сверим и активируем сразу."
           if config.pay_provider() else
           "После перевода нажмите «Я оплатил(а) подписку» — сверим и "
           "активируем сразу, напишем сюда.")
    return (f"🧾 <b>Подписка {subs.plan_label(s['plan'])}</b> · "
            f"{subs.period_label(s['period_days'])} · <b>{_fmt(s['price'])} ₽</b>\n\n"
            f"{feats}\n\n"
            + (f"💳 <b>Реквизиты для перевода:</b>\n{texts.esc(req)}\n\n" if req else "")
            + "Подписка оплачивается одним платежом, деньгами целиком — "
              f"бонусы к ней не применяются. {how} Автосписаний нет.")


async def _checkout(cb: CallbackQuery, spec: dict) -> None:
    """Оформить подписку в её собственном контуре и показать платёж."""
    s = await subs.create_pending(cb.from_user.id, spec, via="бот")
    await cb.message.edit_text(await _payment_text(s), reply_markup=await _pay_kb(s))
    await cb.answer("Подписка ждёт оплату")
    who = texts.user_link(cb.from_user.id, cb.from_user.first_name, cb.from_user.username)
    await notify.notify_admins(
        cb.bot,
        f"⭐ {who} оформил(а) подписку <b>{spec['label']}</b> "
        f"({spec['period_label']}, {_fmt(spec['price'])} ₽) в боте — ждёт оплату. "
        "Отметит перевод — придёт кнопка активации.",
        map_client=(cb.from_user.id, None))


async def _own_sub(cb: CallbackQuery, sub_id: int):
    s = await db.sub_get(sub_id)
    if not s or s["user_id"] != cb.from_user.id:
        await cb.answer("Не нашли это оформление", show_alert=True)
        return None
    return s


@router.callback_query(F.data.startswith("sb:pend:"))
async def cb_pending(cb: CallbackQuery) -> None:
    """Открыть платёж незавершённого оформления из витрины."""
    s = await _own_sub(cb, int(cb.data.split(":")[2]))
    if not s:
        return
    if s["status"] == "active":
        await cb.answer("Эта подписка уже активна ⭐", show_alert=True)
        return
    if s["status"] != "pending":
        await cb.answer("Оформление уже закрыто — выберите план заново", show_alert=True)
        return
    markup = _claimed_kb(s["id"]) if s["claimed_at"] else await _pay_kb(s)
    body = await _payment_text(s)
    if s["claimed_at"]:
        body += "\n\n🕐 Ваша отметка об оплате на сверке у мастера."
    await cb.message.edit_text(body, reply_markup=markup)
    await cb.answer()


@router.callback_query(F.data.startswith("sb:paid:"))
async def cb_sub_paid(cb: CallbackQuery) -> None:
    s = await _own_sub(cb, int(cb.data.split(":")[2]))
    if not s:
        return
    if s["status"] == "active":
        await cb.answer("Подписка уже активна ⭐", show_alert=True)
        return
    if s["status"] != "pending":
        await cb.answer("Оформление уже закрыто — /plus, чтобы выбрать план", show_alert=True)
        return
    if s["claimed_at"]:
        await cb.answer("Отметка уже стоит — мастер сверяет поступление", show_alert=True)
        return
    await subs.claim_paid(cb.bot, s, via="бот")
    await cb.message.edit_text(
        f"🕐 <b>Отметили: перевод {_fmt(s['price'])} ₽ за подписку "
        f"{subs.plan_label(s['plan'])}.</b>\n\n"
        "Мастер сверит поступление и активирует — напишем сюда сразу. "
        "Обычно это занимает считаные минуты в рабочее время.",
        reply_markup=_claimed_kb(s["id"]))
    await cb.answer("Передали мастеру на сверку")


@router.callback_query(F.data.startswith("sb:unpaid:"))
async def cb_sub_unpaid(cb: CallbackQuery) -> None:
    s = await _own_sub(cb, int(cb.data.split(":")[2]))
    if not s:
        return
    if s["status"] != "pending" or not s["claimed_at"]:
        await cb.answer("Снимать нечего — отметки нет", show_alert=True)
        return
    await subs.unclaim(s)
    s = await db.sub_get(s["id"])
    await cb.message.edit_text(await _payment_text(s), reply_markup=await _pay_kb(s))
    await cb.answer("Отметка снята — без паники")


@router.callback_query(F.data.startswith("sb:cancel:"))
async def cb_sub_cancel(cb: CallbackQuery) -> None:
    s = await _own_sub(cb, int(cb.data.split(":")[2]))
    if not s:
        return
    if not await subs.cancel_pending(cb.bot, s, by="client"):
        await cb.answer("Это оформление уже закрыто", show_alert=True)
        return
    await cb.message.edit_text(
        "✖️ Оформление подписки отменено — ничего не списано и не должно.\n"
        "Вернуться к планам можно в любой момент: /plus.",
        reply_markup=Kb(inline_keyboard=[
            [Btn(text="⭐ К планам «Салон+»", callback_data="sb:home")],
            [Btn(text="⬅️ В меню", callback_data="cl:menu")]]))
    await cb.answer("Отменено")
    who = texts.user_link(cb.from_user.id, cb.from_user.first_name, cb.from_user.username)
    await notify.notify_admins(
        cb.bot, f"✖️ {who} отменил(а) оформление подписки "
                f"«{subs.plan_label(s['plan'])}» ({_fmt(s['price'])} ₽) до оплаты.",
        map_client=(cb.from_user.id, None))


# --------------------------------------------------- сверка оплаты (мастер)

@router.callback_query(F.data.startswith("sb:adok:"))
async def cb_admin_sub_ok(cb: CallbackQuery) -> None:
    if cb.from_user.id not in config.ADMIN_IDS:
        await cb.answer("Кнопка для мастера", show_alert=True)
        return
    sub_id = int(cb.data.split(":")[2])
    s = await subs.activate_paid(cb.bot, sub_id, method="manual", actor="мастер")
    if not s:
        await cb.answer("Оформление уже закрыто (отменено?)", show_alert=True)
        return
    await cb.message.edit_text(
        f"✅ Подписка <b>{subs.plan_label(s['plan'])}</b> активирована "
        f"до {s['expires_at'][8:10]}.{s['expires_at'][5:7]} — клиент уведомлён. "
        f"Оплата {_fmt(s['price'])} ₽ учтена (не забудьте чек в «Мой налог»).")
    await cb.answer("Активирована")


@router.callback_query(F.data.startswith("sb:adno:"))
async def cb_admin_sub_no(cb: CallbackQuery) -> None:
    if cb.from_user.id not in config.ADMIN_IDS:
        await cb.answer("Кнопка для мастера", show_alert=True)
        return
    sub_id = int(cb.data.split(":")[2])
    s = await db.sub_get(sub_id)
    if not s or s["status"] != "pending":
        await cb.answer("Оформление уже закрыто", show_alert=True)
        return
    await subs.unclaim(s)
    if s["user_id"] > 0:
        await notify.notify_client(
            cb.bot, s["user_id"],
            f"🔍 Пока не видим перевод {_fmt(s['price'])} ₽ за подписку "
            f"«{subs.plan_label(s['plan'])}». Проверьте, ушёл ли платёж, — "
            "и отметьте оплату ещё раз (/plus). Если переводили — напишите сюда, "
            "разберёмся вместе.")
    await cb.message.edit_text(cb.message.html_text +
                               "\n\n↩️ Отметка снята, клиент предупреждён.")
    await cb.answer("Отметка снята")


# --------------------------------------------------------- куратор сессии

def _cur_kb(rows_ms, can_add: bool) -> "Kb":
    rows = []
    for m in rows_ms[:10]:
        d = m["due_date"]
        rows.append([Btn(text=f"🗑 {d[8:10]}.{d[5:7]} · {m['title'][:28]}",
                         callback_data=f"sb:curdel:{m['id']}")])
    if can_add:
        rows.append([Btn(text="➕ Добавить сдачу", callback_data="sb:curadd")])
    rows.append([Btn(text="⬅️ К подписке", callback_data="sb:home")])
    return Kb(inline_keyboard=rows)


@router.callback_query(F.data == "sb:cur")
async def cb_curator(cb: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    ms = await db.milestones_for(cb.from_user.id)
    feats = await subs.user_features(cb.from_user.id)
    limit = 50 if "curator" in feats else 1
    can_add = len(ms) < limit
    head = ("📅 <b>Куратор сессии</b>\n\n"
            "Внесите свои сдачи — напомним за 7, 3 и 1 день и подстрахуем, "
            "если станет жарко.\n")
    if ms:
        head += "\nВаш график (нажмите, чтобы удалить):"
    else:
        head += "\nПока пусто — добавьте первую сдачу."
    if "curator" not in feats:
        head += ("\n\n<i>Без подписки доступна 1 запись; с «Салон+» — весь график "
                 "сессии без ограничений.</i>")
    await cb.message.edit_text(head, reply_markup=_cur_kb(ms, can_add))
    await cb.answer()


@router.callback_query(F.data == "sb:curadd")
async def cb_curator_add(cb: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(Curator.adding)
    await cb.message.answer(
        "Напишите сдачу одним сообщением: <b>что и когда</b>.\n"
        "Например: <code>Экзамен по ТГП — 25 января</code> или "
        "<code>Предзащита 14.06</code>")
    await cb.answer()


@router.message(Curator.adding, F.text)
async def got_milestone(m: Message, state: FSMContext) -> None:
    raw = (m.text or "").strip()
    iso = parse_ru_date(raw)
    if not iso:
        await m.answer("Не разобрал дату 😔 Напишите ещё раз, например: "
                       "<code>Курсовая по праву — 20 августа</code>")
        return
    await state.clear()
    import re
    title = re.sub(r"[—\-–]?\s*(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?|\d{1,2}\s+[а-яА-Я]+"
                   r"|через\s+\d*\s*\w+|завтра\S*)\s*$", "", raw).strip(" —-–") or "Сдача"
    await db.milestone_add(m.from_user.id, title, iso)
    ms = await db.milestones_for(m.from_user.id)
    feats = await subs.user_features(m.from_user.id)
    limit = 50 if "curator" in feats else 1
    await m.answer(
        f"📅 Записал: <b>{texts.esc(title)}</b> — {iso[8:10]}.{iso[5:7]}.{iso[:4]}.\n"
        "Напомню за 7, 3 и 1 день. Весь график — в «Куратор сессии» (/plus).",
        reply_markup=_cur_kb(ms, len(ms) < limit))


@router.callback_query(F.data.startswith("sb:curdel:"))
async def cb_curator_del(cb: CallbackQuery) -> None:
    mid = int(cb.data.split(":")[2])
    ok = await db.milestone_del(cb.from_user.id, mid)
    ms = await db.milestones_for(cb.from_user.id)
    feats = await subs.user_features(cb.from_user.id)
    limit = 50 if "curator" in feats else 1
    try:
        await cb.message.edit_reply_markup(reply_markup=_cur_kb(ms, len(ms) < limit))
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("Удалено" if ok else "Уже удалено")
