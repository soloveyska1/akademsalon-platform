"""Все клиентские и админские тексты бота. Тон — спокойный, на «вы», без пафоса."""
from __future__ import annotations

import html

from . import config
from .config import ST, fmt_money, order_no


def esc(s: str | None) -> str:
    return html.escape(s or "", quote=False)


def user_link(user_id: int, name: str | None, username: str | None = None) -> str:
    label = esc(name) or "клиент"
    if username:
        return f'{label} (@{esc(username)})'
    return f'<a href="tg://user?id={user_id}">{label}</a>'


def contact_links(raw: str | None) -> list[tuple[str, str]]:
    """Кликабельные ссылки из свободного контакта гостя: [(подпись, url)].

    Мастеру важно дотянуться до лида любой ценой: телефон превращаем
    в tel: и WhatsApp, @ник — в t.me, vk — в ссылку, почту — в mailto.
    """
    import re
    s = (raw or "").strip()
    if not s:
        return []
    out: list[tuple[str, str]] = []
    m = re.search(r"@([A-Za-z0-9_]{4,32})", s)
    if m:
        out.append((f"Telegram @{m.group(1)}", f"https://t.me/{m.group(1)}"))
    m = re.search(r"(?:vk\.com|vk\.ru)/([A-Za-z0-9_.]+)", s, re.I)
    if m:
        out.append((f"ВК {m.group(1)}", f"https://vk.com/{m.group(1)}"))
    m = re.search(r"[\w.+-]+@[\w-]+\.[\w.]+", s)
    if m:
        out.append((m.group(0), f"mailto:{m.group(0)}"))
    digits = re.sub(r"[^\d+]", "", s)
    m = re.search(r"(?:\+7|8|7)\d{10}", digits)
    if m:
        phone = "+7" + m.group(0)[-10:]
        out.append((phone, f"tel:{phone}"))
        out.append(("WhatsApp", f"https://wa.me/7{m.group(0)[-10:]}"))
    m = re.search(r"(?:t\.me|telegram\.me)/([A-Za-z0-9_]{4,32})", s, re.I)
    if m and not any("t.me" in u for _, u in out):
        out.append((f"Telegram {m.group(1)}", f"https://t.me/{m.group(1)}"))
    return out


def contact_links_html(raw: str | None) -> str:
    links = contact_links(raw)
    if not links:
        return ""
    return " · ".join(f'<a href="{url}">{esc(label)}</a>' for label, url in links)

# ------------------------------------------------------------------ клиент

WELCOME = (
    "Здравствуйте! Это <b>Академический Салон</b> — консультации, аудит, "
    "редактура и оформление материалов клиента, подготовка к выступлению и "
    "авторские заказы вне аттестации.\n\n"
    "Состав, цена, сроки, критерии и режим использования фиксируются в "
    "спецификации; статусы, сообщения и файлы хранятся в деле заказа.\n\n"
    "С чего начнём?\n\n"
    "<i>Продолжая, вы соглашаетесь с офертой и политикой ПДн (akademsalon.ru). "
    "Изредка присылаем новости мастерской — отключается командой /stopnews.</i>"
)

WELCOME_BACK = "С возвращением! Чем поможем на этот раз?"

MENU_HINT = "Главное меню. Выберите раздел:"

HOW_WE_WORK = (
    "<b>Как идёт работа</b>\n\n"
    "1️⃣ <b>Заявка.</b> Вы описываете задачу — мы бесплатно оцениваем её в течение "
    "15–30 минут в рабочее время.\n"
    "2️⃣ <b>Договорённость.</b> Фиксируем цену, срок и требования. Предоплата — "
    "обычно 50%, для больших работ возможна разбивка на этапы.\n"
    "3️⃣ <b>Работа.</b> Держим в курсе прямо здесь: статусы меняются, вопросы "
    "обсуждаем в этом чате.\n"
    "4️⃣ <b>Проверка.</b> Вы получаете согласованный результат и проверяете его "
    "по критериям спецификации. Подтверждённые несоответствия устраняем в "
    "порядке и сроки, указанные в документах заказа.\n"
    "5️⃣ <b>Сопровождение.</b> Дополнительные консультации и подготовку к "
    "выступлению заранее включаем в выбранный пакет или отдельную позицию.\n\n"
    f'Подробнее: <a href="{config.SITE_URL}/tariffs.html">тарифы</a> · '
    f'<a href="{config.SITE_URL}/oferta.html">оферта</a>\n\n'
    "💡 <i>Сайт не открывается? Чаще всего дело во включённом VPN — выключите его "
    "для нашего сайта (он российский, VPN не нужен) или просто продолжайте здесь: "
    "в боте есть всё то же самое.</i>"
)

