from __future__ import annotations

import ast
import asyncio
from contextlib import asynccontextmanager
from copy import deepcopy
import sqlite3
import sys
import tempfile
import unittest
from unittest import mock
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Iterable

try:
    import aiosqlite as real_aiosqlite
except ModuleNotFoundError:  # Production-venv integration runs this class.
    real_aiosqlite = None

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[1]))

import install_sqlite_recovery as installer_module  # noqa: E402
from install_sqlite_recovery import (  # noqa: E402
    DB_MARKER,
    MODULE_MARKER,
    OLD_CLOSE_BLOCK,
    OLD_DB_BLOCK,
    OLD_DEPOSIT_ACTIVATE_WRITES,
    OLD_DEPOSIT_CREATE_WRITES,
    OLD_DEPOSIT_REFUND_WRITES,
    OLD_GLOBAL_BLOCK,
    OLD_IMPORT_BLOCK,
    OLD_INIT_HEAD,
    OLD_INIT_TAIL,
    OLD_QA_BAN,
    OLD_QA_DELETE,
    OLD_QA_VOTE,
    OLD_SESSION_FETCH,
    install,
    patch_handlers_admin,
    patch_db,
    patch_services_deposit,
    rollback,
    sha256,
    sha256_text,
)


DB_SOURCE = f'''"""live-shaped db fixture"""
from __future__ import annotations

{OLD_IMPORT_BLOCK}from contextvars import ContextVar
from typing import Any, Iterable

import aiosqlite

{OLD_GLOBAL_BLOCK}

{OLD_INIT_HEAD}    _db_path = path
    _conn = await aiosqlite.connect(path)
    analytics_cutoff = "fixture"
{OLD_INIT_TAIL}

{OLD_CLOSE_BLOCK}

def conn() -> aiosqlite.Connection:
    transactional = _transaction_connection.get()
    if transactional is not None:
        return transactional
    assert _conn is not None
    return _conn


_transaction_connection = ContextVar("fixture_transaction", default=None)


{OLD_DB_BLOCK}

async def claim_order_to_user(order_id, user_id):
    cur = await conn().execute(
        "UPDATE orders SET user_id=? WHERE id=?", (user_id, order_id))
    await _commit()
    return cur.rowcount == 1


{OLD_QA_DELETE}

{OLD_QA_VOTE}

{OLD_QA_BAN}

async def session_user():
    cur = await conn().execute("SELECT 1")
{OLD_SESSION_FETCH}            1
        )
    return row
'''

HANDLER_SOURCE = '''from __future__ import annotations

async def cb_lead_done():
    await db.conn().execute("UPDATE leads SET status='done' WHERE id=?", (1,))
    await db.conn().commit()
'''

DEPOSIT_SOURCE = f'''from __future__ import annotations

BONUS_TTL = 180

async def balance(user_id: int) -> int:
    cur = await db.conn().execute(
        "SELECT COALESCE(SUM(delta),0) FROM deposit_ledger WHERE user_id=?",
        (user_id,))
    row = await cur.fetchone()
    return int(row[0] or 0)


async def dep_get(dep_id: int):
    cur = await db.conn().execute("SELECT * FROM deposits WHERE id=?", (dep_id,))
    return await cur.fetchone()


async def create_pending(*, user_id: int, amount: int, via: str = "кабинет"):
{OLD_DEPOSIT_CREATE_WRITES}    return cur.lastrowid


{OLD_DEPOSIT_ACTIVATE_WRITES}


{OLD_DEPOSIT_REFUND_WRITES}


async def pay_order():
    await db.conn().execute(
        "INSERT INTO deposit_ledger(user_id, delta, kind) VALUES(1, -1, 'pay')"
    )
    await db.conn().commit()
'''


