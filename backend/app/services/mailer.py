"""Почта: коды входа и уведомления о заказе.

Правила:
- SMTP не настроен (config.mail_on() == False) — всё молча выключено.
- Никогда не роняем вызывающего: любая ошибка — warning в лог, False в ответ.
- Кому писать по заказу: аккаунту с почтой (users.email) или гостю,
  чей контакт в заявке похож на e-mail. Telegram-клиентам письма не шлём —
  их уведомляет бот.
- Каждое письмо — multipart/alternative: простой текст (самая живучая
  версия, по ней же оценивают спам-фильтры) плюс HTML в фирменном стиле
  сайта («Оттиск»: бумага, чернила, сургучная кнопка). Без картинок и
  внешних ресурсов — нечему «не загрузиться» и не за что штрафовать.
- Гостю в каждом письме — секретная ссылка доступа к делу (кабинет
  откроется на любом устройстве).
"""
from __future__ import annotations

import asyncio
import logging
import re
import smtplib
import ssl
import time
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from html import escape

from .. import config, db

log = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$")

# --- работоспособность SMTP ---------------------------------------------
# Проверяем не только порт (Timeweb Cloud блокирует исходящий SMTP по
# умолчанию, открывают тикетом), но и ЛОГИН: порт может быть открыт, а
# пароль ящика — уже не подходить (сменили в панели / хостер заблокировал
# ящик). Раньше такое состояние выглядело как «почта работает», и письма
# молча пропадали. Пока SMTP нерабочий, вход по почте на сайте честно
# прячется; после починки включится сам — кэш живёт 10 минут.
_SMTP_PROBE_TTL = 600.0
_smtp_ok: bool | None = None
_smtp_checked_at = 0.0
_smtp_err: str | None = None


def _connect_smtp(timeout: float = 12) -> smtplib.SMTP:
    """Открыть SMTP-соединение с учётом режима TLS (без логина).

    EHLO — обязательно своим доменом, НЕ хостнеймом VPS: дефолтное имя
    3506781-nq23172.twc1.net подставляло в HELO домен twc1.net, который
    числится в Spamhaus DBL (127.0.1.2). Исходящий rspamd Timeweb проверяет
    HELO по DBL и вешал каждому письму DBL_SPAM(6.50) → X-Spam-Status: Yes →
    mail.ru/bk.ru отвечали «550 spam message rejected».
    """
    helo = config.SMTP_FROM.split("@", 1)[-1] or "akademsalon.ru"
    mode = _tls_mode()
    if mode == "ssl":
        ctx = ssl.create_default_context()
        return smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, local_hostname=helo,
                                context=ctx, timeout=timeout)
    s = smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, local_hostname=helo, timeout=timeout)
    if mode == "starttls":
        s.starttls(context=ssl.create_default_context())
    return s


def _probe_smtp() -> None:
    with _connect_smtp() as s:
        _login(s)


async def smtp_reachable(force: bool = False) -> bool:
    """SMTP настроен, порт открыт И логин проходит. Кэш — 10 минут."""
    global _smtp_ok, _smtp_checked_at, _smtp_err
    if not config.mail_on():
        return False
    now = time.monotonic()
    if not force and _smtp_ok is not None and now - _smtp_checked_at < _SMTP_PROBE_TTL:
        return _smtp_ok
    err: str | None = None
    try:
        await asyncio.to_thread(_probe_smtp)
        ok = True
    except smtplib.SMTPAuthenticationError as e:
        ok = False
        err = (f"авторизация отклонена ({e.smtp_code}): пароль ящика в .env не подходит — "
               "его сменили в панели или ящик заблокировал хостер")
        log.warning("smtp auth %s@%s failed: %s", config.SMTP_USER, config.SMTP_HOST, e)
    except Exception as e:  # noqa: BLE001 — таймаут/refused = порт закрыт
        ok = False
        err = f"порт {config.SMTP_HOST}:{config.SMTP_PORT} недоступен (закрыт хостером?): {e}"
        log.warning("smtp probe %s:%s failed: %s", config.SMTP_HOST, config.SMTP_PORT, e)
    if ok and _smtp_ok is False:
        log.info("smtp снова доступен — почта заработала")
    _smtp_ok, _smtp_checked_at, _smtp_err = ok, now, err
    return ok


def smtp_error() -> str | None:
    """Причина последней неудачной проверки SMTP (None — всё в порядке)."""
    return _smtp_err

# троттлинг писем «новое сообщение мастера»: не чаще раза в 20 минут на заказ
_MSG_MAIL_COOLDOWN_S = 20 * 60
_last_msg_mail: dict[int, float] = {}


