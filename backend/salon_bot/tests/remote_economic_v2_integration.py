#!/usr/bin/env python3
"""Run Deposit V2 against an isolated copy of the production app and SQLite.

The harness refuses non-/tmp targets.  It performs no network delivery and is
intended for the release evidence host, not for the live service directory.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path


def _safe_tmp(path: Path, label: str) -> Path:
    resolved = path.resolve()
    if not str(resolved).startswith("/tmp/"):
        raise RuntimeError(f"{label} must be an isolated /tmp path")
    return resolved


async def run(app_root: Path, db_path: Path) -> dict[str, object]:
    sys.path.insert(0, str(app_root.parent))
    os.environ["DB_PATH"] = str(db_path)

    from app import db  # type: ignore[import-not-found]
    from app.services import (  # type: ignore[import-not-found]
        bonus,
        economic_v2,
        handoff,
        mailer,
        notify,
        payment_delivery,
        payments,
        subs,
    )

    async def no_delivery(*_args, **_kwargs):
        return None

    async def no_handoff(*_args, **_kwargs):
        return {"ok": False}

    notify.notify_client = no_delivery
    notify.notify_admins = no_delivery
    notify.send_admin_card = no_delivery
    payments._grp_send = no_delivery
    payment_delivery.schedule_for_payment = no_delivery
    handoff.release_if_paid = no_handoff
    mailer.send = no_delivery

    class DummyBot:
        pass

    bot = DummyBot()
    base = 8_800_000_000
    now = "2026-09-02T12:00:00"

    async def insert_user(user_id: int, referrer_id: int | None = None) -> None:
        async with db.transaction():
            await db._exec(
                "INSERT INTO users(id,source,created_at,last_seen_at,referrer_id) "
                "VALUES(?, 'economic-v2-qa', ?, ?, ?)",
                (user_id, now, now, referrer_id),
            )

    async def insert_order(
        order_id: int,
        user_id: int,
        amount: int,
        *,
        work_type: str = "coursework",
    ) -> None:
        async with db.transaction():
            await db._exec(
                "INSERT INTO orders(id,user_id,status,work_type,price,prepay,"
                "stages_total,parts_done,deleted,source,created_at,updated_at) "
                "VALUES(?,?,'new',?,?,?,1,0,0,'economic-v2-qa',?,?)",
                (order_id, user_id, work_type, amount, amount, now, now),
            )

    async def one(sql: str, args: tuple = ()):
        return await (await db.conn().execute(sql, args)).fetchone()

    await db.init(str(db_path))
    old_max = economic_v2.MAX_ACTIVE
    try:
        legacy = await one(
            "SELECT d.id,d.user_id,l.contract_version,l.state,op.state op_state "
            "FROM deposits d JOIN deposit_v2_lots l ON l.deposit_id=d.id "
            "JOIN deposit_v2_ops op ON op.deposit_id=d.id AND op.kind='activate' "
            "WHERE d.via='economic-v2-qa-legacy'"
        )
        if legacy:
            assert legacy["contract_version"] == economic_v2.LEGACY_VERSION
            assert legacy["state"] == "paid_hold" and legacy["op_state"] == "paid_hold"
            legacy_allocated = await economic_v2.resolve_paid_hold(
                bot, int(legacy["id"]), actor="qa-legacy-backfill"
            )
            assert legacy_allocated[0] and legacy_allocated[2] == 60_000
            assert await db.bonus_balance(int(legacy["user_id"])) == 9_000
            legacy_refund = await economic_v2.prepare_refund(
                int(legacy["id"]), actor="qa-legacy-backfill"
            )
            assert legacy_refund[0] and legacy_refund[2] == 60_000
            legacy_refund_done = await economic_v2.confirm_refund(
                legacy_refund[3], actor="qa-legacy-backfill"
            )
            assert legacy_refund_done[0] and legacy_refund_done[2] == 60_000
            assert await db.bonus_balance(int(legacy["user_id"])) == 0
            legacy_ledger = await one(
                "SELECT COALESCE(SUM(delta),0) FROM deposit_ledger WHERE user_id=?",
                (int(legacy["user_id"]),),
            )
            assert legacy_ledger[0] == 0

        inviter = base + 1
        client = base + 2
        await insert_user(inviter)
        await insert_user(client, inviter)

        first_order = base + 101
        await insert_order(first_order, client, 40_000)
        dep = await economic_v2.create_pending(user_id=client, amount=60_000)
        activated = await economic_v2.activate_paid(bot, int(dep["id"]), method="qa")
        assert activated and activated["state"] == "active"
        ok, _report, balance = await economic_v2.pay_order(bot, first_order, actor="qa")
        assert ok and balance == 20_000

        first_op = await one(
            "SELECT state,payment_id FROM deposit_v2_ops "
            "WHERE kind='pay' AND order_id=?", (first_order,)
        )
        assert first_op and first_op["state"] == "effects_applied"
        first_receipt = await one(
            "SELECT effects_status FROM payment_receipts WHERE payment_id=?",
            (first_op["payment_id"],),
        )
        assert first_receipt and first_receipt["effects_status"] == "applied"
        first_claim = await one(
            "SELECT normal_candidate,deposit_candidate,uplift_amount,state,release_at "
            "FROM deposit_v2_reward_claims WHERE order_id=?", (first_order,)
        )
        assert tuple(first_claim) == (2_000, 4_000, 2_000, "held", None)
        referral = await one(
            "SELECT COUNT(*) n,COALESCE(SUM(amount),0) amount "
            "FROM referral_v2_obligations WHERE invitee_user_id=? AND state='granted'",
            (client,),
        )
        assert tuple(referral) == (1, 200)

        crash_order = base + 102
        await insert_order(crash_order, client, 10_000)
        original_set_status = db.set_status

        async def fail_after_money(*_args, **_kwargs):
            raise RuntimeError("qa_crash_after_money_settlement")

        db.set_status = fail_after_money
        try:
            try:
                await economic_v2.pay_order(bot, crash_order, actor="qa-crash")
            except RuntimeError as exc:
                assert str(exc) == "qa_crash_after_money_settlement"
            else:
                raise AssertionError("crash failpoint did not fire")
        finally:
            db.set_status = original_set_status

        crash_op = await one(
            "SELECT id,state,payment_id FROM deposit_v2_ops "
            "WHERE kind='pay' AND order_id=?", (crash_order,)
        )
        assert crash_op and crash_op["state"] == "money_settled"
        crash_pay = await db.payment_get(int(crash_op["payment_id"]))
        assert crash_pay and crash_pay["status"] == "paid"
        async with db.transaction():
            await db._exec(
                "UPDATE payment_receipts SET effects_status='applying',"
                "effects_updated_at='2000-01-01T00:00:00' WHERE payment_id=?",
                (crash_op["payment_id"],),
            )
        recovered = await economic_v2.recover_payments(bot)
        assert recovered["settled"] == 1 and recovered["pending"] == 0
        crash_final = await one(
            "SELECT state FROM deposit_v2_ops WHERE id=?", (crash_op["id"],)
        )
        assert crash_final and crash_final["state"] == "effects_applied"
        crash_counts = await one(
            "SELECT (SELECT COUNT(*) FROM deposit_ledger WHERE v2_op_id=? "
            "AND kind='pay') pay_rows,(SELECT COUNT(*) FROM bonus_ledger "
            "WHERE order_id=? AND kind='deposit_v2_base') cashback_rows,"
            "(SELECT COUNT(*) FROM deposit_v2_reward_claims WHERE order_id=?) claims",
            (crash_op["id"], crash_order, crash_order),
        )
        assert tuple(crash_counts) == (1, 1, 1)
        referral_after_retry = await one(
            "SELECT COUNT(*) FROM referral_v2_obligations "
            "WHERE invitee_user_id=? AND state='granted'", (client,)
        )
        assert referral_after_retry[0] == 1

        recovery_user = base + 10
        await insert_user(recovery_user)
        recovery_dep = await economic_v2.create_pending(
            user_id=recovery_user, amount=20_000
        )
        recovery_active = await economic_v2.activate_paid(
            bot, int(recovery_dep["id"]), method="qa-recovery"
        )
        assert recovery_active and recovery_active["state"] == "active"
        recovery_order = base + 110
        await insert_order(recovery_order, recovery_user, 5_000)
        original_confirm = payments.confirm

        async def fail_before_confirm(*_args, **_kwargs):
            raise RuntimeError("qa_crash_before_confirm")

        payments.confirm = fail_before_confirm
        try:
            try:
                await economic_v2.pay_order(bot, recovery_order, actor="qa-reserve-crash")
            except RuntimeError as exc:
                assert str(exc) == "qa_crash_before_confirm"
            else:
                raise AssertionError("reserve crash failpoint did not fire")
        finally:
            payments.confirm = original_confirm
        reserved = await one(
            "SELECT state,payment_id FROM deposit_v2_ops "
            "WHERE kind='pay' AND order_id=?", (recovery_order,)
        )
        assert reserved and reserved["state"] == "confirming"
        reserved_payment = await db.payment_get(int(reserved["payment_id"]))
        assert reserved_payment and reserved_payment["status"] == "pending"
        reserved_recovered = await economic_v2.recover_payments(bot)
        assert reserved_recovered["settled"] == 1
        assert (await one(
            "SELECT state FROM deposit_v2_ops WHERE kind='pay' AND order_id=?",
            (recovery_order,),
        ))["state"] == "effects_applied"

        split_user = base + 8
        await insert_user(split_user)
        split_dep = await economic_v2.create_pending(user_id=split_user, amount=60_000)
        assert (await economic_v2.activate_paid(
            bot, int(split_dep["id"]), method="qa-split"
        ))["state"] == "active"
        split_first = base + 108
        split_second = base + 109
        await insert_order(split_first, split_user, 20_000)
        await insert_order(split_second, split_user, 10_000)
        original_cashback_pct = subs.cashback_pct

        async def pro_cashback(_user_id):
            return 10

        subs.cashback_pct = pro_cashback
        try:
            assert (await economic_v2.pay_order(
                bot, split_first, actor="qa-split-20"
            ))[0]
            assert (await economic_v2.pay_order(
                bot, split_second, actor="qa-split-10"
            ))[0]
        finally:
            subs.cashback_pct = original_cashback_pct
        split_totals = await one(
            "SELECT l.bonus_entitlement_awarded,"
            "(SELECT COALESCE(SUM(c.awarded),0) FROM deposit_v2_reward_claims c "
            "WHERE c.order_id IN (?,?)) claim_total,"
            "(SELECT COALESCE(SUM(b.delta-b.consumed),0) FROM bonus_ledger b "
            "WHERE b.user_id=? AND b.kind='deposit_v2_base') available "
            "FROM deposit_v2_lots l WHERE l.deposit_id=?",
            (split_first, split_second, split_user, int(split_dep["id"])),
        )
        assert tuple(split_totals) == (3_000, 3_000, 3_000)

        refund_user = base + 9
        await insert_user(refund_user)
        refund_dep = await economic_v2.create_pending(user_id=refund_user, amount=60_000)
        assert (await economic_v2.activate_paid(
            bot, int(refund_dep["id"]), method="qa-refund-retier"
        ))["state"] == "active"
        refund_large_order = base + 111
        refund_small_order = base + 112
        await insert_order(refund_large_order, refund_user, 59_000)
        await insert_order(refund_small_order, refund_user, 1_000)
        assert (await economic_v2.pay_order(
            bot, refund_large_order, actor="qa-refund-59"
        ))[0]
        assert (await economic_v2.pay_order(
            bot, refund_small_order, actor="qa-refund-1"
        ))[0]
        assert (await one(
            "SELECT bonus_entitlement_awarded FROM deposit_v2_lots WHERE deposit_id=?",
            (int(refund_dep["id"]),),
        ))[0] == 9_000
        retiered = await economic_v2.reverse_order_rewards(refund_large_order)
        assert retiered == {
            "revoked": 2_920,
            "future_debt": 0,
            "held_canceled": 6_000,
            "expired_ignored": 0,
        }
        refund_net = await one(
            "SELECT l.bonus_entitlement_awarded,"
            "(SELECT COALESCE(SUM(a.principal_net),0) "
            "FROM deposit_v2_allocations a WHERE a.deposit_id=l.deposit_id "
            "AND a.reward_state='counted') principal_net "
            "FROM deposit_v2_lots l WHERE l.deposit_id=?",
            (int(refund_dep["id"]),),
        )
        assert tuple(refund_net) == (80, 1_000)
        assert await db.bonus_balance(refund_user) == 80
        assert await economic_v2.reverse_order_rewards(refund_large_order) == {
            "revoked": 0, "future_debt": 0, "held_canceled": 0,
            "expired_ignored": 0,
        }

        partial_user = base + 11
        partial_order = base + 113
        await insert_user(partial_user)
        partial_dep = await economic_v2.create_pending(
            user_id=partial_user, amount=60_000
        )
        assert (await economic_v2.activate_paid(
            bot, int(partial_dep["id"]), method="qa-partial-refund"
        ))["state"] == "active"
        await insert_order(partial_order, partial_user, 60_000)
        assert (await economic_v2.pay_order(
            bot, partial_order, actor="qa-partial-refund"
        ))[0]
        async with db.transaction():
            await db._exec(
                "UPDATE orders SET bonus_spent=2000 WHERE id=?",
                (partial_order,),
            )
        partial = await economic_v2.reverse_order_rewards(
            partial_order, refunded_total=30_000, refunded_deposit=30_000
        )
        assert partial == {
            "revoked": 0,
            "future_debt": 0,
            "held_canceled": 6_000,
            "expired_ignored": 0,
        }
        partial_state = await one(
            "SELECT l.bonus_entitlement_awarded,a.principal_net,"
            "l.principal_available,l.principal_consumed,"
            "c.refunded_total,c.refunded_deposit,r.revision,"
            "r.bonus_spent_total,r.refunded_bonus,o.bonus_spent "
            "FROM deposit_v2_lots l JOIN deposit_v2_allocations a "
            "ON a.deposit_id=l.deposit_id JOIN deposit_v2_ops op ON op.id=a.op_id "
            "JOIN deposit_v2_reward_claims c ON c.order_id=op.order_id "
            "JOIN economic_order_reward_refunds r ON r.order_id=op.order_id "
            "JOIN orders o ON o.id=op.order_id "
            "WHERE op.order_id=?",
            (partial_order,),
        )
        assert tuple(partial_state) == (
            3_000, 30_000, 30_000, 30_000, 30_000, 30_000, 1,
            2_000, 0, 2_000,
        )
        assert await db.bonus_balance(partial_user) == 3_000
        assert await economic_v2.restore_order_after_refund(
            partial_order, refunded_total=30_000, refunded_deposit=30_000
        ) == 0
        assert await economic_v2.restore_order_after_refund(
            partial_order, refunded_total=30_000, refunded_deposit=30_000,
            refunded_bonus=800,
        ) == 800
        assert await economic_v2.restore_order_after_refund(
            partial_order, refunded_total=30_000, refunded_deposit=30_000,
            refunded_bonus=800,
        ) == 0
        partial_bonus = await one(
            "SELECT o.bonus_spent,r.refunded_bonus,"
            "(SELECT COALESCE(SUM(delta),0) FROM bonus_ledger b "
            "WHERE b.order_id=o.id AND b.kind='restore') restored "
            "FROM orders o JOIN economic_order_reward_refunds r "
            "ON r.order_id=o.id WHERE o.id=?",
            (partial_order,),
        )
        assert tuple(partial_bonus) == (1_200, 800, 800)
        assert await economic_v2.reverse_order_rewards(
            partial_order, refunded_total=30_000, refunded_deposit=30_000
        ) == {
            "revoked": 0,
            "future_debt": 0,
            "held_canceled": 0,
            "expired_ignored": 0,
        }
        partial_full = await economic_v2.reverse_order_rewards(partial_order)
        assert partial_full == {
            "revoked": 3_000,
            "future_debt": 0,
            "held_canceled": 0,
            "expired_ignored": 0,
        }
        assert await economic_v2.restore_order_after_refund(partial_order) == 1_200
        assert await economic_v2.restore_order_after_refund(partial_order) == 0
        assert await db.bonus_balance(partial_user) == 2_000
        partial_audit = await one(
            "SELECT r.complete,r.revision,r.refunded_total,r.refunded_deposit,"
            "r.refunded_bonus,o.bonus_spent,l.principal_available,"
            "l.principal_consumed FROM economic_order_reward_refunds r "
            "JOIN orders o ON o.id=r.order_id "
            "JOIN deposit_v2_ops op ON op.order_id=r.order_id "
            "JOIN deposit_v2_allocations a ON a.op_id=op.id "
            "JOIN deposit_v2_lots l ON l.deposit_id=a.deposit_id "
            "WHERE r.order_id=?",
            (partial_order,),
        )
        assert tuple(partial_audit) == (
            1, 2, 60_000, 60_000, 2_000, 0, 60_000, 0,
        )

        sub_order = base + 103
        await insert_order(sub_order, client, 5_000, work_type="sub_plus")
        sub_ok, sub_report, _ = await economic_v2.pay_order(bot, sub_order, actor="qa")
        assert not sub_ok and "подписка" in sub_report
        sub_rows = await one(
            "SELECT (SELECT COUNT(*) FROM payments WHERE order_id=?) payments_n,"
            "(SELECT COUNT(*) FROM deposit_v2_ops WHERE order_id=?) ops_n",
            (sub_order, sub_order),
        )
        assert tuple(sub_rows) == (0, 0)

        allocated_user = base + 3
        refunded_hold_user = base + 4
        blocked_user = base + 5
        await insert_user(allocated_user)
        await insert_user(refunded_hold_user)
        await insert_user(blocked_user)

        allocated_pending = await economic_v2.create_pending(
            user_id=allocated_user, amount=60_000
        )
        economic_v2.MAX_ACTIVE = 50_000
        held = await economic_v2.activate_paid(
            bot, int(allocated_pending["id"]), method="qa-hold"
        )
        assert held and held["state"] == "paid_hold"
        economic_v2.MAX_ACTIVE = old_max
        async with db.transaction():
            await db._exec(
                "UPDATE deposit_v2_lots SET state='invoice_pending',"
                "version=version+1,updated_at=? WHERE deposit_id=?",
                (db.now_iso(), int(allocated_pending["id"])),
            )
            await db._exec(
                "UPDATE deposit_v2_ops SET state='prepared',error='paid_hold_resume',"
                "updated_at=? WHERE deposit_id=? AND kind='activate'",
                (db.now_iso(), int(allocated_pending["id"])),
            )
        allocated = await economic_v2.resolve_paid_hold(
            bot, int(allocated_pending["id"]), actor="qa"
        )
        assert allocated[0] and allocated[2] == 60_000

        hold_pending = await economic_v2.create_pending(
            user_id=refunded_hold_user, amount=60_000
        )
        economic_v2.MAX_ACTIVE = 50_000
        held_for_refund = await economic_v2.activate_paid(
            bot, int(hold_pending["id"]), method="qa-hold-refund"
        )
        assert held_for_refund and held_for_refund["state"] == "paid_hold"
        economic_v2.MAX_ACTIVE = old_max

        async with db.transaction():
            await db._exec(
                "UPDATE orders SET status='done',parts_done=stages_total WHERE id=?",
                (first_order,),
            )
        assert await economic_v2.release_ready_rewards(client) == []
        started = await one(
            "SELECT release_at FROM deposit_v2_reward_claims WHERE order_id=?",
            (first_order,),
        )
        assert started and started["release_at"]

        async with db.transaction():
            await db._exec(
                "UPDATE settings SET value='earned-v2:closed' "
                "WHERE key='economic_deposit_issuance_v2'"
            )
            await db._exec(
                "UPDATE deposit_v2_reward_claims SET release_at='2000-01-01T00:00:00' "
                "WHERE order_id=?", (first_order,)
            )
        released = await economic_v2.release_ready_rewards(client)
        assert len(released) == 1 and released[0]["amount"] == 2_000
        assert await economic_v2.release_ready_rewards(client) == []
        try:
            await economic_v2.create_pending(user_id=blocked_user, amount=20_000)
        except economic_v2.DepositV2Unavailable as exc:
            assert str(exc) == "deposit_v2_issuance_closed"
        else:
            raise AssertionError("closed issuance accepted a new top-up")

        active_refund = await economic_v2.prepare_refund(
            int(allocated_pending["id"]), actor="qa"
        )
        assert active_refund[0] and active_refund[2] == 60_000
        active_refund_done = await economic_v2.confirm_refund(
            active_refund[3], actor="qa"
        )
        assert active_refund_done[0] and active_refund_done[2] == 60_000

        held_refund = await economic_v2.prepare_refund(
            int(hold_pending["id"]), actor="qa"
        )
        assert held_refund[0] and held_refund[2] == 60_000
        held_refund_done = await economic_v2.confirm_refund(
            held_refund[3], actor="qa"
        )
        assert held_refund_done[0] and held_refund_done[2] == 60_000
        hold_ledger = await one(
            "SELECT COALESCE(SUM(delta),0) balance FROM deposit_ledger "
            "WHERE user_id=?", (refunded_hold_user,)
        )
        assert hold_ledger["balance"] == 0

        manual_inviter = base + 6
        manual_invitee = base + 7
        manual_order = base + 104
        await insert_user(manual_inviter)
        await insert_user(manual_invitee, manual_inviter)
        await insert_order(manual_order, manual_invitee, 5_000)
        async with db.transaction():
            payment = await db._exec(
                "INSERT INTO payments(order_id,kind,amount,method,status,external_id,"
                "created_at,paid_at) VALUES(?,'prepay',5000,'manual','paid',?,?,?)",
                (manual_order, "economic-v2-qa-manual", now, now),
            )
            obligation = await db._exec(
                "INSERT INTO referral_v2_obligations(invitee_user_id,inviter_user_id,"
                "source_order_id,amount,state,program_version,reason,created_at,updated_at) "
                "VALUES(?,?,?,200,'needs_review',?,'qa',?,?)",
                (manual_invitee, manual_inviter, manual_order,
                 economic_v2.REFERRAL_VERSION, now, now),
            )
            assert payment.lastrowid
            obligation_id = int(obligation.lastrowid)
        manual = await economic_v2.resolve_referral_review(
            bot, obligation_id, grant=True, actor="qa"
        )
        assert manual[0]
        manual_row = await one(
            "SELECT o.state,b.delta FROM referral_v2_obligations o "
            "JOIN bonus_ledger b ON b.id=o.bonus_ledger_id WHERE o.id=?",
            (obligation_id,),
        )
        assert tuple(manual_row) == ("granted", 200)

        atomic_user = base + 12
        atomic_order = base + 114
        crash_restore_order = base + 115
        tombstone_spend_order = base + 119
        await insert_user(atomic_user)
        await insert_order(atomic_order, atomic_user, 5_000)
        await insert_order(crash_restore_order, atomic_user, 5_000)
        await insert_order(tombstone_spend_order, atomic_user, 5_000)
        async with db.transaction():
            await db._exec(
                "UPDATE orders SET bonus_spent=500 WHERE id IN (?,?)",
                (atomic_order, crash_restore_order),
            )
        restored = await asyncio.gather(
            economic_v2.restore_order_after_refund(
                atomic_order, "qa concurrent", reverse_rewards=False
            ),
            economic_v2.restore_order_after_refund(
                atomic_order, "qa concurrent", reverse_rewards=False
            ),
        )
        assert sorted(restored) == [0, 500]
        atomic_restore = await one(
            "SELECT (SELECT bonus_spent FROM orders WHERE id=?) spent,"
            "(SELECT COUNT(*) FROM bonus_ledger WHERE order_id=? "
            "AND kind='restore') rows_n",
            (atomic_order, atomic_order),
        )
        assert tuple(atomic_restore) == (0, 1)

        original_bonus_add = db.bonus_add

        async def fail_after_restore_insert(*args, **kwargs):
            result = await original_bonus_add(*args, **kwargs)
            if len(args) > 2 and args[2] == "restore":
                raise RuntimeError("qa_crash_after_restore_insert")
            return result

        db.bonus_add = fail_after_restore_insert
        try:
            try:
                await economic_v2.restore_order_after_refund(
                    crash_restore_order, "qa crash", reverse_rewards=False
                )
            except RuntimeError as exc:
                assert str(exc) == "qa_crash_after_restore_insert"
            else:
                raise AssertionError("restore crash failpoint did not fire")
        finally:
            db.bonus_add = original_bonus_add
        crash_restore_rolled_back = await one(
            "SELECT (SELECT bonus_spent FROM orders WHERE id=?) spent,"
            "(SELECT COUNT(*) FROM bonus_ledger WHERE order_id=? "
            "AND kind='restore') rows_n",
            (crash_restore_order, crash_restore_order),
        )
        assert tuple(crash_restore_rolled_back) == (500, 0)
        assert await economic_v2.restore_order_after_refund(
            crash_restore_order, "qa crash retry", reverse_rewards=False
        ) == 500

        async with db.transaction():
            await db._exec(
                "UPDATE orders SET status='priced',bonus_spent=500 WHERE id=?",
                (tombstone_spend_order,),
            )
        assert await economic_v2.restore_order_after_refund(
            tombstone_spend_order, "qa complete refund"
        ) == 500
        bonus_before_tombstone_spend = await db.bonus_balance(atomic_user)
        original_refund_preflight = economic_v2.order_refund_complete

        async def force_trigger_lane(_order_id: int) -> bool:
            return False

        economic_v2.order_refund_complete = force_trigger_lane
        try:
            spend_after_refund = await bonus.apply_to_order(
                atomic_user,
                await db.get_order(tombstone_spend_order),
                500,
            )
        finally:
            economic_v2.order_refund_complete = original_refund_preflight
        assert spend_after_refund == (False, "bonus_order_refunded", 0)
        blocked_spend = await one(
            "SELECT o.bonus_spent,"
            "(SELECT COUNT(*) FROM bonus_ledger b WHERE b.order_id=o.id "
            "AND b.kind='spend') spend_rows "
            "FROM orders o WHERE o.id=?",
            (tombstone_spend_order,),
        )
        assert tuple(blocked_spend) == (0, 0)
        assert await db.bonus_balance(atomic_user) == bonus_before_tombstone_spend

        tombstone_inviter = base + 13
        tombstone_user = base + 14
        tombstone_order = base + 116
        await insert_user(tombstone_inviter)
        await insert_user(tombstone_user, tombstone_inviter)
        async with db.transaction():
            await db._exec(
                "UPDATE settings SET value='earned-v2:open' "
                "WHERE key='economic_deposit_issuance_v2'"
            )
        tombstone_dep = await economic_v2.create_pending(
            user_id=tombstone_user, amount=20_000
        )
        assert (await economic_v2.activate_paid(
            bot, int(tombstone_dep["id"]), method="qa-tombstone"
        ))["state"] == "active"
        async with db.transaction():
            await db._exec(
                "UPDATE settings SET value='earned-v2:closed' "
                "WHERE key='economic_deposit_issuance_v2'"
            )
        await insert_order(tombstone_order, tombstone_user, 5_000)
        original_on_payment = economic_v2.on_payment

        async def fail_before_reward(*_args, **_kwargs):
            raise RuntimeError("qa_crash_before_reward")

        economic_v2.on_payment = fail_before_reward
        try:
            try:
                await economic_v2.pay_order(
                    bot, tombstone_order, actor="qa-tombstone-crash"
                )
            except RuntimeError as exc:
                assert str(exc) == "qa_crash_before_reward"
            else:
                raise AssertionError("reward crash failpoint did not fire")
        finally:
            economic_v2.on_payment = original_on_payment
        tombstone_op = await one(
            "SELECT id,payment_id,state FROM deposit_v2_ops WHERE order_id=?",
            (tombstone_order,),
        )
        assert tombstone_op and tombstone_op["state"] in (
            "confirming", "money_settled"
        )
        if tombstone_op["state"] == "confirming":
            assert await economic_v2.settle_confirmed_payment(
                int(tombstone_op["payment_id"])
            )
        race = await asyncio.gather(
            economic_v2.on_payment(bot, tombstone_order),
            economic_v2.reverse_order_rewards(tombstone_order),
        )
        assert len(race) == 2
        tombstone_final = await one(
            "SELECT (SELECT COUNT(*) FROM economic_order_reward_refunds "
            "WHERE order_id=? AND complete=1) tombstones,"
            "(SELECT COUNT(*) FROM deposit_v2_reward_claims WHERE order_id=? "
            "AND state NOT IN ('reversed','void')) live_claims,"
            "(SELECT COUNT(*) FROM referral_v2_obligations WHERE source_order_id=? "
            "AND state='granted') live_referrals,"
            "(SELECT COALESCE(SUM(delta-consumed),0) FROM bonus_ledger "
            "WHERE order_id=? AND delta>0) live_bonus",
            (tombstone_order, tombstone_order, tombstone_order, tombstone_order),
        )
        assert tuple(tombstone_final) == (1, 0, 0, 0)
        late = await economic_v2.on_payment(bot, tombstone_order)
        assert late == {"ok": False, "reason": "reward_reversed"}

        cancel_user = base + 15
        race_user = base + 16
        cancel_order = base + 117
        race_order = base + 118
        await insert_user(cancel_user)
        await insert_user(race_user)
        async with db.transaction():
            await db._exec(
                "UPDATE settings SET value='earned-v2:open' "
                "WHERE key='economic_deposit_issuance_v2'"
            )
        cancel_dep = await economic_v2.create_pending(
            user_id=cancel_user, amount=20_000
        )
        race_dep = await economic_v2.create_pending(
            user_id=race_user, amount=20_000
        )
        assert (await economic_v2.activate_paid(
            bot, int(cancel_dep["id"]), method="qa-cancel-pending"
        ))["state"] == "active"
        assert (await economic_v2.activate_paid(
            bot, int(race_dep["id"]), method="qa-cancel-race"
        ))["state"] == "active"
        async with db.transaction():
            await db._exec(
                "UPDATE settings SET value='earned-v2:closed' "
                "WHERE key='economic_deposit_issuance_v2'"
            )
        await insert_order(cancel_order, cancel_user, 5_000)
        await insert_order(race_order, race_user, 5_000)

        original_confirm_for_cancel = payments.confirm

        async def fail_with_pending_payment(*_args, **_kwargs):
            raise RuntimeError("qa_pending_payment_before_confirm")

        async def leave_confirming(order_id: int) -> None:
            payments.confirm = fail_with_pending_payment
            try:
                try:
                    await economic_v2.pay_order(
                        bot, order_id, actor="qa-cancel-before-confirm"
                    )
                except RuntimeError as exc:
                    assert str(exc) == "qa_pending_payment_before_confirm"
                else:
                    raise AssertionError("pending-payment failpoint did not fire")
            finally:
                payments.confirm = original_confirm_for_cancel
            pending_op = await one(
                "SELECT op.state,p.status FROM deposit_v2_ops op "
                "JOIN payments p ON p.id=op.payment_id WHERE op.order_id=?",
                (order_id,),
            )
            assert tuple(pending_op) == ("confirming", "pending")

        await leave_confirming(cancel_order)
        assert await economic_v2.restore_order_after_refund(cancel_order) == 0
        await economic_v2.recover_payments(bot)
        canceled_payment = await one(
            "SELECT op.state,p.status,l.principal_available,"
            "l.principal_pay_reserved,r.complete FROM deposit_v2_ops op "
            "JOIN payments p ON p.id=op.payment_id "
            "JOIN deposit_v2_allocations a ON a.op_id=op.id "
            "JOIN deposit_v2_lots l ON l.deposit_id=a.deposit_id "
            "JOIN economic_order_reward_refunds r ON r.order_id=op.order_id "
            "WHERE op.order_id=?",
            (cancel_order,),
        )
        assert tuple(canceled_payment) == (
            "released", "canceled", 20_000, 0, 1
        )

        await leave_confirming(race_order)
        await asyncio.gather(
            economic_v2.restore_order_after_refund(race_order),
            economic_v2.recover_payments(bot),
        )
        raced_payment = await one(
            "SELECT op.state,p.status,l.principal_available,"
            "l.principal_pay_reserved,l.principal_consumed,r.complete,"
            "(SELECT COUNT(*) FROM deposit_v2_reward_claims c "
            "WHERE c.order_id=op.order_id AND c.state NOT IN ('reversed','void')) "
            "live_claims FROM deposit_v2_ops op "
            "JOIN payments p ON p.id=op.payment_id "
            "JOIN deposit_v2_allocations a ON a.op_id=op.id "
            "JOIN deposit_v2_lots l ON l.deposit_id=a.deposit_id "
            "JOIN economic_order_reward_refunds r ON r.order_id=op.order_id "
            "WHERE op.order_id=?",
            (race_order,),
        )
        assert tuple(raced_payment) == (
            "released", "canceled", 20_000, 0, 0, 1, 0,
        )

        released_reversal = await economic_v2.reverse_order_rewards(first_order)
        assert released_reversal == {
            "revoked": 3_900,
            "future_debt": 0,
            "held_canceled": 1_500,
            "expired_ignored": 0,
        }
        first_lot_after_reversal = await one(
            "SELECT bonus_entitlement_awarded FROM deposit_v2_lots WHERE deposit_id=?",
            (int(dep["id"]),),
        )
        assert first_lot_after_reversal[0] == 800
        assert await db.bonus_balance(client) == 800
        assert (await one(
            "SELECT state FROM referral_v2_obligations "
            "WHERE invitee_user_id=?", (client,)
        ))["state"] == "reversed"

        return {
            "ok": True,
            "payment_saga": "reserved_and_settled_crashes_recover_once",
            "subscription": "deposit_rejected_before_payment",
            "paid_hold": "allocate_and_full_refund",
            "legacy_paid_hold": "backfill_allocate_refund_and_bonus_cancel",
            "issuance_close": "new_only_existing_money_serviceable",
            "rewards": "lot_cumulative_best_of_net_retier_and_14_day_hold",
            "partial_refund": "cumulative_money_principal_and_bonus_components",
            "reversal_tombstone": "sequential_and_concurrent_late_award_blocked",
            "cancel_vs_recovery": "canceled_released_and_principal_returned_atomically",
            "bonus_restore": "single_cas_and_crash_retry_atomic",
            "bonus_tombstone": "complete_refund_blocks_new_spend_under_trigger_race",
            "referral": "fixed_200_once_and_manual_review",
        }
    finally:
        economic_v2.MAX_ACTIVE = old_max
        await db.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-root", type=Path, required=True)
    parser.add_argument("--db", type=Path, required=True)
    args = parser.parse_args()
    app_root = _safe_tmp(args.app_root, "app root")
    db_path = _safe_tmp(args.db, "database")
    if not (app_root / "services" / "economic_v2.py").is_file():
        raise RuntimeError("patched economic_v2 service missing")
    if not db_path.is_file():
        raise RuntimeError("isolated database missing")
    print(json.dumps(asyncio.run(run(app_root, db_path)), ensure_ascii=False,
                     sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
