"""«Мои заказы»: список, карточка, принятие цены/работы, оплата, правки, чат по заказу."""
from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from .. import config, db, keyboards as kb, texts
from ..services import bonus, flow, handoff, notify, payments
from ..services import group as grp
from .client import Ask

log = logging.getLogger(__name__)
router = Router(name="my_orders")

_PRICE_OFFER_STATUSES = frozenset(("priced", "prepay"))


class FixReq(StatesGroup):
    waiting = State()   # ждём описание правок (order_id в data)


class BonusSpend(StatesGroup):
    waiting = State()   # ждём сумму списания (order_id в data)


class DeclineWhy(StatesGroup):
    waiting = State()   # ждём причину отказа текстом (order_id в data)


class Receipt(StatesGroup):
    waiting = State()   # ждём чек об оплате (order_id в data)


class Review(StatesGroup):
    text = State()      # ждём текст отзыва (order_id и rating в data)


async def _owned_order(cb: CallbackQuery, order_id: int):
    o = await db.get_order(order_id)
    if not o or o["user_id"] != cb.from_user.id:
        await cb.answer("Заказ не найден", show_alert=True)
        return None
    return o


def _who(cb: CallbackQuery) -> str:
    return texts.user_link(cb.from_user.id, cb.from_user.first_name, cb.from_user.username)


async def _review_available(o) -> bool:
    """Отзывы доступны после завершения либо оплаченной чистой выдачи."""
    return bool(o) and await handoff.engagement_ready(o)


async def _price_offer_cancelable(o) -> bool:
    """Отказ безопасен лишь до любой отметки/проводки оплаты."""
    if not o or o["status"] not in _PRICE_OFFER_STATUSES:
        return False
    rows = await db.payments_for_order(o["id"])
    return not any(p["status"] in ("claimed", "paid") for p in rows)


# ---------------------------------------------------------------- список

@router.message(Command("myorders"))
async def cmd_orders(m: Message) -> None:
    orders = await db.orders_by_user(m.from_user.id, limit=10)
    if not orders:
        await m.answer("У вас пока нет заказов. Начнём с заявки?",
                       reply_markup=kb.main_menu(False))
        return
    await m.answer("📚 <b>Ваши заказы</b>", reply_markup=kb.orders_list(orders))


@router.callback_query(F.data == "cl:orders")
async def cb_orders(cb: CallbackQuery) -> None:
    orders = await db.orders_by_user(cb.from_user.id, limit=10)
    if not orders:
        await cb.message.edit_text("У вас пока нет заказов. Начнём с заявки?",
                                   reply_markup=kb.main_menu(False))
    else:
        await cb.message.edit_text("📚 <b>Ваши заказы</b>", reply_markup=kb.orders_list(orders))
    await cb.answer()