def looks_email(s: str | None) -> bool:
    return bool(s and _EMAIL_RE.match(s.strip()))


def _tls_mode() -> str:
    if config.SMTP_TLS in ("ssl", "starttls", "plain"):
        return config.SMTP_TLS
    return "ssl" if config.SMTP_PORT == 465 else "starttls"


def _login(s: smtplib.SMTP) -> None:
    try:
        s.login(config.SMTP_USER, config.SMTP_PASS)
    except smtplib.SMTPNotSupportedError:
        pass  # релей без AUTH (доверие по IP / локальный) — шлём как есть


def _send_sync(msg: EmailMessage) -> None:
    with _connect_smtp(timeout=20) as s:
        _login(s)
        s.send_message(msg)


# ------------------------------------------------------------------ письма
# Письмо собирается в «формуляр» — dict, из которого рендерятся обе версии.
# Ключи (все, кроме subject, необязательны):
#   subject    тема
#   preheader  скрытая строка-превью (по умолчанию — первый абзац)
#   title      заголовок внутри письма
#   paras      абзацы до «крупных» блоков
#   code       крупный код входа
#   facts      [(подпись, значение)] — квитанция: заказ, цена, срок…
#   paras2     абзацы после квитанции
#   button     (подпись, url) — сургучная кнопка; в тексте станет строкой-ссылкой
#   aside      примечание мелким шрифтом (например, про секретную ссылку)

_C = {"paper": "#F6F1E7", "sheet": "#FFFEF9", "ink": "#22201B",
      "soft": "#6B665A", "faint": "#857E6C", "hair": "#D9D2C2",
      "hair2": "#C2B89F", "wax": "#B23B22", "mark": "#EFE5CC", "bed": "#F1EBDD"}
_SERIF = "Georgia,'Times New Roman',serif"
_MONO = "Consolas,'Courier New',monospace"


def _e(s) -> str:
    return escape(str(s), quote=True)


def _rub(n) -> str:
    return f"{config.fmt_money(n)} ₽"


def _field(o, key):
    """Безопасно достать колонку из sqlite3.Row или dict."""
    try:
        return o[key]
    except Exception:  # noqa: BLE001
        return None


_FOOTER_TEXT = (
    "Академический Салон · мастерская учебных и научных материалов\n"
    "akademsalon.ru · support@akademsalon.ru · Telegram @academicsaloon\n"
    "Исполнитель: самозанятый, ИНН 212885750445.\n"
    "Вы получили письмо, потому что оставили заявку или входите в кабинет\n"
    "на akademsalon.ru. Можно ответить прямо на это письмо — мы читаем.")


def _render_text(L: dict) -> str:
    parts: list[str] = []
    if L.get("title"):
        parts.append(L["title"])
    parts += list(L.get("paras") or [])
    if L.get("code"):
        parts.append(f"    {L['code']}")
    if L.get("facts"):
        parts.append("\n".join(f"{k}: {v}" for k, v in L["facts"]))
    parts += list(L.get("paras2") or [])
    if L.get("button"):
        lbl, url = L["button"]
        parts.append(f"{lbl}: {url}")
    if L.get("aside"):
        parts.append(L["aside"])
    return "\n\n".join(parts) + "\n\n—\n" + _FOOTER_TEXT


