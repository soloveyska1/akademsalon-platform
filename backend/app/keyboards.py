"""Инлайн-клавиатуры. Callback-формат: "область:действие:аргумент"."""
from __future__ import annotations

from aiogram.types import InlineKeyboardButton as Btn
from aiogram.types import InlineKeyboardMarkup as Kb
from aiogram.types import KeyboardButton, ReplyKeyboardMarkup

from . import config
from .config import ST

# постоянные кнопки снизу — чтобы клиент не гадал, что делать
BTN_NEW, BTN_ORDERS, BTN_ASK, BTN_INFO = ("📝 Новая заявка", "📚 Мои заказы",
                                          "💬 Задать вопрос", "ℹ️ Как мы работаем")
BTN_BONUS = "💎 Мои бонусы"
ADM_ORDERS, ADM_STATS = "🗂 Заказы", "📊 Статистика"
ADM_PANEL = "🖥 Кабинет мастера"


def client_reply_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=BTN_NEW), KeyboardButton(text=BTN_ORDERS)],
            [KeyboardButton(text=BTN_BONUS), KeyboardButton(text=BTN_ASK)],
            [KeyboardButton(text=BTN_INFO)],
        ],
        resize_keyboard=True, is_persistent=True,
        input_field_placeholder="Пишите — мастер на связи")


def welcome_confirm() -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="✅ Ознакомлен(а) с правилами — начислить", callback_data="cl:welcome_ok")],
        [Btn(text="📜 Открыть правила", url=f"{config.SITE_URL}/loyalty.html")],
    ])


def bonus_menu(has_orders: bool) -> Kb:
    rows = [[Btn(text="⭐ Подписка «Салон+» — скидки и куратор", callback_data="sb:home")],
            [Btn(text="💼 Депозит мастерской — бонус до +15%", callback_data="dep:menu")]]
    if has_orders:
        rows.append([Btn(text="📚 К заказам — применить бонусы", callback_data="cl:orders")])
    rows.append([Btn(text="📝 Новая заявка", callback_data="cl:new"),
                 Btn(text="⬅️ В меню", callback_data="cl:menu")])
    return Kb(inline_keyboard=rows)


def dep_menu(rates: list, can_topup: bool) -> Kb:
    """Меню депозита: пополнения с показом бонусной ставки."""
    rows = []
    if can_topup:
        rows = [[Btn(text=f"+{a:,} ₽ · бонус +{p}%".replace(",", " "),
                     callback_data=f"dep:top:{a}")]
                for a, p in rates]
    rows.append([Btn(text="⬅️ В меню", callback_data="cl:menu")])
    return Kb(inline_keyboard=rows)


def admin_reply_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[[KeyboardButton(text=ADM_ORDERS), KeyboardButton(text=ADM_STATS)],
                  [KeyboardButton(text=ADM_PANEL)]],
        resize_keyboard=True, is_persistent=True,
        input_field_placeholder="Reply на карточку = ответ клиенту")


def main_menu(has_orders: bool) -> Kb:
    rows = [[Btn(text="📝 Новая заявка", callback_data="cl:new")]]
    rows.append([Btn(
        text="🧾 Несколько позиций / подробная смета",
        url=f"{config.SITE_URL}/configurator.html",
    )])
    if has_orders:
        rows.append([Btn(text="📚 Мои заказы", callback_data="cl:orders")])
    rows.append([
        Btn(text="⭐ Салон+", callback_data="sb:home"),
        Btn(text="📅 Куратор сессии", callback_data="sb:cur"),
    ])
    rows.append([
        Btn(text="💬 Задать вопрос", callback_data="cl:ask"),
        Btn(text="🛡 Гарантии", callback_data="cl:guar"),
    ])
    rows.append([
        Btn(text="ℹ️ Как мы работаем", callback_data="cl:how"),
        Btn(text="👤 Контакты", callback_data="cl:contacts"),
    ])
    rows.append([Btn(text="🌐 Сайт и смета", url=config.SITE_URL)])
    return Kb(inline_keyboard=rows)


def back_menu() -> Kb:
    return Kb(inline_keyboard=[[Btn(text="⬅️ В меню", callback_data="cl:menu")]])


# ------------------------------------------------------------------ визард

def wiz_types() -> Kb:
    rows = []
    pair = []
    for t in config.WORK_TYPES:
        pair.append(Btn(text=f"{t.emoji} {t.label}", callback_data=f"wz:type:{t.id}"))
        if len(pair) == 2:
            rows.append(pair)
            pair = []
    if pair:
        rows.append(pair)
    rows.append([Btn(text="🛠 Услуги: разбор, редактура, оформление…", callback_data="wz:svcmenu")])
    rows.append([Btn(text="🤔 Другое / не нашёл нужного", callback_data="wz:type:custom")])
    rows.append([Btn(text="✖️ Отмена", callback_data="wz:cancel")])
    return Kb(inline_keyboard=rows)


def wiz_services() -> Kb:
    rows = [[Btn(text=f"{s.label} · от {config.fmt_money(s.from_price)} ₽{s.unit}",
                 callback_data=f"wz:type:{s.id}")] for s in config.SERVICES]
    rows.append([Btn(text="⬅️ Назад", callback_data="wz:back_types"),
                 Btn(text="✖️ Отмена", callback_data="wz:cancel")])
    return Kb(inline_keyboard=rows)


