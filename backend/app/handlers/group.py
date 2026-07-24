"""Сообщения в рабочей группе заказов.

Правила простые (и написаны в закреплённой шпаргалке):
— пишете в ветке заказа обычный текст → он уходит клиенту;
— файл в ветке → передаётся клиенту как материал по заказу;
— сообщение, начинающееся с точки «.» — внутренняя заметка, клиент не видит;
— /card — карточка заказа с кнопками, /price 35000 [15000] — цена,
  /help — шпаргалка. Кнопки карточек работают как в личке.
"""
from __future__ import annotations

import logging
import re

from aiogram import F, Router
from aiogram.filters import Command, CommandObject
from aiogram.fsm.context import FSMContext
from aiogram.types import BufferedInputFile, CallbackQuery, Message, ReactionTypeEmoji

from .. import config, db, keyboards as kb, texts
from ..services import flow, group as grp, handoff, mailer, sanitize
from ..services import notify, payments

log = logging.getLogger(__name__)

router = Router(name="group")
router.message.filter(F.chat.type.in_({"group", "supergroup"}))
router.callback_query.filter(lambda c: bool(c.from_user) and c.from_user.id in config.ADMIN_IDS)

GROUP_HELP = (
    "📌 <b>Как работать в этой группе</b>\n\n"
    "Каждый заказ — отдельная ветка. Внутри ветки:\n"
    "• обычное сообщение → уходит клиенту (текст, файл, фото, голосовое);\n"
    "• сообщение с точкой в начале «.так» → внутренняя заметка, клиент не видит;\n"
    "• <b>файл с точкой в подписи</b> → остаётся у нас; бот предложит безопасную "
    "выдачу: сохранит оригинал, соберёт защищённую первую часть и сначала покажет "
    "её вам; клиент получит файл только после подтверждения;\n"
    "• /card — карточка заказа с кнопками (цена, статус, сдача работы);\n"
    "• /price 35000 — назначить цену (можно /price 35000 15000 — с предоплатой).\n\n"
    "Всё, что вы делаете здесь, синхронно с личкой бота, сайтом и админкой."
)


_PREVIEW_EXTS = (".pdf", ".docx", ".doc", ".odt", ".rtf")


def _preview_ok(filename: str | None) -> bool:
    return bool(filename) and filename.lower().endswith(_PREVIEW_EXTS)


async def _is_work_group(m: Message) -> bool:
    return m.chat.id == await grp.chat_id()


async def _order_for(m: Message):
    """Заказ по ветке (топику) сообщения."""
    if m.message_thread_id:
        o = await db.order_by_topic(m.message_thread_id)
        if o:
            return o
    # фолбэк без тем: реплай на сообщение бота с меткой #заказNNN
    if m.reply_to_message:
        row = await db.map_get(m.chat.id, m.reply_to_message.message_id)
        if row and row["order_id"]:
            return await db.get_order(row["order_id"])
        mtxt = m.reply_to_message.text or m.reply_to_message.caption or ""
        found = re.search(r"#заказ(\d+)", mtxt)
        if found:
            return await db.get_order(int(found.group(1)))
    return None


@router.message(Command("help"))
async def g_help(m: Message) -> None:
    if not await _is_work_group(m) or m.from_user.id not in config.ADMIN_IDS:
        return
    await m.answer(GROUP_HELP)


