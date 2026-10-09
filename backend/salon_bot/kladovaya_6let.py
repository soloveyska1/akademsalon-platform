"""«Кладовой 6 лет» (9–16.10.2026): обмен с ботом Кладовой — оплаты для билетов и подарки.

Ставится как /root/salon_bot/app/services/kladovaya_6let.py установщиком
install_kladovaya_6let.py; маршрут регистрирует одна строка в webapp.py.

Бот Кладовой (@kladovoygipsrbot) раз в несколько минут шлёт
POST /api/campaigns/kladovaya-6let/sync, подписанный общим секретом кампаний
так же, как заявки «нулевых пар» (zero_campaign.verify_request: адрес сервера
Кладовой, метка времени, nonce, HMAC тела; nonce гасится в
zero_campaign_nonces). В запросе — подарки, которые бот решил выдать
участникам: Telegram-ID, причина, тариф, дни. В ответе:

- оплаты «именинных» заказов по Telegram-аккаунтам: заказ создан 9–15.10
  (МСК), оплачено до 16.10 15:00, отдельно — до 13.10 (ранняя птица) и 15.10
  (день рождения); отменённые, удалённые, служебные и заказы-подписки не
  считаются — билеты считает бот;
- состояние подарков.

Подарки записываются в kladovaya_6let_grants (один на человека и причину) и
включаются сторожем kladovaya_6let_watch.py (таймер раз в минуту), когда
человек есть в Салоне со входом через Telegram (users.id = Telegram-ID).
Призы розыгрыша 16.10 (prizes: tg, приз, ключ) — в kladovaya_6let_prizes:
коды −90 % (ВКР, курсовая) и −100 % (две самостоятельные) сразу строкой promos
и возвращаются боту, он шлёт их победителю; бонусы начисляет сторож.
Подписка конкурса (via='kladovaya-6let') не лишает кода новичка ЛИСТ-:
db.promo_customer_state её не считает (правка того же установщика).
Механика акции — docs/6let.md в репозитории Кладовой.
"""

from __future__ import annotations

import json
import re
import secrets
import time
from typing import Any, Callable

from aiohttp import web

from .. import db
from . import zero_campaign

CAMPAIGN = "kladovaya-6let-2026"
VIA = "kladovaya-6let"
# окна в UTC, как хранит Салон (МСК = UTC+3)
ORDERS_FROM = "2026-10-08T21:00:00"   # 09.10 00:00 МСК
ORDERS_TO = "2026-10-15T20:59:59"     # 15.10 23:59:59 МСК
PAID_TO = "2026-10-16T12:00:00"       # 16.10 15:00 МСК
EARLY_TO = "2026-10-13T20:59:59"      # 13.10 23:59:59 МСК — ранняя птица
BDAY_FROM = "2026-10-14T21:00:00"     # 15.10 00:00 МСК — день рождения
BDAY_TO = "2026-10-15T20:59:59"
GRANTS_UNTIL = "2026-10-31T20:59:59"  # новые подарки — до 31.10 включительно
PLANS = ("plus", "pro")
REASON_RE = re.compile(r"^[a-z][a-z0-9-]{1,31}$")
MAX_GRANTS = 500
BODY_LIMIT = 64 * 1024
PATH = "/api/campaigns/kladovaya-6let/sync"

SCHEMA = """
CREATE TABLE IF NOT EXISTS kladovaya_6let_grants(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg INTEGER NOT NULL CHECK(tg > 0),
  reason TEXT NOT NULL,
  plan TEXT NOT NULL CHECK(plan IN ('plus','pro')),
  days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 366),
  created_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','applied','revoked')),
  applied_at TEXT,
  subscription_id INTEGER,
  extended INTEGER NOT NULL DEFAULT 0,
  notified_at TEXT,
  UNIQUE(tg, reason)
);
"""

