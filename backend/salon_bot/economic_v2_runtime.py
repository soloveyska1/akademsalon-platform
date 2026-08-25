"""Atomic Deposit V2 Reserve and fixed-200 referral economics.

This file is a deployment asset consumed by ``install_economic_safety.py``.
It is copied to ``app/services/economic_v2.py`` only after exact live-source
hashes and the SQLite migration preflight have passed.
"""
from __future__ import annotations

# economic-v2-reserve:20260825

import logging
from datetime import datetime, timedelta, timezone

from aiogram import Bot

from .. import config, db
from . import notify

log = logging.getLogger("salon.economic_v2")

DEPOSIT_SETTING = "economic_deposit_contract_v2"
DEPOSIT_ISSUANCE_SETTING = "economic_deposit_issuance_v2"
REFERRAL_SETTING = "economic_referral_contract_v2"
DEPOSIT_ON = "earned-v2:on"
DEPOSIT_ISSUANCE_ON = "earned-v2:open"
REFERRAL_ON = "fixed-200:on"
DEPOSIT_VERSION = "earned-v2-20260901"
LEGACY_VERSION = "legacy-v1"
REFERRAL_VERSION = "fixed-200-20260901"

RATES = [(60_000, 15), (45_000, 12), (30_000, 10), (20_000, 8)]
MIN_TOPUP = 20_000
MAX_TOPUP = 60_000
MAX_ACTIVE = 120_000
BONUS_TTL = 180
UPLIFT_HOLD_DAYS = 14
REFERRAL_REWARD = 200
REFERRAL_TTL = 90


class DepositV2Unavailable(RuntimeError):
    """The exact V2 contract is not enabled or needs reconciliation."""


class DepositLimitError(ValueError):
    """The atomic live-principal limit rejected a top-up."""


def rate_for(amount: int) -> int:
    for floor, pct in RATES:
        if amount >= floor:
            return pct
    return 0


def amount_ok(amount: int) -> bool:
    return MIN_TOPUP <= amount <= MAX_TOPUP and amount % 1000 == 0


def deposit_entitlement(net_consumed: int, rate_bp: int) -> int:
    """Gross lot entitlement from non-refunded principal actually used."""
    consumed = max(0, int(net_consumed))
    cap = max(0, int(rate_bp))
    if consumed <= 0:
        return 0
    usage_rate_bp = rate_for(max(consumed, MIN_TOPUP)) * 100
    return consumed * min(cap, usage_rate_bp) // 10_000


def lot_reward_step(
    *,
    old_principal: int,
    old_cashback: int,
    added_principal: int,
    added_cashback: int,
    rate_bp: int,
) -> dict[str, int]:
    """Return one monotonic lot-level best-of step."""
    old_p = max(0, int(old_principal))
    old_k = max(0, int(old_cashback))
    add_p = max(0, int(added_principal))
    add_k = max(0, int(added_cashback))
    old_target = max(deposit_entitlement(old_p, rate_bp), old_k)
    new_gross = deposit_entitlement(old_p + add_p, rate_bp)
    new_target = max(new_gross, old_k + add_k)
    delta = new_target - old_target
    base = min(delta, add_k)
    return {
        "old_target": old_target,
        "new_gross": new_gross,
        "new_target": new_target,
        "delta": delta,
        "base": base,
        "uplift": delta - base,
    }


def gross_vest_delta(old_consumed: int, new_consumed: int, rate_bp: int) -> int:
    """Cumulative, usage-tiered vesting prevents splitting and tier shopping."""
    old = max(0, int(old_consumed))
    new = max(old, int(new_consumed))
    return (
        deposit_entitlement(new, rate_bp)
        - deposit_entitlement(old, rate_bp)
    )


def reward_plan(*, paid_total: int, deposit_paid: int,
                deposit_gross: int, cashback_pct: int) -> dict[str, int]:
    """Return the higher of ordinary cashback and the deposit calculation."""
    base = max(0, int(paid_total))
    dep = min(base, max(0, int(deposit_paid)))
    pct = max(0, int(cashback_pct))
    normal = base * pct // 100
    deposit_variant = (base - dep) * pct // 100 + max(0, int(deposit_gross))
    target = max(normal, deposit_variant)
    return {
        "normal": normal,
        "deposit_variant": deposit_variant,
        "target": target,
        "uplift": max(0, target - normal),
    }


def allocation_net_after_refund(
    principal_amounts: list[int], refunded_deposit: int
) -> list[int]:
    """Return deterministic LIFO NET principal for a cumulative refund.

    The caller always passes the total deposit-funded amount returned for the
    order, not a delta.  Repeating the same request is therefore idempotent,
    while increasing it can only reduce NET principal.
    """
    amounts = [max(0, int(value)) for value in principal_amounts]
    left = max(0, int(refunded_deposit))
    if left > sum(amounts):
        raise ValueError("deposit_v2_refund_exceeds_order_deposit")
    result = list(amounts)
    for index in range(len(result) - 1, -1, -1):
        take = min(left, result[index])
        result[index] -= take
        left -= take
    return result


def _after_days(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).strftime(
        "%Y-%m-%dT%H:%M:%S")


async def _require_deposit_on() -> None:
    if await db.setting_get(DEPOSIT_SETTING, "") != DEPOSIT_ON:
        raise DepositV2Unavailable("deposit_v2_not_enabled")


async def _require_issuance_on() -> None:
    await _require_deposit_on()
    if await db.setting_get(DEPOSIT_ISSUANCE_SETTING, "") != DEPOSIT_ISSUANCE_ON:
        raise DepositV2Unavailable("deposit_v2_issuance_closed")


async def balance(user_id: int) -> int:
    cur = await db.conn().execute(
        "SELECT COALESCE(SUM(delta),0) FROM deposit_ledger WHERE user_id=?",
        (user_id,),
    )
    row = await cur.fetchone()
    return int(row[0] or 0)


async def dep_get(dep_id: int):
    cur = await db.conn().execute("SELECT * FROM deposits WHERE id=?", (dep_id,))
    return await cur.fetchone()


async def rows(user_id: int, limit: int = 40):
    cur = await db.conn().execute(
        "SELECT delta,kind,deposit_id,order_id,note,created_at "
        "FROM deposit_ledger WHERE user_id=? ORDER BY id DESC LIMIT ?",
        (user_id, limit),
    )
    return await cur.fetchall()


async def _live_principal(user_id: int) -> int:
    cur = await db.conn().execute(
        "SELECT COALESCE(SUM(principal_available+principal_pay_reserved+"
        "principal_refund_reserved),0) FROM deposit_v2_lots "
        "WHERE user_id=? AND state IN ('active','refund_pending')",
        (user_id,),
    )
    row = await cur.fetchone()
    return int(row[0] or 0)


async def summary(user_id: int) -> dict:
    bal = await balance(user_id)
    live = await _live_principal(user_id)
    issuance_on = (
        await db.setting_get(DEPOSIT_ISSUANCE_SETTING, "")
        == DEPOSIT_ISSUANCE_ON
    )
    return {
        "balance": bal,
        "min": MIN_TOPUP,
        "max": MAX_TOPUP,
        "rates": [{"from": f, "pct": p} for f, p in sorted(RATES)],
        "can_topup": issuance_on and live < MAX_ACTIVE,
        "issuance_on": issuance_on,
        "contract": DEPOSIT_VERSION,
    }