def _render_html(L: dict) -> str:
    c = _C
    pre = L.get("preheader") or (L.get("paras") or [L["subject"]])[0]

    def para(t: str, first: bool = False) -> str:
        return (f'<p style="margin:{"0" if first else "14px"} 0 0;font-family:{_SERIF};'
                f'font-size:16px;line-height:1.62;color:{c["ink"]};">{_e(t)}</p>')

    b: list[str] = []
    if L.get("title"):
        b.append(f'<h1 style="margin:0;font-family:{_SERIF};font-weight:400;font-size:23px;'
                 f'line-height:1.3;color:{c["ink"]};">{_e(L["title"])}</h1>')
    for t in L.get("paras") or []:
        b.append(para(t, first=not b))
    if L.get("code"):
        b.append(
            f'<table role="presentation" cellpadding="0" cellspacing="0" align="center" '
            f'style="margin:20px auto 6px;"><tr><td align="center" style="background:{c["mark"]};'
            f'border:1px dashed {c["hair2"]};border-radius:2px;padding:15px 30px;'
            f'font-family:{_MONO};font-size:30px;font-weight:700;letter-spacing:8px;'
            f'color:{c["ink"]};">{_e(L["code"])}</td></tr></table>')
    if L.get("facts"):
        rows = "".join(
            f'<tr><td valign="top" style="padding:9px 14px 9px 0;border-bottom:1px solid {c["bed"]};'
            f'font-family:{_SERIF};font-size:13px;color:{c["faint"]};white-space:nowrap;">{_e(k)}</td>'
            f'<td valign="top" align="right" style="padding:9px 0;border-bottom:1px solid {c["bed"]};'
            f'font-family:{_SERIF};font-size:15px;color:{c["ink"]};">{_e(v)}</td></tr>'
            for k, v in L["facts"])
        b.append(f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
                 f'style="margin:16px 0 2px;">{rows}</table>')
    for t in L.get("paras2") or []:
        b.append(para(t))
    if L.get("button"):
        lbl, url = L["button"]
        b.append(
            f'<table role="presentation" cellpadding="0" cellspacing="0" align="center" '
            f'style="margin:22px auto 0;"><tr><td bgcolor="{c["wax"]}" style="border-radius:2px;">'
            f'<a href="{_e(url)}" style="display:inline-block;padding:13px 28px;font-family:{_SERIF};'
            f'font-size:15px;font-weight:700;color:{c["sheet"]};text-decoration:none;">{_e(lbl)}</a>'
            f'</td></tr></table>'
            f'<p style="margin:10px 0 0;font-family:{_SERIF};font-size:12px;line-height:1.5;'
            f'color:{c["faint"]};text-align:center;word-break:break-all;">Если кнопка не '
            f'открывается: <a href="{_e(url)}" style="color:{c["soft"]};">{_e(url)}</a></p>')
    if L.get("aside"):
        b.append(f'<div style="margin:20px 0 0;padding:12px 14px;background:{c["bed"]};'
                 f'border-left:3px solid {c["hair2"]};font-family:{_SERIF};font-size:13px;'
                 f'line-height:1.55;color:{c["soft"]};">{_e(L["aside"])}</div>')

    site = getattr(config, "SITE_URL", "https://akademsalon.ru") or "https://akademsalon.ru"
    return (
        '<!doctype html><html lang="ru"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="color-scheme" content="light">'
        f'<title>{_e(L["subject"])}</title></head>'
        f'<body style="margin:0;padding:0;background:{c["paper"]};">'
        f'<div style="display:none;max-height:0;overflow:hidden;">{_e(pre)}'
        + "&nbsp;&zwnj;" * 24 +
        '</div>'
        f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" '
        f'bgcolor="{c["paper"]}"><tr><td align="center" style="padding:28px 12px 36px;">'
        f'<table role="presentation" cellpadding="0" cellspacing="0" '
        f'style="width:100%;max-width:600px;">'
        f'<tr><td align="center" style="padding:2px 8px 14px;">'
        f'<div style="font-family:{_SERIF};font-size:14px;font-weight:700;letter-spacing:4px;'
        f'color:{c["ink"]};">АКАДЕМИЧЕСКИЙ&nbsp;САЛОН</div>'
        f'<div style="padding-top:5px;font-family:{_SERIF};font-size:10px;letter-spacing:2px;'
        f'color:{c["faint"]};">МАСТЕРСКАЯ УЧЕБНЫХ И НАУЧНЫХ РАБОТ</div>'
        f'</td></tr>'
        f'<tr><td bgcolor="{c["sheet"]}" style="background:{c["sheet"]};border:1px solid {c["hair"]};'
        f'border-top:3px solid {c["ink"]};border-radius:2px;padding:28px 30px 28px;">'
        + "".join(b) +
        '</td></tr>'
        f'<tr><td align="center" style="padding:18px 16px 0;font-family:{_SERIF};font-size:12px;'
        f'line-height:1.75;color:{c["faint"]};">'
        f'Академический Салон · <a href="{_e(site)}" style="color:{c["faint"]};">akademsalon.ru</a><br>'
        f'<a href="mailto:{_e(config.SMTP_FROM)}" style="color:{c["faint"]};">{_e(config.SMTP_FROM)}</a>'
        f' · Telegram <a href="https://t.me/academicsaloon" style="color:{c["faint"]};">'
        f'@academicsaloon</a> — или просто ответьте на это письмо<br>'
        f'Исполнитель: самозанятый, ИНН&nbsp;212885750445<br>'
        f'<span style="color:#A69D87;">Вы получили письмо, потому что оставили заявку '
        f'или входите в кабинет на&nbsp;akademsalon.ru.</span>'
        f'</td></tr></table></td></tr></table></body></html>')


