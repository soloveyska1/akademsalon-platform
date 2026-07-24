"""Админ-панель в личке владельца: карточки заказов, цены, статусы, сдача работ,
reply-роутинг сообщений клиентам, поиск, статистика, реквизиты.
"""
from __future__ import annotations

import logging
import re

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import BufferedInputFile, CallbackQuery, Message

from .. import config, db, keyboards as kb, texts
from ..services import flow, handoff, mailer, notify, payments, sanitize
from ..services import group as grp
from ..texts import esc

log = logging.getLogger(__name__)

# корневой роутер: /admin и /client доступны админам всегда,
# остальное — только вне «режима клиента»
router = Router(name="admin_root")
core = Router(name="admin_core")


def _is_admin(user_id: int) -> bool:
    return user_id in config.ADMIN_IDS


def _is_admin_active(user_id: int) -> bool:
    return _is_admin(user_id) and user_id not in config.CLIENT_MODE_ADMINS


router.message.filter(lambda m: bool(m.from_user) and _is_admin(m.from_user.id))
router.callback_query.filter(lambda c: bool(c.from_user) and _is_admin(c.from_user.id))
core.message.filter(lambda m: bool(m.from_user) and _is_admin_active(m.from_user.id))
core.callback_query.filter(lambda c: bool(c.from_user) and _is_admin_active(c.from_user.id))


class APrice(StatesGroup):
    waiting = State()


class QAnswer(StatesGroup):
    waiting = State()


class ADeliver(StatesGroup):
    waiting = State()


class APreview(StatesGroup):
    waiting = State()


class ANote(StatesGroup):
    waiting = State()


class AMsg(StatesGroup):
    waiting = State()


class AReq(StatesGroup):
    waiting = State()


# ------------------------------------------------- переключение режимов

@router.message(Command("client"))
async def cmd_client_mode(m: Message, state: FSMContext) -> None:
    config.CLIENT_MODE_ADMINS.add(m.from_user.id)
    await state.clear()
    await m.answer(texts.CLIENT_MODE_ON)


@router.message(Command("admin"))
async def cmd_admin_mode(m: Message, state: FSMContext) -> None:
    config.CLIENT_MODE_ADMINS.discard(m.from_user.id)
    await state.clear()
    await m.answer(texts.CLIENT_MODE_OFF)
    await _panel(m)


# --------------------------------------------------------------- панель

async def _panel(m: Message) -> None:
    req = await db.setting_get("requisites")
    active = await db.active_orders(limit=30)
    text = (
        "🛠 <b>Админ-панель</b>\n\n"
        f"Активных заказов: <b>{len(active)}</b>\n"
        f"Реквизиты для оплаты: {'✅ заданы' if req else '⚠️ не заданы — /requisites'}\n\n"
        "/orders — активные заказы\n"
        "/all — последние 20 (все статусы)\n"
        "/find <i>текст</i> — поиск\n"
        "/stats — статистика\n"
        "/slots — набор месяца: квота и брони мест\n"
        "/requisites — реквизиты оплаты\n"
        "/client — режим клиента (тест)\n\n"
        "💡 Ответ клиенту — просто reply на его сообщение или карточку заказа."
    )
    await m.answer(text, reply_markup=kb.admin_reply_kb())
    await m.answer("🌐 Полная картина — в «Глазе бога» на сайте:",
                   reply_markup=kb.Kb(inline_keyboard=[[kb.Btn(
                       text="👁 Открыть админку сайта",
                       url=f"{config.SITE_URL}/admin.html")]]))


@core.message(F.text == kb.ADM_ORDERS)
async def btn_orders(m: Message) -> None:
    await cmd_orders(m)


@core.message(F.text == kb.ADM_STATS)
async def btn_stats(m: Message) -> None:
    await cmd_stats(m)


@core.message(CommandStart())
async def cmd_start(m: Message, command: CommandObject, state: FSMContext,
                    is_new_user: bool = False) -> None:
    # /start с deep-link (вход на сайте, смета, claim) — обрабатываем как клиент,
    # иначе владелец не может ни войти на сайт, ни посмотреть клиентский путь
    if (command.args or "").strip():
        from .client import cmd_start as client_start
        await client_start(m, command, state, is_new_user)
        return
    await state.clear()
    await _panel(m)


@core.message(Command("help"))
async def cmd_help(m: Message) -> None:
    await _panel(m)


# ------------------------------------------------------------- промокоды

_PROMO_HELP = (
    "🎟 <b>Промокоды</b>\n\n"
    "<code>/promo</code> — список кодов\n"
    "<code>/promo add ЛЕТО10 10% cap=2000 min=5000 uses=100 until=2026-09-01 заметка</code>\n"
    "<code>/promo add СТАРТ500 500 uses=50</code> — фикс 500 ₽\n"
    "<code>/promo off КОД</code> / <code>/promo on КОД</code> — выключить/включить\n"
    "<code>/promo exit off</code> / <code>on</code> — рубильник автокодов возврата\n\n"
    "cap — потолок скидки для процентов; min — минимальная цена заказа; "
    "uses — лимит применений; until — последний день действия. Всё необязательно.\n"
    "Со скидкой подписки не суммируется — применяется бо́льшая; списание "
    "использования — когда мастер называет цену.\n"
    "Совет: публичному коду со скидкой подороже давайте имя подлиннее "
    "(слово+цифры угадывают перебором).\n\n"
    "Ссылка для рекламы: <code>https://akademsalon.ru/configurator.html?promo=КОД</code>"
)


def _promo_line(p) -> str:
    from ..services import promo as promo_svc
    parts = [f"<b>{esc(p['code'])}</b> {promo_svc.label(p)}"]
    if p["uses_left"] is not None:
        parts.append(f"осталось {p['uses_left']}")
    if p["expires_at"]:
        parts.append(f"до {p['expires_at']}")
    if not p["active"]:
        parts.append("⛔ выключен")
    if p["note"]:
        parts.append(esc(p["note"]))
    return " · ".join(parts)


@core.message(Command("promo"))
async def cmd_promo(m: Message, command: CommandObject) -> None:
    from ..services import promo as promo_svc  # noqa: F401 — label в _promo_line
    args = (command.args or "").strip()
    if not args:
        rows = await db.promo_list()
        # автокоды возврата в листинге не показываем — их выдаёт сайт пачками,
        # владельцу важна сводка, а не полотно AS-XXXXXX
        manual = [p for p in rows if not p["family"]]
        listing = "\n".join("• " + _promo_line(p) for p in manual) if manual else "Кодов пока нет."
        st = await db.promo_exit_stats()
        exit_on = (await db.setting_get("exit_promo", "on")) == "on"
        listing += (f"\n\n🚪 Автокоды возврата ({'вкл' if exit_on else '⛔ выкл'}): "
                    f"выдано {st['issued']}, применено {st['redeemed']}"
                    + (f" на {config.fmt_money(st['sum'])} ₽" if st["redeemed"] else ""))
        await m.answer(listing + "\n\n" + _PROMO_HELP)
        return
    parts = args.split()
    sub = parts[0].lower()
    if sub == "exit" and len(parts) >= 2 and parts[1].lower() in ("on", "off"):
        val = parts[1].lower()
        await db.setting_set("exit_promo", val)
        await m.answer("🚪 Автокоды возврата "
                       + ("включены ✓" if val == "on" else "выключены ⛔ — сайт выдавать перестал"))
        return
    if sub in ("off", "on") and len(parts) >= 2:
        code = parts[1].upper()
        ok = await db.promo_set_active(code, sub == "on")
        await m.answer(f"🎟 <b>{esc(code)}</b> {'включён ✓' if sub == 'on' else 'выключен ⛔'}"
                       if ok else f"Код <b>{esc(code)}</b> не найден.")
        return
    if sub != "add" or len(parts) < 3:
        await m.answer(_PROMO_HELP)
        return
    code = re.sub(r"[^A-ZА-ЯЁ0-9_-]", "", parts[1].upper())[:24]
    if len(code) < 3:
        await m.answer("Код — от 3 символов: буквы (можно кириллицу), цифры, дефис. "
                       + _PROMO_HELP)
        return
    val = parts[2]
    pct = amount = None
    try:
        if val.endswith("%"):
            pct = max(1, min(90, int(val[:-1])))
        else:
            amount = max(50, int(re.sub(r"\D", "", val) or 0))
    except ValueError:
        await m.answer("Не понял скидку. Пример: <code>10%</code> или <code>500</code> (₽).")
        return
    if not pct and not amount:
        await m.answer("Не понял скидку. Пример: <code>10%</code> или <code>500</code> (₽).")
        return
    cap = min_price = None
    uses = None
    until = None
    note_words = []
    for tok in parts[3:]:
        mkv = re.match(r"^(cap|min|uses)=(\d+)$", tok, re.I)
        if mkv:
            k, v = mkv.group(1).lower(), int(mkv.group(2))
            if k == "cap":
                cap = v
            elif k == "min":
                min_price = v
            else:
                uses = v
            continue
        mu = re.match(r"^until=(\d{4}-\d{2}-\d{2})$", tok, re.I)
        if mu:
            until = mu.group(1)
            continue
        note_words.append(tok)
    await db.promo_add(code, pct=pct, amount=amount, cap=cap,
                       min_price=min_price or 0, uses_left=uses,
                       expires_at=until, note=" ".join(note_words)[:200] or None)
    p = await db.promo_get(code)
    await m.answer("🎟 Готово:\n• " + _promo_line(p) +
                   f"\n\nСсылка для рекламы:\n<code>https://akademsalon.ru/configurator.html?promo={code}</code>"
                   f"\nС разбором плана: <code>https://akademsalon.ru/configurator.html?plan=1&promo={code}</code>")


