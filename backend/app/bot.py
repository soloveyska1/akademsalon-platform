"""Точка входа: python -m app.bot

Один процесс: polling Telegram + HTTP-API для сайта + фоновый планировщик.
"""
from __future__ import annotations

import asyncio
import logging
import time

from aiogram import BaseMiddleware, Bot, Dispatcher, F
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.enums import ParseMode
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (BotCommand, BotCommandScopeChat, BotCommandScopeDefault,
                           CallbackQuery, MenuButtonCommands, Message)

from . import config, db, texts, webapp
from .handlers import (admin, buttons, channel_feed, client, group, my_orders,
                       order_wizard, subs)
from .services import scheduler

log = logging.getLogger("salon")


class UserMiddleware(BaseMiddleware):
    """Регистрируем/обновляем пользователя на каждом апдейте."""

    async def __call__(self, handler, event, data):
        u = getattr(event, "from_user", None)
        if u and not u.is_bot:
            data["is_new_user"] = await db.is_new_user(u.id)
            await db.upsert_user(u)
        return await handler(event, data)


class MaintenanceMiddleware(BaseMiddleware):
    """Антракт: на техработах клиентам — вежливая вывеска, мастеру — всё как обычно.

    Включается рубильником в веб-админке (settings.bot_maint = '1').
    Значение кешируется на 10 секунд, чтобы не дёргать SQLite каждым апдейтом.
    """

    _cache = {"v": "0", "t": 0.0}

    async def _closed(self) -> bool:
        now = time.monotonic()
        if now - self._cache["t"] > 10:
            self._cache["v"] = (await db.setting_get("bot_maint")) or "0"
            self._cache["t"] = now
        return self._cache["v"] == "1"

    async def __call__(self, handler, event, data):
        u = getattr(event, "from_user", None)
        if not u or u.id in config.ADMIN_IDS or not await self._closed():
            return await handler(event, data)
        try:
            if isinstance(event, CallbackQuery):
                await event.answer("⚙️ Короткий антракт: технические работы. "
                                   "Вернёмся через считанные минуты.", show_alert=True)
            elif isinstance(event, Message):
                await event.answer(
                    "⚙️ <b>Короткий антракт</b>\n\n"
                    "В мастерской технические работы — вернёмся через считанные минуты, "
                    "загляните чуть позже.\n\n"
                    "Действующие заказы и заявки в полной сохранности.")
        except Exception:  # noqa: BLE001
            pass
        return None


CLIENT_COMMANDS = [
    BotCommand(command="start", description="Главное меню"),
    BotCommand(command="myorders", description="Мои заказы"),
    BotCommand(command="plus", description="Подписка Салон+ и куратор сессии"),
    BotCommand(command="bonus", description="Мои бонусы и приглашения"),
    BotCommand(command="ask", description="Задать вопрос"),
    BotCommand(command="support", description="Контакты мастерской"),
    BotCommand(command="startnews", description="Подписаться на новости и акции"),
    BotCommand(command="stopnews", description="Отписаться от новостей и акций"),
    BotCommand(command="delete_me", description="Удалить профиль и отозвать согласие"),
    BotCommand(command="help", description="Что умеет бот"),
]
ADMIN_COMMANDS = [
    BotCommand(command="panel", description="Кабинет мастера на сайте — вход одной ссылкой"),
    BotCommand(command="orders", description="Активные заказы"),
    BotCommand(command="all", description="Последние 20 заказов"),
    BotCommand(command="find", description="Поиск по заказам"),
    BotCommand(command="stats", description="Статистика"),
    BotCommand(command="requisites", description="Реквизиты оплаты"),
    BotCommand(command="client", description="Режим клиента (тест)"),
    BotCommand(command="admin", description="Вернуться в админ-режим"),
]

SHORT_DESC = (
    "Консультации, аудит и редактура материалов клиента; "
    "авторские заказы вне аттестации. Заказы, файлы и статусы."
)
FULL_DESC = (
    "Академический Салон — консультации, аудит, редактура и оформление "
    "материалов клиента, подготовка к выступлению и авторские заказы вне "
    "учебной или научной аттестации.\n\n"
    "🧾 Состав, сроки, цена и условия — в спецификации\n"
    "📁 Статусы, сообщения и файлы — в одном деле\n"
    "💬 Мастер на связи по вашему заказу\n\n"
    "Бот показывает согласованные этапы и хранит документы заказа."
)


