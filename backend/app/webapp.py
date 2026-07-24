"""HTTP-API кабинета сайта (за nginx, 127.0.0.1). Сайт и бот работают с одной базой.

Аутентификация:
- Telegram-вход: POST /api/auth/start → код → клиент жмёт t.me/бот?start=auth_<код>
  → GET /api/auth/poll выдаёт session-token (Bearer).
- Гостевой доступ: у каждого заказа с сайта есть access_token (хранится в браузере).

Эндпоинты публичные, поэтому: honeypot, лимиты по IP, жёсткие лимиты длины.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import secrets
import sqlite3
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

import aiohttp as aiohttp_client
from aiogram import Bot
from aiogram.types import BufferedInputFile
from aiohttp import web

from . import config, db, keyboards as kb, texts
from .services import (
    bonus,
    contract,
    flow,
    handoff,
    intake_guard,
    mailer,
    notify,
    pamyatka,
    payment_delivery,
    payments,
    sanitize,
    subs,
)
from .services import deposit
from .services import gift as gift_svc
from .services import group as grp
from .services import promo as promo_svc
from .services import qa as qa_svc
from .texts import esc

log = logging.getLogger(__name__)

_STARTED = time.time()
_rate: dict[str, list[float]] = {}
RATE_N, RATE_WINDOW = 12, 60.0
MAX_UPLOAD = 20 * 1024 * 1024  # лимит Bot API на выгрузку файла ботом
MAX_BUNDLE_UPLOAD = 80 * 1024 * 1024

_SITE_ORIGIN = urllib.parse.urlsplit(config.SITE_URL)
_SITE_ORIGIN = f"{_SITE_ORIGIN.scheme}://{_SITE_ORIGIN.netloc}"
CORS = {
    "Access-Control-Allow-Origin": _SITE_ORIGIN,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": (
        "Content-Type, Authorization, X-Order-Token, X-Order-Tokens"
    ),
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
}


def _ip(request: web.Request) -> str:
    return request.headers.get("X-Real-IP") or (request.remote or "?")


# ---------- фоновые уведомления: HTTP-ответ не ждёт Telegram ----------
# Урок заявки №177 (17.07): api.telegram.org с VPS периодически молчит по
# 60 секунд на вызов; три последовательные отправки в хендлере держали
# POST /api/orders 182 секунды — nginx резал клиента по 504, «Отправляем…»
# висело у живого лида. Правило: сначала БД и ответ клиенту, отправки — фоном.
# Ретраи переживают короткий сбой сети; сработавший фактори не повторяется.
_BG_TASKS: set[asyncio.Task] = set()
_BG_RETRY_AFTER = (0, 45, 180)  # сек до 1-й, 2-й и 3-й попытки


def _bg(label: str, factory) -> None:
    """Выполнить отправку в фоне: factory() -> Coroutine, зовётся на каждую попытку."""
    async def runner():
        for attempt, pause in enumerate(_BG_RETRY_AFTER, start=1):
            if pause:
                await asyncio.sleep(pause)
            try:
                await factory()
                return
            except Exception:  # noqa: BLE001
                log.exception("bg %s: попытка %s не прошла", label, attempt)
    t = asyncio.get_running_loop().create_task(runner(), name=f"bg:{label}")
    _BG_TASKS.add(t)
    t.add_done_callback(_BG_TASKS.discard)


def _mk_alert(bot: Bot, order_id: int, text: str, reply_markup=None,
              map_client: tuple[int, int | None] | None = None):
    """Фабрика для _bg: типовой алерт «в ветку группы + личку админам»."""
    async def push():
        g = await grp.send(bot, order_id, text, reply_markup=reply_markup)
        await notify.notify_admins(bot, text, reply_markup=reply_markup,
                                   map_client=map_client, group_sent=bool(g))
    return push


# промокоды: верхний регистр, латиница+кириллица+цифры (символы вне набора
# вырезаются согласованно с /promo add в боте — иначе «СТАРТ500» превращался
# в «500» и код угадывался с одной попытки)
def _clean_promo(raw) -> str:
    return re.sub(r"[^A-ZА-ЯЁ0-9_-]", "", str(raw or "").upper())[:24]


def _rate_ok(ip: str, cost: int = 1) -> bool:
    now = time.time()
    hits = [t for t in _rate.get(ip, []) if now - t < RATE_WINDOW]
    if len(hits) + cost > RATE_N:
        _rate[ip] = hits
        return False
    hits.extend([now] * cost)
    _rate[ip] = hits
    if len(_rate) > 5000:
        _rate.clear()
    return True


def _json(data: dict, status: int = 200) -> web.Response:
    return web.json_response(data, status=status, headers=CORS)


def _err(error: str, status: int = 400) -> web.Response:
    return _json({"ok": False, "error": error}, status)


async def _session_user(request: web.Request):
    """Пользователь только по Bearer-токену.

    Session token в query string запрещён: URL попадает в историю браузера,
    reverse-proxy логи и Referer. OAuth callback использует fragment, который
    браузер не отправляет серверу.
    """
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""
    return await db.session_user(token) if token else None


def _sess_imp(user) -> bool:
    """Сессия — «тихий» вход мастера в кабинет клиента (без шума и меток)."""
    try:
        return bool(user["session_imp"])
    except (KeyError, IndexError, TypeError):
        return False


async def _order_access(request: web.Request, order_id: int):
    """Заказ доступен владельцу сессии или по гостевому токену заказа."""
    o = await db.get_order(order_id)
    if not o:
        return None, None
    user = await _session_user(request)
    if user and (o["user_id"] == user["id"] or user["id"] in config.ADMIN_IDS):
        return o, user
    # Capability token сначала принимаем из header. Query оставлен только на
    # короткий период миграции старого frontend и должен быть удалён после
    # подтверждённого rollout X-Order-Token.
    token = request.headers.get("X-Order-Token", "").strip()
    if not token:
        token = request.query.get("token", "")
    if not token:
        try:
            body = await request.json()
            token = str(body.get("token", ""))
        except Exception:  # noqa: BLE001
            token = ""
    if token and o["access_token"] and secrets.compare_digest(o["access_token"], token):
        # Дело в корзине по гостевому токену больше не отдаём: список
        # (orders_by_tokens) фильтр уже имеет, а этот прямой путь и claim
        # в боте оставались открытыми — удалённое дело читалось из интернета
        # по утёкшему токену. Мастеру (ADMIN_IDS) корзина видна: он восстанавливает.
        if (o["deleted"] or 0) and not (user and user["id"] in config.ADMIN_IDS):
            return None, user
        return o, user
    return None, user

# ------------------------------------------------------------- сериализация

_HISTORY_LABELS = {
    "created": "Заявка принята",
    "price_accepted": "Вы приняли предложение",
    "payment_marked": "Вы отметили оплату",
    "delivered": "Мастерская передала файл работы",
    "part_ready": "Часть готова — выставлен счёт этапа",
    "final_ready": "Работа готова целиком — выставлен остаток",
    "pay_reminder": "Напоминание об оплате этапа",
    "client_followup": "Напоминание о проверке работы",
    "paused": "Дело поставлено на паузу",
    "unpaused": "Пауза снята — дело продолжается",
    "cancel_request": "Отправлен запрос на закрытие дела",
}


_TIER_LABEL = {t[0]: t[2] for t in config.TIERS}
_DISC_LABEL = {d[0]: d[2] for d in config.DISCIPLINES}


def _order_json(o, files=None, unread: int = 0) -> dict:
    st = config.ST[o["status"]]
    due = payments.money_due(o)
    stages_total = o["stages_total"] or 1
    d = {
        "id": o["id"], "no": f"№{o['id']}",
        "status": o["status"], "status_label": st.client_label, "status_emoji": st.emoji,
        "step": st.step, "steps": config.PROGRESS_STEPS,
        "work_label": o["work_label"], "topic": o["topic"],
        "work_type": o["work_type"],
        "deadline_text": o["deadline_text"],
        "deadline_date": o["deadline_date"],
        "quote_low": o["quote_low"], "quote_high": o["quote_high"],
        "price": o["price"], "prepay": o["prepay"],
        "tier": o["tier"], "tier_label": _TIER_LABEL.get(o["tier"] or "", None),
        "bonus_spent": o["bonus_spent"] or 0,
        "sub_discount": _row_int_w(o, "sub_discount"),
        "promo_code": _row_get_w(o, "promo_code"),
        "promo_discount": _row_int_w(o, "promo_discount"),
        "gift_code": _row_get_w(o, "gift_code"),
        "gift_amount": _row_int_w(o, "gift_amount"),
        "due_total": due["due_total"], "prepay_due": due["prepay_due"],
        "cancel_reason": o["cancel_reason"],
        "created_at": o["created_at"], "updated_at": o["updated_at"],
        "unread": unread,
        "actions": _actions_for(o),
        "tg_linked": bool(o["user_id"]),
        # поэтапная сдача
        "stages_total": stages_total,
        "stage": o["stage"] or 1,
        "parts_done": o["parts_done"] or 0,
        "archived": bool(o["archived_client"]),
        "paused": bool(o["paused"]),
        "paused_by": o["paused_by"],
        "pinned": bool(o["pinned_client"]),
        "final_ready": bool(o["final_ready"]),
        # часть объявлена готовой и придержана до оплаты этапа (номер части)
        "part_ready": _part_ready(o),
        "handoff_artifact_id": _row_int_w(o, "handoff_artifact_id"),
        "handoff_phase": _row_get_w(o, "handoff_phase"),
        "handoff_version": _row_int_w(o, "handoff_version"),
        # финал передан — доступна персональная памятка «что дальше» (PDF)
        "pamyatka": pamyatka.order_pamyatka_ready(o),
    }
    if files is not None:
        d["files"] = [{
            "id": f["id"], "name": f["file_name"] or ("фото" if f["kind"] == "photo" else "файл"),
            "from": "master" if f["direction"] == "admin" else "client",
            "size": f["file_size"], "at": f["created_at"],
            "part": f["part"], "label": f["label"], "kind": f["kind"],
        } for f in files]
    return d


def _part_ready(o) -> int:
    return _row_int_w(o, "part_ready")


def _row_int_w(o, key: str) -> int:
    try:
        return int(o[key] or 0)
    except (KeyError, IndexError, TypeError, ValueError):
        return 0


def _row_get_w(o, key: str):
    try:
        return o[key]
    except (KeyError, IndexError):
        return None


def _json_dict(raw) -> dict:
    """Декодировать снимок анкеты без риска уронить карточку старой строкой."""
    try:
        value = json.loads(raw or "{}")
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _actions_for(o) -> list[str]:
    acts = {
        "new": ["decline"],
        "priced": ["accept_price", "decline"],
        "prepay": ["paid", "decline"],
        "check": ["accept_work", "request_fixes"],
        "fix": ["accept_work", "request_fixes"],
        "done": ["request_fixes", "archive"],
        "cancel": ["resume", "archive"],
    }.get(o["status"], [])
    acts = list(acts)
    # Пока актуальная handoff-версия ещё у мастера/на выдаче/ждёт оплату,
    # клиент не должен принимать её через legacy-action из старой карточки.
    hp = _row_get_w(o, "handoff_phase")
    if _row_int_w(o, "handoff_artifact_id") and hp not in (
            "preview_published", "released"):
        acts = [a for a in acts if a not in ("accept_work", "request_fixes")]
    if o["status"] in ("work", "check", "fix"):
        acts.append("paid")  # оплату «созревшего» этапа можно заявить в любой момент
    if o["status"] in ("done", "cancel") and o["archived_client"]:
        acts = [a for a in acts if a != "archive"] + ["unarchive"]
    if o["status"] in config.ACTIVE_STATUSES:
        if o["paused"]:
            if (o["paused_by"] or "client") != "admin":
                acts.append("unpause")
        else:
            acts.append("pause")
        # в производстве закрытие — только через мастера (уже есть работа и оплаты)
        if o["status"] in ("work", "check", "fix"):
            acts.append("cancel_request")
    acts.append("unpin" if o["pinned_client"] else "pin")
    return acts


_MEDIA_KINDS = {"voice", "audio", "photo", "video_note", "video", "document"}


async def _engagement_ready(o, pays=None) -> bool:
    """Отзыв и добровольная благодарность уместны после полной выдачи.

    Обычные заказы сохраняют прежнее правило ``done``. Новый handoff-контур
    открывает эти действия сразу после полной оплаты и выдачи оригиналов,
    даже пока клиент ещё пользуется бесплатными правками.
    """
    return await handoff.engagement_ready(o)


async def _order_full_json(o) -> dict:
    files = await db.files_for_order(o["id"])
    msgs = await db.msgs_for_order(o["id"])
    events = await db.events_for_order(o["id"], limit=50)
    items = await db.items_for_order(o["id"])
    d = _order_json(o, files=files)
    d["items"] = []
    for item in items:
        request_item = _json_dict(_row_get_w(item, "request_json"))
        # Полный request-v2 возвращается клиенту и мастеру, но проверенные
        # серверные поля всегда перекрывают его совместимыми значениями.
        request_item.update({
            "id": item["id"],
            "position": item["position"],
            "client_id": _row_get_w(item, "client_id"),
            "parent_client_id": _row_get_w(item, "parent_client_id"),
            "kind": item["kind"],
            "catalog_id": item["catalog_id"],
            "type": item["catalog_id"],
            "label": item["label"],
            "qty": item["qty"],
            "config": _json_dict(item["config_json"]),
            "answers": _json_dict(item["answers_json"]),
            "topic": item["topic"],
            "deadline_text": item["deadline_text"],
            "deadline": item["deadline_text"],
            "requirements": item["requirements"],
            "note": item["note"],
            "quote_low": item["quote_low"],
            "quote_high": item["quote_high"],
            "final_price": item["final_price"],
        })
        d["items"].append(request_item)
    if _row_int_w(o, "handoff_artifact_id"):
        bundle = await handoff.files(_row_int_w(o, "handoff_artifact_id"))
        d["handoff_files"] = [x["source_file_name"] for x in bundle]
    d["messages"] = [{
        "id": m["id"], "from": m["sender"], "text": m["text"], "kind": m["kind"],
        "file_name": m["file_name"], "at": m["created_at"],
        # медиа переписки (голосовые, фото) можно слушать/смотреть прямо на сайте
        "media": bool(m["tg_file_id"]) and m["kind"] in _MEDIA_KINDS,
    } for m in msgs]
    history = []
    for e in reversed(list(events)):  # старые → новые
        if e["kind"] == "status":
            new = (e["data"] or "").split("→")[-1].split("·")[0].strip()
            if new in config.ST:
                s = config.ST[new]
                history.append({"at": e["created_at"], "text": f"{s.emoji} {s.client_label}"})
        elif e["kind"] in _HISTORY_LABELS:
            history.append({"at": e["created_at"], "text": _HISTORY_LABELS[e["kind"]]})
    d["history"] = history
    if o["status"] in ("priced", "prepay", "work", "check", "fix"):
        d["requisites"] = await db.setting_get("requisites")
    # оплата и бонусы — для кабинета
    d["pay_online"] = bool(config.pay_provider())
    d["receipt_email"] = (await mailer.order_recipient(o)) or ""
    pays = await db.payments_for_order(o["id"])
    receipt_rows = await db.receipts_for_order(o["id"])
    receipts_by_payment = {
        int(r["payment_id"]): r for r in receipt_rows if r["payment_id"]
    }
    d["payments"] = [{
        "id": p["id"], "kind": p["kind"], "amount": p["amount"], "method": p["method"],
        "status": p["status"], "at": p["paid_at"] or p["created_at"],
        "fiscal_status": (
            receipts_by_payment[p["id"]]["fiscal_status"]
            if p["id"] in receipts_by_payment else None
        ),
        "receipt_email": (
            receipts_by_payment[p["id"]]["buyer_email"]
            if p["id"] in receipts_by_payment else None
        ),
        "confirmation_url": (
            f"/api/orders/{o['id']}/payments/{p['id']}/confirmation.pdf"
            if p["status"] == "paid" else None
        ),
    } for p in pays]
    # план оплат по этапам + что «созрело» сейчас (отметка «оплатил» не в счёт)
    d["plan"] = payments.plan_state(o, pays)
    kind, amount = payments.due_now(o, pays)
    d["due_now"] = {"kind": kind, "amount": amount,
                    "label": payments.planned_label(o, kind, d["plan"])} if amount > 0 else None
    d["claimed"] = any(p["status"] == "claimed" for p in pays)
    if d["claimed"]:
        d["actions"] = d["actions"] + ["paid_undo"]
    if (o["bonus_spent"] or 0) > 0 and o["status"] in ("priced", "prepay") \
            and not any(p["status"] == "paid" for p in pays):
        d["actions"] = d["actions"] + ["bonus_cancel"]
    if o["user_id"]:
        d["bonus"] = await bonus.summary(o["user_id"])
        # подписка оплачивается деньгами целиком — ползунок бонусов не предлагаем
        d["bonus_cap"] = 0 if subs.is_sub_order(o) else bonus.spend_cap(o["price"])
    # Отзыв и добровольная поддержка: после завершения либо полной автовыдачи.
    engagement_ready = await _engagement_ready(o, pays)
    d["engagement_ready"] = engagement_ready
    r = await db.review_for_order(o["id"])
    if r:
        d["review"] = {
            "rating": r["rating"],
            "text": r["text"],
            "status": r["status"],
            "publication_consent": bool(r["publication_consent"]),
            "publication_consent_at": r["publication_consent_at"],
        }
    if engagement_ready:
        d["actions"] = d["actions"] + ["review"]
        d["tips"] = await db.tips_summary(o["id"])
    stored_spec = await db.specification_latest(o["id"])
    if stored_spec:
        saved_spec = _json_dict(stored_spec["specification_json"])
        d["specification"] = saved_spec
        d["specification_lines"] = saved_spec.get("lines") or []
        d["specification_meta"] = {
            "snapshot_id": stored_spec["id"],
            "id": saved_spec.get("spec_id"),
            "revision": stored_spec["revision"],
            "status": stored_spec["status"],
            "data_sha256": stored_spec["specification_hash"],
            "pdf_sha256": stored_spec["pdf_hash"],
            "pdf_size": stored_spec["pdf_size"],
            "pdf_url": f"/api/orders/{o['id']}/contract",
        }
    else:
        # Совместимость с frozen-offer, созданным до общей таблицы снимков.
        latest_offer = await db.offer_by_order(o["id"])
        if latest_offer:
            saved_spec = _json_dict(_row_get_w(latest_offer, "specification_json"))
            if saved_spec:
                d["specification"] = saved_spec
                d["specification_lines"] = saved_spec.get("lines") or []
                d["specification_meta"] = {
                    "id": saved_spec.get("spec_id"),
                    "revision": _row_get_w(latest_offer, "specification_revision")
                                or saved_spec.get("revision") or latest_offer["version"] or 1,
                    "data_sha256": _row_get_w(latest_offer, "specification_hash") or "",
                    "pdf_sha256": _row_get_w(latest_offer, "specification_pdf_hash") or "",
                    "pdf_size": _row_get_w(latest_offer, "specification_pdf_size") or 0,
                    "pdf_url": f"/api/orders/{o['id']}/contract",
                }
    return d

# ------------------------------------------------------------------- auth

async def auth_start(request: web.Request) -> web.Response:
    if not _rate_ok(_ip(request)):
        return _err("rate_limit", 429)
    code = await db.auth_code_create()
    return _json({"ok": True, "code": code,
                  "link": f"https://t.me/{config.BOT_USERNAME}?start=auth_{code}"})


async def auth_poll(request: web.Request) -> web.Response:
    code = request.query.get("code", "")[:64]
    if not code:
        return _err("no_code")
    user_id = await db.auth_code_take(code)
    if not user_id:
        return _json({"ok": True, "pending": True})
    token = await db.session_create(user_id)
    u = await db.get_user(user_id)
    return _json({"ok": True, "pending": False, "token": token,
                  "user": {"id": user_id,
                           "name": (u["first_name"] if u else None) or "Гость",
                           "username": u["username"] if u else None}})


async def auth_email_start(request: web.Request) -> web.Response:
    """Вход по почте, шаг 1: выслать 6-значный код."""
    if not await mailer.smtp_reachable():
        return _err("email_off")
    if not _rate_ok(_ip(request), cost=3):
        return _err("rate_limit", 429)
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    email = str(b.get("email") or "").strip().lower()[:120]
    if not mailer.looks_email(email):
        return _err("bad_email")
    code = await db.email_code_start(email)
    if code is None:
        return _err("resend_wait")
    if not await mailer.send_code(email, code):
        return _err("send_failed")
    return _json({"ok": True, "ttl": db.EMAIL_CODE_TTL_S})


async def auth_email_verify(request: web.Request) -> web.Response:
    """Вход по почте, шаг 2: код → сессия (та же, что у Telegram-входа)."""
    if not _rate_ok(_ip(request), cost=2):
        return _err("rate_limit", 429)
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    email = str(b.get("email") or "").strip().lower()[:120]
    code = str(b.get("code") or "").strip()[:12]
    if not mailer.looks_email(email) or not code:
        return _err("bad_email")
    res = await db.email_code_check(email, code)
    if res != "ok":
        return _err({"wrong": "wrong_code", "expired": "code_expired",
                     "locked": "too_many_attempts"}[res])
    user = await db.user_by_email(email) or await db.create_email_user(email)
    if user["banned"]:
        return _err("forbidden", 403)
    token = await db.session_create(user["id"])
    return _json({"ok": True, "token": token,
                  "user": {"id": user["id"],
                           "name": user["first_name"] or "Гость",
                           "username": user["username"]}})


# --------------------------------------------- вход через ВК / Mail.ru
# OAuth-код с PKCE; секреты только в .env на сервере. Пока приложение у
# провайдера не заведено (нет client_id) — кнопка на сайте не показывается.

_OAUTH_STATES: dict[str, dict] = {}
_OAUTH_TTL = 600


def _oauth_conf(prov: str) -> dict | None:
    if prov == "vk":
        cid = os.environ.get("VK_CLIENT_ID", "").strip()
        return {"id": cid} if cid else None
    if prov == "mailru":
        cid = os.environ.get("MAILRU_CLIENT_ID", "").strip()
        sec = os.environ.get("MAILRU_CLIENT_SECRET", "").strip()
        return {"id": cid, "secret": sec} if cid and sec else None
    return None


def _oauth_redirect_uri(prov: str) -> str:
    return f"{config.SITE_URL}/api/auth/{prov}/callback"


def _oauth_sweep() -> None:
    now = time.time()
    for k in [k for k, v in _OAUTH_STATES.items() if now - v["ts"] > _OAUTH_TTL]:
        _OAUTH_STATES.pop(k, None)


def _oauth_authorization_url(
    prov: str,
    conf: dict,
    *,
    link_user_id: int | None = None,
) -> str:
    _oauth_sweep()
    state = secrets.token_urlsafe(24)
    verifier = secrets.token_urlsafe(48)
    _OAUTH_STATES[state] = {"prov": prov, "verifier": verifier, "ts": time.time(),
                            "link": link_user_id}
    if prov == "vk":
        import base64
        import hashlib
        challenge = base64.urlsafe_b64encode(
            hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
        url = ("https://id.vk.com/authorize?" + urllib.parse.urlencode({
            "response_type": "code", "client_id": conf["id"],
            "redirect_uri": _oauth_redirect_uri("vk"), "state": state,
            "code_challenge": challenge, "code_challenge_method": "S256",
            "scope": "email",
        }))
    else:
        url = ("https://oauth.mail.ru/login?" + urllib.parse.urlencode({
            "client_id": conf["id"], "response_type": "code",
            "scope": "userinfo", "redirect_uri": _oauth_redirect_uri("mailru"),
            "state": state,
        }))
    return url


async def oauth_start(request: web.Request) -> web.Response:
    """Обычный вход: публичный редирект без привязки существующей сессии."""
    prov = request.match_info["prov"]
    conf = _oauth_conf(prov)
    if not conf:
        return _err("provider_off", 404)
    url = _oauth_authorization_url(prov, conf)
    raise web.HTTPFound(url)


async def oauth_link_start(request: web.Request) -> web.Response:
    """Создать OAuth URL привязки после Bearer-проверки.

    Frontend получает URL через authenticated POST и только затем делает
    navigation. Session token не попадает ни в query string, ни провайдеру.
    """
    if not _rate_ok(_ip(request), cost=3):
        return _err("rate_limit", 429)
    user = await _session_user(request)
    if not user or _sess_imp(user):
        return _err("unauthorized", 401)
    prov = request.match_info["prov"]
    conf = _oauth_conf(prov)
    if not conf:
        return _err("provider_off", 404)
    return _json({
        "ok": True,
        "url": _oauth_authorization_url(prov, conf, link_user_id=user["id"]),
    })


def _oauth_fail(reason: str) -> web.Response:
    raise web.HTTPFound(f"{config.SITE_URL}/dashboard.html#oauth_err="
                        + urllib.parse.quote(reason))


async def oauth_callback(request: web.Request) -> web.Response:
    """Код → токен → профиль → наш аккаунт → сессия → #oauth=токен.

    Токен сессии уезжает во фрагменте адреса: он не попадает ни в логи
    nginx, ни в Referer — страница кабинета забирает его и чистит адрес."""
    prov = request.match_info["prov"]
    conf = _oauth_conf(prov)
    if not conf:
        return _oauth_fail("provider_off")
    state = request.query.get("state", "")
    st_row = _OAUTH_STATES.pop(state, None)
    if not st_row or st_row["prov"] != prov:
        return _oauth_fail("state")
    code = request.query.get("code", "")
    if not code:
        return _oauth_fail("declined")
    try:
        async with aiohttp_client.ClientSession(
                timeout=aiohttp_client.ClientTimeout(total=12)) as http:
            if prov == "vk":
                data = {"grant_type": "authorization_code", "code": code,
                        "code_verifier": st_row["verifier"],
                        "client_id": conf["id"],
                        "device_id": request.query.get("device_id", ""),
                        "redirect_uri": _oauth_redirect_uri("vk"),
                        "state": state}
                async with http.post("https://id.vk.com/oauth2/auth", data=data) as resp:
                    tok = await resp.json(content_type=None)
                access = tok.get("access_token")
                if not access:
                    log.warning("vk oauth: no token %s", tok)
                    return _oauth_fail("token")
                ext_id = str(tok.get("user_id") or "")
                email = str(tok.get("email") or "")
                name = ""
                async with http.post("https://id.vk.com/oauth2/user_info",
                                     data={"client_id": conf["id"],
                                           "access_token": access}) as resp:
                    ui = await resp.json(content_type=None)
                u = (ui or {}).get("user") or {}
                ext_id = str(u.get("user_id") or ext_id)
                email = str(u.get("email") or email or "")
                name = " ".join(x for x in (u.get("first_name"), u.get("last_name")) if x)
            else:
                data = {"grant_type": "authorization_code", "code": code,
                        "redirect_uri": _oauth_redirect_uri("mailru")}
                auth = aiohttp_client.BasicAuth(conf["id"], conf["secret"])
                async with http.post("https://oauth.mail.ru/token",
                                     data=data, auth=auth) as resp:
                    tok = await resp.json(content_type=None)
                access = tok.get("access_token")
                if not access:
                    log.warning("mailru oauth: no token %s", tok)
                    return _oauth_fail("token")
                async with http.get("https://oauth.mail.ru/userinfo",
                                    params={"access_token": access}) as resp:
                    u = await resp.json(content_type=None)
                ext_id = str(u.get("id") or "")
                email = str(u.get("email") or "")
                name = str(u.get("name") or u.get("first_name") or "")
    except Exception as e:  # noqa: BLE001 — сеть провайдера не должна ронять API
        log.warning("oauth %s failed: %s", prov, e)
        return _oauth_fail("network")
    if not ext_id:
        return _oauth_fail("profile")
    email = email.strip().lower()[:120]
    known = await db.oauth_find(prov, ext_id)
    if st_row.get("link"):
        # привязка к уже вошедшему аккаунту (кнопка в кабинете)
        if known and known["user_id"] != st_row["link"]:
            return _oauth_fail("already_linked")
        user = await db.get_user(st_row["link"])
    elif known:
        user = await db.get_user(known["user_id"])
    elif email and mailer.looks_email(email) and await db.user_by_email(email):
        # тот же человек входил по коду на эту почту — склеиваем аккаунты
        user = await db.user_by_email(email)
    else:
        user = (await db.create_email_user(email)
                if email and mailer.looks_email(email)
                else await db.create_oauth_user(name, f"site-{prov}"))
    if not user or user["banned"]:
        return _oauth_fail("forbidden")
    await db.oauth_link(prov, ext_id, user["id"], email or None, name or None)
    token = await db.session_create(user["id"])
    raise web.HTTPFound(f"{config.SITE_URL}/dashboard.html#oauth="
                        + urllib.parse.quote(token))


async def features(request: web.Request) -> web.Response:
    """Что включено на сервере — сайт показывает только рабочие опции.

    email_login учитывает работоспособность SMTP (порт открыт И логин
    проходит): пока почта нерабочая, вход по почте не предлагается —
    включится сам, когда починится (кэш проверки 10 минут).
    """
    return _json({"ok": True,
                  "email_login": await mailer.smtp_reachable(),
                  "vk_login": bool(_oauth_conf("vk")),
                  "mailru_login": bool(_oauth_conf("mailru")),
                  "pay_online": bool(config.pay_provider())})


async def me(request: web.Request) -> web.Response:
    user = await _session_user(request)
    if not user:
        return _err("unauthorized", 401)
    orders = await db.orders_by_user(user["id"], limit=50)
    unread = await db.unread_for_orders([o["id"] for o in orders])
    pending_sub = await db.sub_pending_for_user(user["id"])
    # живой, но не потраченный промокод клиента — кабинет мягко напомнит
    promo_hint = None
    p = await db.promo_unused_for_user(user["id"])
    if p is not None:
        promo_hint = {"code": p["code"], "label": promo_svc.label(p)}
    receipt_labels = {
        "order": "Заказ",
        "subscription": "Подписка «Салон+»",
        "gift": "Подарочный сертификат",
        "deposit": "Пополнение депозита",
        "tip": "Благодарность мастерской",
    }
    payment_confirmations = [{
        "id": r["id"],
        "scope": r["scope"],
        "label": receipt_labels.get(r["scope"], "Оплата"),
        "reference": r["scope_id"],
        "amount": r["amount"],
        "at": r["paid_at"],
        "provider": r["provider"],
        "url": f"/api/payment-confirmations/{r['id']}.pdf",
    } for r in await db.receipts_for_user(user["id"], limit=30)]
    return _json({"ok": True,
                  "promo_hint": promo_hint,
                  "user": {"id": user["id"], "name": user["first_name"] or "Гость",
                           "username": user["username"]},
                  "imp": _sess_imp(user),
                  "oauth": [r["provider"] for r in await db.oauth_links_for_user(user["id"])],
                  "features": {"vk_login": bool(_oauth_conf("vk")),
                               "mailru_login": bool(_oauth_conf("mailru"))},
                  "orders_count": len(orders), "unread": sum(unread.values()),
                  "bonus": await bonus.summary(user["id"]),
                  "deposit": await deposit.summary(user["id"]),
                  "sub": await subs.summary(user["id"]),
                  "sub_pending": (await _sub_pay_json(pending_sub)
                                  if pending_sub else None),
                  "payment_confirmations": payment_confirmations,
                  "milestones": [{"id": m["id"], "title": m["title"],
                                  "due": m["due_date"]}
                                 for m in await db.milestones_for(user["id"])],
                  "ref_link": f"{config.SITE_URL}/?ref={user['id']}",
                  "ref_link_tg": f"https://t.me/{config.BOT_USERNAME}?start=ref_{user['id']}"})


async def bonus_ledger(request: web.Request) -> web.Response:
    """Журнал бонусного счёта — для кабинета."""
    user = await _session_user(request)
    if not user:
        return _err("unauthorized", 401)
    rows = await db.bonus_rows(user["id"])
    items = [{
        "delta": r["delta"], "kind": r["kind"],
        "label": bonus.KIND_LABEL.get(r["kind"], r["kind"]),
        "note": r["note"], "at": r["created_at"], "expires_at": r["expires_at"],
        "left": (r["delta"] - r["consumed"]) if r["delta"] > 0 else None,
    } for r in rows]
    s = await bonus.summary(user["id"])
    return _json({"ok": True, "balance": s["balance"], "expiring": s["expiring"],
                  "items": items})


async def welcome_token(request: web.Request) -> web.Response:
    """Одноразовый токен для «Забрать 300 бонусов» из тура на сайте.

    Сам токен бонус не гарантирует: начисление происходит в боте, один раз
    на Telegram-аккаунт, после подтверждения знакомства с правилами.
    """
    if not _rate_ok(_ip(request), cost=2):
        return _err("rate_limit", 429)
    token = await db.welcome_token_create()
    return _json({"ok": True,
                  "amount": config.BONUS_WELCOME,
                  "link": f"https://t.me/{config.BOT_USERNAME}?start=welcome_{token}"})

# --------------------------------------------------------- подписка «Салон+»

async def plans_get(request: web.Request) -> web.Response:
    """Витрина планов и конструктора — сайт рисует из этих данных."""
    return _json({"ok": True,
                  "base_price": config.SUB_BASE_PRICE,
                  "periods": {k: {"days": v[0], "label": v[1], "k": v[2]}
                              for k, v in config.SUB_PERIODS.items()},
                  "features": [{"id": f[0], "label": f[1], "price": f[2], "hint": f[3]}
                               for f in config.SUB_FEATURES],
                  "discounts": {k: {"pct": v[0], "cap": v[1]}
                                for k, v in config.SUB_DISCOUNTS.items()},
                  "plans": [{
                      "id": p.id, "label": p.label, "tagline": p.tagline,
                      "month_price": p.month_price, "sem_price": p.sem_price,
                      "features": list(p.features), "once": p.once,
                      "period_days": p.period_days,
                  } for p in config.SUB_PLANS]})


async def _sub_pay_json(s) -> dict:
    """Платёжная карточка подписки для кабинета: сумма, реквизиты, состояние."""
    d = await subs.sub_json(s)
    if s["status"] == "pending":
        d["requisites"] = await db.setting_get("requisites")
        d["pay_online"] = bool(config.pay_provider())
    return d


async def subscribe(request: web.Request) -> web.Response:
    """Оформление подписки из кабинета — собственный платёжный контур.

    Никаких заказов-носителей: создаётся subscriptions(pending), клиент видит
    «платёж за подписку» (одна сумма, без этапов, без бонусов) и реквизиты.
    """
    if not _rate_ok(_ip(request), cost=2):
        return _err("rate_limit", 429)
    user = await _session_user(request)
    if not user:
        return _err("unauthorized", 401)
    if user["banned"]:
        return _err("forbidden", 403)
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    plan = str(b.get("plan") or "")[:20]
    period = str(b.get("period") or "month")[:10]
    features = [str(x)[:20] for x in (b.get("features") or [])][:20]
    spec = subs.compose(plan, features, period)
    if not spec:
        return _err("bad_plan")
    s = await subs.create_pending(user["id"], spec, via="сайт")
    bot: Bot = request.app["bot"]
    who = texts.user_link(user["id"], user["first_name"], user["username"])
    uid = user["id"]

    async def _alert_sub():
        await notify.notify_admins(
            bot,
            f"⭐ {who} оформил(а) подписку <b>{spec['label']}</b> "
            f"({spec['period_label']}, {config.fmt_money(spec['price'])} ₽) с сайта — "
            "ждёт оплату. Отметит перевод — придёт кнопка активации.",
            map_client=(uid, None) if uid > 0 else None)
        if uid > 0:
            await notify.notify_client(
                bot, uid,
                f"🧾 Подписка <b>{spec['label']}</b> ({spec['period_label']}) оформлена "
                f"на сайте — к оплате {config.fmt_money(spec['price'])} ₽ одним переводом. "
                "Реквизиты — в кабинете и здесь: /plus. Бонусы к подписке не применяются.")

    _bg(f"sub{s['id']} create", _alert_sub)
    return _json({"ok": True, "sub": await _sub_pay_json(s)})


async def _own_pending_sub(request: web.Request):
    """(user, sub, err): оформление подписки, принадлежащее сессии."""
    user = await _session_user(request)
    if not user:
        return None, None, _err("unauthorized", 401)
    s = await db.sub_get(int(request.match_info["id"]))
    if not s or s["user_id"] != user["id"] or s["order_id"]:
        return user, None, _err("not_found", 404)
    return user, s, None


async def sub_paid(request: web.Request) -> web.Response:
    """Клиент отметил «я оплатил подписку» — мастеру уходит кнопка активации."""
    user, s, err = await _own_pending_sub(request)
    if err:
        return err
    if s["status"] == "active":
        return _err("sub_active")
    if s["status"] != "pending":
        return _err("sub_state")
    if s["claimed_at"]:
        return _err("already_claimed")
    await subs.claim_paid(request.app["bot"], s, via="сайт")
    return _json({"ok": True, "sub": await _sub_pay_json(await db.sub_get(s["id"]))})


async def sub_autorenew(request: web.Request) -> web.Response:
    """Тумблер автопродления активной подписки владельцем.

    Автопродление = мы сами пришлём счёт при истечении; списание — только
    руками клиента (перевод или касса). Никаких рекуррентных списаний."""
    user = await _session_user(request)
    if not user:
        return _err("unauthorized", 401)
    sub_id = int(request.match_info["id"])
    s = await db.sub_get(sub_id)
    if not s or s["user_id"] != user["id"]:
        return _err("not_found", 404)
    if s["status"] != "active":
        return _err("sub_state")
    try:
        b = await request.json()
        on = bool(b.get("on"))
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    await db.sub_mark(sub_id, auto_renew=1 if on else 0)
    return _json({"ok": True, "auto_renew": on})


async def sub_unpaid(request: web.Request) -> web.Response:
    """Снять отметку «оплатил» с оформления подписки."""
    _user, s, err = await _own_pending_sub(request)
    if err:
        return err
    if s["status"] != "pending" or not s["claimed_at"]:
        return _err("nothing_claimed")
    await subs.unclaim(s)
    return _json({"ok": True, "sub": await _sub_pay_json(await db.sub_get(s["id"]))})


async def sub_cancel(request: web.Request) -> web.Response:
    """Отменить неоплаченное оформление подписки."""
    _user, s, err = await _own_pending_sub(request)
    if err:
        return err
    if not await subs.cancel_pending(request.app["bot"], s, by="client"):
        return _err("sub_state")
    bot: Bot = request.app["bot"]
    who = texts.user_link(s["user_id"], None)
    _bg(f"sub{s['id']} cancel",
        lambda: notify.notify_admins(
            bot, f"✖️ {who} отменил(а) оформление подписки "
                 f"«{subs.plan_label(s['plan'])}» ({config.fmt_money(s['price'])} ₽) до оплаты.",
            map_client=(s["user_id"], None) if s["user_id"] > 0 else None))
    return _json({"ok": True, "sub": None})


async def sub_pay(request: web.Request) -> web.Response:
    """Онлайн-оплата подписки (если провайдер подключён), иначе реквизиты."""
    _user, s, err = await _own_pending_sub(request)
    if err:
        return err
    if s["status"] != "pending":
        return _err("sub_state")
    prov = config.pay_provider()
    if not prov:
        return _json({"ok": True, "online": False,
                      "requisites": await db.setting_get("requisites"),
                      "amount": s["price"]})
    if prov == "robokassa":
        url = await payments.robo_create_link_sub(s)
        if not url:
            return _err("pay_failed", 502)
        return _json({"ok": True, "online": True, "url": url, "amount": s["price"]})
    ret = f"{config.SITE_URL}/dashboard.html#plus"
    res = await payments.yk_create_payment_sub(s, ret)
    if not res:
        return _err("pay_failed", 502)
    return _json({"ok": True, "online": True, "url": res["url"], "amount": s["price"]})


# ------------------------------------------------- подарочные сертификаты

async def gift_config(request: web.Request) -> web.Response:
    """Витрина сертификатов: номиналы и правила — сайт рисует из этих данных."""
    return _json({"ok": True,
                  "presets": list(gift_svc.PRESETS),
                  "min": gift_svc.MIN_AMOUNT, "max": gift_svc.MAX_AMOUNT,
                  "ttl_days": gift_svc.TTL_DAYS,
                  "deliver_max_days": gift_svc.DELIVER_MAX_DAYS,
                  "pay_online": bool(config.pay_provider())})


async def gift_create(request: web.Request) -> web.Response:
    """Оформление покупки сертификата: гость или вошедший.

    Гостю нужна почта (иначе некуда доставить код), вошедшему хватит
    Telegram. Код НЕ раскрывается до подтверждения оплаты.
    """
    ip = _ip(request)
    if not _rate_ok(ip, cost=3):
        return _err("rate_limit", 429)
    try:
        b = await request.json()
        assert isinstance(b, dict)
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    if (b.get("website") or "").strip():  # honeypot
        return _json({"ok": True, "id": 0})
    user = await _session_user(request)
    if user and user["banned"]:
        return _err("forbidden", 403)
    try:
        amount = int(b.get("amount") or 0)
    except (TypeError, ValueError):
        return _err("bad_amount")
    amount = (amount // 100) * 100  # круглые суммы, без копеечных махинаций
    if not gift_svc.amount_ok(amount):
        return _err("bad_amount")
    buyer_name = str(b.get("buyer_name") or "")[:120].strip()
    buyer_contact = str(b.get("buyer_contact") or "")[:200].strip()
    if not buyer_contact and user and (user["email"] or ""):
        buyer_contact = user["email"]
    if buyer_contact and not mailer.looks_email(buyer_contact):
        return _err("bad_email")
    if not user and not buyer_contact:
        return _err("contact_required")
    recip_name = str(b.get("recip_name") or "")[:120].strip()
    recip_contact = str(b.get("recip_contact") or "")[:200].strip()
    if recip_contact and not mailer.looks_email(recip_contact):
        return _err("bad_recip_email")
    congrats = str(b.get("congrats") or "")[:280].strip()
    deliver_at = None
    raw_d = str(b.get("deliver_at") or "")[:10].strip()
    if raw_d and recip_contact:
        try:
            d = datetime.strptime(raw_d, "%Y-%m-%d").date()
        except ValueError:
            return _err("bad_date")
        today = datetime.now(config.MSK).date()
        if not (today <= d <= today + timedelta(days=gift_svc.DELIVER_MAX_DAYS)):
            return _err("bad_date")
        deliver_at = d.isoformat()
    if b.get("consent") is not True or b.get("privacy_notice_ack") is not True:
        return _err("consent_required")
    if b.get("consent_doc") != config.GIFT_CONSENT_DOC:
        return _err("consent_version_mismatch", 409)
    recipient_authority = b.get("recipient_data_authority") is True
    if recip_contact and not recipient_authority:
        return _err("recipient_data_authority_required")
    g = await gift_svc.create_pending(
        amount=amount, buyer_user_id=user["id"] if user else None,
        buyer_name=buyer_name, buyer_contact=buyer_contact,
        recip_name=recip_name, recip_contact=recip_contact,
        congrats=congrats, deliver_at=deliver_at, via="сайт",
        buyer_consent_at=db.now_iso(),
        buyer_consent_doc=config.GIFT_CONSENT_DOC,
        privacy_notice_ack=True,
        recipient_data_authority=recipient_authority)
    bot: Bot = request.app["bot"]
    who = buyer_name or buyer_contact or (
        texts.user_link(user["id"], user["first_name"], user["username"]) if user else "гость")

    async def _alert_gift_created():
        await notify.notify_admins(
            bot,
            f"🎁 {who} оформил(а) подарочный сертификат на "
            f"<b>{config.fmt_money(amount)} ₽</b> с сайта — ждёт оплату. "
            "Отметит перевод — придёт кнопка выпуска.")
        await mailer.gift_event(g, "created")

    _bg(f"gift{g['id']} create", _alert_gift_created)
    return _json({"ok": True, "gift": await gift_svc.buyer_json(g),
                  "buy_token": g["buy_token"]})


async def _own_gift(request: web.Request):
    """(gift, err): оформление, принадлежащее покупателю (buy_token или сессия)."""
    raw_id = request.match_info.get("id") or request.query.get("id", "")
    try:
        gift_id = int(raw_id)
    except (TypeError, ValueError):
        return None, _err("not_found", 404)
    g = await db.gift_get(gift_id)
    if not g:
        return None, _err("not_found", 404)
    token = request.query.get("t", "")
    if not token:
        try:
            body = await request.json()
            token = str(body.get("t") or body.get("buy_token") or "")
        except Exception:  # noqa: BLE001
            token = ""
    if token and g["buy_token"] and secrets.compare_digest(g["buy_token"], token):
        return g, None
    user = await _session_user(request)
    if user and (g["buyer_user_id"] == user["id"] or user["id"] in config.ADMIN_IDS):
        return g, None
    return None, _err("not_found", 404)


async def gift_state(request: web.Request) -> web.Response:
    """Карточка оформления для покупателя (после оплаты — с кодом)."""
    g, err = await _own_gift(request)
    if err:
        return err
    return _json({"ok": True, "gift": await gift_svc.buyer_json(g)})


async def gift_paid(request: web.Request) -> web.Response:
    """Покупатель отметил «я оплатил» — мастеру уходит кнопка выпуска."""
    g, err = await _own_gift(request)
    if err:
        return err
    if g["status"] != "pending":
        return _err("gift_state")
    if g["claimed_at"]:
        return _err("already_claimed")
    await gift_svc.claim_paid(request.app["bot"], g, via="сайт")
    return _json({"ok": True, "gift": await gift_svc.buyer_json(await db.gift_get(g["id"]))})


async def gift_unpaid(request: web.Request) -> web.Response:
    g, err = await _own_gift(request)
    if err:
        return err
    if g["status"] != "pending" or not g["claimed_at"]:
        return _err("nothing_claimed")
    await gift_svc.unclaim(g)
    return _json({"ok": True, "gift": await gift_svc.buyer_json(await db.gift_get(g["id"]))})


async def gift_cancel(request: web.Request) -> web.Response:
    g, err = await _own_gift(request)
    if err:
        return err
    if not await gift_svc.cancel_pending(request.app["bot"], g, by="client"):
        return _err("gift_state")
    bot: Bot = request.app["bot"]
    _bg(f"gift{g['id']} cancel",
        lambda: notify.notify_admins(
            bot, f"✖️ Оформление сертификата на {config.fmt_money(g['amount'])} ₽ "
                 f"отменено покупателем до оплаты."))
    return _json({"ok": True, "gift": None})


async def gift_pay(request: web.Request) -> web.Response:
    """Онлайн-оплата сертификата (если провайдер подключён), иначе реквизиты."""
    g, err = await _own_gift(request)
    if err:
        return err
    if g["status"] != "pending":
        return _err("gift_state")
    prov = config.pay_provider()
    if not prov:
        return _json({"ok": True, "online": False,
                      "requisites": await db.setting_get("requisites"),
                      "amount": g["amount"]})
    if prov == "robokassa":
        url = await payments.robo_create_link_gift(g)
        if not url:
            return _err("pay_failed", 502)
        return _json({"ok": True, "online": True, "url": url, "amount": g["amount"]})
    return _err("pay_failed", 502)


def _gift_rate_ok(ip: str) -> bool:
    """Отдельный бюджет проверок кодов — не выедает лимит заявок."""
    return _rate_ok("g:" + ip, cost=1)


async def gift_check(request: web.Request) -> web.Response:
    """Проверка кода для конфигуратора/кабинета: остаток и срок."""
    if not _gift_rate_ok(_ip(request)):
        return _err("rate_limited", 429)
    code = str(request.query.get("code") or "").strip().upper()[:24]
    if not code:
        return _err("empty")
    g, err, bal = await gift_svc.check(code)
    if err:
        return _err(err)
    return _json({"ok": True, "code": g["code"], "balance": bal,
                  "amount": g["amount"], "expires_ru": gift_svc.ru_date(g["expires_at"])})


async def gift_view(request: web.Request) -> web.Response:
    """Полная витрина сертификата для страницы-предъявителя (по коду)."""
    if not _gift_rate_ok(_ip(request)):
        return _err("rate_limited", 429)
    code = str(request.query.get("code") or "").strip().upper()[:24]
    g = await db.gift_by_code(code)
    if not g or g["status"] == "pending" or g["status"] == "canceled":
        return _err("not_found", 404)
    return _json({"ok": True, "gift": await gift_svc.public_json(g, with_code=True)})


async def gift_pdf(request: web.Request) -> web.Response:
    """PDF-сертификат для печати и вложения к подарку."""
    if not _gift_rate_ok(_ip(request)):
        return _err("rate_limited", 429)
    code = str(request.query.get("code") or "").strip().upper()[:24]
    g = await db.gift_by_code(code)
    if not g or g["status"] in ("pending", "canceled"):
        return _err("not_found", 404)
    from .services import giftpdf
    try:
        data = await asyncio.to_thread(giftpdf.render, dict(g))
    except Exception:  # noqa: BLE001
        log.exception("gift pdf failed for %s", g["id"])
        return _err("pdf_failed", 500)
    return web.Response(
        body=data,
        headers={**CORS, "Content-Type": "application/pdf",
                 "Content-Disposition":
                     f'inline; filename="sertifikat-{g["code"]}.pdf"'})


# ------------------------------------- собранная заявка (ссылка мастера)
# Мастер собирает заявку в админке и отдаёт клиенту ОДНУ ссылку:
# zayavka.html#k=<code>. На странице человек ничего не вводит — смотрит
# условия и платит. До оплаты заказ НЕ ПРИНАДЛЕЖИТ НИКОМУ (user_id IS NULL):
# владельцем становится тот, чей платёж подтверждён. Так конструктивно
# исключён инцидент 21.07 — заявка, попавшая в чужой кабинет.

OFFER_TTL_DAYS = 14
_OFFER_MON = ["января", "февраля", "марта", "апреля", "мая", "июня",
              "июля", "августа", "сентября", "октября", "ноября", "декабря"]


def _offer_rate_ok(ip: str, cost: int = 1) -> bool:
    """Свой бюджет лимитов (приём gift_rate_ok): чтение и поллинг заявки
    не выедают бюджет формы заказа — иначе человек, читавший страницу
    три минуты, получал бы rate_limit ровно в момент нажатия «Оплатить»."""
    return _rate_ok("z:" + ip, cost=cost)


def _ru_day(iso: str | None) -> str:
    if not iso:
        return ""
    try:
        d = datetime.strptime(str(iso)[:10], "%Y-%m-%d")
    except ValueError:
        return ""
    return f"{d.day} {_OFFER_MON[d.month - 1]}"


def _offer_inv(url: str | None) -> int:
    """InvId (= payments.id) из платёжной ссылки Robokassa; 0 — иной провайдер."""
    if not url:
        return 0
    try:
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        return int(q.get("InvId", ["0"])[0])
    except (TypeError, ValueError):
        return 0


async def _offer_link(off, o, kind: str, amount: int, nonce: str = "",
                      prev_nonce: str = "") -> tuple[str | None, str]:
    """(ссылка на кассу, действующий nonce): живой кэш либо новая ссылка.

    Кэш нужен потому, что robo_create_link безусловно создаёт строку
    payments — без кэша каждое нажатие плодило бы pending. Но кэш опасен:
    (а) если мастер тем временем подтвердил оплату руками, confirm закроет
    ИМЕННО ту строку, чей InvId зашит в открытую кассу, — отдаём кэш только
    при живом pending; (б) счёт Robokassa живёт ROBO_LINK_TTL_DAYS — старее
    гасим и выписываем свежий; (в) СЧЁТ ПРИНАДЛЕЖИТ ПЕРВОМУ НАЖАВШЕМУ:
    его nonce привязан к InvId, и вернуть кэш можно только предъявителю
    того же nonce (prev_nonce). Иначе повторный клик САМОГО плательщика
    выдавал бы ему новый nonce при чужом (первом) на строке — и после
    оплаты человек оставался без ключа от дела (поймано живым прогоном
    2026-07-22). Чужому кликеру выписывается СВОЙ счёт: близнецов после
    оплаты гасит payments.confirm.
    """
    if off["pay_url"] and off["pay_kind"] == kind and off["pay_amount"] == amount:
        inv = off["pay_inv"] or 0
        if inv:
            row = await db.payment_get(inv)
            if row and row["order_id"] == o["id"] and row["status"] == "pending":
                edge = (datetime.now(timezone.utc)
                        - timedelta(days=payments.ROBO_LINK_TTL_DAYS)
                        ).strftime("%Y-%m-%dT%H:%M:%S")
                if (row["created_at"] or "") <= edge:
                    await db.payment_set_status(row["id"], "canceled")
                elif not (row["nonce"] or ""):
                    # счёт ещё ничей (создан до привязок) — теперь его
                    # владелец определяется этим нажатием
                    await db.payment_bind_nonce(row["id"], nonce)
                    return off["pay_url"], nonce
                elif prev_nonce and secrets.compare_digest(row["nonce"], prev_nonce):
                    # тот же человек нажал ещё раз — счёт и пропуск его
                    return off["pay_url"], prev_nonce
                # иначе: счёт занят другим предъявителем — падаем в выпуск
                # нового InvId для текущего кликера
        else:
            # провайдер без InvId (ЮKassa): держим кэш недолго и по суммам
            edge = (datetime.now(timezone.utc)
                    - timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%S")
            if (off["pay_at"] or "") > edge:
                return off["pay_url"], nonce
    # Код заявки едет на кассу отдельным Shp_k: SuccessURL у Robokassa
    # один на магазин, и посадочная oplaceno.html по этому ключу
    # возвращает человека ровно на его заявку, а не в общий кабинет.
    url = await payments.online_link_for_order(o, kind, amount,
                                              {"k": off["code"]})
    if url:
        await db.offer_update(off["id"], pay_url=url, pay_kind=kind,
                              pay_amount=amount, pay_inv=_offer_inv(url),
                              pay_at=db.now_iso())
    # Ключ предъявителя привязываем к конкретному InvId: снимок в
    # offer_mark_paid берётся с оплаченной строки, поэтому чужие
    # нажатия (новый InvId) на плательщика уже не влияют.
    inv = _offer_inv(url)
    if inv and nonce:
        await db.payment_bind_nonce(inv, nonce)
    return url, nonce


def _reqs_apply(o) -> bool:
    """Производит ли заказ оформление по ГОСТ и оригинальность.
    Да — у работы с нуля и у двух услуг про оформление; нет — у остальных."""
    wt = o["work_type"] or ""
    if wt not in config.SVC_BY_ID:
        return True  # работа с нуля
    return wt in ("svc_norm", "svc_defense_pack")


async def _offer_public(off, o, *, with_token: bool = False) -> dict:
    """Витрина заявки. Не отдаёт ни user_id, ни контакты, ни заметки мастера.
    Токен доступа к делу — только по явному with_token (см. offer_state)."""
    pays = await db.payments_for_order(o["id"])
    plan = payments.plan_state(o, pays)          # созревание + факт оплат
    kind, amount = payments.due_now(o, pays)     # claimed сюда не попадает
    due = payments.money_due(o)
    stale = bool(off["expires_at"] and off["expires_at"] < db.now_iso())
    awaiting = any(p["status"] == "claimed" for p in pays)

    paid_kinds = {p["kind"] for p in pays if p["status"] == "paid"}
    amounts = {p["kind"]: p["amount"] for p in plan}
    first_due = next((p for p in plan if p["state"] == "due"), None)
    try:
        rail = json.loads(off["rail_json"] or "[]")
    except ValueError:
        rail = []
    for stop in rail:
        k = stop.get("pay") or ""
        stop["pay_amount"] = amounts.get(k, 0)
        stop["done"] = bool(k and k in paid_kinds)
        stop["now"] = bool(first_due and k == first_due["kind"])

    status = off["status"]
    if status == "live":
        status = "awaiting" if awaiting else ("expired" if stale else "live")

    def _j(raw):
        try:
            return json.loads(raw or "[]")
        except ValueError:
            return []

    specification = _json_dict(_row_get_w(off, "specification_json"))

    # смета мастера + виртуальные строки скидок: без них строки листа
    # не сходились бы с итогом due_total при сертификате/промокоде/бонусах
    ledger = _j(off["ledger_json"])
    for label, val in (("Промокод", due["promo_discount"]),
                       ("Скидка подписки «Салон+»", due["sub_discount"]),
                       ("Списано бонусами", due["bonus_spent"]),
                       ("Зачтено подарочным сертификатом", due["gift_amount"])):
        if val > 0:
            ledger.append({"t": label, "a": -val})

    j = {
        "no": o["id"], "version": off["version"] or 1, "status": status,
        "greet_name": off["greet_name"] or "", "intro": off["intro"] or "",
        "work_label": o["work_label"] or "", "topic": o["topic"] or "",
        "discipline": _DISC_LABEL.get(o["discipline"] or "", ""),
        "volume": off["volume"] or "",
        "tier_label": off["tier_label"] or _TIER_LABEL.get(o["tier"] or "", "") or "",
        "tier_full": off["tier_full"] or "",
        # Требования (ГОСТ/оригинальность) отдаём только там, где мы их правда
        # производим: работа с нуля, нормоконтроль, пакет «к защите». Иначе лист,
        # оплата которого = акцепт, обещал бы то, чего услуга не даёт (ст. 10 ЗоЗПП).
        "reqs_short": (off["reqs_short"] or "") if _reqs_apply(o) else "",
        "reqs_full": (off["reqs_full"] or "") if _reqs_apply(o) else "",
        # kind/svc: лист по услуге не должен говорить «до защиты» и «пришлите
        # методичку» — это язык работы с нуля. work_type услуги лежит в SVC_BY_ID.
        "kind": "service" if (o["work_type"] or "") in config.SVC_BY_ID else "work",
        "svc": (o["work_type"] or "") if (o["work_type"] or "") in config.SVC_BY_ID else "",
        "need_files": bool(off["need_files"]),
        "deadline_ru": _ru_day(o["deadline_date"]) or (o["deadline_text"] or ""),
        "incl": _j(off["incl_json"]), "ledger": ledger, "rail": rail,
        "plan": [{"kind": p["kind"], "label": p["label"], "amount": p["amount"],
                  "state": p["state"], "n": p["n"]} for p in plan],
        "price": o["price"] or 0, "due_total": due["due_total"],
        "pay": ({"kind": kind, "amount": amount,
                 "label": payments.planned_label(o, kind, plan)} if amount > 0 else None),
        "pay_online": bool(config.pay_provider()),
        # оценка кэшбэка для экрана «оплачено»: 5% от денежной части после
        # ПОЛНОЙ оплаты (правила лояльности §2.1) — лист обещает ровно то,
        # что начислит bonus.on_payment, и только работам (не подпискам)
        "cashback_est": int(due["due_total"] * config.BONUS_CASHBACK_PCT // 100),
        "created_ru": _ru_day(off["created_at"]),
        "expires_ru": _ru_day(off["expires_at"]),
        "doc": config.DOC_EDITIONS,
        "contacts": {"tg": config.CONTACT_TG, "vk": config.CONTACT_VK,
                     "email": config.CONTACT_EMAIL},
    }
    if specification:
        j["specification"] = specification
        j["specification_lines"] = specification.get("lines") or []
        j["items"] = specification.get("lines") or []
        j["specification_meta"] = {
            "id": specification.get("spec_id"),
            "revision": _row_get_w(off, "specification_revision")
                        or specification.get("revision") or off["version"] or 1,
            "schema": _row_get_w(off, "specification_schema") or "2.0",
            "data_sha256": _row_get_w(off, "specification_hash") or "",
            "pdf_sha256": _row_get_w(off, "specification_pdf_hash") or "",
            "pdf_size": _row_get_w(off, "specification_pdf_size") or 0,
            "pdf_url": f"{config.SITE_URL}/api/offer/{off['code']}/specification.pdf",
        }
    if awaiting:
        j["requisites"] = await db.setting_get("requisites") or ""
    if off["replaced_by"]:
        rep = await db.offer_get(off["replaced_by"])
        j["replaced_code"] = rep["code"] if rep else ""
    if with_token:
        tok = o["access_token"] or await db.ensure_access_token(o["id"])
        j["access_token"] = tok
        j["claim_url"] = f"{config.SITE_URL}/dashboard.html#claim={tok}"
    return j


async def _offer_pair(request: web.Request):
    """(offer, order) по коду из адреса; (None, None) — «не найдено»."""
    code = str(request.match_info.get("code") or "")[:64]
    if not code:
        return None, None
    off = await db.offer_by_code(code)
    if not off:
        return None, None
    o = await db.get_order(off["order_id"])
    # корзина обязана прятать дело и здесь: у orders_by_tokens такого фильтра
    # нет (db.py:1207) — ставим его явно, как в orders_by_user после 21.07
    if not o or (o["deleted"] or 0):
        return None, None
    return off, o


async def offer_view(request: web.Request) -> web.Response:
    """Публичное чтение собранной заявки. Токена дела не отдаёт никогда."""
    if not _offer_rate_ok(_ip(request), cost=1):
        return _err("rate_limit", 429)
    off, o = await _offer_pair(request)
    if not off:
        return _err("not_found", 404)
    await db.offer_touch(off["id"])
    return _json({"ok": True, "offer": await _offer_public(off, o)})


async def offer_state(request: web.Request) -> web.Response:
    """Поллинг состояния. Счётчик открытий НЕ трогает.

    Здесь и только здесь отдаётся ключ от дела — при двух условиях сразу:
    заявка оплачена И предъявлен одноразовый nonce, выданный тому, кто
    нажал «Оплатить». Пересланная ссылка без nonce не даёт доступа к делу
    ни до оплаты, ни после.
    """
    if not _offer_rate_ok(_ip(request), cost=1):
        return _err("rate_limit", 429)
    off, o = await _offer_pair(request)
    if not off:
        return _err("not_found", 404)
    n = str(request.query.get("n") or "")[:80]
    # Сверяем со СНИМКОМ на момент оплаты, а не с текущим значением.
    # Текущий pay_nonce меняется при каждом нажатии «Оплатить», и раньше
    # он же служил пропуском: человек, которому переслали ссылку, нажимал
    # кнопку, получал валидный nonce и после чужой оплаты забирал ключ
    # от дела. Снимок принадлежит тому, чей платёж подтвердился.
    # coalesce на пустое: у заявок, оплаченных до этой правки, снимка нет —
    # для них остаётся прежняя проверка, иначе они потеряли бы доступ.
    ref = (off["paid_nonce"] or "") or (off["pay_nonce"] or "")
    ok_nonce = bool(n and ref and secrets.compare_digest(ref, n))
    show = off["status"] == "paid" and ok_nonce
    return _json({"ok": True, "offer": await _offer_public(off, o, with_token=show)})


async def offer_specification_pdf(request: web.Request) -> web.Response:
    """Точные сохранённые байты PDF, которые показаны по этой редакции ссылки."""
    if not _offer_rate_ok(_ip(request), cost=1):
        return _err("rate_limit", 429)
    off, _o = await _offer_pair(request)
    if not off:
        return _err("not_found", 404)
    payload = _row_get_w(off, "specification_pdf")
    if not payload:
        return _err("specification_unavailable", 404)
    revision = int(_row_get_w(off, "specification_revision") or off["version"] or 1)
    return web.Response(body=bytes(payload), content_type="application/pdf", headers={
        **CORS,
        "Content-Disposition":
            f'inline; filename="specifikaciya-{off["order_id"]}-r{revision}.pdf"',
        "Cache-Control": "private, no-store",
        "X-Specification-Revision": str(revision),
        "X-Specification-Data-SHA256":
            str(_row_get_w(off, "specification_hash") or ""),
        "X-Specification-PDF-SHA256":
            str(_row_get_w(off, "specification_pdf_hash") or ""),
    })


async def offer_pay(request: web.Request) -> web.Response:
    """Начать оплату: ссылка на кассу либо реквизиты + отметка мастеру."""
    if not _offer_rate_ok(_ip(request), cost=2):
        return _err("rate_limit", 429)
    off, o = await _offer_pair(request)
    if not off:
        return _err("not_found", 404)

    # ЗАЩИТА ОТ ИНЦИДЕНТА 21.07: плательщиком может стать только клиент,
    # пришедший по ссылке. Мастер — ни из своей сессии, ни из «тихого» входа.
    user = await _session_user(request)
    if user and (user["id"] in config.ADMIN_IDS or _sess_imp(user)):
        return _err("admin_session", 409)

    if off["status"] == "paid":
        return _err("already_paid", 409)
    if off["status"] == "replaced":
        return _err("replaced", 409)
    if off["status"] != "live":
        return _err("canceled", 409)
    if off["expires_at"] and off["expires_at"] < db.now_iso():
        return _err("expired", 410)
    if o["user_id"]:                       # у дела появился хозяин — ссылка мертва
        return _err("order_has_owner", 409)
    if o["status"] not in ("priced", "prepay", "work", "check", "fix"):
        return _err("pay_stage", 409)

    pays = await db.payments_for_order(o["id"])
    if any(p["status"] == "claimed" for p in pays):
        return _err("already_claimed", 409)
    kind, amount = payments.due_now(o, pays)
    if amount <= 0:
        return _err("nothing_due", 409)

    # Ротируем на КАЖДОЕ нажатие: удерживать чужой валидный пропуск нельзя.
    # Оплативший от этого не страдает — его пропуск снимается в paid_nonce
    # в момент подтверждения денег и дальше не зависит от чужих нажатий.
    nonce = secrets.token_urlsafe(18)
    bot: Bot = request.app["bot"]

    # Контакт принимаем ТОЛЬКО здесь, отдельной неаутентифицированной ручки нет.
    # Разбор тела стоит ДО развилки провайдера: человек, платящий переводом,
    # оставляет почту с тем же правом, что и платящий картой.
    # Перезаписать чужой контакт можно, лишь предъявив текущий pay_nonce.
    try:
        _b = await request.json()
    except Exception:  # noqa: BLE001
        _b = {}
    _to = str((_b or {}).get("notify_to") or "").strip()[:120]
    if _to and len(_to) >= 5:
        _n = str((_b or {}).get("n") or "")[:80]
        _ok = bool(_n and off["pay_nonce"]
                   and secrets.compare_digest(off["pay_nonce"], _n))
        _fresh = not (off["notify_to"] or "").strip()
        if _fresh or _ok:
            await db.offer_update(off["id"], notify_to=_to)
            await db.add_event(o["id"], "offer_notify_to", _to[:60])
    # версия статики листа — в доказательную базу акцепта (что именно видел
    # плательщик; юр-тексты страницы меняются только с бампом версии)
    _pv = str((_b or {}).get("pv") or "").strip()[:24]
    if _pv:
        await db.offer_update(off["id"], page_ver=_pv)

    if not config.pay_provider():
        # Ручной путь в два осознанных шага. Раньше первый же клик «Оплатить»
        # ставил claimed: случайное нажатие замораживало заявку в «ждём
        # перевод» без пути назад, а мастера звали сверять несуществующие
        # деньги. Теперь: шаг 1 — показать реквизиты, шаг 2 — «Я перевёл(а)».
        if not (_b or {}).get("claim"):
            await db.offer_update(off["id"], pay_nonce=nonce)
            return _json({"ok": True, "online": False, "claimed": False,
                          "nonce": nonce,
                          "requisites": await db.setting_get("requisites") or "",
                          "kind": kind, "amount": amount})
        # ключ предъявителя: если клиент показал текущий pay_nonce (тот, под
        # которым смотрел реквизиты) — оставляем его, иначе выдаём новый
        prev_n = str((_b or {}).get("n") or "")[:80]
        if prev_n and off["pay_nonce"] \
                and secrets.compare_digest(off["pay_nonce"], prev_n):
            nonce = prev_n
        row = next((p for p in pays if p["kind"] == kind and p["status"] == "pending"), None)
        if row:
            await db.payment_set_status(row["id"], "claimed")
            rid = row["id"]
        else:
            rid = await db.payment_create(o["id"], kind, amount)
            await db.payment_set_status(rid, "claimed")
        # снимок paid_nonce при подтверждении берётся со строки платежа —
        # привязываем и в ручном пути, как в онлайновом (offer_mark_paid)
        await db.payment_bind_nonce(rid, nonce)
        await db.offer_update(off["id"], pay_nonce=nonce)
        await db.add_event(o["id"], "payment_marked", "собранная заявка · перевод")
        alert = (f"💳 По собранной заявке {config.order_no(o['id'])} клиент отметил "
                 f"перевод ({config.fmt_money(amount)} ₽) — сверьте поступление.")
        _bg(f"offer{off['id']} claim",
            _mk_alert(bot, o["id"], alert, reply_markup=kb.claim_check_kb(o, amount)))
        return _json({"ok": True, "online": False, "claimed": True, "nonce": nonce,
                      "requisites": await db.setting_get("requisites") or "",
                      "kind": kind, "amount": amount})

    _prev = str((_b or {}).get("n") or "")[:80]
    url, use_nonce = await _offer_link(off, o, kind, amount,
                                       nonce=nonce, prev_nonce=_prev)
    if not url:
        return _err("pay_failed", 502)
    await db.offer_update(off["id"], pay_nonce=use_nonce)
    await db.add_event(o["id"], "offer_pay_open",
                       f"{payments.stage_label(o, kind)} · {amount} ₽")
    return _json({"ok": True, "online": True, "url": url, "nonce": use_nonce,
                  "kind": kind, "amount": amount})


# ------------------------------------- админ: заведение дела и сборка заявки

async def admin_order_create(request: web.Request) -> web.Response:
    """Завести дело руками мастера — БЕЗ владельца (user_id остаётся пустым).

    Это вход для главного сценария: человек из мессенджера, которого на сайте
    никогда не было. Уведомлений не уходит: адресата ещё не существует.
    guest_contact НЕ ЗАПОЛНЯЕТСЯ намеренно — почта в этом поле включила бы
    письма (mailer.order_recipient, mailer.py:358) до всякого акцепта.
    """
    user = await _admin_user(request)
    if not user:
        return _err("forbidden", 403)
    if _sess_imp(user):
        return _err("impersonation_readonly", 403)
    try:
        b = await request.json()
        assert isinstance(b, dict)
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    type_id = str(b.get("type") or "")[:30]
    t = config.TYPE_BY_ID.get(type_id)
    svc = config.SVC_BY_ID.get(type_id)
    if t:
        work_label = t.label
    elif svc:
        work_label = svc.label
    else:
        type_id, work_label = "custom", "Индивидуальная задача"
    topic = str(b.get("topic") or "")[:400].strip()
    if not topic:
        return _err("topic_required")
    order_id = await db.create_order(
        user_id=None,                       # ВЛАДЕЛЬЦА НЕТ — назначит платёж
        work_type=type_id, work_label=work_label,
        discipline=str(b.get("disc") or "")[:10] or None,
        term=str(b.get("term") or "")[:10] or None,
        tier=str(b.get("tier") or "")[:10] or None,
        topic=topic,
        details=str(b.get("details") or "")[:1500].strip() or None,
        deadline_text=str(b.get("deadline") or "")[:120].strip() or None,
        deadline_date=str(b.get("deadline_date") or "")[:10] or None,
        source="ссылка", access_token=secrets.token_urlsafe(24),
        guest_name=str(b.get("name") or "")[:120].strip() or None,
    )
    await db.add_event(order_id, "admin_created", "дело заведено мастером под ссылку")
    o = await db.get_order(order_id)
    return _json({"ok": True, "id": order_id, "order": await _order_full_json(o)})


async def admin_offer_create(request: web.Request) -> web.Response:
    """Собрать заявку и получить ссылку. Никому ничего не отправляет.

    Цена ставится ЗДЕСЬ, а не через flow.set_price: та безусловно шлёт письмо
    «цена предложена» (flow.py, mailer.order_event(fresh, "priced")), а у
    собранной заявки адресата до акцепта быть не должно.
    """
    user = await _admin_user(request)
    if not user:
        return _err("forbidden", 403)
    if _sess_imp(user):     # _admin_user «тихий вход» не отсекает (webapp.py:2117)
        return _err("impersonation_readonly", 403)
    try:
        b = await request.json()
        order_id = int(b.get("order_id"))
    except Exception:  # noqa: BLE001
        return _err("bad_order")
    o = await db.get_order(order_id)
    if not o or (o["deleted"] or 0):
        return _err("not_found", 404)
    # НА ЧУЖОЕ ДЕЛО ЗАЯВКА НЕ ВЫПИСЫВАЕТСЯ — конструктивная защита от 21.07
    if o["user_id"]:
        return _err("order_has_owner", 409)
    pays = await db.payments_for_order(order_id)
    if any(p["status"] == "paid" for p in pays):
        return _err("already_paid", 409)
    if any(p["status"] == "claimed" for p in pays):
        # клиент отметил перевод: пересборка «замораживала» новую редакцию
        # в вечном «ждём подтверждения» — сперва сверьте или снимите отметку
        return _err("claimed_pending", 409)

    try:
        price = int(b.get("price") or o["price"] or 0)
    except (TypeError, ValueError):
        price = 0
    if price <= 0:
        return _err("bad_price")
    try:
        stages = int(b.get("stages") or 0)
    except (TypeError, ValueError):
        stages = 0
    if stages not in (1, 2, 3):
        stages = o["stages_total"] or payments.default_stages(o["work_type"])
    try:
        prepay = int(b.get("prepay") or 0)
    except (TypeError, ValueError):
        prepay = 0
    prepay = min(prepay or payments.default_prepay(price, stages), price)
    # Срок работы — то, ради чего человек и читает страницу. Без него блок
    # даты печатал «Работа у вас на руках к .» (поймано на первом же прогоне).
    dl_text = str(b.get("deadline_text") or "")[:120].strip()
    dl_date = str(b.get("deadline_date") or "")[:10].strip()
    await db.update_order(order_id, price=price, prepay=prepay, stages_total=stages,
                          stage=o["stage"] or 1,
                          deadline_text=dl_text or (o["deadline_text"] or ""),
                          deadline_date=dl_date or (o["deadline_date"] or ""))
    if o["status"] in ("new", "priced"):
        # оплата возможна только из priced/prepay/work/check/fix (order_pay)
        await db.set_status(order_id, "priced", f"{price} ₽ · собранная заявка")
    # цена мимо flow.set_price обязана повторить его пересчёты: промокод заявки
    # и зачёт сертификата — иначе лист выставлял бы полную цену, а привязанный
    # к делу сертификат молча сгорал без зачёта (переплата клиента)
    await promo_svc.apply(order_id)
    await gift_svc.sync_order(request.app["bot"], order_id)
    await db.ensure_access_token(order_id)

    old = await db.offer_by_order(order_id)
    version = (old["version"] + 1) if old else 1
    try:
        days = int(b.get("ttl_days") or OFFER_TTL_DAYS)
    except (TypeError, ValueError):
        days = OFFER_TTL_DAYS
    days = max(1, min(days, 60))
    expires = (datetime.now(timezone.utc)
               + timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%S")
    code = secrets.token_urlsafe(18)
    spec_created_at = db.now_iso()
    spec_revision = await db.specification_next_revision(order_id)
    raw_spec = b.get("specification") if isinstance(b.get("specification"), dict) else {}
    if isinstance(b.get("specification_lines"), list):
        raw_spec = {**raw_spec, "lines": b["specification_lines"]}
    elif not isinstance(raw_spec.get("lines"), list):
        # Совместимость с прежней формой мастера: ledger становится строками
        # v2, но всё равно проходит ту же строгую нормализацию.
        raw_spec = {**raw_spec, "lines": b.get("ledger") or []}
    o_for_spec = await db.get_order(order_id)
    order_items = await db.items_for_order(order_id)
    try:
        spec = contract.specification_from_payload(
            o_for_spec, order_items, raw_spec, revision=spec_revision,
            created_at=spec_created_at, strict=True,
        )
        spec_json = contract.canonical_json(spec)
        spec_hash = contract.canonical_hash(spec)
        spec_pdf = await contract.build_pdf(o_for_spec, spec)
        if not spec_pdf:
            return _err("specification_pdf_unavailable", 503)
        spec_pdf_hash = hashlib.sha256(spec_pdf).hexdigest()
        snapshot_id = await db.specification_create(
            order_id, spec_json, spec_pdf, source="offer",
            revision=spec_revision, schema_version="2.0",
            specification_hash=spec_hash, pdf_hash=spec_pdf_hash,
            created_at=spec_created_at,
        )
    except ValueError as exc:
        return _json({"ok": False, "error": "bad_specification",
                      "detail": str(exc)[:160]}, 400)
    oid = await db.offer_create(
        code=code, order_id=order_id, version=version,
        greet_name=str(b.get("greet_name") or "")[:60].strip() or None,
        intro=str(b.get("intro") or "")[:400].strip() or None,
        volume=str(b.get("volume") or "")[:120].strip() or None,
        reqs_short=str(b.get("reqs_short") or "")[:200].strip() or None,
        reqs_full=str(b.get("reqs_full") or "")[:2000].strip() or None,
        tier_label=str(b.get("tier_label") or "")[:120].strip() or None,
        tier_full=str(b.get("tier_full") or "")[:2000].strip() or None,
        need_files=1 if b.get("need_files") else 0,
        incl_json=json.dumps(b.get("incl") or [], ensure_ascii=False),
        ledger_json=json.dumps(b.get("ledger") or [], ensure_ascii=False),
        rail_json=json.dumps(b.get("rail") or [], ensure_ascii=False),
        specification_json=spec_json,
        specification_hash=spec_hash,
        specification_pdf=spec_pdf,
        specification_pdf_hash=spec_pdf_hash,
        specification_pdf_size=len(spec_pdf),
        specification_revision=spec_revision,
        specification_schema="2.0",
        specification_created_at=spec_created_at,
        specification_snapshot_id=snapshot_id,
        expires_at=expires, status="live", created_by=user["id"],
        created_at=spec_created_at)
    if old and old["status"] == "live":
        # молча переписывать открытую ссылку нельзя: человек мог видеть одну
        # цену, а нажать на другую — старая редакция честно уводит на новую
        await db.offer_update(old["id"], status="replaced", replaced_by=oid)
        # Старые pending-счета устаревшей цены оплачивать больше нельзя
        # (у Robokassa истекут по ExpirationDate, у нас — сразу).
        await db.payments_cancel_pending(order_id)
    await db.add_event(order_id, "offer_built",
                       f"ред. {version} · {price} ₽ · {days} дн.")
    o = await db.get_order(order_id)
    return _json({"ok": True, "id": oid, "code": code, "version": version,
                  "url": f"{config.SITE_URL}/zayavka.html#k={code}",
                  "expires_ru": _ru_day(expires),
                  "specification": {
                      "id": spec["spec_id"], "revision": spec_revision,
                      "snapshot_id": snapshot_id,
                      "data_sha256": spec_hash, "pdf_sha256": spec_pdf_hash,
                      "pdf_size": len(spec_pdf),
                  },
                  "order": await _order_full_json(o)})


async def admin_offer_mail_on(request: web.Request) -> web.Response:
    """Включить клиенту полноценные письма (сообщения мастера, готовность, счёт).

    Копирует offers.notify_to в orders.guest_contact — и только отсюда, руками
    мастера. Автоматически этого делать нельзя: mailer подставляет в письма
    ссылку с access_token, поэтому подменённый на оплате адрес получил бы ключ
    от чужого дела. Мастер сверяет адрес с перепиской и берёт ответственность.
    """
    user = await _admin_user(request)
    if not user:
        return _err("forbidden", 403)
    if _sess_imp(user):
        return _err("impersonation_readonly", 403)
    try:
        oid = int(request.match_info["id"])
    except (KeyError, ValueError):
        return _err("bad_id")
    off = await db.offer_get(oid)
    if not off:
        return _err("not_found", 404)
    to = (off["notify_to"] or "").strip()
    if not to or "@" not in to:
        return _err("no_contact", 409)
    o = await db.get_order(off["order_id"])
    if not o:
        return _err("not_found", 404)
    await db.update_order(o["id"], guest_contact=to)
    await db.add_event(o["id"], "mail_enabled", "письма клиенту включены мастером")
    return _json({"ok": True, "contact": to})


async def admin_offer_cancel(request: web.Request) -> web.Response:
    user = await _admin_user(request)
    if not user:
        return _err("forbidden", 403)
    if _sess_imp(user):
        return _err("impersonation_readonly", 403)
    off = await db.offer_get(int(request.match_info["id"]))
    if not off:
        return _err("not_found", 404)
    if off["status"] == "paid":
        return _err("already_paid", 409)
    await db.offer_update(off["id"], status="canceled")
    await db.add_event(off["order_id"], "offer_canceled", "мастер отозвал ссылку")
    o = await db.get_order(off["order_id"])
    return _json({"ok": True, "order": await _order_full_json(o) if o else None})


async def milestones_post(request: web.Request) -> web.Response:
    """Куратор сессии: добавить сдачу из кабинета."""
    user = await _session_user(request)
    if not user:
        return _err("unauthorized", 401)
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    title = str(b.get("title") or "").strip()[:120]
    due = str(b.get("due") or "").strip()[:10]
    try:
        from datetime import date as _date
        _date.fromisoformat(due)
    except ValueError:
        return _err("bad_date")
    if not title:
        return _err("empty")
    feats = await subs.user_features(user["id"])
    limit = 50 if "curator" in feats else 1
    if len(await db.milestones_for(user["id"])) >= limit:
        return _err("milestone_limit")
    await db.milestone_add(user["id"], title, due)
    return _json({"ok": True, "milestones": [
        {"id": m["id"], "title": m["title"], "due": m["due_date"]}
        for m in await db.milestones_for(user["id"])]})


async def milestones_delete(request: web.Request) -> web.Response:
    user = await _session_user(request)
    if not user:
        return _err("unauthorized", 401)
    mid = int(request.match_info["id"])
    await db.milestone_del(user["id"], mid)
    return _json({"ok": True, "milestones": [
        {"id": m["id"], "title": m["title"], "due": m["due_date"]}
        for m in await db.milestones_for(user["id"])]})


# ------------------------------------------------------------------ заказы

def _request_fingerprint(body: dict) -> str:
    """Хеш существенной части заявки; транспортные/аналитические поля не входят."""
    cart = body.get("cart")
    cart_sig = None
    if isinstance(cart, dict):
        cart_sig = {
            "version": cart.get("version"),
            "items": [
                {k: row.get(k) for k in (
                    "client_id", "parent_client_id", "kind", "type", "qty",
                    "disc", "term", "tier", "topic", "deadline",
                    "requirements", "note", "answers", "requested_line_id",
                    "contract_contour", "permitted_purpose",
                    "legal_service_type", "service_id", "unit", "schedule",
                    "scope", "customer_inputs", "intellectual_rights_profile",
                    "actual_author_profile", "third_party_performers")}
                if isinstance(row, dict) else row
                for row in (cart.get("items") if isinstance(cart.get("items"), list) else [])
            ],
            "benefits_intent": cart.get("benefits_intent"),
        }
    material = {
        k: body.get(k) for k in (
            "type", "disc", "term", "tier", "topic", "plan", "deadline",
            "details", "promo", "gift")
    }
    material["cart"] = cart_sig
    raw = json.dumps(material, ensure_ascii=False, sort_keys=True,
                     separators=(",", ":"), default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _cart_items(raw) -> tuple[list[dict], int, int, list[str]]:
    """Проверить состав и пересчитать вилку; ни одна строка не теряется молча."""
    if not isinstance(raw, dict):
        return [], 0, 0, ["shape"]
    sources = raw.get("items")
    if not isinstance(sources, list):
        return [], 0, 0, ["items_shape"]
    errors: list[str] = []
    if not sources:
        return [], 0, 0, ["empty"]
    if len(sources) > 30:
        errors.append("too_many")
    out: list[dict] = []
    total_low = total_high = 0
    seen_client_ids: set[str] = set()

    def bounded(value, depth: int = 0):
        """JSON-safe копия договорных полей запроса с жёсткими границами."""
        if depth > 5:
            return None
        if value is None or isinstance(value, (bool, int, float)):
            return value
        if isinstance(value, str):
            return value[:2000]
        if isinstance(value, list):
            return [bounded(v, depth + 1) for v in value[:50]]
        if isinstance(value, dict):
            return {
                str(k)[:80]: bounded(v, depth + 1)
                for k, v in list(value.items())[:60]
            }
        return str(value)[:2000]

    request_fields = (
        "requested_line_id", "position", "selected_by_customer",
        "contract_contour", "contract_contour_pending", "permitted_purpose",
        "legal_service_type", "service_id", "unit", "unit_definition_pending",
        "schedule", "separability_pending", "scope", "customer_inputs",
        "deliverables_pending", "acceptance_criteria_pending",
        "corrections_pending", "intellectual_rights_profile",
        "intellectual_rights_profile_pending", "actual_author_profile",
        "actual_author_profile_pending", "third_party_performers",
        "third_party_performers_pending", "price_status", "quote_preview",
    )
    for index, src in enumerate(sources[:30], 1):
        if not isinstance(src, dict):
            errors.append(f"item_{index}_shape")
            continue
        if src.get("kind") not in ("work", "service"):
            errors.append(f"item_{index}_kind")
            continue
        kind = str(src["kind"])
        catalog_id = str(src.get("type") or "")[:30]
        try:
            qty = max(1, min(10, int(src.get("qty") or 1)))
        except (TypeError, ValueError):
            qty = 1
        disc = str(src.get("disc") or "hum")[:10]
        term = str(src.get("term") or "free")[:10]
        tier = str(src.get("tier") or "base")[:10]
        if kind == "work":
            item_type = config.TYPE_BY_ID.get(catalog_id)
            if not item_type:
                errors.append(f"item_{index}_catalog")
                continue
            label = item_type.label
            quote = config.quote(catalog_id, disc, term, tier)
            low, high = ((quote or (0, 0))[0] * qty, (quote or (0, 0))[1] * qty)
        else:
            service = config.SVC_BY_ID.get(catalog_id)
            if not service:
                errors.append(f"item_{index}_catalog")
                continue
            label = service.label
            if service.id != "svc_tutor":
                qty = 1
            low = high = service.from_price * qty
        if low <= 0:
            errors.append(f"item_{index}_quote")
            continue
        answers = src.get("answers") if isinstance(src.get("answers"), dict) else {}
        answers = {str(k)[:60]: str(v)[:500] for k, v in list(answers.items())[:20]}
        required_answers = {
            "svc_plan": ("work",),
            "svc_defense": ("when",),
            "svc_defense_pack": ("when",),
        }.get(catalog_id, ())
        missing_answers = [
            key for key in required_answers if not str(answers.get(key) or "").strip()
        ]
        if missing_answers:
            errors.append(f"item_{index}_answers")
            continue
        client_id = str(src.get("client_id") or "")[:100].strip()
        parent_client_id = str(src.get("parent_client_id") or "")[:100].strip()
        if not re.fullmatch(r"[A-Za-z0-9_.:-]{1,100}", client_id):
            errors.append(f"item_{index}_client_id")
            continue
        if client_id in seen_client_ids:
            errors.append(f"item_{index}_client_id_duplicate")
            continue
        seen_client_ids.add(client_id)
        if parent_client_id and not re.fullmatch(r"[A-Za-z0-9_.:-]{1,100}", parent_client_id):
            errors.append(f"item_{index}_parent")
            continue
        request_v2 = {key: bounded(src.get(key)) for key in request_fields if key in src}
        # Поля, которые сервер уже проверил/нормализовал, имеют приоритет над
        # присланными aliases. Так request_json остаётся самодостаточным и не
        # может расходиться с legacy-колонками строки.
        request_v2.update({
            "client_id": client_id,
            "requested_line_id": str(src.get("requested_line_id") or client_id)[:100],
            "position": index,
            "parent_client_id": parent_client_id or None,
            "kind": kind,
            "type": catalog_id,
            "label": label,
            "qty": qty,
            "disc": disc,
            "term": term,
            "tier": tier,
            "topic": str(src.get("topic") or "")[:400].strip(),
            "deadline": str(src.get("deadline") or "")[:120].strip(),
            "requirements": str(src.get("requirements") or "")[:1500].strip(),
            "note": str(src.get("note") or "")[:240].strip(),
            "answers": answers,
            "quote_preview": {"low": low, "high": high},
        })
        out.append({
            "client_id": client_id,
            "parent_client_id": parent_client_id or None,
            "kind": kind, "catalog_id": catalog_id, "label": label, "qty": qty,
            "config": {"disc": disc, "term": term, "tier": tier},
            "answers": answers,
            "topic": str(src.get("topic") or "")[:400].strip() or None,
            "deadline": str(src.get("deadline") or "")[:120].strip() or None,
            "requirements": str(src.get("requirements") or "")[:1500].strip() or None,
            "note": str(src.get("note") or "")[:240].strip() or None,
            "quote_low": low, "quote_high": high,
            "request": request_v2,
        })
        total_low += low
        total_high += high
    work_ids = {item["client_id"] for item in out if item["kind"] == "work"}
    only_work = next(iter(work_ids)) if len(work_ids) == 1 else None
    for item in out:
        if item["kind"] != "service":
            item["parent_client_id"] = None
        elif item["parent_client_id"] and item["parent_client_id"] not in work_ids:
            errors.append("parent_unknown")
        elif not item["parent_client_id"]:
            # При одной работе связь однозначна. При нескольких не выдумываем
            # выбор за клиента: строка останется общей допуслугой.
            item["parent_client_id"] = only_work
        item["request"]["parent_client_id"] = item["parent_client_id"]
    return out, total_low, total_high, errors


async def orders_create(request: web.Request) -> web.Response:
    ip = _ip(request)
    if not _rate_ok(ip, cost=3):
        return _err("rate_limit", 429)
    try:
        b = await request.json()
        assert isinstance(b, dict)
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    if (b.get("website") or "").strip():  # honeypot
        return _json({"ok": True, "id": 0})

    user = await _session_user(request)
    if user and user["banned"]:
        return _err("forbidden", 403)
    # Режим мастера — только ЧИТАТЬ чужой кабинет. Создавать заявку от лица
    # клиента нельзя: 21.07.2026 так родилось дело 187 — мастер забыл выйти
    # из чужого кабинета, и заявка вместе с Telegram-уведомлением ушла не
    # тому человеку. Тихий отказ здесь дешевле разбирательства потом.
    if user and _sess_imp(user):
        log.warning("imp session tried to create order for user %s — blocked", user["id"])
        return _err("impersonation_readonly", 403)
    guest_name = str(b.get("name") or "")[:120].strip()
    guest_contact = str(b.get("contact") or "")[:200].strip()
    if not user and not guest_contact:
        return _err("contact_required")
    # Обработка заказа требует отдельного актуального акцепта для КАЖДОГО
    # пользователя. Наличие аккаунта или Telegram-сессии не означает согласия
    # с новой заявкой и текущими редакциями документов.
    if b.get("consent") is not True:
        return _err("consent_required")
    if b.get("consent_doc") != config.ORDER_CONSENT_DOC:
        return _err("consent_version_mismatch", 409)

    # One semantic boundary for both guest and authenticated orders.  Run it
    # before idempotency lookup: a previously seen request id must not turn a
    # now-prohibited payload into a commercial order response.
    intake = intake_guard.evaluate_payload(b)
    if intake.blocked:
        return _json(intake.api_payload(), 422)

    request_id = str(b.get("client_request_id") or "").strip()[:100]
    if request_id and not re.fullmatch(r"[A-Za-z0-9_-]{8,100}", request_id):
        return _err("bad_request_id")
    request_fingerprint = _request_fingerprint(b) if request_id else None
    if request_id:
        previous = await db.order_by_client_request(request_id)
        same_owner = previous and (
            (user and previous["user_id"] == user["id"]) or
            (not user and previous["user_id"] is None and
             (previous["guest_contact"] or "") == guest_contact)
        )
        if previous and not same_owner:
            return _err("request_id_conflict", 409)
        if previous:
            previous_fp = previous["request_fingerprint"]
            if previous_fp and previous_fp != request_fingerprint:
                return _err("request_payload_conflict", 409)
            resp = {"ok": True, "id": previous["id"], "no": f"№{previous['id']}",
                    "order": _order_json(previous), "duplicate": True}
            if not user:
                resp["token"] = previous["access_token"]
            prior_items = await db.items_for_order(previous["id"])
            if prior_items:
                resp["bundle"] = {"count": len(prior_items)}
            return _json(resp)

    type_id = str(b.get("type") or "")[:30]
    t = config.TYPE_BY_ID.get(type_id)
    svc = config.SVC_BY_ID.get(type_id)
    if t:
        work_label = t.label
    elif svc:
        work_label = svc.label
    else:
        type_id, work_label = "custom", "Индивидуальная задача"
    disc = str(b.get("disc") or "")[:10]
    term = str(b.get("term") or "")[:10]
    tier = str(b.get("tier") or "")[:10]
    cart_declared = "cart" in b
    if cart_declared:
        cart_items, cart_low, cart_high, cart_errors = _cart_items(b.get("cart"))
        if cart_errors or not cart_items:
            return _json({"ok": False, "error": "bad_cart",
                          "detail": cart_errors[:8]}, 400)
    else:
        cart_items, cart_low, cart_high = [], 0, 0
    if len(cart_items) > 1:
        type_id, work_label = "custom", f"Комплексная заявка · {len(cart_items)} поз."
    elif cart_items:
        type_id, work_label = cart_items[0]["catalog_id"], cart_items[0]["label"]
    q = ((cart_low, cart_high) if cart_items else
         (config.quote(type_id, disc or "hum", term or "free", tier or "base") if t else None))
    topic = str(b.get("topic") or "")[:400].strip()
    details = str(b.get("details") or "")[:1500].strip()
    if cart_items:
        marker = "ОБЩИЙ КОММЕНТАРИЙ"
        details = details.split(marker, 1)[1].strip()[:1500] if marker in details else ""
    if b.get("plan"):
        details = ("Формат: начать с разбора плана. " + details).strip()

    # Время ставит сервер, а строку версий берём из кода, не из произвольного
    # клиентского payload. Проверка exact-match выполнена выше.
    consent_at = db.now_iso()
    consent_doc = config.ORDER_CONSENT_DOC

    # реферальная метка сайта (?ref=<id>): гостю — на заказ (ref_hint),
    # вошедшему без пригласившего — сразу в профиль
    ref_hint = None
    try:
        ref = int(b.get("ref") or 0)
    except (TypeError, ValueError):
        ref = 0
    if ref and (not user or ref != user["id"]) and await db.get_user(ref):
        if user:
            if not user["referrer_id"] and ref != user["id"]:
                await db.conn().execute(
                    "UPDATE users SET referrer_id=? WHERE id=? AND referrer_id IS NULL",
                    (ref, user["id"]))
                await db.conn().commit()
        else:
            ref_hint = ref

    # промокод: сохраняем только живой код — мёртвый честно вернём фронту
    promo_state = None
    raw_promo = _clean_promo(b.get("promo"))
    promo_code = None
    if raw_promo:
        p = await db.promo_get(raw_promo)
        bad = promo_svc.why_invalid(p) if p is not None else "not_found"
        # семейный автокод — один раз на клиента: повтор ловим уже на заявке
        if not bad and p["family"] and await db.promo_family_used(
                p["family"], user["id"] if user else None, guest_contact or None):
            bad = "already_used"
        if bad:
            promo_state = bad
        else:
            promo_code, promo_state = raw_promo, "ok"

    # подарочный сертификат: принимаем только годный код (спишется при цене)
    gift_state = None
    gift_code = None
    raw_gift = str(b.get("gift") or "").strip().upper()[:24]
    gift_balance = 0
    if raw_gift:
        gg, gerr, _gb = await gift_svc.check(raw_gift)
        if gerr:
            gift_state = gerr
        else:
            gift_code, gift_state, gift_balance = gg["code"], "ok", _gb

    access_token = secrets.token_urlsafe(24)
    create = db.create_order_bundle if cart_items else db.create_order
    create_args = dict(
        user_id=user["id"] if user else None,
        work_type=type_id, work_label=work_label,
        discipline=disc or None, term=term or None, tier=tier or None,
        topic=topic or None, details=details or None,
        deadline_text=str(b.get("deadline") or "")[:120].strip() or None,
        quote_low=q[0] if q else None, quote_high=q[1] if q else None,
        source="сайт", access_token=access_token,
        guest_name=guest_name or None, guest_contact=guest_contact or None,
        consent_at=consent_at, consent_doc=consent_doc if consent_at else None,
        page=str(b.get("page") or "")[:200] or None,
        ref_hint=ref_hint,
        promo_code=promo_code,
        gift_code=gift_code,
        client_request_id=request_id or None,
        request_fingerprint=request_fingerprint,
    )
    try:
        order_id = await create(cart_items, **create_args) if cart_items else await create(**create_args)
    except sqlite3.IntegrityError:
        # Два параллельных HTTP-ретрая могут оба пройти предварительную проверку.
        # Уникальный индекс оставляет один заказ; второй получает его же ответ.
        previous = await db.order_by_client_request(request_id) if request_id else None
        if not previous:
            raise
        previous_fp = previous["request_fingerprint"]
        if previous_fp and previous_fp != request_fingerprint:
            return _err("request_payload_conflict", 409)
        resp = {"ok": True, "id": previous["id"], "no": f"№{previous['id']}",
                "order": _order_json(previous), "duplicate": True}
        if not user:
            resp["token"] = previous["access_token"]
        prior_items = await db.items_for_order(previous["id"])
        if prior_items:
            resp["bundle"] = {"count": len(prior_items)}
        return _json(resp)
    if cart_items:
        intent = b.get("cart", {}).get("benefits_intent", {})
        if isinstance(intent, dict) and intent.get("use_bonus"):
            try:
                amount = max(0, int(intent.get("bonus_amount") or 0))
            except (TypeError, ValueError):
                amount = 0
            await db.add_event(order_id, "bonus_intent", f"до {amount} бонусов")
    if gift_code:
        await db.add_event(order_id, "gift_attached", f"{gift_code} · заявка")
    bot: Bot = request.app["bot"]
    user_id = user["id"] if user else None

    # заявка в БД — клиенту отвечаем сразу; карточки/письма догоняют фоном.
    # Если карточка не дошла НИ в группу, НИ в личку — исключение включает
    # ретраи _bg (лид не должен потеряться из-за минутного сбоя Telegram).
    # done защищает от дублей: сработавший шаг между попытками не повторяется.
    done: set[str] = set()

    async def _after_create():
        if "cards" not in done:
            g = await grp.send_card(bot, order_id, alert=texts.NEW_ORDER_ALERT + " · с сайта")
            sent = await notify.send_admin_card(
                bot, order_id, alert=texts.NEW_ORDER_ALERT + " · с сайта", group_sent=bool(g))
            if not g and sent == 0:
                raise RuntimeError("карточка не дошла ни в группу, ни админам")
            done.add("cards")
        if user_id and "client" not in done:
            await notify.notify_client(
                bot, user_id,
                f"🚀 <b>Заявка №{order_id} с сайта принята!</b>\n\n"
                "Мастер посмотрит её и вернётся с оценкой — обычно в течение 15–30 минут "
                "в рабочее время. Статус — на сайте в кабинете и здесь, в «📚 Мои заказы».",
                reply_markup=kb.with_cab_url(
                    kb.Kb(inline_keyboard=[]),
                    f"{config.SITE_URL}/dashboard.html#claim={access_token}"),
                order_id=order_id)
            done.add("client")
        if "mail" not in done:
            o2 = await db.get_order(order_id)
            if o2:
                await mailer.order_event(o2, "created")  # гостю с почтой — подтверждение
            done.add("mail")

    _bg(f"order{order_id} create", _after_create)
    o = await db.get_order(order_id)
    resp = {"ok": True, "id": order_id, "no": f"№{order_id}", "order": _order_json(o)}
    if cart_items:
        resp["bundle"] = {"count": len(cart_items), "quote_low": cart_low, "quote_high": cart_high}
    if promo_state:
        resp["promo"] = promo_state
    if gift_state:
        resp["gift"] = gift_state
        if gift_state == "ok":
            resp["gift_balance"] = gift_balance  # для «остатка хватит на…»
    if not user:
        resp["token"] = access_token
    return _json(resp)


async def orders_list(request: web.Request) -> web.Response:
    user = await _session_user(request)
    guest = False
    # Header не попадает в browser history, Referer и обычный nginx access log.
    # Query fallback — migration-only для уже открытых старых вкладок.
    raw_tokens = request.headers.get("X-Order-Tokens", "").strip()
    if not raw_tokens:
        raw_tokens = request.query.get("tokens", "")
    tokens = [t.strip() for t in raw_tokens.split(",") if t.strip()]
    if user:
        # Токены читались ТОЛЬКО у гостя. Человек, оплативший заявку по ссылке,
        # а потом вошедший через Telegram или почту, терял из виду то самое дело:
        # user_id у него ещё не проставлен, а гостевой токен сервер выбрасывал.
        # Склеиваем оба источника и убираем дубли по id.
        orders = await db.orders_by_user(user["id"], limit=30)
        if tokens:
            have = set(o["id"] for o in orders)
            for o in await db.orders_by_tokens(tokens):
                if o["id"] not in have:
                    have.add(o["id"])
                    orders.append(o)
            orders.sort(key=lambda r: r["id"], reverse=True)
    else:
        guest = True
        orders = await db.orders_by_tokens(tokens)
    unread = await db.unread_for_orders([o["id"] for o in orders])
    fnew = await db.files_new_for_orders([(o["id"], o["files_seen_at"]) for o in orders])
    items = []
    for o in orders:
        j = _order_json(o, unread=unread.get(o["id"], 0))
        j["files_new"] = fnew.get(o["id"], 0)
        if guest:  # гость и так предъявил эти токены — вернём соответствие заказ↔токен
            j["token"] = o["access_token"]
        items.append(j)
    return _json({"ok": True, "authorized": bool(user), "orders": items})


async def orders_claim(request: web.Request) -> web.Response:
    user = await _session_user(request)
    if not user:
        return _err("unauthorized", 401)
    try:
        b = await request.json()
        tokens = [str(t) for t in (b.get("tokens") or [])]
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    n = await db.claim_orders(tokens, user["id"])
    if n:
        await db.adopt_ref_hint(user["id"])  # гость пришёл по ?ref= — сохранить пригласившего
    return _json({"ok": True, "claimed": n})


async def order_get(request: web.Request) -> web.Response:
    order_id = int(request.match_info["id"])
    o, user = await _order_access(request, order_id)
    if not o:
        return _err("not_found", 404)
    if not _sess_imp(user):  # мастер в кабинете клиента не съедает «непрочитанное»
        await db.msgs_mark_seen(order_id)
    d = await _order_full_json(o)
    # метки «новый» на файлах мастера: новее последней ОСОЗНАННОЙ отметки
    # просмотра. Здесь только читаем: отметку ставит действие files_seen,
    # которое кабинет шлёт после того, как клиент реально посмотрел на дело
    # (раньше метку стирал фоновый поллинг — бейджи жили доли секунды).
    is_master = bool(user and user["id"] in config.ADMIN_IDS)
    seen = o["files_seen_at"] or ""
    for f in d.get("files", []):
        f["new"] = (not is_master and f["from"] == "master"
                    and bool(f["at"]) and (not seen or f["at"] > seen))
    return _json({"ok": True, "order": d})


async def order_message(request: web.Request) -> web.Response:
    if not _rate_ok(_ip(request), cost=2):
        return _err("rate_limit", 429)
    order_id = int(request.match_info["id"])
    o, _user = await _order_access(request, order_id)
    if not o:
        return _err("not_found", 404)
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    text = str(b.get("text") or "").strip()[:3000]
    if not text:
        return _err("empty")
    await db.msg_add(order_id, "client", text)
    await db.add_event(order_id, "client_msg", text[:200])
    bot: Bot = request.app["bot"]
    who = _client_label(o)
    body = f"💬 <b>Заказ №{order_id}</b> · {who} <i>(с сайта)</i>:\n{esc(text)}"
    map_client = (o["user_id"], order_id) if o["user_id"] else None

    async def _relay():
        g = await grp.send(bot, order_id, body)
        await notify.notify_admins(bot, body, map_client=map_client, group_sent=bool(g))

    _bg(f"order{order_id} msg", _relay)
    return _json({"ok": True})


async def order_action(request: web.Request) -> web.Response:
    order_id = int(request.match_info["id"])
    o, user = await _order_access(request, order_id)
    if not o:
        return _err("not_found", 404)
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    action = str(b.get("action") or "")
    allowed = _actions_for(o) + ["bonus_apply", "bonus_cancel", "paid_undo",
                                 "archive", "unarchive", "files_seen", "wait_checks",
                                 "gift_apply", "gift_remove"]
    if await _engagement_ready(o):
        allowed.append("review")
    if action not in allowed:
        return _err("action_not_allowed")
    bot: Bot = request.app["bot"]
    no = f"№{order_id}"
    who = _client_label(o)
    resp_extra: dict = {}

    if action == "accept_price":
        await db.set_status(order_id, "prepay", "клиент принял цену (сайт)")
        await db.add_event(order_id, "price_accepted")
        due = payments.money_due(o)
        req = await db.setting_get("requisites")
        map_client = (o["user_id"], order_id) if o["user_id"] else None
        price_fmt = config.fmt_money(o["price"])

        async def _alert_accept():
            g = await grp.send(bot, order_id,
                               f"🤝 {who} принял(а) цену {no}: {price_fmt} ₽ "
                               f"(деньгами {config.fmt_money(due['due_total'])} ₽). Ждём предоплату.")
            await notify.notify_admins(
                bot, f"🤝 {who} принял(а) цену по заказу {no} "
                     f"({price_fmt} ₽) — с сайта. Ожидаем предоплату.",
                map_client=map_client, group_sent=bool(g))
            if not req and not config.yookassa_on():
                await notify.notify_admins(bot, "⚠️ Реквизиты не заданы (/requisites) — клиент ждёт их!")

        _bg(f"order{order_id} accept_price", _alert_accept)

    elif action == "decline":
        reason = str(b.get("reason") or "").strip()[:500]
        restored = await bonus.restore_for_order(o, "возврат бонусов при отказе")
        await db.update_order(order_id, cancel_reason=reason or None)
        await db.set_status(order_id, "cancel", "клиент закрыл заявку (сайт)")
        await db.payments_cancel_pending(order_id)  # открытые кассы больше не действуют
        await gift_svc.sync_order(bot, order_id)  # зачёт — обратно на сертификат
        alert = texts.DECLINE_ALERT.format(who=who, no=no)
        if reason:
            alert += f"\nПричина: «{esc(reason)}»"
        alert += "\nЗаявку можно вернуть кнопкой ниже — клиент снова получит предложение."
        if restored:
            alert += f"\n💎 Бонусы возвращены клиенту: {restored}."
        dec_kb = kb.Kb(inline_keyboard=[
            [kb.Btn(text="🔄 Возобновить заказ", callback_data=f"ad:resume:{order_id}")],
            [kb.Btn(text="💬 Написать клиенту", callback_data=f"ad:msg:{order_id}"),
             kb.Btn(text="📋 Карточка", callback_data=f"ad:card:{order_id}")],
        ])
        dec_alert, dec_map = alert, (o["user_id"], order_id) if o["user_id"] else None

        async def _alert_decline():
            g = await grp.send(bot, order_id, dec_alert, reply_markup=dec_kb)
            await grp.status_sync(bot, order_id)
            await notify.notify_admins(bot, dec_alert, reply_markup=dec_kb,
                                       map_client=dec_map, group_sent=bool(g))

        _bg(f"order{order_id} decline", _alert_decline)

    elif action == "resume":
        res = await flow.resume_order(bot, order_id, who + " <i>(с сайта)</i>", via="сайт")
        if not res.get("ok"):
            return _err("not_canceled")

    elif action == "bonus_apply":
        if not user:
            return _err("bonus_need_login")
        ok, err, spent = await bonus.apply_to_order(user["id"], o, int(b.get("amount") or 0))
        if not ok:
            return _err(err)
        await gift_svc.sync_order(bot, order_id)  # бонусы сузили долг — зачёт пересчитать
        o2 = await db.get_order(order_id)
        due = payments.money_due(o2)
        due_fmt = config.fmt_money(due["due_total"])
        _bg(f"order{order_id} bonus_apply",
            lambda: grp.send(bot, order_id,
                             f"💎 {who} применил(а) {spent} бонусов к заказу {no}. "
                             f"К оплате деньгами: {due_fmt} ₽."))
        resp_extra["spent"] = spent

    elif action == "bonus_cancel":
        if not user:
            return _err("bonus_need_login")
        ok, err, restored = await bonus.cancel_spend(o)
        if not ok:
            return _err(err)
        await gift_svc.sync_order(bot, order_id)  # долг вырос — зачёт пересчитать
        o2 = await db.get_order(order_id)
        due = payments.money_due(o2)
        due_fmt2 = config.fmt_money(due["due_total"])
        bc_map = (o["user_id"], order_id) if o["user_id"] else None

        async def _alert_bonus_cancel():
            g = await grp.send(bot, order_id,
                               f"↩️ {who} вернул(а) {restored} бонусов со счёта заказа {no}. "
                               f"К оплате деньгами: {due_fmt2} ₽.")
            await notify.notify_admins(bot,
                                       f"↩️ {who} вернул(а) {restored} бонусов · заказ {no}.",
                                       map_client=bc_map, group_sent=bool(g))

        _bg(f"order{order_id} bonus_cancel", _alert_bonus_cancel)
        resp_extra["restored"] = restored

    elif action == "gift_apply":
        code = str(b.get("code") or "").strip().upper()[:24]
        if not code:
            return _err("empty")
        ok, err = await gift_svc.attach_to_order(bot, order_id, code, via="кабинет")
        if not ok:
            return _err(err)
        o2 = await db.get_order(order_id)
        due = payments.money_due(o2)
        if (o2["gift_amount"] or 0) > 0:
            ga_fmt = config.fmt_money(o2["gift_amount"])
            ga_due = config.fmt_money(due["due_total"])
            ga_map = (o["user_id"], order_id) if o["user_id"] else None

            async def _alert_gift_apply():
                g = await grp.send(bot, order_id,
                                   f"🎁 {who} применил(а) сертификат {code} к заказу {no}: "
                                   f"−{ga_fmt} ₽. К оплате деньгами: {ga_due} ₽.")
                await notify.notify_admins(
                    bot, f"🎁 {who} применил(а) сертификат {code} · заказ {no} (−{ga_fmt} ₽).",
                    map_client=ga_map, group_sent=bool(g))

            _bg(f"order{order_id} gift_apply", _alert_gift_apply)
        resp_extra["gift_amount"] = o2["gift_amount"] or 0

    elif action == "gift_remove":
        ok, err = await gift_svc.detach_from_order(bot, order_id)
        if not ok:
            return _err(err)

    elif action == "paid":
        kind, amount = await payments.stage_amount(o)
        if amount <= 0:
            return _err("nothing_due")
        pays = await db.payments_for_order(order_id)
        if any(p["status"] == "claimed" for p in pays):
            return _err("already_claimed")
        row = next((p for p in pays if p["kind"] == kind and p["status"] == "pending"), None)
        if row:
            await db.payment_set_status(row["id"], "claimed")
        else:
            pid = await db.payment_create(order_id, kind, amount)
            await db.payment_set_status(pid, "claimed")
        await db.add_event(order_id, "payment_marked")
        alert = (texts.PAYMENT_CLAIM.format(who=who, no=no) +
                 f" (с сайта) · {config.fmt_money(amount)} ₽ — сверьте поступление: "
                 "кнопки ниже.")
        claim_kb = kb.claim_check_kb(o, amount)
        paid_alert, paid_map = alert, (o["user_id"], order_id) if o["user_id"] else None

        async def _alert_paid():
            g = await grp.send(bot, order_id, paid_alert, reply_markup=claim_kb)
            sent = await notify.notify_admins(bot, paid_alert, reply_markup=claim_kb,
                                              map_client=paid_map, group_sent=bool(g))
            if not g and not sent:
                raise RuntimeError("отметка об оплате не дошла мастеру")

        _bg(f"order{order_id} paid", _alert_paid)

    elif action == "paid_undo":
        pays = await db.payments_for_order(order_id)
        row = next((p for p in pays if p["status"] == "claimed"), None)
        if not row:
            return _err("nothing_claimed")
        await db.payment_set_status(row["id"], "pending")
        await db.add_event(order_id, "payment_unmarked")
        alert = f"↩️ {who} снял(а) отметку об оплате по заказу {no} — сверять пока нечего."
        _bg(f"order{order_id} paid_undo",
            _mk_alert(bot, order_id, alert, map_client=(o["user_id"], order_id) if o["user_id"] else None))

    elif action == "accept_work":
        from .services import handoff
        a = await handoff.latest(order_id)
        if a and a["phase"] in ("preview_published", "released"):
            if str(b.get("artifact_id") or "") != str(a["id"]):
                return _err("stale_version", 409)
            res = await handoff.accept(bot, order_id, a["id"],
                                       who + " <i>(с сайта)</i>", via="сайт")
        else:
            res = await flow.accept_part(bot, order_id,
                                         who + " <i>(с сайта)</i>", via="сайт")
        if not res.get("ok"):
            return _err(res.get("error") or "not_on_review")
        resp_extra["accept"] = {k: res.get(k) for k in
                                ("final", "need_pay", "due", "part", "total", "next_part")}

    elif action == "request_fixes":
        comment = str(b.get("comment") or "").strip()[:2000]
        from .services import handoff
        a = await handoff.latest(order_id)
        if a and a["phase"] in ("preview_published", "released"):
            if str(b.get("artifact_id") or "") != str(a["id"]):
                return _err("stale_version", 409)
            res = await handoff.request_fixes(
                bot, order_id, a["id"], who + " <i>(с сайта)</i>",
                comment=comment, via="сайт")
        else:
            res = await flow.request_fixes(bot, order_id,
                                           who + " <i>(с сайта)</i>",
                                           comment=comment, via="сайт")
        if not res.get("ok"):
            return _err(res.get("error") or "not_on_review")

    elif action in ("archive", "unarchive"):
        on = 1 if action == "archive" else 0
        if on and o["status"] not in ("done", "cancel"):
            return _err("only_finished")
        await db.update_order(order_id, archived_client=on)
        await db.add_event(order_id, "client_archive", "в архив" if on else "из архива")

    elif action in ("pin", "unpin"):
        await db.update_order(order_id, pinned_client=1 if action == "pin" else 0)
        await db.add_event(order_id, "client_pin",
                           "закрепил в кабинете" if action == "pin" else "снял закрепление")

    elif action == "files_seen":
        # клиент реально посмотрел на дело — метки «новый файл» можно снять
        user2 = await _session_user(request)
        if not (user2 and (user2["id"] in config.ADMIN_IDS or _sess_imp(user2))):
            await db.update_order(order_id, files_seen_at=db.now_iso())

    elif action == "wait_checks":
        # финал у клиента, он ждёт научрука/предзащиту — дело остаётся открытым
        await db.add_event(order_id, "wait_checks", "клиент ждёт проверок (сайт)")
        alert = (f"🕐 Клиент по заказу {no} ждёт проверок (научрук/предзащита) — "
                 "дело остаётся на его стороне.")
        _bg(f"order{order_id} wait_checks",
            _mk_alert(bot, order_id, alert,
                      map_client=(o["user_id"], order_id) if o["user_id"] else None))
        pays_w = await db.payments_for_order(order_id)
        plan_w = payments.plan_state(o, pays_w)
        if plan_w and all(p["state"] == "paid" for p in plan_w):
            _bg(f"order{order_id} offer_defense",
                lambda: flow.offer_defense(bot, order_id))

    elif action == "pause":
        if o["status"] not in config.ACTIVE_STATUSES or o["paused"]:
            return _err("pause_state")
        await db.update_order(order_id, paused=1, paused_by="client",
                              paused_at=db.now_iso())
        await db.add_event(order_id, "paused", "клиент, сайт")
        alert = (f"⏸ {who} поставил(а) заказ {no} на паузу (из кабинета). "
                 "Работы и напоминания придержаны до сигнала клиента.")
        _bg(f"order{order_id} pause",
            _mk_alert(bot, order_id, alert,
                      map_client=(o["user_id"], order_id) if o["user_id"] else None))

    elif action == "unpause":
        if not o["paused"]:
            return _err("pause_state")
        if (o["paused_by"] or "client") == "admin":
            return _err("paused_by_master")
        await db.update_order(order_id, paused=0, paused_by=None)
        await db.add_event(order_id, "unpaused", "клиент, сайт")
        alert = f"▶️ {who} снял(а) паузу по заказу {no} — можно продолжать."
        _bg(f"order{order_id} unpause",
            _mk_alert(bot, order_id, alert,
                      map_client=(o["user_id"], order_id) if o["user_id"] else None))

    elif action == "cancel_request":
        # работа уже идёт: не рвём дело автоматически, а зовём мастера решить
        reason = str(b.get("reason") or "").strip()[:500]
        await db.add_event(order_id, "cancel_request", reason)
        alert = (f"✋ <b>{who} просит закрыть заказ {no}</b> — работа уже в производстве."
                 + (f"\nПричина: «{esc(reason)}»" if reason else "") +
                 "\nСвяжитесь с клиентом и решите вопрос по выполненной части и оплате.")
        cancel_kb = kb.Kb(inline_keyboard=[
            [kb.Btn(text="💬 Написать клиенту", callback_data=f"ad:msg:{order_id}")],
            [kb.Btn(text="🚫 Закрыть дело", callback_data=f"ad:st:{order_id}:cancel"),
             kb.Btn(text="📋 Карточка", callback_data=f"ad:card:{order_id}")],
            [kb.Btn(text="🖥 Открыть в админке", callback_data=f"ad:panel:{order_id}")],
        ])
        _bg(f"order{order_id} cancel_request",
            _mk_alert(bot, order_id, alert, reply_markup=cancel_kb,
                      map_client=(o["user_id"], order_id) if o["user_id"] else None))

    elif action == "review":
        try:
            rating = int(b.get("rating") or 0)
        except (TypeError, ValueError):
            rating = 0
        if not 1 <= rating <= 5:
            return _err("bad_rating")
        text_r = str(b.get("text") or "").strip()[:2000]
        author = str(b.get("author") or "").strip()[:80]
        publication_consent = b.get("publication_consent") is True
        categories = b.get("publication_categories")
        if not isinstance(categories, dict):
            categories = {}
        if publication_consent and (
            categories.get("rating_text") is not True
            or b.get("publication_consent_doc") != config.PUBLICATION_CONSENT_DOC
        ):
            return _err("bad_publication_consent")
        if not author and o["user_id"]:
            u = await db.get_user(o["user_id"])
            author = (u["first_name"] if u else "") or ""
        await flow.submit_review(
            bot,
            order_id,
            rating,
            text_r or None,
            author or None,
            via="сайт",
            publication_consent=publication_consent,
            publication_categories={
                "rating_text": publication_consent,
                "author": categories.get("author") is True,
                "screenshot": categories.get("screenshot") is True,
            },
            publication_consent_doc=(
                str(b.get("publication_consent_doc"))
                if publication_consent
                else None
            ),
        )

    o = await db.get_order(order_id)
    return _json({"ok": True, "order": await _order_full_json(o), **resp_extra})


async def order_contract(request: web.Request) -> web.Response:
    """PDF-спецификация заказа — клиенту в кабинет (и мастеру)."""
    order_id = int(request.match_info["id"])
    o, _user = await _order_access(request, order_id)
    if not o:
        return _err("not_found", 404)
    if not o["price"]:
        return _err("no_price")
    snap = await contract.snapshot_for_order(o)
    pdf = snap.get("pdf")
    if not pdf:
        return _err("specification_not_frozen", 409)
    revision = int(snap.get("revision") or 1)
    return web.Response(body=pdf, content_type="application/pdf", headers={
        **CORS,
        "Content-Disposition":
            f'inline; filename="specifikaciya-{order_id}-r{revision}.pdf"',
        "Cache-Control": "no-store",
        "X-Specification-Revision": str(revision),
        "X-Specification-Data-SHA256": str(snap.get("data_hash") or ""),
        "X-Specification-PDF-SHA256": str(snap.get("pdf_hash") or ""),
    })


async def order_payment_confirmation(request: web.Request) -> web.Response:
    """Фирменное подтверждение платежа; не является налоговым чеком НПД."""
    order_id = int(request.match_info["id"])
    payment_id = int(request.match_info["pid"])
    o, _user = await _order_access(request, order_id)
    if not o:
        return _err("not_found", 404)
    payment = await db.payment_get(payment_id)
    if not payment or payment["order_id"] != order_id \
            or payment["status"] != "paid":
        return _err("not_found", 404)
    try:
        from .services import payment_delivery
        pdf = await payment_delivery.confirmation_bytes(o, payment)
    except Exception:  # noqa: BLE001 - платёж остаётся виден, документ повторим
        log.exception(
            "payment confirmation PDF failed order=%s payment=%s",
            order_id,
            payment_id,
        )
        return _err("unavailable", 503)
    return web.Response(body=pdf, content_type="application/pdf", headers={
        **CORS,
        "Content-Disposition": (
            f'attachment; filename="podtverzhdenie-oplaty-'
            f'{order_id}-{payment_id}.pdf"'
        ),
        "Cache-Control": "private, no-store, max-age=0",
        "X-Document-Kind": "payment-confirmation-not-fiscal-receipt",
    })


async def payment_confirmation(request: web.Request) -> web.Response:
    """Архив подтверждений аккаунта для заказов, подписок и авансов."""
    user = await _session_user(request)
    if not user:
        return _err("unauthorized", 401)
    receipt_id = int(request.match_info["rid"])
    receipt = await db.receipt_by_id(receipt_id)
    if not receipt or int(receipt["user_id"] or 0) != int(user["id"]) \
            or receipt["payment_status"] != "paid":
        return _err("not_found", 404)
    try:
        pdf = await payment_delivery.confirmation_bytes_for_receipt(receipt)
    except Exception:  # noqa: BLE001 - документ можно повторить
        log.exception("payment confirmation PDF failed receipt=%s", receipt_id)
        return _err("unavailable", 503)
    scope = re.sub(r"[^a-z0-9_-]+", "", str(receipt["scope"] or "payment"))
    filename = (
        f"podtverzhdenie-oplaty-{scope or 'payment'}-"
        f"{int(receipt['scope_id'])}-{int(receipt['inv_id'])}.pdf"
    )
    return web.Response(body=pdf, content_type="application/pdf", headers={
        **CORS,
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "private, no-store, max-age=0",
        "X-Document-Kind": "payment-confirmation-not-fiscal-receipt",
    })


async def order_pamyatka(request: web.Request) -> web.Response:
    """Персональная памятка «что дальше» (PDF) — после передачи финала."""
    order_id = int(request.match_info["id"])
    o, _user = await _order_access(request, order_id)
    if not o:
        return _err("not_found", 404)
    if not pamyatka.order_pamyatka_ready(o):
        return _err("not_ready")
    pdf = await pamyatka.build_order_pdf(o)
    if not pdf:
        return _err("unavailable", 503)
    return web.Response(body=pdf, content_type="application/pdf", headers={
        **CORS,
        "Content-Disposition": f'inline; filename="pamyatka-zakaz-{order_id}.pdf"',
        "Cache-Control": "no-store",
    })


async def pamyatka_welcome(request: web.Request) -> web.Response:
    """«Путеводитель заказчика» (PDF) — публичный, содержимое статичное."""
    if not _rate_ok("v:" + _ip(request), cost=2):
        return _err("rate_limit", 429)
    pdf = pamyatka.build_welcome_pdf()
    if not pdf:
        return _err("unavailable", 503)
    return web.Response(body=pdf, content_type="application/pdf", headers={
        **CORS,
        "Content-Disposition": 'inline; filename="putevoditel-zakazchika.pdf"',
        "Cache-Control": "public, max-age=3600",
    })


async def order_pay(request: web.Request) -> web.Response:
    """Ссылка на онлайн-оплату. Email передаётся кассе для официального чека."""
    order_id = int(request.match_info["id"])
    o, _user = await _order_access(request, order_id)
    if not o:
        return _err("not_found", 404)
    if o["status"] not in ("priced", "prepay", "work", "check", "fix"):
        return _err("pay_stage")
    kind, amount = await payments.stage_amount(o)
    if amount <= 0:
        return _err("nothing_due")
    try:
        body = await request.json()
        if not isinstance(body, dict):
            body = {}
    except Exception:  # noqa: BLE001
        body = {}
    receipt_email = str(body.get("email") or "").strip().lower()[:120]
    if receipt_email and not mailer.looks_email(receipt_email):
        return _err("bad_email")
    prov = config.pay_provider()
    if not prov:
        return _json({"ok": True, "online": False,
                      "requisites": await db.setting_get("requisites"),
                      "kind": kind, "amount": amount})
    if prov == "robokassa":
        url = await payments.robo_create_link(
            o, kind, amount, receipt_email=receipt_email or None)
        if not url:
            return _err("pay_failed", 502)
        return _json({"ok": True, "online": True, "url": url,
                      "kind": kind, "amount": amount})
    ret = f"{config.SITE_URL}/dashboard.html?paid={order_id}"
    res = await payments.yk_create_payment(o, kind, amount, ret)
    if not res:
        return _err("pay_failed", 502)
    return _json({"ok": True, "online": True, "url": res["url"],
                  "kind": kind, "amount": amount})


async def order_tip(request: web.Request) -> web.Response:
    """Добровольная благодарность по завершённому делу → Robokassa."""
    if not _rate_ok("tip:" + _ip(request), cost=2):
        return _err("rate_limit", 429)
    order_id = int(request.match_info["id"])
    o, user = await _order_access(request, order_id)
    if not o:
        return _err("not_found", 404)
    if _sess_imp(user):
        return _err("admin_session", 409)
    if not await _engagement_ready(o):
        return _err("tip_stage", 409)
    try:
        body = await request.json()
        amount = int(body.get("amount") or 0)
    except Exception:  # noqa: BLE001
        return _err("bad_request")
    if amount < 100 or amount > 30_000:
        return _err("bad_amount")
    if not config.robokassa_on():
        requisites = (await db.setting_get("requisites") or "").strip()
        if not requisites:
            return _err("offline_pay", 503)
        tip_id = await db.tip_create(order_id, amount, method="manual")
        await db.add_event(order_id, "tip_link", f"{amount} ₽ · перевод по реквизитам")
        return _json({"ok": True, "online": False, "tip_id": tip_id,
                      "amount": amount, "requisites": requisites})
    tip_id = await db.tip_create(order_id, amount, method="robokassa")
    tip = await db.tip_get(tip_id)
    url = await payments.robo_create_link_tip(tip, o)
    if not url:
        return _err("pay_failed", 502)
    await db.add_event(order_id, "tip_link", f"{amount} ₽ · Robokassa")
    return _json({"ok": True, "online": True, "url": url, "amount": amount})


async def order_tip_claim(request: web.Request) -> web.Response:
    """Резерв без онлайн-кассы: клиент отметил добровольный перевод, мастер сверяет."""
    order_id = int(request.match_info["id"])
    tip_id = int(request.match_info["tip"])
    o, user = await _order_access(request, order_id)
    if not o:
        return _err("not_found", 404)
    if _sess_imp(user):
        return _err("admin_session", 409)
    tip = await db.tip_get(tip_id)
    if not tip or tip["order_id"] != order_id or tip["method"] != "manual":
        return _err("not_found", 404)
    if not await db.tip_claim(tip_id):
        return _err("already_claimed", 409)
    await db.add_event(order_id, "tip_claimed", f"{tip['amount']} ₽ · перевод")
    no = config.order_no(order_id)
    alert = (f"💛 Клиент отметил добровольную благодарность по заказу {no}: "
             f"<b>{config.fmt_money(tip['amount'])} ₽</b>. Сверьте перевод.")
    markup = kb.Kb(inline_keyboard=[
        [kb.Btn(text="✅ Благодарность получена", callback_data=f"ad:tipok:{tip_id}"),
         kb.Btn(text="Не вижу перевод", callback_data=f"ad:tipno:{tip_id}")],
        [kb.Btn(text="📋 Открыть заказ", callback_data=f"ad:card:{order_id}")],
    ])
    g = await grp.send(request.app["bot"], order_id, alert, reply_markup=markup)
    await notify.notify_admins(request.app["bot"], alert, reply_markup=markup,
                               group_sent=bool(g),
                               map_client=(o["user_id"], order_id) if o["user_id"] else None)
    return _json({"ok": True, "claimed": True})


async def deposit_get(request: web.Request) -> web.Response:
    """Кошелёк-депозит: баланс, ставки, журнал — для кабинета."""
    user = await _session_user(request)
    if not user:
        return _err("unauthorized", 401)
    s = await deposit.summary(user["id"])
    s["rows"] = [{"delta": r["delta"], "kind": r["kind"],
                  "order_id": r["order_id"], "note": r["note"],
                  "at": r["created_at"]}
                 for r in await deposit.rows(user["id"])]
    return _json({"ok": True, **s})


async def deposit_topup(request: web.Request) -> web.Response:
    """Заявка на пополнение депозита → ссылка Robokassa."""
    user = await _session_user(request)
    if not user:
        return _err("unauthorized", 401)
    try:
        body = await request.json()
        amount = int(body.get("amount") or 0)
    except Exception:
        return _err("bad_request")
    if not deposit.amount_ok(amount):
        return _err("bad_amount")
    if (await deposit.balance(user["id"])) + amount > deposit.MAX_ACTIVE:
        return _err("over_limit")
    if not config.robokassa_on():
        return _err("offline_pay")
    d = await deposit.create_pending(user_id=user["id"], amount=amount,
                                     via="кабинет")
    url = await payments.robo_create_link_dep(d)
    if not url:
        return _err("pay_failed", 502)
    return _json({"ok": True, "url": url,
                  "bonus": d["bonus_amount"], "pct": d["bonus_pct"]})


async def order_pay_deposit(request: web.Request) -> web.Response:
    """Оплатить ближайший этап заказа с депозитного кошелька — целиком."""
    order_id = int(request.match_info["id"])
    o, user = await _order_access(request, order_id)
    if not o:
        return _err("not_found", 404)
    if not user or not o["user_id"] or o["user_id"] != user["id"]:
        # гостевой токен депозит не тратит: кошелёк принадлежит аккаунту
        return _err("unauthorized", 401)
    if o["status"] not in ("priced", "prepay", "work", "check", "fix"):
        return _err("pay_stage")
    ok, why, bal = await deposit.pay_order(request.app["bot"], order_id,
                                           actor="кабинет")
    if not ok:
        return _json({"ok": False, "error": "deposit", "message": why}, 400)
    return _json({"ok": True, "balance": bal})


async def yk_webhook(request: web.Request) -> web.Response:
    """Вебхук ЮKassa: подтверждаем платёж только после сверки с их API."""
    try:
        data = await request.json()
    except Exception:  # noqa: BLE001
        return web.Response(status=400)
    obj = (data.get("object") or {})
    pid = str(obj.get("id") or "")
    if not pid:
        return web.Response(status=200)
    fresh = await payments.yk_fetch(pid)
    if not fresh or fresh.get("status") != "succeeded":
        return web.Response(status=200)
    amount_data = fresh.get("amount") or {}
    try:
        paid_value = Decimal(str(amount_data.get("value") or ""))
    except InvalidOperation:
        return web.Response(status=400, text="bad amount")
    if amount_data.get("currency") != "RUB" or paid_value <= 0:
        return web.Response(status=400, text="bad amount")
    metadata = fresh.get("metadata") or {}
    sub_meta = str((fresh.get("metadata") or {}).get("sub_id") or "")
    if sub_meta.isdigit():
        # платёж за подписку (свой контур, без строки в payments)
        s = await db.sub_get(int(sub_meta))
        if not s or paid_value != Decimal(int(s["price"] or 0)):
            return web.Response(status=400, text="payment mismatch")
        if s["status"] != "active":
            await subs.activate_paid(request.app["bot"], s["id"],
                                     method="yookassa", actor="ЮKassa")
        return web.Response(status=200)
    row = await db.payment_by_external(pid)
    if not row:
        return web.Response(status=200)
    if row["status"] == "canceled":
        return web.Response(status=200)
    order_id = row["order_id"]
    if paid_value != Decimal(int(row["amount"] or 0)) \
            or str(metadata.get("order_id") or "") != str(order_id) \
            or str(metadata.get("kind") or "") != str(row["kind"]):
        log.warning("yookassa payment mismatch for payment id=%s", row["id"])
        return web.Response(status=400, text="payment mismatch")
    amount = int(paid_value)
    bot: Bot = request.app["bot"]
    conducted = await payments.confirm(
        bot, order_id, row["kind"], amount, method="yookassa",
        external_id=pid, pay_id=row["id"], actor="ЮKassa")
    if not conducted.get("ok"):
        if conducted.get("error") == "duplicate_payment":
            return web.Response(status=200)
        log.error(
            "yookassa effects pending for payment id=%s: %s",
            row["id"],
            conducted.get("error"),
        )
        return web.Response(status=503, text="payment effects pending")
    if conducted.get("duplicate_callback"):
        return web.Response(status=200)
    o = await db.get_order(order_id)
    if o:
        g = await grp.send_card(bot, order_id,
                                alert=f"💳 Онлайн-оплата подтверждена (ЮKassa): "
                                      f"{config.fmt_money(amount or row['amount'])} ₽. "
                                      "Не забудьте чек в «Мой налог».")
        await grp.status_sync(bot, order_id)
        await notify.notify_admins(
            bot, f"💳 ЮKassa: оплата по заказу №{order_id} подтверждена "
                 f"({config.fmt_money(amount or row['amount'])} ₽). Не забудьте чек в «Мой налог».",
            group_sent=bool(g))
    return web.Response(status=200)


async def robo_webhook(request: web.Request) -> web.Response:
    """ResultURL Robokassa: подпись MD5 c Password#2; ответ — OK<InvId>."""
    if not config.robokassa_on():
        return web.Response(status=404)
    data = dict(await request.post()) if request.method == "POST" else dict(request.query)
    res = payments.robo_result_ok(data)
    if not res:
        log.warning("robokassa result: bad signature from %s", _ip(request))
        return web.Response(status=400, text="bad sign")
    inv_id, amount = res
    # Robokassa возвращает в ResultURL адрес, который покупатель подтвердил
    # на платёжной странице. Он может отличаться от предзаполненного Email;
    # сохраняем его только после успешной проверки подписи уведомления.
    callback_email = str(
        data.get("EMail") or data.get("Email") or data.get("email") or ""
    ).strip().lower()[:120]
    receipt_at_callback = await db.receipt_get("robokassa", inv_id)
    if callback_email and mailer.looks_email(callback_email) \
            and receipt_at_callback \
            and int(receipt_at_callback["amount"] or 0) == int(amount):
        await db.receipt_set_buyer_email(
            int(receipt_at_callback["id"]), callback_email
        )
    if inv_id >= payments.SUB_INV_OFFSET:
        # платёж за подписку (свой контур): InvId = OFFSET + sub_id
        s = await db.sub_get(inv_id - payments.SUB_INV_OFFSET)
        if not s:
            return web.Response(status=400, text="unknown invoice")
        if amount != int(s["price"] or 0):
            return web.Response(status=400, text="bad amount")
        bot_s: Bot = request.app["bot"]
        if s["status"] not in ("pending", "active"):
            await db.receipt_mark_paid(
                "robokassa", inv_id, allocated=False)
            await notify.notify_admins(
                bot_s,
                f"⚠️ Robokassa приняла {config.fmt_money(amount)} ₽ по уже "
                f"закрытому оформлению подписки #{s['id']} "
                f"(статус {s['status']}). Деньги не распределены автоматически; "
                "сверьте операцию и свяжитесь с клиентом.")
            return web.Response(text=f"OK{inv_id}")
        await db.receipt_mark_paid("robokassa", inv_id, allocated=True)
        if s["status"] != "active":
            s2 = await subs.activate_paid(bot_s, s["id"], method="robokassa",
                                          actor="Robokassa")
            if s2:
                await notify.notify_admins(
                    bot_s, f"💳 Robokassa: подписка «{subs.plan_label(s['plan'])}» "
                           f"оплачена ({config.fmt_money(amount or s['price'])} ₽) "
                           "и активирована. Данные чека переданы Robokassa; "
                           "подтверждение платежа поставлено в доставку покупателю.")
        await payment_delivery.schedule_for_receipt(
            bot_s, "robokassa", inv_id
        )
        return web.Response(text=f"OK{inv_id}")
    if inv_id >= payments.GIFT_INV_OFFSET:
        # платёж за подарочный сертификат (свой контур): InvId = OFFSET + gift_id
        g = await db.gift_get(inv_id - payments.GIFT_INV_OFFSET)
        if not g:
            return web.Response(status=400, text="unknown invoice")
        if amount != int(g["amount"] or 0):
            return web.Response(status=400, text="bad amount")
        bot_g: Bot = request.app["bot"]
        if g["status"] not in ("pending", "active"):
            await db.receipt_mark_paid(
                "robokassa", inv_id, allocated=False)
            await notify.notify_admins(
                bot_g,
                f"⚠️ Robokassa приняла {config.fmt_money(amount)} ₽ по уже "
                f"закрытому сертификату #{g['id']} (статус {g['status']}). "
                "Деньги не распределены автоматически; требуется сверка.")
            return web.Response(text=f"OK{inv_id}")
        await db.receipt_mark_paid("robokassa", inv_id, allocated=True)
        if g["status"] != "active":
            g2 = await gift_svc.activate_paid(bot_g, g["id"], method="robokassa",
                                              actor="Robokassa")
            if g2:
                await notify.notify_admins(
                    bot_g, f"💳 Robokassa: подарочный сертификат {g2['code']} "
                           f"оплачен ({config.fmt_money(amount or g['amount'])} ₽) "
                           "и выпущен. Данные чека переданы Robokassa.")
        await payment_delivery.schedule_for_receipt(
            bot_g, "robokassa", inv_id
        )
        return web.Response(text=f"OK{inv_id}")
    if inv_id >= payments.DEP_INV_OFFSET:
        # пополнение депозита (свой контур): InvId = OFFSET + deposit_id
        d = await deposit.dep_get(inv_id - payments.DEP_INV_OFFSET)
        if not d:
            return web.Response(status=400, text="unknown invoice")
        if amount != int(d["amount"] or 0):
            return web.Response(status=400, text="bad amount")
        bot_d: Bot = request.app["bot"]
        if d["status"] not in ("pending", "active"):
            await db.receipt_mark_paid(
                "robokassa", inv_id, allocated=False)
            await notify.notify_admins(
                bot_d,
                f"⚠️ Robokassa приняла {config.fmt_money(amount)} ₽ по уже "
                f"закрытому пополнению депозита #{d['id']} "
                f"(статус {d['status']}). Деньги не зачислены автоматически; "
                "требуется ручная сверка.")
            return web.Response(text=f"OK{inv_id}")
        await db.receipt_mark_paid("robokassa", inv_id, allocated=True)
        if d["status"] != "active":
            d2 = await deposit.activate_paid(bot_d, d["id"], method="robokassa",
                                             actor="Robokassa")
            if d2:
                await notify.notify_admins(
                    bot_d, f"💼 Robokassa: депозит пополнен на "
                           f"{config.fmt_money(amount or d['amount'])} ₽ "
                           f"(+{config.fmt_money(d2['bonus_amount'])} бонусами, "
                           f"+{d2['bonus_pct']}%). Данные чека на аванс переданы "
                           "Robokassa; подтверждение платежа поставлено в доставку.")
        await payment_delivery.schedule_for_receipt(
            bot_d, "robokassa", inv_id
        )
        return web.Response(text=f"OK{inv_id}")
    if inv_id >= payments.TIP_INV_OFFSET:
        # добровольная благодарность: отдельный контур, дело не двигаем
        tip = await db.tip_get(inv_id - payments.TIP_INV_OFFSET)
        if not tip:
            return web.Response(status=400, text="unknown invoice")
        if amount != int(tip["amount"] or 0):
            log.warning("robokassa tip amount mismatch: inv=%s got=%s expected=%s",
                        inv_id, amount, tip["amount"])
            return web.Response(status=400, text="bad amount")
        await db.receipt_mark_paid("robokassa", inv_id, allocated=True)
        if await db.tip_mark_paid(tip["id"]):
            await db.add_event(tip["order_id"], "tip_paid",
                               f"{tip['amount']} ₽ · Robokassa")
            msg = (f"💛 <b>Благодарность по завершённому заказу "
                   f"{config.order_no(tip['order_id'])}</b>: "
                   f"{config.fmt_money(tip['amount'])} ₽. Спасибо клиенту! "
                   "Данные чека переданы Robokassa.")
            g = await grp.send(request.app["bot"], tip["order_id"], msg)
            await notify.notify_admins(request.app["bot"], msg, group_sent=bool(g))
        await payment_delivery.schedule_for_receipt(
            request.app["bot"], "robokassa", inv_id
        )
        return web.Response(text=f"OK{inv_id}")
    row = await db.payment_get(inv_id)
    if not row or row["method"] != "robokassa":
        return web.Response(status=400, text="unknown invoice")
    if amount != int(row["amount"] or 0):
        log.warning("robokassa payment amount mismatch: inv=%s", inv_id)
        return web.Response(status=400, text="bad amount")
    if row["status"] == "canceled":
        # деньги по ОТМЕНЁННОМУ счёту (пересобранная заявка) — на ручной
        # разбор, автопроводки нет: сумма могла устареть.
        await db.receipt_mark_paid(
            "robokassa", inv_id, allocated=False)
        await notify.notify_admins(request.app["bot"],
            f"⚠️ Оплата по отменённому счёту InvId {inv_id} "
            f"(заказ {row['order_id']}). Не проведено автоматически — проверьте.")
        return web.Response(text=f"OK{inv_id}")
    await db.receipt_mark_paid("robokassa", inv_id, allocated=True)
    order_id = row["order_id"]
    bot: Bot = request.app["bot"]
    conducted = await payments.confirm(
        bot, order_id, row["kind"], amount,
        method="robokassa", external_id=str(inv_id),
        pay_id=inv_id, actor="Robokassa")
    if not conducted.get("ok"):
        if conducted.get("error") == "duplicate_payment":
            return web.Response(text=f"OK{inv_id}")
        log.error(
            "robokassa effects pending for InvId=%s: %s",
            inv_id,
            conducted.get("error"),
        )
        # Не отвечаем OK, пока основной ledger не завершён: провайдер должен
        # повторить ResultURL, а не считать деньги успешно распределёнными.
        return web.Response(status=503, text="payment effects pending")
    if conducted.get("duplicate_callback"):
        return web.Response(text=f"OK{inv_id}")
    o = await db.get_order(order_id)
    if o:
        g = await grp.send_card(bot, order_id,
                                alert=f"💳 Онлайн-оплата подтверждена (Robokassa): "
                                      f"{config.fmt_money(amount or row['amount'])} ₽. "
                                      "Данные чека переданы Robokassa; подтверждение "
                                      "платежа доступно клиенту.")
        await grp.status_sync(bot, order_id)
        await notify.notify_admins(
            bot, f"💳 Robokassa: оплата по заказу №{order_id} подтверждена "
                 f"({config.fmt_money(amount or row['amount'])} ₽). "
                 "Данные чека переданы Robokassa; подтверждение платежа "
                 "доступно клиенту.",
            group_sent=bool(g))
    return web.Response(text=f"OK{inv_id}")