@router.message(Command("threads"))
async def g_threads(m: Message) -> None:
    """Создать ветки по всем активным заказам (после включения тем «Списком»)."""
    if not await _is_work_group(m) or m.from_user.id not in config.ADMIN_IDS:
        return
    # сбрасываем кэш «форум недоступен» и пробуем по-настоящему
    await db.setting_set("group_forum", "")
    grp._probe_at = 0.0
    orders = await db.active_orders(limit=50)
    if not orders:
        await m.reply("Активных заказов нет — новые заказы сами появятся ветками.")
        return
    made, failed = [], 0
    for o in orders:
        if o["topic_id"]:
            continue
        thread = await grp.ensure_topic(m.bot, o["id"])
        if thread:
            await grp.send_card(m.bot, o["id"],
                                alert="📌 Ветка заказа создана — всё по нему теперь здесь.")
            made.append(f"№{o['id']}")
        else:
            failed += 1
            break  # форум недоступен — дальше пробовать нет смысла
    if made:
        await m.reply("✅ Ветки созданы: " + ", ".join(made) +
                      ". Новые заказы будут появляться ветками автоматически.")
    elif failed:
        await m.reply(
            "Пока не получается: Telegram отвечает, что классические темы в группе "
            "не включены. Профиль группы → «Изменить» → «Темы» → вид <b>«Список»</b> "
            "(вариант «Вкладки» ботам недоступен). Потом снова пришлите /threads.")
    else:
        await m.reply("Все активные заказы уже с ветками. 🕊")


@router.message(Command("card"))
async def g_card(m: Message) -> None:
    if not await _is_work_group(m) or m.from_user.id not in config.ADMIN_IDS:
        return
    o = await _order_for(m)
    if not o:
        await m.reply("Не вижу, к какому заказу это относится. Откройте ветку заказа.")
        return
    await grp.send_card(m.bot, o["id"])


@router.message(Command("price"))
async def g_price(m: Message, command: CommandObject) -> None:
    if not await _is_work_group(m) or m.from_user.id not in config.ADMIN_IDS:
        return
    o = await _order_for(m)
    if not o:
        await m.reply("Откройте ветку заказа и повторите: /price 35000 (или /price 35000 15000).")
        return
    raw = (command.args or "").replace("к", "000").replace("k", "000")
    nums = [int(re.sub(r"\D", "", n)) for n in re.findall(r"\d[\d\s]*", raw)]
    if not nums or nums[0] <= 0:
        await m.reply("Формат: <code>/price 35000</code> или <code>/price 35000 15000</code>.")
        return
    # единая точка цены: статус, оферта клиенту, спецификация, синк группы
    res = await flow.set_price(m.bot, o["id"], nums[0],
                               nums[1] if len(nums) > 1 else None, via="группа, /price")
    if not res.get("ok"):
        await m.reply("Не получилось назначить цену — попробуйте ещё раз.")
        return
    if res.get("delivered_tg") is False:
        tail = "\n⚠️ В Telegram не доставилось — клиент увидит в кабинете сайта."
    elif res.get("delivered_tg") is None:
        tail = "\nКлиент без Telegram — предложение в его кабинете на сайте, а на почту (если она есть) уже ушло письмом."
    else:
        tail = ""
    ms = texts.money_summary_master(res.get("due") or {})
    await m.reply(f"💰 Цена {config.fmt_money(res['price'])} ₽ "
                  f"(первый платёж {config.fmt_money(res['prepay'])} ₽, частей: {res['stages']}) "
                  f"отправлена клиенту · заказ №{o['id']}." + tail
                  + (("\n" + ms) if ms else ""))


async def _price_from_reply(m: Message, o) -> bool:
    """Ответ числом на прайс-промпт бота: «35000», «35000/15000», «35000/15000/3»."""
    raw = (m.text or "").replace("к", "000").replace("k", "000")
    nums = [int(re.sub(r"\D", "", n)) for n in re.findall(r"\d[\d\s]*", raw)]
    if not nums or nums[0] <= 0:
        await m.reply("Не разобрал сумму. Ответьте числом: <code>35000</code> "
                      "или <code>35000/15000</code> (цена/первый платёж).")
        return True
    price = nums[0]
    prepay = nums[1] if len(nums) > 1 else None
    stages = nums[2] if len(nums) > 2 and nums[2] in (1, 2, 3) else None
    res = await flow.set_price(m.bot, o["id"], price, prepay, stages, via="группа")
    if not res.get("ok"):
        await m.reply("Не получилось назначить цену — попробуйте ещё раз.")
        return True
    tail = ""
    if res.get("delivered_tg") is False:
        tail = "\n⚠️ В Telegram не доставилось — клиент увидит в кабинете сайта."
    elif res.get("delivered_tg") is None:
        tail = "\nКлиент без Telegram — предложение в его кабинете на сайте, а на почту (если она есть) уже ушло письмом."
    ms = texts.money_summary_master(res.get("due") or {})
    await m.reply(f"💰 Цена {config.fmt_money(res['price'])} ₽ "
                  f"(первый платёж {config.fmt_money(res['prepay'])} ₽, "
                  f"частей: {res['stages']}) отправлена клиенту · заказ №{o['id']}." + tail
                  + (("\n" + ms) if ms else ""))
    return True


