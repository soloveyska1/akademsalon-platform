"""Рабочая группа заказов в Telegram: каждый заказ — отдельная тема (форум-топик).

Владелец добавил бота администратором в группу. Если в группе включены
«Темы», на каждый заказ создаётся топик: внутри — карточка с кнопками,
переписка и файлы; ответ в топике уходит клиенту. Если темы ещё не
включены — бот шлёт заказы в общую ленту группы с меткой #заказNNN и
одноразовой подсказкой, как включить темы (ничего не теряется).

Актуальный chat_id хранится в settings (group_chat_id): при включении тем
Telegram превращает группу в супергруппу и меняет id — бот ловит миграцию.
"""
from __future__ import annotations

import asyncio
import logging
import time

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest, TelegramMigrateToChat

from .. import config, db, keyboards as kb, texts

log = logging.getLogger(__name__)

# создание веток сериализуем: фоновые уведомления (карточка заявки и файл
# клиента) могут прибежать одновременно — без замка́ получилось бы два топика
_topic_lock = asyncio.Lock()

# бэкофф проб создания веток: при недоступном форуме не дёргаем API
# на каждое сообщение, но раз в 10 минут пробуем снова (самонастройка
# после переключения владельцем вида тем на «Список»)
_probe_at = 0.0
PROBE_EVERY = 600.0

_STATUS_ICON = {  # цвет иконки топика по статусу (палитра Telegram)
    "new": 0x6FB9F0, "priced": 0xFFD67E, "prepay": 0xFFD67E,
    "work": 0x8EEE98, "check": 0xCB86DB, "fix": 0xFF93B2,
    "done": 0x8EEE98, "cancel": 0xFB6F5F,
}


async def chat_id() -> int:
    v = await db.setting_get("group_chat_id")
    return int(v) if v else config.GROUP_CHAT_ID


async def _set_chat_id(new_id: int) -> None:
    await db.setting_set("group_chat_id", str(new_id))
    log.info("group migrated to %s", new_id)


def _topic_name(o, client) -> str:
    st = config.ST[o["status"]]
    if o["user_id"]:
        who = (client["first_name"] if client else None) or "клиент"
    else:
        who = o["guest_name"] or "гость с сайта"
    name = f"{st.emoji} №{o['id']} · {o['work_label'] or 'заказ'} · {who}"
    return name[:126]


async def _forum_ok(bot: Bot) -> bool:
    """Доступны ли боту классические темы (форум)?

    getChat.is_forum — быстрый положительный сигнал, но его отсутствие не
    приговор: новые режимы «Тем» Telegram (вкладки/теги, 2025) этого флага
    не дают, а классический форум может включиться позже. Поэтому ответ «нет»
    не кэшируем навсегда — ensure_topic пробует создать ветку по-настоящему
    и по результату уточняет кэш.
    """
    cached = await db.setting_get("group_forum")
    if cached == "1":
        return True
    try:
        chat = await bot.get_chat(await chat_id())
    except TelegramMigrateToChat as e:
        await _set_chat_id(e.migrate_to_chat_id)
        try:
            chat = await bot.get_chat(e.migrate_to_chat_id)
        except TelegramAPIError:
            return False
    except TelegramAPIError as e:
        log.warning("group get_chat failed: %s", e)
        return False
    if bool(getattr(chat, "is_forum", False)):
        await db.setting_set("group_forum", "1")
        return True
    # не форум по getChat — но у бота могут быть права на темы: пробуем делом
    return bool(getattr(chat, "permissions", None) and
                getattr(chat.permissions, "can_manage_topics", False))


async def _hint_enable_topics(bot: Bot, rev: str = "2") -> None:
    """Одноразовая подсказка владельцу, как включить классические темы."""
    if await db.setting_get("group_topics_hint") == rev:
        return
    await db.setting_set("group_topics_hint", rev)
    text = (
        "⚙️ <b>Про ветки заказов.</b> Ботам Telegram доступны только "
        "«классические» темы (вид «Список»). Сейчас в группе выбран новый "
        "режим тем, который ботам пока закрыт, — поэтому я шлю заказы в общую "
        "ленту с метками #заказ. Ответ на карточку так же уходит клиенту, "
        "ничего не теряется.\n\n"
        "Хотите отдельные ветки? Профиль группы → «Изменить» → «Темы» → "
        "выберите вид <b>«Список»</b> (если Telegram предлагает «Вкладки» — "
        "переключите на «Список»). Затем пришлите сюда команду /threads — "
        "я заведу ветки по всем активным заказам."
    )
    try:
        await bot.send_message(await chat_id(), text)
    except TelegramAPIError:
        for admin_id in config.ADMIN_IDS:
            try:
                await bot.send_message(admin_id, text)
            except TelegramAPIError:
                pass