class AsyncConnection:
    def __init__(self, raw: sqlite3.Connection) -> None:
        self.raw = raw
        self.execute_calls = 0
        self.commit_calls = 0
        self.rollback_calls = 0
        self.close_calls = 0

    @property
    def in_transaction(self) -> bool:
        return self.raw.in_transaction

    async def execute(self, sql: str, parameters=()):
        self.execute_calls += 1
        return self.raw.execute(sql, parameters)

    async def commit(self) -> None:
        self.commit_calls += 1
        self.raw.commit()

    async def rollback(self) -> None:
        self.rollback_calls += 1
        self.raw.rollback()

    async def close(self) -> None:
        self.close_calls += 1
        self.raw.close()


class CloseProbe:
    def __init__(self) -> None:
        self.close_calls = 0

    async def close(self) -> None:
        self.close_calls += 1


class FailingCloseProbe(CloseProbe):
    async def close(self) -> None:
        await super().close()
        raise RuntimeError("writer close failed")


class SerializedProbe:
    def __init__(self) -> None:
        self.active = 0
        self.max_active = 0
        self.parameters: list[tuple] = []

    async def execute(self, _sql: str, parameters=()):
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        try:
            await asyncio.sleep(0)
            self.parameters.append(tuple(parameters))
            return SimpleNamespace(rowcount=1, lastrowid=None)
        finally:
            self.active -= 1


class DepositCursor:
    def __init__(self, row=None, *, rowcount: int = -1, lastrowid=None) -> None:
        self.row = row
        self.rowcount = rowcount
        self.lastrowid = lastrowid

    async def fetchone(self):
        await asyncio.sleep(0)
        return self.row


class DepositDbProbe:
    def __init__(self) -> None:
        self.deposits = {
            1: {
                "id": 1,
                "user_id": 7,
                "amount": 20_000,
                "bonus_pct": 8,
                "bonus_amount": 1_600,
                "status": "pending",
            }
        }
        self.deposit_ledger: list[dict] = []
        self.bonus_ledger: list[dict] = []
        self.lock = asyncio.Lock()
        self.in_transaction = False
        self.bonus_outside_transaction = False
        self.fail_bonus_add = False
        self.next_bonus_id = 1

    def conn(self):
        return self

    @asynccontextmanager
    async def transaction(self):
        async with self.lock:
            snapshot = deepcopy(
                (self.deposits, self.deposit_ledger, self.bonus_ledger)
            )
            self.in_transaction = True
            try:
                yield self
            except BaseException:
                (
                    self.deposits,
                    self.deposit_ledger,
                    self.bonus_ledger,
                ) = snapshot
                raise
            finally:
                self.in_transaction = False

    async def _exec(self, sql: str, args=()):
        return await self.execute(sql, args)

    async def execute(self, sql: str, args=()):
        await asyncio.sleep(0)
        normalized = " ".join(sql.split()).lower()
        if normalized.startswith("select * from deposits"):
            return DepositCursor(self.deposits.get(int(args[0])))
        if "select coalesce(sum(delta),0) from deposit_ledger" in normalized:
            total = sum(
                row["delta"]
                for row in self.deposit_ledger
                if row["user_id"] == int(args[0])
            )
            return DepositCursor((total,))
        if normalized.startswith("select id, delta, consumed from bonus_ledger"):
            uid, note_suffix = int(args[0]), str(args[1]).lstrip("%")
            matches = [
                row
                for row in self.bonus_ledger
                if row["user_id"] == uid
                and row["kind"] == "deposit"
                and row["note"].endswith(note_suffix)
            ]
            return DepositCursor(matches[-1] if matches else None)
        if normalized.startswith("update deposits set status='active'"):
            dep_id = int(args[2])
            row = self.deposits.get(dep_id)
            if not row or row["status"] != "pending":
                return DepositCursor(rowcount=0)
            row.update(status="active", paid_at=args[0], pay_method=args[1])
            return DepositCursor(rowcount=1)
        if normalized.startswith("update deposits set status='refunded'"):
            dep_id = int(args[2])
            row = self.deposits.get(dep_id)
            if not row or row["status"] != "active":
                return DepositCursor(rowcount=0)
            row.update(status="refunded", refunded_at=args[0], refund_note=args[1])
            return DepositCursor(rowcount=1)
        if "insert into deposit_ledger" in normalized:
            kind = "topup" if "'topup'" in normalized else "refund"
            self.deposit_ledger.append(
                {
                    "user_id": int(args[0]),
                    "delta": int(args[1]),
                    "kind": kind,
                    "deposit_id": int(args[2]),
                }
            )
            return DepositCursor(rowcount=1, lastrowid=len(self.deposit_ledger))
        if normalized.startswith("update bonus_ledger set consumed="):
            row = next(
                item for item in self.bonus_ledger if item["id"] == int(args[1])
            )
            row["consumed"] = int(args[0])
            return DepositCursor(rowcount=1)
        if "insert into bonus_ledger" in normalized and "'revoke'" in normalized:
            self.bonus_ledger.append(
                {
                    "id": self.next_bonus_id,
                    "user_id": int(args[0]),
                    "delta": int(args[1]),
                    "kind": "revoke",
                    "note": str(args[2]),
                    "consumed": 0,
                }
            )
            self.next_bonus_id += 1
            return DepositCursor(rowcount=1, lastrowid=self.next_bonus_id - 1)
        raise AssertionError(f"unexpected deposit SQL: {normalized}")

    async def bonus_add(
        self,
        user_id: int,
        delta: int,
        kind: str,
        note: str = "",
        order_id=None,
        ttl_days=None,
    ) -> int:
        del order_id, ttl_days
        if not self.in_transaction:
            self.bonus_outside_transaction = True
        if self.fail_bonus_add:
            raise RuntimeError("injected bonus failure")
        row_id = self.next_bonus_id
        self.next_bonus_id += 1
        self.bonus_ledger.append(
            {
                "id": row_id,
                "user_id": user_id,
                "delta": delta,
                "kind": kind,
                "note": note,
                "consumed": 0,
            }
        )
        return row_id

    @staticmethod
    def now_iso() -> str:
        return "2026-08-25T00:00:00"