def wiz_tiers() -> Kb:
    """The result is an explicit choice; there is no silent ``base`` tier."""
    icon = {"base": "🔎", "turn": "✍️", "vip": "🧭"}
    rows = [
        [Btn(text=f"{icon.get(tier[0], '•')} {tier[2]}",
             callback_data=f"wz:tier:{tier[0]}")]
        for tier in config.TIERS
    ]
    rows.append([Btn(text="✖️ Отмена", callback_data="wz:cancel")])
    return Kb(inline_keyboard=rows)


def wiz_material() -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="📄 Да — есть текст или черновик",
             callback_data="wz:material:draft")],
        [Btn(text="🗂 Частично — тема, план или данные",
             callback_data="wz:material:partial")],
        [Btn(text="🧭 Пока нет — нужен стартовый разбор",
             callback_data="wz:material:none")],
        [Btn(text="✖️ Отмена", callback_data="wz:cancel")],
    ])


def wiz_disc() -> Kb:
    rows = [[Btn(text=d[2], callback_data=f"wz:disc:{d[0]}")] for d in config.DISCIPLINES]
    rows.append([Btn(text="✖️ Отмена", callback_data="wz:cancel")])
    return Kb(inline_keyboard=rows)


def wiz_term() -> Kb:
    rows = [[Btn(text=t[2], callback_data=f"wz:term:{t[0]}")] for t in config.TERMS]
    rows.append([Btn(text="✖️ Отмена", callback_data="wz:cancel")])
    return Kb(inline_keyboard=rows)


def wiz_skip(stage: str) -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="⏭ Пропустить", callback_data=f"wz:skip:{stage}")],
        [Btn(text="✖️ Отмена", callback_data="wz:cancel")],
    ])


def wiz_files() -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="✅ Готово", callback_data="wz:files_done"),
         Btn(text="⏭ Пропустить", callback_data="wz:skip:files")],
        [Btn(text="✖️ Отмена", callback_data="wz:cancel")],
    ])


def wiz_confirm() -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="🚀 Отправить заявку", callback_data="wz:send")],
        [Btn(text="✏️ Заполнить заново", callback_data="cl:new"),
         Btn(text="✖️ Отмена", callback_data="wz:cancel")],
    ])


def intake_redirect() -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="🧭 Выбрать разрешённый формат", callback_data="cl:new")],
        [Btn(text="💬 Обсудить с мастером", callback_data="cl:ask"),
         Btn(text="⬅️ В меню", callback_data="cl:menu")],
    ])


def site_quote(payload: str) -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="📝 Оформить заявку с этой сметой", callback_data=f"wz:site:{payload}")],
        [Btn(text="🧮 Пересчитать заново", callback_data="cl:new"),
         Btn(text="💬 Просто спросить", callback_data="cl:ask")],
    ])


def svc_offer(svc_id: str) -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="📝 Оставить заявку", callback_data=f"wz:type:{svc_id}")],
        [Btn(text="💬 Задать вопрос", callback_data="cl:ask"),
         Btn(text="⬅️ В меню", callback_data="cl:menu")],
    ])


# ------------------------------------------------------------ клиент/заказы

def orders_list(orders) -> Kb:
    rows = []
    for o in orders:
        st = ST[o["status"]]
        label = f"{st.emoji} №{o['id']} · {o['work_label'][:28]}"
        rows.append([Btn(text=label, callback_data=f"cl:order:{o['id']}")])
    rows.append([Btn(text="⬅️ В меню", callback_data="cl:menu")])
    return Kb(inline_keyboard=rows)