GUARANTEES = (
    "<b>Как защищён заказ</b>\n\n"
    "🧾 <b>Понятная спецификация.</b> До оплаты фиксируем позиции, результат, "
    "срок, цену, критерии приёмки и график платежей.\n"
    "🔐 <b>Неизменяемая редакция.</b> Принятый документ сохраняется с хэшем; "
    "существенные изменения оформляются новой редакцией.\n"
    "✏️ <b>Исправление недостатков.</b> Подтверждённые несоответствия "
    "согласованным критериям устраняются по оферте и спецификации.\n"
    "🤫 <b>Конфиденциальность.</b> Данные используются только для целей заказа "
    "и передаются лишь тем категориям получателей, которые названы в политике ПДн.\n"
    "💬 <b>Связь и история.</b> Статусы, файлы и сообщения остаются в приватном "
    "деле заказа.\n\n"
    f'Юридические детали: <a href="{config.SITE_URL}/oferta.html">оферта</a> · '
    f'<a href="{config.SITE_URL}/privacy.html">конфиденциальность</a>'
)

CONTACTS = (
    "<b>Связь с мастерской</b>\n\n"
    "💬 Быстрее всего — написать прямо сюда, в этот чат: сообщение сразу попадает "
    "к мастеру.\n"
    f"👤 Личная переписка: @{config.SUPPORT_USERNAME}\n"
    f'🌐 Сайт со сметой и кабинетом: {config.SITE_URL}\n'
    '📣 Сообщество ВКонтакте: <a href="https://vk.com/academicsaloon">vk.com/academicsaloon</a>\n'
    '💠 Канал в MAX: <a href="https://max.ru/join/dP7MynBoq0tumYpQIc5e5UYtt_F9ZGElLsRetoIHZPs">присоединиться</a>\n\n'
    "Работаем ежедневно; ночью отвечаем утром."
)

ASK_QUESTION = (
    "Напишите ваш вопрос одним сообщением — передадим мастеру и ответим прямо здесь.\n\n"
    "<i>Можно приложить файл или голосовое.</i>"
)

QUESTION_SENT = "Передали мастерской. Ответ придёт в этот чат — обычно в течение 15–30 минут в рабочее время. 🕊"

MSG_RELAYED = "Передали мастерской · заказ {no}. Ответ придёт в этот чат."
MSG_RELAYED_NO_ORDER = "Передали мастерской. Ответ придёт в этот чат."

FIRST_BONUS = (
    "🎁 Новым гостям мы дарим <b>300 бонусов</b> (1 бонус = 1 ₽ скидки). "
    "Нажмите кнопку ниже — начислим сразу."
)

WELCOME_RULES_ASK = (
    "🎁 <b>Приветственные 300 бонусов</b>\n\n"
    "Бонусы — это скидка деньгами: 1 бонус = 1 ₽, списываются до 20% стоимости "
    "заказа. Приветственные действуют 30 дней.\n\n"
    "Начислим после короткой формальности — подтвердите, что ознакомились "
    "с <a href=\"{site}/loyalty.html\">правилами программы лояльности</a>."
)
WELCOME_GRANTED = (
    "✨ <b>Готово: +300 бонусов на вашем счету.</b>\n\n"
    "Они действуют 30 дней и спишутся при первом заказе — до 20% его стоимости. "
    "Баланс всегда виден в «💎 Мои бонусы» и в кабинете на сайте."
)
WELCOME_ALREADY = (
    "Приветственный бонус уже был начислен на этот аккаунт — он выдаётся один раз. "
    "Текущий баланс: <b>{balance}</b>. Заработать ещё можно кэшбэком с заказов "
    "и приглашениями друзей — «💎 Мои бонусы»."
)

BONUS_MENU = (
    "💎 <b>Ваши бонусы: {balance}</b>\n"
    "{expiring}\n"
    "Как это работает:\n"
    "• 1 бонус = 1 ₽ скидки, списание — до 20% стоимости заказа (заказ от 1000 ₽);\n"
    "• кэшбэк 5% с каждого оплаченного заказа (действует 90 дней);\n"
    "• за приглашённого друга — 5% с его оплат, а другу — 200 бонусов.\n\n"
    "🔗 Ваша ссылка-приглашение:\n<code>{ref_link}</code>\n\n"
    "Списать бонусы можно в карточке заказа, когда мастер назначит цену. "
    "<a href=\"{site}/loyalty.html\">Полные правила</a>"
)

REF_HELLO = (
    "🤝 Вы пришли по приглашению — после первого оплаченного заказа "
    "мы начислим вам <b>200 бонусов</b>."
)

# --- визард заявки ---