# ------------------------------------------------------------- reply-роутинг

async def _mapped_reply(m: Message) -> bool | dict:
    if not m.reply_to_message:
        return False
    row = await db.map_get(m.chat.id, m.reply_to_message.message_id)
    return {"map_row": row} if row else False


async def _gate_chat_document(m: Message, state: FSMContext, order_id: int) -> bool:
    """Документ мастера в чат-пути при неоплаченном этапе → придержать.

    True — файл придержан (клиенту НЕ ушёл), мастеру показано меню действий;
    сам файл запомнен в FSM-данных для «отправить как есть»."""
    if not m.document or not order_id:
        return False
    o = await db.get_order(order_id)
    if not o or o["status"] not in ("new", "priced", "prepay", "work", "fix"):
        return False
    debt = await flow.deliver_debt(o)
    await state.update_data(gate_file_order=order_id,
                            gate_file_id=m.document.file_id,
                            gate_file_name=m.document.file_name,
                            gate_file_size=m.document.file_size)
    if o["status"] in ("work", "fix"):
        await m.reply(
            "🛡 <b>Документ придержан — клиент его пока не видел.</b>\n"
            "Готовую работу проведите через безопасную выдачу; обычный материал "
            "можно отправить отдельной кнопкой.",
            reply_markup=kb.chat_safe_file_kb(order_id))
    elif debt["amount"] > 0:
        await m.reply(
            f"✋ <b>Файл придержан (клиенту НЕ отправлен):</b> за "
            f"{flow.part_label(o, debt['part'])} не оплачено {flow.debt_line(debt)}.\n"
            + ("Клиент отметил оплату — сначала сверьте поступление и подтвердите её.\n"
               if debt["claimed"] else "")
            + "Правило «сначала оплата этапа — потом файл». Что делаем?",
            reply_markup=kb.chat_file_gate(o, debt["part"]))
    else:
        return False
    return True


@core.message(_mapped_reply)
async def reply_to_client(m: Message, map_row, state: FSMContext) -> None:
    """Reply на сообщение клиента / карточку заказа → доставка клиенту."""
    client_id = map_row["client_id"]
    order_id = map_row["order_id"]
    if order_id and await _gate_chat_document(m, state, order_id):
        return
    no = config.order_no(order_id) if order_id else None
    header = f"📩 <b>Мастерская</b>" + (f" · заказ {no}" if no else "") + ":"
    delivered_tg = False
    try:
        delivered_tg = await notify.relay_to_client(m.bot, client_id, m, header)
    except Exception as e:  # noqa: BLE001
        await m.reply(texts.ADMIN_REPLY_FAIL.format(err=esc(str(e)[:120])))
        return
    client = await db.get_user(client_id)
    who = texts.user_link(client_id, client["first_name"] if client else None,
                          client["username"] if client else None)
    if order_id:
        await db.add_event(order_id, "admin_msg", (m.text or m.caption or m.content_type)[:200])
        # админ прислал файл в контексте заказа — сохраняем в картотеку
        if m.document:
            await db.add_file(order_id, "admin", m.document.file_id, m.document.file_unique_id,
                              m.document.file_name, m.document.file_size, "document")
        await db.msg_add(order_id, "master", m.text or m.caption,
                         kind="text" if m.text else str(m.content_type),
                         file_name=m.document.file_name if m.document else None,
                         tg_file_id=m.document.file_id if m.document else None)
        await mailer.master_message(order_id)
    if delivered_tg:
        await m.reply(texts.ADMIN_REPLY_SENT.format(who=who, order_part=f" · заказ {no}" if no else ""))
    else:
        # почтовый аккаунт сайта (id < 0): Telegram нет — доставила картотека
        await m.reply("📮 Клиент заходит по почте, без Telegram — сообщение в его "
                      "кабинете, копия ушла письмом" + (f" · заказ {no}" if no else "") + ".")


# ------------------------------------------------------------------ команды

@core.message(Command("orders"))
async def cmd_orders(m: Message) -> None:
    orders = await db.active_orders(limit=25)
    if not orders:
        await m.answer("Активных заказов нет. 🕊")
        return
    await m.answer(f"📚 <b>Активные заказы: {len(orders)}</b>",
                   reply_markup=kb.admin_orders_list(orders))


@core.message(Command("all"))
async def cmd_all(m: Message) -> None:
    orders = await db.orders_where("ORDER BY id DESC LIMIT 20")
    if not orders:
        await m.answer("Заказов ещё нет.")
        return
    await m.answer("🗄 <b>Последние 20 заказов</b>", reply_markup=kb.admin_orders_list(orders))


@core.message(Command("find"))
async def cmd_find(m: Message, command: CommandObject) -> None:
    q = (command.args or "").strip()
    if not q:
        await m.answer("Формат: <code>/find иванов</code> — ищет по теме, типу, нику и номеру.")
        return
    orders = await db.search_orders(q)
    if not orders:
        await m.answer(f"По «{esc(q)}» ничего не нашлось.")
        return
    await m.answer(f"🔎 Нашлось: {len(orders)}", reply_markup=kb.admin_orders_list(orders))


@core.message(Command("stats"))
async def cmd_stats(m: Message) -> None:
    w, mo = await db.stats(7), await db.stats(30)
    by = mo["by_status"]
    lines = [
        "📊 <b>Статистика</b>\n",
        f"За 7 дней: заявок <b>{w['new_n'] or 0}</b>, завершено <b>{w['done_n'] or 0}</b> "
        f"на <b>{config.fmt_money(w['done_sum'] or 0)} ₽</b>",
        f"За 30 дней: заявок <b>{mo['new_n'] or 0}</b>, завершено <b>{mo['done_n'] or 0}</b> "
        f"на <b>{config.fmt_money(mo['done_sum'] or 0)} ₽</b>\n",
        "Сейчас по статусам:",
    ]
    for s in config.STATUSES:
        n = by.get(s.id, 0)
        if n:
            lines.append(f"  {s.emoji} {s.label}: {n}")
    lines.append(f"\nВсего клиентов: {mo['users']} · лидов с сайта: {mo['leads']}")
    await m.answer("\n".join(lines))


# ------------------------------------------------- набор месяца: брони мест

def _slots_text(s: dict) -> str:
    free = max(0, s["quota"] - s["taken"])
    if not s["quota"]:
        head = ("🎟 <b>Набор месяца выключен</b> — плашек на сайте нет.\n"
                "Задайте квоту кнопкой «Квота +1» — и сайт начнёт показывать "
                "живой счётчик мест.")
    elif free:
        head = (f"🎟 <b>Набор на {s['month']}: свободно {free} из "
                f"{s['quota']}</b>\nТак это видят гости — на обложке главной, "
                "в прейскуранте и в смете.")
    else:
        head = (f"🎟 <b>Набор на {s['month']} закрыт: занято {s['taken']} из "
                f"{s['quota']}</b>\nСайт пишет «идёт запись на {s['next']}».")
    return (head + "\n\n"
            f"Занято мест: <b>{s['taken']}</b>\n"
            f" · заявки картотеки — <b>{s['auto']}</b>, считаются сами\n"
            f" · брони мастера — <b>{s['extra']}</b>\n\n"
            "«Бронь» — реальная договорённость вне картотеки: личка, ВК, "
            "постоянный клиент. Нажали «➕» — счётчик на сайте сразу вырос. "
            "Когда такая договорённость оформится заявкой, снимите бронь "
            "«➖», чтобы место не посчиталось дважды.")


def _slots_kb(s: dict) -> kb.Kb:
    return kb.Kb(inline_keyboard=[
        [kb.Btn(text="➕ Место забронировано", callback_data="sl:x:1"),
         kb.Btn(text="➖ Снять бронь", callback_data="sl:x:-1")],
        [kb.Btn(text="Квота −1", callback_data="sl:q:-1"),
         kb.Btn(text=f"Квота: {s['quota']}", callback_data="sl:r"),
         kb.Btn(text="Квота +1", callback_data="sl:q:1")],
        [kb.Btn(text="🔄 Обновить счётчик", callback_data="sl:r")],
    ])