def client_order(o, files_count: int = 0, bonus_balance: int = 0,
                 has_review: bool = False, due: int = 0, claimed: bool = False,
                 due_label: str = "") -> Kb:
    """Карточка клиента: только уместные сейчас кнопки — телефону дорог каждый ряд.

    due — созревший НЕоплаченный этап (отметка «оплатил» сюда не входит);
    due_label — человеческая подпись этапа («Оплата части 2»)."""
    rows = []
    s = o["status"]
    oid = o["id"]
    total = o["stages_total"] or 1
    part = o["stage"] or 1
    pay_txt = (f"💳 {due_label} — {config.fmt_money(due)} ₽" if due_label
               else f"💳 Оплатить ({config.fmt_money(due)} ₽)")
    is_sub = (o["work_type"] or "").startswith("sub_")
    if s == "priced":
        rows.append([Btn(text="✅ Принять цену", callback_data=f"cl:accept:{oid}"),
                     Btn(text="🚫 Отказаться", callback_data=f"cl:decline:{oid}")])
    if s in ("priced", "prepay") and not claimed and not is_sub:
        # подписка (легаси-носители) оплачивается без бонусов — кнопок не даём
        if (o["bonus_spent"] or 0) > 0:
            rows.append([Btn(text=f"↩️ Вернуть бонусы на счёт ({o['bonus_spent']})",
                             callback_data=f"cl:bcancel:{oid}")])
        elif bonus_balance > 0 and (o["price"] or 0) >= config.BONUS_MIN_ORDER:
            rows.append([Btn(text=f"💎 Списать бонусы ({bonus_balance})",
                             callback_data=f"cl:bspend:{oid}")])
    if s == "prepay":
        if claimed:  # отметка «оплатил» уже стоит — не дублируем кнопки оплаты
            rows.append([Btn(text="🧾 Приложить чек — ускорит сверку",
                             callback_data=f"cl:receipt:{oid}")])
            rows.append([Btn(text="↩️ Я ещё не оплатил — снять отметку",
                             callback_data=f"cl:unpaid:{oid}")])
        else:
            rows.append([Btn(text="💳 Оплатить / реквизиты", callback_data=f"cl:req:{oid}"),
                         Btn(text="✅ Я оплатил(а)", callback_data=f"cl:paid:{oid}")])
    handoff_fix_wait = (s == "fix" and _row_get(o, "handoff_phase") == "fix_requested")
    if s in ("check", "fix") and not handoff_fix_wait:
        accept_label = ("✅ Принять и завершить" if total == 1 or part >= total
                        else f"✅ Принять часть {part}")
        fix_label = "✏️ Нужны правки" + (f" (часть {part})" if total > 1 and part < total else "")
        rows.append([Btn(text=accept_label, callback_data=f"cl:accept_work:{oid}"),
                     Btn(text=fix_label, callback_data=f"cl:fix:{oid}")])
        if due > 0 and not claimed:
            rows.append([Btn(text=pay_txt, callback_data=f"cl:req:{oid}")])
            rows.append([Btn(text="✅ Я оплатил(а)", callback_data=f"cl:paid:{oid}")])
        elif claimed:
            rows.append([Btn(text="🧾 Оплата на сверке — приложить чек",
                             callback_data=f"cl:receipt:{oid}")])
    if s == "work":
        if due > 0 and not claimed:
            # часть объявлена готовой: счёт выставлен, файл придёт после оплаты
            rows.append([Btn(text=pay_txt, callback_data=f"cl:req:{oid}")])
            rows.append([Btn(text="✅ Я оплатил(а)", callback_data=f"cl:paid:{oid}")])
        elif claimed:
            rows.append([Btn(text="🧾 Оплата на сверке — приложить чек",
                             callback_data=f"cl:receipt:{oid}")])
    if s == "done" and not has_review:
        rows.append([Btn(text="⭐ Оставить отзыв", callback_data=f"cl:review:{oid}")])
    if (s == "done" and _row_get(o, "handoff_phase") == "released"
            and _row_get(o, "handoff_artifact_id")):
        rows.append([Btn(text="✏️ Запросить ещё правки",
                         callback_data=(f"cl:hffix:{oid}:"
                                        f"{int(_row_get(o, 'handoff_artifact_id'))}"))])
    if s == "cancel":
        rows.append([Btn(text="🔄 Возобновить заказ", callback_data=f"cl:resume:{oid}")])
    if s in config.ACTIVE_STATUSES:
        paused = _row_flag(o, "paused")
        if paused and (_row_get(o, "paused_by") or "client") != "admin":
            rows.append([Btn(text="▶️ Снять с паузы", callback_data=f"cl:unpause:{oid}")])
        elif not paused and s in ("new", "work", "fix"):
            # на «развилках» (цена, оплата, приёмка) паузу не предлагаем — там решение
            rows.append([Btn(text="⏸ Поставить на паузу", callback_data=f"cl:pause:{oid}")])
    tail = [Btn(text="💬 Написать по заказу", callback_data=f"cl:chat:{oid}")]
    if files_count:
        tail.append(Btn(text=f"📎 Файлы ({files_count})", callback_data=f"cl:files:{oid}"))
    rows.append(tail)
    rows.append([Btn(text="📚 Мои заказы", callback_data="cl:orders")])
    return Kb(inline_keyboard=rows)


def accept_final_confirm(oid: int) -> Kb:
    """Финал принимается осознанно: научрук и предзащита должны быть позади.

    «Ещё жду проверок» — режим ожидания, а НЕ запрос правок: дело остаётся
    открытым, клиент вернётся с замечаниями или завершит, когда всё позади.
    """
    return Kb(inline_keyboard=[
        [Btn(text="✅ Да, всё проверено — завершить", callback_data=f"cl:acceptfin:{oid}")],
        [Btn(text="🕐 Ещё жду проверок (научрук, предзащита)",
             callback_data=f"cl:waitchk:{oid}")],
        [Btn(text="✏️ Есть замечания — нужны правки", callback_data=f"cl:fix:{oid}"),
         Btn(text="⬅️ К заказу", callback_data=f"cl:order:{oid}")],
    ])


def unpaid_kb(oid: int) -> Kb:
    """После снятия отметки об оплате — сразу дать путь назад, без листания."""
    return Kb(inline_keyboard=[
        [Btn(text="💳 Реквизиты / оплатить", callback_data=f"cl:req:{oid}"),
         Btn(text="✅ Я оплатил(а)", callback_data=f"cl:paid:{oid}")],
        [Btn(text="⬅️ К заказу", callback_data=f"cl:order:{oid}")],
    ])


def defense_offer_kb(order_id: int) -> Kb:
    """Услуги «к защите» по материалам заказа: тип и тема уже известны."""
    return Kb(inline_keyboard=[
        [Btn(text="🎁 Пакет к выступлению — выгоднее на 1 500 ₽",
             callback_data=f"wz:svcfor:svc_defense_pack:{order_id}")],
        [Btn(text="🎤 Презентация и речь", callback_data=f"wz:svcfor:svc_defense:{order_id}"),
         Btn(text="📏 Нормоконтроль", callback_data=f"wz:svcfor:svc_norm:{order_id}")],
    ])


def gift_rest_kb(order_id: int, code: str) -> Kb:
    """Остаток сертификата после завершённого дела: быстрые допродажи в боте
    (остаток привяжется сам через wz:svcfor) + свободная заявка на сайте."""
    return Kb(inline_keyboard=[
        [Btn(text="🎤 Презентация и речь", callback_data=f"wz:svcfor:svc_defense:{order_id}"),
         Btn(text="📏 Нормоконтроль", callback_data=f"wz:svcfor:svc_norm:{order_id}")],
        [Btn(text="📝 Новая заявка с этим сертификатом",
             url=f"{config.SITE_URL}/configurator.html?gift={code}")],
        [Btn(text="✖️ Спасибо, не сейчас", callback_data="cl:hide")],
    ])


