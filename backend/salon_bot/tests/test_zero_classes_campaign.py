from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import json
import sqlite3
import sys
import tempfile
import types
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock


HERE = Path(__file__).resolve()
MODULE_PATH = HERE.parents[1] / "zero_campaign.py"
INSTALLER_PATH = HERE.parents[1] / "install_zero_classes_campaign.py"


class AsyncCursor:
    def __init__(self, cursor: sqlite3.Cursor) -> None:
        self.cursor = cursor
        self.rowcount = cursor.rowcount

    async def fetchone(self):
        return self.cursor.fetchone()

    async def fetchall(self):
        return self.cursor.fetchall()


class AsyncConnection:
    def __init__(self, connection: sqlite3.Connection) -> None:
        self.connection = connection

    async def execute(self, sql: str, args=()):
        return AsyncCursor(self.connection.execute(sql, tuple(args)))


class FakeDb:
    def __init__(self, path: Path) -> None:
        self.path = path

    @asynccontextmanager
    async def transaction(self):
        raw = sqlite3.connect(self.path, timeout=10, isolation_level=None)
        raw.row_factory = sqlite3.Row
        raw.execute("PRAGMA foreign_keys=ON")
        raw.execute("PRAGMA busy_timeout=5000")
        raw.execute("BEGIN IMMEDIATE")
        try:
            yield AsyncConnection(raw)
            raw.commit()
        except Exception:
            raw.rollback()
            raise
        finally:
            raw.close()