def executable_deposit(db_probe: DepositDbProbe):
    notifications: list[int] = []

    async def notify_client(_bot, user_id, _message):
        notifications.append(user_id)

    namespace = {
        "config": SimpleNamespace(fmt_money=lambda value: str(value)),
        "db": db_probe,
        "log": SimpleNamespace(info=lambda *_args: None),
        "notify": SimpleNamespace(notify_client=notify_client),
    }
    patched = patch_services_deposit(DEPOSIT_SOURCE)
    exec(compile(patched, "services_deposit.py", "exec"), namespace)
    namespace["notifications"] = notifications
    return namespace


def executable_runtime(ordinary, writer, lock: asyncio.Lock | None = None):
    tree = ast.parse(patch_db(DB_SOURCE))
    wanted = {"_commit", "_exec", "close"}
    nodes = [
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name in wanted
    ]
    transaction_connection = ContextVar("test_transaction_connection", default=None)

    def conn():
        return transaction_connection.get() or ordinary

    namespace = {
        "Any": Any,
        "BaseException": BaseException,
        "Iterable": Iterable,
        "asyncio": asyncio,
        "aiosqlite": SimpleNamespace(Connection=object, Cursor=sqlite3.Cursor),
        "_conn": ordinary,
        "_write_conn": writer,
        "_write_lock": lock or asyncio.Lock(),
        "_db_path": "fixture.db",
        "_transaction_connection": transaction_connection,
        "conn": conn,
    }
    exec(
        compile(ast.Module(body=nodes, type_ignores=[]), "db-runtime", "exec"),
        namespace,
    )
    namespace["transaction_connection"] = transaction_connection
    return namespace


