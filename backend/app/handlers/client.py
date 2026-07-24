"""Клиентская часть: /start и deep-links с сайта, меню, вопросы, свободный чат."""
from __future__ import annotations

import logging

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from .. import config, db, keyboards as kb, texts
from ..services import bonus, notify
from ..texts import esc

log = logging.getLogger(__name__)
router = Router(name="client")


class Ask(StatesGroup):
    waiting = State()          # ждём вопрос
    chatting = State()         # ждём сообщение по конкретному заказу (order_id в data)


# ------------------------------------------------------------------- /start

@router.message(CommandStart())
async def cmd_start(m: Message, command: CommandObject, state: FSMContext,
                    is_new_user: bool = False) -> None:
    await state.clear()
    args = (command.args or "").strip()

    if args.startswith("auth_"):
        await _handle_auth_link(m, args)
        return
    if args.startswith("claim_"):
        await _handle_claim_link(m, args)
        return
    if args.startswith("lead_"):
        await _handle_lead_link(m, args)
        return
    if args.startswith("welcome_"):
        await _handle_welcome_link(m, args)
        return
    if args.startswith("ref_") or args.startswith("ref"):
        await _handle_ref_link(m, args, is_new_user)
        return
    if args.startswith("plus") or args == "pluspro":
        # подписка «Салон+» с сайта: plus | pluspro | plus_session | plus_ctor
        from . import subs as subs_handlers
        target = {"pluspro": "pro", "plus_session": "session"}.get(args)
        if target:
            p = config.SUB_PLAN_BY_ID[target]
            from .subs import _plan_kb, _plan_text  # noqa: PLC0415
            await m.answer(_plan_text(p), reply_markup=_plan_kb(p))
        else:
            await subs_handlers.show_home(m, m.from_user.id)
        return
    if args.startswith("web"):
        await _handle_site_deeplink(m, args, is_new_user)
        return

    # обычный /start
    text = texts.WELCOME if is_new_user else texts.WELCOME_BACK
    has_orders = bool(await db.orders_by_user(m.from_user.id, limit=1))
    await m.answer(text, reply_markup=kb.client_reply_kb())
    if not await db.bonus_has(m.from_user.id, "welcome"):
        await m.answer(texts.FIRST_BONUS + "\n\n" +
                       texts.WELCOME_RULES_ASK.format(site=config.SITE_URL),
                       reply_markup=kb.welcome_confirm())
    await m.answer(texts.MENU_HINT, reply_markup=kb.main_menu(has_orders))


async def _handle_welcome_link(m: Message, args: str) -> None:
    """Тур на сайте → «Забрать 300 бонусов»: одноразовый токен + 1 раз на аккаунт."""
    token = args.removeprefix("welcome_")[:64]
    await db.welcome_token_use(token, m.from_user.id)  # жжём токен в любом случае
    if await db.bonus_has(m.from_user.id, "welcome"):
        await m.answer(texts.WELCOME_ALREADY.format(balance=await bonus.balance(m.from_user.id)),
                       reply_markup=kb.client_reply_kb())
        return
    await m.answer(texts.WELCOME_RULES_ASK.format(site=config.SITE_URL),
                   reply_markup=kb.welcome_confirm())


async def _handle_ref_link(m: Message, args: str, is_new_user: bool) -> None:
    """Приглашение друга: ref_<id>. Приглашающий фиксируется один раз."""
    raw = args.removeprefix("ref_").removeprefix("ref")
    try:
        ref_id = int(raw)
    except ValueError:
        ref_id = 0
    u = await db.get_user(m.from_user.id)
    linked = False
    if (ref_id and ref_id != m.from_user.id and u and not u["referrer_id"]
            and is_new_user and await db.get_user(ref_id)):
        await db.conn().execute("UPDATE users SET referrer_id=? WHERE id=?",
                                (ref_id, m.from_user.id))
        await db.conn().commit()
        linked = True
        await notify.notify_client(
            m.bot, ref_id,
            "🤝 По вашей ссылке пришёл новый гость — когда он оплатит первый заказ, "
            f"вам начислится {config.BONUS_REF_PCT}% бонусами.")
    text = texts.WELCOME if is_new_user else texts.WELCOME_BACK
    await m.answer(text, reply_markup=kb.client_reply_kb())
    if linked:
        await m.answer(texts.REF_HELLO)
    if not await db.bonus_has(m.from_user.id, "welcome"):
        await m.answer(texts.WELCOME_RULES_ASK.format(site=config.SITE_URL),
                       reply_markup=kb.welcome_confirm())
    has_orders = bool(await db.orders_by_user(m.from_user.id, limit=1))
    await m.answer(texts.MENU_HINT, reply_markup=kb.main_menu(has_orders))


