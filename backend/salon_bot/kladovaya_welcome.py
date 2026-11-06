"""Подарок новичку Кладовой: личный код на первый заказ (kladovaya-welcome-2026-10).

Ставится как /root/salon_bot/app/services/kladovaya_welcome.py установщиком
install_kladovaya_welcome.py; проверку промокода (/api/promo/check и заявка)
он дополняет одной строкой: prepare() — до db.promo_get().

Код выдаёт бот Кладовой (@kladovoygipsrbot) подписчику канала по /start hello.
Заранее коды не хранятся: код — функция Telegram-ID и ключа, производного от
общего секрета кампаний Кладовой и Салона (zero_campaign_hmac — он уже есть у
обоих, переносить ничего не нужно). Поэтому:

- чужой код бесполезен: Салон пересчитывает код для аккаунта, который вошёл
  через Telegram, и сравнивает; без входа через Telegram код не принимается;
- только первый заказ (db.promo_customer_state: ни заказов, ни подписок,
  ни депозитов, ни подарков, ни истории по контактам) и один раз
  (uses_left=1 и семейство кода, как у прочих семейных промокодов);
- строка promos появляется, только когда код проверяет его владелец, —
  дальше заявка идёт обычным путём семейного промокода;
- админы видят «только просмотр», как у прошлых кампаний.

Условия — как у прошлого предложения на первый заказ (ПЕРВЫЙЛИСТ): 12 %,
не больше 5 000 ₽, заказ от 2 500 ₽; код действует до 31.12.2026 включительно.
Бот Кладовой считает код той же формулой (ops/telegram/kladovaya_bot.py,
welcome_code) — менять только вместе.
"""

from __future__ import annotations

import hashlib
import hmac
import re
from datetime import datetime, timedelta, timezone

from .. import config, db
from . import zero_campaign

FAMILY = "kladovaya-welcome-2026-10"
KEY_LABEL = b"kladovaya-welcome-2026-10"
PREFIX = "ЛИСТ-"
CODE_RE = re.compile(r"^ЛИСТ-\d{8}$")
ENDS = "2026-12-31"  # включительно, по Москве
PCT, CAP, MIN_PRICE = 12, 5000, 2500
NOTE = "Подарок новичку Кладовой (личный код, первый заказ)"
MSK = timezone(timedelta(hours=3))


def welcome_key(secret: bytes | None = None) -> bytes:
    """Ключ подарка — не сам общий секрет, а производный: у каждой кампании свой."""
    return hmac.new(secret or zero_campaign.credential_secret(), KEY_LABEL, hashlib.sha256).digest()


def code_for(telegram_id: int, key: bytes | None = None) -> str:
    digest = hmac.new(key or welcome_key(), str(int(telegram_id)).encode("ascii"), hashlib.sha256).digest()
    return f"{PREFIX}{int.from_bytes(digest[:8], 'big') % 100_000_000:08d}"


def is_welcome_code(raw: str) -> bool:
    return bool(raw) and bool(CODE_RE.fullmatch(raw))


async def prepare(raw: str, user, *, now: datetime | None = None, key: bytes | None = None) -> str | None:
    """None — не наш код или код в порядке (строка promos готова); иначе причина отказа."""
    if not is_welcome_code(raw):
        return None
    moment = now or datetime.now(timezone.utc)
    if moment.astimezone(MSK).strftime("%Y-%m-%d") > ENDS:
        return "off"
    if not user or int(user["id"]) <= 0:
        return "telegram_login"
    user_id = int(user["id"])
    if user_id in getattr(config, "ADMIN_IDS", []):
        return "preview_only"
    try:
        expected = code_for(user_id, key)
    except RuntimeError:
        return "off"  # общий секрет не настроен — кампания выключена, а не сломана
    # compare_digest не сравнивает строки с кириллицей («ЛИСТ-») — сравниваем байты
    if not hmac.compare_digest(raw.encode("utf-8"), expected.encode("utf-8")):
        return "not_yours"
    if await db.promo_customer_state(user_id, "2000-01-01T00:00:00") != "eligible":
        return "already_used"
    await db._exec(
        "INSERT OR IGNORE INTO promos(code, pct, amount, cap, min_price, uses_left, expires_at,"
        " active, note, created_at, family) VALUES(?,?,NULL,?,?,1,?,1,?,?,?)",
        (raw, PCT, CAP, MIN_PRICE, ENDS, NOTE, moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S"), FAMILY),
    )
    return None