@core.message(Command("dep"))
async def cmd_dep(m: Message, command: CommandObject) -> None:
    """Депозиты: `/dep` — последние пополнения и кошельки;
    `/dep refund <id>` — закрыть пополнение по правилам 5а.6."""
    from ..services import deposit
    args = (command.args or "").split()
    if args and args[0] == "refund" and len(args) > 1 and args[1].isdigit():
        ok, report, _money = await deposit.refund(int(args[1]), actor="мастер")
        await m.answer(("✅ " if ok else "⚠️ ") + report)
        return
    cur = await db.conn().execute(
        "SELECT * FROM deposits ORDER BY id DESC LIMIT 10")
    rows = await cur.fetchall()
    if not rows:
        await m.answer("💼 Депозитов пока нет.")
        return
    lines = ["💼 <b>Депозиты · последние 10</b>"]
    seen_users = set()
    for d in rows:
        mark = {"active": "🟢", "pending": "⏳", "refunded": "↩️",
                "canceled": "✖️"}.get(d["status"], "·")
        lines.append(
            f"{mark} №{d['id']} · {config.fmt_money(d['amount'])} ₽ "
            f"(+{config.fmt_money(d['bonus_amount'])} бон.) · "
            f"<a href=\"tg://user?id={d['user_id']}\">клиент</a> · {d['status']}"
            + (f" · {d['via']}" if d["via"] else ""))
        seen_users.add(d["user_id"])
    for uid in list(seen_users)[:6]:
        lines.append(f"— кошелёк <a href=\"tg://user?id={uid}\">клиента</a>: "
                     f"<b>{config.fmt_money(await deposit.balance(uid))} ₽</b>")
    lines.append("\nВозврат: <code>/dep refund &lt;номер&gt;</code> — посчитает "
                 "удержания и снимет остаток; деньги переводите сами.")
    await m.answer("\n".join(lines))


@core.message(Command("slots"))
async def cmd_slots(m: Message) -> None:
    from .. import webapp
    await m.answer(_slots_text(await webapp.slots_state()),
                   reply_markup=_slots_kb(await webapp.slots_state()))


@core.callback_query(F.data.startswith("sl:"))
async def cb_slots(cb: CallbackQuery) -> None:
    from .. import webapp
    parts = cb.data.split(":")
    s = await webapp.slots_state()
    note = "Обновлено"
    if parts[1] == "x":
        d = int(parts[2])
        if d < 0 and s["extra"] <= 0:
            note = "Броней и так нет"
        else:
            await db.setting_set("slots_extra",
                                 str(max(0, min(500, s["extra"] + d))))
            if d > 0:
                note = ("Бронь отмечена — сайт уже показывает"
                        if s["quota"] else
                        "Бронь отмечена. Квота 0 — плашка на сайте скрыта!")
            else:
                note = "Бронь снята"
    elif parts[1] == "q":
        new = max(0, min(500, s["quota"] + int(parts[2])))
        await db.setting_set("slots_quota", str(new))
        note = f"Квота: {new}" if new else "Квота 0 — набор скрыт с сайта"
    s = await webapp.slots_state()
    try:
        await cb.message.edit_text(_slots_text(s), reply_markup=_slots_kb(s))
    except Exception:  # noqa: BLE001  — текст не изменился (двойной тап)
        pass
    await cb.answer(note)


@core.message(Command("dm"))
async def cmd_dm(m: Message) -> None:
    """Дубли алертов в личку: quiet — только когда группа недоступна (по умолчанию), all — всегда."""
    cur = await db.setting_get("admin_dm", "quiet")
    new = "all" if cur != "all" else "quiet"
    await db.setting_set("admin_dm", new)
    if new == "quiet":
        await m.answer("🔕 Личные дубли выключены: всё по заказам собирается в рабочей группе, "
                       "в личку — только если группа недоступна. Вернуть: /dm")
    else:
        await m.answer("🔔 Личные дубли включены: алерты приходят и в группу, и сюда. Отключить: /dm")


@core.message(Command("requisites"))
async def cmd_requisites(m: Message, state: FSMContext) -> None:
    req = await db.setting_get("requisites")
    await state.set_state(AReq.waiting)
    if req:
        await m.answer(texts.REQUISITES_CURRENT.format(req=esc(req)))
    else:
        await m.answer(texts.REQUISITES_NONE)


_MENU_LABELS = {kb.BTN_NEW, kb.BTN_ORDERS, kb.BTN_ASK, kb.BTN_INFO, kb.BTN_BONUS,
                kb.ADM_ORDERS, kb.ADM_STATS}


@core.message(AReq.waiting, F.text)
async def save_requisites(m: Message, state: FSMContext) -> None:
    text = (m.text or "").strip()
    if text.startswith("/"):
        await state.clear()
        await m.answer("Ок, реквизиты не меняю.")
        return
    # защита от случайного нажатия кнопки меню (так реквизиты однажды
    # превратились в «💎 Мои бонусы») и от текстов без единой цифры
    if text in _MENU_LABELS:
        await m.answer("Это кнопка меню, а не реквизиты — не сохраняю. "
                       "Пришлите текст реквизитов (карта/СБП) или /cancel.")
        return
    if not any(ch.isdigit() for ch in text):
        await m.answer("В тексте нет ни одной цифры — на реквизиты не похоже, не сохраняю. "
                       "Пришлите карту или телефон СБП ещё раз.")
        return
    await state.clear()
    await db.setting_set("requisites", text[:800])
    await m.answer(texts.REQUISITES_SAVED + "\n\nКлиенты увидят:\n<code>" + esc(text[:800]) + "</code>")


# ------------------------------------------------------------- карточка

@core.callback_query(F.data.startswith("ad:card:"))
async def cb_card(cb: CallbackQuery) -> None:
    order_id = int(cb.data.split(":")[2])
    o = await db.get_order(order_id)
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    client = await db.get_user(o["user_id"]) if o["user_id"] else None
    files = await db.files_for_order(order_id)
    events = await db.events_for_order(order_id)
    items = await db.items_for_order(order_id)
    from ..services.gift import order_gift_info
    gift = await order_gift_info(o)
    try:
        card = texts.admin_order_card(o, client, files, events, gift=gift)
        card += texts.admin_order_items(items, 3900 - len(card))
        await cb.message.edit_text(card,
                                   reply_markup=kb.admin_order(o))
        if o["user_id"]:
            await db.map_put(cb.message.chat.id, cb.message.message_id, o["user_id"], order_id)
    except Exception:  # noqa: BLE001 — «not modified» и пр.
        pass
    await cb.answer()


@core.callback_query(F.data.startswith("ad:more:"))
async def cb_more(cb: CallbackQuery) -> None:
    order_id = int(cb.data.split(":")[2])
    await cb.message.edit_reply_markup(reply_markup=kb.admin_more_kb(order_id))
    await cb.answer("Дополнительные действия")


@core.callback_query(F.data.startswith("ad:tgsync:"))
async def cb_tg_sync(cb: CallbackQuery) -> None:
    order_id = int(cb.data.split(":")[2])
    res = await notify.order_snapshot(
        cb.bot, order_id,
        "📌 Мастерская прислала актуальную карточку вашего дела. Здесь будут "
        "появляться все сообщения, этапы оплаты и готовые файлы.")
    if res.get("ok"):
        await cb.answer("Карточка отправлена клиенту в Telegram ✓", show_alert=True)
    elif res.get("error") == "telegram_not_linked":
        await cb.answer("Клиент ещё не запустил бота — скопируйте ему ссылку приглашения в админке сайта.",
                        show_alert=True)
    else:
        await cb.answer("Telegram недоступен или клиент заблокировал бота. Ссылка на кабинет продолжает работать.",
                        show_alert=True)


@core.callback_query(F.data.startswith("ad:hfwait:"))
async def cb_handoff_wait(cb: CallbackQuery) -> None:
    await cb.answer("Следующий шаг произойдёт автоматически", show_alert=True)


@core.callback_query(F.data.startswith("ad:plan:"))
async def cb_set_plan(cb: CallbackQuery) -> None:
    """Кнопки плана сдачи/оплаты (1 · 2 · 3): работают до цены и после,
    пока работа не началась. Предоплату set_plan подгоняет сам."""
    _, _, oid, n_raw = cb.data.split(":")
    order_id, n = int(oid), int(n_raw)
    o = await db.get_order(order_id)
    if not o or n not in (1, 2, 3):
        await cb.answer("Не получилось", show_alert=True)
        return
    if o["status"] not in ("new", "priced", "prepay"):
        await cb.answer("Работа уже идёт — план сдачи не меняем", show_alert=True)
        return
    if (o["stages_total"] or (2 if not o["price"] else 1)) == n:
        await cb.answer("Этот план уже выбран")
        return
    await flow.set_plan(order_id, n)
    o = await db.get_order(order_id)
    label = {1: "сдача целиком, оплата 50/50",
             2: "2 части · оплата 50/50",
             3: "3 части · оплата 30/40/30"}[n]
    note = ""
    if o["price"] and o["status"] in ("priced", "prepay"):
        note = (f" Первый платёж теперь {config.fmt_money(o['prepay'])} ₽."
                " Клиент видел старое предложение? Нажмите «Изменить цену» —"
                " уйдёт обновлённое.")
    await notify.refresh_admin_card(cb.bot, cb.message, order_id)
    await cb.answer(f"План: {label}.{note}", show_alert=bool(note))