async def _send_welcome_pamyatka(bot, user_id: int) -> None:
    """«Путеводитель заказчика» (PDF) — подарок вместе с приветственными бонусами."""
    try:
        from ..services import pamyatka
        pdf = pamyatka.build_welcome_pdf()
        if not pdf:
            return
        from aiogram.types import BufferedInputFile
        await bot.send_document(
            user_id,
            BufferedInputFile(pdf, filename="putevoditel-zakazchika.pdf"),
            caption=("📕 И небольшой подарок к бонусам — «Путеводитель заказчика»: "
                     "как устроен Салон, оплата по частям после показанного результата, "
                     "гарантии по уставу и как получить лучший результат. "
                     "10 минут чтения — и вопросов не останется."))
    except Exception as e:  # noqa: BLE001 — подарок не должен ломать начисление
        log.warning("welcome pamyatka failed for %s: %s", user_id, e)


@router.callback_query(F.data == "cl:welcome_ok")
async def cb_welcome_ok(cb: CallbackQuery) -> None:
    granted = await bonus.grant_welcome(cb.from_user.id)
    if granted:
        await cb.message.edit_text(texts.WELCOME_GRANTED)
        await cb.answer("+300 бонусов ✨")
        await _send_welcome_pamyatka(cb.bot, cb.from_user.id)
        await notify.notify_admins(
            cb.bot, f"🎁 Приветственные 300 бонусов начислены: "
                    f"{texts.user_link(cb.from_user.id, cb.from_user.first_name, cb.from_user.username)}")
    else:
        await cb.message.edit_text(
            texts.WELCOME_ALREADY.format(balance=await bonus.balance(cb.from_user.id)))
        await cb.answer()


@router.message(Command("stopnews"))
async def cmd_stopnews(m: Message) -> None:
    """Отписка от новостей и акций — сервисные уведомления не трогаем."""
    await db.conn().execute("UPDATE users SET subscribed=0 WHERE id=?", (m.from_user.id,))
    await db.conn().commit()
    await m.answer("🔕 Отписали от новостей и акций. Уведомления по вашим заказам "
                   "приходят как раньше. Передумаете — /startnews")


@router.message(Command("startnews"))
async def cmd_startnews(m: Message) -> None:
    # дата согласия — то, чем оно доказывается при проверке ФАС
    await db.conn().execute("UPDATE users SET subscribed=1, subscribed_at=? WHERE id=?",
                            (db.now_iso(), m.from_user.id))
    await db.conn().commit()
    await m.answer("🔔 Снова присылаем новости и акции мастерской. "
                   "Отписаться можно в любой момент: /stopnews")


async def show_bonus_menu(m: Message) -> None:
    s = await bonus.summary(m.from_user.id)
    if s["expiring"]:
        nearest = s["expiring"][0]
        exp = (f"⏳ <b>{nearest['amount']}</b> бонусов сгорят {db.to_msk(nearest['at'])[:5]} — "
               "успейте применить к заказу.\n")
        if len(s["expiring"]) > 1:
            exp += "Дальше: " + ", ".join(
                f"{e['amount']} — до {db.to_msk(e['at'])[:5]}" for e in s["expiring"][1:]) + "\n"
    else:
        exp = ""
    has_orders = bool(await db.orders_by_user(m.from_user.id, limit=1))
    await m.answer(texts.BONUS_MENU.format(
        balance=s["balance"], expiring=exp,
        ref_link=f"https://t.me/{config.BOT_USERNAME}?start=ref_{m.from_user.id}",
        site=config.SITE_URL), reply_markup=kb.bonus_menu(has_orders))


@router.message(Command("bonus"))
async def cmd_bonus(m: Message, state: FSMContext) -> None:
    await state.clear()
    await show_bonus_menu(m)