def _client_label(o) -> str:
    if o["user_id"]:
        return f'<a href="tg://user?id={o["user_id"]}">клиент</a>'
    name = esc(o["guest_name"] or "гость")
    contact = esc(o["guest_contact"] or "")
    return f"{name} ({contact})" if contact else name

# ------------------------------------------------------------------- файлы

_UPLOAD_LABELS = {"receipt": "подтверждение перевода", "review": "отзыв", "fix": "правки"}


async def order_upload(request: web.Request) -> web.Response:
    """Файл клиента с сайта → в ветку заказа в рабочей группе.

    Всё по заказу живёт в одном месте — в его теме; личка админа получает
    файл только если группа недоступна (фолбэк, чтобы ничего не потерять).
    """
    if not _rate_ok(_ip(request), cost=3):
        return _err("rate_limit", 429)
    order_id = int(request.match_info["id"])
    o, _user = await _order_access(request, order_id)
    if not o:
        return _err("not_found", 404)
    kind_q = request.query.get("kind", "")[:20]
    label = _UPLOAD_LABELS.get(kind_q)
    reader = await request.multipart()
    field = await reader.next()
    while field is not None and field.name != "file":
        field = await reader.next()
    if field is None:
        return _err("no_file")
    fname = (field.filename or "файл")[:120]
    data = bytearray()
    while True:
        chunk = await field.read_chunk(64 * 1024)
        if not chunk:
            break
        data.extend(chunk)
        if len(data) > MAX_UPLOAD:
            return _err("too_big", 413)
    if not data:
        return _err("empty")
    bot: Bot = request.app["bot"]
    who = _client_label(o)
    head = {"receipt": "🧾 Подтверждение перевода", "review": "⭐ Скрин к отзыву",
            "fix": "✏️ Материалы к правкам"}.get(kind_q, "📎 Файл")
    caption = f"{head} · заказ №{order_id} · от {who} (с сайта)"
    file_kb = None
    if kind_q == "receipt":
        # подтверждение перевода — просьба сверить оплату; это не чек НПД
        caption += " — сверьте и подтвердите оплату."
        _, claim_amt = await payments.confirm_amount(o)
        if claim_amt > 0:
            file_kb = kb.claim_check_kb(o, claim_amt)
    tg_file_id = None
    # основной путь: документ падает в тему заказа в рабочей группе
    msg = await grp.send_document(bot, order_id,
                                  BufferedInputFile(bytes(data), filename=fname),
                                  caption=caption, reply_markup=file_kb)
    if msg and msg.document:
        tg_file_id = msg.document.file_id
    if not tg_file_id:
        # группа недоступна — фолбэк в личку админам, как раньше
        for admin_id in config.ADMIN_IDS:
            try:
                m2 = await bot.send_document(
                    admin_id, BufferedInputFile(bytes(data), filename=fname),
                    caption=caption)
                if m2.document:
                    tg_file_id = m2.document.file_id
                    if o["user_id"]:
                        await db.map_put(admin_id, m2.message_id, o["user_id"], order_id)
            except Exception:  # noqa: BLE001
                log.exception("upload relay to admin failed")
    else:
        # группа получила файл — личку дёргаем только в режиме admin_dm=all
        if await notify.dm_wanted(True):
            for admin_id in config.ADMIN_IDS:
                try:
                    await bot.send_document(admin_id, tg_file_id, caption=caption)
                except Exception:  # noqa: BLE001
                    pass
    if not tg_file_id:
        return _err("relay_failed", 502)
    if kind_q == "receipt":
        await db.add_event(order_id, "receipt", "подтверждение перевода приложено (сайт)")
    else:
        # любой файл клиента — активность: авто-приёмка молчания смотрит на
        # события, и без этой строки ответ файлом без текста считался тишиной
        await db.add_event(order_id, "client_msg", f"файл: {fname[:60]}")
    await db.add_file(order_id, "client", tg_file_id, None, fname, len(data), "document",
                      label=label)
    await db.msg_add(order_id, "client", None, kind="document", file_name=fname,
                     tg_file_id=tg_file_id)
    return _json({"ok": True, "name": fname})