LEDGER_SQL = """
SELECT o.user_id AS tg,
       SUM(p.amount) AS paid,
       SUM(CASE WHEN p.paid_at <= ? THEN p.amount ELSE 0 END) AS early,
       SUM(CASE WHEN p.paid_at >= ? AND p.paid_at <= ? THEN p.amount ELSE 0 END) AS bday,
       COUNT(DISTINCT o.id) AS orders
  FROM payments p JOIN orders o ON o.id = p.order_id
 WHERE p.status = 'paid' AND p.paid_at IS NOT NULL AND p.paid_at <= ?
   AND o.user_id > 0
   AND COALESCE(o.deleted, 0) = 0
   AND COALESCE(o.synthetic, 0) = 0
   AND COALESCE(o.work_type, '') NOT LIKE 'sub_%'
   AND COALESCE(o.status, '') <> 'cancel'
   AND o.created_at >= ? AND o.created_at <= ?
 GROUP BY o.user_id
 ORDER BY o.user_id
"""
LEDGER_ARGS = (EARLY_TO, BDAY_FROM, BDAY_TO, PAID_TO, ORDERS_FROM, ORDERS_TO)


def parse_grants(raw: Any) -> list[tuple[int, str, str, int]]:
    """Подарки из запроса бота: (tg, причина, тариф, дни); кривое — CampaignError."""
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > MAX_GRANTS:
        raise zero_campaign.CampaignError("bad_payload", 400)
    out: list[tuple[int, str, str, int]] = []
    for item in raw:
        if not isinstance(item, dict) or set(item) != {"tg", "reason", "plan", "days"}:
            raise zero_campaign.CampaignError("bad_payload", 400)
        tg, reason, plan, days = item["tg"], item["reason"], item["plan"], item["days"]
        if (
            not isinstance(tg, int) or isinstance(tg, bool) or tg <= 0
            or not isinstance(reason, str) or not REASON_RE.fullmatch(reason)
            or plan not in PLANS
            or not isinstance(days, int) or isinstance(days, bool) or not 1 <= days <= 366
        ):
            raise zero_campaign.CampaignError("bad_payload", 400)
        out.append((tg, reason, plan, days))
    return out


# Призы розыгрыша 16.10: коды — сразу строкой promos (личный, одноразовый, до 30.06.2027),
# бонусы — сторож начисляет, когда победитель есть в Салоне (bonus_ledger, kind='admin').
PRIZES = {
    "vkr": {"pct": 90, "cap": 45000, "uses": 1, "note": "Кладовой 6 лет: ВКР за 10 %"},
    "course": {"pct": 90, "cap": 15000, "uses": 1, "note": "Кладовой 6 лет: курсовая за 10 %"},
    "self": {"pct": 100, "cap": 3000, "uses": 2, "note": "Кладовой 6 лет: две самостоятельные"},
    "bonus2000": {"bonus": 2000},
    "bonus1000": {"bonus": 1000},
}
PRIZE_EXPIRES = "2027-06-30"
PRIZE_KEY_RE = re.compile(r"^[a-z0-9-]{4,40}$")
CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
PRIZES_SCHEMA = """
CREATE TABLE IF NOT EXISTS kladovaya_6let_prizes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tg INTEGER NOT NULL CHECK(tg > 0),
  prize TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  code TEXT,
  created_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','applied','revoked')),
  applied_at TEXT,
  notified_at TEXT
);
"""


def parse_prizes(raw: Any) -> list[tuple[int, str, str]]:
    """Призы из запроса бота: (tg, приз, ключ); кривое — CampaignError."""
    if raw is None:
        return []
    if not isinstance(raw, list) or len(raw) > 100:
        raise zero_campaign.CampaignError("bad_payload", 400)
    out: list[tuple[int, str, str]] = []
    for item in raw:
        if not isinstance(item, dict) or set(item) != {"tg", "prize", "key"}:
            raise zero_campaign.CampaignError("bad_payload", 400)
        tg, prize, key = item["tg"], item["prize"], item["key"]
        if (
            not isinstance(tg, int) or isinstance(tg, bool) or tg <= 0
            or prize not in PRIZES
            or not isinstance(key, str) or not PRIZE_KEY_RE.fullmatch(key)
        ):
            raise zero_campaign.CampaignError("bad_payload", 400)
        out.append((tg, prize, key))
    return out


def prize_code() -> str:
    return "6ЛЕТ-" + "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


async def _rows(connection, sql: str, args: tuple = ()) -> list:
    return list(await (await connection.execute(sql, args)).fetchall())