@router.callback_query(F.data.startswith("gp:set:"))
async def gp_set(cb: CallbackQuery) -> None:
    if cb.from_user.id not in config.ADMIN_IDS:
        await cb.answer("Цену назначает мастер", show_alert=True)
        return
    _, _, oid, amt = cb.data.split(":")
    o = await db.get_order(int(oid))
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    amount = int(amt)
    try:
        await cb.message.edit_text(
            f"💰 <b>{config.fmt_money(amount)} ₽</b> — итоговая цена для заказа "
            f"{config.order_no(int(oid))}.\n\n"
            "Проверьте сумму: после подтверждения предложение сразу увидит клиент.",
            reply_markup=kb.price_confirm_kb(int(oid), amount))
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("Осталось подтвердить сумму")


@router.callback_query(F.data.startswith("gp:back:"))
async def gp_back(cb: CallbackQuery) -> None:
    oid = int(cb.data.split(":")[2])
    o = await db.get_order(oid)
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    try:
        await cb.message.edit_text(
            f"💰 Цена для заказа {config.order_no(oid)}.\n"
            "Выберите ориентир или введите свою сумму сообщением.",
            reply_markup=kb.group_price_kb(o))
    except Exception:  # noqa: BLE001
        pass
    await cb.answer()


@router.callback_query(F.data.startswith("gp:confirm:"))
async def gp_confirm(cb: CallbackQuery, state: FSMContext) -> None:
    _, _, oid, amt = cb.data.split(":")
    res = await flow.set_price(cb.bot, int(oid), int(amt), via="кнопка с подтверждением")
    if not res.get("ok"):
        await cb.answer("Не получилось", show_alert=True)
        return
    await state.clear()
    ms = texts.money_summary_master(res.get("due") or {})
    try:
        await cb.message.edit_text(
            f"💰 Цена {config.fmt_money(res['price'])} ₽ "
            f"(первый платёж {config.fmt_money(res['prepay'])} ₽, частей: {res['stages']}) "
            f"отправлена клиенту · заказ №{oid}." + (("\n" + ms) if ms else ""))
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("Предложение ушло клиенту 💰")


@router.callback_query(F.data.startswith("gp:hint:"))
async def gp_hint(cb: CallbackQuery) -> None:
    await cb.answer(
        "Ответьте (reply) на сообщение с кнопками числом:\n"
        "35000 — цена целиком\n"
        "35000/15000 — цена и первый платёж\n"
        "35000/15000/3 — … и число частей (1–3)", show_alert=True)