@core.callback_query(F.data.startswith("ad:stmenu:"))
async def cb_status_menu(cb: CallbackQuery) -> None:
    order_id = int(cb.data.split(":")[2])
    await cb.message.edit_reply_markup(reply_markup=kb.admin_status_menu(order_id))
    await cb.answer()


@core.callback_query(F.data.startswith("ad:st:"))
async def cb_set_status(cb: CallbackQuery) -> None:
    _, _, oid, status = cb.data.split(":")
    order_id = int(oid)
    o = await db.get_order(order_id)
    if not o or status not in config.ST:
        await cb.answer("Не получилось", show_alert=True)
        return
    if o["status"] == status:
        await cb.answer("Уже в этом статусе")
        return
    await db.set_status(order_id, status, "вручную")
    await notify.refresh_admin_card(cb.bot, cb.message, order_id)
    await cb.answer(f"Статус: {config.ST[status].label}")
    await notify.status_changed(cb.bot, order_id)
    await grp.status_sync(cb.bot, order_id)
    if status == "done":
        await flow.offer_defense(cb.bot, order_id)


@core.callback_query(F.data.startswith("ad:pay:"))
async def cb_confirm_payment(cb: CallbackQuery) -> None:
    """Первый клик только фиксирует точную цель и просит подтверждение.

    Старое сообщение остаётся в Telegram навсегда, поэтому само нажатие
    ``ad:pay`` не проводит деньги и не может случайно закрыть следующий этап.
    """
    order_id = int(cb.data.split(":")[2])
    o = await db.get_order(order_id)
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    pays = await db.payments_for_order(order_id)
    claimed = [p for p in pays if p["status"] == "claimed"]
    if len(claimed) > 1:
        await cb.answer("На сверке несколько отметок — откройте админку сайта",
                        show_alert=True)
        return
    if claimed:
        target = claimed[0]
        kind, amount = target["kind"], int(target["amount"] or 0)
    else:
        kind, amount = payments.confirm_target(o, pays)
        if amount <= 0:
            await cb.answer("К оплате ничего не созрело", show_alert=True)
            return
        candidates = [
            p for p in pays if p["status"] == "pending" and p["kind"] == kind
            and int(p["amount"] or 0) == amount
        ]
        # Из счетов-близнецов актуальным считаем последний; после проведения
        # остальные будут атомарно погашены.
        target = candidates[-1] if candidates else None
    pay_id = int(target["id"]) if target else 0
    markup = kb.Kb(inline_keyboard=[
        [kb.Btn(
            text=f"Да, получено {config.fmt_money(amount)} ₽",
            callback_data=f"ad:payok:{order_id}:{kind}:{amount}:{pay_id}")],
        [kb.Btn(text="Отмена · вернуться к карточке",
                callback_data=f"ad:card:{order_id}")],
    ])
    await cb.message.edit_reply_markup(reply_markup=markup)
    await cb.answer("Проверьте сумму и подтвердите вторым нажатием")


@core.callback_query(F.data.startswith("ad:payok:"))
async def cb_confirm_payment_exact(cb: CallbackQuery) -> None:
    """Провести только цель, зафиксированную экраном подтверждения."""
    try:
        _, _, raw_oid, kind, raw_amount, raw_pay_id = cb.data.split(":")
        order_id, amount, pay_id = int(raw_oid), int(raw_amount), int(raw_pay_id)
    except (TypeError, ValueError):
        await cb.answer("Повреждённая или устаревшая кнопка", show_alert=True)
        return
    o = await db.get_order(order_id)
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    pays = await db.payments_for_order(order_id)
    current_kind, current_amount = payments.confirm_target(o, pays)
    if current_kind != kind or current_amount != amount or amount <= 0:
        await cb.answer("Эта сумма уже неактуальна — откройте свежую карточку",
                        show_alert=True)
        return
    if pay_id:
        target = next((p for p in pays if p["id"] == pay_id), None)
        if (not target or target["status"] not in ("pending", "claimed")
                or target["kind"] != kind
                or int(target["amount"] or 0) != amount):
            await cb.answer("Этот платёж уже обработан или устарел", show_alert=True)
            return
    conducted = await payments.confirm(
        cb.bot, order_id, kind, amount, actor="кнопка мастера",
        pay_id=pay_id or None, allow_create=not pay_id)
    if not conducted.get("ok") or conducted.get("duplicate_callback"):
        await cb.answer("Эта отметка уже обработана или устарела", show_alert=True)
        return
    await notify.refresh_admin_card(cb.bot, cb.message, order_id)
    await cb.answer(f"Оплата {config.fmt_money(amount)} ₽ подтверждена ✓")
    await grp.send(cb.bot, order_id,
                   f"✅ Оплата подтверждена: {config.fmt_money(amount)} ₽ "
                   f"({payments.stage_label(o, kind).lower()}).")
    await grp.status_sync(cb.bot, order_id)


@core.callback_query(F.data.startswith("ad:resume:"))
async def cb_admin_resume(cb: CallbackQuery) -> None:
    order_id = int(cb.data.split(":")[2])
    o = await db.get_order(order_id)
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    await flow.resume_order(cb.bot, order_id, "мастер", via="бот", by_master=True)
    await notify.refresh_admin_card(cb.bot, cb.message, order_id)
    await cb.answer("Возобновлён")


@router.callback_query(F.data.startswith("ad:rvok:"))
@router.callback_query(F.data.startswith("ad:rvno:"))
async def cb_review_moderate(cb: CallbackQuery) -> None:
    """Модерация отзыва из ветки заказа или лички (доступно и в группе)."""
    approve = cb.data.startswith("ad:rvok:")
    review_id = int(cb.data.split(":")[2])
    result = await flow.moderate_review(cb.bot, review_id, approve)
    if result == "not_found":
        await cb.answer("Отзыв не найден", show_alert=True)
        return
    if result == "consent_required":
        await cb.answer(
            "Публикация заблокирована: клиент не дал отдельного согласия",
            show_alert=True,
        )
        return
    try:
        await cb.message.edit_reply_markup(reply_markup=None)
        await cb.message.edit_text(
            cb.message.html_text + "\n\n" +
            ("✅ <i>Опубликован на сайте</i>" if approve else "🚫 <i>Отклонён — на сайт не попадёт</i>"))
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("Опубликован ✓" if approve else "Отклонён")


@router.callback_query(F.data.startswith("ad:tipok:"))
@router.callback_query(F.data.startswith("ad:tipno:"))
async def cb_tip_confirm(cb: CallbackQuery) -> None:
    """Ручная сверка благодарности, когда онлайн-касса не подключена."""
    approve = cb.data.startswith("ad:tipok:")
    tip_id = int(cb.data.split(":")[2])
    tip = await db.tip_get(tip_id)
    if not tip:
        await cb.answer("Запись не найдена", show_alert=True)
        return
    changed = await (db.tip_mark_paid(tip_id) if approve else db.tip_cancel(tip_id))
    if not changed:
        await cb.answer("Уже сверено", show_alert=True)
        return
    o = await db.get_order(tip["order_id"])
    amount = config.fmt_money(tip["amount"])
    text = (f"💛 Спасибо! Благодарность {amount} ₽ получена и отмечена в заказе."
            if approve else
            "Пока не нашли перевод благодарности. Проверьте реквизиты или напишите "
            "мастеру — заказ и правки от этого не зависят.")
    await db.add_event(tip["order_id"], "tip_paid" if approve else "tip_unclaimed",
                       f"{tip['amount']} ₽ · ручная сверка")
    await db.msg_add(tip["order_id"], "master", text)
    if o and o["user_id"] and o["user_id"] > 0:
        await notify.notify_client(cb.bot, o["user_id"], text, order_id=o["id"])
    try:
        await cb.message.edit_reply_markup(reply_markup=None)
        await cb.message.edit_text(
            cb.message.html_text + ("\n\n✅ <i>Получено</i>" if approve
                                    else "\n\n↩️ <i>Перевод не найден</i>"))
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("Спасибо отмечено ✓" if approve else "Отметка снята")


# ---------------------------------------------------------------- цена

@core.callback_query(F.data.startswith("ad:price:"))
async def cb_price(cb: CallbackQuery, state: FSMContext) -> None:
    order_id = int(cb.data.split(":")[2])
    o = await db.get_order(order_id)
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    from ..services.gift import order_gift_info
    gift_hint = texts.price_gift_hint(o, await order_gift_info(o))
    if cb.message.chat.type != "private":
        # в группе — пресеты кнопками и «ответьте числом», без команд
        await cb.message.reply(
            f"💰 Цена для заказа {config.order_no(order_id)}. Выберите кнопкой "
            "или <b>ответьте на это сообщение</b> числом:\n"
            "<code>35000</code> · <code>35000/15000</code> (цена/первый платёж) · "
            "<code>35000/15000/3</code> (…/частей 1–3)" + gift_hint,
            reply_markup=kb.group_price_kb(o))
        await cb.answer()
        return
    await state.set_state(APrice.waiting)
    await state.update_data(price_order_id=order_id)
    await cb.message.answer(
        texts.PRICE_ASK.format(no=config.order_no(order_id)) + gift_hint,
        reply_markup=kb.group_price_kb(o))
    await cb.answer()