async def create_pending(*, user_id: int, amount: int, via: str = "кабинет"):
    """Create one V2 invoice while preserving unresolved legacy invoices."""
    await _require_issuance_on()
    if not amount_ok(amount):
        raise ValueError("bad_amount")
    pct = rate_for(amount)
    async with db.transaction():
        await _require_issuance_on()
        unresolved = await (await db.conn().execute(
            "SELECT l.state FROM deposits d LEFT JOIN deposit_v2_lots l "
            "ON l.deposit_id=d.id WHERE d.user_id=? AND d.status='pending' "
            "AND (COALESCE(l.contract_version,'')!=? "
            "OR COALESCE(l.state,'')!='invoice_pending') LIMIT 1",
            (user_id, DEPOSIT_VERSION),
        )).fetchone()
        if unresolved:
            raise DepositV2Unavailable("pending_money_review")
        await db._exec(
            "UPDATE deposits SET status='canceled',note=COALESCE(note,'') || "
            "' · перекрыт новым V2' WHERE user_id=? AND status='pending' "
            "AND id IN (SELECT deposit_id FROM deposit_v2_lots "
            "WHERE contract_version=? AND state='invoice_pending')",
            (user_id, DEPOSIT_VERSION),
        )
        await db._exec(
            "UPDATE deposit_v2_lots SET state='canceled',version=version+1,"
            "updated_at=? WHERE user_id=? AND state='invoice_pending' "
            "AND contract_version=?",
            (db.now_iso(), user_id, DEPOSIT_VERSION),
        )
        live = await _live_principal(user_id)
        if live + amount > MAX_ACTIVE:
            raise DepositLimitError("over_limit")
        cur = await db._exec(
            "INSERT INTO deposits(user_id,amount,bonus_pct,bonus_amount,status,"
            "via,created_at) VALUES(?,?,?,?, 'pending', ?, ?)",
            (user_id, amount, pct, amount * pct // 100, via, db.now_iso()),
        )
        dep_id = int(cur.lastrowid)
        lot = await (await db.conn().execute(
            "SELECT 1 FROM deposit_v2_lots WHERE deposit_id=? "
            "AND contract_version=? AND state='invoice_pending'",
            (dep_id, DEPOSIT_VERSION),
        )).fetchone()
        if not lot:
            raise RuntimeError("deposit_v2_lot_missing")
    return await dep_get(dep_id)


async def activate_paid(
    bot: Bot,
    dep_id: int,
    method: str = "manual",
    actor: str = "мастер",
    provider: str | None = None,
    external_id: str | None = None,
) -> dict | None:
    """Fund a lot once; paid-but-unallocatable money becomes a durable hold."""
    await _require_deposit_on()
    notify_payload = None
    async with db.transaction():
        await _require_deposit_on()
        d = await dep_get(dep_id)
        if not d:
            return None
        lot = await (await db.conn().execute(
            "SELECT * FROM deposit_v2_lots WHERE deposit_id=?", (dep_id,)
        )).fetchone()
        if not lot:
            raise RuntimeError("deposit_v2_lot_missing")
        if d["status"] == "active" and lot["state"] == "active":
            if provider and external_id:
                await db.receipt_mark_paid(provider, int(external_id), allocated=True)
            return {"state": "active", "deposit": dict(d), "duplicate": True}
        if d["status"] != "pending":
            return {"state": "closed", "deposit": dict(d)}
        op_key = f"activate:{dep_id}"
        await db._exec(
            "INSERT OR IGNORE INTO deposit_v2_ops(op_key,kind,state,deposit_id,"
            "user_id,provider,external_id,amount,created_at,updated_at) "
            "VALUES(?, 'activate','prepared',?,?,?,?,?,?,?)",
            (op_key, dep_id, d["user_id"], provider, external_id,
             d["amount"], db.now_iso(), db.now_iso()),
        )
        op = await (await db.conn().execute(
            "SELECT * FROM deposit_v2_ops WHERE op_key=?", (op_key,)
        )).fetchone()
        if not op:
            raise RuntimeError("deposit_v2_activation_op_missing")
        if op["state"] == "applied":
            return {"state": "active", "deposit": dict(d), "duplicate": True}
        live = await _live_principal(int(d["user_id"]))
        legacy_hold = (
            lot["contract_version"] == LEGACY_VERSION
            and lot["state"] == "paid_hold"
        )
        if legacy_hold or live + int(d["amount"]) > MAX_ACTIVE:
            reason = "legacy_reconcile" if legacy_hold else "over_limit"
            await db._exec(
                "UPDATE deposit_v2_lots SET state='paid_hold',version=version+1,"
                "updated_at=? WHERE deposit_id=?", (db.now_iso(), dep_id)
            )
            await db._exec(
                "UPDATE deposit_v2_ops SET state='paid_hold',error=?,updated_at=? "
                "WHERE id=?", (reason, db.now_iso(), op["id"])
            )
            if provider and external_id:
                await db.receipt_mark_paid(provider, int(external_id), allocated=False)
            return {"state": "paid_hold", "deposit": dict(d), "reason": reason}
        changed = await db._exec(
            "UPDATE deposits SET status='active',paid_at=?,pay_method=? "
            "WHERE id=? AND status='pending'",
            (db.now_iso(), method, dep_id),
        )
        if changed.rowcount != 1:
            raise RuntimeError("deposit_v2_activation_cas")
        changed = await db._exec(
            "UPDATE deposit_v2_lots SET principal_funded=principal_total,"
            "principal_available=principal_total,state='active',version=version+1,"
            "updated_at=? WHERE deposit_id=? AND principal_funded=0 "
            "AND state IN ('invoice_pending','legacy_manual_pending')",
            (db.now_iso(), dep_id),
        )
        if changed.rowcount != 1:
            raise RuntimeError("deposit_v2_activation_lot_cas")
        ledger = await db._exec(
            "INSERT INTO deposit_ledger(user_id,delta,kind,deposit_id,note,"
            "created_at,v2_op_id) VALUES(?,?, 'topup', ?, ?, ?, ?)",
            (d["user_id"], d["amount"], dep_id,
             f"пополнение V2 · {method} · {actor}", db.now_iso(), op["id"]),
        )
        legacy_bonus = 0
        if lot["contract_version"] == LEGACY_VERSION and int(d["bonus_amount"] or 0) > 0:
            legacy_bonus = int(d["bonus_amount"])
            await db._exec(
                "INSERT INTO bonus_ledger(user_id,delta,kind,note,expires_at,"
                "created_at,v2_op_id,deposit_id) VALUES(?,?, 'deposit_legacy',?,?,?,?,?)",
                (d["user_id"], legacy_bonus,
                 f"legacy +{d['bonus_pct']}% за пополнение депозита №{dep_id}",
                 _after_days(BONUS_TTL), db.now_iso(), op["id"], dep_id),
            )
        if ledger.rowcount != 1:
            raise RuntimeError("deposit_v2_activation_ledger_insert")
        changed = await db._exec(
            "UPDATE deposit_v2_ops SET state='applied',updated_at=? "
            "WHERE id=? AND state='prepared'",
            (db.now_iso(), op["id"]),
        )
        if changed.rowcount != 1:
            raise RuntimeError("deposit_v2_activation_op_cas")
        if provider and external_id:
            await db.receipt_mark_paid(provider, int(external_id), allocated=True)
        notify_payload = (
            int(d["user_id"]), int(d["amount"]), int(d["bonus_amount"]),
            int(d["bonus_pct"]), legacy_bonus,
        )
    uid, amount, target, pct, legacy_bonus = notify_payload
    bal = await balance(uid)
    if uid > 0:
        if legacy_bonus:
            benefit = (
                f"По сохранённым условиям начислено <b>{target}</b> бонусов "
                f"(+{pct}%), срок — {BONUS_TTL} дней."
            )
        else:
            benefit = (
                f"Зафиксирован бонусный резерв до <b>{target}</b> бонусов "
                f"(+{pct}%): он становится скидкой после фактической оплаты "
                "и приёмки заказов по правилам программы."
            )
        await notify.notify_client(
            bot, uid,
            f"💼 <b>Депозит пополнен на {config.fmt_money(amount)} ₽.</b>\n"
            f"{benefit}\nНа кошельке: <b>{config.fmt_money(bal)} ₽</b>.",
        )
    fresh = await dep_get(dep_id)
    return {"state": "active", "deposit": dict(fresh), "duplicate": False}


async def _operation(order_id: int, payment_kind: str):
    cur = await db.conn().execute(
        "SELECT * FROM deposit_v2_ops WHERE kind='pay' AND order_id=? "
        "AND payment_kind=? AND state IN "
        "('reserved','confirming','money_settled','effects_applied') "
        "ORDER BY id DESC LIMIT 1",
        (order_id, payment_kind),
    )
    return await cur.fetchone()


async def _settle_pay(op_id: int) -> bool:
    async with db.transaction():
        op = await (await db.conn().execute(
            "SELECT * FROM deposit_v2_ops WHERE id=?", (op_id,)
        )).fetchone()
        if not op:
            return False
        if op["state"] in ("money_settled", "effects_applied"):
            return True
        tombstone = await (await db.conn().execute(
            "SELECT complete FROM economic_order_reward_refunds WHERE order_id=?",
            (op["order_id"],),
        )).fetchone()
        if tombstone and int(tombstone["complete"] or 0):
            pay = await db.payment_get(int(op["payment_id"] or 0))
            if pay and pay["status"] in ("pending", "claimed", "paid"):
                changed = await db._exec(
                    "UPDATE payments SET status='canceled',paid_at=NULL "
                    "WHERE id=? AND method='deposit' AND status=?",
                    (pay["id"], pay["status"]),
                )
                if changed.rowcount != 1:
                    raise RuntimeError("deposit_v2_tombstone_payment_cas")
            await _release_pay_locked(op_id, "order_reward_tombstone")
            return False
        pay = await db.payment_get(int(op["payment_id"] or 0))
        if not pay or pay["status"] != "paid":
            return False
        allocs = await (await db.conn().execute(
            "SELECT * FROM deposit_v2_allocations WHERE op_id=? ORDER BY deposit_id",
            (op_id,),
        )).fetchall()
        if not allocs or sum(int(a["principal_amount"]) for a in allocs) != int(op["amount"]):
            raise RuntimeError("deposit_v2_allocation_mismatch")
        for allocation in allocs:
            lot = await (await db.conn().execute(
                "SELECT principal_consumed,bonus_rate_bp FROM deposit_v2_lots "
                "WHERE deposit_id=?", (allocation["deposit_id"],)
            )).fetchone()
            if not lot:
                raise RuntimeError("deposit_v2_settlement_lot_missing")
            principal = int(allocation["principal_amount"])
            old_consumed = int(lot["principal_consumed"] or 0)
            gross = gross_vest_delta(
                old_consumed, old_consumed + principal,
                int(lot["bonus_rate_bp"] or 0),
            )
            changed = await db._exec(
                "UPDATE deposit_v2_lots SET "
                "principal_pay_reserved=principal_pay_reserved-?,"
                "principal_consumed=principal_consumed+?,"
                "bonus_gross_vested=bonus_gross_vested+?,version=version+1,"
                "updated_at=? WHERE deposit_id=? AND principal_pay_reserved>=?",
                (principal, principal, gross, db.now_iso(),
                 allocation["deposit_id"], principal),
            )
            if changed.rowcount != 1:
                raise RuntimeError("deposit_v2_settlement_cas")
            changed = await db._exec(
                "UPDATE deposit_v2_allocations SET gross_vest_delta=? "
                "WHERE op_id=? AND deposit_id=? AND gross_vest_delta=0",
                (gross, op_id, allocation["deposit_id"]),
            )
            if changed.rowcount != 1:
                raise RuntimeError("deposit_v2_settlement_allocation_cas")
        changed = await db._exec(
            "UPDATE deposit_v2_ops SET state='money_settled',updated_at=? "
            "WHERE id=? AND state IN ('reserved','confirming')",
            (db.now_iso(), op_id),
        )
        if changed.rowcount != 1:
            raise RuntimeError("deposit_v2_settlement_op_cas")
        changed = await db._exec(
            "UPDATE deposit_ledger SET kind='pay',note=note || ' · подтверждено' "
            "WHERE v2_op_id=? AND kind='pay_reserve'", (op_id,)
        )
        if changed.rowcount != 1:
            raise RuntimeError("deposit_v2_settlement_ledger_cas")
    return True


async def settle_confirmed_payment(payment_id: int) -> bool:
    """Payment-service hook: consume exact reserved principal after paid CAS."""
    op = await (await db.conn().execute(
        "SELECT id FROM deposit_v2_ops WHERE kind='pay' AND payment_id=?",
        (payment_id,),
    )).fetchone()
    return bool(op and await _settle_pay(int(op["id"])))


async def mark_payment_effects_applied(payment_id: int) -> bool:
    """Close a pay saga only after the durable payment-effects receipt is applied."""
    async with db.transaction():
        op = await (await db.conn().execute(
            "SELECT * FROM deposit_v2_ops WHERE kind='pay' AND payment_id=?",
            (payment_id,),
        )).fetchone()
        if not op:
            return False
        if op["state"] == "effects_applied":
            return True
        receipt = await (await db.conn().execute(
            "SELECT effects_status FROM payment_receipts WHERE payment_id=?",
            (payment_id,),
        )).fetchone()
        if op["state"] != "money_settled" or not receipt \
                or receipt["effects_status"] != "applied":
            return False
        changed = await db._exec(
            "UPDATE deposit_v2_ops SET state='effects_applied',updated_at=? "
            "WHERE id=? AND state='money_settled'",
            (db.now_iso(), op["id"]),
        )
        return changed.rowcount == 1


async def _release_pay_locked(op_id: int, error: str) -> bool:
    """Release one unpaid reservation inside the caller transaction."""
    op = await (await db.conn().execute(
        "SELECT * FROM deposit_v2_ops WHERE id=?", (op_id,)
    )).fetchone()
    if not op or op["state"] in (
        "money_settled", "effects_applied", "released"
    ):
        return bool(op and op["state"] == "released")
    pay = await db.payment_get(int(op["payment_id"] or 0))
    if pay and pay["status"] == "paid":
        return False
    allocs = await (await db.conn().execute(
        "SELECT * FROM deposit_v2_allocations WHERE op_id=?", (op_id,)
    )).fetchall()
    for allocation in allocs:
        changed = await db._exec(
            "UPDATE deposit_v2_lots SET "
            "principal_pay_reserved=principal_pay_reserved-?,"
            "principal_available=principal_available+?,version=version+1,"
            "updated_at=? WHERE deposit_id=? AND principal_pay_reserved>=?",
            (allocation["principal_amount"], allocation["principal_amount"],
             db.now_iso(), allocation["deposit_id"],
             allocation["principal_amount"]),
        )
        if changed.rowcount != 1:
            raise RuntimeError("deposit_v2_release_cas")
    await db._exec(
        "INSERT INTO deposit_ledger(user_id,delta,kind,order_id,note,created_at,"
        "v2_op_id) VALUES(?,?, 'pay_release', ?, ?, ?, ?)",
        (op["user_id"], op["amount"], op["order_id"],
         f"откат резерва: {error}", db.now_iso(), op_id),
    )
    changed = await db._exec(
        "UPDATE deposit_v2_ops SET state='released',error=?,updated_at=? "
        "WHERE id=? AND state IN ('reserved','confirming')",
        (error[:300], db.now_iso(), op_id),
    )
    if changed.rowcount != 1:
        raise RuntimeError("deposit_v2_release_op_cas")
    return True


async def _release_pay(op_id: int, error: str) -> bool:
    async with db.transaction():
        return await _release_pay_locked(op_id, error)


async def _cancel_unsettled_order_payments_locked(order_id: int) -> int:
    """Cancel and release exact internal payments that have not settled money."""
    ops = await (await db.conn().execute(
        "SELECT * FROM deposit_v2_ops WHERE kind='pay' AND order_id=? "
        "AND state IN ('reserved','confirming') ORDER BY id",
        (order_id,),
    )).fetchall()
    released = 0
    for op in ops:
        pay = await db.payment_get(int(op["payment_id"] or 0))
        if pay and pay["status"] in ("pending", "claimed", "paid"):
            changed = await db._exec(
                "UPDATE payments SET status='canceled',paid_at=NULL "
                "WHERE id=? AND method='deposit' AND status=?",
                (pay["id"], pay["status"]),
            )
            if changed.rowcount != 1:
                raise RuntimeError("deposit_v2_cancel_payment_cas")
        elif pay and pay["status"] != "canceled":
            raise RuntimeError("deposit_v2_cancel_payment_state")
        released += int(await _release_pay_locked(
            int(op["id"]), "order_canceled_before_settlement"
        ))
    return released


async def pay_order(
    bot: Bot, order_id: int, actor: str = "клиент"
) -> tuple[bool, str, int]:
    """Reserve principal FIFO, confirm one exact payment, then settle once."""
    from . import payments, subs

    await _require_deposit_on()
    op_id = pay_id = None
    kind = ""
    amount = uid = 0
    async with db.transaction():
        await _require_deposit_on()
        order = await db.get_order(order_id)
        if not order:
            return False, "заказ не найден", 0
        uid = int(order["user_id"] or 0)
        if not uid:
            return False, "заказ не привязан к аккаунту", 0
        if int(order["deleted"] or 0):
            return False, "заказ находится в корзине и не может быть оплачен", await balance(uid)
        if subs.is_sub_order(order):
            return (
                False,
                "подписка оплачивается отдельно и не списывается с депозита",
                await balance(uid),
            )
        kind, amount = await payments.stage_amount(order)
        if amount <= 0:
            return False, "по заказу сейчас нет платежа к оплате", await balance(uid)
        existing = await _operation(order_id, kind)
        if existing:
            op_id = int(existing["id"])
            pay_id = int(existing["payment_id"] or 0)
        else:
            available = await (await db.conn().execute(
                "SELECT COALESCE(SUM(principal_available),0) n "
                "FROM deposit_v2_lots WHERE user_id=? AND state='active'",
                (uid,),
            )).fetchone()
            if int(available["n"] or 0) < amount:
                bal = await balance(uid)
                return (
                    False,
                    f"на кошельке {config.fmt_money(bal)} ₽ — на этап "
                    f"{config.fmt_money(amount)} ₽ не хватает",
                    bal,
                )
            attempt_row = await (await db.conn().execute(
                "SELECT COUNT(*) n FROM deposit_v2_ops WHERE kind='pay' "
                "AND order_id=? AND payment_kind=?", (order_id, kind)
            )).fetchone()
            attempt = int(attempt_row["n"] or 0) + 1
            op_key = f"pay:{order_id}:{kind}:{attempt}"
            cur = await db._exec(
                "INSERT INTO deposit_v2_ops(op_key,kind,state,user_id,order_id,"
                "payment_kind,amount,created_at,updated_at) "
                "VALUES(?, 'pay','reserved',?,?,?,?,?,?)",
                (op_key, uid, order_id, kind, amount, db.now_iso(), db.now_iso()),
            )
            op_id = int(cur.lastrowid)
            pay_id = await db.payment_create(
                order_id, kind, amount, "deposit", f"deposit-v2:{op_id}"
            )
            await db._exec(
                "UPDATE deposit_v2_ops SET payment_id=? WHERE id=?", (pay_id, op_id)
            )
            left = amount
            lots = await (await db.conn().execute(
                "SELECT * FROM deposit_v2_lots WHERE user_id=? AND state='active' "
                "AND principal_available>0 ORDER BY deposit_id", (uid,)
            )).fetchall()
            for lot in lots:
                if left <= 0:
                    break
                take = min(left, int(lot["principal_available"]))
                changed = await db._exec(
                    "UPDATE deposit_v2_lots SET "
                    "principal_available=principal_available-?,"
                    "principal_pay_reserved=principal_pay_reserved+?,version=version+1,"
                    "updated_at=? WHERE deposit_id=? AND principal_available>=?",
                    (take, take, db.now_iso(), lot["deposit_id"], take),
                )
                if changed.rowcount != 1:
                    raise RuntimeError("deposit_v2_reserve_cas")
                await db._exec(
                    "INSERT INTO deposit_v2_allocations(op_id,deposit_id,"
                    "principal_amount,gross_vest_delta) VALUES(?,?,?,?)",
                    (op_id, lot["deposit_id"], take, 0),
                )
                left -= take
            if left:
                raise RuntimeError("deposit_v2_fifo_shortfall")
            await db._exec(
                "INSERT INTO deposit_ledger(user_id,delta,kind,order_id,note,"
                "created_at,v2_op_id) VALUES(?,?, 'pay_reserve', ?, ?, ?, ?)",
                (uid, -amount, order_id, f"резерв оплаты · {actor}",
                 db.now_iso(), op_id),
            )
    op = await (await db.conn().execute(
        "SELECT * FROM deposit_v2_ops WHERE id=?", (op_id,)
    )).fetchone()
    if op["state"] == "effects_applied":
        return True, "", await balance(uid)
    pay = await db.payment_get(pay_id)
    if not pay or pay["status"] != "paid":
        await db._exec(
            "UPDATE deposit_v2_ops SET state='confirming',updated_at=? "
            "WHERE id=? AND state='reserved'", (db.now_iso(), op_id)
        )
    result = await payments.confirm(
        bot, order_id, kind, amount, method="deposit",
        external_id=f"deposit-v2:{op_id}", actor=f"депозит · {actor}",
        pay_id=pay_id, allow_create=False,
    )
    if result.get("ok"):
        final = await (await db.conn().execute(
            "SELECT state FROM deposit_v2_ops WHERE id=?", (op_id,)
        )).fetchone()
        if final and final["state"] == "effects_applied":
            return True, "", await balance(uid)
        return False, "платёж подтверждён и завершается; повторите чуть позже", await balance(uid)
    pay = await db.payment_get(pay_id)
    if pay and pay["status"] == "paid":
        return (
            False,
            "платёж подтверждён и завершается; повторите чуть позже",
            await balance(uid),
        )
    await _release_pay(op_id, str(result.get("error") or "confirm_failed"))
    return False, "платёж не проведён; деньги возвращены на депозит", await balance(uid)


async def recover_payments(bot: Bot, limit: int = 100) -> dict:
    """Finish crash-interrupted paid operations or release canceled ones."""
    from . import payments

    cur = await db.conn().execute(
        "SELECT * FROM deposit_v2_ops WHERE kind='pay' "
        "AND state IN ('reserved','confirming','money_settled') "
        "ORDER BY id LIMIT ?", (limit,)
    )
    settled = released = pending = 0
    for op in await cur.fetchall():
        canceled_for_order = 0
        async with db.transaction():
            tombstone = await (await db.conn().execute(
                "SELECT complete FROM economic_order_reward_refunds "
                "WHERE order_id=?", (op["order_id"],)
            )).fetchone()
            if tombstone and int(tombstone["complete"] or 0):
                canceled_for_order = await _cancel_unsettled_order_payments_locked(
                    int(op["order_id"])
                )
        if canceled_for_order:
            released += canceled_for_order
            continue
        pay = await db.payment_get(int(op["payment_id"] or 0))
        if pay and pay["status"] in ("pending", "claimed", "paid"):
            result = await payments.confirm(
                bot, int(op["order_id"]), str(op["payment_kind"]),
                int(op["amount"]), method="deposit",
                external_id=f"deposit-v2:{op['id']}",
                actor="deposit-v2 recovery", pay_id=int(op["payment_id"]),
                allow_create=False,
            )
            fresh = await (await db.conn().execute(
                "SELECT state FROM deposit_v2_ops WHERE id=?", (op["id"],)
            )).fetchone()
            if result.get("ok") and fresh and fresh["state"] == "effects_applied":
                settled += 1
            else:
                pending += 1
        elif pay and pay["status"] == "canceled":
            released += int(await _release_pay(int(op["id"]), "payment_canceled"))
        else:
            pending += 1
    return {"settled": settled, "released": released, "pending": pending}


async def resolve_paid_hold(
    bot: Bot, dep_id: int, actor: str = "мастер"
) -> tuple[bool, str, int]:
    """Explicitly allocate received money after cap/legacy reconciliation."""
    await _require_deposit_on()
    provider = external_id = None
    amount = 0
    async with db.transaction():
        await _require_deposit_on()
        d = await dep_get(dep_id)
        lot = await (await db.conn().execute(
            "SELECT * FROM deposit_v2_lots WHERE deposit_id=?", (dep_id,)
        )).fetchone()
        activation = await (await db.conn().execute(
            "SELECT * FROM deposit_v2_ops WHERE deposit_id=? AND kind='activate' "
            "ORDER BY id DESC LIMIT 1", (dep_id,),
        )).fetchone()
        if not d or not lot or not activation:
            return False, f"paid_hold депозита №{dep_id} не найден", 0
        held = (
            d["status"] == "pending" and lot["state"] == "paid_hold"
            and activation["state"] == "paid_hold"
        )
        resumable = (
            d["status"] == "pending"
            and lot["state"] in ("invoice_pending", "legacy_manual_pending")
            and activation["state"] == "prepared"
            and activation["error"] == "paid_hold_resume"
        )
        if not held and not resumable:
            return False, f"депозит №{dep_id} не ожидает сверки paid_hold", 0
        amount = int(d["amount"] or 0)
        if await _live_principal(int(d["user_id"])) + amount > MAX_ACTIVE:
            return False, "после сверки всё ещё превышен потолок 120 000 ₽", amount
        target_state = (
            "legacy_manual_pending"
            if lot["contract_version"] == LEGACY_VERSION
            else "invoice_pending"
        )
        if held:
            changed = await db._exec(
                "UPDATE deposit_v2_lots SET state=?,version=version+1,updated_at=? "
                "WHERE deposit_id=? AND state='paid_hold' AND principal_funded=0",
                (target_state, db.now_iso(), dep_id),
            )
            if changed.rowcount != 1:
                raise RuntimeError("deposit_v2_paid_hold_allocate_cas")
            changed = await db._exec(
                "UPDATE deposit_v2_ops SET state='prepared',error='paid_hold_resume',"
                "updated_at=? WHERE id=? AND state='paid_hold'",
                (db.now_iso(), activation["id"]),
            )
            if changed.rowcount != 1:
                raise RuntimeError("deposit_v2_paid_hold_op_cas")
        provider = activation["provider"]
        external_id = activation["external_id"]
    result = await activate_paid(
        bot, dep_id, method="reconciled", actor=actor,
        provider=provider, external_id=external_id,
    )
    if not result or result.get("state") != "active":
        return False, f"депозит №{dep_id} остался на сверке", amount
    return True, f"Депозит №{dep_id} распределён после сверки: {amount} ₽.", amount


async def prepare_refund(
    dep_id: int, actor: str = "мастер"
) -> tuple[bool, str, int, int]:
    """Reserve the exact unused principal before the operator transfers cash."""
    await _require_deposit_on()
    async with db.transaction():
        d = await dep_get(dep_id)
        lot = await (await db.conn().execute(
            "SELECT * FROM deposit_v2_lots WHERE deposit_id=?", (dep_id,)
        )).fetchone()
        if not d or not lot:
            return False, f"депозит №{dep_id} не найден", 0, 0
        active = d["status"] == "active" and lot["state"] == "active"
        paid_hold = (
            d["status"] == "pending" and lot["state"] == "paid_hold"
            and int(lot["principal_funded"] or 0) == 0
        )
        if not active and not paid_hold:
            return False, f"депозит №{dep_id} нельзя вернуть из текущего статуса", 0, 0
        if active and int(lot["principal_pay_reserved"] or 0):
            return False, "по депозиту завершается оплата заказа; повторите после сверки", 0, 0
        if paid_hold:
            activation = await (await db.conn().execute(
                "SELECT 1 FROM deposit_v2_ops WHERE deposit_id=? AND kind='activate' "
                "AND state='paid_hold' LIMIT 1", (dep_id,),
            )).fetchone()
            if not activation:
                raise RuntimeError("deposit_v2_paid_hold_op_missing")
        amount = (
            int(lot["principal_total"] or 0)
            if paid_hold else int(lot["principal_available"] or 0)
        )
        if amount <= 0:
            return False, "у этого пополнения нет неиспользованного денежного остатка", 0, 0
        attempt_row = await (await db.conn().execute(
            "SELECT COUNT(*) n FROM deposit_v2_ops WHERE kind='refund' AND deposit_id=?",
            (dep_id,),
        )).fetchone()
        attempt = int(attempt_row["n"] or 0) + 1
        op_key = f"refund:{dep_id}:{attempt}"
        cur = await db._exec(
            "INSERT INTO deposit_v2_ops(op_key,kind,state,deposit_id,user_id,"
            "amount,created_at,updated_at) VALUES(?, 'refund','reserved',?,?,?,?,?)",
            (op_key, dep_id, d["user_id"], amount, db.now_iso(), db.now_iso()),
        )
        op_id = int(cur.lastrowid)
        if paid_hold:
            changed = await db._exec(
                "UPDATE deposit_v2_lots SET state='refund_pending',"
                "version=version+1,updated_at=? WHERE deposit_id=? "
                "AND state='paid_hold' AND principal_funded=0",
                (db.now_iso(), dep_id),
            )
        else:
            changed = await db._exec(
                "UPDATE deposit_v2_lots SET principal_available=principal_available-?,"
                "principal_refund_reserved=principal_refund_reserved+?,"
                "state='refund_pending',version=version+1,updated_at=? "
                "WHERE deposit_id=? AND principal_available=?",
                (amount, amount, db.now_iso(), dep_id, amount),
            )
        if changed.rowcount != 1:
            raise RuntimeError("deposit_v2_refund_reserve_cas")
    report = (
        f"Депозит №{dep_id}: подготовлен возврат "
        f"<b>{config.fmt_money(amount)} ₽</b>. Денежный остаток зарезервирован; "
        f"после фактического перевода подтвердите операцию №{op_id}."
    )
    return True, report, amount, op_id


async def confirm_refund(
    op_id: int, actor: str = "мастер"
) -> tuple[bool, str, int]:
    """Close the ledger only after the operator confirms the real transfer."""
    await _require_deposit_on()
    async with db.transaction():
        await _require_deposit_on()
        op = await (await db.conn().execute(
            "SELECT * FROM deposit_v2_ops WHERE id=? AND kind='refund'", (op_id,)
        )).fetchone()
        if not op:
            return False, f"операция возврата №{op_id} не найдена", 0
        if op["state"] == "applied":
            return True, f"возврат №{op_id} уже подтверждён", int(op["amount"])
        if op["state"] != "reserved":
            return False, f"операция №{op_id} в статусе {op['state']}", 0
        lot = await (await db.conn().execute(
            "SELECT * FROM deposit_v2_lots WHERE deposit_id=?", (op["deposit_id"],)
        )).fetchone()
        d = await dep_get(int(op["deposit_id"]))
        if not d or not lot:
            raise RuntimeError("deposit_v2_refund_subject_missing")
        amount = int(op["amount"])
        paid_hold = bool(
            d["status"] == "pending"
            and lot["state"] == "refund_pending"
            and int(lot["principal_funded"] or 0) == 0
            and int(lot["principal_total"] or 0) == amount
        )
        if not paid_hold and (
            not lot or int(lot["principal_refund_reserved"]) != amount
        ):
            raise RuntimeError("deposit_v2_refund_amount_mismatch")
        if paid_hold:
            activation = await (await db.conn().execute(
                "SELECT * FROM deposit_v2_ops WHERE deposit_id=? "
                "AND kind='activate' AND state='paid_hold' ORDER BY id DESC LIMIT 1",
                (op["deposit_id"],),
            )).fetchone()
            if not activation:
                raise RuntimeError("deposit_v2_paid_hold_activation_missing")
            changed = await db._exec(
                "UPDATE deposit_v2_ops SET state='prepared',updated_at=? "
                "WHERE id=? AND state='paid_hold'",
                (db.now_iso(), activation["id"]),
            )
            if changed.rowcount != 1:
                raise RuntimeError("deposit_v2_paid_hold_refund_op_cas")
            await db._exec(
                "INSERT INTO deposit_ledger(user_id,delta,kind,deposit_id,note,"
                "created_at,v2_op_id) VALUES(?,?, 'topup', ?, ?, ?, ?)",
                (op["user_id"], amount, op["deposit_id"],
                 "получено и возвращено из paid_hold", db.now_iso(),
                 activation["id"]),
            )
            await db._exec(
                "UPDATE deposit_v2_ops SET state='refunded',updated_at=? WHERE id=?",
                (db.now_iso(), activation["id"]),
            )
        elif lot["contract_version"] == LEGACY_VERSION:
            accrual = await (await db.conn().execute(
                "SELECT * FROM bonus_ledger WHERE user_id=? AND kind='deposit_legacy' "
                "AND deposit_id=? AND delta>0 ORDER BY id DESC LIMIT 1",
                (op["user_id"], op["deposit_id"]),
            )).fetchone()
            if accrual:
                spent = min(int(accrual["consumed"] or 0), int(accrual["delta"] or 0))
                unspent = max(0, int(accrual["delta"] or 0) - spent)
                await db._exec(
                    "UPDATE bonus_ledger SET consumed=delta WHERE id=?", (accrual["id"],)
                )
                if unspent:
                    await db.bonus_add(
                        op["user_id"], -unspent, "revoke",
                        f"возврат legacy-депозита №{op['deposit_id']}",
                    )
        await db._exec(
            "INSERT INTO deposit_ledger(user_id,delta,kind,deposit_id,note,created_at,"
            "v2_op_id) VALUES(?,?, 'refund', ?, ?, ?, ?)",
            (op["user_id"], -amount, op["deposit_id"],
             f"возврат подтверждён · {actor}", db.now_iso(), op_id),
        )
        if paid_hold:
            await db._exec(
                "UPDATE deposit_v2_lots SET principal_funded=?,"
                "principal_refunded=?,state='closed',version=version+1,updated_at=? "
                "WHERE deposit_id=? AND principal_funded=0",
                (amount, amount, db.now_iso(), op["deposit_id"]),
            )
        else:
            await db._exec(
                "UPDATE deposit_v2_lots SET principal_refund_reserved=0,"
                "principal_refunded=principal_refunded+?,state='closed',"
                "version=version+1,updated_at=? WHERE deposit_id=?",
                (amount, db.now_iso(), op["deposit_id"]),
            )
        await db._exec(
            "UPDATE deposit_v2_ops SET state='applied',updated_at=? WHERE id=?",
            (db.now_iso(), op_id),
        )
        changed = await db._exec(
            "UPDATE deposits SET status='refunded',refunded_at=?,refund_note=? "
            "WHERE id=? AND status=?",
            (db.now_iso(), f"возврат · {actor}", op["deposit_id"], d["status"]),
        )
        if changed.rowcount != 1:
            raise RuntimeError("deposit_v2_refund_close_cas")
    return (
        True,
        f"Возврат №{op_id} подтверждён: клиенту перечислено "
        f"<b>{config.fmt_money(amount)} ₽</b>. Использованные скидки из "
        "денежного возврата не вычитались.",
        amount,
    )


async def cancel_refund(
    op_id: int, actor: str = "мастер"
) -> tuple[bool, str, int]:
    await _require_deposit_on()
    async with db.transaction():
        await _require_deposit_on()
        op = await (await db.conn().execute(
            "SELECT * FROM deposit_v2_ops WHERE id=? AND kind='refund'", (op_id,)
        )).fetchone()
        if not op or op["state"] != "reserved":
            return False, "операция не найдена или уже завершена", 0
        amount = int(op["amount"])
        lot = await (await db.conn().execute(
            "SELECT * FROM deposit_v2_lots WHERE deposit_id=?", (op["deposit_id"],)
        )).fetchone()
        if lot and lot["state"] == "refund_pending" \
                and int(lot["principal_funded"] or 0) == 0:
            changed = await db._exec(
                "UPDATE deposit_v2_lots SET state='paid_hold',version=version+1,"
                "updated_at=? WHERE deposit_id=? AND state='refund_pending' "
                "AND principal_funded=0",
                (db.now_iso(), op["deposit_id"]),
            )
        else:
            changed = await db._exec(
                "UPDATE deposit_v2_lots SET principal_refund_reserved=0,"
                "principal_available=principal_available+?,state='active',"
                "version=version+1,updated_at=? WHERE deposit_id=? "
                "AND principal_refund_reserved=?",
                (amount, db.now_iso(), op["deposit_id"], amount),
            )
        if changed.rowcount != 1:
            raise RuntimeError("deposit_v2_refund_cancel_cas")
        await db._exec(
            "UPDATE deposit_v2_ops SET state='released',error=?,updated_at=? WHERE id=?",
            (f"cancelled by {actor}", db.now_iso(), op_id),
        )
    return True, f"Резерв возврата №{op_id} отменён; деньги снова доступны.", amount


async def _settle_debt_for(user_id: int) -> int:
    async with db.transaction():
        debt = await (await db.conn().execute(
            "SELECT amount FROM economic_bonus_debts WHERE user_id=?", (user_id,)
        )).fetchone()
        left = int(debt["amount"] or 0) if debt else 0
        if left <= 0:
            return 0
        paid = 0
        for row in await db.bonus_active_accruals(user_id):
            if left <= 0:
                break
            available = int(row["delta"] - row["consumed"])
            take = min(available, left)
            await db._exec(
                "UPDATE bonus_ledger SET consumed=consumed+? WHERE id=?",
                (take, row["id"]),
            )
            paid += take
            left -= take
        if paid:
            await db.bonus_add(
                user_id, -paid, "revoke",
                "зачёт ранее использованной отменённой скидки",
            )
            await db._exec(
                "UPDATE economic_bonus_debts SET amount=?,updated_at=? WHERE user_id=?",
                (left, db.now_iso(), user_id),
            )
        return paid


async def settle_bonus_debt(user_id: int | None = None) -> int:
    if user_id is not None:
        return await _settle_debt_for(int(user_id))
    cur = await db.conn().execute(
        "SELECT user_id FROM economic_bonus_debts WHERE amount>0 ORDER BY user_id"
    )
    paid = 0
    for row in await cur.fetchall():
        paid += await _settle_debt_for(int(row["user_id"]))
    return paid


async def release_ready_rewards(user_id: int | None = None) -> list[dict]:
    """Release only matured uplifts for fully accepted, non-deleted work."""
    args: list[object] = [db.now_iso()]
    where = "c.state='held' AND c.release_at<=?"
    if user_id is not None:
        where += " AND c.user_id=?"
        args.append(int(user_id))
    released: list[dict] = []
    async with db.transaction():
        start_sql = (
            "UPDATE deposit_v2_reward_claims SET release_at=?,updated_at=? "
            "WHERE state='held' AND release_at IS NULL AND EXISTS("
            "SELECT 1 FROM orders o WHERE o.id=deposit_v2_reward_claims.order_id "
            "AND COALESCE(o.deleted,0)=0 AND (o.status='done' OR "
            "COALESCE(o.parts_done,0)>=CASE WHEN COALESCE(o.stages_total,0)>0 "
            "THEN o.stages_total ELSE 1 END))"
        )
        start_args: list[object] = [
            _after_days(UPLIFT_HOLD_DAYS), db.now_iso()
        ]
        if user_id is not None:
            start_sql += " AND user_id=?"
            start_args.append(int(user_id))
        await db._exec(start_sql, tuple(start_args))
        cur = await db.conn().execute(
            "SELECT c.* FROM deposit_v2_reward_claims c "
            "JOIN orders o ON o.id=c.order_id "
            f"WHERE {where} AND COALESCE(o.deleted,0)=0 "
            "AND (o.status='done' OR COALESCE(o.parts_done,0)>=CASE "
            "WHEN COALESCE(o.stages_total,0)>0 THEN o.stages_total ELSE 1 END) "
            "ORDER BY c.id",
            tuple(args),
        )
        for claim in await cur.fetchall():
            amount = int(claim["uplift_amount"] or 0)
            if amount <= 0:
                await db._exec(
                    "UPDATE deposit_v2_reward_claims SET state='no_uplift',"
                    "updated_at=? WHERE id=? AND state='held'",
                    (db.now_iso(), claim["id"]),
                )
                continue
            allocations = await (await db.conn().execute(
                "SELECT a.* FROM deposit_v2_allocations a "
                "JOIN deposit_v2_ops op ON op.id=a.op_id "
                "WHERE op.order_id=? AND a.reward_state='counted' "
                "AND a.uplift_delta>0 AND a.uplift_ledger_id IS NULL "
                "ORDER BY a.deposit_id,a.op_id",
                (claim["order_id"],),
            )).fetchall()
            if sum(int(row["uplift_delta"]) for row in allocations) != amount:
                raise RuntimeError("deposit_v2_uplift_allocation_drift")
            first_ledger_id = None
            for allocation in allocations:
                ledger = await db._exec(
                    "INSERT INTO bonus_ledger(user_id,delta,kind,note,order_id,"
                    "expires_at,created_at,v2_claim_id,deposit_id) "
                    "VALUES(?,?, 'deposit_v2',?,?,?,?,?,?)",
                    (
                        claim["user_id"], allocation["uplift_delta"],
                        f"депозитная выгода по заказу "
                        f"{config.order_no(claim['order_id'])}",
                        claim["order_id"], _after_days(BONUS_TTL), db.now_iso(),
                        claim["id"], allocation["deposit_id"],
                    ),
                )
                first_ledger_id = first_ledger_id or int(ledger.lastrowid)
                changed = await db._exec(
                    "UPDATE deposit_v2_allocations SET uplift_ledger_id=? "
                    "WHERE op_id=? AND deposit_id=? AND reward_state='counted' "
                    "AND uplift_delta=? AND uplift_ledger_id IS NULL",
                    (
                        ledger.lastrowid, allocation["op_id"],
                        allocation["deposit_id"], allocation["uplift_delta"],
                    ),
                )
                if changed.rowcount != 1:
                    raise RuntimeError("deposit_v2_uplift_ledger_cas")
            changed = await db._exec(
                "UPDATE deposit_v2_reward_claims SET state='released',"
                "uplift_ledger_id=?,updated_at=? WHERE id=? AND state='held'",
                (first_ledger_id, db.now_iso(), claim["id"]),
            )
            if changed.rowcount != 1:
                raise RuntimeError("deposit_v2_reward_release_cas")
            released.append({
                "user_id": int(claim["user_id"]),
                "order_id": int(claim["order_id"]),
                "amount": amount,
            })
    for item in released:
        await _settle_debt_for(item["user_id"])
    return released


async def _reduce_ledger_to(
    user_id: int, ledger_id: int, order_id: int, target_reduced: int
) -> tuple[int, int]:
    """Reduce one accrual to a cumulative target exactly once."""
    row = await (await db.conn().execute(
        "SELECT * FROM bonus_ledger WHERE id=? AND user_id=? AND delta>0",
        (ledger_id, user_id),
    )).fetchone()
    if not row:
        return 0, 0
    marker = await (await db.conn().execute(
        "SELECT * FROM economic_reward_reversals WHERE bonus_ledger_id=?",
        (ledger_id,),
    )).fetchone()
    previous = int(marker["total_reduced"] or 0) if marker else 0
    target = max(0, int(target_reduced))
    if target < previous or target > int(row["delta"] or 0):
        raise RuntimeError("economic_reward_reduction_target_invalid")
    reduction = target - previous
    if reduction == 0:
        return 0, 0
    available = max(0, int(row["delta"] or 0) - int(row["consumed"] or 0))
    unspent = min(reduction, available)
    spent = reduction - unspent
    if unspent:
        changed = await db._exec(
            "UPDATE bonus_ledger SET consumed=consumed+? WHERE id=? "
            "AND consumed+?<=delta",
            (unspent, ledger_id, unspent),
        )
        if changed.rowcount != 1:
            raise RuntimeError("economic_reward_reduction_cas")
        await db.bonus_add(
            user_id, -unspent, "revoke",
            f"возврат по заказу {config.order_no(order_id)}", order_id,
        )
    if spent:
        await db._exec(
            "INSERT INTO economic_bonus_debts(user_id,amount,updated_at) VALUES(?,?,?) "
            "ON CONFLICT(user_id) DO UPDATE SET amount=amount+excluded.amount,"
            "updated_at=excluded.updated_at",
            (user_id, spent, db.now_iso()),
        )
    now = db.now_iso()
    if marker:
        changed = await db._exec(
            "UPDATE economic_reward_reversals SET total_reduced=?,"
            "unspent_revoked=unspent_revoked+?,future_debt=future_debt+?,"
            "updated_at=? WHERE bonus_ledger_id=? AND total_reduced=?",
            (target, unspent, spent, now, ledger_id, previous),
        )
        if changed.rowcount != 1:
            raise RuntimeError("economic_reward_reversal_marker_cas")
    else:
        await db._exec(
            "INSERT INTO economic_reward_reversals(bonus_ledger_id,user_id,"
            "order_id,total_reduced,unspent_revoked,future_debt,created_at,"
            "updated_at) VALUES(?,?,?,?,?,?,?,?)",
            (ledger_id, user_id, order_id, target, unspent, spent, now, now),
        )
    return unspent, spent


async def _reduce_lot_entitlement(
    user_id: int,
    deposit_id: int,
    order_id: int,
    revision: int,
    principal_reversed: int,
    amount: int,
) -> tuple[int, int, int, int]:
    """Cancel held value first, then revoke unspent/expired/spent value."""
    reduction = max(0, int(amount))
    existing = await (await db.conn().execute(
        "SELECT 1 FROM economic_lot_reward_adjustments WHERE deposit_id=? "
        "AND order_id=? AND revision=?",
        (deposit_id, order_id, revision),
    )).fetchone()
    if existing:
        return 0, 0, 0, 0
    left = reduction
    held_canceled = unspent_revoked = expired_ignored = future_debt = 0

    held_rows = await (await db.conn().execute(
        "SELECT a.op_id,a.deposit_id,a.uplift_delta,c.id claim_id,c.order_id "
        "FROM deposit_v2_allocations a "
        "JOIN deposit_v2_ops op ON op.id=a.op_id "
        "JOIN deposit_v2_reward_claims c ON c.order_id=op.order_id "
        "WHERE a.deposit_id=? AND a.uplift_delta>0 "
        "AND a.uplift_ledger_id IS NULL AND c.state='held' "
        "ORDER BY (c.order_id=? ) DESC,c.id DESC,a.op_id DESC",
        (deposit_id, order_id),
    )).fetchall()
    for row in held_rows:
        if left <= 0:
            break
        take = min(left, int(row["uplift_delta"] or 0))
        changed = await db._exec(
            "UPDATE deposit_v2_allocations SET uplift_delta=uplift_delta-?,"
            "entitlement_delta=entitlement_delta-? WHERE op_id=? AND deposit_id=? "
            "AND uplift_ledger_id IS NULL AND uplift_delta>=?",
            (take, take, row["op_id"], deposit_id, take),
        )
        if changed.rowcount != 1:
            raise RuntimeError("deposit_v2_held_reduction_cas")
        changed = await db._exec(
            "UPDATE deposit_v2_reward_claims SET uplift_amount=uplift_amount-?,"
            "awarded=awarded-?,state=CASE WHEN uplift_amount-?=0 "
            "THEN 'no_uplift' ELSE state END,updated_at=? "
            "WHERE id=? AND state='held' AND uplift_amount>=?",
            (take, take, take, db.now_iso(), row["claim_id"], take),
        )
        if changed.rowcount != 1:
            raise RuntimeError("deposit_v2_held_claim_reduction_cas")
        left -= take
        held_canceled += take

    active_rows = await (await db.conn().execute(
        "SELECT id,delta,consumed FROM bonus_ledger WHERE user_id=? "
        "AND deposit_id=? AND kind IN ('deposit_v2_base','deposit_v2') "
        "AND delta>0 AND consumed<delta "
        "AND (expires_at IS NULL OR expires_at>?) ORDER BY id",
        (user_id, deposit_id, db.now_iso()),
    )).fetchall()
    for row in active_rows:
        if left <= 0:
            break
        take = min(left, int(row["delta"] or 0) - int(row["consumed"] or 0))
        changed = await db._exec(
            "UPDATE bonus_ledger SET consumed=consumed+? WHERE id=? "
            "AND consumed+?<=delta", (take, row["id"], take)
        )
        if changed.rowcount != 1:
            raise RuntimeError("deposit_v2_active_bonus_reduction_cas")
        await db.bonus_add(
            user_id, -take, "revoke",
            f"перерасчёт депозита №{deposit_id} после возврата", order_id,
        )
        left -= take
        unspent_revoked += take

    if left:
        expired_rows = await (await db.conn().execute(
            "SELECT id,delta,consumed FROM bonus_ledger WHERE user_id=? "
            "AND deposit_id=? AND kind IN ('deposit_v2_base','deposit_v2') "
            "AND delta>0 AND consumed<delta AND expires_at IS NOT NULL "
            "AND expires_at<=? ORDER BY id",
            (user_id, deposit_id, db.now_iso()),
        )).fetchall()
        for row in expired_rows:
            if left <= 0:
                break
            take = min(left, int(row["delta"] or 0) - int(row["consumed"] or 0))
            changed = await db._exec(
                "UPDATE bonus_ledger SET consumed=consumed+? WHERE id=? "
                "AND consumed+?<=delta", (take, row["id"], take)
            )
            if changed.rowcount != 1:
                raise RuntimeError("deposit_v2_expired_bonus_reduction_cas")
            left -= take
            expired_ignored += take
    if left:
        future_debt = left
        await db._exec(
            "INSERT INTO economic_bonus_debts(user_id,amount,updated_at) VALUES(?,?,?) "
            "ON CONFLICT(user_id) DO UPDATE SET amount=amount+excluded.amount,"
            "updated_at=excluded.updated_at",
            (user_id, future_debt, db.now_iso()),
        )
    await db._exec(
        "INSERT INTO economic_lot_reward_adjustments(deposit_id,order_id,revision,"
        "principal_reversed,"
        "entitlement_reduced,held_canceled,unspent_revoked,expired_ignored,"
        "future_debt,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        (
            deposit_id, order_id, revision, max(0, int(principal_reversed)),
            reduction, held_canceled, unspent_revoked, expired_ignored,
            future_debt, db.now_iso(),
        ),
    )
    return held_canceled, unspent_revoked, expired_ignored, future_debt