async def _send_letter(to: str, L: dict) -> bool:
    """Отправить формуляр; False — SMTP выключен/нерабочий или не получилось."""
    if not config.mail_on() or not looks_email(to):
        return False
    if not await smtp_reachable():
        return False  # SMTP нерабочий (порт/логин) — не ждём таймаут на каждом письме
    msg = EmailMessage()
    msg["From"] = formataddr((config.SMTP_FROM_NAME, config.SMTP_FROM))
    msg["To"] = to
    msg["Subject"] = L["subject"]
    msg["Reply-To"] = config.SMTP_FROM
    # Date и Message-ID обязаны быть у «честного» письма — их отсутствие
    # спам-фильтры (особенно mail.ru) считают верным признаком рассылки
    msg["Date"] = formatdate(localtime=True)
    domain = config.SMTP_FROM.split("@", 1)[-1] or "akademsalon.ru"
    msg["Message-ID"] = make_msgid(domain=domain)
    msg["Auto-Submitted"] = "auto-generated"  # транзакционное, не реклама
    msg.set_content(_render_text(L))
    msg.add_alternative(_render_html(L), subtype="html")
    try:
        await asyncio.to_thread(_send_sync, msg)
        return True
    except Exception as e:  # noqa: BLE001 — почта не должна ронять основной поток
        log.warning("mail to %s failed: %s", to, e)
        return False


async def send(to: str, subject: str, text: str) -> bool:
    """Совместимость: произвольное письмо из готового текста."""
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    return await _send_letter(to, {"subject": subject, "paras": paras})


def _code_letter(code: str) -> dict:
    return {
        "subject": f"Код входа: {code} — Академический Салон",
        "preheader": "Код действует 10 минут.",
        "title": "Вход в кабинет",
        "paras": ["Вы запросили вход в личный кабинет на akademsalon.ru. Ваш код:"],
        "code": code,
        "paras2": ["Код действует 10 минут. Если вы не запрашивали вход — просто "
                   "проигнорируйте это письмо: без кода в кабинет никто не попадёт."],
    }


async def send_code(email: str, code: str) -> bool:
    return await _send_letter(email, _code_letter(code))


async def send_quote(email: str, *, work: str, params: str, low: int, high: int,
                     resume_url: str, plan: bool = False,
                     promo_code: str | None = None,
                     promo_label: str | None = None) -> bool:
    """«Смета на почту» из конфигуратора: расчёт + ссылка-возврат к оформлению."""
    facts = [("Работа", work)]
    if params:
        facts.append(("Параметры", params))
    facts.append(("Вилка сметы", f"{config.fmt_money(low)} – {config.fmt_money(high)} ₽"))
    if plan:
        facts.append(("Формат", "начать с разбора плана — зачитывается в стоимость"))
    if promo_code:
        facts.append(("Промокод", f"{promo_code} · {promo_label} — по кнопке "
                                  "ниже подставится сам"))
    return await _send_letter(email, {
        "subject": f"Ваша смета: {work} — {config.fmt_money(low)}–{config.fmt_money(high)} ₽",
        "preheader": "Вернуться к оформлению можно с любого устройства — кнопка внутри.",
        "title": "Смета вашей работы",
        "paras": ["Вы попросили прислать расчёт из конфигуратора — вот он. Это "
                  "предварительная вилка: точную цену назовёт мастер после разбора "
                  "заявки, и дальше она уже не меняется."],
        "facts": facts,
        "paras2": ["Кнопка ниже откроет конфигуратор с вашими ответами — можно "
                   "продолжить с любого устройства."],
        "button": ("Продолжить оформление", resume_url),
        "aside": "Это единственное письмо по вашему расчёту — рассылок без спроса не будет.",
    })


# ------------------------------------------------------- письма по заказу

async def order_recipient(o) -> str | None:
    """Почта получателя: email аккаунта или похожий на почту контакт гостя."""
    if o["user_id"]:
        u = await db.get_user(o["user_id"])
        email = u["email"] if u else None
        return email if looks_email(email) else None
    contact = o["guest_contact"]
    return contact.strip() if looks_email(contact) else None


def _cabinet_link(o) -> str:
    if not o["user_id"] and o["access_token"]:
        return f"{config.SITE_URL}/dashboard.html#claim={o['access_token']}"
    return f"{config.SITE_URL}/dashboard.html"


def _guest_aside(o) -> str | None:
    if not o["user_id"] and _field(o, "access_token"):
        return ("Кнопка в письме ведёт по секретной ссылке доступа к делу — оно "
                "откроется на любом устройстве, без пароля. Не пересылайте это "
                "письмо посторонним.")
    return None