@core.message(APrice.waiting, F.text)
async def got_price(m: Message, state: FSMContext) -> None:
    if m.text.startswith("/") or m.text.lower().strip() in ("отмена", "cancel"):
        await state.clear()
        await m.answer("Ок, цену не меняю.")
        return
    nums = re.findall(r"\d[\d\s]*", m.text.replace("к", "000").replace("k", "000"))
    vals = [int(re.sub(r"\s", "", n)) for n in nums if re.sub(r"\s", "", n)]
    if not vals or vals[0] <= 0:
        await m.answer("Не разобрал сумму. Пример: <code>35000</code> или <code>35000 10000</code>")
        return
    data = await state.get_data()
    order_id = data["price_order_id"]
    await state.clear()
    # единая точка цены: статус, оферта, автоскидка подписки, спека, синк группы
    res = await flow.set_price(m.bot, order_id, vals[0],
                               vals[1] if len(vals) > 1 else None, via="личка мастера")
    if not res.get("ok"):
        await m.answer("Заказ пропал или сумма не подошла 🤔")
        return
    no = config.order_no(order_id)
    if res.get("delivered_tg") is False:
        tail = "\n⚠️ Но доставить в Telegram не удалось (клиент заблокировал бота?) — предложение видно в кабинете сайта."
    elif res.get("delivered_tg") is None:
        tail = "\nКлиент без Telegram — предложение в его кабинете на сайте, а на почту (если она есть) уже ушло письмом."
    else:
        tail = ""
    if res.get("sub_discount"):
        tail += f"\n⭐ У клиента подписка: скидка −{config.fmt_money(res['sub_discount'])} ₽ применена сама."
    ms = texts.money_summary_master(res.get("due") or {})
    if ms:
        tail += "\n" + ms
    await m.answer(texts.PRICE_SET_OK.format(no=no, price=config.fmt_money(res["price"]),
                                             prepay=config.fmt_money(res["prepay"])) + tail)


# ------------------------------------------------- «Открытая приёмная»

@core.callback_query(F.data.startswith("qa:ans:"))
async def cb_qa_answer(cb: CallbackQuery, state: FSMContext) -> None:
    """«Ответить» на вопрос приёмной: следующее сообщение — ответ."""
    from ..services import qa as qa_svc
    qa_id = int(cb.data.split(":")[2])
    r = await db.qa_get(qa_id)
    if not r:
        await cb.answer("Вопрос не найден (удалён?)", show_alert=True)
        return
    await state.set_state(QAnswer.waiting)
    await state.update_data(qa_id=qa_id)
    mode = ("ответ уйдёт автору письмом, БЕЗ публикации"
            if r["quiet"] else "пара опубликуется в приёмной"
            + (" и уйдёт автору письмом" if r["email"] else ""))
    await cb.message.answer(
        f"✍️ Ответ на вопрос {qa_svc.num_label(qa_id)} — следующим сообщением "
        f"({mode}). Отредактировать формулировку вопроса можно в админке. "
        "«Отмена» — передумать.")
    await cb.answer()


@core.message(QAnswer.waiting, F.text)
async def got_qa_answer(m: Message, state: FSMContext) -> None:
    from ..services import qa as qa_svc
    if m.text.startswith("/") or m.text.lower().strip() in ("отмена", "cancel"):
        await state.clear()
        await m.answer("Ок, вопрос остался в очереди приёмной.")
        return
    data = await state.get_data()
    await state.clear()
    res = await qa_svc.answer(m.bot, data["qa_id"], m.text)
    if not res.get("ok"):
        await m.answer("Не получилось: вопрос удалён или ответ слишком короткий.")
        return
    r = res["qa"]
    if res.get("published"):
        await m.answer(
            f"📮 Опубликовано: {config.SITE_URL}/priyomnaya.html#q{r['id']}"
            + (" · автору ушло письмо" if r["email"] else ""))
    else:
        await m.answer("🤫 Ответ ушёл автору письмом — в ленту не публиковался."
                       if r["email"] else "Сохранено без публикации.")


@core.callback_query(F.data.startswith("qa:rej:"))
async def cb_qa_reject(cb: CallbackQuery) -> None:
    from ..services import qa as qa_svc
    qa_id = int(cb.data.split(":")[2])
    ok = await qa_svc.reject(qa_id)
    if ok:
        try:
            await cb.message.edit_text(cb.message.html_text +
                                       "\n\n🚫 <b>Отклонён</b> — в ленту не попадёт.")
        except Exception:  # noqa: BLE001
            pass
    await cb.answer("Отклонён" if ok else "Не найден")


@core.message(Command("qa"))
async def cmd_qa(m: Message) -> None:
    """Очередь приёмной: неотвеченные вопросы с кнопками."""
    from ..services import qa as qa_svc
    rows = await db.qa_list("pending", 20)
    counts = await db.qa_counts()
    if not rows:
        await m.answer("📮 Очередь приёмной пуста. Опубликовано пар: "
                       f"{counts['published']}.")
        return
    await m.answer(f"📮 В приёмной ждут ответа: {len(rows)}")
    for r in rows[:5]:
        quiet = " · 🤫 тихий" if r["quiet"] else ""
        mail = " · 📧" if r["email"] else ""
        await m.answer(
            f"<b>{qa_svc.num_label(r['id'])}</b> · {esc(r['pseudonym'] or 'Аноним')}"
            f"{quiet}{mail} · {qa_svc.ru_date(r['created_at'])}\n"
            f"<i>{esc(r['question'])}</i>",
            reply_markup=kb.qa_moderate(r["id"]))


# ------------------------------------------- часть готова / финал под оплату

@core.callback_query(F.data.startswith("ad:partrdy:"))
async def cb_part_ready(cb: CallbackQuery) -> None:
    """«Часть N готова»: клиенту счёт этапа, файл придерживается до оплаты."""
    order_id = int(cb.data.split(":")[2])
    res = await flow.part_ready(cb.bot, order_id, via="кнопка мастера")
    if not res.get("ok"):
        msg = {"already": "Счёт по этой части уже выставлен — поторопить клиента "
                          "можно кнопкой «🔔 Напомнить об оплате»",
               "not_in_work": "Готовность объявляется, пока заказ в работе или правках"}
        await cb.answer(msg.get(res.get("error"), "Не получилось"), show_alert=True)
        return
    if res.get("due", 0) <= 0:
        await cb.answer("Этап уже оплачен — просто передайте часть файлом", show_alert=True)
    else:
        await cb.answer(f"Клиент получил счёт на {config.fmt_money(res['due'])} ₽ за часть "
                        f"{res.get('part')}. Файл придержите — напомним после оплаты",
                        show_alert=True)
    try:
        o = await db.get_order(order_id)
        await cb.message.edit_reply_markup(reply_markup=kb.admin_order(o))
    except Exception:  # noqa: BLE001
        pass


@core.callback_query(F.data.startswith("ad:finrdy:"))
async def cb_final_ready(cb: CallbackQuery) -> None:
    """«Финал готов»: клиенту счёт на остаток, файл придерживается до оплаты."""
    order_id = int(cb.data.split(":")[2])
    res = await flow.final_ready(cb.bot, order_id, via="кнопка мастера")
    if not res.get("ok"):
        msg = {"already": "Счёт уже выставлен — поторопить клиента можно кнопкой "
                          "«🔔 Напомнить об оплате»",
               "not_in_work": "Финал объявляется, пока заказ в работе или правках"}
        await cb.answer(msg.get(res.get("error"), "Не получилось"), show_alert=True)
        return
    if res.get("due", 0) <= 0:
        await cb.answer("Оплата уже закрыта — просто сдайте финал файлом", show_alert=True)
    else:
        await cb.answer(f"Клиент получил счёт на {config.fmt_money(res['due'])} ₽. "
                        "Файл придержите — напомним после оплаты", show_alert=True)
    try:
        o = await db.get_order(order_id)
        await cb.message.edit_reply_markup(reply_markup=kb.admin_order(o))
    except Exception:  # noqa: BLE001
        pass


# ------------------------------------------------------- вход в веб-кабинет