async def _return_settled_principal_locked(
    order_id: int,
    allocations: list,
    old_targets: list[int],
    new_targets: list[int],
) -> int:
    """Return only the newly refunded NET principal inside this transaction."""
    returned_by_op: dict[int, int] = {}
    remaining_by_op: dict[int, int] = {}
    op_rows: dict[int, object] = {}
    for allocation, old_target, new_target in zip(
        allocations, old_targets, new_targets
    ):
        op_id = int(allocation["op_id"])
        op_rows[op_id] = allocation
        remaining_by_op[op_id] = remaining_by_op.get(op_id, 0) + int(new_target)
        delta = int(old_target) - int(new_target)
        if delta < 0:
            raise RuntimeError("deposit_v2_refund_principal_increase")
        if delta == 0:
            continue
        if allocation["op_state"] not in ("money_settled", "effects_applied"):
            if allocation["op_state"] in ("reserved", "confirming"):
                continue
            raise RuntimeError("deposit_v2_refund_principal_state")
        changed = await db._exec(
            "UPDATE deposit_v2_lots SET principal_consumed=principal_consumed-?,"
            "principal_available=principal_available+?,version=version+1,"
            "updated_at=? WHERE deposit_id=? AND principal_consumed>=?",
            (
                delta, delta, db.now_iso(), allocation["deposit_id"], delta,
            ),
        )
        if changed.rowcount != 1:
            raise RuntimeError("deposit_v2_principal_return_cas")
        returned_by_op[op_id] = returned_by_op.get(op_id, 0) + delta

    for op_id, delta in returned_by_op.items():
        op = op_rows[op_id]
        existing_ledger = await (await db.conn().execute(
            "SELECT id,delta FROM deposit_ledger WHERE v2_op_id=? "
            "AND kind='pay_return'",
            (op_id,),
        )).fetchone()
        note = f"возврат оплаты по заказу {config.order_no(order_id)}"
        if existing_ledger:
            changed = await db._exec(
                "UPDATE deposit_ledger SET delta=delta+?,note=? WHERE id=? "
                "AND delta=?",
                (delta, note, existing_ledger["id"], existing_ledger["delta"]),
            )
            if changed.rowcount != 1:
                raise RuntimeError("deposit_v2_principal_return_ledger_cas")
        else:
            await db._exec(
                "INSERT INTO deposit_ledger(user_id,delta,kind,order_id,note,"
                "created_at,v2_op_id) VALUES(?,?, 'pay_return', ?, ?, ?, ?)",
                (
                    op["op_user_id"], delta, order_id, note, db.now_iso(), op_id,
                ),
            )
        if remaining_by_op.get(op_id, 0) == 0:
            pay = await db.payment_get(int(op["op_payment_id"] or 0))
            if pay and pay["status"] == "paid":
                changed = await db._exec(
                    "UPDATE payments SET status='canceled',paid_at=NULL "
                    "WHERE id=? AND method='deposit' AND status='paid'",
                    (pay["id"],),
                )
                if changed.rowcount != 1:
                    raise RuntimeError("deposit_v2_principal_return_payment_cas")
            elif pay and pay["status"] != "canceled":
                raise RuntimeError("deposit_v2_principal_return_payment_state")
            changed = await db._exec(
                "UPDATE deposit_v2_ops SET state='released',error=?,updated_at=? "
                "WHERE id=? AND state IN ('money_settled','effects_applied')",
                ("order_principal_returned", db.now_iso(), op_id),
            )
            if changed.rowcount != 1:
                raise RuntimeError("deposit_v2_principal_return_op_cas")
    return sum(returned_by_op.values())