# ---------------- Депозит мастерской: кошелёк-аванс из бота ----------------
async def _dep_text(user_id: int) -> tuple[str, object]:
    from ..services import deposit
    s = await deposit.summary(user_id)
    rates = sorted(deposit.RATES)  # [(20000, 8) … (60000, 15)]
    text = (
        "💼 <b>Депозит мастерской</b>\n\n"
        f"На кошельке: <b>{config.fmt_money(s['balance'])} ₽</b>. Им оплачиваются "
        "этапы заказов в один клик — кнопка «С депозита» на карточке заказа "
        "в кабинете на сайте.\n\n"
        "Пополните — бонусы сверху сразу: от +8% за 20 000 ₽ до +15% за 60 000 ₽. "
        "Чек НПД приходит при пополнении; неиспользованный остаток возвратен "
        f"(<a href=\"{config.SITE_URL}/loyalty.html\">правила, раздел 5а</a>).")
    if not s["can_topup"]:
        text += "\n\n⚠️ Потолок кошелька 120 000 ₽ достигнут — сначала потратьте часть."
    return text, kb.dep_menu(rates, s["can_topup"])


@router.message(Command("deposit"))
async def cmd_deposit(m: Message, state: FSMContext) -> None:
    await state.clear()
    text, markup = await _dep_text(m.from_user.id)
    await m.answer(text, reply_markup=markup, disable_web_page_preview=True)


@router.callback_query(F.data == "dep:menu")
async def cb_dep_menu(cb: CallbackQuery) -> None:
    text, markup = await _dep_text(cb.from_user.id)
    await cb.message.answer(text, reply_markup=markup, disable_web_page_preview=True)
    await cb.answer()


@router.callback_query(F.data.startswith("dep:top:"))
async def cb_dep_top(cb: CallbackQuery) -> None:
    from ..services import deposit, payments
    try:
        amount = int(cb.data.split(":")[2])
    except (IndexError, ValueError):
        await cb.answer("Не разобрал сумму", show_alert=True)
        return
    if not deposit.amount_ok(amount):
        await cb.answer("Пополнение — от 20 000 до 60 000 ₽", show_alert=True)
        return
    if (await deposit.balance(cb.from_user.id)) + amount > deposit.MAX_ACTIVE:
        await cb.answer("Потолок кошелька 120 000 ₽ — сначала потратьте часть",
                        show_alert=True)
        return
    if not config.robokassa_on():
        await cb.answer()
        await cb.message.answer(
            "Онлайн-оплата сейчас недоступна — напишите мастеру "
            "@academicsaloon, пополним переводом.")
        return
    d = await deposit.create_pending(user_id=cb.from_user.id, amount=amount,
                                     via="бот")
    url = await payments.robo_create_link_dep(d)
    if not url:
        await cb.answer("Не получилось создать счёт — попробуйте позже",
                        show_alert=True)
        return
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
    await cb.message.answer(
        f"💼 Пополнение депозита на <b>{config.fmt_money(amount)} ₽</b>.\n"
        f"После оплаты сверху придут <b>{config.fmt_money(d['bonus_amount'])}</b> "
        f"бонусами (+{d['bonus_pct']}%) — начислим и напишем сюда автоматически.",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[[
            InlineKeyboardButton(text=f"Оплатить {config.fmt_money(amount)} ₽ картой",
                                 url=url)]]))
    await cb.answer()


async def _handle_auth_link(m: Message, args: str) -> None:
    """Подтверждение входа на сайте: t.me/бот?start=auth_<код>."""
    code = args.removeprefix("auth_")[:64]
    ok = await db.auth_code_complete(code, m.from_user.id)
    if ok:
        await m.answer(
            "✅ <b>Вход на сайте подтверждён.</b>\n\n"
            "Вернитесь во вкладку сайта — кабинет уже открывается. Теперь всё синхронно: "
            "заказы, статусы и переписка живут и на сайте, и здесь.",
            reply_markup=kb.client_reply_kb())
    else:
        await m.answer(
            "Ссылка входа устарела 😔 Вернитесь на сайт и нажмите "
            "«Войти через Telegram» ещё раз — вход подтвердится мгновенно.",
            reply_markup=kb.client_reply_kb())


