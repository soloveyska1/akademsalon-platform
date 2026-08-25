from __future__ import annotations

import contextlib
import importlib.util
import sqlite3
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
INSTALLER = ROOT / "backend" / "salon_bot" / "install_economic_safety.py"


def load_installer():
    spec = importlib.util.spec_from_file_location("install_economic_safety", INSTALLER)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


SCHEMA = """
CREATE TABLE settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE users(
  id INTEGER PRIMARY KEY,
  referrer_id INTEGER,
  created_at TEXT NOT NULL
);
CREATE TABLE orders(
  id INTEGER PRIMARY KEY,
  user_id INTEGER,
  status TEXT,
  work_type TEXT,
  price INTEGER,
  bonus_spent INTEGER DEFAULT 0,
  sub_discount INTEGER DEFAULT 0,
  promo_discount INTEGER DEFAULT 0,
  gift_amount INTEGER DEFAULT 0,
  parts_done INTEGER DEFAULT 0,
  stages_total INTEGER DEFAULT 1,
  deleted INTEGER DEFAULT 0
);
CREATE TABLE payments(
  id INTEGER PRIMARY KEY,
  order_id INTEGER,
  kind TEXT,
  amount INTEGER,
  method TEXT,
  status TEXT,
  paid_at TEXT
);
CREATE TABLE deposits(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  bonus_pct INTEGER NOT NULL,
  bonus_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  via TEXT,
  paid_at TEXT,
  pay_method TEXT,
  refunded_at TEXT,
  refund_note TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE deposit_ledger(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  kind TEXT NOT NULL,
  deposit_id INTEGER,
  order_id INTEGER,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE bonus_ledger(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  kind TEXT NOT NULL,
  note TEXT,
  order_id INTEGER,
  consumed INTEGER DEFAULT 0,
  warned INTEGER DEFAULT 0,
  expires_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE payment_receipts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  inv_id INTEGER NOT NULL,
  payment_status TEXT,
  UNIQUE(provider,inv_id)
);
"""


