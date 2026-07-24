from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from cryptography.fernet import Fernet

from app import config, db
from app.services import payment_delivery, payments


class PaymentEffectsTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.previous_key = config.ORDER_ACCESS_TOKEN_KEY
        config.ORDER_ACCESS_TOKEN_KEY = Fernet.generate_key().decode("ascii")
        self.tmp = tempfile.TemporaryDirectory()
        await db.init(str(Path(self.tmp.name) / "payment-effects.sqlite3"))
        self.order_id = await db.create_order(
            status="prepay",
            work_type="course",
            work_label="Редакторский разбор учебного материала",
            price=20_000,
            prepay=10_000,
            stages_total=2,
            source="test",
        )

    async def asyncTearDown(self) -> None:
        await db.close()
        config.ORDER_ACCESS_TOKEN_KEY = self.previous_key
        self.tmp.cleanup()

    async def _create_pending_payment(self) -> int:
        return await db.payment_create(
            self.order_id,
            "prepay",
            10_000,
            "manual",
        )

    async def _prepare_paid_receipt(self) -> int:
        payment_id = await self._create_pending_payment()
        order = await db.get_order(self.order_id)
        pending = await db.payment_get(payment_id)
        await payment_delivery.prepare_for_payment(order, pending)
        claim = await db.payment_claim_paid_exact(
            payment_id,
            self.order_id,
            "prepay",
            10_000,
            "manual",
        )
        self.assertEqual(claim, "claimed")
        paid = await db.payment_get(payment_id)
        await payment_delivery.prepare_for_payment(order, paid)
        return payment_id

    async def test_pending_receipt_is_created_before_payment_becomes_paid(self) -> None:
        await db.update_order(self.order_id, deleted=1)
        payment_id = await self._create_pending_payment()
        real_claim = db.payment_claim_paid_exact
        observed_before_claim = []

        async def claim_after_observation(*args, **kwargs):
            payment = await db.payment_get(payment_id)
            receipt = await db.receipt_for_payment(payment_id)
            observed_before_claim.append(
                (
                    payment["status"],
                    receipt["payment_status"] if receipt else None,
                    receipt["effects_status"] if receipt else None,
                )
            )
            return await real_claim(*args, **kwargs)

        bot = AsyncMock()
        with patch.object(
            payments.db,
            "payment_claim_paid_exact",
            new=AsyncMock(side_effect=claim_after_observation),
        ) as claim_paid, patch.object(
            payments.notify,
            "notify_admins",
            AsyncMock(),
        ), patch.object(
            payment_delivery,
            "schedule_for_payment",
            AsyncMock(),
        ):
            result = await payments.confirm(
                bot,
                self.order_id,
                "prepay",
                10_000,
                method="manual",
                pay_id=payment_id,
            )

        self.assertTrue(result["ok"])
        claim_paid.assert_awaited_once()
        self.assertEqual(
            observed_before_claim,
            [("pending", "pending", "pending")],
        )
        self.assertEqual((await db.payment_get(payment_id))["status"], "paid")
        final_receipt = await db.receipt_for_payment(payment_id)
        self.assertEqual(final_receipt["payment_status"], "paid")
        self.assertEqual(final_receipt["effects_status"], "applied")

    async def test_effects_cas_claimed_then_in_progress_then_applied(self) -> None:
        payment_id = await self._prepare_paid_receipt()

        self.assertEqual(
            await db.receipt_effects_claim(payment_id),
            "claimed",
        )
        applying = await db.receipt_for_payment(payment_id)
        self.assertEqual(applying["effects_status"], "applying")

        self.assertEqual(
            await db.receipt_effects_claim(payment_id),
            "in_progress",
        )

        await db.receipt_effects_mark(payment_id, applied=True)
        applied = await db.receipt_for_payment(payment_id)
        self.assertEqual(applied["effects_status"], "applied")
        self.assertIsNone(applied["effects_error"])
        self.assertEqual(
            await db.receipt_effects_claim(payment_id),
            "applied",
        )

    async def test_stale_applying_effects_can_be_reclaimed(self) -> None:
        payment_id = await self._prepare_paid_receipt()
        self.assertEqual(
            await db.receipt_effects_claim(payment_id),
            "claimed",
        )
        self.assertEqual(
            await db.receipt_effects_claim(payment_id),
            "in_progress",
        )

        await db.conn().execute(
            "UPDATE payment_receipts "
            "SET effects_updated_at=datetime('now','-6 minutes') "
            "WHERE payment_id=?",
            (payment_id,),
        )
        await db.conn().commit()

        self.assertEqual(
            await db.receipt_effects_claim(payment_id),
            "claimed",
        )
        reclaimed = await db.receipt_for_payment(payment_id)
        self.assertEqual(reclaimed["effects_status"], "applying")
        self.assertIsNone(reclaimed["effects_error"])

    async def test_historic_paid_payment_does_not_replay_business_effects(self) -> None:
        payment_id = await self._create_pending_payment()
        await db.payment_set_status(payment_id, "paid")
        self.assertIsNone(await db.receipt_for_payment(payment_id))

        bot = AsyncMock()
        with patch.object(
            payments.db,
            "set_status",
            AsyncMock(),
        ) as set_status, patch.object(
            payments.db,
            "payments_cancel_pending_kind",
            AsyncMock(),
        ) as cancel_siblings, patch.object(
            payments.db,
            "add_event",
            AsyncMock(),
        ) as add_event, patch.object(
            payments.bonus,
            "on_payment",
            AsyncMock(),
        ) as bonus_hook, patch.object(
            payments.notify,
            "notify_client",
            AsyncMock(),
        ) as notify_client, patch.object(
            payments.notify,
            "notify_admins",
            AsyncMock(),
        ) as notify_admins, patch.object(
            payment_delivery,
            "schedule_for_payment",
            AsyncMock(),
        ) as schedule_delivery, patch(
            "app.services.handoff.release_if_paid",
            new=AsyncMock(return_value={"ok": False}),
        ) as release_if_paid:
            result = await payments.confirm(
                bot,
                self.order_id,
                "prepay",
                10_000,
                method="manual",
                pay_id=payment_id,
            )

        self.assertEqual(
            result,
            {
                "ok": True,
                "duplicate_callback": True,
                "historic_payment": True,
                "pay_id": payment_id,
            },
        )
        set_status.assert_not_awaited()
        cancel_siblings.assert_not_awaited()
        add_event.assert_not_awaited()
        bonus_hook.assert_not_awaited()
        notify_client.assert_not_awaited()
        notify_admins.assert_not_awaited()
        release_if_paid.assert_awaited_once_with(bot, self.order_id)
        schedule_delivery.assert_awaited_once_with(
            bot,
            self.order_id,
            payment_id,
        )
        receipt = await db.receipt_for_payment(payment_id)
        self.assertEqual(receipt["payment_status"], "paid")
        self.assertEqual(receipt["effects_status"], "applied")

    async def test_confirm_after_applied_returns_duplicate_callback(self) -> None:
        await db.update_order(self.order_id, deleted=1)
        payment_id = await self._create_pending_payment()
        bot = AsyncMock()

        with patch.object(
            payments.notify,
            "notify_admins",
            AsyncMock(),
        ), patch.object(
            payment_delivery,
            "schedule_for_payment",
            AsyncMock(),
        ) as schedule_delivery, patch(
            "app.services.handoff.release_if_paid",
            new=AsyncMock(return_value={"ok": False}),
        ) as release_if_paid:
            first = await payments.confirm(
                bot,
                self.order_id,
                "prepay",
                10_000,
                method="manual",
                pay_id=payment_id,
            )
            second = await payments.confirm(
                bot,
                self.order_id,
                "prepay",
                10_000,
                method="manual",
                pay_id=payment_id,
            )

        self.assertTrue(first["ok"])
        self.assertTrue(first["deleted_order"])
        self.assertEqual(
            second,
            {
                "ok": True,
                "duplicate_callback": True,
                "pay_id": payment_id,
            },
        )
        self.assertEqual(schedule_delivery.await_count, 2)
        release_if_paid.assert_awaited_once_with(bot, self.order_id)
        receipt = await db.receipt_for_payment(payment_id)
        self.assertEqual(receipt["effects_status"], "applied")
        cursor = await db.conn().execute(
            "SELECT COUNT(*) AS n FROM order_events "
            "WHERE order_id=? AND kind='payment_confirmed'",
            (self.order_id,),
        )
        self.assertEqual((await cursor.fetchone())["n"], 1)


if __name__ == "__main__":
    unittest.main()