@router.message()
async def g_relay(m: Message) -> None:
    """Обычное сообщение в ветке заказа → клиенту. «.заметка» → в заметки."""
    if not await _is_work_group(m) or not m.from_user or m.from_user.id not in config.ADMIN_IDS:
        return
    text = m.text or m.caption or ""
    if text.startswith("/"):
        return
    o = await _order_for(m)
    if not o:
        return  # свободный трёп в группе не трогаем
    no = config.order_no(o["id"])

    # ответ на прайс-промпт бота — это цена, а не сообщение клиенту
    rt = m.reply_to_message
    if (rt and rt.from_user and rt.from_user.is_bot
            and (rt.text or "").startswith("💰 Цена")):
        await _price_from_reply(m, o)
        return

    # внутренняя заметка
    if text.startswith("."):
        note = text.lstrip(". ").strip()
        if note:
            old = (o["admin_note"] + "\n") if o["admin_note"] else ""
            await db.update_order(o["id"], admin_note=(old + note)[:1000])
            try:
                await m.react([ReactionTypeEmoji(emoji="✍")])  # тихое подтверждение
            except Exception:  # noqa: BLE001
                await m.reply("📝 В заметки (клиент не видит).")
        if m.document:
            # файл-заметка НЕ ушёл клиенту — из него можно сделать
            # защищённый предпросмотр («покажи работу — сначала оплати»)
            await m.reply(
                "Файл остался у нас (клиент его не видел). Отправить клиенту "
                "<b>безопасную выдачу</b>: сохранить оригинал, показать вам "
                "защищённую первую часть и только после подтверждения отправить клиенту?",
                reply_markup=kb.Kb(inline_keyboard=[[kb.Btn(
                    text="📄 Подготовить безопасную выдачу",
                    callback_data=f"gd:prev:{o['id']}")]]))
        return

    # В производстве любой документ сначала считаем потенциальным оригиналом.
    # Иначе при уже оплаченной первой части полный файл утекал клиенту до вопроса.
    if m.document and o["status"] in ("work", "fix"):
        await m.reply(
            "🛡 <b>Файл придержан — клиент его пока не видел.</b>\n"
            "Если это готовая/исправленная работа, запустите безопасную выдачу. "
            "Если это просто материал для переписки — отправьте как обычный файл.",
            reply_markup=kb.group_safe_file_kb(
                o["id"], _preview_ok(m.document.file_name)))
        return

    # правило владельца «сначала оплата части — потом файл»: документ/фото при
    # неоплаченном этапе НЕ уходит клиенту сразу — бот придерживает его и даёт
    # выбор (счёт, предпросмотр, «это не работа», осознанная сдача без оплаты)
    if (m.document or m.photo) and o["status"] in ("new", "priced", "prepay", "work"):
        debt = await flow.deliver_debt(o)
        if debt["amount"] > 0:
            preview_ok = bool(m.document) and _preview_ok(m.document.file_name)
            await m.reply(
                f"✋ <b>Файл придержан — клиенту НЕ отправлен.</b>\n"
                f"За {texts.esc(flow.part_label(o, debt['part']))} не оплачено "
                f"{texts.esc(flow.debt_line(debt))}."
                + ("\nКлиент отметил оплату — сверьте поступление и подтвердите, "
                   "тогда сдача откроется." if debt["claimed"] else "")
                + "\n\nЧто делаем?",
                reply_markup=kb.group_file_gate(o, debt["part"], preview_ok))
            return

    delivered_tg = False
    if o["user_id"]:
        try:
            delivered_tg = await notify.relay_to_client(
                m.bot, o["user_id"], m, f"📩 <b>Мастерская</b> · заказ {no}:")
        except Exception as e:  # noqa: BLE001
            await m.reply(texts.ADMIN_REPLY_FAIL.format(err=texts.esc(str(e)[:120])))

    # картотека: файлы и лента переписки (кабинет сайта видит всё)
    if m.document:
        await db.add_file(o["id"], "admin", m.document.file_id, m.document.file_unique_id,
                          m.document.file_name, m.document.file_size, "document")
    elif m.photo:
        ph = m.photo[-1]
        await db.add_file(o["id"], "admin", ph.file_id, ph.file_unique_id,
                          None, ph.file_size, "photo")
    elif m.voice:
        await db.add_file(o["id"], "admin", m.voice.file_id, m.voice.file_unique_id,
                          "голосовое.ogg", m.voice.file_size, "voice")
    await db.msg_add(o["id"], "master", m.text or m.caption,
                     kind="text" if m.text else str(m.content_type),
                     file_name=m.document.file_name if m.document else None,
                     tg_file_id=m.document.file_id if m.document else
                     (m.photo[-1].file_id if m.photo else
                      (m.voice.file_id if m.voice else None)))
    await db.add_event(o["id"], "admin_msg", (text or m.content_type)[:200])
    await mailer.master_message(o["id"])

    try:
        await m.react([ReactionTypeEmoji(emoji="👍")])
    except Exception:  # noqa: BLE001
        pass
    if not delivered_tg:
        if o["user_id"] and o["user_id"] < 0:
            await m.reply("📮 Клиент заходит по почте, без Telegram — сообщение уже "
                          "в его кабинете, копия ушла письмом.")
        elif not o["user_id"]:
            await m.reply("💾 Клиент без Telegram — увидит это в кабинете на сайте.")
    # файл в работе/правках — возможно, это сдача части: уточняем одним тапом
    if (m.document or m.photo) and o["status"] in ("work", "fix"):
        total = o["stages_total"] or 1
        part = o["stage"] or 1
        await m.reply(
            f"Файл ушёл клиенту. Это <b>сдача</b> ({texts.esc(flow.part_label(o))}) — "
            "перевести заказ на проверку с кнопками приёмки и оплатой этапа?",
            reply_markup=kb.group_file_prompt(o["id"], m.message_id, part, total))


