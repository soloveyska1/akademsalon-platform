from __future__ import annotations

import unittest

import fitz

from app.services import payment_document


def payment_data(**overrides) -> dict:
    data = {
        "id": 7341,
        "order_id": 2158,
        "amount": 18_750,
        "paid_at": "2026-07-24T12:41:00+03:00",
        "method": "robokassa",
        "status": "paid",
        "service_name": "Редакторский разбор и оформление учебного материала заказчика",
    }
    data.update(overrides)
    return data


def extracted_text(pdf_bytes: bytes) -> tuple[int, str]:
    with fitz.open(stream=pdf_bytes, filetype="pdf") as document:
        text = "\n".join(page.get_text() for page in document)
        return document.page_count, " ".join(text.split())


class PaymentDocumentTests(unittest.TestCase):
    def test_builds_branded_confirmation_with_required_legal_notice(self) -> None:
        pdf_bytes = payment_document.build_payment_confirmation(payment_data())

        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))
        pages, text = extracted_text(pdf_bytes)
        self.assertGreaterEqual(pages, 1)
        for phrase in (
            "АКАДЕМИЧЕСКИЙ САЛОН",
            "Подтверждение платежа",
            "Семёнов Семён Юрьевич",
            "ИНН: 212885750445",
            "Плательщик налога на профессиональный доход (НПД)",
            "420054, Республика Татарстан, г. Казань, ул. Актайская, д. 7",
            "заказ № 2158",
            "Платёж № 7341",
            "18 750 ₽",
            "24.07.2026 12:41",
            "Robokassa",
            "Редакторский разбор и оформление учебного материала заказчика",
            "не является налоговым чеком НПД",
            "«Мой налог»",
            "направляется плательщику отдельно",
        ):
            self.assertIn(phrase, text)

    def test_handles_long_text_and_unsupported_unicode(self) -> None:
        service = (
            "Консультация по структуре материала 🧭 "
            + ("раздел с русским текстом и уточнениями — " * 420)
            + ("А" * 600)
        )
        pdf_bytes = payment_document.render(payment_data(
            payment_number="РК-2026-000042",
            order_number="ЗАКАЗ-2026-0157",
            amount_rub="12 345,67 ₽",
            service_name=service,
        ))

        self.assertTrue(pdf_bytes.startswith(b"%PDF-"))
        pages, text = extracted_text(pdf_bytes)
        self.assertGreaterEqual(pages, 2)
        self.assertIn("Консультация по структуре материала", text)
        self.assertIn("12 345,67 ₽", text)
        self.assertIn("РК-2026-000042", text)
        self.assertIn("ЗАКАЗ-2026-0157", text)
        self.assertIn("не является налоговым чеком НПД", text)

    def test_rejects_unconfirmed_payment(self) -> None:
        with self.assertRaisesRegex(
            payment_document.PaymentDocumentError,
            "только для оплаченного платежа",
        ):
            payment_document.build_payment_confirmation(
                payment_data(status="pending")
            )


if __name__ == "__main__":
    unittest.main()
