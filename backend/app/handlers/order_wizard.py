"""FSM-визард: тип → явный результат → материалы → параметры → подтверждение.

Для услуг (редактура, разбор, нормоконтроль, репетиторство) и «другого» — короткий
путь без направления/срочности. Запрещённый запрос не становится заказом ни на
одном из путей.
"""
from __future__ import annotations

import logging
import re
from datetime import date, timedelta

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, Message

from .. import config, db, keyboards as kb, texts
from ..services import intake_guard, notify
from ..texts import esc

log = logging.getLogger(__name__)
router = Router(name="wizard")

MAX_FILES = 10
_MATERIAL_LABELS = {
    "draft": "есть текст или черновик",
    "partial": "есть тема, план или данные",
    "none": "пока нет — нужен стартовый разбор",
    "order": "исходные материалы уже в заказе",
}


class Wiz(StatesGroup):
    topic = State()
    deadline = State()
    details = State()
    files = State()
    confirm = State()


# ------------------------------------------------------------------- старт

@router.callback_query(F.data == "cl:new")
async def start_wizard(cb: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await cb.message.edit_text(texts.WIZ_TYPE, reply_markup=kb.wiz_types())
    await cb.answer()


@router.callback_query(F.data == "wz:svcmenu")
async def svc_menu(cb: CallbackQuery) -> None:
    await cb.message.edit_text("🛠 <b>Отдельные услуги</b>\n\nЧто нужно?",
                               reply_markup=kb.wiz_services())
    await cb.answer()


@router.callback_query(F.data == "wz:back_types")
async def back_types(cb: CallbackQuery) -> None:
    await cb.message.edit_text(texts.WIZ_TYPE, reply_markup=kb.wiz_types())
    await cb.answer()


@router.callback_query(F.data == "wz:cancel")
async def cancel(cb: CallbackQuery, state: FSMContext) -> None:
    await state.clear()
    await cb.message.edit_text(texts.WIZ_CANCELED)
    has_orders = bool(await db.orders_by_user(cb.from_user.id, limit=1))
    await cb.message.answer(texts.MENU_HINT, reply_markup=kb.main_menu(has_orders))
    await cb.answer()


# -------------------------------------------------------- выбор параметров

@router.callback_query(F.data.startswith("wz:type:"))
async def pick_type(cb: CallbackQuery, state: FSMContext) -> None:
    type_id = cb.data.split(":")[2]
    await state.clear()
    if type_id in config.SVC_BY_ID:
        svc = config.SVC_BY_ID[type_id]
        await state.update_data(type_id=type_id, work_label=svc.label, mode="svc", files=[])
        await cb.message.edit_text(texts.WIZ_MATERIAL_SVC, reply_markup=kb.wiz_material())
    elif type_id == "custom":
        await state.update_data(type_id="custom", work_label="Индивидуальная задача",
                                mode="svc", files=[])
        await cb.message.edit_text(texts.WIZ_MATERIAL_SVC, reply_markup=kb.wiz_material())
    else:
        t = config.TYPE_BY_ID.get(type_id)
        if not t:
            await cb.answer("Не разобрал тип — выберите ещё раз", show_alert=True)
            return
        await state.update_data(type_id=t.id, work_label=t.label, mode="work", files=[])
        await cb.message.edit_text(texts.WIZ_RESULT, reply_markup=kb.wiz_tiers())
    await cb.answer()


@router.callback_query(F.data.startswith("wz:tier:"))
async def pick_tier(cb: CallbackQuery, state: FSMContext) -> None:
    tier_id = cb.data.split(":")[2]
    if tier_id not in config.TIER_BY_ID:
        await cb.answer("Не разобрал результат — выберите ещё раз", show_alert=True)
        return
    current = await state.get_data()
    if current.get("mode") != "work" or current.get("type_id") not in config.TYPE_BY_ID:
        await state.clear()
        await cb.message.edit_text(texts.WIZ_TYPE, reply_markup=kb.wiz_types())
        await cb.answer("Эта кнопка устарела — начните новую заявку", show_alert=True)
        return
    await state.update_data(tier=tier_id)
    data = await state.get_data()
    if data.get("resume_confirm"):
        await state.update_data(resume_confirm=False)
        await state.set_state(Wiz.confirm)
        await cb.message.edit_text(_confirm_card(data | {"tier": tier_id}),
                                   reply_markup=kb.wiz_confirm())
    else:
        await cb.message.edit_text(texts.WIZ_MATERIAL, reply_markup=kb.wiz_material())
    await cb.answer()


@router.callback_query(F.data.startswith("wz:material:"))
async def pick_material(cb: CallbackQuery, state: FSMContext) -> None:
    material = cb.data.split(":")[2]
    if material not in {"draft", "partial", "none"}:
        await cb.answer("Выберите один из вариантов", show_alert=True)
        return
    current = await state.get_data()
    valid_work = (
        current.get("mode") == "work"
        and current.get("type_id") in config.TYPE_BY_ID
    )
    valid_service = (
        current.get("mode") == "svc"
        and (
            current.get("type_id") == "custom"
            or current.get("type_id") in config.SVC_BY_ID
        )
    )
    if not (valid_work or valid_service):
        await state.clear()
        await cb.message.edit_text(texts.WIZ_TYPE, reply_markup=kb.wiz_types())
        await cb.answer("Эта кнопка устарела — начните новую заявку", show_alert=True)
        return
    await state.update_data(own_material=material)
    data = await state.get_data()
    if data.get("mode") == "svc":
        await state.set_state(Wiz.topic)
        await cb.message.edit_text(texts.WIZ_TOPIC_SVC)
    elif data.get("disc") and data.get("term"):
        await state.set_state(Wiz.topic)
        await cb.message.edit_text(texts.WIZ_TOPIC)
    elif data.get("disc"):
        await cb.message.edit_text(texts.WIZ_TERM, reply_markup=kb.wiz_term())
    else:
        await cb.message.edit_text(texts.WIZ_DISC, reply_markup=kb.wiz_disc())
    await cb.answer()


@router.callback_query(F.data.startswith("wz:svcfor:"))
async def svc_for_order(cb: CallbackQuery, state: FSMContext) -> None:
    """Услуга «к защите» по материалам заказа: тип и тема уже известны —
    не переспрашиваем «что за работа», сразу уточняем дату защиты."""
    parts = cb.data.split(":")
    svc_id, src_id = parts[2], int(parts[3])
    svc = config.SVC_BY_ID.get(svc_id)
    src = await db.get_order(src_id)
    if not svc or not src or src["user_id"] != cb.from_user.id:
        # фолбэк — обычный сервисный путь
        await pick_type(cb, state)
        return
    await state.clear()
    topic = (f"По материалам заказа №{src_id}: {src['work_label'] or 'материал'}"
             + (f" — «{src['topic']}»" if src["topic"] else ""))
    await state.update_data(type_id=svc_id, work_label=svc.label, mode="svc",
                            files=[], topic=topic[:400], own_material="order",
                            source=f"допродажа №{src_id}")
    # остаток сертификата исходного заказа едет с собой — спишется сам
    gift_line = ""
    from ..services import gift as gift_svc
    gift = await gift_svc.order_gift_info(src)
    if gift and gift.get("state") == "active" and gift.get("balance", 0) > 0:
        await state.update_data(gift_rest=gift["code"])
        gift_line = (f"\n💳 Остаток сертификата — <b>{config.fmt_money(gift['balance'])} ₽</b> — "
                     "привяжем к этой заявке автоматически.\n")
    await state.set_state(Wiz.deadline)
    await cb.message.answer(
        f"🎓 <b>{svc.label}</b>\n\n"
        f"Исходные материалы уже у нас: заказ №{src_id}"
        + (f", «{esc(src['topic'])}»" if src["topic"] else "") + " — ничего заново "
        f"описывать не нужно.\n{gift_line}\n📅 Когда защита или к какой дате нужен результат?")
    await cb.answer()


@router.callback_query(F.data.startswith("wz:site:"))
async def from_site_quote(cb: CallbackQuery, state: FSMContext) -> None:
    """Кнопка «Оформить с этой сметой» — параметры уже выбраны на сайте."""
    codes = cb.data.split(":")[2].split("_")
    t = config.TYPE_BY_CODE.get(codes[0]) if codes else None
    if not t:
        await cb.answer("Смета устарела — соберём заново", show_alert=True)
        await cb.message.answer(texts.WIZ_TYPE, reply_markup=kb.wiz_types())
        return
    d = config.DISC_BY_CODE.get(codes[1], config.DISCIPLINES[0]) if len(codes) > 1 else config.DISCIPLINES[0]
    s = config.TERM_BY_CODE.get(codes[2], config.TERMS[0]) if len(codes) > 2 else config.TERMS[0]
    v = config.TIER_BY_CODE.get(codes[3]) if len(codes) > 3 else None
    await state.clear()
    await state.update_data(type_id=t.id, work_label=t.label, mode="work", files=[],
                            disc=d[0], term=s[0], tier=v[0] if v else None,
                            source="сайт · смета")
    if v:
        await cb.message.edit_text(texts.WIZ_MATERIAL, reply_markup=kb.wiz_material())
    else:
        # Старые deep-link-и без уровня продолжают работать, но выбор больше
        # не подставляется молча.
        await cb.message.edit_text(texts.WIZ_RESULT, reply_markup=kb.wiz_tiers())
    await cb.answer()


@router.callback_query(F.data.startswith("wz:disc:"))
async def pick_disc(cb: CallbackQuery, state: FSMContext) -> None:
    disc_id = cb.data.split(":")[2]
    if disc_id not in config.DISC_BY_ID:
        await cb.answer("Не разобрал направление — выберите ещё раз", show_alert=True)
        return
    await state.update_data(disc=disc_id)
    data = await state.get_data()
    if data.get("tier") not in config.TIER_BY_ID:
        await cb.message.edit_text(texts.WIZ_RESULT, reply_markup=kb.wiz_tiers())
    elif not data.get("own_material"):
        await cb.message.edit_text(texts.WIZ_MATERIAL, reply_markup=kb.wiz_material())
    else:
        await cb.message.edit_text(texts.WIZ_TERM, reply_markup=kb.wiz_term())
    await cb.answer()


@router.callback_query(F.data.startswith("wz:term:"))
async def pick_term(cb: CallbackQuery, state: FSMContext) -> None:
    term_id = cb.data.split(":")[2]
    if term_id not in config.TERM_BY_ID:
        await cb.answer("Не разобрал срок — выберите ещё раз", show_alert=True)
        return
    await state.update_data(term=term_id)
    data = await state.get_data()
    if data.get("tier") not in config.TIER_BY_ID:
        await cb.message.edit_text(texts.WIZ_RESULT, reply_markup=kb.wiz_tiers())
    elif not data.get("own_material"):
        await cb.message.edit_text(texts.WIZ_MATERIAL, reply_markup=kb.wiz_material())
    else:
        await state.set_state(Wiz.topic)
        await cb.message.edit_text(texts.WIZ_TOPIC)
    await cb.answer()


# ------------------------------------------------------------- тема и срок

@router.message(Wiz.topic, F.text)
async def got_topic(m: Message, state: FSMContext) -> None:
    topic = m.text.strip()[:400]
    if intake_guard.evaluate([topic]).blocked:
        await _reject_intake(m, state)
        return
    await state.update_data(topic=topic)
    await state.set_state(Wiz.deadline)
    await m.answer(texts.WIZ_DEADLINE)


@router.message(Wiz.deadline, F.text)
async def got_deadline(m: Message, state: FSMContext) -> None:
    raw = m.text.strip()[:120]
    await state.update_data(deadline_text=raw, deadline_date=parse_ru_date(raw))
    await state.set_state(Wiz.details)
    await m.answer(texts.WIZ_DETAILS, reply_markup=kb.wiz_skip("details"))


@router.message(Wiz.details, F.text)
async def got_details(m: Message, state: FSMContext) -> None:
    details = m.text.strip()[:1500]
    data = await state.get_data()
    if intake_guard.evaluate([data.get("topic"), details]).blocked:
        await _reject_intake(m, state)
        return
    await state.update_data(details=details)
    await state.set_state(Wiz.files)
    await m.answer(texts.WIZ_FILES, reply_markup=kb.wiz_files())


@router.callback_query(F.data == "wz:skip:details")
async def skip_details(cb: CallbackQuery, state: FSMContext) -> None:
    await state.update_data(details=None)
    await state.set_state(Wiz.files)
    await cb.message.edit_text(texts.WIZ_FILES, reply_markup=kb.wiz_files())
    await cb.answer()


# ------------------------------------------------------------------- файлы

@router.message(Wiz.files, F.document | F.photo)
async def got_file(m: Message, state: FSMContext) -> None:
    data = await state.get_data()
    files: list = data.get("files", [])
    if len(files) >= MAX_FILES:
        await m.answer("Файлов уже 10 — этого достаточно. Нажмите «Готово».",
                       reply_markup=kb.wiz_files())
        return
    if m.document:
        files.append({"file_id": m.document.file_id, "uid": m.document.file_unique_id,
                      "name": m.document.file_name, "size": m.document.file_size,
                      "kind": "document"})
    elif m.photo:
        ph = m.photo[-1]
        files.append({"file_id": ph.file_id, "uid": ph.file_unique_id,
                      "name": None, "size": ph.file_size, "kind": "photo"})
    await state.update_data(files=files)
    await m.answer(texts.WIZ_FILE_ADDED.format(n=len(files)), reply_markup=kb.wiz_files())


@router.callback_query(F.data.in_({"wz:files_done", "wz:skip:files"}))
async def files_done(cb: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    if data.get("mode") == "work" and data.get("tier") not in config.TIER_BY_ID:
        await state.update_data(resume_confirm=True)
        await state.set_state(Wiz.confirm)
        await cb.message.edit_text(texts.WIZ_RESULT, reply_markup=kb.wiz_tiers())
        await cb.answer()
        return
    if intake_guard.evaluate([data.get("topic"), data.get("details")]).blocked:
        await state.clear()
        await cb.message.edit_text(texts.INTAKE_BLOCKED, reply_markup=kb.intake_redirect())
        await cb.answer("Заявка не создана", show_alert=True)
        return
    await state.set_state(Wiz.confirm)
    await cb.message.edit_text(_confirm_card(data), reply_markup=kb.wiz_confirm())
    await cb.answer()


# ------------------------------------------------------------ подтверждение

def _confirm_card(d: dict) -> str:
    lines = [texts.WIZ_CONFIRM_TITLE]
    lines.append(f"📄 <b>{esc(d.get('work_label'))}</b>")
    tier = config.TIER_BY_ID.get(d.get("tier"))
    if tier:
        lines.append(f"🎯 Результат: <b>{esc(tier[2])}</b> — {esc(tier[4])}")
    material = _MATERIAL_LABELS.get(d.get("own_material"))
    if material:
        lines.append(f"📚 Материалы: {material}")
    disc = config.DISC_BY_ID.get(d.get("disc"))
    if disc:
        lines.append(f"🎓 {disc[2]}")
    if d.get("topic"):
        lines.append(f"📖 Тема: <i>{esc(d['topic'])}</i>")
    if d.get("deadline_text"):
        lines.append(f"📅 Срок: {esc(d['deadline_text'])}")
    if d.get("details"):
        lines.append(f"📋 Требования: {esc(d['details'][:300])}")
    files = d.get("files") or []
    if files:
        lines.append(f"📎 Файлов: {len(files)}")
    q = _quote_for(d)
    if q:
        lines.append(f"\n💰 Предварительная смета: <b>{config.fmt_money(q[0])} – "
                     f"{config.fmt_money(q[1])} ₽</b>\n<i>Точную цену назовёт мастер после просмотра.</i>")
    elif d.get("type_id") in config.SVC_BY_ID:
        svc = config.SVC_BY_ID[d["type_id"]]
        lines.append(f"\n💰 От {config.fmt_money(svc.from_price)} ₽{svc.unit} — "
                     f"точную цену назовёт мастер.")
    return "\n".join(lines)


def _quote_for(d: dict) -> tuple[int, int] | None:
    if d.get("mode") != "work" or not d.get("type_id"):
        return None
    if d.get("tier") not in config.TIER_BY_ID:
        return None
    return config.quote(d["type_id"], d.get("disc", "hum"), d.get("term", "free"),
                        d["tier"])


def _stored_details(d: dict) -> str | None:
    """Keep the material answer with the order without changing legacy schema."""
    material = _MATERIAL_LABELS.get(d.get("own_material"))
    details = str(d.get("details") or "").strip()
    if not material:
        return details or None
    line = f"Исходная точка: {material}."
    remaining = max(0, 1500 - len(line) - 1)
    return line + (f"\n{details[:remaining]}" if details else "")


@router.callback_query(Wiz.confirm, F.data == "wz:send")
async def send_order(cb: CallbackQuery, state: FSMContext) -> None:
    d = await state.get_data()
    valid_kind = (
        d.get("mode") == "work" and d.get("type_id") in config.TYPE_BY_ID
    ) or (
        d.get("mode") == "svc"
        and (d.get("type_id") == "custom" or d.get("type_id") in config.SVC_BY_ID)
    )
    if not valid_kind:
        await state.clear()
        await cb.message.edit_text(texts.WIZ_TYPE, reply_markup=kb.wiz_types())
        await cb.answer("Заявка устарела — заполните её заново", show_alert=True)
        return
    if d.get("mode") == "work" and d.get("tier") not in config.TIER_BY_ID:
        await state.update_data(resume_confirm=True)
        await cb.message.edit_text(texts.WIZ_RESULT, reply_markup=kb.wiz_tiers())
        await cb.answer("Сначала выберите результат", show_alert=True)
        return
    if intake_guard.evaluate([d.get("topic"), d.get("details")]).blocked:
        await state.clear()
        await cb.message.edit_text(texts.INTAKE_BLOCKED, reply_markup=kb.intake_redirect())
        await cb.answer("Заявка не создана", show_alert=True)
        return
    q = _quote_for(d)
    order_id = await db.create_order(
        user_id=cb.from_user.id,
        work_type=d.get("type_id"),
        work_label=d.get("work_label"),
        discipline=d.get("disc"),
        term=d.get("term"),
        tier=d.get("tier"),
        topic=d.get("topic"),
        details=_stored_details(d),
        deadline_text=d.get("deadline_text"),
        deadline_date=d.get("deadline_date"),
        quote_low=q[0] if q else None,
        quote_high=q[1] if q else None,
        source=d.get("source", "бот"),
    )
    await state.clear()
    for f in d.get("files") or []:
        await db.add_file(order_id, "client", f["file_id"], f["uid"], f["name"],
                          f["size"], f["kind"])
    sent_note = texts.WIZ_SENT.format(no=config.order_no(order_id))
    if d.get("gift_rest"):  # остаток сертификата из исходного заказа — с собой
        from ..services import gift as gift_svc
        ok, _gerr = await gift_svc.attach_to_order(
            cb.bot, order_id, d["gift_rest"], via="остаток по допродаже")
        if ok:
            g = await db.gift_by_code(d["gift_rest"])
            bal = await db.gift_balance(g["id"]) if g else 0
            sent_note += (f"\n\n💳 Сертификат привязан: остаток "
                          f"<b>{config.fmt_money(bal)} ₽</b> зачтётся при цене.")
    await cb.message.edit_text(sent_note)
    has_orders = True
    await cb.message.answer(texts.MENU_HINT, reply_markup=kb.main_menu(has_orders))
    await cb.answer("Заявка отправлена 🚀")
    # карточка мастеру (рабочая группа; личка — фолбэк) + файлы в ветку заказа
    from ..services import group as grp
    g = await grp.send_card(cb.bot, order_id, alert=texts.NEW_ORDER_ALERT)
    await notify.send_admin_card(cb.bot, order_id, alert=texts.NEW_ORDER_ALERT,
                                 group_sent=bool(g))
    await _forward_wizard_files(cb, order_id, d.get("files") or [], group_ok=bool(g))


async def _reject_intake(m: Message, state: FSMContext) -> None:
    """Stop the wizard before a prohibited request can become an order."""
    await state.clear()
    await m.answer(texts.INTAKE_BLOCKED, reply_markup=kb.intake_redirect())


async def _forward_wizard_files(cb: CallbackQuery, order_id: int, files: list,
                                group_ok: bool = False) -> None:
    """Файлы заявки — в ветку заказа в группе; в личку — только если группа недоступна."""
    from ..services import group as grp
    no = config.order_no(order_id)
    for f in files:
        cap = f"📎 К заявке · заказ {no}" + (f" · {f['name']}" if f.get("name") else "")
        sent = None
        try:
            if f["kind"] == "photo":
                thread = await grp.ensure_topic(cb.bot, order_id)
                sent = await cb.bot.send_photo(await grp.chat_id(), f["file_id"],
                                               caption=cap[:1024] if thread else f"#заказ{order_id}\n{cap}"[:1024],
                                               message_thread_id=thread)
            else:
                sent = await grp.send_document(cb.bot, order_id, f["file_id"], caption=cap)
        except Exception as e:  # noqa: BLE001 — файл не должен ронять поток
            log.warning("forward wizard file to group failed: %s", e)
        if sent:
            continue
        for admin_id in config.ADMIN_IDS:  # группа не приняла — фолбэк в личку
            try:
                if f["kind"] == "photo":
                    await cb.bot.send_photo(admin_id, f["file_id"], caption=cap)
                else:
                    await cb.bot.send_document(admin_id, f["file_id"], caption=cap)
            except Exception as e:  # noqa: BLE001
                log.warning("forward wizard file failed: %s", e)


# --------------------------------------------------- подсказки не по камере

@router.message(Wiz.files)
async def files_hint(m: Message) -> None:
    await m.answer("Пришлите файл документом или фото — либо нажмите «Готово» / «Пропустить».",
                   reply_markup=kb.wiz_files())


@router.message(Wiz.confirm)
async def confirm_hint(m: Message) -> None:
    await m.answer("Осталось нажать «🚀 Отправить заявку» — или «Отмена».",
                   reply_markup=kb.wiz_confirm())


@router.message(Wiz.topic)
@router.message(Wiz.deadline)
@router.message(Wiz.details)
async def text_only_hint(m: Message) -> None:
    await m.answer("Напишите текстом, пожалуйста 🙂 Файлы можно будет приложить на следующем шаге.")


# --------------------------------------------------------------- дата по-русски

_MONTHS = {
    "янв": 1, "фев": 2, "мар": 3, "апр": 4, "мая": 5, "май": 5, "июн": 6,
    "июл": 7, "авг": 8, "сен": 9, "окт": 10, "ноя": 11, "дек": 12,
}


def parse_ru_date(raw: str) -> str | None:
    """Пытаемся вытащить дату из свободного текста («25 августа», «25.08», «через 2 недели»).

    Возвращает ISO-дату или None — используется только для напоминаний, ошибки не страшны.
    """
    s = raw.lower()
    today = date.today()
    m = re.search(r"(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?", s)
    if m:
        day, month = int(m.group(1)), int(m.group(2))
        year = int(m.group(3)) if m.group(3) else today.year
        if year < 100:
            year += 2000
        try:
            d = date(year, month, day)
            if not m.group(3) and d < today:
                d = date(year + 1, month, day)
            return d.isoformat()
        except ValueError:
            return None
    m = re.search(r"(\d{1,2})\s+([а-я]+)", s)
    if m:
        for stem, month in _MONTHS.items():
            if m.group(2).startswith(stem):
                try:
                    d = date(today.year, month, int(m.group(1)))
                    if d < today:
                        d = date(today.year + 1, month, int(m.group(1)))
                    return d.isoformat()
                except ValueError:
                    return None
    if "завтра" in s:
        return (today + timedelta(days=1 + ("после" in s))).isoformat()
    m = re.search(r"через\s+(\d+)?\s*(дн|дня|дней|нед|мес)", s)
    if m:
        n = int(m.group(1) or 1)
        unit = m.group(2)
        days = n * (7 if unit.startswith("нед") else 30 if unit.startswith("мес") else 1)
        return (today + timedelta(days=days)).isoformat()
    return None