WIZ_TYPE = "📝 <b>Новая заявка · шаг 1</b>\n\nС каким материалом или задачей нужна помощь?"
WIZ_RESULT = (
    "🎯 <b>Шаг 2 · выберите результат</b>\n\n"
    "🔎 <b>Диагностика</b> — аудит и карта следующих шагов.\n"
    "✍️ <b>Редакторский аудит</b> — правки в вашем тексте и комментарии.\n"
    "🧭 <b>Сопровождение</b> — проверка этапов, консультации и подготовка к защите."
)
WIZ_MATERIAL = (
    "📚 <b>Шаг 3 · что у вас уже есть?</b>\n\n"
    "Выберите ближайший вариант. Если материала пока нет, начнём с диагностики "
    "задания и плана самостоятельной работы."
)
WIZ_MATERIAL_SVC = (
    "📚 <b>Что у вас уже есть?</b>\n\n"
    "Выберите ближайший вариант — так мастер сразу поймёт исходную точку."
)
WIZ_DISC = "🎓 <b>Шаг 4</b>\n\nВыберите направление — от него зависит смета:"
WIZ_TERM = "⏳ <b>Шаг 5</b>\n\nК какой дате нужен первый согласованный результат?"
WIZ_TOPIC = (
    "✍️ <b>Шаг 6</b>\n\nНапишите тему вашего материала или опишите задачу своими словами.\n\n"
    "<i>Если темы ещё нет — так и напишите: предложим маршрут и вопросы для согласования.</i>"
)
WIZ_TOPIC_SVC = (
    "✍️ <b>Опишите задачу</b>\n\n"
    "Какой материал у вас есть и какой результат нужен от мастерской?"
)
WIZ_DEADLINE = (
    "📅 К какой дате нужен согласованный результат или следующий этап?\n\n"
    "<i>Например: «25 августа», «через месяц», «до конца сессии».</i>"
)
WIZ_DETAILS = (
    "📋 <b>Требования и критерии</b>\n\n"
    "Методичка, объём вашего материала, критерии кафедры, система проверки и её "
    "отчёт (если есть), особые пожелания — одним сообщением.\n\n"
    "Если требований пока нет — нажмите «Пропустить»."
)
WIZ_FILES = (
    "📎 Приложите файлы, если есть: методичка, задание, черновики (до 10 файлов).\n\n"
    "Когда закончите — нажмите «Готово». Если файлов нет — «Пропустить»."
)
WIZ_FILE_ADDED = "📎 Файл принят ({n}). Пришлите ещё или нажмите «Готово»."
WIZ_CONFIRM_TITLE = "🧾 <b>Проверьте заявку</b>\n"
WIZ_SENT = (
    "🚀 <b>Заявка {no} отправлена!</b>\n\n"
    "Мастер посмотрит её и вернётся с оценкой — обычно в течение 15–30 минут "
    "в рабочее время. Ответ придёт прямо в этот чат.\n\n"
    "Статус всегда можно посмотреть в «📚 Мои заказы»."
)
WIZ_CANCELED = "Заявка отменена. Вернуться можно в любой момент — «📝 Новая заявка»."
INTAKE_BLOCKED = (
    "🛡 <b>Эту задачу нельзя оформить как коммерческий заказ.</b>\n\n"
    "Мы не выполняем аттестационные материалы, тесты или действия в LMS вместо "
    "клиента, не выдумываем данные и источники и не обходим проверки.\n\n"
    "<b>Что можно:</b>\n"
    "• диагностика ваших материалов и карта следующих шагов;\n"
    "• редакторский аудит вашего текста с комментариями;\n"
    "• консультация по структуре, методике и расчётам на ваших данных;\n"
    "• оформление, проверка источников и подготовка к защите."
)

# --- смета с сайта ---

SITE_QUOTE_HEAD = "🧮 <b>Ваша смета с сайта</b>\n"
SITE_QUOTE_FOOT = (
    "\nЭто предварительная вилка: точную цену назовём после короткого диалога — "
    "бесплатно, решение останется за вами.\n\n<b>Оформить заявку с этой сметой?</b>"
)
SITE_SVC_FOOT = "\n\n<b>Оставить заявку?</b> Оценка бесплатна, решение останется за вами."
LEAD_LINKED = (
    "Рады видеть! Вашу заявку с сайта мы уже получили — теперь она привязана "
    "к этому чату. Мастер ответит здесь. 🕊"
)

# --- карточка заказа для клиента ---

def client_order_card(o, files_count: int = 0, items=None) -> str:
    st = ST[o["status"]]
    lines = [f"🗂 <b>Заказ {order_no(o['id'])}</b> · {esc(o['work_label'])}"]
    if o["topic"]:
        lines.append(f"📖 Тема: <i>{esc(o['topic'])}</i>")
    if o["deadline_text"]:
        lines.append(f"📅 Срок: {esc(o['deadline_text'])}")
    if o["price"]:
        p = f"💰 Цена: <b>{fmt_money(o['price'])} ₽</b>"
        if o["prepay"] and o["status"] in ("priced", "prepay"):
            p += f" (предоплата {fmt_money(o['prepay'])} ₽)"
        lines.append(p)
        sub_disc = _row_int(o, "sub_discount")
        if sub_disc:
            lines.append(f"⭐ Скидка «Салон+»: −{fmt_money(sub_disc)} ₽")
        promo_d = _row_int(o, "promo_discount")
        if promo_d:
            lines.append(f"🎟 Промокод: −{fmt_money(promo_d)} ₽")
        gift_a = _row_int(o, "gift_amount")
        if gift_a:
            lines.append(f"🎁 Сертификат: −{fmt_money(gift_a)} ₽")
    elif o["quote_low"]:
        lines.append(f"💰 Смета: {fmt_money(o['quote_low'])} – {fmt_money(o['quote_high'])} ₽")
    if files_count:
        lines.append(f"📎 Файлы: {files_count}")
    if items:
        lines.append(client_order_items(items))
    lines.append("")
    lines.append(progress_line(o["status"]))
    if _is_paused(o):
        who = "по просьбе мастера" if (o["paused_by"] or "") == "admin" else "по вашей просьбе"
        lines.append(f"\n⏸ <b>Дело на паузе</b> ({who}) — напоминания молчат, "
                     "работа продолжится после снятия паузы.")
    lines.append(f"\n{st.emoji} <b>{st.client_label}</b>")
    return "\n".join(lines)