@core.message(Command("panel"))
@core.message(F.text == kb.ADM_PANEL)
async def cmd_panel(m: Message) -> None:
    """Одноразовая ссылка входа в «Кабинет мастера» на сайте — без команд и танцев."""
    if m.chat.type != "private":
        await m.reply("Ссылку входа даю только в личке — напишите боту /panel.")
        return
    from .. import webapp
    key = webapp.admin_login_key(m.from_user.id)
    await m.answer(
        "🖥 <b>Кабинет мастера на сайте</b>\n\n"
        f"{config.SITE_URL}/admin.html#alk={key}\n\n"
        "Ссылка одноразовая, действует 10 минут — откройте на любом устройстве, "
        "вход произойдёт сам. Доступ только у мастеров; чтобы добавить человека, "
        "напишите его Telegram-id в ADMIN_IDS на сервере.")


@core.callback_query(F.data.startswith("ad:panel:"))
async def cb_panel_order(cb: CallbackQuery) -> None:
    """«Открыть в админке»: одноразовый вход сразу на карточку этого дела.

    В группе ссылку не светим (пусть даже там одни мастера) — она уходит
    в личку нажавшему; в личке отвечаем прямо здесь.
    """
    order_id = int(cb.data.split(":")[2])
    from .. import webapp
    key = webapp.admin_login_key(cb.from_user.id)
    text = (f"🖥 <b>Дело №{order_id} в кабинете мастера</b>\n\n"
            f"{config.SITE_URL}/admin.html#alk={key}&o={order_id}\n\n"
            "Ссылка одноразовая, действует 10 минут: вход произойдёт сам, "
            "карточка дела откроется сразу.")
    if cb.message and cb.message.chat.type == "private":
        await cb.message.answer(text)
        await cb.answer("Ссылка ниже — живёт 10 минут")
        return
    try:
        await cb.bot.send_message(cb.from_user.id, text)
        await cb.answer("Ссылка входа — в личке бота (живёт 10 минут)", show_alert=True)
    except Exception:  # noqa: BLE001 — мастер ещё не нажимал Start у бота
        await cb.answer("Не могу написать вам в личку — откройте бота, нажмите "
                        "Start и повторите. Или команда /panel в личке.",
                        show_alert=True)


# ------------------------------------------------------------ сдача работы

@core.callback_query(F.data.startswith("ad:deliver:"))
async def cb_deliver(cb: CallbackQuery, state: FSMContext) -> None:
    order_id = int(cb.data.split(":")[2])
    o = await db.get_order(order_id)
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    if cb.message.chat.type != "private":
        await cb.answer("В группе просто пришлите файл в ветку заказа — "
                        "бот спросит, сдача это или просто файл.", show_alert=True)
        return
    # правило владельца: «сначала оплата части — потом файл»
    debt = await flow.deliver_debt(o)
    if debt["amount"] > 0:
        await cb.message.answer(
            f"✋ <b>Сдача придержана: за {flow.part_label(o, debt['part'])} не оплачено "
            f"{flow.debt_line(debt)}.</b>\n\n"
            + ("Клиент отметил оплату — сверьте поступление и подтвердите кнопкой "
               "«✅ Оплата получена», затем передайте файл.\n\n" if debt["claimed"] else
               "Мы работаем по правилу «сначала оплата этапа — потом файл»: "
               "выставьте счёт или покажите работу защищённым предпросмотром.\n\n")
            + "Что делаем?",
            reply_markup=kb.deliver_gate_kb(o, debt["part"]))
        await cb.answer("Этап не оплачен — файл придержан")
        return
    await state.set_state(ADeliver.waiting)
    await state.update_data(deliver_order_id=order_id, delivered_n=0)
    total = o["stages_total"] or 1
    part_note = (f"\n<i>Сдаёте часть {o['stage'] or 1} из {total} — статусы и оплата "
                 "этапа посчитаются сами.</i>" if total > 1 else "")
    hint = "" if o["user_id"] else "\n<i>Клиент без Telegram — файл появится в его кабинете на сайте.</i>"
    await cb.message.answer(texts.DELIVER_ASK.format(no=config.order_no(order_id))
                            + part_note + hint)
    await cb.answer()


@core.callback_query(F.data.startswith("ad:forcedel:"))
async def cb_force_deliver(cb: CallbackQuery, state: FSMContext) -> None:
    """Осознанный обход правила: мастер передаёт файл до оплаты этапа."""
    order_id = int(cb.data.split(":")[2])
    o = await db.get_order(order_id)
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    await state.set_state(ADeliver.waiting)
    await state.update_data(deliver_order_id=order_id, delivered_n=0, deliver_force=1)
    await cb.message.answer(
        f"⚠️ Ок, передаём <b>без оплаты</b> (заказ {config.order_no(order_id)}) — "
        "решение останется в хронике дела. Пришлите файл (или несколько): "
        "клиент получит его с кнопками приёмки, счёт этапа останется висеть.")
    await cb.answer("Режим сдачи без оплаты")


@core.message(ADeliver.waiting, F.document | F.photo)
async def got_delivery(m: Message, state: FSMContext) -> None:
    data = await state.get_data()
    order_id = data["deliver_order_id"]
    n = data.get("delivered_n", 0)
    force = bool(data.get("deliver_force"))
    o = await db.get_order(order_id)
    if not o:
        await state.clear()
        return
    if not force:
        # оплата могла «испариться» между кнопкой и файлом — проверяем у самой двери
        debt = await flow.deliver_debt(o)
        if debt["amount"] > 0:
            await state.clear()
            await m.reply(
                f"✋ Файл НЕ отправлен: за {flow.part_label(o, debt['part'])} не оплачено "
                f"{flow.debt_line(debt)}. Правило «сначала оплата — потом файл».",
                reply_markup=kb.deliver_gate_kb(o, debt["part"]))
            return
    no = config.order_no(order_id)
    total = o["stages_total"] or 1
    part = o["stage"] or 1
    cap = (f"📦 Заказ {no} — результат этапа {part} из {total}" if total > 1
           else f"📦 Заказ {no} — согласованный результат")
    fname = m.document.file_name if m.document else None
    try:
        if o["user_id"] and o["user_id"] > 0:  # почтовый (id<0) берёт файл в кабинете
            if m.document:
                await m.bot.send_document(o["user_id"], m.document.file_id, caption=cap)
            else:
                await m.bot.send_photo(o["user_id"], m.photo[-1].file_id, caption=cap)
        if m.document:
            await db.add_file(order_id, "admin", m.document.file_id, m.document.file_unique_id,
                              m.document.file_name, m.document.file_size, "document", part=part)
        else:
            ph = m.photo[-1]
            await db.add_file(order_id, "admin", ph.file_id, ph.file_unique_id,
                              None, ph.file_size, "photo", part=part)
    except Exception as e:  # noqa: BLE001
        await m.reply(texts.ADMIN_REPLY_FAIL.format(err=esc(str(e)[:120])))
        return
    await db.msg_add(order_id, "master",
                     cap.replace("📦 ", "📦 Сдано: ") + " — файл во вкладке «Файлы»",
                     kind="document" if m.document else "photo",
                     file_name=fname,
                     tg_file_id=m.document.file_id if m.document else m.photo[-1].file_id)
    # копия сдачи — в ветку заказа, чтобы вся история жила в группе
    await grp.relay_copy(m.bot, order_id, m, f"📦 Сдача · {cap.split('—', 1)[-1].strip()} · заказ {no}")
    next_kb = None
    if n == 0:
        await flow.deliver_part(m.bot, order_id, part, via="личка бота", force=force)
        o2 = await db.get_order(order_id)
        pays2 = await db.payments_for_order(order_id)
        _, due2 = payments.due_now(o2, pays2)
        next_kb = kb.after_deliver_kb(o2, due2 if due2 > 0 else 0,
                                      any(p["status"] == "claimed" for p in pays2))
    await state.update_data(delivered_n=n + 1)
    where = "" if (o["user_id"] or 0) > 0 else " (кабинет сайта)"
    await m.reply(texts.DELIVER_SENT.format(no=no) + where +
                  ("\nМожно прислать ещё файл — или продолжайте работать, режим сам закроется." if n == 0 else ""),
                  reply_markup=next_kb)


@core.message(ADeliver.waiting)
async def deliver_exit(m: Message, state: FSMContext) -> None:
    await state.clear()
    await m.answer("Вышел из режима сдачи. Если это была команда — повторите её.")


# ------------------------------------------ предпросмотр и напоминание об оплате

@core.callback_query(F.data.startswith("ad:preview:"))
async def cb_preview(cb: CallbackQuery, state: FSMContext) -> None:
    """Загрузка полного исходника в безопасный сценарий выдачи."""
    order_id = int(cb.data.split(":")[2])
    o = await db.get_order(order_id)
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    if cb.message.chat.type != "private":
        await cb.answer("В группе пришлите файл в ветку с точкой в подписи — "
                        "бот сам предложит предпросмотр.", show_alert=True)
        return
    await state.set_state(APreview.waiting)
    await state.update_data(preview_order_id=order_id)
    await cb.message.answer(
        f"📄 <b>Согласованный результат · заказ {config.order_no(order_id)}.</b>\n\n"
        "Пришлите ОДИН полный исходник (PDF, DOCX, DOC, ODT, RTF, до 20 МБ). "
        "Бот сохранит его приватно, подготовит защищённую первую половину и сначала "
        "покажет её вам. Клиент ничего не получит до вашего подтверждения.")
    await cb.answer()