async def sync(payload: dict, *, now: str | None = None) -> dict:
    """Записать подарки и призы бота (повтор не задвоит) и отдать оплаты и их состояние."""
    if not isinstance(payload, dict) or not set(payload) <= {"grants", "prizes", "request_id"}:
        raise zero_campaign.CampaignError("bad_payload", 400)
    grants = parse_grants(payload.get("grants"))
    prizes = parse_prizes(payload.get("prizes"))
    moment = now or db.now_iso()
    accepted = moment <= GRANTS_UNTIL
    async with db.transaction() as connection:
        # по одной инструкции — execute (executescript закоммитил бы транзакцию посреди)
        await connection.execute(SCHEMA)
        await connection.execute(PRIZES_SCHEMA)
        if accepted:
            for tg, reason, plan, days in grants:
                await connection.execute(
                    "INSERT OR IGNORE INTO kladovaya_6let_grants(tg, reason, plan, days, created_at) VALUES(?,?,?,?,?)",
                    (tg, reason, plan, days, moment),
                )
            for tg, prize, key in prizes:
                if await _rows(connection, "SELECT 1 FROM kladovaya_6let_prizes WHERE key=?", (key,)):
                    continue
                spec = PRIZES[prize]
                code = None
                if "pct" in spec:
                    for _ in range(10):
                        candidate = prize_code()
                        if not await _rows(connection, "SELECT 1 FROM promos WHERE code=?", (candidate,)):
                            code = candidate
                            break
                    if code is None:
                        raise zero_campaign.CampaignError("code_collision", 500)
                    await connection.execute(
                        "INSERT INTO promos(code, pct, amount, cap, min_price, uses_left, expires_at, active, note, created_at, family)"
                        " VALUES(?,?,NULL,?,0,?,?,1,?,?,NULL)",
                        (code, spec["pct"], spec["cap"], spec["uses"], PRIZE_EXPIRES, spec["note"], moment),
                    )
                await connection.execute(
                    "INSERT INTO kladovaya_6let_prizes(tg, prize, key, code, created_at, state, applied_at) VALUES(?,?,?,?,?,?,?)",
                    (tg, prize, key, code, moment, "applied" if code else "pending", moment if code else None),
                )
    connection = db.conn()
    buyers = [
        {"tg": int(r["tg"]), "paid": int(r["paid"] or 0), "early": int(r["early"] or 0),
         "bday": int(r["bday"] or 0), "orders": int(r["orders"] or 0)}
        for r in await _rows(connection, LEDGER_SQL, LEDGER_ARGS)
    ]
    states = [
        {"tg": int(r["tg"]), "reason": r["reason"], "state": r["state"], "extended": bool(r["extended"])}
        for r in await _rows(connection, "SELECT tg, reason, state, extended FROM kladovaya_6let_grants ORDER BY id")
    ]
    prize_states = [
        {"tg": int(r["tg"]), "prize": r["prize"], "key": r["key"], "code": r["code"], "state": r["state"]}
        for r in await _rows(connection, "SELECT tg, prize, key, code, state FROM kladovaya_6let_prizes ORDER BY id")
    ]
    return {"ok": True, "campaign": CAMPAIGN, "generatedAt": moment, "grantsAccepted": accepted,
            "buyers": buyers, "grants": states, "prizes": prize_states}


def register(router, ip_of: Callable[[web.Request], str]) -> None:
    async def handler(request: web.Request) -> web.Response:
        headers = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}
        try:
            body = await request.read()
            if len(body) > BODY_LIMIT:
                raise zero_campaign.CampaignError("body_too_large", 413)
            nonce = request.headers.get("X-Zero-Nonce", "")
            zero_campaign.verify_request(
                body=body,
                timestamp=request.headers.get("X-Zero-Timestamp", ""),
                nonce=nonce,
                signature=request.headers.get("X-Zero-Signature", ""),
                source_ip=ip_of(request),
            )
            await zero_campaign.reserve_nonce(nonce, int(time.time()))
            try:
                payload = json.loads(body)
            except (UnicodeDecodeError, json.JSONDecodeError):
                raise zero_campaign.CampaignError("bad_payload", 400) from None
            return web.json_response(await sync(payload), headers=headers)
        except zero_campaign.CampaignError as error:
            return web.json_response({"ok": False, "error": error.code}, status=error.status, headers=headers)

    router.add_post(PATH, handler)