def client_order_items(items, max_chars: int = 900) -> str:
    """Понятный состав комплекса в клиентской Telegram-карточке."""
    if not items:
        return ""
    parent_ids = {
        _row_get(item, "client_id")
        for item in items if item["kind"] == "work" and _row_get(item, "client_id")
    }
    lines = [f"\n🧾 <b>Состав сметы · {len(items)} поз.</b>"]
    used = len(lines[0])
    for item in items:
        nested = (item["kind"] == "service"
                  and _row_get(item, "parent_client_id") in parent_ids)
        prefix = "↳" if nested else f"{item['position']}."
        price = ""
        if item["quote_low"]:
            hi = item["quote_high"] or item["quote_low"]
            price = f" · {fmt_money(item['quote_low'])}"
            if hi != item["quote_low"]:
                price += f"–{fmt_money(hi)}"
            price += " ₽"
        row = (f"\n{'   ' if nested else ''}<b>{prefix}</b> "
               f"{esc(item['label'])}"
               + (f" × {item['qty']}" if (item["qty"] or 1) > 1 else "")
               + price)
        if used + len(row) > max_chars:
            lines.append("\n…остальное видно в кабинете сайта")
            break
        lines.append(row)
        used += len(row)
    return "".join(lines)


def _is_paused(o) -> bool:
    try:
        return bool(o["paused"])
    except (KeyError, IndexError):
        return False


def _row_int(o, key: str) -> int:
    try:
        return int(o[key] or 0)
    except (KeyError, IndexError, TypeError, ValueError):
        return 0


def _row_get(o, key: str):
    try:
        return o[key]
    except (KeyError, IndexError):
        return None


def money_summary_master(due: dict, gift: dict | None = None) -> str:
    """Готовый расчёт для мастера: сколько клиент платит деньгами.

    Пустая строка, когда вычетов нет (итог равен цене) — цену не дублируем."""
    bits = []
    if due.get("sub_discount"):
        bits.append(f"⭐ подписка −{fmt_money(due['sub_discount'])}")
    if due.get("promo_discount"):
        bits.append(f"🎟 промо −{fmt_money(due['promo_discount'])}")
    if due.get("bonus_spent"):
        bits.append(f"💎 бонусы −{fmt_money(due['bonus_spent'])}")
    if due.get("gift_amount"):
        bits.append(f"🎁 сертификат −{fmt_money(due['gift_amount'])}")
    if not bits:
        return ""
    line = (f"💵 Деньгами к оплате: <b>{fmt_money(due.get('due_total') or 0)} ₽</b>"
            f" ({', '.join(bits)})")
    if due.get("due_total") and due.get("prepay_due") and due["prepay_due"] != due["due_total"]:
        line += (f"\n└ первый платёж {fmt_money(due['prepay_due'])} ₽ · "
                 f"далее {fmt_money(due['rest_due'])} ₽")
    if gift and due.get("gift_amount"):
        line += f"\n└ на сертификате останется {fmt_money(gift.get('balance') or 0)} ₽"
    return line


def gift_card_lines(o, gift: dict) -> list[str]:
    """Сертификат в карточке мастера ДО цены: номинал, остаток, готовые примеры."""
    bal = int(gift.get("balance") or 0)
    head = f"🎁 Сертификат: <b>{esc(gift['code'])}</b> · на счету <b>{fmt_money(bal)} ₽</b>"
    if int(gift.get("amount") or 0) != bal:
        head += f" (номинал {fmt_money(gift['amount'])} ₽)"
    out = [head]
    if bal <= 0:
        out.append("└ на сертификате пусто — оплата деньгами полностью")
        return out
    samples = [x for x in dict.fromkeys((_row_int(o, "quote_low"),
                                         _row_int(o, "quote_high"))) if x]
    if samples:
        ex = " · ".join(f"цена {fmt_money(x)} → деньгами {fmt_money(max(x - bal, 0))} ₽"
                        for x in samples)
        out.append(f"└ спишется при цене сам: {ex}")
    else:
        out.append(f"└ спишется при назначении цены автоматически (до {fmt_money(bal)} ₽)")
    return out


def price_gift_hint(o, gift: dict | None) -> str:
    """Подсказка в прайс-промпт: вычет сертификата виден до ввода цены."""
    if not gift:
        return ""
    bal = int(gift.get("balance") or 0)
    if bal <= 0:
        return ""
    sample = _row_int(o, "quote_low") or (bal + 5000)
    return (f"\n\n🎁 У клиента сертификат: на счету <b>{fmt_money(bal)} ₽</b> — "
            f"вычтется из цены сам (например, цена {fmt_money(sample)} → "
            f"деньгами {fmt_money(max(sample - bal, 0))} ₽).")


