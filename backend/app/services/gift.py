"""Подарочные сертификаты: предоплаченный номинал на услуги мастерской.

Экономика (согласована 2026-07-17, зеркало — оферта р. 14 и gift.html):
— продаётся 1:1 по номиналу (3 000 / 5 000 / 10 000 / 15 000 или свой
  2 000–50 000 ₽); выгода мастерской — деньги вперёд, несгоревшие остатки
  и доплата деньгами сверх номинала;
— сертификат — СРЕДСТВО ПЛАТЕЖА, не скидка: вычитается из «деньгами к
  оплате» после скидок и бонусов, поэтому совместим с промокодом,
  подпиской и бонусами;
— кэшбэк и рефералка идут только с денежной доплаты (money_due уже
  вычел сертификат — bonus.on_payment считает от денег сам);
— оплатить сертификатом можно только заказы: не подписку, не другой
  сертификат; на покупку сертификата бонусы не начисляются и не тратятся;
— срок 12 месяцев с активации, остаток хранится на коде до сгорания,
  деньгами не выдаётся (возврат неиспользованного — покупателю по
  заявлению, вручную);
— отмена заказа возвращает удержанную сумму НА СЕРТИФИКАТ (release).

Свой платёжный контур (как у подписки, «сертификат — не заказ»):
pending → (claimed_at «я оплатил») → active | canceled; онлайн —
Robokassa с InvId = GIFT_INV_OFFSET + id. Код показывается ТОЛЬКО после
подтверждения оплаты — до активации утечка кода бессмысленна.

Анти-абьюз: активация строго после денег (вебхук/мастер), код 12 знаков
без похожих символов (~59 бит), rate-limit проверок в webapp, hold-модель
списаний в журнале gift_ledger (двойное применение видит уже уменьшенный
баланс), применение к заказу — только пока нет оплаченных платежей.
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone

from aiogram import Bot

from .. import config, db

log = logging.getLogger(__name__)

PRESETS = (3_000, 5_000, 10_000, 15_000)
MIN_AMOUNT = 2_000
MAX_AMOUNT = 50_000
TTL_DAYS = 365           # срок действия с активации
DELIVER_MAX_DAYS = 90    # насколько вперёд можно назначить вручение
PENDING_TTL_DAYS = 7     # неоплаченное оформление живёт неделю
WARN_DAYS = 14           # предупреждение о сгорании остатка

# алфавит без похожих символов (0/O, 1/I/L) — код диктуют по телефону
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%S")


def ru_date(iso: str | None) -> str:
    if not iso:
        return "—"
    return f"{iso[8:10]}.{iso[5:7]}.{iso[:4]}"


async def new_code() -> str:
    """AS-XXXX-XXXX-XXXX, гарантированно свободный."""
    for _ in range(20):
        body = "".join(secrets.choice(_ALPHABET) for _ in range(12))
        code = f"AS-{body[:4]}-{body[4:8]}-{body[8:]}"
        if not await db.gift_by_code(code):
            return code
    raise RuntimeError("gift code space exhausted?!")


def amount_ok(amount: int) -> bool:
    return MIN_AMOUNT <= amount <= MAX_AMOUNT


def state(g, balance: int | None = None) -> str:
    """Вычисленное состояние: статусы БД + «погашен» при нулевом остатке."""
    if g["status"] == "active" and balance == 0:
        return "spent"
    return g["status"]


STATE_LABEL = {
    "pending": "ожидает оплаты",
    "active": "действителен",
    "spent": "погашен",
    "expired": "истёк",
    "blocked": "заблокирован",
    "canceled": "отменён",
}


# ------------------------------------------------------------- оформление

async def create_pending(*, amount: int, buyer_user_id: int | None,
                         buyer_name: str, buyer_contact: str,
                         recip_name: str, recip_contact: str = "",
                         congrats: str = "", deliver_at: str | None = None,
                         via: str = "сайт",
                         buyer_consent_at: str | None = None,
                         buyer_consent_doc: str | None = None,
                         privacy_notice_ack: bool = False,
                         recipient_data_authority: bool = False):
    """Оформление покупки: строка pending + секрет покупателя (buy_token).

    Незавершённое прежнее оформление вошедшего покупателя закрывается —
    действует последнее (не плодим хвосты, как у подписок).
    """
    if buyer_user_id:
        old = await db.gift_pending_for_buyer(buyer_user_id)
        if old:
            await db.gift_mark(old["id"], status="canceled", canceled_at=db.now_iso())
    gid = await db.gift_create(
        code=await new_code(), amount=amount, status="pending",
        buyer_user_id=buyer_user_id, buyer_name=buyer_name[:120] or None,
        buyer_contact=buyer_contact[:200] or None,
        recip_name=recip_name[:120] or None,
        recip_contact=recip_contact[:200] or None,
        congrats=congrats[:280] or None, deliver_at=deliver_at,
        via=via, buy_token=secrets.token_urlsafe(18),
        buyer_consent_at=buyer_consent_at,
        buyer_consent_doc=buyer_consent_doc,
        privacy_notice_ack=1 if privacy_notice_ack else 0,
        recipient_data_authority=1 if recipient_data_authority else 0)
    log.info("gift %s pending (%s ₽, via %s)", gid, amount, via)
    return await db.gift_get(gid)


def admin_confirm_kb(gift_id: int):
    """Кнопки сверки для мастера (DM): активировать или вернуть на оплату."""
    from aiogram.types import InlineKeyboardButton as Btn
    from aiogram.types import InlineKeyboardMarkup as Kb
    return Kb(inline_keyboard=[
        [Btn(text="✅ Оплата получена — выпустить", callback_data=f"gc:adok:{gift_id}")],
        [Btn(text="↩️ Оплата не найдена", callback_data=f"gc:adno:{gift_id}")],
    ])


async def claim_paid(bot: Bot, g, via: str = "сайт") -> None:
    """Покупатель отметил «я оплатил» — мастеру кнопка выпуска."""
    from . import notify  # локальный импорт против циклов
    await db.gift_mark(g["id"], claimed_at=db.now_iso())
    who = g["buyer_name"] or g["buyer_contact"] or "покупатель"
    await notify.notify_admins(
        bot,
        f"🎁 <b>Оплата сертификата на сверке.</b> {who} отметил(а) перевод "
        f"<b>{config.fmt_money(g['amount'])} ₽</b> за подарочный сертификат "
        f"({via}).\nДеньги пришли — жмите выпуск: код уйдёт покупателю сам.",
        reply_markup=admin_confirm_kb(g["id"]))


async def unclaim(g) -> None:
    await db.gift_mark(g["id"], claimed_at=None)


async def activate_paid(bot: Bot, gift_id: int, method: str = "manual",
                        actor: str = "мастер"):
    """Оплата подтверждена: выпустить сертификат и разослать письма.

    Идемпотентно: активный возвращается как есть, отменённый — None.
    """
    from . import mailer, notify
    g = await db.gift_get(gift_id)
    if not g:
        return None
    if g["status"] == "active":
        return g
    if g["status"] != "pending":
        return None
    now = _now()
    await db.gift_mark(gift_id, status="active", paid_at=db.now_iso(),
                       pay_method=method, activated_at=db.now_iso(),
                       expires_at=_iso(now + timedelta(days=TTL_DAYS)))
    await db.gift_ledger_add(gift_id, g["amount"], "issue",
                             note=f"выпуск · {method} · {actor}")
    g2 = await db.gift_get(gift_id)
    # письмо покупателю — всегда (код, ссылка, PDF)
    await mailer.gift_event(g2, "paid_buyer")
    # получателю — сразу, если почта есть и вручение не отложено
    await _maybe_deliver(g2)
    if g2["buyer_user_id"] and g2["buyer_user_id"] > 0:
        await notify.notify_client(
            bot, g2["buyer_user_id"],
            f"🎁 <b>Подарочный сертификат на {config.fmt_money(g2['amount'])} ₽ "
            f"выпущен!</b>\n\nКод: <code>{g2['code']}</code>\n"
            f"Открыть и скачать: {gift_url(g2)}\n"
            f"Действует до {ru_date(g2['expires_at'])}."
            + (f"\n\nПисьмо получателю отправим {ru_date(g2['deliver_at'])} утром."
               if g2["deliver_at"] and not g2["delivered_at"] else ""))
    log.info("gift %s activated (%s, %s)", gift_id, method, actor)
    return g2


async def _maybe_deliver(g) -> bool:
    """Письмо получателю, если пора (или не назначена дата). True — ушло."""
    from . import mailer
    if not g["recip_contact"] or g["delivered_at"] or g["status"] != "active":
        return False
    if g["deliver_at"] and str(g["deliver_at"])[:10] > _now().strftime("%Y-%m-%d"):
        return False
    ok = await mailer.gift_event(g, "recipient")
    if ok:
        await db.gift_mark(g["id"], delivered_at=db.now_iso())
    return ok


async def cancel_pending(bot: Bot, g, by: str = "client") -> bool:
    from . import mailer, notify
    if g["status"] != "pending":
        return False
    await db.gift_mark(g["id"], status="canceled", canceled_at=db.now_iso())
    if by == "admin":
        await mailer.gift_event(await db.gift_get(g["id"]), "canceled")
        if g["buyer_user_id"] and g["buyer_user_id"] > 0:
            await notify.notify_client(
                bot, g["buyer_user_id"],
                "🎁 Оформление подарочного сертификата закрыто мастером. Если "
                "перевод всё-таки был — напишите сюда, разберёмся.")
    log.info("gift %s canceled by %s", g["id"], by)
    return True


# ------------------------------------------------------------- справки

def gift_url(g) -> str:
    return f"{config.SITE_URL}/gift.html?code={g['code']}"


async def public_json(g, *, with_code: bool) -> dict:
    """Карточка сертификата: для страницы-витрины и покупателя."""
    bal = await db.gift_balance(g["id"])
    st = state(g, bal)
    d = {
        "id": g["id"], "amount": g["amount"], "balance": bal,
        "state": st, "state_label": STATE_LABEL.get(st, st),
        "recip_name": g["recip_name"], "buyer_name": g["buyer_name"],
        "congrats": g["congrats"],
        "issued_at": (g["activated_at"] or g["created_at"] or "")[:10],
        "expires_at": g["expires_at"], "expires_ru": ru_date(g["expires_at"]),
        "deliver_at": g["deliver_at"], "delivered": bool(g["delivered_at"]),
        "serial": f"№ {g['id']:06d}",
    }
    if with_code and g["status"] not in ("pending", "canceled"):
        d["code"] = g["code"]
        d["url"] = gift_url(g)
    return d


async def order_gift_info(o) -> dict | None:
    """Сертификат заказа для карточек мастера: {code, amount, balance, state}.

    None — когда на заказе нет кода или сертификат не найден; карточка
    в этом случае показывает старую строку без номинала."""
    try:
        code = o["gift_code"]
    except (KeyError, IndexError):
        return None
    if not code:
        return None
    g = await db.gift_by_code(str(code))
    if not g:
        return None
    return {"code": g["code"], "amount": int(g["amount"] or 0),
            "balance": await db.gift_balance(g["id"]), "state": g["status"]}


async def buyer_json(g) -> dict:
    """Платёжная карточка оформления для покупателя (paysheet сайта)."""
    d = await public_json(g, with_code=True)
    d.update({
        "recip_contact_set": bool(g["recip_contact"]),
        "claimed": bool(g["claimed_at"]),
        "created_at": g["created_at"],
    })
    if g["status"] == "pending":
        d["requisites"] = await db.setting_get("requisites")
        d["pay_online"] = bool(config.pay_provider())
    return d


# ------------------------------------------------------- проверка и зачёт

async def check(code: str) -> tuple[object | None, str | None, int]:
    """(gift, err, balance): err — машинная причина отказа (None — годен)."""
    g = await db.gift_by_code(code)
    if not g:
        return None, "not_found", 0
    bal = await db.gift_balance(g["id"])
    st = state(g, bal)
    if st == "pending":
        return g, "not_paid", bal
    if st in ("blocked", "canceled"):
        return g, "blocked", bal
    if st == "expired":
        return g, "expired", bal
    if st == "spent" or bal <= 0:
        return g, "spent", bal
    return g, None, bal


async def attach_to_order(bot: Bot, order_id: int, code: str,
                          via: str = "кабинет") -> tuple[bool, str]:
    """Привязать код к заказу (списание случится при цене — sync_order).

    Правила: код годен; на заказе нет другого кода с удержанием; заказ без
    оплаченных платежей (после первой оплаты пропорции этапов не трогаем);
    сертификат не применяется к подпискам и закрытым делам.
    """
    o = await db.get_order(order_id)
    if not o:
        return False, "not_found"
    if (o["work_type"] or "").startswith("sub_"):
        return False, "gift_not_for_subs"
    if o["status"] in ("done", "cancel"):
        return False, "gift_stage"
    g, err, _bal = await check(code)
    if err:
        return False, err
    pays = await db.payments_for_order(order_id)
    if any(p["status"] == "paid" for p in pays):
        return False, "gift_after_payment"
    old = (o["gift_code"] or "").strip()
    if old and old != g["code"]:
        og = await db.gift_by_code(old)
        if og:
            await _release(og, order_id, "заменён другим сертификатом")
    await db.update_order(order_id, gift_code=g["code"])
    await db.add_event(order_id, "gift_attached", f"{g['code']} · {via}")
    await sync_order(bot, order_id)
    return True, ""


async def detach_from_order(bot: Bot, order_id: int) -> tuple[bool, str]:
    """Открепить код (до первой оплаты): удержание возвращается на сертификат."""
    o = await db.get_order(order_id)
    if not o or not (o["gift_code"] or "").strip():
        return False, "gift_nothing"
    pays = await db.payments_for_order(order_id)
    if any(p["status"] == "paid" for p in pays):
        return False, "gift_after_payment"
    g = await db.gift_by_code(o["gift_code"])
    if g:
        await _release(g, order_id, "код откреплён от заказа")
    await db.update_order(order_id, gift_code=None, gift_amount=0)
    await db.add_event(order_id, "gift_detached", o["gift_code"])
    return True, ""


async def _release(g, order_id: int, note: str) -> int:
    """Вернуть удержание заказа на сертификат. Возвращает сумму."""
    held = await db.gift_hold_for_order(g["id"], order_id)
    if held > 0:
        await db.gift_ledger_add(g["id"], held, "release", order_id,
                                 f"{note} · заказ №{order_id}")
    return held


async def sync_order(bot: Bot, order_id: int) -> int:
    """Привести удержание сертификата в соответствие делу. Возвращает зачёт ₽.

    Единая точка правды, зовётся при: назначении/изменении цены, применении
    и возврате бонусов, отмене и возобновлении заказа. Правила:
    — отменённый заказ и негодный сертификат отпускают удержание;
    — удержание = min(остаток+текущее удержание, «деньгами к оплате» до
      сертификата); после первой оплаты пропорции не пересматриваются.
    """
    o = await db.get_order(order_id)
    if not o:
        return 0
    code = (o["gift_code"] or "").strip()
    if not code:
        return 0
    g = await db.gift_by_code(code)
    if not g:
        await db.update_order(order_id, gift_amount=0)
        return 0
    prev = int(o["gift_amount"] or 0)

    async def _drop(reason: str) -> int:
        await _release(g, order_id, reason)
        if prev:
            await db.update_order(order_id, gift_amount=0)
            await db.add_event(order_id, "gift_off", f"{code}: {reason}")
        return 0

    if o["status"] == "cancel":
        return await _drop("заказ закрыт — средства возвращены на сертификат")
    if g["status"] != "active":
        return await _drop(f"сертификат: {STATE_LABEL.get(g['status'], g['status'])}")
    if g["expires_at"] and g["expires_at"] <= db.now_iso():
        return await _drop("срок сертификата истёк")
    pays = await db.payments_for_order(order_id)
    if any(p["status"] == "paid" for p in pays):
        return prev  # оплата пошла — зачёт зафиксирован, не трогаем
    price = int(o["price"] or 0)
    if price <= 0:
        return await _drop("цена ещё не назначена") if prev else 0
    due_before = max(price - int(o["bonus_spent"] or 0)
                     - int(o["sub_discount"] or 0) - int(o["promo_discount"] or 0), 0)
    held = await db.gift_hold_for_order(g["id"], order_id)
    avail = await db.gift_balance(g["id"]) + held  # свой hold можно перекроить
    want = min(avail, due_before)
    if want != held:
        if held:
            await db.gift_ledger_add(g["id"], held, "release", order_id,
                                     f"пересчёт · заказ №{order_id}")
        if want > 0:
            await db.gift_ledger_add(g["id"], -want, "hold", order_id,
                                     f"зачёт по заказу №{order_id}")
    if want != prev:
        await db.update_order(order_id, gift_amount=want)
        await db.add_event(order_id, "gift_applied",
                           f"{code}: −{want} ₽" if want else f"{code}: зачёт снят")
    return want


# ------------------------------------------------------- ручки мастера

async def block(bot: Bot, gift_id: int, note: str = "") -> bool:
    g = await db.gift_get(gift_id)
    if not g or g["status"] not in ("active", "expired"):
        return False
    await db.gift_mark(gift_id, status="blocked", blocked_at=db.now_iso(),
                       block_note=note[:300] or None)
    await db.gift_ledger_add(gift_id, 0, "adjust", note=f"блокировка: {note or '—'}")
    return True


async def unblock(gift_id: int) -> bool:
    g = await db.gift_get(gift_id)
    if not g or g["status"] != "blocked":
        return False
    st = "active"
    if g["expires_at"] and g["expires_at"] <= db.now_iso():
        st = "expired"
    await db.gift_mark(gift_id, status=st, blocked_at=None, block_note=None)
    await db.gift_ledger_add(gift_id, 0, "adjust", note="разблокирован")
    return True


async def extend(gift_id: int, days: int = 90) -> str | None:
    """Продлить срок: +days от нынешнего конца (или от сегодня, если истёк)."""
    g = await db.gift_get(gift_id)
    if not g or g["status"] not in ("active", "expired"):
        return None
    base = g["expires_at"] or db.now_iso()
    try:
        dt = datetime.strptime(base, "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        dt = _now()
    dt = max(dt, _now()) + timedelta(days=days)
    fields = {"expires_at": _iso(dt), "warned": 0}
    if g["status"] == "expired":
        fields["status"] = "active"
    await db.gift_mark(gift_id, **fields)
    await db.gift_ledger_add(gift_id, 0, "adjust", note=f"продлён на {days} дн.")
    return _iso(dt)


async def adjust(gift_id: int, delta: int, note: str = "") -> int:
    """Корректировка остатка мастером (±). Возвращает новый остаток."""
    g = await db.gift_get(gift_id)
    if not g:
        return 0
    bal = await db.gift_balance(gift_id)
    delta = max(delta, -bal)  # в минус не уводим
    if delta:
        await db.gift_ledger_add(gift_id, delta, "adjust",
                                 note=note or "корректировка мастером")
    return bal + delta


async def issue_manual(bot: Bot, *, amount: int, recip_name: str = "",
                       recip_contact: str = "", congrats: str = "",
                       note: str = ""):
    """Выпуск сертификата мастером (комплимент / продажа вне сайта)."""
    g = await create_pending(
        amount=amount, buyer_user_id=None, buyer_name="мастерская",
        buyer_contact="", recip_name=recip_name, recip_contact=recip_contact,
        congrats=congrats, deliver_at=None, via="мастер")
    if note:
        await db.gift_mark(g["id"], note=note[:300])
    return await activate_paid(bot, g["id"], method="manual", actor="мастер (выпуск)")


# ------------------------------------------------------- планировщик

async def sweep(bot: Bot) -> None:
    """Раз в день: доставка к дате, предупреждение о сгорании, сгорание,
    закрытие тухлых неоплаченных оформлений."""
    from . import mailer, notify
    now_s = db.now_iso()
    # доставка получателю (дата настала или письмо не ушло с первого раза)
    cur = await db.conn().execute(
        "SELECT * FROM gifts WHERE status='active' AND recip_contact IS NOT NULL "
        "AND delivered_at IS NULL")
    for g in await cur.fetchall():
        try:
            if await _maybe_deliver(g):
                if g["buyer_user_id"] and g["buyer_user_id"] > 0:
                    await notify.notify_client(
                        bot, g["buyer_user_id"],
                        f"🎁 Письмо с вашим сертификатом отправлено получателю "
                        f"({g['recip_name'] or g['recip_contact']}).")
        except Exception:  # noqa: BLE001 — один сертификат не валит обход
            log.exception("gift deliver failed for %s", g["id"])
    # предупреждение о сгорании остатка
    warn_edge = _iso(_now() + timedelta(days=WARN_DAYS))
    cur = await db.conn().execute(
        "SELECT * FROM gifts WHERE status='active' AND warned=0 "
        "AND expires_at IS NOT NULL AND expires_at > ? AND expires_at <= ?",
        (now_s, warn_edge))
    for g in await cur.fetchall():
        bal = await db.gift_balance(g["id"])
        await db.gift_mark(g["id"], warned=1)
        if bal > 0:
            await mailer.gift_event(g, "expiring", balance=bal)
    # сгорание
    cur = await db.conn().execute(
        "SELECT * FROM gifts WHERE status='active' AND expires_at IS NOT NULL "
        "AND expires_at <= ?", (now_s,))
    for g in await cur.fetchall():
        bal = await db.gift_balance(g["id"])
        await db.gift_mark(g["id"], status="expired")
        if bal > 0:
            await db.gift_ledger_add(g["id"], -bal, "expire",
                                     note=f"срок истёк, сгорело {bal} ₽")
            await notify.notify_admins(
                bot, f"🎁 Сертификат {g['code']} истёк, сгорел остаток "
                     f"{config.fmt_money(bal)} ₽. Клиент попросит продлить — "
                     "кнопка «Продлить» в админке вернёт остаток.")
    # тухлые оформления (кроме отмеченных «я оплатил» — те ждут сверки)
    stale_edge = _iso(_now() - timedelta(days=PENDING_TTL_DAYS))
    cur = await db.conn().execute(
        "SELECT * FROM gifts WHERE status='pending' AND claimed_at IS NULL "
        "AND created_at < ?", (stale_edge,))
    for g in await cur.fetchall():
        await db.gift_mark(g["id"], status="canceled", canceled_at=db.now_iso())
        await mailer.gift_event(g, "canceled")


async def stats() -> dict:
    """Плитки админки: в обращении, погашено, ожидают оплаты."""
    c = db.conn()
    cur = await c.execute(
        "SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM gifts WHERE status='active'")
    act = await cur.fetchone()
    cur = await c.execute(
        "SELECT COALESCE(SUM(l.delta),0) b FROM gift_ledger l "
        "JOIN gifts g ON g.id=l.gift_id WHERE g.status='active'")
    live = await cur.fetchone()
    cur = await c.execute(
        "SELECT COALESCE(-SUM(delta),0) s FROM gift_ledger "
        "WHERE kind IN ('hold') AND delta<0")
    held = await cur.fetchone()
    cur = await c.execute(
        "SELECT COUNT(*) n FROM gifts WHERE status='pending'")
    pend = await cur.fetchone()
    cur = await c.execute(
        "SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM gifts "
        "WHERE status='pending' AND claimed_at IS NOT NULL")
    claimed = await cur.fetchone()
    return {
        "active_n": int(act["n"] or 0), "active_sum": int(act["s"] or 0),
        "live_balance": int(live["b"] or 0),
        "redeemed_sum": int(held["s"] or 0),
        "pending_n": int(pend["n"] or 0),
        "claimed_n": int(claimed["n"] or 0), "claimed_sum": int(claimed["s"] or 0),
    }
