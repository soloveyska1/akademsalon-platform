from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from cryptography.fernet import Fernet

from app import config, db
from app.services import payment_delivery


class PaymentDeliveryTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.previous_key = config.ORDER_ACCESS_TOKEN_KEY
        config.ORDER_ACCESS_TOKEN_KEY = Fernet.generate_key().decode("ascii")
        self.tmp = tempfile.TemporaryDirectory()
        await db.init(str(Path(self.tmp.name) / "delivery.sqlite3"))
        now = db.now_iso()
        await db.conn().execute(
            "INSERT INTO users("
            "id,first_name,email,created_at,last_seen_at"
            ") VALUES(?,?,?,?,?)",
            (777, "Клиент", "buyer@example.test", now, now),
        )
        await db.conn().commit()
        self.order_id = await db.create_order(
            user_id=777,
            status="work",
            work_type="course",
            work_label="Редакторский разбор учебного материала",
            source="test",
        )
        self.payment_id = await db.payment_create(
            self.order_id, "prepay", 12_500, "manual"
        )
        await db.payment_set_status(self.payment_id, "paid")

    async def asyncTearDown(self) -> None:
        await db.close()
        config.ORDER_ACCESS_TOKEN_KEY = self.previous_key
        self.tmp.cleanup()

    async def _generic_receipt(
        self,
        *,
        scope: str,
        scope_id: int,
        inv_id: int,
        paid: bool = True,
    ):
        receipt = await db.receipt_invoice_upsert(
            provider="robokassa",
            inv_id=inv_id,
            scope=scope,
            scope_id=scope_id,
            user_id=777,
            kind=scope,
            amount=9_900,
            buyer_email="buyer@example.test",
            receipt_payload='{"items":[{"name":"test","sum":9900}]}',
        )
        if paid:
            receipt = await db.receipt_mark_paid(
                "robokassa",
                inv_id,
                payment_method="BankCard",
            )
        return receipt

    async def test_prepares_durable_confirmation_outbox(self) -> None:
        order = await db.get_order(self.order_id)
        payment = await db.payment_get(self.payment_id)
        receipt = await payment_delivery.prepare_for_payment(order, payment)

        self.assertIsNotNone(receipt)
        self.assertEqual(receipt["provider"], "manual")
        self.assertEqual(receipt["payment_status"], "paid")
        self.assertEqual(receipt["fiscal_status"], "manual_required")
        self.assertEqual(receipt["buyer_email"], "buyer@example.test")
        self.assertEqual(receipt["order_id"], self.order_id)
        self.assertEqual(receipt["payment_id"], self.payment_id)
        self.assertNotIn("buyer@example.test", receipt["receipt_payload"])

    async def test_sends_each_channel_once_and_records_delivery(self) -> None:
        bot = AsyncMock()
        with patch.object(
            payment_delivery,
            "confirmation_bytes",
            AsyncMock(return_value=b"%PDF-confirmation"),
        ), patch.object(
            payment_delivery.mailer,
            "order_event",
            AsyncMock(return_value=True),
        ) as send_mail:
            first = await payment_delivery.deliver_for_payment(
                bot, self.order_id, self.payment_id
            )
            second = await payment_delivery.deliver_for_payment(
                bot, self.order_id, self.payment_id
            )

        self.assertEqual(first, {"email": "sent", "telegram": "sent"})
        self.assertEqual(second, {"email": "skipped", "telegram": "skipped"})
        send_mail.assert_awaited_once()
        bot.send_document.assert_awaited_once()
        receipt = await db.receipt_for_payment(self.payment_id)
        self.assertTrue(receipt["confirmation_email_at"])
        self.assertTrue(receipt["confirmation_tg_at"])
        self.assertEqual(receipt["confirmation_email_attempts"], 1)
        self.assertEqual(receipt["confirmation_tg_attempts"], 1)

    async def test_generic_robokassa_receipts_deliver_each_channel_once(self) -> None:
        paid_receipt_ids = set()
        for scope, scope_id, inv_id in (
            ("subscription", 41, 7_100_041),
            ("deposit", 52, 8_100_052),
        ):
            with self.subTest(scope=scope):
                receipt = await self._generic_receipt(
                    scope=scope,
                    scope_id=scope_id,
                    inv_id=inv_id,
                )
                self.assertEqual(receipt["scope"], scope)
                self.assertIsNone(receipt["order_id"])
                self.assertIsNone(receipt["payment_id"])
                paid_receipt_ids.add(int(receipt["id"]))
                bot = AsyncMock()
                with patch.object(
                    payment_delivery,
                    "confirmation_bytes_for_receipt",
                    AsyncMock(return_value=b"%PDF-generic-confirmation"),
                ), patch.object(
                    payment_delivery.mailer,
                    "send",
                    AsyncMock(return_value=True),
                ) as send_mail:
                    first = await payment_delivery.deliver_for_receipt(
                        bot,
                        "robokassa",
                        inv_id,
                    )
                    second = await payment_delivery.deliver_for_receipt(
                        bot,
                        "robokassa",
                        inv_id,
                    )

                self.assertEqual(
                    first,
                    {"email": "sent", "telegram": "sent"},
                )
                self.assertEqual(
                    second,
                    {"email": "skipped", "telegram": "skipped"},
                )
                send_mail.assert_awaited_once()
                self.assertEqual(
                    send_mail.await_args.args[0],
                    "buyer@example.test",
                )
                self.assertEqual(
                    send_mail.await_args.kwargs["attachments"][0]["data"],
                    b"%PDF-generic-confirmation",
                )
                bot.send_document.assert_awaited_once()
                self.assertEqual(bot.send_document.await_args.args[0], 777)

                stored = await db.receipt_get("robokassa", inv_id)
                self.assertTrue(stored["confirmation_email_at"])
                self.assertTrue(stored["confirmation_tg_at"])
                self.assertEqual(stored["confirmation_email_attempts"], 1)
                self.assertEqual(stored["confirmation_tg_attempts"], 1)
                self.assertIsNone(stored["last_error"])

        pending = await self._generic_receipt(
            scope="deposit",
            scope_id=53,
            inv_id=8_100_053,
            paid=False,
        )
        user_receipts = await db.receipts_for_user(777)
        self.assertEqual(
            {int(receipt["id"]) for receipt in user_receipts},
            paid_receipt_ids,
        )
        self.assertTrue(
            all(receipt["payment_status"] == "paid" for receipt in user_receipts)
        )
        self.assertNotIn(
            int(pending["id"]),
            {int(receipt["id"]) for receipt in user_receipts},
        )

    async def test_retry_pending_delivers_generic_deposit_receipt(self) -> None:
        inv_id = 8_200_061
        receipt = await self._generic_receipt(
            scope="deposit",
            scope_id=61,
            inv_id=inv_id,
        )
        self.assertIsNone(receipt["order_id"])
        self.assertIsNone(receipt["payment_id"])
        bot = AsyncMock()
        with patch.object(
            payment_delivery,
            "confirmation_bytes_for_receipt",
            AsyncMock(return_value=b"%PDF-retry-confirmation"),
        ), patch.object(
            payment_delivery.mailer,
            "send",
            AsyncMock(return_value=True),
        ) as send_mail:
            first_count = await payment_delivery.retry_pending(bot)
            second_count = await payment_delivery.retry_pending(bot)

        self.assertEqual(first_count, 1)
        self.assertEqual(second_count, 0)
        send_mail.assert_awaited_once()
        bot.send_document.assert_awaited_once()
        stored = await db.receipt_by_id(int(receipt["id"]))
        self.assertTrue(stored["confirmation_email_at"])
        self.assertTrue(stored["confirmation_tg_at"])
        self.assertEqual(stored["confirmation_email_attempts"], 1)
        self.assertEqual(stored["confirmation_tg_attempts"], 1)


if __name__ == "__main__":
    unittest.main()