async def _stream_tg_file(request: web.Request, bot: Bot, file_id: str,
                          fname: str, inline: bool = False,
                          content_type: str = "application/octet-stream") -> web.Response:
    """Проксируем файл Telegram клиенту (скачивание или проигрывание)."""
    try:
        tg_file = await bot.get_file(file_id)
    except Exception:  # noqa: BLE001
        return _err("file_expired", 410)
    url = f"https://api.telegram.org/file/bot{config.BOT_TOKEN}/{tg_file.file_path}"
    quoted = urllib.parse.quote(fname)
    disp = "inline" if inline else "attachment"
    resp = web.StreamResponse(headers={
        **CORS,
        "Content-Disposition": f"{disp}; filename*=UTF-8''{quoted}",
        "Content-Type": content_type,
        "Cache-Control": "private, no-store, max-age=0",
        "Pragma": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
    })
    async with aiohttp_client.ClientSession() as sess:
        async with sess.get(url) as upstream:
            if upstream.status != 200:
                return _err("file_expired", 410)
            await resp.prepare(request)
            async for chunk in upstream.content.iter_chunked(64 * 1024):
                await resp.write(chunk)
    await resp.write_eof()
    return resp


async def order_file_download(request: web.Request) -> web.Response:
    order_id = int(request.match_info["id"])
    o, _user = await _order_access(request, order_id)
    if not o:
        return _err("not_found", 404)
    f = await db.file_by_id(int(request.match_info["fid"]))
    if not f or f["order_id"] != order_id:
        return _err("not_found", 404)
    bot: Bot = request.app["bot"]
    fname = f["file_name"] or (f"файл-{f['id']}" + (".jpg" if f["kind"] == "photo" else ""))
    return await _stream_tg_file(request, bot, f["file_id"], fname)