def progress_line(status: str) -> str:
    step = ST[status].step
    if step < 0:
        return "🚫 Заявка закрыта"
    out = []
    for i, name in enumerate(config.PROGRESS_STEPS, start=1):
        if i < step:
            out.append(f"✓ {name}")
        elif i == step:
            out.append(f"● <b>{name}</b>")
        else:
            out.append(f"○ {name}")
    return " → ".join(out)


PRICE_OFFER = (
    "💰 <b>Оценка по заказу {no}</b>\n\n"
    "Мастер посмотрел вашу задачу. Цена: <b>{price} ₽</b>{prepay_part}.\n\n"
    "Точный состав, сроки, критерии приёмки, порядок исправлений и режим прав "
    "указаны в приложенной спецификации."
)
PRICE_PREPAY_PART = (" (первый платёж — {prepay} ₽, остальное по этапам: "
                     "оплата каждой следующей части — по её готовности)")


def plan_offer_block(plan: list[dict], fmt) -> str:
    """Блок «оплата по частям» для предложения цены.

    Полная сумма уже названа строкой выше — здесь снимаем страх «просят всё
    сразу»: расписываем этапы и подчёркиваем, что сейчас нужен только первый
    платёж, а каждый следующий — после показанного результата.
    plan — payments.stage_plan(o) по СВЕЖЕМУ заказу (после скидок/бонусов).
    """
    if not plan:
        return ""
    if len(plan) == 1:
        return (f"\n\n💳 К оплате деньгами: <b>{fmt(plan[0]['amount'])} ₽</b> "
                "одним платежом.")
    rows = []
    for i, s in enumerate(plan, 1):
        if i == 1:
            when = "— это сейчас, на старт"
        elif i == len(plan):
            when = "— позже, после передачи итогового результата"
        else:
            when = f"— позже, по готовности части {i}"
        rows.append(f"{i}. {s['label']}: <b>{fmt(s['amount'])} ₽</b> {when}")
    return ("\n\n🧾 <b>Платите по частям, а не всё сразу:</b>\n" + "\n".join(rows)
            + f"\n\nСейчас нужен только первый платёж — <b>{fmt(plan[0]['amount'])} ₽</b>. "
              "Каждый следующий — после передачи результата соответствующего этапа.")

PRICE_ACCEPTED = (
    "Отлично! Заказ {no} закреплён за вами.\n\n"
    "{requisites}\n\n"
    "Когда переведёте — нажмите «Я оплатил(а)», мастер сверит поступление и начнёт "
    "согласованный этап."
)
REQUISITES_FALLBACK = "Реквизиты для предоплаты мастер пришлёт в этот чат через минуту."
PAYMENT_MARKED = (
    "Спасибо! Передали мастеру на сверку. Как только платёж подтвердится, "
    "заказ {no} перейдёт в работу — уведомим здесь."
)
PRICE_DECLINED = (
    "Поняли вас, заказ {no} закрыт. Если передумаете или захотите обсудить "
    "условия — просто напишите сюда."
)
WORK_STARTED = (
    "🔨 <b>Заказ {no} в работе!</b>\n\n"
    "Мы напишем, когда будет передан первый согласованный результат или появятся вопросы. "
    "Спросить о ходе работы можно в любой момент — кнопка «💬 Написать» в карточке заказа."
)
WORK_DELIVERED = (
    "📤 <b>По заказу {no} передан согласованный результат</b> — файл выше.\n\n"
    "Проверьте его по критериям спецификации. Если всё соответствует — нажмите "
    "«Принять». Если нашли несоответствие, выберите «Нужны правки» и опишите его."
)
FIX_ASK = "Опишите, что нужно поправить, одним сообщением — можно приложить файл с пометками."
FIX_TAKEN = (
    "✏️ Приняли! Правки по заказу {no} уже в очереди у мастера. "
    "Сообщим, когда передадим исправленную версию."
)
ORDER_DONE = (
    "✅ <b>Заказ {no} завершён.</b>\n\n"
    "Спасибо за доверие! История заказа и файлы остаются в вашем кабинете. "
    "Если потребуется отдельная консультация или подготовка к выступлению, "
    "напишите прямо сюда.\n\n"
    "🕊 Будем рады видеть вас снова."
)
DEFENSE_OFFER = (
    "🎓 <b>Нужна подготовка к выступлению?</b>\n\n"
    "По материалам заказа {no} можно отдельно заказать:\n"
    "🎤 <b>Презентацию, тезисы и репетицию</b> — слайды, структура выступления "
    "и разбор вероятных вопросов · от 6 000 ₽\n"
    "📏 <b>Нормоконтроль</b> — оформление по методичке и ГОСТу · от 5 000 ₽\n"
    "🎁 <b>Пакет к выступлению</b> — презентация + тезисы + нормоконтроль · "
    "<b>от 9 500 ₽</b> вместо 11 000 ₽\n\n"
    "Работа уже у нас — ничего заново описывать не придётся. Бонусы с этого "
    "заказа на счету, их можно применить к любой из услуг."
)
STATUS_CHANGED = "{emoji} Статус заказа {no}: <b>{label}</b>"