@core.message(APreview.waiting, F.document)
async def got_preview_file(m: Message, state: FSMContext) -> None:
    data = await state.get_data()
    await state.clear()
    order_id = data["preview_order_id"]
    doc = m.document
    wait_msg = await m.reply("🔒 Сохраняем оригинал и готовим первую защищённую часть…")
    try:
        f = await m.bot.get_file(doc.file_id)
        buf = await m.bot.download_file(f.file_path)
        payload = buf.read()
        payload, clean_name, clean_method = await sanitize.clean(
            payload, doc.file_name or "file.pdf")
        clean_msg = await m.bot.send_document(
            m.chat.id, BufferedInputFile(payload, filename=clean_name),
            caption="🗄 Очищенный приватный исходник · клиенту не отправлен")
        source_id = clean_msg.document.file_id
    except Exception as e:  # noqa: BLE001 — например, файл больше 20 МБ
        await wait_msg.edit_text(
            "⚠️ Не удалось скачать файл из Telegram "
            f"({esc(str(e)[:80])}). Файлы до 20 МБ — или через админку сайта.")
        return
    await db.add_event(order_id, "original_sanitized", f"{clean_name} · {clean_method}")
    res = await handoff.prepare(order_id, source_id, clean_name,
                                len(payload), payload, via="личка бота")
    if res.get("ok"):
        review = await m.answer_document(
            BufferedInputFile(res["bytes"], filename=res["filename"]),
            caption=(f"👁 <b>Проверка версии v{res['version']}.</b>\n"
                     + ("Это именно тот защищённый файл, который увидит клиент. "
                        "Откройте его и только затем нажмите отправку."
                        if res["mode"] == "protected" else
                        "Это исправленная полная версия без водяных знаков. "
                        "Проверьте и подтвердите отправку клиенту.")),
            reply_markup=kb.handoff_master_review_kb(
                order_id, res["artifact_id"], res["version"],
                clean=res["mode"] == "clean_revision"))
        if review.document:
            await handoff.set_review_file(res["artifact_id"], review.document.file_id)
        await wait_msg.edit_text(
            "✅ Файл подготовлен. Клиент его ещё не видел — откройте сообщение ниже "
            "и подтвердите отправку.")
    else:
        await wait_msg.edit_text("⚠️ " + {
            "preview_format": "Формат не поддержан — подходят PDF, DOCX, DOC, ODT, RTF.",
            "preview_failed": "Не получилось собрать предпросмотр — проверьте файл.",
            "relay_failed": "Файл подготовлен, но сохранить копию не удалось.",
        }.get(res.get("error"), "Не получилось — попробуйте ещё раз."))


@core.callback_query(F.data.startswith("ad:hfsend:"))
async def cb_handoff_send(cb: CallbackQuery) -> None:
    _, _, oid, aid = cb.data.split(":")
    res = await handoff.publish(cb.bot, int(oid), int(aid), via="подтверждение мастера")
    if not res.get("ok"):
        await cb.answer("Эта версия уже неактуальна или не готова", show_alert=True)
        return
    try:
        await cb.message.edit_reply_markup(reply_markup=None)
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("Отправлено клиенту ✓", show_alert=True)


@core.message(APreview.waiting)
async def preview_exit(m: Message, state: FSMContext) -> None:
    await state.clear()
    await m.answer("Вышел из режима загрузки. Вернуться можно кнопкой "
                   "«📄 Загрузить готовый результат» в карточке заказа.")


@core.callback_query(F.data.startswith("ad:sendplain:"))
async def cb_send_plain(cb: CallbackQuery, state: FSMContext) -> None:
    """«Это не работа»: придержанный в чат-пути файл уходит как обычный файл."""
    order_id = int(cb.data.split(":")[2])
    data = await state.get_data()
    if data.get("gate_file_order") != order_id or not data.get("gate_file_id"):
        await cb.answer("Не вижу придержанного файла — пришлите его ещё раз",
                        show_alert=True)
        return
    o = await db.get_order(order_id)
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    no = config.order_no(order_id)
    delivered = False
    if o["user_id"] and o["user_id"] > 0:  # почтовый (id<0) увидит файл в кабинете
        try:
            await cb.bot.send_document(o["user_id"], data["gate_file_id"],
                                       caption=f"📩 Мастерская · заказ {no}")
            delivered = True
        except Exception as e:  # noqa: BLE001
            await cb.answer(f"Не доставилось: {str(e)[:80]}", show_alert=True)
            return
    await db.add_file(order_id, "admin", data["gate_file_id"], None,
                      data.get("gate_file_name"), data.get("gate_file_size"), "document")
    await db.msg_add(order_id, "master", None, kind="document",
                     file_name=data.get("gate_file_name"),
                     tg_file_id=data["gate_file_id"])
    await db.add_event(order_id, "admin_file", (data.get("gate_file_name") or "файл")[:100])
    await mailer.master_message(order_id)
    await state.update_data(gate_file_order=None, gate_file_id=None)
    try:
        await cb.message.edit_text(
            "✉️ Отправлено как обычный файл (сдачей не считается, статус не менялся)."
            + ("" if delivered else " Клиент без Telegram — увидит его в кабинете сайта."))
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("Отправлено ✓")


@core.callback_query(F.data.startswith("ad:gateprep:"))
async def cb_prepare_held(cb: CallbackQuery, state: FSMContext) -> None:
    order_id = int(cb.data.split(":")[2])
    data = await state.get_data()
    if data.get("gate_file_order") != order_id or not data.get("gate_file_id"):
        await cb.answer("Не вижу файла — пришлите его ещё раз", show_alert=True)
        return
    wait = await cb.message.answer("🔒 Сохраняем оригинал и готовим защищённую часть…")
    try:
        f = await cb.bot.get_file(data["gate_file_id"])
        buf = await cb.bot.download_file(f.file_path)
        payload = buf.read()
        payload, clean_name, clean_method = await sanitize.clean(
            payload, data.get("gate_file_name") or "file.pdf")
        clean_msg = await cb.bot.send_document(
            cb.from_user.id, BufferedInputFile(payload, filename=clean_name),
            caption="🗄 Очищенный приватный исходник · клиенту не отправлен")
        source_id = clean_msg.document.file_id
    except Exception as e:  # noqa: BLE001
        await wait.edit_text(f"⚠️ Не удалось скачать файл: {esc(str(e)[:100])}")
        return
    await db.add_event(order_id, "original_sanitized", f"{clean_name} · {clean_method}")
    res = await handoff.prepare(
        order_id, source_id, clean_name, len(payload), payload, via="чат мастера")
    if not res.get("ok"):
        await wait.edit_text("⚠️ Не получилось подготовить файл — проверьте формат.")
        return
    review = await cb.message.answer_document(
        BufferedInputFile(res["bytes"], filename=res["filename"]),
        caption=f"👁 Проверка версии v{res['version']} · клиент ещё не видел.",
        reply_markup=kb.handoff_master_review_kb(
            order_id, res["artifact_id"], res["version"],
            clean=res["mode"] == "clean_revision"))
    if review.document:
        await handoff.set_review_file(res["artifact_id"], review.document.file_id)
    await state.update_data(gate_file_order=None, gate_file_id=None)
    await wait.edit_text("✅ Подготовлено. Откройте файл ниже и подтвердите отправку.")
    await cb.answer()


@core.callback_query(F.data.startswith("ad:remind:"))
async def cb_remind_pay(cb: CallbackQuery) -> None:
    """«Напомнить об оплате»: клиенту заново уходит счёт созревшего этапа."""
    order_id = int(cb.data.split(":")[2])
    res = await flow.remind_payment(cb.bot, order_id, via="кнопка мастера")
    if not res.get("ok"):
        msg = {"claimed": "Клиент уже отметил оплату — сверьте поступление и нажмите "
                          "«✅ Оплата получена»",
               "nothing_due": "Платить нечего: созревших неоплаченных этапов нет",
               "paused": "Дело на паузе — сначала снимите паузу",
               "not_active": "Заказ уже закрыт"}
        await cb.answer(msg.get(res.get("error"), "Не получилось"), show_alert=True)
        return
    if res.get("delivered_tg"):
        where = "в Telegram" + (" и на почту" if res.get("mailed") else "")
    elif res.get("mailed"):
        where = "на почту (Telegram недоступен)"
    else:
        where = "в кабинет сайта (счёт там и так виден)"
    await cb.answer(f"🔔 Напоминание {config.fmt_money(res['due'])} ₽ "
                    f"({res['label'].lower()}) ушло {where}", show_alert=True)


# ------------------------------------------------------- заметка/сообщение