_MEDIA_CT = {
    "voice": ("audio/ogg", ".ogg"), "audio": ("audio/mpeg", ".mp3"),
    "photo": ("image/jpeg", ".jpg"), "video": ("video/mp4", ".mp4"),
    "video_note": ("video/mp4", ".mp4"), "document": ("application/octet-stream", ""),
}


async def order_msg_media(request: web.Request) -> web.Response:
    """Медиа сообщения переписки (голосовое, фото…) — слушать/смотреть на сайте."""
    order_id = int(request.match_info["id"])
    o, _user = await _order_access(request, order_id)
    if not o:
        return _err("not_found", 404)
    m = await db.msg_by_id(int(request.match_info["mid"]))
    if not m or m["order_id"] != order_id or not m["tg_file_id"]:
        return _err("not_found", 404)
    ct, ext = _MEDIA_CT.get(m["kind"], _MEDIA_CT["document"])
    fname = m["file_name"] or f"вложение-{m['id']}{ext}"
    bot: Bot = request.app["bot"]
    return await _stream_tg_file(request, bot, m["tg_file_id"], fname,
                                 inline=m["kind"] != "document", content_type=ct)


# ------------------------------------------------------------------ отзывы

# ------------------------------------------------- витрина TG-канала

async def channel_public(request: web.Request) -> web.Response:
    """Свежие посты @akademsalon для главной (собирает scheduler)."""
    from .services import channel as ch
    rows = await db.channel_recent(6)
    return _json({"ok": True, "channel": ch.CHANNEL,
                  "url": f"https://t.me/{ch.CHANNEL}",
                  "posts": [ch.public_json(r) for r in rows]})