def promo_reminder_kb(code: str) -> Kb:
    """Напоминание о непотраченном промокоде — код уже вшит в ссылку."""
    from urllib.parse import quote as _q
    return Kb(inline_keyboard=[
        [Btn(text="🏷 Применить к новой заявке на сайте",
             url=f"{config.SITE_URL}/configurator.html?promo={_q(code, safe='')}")],
        [Btn(text="📝 Оформить в боте", callback_data="cl:new"),
         Btn(text="✖️ Не сейчас", callback_data="cl:hide")],
    ])


def with_cab_url(markup: Kb, url: str | None,
                 label: str = "🗂 Открыть дело в кабинете") -> Kb:
    """Тихая ссылка в кабинет последней строкой платёжных/статусных сообщений —
    клиент попадает сразу в своё дело, без входа и блужданий."""
    if url:
        markup.inline_keyboard.append([Btn(text=label, url=url)])
    return markup


def price_offer(oid: int) -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="✅ Принять", callback_data=f"cl:accept:{oid}")],
        [Btn(text="💎 Списать бонусы", callback_data=f"cl:bspend:{oid}")],
        [Btn(text="💬 Обсудить", callback_data=f"cl:chat:{oid}"),
         Btn(text="🚫 Отказаться", callback_data=f"cl:decline:{oid}")],
    ])


def _row_get(o, key: str):
    try:
        return o[key]
    except (KeyError, IndexError):
        return None


def _row_flag(o, key: str) -> bool:
    return bool(_row_get(o, key))


def after_bonus_kb(o) -> Kb:
    """После применения бонусов сразу даём следующее действие —
    чтобы не пришлось листать вверх к оферте."""
    oid = o["id"]
    rows = []
    if o["status"] == "priced":
        rows.append([Btn(text="✅ Принять цену", callback_data=f"cl:accept:{oid}")])
        rows.append([Btn(text="💬 Обсудить", callback_data=f"cl:chat:{oid}"),
                     Btn(text="↩️ Вернуть бонусы", callback_data=f"cl:bcancel:{oid}")])
    elif o["status"] == "prepay":
        rows.append([Btn(text="💳 Оплатить / реквизиты", callback_data=f"cl:req:{oid}")])
        rows.append([Btn(text="✅ Я оплатил(а)", callback_data=f"cl:paid:{oid}"),
                     Btn(text="↩️ Вернуть бонусы", callback_data=f"cl:bcancel:{oid}")])
    rows.append([Btn(text="⬅️ К заказу", callback_data=f"cl:order:{oid}")])
    return Kb(inline_keyboard=rows)


def bonus_spend_kb(oid: int, options: list[int]) -> Kb:
    row = [Btn(text=f"{n}", callback_data=f"cl:bsp:{oid}:{n}") for n in options]
    return Kb(inline_keyboard=[row,
                               [Btn(text="⬅️ Назад к заказу", callback_data=f"cl:order:{oid}")]])


def decline_reason_kb(oid: int) -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="Дорого", callback_data=f"cl:dr:{oid}:Дорого"),
         Btn(text="Не подходит срок", callback_data=f"cl:dr:{oid}:Не подходит срок")],
        [Btn(text="Передумал(а)", callback_data=f"cl:dr:{oid}:Передумал(а)"),
         Btn(text="⏭ Пропустить", callback_data=f"cl:dr:{oid}:")],
    ])


def prepay_kb(oid: int) -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="✅ Я оплатил(а)", callback_data=f"cl:paid:{oid}")],
        [Btn(text="📎 Приложить чек", callback_data=f"cl:receipt:{oid}"),
         Btn(text="💬 Вопрос по оплате", callback_data=f"cl:chat:{oid}")],
    ])


def with_pay_url(markup: Kb, url: str | None, amount: int) -> Kb:
    """Кнопка онлайн-оплаты первой строкой любого платёжного сообщения.

    url создаёт активный провайдер (payments.online_link_for_order);
    None — касса выключена, клавиатура возвращается как есть.
    """
    if url:
        markup.inline_keyboard.insert(0, [Btn(
            text=f"💳 Оплатить картой онлайн · {config.fmt_money(amount)} ₽",
            url=url)])
    return markup


def paid_marked_kb(oid: int) -> Kb:
    """После «Я оплатил»: чек ускоряет сверку, отметку можно снять."""
    return Kb(inline_keyboard=[
        [Btn(text="📎 Приложить чек — ускорит сверку", callback_data=f"cl:receipt:{oid}")],
        [Btn(text="↩️ Я ещё не оплатил — снять отметку", callback_data=f"cl:unpaid:{oid}")],
        [Btn(text="💬 Вопрос по оплате", callback_data=f"cl:chat:{oid}")],
    ])


def delivered_kb(oid: int, part: int | None = None, total: int = 1, due: int = 0,
                 due_label: str = "") -> Kb:
    if total > 1 and part:
        accept = ("✅ Принять работу" if part >= total else f"✅ Принять часть {part}")
        fixes = "✏️ Нужны правки"
    else:
        accept, fixes = "✅ Принять работу", "✏️ Нужны правки"
    rows = [[Btn(text=accept, callback_data=f"cl:accept_work:{oid}"),
             Btn(text=fixes, callback_data=f"cl:fix:{oid}")]]
    if due > 0:
        label = due_label or (f"Оплатить часть {part}" if total > 1 and part else "Оплатить")
        rows.append([Btn(text=f"💳 {label} ({config.fmt_money(due)} ₽)",
                         callback_data=f"cl:req:{oid}")])
    rows.append([Btn(text="💬 Написать мастеру", callback_data=f"cl:chat:{oid}")])
    return Kb(inline_keyboard=rows)


