"""Конфигурация бота и API «Академического Салона».

Цены загружаются из versioned-каталога ``backend/catalog/pricing.v1.json``.
Фронтенд обязан реализовывать тот же контракт; parity-тест не даёт выпустить
сайт и API с разными суммами.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from zoneinfo import ZoneInfo

MSK = ZoneInfo("Europe/Moscow")

BOT_TOKEN = os.environ.get("BOT_TOKEN", "").strip()
ADMIN_IDS = [
    int(x) for x in os.environ.get("ADMIN_IDS", "").replace(" ", "").split(",") if x
]
DB_PATH = os.environ.get("DB_PATH", "salon.db")
API_HOST = os.environ.get("API_HOST", "127.0.0.1")
API_PORT = int(os.environ.get("API_PORT", "8090"))
SITE_URL = os.environ.get("SITE_URL", "https://akademsalon.ru")
SUPPORT_USERNAME = os.environ.get("SUPPORT_USERNAME", "academicsaloon")
BOT_USERNAME = os.environ.get("BOT_USERNAME", "academic_saloon_bot")
SESSION_IDLE_TTL_SECONDS = int(os.environ.get("SESSION_IDLE_TTL_SECONDS", "604800"))
SESSION_ABSOLUTE_TTL_SECONDS = int(os.environ.get("SESSION_ABSOLUTE_TTL_SECONDS", "2592000"))
IMPERSONATION_IDLE_TTL_SECONDS = int(os.environ.get("IMPERSONATION_IDLE_TTL_SECONDS", "900"))
IMPERSONATION_ABSOLUTE_TTL_SECONDS = int(
    os.environ.get("IMPERSONATION_ABSOLUTE_TTL_SECONDS", "3600")
)
PUBLICATION_CONSENT_DOC = "consent-publication 1.0 · akademsalon.ru"
ANALYTICS_RETENTION_DAYS = 365

# Техработы сайта: пока файл-флаг существует, nginx отдаёт 503 (maintenance.html).
# Пишем в оба веб-корня — сайт раздаётся из двух каталогов.
MAINT_FLAGS = [
    "/var/www/academic_saloon/dist/.maintenance",
    "/var/www/akademsalon-platform/.maintenance",
]
# Клиентские JS-ошибки (маячок kind=mark, step='js: …') дублируются в файл —
# его читает «Салон-дозор» и будит владельца в Telegram.
JSERR_LOG = os.environ.get("JSERR_LOG", "/root/salon_bot/jserr.log")

# рабочая группа заказов (форум-топики). Актуальный chat_id живёт в settings
# (group_chat_id) — при преобразовании в супергруппу Telegram меняет id,
# бот подхватывает миграцию сам. Здесь — стартовое значение.
GROUP_CHAT_ID = int(os.environ.get("GROUP_CHAT_ID", "0") or "0")

# «Полка Салона» — закрытый канал с материалами для подписчиков «Салон+».
# Бот — админ канала: выдаёт личные одноразовые инвайты и снимает доступ
# по истечении подписки. 0 — полка выключена.
SHELF_CHAT_ID = int(os.environ.get("SHELF_CHAT_ID", "0") or "0")
# запасной общий инвайт — если персональный создать не вышло (нет прав)
SHELF_INVITE_FALLBACK = os.environ.get("SHELF_INVITE", "").strip()

# ЮKassa (онлайн-оплата). Пока ключи не заданы — работает ручное
# подтверждение оплат (реквизиты + «Я оплатил» + кнопка у мастера).
YOOKASSA_SHOP_ID = os.environ.get("YOOKASSA_SHOP_ID", "").strip()
YOOKASSA_SECRET = os.environ.get("YOOKASSA_SECRET", "").strip()

def yookassa_on() -> bool:
    return bool(YOOKASSA_SHOP_ID and YOOKASSA_SECRET)

# Robokassa — основной кандидат: работает с самозанятыми, «Робочеки СМЗ»
# сами шлют чек НПД в налоговую. Тестовый режим: ROBOKASSA_TEST=1 и
# ТЕСТОВЫЕ пароли в ROBOKASSA_PASS1/2 (у боевых и тестовых пароли разные).
ROBOKASSA_LOGIN = os.environ.get("ROBOKASSA_LOGIN", "").strip()
ROBOKASSA_PASS1 = os.environ.get("ROBOKASSA_PASS1", "").strip()
ROBOKASSA_PASS2 = os.environ.get("ROBOKASSA_PASS2", "").strip()
# Тестовые пароли живут ОТДЕЛЬНО от боевых: у Robokassa они разные, и раньше
# включение ROBOKASSA_TEST=1 оставляло подпись на боевых паролях — тестовый
# магазин её не принимал, то есть оплата ломалась у всех, включая живых
# клиентов. Теперь режим переключает и пароли тоже.
ROBOKASSA_TEST_PASS1 = os.environ.get("ROBOKASSA_TEST_PASS1", "").strip()
ROBOKASSA_TEST_PASS2 = os.environ.get("ROBOKASSA_TEST_PASS2", "").strip()
ROBOKASSA_TEST = os.environ.get("ROBOKASSA_TEST", "").strip() == "1"

def robo_pass1() -> str:
    """Пароль №1 (подпись ссылки) — тестовый в тестовом режиме, иначе боевой."""
    return ROBOKASSA_TEST_PASS1 if ROBOKASSA_TEST else ROBOKASSA_PASS1


def robo_pass2() -> str:
    """Пароль №2 (проверка ResultURL) — той же пары, что и Пароль №1."""
    return ROBOKASSA_TEST_PASS2 if ROBOKASSA_TEST else ROBOKASSA_PASS2


def robokassa_on() -> bool:
    """Готова ли Robokassa к работе В ТЕКУЩЕМ режиме.

    Если попросили тестовый режим, а тестовых паролей нет — отвечаем «нет».
    Молча откатываться на боевые пароли НЕЛЬЗЯ: оператор думал бы, что платит
    понарошку, а деньги списывались бы по-настоящему. Ссылка не создастся,
    оплата уйдёт в ручную ветку — это заметно сразу и не стоит никому денег.
    """
    if not ROBOKASSA_LOGIN:
        return False
    return bool(robo_pass1() and robo_pass2())

def pay_provider() -> str | None:
    """Активный провайдер онлайн-оплаты; Robokassa в приоритете
    (подключена после отказа ЮKassa по категории бизнеса)."""
    if robokassa_on():
        return "robokassa"
    # В тестовом режиме ЮKassa НЕ подхватывает выпавшую Robokassa: у неё
    # тестового контура здесь нет, и откат означал бы списание настоящих
    # денег в тот момент, когда оператор уверен, что платит понарошку.
    if ROBOKASSA_TEST:
        return None
    if yookassa_on():
        return "yookassa"
    return None

# Почта (вход по коду + уведомления о заказе). Пока SMTP не задан —
# вход по почте выключен, письма молча не отправляются, всё остальное
# работает как раньше. Рекомендуемо: smtp.mail.ru:465 (пароль приложения)
# или почта Timeweb для ящика на своём домене.
SMTP_HOST = os.environ.get("SMTP_HOST", "").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465") or "465")
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_PASS = os.environ.get("SMTP_PASS", "").strip()
SMTP_FROM = os.environ.get("SMTP_FROM", "").strip() or SMTP_USER
SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", "Академический Салон").strip()
SMTP_TLS = os.environ.get("SMTP_TLS", "").strip()  # ssl|starttls|plain; пусто = по порту

def mail_on() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASS)

# ------------------------------------------------------------- лояльность
# Параметры зашиты в «Правила программы лояльности» на сайте (loyalty.html,
# ред. 1.x). Менять ТОЛЬКО синхронно с юрдоками!
BONUS_WELCOME = 300          # приветственный, 1 раз на tg-аккаунт
BONUS_WELCOME_TTL = 30       # дней
BONUS_CASHBACK_PCT = 5       # % от фактически оплаченного
BONUS_CASHBACK_TTL = 90      # дней
BONUS_REF_PCT = 5            # % пригласившему с каждого оплаченного заказа
BONUS_REF_GIFT = 200         # приглашённому после 1-й оплаты, однократно
BONUS_REF_TTL = 90           # дней
BONUS_SPEND_CAP_PCT = 20     # списание ≤20% стоимости заказа
BONUS_MIN_ORDER = 1000       # списание только по заказам от 1000 ₽
BONUS_EXPIRE_WARN_DAYS = 3   # предупреждаем о сгорании за N дней

# ----------------------------------------------------------- подписка «Салон+»
# Экономика продумана «в пользу мастерской»: продаёт заголовок «−10%»,
# маржу держат ПОТОЛКИ скидки в рублях (cap), семестровые предоплаты и
# фичи с нулевой себестоимостью (приоритет, куратор, замок цен, полка).
# Параметры зашиты в «Правила лояльности» ред. 1.2 — менять синхронно!

SUB_PERIODS = {  # id: (дней, подпись, множитель цены конструктора)
    "month": (30, "30 дней", 1.0),
    "sem": (150, "семестр · 150 дней", 2.2),
}

# фичи-кирпичики (и для фиксов, и для конструктора):
# id, подпись, цена в конструкторе ₽/мес, короткое пояснение
SUB_FEATURES: list[tuple[str, str, int, str]] = [
    ("disc3", "Скидка 3% на заказы (до 600 ₽ с заказа)", 200, "скидка на каждый заказ периода"),
    ("disc5", "Скидка 5% на заказы (до 1 000 ₽ с заказа)", 330, "скидка на каждый заказ периода"),
    ("disc7", "Скидка 7% на заказы (до 2 000 ₽ с заказа)", 560, "скидка на каждый заказ периода"),
    ("disc10", "Скидка 10% на заказы (до 3 000 ₽ с заказа)", 940, "скидка на каждый заказ периода"),
    ("prio", "Приоритетная очередь", 140, "заявки и правки берутся в работу первыми"),
    ("cb2", "Кэшбэк ×2 (10% бонусами)", 390, "после полной оплаты заказа"),
    ("curator", "Куратор сессии", 90, "график сдач с напоминаниями и подстраховкой"),
    ("shelf", "Полка Салона", 90, "закрытые чек-листы и шаблоны к защите"),
    ("trainer", "Тренажёр защиты", 290, "10 вероятных вопросов комиссии с тезисами — по вашей работе"),
    ("express", "Экспресс-разбор 15 минут / месяц", 490, "голосом или в чате, по вашей работе"),
    ("lock", "Замок цен", 190, "тарифы для вас заморожены на весь период"),
    ("slot", "Бронь сессии", 690, "гарантированное место в пиковый сезон"),
    ("sos", "SOS в день сдачи", 290, "срочный вопрос — ответ мастера в течение часа"),
    ("refboost", "Реф-буст: 7% с оплат друзей", 90, "вместо обычных 5%"),
]
SUB_FEATURE_BY_ID = {f[0]: f for f in SUB_FEATURES}
SUB_BASE_PRICE = 199          # базовое членство конструктора, ₽/мес
SUB_DISCOUNTS = {             # фича → (процент, потолок ₽ на заказ)
    "disc3": (3, 600), "disc5": (5, 1000), "disc7": (7, 2000), "disc10": (10, 3000),
}


@dataclass(frozen=True)
class SubPlan:
    id: str
    label: str
    tagline: str
    month_price: int          # ₽ за 30 дней
    sem_price: int | None     # ₽ за семестр (None — план только разовый)
    features: tuple[str, ...]
    period_days: int = 30     # для планов с фиксированным сроком (Сессия)
    once: bool = False        # разовый план без месяц/семестр выбора


SUB_PLANS: list[SubPlan] = [
    SubPlan("plus", "Салон+", "для тех, кто сдаёт в этом семестре",
            449, 999, ("disc5", "prio", "curator", "shelf")),
    SubPlan("pro", "Салон+ Про", "максимум выгоды и подготовка к защите",
            1_190, 2_690, ("disc10", "prio", "curator", "shelf",
                           "trainer", "express", "cb2")),
    SubPlan("session", "Куратор сессии", "60 дней спокойствия в самый жаркий сезон",
            2_990, None, ("disc7", "prio", "curator", "shelf",
                          "trainer", "lock", "slot", "sos"),
            period_days=60, once=True),
]
SUB_PLAN_BY_ID = {p.id: p for p in SUB_PLANS}


def sub_custom_price(features: list[str], period: str = "month") -> int:
    """Цена конструктора: база + фичи, × множитель периода, окр. до 10 ₽."""
    days, _, k = SUB_PERIODS.get(period, SUB_PERIODS["month"])
    total = SUB_BASE_PRICE + sum(SUB_FEATURE_BY_ID[f][2]
                                 for f in features if f in SUB_FEATURE_BY_ID)
    return int(round(total * k / 10) * 10)


def sub_discount_for(features: list[str]) -> tuple[int, int]:
    """(процент, потолок ₽) по набору фич — берётся самая жирная скидка."""
    best = (0, 0)
    for f in features:
        d = SUB_DISCOUNTS.get(f)
        if d and d[0] > best[0]:
            best = d
    return best


# ревизия профиля бота (описание/команды): бампнуть, чтобы переприменить на старте
PROFILE_REV = "6"

# админы, временно переключившиеся в «режим клиента» (/client — /admin)
CLIENT_MODE_ADMINS: set[int] = set()

# ---------------------------------------------------------------- калькулятор

@dataclass(frozen=True)
class WorkType:
    id: str
    code: str          # короткий код в deep-link с сайта
    label: str
    prices: dict[str, int]
    emoji: str = "📄"

    @property
    def base(self) -> int:
        """Legacy-поле: полная production-цена сопровождения.

        Новый калькулятор должен вызывать :meth:`price_for`, потому что
        «Диагностика», «Редактура» и «Сопровождение» — разные результаты,
        а не коэффициенты одной неясной услуги.
        """
        return self.prices["support"]

PRICING_CATALOG_PATH = Path(os.environ.get(
    "PRICING_CATALOG_PATH",
    Path(__file__).resolve().parents[1] / "catalog" / "pricing.v1.json",
))


def _load_pricing_catalog() -> dict:
    with PRICING_CATALOG_PATH.open(encoding="utf-8") as fh:
        catalog = json.load(fh)
    if catalog.get("schema_version") != "pricing.v1":
        raise RuntimeError("unsupported pricing catalog")
    required_results = {"diagnostic", "editing", "support"}
    for item in catalog.get("types", []):
        prices = item.get("prices") or {}
        if set(prices) != required_results or any(
            not isinstance(value, int) or value <= 0 for value in prices.values()
        ):
            raise RuntimeError(f"invalid pricing for {item.get('id', '<unknown>')}")
    return catalog


PRICING_CATALOG = _load_pricing_catalog()
PRICING_SCHEMA_VERSION = PRICING_CATALOG["schema_version"]
PRICING_RANGE_MULTIPLIER = float(PRICING_CATALOG["range_multiplier"])
PRICING_ROUNDING = int(PRICING_CATALOG["rounding"])

WORK_TYPES: list[WorkType] = [
    WorkType(
        item["id"],
        item["code"],
        item["label"],
        dict(item["prices"]),
        item.get("emoji", "📄"),
    )
    for item in PRICING_CATALOG["types"]
]

@dataclass(frozen=True)
class Service:
    id: str
    code: str
    label: str
    from_price: int
    unit: str = ""
    desc: str = ""


SERVICES: list[Service] = [
    Service("svc_plan", "pl", "Разбор плана", 3_000, "",
            "Структура глав, реалистичный срок и фиксированная смета за 1–2 дня. "
            "При продолжении работы зачитывается полностью (магистерская/кандидатская — 5 000 ₽)."),
    Service("svc_ai", "ai", "Редактура машинного черновика", 2_500, "",
            "Исправим канцелярит, повторы и неясные фразы; без обещаний обмануть ИИ-детекторы."),
    Service("svc_review", "rv", "Разбор вашего материала", 2_500, "",
            "Объясним структуру и логику вашего текста, подготовим к вопросам на защите."),
    Service("svc_tutor", "tu", "Репетиторство и консультации", 3_000, " / час",
            "Индивидуальные занятия: методология, оформление, подготовка к сдаче."),
    Service("svc_norm", "nm", "Нормоконтроль и оформление", 5_000, "",
            "Приведём работу в соответствие методичке и ГОСТу: поля, ссылки, список литературы."),
    Service("svc_defense", "df", "Презентация и речь к защите", 6_000, "",
            "Слайды по вашему материалу, текст доклада на 7 минут и вероятные вопросы комиссии."),
    Service("svc_defense_pack", "dp", "Пакет к выступлению: презентация + речь + нормоконтроль",
            9_500, "",
            "Пакет со скидкой: нормоконтроль по методичке + презентация и речь (по отдельности — 11 000 ₽)."),
    Service("svc_author_order", "au", "Авторский текст вне аттестации", 12_000, "",
            "Статья, аналитический отчёт, речь, сценарий или деловой материал "
            "по техническому заданию с отдельно согласованной целью, автором и режимом прав."),
]

DISCIPLINES = [  # (id, code, label, k)
    ("hum", "h", "Гуманитарные / экономика", 1.0),
    ("law", "l", "Юриспруденция / педагогика / психология", 1.15),
    ("tech", "t", "Технические / IT / программирование", 1.3),
    ("med", "m", "Медицина / финансы с расчётами", 1.4),
]

TERMS = [  # (id, code, label, k)
    ("free", "f", "Свободный срок (от 30 дней)", 1.0),
    ("mid", "m", "14–30 дней", 1.15),
    ("urgent", "u", "Срочно (до 14 дней)", 1.45),
]

_TIER_CODE = {"base": "b", "turn": "t", "vip": "v"}
TIERS = [  # (id, code, label, result, note)
    (
        tier_id,
        _TIER_CODE[tier_id],
        tier["label"],
        tier["result"],
        tier["note"],
    )
    for tier_id, tier in PRICING_CATALOG["tiers"].items()
]

# индексы для быстрого доступа
TYPE_BY_ID = {t.id: t for t in WORK_TYPES}
TYPE_BY_CODE = {t.code: t for t in WORK_TYPES}
SVC_BY_ID = {s.id: s for s in SERVICES}
SVC_BY_CODE = {s.code: s for s in SERVICES}
DISC_BY_ID = {d[0]: d for d in DISCIPLINES}
DISC_BY_CODE = {d[1]: d for d in DISCIPLINES}
TERM_BY_ID = {t[0]: t for t in TERMS}
TERM_BY_CODE = {t[1]: t for t in TERMS}
TIER_BY_ID = {t[0]: t for t in TIERS}
TIER_BY_CODE = {t[1]: t for t in TIERS}


def round500(n: float) -> int:
    return int(round(n / PRICING_ROUNDING) * PRICING_ROUNDING)


def fmt_money(n: int | None) -> str:
    return f"{n:,}".replace(",", " ") if n is not None else "—"


def quote(type_id: str, disc_id: str, term_id: str, tier_id: str) -> tuple[int, int] | None:
    """Вилка результата: явная цена результата × предмет × срок.

    Tier больше не является множителем: это предотвращает абсурдную цену
    полного сопровождения за одну диагностику при переименовании интерфейса.
    """
    t = TYPE_BY_ID.get(type_id)
    if not t:
        return None
    d = DISC_BY_ID.get(disc_id, DISCIPLINES[0])
    s = TERM_BY_ID.get(term_id, TERMS[0])
    v = TIER_BY_ID.get(tier_id, TIERS[0])
    low = round500(t.prices[v[3]] * d[3] * s[3])
    return low, round500(low * PRICING_RANGE_MULTIPLIER)

# ---------------------------------------------------------------- статусы

@dataclass(frozen=True)
class Status:
    id: str
    emoji: str
    label: str          # как видит админ
    client_label: str   # как видит клиент
    step: int           # позиция на клиентской ленте прогресса (-1 = вне ленты)


STATUSES: list[Status] = [
    Status("new", "🆕", "Новая заявка", "Заявка принята, оцениваем", 1),
    Status("priced", "💰", "Цена предложена", "Предложение готово — ждём вашего решения", 2),
    Status("prepay", "⏳", "Ожидает предоплату", "Ожидаем предоплату", 3),
    Status("work", "🔨", "В работе", "Работа идёт", 4),
    Status("check", "📤", "На проверке у клиента", "Результат передан — проверьте по спецификации", 5),
    Status("fix", "✏️", "Правки", "Вносим правки", 4),
    Status("done", "✅", "Завершён", "Завершено. Спасибо!", 6),
    Status("cancel", "🚫", "Отменён", "Заявка закрыта", -1),
]
ST = {s.id: s for s in STATUSES}
ACTIVE_STATUSES = ("new", "priced", "prepay", "work", "check", "fix")
PROGRESS_STEPS = ["Заявка", "Оценка", "Оплата", "Работа", "Проверка", "Готово"]


def order_no(order_id: int) -> str:
    return f"№{order_id}"


# Редакции юридических документов — ЕДИНСТВЕННЫЙ источник правды.
# Сюда же смотрит страница собранной заявки (номера уходят на фронт из API)
# и журнал акцептов (offers.accept_json). Правило: поменял документ —
# поднял номер ЗДЕСЬ, иначе в споре предъявим редакцию, которой не было.
DOC_EDITIONS = {
    "oferta": "3.0",
    "privacy": "3.0",
    "consent": "1.5",
    "consent_request": "1.0",
    "terms": "2.0",
    "loyalty": "1.7",
    "requisites": "2.0",
    "specification": "2.0",
    "academic_integrity": "2.0",
}
DOC_EDITIONS_STR = " · ".join(f"{k} {v}" for k, v in DOC_EDITIONS.items())
ORDER_CONSENT_DOC = (
    f"consent-request {DOC_EDITIONS['consent_request']} · "
    f"privacy {DOC_EDITIONS['privacy']} · "
    f"oferta {DOC_EDITIONS['oferta']}"
)
GIFT_CONSENT_DOC = (
    "consent-request 1.0 · privacy 3.0 · oferta 3.0 · gift form 2.0"
)

# каналы для клиента и для претензий (оферта р. 16, п. 10.4)
CONTACT_TG = "https://t.me/academicsaloon"
CONTACT_VK = "https://vk.com/academicsaloon"
CONTACT_EMAIL = "support@akademsalon.ru"