async def channel_img(request: web.Request) -> web.Response:
    from .services import channel as ch
    try:
        msg_id = int(request.match_info["id"])
    except (TypeError, ValueError):
        return _err("not_found", 404)
    p = ch.img_path(msg_id)
    if not p:
        return _err("not_found", 404)
    return web.FileResponse(p, headers={
        "Cache-Control": "public, max-age=86400",
        "Content-Type": "image/jpeg",
        **CORS,
    })


# ------------------------------------------------- «Открытая приёмная»

async def qa_public_list(request: web.Request) -> web.Response:
    """Опубликованные пары вопрос-ответ: лента приёмной."""
    rows = await db.qa_public()
    return _json({"ok": True, "items": [qa_svc.public_json(r) for r in rows]})


async def qa_submit(request: web.Request) -> web.Response:
    """Анонимный вопрос в приёмную: honeypot, лимиты, очередь премодерации."""
    ip = _ip(request)
    if not _rate_ok("q:" + ip, cost=2):
        return _err("rate_limited", 429)
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    if str(b.get("website") or "").strip():
        # honeypot: боту отвечаем «принято» и молча выбрасываем
        return _json({"ok": True, "id": 0})
    quiet = bool(b.get("quiet"))
    email = str(b.get("email") or "").strip()[:120]
    if quiet and not mailer.looks_email(email):
        return _err("email_required")
    if email and not mailer.looks_email(email):
        return _err("bad_email")
    user = await _session_user(request)
    vid = re.sub(r"[^a-z0-9-]", "", str(b.get("vid") or ""))[:48]
    qa_id, err = await qa_svc.submit(
        request.app.get("bot"), question=str(b.get("question") or ""),
        pseudonym=str(b.get("pseudonym") or ""), email=email, quiet=quiet,
        vid=vid, ip=ip, user_id=user["id"] if user else None)
    if err:
        return _err(err, 429 if err == "rate_limited" else 400)
    return _json({"ok": True, "id": qa_id})