async def _reverse_order_rewards_locked(
    order_id: int,
    *,
    refunded_total: int | None = None,
    refunded_deposit: int | None = None,
) -> dict:
    """Reconcile one cumulative order refund inside the caller transaction."""
    revoked = debt = held_canceled = expired_ignored = 0
    claim = await (await db.conn().execute(
        "SELECT * FROM deposit_v2_reward_claims WHERE order_id=?", (order_id,)
    )).fetchone()
    order = await db.get_order(order_id)
    allocations = await (await db.conn().execute(
        "SELECT a.*,op.state op_state,op.payment_id op_payment_id,"
        "op.user_id op_user_id FROM deposit_v2_allocations a "
        "JOIN deposit_v2_ops op ON op.id=a.op_id "
        "WHERE op.order_id=? AND op.kind='pay' "
        "ORDER BY a.deposit_id,a.op_id",
        (order_id,),
    )).fetchall()
    deposit_paid_total = sum(int(row["principal_amount"] or 0) for row in allocations)
    paid_rows = await db.payments_for_order(order_id)
    observed_paid = sum(
        int(row["amount"] or 0) for row in paid_rows if row["status"] == "paid"
    )
    paid_total = (
        int(claim["paid_total"] or 0)
        if claim else max(observed_paid, deposit_paid_total)
    )
    user_id = int(
        (claim["user_id"] if claim else (order["user_id"] if order else 0)) or 0
    )
    existing = await (await db.conn().execute(
        "SELECT * FROM economic_order_reward_refunds WHERE order_id=?",
        (order_id,),
    )).fetchone()
    if existing:
        paid_total = int(existing["paid_total"] or 0)
        deposit_paid_total = int(existing["deposit_paid_total"] or 0)
    bonus_spent_total = (
        int(existing["bonus_spent_total"] or 0)
        if existing else int((order["bonus_spent"] if order else 0) or 0)
    )

    if refunded_total is None:
        target_total = paid_total
        target_deposit = deposit_paid_total
        complete = 1
    else:
        target_total = int(refunded_total)
        if target_total < 0 or target_total > paid_total:
            raise ValueError("economic_order_refund_total_invalid")
        if refunded_deposit is None:
            if target_total == paid_total:
                target_deposit = deposit_paid_total
            elif deposit_paid_total == paid_total:
                target_deposit = target_total
            elif deposit_paid_total == 0:
                target_deposit = 0
            else:
                raise ValueError("economic_order_refund_composition_required")
        else:
            target_deposit = int(refunded_deposit)
        complete = int(target_total == paid_total)
    if (
        target_deposit < 0
        or target_deposit > deposit_paid_total
        or target_deposit > target_total
        or target_total - target_deposit > paid_total - deposit_paid_total
    ):
        raise ValueError("economic_order_refund_deposit_invalid")

    old_total = int(existing["refunded_total"] or 0) if existing else 0
    old_deposit = int(existing["refunded_deposit"] or 0) if existing else 0
    if target_total < old_total or target_deposit < old_deposit:
        raise ValueError("economic_order_refund_cannot_decrease")
    if existing and int(existing["complete"] or 0) and not complete:
        raise ValueError("economic_order_refund_already_complete")
    if not complete and target_deposit > old_deposit and any(
        allocation["op_state"] in ("reserved", "confirming")
        for allocation in allocations
    ):
        raise DepositV2Unavailable("deposit_v2_partial_refund_pending_payment")
    if complete:
        await _cancel_unsettled_order_payments_locked(order_id)
    if (
        existing
        and target_total == old_total
        and target_deposit == old_deposit
        and int(existing["complete"] or 0) == complete
    ):
        return {
            "revoked": 0,
            "future_debt": 0,
            "held_canceled": 0,
            "expired_ignored": 0,
        }
    now = db.now_iso()
    if existing:
        revision = int(existing["revision"] or 0) + 1
        changed = await db._exec(
            "UPDATE economic_order_reward_refunds SET refunded_total=?,"
            "refunded_deposit=?,complete=?,revision=?,updated_at=? "
            "WHERE order_id=? AND revision=?",
            (
                target_total, target_deposit, complete, revision, now,
                order_id, int(existing["revision"] or 0),
            ),
        )
        if changed.rowcount != 1:
            raise RuntimeError("economic_order_refund_cas")
    else:
        revision = 1
        await db._exec(
            "INSERT INTO economic_order_reward_refunds(order_id,user_id,"
            "paid_total,deposit_paid_total,bonus_spent_total,refunded_total,"
            "refunded_deposit,refunded_bonus,complete,revision,created_at,"
            "updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                order_id, user_id, paid_total, deposit_paid_total,
                bonus_spent_total, target_total, target_deposit, 0,
                complete, revision, now, now,
            ),
        )

    principal_amounts = [
        int(row["principal_amount"] or 0) for row in allocations
    ]
    old_targets = allocation_net_after_refund(principal_amounts, old_deposit)
    targets = allocation_net_after_refund(principal_amounts, target_deposit)

    if claim:
        cashback_rate_bp = int(claim["cashback_rate_bp"] or 0)
        principal_reversed_by_lot: dict[int, int] = {}
        for allocation, old_target_net, target_net in zip(
            allocations, old_targets, targets
        ):
            if allocation["reward_state"] not in ("counted", "reversed"):
                raise RuntimeError("deposit_v2_refund_allocation_not_counted")
            current_net = int(allocation["principal_net"] or 0)
            if current_net != int(old_target_net):
                raise RuntimeError("deposit_v2_refund_allocation_drift")
            current_cashback = int(allocation["cashback_candidate"] or 0)
            target_cashback = target_net * cashback_rate_bp // 10_000
            if target_net > current_net or target_cashback > current_cashback:
                raise RuntimeError("deposit_v2_refund_allocation_increase")
            target_state = "reversed" if complete else "counted"
            if (
                target_net != current_net
                or target_cashback != current_cashback
                or allocation["reward_state"] != target_state
            ):
                changed = await db._exec(
                    "UPDATE deposit_v2_allocations SET principal_net=?,"
                    "cashback_candidate=?,reward_state=? WHERE op_id=? "
                    "AND deposit_id=? AND principal_net=? "
                    "AND cashback_candidate=? AND reward_state=?",
                    (
                        target_net, target_cashback, target_state,
                        allocation["op_id"], allocation["deposit_id"],
                        current_net, current_cashback, allocation["reward_state"],
                    ),
                )
                if changed.rowcount != 1:
                    raise RuntimeError("deposit_v2_reward_refund_cas")
            principal_reversed_by_lot[int(allocation["deposit_id"])] = (
                principal_reversed_by_lot.get(int(allocation["deposit_id"]), 0)
                + current_net - target_net
            )

        for deposit_id in sorted(principal_reversed_by_lot):
            lot = await (await db.conn().execute(
                "SELECT * FROM deposit_v2_lots WHERE deposit_id=?", (deposit_id,)
            )).fetchone()
            net = await (await db.conn().execute(
                "SELECT COALESCE(SUM(principal_net),0) principal_net,"
                "COALESCE(SUM(cashback_candidate),0) cashback_candidate "
                "FROM deposit_v2_allocations WHERE deposit_id=? "
                "AND reward_state='counted'",
                (deposit_id,),
            )).fetchone()
            new_target = max(
                deposit_entitlement(
                    int(net["principal_net"] or 0), int(lot["bonus_rate_bp"])
                ),
                int(net["cashback_candidate"] or 0),
            )
            old_target = int(lot["bonus_entitlement_awarded"] or 0)
            if new_target > old_target:
                raise RuntimeError("deposit_v2_refund_entitlement_increase")
            reduction = old_target - new_target
            h, r, e, d = await _reduce_lot_entitlement(
                user_id,
                deposit_id,
                order_id,
                revision,
                principal_reversed_by_lot[deposit_id],
                reduction,
            )
            held_canceled += h
            revoked += r
            expired_ignored += e
            debt += d
            changed = await db._exec(
                "UPDATE deposit_v2_lots SET bonus_entitlement_awarded=?,"
                "version=version+1,updated_at=? WHERE deposit_id=? "
                "AND bonus_entitlement_awarded=?",
                (new_target, now, deposit_id, old_target),
            )
            if changed.rowcount != 1:
                raise RuntimeError("deposit_v2_refund_entitlement_cas")

        nondeposit_total = paid_total - deposit_paid_total
        refunded_nondeposit = target_total - target_deposit
        remaining_nondeposit = nondeposit_total - refunded_nondeposit
        if claim["cashback_ledger_id"]:
            ledger = await (await db.conn().execute(
                "SELECT delta FROM bonus_ledger WHERE id=?",
                (claim["cashback_ledger_id"],),
            )).fetchone()
            if ledger:
                remaining_cashback = remaining_nondeposit * cashback_rate_bp // 10_000
                target_reduced = int(ledger["delta"] or 0) - remaining_cashback
                a, b = await _reduce_ledger_to(
                    user_id, int(claim["cashback_ledger_id"]), order_id,
                    target_reduced,
                )
                revoked += a
                debt += b
        state_sql = ",state='reversed',release_at=NULL" if complete else ""
        await db._exec(
            "UPDATE deposit_v2_reward_claims SET refunded_total=?,"
            "refunded_deposit=?,normal_candidate=?,updated_at=?" + state_sql
            + " WHERE id=?",
            (
                target_total,
                target_deposit,
                (paid_total - target_total) * cashback_rate_bp // 10_000,
                now,
                claim["id"],
            ),
        )
    elif complete:
        await db._exec(
            "UPDATE deposit_v2_allocations SET reward_state='reversed' "
            "WHERE op_id IN (SELECT id FROM deposit_v2_ops WHERE order_id=? "
            "AND kind='pay') AND reward_state='pending'",
            (order_id,),
        )

    await _return_settled_principal_locked(
        order_id, allocations, old_targets, targets
    )

    if complete:
        ledgers = await (await db.conn().execute(
            "SELECT id,user_id,delta FROM bonus_ledger WHERE order_id=? "
            "AND delta>0 AND kind IN ('cashback','ref_reward')",
            (order_id,),
        )).fetchall()
        for ledger in ledgers:
            a, b = await _reduce_ledger_to(
                int(ledger["user_id"]), int(ledger["id"]), order_id,
                int(ledger["delta"] or 0),
            )
            revoked += a
            debt += b
        await db._exec(
            "UPDATE referral_v2_obligations SET state='reversed',updated_at=? "
            "WHERE source_order_id=? AND state='granted'", (now, order_id)
        )
    return {
        "revoked": revoked,
        "future_debt": debt,
        "held_canceled": held_canceled,
        "expired_ignored": expired_ignored,
    }