# --- мягкие предложения после завершения дела (отказаться — одна кнопка) ---

GIFT_REST_DEFENSE_LINE = (
    "\n💳 И приятное: на вашем сертификате <b>{code}</b> остались "
    "<b>{balance} ₽</b> — они спишутся сами, доплачивать придётся меньше "
    "(или вовсе ничего)."
)
GIFT_REST_OFFER = (
    "💳 <b>На сертификате {code} остались {balance} ₽.</b>\n\n"
    "Они никуда не пропадут до {expires}, но лежать без дела им скучно. "
    "Остатка {enough}\n\n"
    "Оформите заявку с этим кодом — остаток зачтётся автоматически. "
    "Не нужно — просто закройте это сообщение."
)
GIFT_REST_ENOUGH_FULL = (
    "хватает, например, на «{svc}» целиком — доплачивать не придётся.")
GIFT_REST_ENOUGH_PART = (
    "хватит на заметную часть следующей работы — презентации, речи, "
    "нормоконтроля или новой заявки.")
PROMO_REMINDER = (
    "🏷 <b>Ваш промокод {code} всё ещё действует.</b>\n\n"
    "Он не сгорел: выгода {label} ждёт следующей заявки. Применится сам — "
    "код уже вписан в ссылку ниже.\n\n"
    "Не пригодится — просто закройте это сообщение."
)

# ------------------------------------------------------------------- админ

ADMIN_HELLO = (
    "👋 <b>Бот пересобран и работает.</b> Это админ-панель — она живёт прямо в этом чате.\n\n"
    "<b>Как всё устроено:</b>\n"
    "• Новые заявки прилетают сюда карточками с кнопками.\n"
    "• <b>Ответить клиенту</b> — сделайте reply на его сообщение или карточку заказа "
    "и напишите текст (можно файл/фото/голосовое) — бот доставит.\n"
    "• 💰 «Цена» — назначить цену (и предоплату), клиент получит предложение.\n"
    "• 📤 «Сдать работу» — пришлёте файл, клиент получит его с кнопками приёмки.\n\n"
    "<b>Команды:</b>\n"
    "/orders — активные заказы\n"
    "/find <i>текст</i> — поиск по заказам\n"
    "/stats — цифры за неделю и месяц\n"
    "/requisites — реквизиты для предоплаты (карта/СБП)\n"
    "/client — посмотреть бота глазами клиента (обратно: /admin)\n\n"
    "⚠️ Реквизиты пока не заданы — задайте командой /requisites, "
    "чтобы клиенты видели их при оплате."
)