def handoff_master_review_kb(oid: int, artifact_id: int, version: int,
                             clean: bool = False) -> Kb:
    label = (f"📤 Отправить исправленную версию v{version}"
             if clean else f"🔒 Отправить защищённую часть v{version}")
    return Kb(inline_keyboard=[
        [Btn(text=label, callback_data=f"ad:hfsend:{oid}:{artifact_id}")],
        [Btn(text="🔁 Заменить файл", callback_data=f"ad:preview:{oid}"),
         Btn(text="⬅️ К карточке", callback_data=f"ad:card:{oid}")],
    ])


def handoff_client_kb(oid: int, artifact_id: int, protected: bool) -> Kb:
    accept = "✅ Всё устраивает — принять часть" if protected else "✅ Принять работу"
    return Kb(inline_keyboard=[
        [Btn(text=accept, callback_data=f"cl:hfaccept:{oid}:{artifact_id}"),
         Btn(text="✏️ Нужны правки", callback_data=f"cl:hffix:{oid}:{artifact_id}")],
        [Btn(text="💬 Написать мастеру", callback_data=f"cl:chat:{oid}")],
    ])


def review_invite_kb(oid: int) -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="⭐ Оставить отзыв о работе", callback_data=f"cl:review:{oid}")],
    ])


def release_thanks_kb(oid: int, cabinet_url: str | None = None) -> Kb:
    """Мягкое завершение автовыдачи: отзыв в боте, поддержка — в кабинете."""
    rows = [
        [Btn(text="⭐ Оставить отзыв", callback_data=f"cl:review:{oid}")],
    ]
    if cabinet_url:
        rows.append([Btn(text="💛 Поддержать развитие проекта", url=cabinet_url)])
        rows.append([Btn(text="📂 Открыть заказ и файлы", url=cabinet_url)])
    return Kb(inline_keyboard=rows)


def review_stars_kb(oid: int) -> Kb:
    row = [Btn(text="★" * n, callback_data=f"cl:rvstar:{oid}:{n}") for n in range(1, 6)]
    return Kb(inline_keyboard=[row[:3], row[3:],
                               [Btn(text="✖️ Передумал(а)", callback_data=f"cl:order:{oid}")]])


def review_skip_text_kb(oid: int) -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="⏭ Без текста — только оценка", callback_data=f"cl:rvskip:{oid}")],
    ])


def review_moderate_kb(review_id: int) -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="✅ Опубликовать на сайте", callback_data=f"ad:rvok:{review_id}"),
         Btn(text="🚫 Не публиковать", callback_data=f"ad:rvno:{review_id}")],
    ])


def decline_confirm(oid: int) -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="🚫 Да, закрыть заявку", callback_data=f"cl:decline_yes:{oid}")],
        [Btn(text="⬅️ Вернуться", callback_data=f"cl:order:{oid}")],
    ])


# ------------------------------------------------------------------- админ