async def _handle_claim_link(m: Message, args: str) -> None:
    """Гость оформил заказ на сайте → «Продолжить в Telegram» привязывает заказ сюда."""
    token = args.removeprefix("claim_")[:64]
    o = await db.order_by_access_token(token)
    # Дело в корзине по ссылке не привязываем: мастер убрал его не просто так.
    if o and (o["deleted"] or 0):
        o = None
    has_orders = True
    if not o:
        await m.answer(texts.WELCOME, reply_markup=kb.main_menu(False))
        return
    no = config.order_no(o["id"])
    linked_here = False
    if o["user_id"] is None:
        claimed = await db.claim_order_to_user(o["id"], token, m.from_user.id)
        if not claimed:
            await m.answer(
                "Эта ссылка уже использована. Откройте заказ через «📚 Мои заказы» "
                "или попросите мастера прислать новую карточку.",
                reply_markup=kb.client_reply_kb())
            return
        o = await db.get_order(o["id"])
        await db.add_event(o["id"], "tg_linked", f"tg {m.from_user.id}")
        await db.adopt_ref_hint(m.from_user.id)
        who = texts.user_link(m.from_user.id, m.from_user.first_name, m.from_user.username)
        await notify.notify_admins(
            m.bot, f"🔗 Заказ {no} (гость с сайта) привязан к Telegram: {who}.",
            map_client=(m.from_user.id, o["id"]))
        await m.answer(
            f"🔗 <b>Заказ {no} теперь и здесь.</b>\n\n"
            "Статусы, переписка и файлы — в этом чате и в кабинете на сайте, "
            "всё синхронно. Мастер уже занимается вашей заявкой. 🕊",
            reply_markup=kb.client_reply_kb())
        linked_here = True
    elif o["user_id"] == m.from_user.id:
        await m.answer(f"Заказ {no} уже привязан к вам — смотрите «📚 Мои заказы».",
                       reply_markup=kb.client_reply_kb())
        linked_here = True
    else:
        await m.answer(texts.WELCOME_BACK, reply_markup=kb.client_reply_kb())
    if linked_here:
        await notify.order_snapshot(
            m.bot, o["id"],
            "Ниже — актуальное состояние дела. Все новые сообщения и файлы "
            "будут приходить сюда и одновременно появляться на сайте.")


async def _handle_lead_link(m: Message, args: str) -> None:
    try:
        lead_id = int(args.removeprefix("lead_"))
    except ValueError:
        await m.answer(texts.WELCOME, reply_markup=kb.main_menu(False))
        return
    lead = await db.lead_get(lead_id)
    if lead:
        await db.lead_link(lead_id, m.from_user.id)
        await notify.notify_admins(
            m.bot,
            f"🔗 Заявка с сайта #{lead_id} привязана к Telegram: "
            f"{texts.user_link(m.from_user.id, m.from_user.first_name, m.from_user.username)}. "
            f"Теперь клиенту можно отвечать реплаем.",
            map_client=(m.from_user.id, None),
        )
        await m.answer(texts.LEAD_LINKED, reply_markup=kb.client_reply_kb())
    else:
        await m.answer(texts.WELCOME, reply_markup=kb.client_reply_kb())