@core.callback_query(F.data.startswith("ad:note:"))
async def cb_note(cb: CallbackQuery, state: FSMContext) -> None:
    order_id = int(cb.data.split(":")[2])
    if cb.message.chat.type != "private":
        await cb.answer("В группе заметка — сообщение с точкой в начале: «.текст». "
                        "Клиент её не увидит.", show_alert=True)
        return
    await state.set_state(ANote.waiting)
    await state.update_data(note_order_id=order_id)
    await cb.message.answer(texts.NOTE_ASK.format(no=config.order_no(order_id)))
    await cb.answer()


@core.message(ANote.waiting, F.text)
async def got_note(m: Message, state: FSMContext) -> None:
    data = await state.get_data()
    await state.clear()
    order_id = data["note_order_id"]
    o = await db.get_order(order_id)
    if not o:
        return
    old = (o["admin_note"] + "\n") if o["admin_note"] else ""
    await db.update_order(order_id, admin_note=(old + m.text.strip())[:1000])
    await m.answer(texts.NOTE_SAVED)


@core.callback_query(F.data.startswith("ad:msg:"))
async def cb_msg(cb: CallbackQuery, state: FSMContext) -> None:
    order_id = int(cb.data.split(":")[2])
    o = await db.get_order(order_id)
    if not o:
        await cb.answer("Заказ не найден", show_alert=True)
        return
    if cb.message.chat.type != "private":
        await cb.answer("В группе пишите прямо в ветку заказа — сообщение уйдёт клиенту.",
                        show_alert=True)
        return
    await state.set_state(AMsg.waiting)
    await state.update_data(msg_order_id=order_id)
    hint = "" if o["user_id"] else "\n<i>Клиент без Telegram — сообщение появится в его кабинете на сайте.</i>"
    await cb.message.answer(
        f"Напишите сообщение для клиента (заказ {config.order_no(order_id)}) — "
        "текст, файл или голосовое:" + hint)
    await cb.answer()


@core.message(AMsg.waiting)
async def got_admin_msg(m: Message, state: FSMContext) -> None:
    data = await state.get_data()
    await state.clear()
    order_id = data["msg_order_id"]
    o = await db.get_order(order_id)
    if not o:
        return
    if m.text and m.text.startswith("/"):
        await m.answer("Ок, ничего не отправляю.")
        return
    if await _gate_chat_document(m, state, order_id):
        return
    no = config.order_no(order_id)
    delivered_tg = False
    if o["user_id"]:
        try:
            delivered_tg = await notify.relay_to_client(
                m.bot, o["user_id"], m, f"📩 <b>Мастерская</b> · заказ {no}:")
        except Exception as e:  # noqa: BLE001
            await m.reply(texts.ADMIN_REPLY_FAIL.format(err=esc(str(e)[:120])))
            return
    if m.document:
        await db.add_file(order_id, "admin", m.document.file_id, m.document.file_unique_id,
                          m.document.file_name, m.document.file_size, "document")
    await db.msg_add(order_id, "master", m.text or m.caption,
                     kind="text" if m.text else str(m.content_type),
                     file_name=m.document.file_name if m.document else None,
                     tg_file_id=m.document.file_id if m.document else None)
    await db.add_event(order_id, "admin_msg", (m.text or m.caption or m.content_type)[:200])
    await mailer.master_message(order_id)
    if delivered_tg:
        client = await db.get_user(o["user_id"])
        who = texts.user_link(o["user_id"], client["first_name"] if client else None,
                              client["username"] if client else None)
        await m.reply(texts.ADMIN_REPLY_SENT.format(who=who, order_part=f" · заказ {no}"))
    elif o["user_id"]:
        await m.reply("📮 Клиент заходит по почте, без Telegram — сообщение в его "
                      f"кабинете, копия ушла письмом · заказ {no}")
    else:
        await m.reply(f"💾 Сохранено — клиент увидит в кабинете сайта · заказ {no}")


# ------------------------------------------------------------------- файлы

@core.callback_query(F.data.startswith("ad:files:"))
async def cb_files(cb: CallbackQuery) -> None:
    order_id = int(cb.data.split(":")[2])
    files = await db.files_for_order(order_id)
    if not files:
        await cb.answer("Файлов нет", show_alert=True)
        return
    await cb.answer()
    for f in files[-15:]:
        cap = (f"📎 {f['file_name'] or f['kind']} · заказ {config.order_no(order_id)} "
               f"· от {'клиента' if f['direction'] == 'client' else 'мастерской'}")
        try:
            if f["kind"] == "photo":
                await cb.message.answer_photo(f["file_id"], caption=cap)
            else:
                await cb.message.answer_document(f["file_id"], caption=cap)
        except Exception as e:  # noqa: BLE001
            log.warning("admin resend file failed: %s", e)


@core.message(Command("gifts"))
async def cmd_gifts(m: Message) -> None:
    """Сводка подарочных сертификатов + последние выпуски."""
    from ..services import gift as gift_svc
    st = await gift_svc.stats()
    rows = await db.gifts_list(limit=8)
    lines = [
        "🎁 <b>Подарочные сертификаты</b>",
        f"В обращении: <b>{st['active_n']}</b> шт · остаток на кодах "
        f"<b>{config.fmt_money(st['live_balance'])} ₽</b>",
        f"Погашено услугами: <b>{config.fmt_money(st['redeemed_sum'])} ₽</b>",
    ]
    if st["claimed_n"]:
        lines.append(f"⚠️ На сверке оплаты: <b>{st['claimed_n']}</b> "
                     f"({config.fmt_money(st['claimed_sum'])} ₽)")
    elif st["pending_n"]:
        lines.append(f"Ожидают оплаты: {st['pending_n']}")
    if rows:
        lines.append("")
        for g in rows:
            bal = await db.gift_balance(g["id"])
            stt = gift_svc.STATE_LABEL.get(gift_svc.state(g, bal), g["status"])
            lines.append(f"<code>{g['code']}</code> · {config.fmt_money(g['amount'])} ₽ "
                         f"(остаток {config.fmt_money(bal)}) · {stt}")
    lines.append("\nВыпуск, блокировка и продление — в веб-админке (/panel), "
                 "вкладка «Сертификаты».")
    await m.answer("\n".join(lines))


@core.message()
async def admin_fallback(m: Message) -> None:
    """Чтобы сообщения админа не утекали в клиентский роутер."""
    await m.answer(
        "Я не понял, что с этим делать 🙂\n"
        "• Ответ клиенту — <b>reply</b> на его сообщение или карточку заказа.\n"
        "• /orders — заказы, /help — все команды, /client — режим клиента.")


@core.callback_query(F.data.startswith("gc:adok:"))
async def cb_admin_gift_ok(cb: CallbackQuery) -> None:
    """Оплата сертификата сверена — выпустить (письма уходят сами)."""
    from ..services import gift as gift_svc
    gift_id = int(cb.data.split(":")[2])
    g = await gift_svc.activate_paid(cb.bot, gift_id, method="manual", actor="мастер")
    if not g:
        await cb.answer("Оформление уже закрыто (отменено?)", show_alert=True)
        return
    await cb.message.edit_text(
        f"✅ Сертификат <code>{g['code']}</code> на "
        f"{config.fmt_money(g['amount'])} ₽ выпущен — покупатель получил код "
        f"письмом{' и в Telegram' if (g['buyer_user_id'] or 0) > 0 else ''}. "
        "Не забудьте чек в «Мой налог».")
    await cb.answer("Выпущен")


@core.callback_query(F.data.startswith("gc:adno:"))
async def cb_admin_gift_no(cb: CallbackQuery) -> None:
    """Перевод за сертификат не найден — снять отметку, предупредить."""
    from ..services import gift as gift_svc, mailer as mail_svc, notify as ntf
    gift_id = int(cb.data.split(":")[2])
    g = await db.gift_get(gift_id)
    if not g or g["status"] != "pending":
        await cb.answer("Оформление уже закрыто", show_alert=True)
        return
    await gift_svc.unclaim(g)
    if g["buyer_user_id"] and g["buyer_user_id"] > 0:
        await ntf.notify_client(
            cb.bot, g["buyer_user_id"],
            f"🔍 Пока не видим перевод {config.fmt_money(g['amount'])} ₽ за "
            "подарочный сертификат. Проверьте, ушёл ли платёж, и отметьте оплату "
            "ещё раз на странице сертификата. Если переводили — напишите сюда.")
    else:
        await mail_svc.gift_event(g, "unclaimed")
    await cb.message.edit_text(cb.message.html_text +
                               "\n\n↩️ Отметка снята, покупатель предупреждён.")
    await cb.answer("Отметка снята")


@core.callback_query(F.data.startswith("ad:lead_done:"))
async def cb_lead_done(cb: CallbackQuery) -> None:
    lead_id = int(cb.data.split(":")[2])
    await db.conn().execute("UPDATE leads SET status='processed' WHERE id=?", (lead_id,))
    await db.conn().commit()
    try:
        await cb.message.edit_reply_markup(reply_markup=None)
        await cb.message.edit_text(cb.message.html_text + "\n\n✓ <i>обработано</i>")
    except Exception:  # noqa: BLE001
        pass
    await cb.answer("Помечено")


router.include_router(core)