def _order_letter(o, kind: str, **kw) -> dict | None:
    """Формуляр письма о событии заказа; None — про это не пишем.

    kind: created | priced | status | payment | final_ready | part_ready |
          pay_reminder | message
    """
    oid = o["id"]
    no = f"№{oid}"
    work = o["work_label"] or "работа"
    order_fact = (f"Заказ {no}", work)
    button = ("Открыть дело заказа", _cabinet_link(o))
    L: dict | None = None

    if kind == "created":
        facts = [(f"Заявка {no}", work)]
        if _field(o, "topic"):
            facts.append(("Тема", o["topic"]))
        deadline = _field(o, "deadline_text") or _field(o, "deadline_date")
        if deadline:
            facts.append(("Срок", deadline))
        L = {"subject": f"Заявка {no} принята — Академический Салон",
             "title": "Заявка принята",
             "paras": ["Спасибо! Заявка уже у мастера: он изучит детали и назовёт "
                       "точную цену — обычно за 15–30 минут в рабочее время. О цене "
                       "сообщим отдельным письмом."],
             "facts": facts,
             "paras2": ["Статус, переписка с мастером и файлы — в деле заказа."],
             "button": button}

    elif kind == "priced":
        facts = [order_fact, ("Цена", _rub(o["price"]))]
        sub_d = _field(o, "sub_discount") or 0
        promo_d = _field(o, "promo_discount") or 0
        spent = _field(o, "bonus_spent") or 0
        if sub_d:
            facts.append(("Скидка «Салон+»", "−" + _rub(sub_d)))
        if promo_d:
            code = (_field(o, "promo_code") or "").strip()
            facts.append((("Промокод " + code).strip(), "−" + _rub(promo_d)))
        if spent:
            facts.append(("Бонусы", "−" + _rub(spent)))
        if sub_d or promo_d or spent:
            facts.append(("К оплате деньгами",
                          _rub(max((o["price"] or 0) - sub_d - promo_d - spent, 0))))
        paras2 = []
        if o["prepay"]:
            facts.append(("Предоплата", _rub(o["prepay"])))
            paras2 = ["Начать можно с предоплаты — остальное после того, как вы "
                      "проверите согласованный результат."]
        L = {"subject": f"Заказ {no}: мастер назвал цену — {_rub(o['price'])}",
             "title": "Мастер назвал цену",
             "paras": ["Мастер изучил вашу заявку и готов взяться за работу. Решение "
                       "за вами: принять цену или обсудить детали можно в деле заказа."],
             "facts": facts, "paras2": paras2, "button": button}

    elif kind == "status":
        st = o["status"]
        if st == "priced":
            return _order_letter(o, "priced")
        if st == "work":
            L = {"subject": f"Заказ {no} в работе",
                 "title": "Работа взята в производство",
                 "paras": ["Оплата получена, мастер приступил. Мы держим в курсе на "
                           "каждом шаге: о готовности сообщим письмом, а вопросы всегда "
                           "можно задать в переписке дела."],
                 "facts": [order_fact], "button": button}
        elif st == "check":
            L = {"subject": f"Заказ {no} готов — посмотрите работу",
                 "title": "Работа готова — посмотрите",
                 "paras": ["Мастер закончил: файлы уже в деле заказа. Посмотрите работу "
                           "и решите — принять её или запросить правки. До приёмки "
                           "правки бесплатны в рамках исходного задания."],
                 "facts": [order_fact],
                 "button": ("Посмотреть работу", _cabinet_link(o))}
        elif st == "fix":
            L = {"subject": f"Заказ {no}: замечания приняты",
                 "title": "Приняли в правки",
                 "paras": ["Ваши замечания у мастера — вносим правки и вернёмся с "
                           "обновлённой версией. О готовности сообщим письмом."],
                 "facts": [order_fact], "button": button}
        elif st == "done":
            L = {"subject": f"Заказ {no} завершён — спасибо!",
                 "title": "Заказ завершён",
                 "paras": ["Работа принята, заказ закрыт — спасибо, что доверили её нам. "
                           "Мы на связи до вашей защиты: если появятся вопросы или "
                           "замечания вуза, напишите в переписку дела — поможем."],
                 "facts": [order_fact], "button": button}
        elif st == "cancel":
            L = {"subject": f"Заявка {no} закрыта",
                 "title": "Заявка закрыта",
                 "paras": ["Заявка закрыта, ничего оплачивать не нужно. Передумаете — "
                           "возобновите её в кабинете в один клик, всё сохранится."],
                 "button": button}

    elif kind == "payment":
        amount = kw.get("amount")
        pk = kw.get("pay_kind")
        # «финальная» — только когда закрыт действительно последний этап:
        # оплата части 2 из 3 (stage2) приходила письмом «все файлы открыты»
        if pk == "prepay":
            L = {"subject": f"Оплата по заказу {no} получена",
                 "title": "Оплата получена",
                 "paras": ["Спасибо, платёж получен — работа взята в производство. "
                           "Дальше всё важное будет приходить письмами и появляться "
                           "в деле заказа."],
                 "facts": [order_fact, ("Платёж", _rub(amount))], "button": button}
        elif pk == "rest":
            L = {"subject": f"Финальная оплата по заказу {no} получена",
                 "title": "Финальная оплата получена",
                 "paras": ["Спасибо, финальный платёж получен! Все файлы работы открыты "
                           "в деле заказа. Мы на связи до вашей защиты."],
                 "facts": [order_fact, ("Платёж", _rub(amount))], "button": button}
        else:
            L = {"subject": f"Оплата этапа по заказу {no} получена",
                 "title": "Оплата этапа получена",
                 "paras": ["Спасибо, платёж по этапу получен — продолжаем работу. "
                           "Следующая часть придёт в дело заказа, как будет готова."],
                 "facts": [order_fact, ("Платёж", _rub(amount))], "button": button}

    elif kind == "final_ready":
        amount = kw.get("amount")
        L = {"subject": f"Заказ {no}: работа готова — остался платёж {_rub(amount)}",
             "title": "Работа готова — финальный платёж",
             "paras": ["Мастер завершил финальную часть работы. По правилу «сначала "
                       "оплата — потом файл» она передаётся после закрытия остатка."],
             "facts": [order_fact, ("К оплате", _rub(amount))],
             "paras2": ["Реквизиты и кнопка оплаты — в деле заказа; после подтверждения "
                        "файлы придут сразу."],
             "button": ("Перейти к оплате", _cabinet_link(o))}

    elif kind == "part_ready":
        amount, part = kw.get("amount"), kw.get("part")
        L = {"subject": f"Заказ {no}: часть {part} готова — оплата этапа {_rub(amount)}",
             "title": f"Часть {part} готова",
             "paras": ["Мастер закончил очередную часть работы. По правилу «сначала "
                       "оплата этапа — потом файл» она передаётся после оплаты."],
             "facts": [order_fact, ("Этап", f"часть {part}"), ("К оплате", _rub(amount))],
             "paras2": ["После подтверждения оплаты файл придёт сразу, работа "
                        "продолжится без пауз."],
             "button": ("Перейти к оплате", _cabinet_link(o))}

    elif kind == "pay_reminder":
        amount = kw.get("amount")
        label = (kw.get("label") or "оплата этапа").lower()
        L = {"subject": f"Заказ {no}: напоминание об оплате — {_rub(amount)}",
             "title": "Напоминание об оплате",
             "paras": [f"По заказу ждёт оплата: {label}."],
             "facts": [order_fact, ("К оплате", _rub(amount))],
             "paras2": ["Если оплата уже отправлена, отметьте её в деле кнопкой "
                        "«Я оплатил(а)» — мастер сверит поступление и продолжит "
                        "без задержек."],
             "button": ("Перейти к оплате", _cabinet_link(o))}

    elif kind == "message":
        L = {"subject": f"Новое сообщение мастера по заказу {no}",
             "title": "Вам написал мастер",
             "paras": [f"В деле заказа {no} новое сообщение от мастера. Откройте "
                       "переписку, чтобы прочитать и ответить."],
             "button": ("Открыть переписку", _cabinet_link(o))}

    if L is not None:
        aside = _guest_aside(o)
        if aside:
            L["aside"] = aside
    return L