async def setup_profile(bot: Bot) -> None:
    """Идемпотентная настройка профиля бота (выполняется при смене PROFILE_REV)."""
    if await db.setting_get("profile_rev") == config.PROFILE_REV:
        return
    await bot.set_my_commands(CLIENT_COMMANDS, scope=BotCommandScopeDefault())
    for admin_id in config.ADMIN_IDS:
        try:
            await bot.set_my_commands(ADMIN_COMMANDS + CLIENT_COMMANDS,
                                      scope=BotCommandScopeChat(chat_id=admin_id))
        except Exception as e:  # noqa: BLE001 — админ мог не нажать /start
            log.warning("admin commands for %s: %s", admin_id, e)
    # сбрасываем меню-кнопку (у старого бота там висел WebApp)
    await bot.set_chat_menu_button(menu_button=MenuButtonCommands())
    try:
        await bot.set_my_short_description(short_description=SHORT_DESC[:120])
        await bot.set_my_description(description=FULL_DESC[:512])
    except Exception as e:  # noqa: BLE001 — лимиты BotFather не критичны
        log.warning("set descriptions: %s", e)
    await db.setting_set("profile_rev", config.PROFILE_REV)
    log.info("bot profile updated to rev %s", config.PROFILE_REV)


async def first_run_hello(bot: Bot) -> None:
    if await db.setting_get("v2_hello"):
        return
    for admin_id in config.ADMIN_IDS:
        try:
            await bot.send_message(admin_id, texts.ADMIN_HELLO)
        except Exception as e:  # noqa: BLE001
            log.warning("hello to %s failed: %s", admin_id, e)
    await db.setting_set("v2_hello", "1")


async def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if not config.BOT_TOKEN:
        raise SystemExit("BOT_TOKEN не задан (env)")
    if not config.ADMIN_IDS:
        raise SystemExit("ADMIN_IDS не задан (env): запуск без мастера запрещён")

    await db.init(config.DB_PATH)
    # таймаут вызова Bot API: дефолтные 60с при перебоях связности РФ→Telegram
    # превращали каждую отправку в минуту ожидания (заявка №177 — три подряд).
    # 30с хватает и на выгрузку файла 20МБ; polling не страдает — aiogram
    # прибавляет polling_timeout к таймауту сессии (dispatcher, request_timeout).
    bot = Bot(config.BOT_TOKEN,
              session=AiohttpSession(timeout=30),
              default=DefaultBotProperties(parse_mode=ParseMode.HTML,
                                           link_preview_is_disabled=True))
    dp = Dispatcher(storage=MemoryStorage())
    dp.message.outer_middleware(UserMiddleware())
    dp.callback_query.outer_middleware(UserMiddleware())
    maint = MaintenanceMiddleware()
    dp.message.outer_middleware(maint)
    dp.callback_query.outer_middleware(maint)
    # групповой роутер ловит рабочую группу заказов; остальные — только личку
    for r in (admin.router, admin.core, buttons.router, order_wizard.router,
              my_orders.router, subs.router, client.router):
        r.message.filter(F.chat.type == "private")
    # subs.router — ДО client.router: у клиента есть catch-all свободных сообщений
    dp.include_routers(channel_feed.router, group.router, admin.router,
                       buttons.router, order_wizard.router, my_orders.router,
                       subs.router, client.router)

    @dp.errors()
    async def on_error(event) -> bool:
        exc = event.exception
        text = str(exc)
        # протухшие callback'и после рестарта и «not modified» — не событие
        if "query is too old" in text or "message is not modified" in text:
            return True
        log.exception("update handling error: %s", exc)
        return True

    # API сайта поднимаем ПЕРВЫМ: кабинет и приём заявок живут
    # даже при временной недоступности api.telegram.org
    runner = await webapp.start(bot)
    sched = asyncio.create_task(scheduler.run(bot))

    # телеграмный «прогрев» — с ретраями, сетевой сбой не роняет процесс
    for attempt in range(1, 31):
        try:
            await bot.delete_webhook(drop_pending_updates=False)
            await setup_profile(bot)
            await first_run_hello(bot)
            me = await bot.get_me()
            log.info(
                "polling as @%s (id %s), admin accounts: %s",
                me.username,
                me.id,
                len(config.ADMIN_IDS),
            )
            break
        except Exception as e:  # noqa: BLE001
            log.warning("telegram warmup attempt %s failed: %s", attempt, e)
            await asyncio.sleep(min(30, 3 * attempt))

    try:
        await dp.start_polling(bot, allowed_updates=[
            "message", "callback_query",
            # витрина канала на главной: посты и правки из @akademsalon
            "channel_post", "edited_channel_post"])
    finally:
        sched.cancel()
        await runner.cleanup()
        await db.close()
        log.info("stopped")


if __name__ == "__main__":
    asyncio.run(main())