def admin_order(o) -> Kb:
    oid = o["id"]
    s = o["status"]
    total = o["stages_total"] or 1
    part = o["stage"] or 1
    deliver_label = (f"📤 Сдать часть {part} из {total}" if total > 1 else "📤 Сдать работу")
    rows = []
    if s == "new":
        rows.append([Btn(text="💰 Назначить цену", callback_data=f"ad:price:{oid}"),
                     Btn(text="🚫 Отклонить", callback_data=f"ad:st:{oid}:cancel")])
    elif s == "priced":
        rows.append([Btn(text="💰 Изменить цену", callback_data=f"ad:price:{oid}"),
                     Btn(text="✅ Оплата получена", callback_data=f"ad:pay:{oid}")])
    elif s == "prepay":
        rows.append([Btn(text="✅ Оплата получена → в работу", callback_data=f"ad:pay:{oid}")])
        rows.append([Btn(text="🔔 Напомнить об оплате", callback_data=f"ad:remind:{oid}")])
    elif s in ("work", "fix", "check") and _row_get(o, "handoff_artifact_id"):
        phase = _row_get(o, "handoff_phase") or ""
        aid = int(_row_get(o, "handoff_artifact_id") or 0)
        ver = int(_row_get(o, "handoff_version") or 1)
        if phase == "master_review":
            rows.append([Btn(text=f"👁 Проверено — отправить версию v{ver}",
                             callback_data=f"ad:hfsend:{oid}:{aid}")])
            rows.append([Btn(text="🔁 Заменить загруженный файл",
                             callback_data=f"ad:preview:{oid}")])
        elif phase == "preview_published":
            rows.append([Btn(text="⏳ Ждём: принять или запросить правки",
                             callback_data=f"ad:hfwait:{oid}")])
            rows.append([Btn(text="✍️ Напомнить клиенту о проверке",
                             callback_data=f"gn:nudge:{oid}")])
        elif phase in ("accepted_wait_pay", "releasing"):
            rows.append([Btn(text="💳 Ждём остаток — оригинал уйдёт сам",
                             callback_data=f"ad:hfwait:{oid}")])
            rows.append([Btn(text="✅ Подтвердить оплату", callback_data=f"ad:pay:{oid}"),
                         Btn(text="🔔 Напомнить", callback_data=f"ad:remind:{oid}")])
        elif s == "fix" or phase == "fix_requested":
            rows.append([Btn(text="📄 Загрузить исправленную версию",
                             callback_data=f"ad:preview:{oid}")])
        elif phase == "released":
            rows.append([Btn(text="✅ Оригинал выдан · ждём приёмку",
                             callback_data=f"ad:hfwait:{oid}")])
            rows.append([Btn(text="✍️ Напомнить клиенту о проверке",
                             callback_data=f"gn:nudge:{oid}")])
    elif s in ("work", "fix"):
        # Новый безопасный путь — один главный шаг. Старые низкоуровневые
        # операции доступны в «Ещё», чтобы legacy-заказы не ломались.
        rows.append([Btn(text=("📄 Загрузить исправленную версию" if s == "fix"
                               else "📄 Загрузить готовый результат"),
                         callback_data=f"ad:preview:{oid}")])
    elif s == "check":
        rows.append([Btn(text="⏳ Ждём решение клиента",
                         callback_data=f"ad:hfwait:{oid}")])
        rows.append([Btn(text="✍️ Напомнить о проверке", callback_data=f"gn:nudge:{oid}")])
        # Legacy-сдача остаётся доступной только в дополнительных действиях.
    elif s == "cancel":
        rows.append([Btn(text="🔄 Возобновить", callback_data=f"ad:resume:{oid}")])
    if s in ("new", "priced", "prepay"):
        # план сдачи/оплаты: до цены и после неё, пока работа не началась.
        # Пометка ✓ — что действует сейчас (без явного выбора цена включит 2 части)
        cur = o["stages_total"] or (2 if not o["price"] else 1)
        plans = {1: "1 · целиком", 2: "2 · 50/50", 3: "3 · 30/40/30"}
        rows.append([Btn(text=("✓ " if cur == n else "") + plans[n],
                         callback_data=f"ad:plan:{oid}:{n}")
                     for n in (1, 2, 3)])
    if s in ("work", "fix", "check"):
        rows.append([Btn(text="💬 Написать клиенту", callback_data=f"ad:msg:{oid}"),
                     Btn(text="⋯ Ещё", callback_data=f"ad:more:{oid}")])
    else:
        rows.append([Btn(text="💬 Написать клиенту", callback_data=f"ad:msg:{oid}"),
                     Btn(text="📝 Заметка", callback_data=f"ad:note:{oid}")])
        rows.append([Btn(text="📎 Файлы", callback_data=f"ad:files:{oid}"),
                     Btn(text="🔄 Статус", callback_data=f"ad:stmenu:{oid}"),
                     Btn(text="↻", callback_data=f"ad:card:{oid}")])
        rows.append([Btn(text="🖥 Это дело в админке сайта", callback_data=f"ad:panel:{oid}")])
    return Kb(inline_keyboard=rows)


def admin_more_kb(oid: int) -> Kb:
    """Редкие/аварийные операции не конкурируют с главным следующим шагом."""
    return Kb(inline_keyboard=[
        [Btn(text="📨 Отправить карточку дела в Telegram",
             callback_data=f"ad:tgsync:{oid}")],
        [Btn(text="📝 Заметка", callback_data=f"ad:note:{oid}"),
         Btn(text="📎 Файлы", callback_data=f"ad:files:{oid}")],
        [Btn(text="📤 Ручная выдача (legacy)", callback_data=f"ad:deliver:{oid}")],
        [Btn(text="✅ Ручное подтверждение оплаты", callback_data=f"ad:pay:{oid}")],
        [Btn(text="🔄 Ручной статус", callback_data=f"ad:stmenu:{oid}"),
         Btn(text="🖥 Админка сайта", callback_data=f"ad:panel:{oid}")],
        [Btn(text="⬅️ Назад к карточке", callback_data=f"ad:card:{oid}")],
    ])


def _gate_is_final(o, part: int) -> bool:
    total = o["stages_total"] or 1
    return total <= 1 or part >= total


def _gate_announced(o, part: int) -> bool:
    if _gate_is_final(o, part):
        return _row_flag(o, "final_ready")
    return int(_row_get(o, "part_ready") or 0) >= part


def _gate_invoice_btn(o, part: int, cb: str) -> Btn:
    """Кнопка «выставить счёт» гейта сдачи: часть или финал — по месту в плане."""
    if _gate_is_final(o, part):
        return Btn(text="🏁 Финал готов — счёт на остаток (файл держим)",
                   callback_data=f"{cb}:{o['id']}")
    return Btn(text=f"📣 Часть {part} готова — счёт клиенту (файл держим)",
               callback_data=f"{cb}:{o['id']}")


def deliver_gate_kb(o, part: int) -> Kb:
    """Сдача в ЛС заблокирована: этап не оплачен. Правильные пути — счёт,
    напоминание, предпросмотр; обход — отдельной осознанной кнопкой."""
    oid = o["id"]
    rows = []
    if _gate_announced(o, part):
        rows.append([Btn(text="🔔 Напомнить клиенту об оплате",
                         callback_data=f"ad:remind:{oid}")])
    else:
        rows.append([_gate_invoice_btn(
            o, part, "ad:finrdy" if _gate_is_final(o, part) else "ad:partrdy")])
    rows.append([Btn(text="🔒 Показать работу предпросмотром",
                     callback_data=f"ad:preview:{oid}")])
    rows.append([Btn(text="⚠️ Всё равно передать без оплаты",
                     callback_data=f"ad:forcedel:{oid}")])
    rows.append([Btn(text="⬅️ К карточке", callback_data=f"ad:card:{oid}")])
    return Kb(inline_keyboard=rows)