async def order_event(o, kind: str, **kw) -> bool:
    """Письмо о событии заказа. kind: created | priced | status | payment |
    final_ready | part_ready | pay_reminder | message.

    Никогда не бросает исключений — безопасно звать из любого потока логики.
    """
    try:
        if not config.mail_on() or not o:
            return False
        to = await order_recipient(o)
        if not to:
            return False
        if kind == "message":
            now = time.monotonic()
            last = _last_msg_mail.get(o["id"])  # None ≠ 0: monotonic может начинаться с нуля
            if last is not None and now - last < _MSG_MAIL_COOLDOWN_S:
                return False
            _last_msg_mail[o["id"]] = now
        L = _order_letter(o, kind, **kw)
        if not L:
            return False
        return await _send_letter(to, L)
    except Exception as e:  # noqa: BLE001
        log.warning("order mail %s/%s failed: %s", o["id"] if o else "?", kind, e)
        return False


async def master_message(order_id: int) -> None:
    """Хук после db.msg_add(order_id, 'master', …) — письмо с троттлингом."""
    o = await db.get_order(order_id)
    if o:
        await order_event(o, "message")


# ------------------------------------------------- подарочные сертификаты

def _gift_url(g) -> str:
    return f"{config.SITE_URL}/gift.html?code={g['code']}"


