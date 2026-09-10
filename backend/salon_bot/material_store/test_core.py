import concurrent.futures
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("store_core", Path(__file__).with_name("core.py"))
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


class CommerceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.now = 1_789_000_000
        self.store = core.Store(Path(self.tmp.name) / "store.sqlite3", lambda: self.now)
        self.product = dict(sku="test-material", version="1", title="Original sample", receipt_name="Учебный материал",
                            price=1000, licences=5, files={"pdf": {"path": "private/a.pdf", "sha256": "abc"}}, published=True)
        self.store.sync_catalog([self.product])

    def tearDown(self):
        self.tmp.cleanup()

    def buy(self, uid=1, sku="test-material", key=None, **kw):
        q = self.store.quote(uid, sku, kw.get("use_bonus", False), kw.get("coupon", ""))
        return self.store.checkout(uid, sku, key or f"request_{uid:020d}", q["cash"], **kw)

    def test_last_licence_concurrent(self):
        other = dict(self.product, sku="one-copy", licences=1)
        self.store.sync_catalog([self.product, other])
        def attempt(uid):
            try:
                return self.buy(uid, "one-copy")["id"]
            except core.StoreError as e:
                return str(e)
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(attempt, range(1, 9)))
        self.assertEqual(sum(isinstance(x, int) for x in results), 1)
        self.assertEqual(results.count("sold_out"), 7)

    def test_same_checkout_is_idempotent(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            purchases = list(pool.map(lambda _: self.buy(), range(5)))
        self.assertEqual(len({p["id"] for p in purchases}), 1)
        self.assertEqual(self.store.catalog()[0]["reserved"], 1)

    def test_key_conflicting_payload_rejected(self):
        self.buy()
        with self.assertRaisesRegex(core.StoreError, "idempotency_conflict"):
            self.buy(coupon="СЕМЕСТР")

    def test_price_change_rejected_before_hold(self):
        with self.assertRaisesRegex(core.StoreError, "quote_changed"):
            self.store.checkout(1, "test-material", "request_00000000000000000001", 999)
        self.assertEqual(self.store.catalog()[0]["available"], 5)

    def test_wrong_amount_does_not_deliver(self):
        p = self.buy()
        with self.assertRaisesRegex(core.StoreError, "payment_mismatch"):
            self.store.confirm(p["id"], 999)
        self.assertFalse(self.store.account(1)["purchases"][0]["download_available"])

    def test_parallel_callbacks_award_once(self):
        p = self.buy()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(lambda _: self.store.confirm(p["id"], p["cash"]), range(8)))
        self.assertEqual(self.store.account(1)["balance"], 50)
        self.assertEqual(len(self.store.account(1)["achievements"]), 1)
        self.assertEqual(self.store.catalog()[0]["sold"], 1)
        with self.store.read() as c:
            self.assertEqual(c.execute("SELECT count(*) FROM outbox").fetchone()[0], 1)

    def test_access_is_owner_and_payment_bound(self):
        p = self.buy()
        with self.assertRaisesRegex(core.StoreError, "payment_required"):
            self.store.private_file(p["id"], 1, "pdf")
        self.store.confirm(p["id"], p["cash"])
        with self.assertRaisesRegex(core.StoreError, "not_found"):
            self.store.private_file(p["id"], 2, "pdf")
        self.assertEqual(self.store.private_file(p["id"], 1, "pdf")["sha256"], "abc")

    def test_expiry_does_not_release_without_provider(self):
        p = self.buy()
        self.now += 1000
        with self.assertRaisesRegex(core.StoreError, "unsafe_release"):
            self.store.release(p["id"], "unknown")
        self.assertEqual(self.store.catalog()[0]["reserved"], 1)

    def test_expiry_and_late_payment_allocates_remaining(self):
        p = self.buy()
        self.now += 1000
        self.store.release(p["id"], "cancelled")
        self.assertEqual(self.store.confirm(p["id"], p["cash"])["state"], "paid")
        self.assertEqual(self.store.catalog()[0]["sold"], 1)

    def test_late_payment_sold_out_is_recorded_not_overbooked(self):
        self.store.sync_catalog([dict(self.product, sku="one-copy", licences=1)])
        p = self.buy(1, "one-copy")
        self.now += 1000
        self.store.release(p["id"], "cancelled")
        newer = self.buy(2, "one-copy")
        self.store.confirm(newer["id"], newer["cash"])
        self.assertEqual(self.store.confirm(p["id"], p["cash"])["state"], "paid_unallocated")
        self.assertEqual(self.store.account(1)["balance"], 0)
        self.assertEqual(self.store.catalog()[0]["sold"], 1)
        self.store.refund_confirmed(p["id"], 1000)
        self.assertEqual(self.store.get(p["id"])["state"], "refunded")

    def test_expired_same_user_new_hold_late_callback_does_not_conflict(self):
        old = self.buy()
        self.now += 1000
        self.store.release(old["id"], "cancelled")
        newer = self.buy(key="second_request_00000000001")
        self.store.confirm(old["id"], old["cash"])
        self.assertEqual(self.store.confirm(newer["id"], newer["cash"])["state"], "paid_unallocated")

    def test_bonus_double_spend_and_discount_cap(self):
        self.store.sync_catalog([self.product, dict(self.product, sku="second-material")])
        with self.store.tx() as c:
            c.execute("INSERT INTO wallets VALUES(1,70,0)")
        one = self.buy(use_bonus=True)
        two = self.buy(sku="second-material", key="second_request_00000000001", use_bonus=True)
        self.assertEqual(one["bonus"]+two["bonus"], 70)
        for p in [one, two]:
            self.assertGreaterEqual(p["cash"], p["price"]*90//100)

    def test_coupon_bonus_combined_cap(self):
        with self.store.tx() as c:
            c.execute("INSERT INTO wallets VALUES(1,900,0)")
        p = self.buy(use_bonus=True, coupon="СЕМЕСТР")
        self.assertEqual((p["discount"], p["bonus"], p["cash"]), (50, 50, 900))
        self.store.confirm(p["id"], 900)
        self.assertEqual(self.store.get(p["id"])["reward"], 45)

    def test_refund_replay_partial_full_and_access(self):
        with self.store.tx() as c:
            c.execute("INSERT INTO wallets VALUES(1,100,0)")
        p = self.buy(use_bonus=True)
        self.store.confirm(p["id"], 900)
        self.store.refund_confirmed(p["id"], 450)
        self.assertEqual(self.store.account(1)["balance"], 73)
        self.assertFalse(self.store.refund_confirmed(p["id"], 450))
        self.store.refund_confirmed(p["id"], 900)
        self.assertEqual(self.store.account(1)["balance"], 100)
        self.assertEqual(self.store.catalog()[0]["available"], 4)
        with self.assertRaisesRegex(core.StoreError, "payment_required"):
            self.store.private_file(p["id"], 1, "pdf")
        self.store.confirm(p["id"], 900)
        self.assertEqual(self.store.get(p["id"])["state"], "refunded")

    def test_refund_after_reward_spent_creates_debt(self):
        self.store.sync_catalog([self.product, dict(self.product, sku="second-material")])
        first = self.buy()
        self.store.confirm(first["id"], 1000)
        second = self.buy(sku="second-material", key="second_request_00000000001", use_bonus=True)
        self.store.confirm(second["id"], second["cash"])
        self.store.refund_confirmed(first["id"], 1000)
        with self.store.read() as c:
            self.assertEqual(c.execute("SELECT balance FROM wallets WHERE user_id=1").fetchone()[0], -22)
        self.assertEqual(self.store.account(1)["balance"], 0)

    def test_immutable_version_and_snapshot(self):
        p = self.buy()
        with self.assertRaisesRegex(core.StoreError, "immutable_version_changed"):
            self.store.sync_catalog([dict(self.product, price=1200)])
        self.store.sync_catalog([dict(self.product, version="2", price=1200)])
        self.store.confirm(p["id"], 1000)
        self.assertEqual(json.loads(self.store.get(p["id"])["snapshot"])["version"], "1")

    def test_worker_recovers_after_commit_and_restart(self):
        p = self.buy()
        self.store.confirm(p["id"], 1000)
        restarted = core.Store(self.store.path, lambda: self.now)
        job = restarted.claim_outbox()
        self.assertEqual(job["purchase_id"], p["id"])
        self.assertIsNone(restarted.claim_outbox())
        self.now += 301
        self.assertIsNotNone(restarted.claim_outbox())
        restarted.finish_outbox(p["id"], True, "email")
        self.assertIsNone(restarted.claim_outbox())

    def test_private_paths_not_in_public_responses(self):
        p = self.buy()
        public = json.dumps([self.store.catalog(), self.store.account(1)])
        self.assertNotIn("private/a.pdf", public)
        self.assertNotIn("sha256", public)
        self.assertNotIn("snapshot", public)


if __name__ == "__main__":
    unittest.main()