@contextlib.contextmanager
def connection(path: Path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


class DepositV2EconomicsTests(unittest.TestCase):
    def setUp(self):
        self.module = load_installer()

    def test_cumulative_vesting_cannot_be_increased_by_splitting(self):
        whole = self.module.gross_vest_delta(0, 50_000, 1200)
        split = (
            self.module.gross_vest_delta(0, 20_000, 1200)
            + self.module.gross_vest_delta(20_000, 50_000, 1200)
        )
        self.assertEqual(whole, 6_000)
        self.assertEqual(split, whole)

    def test_vesting_retiers_by_principal_actually_used(self):
        first_20 = self.module.gross_vest_delta(0, 20_000, 1500)
        next_10 = self.module.gross_vest_delta(20_000, 30_000, 1500)
        through_45 = self.module.gross_vest_delta(0, 45_000, 1500)
        through_60 = self.module.gross_vest_delta(0, 60_000, 1500)
        capped_topup = self.module.gross_vest_delta(0, 60_000, 1200)
        self.assertEqual(first_20, 1_600)
        self.assertEqual(next_10, 1_400)
        self.assertEqual(through_45, 5_400)
        self.assertEqual(through_60, 9_000)
        self.assertEqual(capped_topup, 7_200)

    def test_best_of_never_adds_cashback_and_deposit_reward(self):
        pro_over_low_tier = self.module.reward_plan(
            paid_total=20_000, deposit_paid=20_000,
            deposit_gross=1_600, cashback_pct=10,
        )
        high_tier_over_cashback = self.module.reward_plan(
            paid_total=60_000, deposit_paid=60_000,
            deposit_gross=9_000, cashback_pct=5,
        )
        self.assertEqual(pro_over_low_tier, {
            "normal": 2_000, "deposit_variant": 1_600,
            "target": 2_000, "uplift": 0,
        })
        self.assertEqual(high_tier_over_cashback, {
            "normal": 3_000, "deposit_variant": 9_000,
            "target": 9_000, "uplift": 6_000,
        })

    def test_lot_best_of_is_cumulative_across_split_orders(self):
        first = self.module.lot_reward_step(
            old_principal=0, old_cashback=0,
            added_principal=20_000, added_cashback=2_000, rate_bp=1500,
        )
        second = self.module.lot_reward_step(
            old_principal=20_000, old_cashback=2_000,
            added_principal=10_000, added_cashback=1_000, rate_bp=1500,
        )
        self.assertEqual((first["new_target"], first["delta"]), (2_000, 2_000))
        self.assertEqual((second["new_target"], second["delta"]), (3_000, 1_000))
        self.assertEqual(first["delta"] + second["delta"], 3_000)

    def test_usage_threshold_boundaries_are_exact(self):
        cases = {
            29_999: 2_399,
            30_000: 3_000,
            44_999: 4_499,
            45_000: 5_400,
            59_999: 7_199,
            60_000: 9_000,
        }
        for principal, expected in cases.items():
            with self.subTest(principal=principal):
                self.assertEqual(
                    self.module.gross_vest_delta(0, principal, 1500), expected
                )

    def test_refund_retiers_on_net_principal_without_threshold_artifact(self):
        pro = self.module.lot_reward_step(
            old_principal=0, old_cashback=0,
            added_principal=1_000, added_cashback=100, rate_bp=1500,
        )
        basic = self.module.lot_reward_step(
            old_principal=0, old_cashback=0,
            added_principal=1_000, added_cashback=50, rate_bp=1500,
        )
        self.assertEqual((pro["new_gross"], pro["new_target"]), (80, 100))
        self.assertEqual((basic["new_gross"], basic["new_target"]), (80, 80))
        self.assertEqual(
            self.module.gross_vest_delta(0, 60_000, 1500) - pro["new_target"],
            8_900,
        )

    def test_runtime_asset_and_generated_deposit_wrapper_compile(self):
        runtime = self.module.runtime_source()
        compile(runtime, "economic_v2.py", "exec")
        compile(self.module.DEPOSIT_WRAPPER, "deposit.py", "exec")
        self.assertEqual(
            self.module.sha256_text(runtime), self.module.RUNTIME_AFTER
        )
        self.assertIn("pay_id=pay_id, allow_create=False", runtime)
        self.assertIn("principal_refund_reserved", runtime)
        self.assertIn("economic_order_reward_refunds", runtime)
        self.assertIn("restore_order_after_refund", runtime)
        self.assertIn("allocation_net_after_refund", runtime)
        self.assertIn("reverse_rewards=False", self.module.BONUS_CANCEL_RESTORE_V2)
        self.assertEqual(runtime.count("if subs.is_sub_order(order):"), 2)
        self.assertIn("subscription_excluded", runtime)
        self.assertNotIn("money_back - spent_bonus", runtime)


class DepositV2DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.module = load_installer()
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "salon.db"
        with connection(self.db_path) as conn:
            conn.executescript(SCHEMA)
            conn.execute(
                "INSERT INTO users(id,referrer_id,created_at) VALUES"
                "(1,NULL,'2026-08-01'),(2,1,'2026-08-24')"
            )

    def tearDown(self):
        self.tmp.cleanup()

    def _enable(self):
        first = self.module.install_database_v2(self.db_path)
        self.assertTrue(first["ok"])
        enabled = self.module.set_database_state(self.db_path, enabled=True)
        self.assertTrue(enabled["ok"])

    def _new_pending(self, amount=60_000, pct=15):
        with connection(self.db_path) as conn:
            cur = conn.execute(
                "INSERT INTO deposits(user_id,amount,bonus_pct,bonus_amount,status,"
                "via,created_at) VALUES(?,?,?,?, 'pending','test','2026-09-01')",
                (2, amount, pct, amount * pct // 100),
            )
            return int(cur.lastrowid)

    def _activate(self, dep_id: int):
        with connection(self.db_path) as conn:
            dep = conn.execute("SELECT * FROM deposits WHERE id=?", (dep_id,)).fetchone()
            cur = conn.execute(
                "INSERT INTO deposit_v2_ops(op_key,kind,state,deposit_id,user_id,"
                "amount,created_at,updated_at) VALUES(?, 'activate','prepared',?,?,?,?,?)",
                (f"activate:{dep_id}", dep_id, dep["user_id"], dep["amount"],
                 "2026-09-01", "2026-09-01"),
            )
            op_id = int(cur.lastrowid)
            conn.execute(
                "UPDATE deposits SET status='active' WHERE id=? AND status='pending'",
                (dep_id,),
            )
            conn.execute(
                "UPDATE deposit_v2_lots SET principal_funded=principal_total,"
                "principal_available=principal_total,state='active' WHERE deposit_id=?",
                (dep_id,),
            )
            conn.execute(
                "INSERT INTO deposit_ledger(user_id,delta,kind,deposit_id,note,"
                "created_at,v2_op_id) VALUES(?,?, 'topup',?,'test','2026-09-01',?)",
                (dep["user_id"], dep["amount"], dep_id, op_id),
            )
            conn.execute(
                "UPDATE deposit_v2_ops SET state='applied' WHERE id=?", (op_id,)
            )
            return op_id

    def test_install_defaults_migrating_and_legacy_writes_fail_closed(self):
        result = self.module.install_database_v2(self.db_path)
        self.assertTrue(result["ok"])
        self.assertEqual(result["trigger_count"], 11)
        with connection(self.db_path) as conn:
            with self.assertRaisesRegex(sqlite3.IntegrityError,
                                        "deposit_v2_not_enabled"):
                conn.execute(
                    "INSERT INTO deposits(user_id,amount,bonus_pct,bonus_amount,status,"
                    "created_at) VALUES(2,60000,15,9000,'pending','2026-09-01')"
                )

    def test_new_pending_gets_one_lot_and_activation_needs_exact_op_seam(self):
        self._enable()
        dep_id = self._new_pending()
        with connection(self.db_path) as conn:
            lot = conn.execute(
                "SELECT * FROM deposit_v2_lots WHERE deposit_id=?", (dep_id,)
            ).fetchone()
            self.assertEqual(lot["contract_version"], self.module.DEPOSIT_VERSION)
            self.assertEqual(lot["principal_funded"], 0)
            with self.assertRaisesRegex(sqlite3.IntegrityError,
                                        "deposit_v2_activation_seam"):
                conn.execute("UPDATE deposits SET status='active' WHERE id=?", (dep_id,))
        self._activate(dep_id)
        with connection(self.db_path) as conn:
            self.assertEqual(conn.execute(
                "SELECT SUM(delta) FROM deposit_ledger WHERE user_id=2"
            ).fetchone()[0], 60_000)
            self.assertEqual(conn.execute(
                "SELECT COUNT(*) FROM bonus_ledger WHERE user_id=2"
            ).fetchone()[0], 0)

    def test_legacy_direct_pay_and_upfront_deposit_bonus_are_blocked(self):
        self._enable()
        dep_id = self._new_pending()
        self._activate(dep_id)
        with connection(self.db_path) as conn:
            with self.assertRaisesRegex(sqlite3.IntegrityError,
                                        "deposit_v2_ledger_seam"):
                conn.execute(
                    "INSERT INTO deposit_ledger(user_id,delta,kind,order_id,created_at) "
                    "VALUES(2,-1000,'pay',10,'2026-09-01')"
                )
            with self.assertRaisesRegex(sqlite3.IntegrityError,
                                        "deposit_v2_bonus_seam"):
                conn.execute(
                    "INSERT INTO bonus_ledger(user_id,delta,kind,created_at) "
                    "VALUES(2,9000,'deposit','2026-09-01')"
                )

    def test_persistent_ledger_guard_binds_user_subject_and_amount(self):
        self._enable()
        dep_id = self._new_pending()
        with connection(self.db_path) as conn:
            cur = conn.execute(
                "INSERT INTO deposit_v2_ops(op_key,kind,state,deposit_id,user_id,"
                "amount,created_at,updated_at) VALUES(?, 'activate','prepared',"
                "?,2,60000,'2026-09-01','2026-09-01')",
                (f"activate:{dep_id}", dep_id),
            )
            op_id = int(cur.lastrowid)
            for user_id, delta, subject in (
                (99, 60_000, dep_id),
                (2, 999_999, dep_id),
                (2, 60_000, dep_id + 1),
            ):
                with self.assertRaisesRegex(
                    sqlite3.IntegrityError, "deposit_v2_ledger_seam"
                ):
                    conn.execute(
                        "INSERT INTO deposit_ledger(user_id,delta,kind,deposit_id,"
                        "created_at,v2_op_id) VALUES(?,?, 'topup',?,'2026-09-01',?)",
                        (user_id, delta, subject, op_id),
                    )

    def test_settled_v2_ledger_cannot_be_mutated_or_deleted(self):
        self._enable()
        dep_id = self._new_pending()
        self._activate(dep_id)
        with connection(self.db_path) as conn:
            op = conn.execute(
                "INSERT INTO deposit_v2_ops(op_key,kind,state,user_id,order_id,"
                "payment_kind,amount,created_at,updated_at) "
                "VALUES('pay:10:full','pay','reserved',2,10,'full',1000,"
                "'2026-09-01','2026-09-01')"
            )
            op_id = int(op.lastrowid)
            ledger = conn.execute(
                "INSERT INTO deposit_ledger(user_id,delta,kind,order_id,note,"
                "created_at,v2_op_id) VALUES(2,-1000,'pay_reserve',10,'qa',"
                "'2026-09-01',?)", (op_id,),
            )
            ledger_id = int(ledger.lastrowid)
            conn.execute(
                "UPDATE deposit_v2_ops SET state='money_settled' WHERE id=?",
                (op_id,),
            )
            conn.execute(
                "UPDATE deposit_ledger SET kind='pay' WHERE id=?", (ledger_id,)
            )
            with self.assertRaisesRegex(
                sqlite3.IntegrityError, "deposit_v2_pay_settlement_seam"
            ):
                conn.execute(
                    "UPDATE deposit_ledger SET user_id=99,delta=-999,order_id=11 "
                    "WHERE id=?", (ledger_id,),
                )
            with self.assertRaisesRegex(
                sqlite3.IntegrityError, "deposit_v2_ledger_immutable"
            ):
                conn.execute("DELETE FROM deposit_ledger WHERE id=?", (ledger_id,))

    def test_competing_reservations_cannot_make_principal_negative(self):
        self._enable()
        dep_id = self._new_pending()
        self._activate(dep_id)
        with connection(self.db_path) as conn:
            first = conn.execute(
                "UPDATE deposit_v2_lots SET principal_available=principal_available-60000,"
                "principal_pay_reserved=principal_pay_reserved+60000 "
                "WHERE deposit_id=? AND principal_available>=60000", (dep_id,)
            )
            second = conn.execute(
                "UPDATE deposit_v2_lots SET principal_available=principal_available-60000,"
                "principal_pay_reserved=principal_pay_reserved+60000 "
                "WHERE deposit_id=? AND principal_available>=60000", (dep_id,)
            )
            self.assertEqual(first.rowcount, 1)
            self.assertEqual(second.rowcount, 0)
            lot = conn.execute(
                "SELECT principal_available,principal_pay_reserved "
                "FROM deposit_v2_lots WHERE deposit_id=?", (dep_id,)
            ).fetchone()
            self.assertEqual(tuple(lot), (0, 60_000))

    def test_partial_use_refunds_exact_unused_principal_without_bonus_deduction(self):
        self._enable()
        dep_id = self._new_pending()
        self._activate(dep_id)
        with connection(self.db_path) as conn:
            conn.execute(
                "UPDATE deposit_v2_lots SET principal_available=20000,"
                "principal_consumed=40000,bonus_gross_vested=6000 WHERE deposit_id=?",
                (dep_id,),
            )
            cur = conn.execute(
                "INSERT INTO deposit_v2_ops(op_key,kind,state,deposit_id,user_id,"
                "amount,created_at,updated_at) VALUES(?, 'refund','reserved',"
                "?,2,20000,'2026-09-15','2026-09-15')",
                (f"refund:{dep_id}:1", dep_id),
            )
            op_id = int(cur.lastrowid)
            conn.execute(
                "UPDATE deposit_v2_lots SET principal_available=0,"
                "principal_refund_reserved=20000,state='refund_pending' "
                "WHERE deposit_id=?", (dep_id,)
            )
            conn.execute(
                "INSERT INTO deposit_ledger(user_id,delta,kind,deposit_id,"
                "created_at,v2_op_id) VALUES(2,-20000,'refund',?, '2026-09-15',?)",
                (dep_id, op_id),
            )
            conn.execute(
                "UPDATE deposit_v2_lots SET principal_refund_reserved=0,"
                "principal_refunded=20000,state='closed' WHERE deposit_id=?",
                (dep_id,),
            )
            conn.execute(
                "UPDATE deposit_v2_ops SET state='applied' WHERE id=?", (op_id,)
            )
            conn.execute(
                "UPDATE deposits SET status='refunded' WHERE id=?", (dep_id,)
            )
            lot = conn.execute(
                "SELECT principal_consumed,principal_refunded,bonus_gross_vested "
                "FROM deposit_v2_lots WHERE deposit_id=?", (dep_id,)
            ).fetchone()
            self.assertEqual(tuple(lot), (40_000, 20_000, 6_000))
            refund = conn.execute(
                "SELECT -delta FROM deposit_ledger WHERE v2_op_id=? AND kind='refund'",
                (op_id,),
            ).fetchone()[0]
            self.assertEqual(refund, 20_000)

    def test_disable_closes_only_new_issuance_and_keeps_existing_refund_service(self):
        self._enable()
        dep_id = self._new_pending()
        self._activate(dep_id)
        self.module.set_database_state(self.db_path, enabled=False)
        with connection(self.db_path) as conn:
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO deposits(user_id,amount,bonus_pct,bonus_amount,status,"
                    "created_at) VALUES(2,20000,8,1600,'pending','2026-09-02')"
                )
            cur = conn.execute(
                "INSERT INTO deposit_v2_ops(op_key,kind,state,deposit_id,user_id,"
                "amount,created_at,updated_at) VALUES(?, 'refund','reserved',"
                "?,2,60000,'2026-09-02','2026-09-02')",
                (f"refund:{dep_id}:1", dep_id),
            )
            op_id = int(cur.lastrowid)
            conn.execute(
                "UPDATE deposit_v2_lots SET principal_available=0,"
                "principal_refund_reserved=60000,state='refund_pending' "
                "WHERE deposit_id=?", (dep_id,)
            )
            conn.execute(
                "INSERT INTO deposit_ledger(user_id,delta,kind,deposit_id,"
                "created_at,v2_op_id) VALUES(2,-60000,'refund',?,'2026-09-02',?)",
                (dep_id, op_id),
            )

    def test_check_rejects_same_named_but_tampered_persistent_trigger(self):
        self._enable()
        with connection(self.db_path) as conn:
            conn.execute("DROP TRIGGER trg_dep_v2_insert_guard")
            conn.execute(
                "CREATE TRIGGER trg_dep_v2_insert_guard BEFORE INSERT ON deposits "
                "BEGIN SELECT 1; END"
            )
        result = self.module.check_database_v2(self.db_path)
        self.assertFalse(result["ok"])
        self.assertEqual(result["trigger_tampered"], ["trg_dep_v2_insert_guard"])

    def test_legacy_pending_id_and_promise_are_preserved_for_reconciliation(self):
        with connection(self.db_path) as conn:
            conn.execute(
                "INSERT INTO deposits(id,user_id,amount,bonus_pct,bonus_amount,status,"
                "via,created_at) VALUES(7,2,60000,15,9000,'pending','legacy','2026-08-24')"
            )
        result = self.module.install_database_v2(self.db_path)
        self.assertEqual(result["legacy_pending"], 1)
        with connection(self.db_path) as conn:
            dep = conn.execute("SELECT * FROM deposits WHERE id=7").fetchone()
            lot = conn.execute(
                "SELECT * FROM deposit_v2_lots WHERE deposit_id=7"
            ).fetchone()
            self.assertEqual((dep["amount"], dep["bonus_pct"], dep["bonus_amount"]),
                             (60_000, 15, 9_000))
            self.assertEqual(lot["contract_version"], self.module.LEGACY_VERSION)
            self.assertEqual(lot["state"], "legacy_manual_pending")

    def test_paid_legacy_pending_gets_durable_paid_hold_activation_op(self):
        with connection(self.db_path) as conn:
            conn.execute(
                "INSERT INTO deposits(id,user_id,amount,bonus_pct,bonus_amount,status,"
                "via,created_at) VALUES(7,2,60000,15,9000,'pending','legacy',"
                "'2026-08-24')"
            )
            conn.execute(
                "INSERT INTO payment_receipts(provider,inv_id,payment_status) "
                "VALUES('robokassa',70000007,'paid')"
            )
        result = self.module.install_database_v2(self.db_path)
        self.assertEqual(result["legacy_pending"], 1)
        with connection(self.db_path) as conn:
            lot = conn.execute(
                "SELECT contract_version,state FROM deposit_v2_lots "
                "WHERE deposit_id=7"
            ).fetchone()
            op = conn.execute(
                "SELECT kind,state,provider,external_id,amount FROM deposit_v2_ops "
                "WHERE deposit_id=7"
            ).fetchone()
            self.assertEqual(tuple(lot), (self.module.LEGACY_VERSION, "paid_hold"))
            self.assertEqual(
                tuple(op), ("activate", "paid_hold", "robokassa", "70000007", 60_000)
            )

    def test_check_detects_lot_reward_drift(self):
        self._enable()
        dep_id = self._new_pending()
        self._activate(dep_id)
        with connection(self.db_path) as conn:
            conn.execute(
                "UPDATE deposit_v2_lots SET bonus_entitlement_awarded=1 "
                "WHERE deposit_id=?", (dep_id,),
            )
        result = self.module.check_database_v2(self.db_path)
        self.assertFalse(result["ok"])
        self.assertEqual(result["bad_rewards"], 1)

    def test_partial_refund_audit_is_cumulative_and_complete_is_exact(self):
        self._enable()
        with connection(self.db_path) as conn:
            conn.execute(
                "INSERT INTO economic_order_reward_refunds(order_id,user_id,"
                "paid_total,deposit_paid_total,refunded_total,refunded_deposit,"
                "complete,revision,created_at,updated_at) "
                "VALUES(10,2,60000,60000,30000,30000,0,1,'2026-09-10',"
                "'2026-09-10')"
            )
            conn.execute(
                "INSERT INTO economic_lot_reward_adjustments(deposit_id,order_id,"
                "revision,principal_reversed,entitlement_reduced,held_canceled,"
                "unspent_revoked,expired_ignored,future_debt,created_at) "
                "VALUES(1,10,1,30000,6000,6000,0,0,0,'2026-09-10'),"
                "(1,10,2,30000,3000,3000,0,0,0,'2026-09-11')"
            )
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO economic_order_reward_refunds(order_id,user_id,"
                    "paid_total,deposit_paid_total,refunded_total,refunded_deposit,"
                    "complete,revision,created_at,updated_at) "
                    "VALUES(11,2,60000,60000,30000,30000,1,1,'2026-09-10',"
                    "'2026-09-10')"
                )
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO economic_order_reward_refunds(order_id,user_id,"
                    "paid_total,deposit_paid_total,refunded_total,refunded_deposit,"
                    "complete,revision,created_at,updated_at) "
                    "VALUES(12,2,60000,60000,60000,60000,0,1,'2026-09-10',"
                    "'2026-09-10')"
                )
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute(
                    "INSERT INTO economic_order_reward_refunds(order_id,user_id,"
                    "paid_total,deposit_paid_total,bonus_spent_total,refunded_total,"
                    "refunded_deposit,refunded_bonus,complete,revision,created_at,"
                    "updated_at) VALUES(13,2,60000,60000,500,30000,30000,501,0,1,"
                    "'2026-09-10','2026-09-10')"
                )
        result = self.module.check_database_v2(self.db_path)
        self.assertTrue(result["ok"])
        self.assertEqual(result["bad_refunds"], 0)

    def test_complete_refund_tombstone_blocks_new_bonus_spend(self):
        self._enable()
        with connection(self.db_path) as conn:
            conn.execute(
                "INSERT INTO orders(id,user_id,status,work_type,price,bonus_spent) "
                "VALUES(20,2,'priced','coursework',5000,0)"
            )
            conn.execute(
                "INSERT INTO economic_order_reward_refunds(order_id,user_id,"
                "paid_total,deposit_paid_total,bonus_spent_total,refunded_total,"
                "refunded_deposit,refunded_bonus,complete,revision,created_at,"
                "updated_at) VALUES(20,2,0,0,500,0,0,500,1,1,'2026-09-10',"
                "'2026-09-10')"
            )
            with self.assertRaisesRegex(
                sqlite3.IntegrityError, "economic_order_reward_tombstone"
            ):
                conn.execute(
                    "UPDATE orders SET bonus_spent=500 WHERE id=20"
                )
            self.assertEqual(conn.execute(
                "SELECT bonus_spent FROM orders WHERE id=20"
            ).fetchone()[0], 0)

    def test_legacy_paid_referral_candidate_becomes_review_not_bonus(self):
        with connection(self.db_path) as conn:
            conn.execute(
                "INSERT INTO orders(id,user_id,status,price) "
                "VALUES(10,2,'check',10000)"
            )
            conn.execute(
                "INSERT INTO payments(id,order_id,kind,amount,method,status,paid_at) "
                "VALUES(1,10,'prepay',10000,'manual','paid','2026-08-24')"
            )
        result = self.module.install_database_v2(self.db_path)
        self.assertEqual(result["referral_reviews"], 1)
        with connection(self.db_path) as conn:
            obligation = conn.execute(
                "SELECT amount,state,program_version FROM referral_v2_obligations"
            ).fetchone()
            self.assertEqual(tuple(obligation),
                             (200, "needs_review", self.module.REFERRAL_VERSION))
            self.assertEqual(conn.execute(
                "SELECT COUNT(*) FROM bonus_ledger"
            ).fetchone()[0], 0)

    def test_referral_backfill_excludes_deleted_and_subscription_orders(self):
        with connection(self.db_path) as conn:
            conn.execute(
                "INSERT INTO orders(id,user_id,status,work_type,price,deleted) "
                "VALUES(10,2,'done','coursework',10000,1),"
                "(11,2,'done','sub_plus',10000,0)"
            )
            conn.execute(
                "INSERT INTO payments(id,order_id,kind,amount,method,status,paid_at) "
                "VALUES(1,10,'rest',10000,'manual','paid','2026-08-24'),"
                "(2,11,'rest',10000,'manual','paid','2026-08-24')"
            )
        result = self.module.install_database_v2(self.db_path)
        self.assertEqual(result["referral_reviews"], 0)
        with connection(self.db_path) as conn:
            self.assertEqual(conn.execute(
                "SELECT COUNT(*) FROM referral_v2_obligations"
            ).fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