def _gift_letter(g, kind: str, **kw) -> tuple[str | None, dict | None]:
    """(кому, формуляр) письма о сертификате; (None, None) — не пишем.

    kind: created | paid_buyer | recipient | expiring | canceled | unclaimed
    """
    amount = f"{config.fmt_money(g['amount'])} ₽"
    to_buyer = (g["buyer_contact"] or "").strip()
    to_recip = (g["recip_contact"] or "").strip()
    expires = f"{str(g['expires_at'] or '')[8:10]}.{str(g['expires_at'] or '')[5:7]}." \
              f"{str(g['expires_at'] or '')[:4]}" if g["expires_at"] else None

    if kind == "created":
        if not to_buyer:
            return None, None
        return to_buyer, {
            "subject": f"Подарочный сертификат на {amount} — остался один шаг",
            "preheader": "После оплаты пришлём код и красивый сертификат для вручения.",
            "title": "Сертификат почти готов",
            "paras": ["Вы оформили подарочный сертификат Академического Салона. "
                      "Остался один шаг — оплата: после подтверждения мы пришлём "
                      "код, страницу сертификата и PDF для печати."],
            "facts": [("Номинал", amount)] +
                     ([("Кому", g["recip_name"])] if g["recip_name"] else []),
            "paras2": ["Оплатить картой или по реквизитам можно на странице "
                       "оформления — кнопка ниже. После перевода отметьте оплату, "
                       "и мастер выпустит сертификат."],
            "button": ("Открыть оформление",
                       f"{config.SITE_URL}/gift.html?buy={g['id']}&t={g['buy_token']}"),
            "aside": "Если передумали — там же можно отменить оформление: ничего "
                     "не списано и не должно.",
        }

    if kind == "paid_buyer":
        if not to_buyer:
            return None, None
        facts = [("Номинал", amount), ("Код сертификата", g["code"])]
        if g["recip_name"]:
            facts.append(("Кому", g["recip_name"]))
        if expires:
            facts.append(("Действует до", expires))
        paras2 = ["Код — это и есть подарок: получатель вводит его при заказе "
                  "на сайте, сумма зачитывается автоматически. Остаток не "
                  "сгорает при первом заказе — он хранится на коде."]
        if to_recip and g["deliver_at"] and not g["delivered_at"]:
            d = str(g["deliver_at"])
            paras2.append(f"Письмо получателю мы отправим {d[8:10]}.{d[5:7]}.{d[:4]} "
                          "в первой половине дня — как вы и просили.")
        elif to_recip:
            paras2.append("Письмо получателю уже отправлено — с вашим поздравлением.")
        return to_buyer, {
            "subject": f"Ваш подарочный сертификат на {amount} готов 🎁",
            "preheader": "Код внутри. Страница сертификата и PDF — по кнопке.",
            "title": "Сертификат выпущен",
            "paras": ["Оплата получена — сертификат выпущен и готов к вручению. "
                      "По кнопке ниже — именная страница сертификата: её можно "
                      "показать с телефона, переслать или скачать в PDF и красиво "
                      "распечатать."],
            "code": g["code"],
            "facts": facts,
            "paras2": paras2,
            "button": ("Открыть сертификат", _gift_url(g)),
            "aside": "Берегите код как наличные: погасить его может любой, "
                     "кто его знает. Если код скомпрометирован — напишите нам, "
                     "заблокируем и перевыпустим.",
        }

    if kind == "recipient":
        if not to_recip:
            return None, None
        who = (g["buyer_name"] or "").strip()
        first = (f"{who} дарит вам сертификат Академического Салона"
                 if who else "Вам подарили сертификат Академического Салона")
        paras = [first + " — мастерской учебных и научных работ. Это оплаченный "
                         "аванс: его можно потратить на любую работу или услугу — "
                         "от курсовой до диплома, от разбора плана до подготовки "
                         "к защите."]
        if (g["congrats"] or "").strip():
            paras.append("«" + g["congrats"].strip() + "»")
        facts = [("Номинал", amount), ("Код сертификата", g["code"])]
        if expires:
            facts.append(("Действует до", expires))
        return to_recip, {
            "subject": f"Вам подарили сертификат на {amount} 🎁"
                       + (f" — от {who}" if who else ""),
            "preheader": "Код внутри. Как воспользоваться — в письме.",
            "title": "Вам сделали подарок",
            "paras": paras,
            "code": g["code"],
            "facts": facts,
            "paras2": ["Как воспользоваться: откройте сайт, соберите заказ в "
                       "конфигураторе и введите код в поле «У меня есть сертификат» — "
                       "сумма зачтётся автоматически. Если работа стоит меньше "
                       "номинала, остаток сохранится на коде."],
            "button": ("Открыть сертификат", _gift_url(g)),
            "aside": "Вопрос без заказа тоже можно: просто ответьте на это "
                     "письмо — отвечает мастер, а не робот.",
        }

    if kind == "expiring":
        bal = config.fmt_money(kw.get("balance") or 0)
        tos = to_recip or to_buyer
        if not tos:
            return None, None
        return tos, {
            "subject": f"Сертификат: остаток {bal} ₽ сгорит {expires}",
            "title": "Остаток сертификата ждёт вас",
            "paras": [f"Напоминаем: на подарочном сертификате {g['code']} осталось "
                      f"{bal} ₽, срок действия — до {expires}. Успейте применить "
                      "остаток к заказу: это живые деньги на любую нашу услугу."],
            "facts": [("Код", g["code"]), ("Остаток", f"{bal} ₽"),
                      ("Действует до", expires or "—")],
            "paras2": ["Если сроки поджимают, а работа большая — напишите нам, "
                       "продлим сертификат по-человечески."],
            "button": ("Применить к заказу",
                       f"{config.SITE_URL}/configurator.html?gift={g['code']}"),
        }

    if kind == "canceled":
        if not to_buyer:
            return None, None
        return to_buyer, {
            "subject": "Оформление сертификата закрыто",
            "title": "Оформление закрыто",
            "paras": ["Оформление подарочного сертификата закрыто — ничего не "
                      "списано и не должно. Если вы всё-таки переводили деньги, "
                      "просто ответьте на это письмо, разберёмся."],
            "button": ("Оформить заново", f"{config.SITE_URL}/gift.html"),
        }

    if kind == "unclaimed":
        if not to_buyer:
            return None, None
        return to_buyer, {
            "subject": "Не видим перевод за сертификат — проверьте, пожалуйста",
            "title": "Перевод пока не найден",
            "paras": [f"Вы отметили оплату сертификата на {amount}, но перевод "
                      "пока не виден. Проверьте, ушёл ли платёж, и отметьте оплату "
                      "ещё раз на странице оформления. Если переводили — ответьте "
                      "на это письмо, разберёмся вместе."],
            "button": ("Открыть оформление",
                       f"{config.SITE_URL}/gift.html?buy={g['id']}&t={g['buy_token']}"),
        }

    return None, None