async def reverse_order_rewards(
    order_id: int,
    *,
    refunded_total: int | None = None,
    refunded_deposit: int | None = None,
) -> dict:
    """Durably reconcile a cumulative partial or complete order refund."""
    async with db.transaction():
        return await _reverse_order_rewards_locked(
            order_id,
            refunded_total=refunded_total,
            refunded_deposit=refunded_deposit,
        )


async def restore_order_after_refund(
    order_id: int,
    note: str = "возврат по заказу",
    *,
    refunded_total: int | None = None,
    refunded_deposit: int | None = None,
    refunded_bonus: int | None = None,
    reverse_rewards: bool = True,
) -> int:
    """Atomically reconcile money, principal, rewards and spent points."""
    async with db.transaction():
        if reverse_rewards:
            await _reverse_order_rewards_locked(
                order_id,
                refunded_total=refunded_total,
                refunded_deposit=refunded_deposit,
            )
        fresh = await (await db.conn().execute(
            "SELECT id,user_id,bonus_spent FROM orders WHERE id=?",
            (order_id,),
        )).fetchone()
        if not fresh or not fresh["user_id"]:
            return 0
        if not reverse_rewards:
            if refunded_bonus is not None:
                raise ValueError("economic_bonus_refund_requires_reward_audit")
            spent = int(fresh["bonus_spent"] or 0)
            if spent <= 0:
                return 0
            changed = await db._exec(
                "UPDATE orders SET bonus_spent=0,updated_at=? WHERE id=? "
                "AND user_id=? AND bonus_spent=?",
                (db.now_iso(), order_id, fresh["user_id"], spent),
            )
            if changed.rowcount != 1:
                raise RuntimeError("economic_bonus_restore_cas")
            await db.bonus_add(
                int(fresh["user_id"]), spent, "restore",
                f"{note} {config.order_no(order_id)}", order_id, ttl_days=30,
            )
            return spent

        audit = await (await db.conn().execute(
            "SELECT * FROM economic_order_reward_refunds WHERE order_id=?",
            (order_id,),
        )).fetchone()
        if not audit:
            raise RuntimeError("economic_bonus_refund_audit_missing")
        bonus_total = int(audit["bonus_spent_total"] or 0)
        old_bonus = int(audit["refunded_bonus"] or 0)
        if refunded_bonus is None:
            target_bonus = bonus_total if int(audit["complete"] or 0) else old_bonus
        else:
            target_bonus = int(refunded_bonus)
        if target_bonus < old_bonus or target_bonus > bonus_total:
            raise ValueError("economic_bonus_refund_total_invalid")
        if int(audit["complete"] or 0) and target_bonus != bonus_total:
            raise ValueError("economic_bonus_full_refund_required")
        spent = target_bonus - old_bonus
        if spent <= 0:
            return 0
        expected_remaining = bonus_total - old_bonus
        if int(fresh["bonus_spent"] or 0) != expected_remaining:
            raise RuntimeError("economic_bonus_refund_order_drift")
        changed = await db._exec(
            "UPDATE orders SET bonus_spent=bonus_spent-?,updated_at=? WHERE id=? "
            "AND user_id=? AND bonus_spent=?",
            (
                spent, db.now_iso(), order_id, fresh["user_id"],
                expected_remaining,
            ),
        )
        if changed.rowcount != 1:
            raise RuntimeError("economic_bonus_restore_cas")
        changed = await db._exec(
            "UPDATE economic_order_reward_refunds SET refunded_bonus=?,"
            "updated_at=? WHERE order_id=? AND refunded_bonus=?",
            (target_bonus, db.now_iso(), order_id, old_bonus),
        )
        if changed.rowcount != 1:
            raise RuntimeError("economic_bonus_refund_audit_cas")
        await db.bonus_add(
            int(fresh["user_id"]), spent, "restore",
            f"{note} {config.order_no(order_id)}", order_id, ttl_days=30,
        )
        return spent