def admin_order_card(o, client, files, events, gift: dict | None = None) -> str:
    st = ST[o["status"]]
    if o["user_id"]:
        who = (f"👤 {user_link(o['user_id'], client['first_name'] if client else None, client['username'] if client else None)}"
               f" · id <code>{o['user_id']}</code>")
    else:
        who = (f"👤 Гость с сайта: {esc(o['guest_name'] or '—')}"
               + (f" · <code>{esc(o['guest_contact'])}</code>" if o["guest_contact"] else "")
               + "\n🔕 <i>Без Telegram: цены, сообщения и файлы он видит в кабинете сайта</i>")
    lines = [
        f"{st.emoji} <b>Заказ {order_no(o['id'])}</b> · {st.label}",
        who,
        f"🗓 Создан: {_msk(o['created_at'])} · источник: {esc(o['source'] or 'бот')}",
        "",
        f"📄 <b>{esc(o['work_label'])}</b>",
    ]
    if o["topic"]:
        lines.append(f"📖 Тема: {esc(o['topic'])}")
    extra = []
    if o["discipline"] and o["discipline"] in config.DISC_BY_ID:
        extra.append(config.DISC_BY_ID[o["discipline"]][2])
    if o["tier"] and o["tier"] in config.TIER_BY_ID:
        extra.append("результат «" + config.TIER_BY_ID[o["tier"]][2] + "»")
    if extra:
        lines.append("🎓 " + " · ".join(extra))
    if o["deadline_text"]:
        d = f"📅 Срок: {esc(o['deadline_text'])}"
        if o["deadline_date"]:
            d += f" (≈ {o['deadline_date'][8:10]}.{o['deadline_date'][5:7]})"
        lines.append(d)
    if o["details"]:
        lines.append(f"📋 Требования: {esc(o['details'][:400])}")
    if o["quote_low"]:
        lines.append(f"🧮 Смета сайта: {fmt_money(o['quote_low'])} – {fmt_money(o['quote_high'])} ₽")
    if _row_get(o, "promo_code") and not o["price"]:
        lines.append(f"🎟 Промокод: <b>{esc(o['promo_code'])}</b> — применится при цене")
    if _row_get(o, "gift_code") and not o["price"]:
        if gift:
            lines.extend(gift_card_lines(o, gift))
        else:
            lines.append(f"🎁 Сертификат: <b>{esc(o['gift_code'])}</b> — зачтётся при цене")
    if o["work_type"] == "svc_plan" and not o["price"]:
        lines.append("💡 Прайс разбора: <b>3 000 ₽</b> (магистерская/кандидатская — 5 000 ₽) · "
                     "зачитывается при продолжении работы")
    if o["price"]:
        p = f"💰 Цена: <b>{fmt_money(o['price'])} ₽</b>"
        if o["prepay"]:
            p += f" · предоплата {fmt_money(o['prepay'])} ₽"
        if _row_int(o, "sub_discount"):
            p += f" · ⭐ скидка Салон+ −{fmt_money(o['sub_discount'])} ₽"
        if _row_int(o, "promo_discount"):
            p += f" · 🎟 промо {esc(_row_get(o, 'promo_code') or '')} −{fmt_money(o['promo_discount'])} ₽"
        if _row_int(o, "bonus_spent"):
            p += f" · 💎 бонусы −{fmt_money(o['bonus_spent'])} ₽"
        if _row_int(o, "gift_amount"):
            p += f" · 🎁 сертификат −{fmt_money(o['gift_amount'])} ₽"
        lines.append(p)
        # готовый итог деньгами — мастеру не нужно считать вычеты в уме
        from .services import payments as _pay  # локальный импорт: payments сам импортирует texts
        ms = money_summary_master(_pay.money_due(o), gift)
        if ms:
            lines.append(ms)
    total_parts = o["stages_total"] or 0
    if total_parts > 1:
        plan_name = "30/40/30" if total_parts == 3 else "50/50"
        lines.append(f"🧩 Сдача по частям: <b>{o['stage'] or 1} из {total_parts}</b> "
                     f"(принято {o['parts_done'] or 0}) · оплата {plan_name}")
    if o["status"] in ("work", "fix"):
        if _row_int(o, "final_ready"):
            lines.append("🏁 <b>Счёт на остаток выставлен</b> — финал придержан до оплаты")
        elif _row_int(o, "part_ready"):
            lines.append(f"📣 <b>Счёт за часть {o['part_ready']} выставлен</b> — "
                         "файл придержан до оплаты")
    if _is_paused(o):
        pby = "мастером" if (o["paused_by"] or "") == "admin" else "клиентом"
        lines.append(f"⏸ <b>На паузе</b> (поставлена {pby} {_msk(o['paused_at'])})")
    if o["cancel_reason"]:
        lines.append(f"🚫 Причина отказа: «{esc(o['cancel_reason'])}»")
    if files:
        names = ", ".join(esc(f["file_name"] or f["kind"]) for f in files[:6])
        lines.append(f"📎 Файлы ({len(files)}): {names}")
    if o["admin_note"]:
        lines.append(f"📝 Заметка: <i>{esc(o['admin_note'][:300])}</i>")
    if events:
        lines.append("")
        lines.append("<i>История: " + " · ".join(
            f"{_msk(e['created_at'])} {esc(e['kind'])}" + (f" {esc(e['data'][:40])}" if e["data"] else "")
            for e in list(events)[:4]
        ) + "</i>")
    return "\n".join(lines)


def admin_order_items(items, max_chars: int = 1800) -> str:
    """Компактный, но полный насколько позволяет Telegram, состав комплекса."""
    if not items:
        return ""
    max_chars = max(90, min(1800, int(max_chars or 0)))
    lines = [f"\n\n🧾 <b>Состав заявки · {len(items)} поз.</b>"]
    used = len(lines[0])
    shown = 0
    for item in items:
        price = ""
        if item["quote_low"]:
            price = f" · {fmt_money(item['quote_low'])}"
            if item["quote_high"] and item["quote_high"] != item["quote_low"]:
                price += f"–{fmt_money(item['quote_high'])}"
            price += " ₽"
        row = (f"\n<b>{item['position']}.</b> {esc(item['label'])}"
               + (f" × {item['qty']}" if (item["qty"] or 1) > 1 else "") + price)
        detail = item["topic"] or item["note"] or item["requirements"]
        if detail:
            row += f"\n   <i>{esc(str(detail)[:140])}</i>"
        if used + len(row) > max_chars:
            break
        lines.append(row)
        used += len(row)
        shown += 1
    if shown < len(items):
        tail = f"\n…ещё {len(items) - shown} поз. — полностью в админке сайта"
        if used + len(tail) <= max_chars:
            lines.append(tail)
    return "".join(lines)


def _msk(iso: str | None) -> str:
    from .db import to_msk
    return to_msk(iso)