async def _handle_site_deeplink(m: Message, args: str, is_new_user: bool) -> None:
    """Пейлоады сайта: web · web_<svc> · web_<type>_<disc>_<term>_<tier> (короткие коды)."""
    parts = args.split("_")[1:]  # без 'web'
    greet = texts.WELCOME if is_new_user else texts.WELCOME_BACK
    bonus = ("\n\n" + texts.FIRST_BONUS) if is_new_user else ""
    await m.answer(greet + bonus, reply_markup=kb.client_reply_kb())

    # услуга: web_ai / web_rv / web_tu / web_nm
    if len(parts) == 1 and parts[0] in config.SVC_BY_CODE:
        svc = config.SVC_BY_CODE[parts[0]]
        await m.answer(
            f"🛠 <b>{esc(svc.label)}</b> — от {config.fmt_money(svc.from_price)} ₽{svc.unit}\n"
            f"{esc(svc.desc)}{texts.SITE_SVC_FOOT}",
            reply_markup=kb.svc_offer(svc.id),
        )
        return

    # полная смета: web_dp_h_f_b
    if (
        len(parts) >= 4
        and parts[0] in config.TYPE_BY_CODE
        and parts[1] in config.DISC_BY_CODE
        and parts[2] in config.TERM_BY_CODE
        and parts[3] in config.TIER_BY_CODE
    ):
        t = config.TYPE_BY_CODE[parts[0]]
        d = config.DISC_BY_CODE[parts[1]]
        s = config.TERM_BY_CODE[parts[2]]
        v = config.TIER_BY_CODE[parts[3]]
        q = config.quote(t.id, d[0], s[0], v[0])
        payload = f"{t.code}_{d[1]}_{s[1]}_{v[1]}"
        await m.answer(
            f"{texts.SITE_QUOTE_HEAD}"
            f"{t.emoji} <b>{esc(t.label)}</b>\n"
            f"🎓 {d[2]}\n⏳ {s[2]}\n🎯 Результат «{v[2]}» — {v[4]}\n\n"
            f"💰 Ориентир: <b>{config.fmt_money(q[0])} – {config.fmt_money(q[1])} ₽</b>"
            f"{texts.SITE_QUOTE_FOOT}",
            reply_markup=kb.site_quote(payload),
        )
        return

    # голый web — меню
    has_orders = bool(await db.orders_by_user(m.from_user.id, limit=1))
    await m.answer(texts.MENU_HINT, reply_markup=kb.main_menu(has_orders))


# --------------------------------------------------------------- меню/инфо

@router.message(Command("menu"))
async def cmd_menu(m: Message, state: FSMContext) -> None:
    await state.clear()
    has_orders = bool(await db.orders_by_user(m.from_user.id, limit=1))
    await m.answer(texts.MENU_HINT, reply_markup=kb.main_menu(has_orders))


@router.message(Command("help"))
async def cmd_help(m: Message) -> None:
    await m.answer(texts.HELP_CLIENT, reply_markup=kb.back_menu())


@router.message(Command("support"))
async def cmd_support(m: Message) -> None:
    await m.answer(texts.CONTACTS, reply_markup=kb.back_menu())


@router.message(Command("delete_me"))
async def cmd_delete_me(m: Message) -> None:
    """Право на отзыв согласия (consent.html §9): удаление профиля по 152-ФЗ."""
    from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup
    await m.answer(
        "Вы просите удалить ваши данные. Мы удалим профиль, сессии сайта и обезличим "
        "ваши заказы (переписка потеряет привязку к вам). Действие необратимо.\n\n"
        "<b>Подтверждаете?</b>",
        reply_markup=InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton(text="🗑 Да, удалить мои данные", callback_data="cl:delme")],
            [InlineKeyboardButton(text="⬅️ Отмена", callback_data="cl:menu")],
        ]))