async def order_refund_complete(order_id: int) -> bool:
    """Cheap UX preflight; the persistent order trigger remains authoritative."""
    row = await (await db.conn().execute(
        "SELECT complete FROM economic_order_reward_refunds WHERE order_id=?",
        (order_id,),
    )).fetchone()
    return bool(row and int(row["complete"] or 0))


async def on_payment(bot: Bot, order_id: int) -> dict:
    """Award one lot-level cumulative best-of entitlement after full payment."""
    from . import payments as pay_svc
    from . import subs

    order = await db.get_order(order_id)
    if not order or not order["user_id"]:
        return {"ok": False, "reason": "no_user"}
    if subs.is_sub_order(order):
        return {"ok": False, "reason": "subscription_excluded"}
    refund_preflight = await (await db.conn().execute(
        "SELECT complete FROM economic_order_reward_refunds WHERE order_id=?",
        (order_id,),
    )).fetchone()
    if refund_preflight and int(refund_preflight["complete"] or 0):
        return {"ok": False, "reason": "reward_reversed"}
    accepted_now = (
        order["status"] == "done"
        or int(order["parts_done"] or 0) >= max(1, int(order["stages_total"] or 1))
    )
    pays = await db.payments_for_order(order_id)
    paid = [p for p in pays if p["status"] == "paid"]
    paid_sum = sum(int(p["amount"] or 0) for p in paid)
    due = pay_svc.money_due(order)
    if due["due_total"] <= 0 or paid_sum < due["due_total"]:
        return {"ok": False, "reason": "not_fully_paid"}
    deposit_pays = [p for p in paid if p["method"] == "deposit"]
    if deposit_pays:
        marks = ",".join("?" for _ in deposit_pays)
        cur = await db.conn().execute(
            f"SELECT payment_id,state FROM deposit_v2_ops WHERE payment_id IN ({marks})",
            tuple(int(p["id"]) for p in deposit_pays),
        )
        ops = {int(row["payment_id"]): row["state"] for row in await cur.fetchall()}
        if any(
            ops.get(int(payment["id"])) not in ("money_settled", "effects_applied")
            for payment in deposit_pays
        ):
            return {"ok": False, "reason": "deposit_settlement_pending"}

    user_id = int(order["user_id"])
    base = min(paid_sum, int(due["due_total"]))
    cb_pct = int(await subs.cashback_pct(user_id))
    cashback_rate_bp = cb_pct * 100
    normal = 0
    expected_deposit_paid = sum(int(payment["amount"] or 0) for payment in deposit_pays)
    immediate = uplift = awarded = deposit_delta = 0
    referral_granted = False
    inviter = 0

    async with db.transaction():
        fresh_order = await db.get_order(order_id)
        if (
            not fresh_order
            or not fresh_order["user_id"]
            or int(fresh_order["deleted"] or 0)
        ):
            return {"ok": False, "reason": "order_not_rewardable"}
        refund = await (await db.conn().execute(
            "SELECT * FROM economic_order_reward_refunds WHERE order_id=?",
            (order_id,),
        )).fetchone()
        if refund and int(refund["complete"] or 0):
            return {"ok": False, "reason": "reward_reversed"}
        existing = await (await db.conn().execute(
            "SELECT * FROM deposit_v2_reward_claims WHERE order_id=?", (order_id,)
        )).fetchone()
        if existing:
            if existing["state"] in ("reversed", "void"):
                return {"ok": False, "reason": "reward_reversed"}
            return {
                "ok": True,
                "normal": int(existing["normal_candidate"] or 0),
                "deposit_variant": int(existing["deposit_candidate"] or 0),
                "target": int(existing["awarded"] or 0),
                "uplift": int(existing["uplift_amount"] or 0),
                "duplicate": True,
            }

        allocation_rows = await (await db.conn().execute(
            "SELECT a.*,l.bonus_rate_bp,l.bonus_entitlement_awarded "
            "FROM deposit_v2_allocations a "
            "JOIN deposit_v2_ops op ON op.id=a.op_id "
            "JOIN deposit_v2_lots l ON l.deposit_id=a.deposit_id "
            "WHERE op.order_id=? AND op.kind='pay' "
            "AND op.state IN ('money_settled','effects_applied') "
            "ORDER BY a.deposit_id,a.op_id",
            (order_id,),
        )).fetchall()
        actual_deposit_paid = sum(int(row["principal_amount"]) for row in allocation_rows)
        if actual_deposit_paid != expected_deposit_paid:
            raise RuntimeError("deposit_v2_reward_principal_mismatch")
        refunded_total = int(refund["refunded_total"] or 0) if refund else 0
        refunded_deposit = int(refund["refunded_deposit"] or 0) if refund else 0
        if refund and (
            int(refund["paid_total"] or 0) != base
            or int(refund["deposit_paid_total"] or 0) != expected_deposit_paid
        ):
            raise RuntimeError("economic_order_refund_payment_drift")
        if refunded_total > base or refunded_deposit > expected_deposit_paid:
            raise RuntimeError("economic_order_refund_exceeds_payment")
        net_base = base - refunded_total
        target_nets = allocation_net_after_refund(
            [int(row["principal_amount"] or 0) for row in allocation_rows],
            refunded_deposit,
        )
        normal = net_base * cb_pct // 100

        grouped: dict[int, list[tuple[object, int, int]]] = {}
        for allocation, target_net in zip(allocation_rows, target_nets):
            candidate = target_net * cb_pct // 100
            grouped.setdefault(int(allocation["deposit_id"]), []).append(
                (allocation, target_net, candidate)
            )
        current_deposit_cashback = sum(
            candidate for rows_for_lot in grouped.values()
            for _allocation, _target_net, candidate in rows_for_lot
        )
        nondeposit_normal = max(0, normal - current_deposit_cashback)
        lot_awards: list[dict[str, int]] = []

        for deposit_id, current_rows in grouped.items():
            lot = await (await db.conn().execute(
                "SELECT * FROM deposit_v2_lots WHERE deposit_id=?", (deposit_id,)
            )).fetchone()
            prior = await (await db.conn().execute(
                "SELECT COALESCE(SUM(principal_net),0) principal_net,"
                "COALESCE(SUM(cashback_candidate),0) cashback_candidate "
                "FROM deposit_v2_allocations WHERE deposit_id=? "
                "AND reward_state='counted'",
                (deposit_id,),
            )).fetchone()
            old_principal = int(prior["principal_net"] or 0)
            old_cashback = int(prior["cashback_candidate"] or 0)
            rate_bp = int(lot["bonus_rate_bp"])
            old_target = max(deposit_entitlement(old_principal, rate_bp), old_cashback)
            if int(lot["bonus_entitlement_awarded"] or 0) != old_target:
                raise RuntimeError("deposit_v2_lot_entitlement_drift")
            added_principal = sum(
                target_net for _allocation, target_net, _candidate in current_rows
            )
            added_cashback = sum(
                candidate for _allocation, _target_net, candidate in current_rows
            )
            step = lot_reward_step(
                old_principal=old_principal,
                old_cashback=old_cashback,
                added_principal=added_principal,
                added_cashback=added_cashback,
                rate_bp=rate_bp,
            )
            new_target = step["new_target"]
            new_gross = step["new_gross"]
            entitlement_delta = step["delta"]
            if entitlement_delta < 0:
                raise RuntimeError("deposit_v2_negative_payment_entitlement")
            base_delta = step["base"]
            uplift_delta = step["uplift"]
            anchor = current_rows[0][0]
            for index, (allocation, target_net, candidate) in enumerate(current_rows):
                changed = await db._exec(
                    "UPDATE deposit_v2_allocations SET principal_net=?,"
                    "cashback_candidate=?,entitlement_delta=?,uplift_delta=?,"
                    "reward_state='counted' WHERE op_id=? AND deposit_id=? "
                    "AND reward_state='pending'",
                    (
                        target_net,
                        candidate,
                        entitlement_delta if index == 0 else 0,
                        uplift_delta if index == 0 else 0,
                        allocation["op_id"], deposit_id,
                    ),
                )
                if changed.rowcount != 1:
                    raise RuntimeError("deposit_v2_allocation_reward_cas")
            changed = await db._exec(
                "UPDATE deposit_v2_lots SET bonus_entitlement_awarded=?,"
                "version=version+1,updated_at=? WHERE deposit_id=? "
                "AND bonus_entitlement_awarded=?",
                (new_target, db.now_iso(), deposit_id, old_target),
            )
            if changed.rowcount != 1:
                raise RuntimeError("deposit_v2_lot_entitlement_cas")
            lot_awards.append({
                "deposit_id": deposit_id,
                "anchor_op_id": int(anchor["op_id"]),
                "gross": new_gross,
                "entitlement": entitlement_delta,
                "base": base_delta,
                "uplift": uplift_delta,
            })

        deposit_delta = sum(item["entitlement"] for item in lot_awards)
        uplift = sum(item["uplift"] for item in lot_awards)
        immediate = nondeposit_normal + sum(item["base"] for item in lot_awards)
        awarded = immediate + uplift
        claim_cur = await db._exec(
            "INSERT INTO deposit_v2_reward_claims(order_id,user_id,"
            "paid_total,cashback_rate_bp,normal_candidate,deposit_candidate,"
            "awarded,uplift_amount,refunded_total,refunded_deposit,state,"
            "release_at,created_at,updated_at) "
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                order_id, user_id, base, cashback_rate_bp, normal,
                nondeposit_normal + deposit_delta, awarded, uplift,
                refunded_total, refunded_deposit,
                "held" if uplift else "no_uplift",
                (_after_days(UPLIFT_HOLD_DAYS) if uplift and accepted_now else None),
                db.now_iso(), db.now_iso(),
            ),
        )
        claim_id = int(claim_cur.lastrowid)
        cashback_ledger_id = None
        if nondeposit_normal:
            cashback_ledger_id = await db.bonus_add(
                user_id, nondeposit_normal, "cashback",
                f"заказ {config.order_no(order_id)} · недепозитная часть",
                order_id, ttl_days=config.BONUS_CASHBACK_TTL,
            )
            await db._exec(
                "UPDATE bonus_ledger SET v2_claim_id=? WHERE id=?",
                (claim_id, cashback_ledger_id),
            )
        for item in lot_awards:
            if not item["base"]:
                continue
            ledger = await db._exec(
                "INSERT INTO bonus_ledger(user_id,delta,kind,note,order_id,"
                "expires_at,created_at,v2_claim_id,deposit_id) "
                "VALUES(?,?, 'deposit_v2_base',?,?,?,?,?,?)",
                (
                    user_id, item["base"],
                    f"лучший расчёт по депозиту №{item['deposit_id']}",
                    order_id, _after_days(config.BONUS_CASHBACK_TTL),
                    db.now_iso(), claim_id, item["deposit_id"],
                ),
            )
            changed = await db._exec(
                "UPDATE deposit_v2_allocations SET base_ledger_id=? "
                "WHERE op_id=? AND deposit_id=? AND reward_state='counted' "
                "AND entitlement_delta-uplift_delta=? AND base_ledger_id IS NULL",
                (
                    ledger.lastrowid, item["anchor_op_id"], item["deposit_id"],
                    item["base"],
                ),
            )
            if changed.rowcount != 1:
                raise RuntimeError("deposit_v2_base_ledger_cas")
        if cashback_ledger_id:
            await db._exec(
                "UPDATE deposit_v2_reward_claims SET cashback_ledger_id=? WHERE id=?",
                (cashback_ledger_id, claim_id),
            )

        user = await db.get_user(user_id)
        inviter = int(user["referrer_id"] or 0) if user else 0
        if inviter and inviter != user_id:
            existing_ref = await (await db.conn().execute(
                "SELECT 1 FROM referral_v2_obligations WHERE invitee_user_id=? "
                "AND program_version=?", (user_id, REFERRAL_VERSION)
            )).fetchone()
            if not existing_ref:
                if await db.setting_get(REFERRAL_SETTING, "") == REFERRAL_ON:
                    ledger_id = await db.bonus_add(
                        inviter, REFERRAL_REWARD, "ref_reward",
                        f"первый оплаченный заказ приглашённого · "
                        f"{config.order_no(order_id)}",
                        order_id, ttl_days=REFERRAL_TTL,
                    )
                    await db._exec(
                        "INSERT INTO referral_v2_obligations(invitee_user_id,"
                        "inviter_user_id,source_order_id,amount,state,program_version,"
                        "bonus_ledger_id,created_at,updated_at) "
                        "VALUES(?,?,?,?, 'granted',?,?,?,?)",
                        (user_id, inviter, order_id, REFERRAL_REWARD,
                         REFERRAL_VERSION, ledger_id, db.now_iso(), db.now_iso()),
                    )
                    referral_granted = True
                else:
                    await db._exec(
                        "INSERT INTO referral_v2_obligations(invitee_user_id,"
                        "inviter_user_id,source_order_id,amount,state,program_version,"
                        "reason,created_at,updated_at) "
                        "VALUES(?,?,?,?, 'needs_review',?,?,?,?)",
                        (user_id, inviter, order_id, REFERRAL_REWARD,
                         REFERRAL_VERSION, "setting_not_ready",
                         db.now_iso(), db.now_iso()),
                    )

    if immediate or uplift:
        await notify.notify_client(
            bot, user_id,
            f"💎 Заказ {config.order_no(order_id)} оплачен полностью — по более "
            f"выгодному накопительному расчёту сейчас начислено "
            f"<b>{immediate}</b> бонусов."
            + (
                f" Ещё <b>{uplift}</b> бонусов станут доступны после приёмки "
                f"и {UPLIFT_HOLD_DAYS}-дневной проверки."
                if uplift else ""
            ),
        )
    if referral_granted:
        await notify.notify_client(
            bot, inviter,
            f"🤝 Новый клиент полностью оплатил первый заказ — вам начислено "
            f"<b>{REFERRAL_REWARD}</b> бонусов на {REFERRAL_TTL} дней.",
        )
    return {
        "ok": True,
        "normal": normal,
        "deposit_variant": deposit_delta,
        "target": awarded,
        "uplift": uplift,
    }