async def qa_same(request: web.Request) -> web.Response:
    """«У меня такой же вопрос»: +1, один голос на браузер."""
    if not _rate_ok("q:" + _ip(request)):
        return _err("rate_limited", 429)
    qa_id = int(request.match_info["id"])
    r = await db.qa_get(qa_id)
    if not r or r["status"] != "published":
        return _err("not_found", 404)
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        b = {}
    vid = re.sub(r"[^a-z0-9-]", "", str(b.get("vid") or ""))[:48]
    if len(vid) < 8:
        return _err("bad_vid")
    same = await db.qa_vote(qa_id, vid)
    if same is None:
        return _json({"ok": True, "same": int(r["same_count"] or 0), "already": True})
    return _json({"ok": True, "same": same})


async def admin_qa_list(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    status = request.query.get("status") or None
    rows = await db.qa_list(status)
    return _json({"ok": True, "items": [qa_svc.admin_json(r) for r in rows],
                  "counts": await db.qa_counts(), "tags": qa_svc.TAGS})


async def admin_qa_act(request: web.Request) -> web.Response:
    """Единая ручка модерации: publish|answer_quiet|save|reject|unpublish|pin|unpin|delete|ban."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    qa_id = int(request.match_info["id"])
    r = await db.qa_get(qa_id)
    if not r:
        return _err("not_found", 404)
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    action = str(b.get("action") or "")
    bot = request.app.get("bot")
    if action in ("publish", "answer_quiet"):
        res = await qa_svc.answer(
            bot, qa_id, str(b.get("answer") if b.get("answer") is not None else (r["answer"] or "")),
            publish=(action == "publish"),
            tag=b.get("tag"), question_edit=b.get("question"))
        if not res.get("ok"):
            return _err(res.get("error", "fail"))
        return _json({"ok": True, "qa": qa_svc.admin_json(res["qa"])})
    if action == "save":
        fields = {}
        if b.get("question") is not None:
            q_edit = qa_svc.sanitize(str(b["question"]))
            if len(q_edit) >= 10:
                fields["question"] = q_edit
        if b.get("answer") is not None:
            fields["answer"] = qa_svc.sanitize(str(b["answer"]), qa_svc.MAX_A)
        if b.get("tag") is not None and (b["tag"] in qa_svc.TAGS or b["tag"] == ""):
            fields["tag"] = b["tag"]
        if b.get("pseudonym") is not None:
            fields["pseudonym"] = qa_svc.sanitize(str(b["pseudonym"]), qa_svc.MAX_NAME)
        if fields:
            await db.qa_mark(qa_id, **fields)
    elif action == "reject":
        await db.qa_mark(qa_id, status="rejected")
    elif action == "unpublish":
        await db.qa_mark(qa_id, status="pending")
    elif action == "pin":
        await db.qa_mark(qa_id, pinned=1)
    elif action == "unpin":
        await db.qa_mark(qa_id, pinned=0)
    elif action == "delete":
        await db.qa_delete(qa_id)
        return _json({"ok": True, "deleted": True})
    elif action == "ban":
        await db.qa_ban(r["vid"] or "", r["ip"] or "",
                        note=f"qa#{qa_id} · {str(b.get('note') or '')[:200]}")
        await db.qa_mark(qa_id, status="rejected")
    else:
        return _err("bad_action")
    fresh = await db.qa_get(qa_id)
    return _json({"ok": True, "qa": qa_svc.admin_json(fresh) if fresh else None})


async def reviews_public(request: web.Request) -> web.Response:
    """Опубликованные отзывы — для reviews.html (без авторизации)."""
    rows = await db.reviews_public(30)
    return _json({"ok": True, "reviews": [{
        "rating": r["rating"], "text": r["text"],
        "author": r["author"] or "Клиент мастерской",
        "work_label": r["work_label"], "at": r["created_at"],
    } for r in rows]})


async def pricing_catalog(request: web.Request) -> web.Response:
    """Публичный versioned-контракт калькулятора для сайта и интеграций."""
    return _json({"ok": True, "catalog": config.PRICING_CATALOG})

# ------------------------------------------------------- «глаз бога» (админ)

async def _admin_user(request: web.Request):
    user = await _session_user(request)
    if not user or user["id"] not in config.ADMIN_IDS:
        return None
    # imp — режим чтения кабинета клиента, а не мандат на админку.
    # Раньше отсекался лишь на 4 ручках из ~50; теперь единообразно.
    if _sess_imp(user):
        return None
    return user


# ------------------------------------------------------- набор месяца (слоты)

_MONTHS_RU = ["январь", "февраль", "март", "апрель", "май", "июнь",
              "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]
_MSK = timezone(timedelta(hours=3))


async def _slots_taken() -> int:
    """Занятые места месяца — только НАСТОЯЩИЕ заявки.

    Дефицит у нас честный: квоту объявляет владелец как политику качества,
    а счётчик тикает от реальных заказов — рисованных цифр нет. Не считаются:
    отмены, корзина, архив, услуги, подписки, а также пробные дела самого
    мастера (ADMIN_IDS) и e2e-синтетика (users 900000000+).
    """
    start = datetime.now(_MSK).replace(day=1, hour=0, minute=0,
                                       second=0, microsecond=0)
    start_utc = start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
    admin_ph = ",".join("?" * len(config.ADMIN_IDS)) or "0"
    cur = await db.conn().execute(
        "SELECT count(*) n FROM orders WHERE created_at >= ? "
        "AND status != 'cancel' AND coalesce(deleted,0)=0 "
        "AND coalesce(archived_admin,0)=0 "
        "AND coalesce(work_type,'') NOT LIKE 'sub_%' "
        "AND coalesce(work_type,'') NOT LIKE 'svc_%' "
        f"AND coalesce(user_id,0) NOT IN ({admin_ph}) "
        "AND coalesce(user_id,0) NOT BETWEEN 900000000 AND 900000999",
        (start_utc, *config.ADMIN_IDS))
    return (await cur.fetchone())["n"]


async def _slots_extra() -> int:
    """Брони мастера — места, занятые заказами вне картотеки (личка, ВК).

    Это НЕ рисованные цифры: мастер отмечает реальные договорённости,
    которые ещё не оформлены заявкой на сайте. Хранится числом в settings,
    правится из веб-админки и командой /slots в боте.
    """
    try:
        return max(0, int(await db.setting_get("slots_extra") or 0))
    except ValueError:
        return 0


async def slots_state() -> dict:
    """Единая сводка набора месяца — для сайта, админки и бота."""
    try:
        quota = int(await db.setting_get("slots_quota") or 0)
    except ValueError:
        quota = 0
    auto = await _slots_taken()
    extra = await _slots_extra()
    now = datetime.now(_MSK)
    return {"quota": quota, "auto": auto, "extra": extra,
            "taken": auto + extra,
            "month": _MONTHS_RU[now.month - 1],
            "next": _MONTHS_RU[now.month % 12]}


async def slots_get(request: web.Request) -> web.Response:
    """Публичный виджет «набор месяца»: квота владельца + живой счётчик."""
    s = await slots_state()
    if s["quota"] <= 0:
        return _json({"ok": True, "on": False})
    return _json({"ok": True, "on": True,
                  "month": s["month"], "next": s["next"],
                  "quota": s["quota"], "taken": s["taken"]})


async def admin_slots(request: web.Request) -> web.Response:
    """Настройки набора: {"quota": N} и/или {"extra": M} — по отдельности."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    try:
        b = await request.json()
        assert isinstance(b, dict)
        if "quota" in b:
            await db.setting_set("slots_quota",
                                 str(max(0, min(500, int(b["quota"])))))
        if "extra" in b:
            await db.setting_set("slots_extra",
                                 str(max(0, min(500, int(b["extra"])))))
    except Exception:  # noqa: BLE001
        return _err("bad_json", 400)
    s = await slots_state()
    return _json({"ok": True, "quota": s["quota"], "taken": s["taken"],
                  "auto": s["auto"], "extra": s["extra"]})


# --------------------------------------------------------------- техработы

def _maint_site_on() -> bool:
    return any(os.path.exists(p) for p in config.MAINT_FLAGS)


async def _maint_state() -> dict:
    return {"site": _maint_site_on(),
            "bot": (await db.setting_get("bot_maint")) == "1"}


async def admin_maintenance(request: web.Request) -> web.Response:
    """Рубильники техработ: сайт (файл-флаг для nginx) и бот (setting).

    POST {"site": true|false} и/или {"bot": true|false}; GET — состояние.
    Сайт закрывается только для страниц: /api, /assets и админка живут,
    заявки и кабинет мастера работают даже за опущенным занавесом.
    """
    if not await _admin_user(request):
        return _err("forbidden", 403)
    if request.method == "POST":
        try:
            b = await request.json()
            assert isinstance(b, dict)
        except Exception:  # noqa: BLE001
            return _err("bad_json", 400)
        if "site" in b:
            on = bool(b["site"])
            for p in config.MAINT_FLAGS:
                try:
                    if on:
                        with open(p, "w", encoding="utf-8") as f:
                            f.write(db.now_iso() + "\n")
                    elif os.path.exists(p):
                        os.remove(p)
                except OSError as e:
                    log.warning("maintenance flag %s: %s", p, e)
        if "bot" in b:
            await db.setting_set("bot_maint", "1" if b["bot"] else "0")
    return _json({"ok": True, "maintenance": await _maint_state()})


def _admin_order_row(o, client=None, unread: int = 0) -> dict:
    d = _order_json(o, unread=unread)
    d["source"] = o["source"]
    d["admin_note"] = o["admin_note"]
    d["archived_admin"] = bool(o["archived_admin"])
    d["pinned"] = bool(_row_get_w(o, "pinned_admin"))
    d["color"] = _row_get_w(o, "color") or ""
    d["deleted"] = bool(_row_get_w(o, "deleted"))
    if o["user_id"]:
        d["client"] = {"id": o["user_id"],
                       "name": (client["first_name"] if client else None) or "клиент",
                       "username": client["username"] if client else None,
                       "email": client["email"] if client else None,
                       "links": texts.contact_links(f"@{client['username']}" if client and client["username"] else "")
                       or ([("Профиль Telegram", f"tg://user?id={o['user_id']}")] if o["user_id"] > 0 else [])}
    else:
        d["client"] = {"guest": True, "name": o["guest_name"] or "гость",
                       "contact": o["guest_contact"],
                       "links": texts.contact_links(o["guest_contact"])}
    return d


async def admin_overview(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    w, mo = await db.stats(7), await db.stats(30)
    events = await db.events_recent(14)
    cur = await db.conn().execute(
        "SELECT count(DISTINCT p.order_id) n FROM payments p "
        "JOIN orders o ON o.id = p.order_id "
        "WHERE p.status='claimed' AND coalesce(o.deleted,0)=0 "
        "AND coalesce(o.archived_admin,0)=0")
    claimed_n = (await cur.fetchone())["n"]
    cur = await db.conn().execute(
        "SELECT count(*) n FROM reviews WHERE status='pending'")
    reviews_pending = (await cur.fetchone())["n"]
    cur = await db.conn().execute(
        "SELECT count(*) n FROM subscriptions WHERE status='active' AND expires_at > ?",
        (db.now_iso(),))
    subs_active = (await cur.fetchone())["n"]
    subs_pend = await db.subs_pending()
    subs_claimed_n = sum(1 for s in subs_pend if s["claimed_at"])
    # выручка по неделям (подтверждённые платежи), 8 недель: старые → новые
    now = datetime.now(timezone.utc)
    monday = now - timedelta(days=now.weekday())
    monday = monday.replace(hour=0, minute=0, second=0, microsecond=0)
    weeks = []
    for i in range(7, -1, -1):
        w0 = monday - timedelta(weeks=i)
        w1 = w0 + timedelta(weeks=1)
        cur = await db.conn().execute(
            "SELECT coalesce(sum(p.amount),0) s, count(*) n FROM payments p "
            "LEFT JOIN orders o ON o.id = p.order_id "
            "WHERE p.status='paid' AND coalesce(o.deleted,0)=0 "
            "AND coalesce(p.paid_at, p.created_at) >= ? "
            "AND coalesce(p.paid_at, p.created_at) < ?",
            (w0.strftime("%Y-%m-%dT%H:%M:%S"), w1.strftime("%Y-%m-%dT%H:%M:%S")))
        r = await cur.fetchone()
        weeks.append({"start": w0.strftime("%d.%m"), "revenue": r["s"], "pays": r["n"]})
    visits = await db.visits_stats(hide_users=tuple(config.ADMIN_IDS))
    return _json({"ok": True,
                  "visits": visits,
                  "weeks": weeks,
                  "by_status": mo["by_status"],
                  "week": {"new": w["new_n"] or 0, "done": w["done_n"] or 0,
                           "revenue": w["done_sum"] or 0},
                  "month": {"new": mo["new_n"] or 0, "done": mo["done_n"] or 0,
                            "revenue": mo["done_sum"] or 0},
                  "users": mo["users"], "leads": mo["leads"],
                  "claimed": claimed_n, "reviews_pending": reviews_pending,
                  "subs_active": subs_active,
                  "subs_pending": len(subs_pend), "subs_claimed": subs_claimed_n,
                  "gifts": await gift_svc.stats(),
                  "qa": await db.qa_counts(),
                  "oauth": {"vk": bool(_oauth_conf("vk")),
                            "mailru": bool(_oauth_conf("mailru"))},
                  "requisites": await db.setting_get("requisites"),
                  "pay_online": bool(config.pay_provider()),
                  "mail_configured": config.mail_on(),
                  "mail_on": await mailer.smtp_reachable(),
                  "mail_error": mailer.smtp_error(),
                  "group_forum": (await db.setting_get("group_forum")) == "1",
                  "group_chat_id": await grp.chat_id(),
                  "maintenance": await _maint_state(),
                  "slots": await slots_state(),
                  "slots_quota": int(await db.setting_get("slots_quota") or 0),
                  "slots_taken": await _slots_taken() + await _slots_extra(),
                  "events": [{"order_id": e["order_id"], "kind": e["kind"],
                              "data": e["data"], "at": e["created_at"],
                              "label": e["work_label"]} for e in events]})


async def admin_orders(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    status = request.query.get("status", "")
    q = request.query.get("q", "").strip()[:80]
    not_del = "coalesce(deleted,0)=0"
    not_arch = f"coalesce(archived_admin,0)=0 AND {not_del}"
    pin1 = "coalesce(pinned_admin,0) DESC, "  # закреплённые всегда сверху
    if q:
        orders = await db.search_orders(q, limit=100)
        # поиск сочетается с фильтром: q ищет, status сужает
        if status in config.ST:
            orders = [o for o in orders if o["status"] == status]
        elif status == "active":
            orders = [o for o in orders if o["status"] in config.ACTIVE_STATUSES]
        elif status == "archive":
            orders = [o for o in orders if o["archived_admin"]]
        elif status == "trash":
            orders = [o for o in orders if o["deleted"]]
        if status != "trash":
            orders = [o for o in orders if not o["deleted"]]
    elif status == "trash":
        orders = await db.orders_where(
            "WHERE coalesce(deleted,0)=1 ORDER BY id DESC LIMIT 200")
    elif status == "archive":
        orders = await db.orders_where(
            f"WHERE coalesce(archived_admin,0)=1 AND {not_del} "
            "ORDER BY id DESC LIMIT 200")
    elif status == "active":
        qmarks = ",".join("?" * len(config.ACTIVE_STATUSES))
        orders = await db.orders_where(
            f"WHERE status IN ({qmarks}) AND {not_arch} "
            f"ORDER BY {pin1}id DESC LIMIT 100",
            config.ACTIVE_STATUSES)
    elif status == "attention":
        # требует действий мастера: новые, отмеченные оплаты, правки
        orders = await db.orders_where(
            "WHERE (status IN ('new','fix') OR id IN "
            " (SELECT order_id FROM payments WHERE status='claimed')) "
            f"AND {not_arch} ORDER BY {pin1}id DESC LIMIT 100")
    elif status in config.ST:
        orders = await db.orders_where(
            f"WHERE status=? AND {not_arch} ORDER BY {pin1}id DESC LIMIT 100",
            (status,))
    else:
        orders = await db.orders_where(
            f"WHERE {not_arch} ORDER BY {pin1}id DESC LIMIT 150")
    # отметки «клиент заявил оплату» — для бейджей списка одним запросом
    ids = [o["id"] for o in orders]
    claimed_ids: set[int] = set()
    if ids:
        qmarks = ",".join("?" * len(ids))
        cur = await db.conn().execute(
            f"SELECT DISTINCT order_id FROM payments WHERE status='claimed' "
            f"AND order_id IN ({qmarks})", ids)
        claimed_ids = {r["order_id"] for r in await cur.fetchall()}
    unread = await db.unread_for_orders(ids)
    out = []
    for o in orders:
        client = await db.get_user(o["user_id"]) if o["user_id"] else None
        row = _admin_order_row(o, client, unread.get(o["id"], 0))
        row["claimed"] = o["id"] in claimed_ids
        out.append(row)
    return _json({"ok": True, "orders": out})


async def admin_order_get(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    o = await db.get_order(int(request.match_info["id"]))
    if not o:
        return _err("not_found", 404)
    d = await _order_full_json(o)
    client = await db.get_user(o["user_id"]) if o["user_id"] else None
    d.update(_admin_order_row(o, client))
    d["details"] = o["details"]
    d["deadline_date"] = o["deadline_date"]
    d["consent_at"] = o["consent_at"]
    d["consent_doc"] = o["consent_doc"]
    d["page"] = o["page"]
    d["topic_id"] = o["topic_id"]
    events = await db.events_for_order(o["id"], limit=20)
    d["events"] = [{"kind": e["kind"], "data": e["data"], "at": e["created_at"]}
                   for e in events]
    d["requisites"] = await db.setting_get("requisites")
    # полный контекст клиента: бонусы, рефералы, кто пригласил, бан
    if o["user_id"] and client:
        refs = await db.referrals_of(o["user_id"])
        inviter = await db.get_user(client["referrer_id"]) if client["referrer_id"] else None
        d["client_intel"] = {
            "bonus": await bonus.summary(o["user_id"]),
            "banned": bool(client["banned"]),
            "welcome_at": client["welcome_at"],
            "referrals": len(refs),
            "referrer": ({"id": inviter["id"], "name": inviter["first_name"],
                          "username": inviter["username"]} if inviter else None),
            "since": client["created_at"],
        }
    off = await db.offer_by_order(o["id"])
    if off:
        d["offer"] = {
            "id": off["id"], "code": off["code"], "version": off["version"],
            "status": off["status"], "opens": off["opens"] or 0,
            "opened_at": off["opened_at"], "paid_at": off["paid_at"],
            "expires_at": off["expires_at"],
            "url": f"{config.SITE_URL}/zayavka.html#k={off['code']}",
            "greet_name": off["greet_name"], "intro": off["intro"],
            "volume": off["volume"], "reqs_short": off["reqs_short"],
            "reqs_full": off["reqs_full"], "tier_label": off["tier_label"],
            "tier_full": off["tier_full"], "need_files": off["need_files"],
            "incl": off["incl_json"], "ledger": off["ledger_json"],
            "rail": off["rail_json"],
            "specification": _json_dict(_row_get_w(off, "specification_json")),
            "specification_lines":
                (_json_dict(_row_get_w(off, "specification_json")).get("lines") or []),
            "specification_meta": {
                "revision": _row_get_w(off, "specification_revision") or off["version"] or 1,
                "data_sha256": _row_get_w(off, "specification_hash") or "",
                "pdf_sha256": _row_get_w(off, "specification_pdf_hash") or "",
                "pdf_size": _row_get_w(off, "specification_pdf_size") or 0,
            },
            # почта, оставленная клиентом при оплате: мастер сверяет её
            # с перепиской и включает полноценные письма кнопкой mail_on
            "notify_to": off["notify_to"] or "",
            "mail_enabled": bool((o["guest_contact"] or "").strip()),
        }
    # Обе ссылки нужны мастеру всегда: сайт — резервный доступ, bot_claim —
    # приглашение, которое привязывает Telegram к ЭТОМУ делу без дубля.
    if o["access_token"]:
        d["claim_url"] = f"{config.SITE_URL}/dashboard.html#claim={o['access_token']}"
        d["bot_claim_url"] = (f"https://t.me/{config.BOT_USERNAME}"
                               f"?start=claim_{o['access_token']}")
    return _json({"ok": True, "order": d})


async def admin_order_sync_tg(request: web.Request) -> web.Response:
    """По явному нажатию мастера прислать клиенту живую карточку дела."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    o = await db.get_order(order_id)
    if not o:
        return _err("not_found", 404)
    # Явная синхронизация одновременно отзывает старую ссылку, которую могли
    # переслать до привязки Telegram. В новом сообщении клиент получает свежую.
    await db.rotate_access_token(order_id)
    res = await notify.order_snapshot(
        request.app["bot"], order_id,
        "📌 Мастерская прислала актуальную карточку вашего дела. Все новые "
        "сообщения и готовые файлы будут приходить сюда и появляться на сайте.")
    if not res.get("ok"):
        return _json(res, status=409)
    return _json({"ok": True, "delivered_tg": True,
                  "order": await _order_full_json(await db.get_order(order_id))})


async def admin_confirm_payment(request: web.Request) -> web.Response:
    """Кнопка «Оплата получена»: двигает статус и начисляет бонусы."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    o = await db.get_order(order_id)
    if not o:
        return _err("not_found", 404)
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        b = {}
    try:
        requested_id = int(b.get("pay_id") or 0)
        requested_kind = str(b["kind"])
        requested_amount = int(b["amount"])
    except (KeyError, TypeError, ValueError):
        return _err("payment_target_required", 409)
    pays = await db.payments_for_order(order_id)
    kind, amount = payments.confirm_target(o, pays)
    if requested_kind != kind or requested_amount != amount or amount <= 0:
        return _err("payment_mismatch", 409)
    claimed = [p for p in pays if p["status"] == "claimed"]
    if len(claimed) > 1:
        return _err("payment_target_ambiguous", 409)
    candidates = claimed or [
        p for p in pays if p["status"] == "pending" and p["kind"] == kind
        and int(p["amount"] or 0) == amount
    ]
    target = next((p for p in candidates if p["id"] == requested_id), None) \
        if requested_id else (candidates[-1] if candidates else None)
    if requested_id and not target:
        return _err("payment_mismatch", 409)
    bot: Bot = request.app["bot"]
    conducted = await payments.confirm(
        bot, order_id, kind, amount, actor="глаз бога",
        pay_id=target["id"] if target else None, allow_create=target is None)
    if not conducted.get("ok") or conducted.get("duplicate_callback"):
        return _err(conducted.get("error") or "payment_already_processed", 409)
    await grp.send(bot, order_id,
                   f"✅ Оплата подтверждена: {config.fmt_money(amount)} ₽ "
                   f"({payments.stage_label(o, kind).lower()}).")
    await grp.status_sync(bot, order_id)
    o = await db.get_order(order_id)
    return _json({"ok": True, "order": await _order_full_json(o)})


# ------------------------------------------------- подписки в админке

async def _admin_sub_row(s) -> dict:
    d = await subs.sub_json(s)
    u = await db.get_user(s["user_id"])
    d["user"] = {"id": s["user_id"],
                 "name": (u["first_name"] if u else None) or "клиент",
                 "username": u["username"] if u else None,
                 "email": u["email"] if u else None}
    d["via"] = _sub_row_get(s, "via")
    d["claimed_at"] = _sub_row_get(s, "claimed_at")
    d["expires_at"] = s["expires_at"]
    return d


def _sub_row_get(s, key: str):
    try:
        return s[key]
    except (KeyError, IndexError):
        return None


async def admin_subs(request: web.Request) -> web.Response:
    """Подписки для админки: ждущие сверки + действующие."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    pending = [await _admin_sub_row(s) for s in await db.subs_pending()]
    active = [await _admin_sub_row(s) for s in await db.subs_active_list()]
    return _json({"ok": True, "pending": pending, "active": active})


async def admin_sub_confirm(request: web.Request) -> web.Response:
    """«Оплата подписки получена» — активация из веб-админки."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    sub_id = int(request.match_info["id"])
    s = await subs.activate_paid(request.app["bot"], sub_id,
                                 method="manual", actor="глаз бога")
    if not s:
        return _err("sub_state")
    return _json({"ok": True, "sub": await _admin_sub_row(s)})


async def admin_sub_cancel(request: web.Request) -> web.Response:
    """Закрыть неоплаченное оформление из админки (клиент пропал/ошибся)."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    s = await db.sub_get(int(request.match_info["id"]))
    if not s:
        return _err("not_found", 404)
    if not await subs.cancel_pending(request.app["bot"], s, by="admin"):
        return _err("sub_state")
    return _json({"ok": True})


# ---------------------------------------------- админ: сертификаты

async def _admin_gift_row(g) -> dict:
    bal = await db.gift_balance(g["id"])
    st = gift_svc.state(g, bal)
    return {
        "id": g["id"], "code": g["code"], "amount": g["amount"], "balance": bal,
        "state": st, "state_label": gift_svc.STATE_LABEL.get(st, st),
        "status": g["status"],
        "buyer_name": g["buyer_name"], "buyer_contact": g["buyer_contact"],
        "buyer_user_id": g["buyer_user_id"],
        "recip_name": g["recip_name"], "recip_contact": g["recip_contact"],
        "congrats": g["congrats"], "note": g["note"], "via": g["via"],
        "claimed": bool(g["claimed_at"]), "pay_method": g["pay_method"],
        "deliver_at": g["deliver_at"], "delivered": bool(g["delivered_at"]),
        "created_at": g["created_at"], "paid_at": g["paid_at"],
        "expires_at": g["expires_at"], "expires_ru": gift_svc.ru_date(g["expires_at"]),
        "block_note": g["block_note"],
    }


async def admin_gifts(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    rows = await db.gifts_list()
    items = [await _admin_gift_row(g) for g in rows]
    return _json({"ok": True, "gifts": items, "stats": await gift_svc.stats()})


async def admin_gift_get(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    g = await db.gift_get(int(request.match_info["id"]))
    if not g:
        return _err("not_found", 404)
    d = await _admin_gift_row(g)
    d["ledger"] = [{
        "id": r["id"], "delta": r["delta"], "kind": r["kind"],
        "order_id": r["order_id"], "note": r["note"], "at": r["created_at"],
    } for r in await db.gift_rows(g["id"])]
    d["orders"] = [{"id": o["id"], "work_label": o["work_label"],
                    "status": o["status"], "gift_amount": o["gift_amount"] or 0}
                   for o in await db.gift_orders(g["id"])]
    return _json({"ok": True, "gift": d})


async def admin_gift_create(request: web.Request) -> web.Response:
    """Выпуск сертификата мастером: комплимент или продажа вне сайта."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    try:
        amount = int(b.get("amount") or 0)
    except (TypeError, ValueError):
        return _err("bad_amount")
    if not 500 <= amount <= gift_svc.MAX_AMOUNT:  # мастеру можно и мелкий комплимент
        return _err("bad_amount")
    recip_contact = str(b.get("recip_contact") or "")[:200].strip()
    if recip_contact and not mailer.looks_email(recip_contact):
        return _err("bad_recip_email")
    g = await gift_svc.issue_manual(
        request.app["bot"], amount=amount,
        recip_name=str(b.get("recip_name") or "")[:120].strip(),
        recip_contact=recip_contact,
        congrats=str(b.get("congrats") or "")[:280].strip(),
        note=str(b.get("note") or "")[:300].strip())
    return _json({"ok": True, "gift": await _admin_gift_row(g)})


async def admin_gift_action(request: web.Request) -> web.Response:
    """Действия мастера: confirm|cancel|block|unblock|extend|adjust|resend."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    gift_id = int(request.match_info["id"])
    g = await db.gift_get(gift_id)
    if not g:
        return _err("not_found", 404)
    act = request.match_info["act"]
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        b = {}
    bot: Bot = request.app["bot"]
    if act == "confirm":
        g2 = await gift_svc.activate_paid(bot, gift_id, method="manual", actor="мастер")
        if not g2:
            return _err("gift_state")
    elif act == "cancel":
        if not await gift_svc.cancel_pending(bot, g, by="admin"):
            return _err("gift_state")
    elif act == "block":
        if not await gift_svc.block(bot, gift_id, str(b.get("note") or "")[:300]):
            return _err("gift_state")
    elif act == "unblock":
        if not await gift_svc.unblock(gift_id):
            return _err("gift_state")
    elif act == "extend":
        try:
            days = max(1, min(int(b.get("days") or 90), 730))
        except (TypeError, ValueError):
            days = 90
        if not await gift_svc.extend(gift_id, days):
            return _err("gift_state")
    elif act == "adjust":
        try:
            delta = int(b.get("delta") or 0)
        except (TypeError, ValueError):
            return _err("bad_amount")
        if not delta:
            return _err("bad_amount")
        await gift_svc.adjust(gift_id, delta, str(b.get("note") or "")[:300])
    elif act == "resend":
        g2 = await db.gift_get(gift_id)
        sent_b = await mailer.gift_event(g2, "paid_buyer")
        sent_r = False
        if g2["recip_contact"]:
            sent_r = await mailer.gift_event(g2, "recipient")
            if sent_r and not g2["delivered_at"]:
                await db.gift_mark(gift_id, delivered_at=db.now_iso())
        if not (sent_b or sent_r):
            return _err("mail_off")
    else:
        return _err("bad_action")
    g = await db.gift_get(gift_id)
    return _json({"ok": True, "gift": await _admin_gift_row(g)})


async def admin_order_cancel(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    o = await db.get_order(order_id)
    if not o:
        return _err("not_found", 404)
    try:
        b = await request.json()
        reason = str(b.get("reason") or "").strip()[:500]
    except Exception:  # noqa: BLE001
        reason = ""
    restored = await bonus.restore_for_order(o, "возврат бонусов при отмене")
    await db.update_order(order_id, cancel_reason=reason or None)
    await db.set_status(order_id, "cancel", "закрыт мастером" + (f" · {reason}" if reason else ""))
    await db.payments_cancel_pending(order_id)  # открытые кассы больше не действуют
    bot: Bot = request.app["bot"]
    await gift_svc.sync_order(bot, order_id)  # зачёт — обратно на сертификат
    # живая заявка-ссылка закрытого дела обязана погаснуть: иначе лист
    # остаётся «К оплате», а клик отвечает бессмысленным pay_stage
    off_live = await db.offer_by_order(order_id)
    if off_live and off_live["status"] == "live":
        await db.offer_update(off_live["id"], status="canceled")
        await db.add_event(order_id, "offer_canceled", "дело закрыто мастером")
    # почтовому клиенту и гостю с включёнными письмами — письмо о закрытии
    # (resume_order такое письмо шлёт, закрытие молчало)
    fresh_o = await db.get_order(order_id)
    await mailer.order_event(fresh_o, "status")
    if o["user_id"]:
        await notify.notify_client(
            bot, o["user_id"],
            f"🚫 Заказ №{order_id} закрыт мастерской."
            + (f" Причина: {esc(reason)}." if reason else "")
            + " Если хотите вернуться к нему — напишите нам или нажмите «Возобновить» в кабинете."
            + (f"\n💎 Бонусы возвращены: {restored}." if restored else ""))
    await grp.send(bot, order_id, f"🚫 Заказ №{order_id} закрыт мастером."
                   + (f" Причина: {esc(reason)}" if reason else ""))
    await grp.status_sync(bot, order_id)
    o = await db.get_order(order_id)
    return _json({"ok": True, "order": await _order_full_json(o)})


async def admin_order_resume(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    o = await db.get_order(order_id)
    if not o:
        return _err("not_found", 404)
    bot: Bot = request.app["bot"]
    res = await flow.resume_order(bot, order_id, "мастер", via="админка", by_master=True)
    if not res.get("ok"):
        return _err("not_canceled")
    o = await db.get_order(order_id)
    return _json({"ok": True, "order": await _order_full_json(o)})


_ORDER_COLORS = ("", "red", "gold", "green", "blue", "violet")


async def admin_orders_flag(request: web.Request) -> web.Response:
    """Рабочий стол мастера: закрепить / цветная метка / скрыть / корзина.

    Принимает один id или пачку — массовые действия те же. «Удалить» —
    мягкая корзина (deleted=1): данные не стираются, заказ можно вернуть.
    """
    if not await _admin_user(request):
        return _err("forbidden", 403)
    try:
        b = await request.json()
        assert isinstance(b, dict)
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    ids = b.get("ids") if isinstance(b.get("ids"), list) else [b.get("id")]
    try:
        ids = [int(x) for x in ids if x][:100]
    except (TypeError, ValueError):
        return _err("bad_ids")
    if not ids:
        return _err("bad_ids")
    fields: dict = {}
    ev = None
    if "pin" in b:
        fields["pinned_admin"] = 1 if b["pin"] else 0
    if "color" in b:
        color = str(b["color"] or "")[:10]
        if color not in _ORDER_COLORS:
            return _err("bad_color")
        fields["color"] = color or None
    if "hide" in b:
        fields["archived_admin"] = 1 if b["hide"] else 0
        ev = ("admin_archive", "скрыт с рабочего стола" if b["hide"] else "возвращён из архива")
    if "delete" in b:
        if b["delete"]:
            fields["deleted"] = 1
            fields["pinned_admin"] = 0
            ev = ("admin_trash", "заказ убран в корзину")
            # незакрытые счета гасим: иначе клиент с открытой кассой оплатил бы
            # дело, которое для него уже 404 (деньги пришли — доступа нет)
            for _oid in ids:
                await db.payments_cancel_pending(_oid)
        else:
            fields["deleted"] = 0
            ev = ("admin_trash", "заказ восстановлен из корзины")
    if b.get("purge"):
        # стереть навсегда: только из корзины и только без реальных оплат —
        # оплаченные дела остаются учётом (чеки НПД, спорные ситуации)
        bot: Bot = request.app["bot"]
        purged, kept = 0, 0
        for oid in ids:
            o = await db.get_order(oid)
            if not o or not o["deleted"]:
                kept += 1
                continue
            pays = await db.payments_for_order(oid)
            if any(p["status"] == "paid" for p in pays):
                kept += 1
                continue
            if (o["gift_amount"] or 0) > 0 or o["gift_code"]:
                await gift_svc.detach_from_order(bot, oid)  # зачёт — обратно на код
            if o["bonus_spent"]:
                await bonus.restore_for_order(o, "возврат бонусов: дело стёрто")
            await db.purge_order(oid)
            purged += 1
        return _json({"ok": True, "done": purged, "kept": kept})
    if not fields:
        return _err("nothing_to_do")
    done = 0
    for oid in ids:
        o = await db.get_order(oid)
        if not o:
            continue
        await db.update_order(oid, **fields)
        if ev:
            await db.add_event(oid, ev[0], ev[1])
        done += 1
    db.bus_bump()
    return _json({"ok": True, "done": done})


async def admin_order_archive(request: web.Request) -> web.Response:
    """Мягкий архив мастера: заказ уходит с глаз, возвращается одной кнопкой."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    o = await db.get_order(order_id)
    if not o:
        return _err("not_found", 404)
    try:
        b = await request.json()
        on = bool(b.get("on"))
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    await db.update_order(order_id, archived_admin=1 if on else 0)
    await db.add_event(order_id, "admin_archive", "в архив" if on else "из архива")
    o = await db.get_order(order_id)
    return _json({"ok": True, "order": await _order_full_json(o)})


async def admin_order_final_ready(request: web.Request) -> web.Response:
    """«Финал готов»: клиенту счёт на остаток, файл придерживается до оплаты."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    bot: Bot = request.app["bot"]
    res = await flow.final_ready(bot, order_id, via="админка")
    if not res.get("ok"):
        return _err(res.get("error") or "fail")
    o = await db.get_order(order_id)
    return _json({"ok": True, "due": res.get("due", 0),
                  "order": await _order_full_json(o)})


async def admin_order_remind_pay(request: web.Request) -> web.Response:
    """«Напомнить об оплате»: клиенту заново уходит счёт созревшего этапа."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    bot: Bot = request.app["bot"]
    res = await flow.remind_payment(bot, order_id, via="админка")
    if not res.get("ok"):
        return _err(res.get("error") or "remind_failed")
    o = await db.get_order(order_id)
    return _json({"ok": True, "due": res["due"], "label": res["label"],
                  "delivered_tg": res.get("delivered_tg"), "mailed": res.get("mailed"),
                  "order": await _order_full_json(o)})


async def admin_order_fix_ack(request: web.Request) -> web.Response:
    """«Взял правки в работу» из веб-админки — тот же честный сигнал клиенту,
    что и кнопка на TG-алерте (раньше из браузера его было не послать)."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    bot: Bot = request.app["bot"]
    res = await flow.ack_fixes(bot, order_id, via="админка")
    if not res.get("ok"):
        return _err(res.get("error") or "ack_failed")
    o = await db.get_order(order_id)
    return _json({"ok": True, "order": await _order_full_json(o)})


async def admin_order_part_ready(request: web.Request) -> web.Response:
    """«Часть готова»: клиенту счёт этапа за часть, файл придерживается до оплаты."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    bot: Bot = request.app["bot"]
    res = await flow.part_ready(bot, order_id, via="админка")
    if not res.get("ok"):
        return _err(res.get("error") or "fail")
    o = await db.get_order(order_id)
    return _json({"ok": True, "due": res.get("due", 0), "part": res.get("part"),
                  "paid_already": bool(res.get("paid_already")),
                  "order": await _order_full_json(o)})


async def events_poll(request: web.Request) -> web.Response:
    """Long-poll шины изменений: ответ приходит сразу при любом движении по
    делам (или через 25 с тишины). Сайт и админка слушают его вместо частого
    поллинга — обновления мгновенные, нагрузка ниже. Данных не несёт."""
    try:
        since = int(request.query.get("since") or 0)
    except ValueError:
        since = 0
    v = await db.bus_wait(since, timeout=25.0)
    return _json({"ok": True, "v": v})


# ------------------------------------------------- вход мастера по ссылке

# одноразовые ключи входа из бота: {key: (admin_id, годен_до_unixtime)}
_ADMIN_LOGIN_KEYS: dict[str, tuple[int, float]] = {}


def admin_login_key(user_id: int) -> str:
    """Ключ для /panel в боте: 10 минут, одно использование."""
    now = time.time()
    for k in [k for k, v in _ADMIN_LOGIN_KEYS.items() if v[1] < now]:
        _ADMIN_LOGIN_KEYS.pop(k, None)
    key = secrets.token_urlsafe(32)
    _ADMIN_LOGIN_KEYS[key] = (user_id, now + 600)
    return key


async def admin_login(request: web.Request) -> web.Response:
    """Обмен одноразового ключа из бота на сессию кабинета мастера."""
    if not _rate_ok(_ip(request), cost=3):
        return _err("rate_limit", 429)
    try:
        b = await request.json()
        key = str(b.get("key") or "")
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    rec = _ADMIN_LOGIN_KEYS.pop(key, None) if key else None
    if not rec or rec[1] < time.time() or rec[0] not in config.ADMIN_IDS:
        return _err("bad_key", 403)
    user = await db.get_user(rec[0])
    if not user:
        return _err("bad_key", 403)
    token = await db.session_create(user["id"])
    return _json({"ok": True, "token": token,
                  "user": {"id": user["id"],
                           "name": user["first_name"] or "Мастер",
                           "username": user["username"]}})


# --------------------------------------------------------------- рассылка

# состояние текущей рассылки (процесс один — память надёжна в рамках запуска)
_BROADCAST = {"running": False, "total": 0, "sent": 0, "failed": 0,
              "finished_at": None, "segment": "", "started_by": 0}

_SEGMENT_SQL = {
    "all": ("SELECT id FROM users WHERE id > 0 AND coalesce(banned,0)=0 "
            "AND coalesce(subscribed,0)=1 AND subscribed_at IS NOT NULL"),
    "active": ("SELECT DISTINCT u.id FROM users u JOIN orders o ON o.user_id=u.id "
               "WHERE u.id > 0 AND coalesce(u.banned,0)=0 AND coalesce(u.subscribed,0)=1 AND u.subscribed_at IS NOT NULL "
               "AND o.status IN ('new','priced','prepay','work','check','fix')"),
    "done": ("SELECT DISTINCT u.id FROM users u JOIN orders o ON o.user_id=u.id "
             "WHERE u.id > 0 AND coalesce(u.banned,0)=0 AND coalesce(u.subscribed,0)=1 AND u.subscribed_at IS NOT NULL "
             "AND o.status='done'"),
}


async def _segment_ids(segment: str) -> list[int]:
    cur = await db.conn().execute(_SEGMENT_SQL.get(segment, _SEGMENT_SQL["all"]))
    return [r["id"] for r in await cur.fetchall()]


async def _broadcast_run(bot: Bot, ids: list[int], text: str) -> None:
    """Фоновая отправка: щадящий темп, отчёт мастеру по завершении."""
    footer = "\n\n🔕 Отписаться от новостей: /stopnews"
    for uid in ids:
        try:
            await bot.send_message(uid, text + footer, parse_mode=None,
                                   disable_web_page_preview=True)
            _BROADCAST["sent"] += 1
        except Exception:  # noqa: BLE001 — заблокировал бота и т.п.
            _BROADCAST["failed"] += 1
        await asyncio.sleep(0.08)  # ~12 сообщений в секунду — с запасом до лимитов
    _BROADCAST["running"] = False
    _BROADCAST["finished_at"] = db.now_iso()
    await notify.notify_admins(
        bot, f"📣 Рассылка завершена: доставлено {_BROADCAST['sent']}, "
             f"недоставлено {_BROADCAST['failed']} (блокировки и удалённые аккаунты).")


async def admin_broadcast_preview(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    segment = request.query.get("segment", "all")
    ids = await _segment_ids(segment)
    return _json({"ok": True, "segment": segment, "count": len(ids),
                  "running": _BROADCAST["running"], "state": _BROADCAST})


async def admin_broadcast(request: web.Request) -> web.Response:
    user = await _admin_user(request)
    if not user:
        return _err("forbidden", 403)
    try:
        b = await request.json()
        text = str(b.get("text") or "").strip()[:3500]
        segment = str(b.get("segment") or "all")
        test = bool(b.get("test"))
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    if not text:
        return _err("empty")
    bot: Bot = request.app["bot"]
    if test:  # проба на себя — без футера статистики не портим
        try:
            await bot.send_message(user["id"],
                                   "📣 <b>Тест рассылки — так увидит клиент:</b>")
            await bot.send_message(user["id"], text + "\n\n🔕 Отписаться от новостей: /stopnews",
                                   parse_mode=None, disable_web_page_preview=True)
        except Exception:  # noqa: BLE001
            return _err("send_failed")
        return _json({"ok": True, "test": True})
    if _BROADCAST["running"]:
        return _err("busy")
    ids = await _segment_ids(segment)
    if not ids:
        return _err("empty_segment")
    _BROADCAST.update(running=True, total=len(ids), sent=0, failed=0,
                      finished_at=None, segment=segment, started_by=user["id"])
    await db.add_event(None, "broadcast", f"{segment} · {len(ids)} получателей")
    asyncio.get_running_loop().create_task(_broadcast_run(bot, ids, text))
    return _json({"ok": True, "total": len(ids)})


async def admin_broadcast_status(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    return _json({"ok": True, "state": _BROADCAST})


async def admin_order_pause(request: web.Request) -> web.Response:
    """Пауза мастера: дело придержано, клиенту — честное уведомление."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    o = await db.get_order(order_id)
    if not o:
        return _err("not_found", 404)
    try:
        b = await request.json()
        on = bool(b.get("on"))
        note = str(b.get("note") or "").strip()[:300]
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    if on and o["status"] not in config.ACTIVE_STATUSES:
        return _err("pause_state")
    bot: Bot = request.app["bot"]
    no = f"№{order_id}"
    if on:
        await db.update_order(order_id, paused=1, paused_by="admin",
                              paused_at=db.now_iso())
        await db.add_event(order_id, "paused", ("мастер · " + note) if note else "мастер")
        if note:
            # причину — в ленту дела: гость без Telegram видел голую плашку
            # «мастер приостановил» и не знал, чего от него ждут
            await db.msg_add(order_id, "master",
                             f"⏸ Дело на паузе: {note}")
            await mailer.master_message(order_id)
        if o["user_id"]:
            await notify.notify_client(
                bot, o["user_id"],
                f"⏸ Мастер поставил заказ {no} на паузу"
                + (f": «{esc(note)}»" if note else "") +
                ".\nЭто не отмена — работа продолжится, как только всё прояснится. "
                "Вопросы можно задать прямо здесь.")
        await grp.send(bot, order_id, f"⏸ Мастер поставил {no} на паузу"
                       + (f": «{esc(note)}»" if note else "") + ".")
    else:
        await db.update_order(order_id, paused=0, paused_by=None)
        await db.add_event(order_id, "unpaused", "мастер")
        if o["user_id"]:
            await notify.notify_client(
                bot, o["user_id"],
                f"▶️ Заказ {no} снят с паузы — продолжаем работу. "
                "Обо всех изменениях сообщим здесь.")
        await grp.send(bot, order_id, f"▶️ Мастер снял {no} с паузы.")
    o = await db.get_order(order_id)
    return _json({"ok": True, "order": await _order_full_json(o)})


async def admin_order_plan(request: web.Request) -> web.Response:
    """Сменить план сдачи: 1 — одна выдача, 2 — 50/50, 3 — 30/40/30."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    o = await db.get_order(order_id)
    if not o:
        return _err("not_found", 404)
    try:
        b = await request.json()
        stages = int(b.get("stages"))
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    if stages not in (1, 2, 3):
        return _err("bad_plan")
    pays = await db.payments_for_order(order_id)
    if any(p["status"] == "paid" and p["kind"] != "prepay" for p in pays):
        return _err("plan_locked")  # этапы уже пошли — менять поздно
    await flow.set_plan(order_id, stages)
    o = await db.get_order(order_id)
    return _json({"ok": True, "order": await _order_full_json(o)})


def _unpaid_resp(res_or_debt: dict, part: int, status: int = 409) -> web.Response:
    """Единый ответ «этап не оплачен — файл придержан» для фронта админки."""
    return _json({"ok": False, "error": "stage_unpaid",
                  "debt": res_or_debt.get("debt", res_or_debt.get("amount", 0)),
                  "claimed": res_or_debt.get("claimed", False),
                  "labels": res_or_debt.get("labels", []),
                  "part": part}, status=status)


async def admin_order_deliver(request: web.Request) -> web.Response:
    """Зафиксировать сдачу текущей части (файлы уже отправлены/загружены).

    Правило «сначала оплата — потом файл»: при неоплаченном этапе — 409
    stage_unpaid; осознанный обход — {"force": true}."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    o = await db.get_order(order_id)
    if not o:
        return _err("not_found", 404)
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        b = {}
    part = None
    try:
        part = int(b.get("part")) if b.get("part") else None
    except (TypeError, ValueError):
        part = None
    bot: Bot = request.app["bot"]
    res = await flow.deliver_part(bot, order_id, part, via="админка",
                                  force=bool(b.get("force")))
    if res.get("error") == "stage_unpaid":
        return _unpaid_resp(res, res.get("part") or part or 1)
    if not res.get("ok"):
        return _err("deliver_failed")
    o = await db.get_order(order_id)
    return _json({"ok": True, "delivery": {k: res.get(k) for k in ("part", "total", "due", "redelivery")},
                  "order": await _order_full_json(o)})


async def admin_order_upload(request: web.Request) -> web.Response:
    """Файл мастера из админки: клиенту (Telegram) + картотека + лента + ветка группы.

    ?deliver=1 — файл является сдачей текущей части: статусы и оплата этапа
    посчитаются сами (flow.deliver_part).
    ?preview=1 — оригинал НЕ уходит: клиент получает защищённый предпросмотр
    (растровые страницы с водяными знаками, копирование невозможно).
    """
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    o = await db.get_order(order_id)
    if not o:
        return _err("not_found", 404)
    as_delivery = request.query.get("deliver", "") == "1"
    as_preview = request.query.get("preview", "") == "1"
    force = request.query.get("force", "") == "1"
    # правило «сначала оплата части — потом файл»: и сдача, и «просто файл»
    # при неоплаченном этапе придерживаются (409); предпросмотр свободен,
    # осознанный обход — ?force=1 (остаётся в хронике)
    if not as_preview and not force and o["status"] in ("new", "priced", "prepay", "work"):
        debt = await flow.deliver_debt(o)
        if debt["amount"] > 0:
            return _unpaid_resp(debt, debt["part"])
    reader = await request.multipart()
    uploads: list[dict] = []
    field = await reader.next()
    while field is not None:
        if field.name == "file":
            fname = (field.filename or "файл")[:120]
            data = bytearray()
            while True:
                chunk = await field.read_chunk(64 * 1024)
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > MAX_UPLOAD:
                    return _err("too_big", 413)
            if not data:
                return _err("empty")
            uploads.append({"filename": fname, "data": bytes(data)})
            if len(uploads) > 10:
                return _err("bundle_size", 413)
        field = await reader.next()
    if not uploads:
        return _err("no_file")
    if not as_preview and len(uploads) != 1:
        return _err("bundle_only_preview", 400)
    fname, data = uploads[0]["filename"], uploads[0]["data"]
    bot: Bot = request.app["bot"]
    if as_preview:
        cleaned_uploads = []
        for upload in uploads:
            try:
                clean_data, clean_name, clean_method = await sanitize.clean(
                    upload["data"], upload["filename"])
            except Exception as exc:  # noqa: BLE001 — сырой оригинал не пропускаем
                log.warning("original sanitization failed: %s", upload["filename"],
                            exc_info=True)
                return _json({"ok": False, "error": "sanitize_failed",
                              "filename": upload["filename"]}, status=422)
            cleaned_uploads.append({"filename": clean_name, "data": clean_data,
                                    "clean_method": clean_method})
        uploads = cleaned_uploads
        # Сначала приватно закрепляем каждый оригинал в Telegram-хранилище бота.
        sources = []
        for pos, upload in enumerate(uploads):
            fname, data = upload["filename"], upload["data"]
            src = await grp.send_document(
                bot, order_id, BufferedInputFile(data, filename=fname),
                caption=(f"🗄 Приватный исходник {pos + 1}/{len(uploads)} · "
                         f"заказ №{order_id} · клиенту не виден"))
            source_id = src.document.file_id if src and src.document else None
            if not source_id:
                for admin_id in config.ADMIN_IDS:
                    try:
                        m2 = await bot.send_document(
                            admin_id, BufferedInputFile(data, filename=fname),
                            caption=(f"🗄 Приватный исходник {pos + 1}/{len(uploads)} "
                                     f"· заказ №{order_id}"))
                        source_id = m2.document.file_id if m2.document else None
                        if source_id:
                            break
                    except Exception:  # noqa: BLE001
                        pass
            if not source_id:
                return _err("relay_failed", 502)
            sources.append({"source_file_id": source_id, "filename": fname,
                            "file_size": len(data), "payload": data})
            await db.add_event(order_id, "original_sanitized",
                               f"{fname} · {upload['clean_method']}")
        res = await handoff.prepare_bundle(order_id, sources, via="админка")
        if not res.get("ok"):
            return _json({"ok": False, "error": res.get("error") or "preview_failed",
                          "filename": res.get("filename")}, status=502)
        review_ids = []
        items = res.get("items") or []
        for pos, item in enumerate(items):
            review = await grp.send_document(
                bot, order_id,
                BufferedInputFile(item["bytes"], filename=item["filename"]),
                caption=(f"👁 Проверка версии v{res['version']} · файл "
                         f"{pos + 1}/{len(items)} · клиент ещё не видел. "
                         "Откройте файл" +
                         (" и подтвердите отправку пакета."
                          if pos == len(items) - 1 else ".")),
                reply_markup=(kb.handoff_master_review_kb(
                    order_id, res["artifact_id"], res["version"],
                    clean=res["mode"] == "clean_revision")
                    if pos == len(items) - 1 else None))
            if not review or not review.document:
                return _err("review_delivery_failed", 502)
            review_ids.append(review.document.file_id)
        await handoff.set_review_files(res["artifact_id"], review_ids)
        o = await db.get_order(order_id)
        return _json({"ok": True, "preview": True, "master_review": True,
                      "artifact_id": res["artifact_id"],
                      "file_count": len(items),
                      "files": [x["source_name"] for x in items],
                      "order": await _order_full_json(o)})
    no = f"№{order_id}"
    total = o["stages_total"] or 1
    part = o["stage"] or 1
    cap_client = (f"📦 Заказ {no} — результат этапа {part} из {total}"
                  if as_delivery and total > 1
                  else (f"📦 Заказ {no} — согласованный результат" if as_delivery
                        else f"📩 Мастерская · заказ {no}"))
    tg_file_id = None
    delivered_tg = False
    if o["user_id"] and o["user_id"] > 0:
        try:
            msg = await bot.send_document(
                o["user_id"], BufferedInputFile(bytes(data), filename=fname),
                caption=cap_client)
            if msg.document:
                tg_file_id = msg.document.file_id
            delivered_tg = True
        except Exception:  # noqa: BLE001
            log.warning("admin upload: client TG delivery failed", exc_info=True)
    # копия в ветку заказа (и источник file_id, если клиент без Telegram)
    gmsg = await grp.send_document(
        bot, order_id,
        tg_file_id or BufferedInputFile(bytes(data), filename=fname),
        caption=("📦 Сдача · " if as_delivery else "📤 Файл мастера · ") + f"заказ {no} · {fname}")
    if not tg_file_id and gmsg and gmsg.document:
        tg_file_id = gmsg.document.file_id
    if not tg_file_id:
        # ни клиент, ни группа не приняли — последний фолбэк: личка админа
        for admin_id in config.ADMIN_IDS:
            try:
                m2 = await bot.send_document(
                    admin_id, BufferedInputFile(bytes(data), filename=fname),
                    caption=f"📤 Файл мастера · заказ {no} (копия для картотеки)")
                if m2.document:
                    tg_file_id = m2.document.file_id
                    break
            except Exception:  # noqa: BLE001
                pass
    if not tg_file_id:
        return _err("relay_failed", 502)
    await db.add_file(order_id, "admin", tg_file_id, None, fname, len(data), "document",
                      part=part if as_delivery else None)
    await db.msg_add(order_id, "master",
                     None, kind="document", file_name=fname, tg_file_id=tg_file_id)
    await db.add_event(order_id, "admin_file", fname[:100])
    await mailer.master_message(order_id)
    if as_delivery:
        await flow.deliver_part(bot, order_id, part, via="админка", force=force)
    o = await db.get_order(order_id)
    return _json({"ok": True, "name": fname, "delivered_tg": delivered_tg,
                  "order": await _order_full_json(o)})


async def admin_handoff_publish(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    artifact_id = int(request.match_info["artifact"])
    res = await handoff.publish(request.app["bot"], order_id, artifact_id, via="админка")
    if not res.get("ok"):
        return _err(res.get("error") or "publish_failed", 409)
    return _json({"ok": True, "order": await _order_full_json(
        await db.get_order(order_id))})


async def admin_reviews(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    rows = await db.reviews_all(100)
    return _json({"ok": True, "reviews": [{
        "id": r["id"], "order_id": r["order_id"], "rating": r["rating"],
        "text": r["text"], "author": r["author"], "status": r["status"],
        "work_label": r["work_label"], "at": r["created_at"],
        "publication_consent": bool(r["publication_consent"]),
        "publication_consent_at": r["publication_consent_at"],
        "publication_consent_doc": r["publication_consent_doc"],
        "publication_categories": (
            json.loads(r["publication_categories"])
            if r["publication_categories"]
            else {}
        ),
    } for r in rows]})


async def admin_review_moderate(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    review_id = int(request.match_info["id"])
    try:
        b = await request.json()
        approve = bool(b.get("approve"))
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    bot: Bot = request.app["bot"]
    result = await flow.moderate_review(bot, review_id, approve)
    if result == "not_found":
        return _err("not_found", 404)
    if result == "consent_required":
        return _err("publication_consent_required", 409)
    return _json({"ok": True})


async def admin_clients(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    rows = await db.clients_recent(150)
    out = []
    for r in rows:
        out.append({
            "id": r["id"], "name": r["first_name"], "username": r["username"],
            "banned": bool(r["banned"]), "orders": r["orders_n"],
            "paid_sum": r["paid_sum"], "since": r["created_at"],
            "last_seen": r["last_seen_at"],
            "balance": await db.bonus_balance(r["id"]),
        })
    return _json({"ok": True, "clients": out})


async def admin_client_get(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    uid = int(request.match_info["id"])
    u = await db.get_user(uid)
    if not u:
        return _err("not_found", 404)
    orders = await db.orders_by_user(uid, limit=30)
    ledger = await db.bonus_rows(uid, limit=40)
    refs = await db.referrals_of(uid)
    inviter = await db.get_user(u["referrer_id"]) if u["referrer_id"] else None
    return _json({"ok": True, "client": {
        "id": u["id"], "name": u["first_name"], "username": u["username"],
        "banned": bool(u["banned"]), "since": u["created_at"],
        "last_seen": u["last_seen_at"], "welcome_at": u["welcome_at"],
        "referrer": ({"id": inviter["id"], "name": inviter["first_name"],
                      "username": inviter["username"]} if inviter else None),
        "referrals": [{"id": r["id"], "name": r["first_name"], "username": r["username"],
                       "since": r["created_at"]} for r in refs],
        "bonus": await bonus.summary(uid),
        "ledger": [{"delta": r["delta"], "kind": r["kind"],
                    "label": bonus.KIND_LABEL.get(r["kind"], r["kind"]),
                    "note": r["note"], "at": r["created_at"],
                    "expires_at": r["expires_at"]} for r in ledger],
        "orders": [_order_json(x) for x in orders],
    }})


async def admin_client_bonus(request: web.Request) -> web.Response:
    """Ручное начисление/списание бонусов мастером."""
    if not await _admin_user(request):
        return _err("forbidden", 403)
    uid = int(request.match_info["id"])
    u = await db.get_user(uid)
    if not u:
        return _err("not_found", 404)
    try:
        b = await request.json()
        delta = int(b.get("delta"))
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    if delta == 0:
        return _err("bad_amount")
    note = str(b.get("note") or "").strip()[:200]
    ttl = int(b.get("ttl_days") or 90)
    bot: Bot = request.app["bot"]
    if delta > 0:
        await db.bonus_add(uid, delta, "admin", note or "начислено мастерской",
                           ttl_days=max(1, min(ttl, 365)))
        await notify.notify_client(
            bot, uid, f"💎 Мастерская начислила вам <b>{delta}</b> бонусов"
                      + (f": {esc(note)}" if note else "") +
                      f". Баланс: <b>{await db.bonus_balance(uid)}</b>.")
    else:
        spent = await db.bonus_consume(uid, -delta, note or "корректировка мастерской", None)
        if not spent:
            return _err("bonus_empty")
    return _json({"ok": True, "balance": await db.bonus_balance(uid)})


async def admin_client_ban(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    uid = int(request.match_info["id"])
    if uid in config.ADMIN_IDS:
        return _err("not_yourself")
    try:
        b = await request.json()
        on = bool(b.get("banned"))
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    await db.conn().execute("UPDATE users SET banned=? WHERE id=?", (1 if on else 0, uid))
    if on:
        # рвём уже открытые сессии, иначе вошедший клиент продолжал бы
        # работать до истечения сессии (а они были бессрочны)
        await db.conn().execute("DELETE FROM sessions WHERE user_id=?", (uid,))
    await db.conn().commit()
    return _json({"ok": True, "banned": on})


# ------------------------------------- «тихий» вход мастера в кабинет клиента

# одноразовые ключи имперсонации: {key: (client_id, admin_id, годен_до)}
_IMP_KEYS: dict[str, tuple[int, int, float]] = {}


async def admin_client_impersonate(request: web.Request) -> web.Response:
    """Ключ для входа в кабинет клиента на правах администратора.

    Сессия получает imp=1: маячок визитов, метки «непрочитанное/новый файл»
    не трогаются — клиент ничего не замечает. Действия (принять цену, написать
    в дело) при этом настоящие: режим для «проконтролировать и помочь»."""
    admin = await _admin_user(request)
    if not admin:
        return _err("forbidden", 403)
    uid = int(request.match_info["id"])
    if uid in config.ADMIN_IDS:
        return _err("not_yourself")   # imp на аккаунт админа не наводим
    user = await db.get_user(uid)
    if not user:
        return _err("not_found", 404)
    now = time.time()
    for k in [k for k, v in _IMP_KEYS.items() if v[2] < now]:
        _IMP_KEYS.pop(k, None)
    key = secrets.token_urlsafe(32)
    _IMP_KEYS[key] = (uid, admin["id"], now + 600)
    return _json({"ok": True,
                  "url": f"{config.SITE_URL}/dashboard.html#imp={key}",
                  "name": user["first_name"] or f"id {uid}"})


async def imp_login(request: web.Request) -> web.Response:
    """Обмен одноразового ключа мастера на «тихую» клиентскую сессию."""
    if not _rate_ok(_ip(request), cost=3):
        return _err("rate_limit", 429)
    try:
        b = await request.json()
        key = str(b.get("key") or "")
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    rec = _IMP_KEYS.pop(key, None) if key else None
    if not rec or rec[2] < time.time():
        return _err("bad_key", 403)
    user = await db.get_user(rec[0])
    if not user:
        return _err("bad_key", 403)
    token = await db.session_create(user["id"], imp=1)
    return _json({"ok": True, "token": token, "imp": True,
                  "user": {"id": user["id"],
                           "name": user["first_name"] or "клиент",
                           "username": user["username"]}})


async def admin_order_price(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    o = await db.get_order(order_id)
    if not o:
        return _err("not_found", 404)
    try:
        b = await request.json()
        price = int(b.get("price"))
    except Exception:  # noqa: BLE001
        return _err("bad_price")
    if price <= 0:
        return _err("bad_price")
    # план сдачи: 1 — одна выдача, 2 — 50/50, 3 — 30/40/30 (по умолчанию от типа работы)
    try:
        stages = int(b.get("stages") or 0)
    except (TypeError, ValueError):
        stages = 0
    if stages not in (1, 2, 3):
        stages = o["stages_total"] or payments.default_stages(o["work_type"])
    try:
        prepay = int(b.get("prepay") or 0) or None
    except (TypeError, ValueError):
        prepay = None
    raw_spec = b.get("specification") if isinstance(b.get("specification"), dict) else None
    if isinstance(b.get("specification_lines"), list):
        raw_spec = {**(raw_spec or {}), "lines": b["specification_lines"]}
    bot: Bot = request.app["bot"]
    # единая точка цены: статус, оферта, автоскидка подписки, спека, синк группы
    res = await flow.set_price(
        bot, order_id, price, prepay, stages, via="глаз бога",
        specification=raw_spec,
    )
    if not res.get("ok"):
        return _json({
            "ok": False,
            "error": res.get("error") or "bad_price",
            "detail": res.get("detail"),
        }, 409 if res.get("error") == "financial_locked" else 400)
    await grp.send(bot, order_id,
                   f"💰 Цена по заказу №{order_id}: {config.fmt_money(res['price'])} ₽ "
                   f"(первый платёж {config.fmt_money(res['prepay'])} ₽) — предложение у клиента."
                   + (f" ⭐ Скидка подписки: −{config.fmt_money(res['sub_discount'])} ₽."
                      if res.get("sub_discount") else "")
                   + (f" 🎟 Промокод: −{config.fmt_money(res['promo_discount'])} ₽."
                      if res.get("promo_discount") else ""))
    o = await db.get_order(order_id)
    return _json({"ok": True, "order": await _order_full_json(o)})


async def admin_order_status(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    o = await db.get_order(order_id)
    try:
        b = await request.json()
        status = str(b.get("status"))
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    if not o or status not in config.ST:
        return _err("bad_status")
    if o["status"] != status:
        await db.set_status(order_id, status, "глаз бога")
        await notify.status_changed(request.app["bot"], order_id)
        await grp.status_sync(request.app["bot"], order_id)
        if status == "done":
            await flow.offer_defense(request.app["bot"], order_id)
    o = await db.get_order(order_id)
    return _json({"ok": True, "order": await _order_full_json(o)})


async def admin_order_message(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    o = await db.get_order(order_id)
    if not o:
        return _err("not_found", 404)
    try:
        b = await request.json()
        text = str(b.get("text") or "").strip()[:3000]
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    if not text:
        return _err("empty")
    await db.msg_add(order_id, "master", text)
    await db.add_event(order_id, "admin_msg", text[:200])
    await mailer.master_message(order_id)
    delivered_tg = False
    if o["user_id"]:
        delivered_tg = await notify.notify_client(
            request.app["bot"], o["user_id"],
            f"📩 <b>Мастерская</b> · заказ №{order_id}:\n{esc(text)}")
    o = await db.get_order(order_id)
    return _json({"ok": True, "delivered_tg": delivered_tg,
                  "order": await _order_full_json(o)})


async def admin_order_note(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    order_id = int(request.match_info["id"])
    o = await db.get_order(order_id)
    if not o:
        return _err("not_found", 404)
    try:
        b = await request.json()
        text = str(b.get("text") or "").strip()[:1000]
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    await db.update_order(order_id, admin_note=text or None)
    return _json({"ok": True})


async def admin_leads(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    rows = await db.leads_recent(30)
    return _json({"ok": True, "leads": [{
        "id": r["id"], "name": r["name"], "contact": r["contact"],
        "message": r["message"], "status": r["status"], "at": r["created_at"],
    } for r in rows]})


async def admin_requisites(request: web.Request) -> web.Response:
    if not await _admin_user(request):
        return _err("forbidden", 403)
    try:
        b = await request.json()
        text = str(b.get("text") or "").strip()[:800]
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    await db.setting_set("requisites", text)
    return _json({"ok": True})


# ---------------------------------------------------------------- лиды/health

async def quote_email(request: web.Request) -> web.Response:
    """«Смета на почту» из конфигуратора: письмо с расчётом и ссылкой-возвратом.

    Вилку считаем сами по формуле сайта — фронту не доверяем. Одно письмо
    на запрос, лид уходит мастеру в личку.
    """
    if not _rate_ok(_ip(request), cost=3):
        return _err("rate_limited")
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    email = str(b.get("email") or "").strip()[:120]
    if not mailer.looks_email(email):
        return _err("bad_email")
    st = b.get("state") if isinstance(b.get("state"), dict) else {}
    type_id = str(st.get("type") or "")[:30]
    disc = str(st.get("disc") or "hum")[:10]
    term = str(st.get("term") or "free")[:10]
    tier = str(st.get("tier") or "base")[:10]
    t = config.TYPE_BY_ID.get(type_id)
    q = config.quote(type_id, disc, term, tier) if t else None
    if not q:
        return _err("bad_state")
    payload = {"type": type_id, "disc": disc, "term": term, "tier": tier,
               "topic": str(st.get("topic") or "")[:400].strip(),
               "deadline": str(st.get("deadline") or "")[:120].strip(),
               "plan": bool(st.get("plan"))}
    # применённый в конфигураторе промокод — в письмо и в ссылку-возврат
    promo_code = promo_label = None
    raw_promo = _clean_promo(b.get("promo"))
    if raw_promo:
        p = await db.promo_get(raw_promo)
        if p is not None and not promo_svc.why_invalid(p):
            promo_code, promo_label = raw_promo, promo_svc.label(p)
    token = secrets.token_urlsafe(9)
    await db.quote_draft_add(token, email, payload)
    d_label = config.DISC_BY_ID.get(disc)
    t_label = config.TERM_BY_ID.get(term)
    v_label = config.TIER_BY_ID.get(tier)
    params = " · ".join(x for x in [
        d_label[2] if d_label else None,
        t_label[2] if t_label else None,
        ("результат «" + v_label[2] + "»") if v_label else None,
        ("тема: " + payload["topic"]) if payload["topic"] else None,
    ] if x)
    resume_url = f"{config.SITE_URL}/configurator.html?resume={token}"
    if promo_code:
        resume_url += "&promo=" + urllib.parse.quote(promo_code)
    ok = await mailer.send_quote(
        email, work=t.label, params=params, low=q[0], high=q[1],
        resume_url=resume_url, plan=payload["plan"],
        promo_code=promo_code, promo_label=promo_label)
    if not ok:
        return _err("send_failed")
    try:
        await notify.notify_admins(
            request.app["bot"],
            "💌 <b>Лид: смета на почту</b>\n"
            f"📚 {esc(t.label)} · {config.fmt_money(q[0])}–{config.fmt_money(q[1])} ₽\n"
            f"✉️ <code>{esc(email)}</code>"
            + (f"\n📖 {esc(payload['topic'])}" if payload["topic"] else "")
            + ("\n🧭 Формат: разбор плана" if payload["plan"] else "")
            + (f"\n🎟 Промокод: {esc(promo_code)} ({esc(promo_label)})"
               if promo_code else ""))
    except Exception:  # noqa: BLE001
        log.exception("quote lead DM failed")
    return _json({"ok": True})


async def quote_get(request: web.Request) -> web.Response:
    """Возврат по ссылке из письма: отдаём сохранённые ответы конфигуратора."""
    token = str(request.match_info.get("token") or "")[:64]
    row = await db.quote_draft_get(token)
    if not row:
        return _err("not_found")
    await db.quote_draft_touch(token)
    try:
        state = json.loads(row["payload"])
    except ValueError:
        return _err("broken")
    return _json({"ok": True, "state": state})


async def promo_check(request: web.Request) -> web.Response:
    """Проверка промокода из конфигуратора: жив ли и какая выгода.

    Отвечаем только «годен/негоден» с человеческой подписью — состав кодов
    не раскрываем, перебор придерживает общий rate-limit.
    """
    if not _rate_ok(_ip(request), cost=2):
        return _err("rate_limited")
    try:
        b = await request.json()
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    code = _clean_promo(b.get("code"))
    if not code:
        return _err("empty")
    p = await db.promo_get(code)
    bad = promo_svc.why_invalid(p) if p is not None else "not_found"
    # вошедшему сразу честно скажем, что семейный код у него уже был
    if not bad and p["family"]:
        user = await _session_user(request)
        if user and await db.promo_family_used(p["family"], user["id"], None):
            bad = "already_used"
    if bad:
        return _json({"ok": False, "error": bad})
    # состав скидки — фронту для «перечёркнутой» сметы: ничего секретного,
    # label и так называет выгоду словами
    return _json({"ok": True, "code": code, "label": promo_svc.label(p),
                  "deal": {"pct": p["pct"] or 0, "cap": p["cap"] or 0,
                           "amount": p["amount"] or 0,
                           "min_price": p["min_price"] or 0}})


# ------------------------------------------------- код возврата к заявке

# Экономика согласована требованием «не в ущерб»: −5% с потолком 1 000 ₽
# (мягче подписки «Салон+», с которой всё равно не суммируется), только для
# работ от 5 000 ₽ (дешёвые услуги и рефераты — мимо), срок 3 дня, код
# одноразовый + серия «exit» не выдаётся к применению дважды одному клиенту.
EXIT_PCT, EXIT_CAP, EXIT_MIN_PRICE, EXIT_DAYS = 5, 1000, 5000, 3
EXIT_IP_PER_DAY = 3        # NAT общежития — не 1; фермить смысла нет, код-то один на клиента
EXIT_GLOBAL_PER_DAY = 40   # стоп-кран: больше 40 кодов в сутки — что-то пошло не так
_EXIT_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"  # без похожих 0/O, 1/I/L


async def promo_exit_grant(request: web.Request) -> web.Response:
    """Гость уходит с недооформленной заявкой — выписываем персональный код.

    Код криптослучайный (перебор бессмыслен), одноразовый, короткоживущий;
    лимиты на IP и на сутки, рубильник — /promo exit off в боте.
    """
    if not _rate_ok(_ip(request), cost=3):
        return _err("rate_limited")
    if (await db.setting_get("exit_promo", "on")) != "on":
        return _err("off")
    ip = _ip(request)
    if await db.promo_grants_recent(ip, hours=24) >= EXIT_IP_PER_DAY:
        return _err("granted")
    if await db.promo_grants_today() >= EXIT_GLOBAL_PER_DAY:
        return _err("day_limit")
    code = None
    for _ in range(4):  # коллизия на 6 знаках из 31 — почти чудо, но проверим
        cand = "AS-" + "".join(secrets.choice(_EXIT_ALPHABET) for _ in range(6))
        if await db.promo_get(cand) is None:
            code = cand
            break
    if not code:
        return _err("busy")
    until = (datetime.now(timezone.utc) + timedelta(days=EXIT_DAYS)).strftime("%Y-%m-%d")
    await db.promo_add(code, pct=EXIT_PCT, cap=EXIT_CAP, min_price=EXIT_MIN_PRICE,
                       uses_left=1, expires_at=until, family="exit",
                       note="авто: код возврата к заявке")
    await db.promo_grant_add(ip, code)
    p = await db.promo_get(code)
    return _json({"ok": True, "code": code, "label": promo_svc.label(p),
                  "until": until})


# ------------------------------------------------- визиты («Глаз бога»)

_BOT_UA = re.compile(
    r"bot|spider|crawl|slurp|curl|wget|python-requests|httpx|monitor|preview"
    r"|yandex\.com/bots|petalbot|ahrefs|semrush", re.I)
_VID_RE = re.compile(r"^[a-z0-9-]{8,40}$")
_geo_busy: set[str] = set()


def _visit_priv(page: str) -> str:
    """Срезать приватные значения из query (токены доступа, resume-ссылки)."""
    page = str(page or "")[:200]
    return re.sub(r"(token|resume|session|claim)=[^&#]*", r"\1=…", page)


async def _geo_resolve(ip: str) -> None:
    """Не передавать IP посетителя внешним геосервисам.

    Прежний код отправлял адрес в ``ip-api.com`` по незашифрованному HTTP.
    Геометка в админке не оправдывает такую передачу персональных данных,
    поэтому backend фиксирует только локальный нейтральный статус.
    """
    if not ip or ip in _geo_busy:
        return
    if ip.startswith(("10.", "192.168.", "172.", "127.")) or ":" in ip and ip.startswith("fd"):
        await db.geo_put(ip, "локальная сеть")
        return
    _geo_busy.add(ip)
    try:
        await db.geo_put(ip, "геолокация отключена")
    finally:
        _geo_busy.discard(ip)


async def visit_beacon(request: web.Request) -> web.Response:
    """Маячок сайта: pageview / метка шага / привязка заявки.

    Максимально дёшев и неболтлив: битые данные молча отбрасываем,
    ответ всегда 204 — фронт на него не смотрит.
    """
    ip = _ip(request)
    # у маячка отдельный лимит-ключ: листающий сайт посетитель не должен
    # выедать бюджет настоящих ручек (заявка, вход, промокод)
    if not _rate_ok("v:" + ip):
        return web.Response(status=204, headers=CORS)
    try:
        raw = await request.text()  # sendBeacon шлёт text/plain
        b = json.loads(raw or "{}")
        assert isinstance(b, dict)
    except Exception:  # noqa: BLE001
        return web.Response(status=204, headers=CORS)
    vid = str(b.get("vid") or "")[:40].lower()
    if not _VID_RE.match(vid):
        return web.Response(status=204, headers=CORS)
    ua = request.headers.get("User-Agent", "")
    kind = str(b.get("kind") or "view")[:10]
    page = _visit_priv(b.get("page"))
    step = str(b.get("step") or "")[:120].strip() or None
    # клиентская JS-ошибка: дублируем в файл для «Салон-дозора» (алерт владельцу)
    if kind == "mark" and step and step.startswith("js:"):
        try:
            with open(config.JSERR_LOG, "a", encoding="utf-8") as jf:
                jf.write("%s\t%s\t%s\n" % (db.now_iso(), page or "-", step))
        except OSError:
            pass
    ref = str(b.get("ref") or "")[:400].strip() or None
    user = await _session_user(request)
    if _sess_imp(user):
        # мастер ходит по кабинету клиента тихо: в аналитику визитов не сорим
        return web.Response(status=204, headers=CORS)
    if kind == "order":
        # Политика 2.3.2 запрещает связывать собственную аналитику с номером
        # заказа, контактом и кабинетом. Для воронки достаточно анонимной метки.
        step = step or "заявка отправлена"
    await db.visit_touch(
        vid, ip=ip, ua=ua, page=page, ref=ref, step=step,
        is_view=(kind == "view"), bot=bool(_BOT_UA.search(ua)))
    if await db.geo_get(ip) is None:
        asyncio.get_running_loop().create_task(_geo_resolve(ip))
    return web.Response(status=204, headers=CORS)


async def admin_visits(request: web.Request) -> web.Response:
    """Лента заходов для «Глаза бога»: кто, когда, откуда, где остановился."""
    admin = await _admin_user(request)
    if not admin:
        return _err("forbidden", 403)
    try:
        hours = max(1, min(24 * 30, int(request.query.get("hours") or 24)))
    except ValueError:
        hours = 24
    show_self = request.query.get("self") == "1"
    show_bots = request.query.get("bots") == "1"
    hide = () if show_self else tuple(config.ADMIN_IDS)
    rows = await db.visits_list(hours=hours, limit=300,
                                hide_bots=not show_bots, hide_users=hide)
    geo = await db.geo_labels([r["ip"] for r in rows])
    # имена вошедших — одним проходом
    uids = {r["user_id"] for r in rows if r["user_id"]}
    users = {}
    for uid in uids:
        u = await db.get_user(uid)
        if u:
            users[uid] = {"name": u["first_name"], "username": u["username"],
                          "email": u["email"]}
    out = []
    for r in rows:
        g = geo.get(r["ip"]) or {}
        u = users.get(r["user_id"])
        contact = r["contact"] or (u and (
            ("@" + u["username"]) if u["username"] else u["email"])) or None
        out.append({
            "id": r["id"], "vid": r["vid"][-6:],  # короткий ярлык посетителя
            "at": r["last_at"], "started": r["started_at"],
            "ip": r["ip"], "geo": g.get("label"), "org": g.get("org"),
            "ua": r["ua"], "ref": r["ref"],
            "entry": r["entry"], "page": r["page"], "step": r["step"],
            "pages": r["pages"], "bot": bool(r["bot"]),
            "order_id": r["order_id"],
            "user": ({"id": r["user_id"], "name": (u or {}).get("name"),
                      "username": (u or {}).get("username"),
                      "email": (u or {}).get("email")} if r["user_id"] else None),
            "contact": contact,
            "links": texts.contact_links(contact or "") or None,
        })
    stats = await db.visits_stats(hide_users=hide)
    return _json({"ok": True, "stats": stats, "visits": out})


async def handle_lead(request: web.Request) -> web.Response:
    ip = _ip(request)
    if not _rate_ok(ip, cost=3):
        return _err("rate_limit", 429)
    try:
        data = await request.json()
        assert isinstance(data, dict)
    except Exception:  # noqa: BLE001
        return _err("bad_json")
    if (data.get("website") or "").strip():  # honeypot
        return _json({"ok": True, "id": 0})
    name = str(data.get("name") or "")[:120].strip()
    contact = str(data.get("contact") or "")[:200].strip()
    message = str(data.get("message") or "")[:2000].strip()
    page = str(data.get("page") or "")[:200].strip()
    calc = data.get("calc") if isinstance(data.get("calc"), dict) else None
    if not contact and not message:
        return _err("empty")
    lead_id = await db.lead_create(name, contact, message, calc, page)
    bot: Bot = request.app["bot"]
    card = [texts.NEW_LEAD_ALERT + f" · #{lead_id}"]
    if name:
        card.append(f"👤 {esc(name)}")
    if contact:
        card.append(f"📞 Контакт: <code>{esc(contact)}</code>")
    if message:
        card.append(f"💬 {esc(message)}")
    if calc:
        card.append("🧮 " + esc(_decode_calc(calc)))
    if page:
        card.append(f"🔗 Страница: {esc(page)}")
    try:
        await notify.notify_admins(bot, "\n".join(card), reply_markup=kb.lead_kb(lead_id))
    except Exception:  # noqa: BLE001
        log.exception("lead DM failed")
    return _json({"ok": True, "id": lead_id,
                  "bot_link": f"https://t.me/{config.BOT_USERNAME}?start=lead_{lead_id}"})


def _decode_calc(calc: dict) -> str:
    t = config.TYPE_BY_CODE.get(str(calc.get("type"))) or config.TYPE_BY_ID.get(str(calc.get("type")))
    parts = []
    if t:
        parts.append(t.label)
        d = config.DISC_BY_CODE.get(str(calc.get("disc"))) or config.DISC_BY_ID.get(str(calc.get("disc")))
        s = config.TERM_BY_CODE.get(str(calc.get("term"))) or config.TERM_BY_ID.get(str(calc.get("term")))
        v = config.TIER_BY_CODE.get(str(calc.get("tier"))) or config.TIER_BY_ID.get(str(calc.get("tier")))
        if d:
            parts.append(d[2])
        q = config.quote(t.id, d[0] if d else "hum", s[0] if s else "free", v[0] if v else "base")
        if q:
            parts.append(f"смета {config.fmt_money(q[0])}–{config.fmt_money(q[1])} ₽")
    else:
        parts.append(json.dumps(calc, ensure_ascii=False)[:200])
    return " · ".join(parts)


async def handle_health(request: web.Request) -> web.Response:
    active = await db.active_orders(limit=100)
    return _json({"ok": True, "uptime_s": int(time.time() - _STARTED),
                  "active_orders": len(active)})


async def handle_options(request: web.Request) -> web.Response:
    return web.Response(status=204, headers=CORS)

# -------------------------------------------------------------------- app

def build_app(bot: Bot) -> web.Application:
    app = web.Application(client_max_size=MAX_BUNDLE_UPLOAD)
    app["bot"] = bot
    r = app.router
    r.add_post("/api/lead", handle_lead)
    r.add_post("/api/visit", visit_beacon)
    r.add_post("/api/promo/check", promo_check)
    r.add_post("/api/promo/exit", promo_exit_grant)
    r.add_post("/api/quote/email", quote_email)
    r.add_get("/api/quote/{token}", quote_get)
    r.add_get("/api/health", handle_health)
    r.add_get("/api/slots", slots_get)
    r.add_get("/api/events", events_poll)
    r.add_post("/api/auth/start", auth_start)
    r.add_get("/api/auth/poll", auth_poll)
    r.add_post("/api/auth/email/start", auth_email_start)
    r.add_post("/api/auth/email/verify", auth_email_verify)
    r.add_get("/api/auth/{prov:vk|mailru}/start", oauth_start)
    r.add_post("/api/auth/{prov:vk|mailru}/link-start", oauth_link_start)
    r.add_get("/api/auth/{prov:vk|mailru}/callback", oauth_callback)
    r.add_get("/api/features", features)
    r.add_get("/api/me", me)
    r.add_get("/api/bonus", bonus_ledger)
    r.add_get("/api/plans", plans_get)
    r.add_post("/api/subscribe", subscribe)
    r.add_post("/api/subs/{id:\\d+}/paid", sub_paid)
    r.add_post("/api/subs/{id:\\d+}/unpaid", sub_unpaid)
    r.add_post("/api/subs/{id:\\d+}/autorenew", sub_autorenew)
    r.add_post("/api/subs/{id:\\d+}/cancel", sub_cancel)
    r.add_post("/api/subs/{id:\\d+}/pay", sub_pay)
    r.add_get("/api/gift/config", gift_config)
    r.add_post("/api/gift", gift_create)
    r.add_get("/api/gift/state", gift_state)
    r.add_get("/api/gift/check", gift_check)
    r.add_get("/api/gift/view", gift_view)
    r.add_get("/api/gift/pdf", gift_pdf)
    r.add_post("/api/gift/{id:\\d+}/paid", gift_paid)
    r.add_post("/api/gift/{id:\\d+}/unpaid", gift_unpaid)
    r.add_post("/api/gift/{id:\\d+}/cancel", gift_cancel)
    r.add_post("/api/gift/{id:\\d+}/pay", gift_pay)
    r.add_get("/api/offer/{code}", offer_view)
    r.add_get("/api/offer/{code}/state", offer_state)
    r.add_get("/api/offer/{code}/specification.pdf", offer_specification_pdf)
    r.add_post("/api/offer/{code}/pay", offer_pay)
    r.add_get("/api/channel", channel_public)
    r.add_get("/api/channel/img/{id:\\d+}", channel_img)
    r.add_get("/api/qa", qa_public_list)
    r.add_post("/api/qa", qa_submit)
    r.add_post("/api/qa/{id:\\d+}/same", qa_same)
    r.add_get("/api/admin/qa", admin_qa_list)
    r.add_post("/api/admin/qa/{id:\\d+}", admin_qa_act)
    r.add_post("/api/milestones", milestones_post)
    r.add_post("/api/milestones/{id:\\d+}/delete", milestones_delete)
    r.add_post("/api/welcome/token", welcome_token)
    r.add_post("/api/orders", orders_create)
    r.add_get("/api/orders", orders_list)
    r.add_post("/api/orders/claim", orders_claim)
    r.add_get("/api/orders/{id:\\d+}", order_get)
    r.add_post("/api/orders/{id:\\d+}/message", order_message)
    r.add_post("/api/orders/{id:\\d+}/action", order_action)
    r.add_post("/api/orders/{id:\\d+}/pay", order_pay)
    r.add_post("/api/orders/{id:\\d+}/tip", order_tip)
    r.add_post("/api/orders/{id:\\d+}/tip/{tip:\\d+}/claim", order_tip_claim)
    r.add_post("/api/orders/{id:\\d+}/pay-deposit", order_pay_deposit)
    r.add_get("/api/deposit", deposit_get)
    r.add_post("/api/deposit/topup", deposit_topup)
    r.add_post("/api/orders/{id:\\d+}/upload", order_upload)
    r.add_get("/api/orders/{id:\\d+}/file/{fid:\\d+}", order_file_download)
    r.add_get("/api/orders/{id:\\d+}/contract", order_contract)
    r.add_get(
        "/api/orders/{id:\\d+}/payments/{pid:\\d+}/confirmation.pdf",
        order_payment_confirmation,
    )
    r.add_get(
        "/api/payment-confirmations/{rid:\\d+}.pdf",
        payment_confirmation,
    )
    r.add_get("/api/orders/{id:\\d+}/pamyatka", order_pamyatka)
    r.add_get("/api/pamyatka/welcome", pamyatka_welcome)
    r.add_get("/api/orders/{id:\\d+}/msgmedia/{mid:\\d+}", order_msg_media)
    r.add_get("/api/reviews", reviews_public)
    r.add_get("/api/catalog/pricing", pricing_catalog)
    r.add_post("/api/pay/yk", yk_webhook)
    r.add_post("/api/pay/robokassa", robo_webhook)
    r.add_get("/api/pay/robokassa", robo_webhook)
    # «глаз бога» — только для ADMIN_IDS (проверка в каждом хендлере)
    r.add_get("/api/admin/overview", admin_overview)
    r.add_get("/api/admin/maintenance", admin_maintenance)
    r.add_post("/api/admin/maintenance", admin_maintenance)
    r.add_post("/api/admin/slots", admin_slots)
    r.add_get("/api/admin/visits", admin_visits)
    r.add_post("/api/admin/orders/flag", admin_orders_flag)
    r.add_get("/api/admin/orders", admin_orders)
    r.add_post("/api/admin/orders", admin_order_create)
    r.add_post("/api/admin/offers", admin_offer_create)
    r.add_post("/api/admin/offers/{id:\\d+}/cancel", admin_offer_cancel)
    r.add_post("/api/admin/offers/{id:\\d+}/mail_on", admin_offer_mail_on)
    r.add_get("/api/admin/orders/{id:\\d+}", admin_order_get)
    r.add_post("/api/admin/orders/{id:\\d+}/price", admin_order_price)
    r.add_post("/api/admin/orders/{id:\\d+}/status", admin_order_status)
    r.add_post("/api/admin/orders/{id:\\d+}/message", admin_order_message)
    r.add_post("/api/admin/orders/{id:\\d+}/sync_tg", admin_order_sync_tg)
    r.add_post("/api/admin/orders/{id:\\d+}/note", admin_order_note)
    r.add_post("/api/admin/orders/{id:\\d+}/confirm_payment", admin_confirm_payment)
    r.add_get("/api/admin/subs", admin_subs)
    r.add_post("/api/admin/subs/{id:\\d+}/confirm", admin_sub_confirm)
    r.add_post("/api/admin/subs/{id:\\d+}/cancel", admin_sub_cancel)
    r.add_get("/api/admin/gifts", admin_gifts)
    r.add_post("/api/admin/gifts", admin_gift_create)
    r.add_get("/api/admin/gifts/{id:\\d+}", admin_gift_get)
    r.add_post("/api/admin/gifts/{id:\\d+}/{act:[a-z]+}", admin_gift_action)
    r.add_post("/api/admin/orders/{id:\\d+}/cancel", admin_order_cancel)
    r.add_post("/api/admin/orders/{id:\\d+}/resume", admin_order_resume)
    r.add_post("/api/admin/orders/{id:\\d+}/archive", admin_order_archive)
    r.add_post("/api/admin/orders/{id:\\d+}/pause", admin_order_pause)
    r.add_post("/api/admin/orders/{id:\\d+}/final_ready", admin_order_final_ready)
    r.add_post("/api/admin/orders/{id:\\d+}/part_ready", admin_order_part_ready)
    r.add_post("/api/admin/orders/{id:\\d+}/remind_pay", admin_order_remind_pay)
    r.add_post("/api/admin/orders/{id:\\d+}/fix_ack", admin_order_fix_ack)
    r.add_post("/api/admin/login", admin_login)
    r.add_post("/api/imp_login", imp_login)
    r.add_get("/api/admin/broadcast", admin_broadcast_preview)
    r.add_post("/api/admin/broadcast", admin_broadcast)
    r.add_get("/api/admin/broadcast/status", admin_broadcast_status)
    r.add_post("/api/admin/orders/{id:\\d+}/plan", admin_order_plan)
    r.add_post("/api/admin/orders/{id:\\d+}/deliver", admin_order_deliver)
    r.add_post("/api/admin/orders/{id:\\d+}/upload", admin_order_upload)
    r.add_post("/api/admin/orders/{id:\\d+}/handoff/{artifact:\\d+}/publish",
               admin_handoff_publish)
    r.add_get("/api/admin/reviews", admin_reviews)
    r.add_post("/api/admin/reviews/{id:\\d+}/moderate", admin_review_moderate)
    r.add_get("/api/admin/clients", admin_clients)
    r.add_get("/api/admin/clients/{id:\\d+}", admin_client_get)
    r.add_post("/api/admin/clients/{id:\\d+}/bonus", admin_client_bonus)
    r.add_post("/api/admin/clients/{id:\\d+}/ban", admin_client_ban)
    r.add_post("/api/admin/clients/{id:\\d+}/impersonate", admin_client_impersonate)
    r.add_get("/api/admin/leads", admin_leads)
    r.add_post("/api/admin/requisites", admin_requisites)
    r.add_options("/api/{tail:.*}", handle_options)
    return app


async def start(bot: Bot) -> web.AppRunner:
    # access_log=None: штатный логгер aiohttp пишет %r с query string, куда
    # попадают ?tokens= / ?n= / ?session= — а это ПОСТОЯННЫЕ ключи от дела
    # и от админки. Строка лога = валидный ключ навсегда. Отключаем access-лог
    # aiohttp целиком: nginx уже впереди, а туда query тоже больше не пишем.
    runner = web.AppRunner(build_app(bot), access_log=None)
    await runner.setup()
    site = web.TCPSite(runner, config.API_HOST, config.API_PORT)
    await site.start()
    log.info("site API on http://%s:%s", config.API_HOST, config.API_PORT)
    return runner