async def ensure_topic(bot: Bot, order_id: int) -> int | None:
    """Создать (или вернуть) ветку заказа. None — классические темы недоступны.

    Пробуем создание по-настоящему: успех фиксируем в кэше (group_forum=1),
    отказ «not a forum» — в кэше "0" с одноразовой подсказкой владельцу.
    Кэш "0" не вечный: /threads и смена режима тем его сбрасывают.
    """
    global _probe_at
    o = await db.get_order(order_id)
    if not o:
        return None
    if o["topic_id"]:
        return o["topic_id"]
    async with _topic_lock:
        return await _create_topic(bot, order_id)


async def _create_topic(bot: Bot, order_id: int) -> int | None:
    global _probe_at
    o = await db.get_order(order_id)  # перечитать: пока ждали замок, ветку могли создать
    if not o:
        return None
    if o["topic_id"]:
        return o["topic_id"]
    if await db.setting_get("group_forum") == "0":
        # форум недоступен: пробуем снова не чаще раза в PROBE_EVERY секунд
        if time.monotonic() - _probe_at < PROBE_EVERY:
            return None
        _probe_at = time.monotonic()
        if not await _forum_ok(bot):
            return None
    client = await db.get_user(o["user_id"]) if o["user_id"] else None
    try:
        topic = await bot.create_forum_topic(
            await chat_id(), name=_topic_name(o, client),
            icon_color=_STATUS_ICON.get(o["status"], 0x6FB9F0))
    except TelegramMigrateToChat as e:
        await _set_chat_id(e.migrate_to_chat_id)
        try:
            topic = await bot.create_forum_topic(
                e.migrate_to_chat_id, name=_topic_name(o, client),
                icon_color=_STATUS_ICON.get(o["status"], 0x6FB9F0))
        except TelegramAPIError as e2:
            log.warning("create topic after migrate failed: %s", e2)
            return None
    except TelegramBadRequest as e:
        # «chat is not a forum»: классические темы не включены (или включён
        # новый режим тем, недоступный ботам) — фолбэк в общую ленту
        await db.setting_set("group_forum", "0")
        log.warning("create topic failed: %s", e)
        await _hint_enable_topics(bot)
        return None
    except TelegramAPIError as e:
        log.warning("create topic failed: %s", e)
        return None
    await db.setting_set("group_forum", "1")
    await db.update_order(order_id, topic_id=topic.message_thread_id)
    return topic.message_thread_id


async def send(bot: Bot, order_id: int, text: str, reply_markup=None,
               map_client: bool = True):
    """Сообщение в ветку заказа (или в общую ленту группы — фолбэк)."""
    o = await db.get_order(order_id)
    if not o:
        return None
    thread = await ensure_topic(bot, order_id)
    gid = await chat_id()
    body = text if thread else f"#заказ{order_id}\n{text}"
    try:
        msg = await bot.send_message(gid, body, reply_markup=reply_markup,
                                     message_thread_id=thread)
    except TelegramMigrateToChat as e:
        await _set_chat_id(e.migrate_to_chat_id)
        try:
            msg = await bot.send_message(e.migrate_to_chat_id, body,
                                         reply_markup=reply_markup)
        except TelegramAPIError:
            return None
    except TelegramBadRequest as e:
        if "thread not found" in str(e).lower() and thread:
            # ветку удалили руками — пересоздаём
            await db.update_order(order_id, topic_id=None)
            await db.setting_set("group_forum", "1")
            return await send(bot, order_id, text, reply_markup, map_client)
        log.warning("group send failed: %s", e)
        return None
    except TelegramAPIError as e:
        log.warning("group send failed: %s", e)
        return None
    if map_client and o["user_id"]:
        await db.map_put(msg.chat.id, msg.message_id, o["user_id"], order_id)
    return msg