@router.callback_query(F.data.startswith("gd:deliver:"))
async def g_deliver_confirm(cb: CallbackQuery) -> None:
    """Подтверждение «это сдача части» — из подсказки под файлом в ветке."""
    order_id = int(cb.data.split(":")[2])
    o = await db.get_order(order_id)
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    if o["status"] not in ("work", "fix", "check"):
        await cb.answer("Заказ уже в другом статусе", show_alert=True)
        return
    part = o["stage"] or 1
    # свежим файлам мастера без части проставляем номер сдаваемой части
    await db.conn().execute(
        "UPDATE order_files SET part=? WHERE order_id=? AND direction='admin' "
        "AND part IS NULL AND id IN (SELECT id FROM order_files WHERE order_id=? "
        "AND direction='admin' ORDER BY id DESC LIMIT 3)",
        (part, order_id, order_id))
    await db.conn().commit()
    res = await flow.deliver_part(cb.bot, order_id, part, via="группа")
    if res.get("error") == "stage_unpaid":
        # файл клиенту уже ушёл (этап был оплачен на момент отправки, но
        # оплата «раскрылась» — например, мастер отменил подтверждение);
        # статус не двигаем, показываем долг
        await cb.answer(f"Сдача не зафиксирована: не оплачено "
                        f"{config.fmt_money(res.get('debt', 0))} ₽. "
                        "Подтвердите оплату или сдайте осознанно без неё.",
                        show_alert=True)
        return
    total = res.get("total", 1)
    try:
        # подробности и кнопки следующего шага бот уже прислал ниже (deliver_part)
        await cb.message.edit_text(
            f"📦 Сдача зафиксирована: часть {res.get('part', part)} из {total} "
            "на проверке у клиента. Следующие шаги — ниже ⬇️" if total > 1
            else "📦 Работа на проверке у клиента. Следующие шаги — ниже ⬇️")
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("На проверке ✓")


@router.callback_query(F.data.startswith("gd:plain:"))
async def g_deliver_skip(cb: CallbackQuery) -> None:
    try:
        await cb.message.delete()
    except Exception:  # noqa: BLE001
        try:
            await cb.message.edit_text("✉️ Ок, просто файл — статус не меняю.")
        except Exception:  # noqa: BLE001
            pass
    await cb.answer()


# ---------------------- придержанный файл: действия гейта «сначала оплата»

async def _held_src(cb: CallbackQuery):
    """Файл, к которому относится меню гейта (реплай на сообщение мастера)."""
    src = cb.message.reply_to_message
    if src and (src.document or src.photo):
        return src
    return None