def load_module(fake_db: FakeDb):
    app = types.ModuleType("zero_test_app")
    app.__path__ = []
    services = types.ModuleType("zero_test_app.services")
    services.__path__ = []
    app.db = fake_db
    sys.modules[app.__name__] = app
    sys.modules[services.__name__] = services
    name = "zero_test_app.services.zero_campaign"
    spec = importlib.util.spec_from_file_location(name, MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def load_installer():
    name = "zero_campaign_installer_test"
    spec = importlib.util.spec_from_file_location(name, INSTALLER_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module


def base_database(path: Path) -> None:
    connection = sqlite3.connect(path)
    connection.executescript(
        """
        PRAGMA foreign_keys=ON;
        CREATE TABLE promos(
          code TEXT PRIMARY KEY,
          pct INTEGER,
          amount INTEGER,
          cap INTEGER,
          min_price INTEGER DEFAULT 0,
          uses_left INTEGER,
          expires_at TEXT,
          active INTEGER DEFAULT 1,
          note TEXT,
          family TEXT,
          created_at TEXT NOT NULL
        );
        CREATE TABLE promo_first_order_claims(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          family TEXT NOT NULL,
          code TEXT NOT NULL,
          user_id INTEGER,
          contact_key TEXT,
          order_id INTEGER NOT NULL UNIQUE,
          created_at TEXT NOT NULL,
          CHECK(user_id IS NOT NULL OR contact_key IS NOT NULL),
          UNIQUE(family, user_id),
          UNIQUE(family, contact_key)
        );
        """
    )
    connection.commit()
    connection.close()


def epoch(value: str) -> int:
    return int(datetime.fromisoformat(value).replace(tzinfo=timezone.utc).timestamp())


class ZeroCampaignTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "salon.sqlite3"
        base_database(self.path)
        self.db = FakeDb(self.path)
        self.module = load_module(self.db)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def seed(self, enabled: bool = True) -> None:
        self.assertEqual(
            self.module.seed_database(self.path, enabled=enabled),
            {"total": 30, "codes": 30, "public_ids": 30},
        )

    def claim(self, claimant: str, request: str, nonce: str, when: str, drop="0901"):
        return asyncio.run(
            self.module.claim(
                drop_id=drop,
                claimant=claimant,
                request_id=request,
                nonce=nonce,
                epoch=epoch(when),
            )
        )

    def test_seed_is_idempotent_and_never_creates_gift_balance(self) -> None:
        self.seed(enabled=False)
        self.seed(enabled=False)
        connection = sqlite3.connect(self.path)
        rows = connection.execute(
            "SELECT family,amount,min_price,uses_left,COUNT(*) FROM promos GROUP BY 1,2,3,4"
        ).fetchall()
        self.assertEqual(rows, [(self.module.FAMILY, 1000, 5000, 1, 30)])
        self.assertIsNone(
            connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='gifts'"
            ).fetchone()
        )
        connection.close()

    def test_two_seeders_still_create_exactly_thirty_slots(self) -> None:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(
                lambda _index: self.module.seed_database(self.path, enabled=False),
                range(2),
            ))
        self.assertEqual(
            results,
            [{"total": 30, "codes": 30, "public_ids": 30}] * 2,
        )
        connection = sqlite3.connect(self.path)
        self.assertEqual(
            connection.execute("SELECT COUNT(*) FROM promos").fetchone()[0], 30
        )
        connection.close()

    def test_hmac_rejects_wrong_source_stale_and_tampered_body(self) -> None:
        secret = b"s" * 48
        body = b'{"drop_id":"0901"}'
        timestamp = "1788242460"
        nonce = "a" * 32
        signature = self.module.body_signature(secret, timestamp, nonce, body)
        with mock.patch.object(self.module, "source_ips", return_value={"127.0.0.1"}):
            self.module.verify_request(
                body=body, timestamp=timestamp, nonce=nonce, signature=signature,
                source_ip="127.0.0.1", secret=secret, epoch=int(timestamp),
            )
            for change in ("ip", "time", "body"):
                with self.assertRaises(self.module.CampaignError):
                    self.module.verify_request(
                        body=b"{}" if change == "body" else body,
                        timestamp=timestamp,
                        nonce=nonce,
                        signature=signature,
                        source_ip="10.0.0.2" if change == "ip" else "127.0.0.1",
                        secret=secret,
                        epoch=int(timestamp) + (61 if change == "time" else 0),
                    )

    def test_authenticated_http_contract_allows_a_full_signed_burst(self) -> None:
        secret = b"h" * 48
        timestamp = "1788242460"
        with mock.patch.object(self.module, "source_ips", return_value={"127.0.0.1"}):
            for index in range(50):
                value = {
                    "drop_id": "0901",
                    "claimant_key": hashlib.sha256(f"student-{index}".encode()).hexdigest(),
                    "request_id": f"{index + 1:032x}",
                }
                body = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
                nonce = f"{index + 100:032x}"
                parsed = self.module.authenticated_claim_payload(
                    body=body,
                    timestamp=timestamp,
                    nonce=nonce,
                    signature=self.module.body_signature(secret, timestamp, nonce, body),
                    source_ip="127.0.0.1",
                    secret=secret,
                    epoch=int(timestamp),
                )
                self.assertEqual(parsed, value)

            claimant = hashlib.sha256(b"persistent-retry").hexdigest()
            for index in range(self.module.CLAIM_RATE_PER_CLAIMANT):
                value = {
                    "drop_id": "0901",
                    "claimant_key": claimant,
                    "request_id": f"{index + 501:032x}",
                }
                body = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
                nonce = f"{index + 601:032x}"
                self.module.authenticated_claim_payload(
                    body=body,
                    timestamp=timestamp,
                    nonce=nonce,
                    signature=self.module.body_signature(secret, timestamp, nonce, body),
                    source_ip="127.0.0.1",
                    secret=secret,
                    epoch=int(timestamp),
                )
            value["request_id"] = "f" * 32
            body = json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
            nonce = "e" * 32
            with self.assertRaisesRegex(self.module.CampaignError, "rate_limited"):
                self.module.authenticated_claim_payload(
                    body=body,
                    timestamp=timestamp,
                    nonce=nonce,
                    signature=self.module.body_signature(secret, timestamp, nonce, body),
                    source_ip="127.0.0.1",
                    secret=secret,
                    epoch=int(timestamp),
                )

    def test_boundaries_and_repeat_return_same_code(self) -> None:
        self.seed()
        claimant = hashlib.sha256(b"student").hexdigest()
        with self.assertRaisesRegex(self.module.CampaignError, "not_open_yet"):
            self.claim(claimant, "1" * 32, "2" * 32, "2026-09-01T06:00:59")
        first = self.claim(claimant, "3" * 32, "4" * 32, "2026-09-01T06:01:00")
        repeated = self.claim(claimant, "5" * 32, "6" * 32, "2026-09-01T10:01:00", "1301")
        self.assertEqual(first["code"], repeated["code"])
        self.assertFalse(first["repeated"])
        self.assertTrue(repeated["repeated"])
        self.assertEqual(first["remaining"], 9)
        with self.assertRaisesRegex(self.module.CampaignError, "drop_ended"):
            other = hashlib.sha256(b"late").hexdigest()
            self.claim(other, "7" * 32, "8" * 32, "2026-09-01T10:01:00", "0901")

    def test_rejected_request_still_consumes_nonce(self) -> None:
        self.seed()
        claimant = hashlib.sha256(b"early").hexdigest()
        with self.assertRaisesRegex(self.module.CampaignError, "not_open_yet"):
            self.claim(claimant, "1" * 32, "9" * 32, "2026-09-01T06:00:59")
        with self.assertRaisesRegex(self.module.CampaignError, "replayed_nonce"):
            self.claim(claimant, "1" * 32, "9" * 32, "2026-09-01T06:01:00")

    def test_existing_claim_can_be_retrieved_after_kill_switch(self) -> None:
        self.seed()
        claimant = hashlib.sha256(b"winner-retry").hexdigest()
        claimed = self.claim(
            claimant, "1" * 32, "2" * 32, "2026-09-01T06:02:00"
        )
        self.module.set_enabled(self.path, False)
        repeated = self.claim(
            claimant, "3" * 32, "4" * 32, "2026-09-01T06:03:00"
        )
        self.assertEqual(repeated["code"], claimed["code"])
        self.assertTrue(repeated["repeated"])

    def test_fifty_concurrent_claims_allocate_exactly_ten(self) -> None:
        self.seed()

        def run(index: int):
            try:
                return self.claim(
                    hashlib.sha256(f"student-{index}".encode()).hexdigest(),
                    f"{index + 1:032x}",
                    f"{index + 101:032x}",
                    "2026-09-01T06:02:00",
                )
            except self.module.CampaignError as error:
                return error.code

        with ThreadPoolExecutor(max_workers=20) as pool:
            results = list(pool.map(run, range(50)))
        winners = [item for item in results if isinstance(item, dict)]
        self.assertEqual(len(winners), 10)
        self.assertEqual(len({item["code"] for item in winners}), 10)
        self.assertEqual({item for item in results if isinstance(item, str)}, {"sold_out"})
        connection = sqlite3.connect(self.path)
        self.assertEqual(
            connection.execute(
                "SELECT COUNT(*) FROM zero_campaign_claims WHERE campaign_id=?",
                (self.module.CAMPAIGN_ID,),
            ).fetchone()[0],
            10,
        )
        connection.close()

    def test_nonce_replay_is_rejected_without_spending_second_slot(self) -> None:
        self.seed()
        first = hashlib.sha256(b"one").hexdigest()
        second = hashlib.sha256(b"two").hexdigest()
        self.claim(first, "a" * 32, "b" * 32, "2026-09-01T06:02:00")
        with self.assertRaisesRegex(self.module.CampaignError, "replayed_nonce"):
            self.claim(second, "c" * 32, "b" * 32, "2026-09-01T06:02:01")
        connection = sqlite3.connect(self.path)
        self.assertEqual(connection.execute("SELECT COUNT(*) FROM zero_campaign_claims").fetchone()[0], 1)
        connection.close()

    def test_enable_fails_closed_on_partial_seed_and_disable_preserves_issued_code(self) -> None:
        self.seed(enabled=True)
        claimant = hashlib.sha256(b"winner").hexdigest()
        claimed = self.claim(
            claimant,
            "d" * 32,
            "c" * 32,
            "2026-09-01T06:02:00",
        )
        self.module.set_enabled(self.path, False)
        connection = sqlite3.connect(self.path)
        self.assertEqual(
            connection.execute(
                "SELECT enabled FROM zero_campaigns WHERE campaign_id=?",
                (self.module.CAMPAIGN_ID,),
            ).fetchone()[0],
            0,
        )
        self.assertEqual(
            connection.execute(
                "SELECT active,uses_left FROM promos WHERE code=?",
                (claimed["code"],),
            ).fetchone(),
            (1, 1),
        )
        self.assertIsNotNone(
            connection.execute(
                "SELECT 1 FROM zero_campaign_claims WHERE code=?",
                (claimed["code"],),
            ).fetchone()
        )
        connection.execute(
            "DELETE FROM zero_campaign_slots WHERE campaign_id=? AND drop_id=? AND slot=?",
            (self.module.CAMPAIGN_ID, "1801", 10),
        )
        connection.commit()
        connection.close()
        with self.assertRaisesRegex(RuntimeError, "exactly 30"):
            self.module.set_enabled(self.path, True)

    def test_integrity_detects_missing_or_mutated_promos(self) -> None:
        self.seed(enabled=False)
        connection = sqlite3.connect(self.path)
        code = connection.execute(
            "SELECT code FROM zero_campaign_slots ORDER BY public_id LIMIT 1"
        ).fetchone()[0]
        connection.execute("UPDATE promos SET cap=500 WHERE code=?", (code,))
        connection.commit()
        with self.assertRaisesRegex(RuntimeError, "economics mismatch"):
            self.module.campaign_integrity(connection)
        connection.execute("UPDATE promos SET cap=NULL WHERE code=?", (code,))
        connection.execute("DELETE FROM promos WHERE code=?", (code,))
        connection.commit()
        with self.assertRaisesRegex(RuntimeError, "foreign-key integrity mismatch"):
            self.module.campaign_integrity(connection)
        connection.close()

    def test_one_bearer_code_can_bind_to_only_one_order_under_race(self) -> None:
        self.seed(enabled=True)
        connection = sqlite3.connect(self.path)
        code = connection.execute(
            "SELECT code FROM zero_campaign_slots ORDER BY public_id LIMIT 1"
        ).fetchone()[0]
        connection.close()

        def bind(index: int) -> str:
            raw = sqlite3.connect(self.path, timeout=10, isolation_level=None)
            raw.execute("PRAGMA busy_timeout=5000")
            try:
                raw.execute("BEGIN IMMEDIATE")
                raw.execute(
                    "INSERT INTO promo_first_order_claims"
                    "(family,code,contact_key,order_id,created_at) VALUES(?,?,?,?,?)",
                    (self.module.FAMILY, code, f"contact-{index}", index + 1,
                     "2026-09-01T06:02:00"),
                )
                raw.commit()
                return "bound"
            except sqlite3.IntegrityError:
                raw.rollback()
                return "rejected"
            finally:
                raw.close()

        with ThreadPoolExecutor(max_workers=12) as pool:
            outcomes = list(pool.map(bind, range(20)))
        self.assertEqual(outcomes.count("bound"), 1)
        self.assertEqual(outcomes.count("rejected"), 19)

    def test_prelaunch_restore_is_hash_pinned_and_post_claim_restore_refuses(self) -> None:
        installer = load_installer()
        root = Path(self.temp.name) / "runtime"
        backup_root = Path(self.temp.name) / "backups"
        backup = backup_root / "zero-classes-20260831T000000Z"
        (root / "app/services").mkdir(parents=True)
        backup.mkdir(parents=True)
        originals = {
            "webapp": "original webapp\n",
            "db": "original db\n",
            "promo": "original promo\n",
        }
        targets = installer.paths(root)
        for key, content in originals.items():
            targets[key].write_text("patched " + content, encoding="utf-8")
            (backup / targets[key].name).write_text(content, encoding="utf-8")
        targets["zero"].write_text("campaign module\n", encoding="utf-8")
        dropin = Path(self.temp.name) / "zero-campaign.conf"
        dropin.write_text(installer.packaged_dropin(), encoding="utf-8")
        database = Path(self.temp.name) / "restore.sqlite3"
        connection = sqlite3.connect(database)
        connection.executescript(
            """
            CREATE TABLE promos(code TEXT PRIMARY KEY,family TEXT,active INTEGER);
            CREATE TABLE zero_campaigns(campaign_id TEXT PRIMARY KEY,enabled INTEGER);
            CREATE TABLE zero_campaign_claims(campaign_id TEXT,code TEXT);
            INSERT INTO promos VALUES('NP26-TEST','zero-classes-2026-09-01',1);
            INSERT INTO zero_campaigns VALUES('zero-classes-2026-09-01',1);
            """
        )
        connection.commit()
        connection.close()
        known = {
            key: hashlib.sha256(content.encode()).hexdigest()
            for key, content in originals.items()
        }
        with mock.patch.object(installer, "KNOWN_BEFORE", known):
            result = installer.restore(
                root, database, backup_root, backup,
                restart=False, dropin=dropin,
            )
        self.assertTrue(result["restored"])
        self.assertFalse(targets["zero"].exists())
        self.assertFalse(dropin.exists())
        for key, content in originals.items():
            self.assertEqual(targets[key].read_text(encoding="utf-8"), content)
        connection = sqlite3.connect(database)
        self.assertEqual(connection.execute("SELECT enabled FROM zero_campaigns").fetchone()[0], 0)
        self.assertEqual(connection.execute("SELECT active FROM promos").fetchone()[0], 0)
        connection.execute(
            "INSERT INTO zero_campaign_claims VALUES(?,?)",
            (installer.CAMPAIGN_ID, "NP26-TEST"),
        )
        connection.commit()
        connection.close()
        for key in originals:
            targets[key].write_text("patched again\n", encoding="utf-8")
        with mock.patch.object(installer, "KNOWN_BEFORE", known):
            with self.assertRaisesRegex(RuntimeError, "issued codes exist"):
                installer.restore(
                    root, database, backup_root, backup,
                    restart=False, dropin=dropin,
                )


if __name__ == "__main__":
    unittest.main()