async def order_intel(o) -> str:
    """Разведблок для рабочей группы: всё, что мастеру нужно знать о клиенте.

    Выбранный результат, цена, показанная сайтом, бонусы клиента и списание,
    рефералы, согласие на обработку данных, зарегистрирован или гость.
    """
    from . import db
    from .services import bonus as bonus_svc
    lines = ["", "— — —"]
    if o["tier"] and o["tier"] in config.TIER_BY_ID:
        t = config.TIER_BY_ID[o["tier"]]
        lines.append(f"🎯 Результат: <b>{t[2]}</b> ({t[4]})")
    if o["quote_low"]:
        lines.append(f"🧮 Сайт показал клиенту: {fmt_money(o['quote_low'])} – "
                     f"{fmt_money(o['quote_high'])} ₽")
    if o["bonus_spent"]:
        lines.append(f"💎 Применено бонусов к заказу: <b>{o['bonus_spent']}</b>")
    if o["user_id"]:
        from .services import subs as subs_svc
        sub = await subs_svc.summary(o["user_id"])
        if sub:
            lines.append(f"{sub['emoji']} <b>Подписчик {sub['label']}</b> до {sub['expires_ru']} "
                         "— приоритетная очередь!")
        s = await bonus_svc.summary(o["user_id"])
        exp = (" · сгорит " + ", ".join(f"{e['amount']} ({_msk(e['at'])[:5]})"
                                        for e in s["expiring"])) if s["expiring"] else ""
        lines.append(f"💎 Бонусный счёт клиента: <b>{s['balance']}</b>{exp}")
        u = await db.get_user(o["user_id"])
        if u:
            refs = await db.referrals_of(o["user_id"])
            bits = []
            if u["referrer_id"]:
                bits.append(f"пришёл по приглашению <code>{u['referrer_id']}</code>")
            if refs:
                bits.append(f"привёл {len(refs)} чел.")
            if u["banned"]:
                bits.append("⛔️ В ЧЁРНОМ СПИСКЕ")
            if bits:
                lines.append("🤝 " + " · ".join(bits))
    else:
        lines.append("👻 Гость без Telegram — не потеряйте: контакт выше, "
                     "ответы дойдут в его кабинет на сайте")
    links = contact_links_html(o["guest_contact"])
    if links:
        lines.append(f"📇 Быстрая связь: {links}")
    if o["consent_at"]:
        lines.append(f"📋 Согласие на обработку данных: {_msk(o['consent_at'])} "
                     f"({esc(o['consent_doc'] or '')})")
    if o["page"]:
        lines.append(f"🔗 Пришёл со страницы: {esc(o['page'])}")
    return "\n".join(lines) if len(lines) > 2 else ""


NEW_ORDER_ALERT = "🔔 <b>Новая заявка!</b>"
NEW_LEAD_ALERT = "🌐 <b>Заявка с сайта</b>"
NEW_QUESTION_ALERT = "💬 <b>Вопрос</b> · {who}"
ORDER_PING = "⏰ Заявка {no} ждёт ответа уже {mins} мин."
ADMIN_REPLY_SENT = "✅ Доставлено · {who}{order_part}"
ADMIN_REPLY_FAIL = "⚠️ Не доставлено: {err}"
PRICE_ASK = (
    "Выберите ориентир кнопкой или введите свою цену для заказа {no} "
    "ответом на это сообщение.\n"
    "Форматы: <code>35000</code> — только цена (предоплата 50%)\n"
    "или <code>35000 10000</code> — цена и предоплата."
)
PRICE_SET_OK = "💰 Цена по заказу {no} отправлена клиенту: {price} ₽ (предоплата {prepay} ₽)."
DELIVER_ASK = (
    "Пришлите файл работы для заказа {no} ответом на это сообщение "
    "(можно несколько подряд). Клиент получит их с кнопками приёмки."
)
DELIVER_SENT = "📤 Файл ушёл клиенту · заказ {no}. Статус: на проверке."
NOTE_ASK = "Напишите заметку к заказу {no} (видна только вам):"
NOTE_SAVED = "📝 Заметка сохранена."
PAYMENT_CLAIM = "💳 {who} отметил(а) оплату по заказу {no} — проверьте поступление."
FIX_ALERT = "✏️ <b>Правки по заказу {no}</b> · {who}:"
ACCEPT_ALERT = "🎉 {who} принял(а) работу по заказу {no} — заказ завершён."
DECLINE_ALERT = "🚫 {who} отказался(лась) от предложения по заказу {no}."
REQUISITES_CURRENT = "Текущие реквизиты для предоплаты:\n\n{req}\n\nЧтобы заменить — пришлите новый текст ответом на это сообщение."
REQUISITES_NONE = "Реквизиты ещё не заданы. Пришлите текст ответом на это сообщение — например:\n<code>Сбер: 2202 2000 0000 0000 (Иван И.)\nСБП: +7 900 000-00-00 (Сбер/Тинькофф)</code>"
REQUISITES_SAVED = "✅ Реквизиты сохранены — клиенты увидят их при оплате."
CLIENT_MODE_ON = "👤 Режим клиента: вы видите бота как обычный гость. Вернуться: /admin"
CLIENT_MODE_OFF = "🛠 Админ-режим снова включён."

HELP_CLIENT = (
    "<b>Что умеет этот бот</b>\n\n"
    "📝 Принять заявку на работу и посчитать смету\n"
    "📚 Показать статус ваших заказов\n"
    "💬 Связать с мастером — просто напишите сообщение\n"
    "📎 Передать файлы: методички, исходные данные, тексты и черновики\n\n"
    "Все вопросы решаются прямо в этом чате."
)