async def _send_held_file(cb: CallbackQuery, o, part: int | None) -> bool:
    """Отправить придержанный файл клиенту + картотека и лента переписки."""
    src = await _held_src(cb)
    if not src:
        await cb.answer("Не вижу файла — пришлите его в ветку ещё раз", show_alert=True)
        return False
    no = config.order_no(o["id"])
    if o["user_id"]:
        try:
            # False (клиент почтовый, без Telegram) — не ошибка: файл ниже
            # ляжет в картотеку, кабинет и письмо доставят
            await notify.relay_to_client(cb.bot, o["user_id"], src,
                                         f"📩 <b>Мастерская</b> · заказ {no}:")
        except Exception as e:  # noqa: BLE001
            await cb.answer(f"Не доставилось: {str(e)[:80]}", show_alert=True)
            return False
    if src.document:
        await db.add_file(o["id"], "admin", src.document.file_id,
                          src.document.file_unique_id, src.document.file_name,
                          src.document.file_size, "document", part=part)
    else:
        ph = src.photo[-1]
        await db.add_file(o["id"], "admin", ph.file_id, ph.file_unique_id,
                          None, ph.file_size, "photo", part=part)
    await db.msg_add(o["id"], "master", src.caption,
                     kind="document" if src.document else "photo",
                     file_name=src.document.file_name if src.document else None,
                     tg_file_id=src.document.file_id if src.document
                     else src.photo[-1].file_id)
    await db.add_event(o["id"], "admin_msg",
                       (src.caption or ("файл" if src.document else "фото"))[:200])
    await mailer.master_message(o["id"])
    return True


@router.callback_query(F.data.startswith("gf:plain:"))
async def gf_plain(cb: CallbackQuery) -> None:
    """«Это не работа»: придержанный файл уходит клиенту как обычный файл."""
    o = await db.get_order(int(cb.data.split(":")[2]))
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    if not await _send_held_file(cb, o, part=None):
        return
    try:
        await cb.message.edit_text(
            "✉️ Отправлено как обычный файл — сдачей не считается, статус не менялся."
            + ("" if o["user_id"] else " Клиент без Telegram — увидит его в кабинете сайта."))
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("Отправлено ✓")


@router.callback_query(F.data.startswith("gf:invoice:"))
async def gf_invoice(cb: CallbackQuery) -> None:
    """«Часть готова — счёт»: клиенту счёт этапа, файл остаётся придержанным."""
    order_id = int(cb.data.split(":")[2])
    res = await flow.part_ready(cb.bot, order_id, via="группа")
    if not res.get("ok"):
        if res.get("error") == "already":
            await cb.answer("Счёт уже выставлен — можно напомнить кнопкой «🔔»",
                            show_alert=True)
        else:
            await cb.answer("Не получилось — проверьте статус заказа", show_alert=True)
        return
    if res.get("due", 0) <= 0:
        await cb.answer("Этап уже оплачен — файл можно передавать", show_alert=True)
        return
    part_txt = f"за часть {res['part']}" if res.get("part") else "на остаток"
    try:
        await cb.message.edit_text(
            f"📣 Счёт {part_txt} ({config.fmt_money(res['due'])} ₽) ушёл клиенту. "
            "Файл держим: после подтверждения оплаты напомним передать — "
            "пришлите его тогда в ветку ещё раз.")
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("Счёт выставлен 📣")


@router.callback_query(F.data.startswith("gf:remind:"))
async def gf_remind(cb: CallbackQuery) -> None:
    order_id = int(cb.data.split(":")[2])
    res = await flow.remind_payment(cb.bot, order_id, via="группа")
    if not res.get("ok"):
        msg = {"claimed": "Клиент отметил оплату — сверьте и подтвердите",
               "nothing_due": "Платить нечего — этап уже закрыт",
               "paused": "Дело на паузе — сначала снимите её"}
        await cb.answer(msg.get(res.get("error"), "Не получилось"), show_alert=True)
        return
    await cb.answer(f"🔔 Напоминание ({config.fmt_money(res['due'])} ₽) ушло клиенту",
                    show_alert=True)


@router.callback_query(F.data.startswith("gf:force:"))
async def gf_force(cb: CallbackQuery) -> None:
    """Обход правила — только через отдельное подтверждение."""
    try:
        await cb.message.edit_reply_markup(
            reply_markup=kb.group_force_confirm(int(cb.data.split(":")[2])))
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("Точно передать без оплаты?")


