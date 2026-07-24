from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

import aiosqlite

from app import db, webapp
from app.services import contract, flow


def order_data(order_id: int = 101, price: int = 36_000) -> dict:
    return {
        "id": order_id,
        "user_id": 123,
        "status": "new",
        "work_type": "custom",
        "work_label": "Комплексный заказ",
        "topic": "Тестовый предмет заказа",
        "details": "",
        "deadline_text": "до 20 августа 2026",
        "deadline_date": "2026-08-20",
        "price": price,
        "prepay": price // 2,
        "stages_total": 2,
        "stage": 1,
        "bonus_spent": 0,
        "sub_discount": 0,
        "promo_discount": 0,
        "gift_amount": 0,
        "guest_name": "Тестовый заказчик",
        "created_at": "2026-07-24T10:00:00",
        "updated_at": "2026-07-24T10:00:00",
    }


def three_contours() -> dict:
    return {
        "lines": [
            {
                "line_id": "A-1",
                "contract_contour": "A_academic_support",
                "title": "Аудит материала заказчика",
                "permitted_purpose": "Проверка и доработка собственного материала заказчика.",
                "actual_author": "Заказчик",
                "rights_mode": "Права на исходник сохраняются у Заказчика.",
                "included": ["аудит структуры", "письменные рекомендации"],
                "excluded": ["создание аттестационной работы вместо заказчика"],
                "acceptance_criteria": ["передан отчёт с замечаниями по разделам"],
                "price_amount": 10_000,
            },
            {
                "line_id": "B1-1",
                "contract_contour": "B1_personal_author_order",
                "title": "Статья для корпоративного блога",
                "permitted_purpose": "Публикация в корпоративном блоге, вне аттестации.",
                "actual_author": "Исполнитель",
                "rights_mode": "Простая лицензия на публикацию на сайте заказчика.",
                "included": ["текст статьи", "одна редакторская итерация"],
                "excluded": ["использование в учебной или научной аттестации"],
                "acceptance_criteria": ["объём и структура соответствуют ТЗ"],
                "price_amount": 12_000,
            },
            {
                "line_id": "B2-1",
                "contract_contour": "B2_third_party_author_order",
                "title": "Сценарий отраслевого интервью",
                "permitted_purpose": "Запись интервью для публичного канала компании.",
                "actual_author_profile": {
                    "model": "Иной согласованный автор (Б2)",
                    "author_name": "Иван Петров",
                    "confirmation_pending": False,
                },
                "rights_mode": "Отчуждение исключительного права после полной оплаты.",
                "included": ["сценарный план", "вопросы ведущего"],
                "excluded": ["скрытое авторство в аттестационных материалах"],
                "acceptance_criteria": ["передан редактируемый сценарий"],
                "price_amount": 14_000,
            },
        ]
    }


