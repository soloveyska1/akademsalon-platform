"""Доставка: карточки заказов админам, релей сообщений клиент↔мастер, уведомления."""
from __future__ import annotations

import logging

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramForbiddenError
from aiogram.types import Message

from .. import config, db, keyboards as kb, texts
from ..texts import esc, user_link

log = logging.getLogger(__name__)

# типы контента, у которых при copy_message можно переопределить подпись
_CAPTIONABLE = {"document", "photo", "video", "audio", "voice", "animation"}


async def dm_wanted(group_sent: bool) -> bool:
    """Дублировать ли алерт в личку админам. Группа не получила — всегда да;
    получила — только в режиме admin_dm=all (по умолчанию «quiet», /dm в боте)."""
    if not group_sent:
        return True
    return (await db.setting_get("admin_dm", "quiet")) == "all"


async def send_admin_card(bot: Bot, order_id: int, alert: str | None = None,
                          group_sent: bool = False) -> int | None:
    """Карточка заказа каждому админу (+map для reply-роутинга).

    Возвращает число доставленных личек; None — доставка в личку не
    требовалась (группа уже получила, режим quiet). 0 — требовалась,
    но не дошла ни одному админу (вызывающий может поставить ретрай).
    """
    if not await dm_wanted(group_sent):
        return None
    o = await db.get_order(order_id)
    if not o:
        return None
    client = await db.get_user(o["user_id"]) if o["user_id"] else None
    files = await db.files_for_order(order_id)
    items = await db.items_for_order(order_id)
    events = await db.events_for_order(order_id)
    extra = await texts.order_intel(o)
    from .gift import order_gift_info  # локальный импорт против циклов
    gift = await order_gift_info(o)
    prefix = (alert + "\n\n") if alert else ""
    card = texts.admin_order_card(o, client, files, events, gift=gift)
    bundle = texts.admin_order_items(items, 3900 - len(prefix) - len(card) - len(extra))
    text = prefix + card + bundle + extra
    sent = 0
    for admin_id in config.ADMIN_IDS:
        try:
            msg = await bot.send_message(admin_id, text, reply_markup=kb.admin_order(o))
            sent += 1
            if o["user_id"]:
                await db.map_put(admin_id, msg.message_id, o["user_id"], order_id)
        except TelegramAPIError as e:
            log.warning("admin card %s -> %s failed: %s", order_id, admin_id, e)
    return sent


async def refresh_admin_card(bot: Bot, cb_message: Message, order_id: int) -> None:
    """Перерисовать карточку на месте (после смены статуса/цены/заметки)."""
    o = await db.get_order(order_id)
    if not o:
        return
    client = await db.get_user(o["user_id"]) if o["user_id"] else None
    files = await db.files_for_order(order_id)
    events = await db.events_for_order(order_id)
    items = await db.items_for_order(order_id)
    from .gift import order_gift_info  # локальный импорт против циклов
    gift = await order_gift_info(o)
    try:
        card = texts.admin_order_card(o, client, files, events, gift=gift)
        await cb_message.edit_text(card + texts.admin_order_items(items, 3900 - len(card)),
                                   reply_markup=kb.admin_order(o))
    except TelegramAPIError:
        pass  # "message is not modified" и т.п. — не критично


async def notify_admins(bot: Bot, text: str, reply_markup=None,
                        map_client: tuple[int, int | None] | None = None,
                        group_sent: bool = False) -> int | None:
    """Простое уведомление всем админам; map_client=(client_id, order_id) для reply-роутинга.
    group_sent=True — группа уже получила этот алерт, в тихом режиме личку не трогаем.

    Возвращает число доставленных личек (None — личка не требовалась):
    фоновые отправители по «0» ставят ретрай."""
    if not await dm_wanted(group_sent):
        return None
    sent = 0
    for admin_id in config.ADMIN_IDS:
        try:
            msg = await bot.send_message(admin_id, text, reply_markup=reply_markup)
            sent += 1
            if map_client:
                await db.map_put(admin_id, msg.message_id, map_client[0], map_client[1])
        except TelegramAPIError as e:
            log.warning("notify admin %s failed: %s", admin_id, e)
    return sent