@router.callback_query(F.data.startswith("gf:back:"))
async def gf_back(cb: CallbackQuery) -> None:
    o = await db.get_order(int(cb.data.split(":")[2]))
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    debt = await flow.deliver_debt(o)
    src = await _held_src(cb)
    preview_ok = bool(src and src.document) and _preview_ok(
        src.document.file_name if src and src.document else None)
    try:
        if debt["amount"] > 0:
            await cb.message.edit_reply_markup(
                reply_markup=kb.group_file_gate(o, debt["part"], preview_ok))
        else:
            await cb.message.edit_text(
                "✅ Оплата закрыта — файл можно передавать: пришлите его в ветку, "
                "бот предложит зафиксировать сдачу.")
    except Exception:  # noqa: BLE001
        pass
    await cb.answer()


@router.callback_query(F.data.startswith("gf:force2:"))
async def gf_force2(cb: CallbackQuery) -> None:
    """Подтверждённая сдача без оплаты: файл клиенту + фиксация в хронике."""
    o = await db.get_order(int(cb.data.split(":")[2]))
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    part = max(1, min(o["stage"] or 1, o["stages_total"] or 1))
    if not await _send_held_file(cb, o, part=part):
        return
    res = await flow.deliver_part(cb.bot, o["id"], part, via="группа, без оплаты",
                                  force=True)
    total = res.get("total", o["stages_total"] or 1)
    try:
        await cb.message.edit_text(
            f"📦 Часть {res.get('part', part)} из {total} передана и сдана "
            "<b>без оплаты этапа</b> (решение записано в хронику). Счёт остаётся: "
            "кнопки оплаты у клиента, «🔔 Напомнить об оплате» — в карточке заказа.")
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("Передано — счёт висит на клиенте")


# ------------------- «что дальше»: цепочки следующего шага (gn:*)
# Кнопки живут на алертах в ветке заказа и в личке мастера — обработчики
# не зависят от типа чата (фильтр роутера пускает только ADMIN_IDS).

@router.callback_query(F.data.startswith("gn:fixack:"))
async def gn_fix_ack(cb: CallbackQuery) -> None:
    """«Взял правки в работу» — клиенту уходит честный сигнал вместо тишины."""
    order_id = int(cb.data.split(":")[2])
    res = await flow.ack_fixes(cb.bot, order_id, via="кнопка мастера")
    if not res.get("ok"):
        msg = {"not_in_fix": "Заказ уже не в правках — обновите карточку",
               "already": "Клиенту уже сообщили, что правки в работе",
               "not_found": "Заказ не найден"}
        await cb.answer(msg.get(res.get("error"), "Не получилось"), show_alert=True)
        return
    o = await db.get_order(order_id)
    try:
        await cb.message.edit_text(
            cb.message.html_text + "\n\n🛠 <i>Взято в работу — клиенту сообщили.</i>",
            reply_markup=kb.fix_alert_kb(o, acked=True))
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("Клиент знает: правки в работе ✓"
                    + ("" if res.get("delivered_tg") else " (увидит в кабинете)"))


@router.callback_query(F.data.startswith("gn:nudge:"))
async def gn_review_nudge(cb: CallbackQuery) -> None:
    """«Напомнить о проверке» — клиенту снова уходят кнопки приёмки части."""
    order_id = int(cb.data.split(":")[2])
    res = await flow.remind_review(cb.bot, order_id, via="кнопка мастера")
    if not res.get("ok"):
        msg = {"not_on_review": "Сейчас ничего не ждёт проверки клиента",
               "paused": "Дело на паузе — сначала снимите её",
               "too_often": "Уже напоминали недавно — дайте клиенту несколько часов"}
        await cb.answer(msg.get(res.get("error"), "Не получилось"), show_alert=True)
        return
    where = "в Telegram" if res.get("delivered_tg") else "в кабинет сайта"
    await cb.answer(f"✍️ Напоминание о проверке ушло {where}", show_alert=True)