@router.callback_query(F.data == "cl:delme")
async def cb_delete_me(cb: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    uid = cb.from_user.id
    who = texts.user_link(uid, cb.from_user.first_name, cb.from_user.username)
    await db.forget_user(uid)
    await cb.message.edit_text(
        "Готово. Профиль удалён, заказы обезличены, доступ с сайта отключён.\n"
        "Если вернётесь — просто напишите /start, начнём с чистого листа. 🕊")
    await cb.answer("Данные удалены")
    await notify.notify_admins(cb.bot, f"🗑 {who} воспользовался правом на удаление данных (/delete_me).")


@router.callback_query(F.data == "cl:hide")
async def cb_hide(cb: CallbackQuery) -> None:
    """«Не сейчас» у мягких предложений: сообщение просто исчезает."""
    try:
        await cb.message.delete()
    except Exception:  # noqa: BLE001 — старое сообщение может быть неудаляемым
        try:
            await cb.message.edit_reply_markup(reply_markup=None)
        except Exception:  # noqa: BLE001
            pass
    await cb.answer("Хорошо, не будем напоминать 🕊")


@router.callback_query(F.data == "cl:menu")
async def cb_menu(cb: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    has_orders = bool(await db.orders_by_user(cb.from_user.id, limit=1))
    await cb.message.edit_text(texts.MENU_HINT, reply_markup=kb.main_menu(has_orders))
    await cb.answer()


@router.callback_query(F.data == "cl:how")
async def cb_how(cb: CallbackQuery) -> None:
    await cb.message.edit_text(texts.HOW_WE_WORK, reply_markup=kb.back_menu())
    await cb.answer()


@router.callback_query(F.data == "cl:guar")
async def cb_guar(cb: CallbackQuery) -> None:
    await cb.message.edit_text(texts.GUARANTEES, reply_markup=kb.back_menu())
    await cb.answer()


@router.callback_query(F.data == "cl:contacts")
async def cb_contacts(cb: CallbackQuery) -> None:
    await cb.message.edit_text(texts.CONTACTS, reply_markup=kb.back_menu())
    await cb.answer()


# ------------------------------------------------------------------ вопрос

@router.callback_query(F.data == "cl:ask")
async def cb_ask(cb: CallbackQuery, state: FSMContext) -> None:
    await state.set_state(Ask.waiting)
    await cb.message.answer(texts.ASK_QUESTION)
    await cb.answer()


@router.message(Command("ask"))
async def cmd_ask(m: Message, state: FSMContext) -> None:
    await state.set_state(Ask.waiting)
    await m.answer(texts.ASK_QUESTION)


@router.message(Ask.waiting)
async def got_question(m: Message, state: FSMContext) -> None:
    await state.clear()
    who = texts.user_link(m.from_user.id, m.from_user.first_name, m.from_user.username)
    await notify.relay_to_admins(
        m.bot, m, texts.NEW_QUESTION_ALERT.format(who=who), m.from_user.id, None
    )
    await m.answer(texts.QUESTION_SENT)


@router.message(Ask.chatting)
async def got_order_message(m: Message, state: FSMContext) -> None:
    data = await state.get_data()
    order_id = data.get("chat_order_id")
    await state.clear()
    await _relay_client_message(m, order_id)


# --------------------------------------------- свободные сообщения клиента

@router.message(F.chat.type == "private")
async def free_message(m: Message) -> None:
    """Любое сообщение вне сценариев: маршрутизируем мастеру с контекстом заказа."""
    if m.text and m.text.startswith("/"):
        has_orders = bool(await db.orders_by_user(m.from_user.id, limit=1))
        await m.answer("Не узнаю такую команду. Вот меню:", reply_markup=kb.main_menu(has_orders))
        return
    active = await db.active_orders_by_user(m.from_user.id)
    order_id = active[0]["id"] if active else None
    await _relay_client_message(m, order_id)


async def _relay_client_message(m: Message, order_id: int | None) -> None:
    from ..services import group as grp
    who = texts.user_link(m.from_user.id, m.from_user.first_name, m.from_user.username)
    if order_id:
        # всё по заказу — в его ветку в рабочей группе (текст, файлы, голосовые);
        # личка админа — только фолбэк, чтобы ничего не потерялось
        header = f"💬 <b>Заказ {config.order_no(order_id)}</b> · {who}:"
        await db.add_event(order_id, "client_msg", (m.text or m.caption or m.content_type)[:200])
        g = await grp.relay_copy(m.bot, order_id, m, header)
        # файл в контексте заказа сохраняем в картотеку
        doc = m.document
        if doc:
            await db.add_file(order_id, "client", doc.file_id, doc.file_unique_id,
                              doc.file_name, doc.file_size, "document")
        elif m.photo:
            ph = m.photo[-1]
            await db.add_file(order_id, "client", ph.file_id, ph.file_unique_id,
                              None, ph.file_size, "photo")
        elif m.voice:
            await db.add_file(order_id, "client", m.voice.file_id, m.voice.file_unique_id,
                              "голосовое.ogg", m.voice.file_size, "voice")
        # единая лента переписки: видна и в кабинете на сайте
        await db.msg_add(order_id, "client", m.text or m.caption,
                         kind="text" if m.text else str(m.content_type),
                         file_name=doc.file_name if doc else None,
                         tg_file_id=doc.file_id if doc else
                         (m.photo[-1].file_id if m.photo else
                          (m.voice.file_id if m.voice else None)))
        confirm = texts.MSG_RELAYED.format(no=config.order_no(order_id))
        if await notify.dm_wanted(bool(g)):
            await notify.relay_to_admins(m.bot, m, header, m.from_user.id, order_id)
    else:
        header = texts.NEW_QUESTION_ALERT.format(who=who)
        confirm = texts.MSG_RELAYED_NO_ORDER
        await notify.relay_to_admins(m.bot, m, header, m.from_user.id, order_id)
    await m.answer(confirm)
