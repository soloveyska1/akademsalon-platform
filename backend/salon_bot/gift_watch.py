#!/usr/bin/env python3
"""Подарочная подписка по Telegram-нику: выдаётся сама при первом входе.

Зачем. Владелец дарит подписку человеку, который помог проекту, а у человека
ещё нет аккаунта в Салоне. Оператор один раз заводит подарок (ник, тариф,
дни); сторож — systemd-таймер раз в минуту — ждёт, когда этот ник впервые
войдёт через Telegram (users.id > 0: так Салон хранит Telegram-аккаунты), и
тогда в одной транзакции создаёт действующую подписку и помечает подарок
выданным. Потом пишет человеку и админам через Bot API.

Что не трогает. Код приложения (/root/salon_bot/app) не меняется и бот не
перезапускается: сторож — отдельный процесс, пишет в ту же SQLite (WAL) через
BEGIN IMMEDIATE с busy_timeout, как zero_campaign.py. Подписка — та же строка
`subscriptions`, что пишет подтверждение оплаты (db.sub_create + sub_activate):
тариф, фичи и скидка берутся из последней оплаченной подписки того же тарифа
и срока, а цена — 0, via='gift', pay_method='gift', auto_renew=0 (подарок не
продлевается счётом сам).

Ники, ID и причины подарков — данные клиентов: только в базе на сервере и в
аргументах командной строки, не в репозитории, не в отчётах.

  python3 gift_watch.py migrate
  python3 gift_watch.py grant --username <ник> --plan pro --days 150 --claim-days 120 --reason "<за что>"
  python3 gift_watch.py status
  python3 gift_watch.py revoke --id <N>
  python3 gift_watch.py run [--dry-run]      # это зовёт таймер
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

DB_PATH = Path(os.environ.get("SALON_DB_PATH", "/root/salon_bot/salon.db"))
BUSY_TIMEOUT_MS = 10_000
USERNAME_RE = re.compile(r"^[a-z0-9_]{4,32}$")
MAX_DAYS = 366
# Тарифы, которые можно дарить, и запасные условия, если оплаченных образцов
# в базе нет: как у оплаченной «Про» на 150 дней (проверено в базе 09.10.2026).
# Другой тариф — сначала сверить его состав и только потом добавлять сюда.
PLAN_FALLBACK = {
    "pro": {"features": ["disc10", "prio", "curator", "shelf", "trainer", "express", "cb2"], "discount_pct": 10, "discount_cap": 3000},
}
PLAN_LABEL = {"pro": "«Про»"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS subscription_gifts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username_norm TEXT NOT NULL,
  plan TEXT NOT NULL,
  days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 366),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  claim_until TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','claimed','revoked','lapsed')),
  claimed_user_id INTEGER,
  claimed_at TEXT,
  subscription_id INTEGER,
  notified_at TEXT,
  CHECK(state <> 'claimed' OR (claimed_user_id > 0 AND subscription_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_gifts_pending
  ON subscription_gifts(username_norm) WHERE state = 'pending';
"""


def iso(moment: datetime) -> str:
    """Формат дат Салона (db.now_iso): UTC без зоны и долей секунды."""
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def normalize_username(raw: str) -> str:
    """@nick, t.me/nick, https://t.me/nick → nick в нижнем регистре."""
    value = str(raw or "").strip()
    value = re.sub(r"^(?:https?://)?(?:www\.)?t\.me/", "", value, flags=re.IGNORECASE)
    value = value.lstrip("@").strip().lower()
    if not USERNAME_RE.fullmatch(value):
        raise ValueError("ник Telegram: 4–32 знака, латиница, цифры и _")
    return value