async def resolve_referral_review(
    bot: Bot, obligation_id: int, *, grant: bool, actor: str = "мастер"
) -> tuple[bool, str]:
    """Resolve one durable legacy/referral hold with a fully-paid recheck."""
    from . import payments as pay_svc
    from . import subs

    notify_inviter = 0
    async with db.transaction():
        obligation = await (await db.conn().execute(
            "SELECT * FROM referral_v2_obligations WHERE id=?",
            (obligation_id,),
        )).fetchone()
        if not obligation:
            return False, f"реферальная сверка №{obligation_id} не найдена"
        if obligation["state"] in ("granted", "rejected"):
            return True, f"сверка №{obligation_id} уже завершена: {obligation['state']}"
        if obligation["state"] != "needs_review":
            return False, f"сверка №{obligation_id} имеет статус {obligation['state']}"
        if not grant:
            await db._exec(
                "UPDATE referral_v2_obligations SET state='rejected',reason=?,"
                "updated_at=? WHERE id=? AND state='needs_review'",
                (f"manual reject · {actor}"[:300], db.now_iso(), obligation_id),
            )
            return True, f"Реферальная сверка №{obligation_id} отклонена."
        order_id = int(obligation["source_order_id"] or 0)
        order = await db.get_order(order_id)
        if not order or int(order["user_id"] or 0) != int(obligation["invitee_user_id"]):
            return False, "заказ сверки не принадлежит приглашённому"
        if int(order["deleted"] or 0) or subs.is_sub_order(order):
            return False, "удалённый заказ или подписка не дают реферальный бонус"
        if int(obligation["inviter_user_id"]) == int(obligation["invitee_user_id"]):
            return False, "самоприглашение не допускается"
        refund = await (await db.conn().execute(
            "SELECT complete FROM economic_order_reward_refunds WHERE order_id=?",
            (order_id,),
        )).fetchone()
        if refund and int(refund["complete"] or 0):
            return False, "возвращённый заказ не даёт реферальный бонус"
        due = pay_svc.money_due(order)
        paid = sum(
            int(row["amount"] or 0)
            for row in await db.payments_for_order(order_id)
            if row["status"] == "paid"
        )
        if int(due["due_total"] or 0) <= 0 or paid < int(due["due_total"]):
            return False, "первый заказ не подтверждён как полностью оплаченный"
        ledger_id = await db.bonus_add(
            int(obligation["inviter_user_id"]), REFERRAL_REWARD, "ref_reward",
            f"ручная сверка рекомендации · {config.order_no(order_id)}",
            order_id, ttl_days=REFERRAL_TTL,
        )
        changed = await db._exec(
            "UPDATE referral_v2_obligations SET state='granted',bonus_ledger_id=?,"
            "reason=?,updated_at=? WHERE id=? AND state='needs_review'",
            (ledger_id, f"manual grant · {actor}"[:300], db.now_iso(), obligation_id),
        )
        if changed.rowcount != 1:
            raise RuntimeError("referral_v2_review_cas")
        notify_inviter = int(obligation["inviter_user_id"])
    if notify_inviter:
        await notify.notify_client(
            bot, notify_inviter,
            f"🤝 Рекомендация проверена — начислено <b>{REFERRAL_REWARD}</b> "
            f"бонусов на {REFERRAL_TTL} дней.",
        )
    return True, f"Реферальная сверка №{obligation_id}: начислено 200 бонусов."
