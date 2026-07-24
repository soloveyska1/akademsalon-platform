from __future__ import annotations

import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from app import config, db, keyboards, webapp
from app.handlers import order_wizard
from app.services import intake_guard


class IntakeGuardUnitTests(unittest.TestCase):
    def test_explicit_prohibited_requests_are_blocked(self) -> None:
        cases = {
            "Напишите мне диплом под ключ": "academic_impersonation",
            "Нужно выполнить курсовую за меня": "academic_impersonation",
            "Хочу, чтобы вы написали диплом": "academic_impersonation",
            "Нужна курсовая под ключ": "academic_impersonation",
            "Не нужна консультация, нужна курсовая под ключ": "academic_impersonation",
            "Хочу заказать курсовую": "academic_impersonation",
            "Сначала аудит диплома, а затем напишите его за меня": "academic_impersonation",
            "Напишите диплом, а потом проведите редакторский аудит": "academic_impersonation",
            "Пройдите тест в Moodle под моим аккаунтом": "test_or_lms_impersonation",
            "Выдумайте данные опроса и результаты": "fabricated_evidence",
            "Придумать несуществующие источники": "fabricated_evidence",
            "Как обойти антиплагиат и поднять процент": "integrity_check_bypass",
            "Перепишите текст под процент оригинальности 80": "integrity_check_bypass",
            "Решить тест": "test_or_lms_impersonation",
        }
        for text, code in cases.items():
            with self.subTest(text=text):
                decision = intake_guard.evaluate([text])
                self.assertTrue(decision.blocked)
                self.assertEqual(decision.code, code)

    def test_negations_and_educational_questions_are_not_false_positives(self) -> None:
        cases = (
            "Не нужно писать диплом за меня, нужен редакторский аудит моего текста",
            "Не нужна курсовая под ключ, хочу аудит своего черновика",
            "Как самостоятельно написать курсовую? Нужна консультация по структуре",
            "Анализ рекламы по запросу «заказать курсовую»",
            "Сделайте редакторский аудит моей ВКР",
            "Проверьте источники и оформление диплома",
            "Почему нельзя выдумывать данные исследования?",
            "Не нужно обходить антиплагиат — разберите отчёт и мои цитаты",
            "Отредактируйте мой текст по отчёту Антиплагиата и исправьте ссылки",
            "Подготовьте презентацию по моему диплому",
            "Подготовьте меня к защите диплома и вопросам комиссии",
            "Сделайте расчёты по моим данным для диплома",
            "Помогите разобраться, как решать тесты самостоятельно",
        )
        for text in cases:
            with self.subTest(text=text):
                self.assertFalse(intake_guard.evaluate([text]).blocked)

    def test_only_customer_authored_cart_fields_are_scanned(self) -> None:
        legal_description = {
            "topic": "Редакторский аудит моего текста",
            "details": (
                "Создание и сдача аттестационной работы вместо заказчика запрещены; "
                "обход антиплагиата не входит в услугу.\n"
                "ОБЩИЙ КОММЕНТАРИЙ\nПроверьте мой черновик по методичке."
            ),
            "cart": {"items": [{
                "scope": "создание и сдача аттестационной работы вместо заказчика",
                "contract_contour": "обход антиплагиата запрещён",
                "requirements": "Проверьте аргументацию и реальные источники",
            }]},
        }
        self.assertFalse(intake_guard.evaluate_payload(legal_description).blocked)
        legal_description["cart"]["items"][0]["requirements"] = (
            "Выдумайте данные опроса и источники"
        )
        self.assertEqual(
            intake_guard.evaluate_payload(legal_description).code,
            "fabricated_evidence",
        )

    def test_switching_form_fields_does_not_bypass_guard(self) -> None:
        self.assertEqual(
            intake_guard.evaluate(["Напишите", "диплом за меня"]).code,
            "academic_impersonation",
        )

    def test_wizard_has_no_hidden_tier_and_matches_catalog_price(self) -> None:
        base = {
            "mode": "work",
            "type_id": "course",
            "disc": "hum",
            "term": "free",
        }
        self.assertIsNone(order_wizard._quote_for(base))
        for tier_id, *_rest in config.TIERS:
            with self.subTest(tier=tier_id):
                data = {**base, "tier": tier_id}
                self.assertEqual(
                    order_wizard._quote_for(data),
                    config.quote("course", "hum", "free", tier_id),
                )

    def test_wizard_exposes_all_results_and_material_question(self) -> None:
        result_buttons = [
            row[0] for row in keyboards.wiz_tiers().inline_keyboard[:-1]
        ]
        self.assertEqual(
            [button.callback_data for button in result_buttons],
            [f"wz:tier:{tier[0]}" for tier in config.TIERS],
        )
        self.assertEqual(
            [tier[2] for tier in config.TIERS],
            ["Диагностика", "Редакторский аудит", "Сопровождение"],
        )
        material_callbacks = {
            button.callback_data
            for row in keyboards.wiz_material().inline_keyboard
            for button in row
        }
        self.assertTrue({
            "wz:material:draft",
            "wz:material:partial",
            "wz:material:none",
        }.issubset(material_callbacks))
        stored = order_wizard._stored_details({
            "own_material": "partial",
            "details": "Нужна проверка структуры",
        })
        self.assertIn("есть тема, план или данные", stored)
        self.assertIn("Нужна проверка структуры", stored)


class _FakeState:
    def __init__(self, data: dict | None = None) -> None:
        self.data = dict(data or {})
        self.state = None

    async def clear(self) -> None:
        self.data.clear()
        self.state = None

    async def update_data(self, **values) -> None:
        self.data.update(values)

    async def get_data(self) -> dict:
        return dict(self.data)

    async def set_state(self, value) -> None:
        self.state = value