def chat_file_gate(o, part: int) -> Kb:
    """Гейт для файла, присланного мастером в чат-путях ЛС (reply/«написать»):
    те же действия + «отправить как есть» для файлов, не являющихся работой."""
    base = deliver_gate_kb(o, part)
    base.inline_keyboard.insert(2, [Btn(text="✉️ Это не работа — отправить как есть",
                                        callback_data=f"ad:sendplain:{o['id']}")])
    return base


def chat_safe_file_kb(oid: int) -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="📄 Подготовить безопасную выдачу",
             callback_data=f"ad:gateprep:{oid}")],
        [Btn(text="✉️ Это обычный файл — отправить как есть",
             callback_data=f"ad:sendplain:{oid}")],
        [Btn(text="⬅️ К карточке", callback_data=f"ad:card:{oid}")],
    ])


def group_file_gate(o, part: int, preview_ok: bool) -> Kb:
    """Файл мастера в ветке придержан (этап не оплачен): выбор действия."""
    oid = o["id"]
    rows = []
    if _gate_announced(o, part):
        rows.append([Btn(text="🔔 Напомнить об оплате (файл держим)",
                         callback_data=f"gf:remind:{oid}")])
    else:
        rows.append([_gate_invoice_btn(o, part, "gf:invoice")])
    if preview_ok:
        rows.append([Btn(text="🔒 Клиенту — предпросмотр с водяными знаками",
                         callback_data=f"gd:prev:{oid}")])
    rows.append([Btn(text="✉️ Это не работа — отправить как есть",
                     callback_data=f"gf:plain:{oid}")])
    rows.append([Btn(text="⚠️ Сдать без оплаты — на мой риск",
                     callback_data=f"gf:force:{oid}")])
    return Kb(inline_keyboard=rows)


def group_safe_file_kb(oid: int, preview_ok: bool) -> Kb:
    rows = []
    if preview_ok:
        rows.append([Btn(text="📄 Подготовить безопасную выдачу",
                         callback_data=f"gd:prev:{oid}")])
    rows.append([Btn(text="✉️ Это обычный файл — отправить клиенту",
                     callback_data=f"gf:plain:{oid}")])
    return Kb(inline_keyboard=rows)


def group_force_confirm(oid: int) -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="⚠️ Да, передать оригинал без оплаты",
             callback_data=f"gf:force2:{oid}")],
        [Btn(text="⬅️ Нет, вернуться к выбору", callback_data=f"gf:back:{oid}")],
    ])


def group_price_kb(o) -> Kb:
    """Назначение цены в теме группы: пресеты из сметы + своя цифра ответом."""
    oid = o["id"]
    opts: list[int] = []
    if o["price"]:
        base = int(o["price"])
        opts = sorted({int(round(base * k, -2)) for k in (0.9, 1.0, 1.15)})
    elif o["quote_low"]:
        lo, hi = int(o["quote_low"]), int(o["quote_high"] or o["quote_low"])
        opts = sorted({lo, int(round((lo + hi) / 2, -2)), hi})
    rows = []
    if opts:
        labels = ("От", "Ориентир", "До") if len(opts) == 3 else tuple("" for _ in opts)
        rows.append([
            Btn(text=f"{labels[i] + ' ' if labels[i] else ''}{config.fmt_money(n)} ₽",
                callback_data=f"gp:set:{oid}:{n}")
            for i, n in enumerate(opts[:3])
        ])
    rows.append([Btn(text="✍️ Своя цена / формат ответа", callback_data=f"gp:hint:{oid}")])
    return Kb(inline_keyboard=rows)


def price_confirm_kb(oid: int, amount: int) -> Kb:
    """Защита от случайной отправки цены клиенту одним касанием."""
    return Kb(inline_keyboard=[
        [Btn(text=f"✅ Отправить {config.fmt_money(amount)} ₽",
             callback_data=f"gp:confirm:{oid}:{amount}")],
        [Btn(text="← Выбрать другую сумму", callback_data=f"gp:back:{oid}")],
    ])


# ------------------------------------- «что дальше»: кнопки следующего шага
#
# Правило мастерской: ни одно событие в ветке заказа (или личке мастера)
# не заканчивается голым текстом — рядом всегда кнопки ближайших действий.
# ad:* обрабатываются в admin.py (работают и в группе), gn:* — в group.py.

def _next_tail(oid: int) -> list[Btn]:
    return [Btn(text="📋 Карточка", callback_data=f"ad:card:{oid}"),
            Btn(text="🖥 Открыть в админке", callback_data=f"ad:panel:{oid}")]


def after_deliver_kb(o, due: int = 0, claimed: bool = False) -> Kb:
    """Часть сдана и у клиента: ждём приёмку, держим оплату в поле зрения."""
    oid = o["id"]
    rows = []
    if due > 0:
        rows.append([Btn(text=f"🔔 Напомнить об оплате ({config.fmt_money(due)} ₽)",
                         callback_data=f"ad:remind:{oid}")])
    elif claimed:
        rows.append([Btn(text="✅ Оплата получена (отметка клиента на сверке)",
                         callback_data=f"ad:pay:{oid}")])
    rows.append([Btn(text="✍️ Напомнить клиенту о проверке",
                     callback_data=f"gn:nudge:{oid}")])
    rows.append(_next_tail(oid))
    return Kb(inline_keyboard=rows)


def fix_alert_kb(o, acked: bool = False) -> Kb:
    """Клиент запросил правки: взять в работу, сдать исправленную версию."""
    oid = o["id"]
    rows = []
    if not acked:
        rows.append([Btn(text="🛠 Взял(а) в работу — сообщить клиенту",
                         callback_data=f"gn:fixack:{oid}")])
    rows.append([Btn(text="📦 Сдать исправленную версию",
                     callback_data=f"ad:deliver:{oid}")])
    rows.append(_next_tail(oid))
    return Kb(inline_keyboard=rows)