async def send_document(bot: Bot, order_id: int, file, caption: str = "",
                        reply_markup=None):
    """Документ в ветку заказа (BufferedInputFile или file_id). None — не вышло."""
    o = await db.get_order(order_id)
    if not o:
        return None
    thread = await ensure_topic(bot, order_id)
    gid = await chat_id()
    cap = caption if thread else f"#заказ{order_id}\n{caption}"
    try:
        msg = await bot.send_document(gid, file, caption=cap[:1024],
                                      message_thread_id=thread,
                                      reply_markup=reply_markup)
    except TelegramBadRequest as e:
        if "thread not found" in str(e).lower() and thread:
            await db.update_order(order_id, topic_id=None)
            return await send_document(bot, order_id, file, caption, reply_markup)
        log.warning("group send_document failed: %s", e)
        return None
    except TelegramAPIError as e:
        log.warning("group send_document failed: %s", e)
        return None
    if o["user_id"]:
        await db.map_put(msg.chat.id, msg.message_id, o["user_id"], order_id)
    return msg


async def relay_copy(bot: Bot, order_id: int, m, header: str, reply_markup=None):
    """Сообщение клиента (любой тип) → в ветку заказа: шапка + копия.

    Возвращает сообщение-копию или None (группа недоступна).
    """
    o = await db.get_order(order_id)
    if not o:
        return None
    thread = await ensure_topic(bot, order_id)
    gid = await chat_id()
    head = header if thread else f"#заказ{order_id}\n{header}"
    try:
        if m.text is not None:
            from ..texts import esc
            msg = await bot.send_message(gid, f"{head}\n{esc(m.text)}"[:4000],
                                         message_thread_id=thread,
                                         reply_markup=reply_markup)
        elif m.content_type in ("document", "photo", "video", "audio", "voice", "animation"):
            from ..texts import esc
            cap = head + (f"\n{esc(m.caption)}" if m.caption else "")
            msg = await bot.copy_message(gid, m.chat.id, m.message_id,
                                         caption=cap[:1024],
                                         message_thread_id=thread,
                                         reply_markup=reply_markup)
        else:  # video_note, sticker, contact…
            await bot.send_message(gid, head, message_thread_id=thread)
            msg = await bot.copy_message(gid, m.chat.id, m.message_id,
                                         message_thread_id=thread)
    except TelegramBadRequest as e:
        if "thread not found" in str(e).lower() and thread:
            await db.update_order(order_id, topic_id=None)
            return await relay_copy(bot, order_id, m, header, reply_markup)
        log.warning("group relay_copy failed: %s", e)
        return None
    except TelegramAPIError as e:
        log.warning("group relay_copy failed: %s", e)
        return None
    if o["user_id"]:
        # copy_message возвращает MessageId (без chat) — id чата берём свой
        await db.map_put(gid, msg.message_id, o["user_id"], order_id)
    return msg


async def send_card(bot: Bot, order_id: int, alert: str | None = None):
    """Полная карточка заказа с кнопками — в ветку заказа."""
    o = await db.get_order(order_id)
    if not o:
        return
    client = await db.get_user(o["user_id"]) if o["user_id"] else None
    files = await db.files_for_order(order_id)
    events = await db.events_for_order(order_id)
    items = await db.items_for_order(order_id)
    extra = await texts.order_intel(o)
    from .gift import order_gift_info  # локальный импорт против циклов
    gift = await order_gift_info(o)
    prefix = (alert + "\n\n") if alert else ""
    card = texts.admin_order_card(o, client, files, events, gift=gift)
    bundle = texts.admin_order_items(items, 3900 - len(prefix) - len(card) - len(extra))
    text = prefix + card + bundle + extra
    return await send(bot, order_id, text, reply_markup=kb.admin_order(o))


async def status_sync(bot: Bot, order_id: int) -> None:
    """Смена статуса: переименовать ветку, закрыть/открыть при финале."""
    o = await db.get_order(order_id)
    if not o or not o["topic_id"]:
        return
    gid = await chat_id()
    client = await db.get_user(o["user_id"]) if o["user_id"] else None
    try:
        await bot.edit_forum_topic(gid, o["topic_id"], name=_topic_name(o, client))
    except TelegramAPIError:
        pass
    try:
        if o["status"] in ("done", "cancel"):
            await bot.close_forum_topic(gid, o["topic_id"])
        else:
            await bot.reopen_forum_topic(gid, o["topic_id"])
    except TelegramAPIError:
        pass  # уже закрыт/открыт — не важно