async def gift_event(g, kind: str, **kw) -> bool:
    """Письмо о событии сертификата. Никогда не бросает исключений."""
    try:
        if not config.mail_on() or not g:
            return False
        to, L = _gift_letter(g, kind, **kw)
        if not to or not L:
            return False
        return await _send_letter(to, L)
    except Exception as e:  # noqa: BLE001
        log.warning("gift mail %s/%s failed: %s", g["id"] if g else "?", kind, e)
        return False


# ---------------------------------------------- «Открытая приёмная»

async def qa_answered(q) -> bool:
    """Ответ мастера автору вопроса приёмной. Почта нигде не публикуется."""
    try:
        if not config.mail_on() or not q or not looks_email(q["email"]):
            return False
        published = q["status"] == "published"
        L = {
            "subject": "Мастер ответил на ваш вопрос — Академический Салон",
            "preheader": ("Пара опубликована анонимно в приёмной."
                          if published else "Ответ — только в этом письме."),
            "title": f"Ответ мастера · вопрос № {q['id']:03d}",
            "paras": ["Вы задали вопрос в «Открытую приёмную» мастерской. "
                      "Мастер ответил:"],
            "facts": [("Ваш вопрос", q["question"]),
                      ("Ответ", q["answer"])],
        }
        if published:
            L["paras2"] = ["Пара опубликована в приёмной анонимно — почта и "
                           "любые данные, по которым вас можно узнать, не раскрываются."]
            L["button"] = ("Открыть приёмную",
                           f"{config.SITE_URL}/priyomnaya.html#q{q['id']}")
        else:
            L["paras2"] = ["По вашей просьбе вопрос не публиковался: "
                           "ответ существует только в этом письме."]
        L["aside"] = ("Почта нужна была только для этого ответа — "
                      "рассылок без спроса не будет.")
        return await _send_letter(q["email"], L)
    except Exception as e:  # noqa: BLE001
        log.warning("qa letter failed: %s", e)
        return False