class PatchContractTest(unittest.TestCase):
    def test_patch_is_idempotent_compilable_and_single_marker(self):
        patched_db = patch_db(DB_SOURCE)
        self.assertEqual(patched_db.count(DB_MARKER), 1)
        self.assertEqual(patch_db(patched_db), patched_db)
        compile(patched_db, "db.py", "exec")
        self.assertIn("aiosqlite.connect(path, isolation_level=None)", patched_db)
        self.assertIn('await _conn.execute("PRAGMA query_only=ON")', patched_db)
        self.assertIn("await cur.close()", patched_db)
        self.assertNotIn("recover_locked_main_connection", patched_db)
        self.assertNotIn('await conn().execute(\n        "UPDATE orders', patched_db)

    def test_patch_refuses_missing_or_duplicate_anchors(self):
        with self.assertRaisesRegex(RuntimeError, "expected one anchor, got 0"):
            patch_db(DB_SOURCE.replace(OLD_CLOSE_BLOCK, ""))
        with self.assertRaisesRegex(RuntimeError, "expected one anchor, got 2"):
            patch_db(DB_SOURCE + OLD_DB_BLOCK)

    def test_runtime_module_rewrites_direct_dml_and_rejects_new_bypass(self):
        patched = patch_handlers_admin(HANDLER_SOURCE)
        self.assertIn(f"# {MODULE_MARKER}:handlers_admin", patched)
        self.assertIn("await db._exec", patched)
        self.assertNotIn("await db.conn().execute(\"UPDATE", patched)
        self.assertEqual(patch_handlers_admin(patched), patched)
        compile(patched, "handlers_admin.py", "exec")

        bypass = HANDLER_SOURCE + '''
async def unreviewed_write():
    await db.conn().execute("DELETE FROM leads WHERE id=?", (1,))
'''
        with self.assertRaisesRegex(RuntimeError, "unsafe direct runtime SQL remains"):
            patch_handlers_admin(bypass)

    def test_multifile_apply_failure_restores_already_replaced_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            root = base / "root"
            db_path = root / "app" / "db.py"
            handler_path = root / "app" / "handlers" / "admin.py"
            handler_path.parent.mkdir(parents=True)
            db_path.write_text(DB_SOURCE, encoding="utf-8")
            handler_path.write_text(HANDLER_SOURCE, encoding="utf-8")
            before = {
                "db": sha256(db_path),
                "handlers_admin": sha256(handler_path),
            }
            after = {
                "db": sha256_text(patch_db(DB_SOURCE)),
                "handlers_admin": sha256_text(
                    patch_handlers_admin(HANDLER_SOURCE)
                ),
            }
            original_atomic = installer_module._atomic_text

            def fail_second(path, content, expected_current):
                if path == handler_path:
                    raise OSError("injected second-file failure")
                return original_atomic(path, content, expected_current)

            with mock.patch.object(
                installer_module, "_atomic_text", side_effect=fail_second
            ):
                with self.assertRaisesRegex(OSError, "injected second-file"):
                    install(
                        root,
                        base / "backups",
                        expected_before=before,
                        expected_after=after,
                    )
            self.assertEqual(db_path.read_text(encoding="utf-8"), DB_SOURCE)
            self.assertEqual(
                handler_path.read_text(encoding="utf-8"), HANDLER_SOURCE
            )

    def test_multifile_rollback_verify_failure_restores_post_image_set(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            root = base / "root"
            db_path = root / "app" / "db.py"
            handler_path = root / "app" / "handlers" / "admin.py"
            handler_path.parent.mkdir(parents=True)
            db_path.write_text(DB_SOURCE, encoding="utf-8")
            handler_path.write_text(HANDLER_SOURCE, encoding="utf-8")
            before = {
                "db": sha256(db_path),
                "handlers_admin": sha256(handler_path),
            }
            after = {
                "db": sha256_text(patch_db(DB_SOURCE)),
                "handlers_admin": sha256_text(
                    patch_handlers_admin(HANDLER_SOURCE)
                ),
            }
            installed = install(
                root,
                base / "backups",
                expected_before=before,
                expected_after=after,
            )
            original_require = installer_module._require_hash
            injected = False

            def fail_once_after_handler_restore(path, expected):
                nonlocal injected
                result = original_require(path, expected)
                if (
                    not injected
                    and path == handler_path
                    and expected == before["handlers_admin"]
                ):
                    injected = True
                    raise OSError("injected post-restore verify failure")
                return result

            with mock.patch.object(
                installer_module,
                "_require_hash",
                side_effect=fail_once_after_handler_restore,
            ):
                with self.assertRaisesRegex(OSError, "post-restore verify"):
                    rollback(
                        root,
                        Path(installed["backup"]),
                        expected_before=before,
                        expected_after=after,
                    )
            self.assertTrue(injected)
            self.assertEqual(sha256(db_path), after["db"])
            self.assertEqual(sha256(handler_path), after["handlers_admin"])

    def test_installer_is_exact_idempotent_and_rollback_is_exact(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            root = base / "root"
            db_path = root / "app" / "db.py"
            db_path.parent.mkdir(parents=True)
            db_path.write_text(DB_SOURCE, encoding="utf-8")
            db_path.chmod(0o640)
            before_stat = db_path.stat()
            before = {"db": sha256(db_path)}
            after = {"db": sha256_text(patch_db(DB_SOURCE))}
            backups = base / "backups"
            now = datetime(2026, 8, 25, 0, 0, tzinfo=timezone.utc)

            first = install(
                root,
                backups,
                expected_before=before,
                expected_after=after,
                now=now,
            )
            self.assertTrue(first["changed"])
            self.assertEqual(sha256(db_path), after["db"])
            self.assertEqual(db_path.stat().st_mode & 0o777, 0o640)
            self.assertEqual(db_path.stat().st_uid, before_stat.st_uid)
            self.assertEqual(db_path.stat().st_gid, before_stat.st_gid)
            backup = Path(first["backup"])
            self.assertEqual(sha256(backup / "db.py"), before["db"])

            second = install(
                root,
                backups,
                expected_before=before,
                expected_after=after,
                now=now,
            )
            self.assertFalse(second["changed"])
            self.assertIsNone(second["backup"])

            result = rollback(
                root,
                backup,
                expected_before=before,
                expected_after=after,
            )
            self.assertTrue(result["rolled_back"])
            self.assertEqual(db_path.read_text(encoding="utf-8"), DB_SOURCE)
            self.assertEqual(db_path.stat().st_uid, before_stat.st_uid)
            self.assertEqual(db_path.stat().st_gid, before_stat.st_gid)

    def test_installer_refuses_unknown_source_before_backup(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            root = base / "root"
            db_path = root / "app" / "db.py"
            db_path.parent.mkdir(parents=True)
            db_path.write_text(DB_SOURCE + "# drift\n", encoding="utf-8")
            before = {"db": sha256_text(DB_SOURCE)}
            after = {"db": sha256_text(patch_db(DB_SOURCE))}
            backups = base / "backups"
            with self.assertRaisesRegex(RuntimeError, "mixed or unknown"):
                install(
                    root,
                    backups,
                    expected_before=before,
                    expected_after=after,
                )
            self.assertFalse(backups.exists())


class DepositTransactionRuntimeTest(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_activation_posts_money_and_bonus_exactly_once(self):
        db_probe = DepositDbProbe()
        runtime = executable_deposit(db_probe)
        first, second = await asyncio.gather(
            runtime["activate_paid"](None, 1),
            runtime["activate_paid"](None, 1),
        )
        self.assertEqual(first["status"], "active")
        self.assertEqual(second["status"], "active")
        self.assertEqual(
            [row["kind"] for row in db_probe.deposit_ledger], ["topup"]
        )
        self.assertEqual(
            [row["kind"] for row in db_probe.bonus_ledger], ["deposit"]
        )
        self.assertFalse(db_probe.bonus_outside_transaction)
        self.assertEqual(runtime["notifications"], [7])

    async def test_bonus_failure_rolls_back_activation_as_one_unit(self):
        db_probe = DepositDbProbe()
        db_probe.fail_bonus_add = True
        runtime = executable_deposit(db_probe)
        with self.assertRaisesRegex(RuntimeError, "injected bonus failure"):
            await runtime["activate_paid"](None, 1)
        self.assertEqual(db_probe.deposits[1]["status"], "pending")
        self.assertEqual(db_probe.deposit_ledger, [])
        self.assertEqual(db_probe.bonus_ledger, [])

        db_probe.fail_bonus_add = False
        result = await runtime["activate_paid"](None, 1)
        self.assertEqual(result["status"], "active")
        self.assertEqual(len(db_probe.deposit_ledger), 1)
        self.assertEqual(len(db_probe.bonus_ledger), 1)

    async def test_concurrent_refund_posts_one_refund_and_one_revoke(self):
        db_probe = DepositDbProbe()
        db_probe.deposits[1]["status"] = "active"
        db_probe.deposit_ledger.append(
            {
                "user_id": 7,
                "delta": 20_000,
                "kind": "topup",
                "deposit_id": 1,
            }
        )
        db_probe.bonus_ledger.append(
            {
                "id": 1,
                "user_id": 7,
                "delta": 1_600,
                "kind": "deposit",
                "note": "+8% за пополнение депозита №1",
                "consumed": 600,
            }
        )
        db_probe.next_bonus_id = 2
        runtime = executable_deposit(db_probe)
        results = await asyncio.gather(
            runtime["refund"](1),
            runtime["refund"](1),
        )
        self.assertEqual(sorted(result[0] for result in results), [False, True])
        self.assertEqual(
            sorted(result[2] for result in results), [0, 19_400]
        )
        self.assertEqual(db_probe.deposits[1]["status"], "refunded")
        self.assertEqual(
            [
                row["kind"]
                for row in db_probe.deposit_ledger
                if row["kind"] == "refund"
            ],
            ["refund"],
        )
        self.assertEqual(
            [row["kind"] for row in db_probe.bonus_ledger].count("revoke"), 1
        )
        self.assertEqual(db_probe.bonus_ledger[0]["consumed"], 1_600)


class DedicatedWriterRuntimeTest(unittest.IsolatedAsyncioTestCase):
    async def test_busy_snapshot_reproducer_fails_old_lane_but_writer_succeeds(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "race.db"
            broken_raw = sqlite3.connect(path, timeout=5)
            ordinary_raw = sqlite3.connect(path, timeout=5)
            analytics_raw = sqlite3.connect(path, timeout=5)
            writer_raw = sqlite3.connect(path, timeout=5, isolation_level=None)
            try:
                broken_raw.execute("PRAGMA journal_mode=WAL")
                broken_raw.execute("CREATE TABLE rows(value INTEGER)")
                broken_raw.executemany(
                    "INSERT INTO rows(value) VALUES(?)",
                    ((1,), (2,)),
                )
                broken_raw.commit()

                broken_cursor = broken_raw.execute("SELECT value FROM rows")
                ordinary_cursor = ordinary_raw.execute("SELECT value FROM rows")
                self.assertEqual(broken_cursor.fetchone()[0], 1)
                self.assertEqual(ordinary_cursor.fetchone()[0], 1)
                analytics_raw.execute("UPDATE rows SET value=value+10")
                analytics_raw.commit()

                with self.assertRaisesRegex(
                    sqlite3.OperationalError, "locked"
                ) as caught:
                    broken_raw.execute("UPDATE rows SET value=value+1")
                error_name = getattr(caught.exception, "sqlite_errorname", None)
                if error_name is not None:  # Added by CPython after production 3.10.
                    self.assertEqual(error_name, "SQLITE_BUSY_SNAPSHOT")
                self.assertTrue(broken_raw.in_transaction)

                ordinary = AsyncConnection(ordinary_raw)
                writer = AsyncConnection(writer_raw)
                runtime = executable_runtime(ordinary, writer)
                changed = await runtime["_exec"]("UPDATE rows SET value=value+1")
                self.assertEqual(changed.rowcount, 2)
                changed.close()
                self.assertEqual(ordinary.commit_calls, 0)
                self.assertEqual(ordinary.rollback_calls, 0)
                self.assertEqual(writer.commit_calls, 0)
                self.assertFalse(writer.in_transaction)

                broken_raw.rollback()
                broken_cursor.close()
                ordinary_cursor.close()
                self.assertEqual(
                    [
                        row[0]
                        for row in ordinary_raw.execute(
                            "SELECT value FROM rows ORDER BY value"
                        )
                    ],
                    [12, 13],
                )
            finally:
                writer_raw.close()
                analytics_raw.close()
                ordinary_raw.close()
                broken_raw.close()

    async def test_explicit_transaction_keeps_its_connection_and_rollback_owner(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "transaction.db"
            setup = sqlite3.connect(path)
            setup.execute("CREATE TABLE rows(value INTEGER)")
            setup.commit()
            setup.close()
            ordinary_raw = sqlite3.connect(path)
            writer_raw = sqlite3.connect(path, isolation_level=None)
            explicit_raw = sqlite3.connect(path)
            observer = sqlite3.connect(path)
            try:
                ordinary = AsyncConnection(ordinary_raw)
                writer = AsyncConnection(writer_raw)
                explicit = AsyncConnection(explicit_raw)
                runtime = executable_runtime(ordinary, writer)
                token = runtime["transaction_connection"].set(explicit)
                try:
                    cur = await runtime["_exec"](
                        "INSERT INTO rows(value) VALUES(?)", (7,)
                    )
                    cur.close()
                    self.assertEqual(
                        observer.execute("SELECT count(*) FROM rows").fetchone()[0],
                        0,
                    )
                    await explicit.rollback()
                finally:
                    runtime["transaction_connection"].reset(token)
                self.assertEqual(
                    observer.execute("SELECT count(*) FROM rows").fetchone()[0],
                    0,
                )
                self.assertEqual(writer.execute_calls, 0)
                self.assertEqual(ordinary.commit_calls, 0)
            finally:
                observer.close()
                explicit_raw.close()
                writer_raw.close()
                ordinary_raw.close()

    async def test_query_only_reader_rejects_any_missed_direct_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "query-only.db"
            ordinary = sqlite3.connect(path)
            writer = sqlite3.connect(path, isolation_level=None)
            try:
                ordinary.execute("PRAGMA journal_mode=WAL")
                ordinary.execute("CREATE TABLE rows(value INTEGER)")
                ordinary.executemany("INSERT INTO rows(value) VALUES(?)", ((1,), (2,)))
                ordinary.commit()
                ordinary.execute("PRAGMA query_only=ON")
                stale = ordinary.execute("SELECT value FROM rows")
                self.assertEqual(stale.fetchone()[0], 1)
                writer.execute("UPDATE rows SET value=value+10")

                with self.assertRaises(sqlite3.OperationalError) as caught:
                    ordinary.execute("UPDATE rows SET value=value+1")
                self.assertIn("readonly", str(caught.exception).lower())
                self.assertNotIn("locked", str(caught.exception).lower())
                # sqlite3 may still open an implicit transaction before the
                # readonly guard fires; current pinned sources cannot reach
                # this path because the AST gate migrated every runtime DML.
                ordinary.rollback()
                self.assertFalse(ordinary.in_transaction)
                stale.close()
                self.assertEqual(
                    ordinary.execute(
                        "SELECT value FROM rows ORDER BY value"
                    ).fetchall(),
                    [(11,), (12,)],
                )
            finally:
                writer.close()
                ordinary.close()

    async def test_constraint_failure_does_not_poison_or_replay_writer(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "constraint.db"
            ordinary_raw = sqlite3.connect(path)
            writer_raw = sqlite3.connect(path, isolation_level=None)
            writer_raw.execute("CREATE TABLE rows(value INTEGER UNIQUE)")
            try:
                ordinary = AsyncConnection(ordinary_raw)
                writer = AsyncConnection(writer_raw)
                runtime = executable_runtime(ordinary, writer)
                first = await runtime["_exec"](
                    "INSERT INTO rows(value) VALUES(?)", (1,)
                )
                self.assertEqual(first.lastrowid, 1)
                first.close()
                with self.assertRaises(sqlite3.IntegrityError):
                    await runtime["_exec"](
                        "INSERT INTO rows(value) VALUES(?)", (1,)
                    )
                third = await runtime["_exec"](
                    "INSERT INTO rows(value) VALUES(?)", (2,)
                )
                self.assertEqual(third.lastrowid, 2)
                third.close()
                values = writer_raw.execute(
                    "SELECT value FROM rows ORDER BY value"
                ).fetchall()
                self.assertEqual(values, [(1,), (2,)])
                self.assertFalse(writer.in_transaction)
                self.assertEqual(writer.commit_calls, 0)
                self.assertEqual(writer.rollback_calls, 0)
            finally:
                writer_raw.close()
                ordinary_raw.close()

    async def test_lock_serializes_concurrent_single_statement_helpers(self):
        ordinary = CloseProbe()
        writer = SerializedProbe()
        runtime = executable_runtime(ordinary, writer)
        await asyncio.gather(
            *(
                runtime["_exec"]("UPDATE fixture SET value=?", (n,))
                for n in range(30)
            )
        )
        self.assertEqual(writer.max_active, 1)
        self.assertEqual(
            sorted(value[0] for value in writer.parameters),
            list(range(30)),
        )

    async def test_close_closes_both_connections_and_clears_runtime_state(self):
        ordinary = CloseProbe()
        writer = CloseProbe()
        runtime = executable_runtime(ordinary, writer)
        await runtime["close"]()
        self.assertEqual(ordinary.close_calls, 1)
        self.assertEqual(writer.close_calls, 1)
        self.assertIsNone(runtime["_conn"])
        self.assertIsNone(runtime["_write_conn"])
        self.assertIsNone(runtime["_write_lock"])
        self.assertIsNone(runtime["_db_path"])

    async def test_close_failure_still_closes_reader_and_clears_globals(self):
        ordinary = CloseProbe()
        writer = FailingCloseProbe()
        runtime = executable_runtime(ordinary, writer)
        with self.assertRaisesRegex(RuntimeError, "writer close failed"):
            await runtime["close"]()
        self.assertEqual(ordinary.close_calls, 1)
        self.assertEqual(writer.close_calls, 1)
        self.assertIsNone(runtime["_conn"])
        self.assertIsNone(runtime["_write_conn"])


@unittest.skipIf(real_aiosqlite is None, "aiosqlite is only in the production venv")
class RealAiosqliteIntegrationTest(unittest.IsolatedAsyncioTestCase):
    async def test_real_aiosqlite_writer_avoids_busy_snapshot(self):
        assert real_aiosqlite is not None
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "real-aiosqlite.db"
            setup = sqlite3.connect(path)
            setup.execute("PRAGMA journal_mode=WAL")
            setup.execute("CREATE TABLE rows(value INTEGER)")
            setup.executemany("INSERT INTO rows(value) VALUES(?)", ((1,), (2,)))
            setup.commit()
            setup.close()

            ordinary = await real_aiosqlite.connect(path)
            writer = await real_aiosqlite.connect(path, isolation_level=None)
            analytics = sqlite3.connect(path)
            try:
                await writer.execute("PRAGMA busy_timeout=5000")
                stale = await ordinary.execute("SELECT value FROM rows")
                self.assertEqual((await stale.fetchone())[0], 1)
                analytics.execute("UPDATE rows SET value=value+10")
                analytics.commit()

                with self.assertRaisesRegex(
                    real_aiosqlite.OperationalError, "locked"
                ) as caught:
                    await ordinary.execute("UPDATE rows SET value=value+1")
                error_name = getattr(caught.exception, "sqlite_errorname", None)
                if error_name is not None:  # Added by CPython after production 3.10.
                    self.assertEqual(error_name, "SQLITE_BUSY_SNAPSHOT")
                self.assertTrue(ordinary.in_transaction)
                await ordinary.rollback()

                runtime = executable_runtime(ordinary, writer)
                changed = await runtime["_exec"]("UPDATE rows SET value=value+1")
                self.assertEqual(changed.rowcount, 2)
                await changed.close()
                self.assertFalse(writer.in_transaction)
                await stale.close()

                verify = await ordinary.execute(
                    "SELECT value FROM rows ORDER BY value"
                )
                self.assertEqual(await verify.fetchall(), [(12,), (13,)])
                await verify.close()
            finally:
                analytics.close()
                await writer.close()
                await ordinary.close()


if __name__ == "__main__":
    unittest.main()