@router.callback_query(F.data.startswith("cl:order:"))
async def cb_order_card(cb: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    files = await db.files_for_order(o["id"])
    items = await db.items_for_order(o["id"])
    bal = await bonus.balance(cb.from_user.id)
    has_review = bool(await db.review_for_order(o["id"]))
    pays = await db.payments_for_order(o["id"])
    kind, due = payments.due_now(o, pays)
    claimed = any(p["status"] == "claimed" for p in pays)
    try:
        await cb.message.edit_text(
            texts.client_order_card(o, len(files), items),
            reply_markup=kb.client_order(o, len(files), bal, has_review, due, claimed,
                                         due_label=payments.stage_label(o, kind)))
    except Exception:  # noqa: BLE001 — «not modified»
        pass
    await cb.answer()


# ------------------------------------------------------------- цена/оплата

async def _pay_markup(order_id: int) -> "kb.Kb":
    """prepay_kb + кнопка онлайн-оплаты созревшего этапа (если касса включена)."""
    markup = kb.prepay_kb(order_id)
    o = await db.get_order(order_id)
    if not o:
        return markup
    kind, amount = await payments.stage_amount(o)
    if amount > 0:
        markup = kb.with_pay_url(
            markup, await payments.online_link_for_order(o, kind, amount), amount)
    return markup


@router.callback_query(F.data.startswith("cl:accept:"))
async def cb_accept_price(cb: CallbackQuery) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    if o["status"] != "priced":
        await cb.answer("Предложение уже неактуально — посмотрите карточку заказа", show_alert=True)
        return
    await db.set_status(o["id"], "prepay", "клиент принял цену")
    req = await db.setting_get("requisites")
    o2 = await db.get_order(o["id"])
    kind, amount = await payments.stage_amount(o2)
    body = texts.PRICE_ACCEPTED.format(
        no=config.order_no(o["id"]),
        requisites=("💳 <b>Реквизиты для предоплаты "
                    f"({config.fmt_money(amount or o['prepay'])} ₽):</b>\n" + texts.esc(req))
        if req else texts.REQUISITES_FALLBACK,
    )
    markup = kb.prepay_kb(o["id"])
    if amount > 0:
        markup = kb.with_pay_url(
            markup, await payments.online_link_for_order(o2, kind, amount), amount)
    await cb.message.edit_text(body, reply_markup=markup)
    await cb.answer("Отлично!")
    await db.add_event(o["id"], "price_accepted")
    alert = (f"🤝 {_who(cb)} принял(а) цену по заказу {config.order_no(o['id'])} "
             f"({config.fmt_money(o['price'])} ₽). Ожидаем предоплату.")
    await notify.notify_admins(cb.bot, alert, map_client=(cb.from_user.id, o["id"]))
    await grp.send(cb.bot, o["id"], alert)
    await grp.status_sync(cb.bot, o["id"])
    if not req:
        await notify.notify_admins(cb.bot,
                                   "⚠️ Реквизиты не заданы (/requisites) — клиент ждёт их в чате!")


@router.callback_query(F.data.startswith("cl:decline:"))
async def cb_decline(cb: CallbackQuery) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    if not await _price_offer_cancelable(o):
        await cb.answer("Отказ уже недоступен: предложение принято или оплата на сверке",
                        show_alert=True)
        return
    await cb.message.edit_text(
        f"Закрыть заявку {config.order_no(o['id'])}? Если смущает цена или срок — "
        "нажмите «Вернуться» и напишите нам, обычно удаётся договориться.",
        reply_markup=kb.decline_confirm(o["id"]))
    await cb.answer()


@router.callback_query(F.data.startswith("cl:decline_yes:"))
async def cb_decline_yes(cb: CallbackQuery) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    # Кнопка остаётся в истории Telegram. Старая версия не должна отменять
    # уже оплаченную, выполняемую или завершённую работу.
    if not await _price_offer_cancelable(o):
        await cb.answer("Отказ уже недоступен: предложение принято или оплата на сверке",
                        show_alert=True)
        return
    restored = await bonus.restore_for_order(o, "возврат бонусов при отказе")
    await db.set_status(o["id"], "cancel", "клиент отказался")
    from ..services import gift as gift_svc
    await gift_svc.sync_order(cb.bot, o["id"])  # зачёт — обратно на сертификат
    tail = f"\n\n💎 Применённые бонусы ({restored}) вернулись на ваш счёт." if restored else ""
    await cb.message.edit_text(
        texts.PRICE_DECLINED.format(no=config.order_no(o["id"])) + tail +
        "\n\nПодскажете, что не подошло? Это поможет нам сделать предложение точнее "
        "(можно пропустить):", reply_markup=kb.decline_reason_kb(o["id"]))
    await cb.answer()
    alert = texts.DECLINE_ALERT.format(who=_who(cb), no=config.order_no(o["id"])) + \
        "\nЗаявку можно вернуть кнопкой ниже — клиент снова получит предложение."
    dec_kb = kb.Kb(inline_keyboard=[
        [kb.Btn(text="🔄 Возобновить заказ", callback_data=f"ad:resume:{o['id']}")],
        [kb.Btn(text="💬 Написать клиенту", callback_data=f"ad:msg:{o['id']}"),
         kb.Btn(text="📋 Карточка", callback_data=f"ad:card:{o['id']}")],
    ])
    g = await grp.send(cb.bot, o["id"], alert, reply_markup=dec_kb)
    await notify.notify_admins(cb.bot, alert, reply_markup=dec_kb,
                               map_client=(cb.from_user.id, o["id"]), group_sent=bool(g))
    await grp.status_sync(cb.bot, o["id"])


@router.callback_query(F.data.startswith("cl:dr:"))
async def cb_decline_reason(cb: CallbackQuery) -> None:
    parts = cb.data.split(":", 3)
    o = await _owned_order(cb, int(parts[2]))
    if not o:
        return
    # Причина относится только к только что отменённому предложению. После
    # возобновления старая клавиатура не должна менять активный заказ.
    if o["status"] != "cancel":
        await cb.answer("Эта кнопка уже неактуальна", show_alert=True)
        return
    reason = parts[3] if len(parts) > 3 else ""
    no = config.order_no(o["id"])
    if o["cancel_reason"]:
        await cb.answer("Причина уже сохранена")
        return
    if reason:
        await db.update_order(o["id"], cancel_reason=reason)
        await db.add_event(o["id"], "cancel_reason", reason)
        body = f"📋 Причина отказа по заказу {no}: «{texts.esc(reason)}»."
        await notify.notify_admins(cb.bot, body, map_client=(cb.from_user.id, o["id"]))
        await grp.send(cb.bot, o["id"], body)
        await cb.message.edit_text(
            f"Спасибо, учли. Заказ {no} закрыт, но его всегда можно вернуть — "
            "кнопкой «Возобновить» в «📚 Мои заказы» или простым сообщением сюда.")
    else:
        await cb.message.edit_text(
            f"Заказ {no} закрыт. Вернуться к нему можно в любой момент — "
            "«📚 Мои заказы» → «Возобновить».")
    await cb.answer()


@router.callback_query(F.data.startswith("cl:resume:"))
async def cb_resume(cb: CallbackQuery) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    if o["status"] != "cancel":
        await cb.answer("Заказ уже активен", show_alert=True)
        return
    res = await flow.resume_order(cb.bot, o["id"], _who(cb), via="бот")
    if not res.get("ok"):
        await cb.answer("Не получилось — попробуйте ещё раз", show_alert=True)
        return
    no = config.order_no(o["id"])
    if res.get("priced"):
        # у заказа уже есть цена — сразу возвращаем клиенту предложение с кнопками
        o2 = await db.get_order(o["id"])
        await cb.message.edit_text(
            f"🔄 <b>Заказ {no} снова в работе.</b>\n\n" +
            texts.PRICE_OFFER.format(
                no=no, price=config.fmt_money(o2["price"]), prepay_part="") +
            texts.plan_offer_block(payments.stage_plan(o2), config.fmt_money),
            reply_markup=kb.price_offer(o["id"]))
    else:
        await cb.message.edit_text(
            f"🔄 <b>Заказ {no} снова в работе.</b> Мастер видит его и скоро отзовётся "
            "с оценкой. Хотите обсудить условия или что-то поменять — кнопки ниже.",
            reply_markup=kb.client_order(await db.get_order(o["id"])))
    await cb.answer("Возобновили")


# ------------------------------------------------------------- бонусы к заказу

@router.callback_query(F.data.startswith("cl:bspend:"))
async def cb_bonus_spend(cb: CallbackQuery, state: FSMContext) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    if (o["work_type"] or "").startswith("sub_"):
        await cb.answer("Подписка оплачивается деньгами целиком — "
                        "бонусы к ней не применяются", show_alert=True)
        return
    bal = await bonus.balance(cb.from_user.id)
    cap = bonus.spend_cap(o["price"])
    already = o["bonus_spent"] or 0
    no = config.order_no(o["id"])
    if o["status"] not in ("priced", "prepay"):
        await cb.answer("Бонусы применяются после назначения цены и до оплаты", show_alert=True)
        return
    if already > 0:
        await cb.answer(f"К заказу уже применены бонусы ({already}). Списание — один раз; "
                        "передумали — «Вернуть бонусы» в карточке и примените заново",
                        show_alert=True)
        return
    if not o["price"] or o["price"] < config.BONUS_MIN_ORDER:
        await cb.answer(f"Бонусы применимы к заказам от {config.BONUS_MIN_ORDER} ₽", show_alert=True)
        return
    if bal <= 0:
        await cb.answer("На счету пока нет бонусов", show_alert=True)
        return
    limit = min(bal, cap)
    options = sorted({min(100, limit), min(300, limit), limit})
    await state.set_state(BonusSpend.waiting)
    await state.update_data(bspend_order_id=o["id"], bspend_limit=limit)
    await cb.message.answer(
        f"💎 <b>Бонусы к заказу {no}</b>\n\n"
        f"На счету: <b>{bal}</b> · можно применить к этому заказу: <b>до {limit}</b> "
        f"(правила: до {config.BONUS_SPEND_CAP_PCT}% стоимости).\n\n"
        "Выберите сумму кнопкой или напишите свою цифрой:",
        reply_markup=kb.bonus_spend_kb(o["id"], options))
    await cb.answer()


async def _apply_bonus(cb_or_msg, bot, user_id: int, order_id: int, amount: int):
    """Возвращает (текст, клавиатура) — после списания сразу даём кнопки
    «Принять/Оплатить», чтобы не пришлось возвращаться к сообщению выше."""
    o = await db.get_order(order_id)
    ok, err, spent = await bonus.apply_to_order(user_id, o, amount)
    if not ok:
        return ({"bonus_stage": "Бонусы применяются после назначения цены и до оплаты.",
                 "bonus_not_for_subs": "Подписка оплачивается деньгами целиком — "
                                       "бонусы к ней не применяются (правила, §5).",
                 "bonus_after_payment": "По этому заказу уже была оплата — бонусы к нему не применяются.",
                 "bonus_order_small": f"Бонусы применимы к заказам от {config.BONUS_MIN_ORDER} ₽.",
                 "bonus_cap": "Лимит списания по этому заказу уже выбран.",
                 "bonus_once": "Бонусы к заказу применяются один раз. Передумали — "
                               "«Вернуть бонусы» в карточке заказа и примените заново.",
                 "bonus_empty": "На счету нет доступных бонусов."}.get(err, "Не получилось — попробуйте ещё раз."),
                None)
    o = await db.get_order(order_id)
    due = payments.money_due(o)
    no = config.order_no(order_id)
    next_hint = ("Осталось принять предложение — кнопка ниже."
                 if o["status"] == "priced" else "Можно переходить к оплате — кнопки ниже.")
    body = (f"💎 К заказу {no} применено <b>{spent}</b> бонусов. "
            f"Итого деньгами: <b>{config.fmt_money(due['due_total'])} ₽</b>"
            + (f", предоплата — {config.fmt_money(due['prepay_due'])} ₽" if o["prepay"] else "")
            + f".\n\n{next_hint}")
    who = texts.user_link(user_id, None)
    await grp.send(bot, order_id, f"💎 Клиент применил {spent} бонусов к заказу {no}. "
                                  f"К оплате деньгами: {config.fmt_money(due['due_total'])} ₽.")
    await notify.notify_admins(bot, f"💎 {who} применил(а) {spent} бонусов к заказу {no}. "
                                    f"Деньгами к оплате: {config.fmt_money(due['due_total'])} ₽.",
                               map_client=(user_id, order_id))
    return body, kb.after_bonus_kb(o)


@router.callback_query(F.data.startswith("cl:bsp:"))
async def cb_bonus_amount(cb: CallbackQuery, state: FSMContext) -> None:
    _, _, oid, amount = cb.data.split(":")
    o = await _owned_order(cb, int(oid))
    if not o:
        return
    await state.clear()
    msg, markup = await _apply_bonus(cb, cb.bot, cb.from_user.id, o["id"], int(amount))
    await cb.message.edit_text(msg, reply_markup=markup)
    await cb.answer()


@router.message(BonusSpend.waiting, F.text)
async def got_bonus_amount(m: Message, state: FSMContext) -> None:
    data = await state.get_data()
    await state.clear()
    order_id = data.get("bspend_order_id")
    digits = "".join(ch for ch in (m.text or "") if ch.isdigit())
    if not order_id or not digits:
        await m.answer("Нужна сумма цифрой, например: <code>250</code>. "
                       "Откройте заказ и нажмите «💎 Списать бонусы» ещё раз.")
        return
    msg, markup = await _apply_bonus(m, m.bot, m.from_user.id, order_id, int(digits))
    await m.answer(msg, reply_markup=markup)


@router.callback_query(F.data.startswith("cl:req:"))
async def cb_requisites(cb: CallbackQuery) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    kind, amount = await payments.stage_amount(o)
    if amount <= 0:
        pays = await db.payments_for_order(o["id"])
        if any(p["status"] == "claimed" for p in pays):
            await cb.answer("Ваша отметка об оплате на сверке у мастера — платить пока нечего",
                            show_alert=True)
        else:
            await cb.answer("Сейчас платить нечего — оплата по заказу закрыта", show_alert=True)
        return
    label = payments.planned_label(o, kind, payments.stage_plan(o))
    req = await db.setting_get("requisites")
    if req:
        markup = kb.prepay_kb(o["id"])
        pay_url = await payments.online_link_for_order(o, kind, amount)
        if pay_url:
            # касса подключена: карта/СБП первой строкой, статус двинется сам
            markup.inline_keyboard.insert(0, [kb.Btn(
                text=f"💳 Оплатить картой онлайн · {config.fmt_money(amount)} ₽",
                url=pay_url)])
        await cb.message.answer(
            f"💳 <b>{label}: {config.fmt_money(amount)} ₽</b>\n"
            f"Заказ {config.order_no(o['id'])}\n\n{texts.esc(req)}\n\n"
            + ("Оплатите картой по кнопке (чек придёт сам, статус двинется без отметок) — "
               "или переводом по реквизитам выше, тогда после перевода нажмите «Я оплатил(а)»."
               if pay_url else
               "После перевода нажмите «Я оплатил(а)» — мастер сверит поступление."),
            reply_markup=markup)
    else:
        await cb.message.answer(texts.REQUISITES_FALLBACK)
        await notify.notify_admins(cb.bot,
                                   f"⚠️ Клиент запросил реквизиты по заказу {config.order_no(o['id'])}, "
                                   "а они не заданы — /requisites!")
    await cb.answer()


@router.callback_query(F.data.startswith("cl:paid:"))
async def cb_paid(cb: CallbackQuery) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    kind, amount = await payments.stage_amount(o)
    if amount <= 0:
        await cb.answer("Сейчас платить нечего — оплата по заказу закрыта", show_alert=True)
        return
    pays = await db.payments_for_order(o["id"])
    if any(p["status"] == "claimed" for p in pays):
        await cb.answer("Отметка уже стоит — мастер сверяет поступление", show_alert=True)
        return
    row = next((p for p in pays if p["kind"] == kind and p["status"] == "pending"), None)
    if row:
        await db.payment_set_status(row["id"], "claimed")
    else:
        pid = await db.payment_create(o["id"], kind, amount)
        await db.payment_set_status(pid, "claimed")
    await db.add_event(o["id"], "payment_marked")
    await cb.message.answer(texts.PAYMENT_MARKED.format(no=config.order_no(o["id"])),
                            reply_markup=kb.paid_marked_kb(o["id"]))
    await cb.answer("Передали на сверку")
    alert = (texts.PAYMENT_CLAIM.format(who=_who(cb), no=config.order_no(o["id"])) +
             f" · {config.fmt_money(amount)} ₽ ({payments.stage_label(o, kind).lower()}) "
             "— сверьте поступление: кнопки ниже.")
    claim_kb = kb.claim_check_kb(o, amount)
    g = await grp.send(cb.bot, o["id"], alert, reply_markup=claim_kb)
    await notify.notify_admins(cb.bot, alert, reply_markup=claim_kb,
                               map_client=(cb.from_user.id, o["id"]), group_sent=bool(g))


@router.callback_query(F.data.startswith("cl:unpaid:"))
async def cb_unpaid(cb: CallbackQuery) -> None:
    """«Я ещё не оплатил»: снять отметку оплаты, вернуть заказ в спокойное русло."""
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    pays = await db.payments_for_order(o["id"])
    row = next((p for p in pays if p["status"] == "claimed"), None)
    if not row:
        await cb.answer("Отметки об оплате нет — всё спокойно", show_alert=True)
        return
    await db.payment_set_status(row["id"], "pending")
    await db.add_event(o["id"], "payment_unmarked")
    no = config.order_no(o["id"])
    await cb.message.edit_text(
        f"Отметку по заказу {no} сняли — без паники. Реквизиты и кнопки — ниже, "
        "как оплатите, жмите «Я оплатил(а)».",
        reply_markup=kb.unpaid_kb(o["id"]))
    await cb.answer("Отметка снята")
    alert = f"↩️ {_who(cb)} снял(а) отметку об оплате по заказу {no} — сверять пока нечего."
    g = await grp.send(cb.bot, o["id"], alert)
    await notify.notify_admins(cb.bot, alert, map_client=(cb.from_user.id, o["id"]),
                               group_sent=bool(g))


@router.callback_query(F.data.startswith("cl:receipt:"))
async def cb_receipt(cb: CallbackQuery, state: FSMContext) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    await state.set_state(Receipt.waiting)
    await state.update_data(receipt_order_id=o["id"])
    await cb.message.answer("Пришлите чек одним сообщением — фото или PDF. "
                            "Мастер сверит поступление быстрее.")
    await cb.answer()


@router.message(Receipt.waiting, F.document | F.photo)
async def got_receipt(m: Message, state: FSMContext) -> None:
    data = await state.get_data()
    await state.clear()
    order_id = data.get("receipt_order_id")
    o = await db.get_order(order_id) if order_id else None
    if not o:
        return
    no = config.order_no(order_id)
    if m.document:
        await db.add_file(order_id, "client", m.document.file_id, m.document.file_unique_id,
                          m.document.file_name, m.document.file_size, "document", label="чек")
    else:
        ph = m.photo[-1]
        await db.add_file(order_id, "client", ph.file_id, ph.file_unique_id,
                          None, ph.file_size, "photo", label="чек")
    await db.msg_add(order_id, "client", m.caption or "🧾 Чек об оплате",
                     kind="document" if m.document else "photo",
                     file_name=m.document.file_name if m.document else "чек.jpg",
                     tg_file_id=m.document.file_id if m.document else m.photo[-1].file_id)
    await db.add_event(order_id, "receipt", "чек приложен")
    who = _who_msg(m)
    header = f"🧾 <b>Чек по заказу {no}</b> · {who} — сверьте и подтвердите оплату."
    kind, amount = await payments.confirm_amount(o)
    claim_kb = kb.claim_check_kb(o, amount) if amount > 0 else None
    g = await grp.relay_copy(m.bot, order_id, m, header, reply_markup=claim_kb)
    await notify.notify_admins(m.bot, header, reply_markup=claim_kb,
                               map_client=(m.from_user.id, order_id),
                               group_sent=bool(g))
    await m.answer(f"🧾 Чек передали мастеру · заказ {no}. Как только он сверит "
                   "поступление — заказ двинется дальше, уведомим здесь.")


@router.message(Receipt.waiting)
async def receipt_hint(m: Message, state: FSMContext) -> None:
    await state.clear()
    await m.answer("Чек не пришёл (нужно фото или файл). Откройте карточку заказа и "
                   "нажмите «📎 Приложить чек» ещё раз — или просто напишите мастеру.")


def _who_msg(m: Message) -> str:
    return texts.user_link(m.from_user.id, m.from_user.first_name, m.from_user.username)


# --------------------------------------------------------- приёмка/правки

@router.callback_query(F.data.startswith("cl:hfaccept:"))
async def cb_handoff_accept(cb: CallbackQuery) -> None:
    _, _, oid, aid = cb.data.split(":")
    o = await _owned_order(cb, int(oid))
    if not o:
        return
    a = await handoff.by_id(int(aid))
    if not a or a["order_id"] != o["id"]:
        await cb.answer("Эта версия уже неактуальна", show_alert=True)
        return
    if a["phase"] == "released":
        await cb.message.answer(
            f"Завершаем заказ {config.order_no(o['id'])}?\n\n"
            "Если позже появятся замечания, запрос правок всё равно останется доступен.",
            reply_markup=kb.accept_final_confirm(o["id"]))
        await cb.answer()
        return
    res = await handoff.accept(cb.bot, o["id"], int(aid), _who(cb), via="бот")
    if not res.get("ok"):
        await cb.answer("Эта версия уже принята или заменена", show_alert=True)
        return
    if res.get("need_pay"):
        req = await db.setting_get("requisites")
        await cb.message.edit_text(
            f"✅ <b>Защищённая часть принята.</b>\n\n"
            f"Полная работа готова и зафиксирована. Осталось оплатить "
            f"<b>{config.fmt_money(res.get('due', 0))} ₽</b> — после подтверждения "
            "чистый оригинал придёт автоматически."
            + (f"\n\n💳 <b>Реквизиты:</b>\n{texts.esc(req)}" if req else ""),
            reply_markup=await _pay_markup(o["id"]))
        await cb.answer("Часть принята — ждём остаток")
    else:
        await cb.message.edit_text(
            "✅ Защищённая часть принята. Оплата уже закрыта — чистый оригинал "
            "отправлен автоматически и доступен в кабинете.")
        await cb.answer("Оригинал отправлен")


@router.callback_query(F.data.startswith("cl:hffix:"))
async def cb_handoff_fix(cb: CallbackQuery, state: FSMContext) -> None:
    _, _, oid, aid = cb.data.split(":")
    o = await _owned_order(cb, int(oid))
    if not o:
        return
    a = await handoff.by_id(int(aid))
    if not a or a["order_id"] != o["id"] or a["phase"] not in (
            "preview_published", "released"):
        await cb.answer("Эта версия уже неактуальна", show_alert=True)
        return
    await state.set_state(FixReq.waiting)
    await state.update_data(fix_order_id=o["id"], fix_artifact_id=int(aid))
    await cb.message.answer(texts.FIX_ASK)
    await cb.answer()

@router.callback_query(F.data.startswith("cl:accept_work:"))
async def cb_accept_work(cb: CallbackQuery) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    total = o["stages_total"] or 1
    part = o["stage"] or 1
    if part >= total:
        # финал: завершение осознанное — научрук и предзащита должны быть позади
        await cb.message.answer(
            f"Завершаем заказ {config.order_no(o['id'])}?\n\n"
            "Правки бесплатны до приёмки — в том числе по замечаниям научного "
            "руководителя и после предзащиты. Завершайте, когда все проверки позади.",
            reply_markup=kb.accept_final_confirm(o["id"]))
        await cb.answer()
        return
    res = await flow.accept_part(cb.bot, o["id"], _who(cb), via="бот")
    if not res.get("ok"):
        await cb.answer("Сейчас нечего принимать — посмотрите карточку заказа", show_alert=True)
        return
    no = config.order_no(o["id"])
    if not res["final"]:
        await cb.message.edit_text(
            f"📗 <b>Часть {res['part']} из {res['total']} принята.</b>\n\n"
            f"Мастер уже работает над частью {res['next_part']} — сообщим, когда она "
            "будет готова." +
            (f"\n\n💳 По плану оплаты созрел этап: <b>{config.fmt_money(res['due'])} ₽</b>. "
             "Оплатить можно кнопкой ниже." if res.get("due") else ""),
            reply_markup=await _pay_markup(o["id"]) if res.get("due") else None)
        await cb.answer("Часть принята ✓")
    elif res.get("need_pay"):
        if res.get("on_check"):
            await cb.message.edit_text(
                f"🎉 <b>Работа по заказу {no} принята — спасибо!</b>\n\n"
                "Ваша отметка об оплате — на сверке у мастера: как только он "
                "подтвердит поступление, заказ закроется сам.",
                reply_markup=kb.paid_marked_kb(o["id"]))
            await cb.answer("Ждём подтверждение оплаты")
        else:
            req = await db.setting_get("requisites")
            await cb.message.edit_text(
                f"🎉 <b>Работа по заказу {no} принята — спасибо!</b>\n\n"
                f"Остался финальный платёж: <b>{config.fmt_money(res['due'])} ₽</b>. "
                "Как только мастер подтвердит поступление, заказ закроется сам."
                + (f"\n\n💳 <b>Реквизиты:</b>\n{texts.esc(req)}" if req else ""),
                reply_markup=await _pay_markup(o["id"]))
            await cb.answer("Остался финальный платёж")
    else:
        await cb.message.edit_text(texts.ORDER_DONE.format(no=no),
                                   reply_markup=kb.review_invite_kb(o["id"]))
        await cb.answer("Спасибо!")


@router.callback_query(F.data.startswith("cl:waitchk:"))
async def cb_wait_checks(cb: CallbackQuery) -> None:
    """«Ещё жду проверок»: НЕ правки и НЕ завершение — дело остаётся открытым.

    Клиент только что получил финал и ждёт научрука/предзащиту. Ничего не
    ломаем, объясняем режим ожидания; если оплата закрыта — самое время
    мягко предложить услуги «к защите».
    """
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    total = o["stages_total"] or 1
    if o["status"] != "check" or (o["stage"] or 1) < total:
        await cb.answer("Эта кнопка уже неактуальна", show_alert=True)
        return
    if await db.has_event(o["id"], "wait_checks"):
        await cb.answer("Дело уже оставлено открытым — ждём проверки")
        return
    no = config.order_no(o["id"])
    await db.add_event(o["id"], "wait_checks", "клиент ждёт проверок")
    await cb.message.edit_text(
        f"🕐 <b>Без спешки — дело {no} остаётся открытым.</b>\n\n"
        "Работа у вас, правки бесплатны до приёмки: получите замечания научного "
        "руководителя или предзащиты — жмите «Нужны правки» в карточке заказа "
        "(или просто напишите сюда).\n\n"
        "Когда все проверки будут позади — «Принять и завершить». Мы на связи.")
    await cb.answer("Дело остаётся открытым")
    alert = (f"🕐 Клиент по заказу {no} ждёт проверок (научрук/предзащита) — "
             "дело остаётся на его стороне, напоминания через 48 ч работают.")
    g = await grp.send(cb.bot, o["id"], alert)
    await notify.notify_admins(cb.bot, alert, map_client=(cb.from_user.id, o["id"]),
                               group_sent=bool(g))
    # оплата закрыта, финал сдан — уместно предложить пакет «к защите»
    pays = await db.payments_for_order(o["id"])
    plan = payments.plan_state(o, pays)
    if plan and all(p["state"] == "paid" for p in plan):
        await flow.offer_defense(cb.bot, o["id"])


@router.callback_query(F.data.startswith("cl:acceptfin:"))
async def cb_accept_final(cb: CallbackQuery) -> None:
    """Подтверждённое завершение финала — вся механика в flow.accept_part."""
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    res = await flow.accept_part(cb.bot, o["id"], _who(cb), via="бот")
    if not res.get("ok"):
        await cb.answer("Сейчас нечего принимать — посмотрите карточку заказа", show_alert=True)
        return
    no = config.order_no(o["id"])
    if res.get("need_pay"):
        if res.get("on_check"):
            await cb.message.edit_text(
                f"🎉 <b>Работа по заказу {no} принята — спасибо!</b>\n\n"
                "Ваша отметка об оплате — на сверке у мастера: как только он "
                "подтвердит поступление, заказ закроется сам.",
                reply_markup=kb.paid_marked_kb(o["id"]))
            await cb.answer("Ждём подтверждение оплаты")
        else:
            req = await db.setting_get("requisites")
            await cb.message.edit_text(
                f"🎉 <b>Работа по заказу {no} принята — спасибо!</b>\n\n"
                f"Остался финальный платёж: <b>{config.fmt_money(res['due'])} ₽</b>. "
                "Как только мастер подтвердит поступление, заказ закроется сам."
                + (f"\n\n💳 <b>Реквизиты:</b>\n{texts.esc(req)}" if req else ""),
                reply_markup=await _pay_markup(o["id"]))
            await cb.answer("Остался финальный платёж")
    else:
        await cb.message.edit_text(texts.ORDER_DONE.format(no=no),
                                   reply_markup=kb.review_invite_kb(o["id"]))
        await cb.answer("Спасибо!")


@router.callback_query(F.data.startswith("cl:fix:"))
async def cb_fix(cb: CallbackQuery, state: FSMContext) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    if o["status"] not in ("check", "fix", "done"):
        await cb.answer("Правки сейчас недоступны — откройте актуальную карточку",
                        show_alert=True)
        return
    current = await state.get_state()
    data = await state.get_data()
    if current == FixReq.waiting.state and data.get("fix_order_id") == o["id"]:
        await cb.answer("Запрос уже открыт — пришлите замечания сообщением")
        return
    await state.set_state(FixReq.waiting)
    await state.update_data(fix_order_id=o["id"])
    total = o["stages_total"] or 1
    tail = f" (правки по части {o['stage'] or 1} из {total})" if total > 1 else ""
    await cb.message.answer(texts.FIX_ASK + tail)
    await cb.answer()


@router.message(FixReq.waiting)
async def got_fix_request(m: Message, state: FSMContext) -> None:
    data = await state.get_data()
    order_id = data.get("fix_order_id")
    artifact_id = data.get("fix_artifact_id")
    await state.clear()
    o = await db.get_order(order_id) if order_id else None
    if not o:
        return
    who = texts.user_link(m.from_user.id, m.from_user.first_name, m.from_user.username)
    # текст уходит через flow (статус+группа+событие), медиа-комментарий копируем следом
    if artifact_id:
        res = await handoff.request_fixes(
            m.bot, order_id, int(artifact_id), who,
            comment=(m.text or m.caption or ""), via="бот")
    else:
        res = await flow.request_fixes(m.bot, order_id, who,
                                       comment=(m.text or m.caption or ""), via="бот")
    if not res.get("ok"):
        await m.answer("Правки сейчас не запросить — посмотрите статус заказа в «📚 Мои заказы».")
        return
    if not m.text:  # файл/голосовое с пометками — доставим мастеру как есть
        await grp.relay_copy(m.bot, order_id,
                             m, f"✏️ Материалы к правкам · заказ {config.order_no(order_id)}:")
        await db.msg_add(order_id, "client", m.caption,
                         kind=str(m.content_type),
                         file_name=m.document.file_name if m.document else None,
                         tg_file_id=m.document.file_id if m.document else
                         (m.photo[-1].file_id if m.photo else None))
    await m.answer(texts.FIX_TAKEN.format(no=config.order_no(order_id)))


# ------------------------------------------------------------------- пауза

async def _rerender_card(cb: CallbackQuery, order_id: int) -> None:
    o = await db.get_order(order_id)
    files = await db.files_for_order(order_id)
    items = await db.items_for_order(order_id)
    bal = await bonus.balance(cb.from_user.id)
    has_review = bool(await db.review_for_order(order_id))
    pays = await db.payments_for_order(order_id)
    kind, due = payments.due_now(o, pays)
    claimed = any(p["status"] == "claimed" for p in pays)
    try:
        await cb.message.edit_text(texts.client_order_card(o, len(files), items),
                                   reply_markup=kb.client_order(o, len(files), bal,
                                                                has_review, due, claimed,
                                                                due_label=payments.stage_label(o, kind)))
    except Exception:  # noqa: BLE001 — «not modified»
        pass


@router.callback_query(F.data.startswith("cl:pause:"))
async def cb_pause(cb: CallbackQuery) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    if o["status"] not in config.ACTIVE_STATUSES:
        await cb.answer("Этот заказ уже закрыт", show_alert=True)
        return
    if o["paused"]:
        await cb.answer("Заказ уже на паузе", show_alert=True)
        return
    await db.update_order(o["id"], paused=1, paused_by="client", paused_at=db.now_iso())
    await db.add_event(o["id"], "paused", "клиент, бот")
    await _rerender_card(cb, o["id"])
    await cb.answer("Пауза поставлена")
    no = config.order_no(o["id"])
    alert = (f"⏸ {_who(cb)} поставил(а) заказ {no} на паузу. "
             "Работы и напоминания придержаны до сигнала клиента.")
    g = await grp.send(cb.bot, o["id"], alert)
    await notify.notify_admins(cb.bot, alert, map_client=(cb.from_user.id, o["id"]),
                               group_sent=bool(g))


@router.callback_query(F.data.startswith("cl:unpause:"))
async def cb_unpause(cb: CallbackQuery) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    if not o["paused"]:
        await cb.answer("Заказ и так в работе", show_alert=True)
        return
    if (o["paused_by"] or "client") == "admin":
        await cb.answer("Паузу ставил мастер — напишите ему по заказу, он снимет",
                        show_alert=True)
        return
    await db.update_order(o["id"], paused=0, paused_by=None)
    await db.add_event(o["id"], "unpaused", "клиент, бот")
    await _rerender_card(cb, o["id"])
    await cb.answer("Продолжаем!")
    no = config.order_no(o["id"])
    alert = f"▶️ {_who(cb)} снял(а) паузу по заказу {no} — можно продолжать."
    g = await grp.send(cb.bot, o["id"], alert)
    await notify.notify_admins(cb.bot, alert, map_client=(cb.from_user.id, o["id"]),
                               group_sent=bool(g))


# ------------------------------------------------------------- бонусы: возврат

@router.callback_query(F.data.startswith("cl:bcancel:"))
async def cb_bonus_cancel(cb: CallbackQuery) -> None:
    """Клиент передумал списывать бонусы — вернуть их на счёт (до оплаты)."""
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    ok, err, restored = await bonus.cancel_spend(o)
    if not ok:
        await cb.answer({"bonus_nothing": "К заказу не применены бонусы",
                         "bonus_stage": "Бонусы уже зафиксированы в оплате",
                         "bonus_after_payment": "По заказу была оплата — списание уже учтено"}
                        .get(err, "Не получилось"), show_alert=True)
        return
    o2 = await db.get_order(o["id"])
    due = payments.money_due(o2)
    no = config.order_no(o["id"])
    await cb.message.edit_text(
        f"↩️ <b>Бонусы вернулись на счёт: +{restored}.</b>\n\n"
        f"Заказ {no} снова считается без скидки: к оплате деньгами "
        f"{config.fmt_money(due['due_total'])} ₽. Списать бонусы можно снова в любой "
        "момент до оплаты — кнопка в карточке заказа.",
        reply_markup=kb.client_order(o2, bonus_balance=await bonus.balance(cb.from_user.id)))
    await cb.answer(f"+{restored} на счёт")
    alert = (f"↩️ {_who(cb)} вернул(а) {restored} бонусов со счёта заказа {no}. "
             f"К оплате деньгами: {config.fmt_money(due['due_total'])} ₽.")
    g = await grp.send(cb.bot, o["id"], alert)
    await notify.notify_admins(cb.bot, alert, map_client=(cb.from_user.id, o["id"]),
                               group_sent=bool(g))


# ------------------------------------------------------------------- отзыв

@router.callback_query(F.data.startswith("cl:review:"))
async def cb_review(cb: CallbackQuery) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    if not await _review_available(o):
        await cb.answer("Отзыв станет доступен после завершения работы",
                        show_alert=True)
        return
    existing = await db.review_for_order(o["id"])
    head = "⭐ <b>Как вам работа мастерской?</b>\n\nПоставьте оценку — это займёт секунду."
    if existing:
        head = ("⭐ <b>Обновить отзыв?</b>\n\nВаш прошлый отзыв: " +
                "★" * existing["rating"] +
                (f" «{texts.esc(existing['text'])}»" if existing["text"] else "") +
                "\n\nНовая оценка заменит его и снова уйдёт на модерацию.")
    await cb.message.answer(head, reply_markup=kb.review_stars_kb(o["id"]))
    await cb.answer()


@router.callback_query(F.data.startswith("cl:rvstar:"))
async def cb_review_star(cb: CallbackQuery, state: FSMContext) -> None:
    _, _, oid, stars = cb.data.split(":")
    o = await _owned_order(cb, int(oid))
    if not o:
        return
    if not await _review_available(o):
        await cb.answer("Эта кнопка отзыва уже неактуальна", show_alert=True)
        return
    rating = max(1, min(int(stars), 5))
    current = await state.get_state()
    data = await state.get_data()
    if (current == Review.text.state and data.get("review_order_id") == o["id"]
            and data.get("review_rating") == rating):
        await cb.answer("Оценка уже выбрана — добавьте текст или нажмите «Без текста»")
        return
    await state.set_state(Review.text)
    await state.update_data(review_order_id=o["id"], review_rating=rating)
    await cb.message.edit_text(
        "★" * rating + "☆" * (5 - rating) +
        "\n\nПару слов от себя? Что понравилось, как прошла защита — читателям сайта "
        "это помогает решиться. Можно приложить скрин с оценкой.\n\n"
        "<i>Напишите сообщением — или нажмите «Без текста».</i>",
        reply_markup=kb.review_skip_text_kb(o["id"]))
    await cb.answer()


@router.callback_query(F.data.startswith("cl:rvskip:"))
async def cb_review_skip(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    order_id = int(cb.data.split(":")[2])
    if (await state.get_state() != Review.text.state
            or data.get("review_order_id") != order_id):
        await cb.answer("Эта кнопка уже использована — откройте отзыв заново",
                        show_alert=True)
        return
    o = await _owned_order(cb, order_id)
    if not o:
        return
    if not await _review_available(o):
        await state.clear()
        await cb.answer("Отзыв сейчас недоступен", show_alert=True)
        return
    rating = max(1, min(int(data.get("review_rating") or 5), 5))
    await state.clear()
    await flow.submit_review(cb.bot, order_id, rating, None, cb.from_user.first_name)
    await cb.message.edit_text(
        "💛 <b>Спасибо за оценку!</b>\n\nОтзыв сохранён в деле. На сайте он может "
        "появиться только после вашего отдельного согласия на публикацию в кабинете.")
    await cb.answer("Отзыв отправлен")


@router.message(Review.text)
async def got_review_text(m: Message, state: FSMContext) -> None:
    data = await state.get_data()
    order_id = data.get("review_order_id")
    rating = data.get("review_rating") or 5
    if not order_id:
        await state.clear()
        return
    o = await db.get_order(order_id)
    if (not o or o["user_id"] != m.from_user.id
            or not await _review_available(o)):
        await state.clear()
        await m.answer("Отзыв сейчас недоступен — откройте актуальную карточку заказа.")
        return
    await state.clear()
    text = (m.text or m.caption or "").strip()[:2000]
    await flow.submit_review(m.bot, order_id, rating, text or None, m.from_user.first_name)
    # скрин к отзыву — сохраняем в дело и показываем мастеру
    if m.photo or m.document:
        if m.document:
            await db.add_file(order_id, "client", m.document.file_id, m.document.file_unique_id,
                              m.document.file_name, m.document.file_size, "document", label="отзыв")
        else:
            ph = m.photo[-1]
            await db.add_file(order_id, "client", ph.file_id, ph.file_unique_id,
                              None, ph.file_size, "photo", label="отзыв")
        await grp.relay_copy(m.bot, order_id, m,
                             f"⭐ Скрин к отзыву · заказ {config.order_no(order_id)}:")
    await m.answer(
        "💛 <b>Спасибо!</b> Отзыв сохранён в деле. Если приложили скрин, мастер "
        "увидит его. Публикация на сайте возможна только после вашего отдельного "
        "согласия в кабинете."
    )


# ------------------------------------------------------------- чат и файлы

@router.callback_query(F.data.startswith("cl:chat:"))
async def cb_chat(cb: CallbackQuery, state: FSMContext) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    await state.set_state(Ask.chatting)
    await state.update_data(chat_order_id=o["id"])
    await cb.message.answer(
        f"💬 Пишите — сообщение уйдёт мастеру с пометкой «заказ {config.order_no(o['id'])}». "
        "Можно приложить файл или голосовое.")
    await cb.answer()


@router.callback_query(F.data.startswith("cl:files:"))
async def cb_files(cb: CallbackQuery) -> None:
    o = await _owned_order(cb, int(cb.data.split(":")[2]))
    if not o:
        return
    files = await db.files_for_order(o["id"])
    if not files:
        await cb.answer("Файлов пока нет", show_alert=True)
        return
    await cb.answer()
    for f in files[-10:]:
        try:
            cap = f"📎 {f['file_name'] or ''} · заказ {config.order_no(o['id'])}".strip()
            if f["kind"] == "photo":
                await cb.message.answer_photo(f["file_id"], caption=cap)
            else:
                await cb.message.answer_document(f["file_id"], caption=cap)
        except Exception as e:  # noqa: BLE001
            log.warning("resend file failed: %s", e)
