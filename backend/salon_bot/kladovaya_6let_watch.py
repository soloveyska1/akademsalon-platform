#!/usr/bin/env python3
"""Сторож подарков «Кладовой 6 лет»: включает подписки, как только человек есть в Салоне.

Подарки записывает обмен с ботом Кладовой (app/services/kladovaya_6let.py) в
kladovaya_6let_grants. Сторож — systemd-таймер раз в минуту — находит
ожидающие подарки людей, у которых уже есть аккаунт со входом через Telegram
(users.id = Telegram-ID, не заблокирован), и одной транзакцией на подарок:

- если действующая подписка не ниже подарка (Про ≥ Сессия ≥ Салон+) —
  продлевает её срок на дни подарка (тариф никогда не понижается);
- иначе — заводит подписку подарка с сегодняшнего дня: те же фичи и скидка,
  что у тарифа (config.SUB_PLANS 10.10.2026), цена 0, via='kladovaya-6let',
  pay_method='gift', без автопродления; она становится действующей
  (db.sub_active — последняя активная), а прежняя после её конца вернётся.

Потом пишет человеку через бота Салона. Код приложения не трогает и бота не
перезапускает: отдельный процесс, BEGIN IMMEDIATE и busy_timeout, как
gift_watch.py. Telegram-ID — данные клиентов: только в базе на сервере.

  python3 kladovaya_6let_watch.py migrate
  python3 kladovaya_6let_watch.py run [--dry-run]   # это зовёт таймер
  python3 kladovaya_6let_watch.py status            # только числа
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

DB_PATH = Path(os.environ.get("SALON_DB_PATH", "/root/salon_bot/salon.db"))
BUSY_TIMEOUT_MS = 10_000
VIA = "kladovaya-6let"
# как config.SUB_PLANS и SUB_DISCOUNTS на 10.10.2026
PLAN_TERMS = {
    "plus": {"features": ["disc5", "prio", "curator", "shelf"], "discount_pct": 5, "discount_cap": 1000},
    "pro": {"features": ["disc10", "prio", "curator", "shelf", "trainer", "express", "cb2"], "discount_pct": 10, "discount_cap": 3000},
}
RANK = {"plus": 1, "session": 2, "pro": 3}
PLAN_LABEL = {"plus": "«Салон+»", "pro": "«Про»", "session": "«Сессия»"}
PLAN_PERKS = {
    "plus": "скидка 5 % на заказы, приоритет, куратор и «Полка» с чек-листами",
    "pro": "скидка 10 % на заказы, двойной кешбэк, тренажёр защиты и разбор 15 минут каждый месяц",
}
REASON_TEXT = {
    "friend": "спасибо, что позвал друга",
    "buyer": "спасибо за именинный заказ",
    "leaves": "ты собрал все шесть листиков",
    "group": "твоя группа победила в «Битве групп»",
    "top": "ты в топ-3 по приглашённым друзьям",
    "free": "тебе повезло в розыгрыше для всех",
}

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


def iso(moment: datetime) -> str:
    """Формат дат Салона (db.now_iso): UTC без зоны и долей секунды."""
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def parse_iso(value: str) -> datetime:
    return datetime.strptime(str(value)[:19], "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def connect(path: Path = DB_PATH) -> sqlite3.Connection:
    con = sqlite3.connect(str(path), timeout=BUSY_TIMEOUT_MS / 1000, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute(f"PRAGMA busy_timeout={BUSY_TIMEOUT_MS}")
    return con


def migrate(con: sqlite3.Connection) -> None:
    con.execute(SCHEMA)


def active_subscription(con: sqlite3.Connection, user_id: int, now: datetime):
    """Как db.sub_active: последняя активная и не истёкшая."""
    return con.execute(
        "SELECT * FROM subscriptions WHERE user_id=? AND status='active' AND expires_at > ? ORDER BY id DESC LIMIT 1",
        (user_id, iso(now)),
    ).fetchone()


def apply_one(con: sqlite3.Connection, grant_id: int, now: datetime | None = None) -> dict | None:
    """Включить один подарок. None — уже не ждёт или человека ещё нет в Салоне."""
    now = now or utcnow()
    con.execute("BEGIN IMMEDIATE")
    try:
        grant = con.execute("SELECT * FROM kladovaya_6let_grants WHERE id=?", (grant_id,)).fetchone()
        user = grant and con.execute(
            "SELECT id FROM users WHERE id=? AND id > 0 AND COALESCE(banned, 0)=0", (grant["tg"],)
        ).fetchone()
        if not grant or grant["state"] != "pending" or not user:
            con.execute("ROLLBACK")
            return None
        days = int(grant["days"])
        current = active_subscription(con, int(grant["tg"]), now)
        if current and RANK.get(current["plan"], 0) >= RANK[grant["plan"]]:
            expires = max(parse_iso(current["expires_at"]), now) + timedelta(days=days)
            con.execute("UPDATE subscriptions SET expires_at=? WHERE id=?", (iso(expires), current["id"]))
            sub_id, extended, plan = int(current["id"]), 1, current["plan"]
        else:
            terms = PLAN_TERMS[grant["plan"]]
            started = iso(now)
            expires = now + timedelta(days=days)
            cur = con.execute(
                "INSERT INTO subscriptions(user_id, plan, features, price, period_days, discount_pct, discount_cap,"
                " status, order_id, started_at, expires_at, via, pay_method, auto_renew, created_at)"
                " VALUES(?,?,?,0,?,?,?, 'active', NULL, ?, ?, ?, 'gift', 0, ?)",
                (int(grant["tg"]), grant["plan"], json.dumps(terms["features"], ensure_ascii=False), days,
                 terms["discount_pct"], terms["discount_cap"], started, iso(expires), VIA, started),
            )
            sub_id, extended, plan = int(cur.lastrowid), 0, grant["plan"]
        done = con.execute(
            "UPDATE kladovaya_6let_grants SET state='applied', applied_at=?, subscription_id=?, extended=? "
            "WHERE id=? AND state='pending'",
            (iso(now), sub_id, extended, grant_id),
        )
        if done.rowcount != 1:
            con.execute("ROLLBACK")
            return None
        con.execute("COMMIT")
        return {"id": grant_id, "tg": int(grant["tg"]), "reason": grant["reason"], "plan": plan,
                "gift_plan": grant["plan"], "days": days, "extended": bool(extended), "expires": iso(expires)}
    except Exception:
        con.execute("ROLLBACK")
        raise


def pending_ready(con: sqlite3.Connection) -> list[int]:
    rows = con.execute(
        "SELECT g.id FROM kladovaya_6let_grants g JOIN users u ON u.id = g.tg "
        "WHERE g.state='pending' AND COALESCE(u.banned, 0)=0 ORDER BY g.id"
    ).fetchall()
    return [int(r["id"]) for r in rows]


def message(done: dict) -> str:
    reason = REASON_TEXT.get(done["reason"].split("-")[0], "подарок от Кладовой")
    until = parse_iso(done["expires"]).astimezone(timezone(timedelta(hours=3))).strftime("%d.%m.%Y")
    if done["extended"]:
        head = (f"🎂 Кладовой 6 лет — и подарок тебе: +{done['days']} дней к подписке "
                f"{PLAN_LABEL.get(done['plan'], '')}, теперь она действует до {until}.")
        perks = PLAN_PERKS.get(done["plan"], "")
    else:
        head = (f"🎂 Кладовой 6 лет — и подарок тебе: подписка {PLAN_LABEL.get(done['gift_plan'], '')} "
                f"на {done['days']} дней уже работает, до {until}.")
        perks = PLAN_PERKS.get(done["gift_plan"], "")
    body = f"{head}\n\n{perks[:1].upper()}{perks[1:]}." if perks else head
    return f"{body}\n\nЗа что: {reason} 💚"


def telegram(method: str, payload: dict) -> bool:
    token = os.environ.get("BOT_TOKEN", "").strip()
    if not token:
        return False
    data = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(f"https://api.telegram.org/bot{token}/{method}", data=data)
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return bool(json.loads(response.read().decode("utf-8")).get("ok"))
    except Exception:
        return False


def notify(con: sqlite3.Connection, done: dict) -> None:
    if telegram("sendMessage", {"chat_id": done["tg"], "text": message(done), "disable_web_page_preview": "true"}):
        con.execute("UPDATE kladovaya_6let_grants SET notified_at=? WHERE id=?", (iso(utcnow()), done["id"]))


def run(con: sqlite3.Connection, *, dry_run: bool = False) -> list[dict]:
    migrate(con)
    applied = []
    for grant_id in pending_ready(con):
        if dry_run:
            applied.append({"id": grant_id, "dry_run": True})
            continue
        done = apply_one(con, grant_id)
        if done:
            applied.append(done)
            notify(con, done)
    return applied


def status(con: sqlite3.Connection) -> dict:
    migrate(con)
    rows = con.execute("SELECT reason, state, COUNT(*) AS n FROM kladovaya_6let_grants GROUP BY reason, state").fetchall()
    return {f"{r['reason']}:{r['state']}": int(r["n"]) for r in rows}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("migrate")
    run_p = sub.add_parser("run")
    run_p.add_argument("--dry-run", action="store_true")
    sub.add_parser("status")
    args = parser.parse_args(argv)
    con = connect()
    if args.cmd == "migrate":
        migrate(con)
        print("ok")
    elif args.cmd == "run":
        done = run(con, dry_run=args.dry_run)
        # без Telegram-ID: в журнал только числа
        print(json.dumps({"applied": len(done), "dry_run": args.dry_run}))
    else:
        print(json.dumps(status(con), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