async def relay_to_admins(bot: Bot, m: Message, header: str,
                          client_id: int, order_id: int | None) -> None:
    """Сообщение клиента → всем админам, с шапкой и записью в msg_map."""
    for admin_id in config.ADMIN_IDS:
        try:
            ids = await _send_with_header(bot, admin_id, m, header)
            for mid in ids:
                await db.map_put(admin_id, mid, client_id, order_id)
        except TelegramAPIError as e:
            log.warning("relay to admin %s failed: %s", admin_id, e)


async def relay_to_client(bot: Bot, client_id: int, m: Message, header: str) -> bool:
    """Сообщение админа → клиенту в Telegram.

    False — у клиента нет Telegram (почтовый аккаунт сайта, id < 0): это не
    ошибка, доставку берёт на себя картотека (кабинет + письмо) — вызывающий
    обязан положить сообщение туда в любом случае. Настоящие проблемы
    Telegram (клиент заблокировал бота и т.п.) — по-прежнему исключением.
    """
    if not client_id or client_id <= 0:
        return False
    await _send_with_header(bot, client_id, m, header)
    return True


async def _send_with_header(bot: Bot, chat_id: int, m: Message, header: str) -> list[int]:
    """Текст — одним сообщением с шапкой; медиа — copy с подписью-шапкой."""
    sent_ids: list[int] = []
    if m.text is not None:
        body = f"{header}\n{esc(m.text)}"
        for chunk in _chunks(body, 4000):
            msg = await bot.send_message(chat_id, chunk)
            sent_ids.append(msg.message_id)
    elif m.content_type in _CAPTIONABLE:
        caption = header + (f"\n{esc(m.caption)}" if m.caption else "")
        msg = await bot.copy_message(chat_id, m.chat.id, m.message_id, caption=caption[:1024])
        sent_ids.append(msg.message_id)
    else:  # video_note, sticker, contact, location…
        head = await bot.send_message(chat_id, header)
        sent_ids.append(head.message_id)
        msg = await bot.copy_message(chat_id, m.chat.id, m.message_id)
        sent_ids.append(msg.message_id)
    return sent_ids


def _chunks(s: str, n: int) -> list[str]:
    return [s[i:i + n] for i in range(0, len(s), n)] or [s]


async def order_link(order_id: int) -> str | None:
    """Прямая ссылка «в то самое место»: дело в кабинете сайта.

    Работает без входа — токен гостевого доступа выдаётся лениво."""
    token = await db.ensure_access_token(order_id)
    if not token:
        return None
    return f"{config.SITE_URL}/dashboard.html#claim={token}"


async def bot_claim_link(order_id: int) -> str | None:
    """Один клик: запустить бота и привязать к нему уже существующее дело."""
    token = await db.ensure_access_token(order_id)
    if not token:
        return None
    return f"https://t.me/{config.BOT_USERNAME}?start=claim_{token}"


async def notify_client(bot: Bot, client_id: int, text: str, reply_markup=None,
                        order_id: int | None = None) -> bool:
    if not client_id or client_id <= 0:
        return False  # почтовый аккаунт сайта (id < 0) — Telegram ему недоступен
    try:
        m = await bot.send_message(client_id, text, reply_markup=reply_markup)
        # Запоминаем id: без него ошибочное уведомление невозможно отозвать —
        # Telegram удаляет сообщение только по номеру (инцидент 21.07.2026).
        try:
            from .. import db as _db
            await _db.map_put(client_id, m.message_id, client_id, order_id)
        except Exception:  # noqa: BLE001
            log.debug("msg_map: не записал id клиентского уведомления", exc_info=True)
        return True
    except TelegramForbiddenError:
        log.warning("client %s blocked the bot", client_id)
        return False
    except TelegramAPIError as e:
        log.warning("notify client %s failed: %s", client_id, e)
        return False