def accepted_next_kb(o, next_part: int, total: int, due: int = 0) -> Kb:
    """Промежуточная часть принята: следующий шаг — счёт за часть N+1."""
    oid = o["id"]
    label = (f"📣 Часть {next_part} готова — счёт клиенту (файл держим)"
             if next_part < total
             else "🏁 Финал готов — счёт на остаток (файл держим)")
    # ad:partrdy прозрачно превращается в «финал» для последней части
    rows = [[Btn(text=label, callback_data=f"ad:partrdy:{oid}")]]
    if due > 0:
        rows.append([Btn(text=f"🔔 Напомнить об оплате принятой части "
                              f"({config.fmt_money(due)} ₽)",
                         callback_data=f"ad:remind:{oid}")])
    rows.append([Btn(text=f"📦 Сдать часть {next_part} сейчас",
                     callback_data=f"ad:deliver:{oid}")])
    rows.append(_next_tail(oid))
    return Kb(inline_keyboard=rows)


def accept_wait_pay_kb(o, amount: int) -> Kb:
    """Финал принят, ждём только деньги: подтвердить — и дело закроется само."""
    oid = o["id"]
    return Kb(inline_keyboard=[
        [Btn(text=f"✅ Оплата получена ({config.fmt_money(amount)} ₽) — закрыть дело",
             callback_data=f"ad:pay:{oid}")],
        [Btn(text="🔔 Напомнить об оплате", callback_data=f"ad:remind:{oid}")],
        _next_tail(oid),
    ])


def announced_kb(o) -> Kb:
    """Счёт за часть/финал выставлен, файл придержан: сверка и напоминания."""
    oid = o["id"]
    return Kb(inline_keyboard=[
        [Btn(text="✅ Оплата получена — передаю файл", callback_data=f"ad:pay:{oid}")],
        [Btn(text="🔔 Напомнить об оплате", callback_data=f"ad:remind:{oid}")],
        _next_tail(oid),
    ])


def handover_kb(o, part: int, final: bool = False) -> Kb:
    """Оплата этапа подтверждена — пора передать придержанный файл."""
    oid = o["id"]
    label = ("📦 Сдать финал — файл клиенту" if final
             else f"📦 Передать часть {part} — файл клиенту")
    return Kb(inline_keyboard=[
        [Btn(text=label, callback_data=f"ad:deliver:{oid}")],
        _next_tail(oid),
    ])


def claim_check_kb(o, amount: int) -> Kb:
    """Клиент отметил «я оплатил»: сверить и подтвердить — или честно снять."""
    oid = o["id"]
    return Kb(inline_keyboard=[
        [Btn(text=f"✅ Оплата получена ({config.fmt_money(amount)} ₽)",
             callback_data=f"ad:pay:{oid}")],
        [Btn(text="❌ Не вижу оплаты — снять отметку", callback_data=f"gn:payno:{oid}")],
        _next_tail(oid),
    ])


def pay_silent_kb(o) -> Kb:
    """Счёт молчит после трёх напоминаний: личное вмешательство мастера."""
    oid = o["id"]
    return Kb(inline_keyboard=[
        [Btn(text="🔔 Напомнить ещё раз", callback_data=f"ad:remind:{oid}")],
        [Btn(text="💬 Написать клиенту", callback_data=f"ad:msg:{oid}")],
        _next_tail(oid),
    ])


def group_file_prompt(oid: int, msg_id: int, part: int, total: int) -> Kb:
    """Уточнить, является ли файл результатом этапа или обычным вложением."""
    return Kb(inline_keyboard=[
        [Btn(text=f"📦 Передать результат этапа {part} из {total} на проверку"
              if total > 1 else "📦 Передать результат на проверку",
             callback_data=f"gd:deliver:{oid}")],
        [Btn(text="✉️ Просто файл, ничего не менять", callback_data=f"gd:plain:{oid}")],
    ])


def admin_status_menu(oid: int) -> Kb:
    rows = []
    pair = []
    for s in config.STATUSES:
        pair.append(Btn(text=f"{s.emoji} {s.label}", callback_data=f"ad:st:{oid}:{s.id}"))
        if len(pair) == 2:
            rows.append(pair)
            pair = []
    if pair:
        rows.append(pair)
    rows.append([Btn(text="⬅️ Назад к карточке", callback_data=f"ad:card:{oid}")])
    return Kb(inline_keyboard=rows)


def admin_orders_list(orders) -> Kb:
    rows = []
    for o in orders:
        st = ST[o["status"]]
        rows.append([Btn(text=f"{st.emoji} №{o['id']} · {o['work_label'][:30]}",
                         callback_data=f"ad:card:{o['id']}")])
    return Kb(inline_keyboard=rows) if rows else None


def lead_kb(lead_id: int) -> Kb:
    return Kb(inline_keyboard=[
        [Btn(text="✓ Обработано", callback_data=f"ad:lead_done:{lead_id}")],
    ])


def qa_moderate(qa_id: int) -> Kb:
    """Модерация вопроса «Открытой приёмной» из ЛС мастера."""
    return Kb(inline_keyboard=[
        [Btn(text="✍️ Ответить", callback_data=f"qa:ans:{qa_id}"),
         Btn(text="🚫 Отклонить", callback_data=f"qa:rej:{qa_id}")],
    ])