class SpecificationPureTests(unittest.IsolatedAsyncioTestCase):
    def test_site_author_service_is_accepted_and_v2_is_preserved(self) -> None:
        cart = {
            "items": [{
                "client_id": "line-author-1",
                "requested_line_id": "line-author-1",
                "kind": "service",
                "type": "svc_author_order",
                "service_id": "author",
                "label": "Авторский текст вне аттестации",
                "qty": 1,
                "topic": "Статья в корпоративный блог",
                "deadline": "20 августа",
                "contract_contour": "B2_third_party_author_order",
                "permitted_purpose": "Публикация в корпоративном блоге.",
                "intellectual_rights_profile": "Лицензия на использование",
                "actual_author_profile": {
                    "model": "Иной согласованный автор (Б2)",
                    "author_name": "Иван Петров",
                    "confirmation_pending": False,
                },
                "answers": {
                    "author_model": "Иной согласованный автор (Б2)",
                    "author_name": "Иван Петров",
                    "purpose": "Публикация в корпоративном блоге.",
                    "rights": "Лицензия на использование",
                },
            }]
        }
        items, low, high, errors = webapp._cart_items(cart)
        self.assertEqual(errors, [])
        self.assertEqual((low, high), (12_000, 12_000))
        self.assertEqual(items[0]["catalog_id"], "svc_author_order")
        request = items[0]["request"]
        self.assertEqual(request["contract_contour"], "B2_third_party_author_order")
        self.assertEqual(request["actual_author_profile"]["author_name"], "Иван Петров")
        self.assertEqual(request["permitted_purpose"],
                         "Публикация в корпоративном блоге.")

    async def test_three_contours_prices_allocations_and_stable_pdf(self) -> None:
        order = order_data()
        spec = contract.specification_from_payload(
            order, [], three_contours(), revision=3,
            created_at="2026-07-24T10:00:00", strict=True,
        )
        self.assertEqual([line["contract_contour"] for line in spec["lines"]],
                         ["A", "B1", "B2"])
        self.assertEqual(spec["lines"][2]["third_party_performers"], ["Иван Петров"])
        self.assertEqual(spec["documents"]["consent"]["version"], "1.5")
        self.assertEqual(
            spec["documents"]["academic_integrity"]["url"],
            "https://akademsalon.ru/academic-integrity.html",
        )
        self.assertEqual(sum(line["price_rub"] for line in spec["lines"]), 36_000)
        for stage in spec["payment_schedule"]:
            self.assertEqual(
                sum(part["amount_rub"] for part in stage["allocations"]),
                stage["amount_rub"],
            )
        first = await contract.build_pdf(order, spec)
        second = await contract.build_pdf(order, spec)
        self.assertTrue(first and first.startswith(b"%PDF"))
        self.assertEqual(first, second)
        self.assertEqual(contract.canonical_hash(spec),
                         hashlib.sha256(contract.canonical_json(spec).encode()).hexdigest())


class SpecificationDatabaseTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "test.sqlite3")
        await db.init(self.db_path)
        self.order_id = await db.create_order(
            user_id=None,
            work_type="custom",
            work_label="Комплексный заказ",
            topic="Тестовый предмет заказа",
            deadline_text="до 20 августа 2026",
            deadline_date="2026-08-20",
            price=36_000,
            prepay=18_000,
            stages_total=2,
            stage=1,
            bonus_spent=0,
            source="test",
            guest_name="Тестовый заказчик",
        )

    async def asyncTearDown(self) -> None:
        await db.close()
        self.tmp.cleanup()

    async def _frozen(self) -> tuple[dict, bytes, int]:
        order = dict(await db.get_order(self.order_id))
        spec = contract.specification_from_payload(
            order, [], three_contours(), revision=1,
            created_at="2026-07-24T10:00:00", strict=True,
        )
        pdf = await contract.build_pdf(order, spec)
        self.assertIsNotNone(pdf)
        snapshot_id = await db.specification_create(
            self.order_id, contract.canonical_json(spec), pdf,
            source="price", revision=1,
            specification_hash=contract.canonical_hash(spec),
            pdf_hash=hashlib.sha256(pdf).hexdigest(),
            created_at="2026-07-24T10:00:00",
        )
        return spec, pdf, snapshot_id

    async def test_no_mutable_fallback_and_exact_frozen_bytes(self) -> None:
        order = await db.get_order(self.order_id)
        missing = await contract.snapshot_for_order(order)
        self.assertFalse(missing["frozen"])
        self.assertIsNone(missing["pdf"])

        spec, pdf, snapshot_id = await self._frozen()
        snapshot = await contract.snapshot_for_order(order)
        self.assertTrue(snapshot["frozen"])
        self.assertEqual(snapshot["snapshot_id"], snapshot_id)
        self.assertEqual(snapshot["specification"], spec)
        self.assertEqual(snapshot["pdf"], pdf)
        self.assertEqual(snapshot["pdf_hash"], hashlib.sha256(pdf).hexdigest())

    async def test_legacy_price_flow_autofills_and_freezes_a_specification(self) -> None:
        with patch.object(
            flow.mailer, "order_event", new=AsyncMock(return_value=None),
        ), patch.object(
            flow.grp, "status_sync", new=AsyncMock(return_value=None),
        ):
            result = await flow.set_price(
                None, self.order_id, 40_000, 20_000, 2, via="test",
            )
        after = await db.get_order(self.order_id)
        frozen = await db.specification_latest(self.order_id)
        self.assertTrue(result["ok"])
        self.assertEqual(after["price"], 40_000)
        self.assertEqual(after["prepay"], 20_000)
        self.assertIsNotNone(frozen)
        specification = json.loads(frozen["specification_json"])
        self.assertEqual(
            {line["contract_contour"] for line in specification["lines"]}, {"A"},
        )
        self.assertTrue(await db.has_event(self.order_id, "specification_autofilled"))

    async def test_pdf_preflight_failure_keeps_order_and_pending_invoice(self) -> None:
        payment_id = await db.payment_create(
            self.order_id, "prepay", 18_000, method="manual",
        )
        before = await db.get_order(self.order_id)
        with patch.object(
            contract, "build_pdf", new=AsyncMock(return_value=None),
        ):
            result = await flow.set_price(
                None, self.order_id, 40_000, 20_000, 2, via="test",
                specification=three_contours(),
            )
        after = await db.get_order(self.order_id)
        payment = await db.payment_get(payment_id)
        self.assertEqual(result["error"], "bad_specification")
        self.assertEqual(after["price"], before["price"])
        self.assertEqual(after["prepay"], before["prepay"])
        self.assertEqual(payment["status"], "pending")
        self.assertIsNone(await db.specification_latest(self.order_id))

    async def test_snapshot_contract_fields_are_immutable_status_is_not(self) -> None:
        spec, pdf, snapshot_id = await self._frozen()
        with self.assertRaises(aiosqlite.IntegrityError):
            await db.conn().execute(
                "UPDATE order_specifications SET specification_json=? WHERE id=?",
                (json.dumps({"changed": True}), snapshot_id),
            )
        await db.conn().rollback()
        payment_id = await db.payment_create(
            self.order_id, "prepay", 18_000, method="manual",
        )
        changed = await db.specification_accept(self.order_id, payment_id)
        self.assertTrue(changed)
        stored = await db.specification_get(snapshot_id)
        self.assertEqual(stored["status"], "accepted")
        self.assertEqual(stored["accepted_payment_id"], payment_id)
        self.assertEqual(stored["specification_json"], contract.canonical_json(spec))
        self.assertEqual(stored["pdf_bytes"], pdf)

    async def test_offer_links_to_same_snapshot_and_cannot_rewrite_it(self) -> None:
        spec, pdf, snapshot_id = await self._frozen()
        data_hash = contract.canonical_hash(spec)
        pdf_hash = hashlib.sha256(pdf).hexdigest()
        offer_id = await db.offer_create(
            code="test-offer-code",
            order_id=self.order_id,
            version=1,
            specification_json=contract.canonical_json(spec),
            specification_hash=data_hash,
            specification_pdf=pdf,
            specification_pdf_hash=pdf_hash,
            specification_pdf_size=len(pdf),
            specification_revision=1,
            specification_schema="2.0",
            specification_created_at="2026-07-24T10:00:00",
            specification_snapshot_id=snapshot_id,
            status="live",
        )
        offer = await db.offer_get(offer_id)
        self.assertEqual(offer["specification_snapshot_id"], snapshot_id)
        with self.assertRaises(aiosqlite.IntegrityError):
            await db.conn().execute(
                "UPDATE offers SET specification_hash='changed' WHERE id=?",
                (offer_id,),
            )
        await db.conn().rollback()
        await db.offer_update(offer_id, status="replaced")
        offer = await db.offer_get(offer_id)
        self.assertEqual(offer["status"], "replaced")
        self.assertEqual(offer["specification_hash"], data_hash)


if __name__ == "__main__":
    unittest.main()
