from __future__ import annotations

import json
import re
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit
from unittest.mock import AsyncMock, patch

from cryptography.fernet import Fernet

from app import config, db
from app.services import payments


class RobokassaReceiptTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.previous_key = config.ORDER_ACCESS_TOKEN_KEY
        config.ORDER_ACCESS_TOKEN_KEY = Fernet.generate_key().decode("ascii")
        self.tmp = tempfile.TemporaryDirectory()
        await db.init(str(Path(self.tmp.name) / "robokassa.sqlite3"))
        now = db.now_iso()
        await db.conn().execute(
            "INSERT INTO users(id,first_name,email,created_at,last_seen_at)"
            " VALUES(?,?,?,?,?)",
            (101, "Клиент", "account@example.test", now, now),
        )
        await db.conn().commit()
        self.order_id = await db.create_order(
            user_id=101,
            status="prepay",
            work_type="course",
            work_label="Курсовая работа",
            price=20_000,
            prepay=10_000,
            stages_total=2,
            source="test",
        )

    async def asyncTearDown(self) -> None:
        await db.close()
        config.ORDER_ACCESS_TOKEN_KEY = self.previous_key
        self.tmp.cleanup()

    async def test_payment_link_freezes_receipt_email_expiry_and_signature(self) -> None:
        order = await db.get_order(self.order_id)
        with patch.object(config, "ROBOKASSA_LOGIN", "merchant"), \
                patch.object(config, "ROBOKASSA_PASS1", "password-one"), \
                patch.object(config, "ROBOKASSA_PASS2", "password-two"), \
                patch.object(config, "ROBOKASSA_TEST", False):
            url = await payments.robo_create_link(
                order,
                "prepay",
                10_000,
                receipt_email=" Buyer@Example.Test ",
            )

        self.assertIsNotNone(url)
        query = {key: values[0] for key, values in parse_qs(
            urlsplit(url).query
        ).items()}
        self.assertEqual(query["Email"], "buyer@example.test")
        self.assertRegex(
            query["ExpirationDate"],
            r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$",
        )
        self.assertNotIn("№", query["Description"])
        self.assertLessEqual(len(query["Description"]), 100)
        expected = payments._robo_sig(
            "merchant",
            query["OutSum"],
            query["InvId"],
            query["Receipt"],
            "password-one",
            "Shp_kind=prepay",
            f"Shp_order={self.order_id}",
        )
        self.assertEqual(query["SignatureValue"], expected)

        receipt = await db.receipt_for_payment(int(query["InvId"]))
        self.assertIsNotNone(receipt)
        self.assertEqual(receipt["buyer_email"], "buyer@example.test")
        self.assertEqual(receipt["amount"], 10_000)
        self.assertEqual(receipt["payment_status"], "pending")
        self.assertEqual(receipt["expires_at"], query["ExpirationDate"])
        self.assertTrue(re.fullmatch(r"[0-9a-f]{64}", receipt["receipt_payload_sha256"]))

    def test_result_signature_uses_exact_decimal_amount(self) -> None:
        with patch.object(config, "ROBOKASSA_PASS2", "password-two"), \
                patch.object(config, "ROBOKASSA_TEST", False):
            valid = {
                "OutSum": "10000.00",
                "InvId": "415",
                "Shp_kind": "prepay",
                "SignatureValue": payments._robo_sig(
                    "10000.00", 415, "password-two", "Shp_kind=prepay"
                ),
            }
            self.assertEqual(payments.robo_result_ok(valid), (415, 10_000))

            fractional = dict(valid, OutSum="10000.50")
            fractional["SignatureValue"] = payments._robo_sig(
                "10000.50", 415, "password-two", "Shp_kind=prepay"
            )
            self.assertIsNone(payments.robo_result_ok(fractional))

            nonfinite = dict(valid, OutSum="NaN")
            nonfinite["SignatureValue"] = payments._robo_sig(
                "NaN", 415, "password-two", "Shp_kind=prepay"
            )
            self.assertIsNone(payments.robo_result_ok(nonfinite))

    async def test_receipt_uses_frozen_specification_allocations(self) -> None:
        order = await db.get_order(self.order_id)
        frozen = {
            "specification_json": json.dumps({
                "lines": [
                    {
                        "line_id": "LN-1",
                        "title": "Разбор структуры",
                        "receipt_name": "Консультация по структуре материала",
                    },
                    {
                        "line_id": "LN-2",
                        "title": "Нормоконтроль",
                        "receipt_name": "Проверка оформления материала",
                    },
                ],
                "payment_schedule": [{
                    "kind": "prepay",
                    "amount_rub": 10_000,
                    "allocations": [
                        {"line_id": "LN-1", "amount_rub": 6_000},
                        {"line_id": "LN-2", "amount_rub": 4_000},
                    ],
                }],
            }, ensure_ascii=False),
        }
        with patch.object(
            payments.db,
            "specification_latest",
            AsyncMock(return_value=frozen),
        ):
            encoded = await payments._robo_order_receipt(
                order, "prepay", 10_000, "Оплата части 1"
            )

        payload = json.loads(unquote(encoded))
        self.assertEqual(
            [item["name"] for item in payload["items"]],
            [
                "Консультация по структуре материала",
                "Проверка оформления материала",
            ],
        )
        self.assertEqual(
            sum(item["sum"] for item in payload["items"]),
            10_000,
        )


if __name__ == "__main__":
    unittest.main()