async def order_snapshot(bot: Bot, order_id: int, intro: str = "") -> dict:
    """Прислать клиенту актуальную карточку дела в Telegram.

    Используется после claim-ссылки и по явной кнопке мастера. Ничего не
    меняет в заказе: это безопасная повторная синхронизация текущего состояния.
    """
    o = await db.get_order(order_id)
    if not o:
        return {"ok": False, "error": "not_found"}
    if not o["user_id"] or o["user_id"] <= 0:
        return {"ok": False, "error": "telegram_not_linked",
                "bot_link": await bot_claim_link(order_id),
                "cabinet_link": await order_link(order_id)}
    from . import bonus, payments  # локально против циклов импорта
    files = await db.files_for_order(order_id)
    items = await db.items_for_order(order_id)
    pays = await db.payments_for_order(order_id)
    kind, due = payments.due_now(o, pays)
    claimed = any(p["status"] == "claimed" for p in pays)
    has_review = bool(await db.review_for_order(order_id))
    markup = kb.client_order(
        o, len(files), await bonus.balance(o["user_id"]), has_review,
        due, claimed, due_label=payments.stage_label(o, kind))
    markup = kb.with_cab_url(markup, await order_link(order_id),
                             "🌐 Открыть дело на сайте")
    body = ((intro.strip() + "\n\n") if intro.strip() else "") + \
        texts.client_order_card(o, len(files), items)
    delivered = await notify_client(bot, o["user_id"], body,
                                    reply_markup=markup, order_id=order_id)
    if delivered:
        # Поздно привязанный клиент получает не только карточку, но и уже
        # опубликованный пакет. Ledger в handoff не даст прислать файлы повторно.
        from . import handoff
        if o["handoff_phase"] in ("preview_published", "accepted_wait_pay",
                                  "releasing", "released"):
            await handoff.sync_telegram(bot, order_id)
        await db.add_event(order_id, "tg_snapshot_sent", "актуальная карточка дела")
        return {"ok": True, "delivered_tg": True}
    return {"ok": False, "error": "telegram_unavailable",
            "bot_link": await bot_claim_link(order_id),
            "cabinet_link": await order_link(order_id)}
async def status_changed(bot: Bot, order_id: int, actor: str = "admin") -> None:
    """Уведомить клиента о смене статуса — с кнопками действий, а не голым текстом.

    Telegram + почта (гостю или email-аккаунту); кабинет сайта подхватит
    изменение поллингом сам.
    """
    o = await db.get_order(order_id)
    if not o:
        return
    from . import mailer  # локальный импорт против цикла notify↔mailer
    await mailer.order_event(o, "status")
    if not o["user_id"] or o["user_id"] <= 0:
        return
    no = config.order_no(order_id)
    s = o["status"]
    if s == "work":
        await notify_client(bot, o["user_id"], texts.WORK_STARTED.format(no=no))
    elif s == "done":
        await notify_client(bot, o["user_id"], texts.ORDER_DONE.format(no=no),
                            reply_markup=kb.review_invite_kb(order_id))
    elif s == "check":
        total = o["stages_total"] or 1
        st = config.ST[s]
        markup = kb.with_cab_url(kb.delivered_kb(order_id, o["stage"] or 1, total),
                                 await order_link(order_id),
                                 "📄 Файлы и отчёты — в кабинете")
        await notify_client(bot, o["user_id"],
                            texts.STATUS_CHANGED.format(emoji=st.emoji, no=no, label=st.client_label),
                            reply_markup=markup)
    elif s == "priced" and o["price"]:
        # цена уже назначена: статусное уведомление должно нести само предложение
        from . import payments as pay_svc  # локальный импорт против цикла payments↔notify
        markup = kb.with_cab_url(kb.price_offer(order_id), await order_link(order_id),
                                 "🧾 Смета целиком — в кабинете")
        await notify_client(
            bot, o["user_id"],
            texts.PRICE_OFFER.format(
                no=no, price=config.fmt_money(o["price"]), prepay_part="")
            + texts.plan_offer_block(pay_svc.stage_plan(o), config.fmt_money),
            reply_markup=markup)
    elif s == "prepay":
        from . import payments as pay_svc  # локальный импорт против цикла payments↔notify
        req = await db.setting_get("requisites")
        st = config.ST[s]
        body = texts.STATUS_CHANGED.format(emoji=st.emoji, no=no, label=st.client_label)
        if req:
            body += f"\n\n💳 <b>Реквизиты:</b>\n{texts.esc(req)}"
        kind, amount = await pay_svc.stage_amount(o)
        markup = kb.prepay_kb(order_id)
        if amount > 0:
            markup = kb.with_pay_url(
                markup, await pay_svc.online_link_for_order(o, kind, amount), amount)
        markup = kb.with_cab_url(markup, await order_link(order_id),
                                 "💼 План оплат — в кабинете")
        await notify_client(bot, o["user_id"], body, reply_markup=markup)
    else:
        st = config.ST[s]
        await notify_client(bot, o["user_id"],
                            texts.STATUS_CHANGED.format(emoji=st.emoji, no=no, label=st.client_label))