@router.callback_query(F.data.startswith("gn:payno:"))
async def gn_pay_not_found(cb: CallbackQuery) -> None:
    """«Не вижу оплаты» — отметка клиента снимается, ему уходит объяснение."""
    order_id = int(cb.data.split(":")[2])
    res = await flow.unclaim_payment(cb.bot, order_id, via="кнопка мастера")
    if not res.get("ok"):
        msg = {"no_claim": "Отметки об оплате уже нет — всё чисто",
               "not_found": "Заказ не найден"}
        await cb.answer(msg.get(res.get("error"), "Не получилось"), show_alert=True)
        return
    try:
        await cb.message.edit_text(
            cb.message.html_text
            + f"\n\n↩️ <i>Отметка снята ({config.fmt_money(res['amount'])} ₽ не найдены) — "
              "клиенту объяснили, кнопки оплаты у него снова активны.</i>")
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("Отметка снята — клиенту сообщили")


@router.callback_query(F.data.startswith("gd:prev:"))
async def g_preview(cb: CallbackQuery) -> None:
    """Файл из ветки → приватный исходник и проверка мастером; клиент пока не видит."""
    order_id = int(cb.data.split(":")[2])
    src = cb.message.reply_to_message
    doc = src.document if src else None
    if not doc:
        await cb.answer("Не вижу файла — пришлите его заметкой (с точкой) ещё раз",
                        show_alert=True)
        return
    await cb.answer("Готовим предпросмотр…")
    try:
        await cb.message.edit_text("🔒 Готовим защищённый предпросмотр — обычно до минуты…")
    except Exception:  # noqa: BLE001
        pass
    try:
        f = await cb.bot.get_file(doc.file_id)
        buf = await cb.bot.download_file(f.file_path)
        data = buf.read()
        data, clean_name, clean_method = await sanitize.clean(
            data, doc.file_name or "file.pdf")
        clean_msg = await grp.send_document(
            cb.bot, order_id, BufferedInputFile(data, filename=clean_name),
            caption="🗄 Очищенный приватный исходник · клиенту не виден")
        source_id = clean_msg.document.file_id if clean_msg and clean_msg.document else None
        if not source_id:
            raise RuntimeError("clean_source_relay_failed")
    except Exception as e:  # noqa: BLE001 — например, файл больше 20 МБ
        try:
            await cb.message.edit_text(
                "⚠️ Не удалось скачать файл из Telegram "
                f"({texts.esc(str(e)[:80])}). Файлы до 20 МБ — или через админку.")
        except Exception:  # noqa: BLE001
            pass
        return
    await db.add_event(order_id, "original_sanitized", f"{clean_name} · {clean_method}")
    res = await handoff.prepare(order_id, source_id, clean_name,
                                len(data), data, via="группа")
    if res.get("ok"):
        review = await cb.message.answer_document(
            BufferedInputFile(res["bytes"], filename=res["filename"]),
            caption=(f"👁 Проверка версии v{res['version']} · клиент ещё не видел.\n"
                     + ("Откройте защищённую первую часть и подтвердите отправку."
                        if res["mode"] == "protected" else
                        "Откройте исправленную полную версию и подтвердите отправку.")),
            reply_markup=kb.handoff_master_review_kb(
                order_id, res["artifact_id"], res["version"],
                clean=res["mode"] == "clean_revision"))
        if review.document:
            await handoff.set_review_file(res["artifact_id"], review.document.file_id)
        msg = "✅ Подготовлено. Откройте файл ниже; отправка клиенту — отдельной кнопкой."
    else:
        msg = "⚠️ " + {
            "preview_format": "Формат не поддержан — подходят PDF, DOCX, DOC, ODT, RTF.",
            "preview_failed": "Не получилось собрать предпросмотр — проверьте файл.",
            "relay_failed": "Предпросмотр собран, но отправить не удалось — попробуйте ещё раз.",
        }.get(res.get("error"), "Не получилось — попробуйте ещё раз.")
    try:
        await cb.message.edit_text(msg)
    except Exception:  # noqa: BLE001
        pass