def connect(path: Path = DB_PATH) -> sqlite3.Connection:
    con = sqlite3.connect(str(path), timeout=BUSY_TIMEOUT_MS / 1000, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
    return con


def migrate(con: sqlite3.Connection) -> None:
    con.executescript(SCHEMA)


def plan_terms(con: sqlite3.Connection, plan: str, days: int) -> dict:
    """Фичи и скидка — как у последней оплаченной подписки этого тарифа и срока."""
    row = con.execute(
        "SELECT features, discount_pct, discount_cap FROM subscriptions "
        "WHERE plan=? AND period_days=? AND price > 0 AND status IN ('active','expired') "
        "ORDER BY id DESC LIMIT 1",
        (plan, days),
    ).fetchone()
    if row:
        try:
            features = json.loads(row["features"] or "[]")
        except ValueError:
            features = []
        if isinstance(features, list) and features:
            return {"features": [str(x) for x in features], "discount_pct": int(row["discount_pct"] or 0), "discount_cap": int(row["discount_cap"] or 0)}
    if plan not in PLAN_FALLBACK:
        raise ValueError(f"тариф {plan} не дарится")
    return dict(PLAN_FALLBACK[plan])


def grant(con: sqlite3.Connection, username: str, plan: str, days: int, claim_days: int, reason: str, now: datetime | None = None) -> int:
    now = now or utcnow()
    name = normalize_username(username)
    if plan not in PLAN_FALLBACK:
        raise ValueError(f"тариф {plan} не дарится")
    if not 1 <= int(days) <= MAX_DAYS:
        raise ValueError(f"срок подарка — от 1 до {MAX_DAYS} дней")
    if not 1 <= int(claim_days) <= 400:
        raise ValueError("ждать вход — от 1 до 400 дней")
    migrate(con)
    try:
        cur = con.execute(
            "INSERT INTO subscription_gifts(username_norm, plan, days, reason, created_at, claim_until) VALUES(?,?,?,?,?,?)",
            (name, plan, int(days), str(reason or "")[:200], iso(now), iso(now + timedelta(days=int(claim_days)))),
        )
    except sqlite3.IntegrityError as error:
        raise ValueError("для этого ника уже есть невыданный подарок") from error
    return int(cur.lastrowid)


def revoke(con: sqlite3.Connection, gift_id: int) -> bool:
    cur = con.execute("UPDATE subscription_gifts SET state='revoked' WHERE id=? AND state='pending'", (int(gift_id),))
    return cur.rowcount == 1


def find_user(con: sqlite3.Connection, username_norm: str) -> int | None:
    row = con.execute(
        "SELECT id FROM users WHERE lower(username)=? AND id > 0 AND coalesce(banned,0)=0 "
        "ORDER BY last_seen_at DESC LIMIT 1",
        (username_norm,),
    ).fetchone()
    return int(row["id"]) if row else None


def claim(con: sqlite3.Connection, gift_id: int, user_id: int, now: datetime | None = None) -> int | None:
    """Выдать подарок: подписка + отметка — одной транзакцией. None — уже не ждёт."""
    now = now or utcnow()
    con.execute("BEGIN IMMEDIATE")
    try:
        gift = con.execute("SELECT * FROM subscription_gifts WHERE id=?", (gift_id,)).fetchone()
        if not gift or gift["state"] != "pending":
            con.execute("ROLLBACK")
            return None
        terms = plan_terms(con, gift["plan"], int(gift["days"]))
        started = iso(now)
        expires = iso(now + timedelta(days=int(gift["days"])))
        cur = con.execute(
            "INSERT INTO subscriptions(user_id, plan, features, price, period_days, discount_pct, discount_cap,"
            " status, order_id, started_at, expires_at, via, pay_method, auto_renew, created_at)"
            " VALUES(?,?,?,0,?,?,?, 'active', NULL, ?, ?, 'gift', 'gift', 0, ?)",
            (user_id, gift["plan"], json.dumps(terms["features"], ensure_ascii=False), int(gift["days"]),
             terms["discount_pct"], terms["discount_cap"], started, expires, started),
        )
        sub_id = int(cur.lastrowid)
        done = con.execute(
            "UPDATE subscription_gifts SET state='claimed', claimed_user_id=?, claimed_at=?, subscription_id=? "
            "WHERE id=? AND state='pending'",
            (user_id, started, sub_id, gift_id),
        )
        if done.rowcount != 1:
            con.execute("ROLLBACK")
            return None
        con.execute("COMMIT")
        return sub_id
    except Exception:
        con.execute("ROLLBACK")
        raise


def telegram(method: str, payload: dict) -> bool:
    token = os.environ.get("BOT_TOKEN", "").strip()
    if not token:
        return False
    data = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(f"https://api.telegram.org/bot{token}/{method}", data=data)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return bool(json.loads(response.read().decode("utf-8")).get("ok"))
    except Exception:
        return False


def admin_ids() -> list[int]:
    ids = []
    for part in re.split(r"[\s,;]+", os.environ.get("ADMIN_IDS", "")):
        if part.strip().lstrip("-").isdigit():
            ids.append(int(part))
    return ids


def notify(gift: sqlite3.Row, user_id: int, days: int) -> bool:
    label = PLAN_LABEL.get(gift["plan"], gift["plan"])
    text = (
        f"🎁 Подарок: подписка {label} на {days} дней уже включена.\n\n"
        "Спасибо, что помогаешь Кладовой и Салону! Всё, что входит в подписку, — в кабинете: akademsalon.ru/dashboard.html"
    )
    sent = telegram("sendMessage", {"chat_id": user_id, "text": text, "disable_web_page_preview": "true"})
    for admin in admin_ids():
        telegram("sendMessage", {"chat_id": admin, "text": f"🎁 Подарок #{gift['id']} выдан: {label} на {days} дн., пользователь {user_id}. Человеку {'написал' if sent else 'написать не вышло'}."})
    return sent


def run(con: sqlite3.Connection, *, dry_run: bool = False, now: datetime | None = None, notifier=notify) -> dict:
    now = now or utcnow()
    migrate(con)
    summary = {"pending": 0, "claimed": 0, "lapsed": 0}
    for gift in con.execute("SELECT * FROM subscription_gifts WHERE state='pending' ORDER BY id").fetchall():
        if gift["claim_until"] < iso(now):
            if not dry_run:
                con.execute("UPDATE subscription_gifts SET state='lapsed' WHERE id=? AND state='pending'", (gift["id"],))
            summary["lapsed"] += 1
            continue
        user_id = find_user(con, gift["username_norm"])
        if user_id is None or dry_run:
            summary["pending"] += 1
            continue
        sub_id = claim(con, int(gift["id"]), user_id, now)
        if sub_id is None:
            continue
        summary["claimed"] += 1
        fresh = con.execute("SELECT * FROM subscription_gifts WHERE id=?", (gift["id"],)).fetchone()
        if notifier(fresh, user_id, int(fresh["days"])):
            con.execute("UPDATE subscription_gifts SET notified_at=? WHERE id=?", (iso(utcnow()), gift["id"]))
    return summary


def status(con: sqlite3.Connection) -> list[dict]:
    migrate(con)
    rows = con.execute("SELECT id, plan, days, state, created_at, claim_until, claimed_at, subscription_id, notified_at FROM subscription_gifts ORDER BY id").fetchall()
    return [dict(row) for row in rows]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Подарочные подписки Салона по Telegram-нику")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("migrate")
    g = sub.add_parser("grant")
    g.add_argument("--username", required=True)
    g.add_argument("--plan", default="pro")
    g.add_argument("--days", type=int, required=True)
    g.add_argument("--claim-days", type=int, default=120)
    g.add_argument("--reason", default="")
    r = sub.add_parser("revoke")
    r.add_argument("--id", type=int, required=True)
    sub.add_parser("status")
    w = sub.add_parser("run")
    w.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    con = connect()
    try:
        if args.command == "migrate":
            migrate(con)
            print("ok")
        elif args.command == "grant":
            print(f"подарок #{grant(con, args.username, args.plan, args.days, args.claim_days, args.reason)} ждёт входа")
        elif args.command == "revoke":
            print("отозван" if revoke(con, args.id) else "нечего отзывать")
        elif args.command == "status":
            for row in status(con):
                print(json.dumps(row, ensure_ascii=False))
        elif args.command == "run":
            print(json.dumps(run(con, dry_run=args.dry_run), ensure_ascii=False))
    except ValueError as error:
        print(f"ошибка: {error}", file=sys.stderr)
        return 2
    finally:
        con.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