class _FakeMessage:
    def __init__(self, text: str = "") -> None:
        self.text = text
        self.edits: list[tuple[str, object]] = []
        self.answers: list[tuple[str, object]] = []

    async def edit_text(self, text: str, reply_markup=None) -> None:
        self.edits.append((text, reply_markup))

    async def answer(self, text: str, reply_markup=None) -> None:
        self.answers.append((text, reply_markup))


class _FakeCallback:
    def __init__(self, data: str) -> None:
        self.data = data
        self.message = _FakeMessage()
        self.answers: list[tuple[tuple, dict]] = []

    async def answer(self, *args, **kwargs) -> None:
        self.answers.append((args, kwargs))


class WizardStateMachineTests(unittest.IsolatedAsyncioTestCase):
    async def test_new_work_flow_keeps_explicit_tier_through_topic(self) -> None:
        state = _FakeState()
        cb = _FakeCallback("wz:type:course")
        await order_wizard.pick_type(cb, state)
        self.assertIn("выберите результат", cb.message.edits[-1][0].lower())

        cb = _FakeCallback("wz:tier:turn")
        await order_wizard.pick_tier(cb, state)
        self.assertEqual(state.data["tier"], "turn")
        self.assertIn("что у вас уже есть", cb.message.edits[-1][0].lower())

        cb = _FakeCallback("wz:material:partial")
        await order_wizard.pick_material(cb, state)
        self.assertEqual(state.data["own_material"], "partial")
        self.assertIn("выберите направление", cb.message.edits[-1][0].lower())

        cb = _FakeCallback("wz:disc:hum")
        await order_wizard.pick_disc(cb, state)
        self.assertIn("к какой дате", cb.message.edits[-1][0].lower())

        cb = _FakeCallback("wz:term:free")
        await order_wizard.pick_term(cb, state)
        self.assertEqual(state.state, order_wizard.Wiz.topic)
        self.assertEqual(state.data["tier"], "turn")

    async def test_bot_topic_guard_stops_order_path_but_allows_learning_question(self) -> None:
        blocked_state = _FakeState({"type_id": "course", "mode": "work"})
        blocked_message = _FakeMessage("Напишите курсовую за меня")
        await order_wizard.got_topic(blocked_message, blocked_state)
        self.assertEqual(blocked_state.data, {})
        self.assertIn("нельзя оформить", blocked_message.answers[-1][0])

        allowed_state = _FakeState({"type_id": "course", "mode": "work"})
        allowed_message = _FakeMessage(
            "Как самостоятельно написать курсовую? Нужна консультация"
        )
        await order_wizard.got_topic(allowed_message, allowed_state)
        self.assertEqual(allowed_state.state, order_wizard.Wiz.deadline)
        self.assertIn("самостоятельно", allowed_state.data["topic"])

    async def test_legacy_incomplete_flow_asks_tier_instead_of_defaulting(self) -> None:
        state = _FakeState({
            "mode": "work",
            "type_id": "course",
            "work_label": "Курсовая работа",
            "disc": "hum",
            "term": "free",
            "topic": "Мой черновик",
            "files": [],
        })
        cb = _FakeCallback("wz:files_done")
        await order_wizard.files_done(cb, state)
        self.assertTrue(state.data["resume_confirm"])
        self.assertIsNone(order_wizard._quote_for(state.data))

        cb = _FakeCallback("wz:tier:base")
        await order_wizard.pick_tier(cb, state)
        self.assertEqual(state.state, order_wizard.Wiz.confirm)
        self.assertEqual(state.data["tier"], "base")
        self.assertIn("Диагностика", cb.message.edits[-1][0])


class _JsonRequest:
    def __init__(self, payload: dict) -> None:
        self._payload = payload
        self.headers: dict[str, str] = {}
        self.query: dict[str, str] = {}
        self.remote = "127.0.0.1"

    async def json(self) -> dict:
        return self._payload

    async def text(self) -> str:
        return json.dumps(self._payload)


class IntakeApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "intake.sqlite3")
        await db.init(self.db_path)

    async def asyncTearDown(self) -> None:
        await db.close()
        self.tmp.cleanup()

    async def test_api_rejects_before_creating_commercial_order(self) -> None:
        request = _JsonRequest({
            "contact": "client@example.test",
            "consent": True,
            "consent_doc": config.ORDER_CONSENT_DOC,
            "type": "course",
            "tier": "turn",
            "topic": "Напишите курсовую за меня под ключ",
        })
        with patch.object(webapp, "_rate_ok", return_value=True):
            response = await webapp.orders_create(request)
        payload = json.loads(response.body)
        self.assertEqual(response.status, 422)
        self.assertEqual(payload["error"], "request_outside_scope")
        self.assertEqual(payload["reason"], "academic_impersonation")
        self.assertGreaterEqual(len(payload["allowed_routes"]), 4)
        cur = await db.conn().execute("SELECT count(*) AS n FROM orders")
        self.assertEqual((await cur.fetchone())["n"], 0)

    async def test_api_checks_user_answers_inside_cart(self) -> None:
        request = _JsonRequest({
            "contact": "client@example.test",
            "consent": True,
            "consent_doc": config.ORDER_CONSENT_DOC,
            "topic": "Комплексная заявка",
            "cart": {"items": [{
                "answers": {"comment": "Пройдите тест в Moodle за меня"},
            }]},
        })
        with patch.object(webapp, "_rate_ok", return_value=True):
            response = await webapp.orders_create(request)
        payload = json.loads(response.body)
        self.assertEqual(response.status, 422)
        self.assertEqual(payload["reason"], "test_or_lms_impersonation")
        cur = await db.conn().execute("SELECT count(*) AS n FROM orders")
        self.assertEqual((await cur.fetchone())["n"], 0)
