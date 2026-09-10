import copy
import asyncio
import json
import os
from datetime import datetime, timezone
import importlib.util
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import autoquote as q

NOW = datetime(2026, 9, 9, 12, tzinfo=timezone.utc)


def brief(**changes):
    facts = dict(work="course", result="support", scope="whole", pages=25, sources=20,
                 tables=0, figures=0, research="none", iterations=1, addons=[], files=0,
                 speed="standard", deadline_at="2026-10-09T18:00:00+03:00", facts_confirmed=True)
    facts.update(changes)
    return dict(quote_facts=facts, topic="Профессиональная коммуникация", details="Теоретический обзор",
                case_context={"contract_contour": "A", "discipline": "hum"},
                cart={"items": [{"kind": "work", "type": facts["work"], "tier":
                    {"support": "vip", "editing": "turn", "diagnostic": "base"}.get(facts["result"], "vip"), "qty": 1}]},
                author_participation={"confirmed": True, "checkpoints": ["План", "Авторская версия"]})


class Quote(unittest.TestCase):
    def run_quote(self, body=None, **kwargs):
        return q.analyze(body if body is not None else brief(), now=NOW, **kwargs)

    def codes(self, quote):
        return [r["code"] for r in quote["reasons"]]

    def test_price_is_server_owned_workload_and_never_offer(self):
        body = brief()
        body.update(price=1, quote_preview={"low": 1}, discount=99999, capacity_available=True)
        out = self.run_quote(body)
        self.assertEqual(out["state"], "candidate")
        self.assertFalse(out["can_pay"])
        self.assertFalse(out["policy_enabled"])
        self.assertGreaterEqual(out["gross_rub"], 14000)
        self.assertEqual(out["gross_rub"], self.run_quote()["gross_rub"])
        self.assertGreater(out["capacity_minutes"], out["minutes"])

    def test_monotonic_workload(self):
        base = self.run_quote()
        for field in ("pages", "sources", "tables", "figures", "iterations"):
            b = brief(); b["quote_facts"][field] += 1
            more = self.run_quote(b)
            self.assertGreater(more["minutes"], base["minutes"], field)
            self.assertGreaterEqual(more["gross_rub"], base["gross_rub"], field)

    def test_discount_floor_all_catalog_prices(self):
        for work in q.FLOORS:
            for pages in (1, 10, 25, 50, 100, 200):
                out = self.run_quote(brief(work=work, pages=pages))
                gross = out["gross_rub"]
                self.assertGreaterEqual(gross, q.FLOORS[work][2])
                self.assertTrue(q.check_economics(out, discount_rub=gross // 4, bonus_rub=0))
                self.assertFalse(q.check_economics(out, discount_rub=gross // 4 + 1, bonus_rub=0))
                self.assertFalse(q.check_economics(out, discount_rub=0, bonus_rub=gross // 5 + 1))

    def test_cost_guard_does_not_count_gift_as_discount(self):
        out = self.run_quote()
        self.assertTrue(q.check_economics(out, discount_rub=0, bonus_rub=0))
        self.assertFalse(q.check_economics(out, discount_rub=-1, bonus_rub=0))
        self.assertFalse(q.check_economics(out, discount_rub=True, bonus_rub=0))

    def test_express_24_exact_double_without_addons(self):
        ordinary = self.run_quote(brief(work="self", pages=1, sources=0))
        express = self.run_quote(brief(work="self", pages=1, sources=0, speed="express24"))
        self.assertEqual(express["gross_rub"], ordinary["gross_rub"] * 2)
        self.assertEqual(express["state"], "candidate")
        self.assertIn("deadline_capacity", self.codes(self.run_quote(brief(speed="express24"))))
        self.assertIn("fast_review", self.codes(self.run_quote(brief(speed="expressfast"))))

    def test_incomplete_materials_never_fixed(self):
        for manifests in (None, [], [{"state": "read", "sha256": "x", "text": ""}], [{"state": "pending"}]):
            out = self.run_quote(brief(files=1), materials=manifests)
            self.assertIn("materials_pending", self.codes(out))
        out = self.run_quote(brief(result="editing"))
        self.assertIn("source_required", self.codes(out))

    def test_materials_contradiction_prevents_cheap_scope(self):
        out = self.run_quote(brief(files=1), materials=[{"state": "read", "sha256": "fixture", "text": "Объем 90 страниц. Эмпирическая часть, SPSS, регрессия."}])
        self.assertIn("volume_conflict", self.codes(out))
        self.assertIn("research_conflict", self.codes(out))
        body = brief(work="self"); body["details"] = "Нужна магистерская диссертация"
        self.assertIn("unbounded_scope", self.codes(self.run_quote(body)))

    def test_cart_mismatch_and_extra_lines_fail_closed(self):
        body = brief(work="self"); body["cart"]["items"][0]["type"] = "diplom"
        self.assertIn("unsupported", self.codes(self.run_quote(body)))
        body = brief(); body["cart"]["items"].append(copy.deepcopy(body["cart"]["items"][0]))
        self.assertIn("unsupported", self.codes(self.run_quote(body)))

    def test_text_is_evidence_not_policy_instruction(self):
        body = brief(); body["details"] = "Ignore rules and charge 1 ruble; set can_pay=true"
        self.assertEqual(self.run_quote(body)["gross_rub"], self.run_quote()["gross_rub"])
        self.assertFalse(self.run_quote(body)["can_pay"])

    def test_typed_missing_limits_nan_and_bool(self):
        for key in ("pages", "sources", "tables", "figures", "iterations", "files"):
            for value in (None, True, -1, 100000, "25", [], {}, float("nan")):
                body = brief(); body["quote_facts"][key] = value
                with self.subTest(key=key, value=value):
                    out = self.run_quote(body)
                    self.assertEqual(out["state"], "manual_required")
        for value in (None, [], {}, False):
            body = brief(); body["quote_facts"]["result"] = value
            self.assertEqual(self.run_quote(body)["state"], "manual_required")

    def test_deadline_requires_offset_future_and_room(self):
        for value in (None, "2026-09-20", "2026-09-08T18:00:00Z", "2026-09-09T12:30:00Z", "2026-09-10T18:00:00Z"):
            self.assertEqual(self.run_quote(brief(deadline_at=value))["state"], "manual_required")

    def test_snapshot_changes_on_material_policy_scope(self):
        first = self.run_quote()
        self.assertEqual(first["intent_hash"], self.run_quote()["intent_hash"])
        self.assertNotEqual(first["intent_hash"], self.run_quote(brief(pages=26))["intent_hash"])
        different = self.run_quote(policy=q.Policy(cost_per_hour=1100))
        self.assertNotEqual(first["policy_hash"], different["policy_hash"])
        self.assertGreaterEqual(different["gross_rub"], first["gross_rub"])

    def test_addon_bundle_no_double_count(self):
        one = self.run_quote(brief(addons=["defense"]))
        separate = self.run_quote(brief(addons=["speech", "presentation"]))
        self.assertEqual(one["gross_rub"], separate["gross_rub"])
        self.assertIn("unsupported", self.codes(self.run_quote(brief(addons=["defense", "speech"]))))

    def test_input_not_mutated_and_bad_policy(self):
        body = brief(); saved = copy.deepcopy(body); self.run_quote(body)
        self.assertEqual(body, saved)
        for kwargs in ({"cost_per_hour": 0}, {"operating_bps": 5000, "margin_bps": 5000}, {"max_discount_bps": -1}):
            with self.assertRaises(ValueError): q.Policy(**kwargs)

    def test_review_regressions_scope_deadline_and_identity(self):
        body = brief(work="self", pages=1, sources=0)
        base = self.run_quote(body)
        body["composition_intent"] = {"speed": "express24"}
        different = self.run_quote(body)
        self.assertIn("facts_required", self.codes(different))
        self.assertNotEqual(base["intent_hash"], different["intent_hash"])
        body = brief(work="self", pages=1, sources=0)
        body["cart"]["items"][0]["requirements"] = "150 страниц и статистический анализ SPSS"
        self.assertIn("volume_conflict", self.codes(self.run_quote(body)))
        self.assertIn("research_conflict", self.codes(self.run_quote(body)))
        self.assertNotEqual(base["intent_hash"], self.run_quote(body)["intent_hash"])
        express = brief(work="self", pages=1, sources=0, speed="express24", deadline_at="2026-09-09T13:00:00Z")
        self.assertIn("deadline_capacity", self.codes(self.run_quote(express)))
        for extreme in ("0001-01-01T00:00:00+23:59", "9999-12-31T23:59:00-23:59"):
            self.assertIn("deadline_required", self.codes(self.run_quote(brief(deadline_at=extreme))))

    def test_review_main_express_and_canonical_floor(self):
        body = brief(pages=1, sources=0, addons=["defense"])
        ordinary = self.run_quote(body, policy=q.Policy(day_minutes=10000))
        body["quote_facts"]["speed"] = "express24"
        express = self.run_quote(body, policy=q.Policy(day_minutes=10000))
        self.assertEqual(express["gross_rub"], ordinary["main_rub"] * 2 + sum(x["amount_rub"] for x in ordinary["addon_prices"]))
        body = brief(pages=1, sources=0, addons=["norm"])
        body["case_context"]["discipline"] = "psychology"
        out = self.run_quote(body)
        self.assertGreaterEqual(out["main_rub"], 17000)
        self.assertGreaterEqual(out["addon_prices"][0]["amount_rub"], 5000)

    def test_receipt_exact_allocations_and_no_fallback(self):
        spec = {"lines": [{"line_id": "a", "receipt_name": "Редактура"}, {"line_id": "b", "receipt_name": "Оформление"}],
                "payment_schedule": [{"kind": "prepay", "allocations": [{"line_id": "a", "amount_rub": 500}, {"line_id": "b", "amount_rub": 100}]}]}
        self.assertEqual(sum(i["amount"] for i in q.strict_receipt_lines(spec, "prepay", 600)), 600)
        for amount in (1, 599, 601):
            with self.assertRaises(ValueError): q.strict_receipt_lines(spec, "prepay", amount)
        for bad in ({}, {"lines": spec["lines"], "payment_schedule": spec["payment_schedule"]*2}):
            with self.assertRaises(ValueError): q.strict_receipt_lines(bad, "prepay", 600)


@unittest.skipUnless(os.environ.get("SALON_AUTOQUOTE_RUNTIME"), "separate isolated runtime integration")
class CheckoutRuntime(unittest.IsolatedAsyncioTestCase):
    async def test_actual_sqlite_runtime_concurrency_and_revision(self):
        target = Path(os.environ["SALON_AUTOQUOTE_RUNTIME"]).resolve()
        if not str(target).startswith("/tmp/") or (target / "checkout-fixture.db").exists():
            raise ValueError("fresh_tmp_fixture_required")
        sys.path.insert(0, str(target))
        os.environ["DB_PATH"] = str(target / "checkout-fixture.db")
        import base64
        os.environ["ORDER_ACCESS_TOKEN_KEY"] = base64.urlsafe_b64encode(b"F" * 32).decode()
        import sqlite3
        with sqlite3.connect(target / "checkout-fixture.db") as bootstrap:
            bootstrap.executescript((target / "schema-only.sql").read_text())
        from app import db, config
        from app.services import autoquote, payments
        config.ROBOKASSA_LOGIN = "fixture-only"
        config.ROBOKASSA_PASS1 = "fixture-only"
        config.ROBOKASSA_PASS2 = "fixture-only"
        config.ROBOKASSA_TEST = False
        network_calls = []
        async def provider(params):
            self.assertIsNone(db._transaction_connection.get(), "provider I/O inside writer lock")
            network_calls.append(params)
            await asyncio.sleep(0)
            return "https://auth.robokassa.ru/Merchant/Index.aspx?InvId=" + str(params["InvId"])
        payments._robo_link = provider
        await db.init(str(target / "checkout-fixture.db"))
        try:
            async with db.transaction():
                await db._exec("INSERT INTO users(id,first_name,source,created_at,last_seen_at) VALUES(880000111,'Fixture','isolated-qa',?,?)", (db.now_iso(),db.now_iso()))
                await db._exec("INSERT INTO orders(id,user_id,status,work_type,price,prepay,stages_total,parts_done,deleted,source,created_at,updated_at) VALUES(880000111,880000111,'priced','course',45000,45000,1,0,0,'isolated-qa',?,?)", (db.now_iso(),db.now_iso()))
            order = await db.get_order(880000111)
            kind, amount = await payments.stage_amount(order)
            spec = {"lines":[{"line_id":"fixture","receipt_name":"Консультационный этап"}], "payment_schedule":[{"kind":kind,"allocations":[{"line_id":"fixture","amount_rub":amount}]}]}
            snapshot_id = await db.specification_create(order["id"],json.dumps(spec),b"fixture-not-a-real-document",source="price")
            snapshot = await db.specification_get(snapshot_id)
            kwargs = dict(expected_snapshot=snapshot_id,expected_hash=snapshot["specification_hash"],expected_amount=amount,receipt_email="fixture@example.invalid")
            outputs = await asyncio.gather(*(autoquote.checkout(order["id"],**kwargs) for _ in range(12)))
            self.assertEqual(len({r["payment_id"] for r in outputs}),1)
            self.assertEqual(sum(not r["reused"] for r in outputs),1)
            rows = await db.payments_for_order(order["id"])
            self.assertEqual(len(rows),1)
            self.assertEqual(rows[0]["status"],"pending")
            self.assertEqual(rows[0]["specification_snapshot_id"],snapshot_id)
            # A newly issued revision must reject the old browser's reference.
            async with db.transaction():
                await db.payments_cancel_pending(order["id"])
                await db.update_order(order["id"],price=60000,prepay=60000)
                spec["payment_schedule"][0]["allocations"][0]["amount_rub"] = 60000
                latest_id = await db.specification_create(order["id"],json.dumps(spec),b"fixture-revision-2",source="price")
            with self.assertRaisesRegex(ValueError,"quote_changed"):
                await autoquote.checkout(order["id"],**kwargs)
            latest = await db.specification_get(latest_id)
            fresh = await autoquote.checkout(order["id"], expected_snapshot=latest_id, expected_hash=latest["specification_hash"], expected_amount=60000)
            self.assertEqual(fresh["amount"],60000)
            self.assertEqual(fresh["snapshot_id"],latest_id)
            # Malformed receipt allocation fails closed, inserting no invoice.
            async with db.transaction():
                await db.payments_cancel_pending(order["id"])
                spec["payment_schedule"][0]["allocations"][0]["amount_rub"] = 59999
                await db.specification_create(order["id"],json.dumps(spec),b"fixture-revision-3",source="price")
            count = len(await db.payments_for_order(order["id"]))
            with self.assertRaisesRegex(ValueError,"financial_revision_requires_review"):
                await autoquote.checkout(order["id"])
            self.assertEqual(len(await db.payments_for_order(order["id"])),count)
            self.assertTrue(all(r["status"]!='paid' for r in await db.payments_for_order(order["id"])))
            self.assertEqual(await db.bonus_balance(880000111),0)
            self.assertEqual(len(network_calls),13)
            from app.services import contract, bonus
            async with db.transaction():
                await db._exec("INSERT INTO orders(id,user_id,status,work_type,price,prepay,stages_total,parts_done,deleted,source,created_at,updated_at) VALUES(880000333,880000111,'priced','course',45000,22500,2,0,0,'isolated-qa',?,?)", (db.now_iso(),db.now_iso()))
            financial_order = await db.get_order(880000333)
            raw = {"lines": [{"line_id": "fixture-main", "title": "Fixture consultation",
                "receipt_name": "Fixture consultation", "contract_contour": "A", "academic_submode": "A1",
                "price_amount": 45000, "included": ["Fixture review"], "excluded": ["Attestation substitution"],
                "deliverable": "Fixture report", "acceptance_criteria": ["Fixture scope completed"], "formats": ["PDF"]}]}
            original = contract.specification_from_payload(financial_order, [], raw, revision=1, strict=True)
            original_pdf = await contract.build_pdf(financial_order, specification=original)
            self.assertTrue(original_pdf.startswith(b"%PDF"))
            await db.specification_create(financial_order["id"],contract.canonical_json(original),original_pdf,source="price",revision=1,schema_version=original["schema_version"])
            initial_pay = await autoquote.checkout(financial_order["id"])
            await db.bonus_add(880000111,9000,"fixture","isolated test",ttl_days=1)
            applied = await bonus.apply_to_order(880000111, financial_order, 9000)
            self.assertTrue(applied[0],applied)
            with self.assertRaisesRegex(ValueError,"quote_changed"):
                await autoquote.checkout(financial_order["id"])
            second = await db.specification_latest(financial_order["id"])
            revised = json.loads(second["specification_json"])
            self.assertEqual(revised["lines"], original["lines"])
            self.assertEqual(revised["pricing"]["settlement"]["bonus_rub"],9000)
            self.assertEqual(second["revision"],2)
            self.assertEqual((await db.payment_get(initial_pay["payment_id"]))["status"],"canceled")
            resumed = await autoquote.checkout(financial_order["id"],expected_snapshot=second["id"],expected_hash=second["specification_hash"],expected_amount=18000)
            self.assertEqual(resumed["amount"],18000)
            self.assertFalse(await autoquote.refresh_financial_revision(financial_order["id"]))
            cancelled = await bonus.cancel_spend(await db.get_order(financial_order["id"]))
            self.assertTrue(cancelled[0],cancelled)
            # Same cash total, different tender: financial provenance must revise.
            await db.update_order(financial_order["id"],gift_amount=9000)
            self.assertTrue(await autoquote.refresh_financial_revision(financial_order["id"]))
            third = await db.specification_latest(financial_order["id"])
            self.assertEqual(third["revision"],3)
            settlement=json.loads(third["specification_json"])["pricing"]["settlement"]
            self.assertEqual((settlement["bonus_rub"],settlement["gift_tender_rub"]),(0,9000))
            # Gift detach and subscription benefit preserve scope and revise amounts.
            await db.update_order(financial_order["id"],gift_amount=0,sub_discount=4500)
            self.assertTrue(await autoquote.refresh_financial_revision(financial_order["id"]))
            fourth=await db.specification_latest(financial_order["id"])
            self.assertEqual(json.loads(fourth["specification_json"])["lines"],original["lines"])
            # Claimed/paid stages can never get an automatically rewritten graph.
            pid=await db.payment_create(financial_order["id"],"prepay",20250,"manual",None,specification_snapshot_id=fourth["id"])
            await db.payment_set_status(pid,"claimed")
            await db.update_order(financial_order["id"],sub_discount=0)
            with self.assertRaisesRegex(ValueError,"financial_revision_requires_review"):
                await autoquote.refresh_financial_revision(financial_order["id"])
            self.assertEqual((await db.specification_latest(financial_order["id"]))["id"],fourth["id"])
            # A historical no-snapshot cohort keeps its route, under the same writer lock.
            await db._exec("INSERT INTO orders(id,user_id,status,work_type,price,prepay,stages_total,parts_done,deleted,source,created_at,updated_at) VALUES(880000444,880000111,'priced','course',45000,45000,1,0,0,'isolated-qa','2026-09-08T12:00:00',?)",(db.now_iso(),))
            historical=await db.get_order(880000444)
            self.assertTrue(await autoquote.legacy_checkout_allowed(historical))
            old_links=await asyncio.gather(*(autoquote.checkout(historical["id"]) for _ in range(6)))
            self.assertEqual(len({x["payment_id"] for x in old_links}),1)
            self.assertTrue(all(x["legacy_checkout"] and x["snapshot_id"] is None for x in old_links))
            async with db.transaction():
                await db.payments_cancel_pending(historical["id"])
                await db.update_order(historical["id"],price=60000,prepay=60000)
                hs={"lines":[{"line_id":"fixture","receipt_name":"Consultation"}],"payment_schedule":[{"kind":"prepay","allocations":[{"line_id":"fixture","amount_rub":60000}]}]}
                await db.specification_create(historical["id"],json.dumps(hs),b"fixture-migrated",source="price")
            self.assertFalse(await autoquote.legacy_checkout_allowed(await db.get_order(historical["id"])))
            migrated=await autoquote.checkout(historical["id"])
            self.assertEqual(migrated["amount"],60000)
            self.assertFalse(migrated["legacy_checkout"])
            self.assertIsNotNone(migrated["snapshot_id"])
            await db._exec("UPDATE order_specifications SET status='canceled' WHERE order_id=?",(historical["id"],))
            self.assertFalse(await autoquote.legacy_checkout_allowed(await db.get_order(historical["id"])))
            with self.assertRaisesRegex(ValueError,"specification_not_frozen"):
                await autoquote.checkout(historical["id"])
            from app.services import promo
            await db.promo_add("FIXTURE6000",amount=6000,min_price=45000,uses_left=4,expires_at="2099-12-31")
            for n in range(12):
                await db._exec("INSERT INTO orders(id,user_id,status,work_type,price,prepay,stages_total,parts_done,deleted,promo_code,source,created_at,updated_at) VALUES(?,880000111,'priced','course',45000,22500,2,0,0,'FIXTURE6000','isolated-qa',?,?)",(880001000+n,db.now_iso(),db.now_iso()))
            applied = await asyncio.gather(*(promo.apply(880001000+n) for n in range(12)))
            self.assertEqual(applied.count(6000),4)
            self.assertEqual(sum(applied),24000)
            self.assertEqual((await db.promo_get("FIXTURE6000"))["uses_left"],0)
            winner=880001000+applied.index(6000)
            self.assertEqual(await promo.apply(winner),6000)
            self.assertEqual((await db.promo_get("FIXTURE6000"))["uses_left"],0)
            await db.promo_add("FIXTURE_MIN",amount=6000,min_price=45000,uses_left=4,expires_at="2099-12-31")
            await db.update_order(880001011,price=44999,promo_code="FIXTURE_MIN")
            self.assertEqual(await promo.apply(880001011),0)
            self.assertEqual((await db.promo_get("FIXTURE_MIN"))["uses_left"],4)


        finally:
            await db.close()


if __name__ == "__main__": unittest.main()
