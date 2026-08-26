from __future__ import annotations

import asyncio
import ast
import io
import json
import os
import re
import secrets
import shutil
import sqlite3
import stat
import subprocess
import tempfile
import time
import unittest
import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from backend.salon_bot import out001_synthetic as runtime
from backend.salon_bot import install_out001_synthetic as installer
from backend.salon_bot import out001_probe as probe


HERE = Path(__file__).resolve()
MIGRATION = HERE.parents[1] / "migrations" / "0010_out001_synthetic.sql"
NOW = 1_787_680_000
RUN_ID = "out001_" + "a" * 32
REQUEST_ID = "syn_" + "b" * 40
CONSENT_DOC = "offer:2026-08-23|privacy:2026-08-23"
SECRET = b"s" * 32


BASE_SCHEMA = """
CREATE TABLE schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'new',
  work_type TEXT, work_label TEXT,
  discipline TEXT, term TEXT, tier TEXT,
  topic TEXT, details TEXT,
  deadline_text TEXT, deadline_date TEXT,
  quote_low INTEGER, quote_high INTEGER,
  price INTEGER, prepay INTEGER,
  source TEXT DEFAULT 'bot',
  admin_note TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
, access_token TEXT, guest_name TEXT, guest_contact TEXT, cancel_reason TEXT, bonus_spent INTEGER, consent_at TEXT, consent_doc TEXT, page TEXT, topic_id INTEGER, ref_hint INTEGER, stages_total INTEGER, stage INTEGER DEFAULT 1, parts_done INTEGER DEFAULT 0, archived_client INTEGER DEFAULT 0, archived_admin INTEGER DEFAULT 0, paused INTEGER DEFAULT 0, paused_by TEXT, paused_at TEXT, pinned_client INTEGER DEFAULT 0, final_ready INTEGER DEFAULT 0, final_ready_at TEXT, files_seen_at TEXT, part_ready INTEGER DEFAULT 0, sub_discount INTEGER DEFAULT 0, promo_code TEXT, promo_discount INTEGER DEFAULT 0, pinned_admin INTEGER DEFAULT 0, color TEXT, deleted INTEGER DEFAULT 0, gift_code TEXT, gift_amount INTEGER DEFAULT 0, handoff_artifact_id INTEGER, handoff_phase TEXT, handoff_version INTEGER DEFAULT 0, client_request_id TEXT, request_fingerprint TEXT, access_token_digest TEXT);
CREATE INDEX idx_orders_access_token_digest ON orders(access_token_digest)
  WHERE access_token_digest IS NOT NULL;
CREATE UNIQUE INDEX idx_orders_client_request ON orders(client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_user ON orders(user_id);
CREATE TABLE users(
  id INTEGER PRIMARY KEY,
  username TEXT, first_name TEXT, last_name TEXT, phone TEXT, source TEXT,
  created_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
  banned INTEGER DEFAULT 0, referrer_id INTEGER, welcome_at TEXT, email TEXT,
  subscribed INTEGER DEFAULT 1, subscribed_at TEXT
);
CREATE TABLE doc_consent_contract(scope TEXT, expected TEXT);
INSERT INTO doc_consent_contract VALUES('order','offer:2026-08-23|privacy:2026-08-23');
CREATE TABLE order_events(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE delivery_outbox(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  done_steps TEXT NOT NULL DEFAULT '',
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(order_id,kind)
);
CREATE TABLE web_guest_sessions(
  token_digest TEXT PRIMARY KEY,
  created_at TEXT,
  last_used_at TEXT,
  expires_at TEXT
);
CREATE TABLE web_guest_orders(
  token_digest TEXT NOT NULL REFERENCES web_guest_sessions(token_digest),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  created_at TEXT,
  PRIMARY KEY(token_digest,order_id)
);
CREATE TABLE order_claim_exchanges(
  state_digest TEXT PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  channel TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE TABLE order_files(
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id)
);
CREATE TABLE order_items(
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id)
);
CREATE TABLE payments(
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  amount INTEGER
);
CREATE TABLE bonus_ledger(
  id INTEGER PRIMARY KEY,user_id INTEGER,delta INTEGER,consumed INTEGER,
  order_id INTEGER
);
CREATE TABLE delivery_artifacts(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE deposit_ledger(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE deposit_v2_ops(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE deposit_v2_reward_claims(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE economic_lot_reward_adjustments(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE economic_order_reward_refunds(
  id INTEGER PRIMARY KEY,order_id INTEGER,complete INTEGER
);
CREATE TABLE economic_reward_reversals(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE gift_ledger(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE leads(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE messages(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE msg_map(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE offers(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE order_specifications(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE payment_receipts(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE promo_first_order_claims(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE promo_retention_grants(id INTEGER PRIMARY KEY,consumed_order_id INTEGER);
CREATE TABLE referral_v2_obligations(
  id INTEGER PRIMARY KEY,amount INTEGER,state TEXT,source_order_id INTEGER
);
CREATE TABLE reviews(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE subscriptions(
  id INTEGER PRIMARY KEY,price INTEGER,status TEXT,order_id INTEGER,user_id INTEGER
);
CREATE TABLE tips(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TABLE visits(id INTEGER PRIMARY KEY,order_id INTEGER);
CREATE TRIGGER trg_dep_v2_bonus_spend_tombstone_guard
BEFORE UPDATE OF bonus_spent ON orders
WHEN COALESCE(NEW.bonus_spent,0)>COALESCE(OLD.bonus_spent,0)
  AND EXISTS(
    SELECT 1 FROM economic_order_reward_refunds r
    WHERE r.order_id=NEW.id AND r.complete=1
  )
BEGIN SELECT RAISE(ABORT,'economic_order_reward_tombstone'); END;
CREATE TRIGGER trg_orders_site_consent_before_insert
BEFORE INSERT ON orders
WHEN NEW.source = 'сайт' AND (
  NEW.consent_at IS NULL
  OR length(trim(NEW.consent_at)) = 0
  OR NEW.consent_doc IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM doc_consent_contract
    WHERE scope = 'order' AND expected = NEW.consent_doc
  )
)
BEGIN
  SELECT RAISE(ABORT, 'order consent required');
END;
CREATE TRIGGER trg_orders_site_consent_before_update
BEFORE UPDATE OF consent_at, consent_doc ON orders
WHEN NEW.source = 'сайт' AND (
  NEW.consent_at IS NULL
  OR length(trim(NEW.consent_at)) = 0
  OR NEW.consent_doc IS NULL
  OR NOT EXISTS (
    SELECT 1 FROM doc_consent_contract
    WHERE scope = 'order' AND expected = NEW.consent_doc
  )
)
BEGIN
  SELECT RAISE(ABORT, 'order consent required');
END;
"""


class Request:
    def __init__(
        self,
        *,
        method: str = "POST",
        path: str = "/api/orders",
        query: str = "",
        cookies: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
        host: str = "akademsalon.ru",
    ) -> None:
        self.method = method
        self.path = path
        self.query_string = query
        self.rel_url = SimpleNamespace(query_string=query)
        self.cookies = cookies or {}
        self.host = host
        self.headers = {
            "Content-Type": "application/json",
            "X-Session-Mode": "cookie",
            **(headers or {}),
        }


def context(run_id: str = RUN_ID, request_id: str = REQUEST_ID) -> runtime.SyntheticContext:
    return runtime.SyntheticContext(run_id, request_id, CONSENT_DOC)


def signed_request(body: dict, *, secret: bytes = SECRET, now: int = NOW) -> Request:
    return Request(
        headers={
            "X-Salon-Out001-Timestamp": str(now),
            "X-Salon-Out001-Signature": runtime.request_signature(secret, now, body),
        }
    )


class CandidateRequest(Request):
    def __init__(self, body: dict, **kwargs) -> None:
        super().__init__(**kwargs)
        self._body = dict(body)
        self.app = {"bot": object()}
        self.query: dict[str, str] = {}
        self.match_info: dict[str, str] = {}
        self.user = None

    async def json(self) -> dict:
        return dict(self._body)


class CandidateDB:
    class PromoEligibilityError(RuntimeError):
        pass

    def __init__(self, *, race: bool = False) -> None:
        self.race = race
        self.lookup_count = 0
        self.row: dict | None = None
        self.created_args: dict | None = None
        self.claim_creates = 0
        self.guest_adds = 0
        self.membership = False
        self.delivery_rows: list[dict] = []
        self.failed_rows: list[tuple] = []
        self.marked_seen = 0

    async def order_by_client_request(self, _request_id: str, **_kwargs):
        self.lookup_count += 1
        if self.race and self.lookup_count == 1:
            return None
        return self.row

    async def items_for_order(self, _order_id: int) -> list:
        return []

    @staticmethod
    def now_iso() -> str:
        return "2026-08-26T00:00:00"

    async def get_user(self, _user_id: int):
        return None

    async def create_order(self, **kwargs) -> int:
        self.created_args = dict(kwargs)
        order_id = 701
        self.row = {
            **kwargs,
            "id": order_id,
            "user_id": kwargs.get("user_id"),
            "guest_contact": kwargs.get("guest_contact"),
            "request_fingerprint": kwargs.get("request_fingerprint"),
            "access_token": kwargs.get("access_token"),
            "synthetic": int(kwargs.get("synthetic") or 0),
            "test_run_id": kwargs.get("test_run_id"),
            "synthetic_run_hash": kwargs.get("synthetic_run_hash"),
            "files_seen_at": None,
        }
        if self.race:
            raise sqlite3.IntegrityError("UNIQUE client_request_id")
        return order_id

    async def get_order(self, _order_id: int, **_kwargs):
        return self.row

    async def guest_session_add_order(self, _token, _order_id: int) -> str:
        self.guest_adds += 1
        self.membership = True
        return "guest-cookie"

    async def claim_exchange_create(self, _order_id: int, **_kwargs) -> str:
        self.claim_creates += 1
        return "cx1_candidate"

    async def claim_exchange_consume(self, _state: str, **_kwargs):
        self.membership = True
        return 701, "guest-cookie"

    async def guest_session_orders(self, token: str) -> list[dict]:
        return [self.row] if token == "guest-cookie" and self.membership and self.row else []

    async def orders_by_tokens(self, _tokens: list[str]) -> list:
        return []

    async def unread_for_orders(self, _order_ids: list[int]) -> dict:
        return {}

    async def files_new_for_orders(self, _pairs: list[tuple]) -> dict:
        return {}

    async def msgs_mark_seen(self, _order_id: int) -> None:
        self.marked_seen += 1

    async def outbox_due(self) -> list[dict]:
        return list(self.delivery_rows)

    async def outbox_failed(self, order_id: int, kind: str, error: str) -> None:
        self.failed_rows.append((order_id, kind, error))


def _candidate_functions(text: str, names: set[str], namespace: dict) -> dict:
    tree = ast.parse(text)
    selected = [
        node
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        and node.name in names
    ]
    if {node.name for node in selected} != names:
        raise AssertionError("candidate handler missing")
    module = ast.Module(body=selected, type_ignores=[])
    ast.fix_missing_locations(module)
    exec(compile(module, "pinned-webapp.py", "exec"), namespace)
    return {name: namespace[name] for name in names}


def _candidate_namespace(database: CandidateDB, synthetic_context=None) -> dict:
    responses: list[dict] = []
    background: list[str] = []
    isolated_deliveries: list[int] = []

    async def session_user(request):
        return request.user

    def json_response(payload, status=200):
        value = {"status": status, "payload": dict(payload), "cookies": {}}
        responses.append(value)
        return value

    def error_response(code, status=400):
        return json_response({"ok": False, "error": code}, status)

    async def isolated_delivery(_database, order_id: int) -> None:
        isolated_deliveries.append(order_id)
        database.delivery_rows = []

    class RuntimePlane:
        ProbeError = runtime.ProbeError

        @staticmethod
        def authorize_order(_request, body):
            return synthetic_context if body.get("synthetic") else None

        @staticmethod
        def ensure_run_available(_database, _context):
            return "missing"

        deliver_isolated = staticmethod(isolated_delivery)

    def set_cookie(response, token: str) -> None:
        response["cookies"]["set"] = token

    def clear_cookie(response) -> None:
        response["cookies"]["clear"] = True

    async def order_access(_request, _order_id: int, **_kwargs):
        return database.row, None

    async def order_full(row):
        return {"id": row["id"], "files": []}

    return {
        "Bot": object,
        "GUEST_COOKIE": "guest",
        "OUTBOX_NEW_ORDER": "new_order",
        "OUTBOX_OUT001": runtime.OUTBOX_KIND,
        "_bg": lambda label, _factory: background.append(label),
        "_cart_items": lambda _value: ([], 0, 0, []),
        "_clean_promo": lambda value: str(value or "").strip(),
        "_clear_guest_cookie": clear_cookie,
        "_err": error_response,
        "_ip": lambda _request: "127.0.0.1",
        "_json": json_response,
        "_order_access": order_access,
        "_order_full_json": order_full,
        "_order_json": lambda row, **_kwargs: {"id": row["id"]},
        "_promo_known_guest": lambda _request: False,
        "_rate_ok": lambda _ip_value, **_kwargs: True,
        "_request_fingerprint": lambda body: "fp:" + str(body.get("client_request_id")),
        "_sess_imp": lambda _user: False,
        "_session_user": session_user,
        "_set_guest_cookie": set_cookie,
        "background": background,
        "config": SimpleNamespace(
            ADMIN_IDS=set(), DB_PATH="candidate.db", ORDER_CONSENT_DOC=CONSENT_DOC,
            SITE_URL="https://akademsalon.ru", SVC_BY_ID={}, TYPE_BY_ID={},
        ),
        "datetime": datetime,
        "db": database,
        "deliver_new_order": lambda _bot, _order_id: None,
        "gift_svc": SimpleNamespace(),
        "intake_guard": SimpleNamespace(
            evaluate_payload=lambda _body: SimpleNamespace(blocked=False)
        ),
        "isolated_deliveries": isolated_deliveries,
        "log": SimpleNamespace(error=lambda *_a, **_k: None,
                               info=lambda *_a, **_k: None,
                               warning=lambda *_a, **_k: None),
        "out001_synthetic": RuntimePlane,
        "promo_svc": SimpleNamespace(),
        "re": re,
        "responses": responses,
        "secrets": SimpleNamespace(token_urlsafe=lambda _n: "candidate-token"),
        "sqlite3": sqlite3,
        "timezone": timezone,
        "web": SimpleNamespace(Request=object, Response=object),
    }


def capability_path(root: Path, *, now: int = NOW) -> Path:
    directory = root.resolve() / "run"
    directory.mkdir(mode=0o700)
    path = directory / "capability.json"
    runtime.write_capability(
        path,
        runtime.make_capability(
            RUN_ID,
            REQUEST_ID,
            CONSENT_DOC,
            SECRET,
            issued_at=now - 1,
            ttl=180,
        ),
    )
    return path


def create_database(root: Path) -> Path:
    database = root / "salon.db"
    connection = sqlite3.connect(database)
    try:
        connection.executescript(BASE_SCHEMA)
        connection.execute(
            "INSERT INTO doc_consent_contract(scope,expected) VALUES('order',?)",
            (probe.config.ORDER_CONSENT_DOC,),
        )
        connection.executescript(MIGRATION.read_text(encoding="utf-8"))
    finally:
        connection.close()
    return database


def order_fields(ctx: runtime.SyntheticContext, **overrides) -> dict:
    values = {
        "status": "new",
        "work_type": runtime.FIXTURE_TYPE,
        "work_label": "Индивидуальная задача",
        "topic": runtime.FIXTURE_TOPIC,
        "details": runtime.FIXTURE_DETAILS,
        "source": "сайт",
        "created_at": "2026-08-26T00:00:00",
        "updated_at": "2026-08-26T00:00:00",
        "access_token": "enc:probe-token",
        "access_token_digest": "digest-probe-token",
        "guest_name": runtime.FIXTURE_NAME,
        "guest_contact": None,
        "consent_at": "2026-08-26T00:00:00",
        "consent_doc": ctx.consent_doc,
        "page": runtime.FIXTURE_PAGE,
        "client_request_id": ctx.request_id,
        "request_fingerprint": "fingerprint",
        "synthetic": 1,
        "test_run_id": ctx.run_id,
        "synthetic_run_hash": ctx.run_hash,
        "synthetic_sink": runtime.ISOLATED_SINK,
    }
    values.update(overrides)
    return values


def insert_order(connection: sqlite3.Connection, ctx: runtime.SyntheticContext, **overrides) -> int:
    values = order_fields(ctx, **overrides)
    columns = list(values)
    cursor = connection.execute(
        f"INSERT INTO orders({','.join(columns)}) VALUES({','.join('?' for _ in columns)})",
        tuple(values[name] for name in columns),
    )
    return int(cursor.lastrowid)


def insert_bundle(database: Path, *, membership: bool = True) -> int:
    ctx = context()
    connection = sqlite3.connect(database)
    try:
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("BEGIN IMMEDIATE")
        order_id = insert_order(connection, ctx)
        connection.execute(
            "INSERT INTO order_events(order_id,kind,data,created_at) VALUES(?,?,?,?)",
            (order_id, "created", "сайт", "2026-08-26T00:00:00"),
        )
        connection.execute(
            "INSERT INTO delivery_outbox"
            "(order_id,kind,status,attempts,done_steps,next_attempt_at,created_at,updated_at) "
            "VALUES(?,?,'pending',0,'',?,?,?)",
            (
                order_id,
                runtime.OUTBOX_KIND,
                "2026-08-26T00:00:00",
                "2026-08-26T00:00:00",
                "2026-08-26T00:00:00",
            ),
        )
        connection.commit()
        if membership:
            connection.execute(
                "INSERT INTO web_guest_sessions VALUES(?,?,?,?)",
                ("guest-digest", "created", "used", "expires"),
            )
            connection.execute(
                "INSERT INTO web_guest_orders VALUES(?,?,?)",
                ("guest-digest", order_id, "created"),
            )
            connection.execute(
                "INSERT INTO order_claim_exchanges("
                "state_digest,order_id,channel,created_at,expires_at,consumed_at) "
                "VALUES(?,?,?,?,?,NULL)",
                ("claim-digest", order_id, "order_create", "created", "expires"),
            )
            connection.commit()
        return order_id
    finally:
        connection.close()


class AuthorizationTests(unittest.TestCase):
    def test_ordinary_payload_never_reads_capability(self) -> None:
        self.assertIsNone(runtime.authorize_order(Request(), {"topic": "обычная заявка"}))

    def test_exact_signed_fixture_is_the_only_enabled_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            cap = capability_path(root)
            body = runtime.fixture_body(context())
            approved = runtime.authorize_order(
                signed_request(body), body, capability_path=cap, now=NOW,
                expected_uid=os.geteuid(),
            )
            self.assertEqual(approved, context())

            variants = []
            for key, value in (
                ("type", "essay"),
                ("contact", "real@example.com"),
                ("promo", "ПЕРВЫЙЛИСТ"),
                ("cart", {"items": []}),
                ("ref", 1),
                ("deadline", "tomorrow"),
            ):
                changed = dict(body)
                changed[key] = value
                variants.append(changed)
            for changed in variants:
                with self.subTest(keys=sorted(changed)):
                    with self.assertRaises(runtime.ProbeError):
                        runtime.authorize_order(
                            signed_request(changed),
                            changed,
                            capability_path=cap,
                            now=NOW,
                            expected_uid=os.geteuid(),
                        )

    def test_transport_signature_and_capability_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            cap = capability_path(root)
            body = runtime.fixture_body(context())
            base = signed_request(body)
            requests = (
                Request(method="PUT", headers=base.headers),
                Request(path="/api/orders/", headers=base.headers),
                Request(query="token=secret", headers=base.headers),
                Request(cookies={"session": "real"}, headers=base.headers),
                Request(headers={**base.headers, "Authorization": "Bearer real"}),
                Request(headers={**base.headers, "Cookie": "real=1"}),
                Request(headers={**base.headers, "X-CSRF-Token": "real"}),
                Request(headers={**base.headers, "X-Order-Tokens": "real"}),
                Request(headers={**base.headers, "Content-Type": "text/plain"}),
                Request(headers={**base.headers, "X-Session-Mode": "legacy"}),
                Request(
                    headers={
                        **base.headers,
                        "X-Salon-Out001-Timestamp": str(NOW - 61),
                    }
                ),
                Request(
                    headers={
                        **base.headers,
                        "X-Salon-Out001-Signature": "0" * 64,
                    }
                ),
            )
            for request in requests:
                with self.subTest(method=request.method, path=request.path):
                    with self.assertRaises(runtime.ProbeError):
                        runtime.authorize_order(
                            request, body, capability_path=cap, now=NOW,
                            expected_uid=os.geteuid(),
                        )

            wrong_host = signed_request(body)
            wrong_host.host = "example.net"
            with self.assertRaisesRegex(runtime.ProbeError, "synthetic_transport_forbidden"):
                runtime.authorize_order(
                    wrong_host,
                    body,
                    capability_path=cap,
                    now=NOW,
                    expected_uid=os.geteuid(),
                )
            with self.assertRaisesRegex(runtime.ProbeError, "synthetic_origin_invalid"):
                runtime.canonical_origin("https://user:pass@example.net/")

    def test_reserved_fields_and_expired_or_unsafe_capabilities_fail(self) -> None:
        body = runtime.fixture_body(context())
        with self.assertRaisesRegex(runtime.ProbeError, "synthetic_reserved_fields"):
            runtime.authorize_order(Request(), {"synthetic": True})
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            cap = capability_path(root)
            cap.chmod(0o640)
            with self.assertRaises(runtime.ProbeError):
                runtime.authorize_order(
                    signed_request(body), body, capability_path=cap, now=NOW,
                    expected_uid=os.geteuid(),
                )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            directory = root / "run"
            directory.mkdir(mode=0o700)
            cap = directory / "capability.json"
            runtime.write_capability(
                cap,
                runtime.make_capability(
                    RUN_ID, REQUEST_ID, CONSENT_DOC, SECRET,
                    issued_at=NOW - 400, ttl=180,
                ),
            )
            with self.assertRaises(runtime.ProbeError):
                runtime.authorize_order(
                    signed_request(body), body, capability_path=cap, now=NOW,
                    expected_uid=os.geteuid(),
                )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            cap = capability_path(root)
            os.link(cap, cap.with_name("second-link"))
            with self.assertRaises(runtime.ProbeError):
                runtime.authorize_order(
                    signed_request(body), body, capability_path=cap, now=NOW,
                    expected_uid=os.geteuid(),
                )

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            real = root / "real"
            real.mkdir(mode=0o700)
            link = root / "linked"
            link.symlink_to(real, target_is_directory=True)
            cap = real / "capability.json"
            runtime.write_capability(
                cap,
                runtime.make_capability(
                    RUN_ID, REQUEST_ID, CONSENT_DOC, SECRET,
                    issued_at=NOW - 1,
                ),
            )
            with self.assertRaises(runtime.ProbeError):
                runtime.authorize_order(
                    signed_request(body), body,
                    capability_path=link / "capability.json", now=NOW,
                    expected_uid=os.geteuid(),
                )


class MigrationTests(unittest.TestCase):
    def test_migration_is_strict_and_ordinary_insert_is_unchanged(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            database = create_database(Path(tmp))
            connection = sqlite3.connect(database)
            try:
                connection.execute(
                    "INSERT INTO orders(created_at,updated_at,topic) VALUES(?,?,?)",
                    ("now", "now", "ordinary"),
                )
                connection.commit()
                ordinary = connection.execute(
                    "SELECT synthetic,test_run_id,synthetic_sink FROM orders"
                ).fetchone()
                self.assertEqual(ordinary, (0, None, None))
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "UPDATE orders SET test_run_id=? WHERE synthetic=0",
                        (RUN_ID,),
                    )
                connection.rollback()

                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "INSERT INTO synthetic_probe_tombstones VALUES(?,?,?,?,1,'cleaned','now')",
                        ("z" * 64, "1" * 64, "2" * 64, 0),
                    )
                connection.rollback()

                with self.assertRaises(sqlite3.IntegrityError):
                    insert_order(connection, context(), guest_contact="real@example.com")
                connection.rollback()

                order_id = insert_order(connection, context())
                connection.commit()
                with self.assertRaises(sqlite3.IntegrityError):
                    connection.execute(
                        "UPDATE orders SET status='priced' WHERE id=?", (order_id,)
                    )
                connection.rollback()
            finally:
                connection.close()

    def test_exact_tombstone_lookup_reports_orphan_residue(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            database = create_database(Path(tmp))
            guard = runtime.economic_guard_digest(database)
            order_id = insert_bundle(database)
            asyncio.run(runtime.deliver_isolated(database, order_id))
            dry = runtime.cleanup(
                database,
                RUN_ID,
                order_id,
                expected_economic_guard=guard,
            )
            runtime.cleanup(
                database,
                RUN_ID,
                order_id,
                apply=True,
                dry_run_digest=dry["cleanup"]["dry_run_digest"],
                expected_economic_guard=guard,
            )
            connection = sqlite3.connect(database)
            try:
                connection.execute("PRAGMA foreign_keys=OFF")
                connection.execute(
                    "INSERT INTO order_events(order_id,kind,created_at) "
                    "VALUES(?,'created','late')",
                    (order_id,),
                )
                connection.commit()
            finally:
                connection.close()
            evidence = runtime.lookup(database, RUN_ID, order_id=order_id)
            self.assertEqual(evidence["state"], "residual")
            self.assertFalse(evidence["cleanup"]["active_zero"])
            self.assertEqual(evidence["counts"]["created_event"], 1)
            self.assertIn("cleanup_residual", evidence["blockers"]["codes"])

    def test_order_event_outbox_marker_share_one_transaction(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            database = create_database(Path(tmp))
            connection = sqlite3.connect(database)
            try:
                connection.execute("BEGIN IMMEDIATE")
                insert_order(connection, context())
                connection.rollback()
                self.assertEqual(connection.execute("SELECT count(*) FROM orders").fetchone()[0], 0)

                connection.execute("BEGIN IMMEDIATE")
                order_id = insert_order(connection, context())
                connection.execute(
                    "INSERT INTO order_events(order_id,kind,created_at) VALUES(?, 'created', 'now')",
                    (order_id,),
                )
                connection.execute(
                    "INSERT INTO delivery_outbox"
                    "(order_id,kind,status,next_attempt_at,created_at,updated_at) "
                    "VALUES(?,?,'pending','now','now','now')",
                    (order_id, runtime.OUTBOX_KIND),
                )
                connection.commit()
                self.assertEqual(connection.execute("SELECT count(*) FROM orders").fetchone()[0], 1)
                self.assertEqual(connection.execute("SELECT count(*) FROM order_events").fetchone()[0], 1)
                self.assertEqual(connection.execute("SELECT count(*) FROM delivery_outbox").fetchone()[0], 1)
            finally:
                connection.close()


class LifecycleTests(unittest.TestCase):
    def test_delivery_lookup_cleanup_and_second_noop(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            database = create_database(Path(tmp))
            economic_guard = runtime.economic_guard_digest(database)
            order_id = insert_bundle(database)
            self.assertEqual(runtime.ensure_run_available(database, context()), "active")

            asyncio.run(runtime.deliver_isolated(database, order_id))
            asyncio.run(runtime.deliver_isolated(database, order_id))
            evidence = runtime.lookup(database, RUN_ID, order_id=order_id)
            self.assertTrue(evidence["proof_ready"])
            self.assertEqual(evidence["counts"]["receipt"], 1)
            serialized = json.dumps(evidence, sort_keys=True)
            for secret_value in (
                RUN_ID,
                REQUEST_ID,
                "probe-token",
                "guest-digest",
                "claim-digest",
            ):
                self.assertNotIn(secret_value, serialized)
            self.assertNotIn("order_id", evidence)
            self.assertLessEqual(len(serialized.encode()), 4096)

            dry = runtime.cleanup(
                database,
                RUN_ID,
                order_id,
                expected_economic_guard=economic_guard,
            )
            digest = dry["cleanup"]["dry_run_digest"]
            self.assertRegex(digest, r"^[0-9a-f]{64}$")
            with self.assertRaisesRegex(runtime.CleanupBlocked, "synthetic_dry_run_required"):
                runtime.cleanup(
                    database,
                    RUN_ID,
                    order_id,
                    apply=True,
                    expected_economic_guard=economic_guard,
                )
            with self.assertRaisesRegex(runtime.CleanupBlocked, "synthetic_cleanup_changed"):
                runtime.cleanup(
                    database,
                    RUN_ID,
                    order_id,
                    apply=True,
                    dry_run_digest="0" * 64,
                    expected_economic_guard=economic_guard,
                )

            cleaned = runtime.cleanup(
                database,
                RUN_ID,
                order_id,
                apply=True,
                dry_run_digest=digest,
                expected_economic_guard=economic_guard,
            )
            self.assertTrue(cleaned["cleanup"]["applied"])
            self.assertTrue(cleaned["cleanup"]["active_zero"])
            self.assertEqual(sum(cleaned["counts"].values()), 0)
            run_only = runtime.lookup(database, RUN_ID)
            self.assertEqual(run_only["state"], "retired")
            self.assertFalse(run_only["cleanup"]["active_zero"])
            self.assertEqual(
                runtime.lookup(database, RUN_ID, order_id=order_id)["state"],
                "cleaned",
            )
            second = runtime.cleanup(database, RUN_ID, order_id, apply=True)
            self.assertTrue(second["cleanup"]["second_noop"])
            with self.assertRaisesRegex(runtime.CleanupBlocked, "synthetic_exact_id_mismatch"):
                runtime.cleanup(database, RUN_ID, order_id + 1)
            with self.assertRaisesRegex(runtime.ProbeError, "synthetic_run_retired"):
                runtime.ensure_run_available(database, context())

            connection = sqlite3.connect(database)
            try:
                self.assertEqual(connection.execute("SELECT count(*) FROM orders").fetchone()[0], 0)
                self.assertEqual(connection.execute("SELECT count(*) FROM web_guest_sessions").fetchone()[0], 0)
                tombstone = connection.execute(
                    "SELECT run_hash,tuple_hash,proof_digest,surface_mask FROM synthetic_probe_tombstones"
                ).fetchone()
                self.assertEqual(len(tombstone), 4)
                self.assertNotIn(RUN_ID, "".join(map(str, tombstone)))
                tombstone_columns = {
                    row[1]
                    for row in connection.execute(
                        "PRAGMA table_info(synthetic_probe_tombstones)"
                    )
                }
                self.assertNotIn("order_id", tombstone_columns)
                self.assertNotIn("request_id", tombstone_columns)
            finally:
                connection.close()

    def test_cleanup_delete_cardinality_quarantines_ignored_membership_or_session(self) -> None:
        for table in ("web_guest_orders", "web_guest_sessions"):
            with self.subTest(table=table), tempfile.TemporaryDirectory() as tmp:
                database = create_database(Path(tmp))
                guard = runtime.economic_guard_digest(database)
                order_id = insert_bundle(database)
                asyncio.run(runtime.deliver_isolated(database, order_id))
                dry = runtime.cleanup(
                    database,
                    RUN_ID,
                    order_id,
                    expected_economic_guard=guard,
                )
                connection = sqlite3.connect(database)
                try:
                    connection.execute(
                        f"CREATE TRIGGER ignore_out001_delete BEFORE DELETE ON {table} "
                        "BEGIN SELECT RAISE(IGNORE); END"
                    )
                    connection.commit()
                finally:
                    connection.close()
                with self.assertRaises(runtime.CleanupBlocked):
                    runtime.cleanup(
                        database,
                        RUN_ID,
                        order_id,
                        apply=True,
                        dry_run_digest=dry["cleanup"]["dry_run_digest"],
                        expected_economic_guard=guard,
                    )
                connection = sqlite3.connect(database)
                try:
                    self.assertEqual(
                        connection.execute(
                            "SELECT count(*) FROM orders WHERE id=?", (order_id,)
                        ).fetchone()[0],
                        1,
                    )
                    self.assertEqual(
                        connection.execute(
                            "SELECT count(*) FROM web_guest_orders WHERE order_id=?",
                            (order_id,),
                        ).fetchone()[0],
                        1,
                    )
                    self.assertEqual(
                        connection.execute(
                            "SELECT count(*) FROM web_guest_sessions WHERE token_digest='guest-digest'"
                        ).fetchone()[0],
                        1,
                    )
                    self.assertEqual(
                        connection.execute(
                            "SELECT count(*) FROM synthetic_probe_tombstones"
                        ).fetchone()[0],
                        0,
                    )
                finally:
                    connection.close()

    def test_isolated_delivery_replays_once_across_process_restarts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            database = create_database(Path(tmp))
            order_id = insert_bundle(database)
            program = (
                "import asyncio,sys; "
                "from backend.salon_bot import out001_synthetic as runtime; "
                "asyncio.run(runtime.deliver_isolated(sys.argv[1],int(sys.argv[2])))"
            )
            for _ in range(2):
                subprocess.run(
                    [sys.executable, "-c", program, str(database), str(order_id)],
                    cwd=HERE.parents[3],
                    check=True,
                    capture_output=True,
                    text=True,
                )
            connection = sqlite3.connect(database)
            try:
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM synthetic_delivery_receipts WHERE order_id=?",
                        (order_id,),
                    ).fetchone()[0],
                    1,
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT status FROM delivery_outbox WHERE order_id=? AND kind=?",
                        (order_id, runtime.OUTBOX_KIND),
                    ).fetchone()[0],
                    "done",
                )
            finally:
                connection.close()


class ProbeAndInstallerTests(unittest.TestCase):
    def test_probe_refuses_noncanonical_or_credentialed_origin_before_http(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            database = create_database(Path(tmp))
            for origin in (
                "https://example.net",
                "https://user:pass@akademsalon.ru",
                "https://akademsalon.ru:444",
                "https://akademsalon.ru/?redirect=1",
            ):
                with self.subTest(origin=origin), self.assertRaises(probe.ProbeRunError):
                    probe.run_probe(
                        base_url=origin,
                        database=database,
                        capability=Path(tmp) / "never-created.json",
                        migration=MIGRATION,
                        require_root=False,
                        run_id=RUN_ID,
                    )

    def test_probe_failure_is_bounded_run_bound_json_without_traceback(self) -> None:
        capture = SimpleNamespace(buffer=io.BytesIO())
        with (
            patch.object(probe, "run_probe", side_effect=ValueError("raw secret")),
            patch.object(sys, "stdout", capture),
        ):
            code = probe.main(["--base-url", probe.config.SITE_URL])
        self.assertEqual(code, 1)
        raw = capture.buffer.getvalue()
        self.assertLessEqual(len(raw), probe.MAX_PUBLIC_BYTES + 1)
        self.assertNotIn(b"raw secret", raw)
        self.assertNotIn(b"Traceback", raw)
        payload = json.loads(raw)
        self.assertRegex(payload["run_hash"], r"^[0-9a-f]{64}$")

    def test_full_cycle_preserves_seeded_economics_and_detects_data_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            database = create_database(Path(tmp))
            connection = sqlite3.connect(database)
            try:
                connection.executescript(
                    """
                    CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
                    INSERT INTO settings VALUES('promo_campaign','on');
                    INSERT INTO bonus_ledger(id,user_id,delta,consumed,order_id)
                    VALUES(1,11,1000,0,NULL);
                    CREATE TABLE promos(code TEXT PRIMARY KEY,uses_left INTEGER);
                    INSERT INTO promos VALUES('LOYAL',10);
                    CREATE TABLE deposits(id INTEGER PRIMARY KEY,amount INTEGER,status TEXT);
                    INSERT INTO deposits VALUES(1,10000,'active');
                    CREATE TABLE deposit_v2_lots(
                      deposit_id INTEGER PRIMARY KEY,principal_available INTEGER
                    );
                    INSERT INTO deposit_v2_lots VALUES(1,10000);
                    CREATE TABLE deposit_v2_allocations(id INTEGER PRIMARY KEY,amount INTEGER);
                    INSERT INTO deposit_v2_allocations VALUES(1,2500);
                    CREATE TABLE economic_bonus_debts(id INTEGER PRIMARY KEY,amount INTEGER);
                    INSERT INTO economic_bonus_debts VALUES(1,500);
                    CREATE TABLE gifts(id INTEGER PRIMARY KEY,amount INTEGER,status TEXT);
                    INSERT INTO gifts VALUES(1,3000,'paid');
                    INSERT INTO subscriptions(id,price,status,order_id,user_id)
                    VALUES(1,4900,'active',NULL,NULL);
                    INSERT INTO referral_v2_obligations(id,amount,state,source_order_id)
                    VALUES(1,700,'pending',NULL);
                    INSERT INTO users(
                      id,username,phone,created_at,last_seen_at,email
                    ) VALUES(11,'new_user','+70000000000','2026-08-26','2026-08-26',
                             'new@example.test');
                    INSERT INTO orders(created_at,updated_at,topic,price)
                    VALUES('ordinary','ordinary','ordinary',4200);
                    INSERT INTO payments(id,order_id,amount) VALUES(1,1,4200);
                    """
                )
                connection.commit()
            finally:
                connection.close()
            before = probe.guard_digest(database)
            order_id = insert_bundle(database)
            asyncio.run(runtime.deliver_isolated(database, order_id))
            after_probe = probe.guard_digest(database)
            self.assertEqual(before, after_probe)
            dry = runtime.cleanup(
                database,
                RUN_ID,
                order_id,
                expected_economic_guard=before,
            )
            cleaned = runtime.cleanup(
                database,
                RUN_ID,
                order_id,
                apply=True,
                dry_run_digest=dry["cleanup"]["dry_run_digest"],
                expected_economic_guard=before,
            )
            self.assertTrue(cleaned["cleanup"]["economic_guard_unchanged"])
            self.assertEqual(before, probe.guard_digest(database))

            mutations = (
                "UPDATE bonus_ledger SET consumed=500 WHERE id=1",
                "UPDATE promos SET uses_left=9 WHERE code='LOYAL'",
                "UPDATE deposit_v2_lots SET principal_available=9000 WHERE deposit_id=1",
                "UPDATE gifts SET amount=2900 WHERE id=1",
                "UPDATE subscriptions SET price=4800 WHERE id=1",
                "UPDATE referral_v2_obligations SET amount=650 WHERE id=1",
                "UPDATE orders SET guest_contact='changed@example.test' WHERE id=1",
                "UPDATE orders SET work_type='sub_plus' WHERE id=1",
                "UPDATE orders SET parts_done=3 WHERE id=1",
                "UPDATE orders SET stages_total=1 WHERE id=1",
                "UPDATE users SET email='other@example.test' WHERE id=11",
                "UPDATE users SET phone='+71111111111' WHERE id=11",
                "UPDATE users SET username='other_user' WHERE id=11",
                "UPDATE users SET created_at='2026-08-27' WHERE id=11",
            )
            connection = sqlite3.connect(database)
            try:
                previous = before
                for statement in mutations:
                    connection.execute(statement)
                    connection.commit()
                    current = probe.guard_digest(database)
                    self.assertNotEqual(previous, current)
                    previous = current
            finally:
                connection.close()

    def test_economic_change_blocks_cleanup_before_any_delete(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            database = create_database(Path(tmp))
            connection = sqlite3.connect(database)
            try:
                connection.executescript(
                    "CREATE TABLE promos(code TEXT PRIMARY KEY,uses_left INTEGER);"
                    "INSERT INTO promos VALUES('LOYAL',10);"
                )
                connection.commit()
            finally:
                connection.close()
            guard = runtime.economic_guard_digest(database)
            order_id = insert_bundle(database)
            asyncio.run(runtime.deliver_isolated(database, order_id))
            connection = sqlite3.connect(database)
            try:
                connection.execute("UPDATE promos SET uses_left=9 WHERE code='LOYAL'")
                connection.commit()
            finally:
                connection.close()
            with self.assertRaisesRegex(runtime.CleanupBlocked, "synthetic_cleanup_changed"):
                runtime.cleanup(
                    database,
                    RUN_ID,
                    order_id,
                    expected_economic_guard=guard,
                )
            connection = sqlite3.connect(database)
            try:
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM orders WHERE id=?", (order_id,)
                    ).fetchone()[0],
                    1,
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM synthetic_probe_tombstones"
                    ).fetchone()[0],
                    0,
                )
            finally:
                connection.close()

    def test_eligibility_change_between_dry_run_and_apply_quarantines_all_surfaces(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            database = create_database(Path(tmp))
            connection = sqlite3.connect(database)
            try:
                connection.execute(
                    "INSERT INTO orders(created_at,updated_at,topic,work_type,parts_done,stages_total) "
                    "VALUES('ordinary','ordinary','ordinary','coursework',0,3)"
                )
                connection.commit()
            finally:
                connection.close()
            guard = runtime.economic_guard_digest(database)
            order_id = insert_bundle(database)
            asyncio.run(runtime.deliver_isolated(database, order_id))
            dry = runtime.cleanup(
                database,
                RUN_ID,
                order_id,
                expected_economic_guard=guard,
            )
            connection = sqlite3.connect(database)
            try:
                connection.execute(
                    "UPDATE orders SET work_type='sub_plus',parts_done=3,stages_total=1 "
                    "WHERE topic='ordinary'"
                )
                connection.commit()
            finally:
                connection.close()
            with self.assertRaisesRegex(runtime.CleanupBlocked, "synthetic_cleanup_changed"):
                runtime.cleanup(
                    database,
                    RUN_ID,
                    order_id,
                    apply=True,
                    dry_run_digest=dry["cleanup"]["dry_run_digest"],
                    expected_economic_guard=guard,
                )
            connection = sqlite3.connect(database)
            try:
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM orders WHERE id=? AND synthetic=1",
                        (order_id,),
                    ).fetchone()[0],
                    1,
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM delivery_outbox WHERE order_id=?",
                        (order_id,),
                    ).fetchone()[0],
                    1,
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM synthetic_delivery_receipts WHERE order_id=?",
                        (order_id,),
                    ).fetchone()[0],
                    1,
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM synthetic_probe_tombstones"
                    ).fetchone()[0],
                    0,
                )
            finally:
                connection.close()

    def test_lost_http_response_recovers_exact_run_and_leaves_no_active_rows(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            database = create_database(root)
            cap_parent = root / "run"
            cap_parent.mkdir(mode=0o700)
            capability = cap_parent / "capability.json"
            inserted = False

            def commit_then_lose(_opener, _url, **kwargs):
                nonlocal inserted
                if not inserted:
                    inserted = True
                    body = kwargs["body"]
                    ctx = runtime.SyntheticContext(
                        body["test_run_id"],
                        body["client_request_id"],
                        body["consent_doc"],
                    )
                    connection = sqlite3.connect(database)
                    try:
                        connection.execute("PRAGMA foreign_keys=ON")
                        connection.execute("BEGIN IMMEDIATE")
                        order_id = insert_order(connection, ctx)
                        connection.execute(
                            "INSERT INTO order_events(order_id,kind,created_at) "
                            "VALUES(?,'created','now')",
                            (order_id,),
                        )
                        connection.execute(
                            "INSERT INTO delivery_outbox"
                            "(order_id,kind,status,next_attempt_at,created_at,updated_at) "
                            "VALUES(?,?,'pending','now','now','now')",
                            (order_id, runtime.OUTBOX_KIND),
                        )
                        connection.commit()
                    finally:
                        connection.close()
                raise probe.ProbeRunError("http_unavailable")

            with patch.object(probe, "_json_request", side_effect=commit_then_lose):
                with self.assertRaisesRegex(probe.ProbeRunError, "http_unavailable"):
                    probe.run_probe(
                        base_url=probe.config.SITE_URL,
                        database=database,
                        capability=capability,
                        migration=MIGRATION,
                        timeout=2,
                        require_root=False,
                        run_id=RUN_ID,
                    )
            self.assertFalse(os.path.lexists(capability))
            connection = sqlite3.connect(database)
            try:
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM orders WHERE synthetic=1"
                    ).fetchone()[0],
                    0,
                )
                self.assertEqual(
                    connection.execute("SELECT count(*) FROM delivery_outbox").fetchone()[0],
                    0,
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM web_guest_sessions"
                    ).fetchone()[0],
                    0,
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM synthetic_probe_tombstones"
                    ).fetchone()[0],
                    1,
                )
            finally:
                connection.close()

    def test_installer_apply_idempotence_active_guard_and_exact_rollback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            root = base / "root"
            app = root / "app"
            app.mkdir(parents=True)
            db_before = "DB_BEFORE\n"
            web_before = "WEB_BEFORE\n"
            db_after = db_before + "DB_AFTER\n"
            web_after = web_before + "WEB_AFTER\n"
            (app / "db.py").write_text(db_before, encoding="utf-8")
            (app / "webapp.py").write_text(web_before, encoding="utf-8")
            (root / "migrations").mkdir()
            database = root / "salon.db"
            connection = sqlite3.connect(database)
            try:
                connection.executescript(BASE_SCHEMA)
            finally:
                connection.close()
            capability = base / "capability.json"
            backups = root / "backups"
            known_before = {
                "db": installer.sha256_text(db_before),
                "webapp": installer.sha256_text(web_before),
            }
            known_after = {
                "db": installer.sha256_text(db_after),
                "webapp": installer.sha256_text(web_after),
            }

            def patch_db(value: str) -> str:
                return db_after if value == db_before else value

            def patch_webapp(value: str) -> str:
                return web_after if value == web_before else value

            assets = HERE.parents[1]
            now = datetime(2026, 8, 26, tzinfo=timezone.utc)
            with (
                patch.object(installer, "KNOWN_BEFORE", known_before),
                patch.object(installer, "KNOWN_AFTER", known_after),
                patch.object(installer, "patch_db", side_effect=patch_db),
                patch.object(installer, "patch_webapp", side_effect=patch_webapp),
                patch.object(installer, "validate_candidate", return_value=None),
            ):
                first = installer.install(
                    root,
                    assets,
                    database,
                    capability,
                    backups,
                    require_stopped=False,
                    now=now,
                )
                self.assertTrue(first["changed"])
                backup = Path(first["backup"])
                self.assertTrue((root / "app" / "out001_synthetic.py").exists())
                self.assertTrue((root / "out001_probe.py").exists())
                self.assertTrue(installer._migration_applied(database))

                second = installer.install(
                    root,
                    assets,
                    database,
                    capability,
                    backups,
                    require_stopped=False,
                    now=now,
                )
                self.assertFalse(second["changed"])

                connection = sqlite3.connect(database)
                try:
                    insert_order(connection, context())
                    connection.commit()
                finally:
                    connection.close()
                with self.assertRaisesRegex(RuntimeError, "active synthetic"):
                    installer.rollback(
                        root,
                        database,
                        capability,
                        backup,
                        require_stopped=False,
                    )
                connection = sqlite3.connect(database)
                try:
                    connection.execute("DELETE FROM orders WHERE synthetic=1")
                    connection.commit()
                finally:
                    connection.close()

                # Simulate power loss after the first source was restored.
                (app / "db.py").write_text(db_before, encoding="utf-8")
                result = installer.rollback(
                    root,
                    database,
                    capability,
                    backup,
                    require_stopped=False,
                )
                self.assertTrue(result["rolled_back"])
                self.assertEqual((app / "db.py").read_text(encoding="utf-8"), db_before)
                self.assertEqual(
                    (app / "webapp.py").read_text(encoding="utf-8"), web_before
                )
                self.assertFalse((root / "app" / "out001_synthetic.py").exists())
                self.assertTrue(installer._migration_applied(database))

                repeated = installer.rollback(
                    root,
                    database,
                    capability,
                    backup,
                    require_stopped=False,
                )
                self.assertTrue(repeated["already_rolled_back"])

                asset_paths = installer._asset_paths(assets)
                target_paths = installer._target_paths(root)
                for name, mode in (
                    ("runtime", 0o640),
                    ("probe", 0o700),
                    ("migration", 0o640),
                ):
                    installer._atomic_asset(
                        asset_paths[name],
                        target_paths[name],
                        root=root,
                        mode=mode,
                    )
                residue = installer.rollback(
                    root,
                    database,
                    capability,
                    backup,
                    require_stopped=False,
                )
                self.assertTrue(residue["rolled_back"])
                self.assertFalse(residue["already_rolled_back"])
                self.assertTrue(all(not path.exists() for path in target_paths.values()))

    def test_installer_full_cycle_with_both_exact_orphan_owned_parents(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            root = base / "root"
            app = root / "app"
            migrations = root / "migrations"
            app.mkdir(parents=True)
            migrations.mkdir()
            db_before = "DB_BEFORE\n"
            web_before = "WEB_BEFORE\n"
            db_after = db_before + "DB_AFTER\n"
            web_after = web_before + "WEB_AFTER\n"
            (app / "db.py").write_text(db_before, encoding="utf-8")
            (app / "webapp.py").write_text(web_before, encoding="utf-8")
            database = root / "salon.db"
            connection = sqlite3.connect(database)
            try:
                connection.executescript(BASE_SCHEMA)
            finally:
                connection.close()
            capability = base / "capability.json"
            backups = root / "backups"
            assets = HERE.parents[1]
            known_before = {
                "db": installer.sha256_text(db_before),
                "webapp": installer.sha256_text(web_before),
            }
            known_after = {
                "db": installer.sha256_text(db_after),
                "webapp": installer.sha256_text(web_after),
            }
            real_lstat = os.lstat

            def orphan_layout(path):
                value = Path(path)
                info = real_lstat(path)
                if value == root:
                    return SimpleNamespace(
                        st_mode=info.st_mode,
                        st_uid=0,
                        st_gid=0,
                    )
                if value in {app, migrations}:
                    return SimpleNamespace(
                        st_mode=stat.S_IFDIR | 0o755,
                        st_uid=501,
                        st_gid=50,
                    )
                if stat.S_ISDIR(info.st_mode) and root in value.parents:
                    return SimpleNamespace(
                        st_mode=info.st_mode,
                        st_uid=0,
                        st_gid=0,
                    )
                return info

            def patch_db(value: str) -> str:
                return db_after if value == db_before else value

            def patch_webapp(value: str) -> str:
                return web_after if value == web_before else value

            target_paths = installer._target_paths(root)
            with (
                patch.object(installer, "PRODUCTION_ROOT", root),
                patch.object(installer, "KNOWN_BEFORE", known_before),
                patch.object(installer, "KNOWN_AFTER", known_after),
                patch.object(installer, "patch_db", side_effect=patch_db),
                patch.object(installer, "patch_webapp", side_effect=patch_webapp),
                patch.object(installer, "validate_candidate", return_value=None),
                patch.object(installer.os, "geteuid", return_value=0),
                patch.object(installer.os, "lstat", side_effect=orphan_layout),
                patch.object(installer.pwd, "getpwuid", side_effect=KeyError(501)),
            ):
                checked = installer.preview(root, assets, database, capability)
                self.assertTrue(checked["changed"])
                self.assertFalse(checked["migration_applied"])

                first = installer.install(
                    root,
                    assets,
                    database,
                    capability,
                    backups,
                    require_stopped=False,
                    now=datetime(2026, 8, 26, 0, 0, 0, tzinfo=timezone.utc),
                )
                self.assertTrue(first["changed"])
                self.assertTrue(all(path.is_file() for path in target_paths.values()))

                repeated = installer.install(
                    root,
                    assets,
                    database,
                    capability,
                    backups,
                    require_stopped=False,
                )
                self.assertFalse(repeated["changed"])

                rolled_back = installer.rollback(
                    root,
                    database,
                    capability,
                    Path(first["backup"]),
                    require_stopped=False,
                )
                self.assertTrue(rolled_back["rolled_back"])
                self.assertTrue(all(not path.exists() for path in target_paths.values()))

                forwarded = installer.install(
                    root,
                    assets,
                    database,
                    capability,
                    backups,
                    require_stopped=False,
                    now=datetime(2026, 8, 26, 0, 0, 1, tzinfo=timezone.utc),
                )
                self.assertTrue(forwarded["changed"])
                self.assertTrue(forwarded["migration_applied"])
                self.assertTrue(all(path.is_file() for path in target_paths.values()))

                final = installer.rollback(
                    root,
                    database,
                    capability,
                    Path(forwarded["backup"]),
                    require_stopped=False,
                )
                self.assertTrue(final["rolled_back"])
                self.assertTrue(all(not path.exists() for path in target_paths.values()))
                self.assertEqual((app / "db.py").read_text(encoding="utf-8"), db_before)
                self.assertEqual(
                    (app / "webapp.py").read_text(encoding="utf-8"), web_before
                )

    def test_real_source_patch_hashes_are_pinned_and_assets_are_private_by_contract(self) -> None:
        self.assertTrue(all(len(value) == 64 for value in installer.KNOWN_BEFORE.values()))
        self.assertTrue(all(len(value) == 64 for value in installer.KNOWN_AFTER.values()))
        self.assertTrue(all(len(value) == 64 for value in installer.KNOWN_ASSETS.values()))
        source = Path(installer.__file__).read_text(encoding="utf-8")
        self.assertIn("service must be stopped", source)
        self.assertIn("active synthetic record blocks rollback", source)
        self.assertNotIn("__PIN_", source)

    def test_candidate_validator_counts_both_duplicate_paths_structurally(self) -> None:
        db_text = """
# out001-synthetic-plane:20260826:db
# include_synthetic: bool = False
# synthetic_order_for_guest coalesce(synthetic,0)=0
# (? IS NULL OR coalesce(o.synthetic,0)=0)
"""
        webapp_text = """
# out001-synthetic-plane:20260826:webapp
# out001_synthetic.authorize_order OUTBOX_OUT001
# synthetic=bool(synthetic_context) allow_synthetic=True
required = '''if not synthetic:
        guest_token = await db.guest_session_add_order'''
def prelookup(synthetic_context, resp):
    if synthetic_context:
        return _json(resp)

def insert_race(synthetic_context, resp):
    try:
        return None
    except RuntimeError:
        if synthetic_context:
            return _json(resp)
"""
        installer.validate_candidate(db_text, webapp_text)
        with self.assertRaisesRegex(RuntimeError, "duplicate race contract"):
            installer.validate_candidate(
                db_text,
                webapp_text.replace(
                    "        if synthetic_context:\n            return _json(resp)\n",
                    "        return resp\n",
                ),
            )

    def test_pinned_candidate_handler_harness_when_exact_sources_are_supplied(self) -> None:
        source_value = os.environ.get("OUT001_PINNED_SOURCE_DIR", "").strip()
        if not source_value:
            self.skipTest("set OUT001_PINNED_SOURCE_DIR to the hash-pinned source fixture")
        source_dir = Path(source_value).resolve()
        source_paths = {
            "db": source_dir / "db.py",
            "webapp": source_dir / "webapp.py",
        }
        for name, path in source_paths.items():
            self.assertEqual(installer.sha256(path), installer.KNOWN_BEFORE[name])
        before_webapp = source_paths["webapp"].read_text(encoding="utf-8")
        candidate_db = installer.patch_db(
            source_paths["db"].read_text(encoding="utf-8")
        )
        candidate_webapp = installer.patch_webapp(before_webapp)
        installer.validate_candidate(candidate_db, candidate_webapp)
        self.assertEqual(
            installer.sha256_text(candidate_db), installer.KNOWN_AFTER["db"]
        )
        self.assertEqual(
            installer.sha256_text(candidate_webapp), installer.KNOWN_AFTER["webapp"]
        )

        ordinary_body = {
            "type": "custom",
            "topic": "ordinary",
            "details": "ordinary details",
            "name": "Guest",
            "contact": "guest@example.test",
            "consent": True,
            "consent_doc": CONSENT_DOC,
            "page": "/",
            "client_request_id": "ordinary_123456",
            "website": "",
        }
        ordinary_results = []
        ordinary_args = []
        for webapp_text in (before_webapp, candidate_webapp):
            ordinary_db = CandidateDB()
            ordinary_namespace = _candidate_namespace(ordinary_db)
            ordinary_handlers = _candidate_functions(
                webapp_text,
                {"_order_create_response", "orders_create"},
                ordinary_namespace,
            )
            ordinary_results.append(
                asyncio.run(
                    ordinary_handlers["orders_create"](
                        CandidateRequest(ordinary_body)
                    )
                )
            )
            ordinary_args.append(ordinary_db.created_args)
            self.assertEqual(ordinary_db.guest_adds, 1)
            self.assertEqual(ordinary_db.claim_creates, 1)
        self.assertEqual(ordinary_results[0], ordinary_results[1])
        self.assertEqual(ordinary_args[0], ordinary_args[1])

        synthetic_context = context()
        synthetic_body = runtime.fixture_body(synthetic_context)
        synthetic_db = CandidateDB()
        synthetic_namespace = _candidate_namespace(synthetic_db, synthetic_context)
        handlers = _candidate_functions(
            candidate_webapp,
            {
                "_order_create_response", "orders_create", "orders_list",
                "order_access_exchange", "order_get", "sweep_delivery_outbox",
            },
            synthetic_namespace,
        )
        created = asyncio.run(
            handlers["orders_create"](CandidateRequest(synthetic_body))
        )
        self.assertEqual(created["status"], 200)
        self.assertEqual(created["payload"]["id"], 701)
        self.assertIn("claim_url", created["payload"])
        self.assertEqual(synthetic_db.guest_adds, 0)
        self.assertEqual(synthetic_db.claim_creates, 1)
        self.assertEqual(synthetic_db.created_args["_outbox"], runtime.OUTBOX_KIND)
        self.assertEqual(synthetic_db.created_args["synthetic"], 1)
        self.assertIsNone(synthetic_db.created_args["guest_contact"])
        self.assertIsNone(synthetic_db.created_args["quote_low"])
        self.assertIsNone(synthetic_db.created_args["promo_code"])

        duplicate = asyncio.run(
            handlers["orders_create"](CandidateRequest(synthetic_body))
        )
        self.assertTrue(duplicate["payload"]["duplicate"])
        self.assertEqual(duplicate["payload"]["id"], 701)
        self.assertEqual(synthetic_db.guest_adds, 0)
        self.assertEqual(synthetic_db.claim_creates, 1)

        race_db = CandidateDB(race=True)
        race_namespace = _candidate_namespace(race_db, synthetic_context)
        race_handlers = _candidate_functions(
            candidate_webapp,
            {"_order_create_response", "orders_create"},
            race_namespace,
        )
        raced = asyncio.run(
            race_handlers["orders_create"](CandidateRequest(synthetic_body))
        )
        self.assertTrue(raced["payload"]["duplicate"])
        self.assertEqual(raced["payload"]["id"], 701)
        self.assertEqual(race_db.guest_adds, 0)
        self.assertEqual(race_db.claim_creates, 0)

        exchange_request = CandidateRequest(
            {},
            headers={
                "X-Claim-Exchange": "cx1_candidate",
                "X-Session-Mode": "cookie",
            },
        )
        exchanged = asyncio.run(
            handlers["order_access_exchange"](exchange_request)
        )
        self.assertEqual(exchanged["payload"]["order_id"], 701)
        self.assertEqual(exchanged["cookies"]["set"], "guest-cookie")
        listed = asyncio.run(
            handlers["orders_list"](
                CandidateRequest(
                    {}, cookies={"guest": "guest-cookie"},
                    headers={"X-Session-Mode": "cookie"},
                )
            )
        )
        self.assertEqual(
            [item["id"] for item in listed["payload"]["orders"]], [701]
        )
        detail_request = CandidateRequest(
            {}, cookies={"guest": "guest-cookie"},
            headers={"X-Session-Mode": "cookie"},
        )
        detail_request.match_info = {"id": "701"}
        detailed = asyncio.run(handlers["order_get"](detail_request))
        self.assertEqual(detailed["payload"]["order"]["id"], 701)

        restarted_db = CandidateDB()
        restarted_db.delivery_rows = [
            {"kind": runtime.OUTBOX_KIND, "order_id": 701, "attempts": 0}
        ]
        restarted_namespace = _candidate_namespace(restarted_db, synthetic_context)
        restarted_handlers = _candidate_functions(
            candidate_webapp,
            {"sweep_delivery_outbox"},
            restarted_namespace,
        )
        self.assertEqual(
            asyncio.run(restarted_handlers["sweep_delivery_outbox"](object())), 1
        )
        self.assertEqual(restarted_namespace["isolated_deliveries"], [701])
        self.assertEqual(
            asyncio.run(restarted_handlers["sweep_delivery_outbox"](object())), 0
        )
        self.assertEqual(restarted_namespace["isolated_deliveries"], [701])

    def test_tampered_asset_and_symlink_target_parent_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            assets = base / "assets"
            (assets / "migrations").mkdir(parents=True)
            source_assets = installer._asset_paths(HERE.parents[1])
            copied_assets = installer._asset_paths(assets)
            for name, source in source_assets.items():
                shutil.copy2(source, copied_assets[name])
            copied_assets["probe"].write_text(
                copied_assets["probe"].read_text(encoding="utf-8") + "# drift\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(RuntimeError, "asset hash mismatch"):
                installer._validate_assets(assets)

            root = base / "root"
            (root / "app").mkdir(parents=True)
            outside = base / "outside"
            outside.mkdir()
            (root / "migrations").symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(RuntimeError, "path escapes root|unsafe target parent"):
                installer._atomic_asset(
                    source_assets["migration"],
                    root / "migrations" / "0010_out001_synthetic.sql",
                    root=root,
                    mode=0o640,
                )
            self.assertFalse((outside / "0010_out001_synthetic.sql").exists())

    def test_rollback_refuses_parent_symlink_without_unlinking_outside(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp).resolve()
            root = base / "root"
            app = root / "app"
            app.mkdir(parents=True)
            before_text = {"db": "db-before\n", "webapp": "web-before\n"}
            after_text = {"db": "db-after\n", "webapp": "web-after\n"}
            for name, filename in (("db", "db.py"), ("webapp", "webapp.py")):
                (app / filename).write_text(before_text[name], encoding="utf-8")
            database = root / "salon.db"
            connection = sqlite3.connect(database)
            try:
                connection.execute("CREATE TABLE orders(id INTEGER PRIMARY KEY)")
                connection.commit()
            finally:
                connection.close()
            outside = base / "outside"
            outside.mkdir()
            migration_payload = "exact migration\n"
            outside_target = outside / "0010_out001_synthetic.sql"
            outside_target.write_text(migration_payload, encoding="utf-8")
            (root / "migrations").symlink_to(outside, target_is_directory=True)
            backup = root / "backups" / "out001"
            backup.mkdir(parents=True)
            for name, filename in (("db", "db.py"), ("webapp", "webapp.py")):
                (backup / filename).write_text(before_text[name], encoding="utf-8")
            known_before = {
                name: installer.sha256_text(value) for name, value in before_text.items()
            }
            known_after = {
                name: installer.sha256_text(value) for name, value in after_text.items()
            }
            known_assets = {
                "runtime": installer.sha256_text("runtime\n"),
                "probe": installer.sha256_text("probe\n"),
                "migration": installer.sha256_text(migration_payload),
            }
            (backup / "manifest.json").write_text(
                json.dumps(
                    {
                        "kind": "out001-synthetic-plane",
                        "before_sha256": known_before,
                        "after_sha256": known_after,
                        "asset_sha256": known_assets,
                    }
                ),
                encoding="utf-8",
            )
            with (
                patch.object(installer, "KNOWN_BEFORE", known_before),
                patch.object(installer, "KNOWN_AFTER", known_after),
                patch.object(installer, "KNOWN_ASSETS", known_assets),
                self.assertRaisesRegex(RuntimeError, "unsafe target parent"),
            ):
                installer.rollback(
                    root,
                    database,
                    base / "absent-capability.json",
                    backup,
                    require_stopped=False,
                )
            self.assertTrue(outside_target.is_file())
            self.assertEqual(outside_target.read_text(encoding="utf-8"), migration_payload)

    def test_installer_accepts_only_exact_orphan_owned_production_app_parent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve() / "root"
            app = root / "app"
            app.mkdir(parents=True)
            target = app / "db.py"
            real_lstat = os.lstat

            def layout(*, uid: int = 501, gid: int = 50, mode: int = 0o755):
                def fake_lstat(path):
                    if Path(path) == root:
                        return SimpleNamespace(
                            st_mode=stat.S_IFDIR | 0o755,
                            st_uid=0,
                            st_gid=0,
                        )
                    if Path(path) == app:
                        return SimpleNamespace(
                            st_mode=stat.S_IFDIR | mode,
                            st_uid=uid,
                            st_gid=gid,
                        )
                    return real_lstat(path)

                return fake_lstat

            with (
                patch.object(installer, "PRODUCTION_ROOT", root),
                patch.object(installer.os, "geteuid", return_value=0),
                patch.object(installer.os, "lstat", side_effect=layout()),
                patch.object(installer.pwd, "getpwuid", side_effect=KeyError(501)),
            ):
                installer._secure_target_parent(root, target, create=False)

            rejecting = (
                (layout(uid=502), KeyError(502), 0),
                (layout(gid=51), KeyError(501), 0),
                (layout(mode=0o775), KeyError(501), 0),
                (layout(), SimpleNamespace(pw_name="named-owner"), 0),
                (layout(), KeyError(501), 501),
            )
            for fake_lstat, passwd_result, effective_uid in rejecting:
                with self.subTest(
                    passwd_result=passwd_result,
                    effective_uid=effective_uid,
                ):
                    passwd = (
                        patch.object(installer.pwd, "getpwuid", return_value=passwd_result)
                        if not isinstance(passwd_result, KeyError)
                        else patch.object(
                            installer.pwd, "getpwuid", side_effect=passwd_result
                        )
                    )
                    with (
                        patch.object(installer, "PRODUCTION_ROOT", root),
                        patch.object(installer.os, "geteuid", return_value=effective_uid),
                        patch.object(installer.os, "lstat", side_effect=fake_lstat),
                        passwd,
                        self.assertRaisesRegex(RuntimeError, "unsafe target parent"),
                    ):
                        installer._secure_target_parent(root, target, create=False)

            other = root / "handlers"
            other.mkdir()
            with (
                patch.object(installer, "PRODUCTION_ROOT", root),
                patch.object(installer.os, "geteuid", return_value=0),
                patch.object(
                    installer.os,
                    "lstat",
                    side_effect=lambda path: (
                        SimpleNamespace(st_mode=stat.S_IFDIR | 0o755, st_uid=0, st_gid=0)
                        if Path(path) == root
                        else (
                            SimpleNamespace(
                                st_mode=stat.S_IFDIR | 0o755,
                                st_uid=501,
                                st_gid=50,
                            )
                            if Path(path) == other
                            else real_lstat(path)
                        )
                    ),
                ),
                patch.object(installer.pwd, "getpwuid", side_effect=KeyError(501)),
                self.assertRaisesRegex(RuntimeError, "unsafe target parent"),
            ):
                installer._secure_target_parent(root, other / "module.py", create=False)

            alternate_root = Path(tmp).resolve() / "alternate-root"
            alternate_app = alternate_root / "app"
            alternate_app.mkdir(parents=True)

            def alternate_lstat(path):
                if Path(path) == alternate_root:
                    return SimpleNamespace(
                        st_mode=stat.S_IFDIR | 0o755, st_uid=0, st_gid=0
                    )
                if Path(path) == alternate_app:
                    return SimpleNamespace(
                        st_mode=stat.S_IFDIR | 0o755, st_uid=501, st_gid=50
                    )
                return real_lstat(path)

            with (
                patch.object(installer, "PRODUCTION_ROOT", root),
                patch.object(installer.os, "geteuid", return_value=0),
                patch.object(installer.os, "lstat", side_effect=alternate_lstat),
                patch.object(installer.pwd, "getpwuid", side_effect=KeyError(501)),
                self.assertRaisesRegex(RuntimeError, "unsafe target parent"),
            ):
                installer._secure_target_parent(
                    alternate_root, alternate_app / "db.py", create=False
                )

    def test_installer_accepts_exact_orphan_owned_production_migrations_parent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve() / "root"
            migrations = root / "migrations"
            migrations.mkdir(parents=True)
            target = migrations / "0010_out001_synthetic.sql"
            real_lstat = os.lstat

            def legacy_layout(path):
                if Path(path) == root:
                    return SimpleNamespace(
                        st_mode=stat.S_IFDIR | 0o755,
                        st_uid=0,
                        st_gid=0,
                    )
                if Path(path) == migrations:
                    return SimpleNamespace(
                        st_mode=stat.S_IFDIR | 0o755,
                        st_uid=501,
                        st_gid=50,
                    )
                return real_lstat(path)

            with (
                patch.object(installer, "PRODUCTION_ROOT", root),
                patch.object(installer.os, "geteuid", return_value=0),
                patch.object(installer.os, "lstat", side_effect=legacy_layout),
                patch.object(installer.pwd, "getpwuid", side_effect=KeyError(501)),
            ):
                installer._secure_target_parent(root, target, create=False)

            for forbidden in (root / "migrations-archive", root / "assets"):
                forbidden.mkdir()

                def forbidden_layout(path, *, forbidden=forbidden):
                    if Path(path) == root:
                        return SimpleNamespace(
                            st_mode=stat.S_IFDIR | 0o755,
                            st_uid=0,
                            st_gid=0,
                        )
                    if Path(path) == forbidden:
                        return SimpleNamespace(
                            st_mode=stat.S_IFDIR | 0o755,
                            st_uid=501,
                            st_gid=50,
                        )
                    return real_lstat(path)

                with (
                    self.subTest(forbidden=forbidden.name),
                    patch.object(installer, "PRODUCTION_ROOT", root),
                    patch.object(installer.os, "geteuid", return_value=0),
                    patch.object(installer.os, "lstat", side_effect=forbidden_layout),
                    patch.object(installer.pwd, "getpwuid", side_effect=KeyError(501)),
                    self.assertRaisesRegex(RuntimeError, "unsafe target parent"),
                ):
                    installer._secure_target_parent(
                        root, forbidden / "release.sql", create=False
                    )

            alternate_root = Path(tmp).resolve() / "alternate-root"
            alternate_migrations = alternate_root / "migrations"
            alternate_migrations.mkdir(parents=True)

            def alternate_layout(path):
                if Path(path) == alternate_root:
                    return SimpleNamespace(
                        st_mode=stat.S_IFDIR | 0o755,
                        st_uid=0,
                        st_gid=0,
                    )
                if Path(path) == alternate_migrations:
                    return SimpleNamespace(
                        st_mode=stat.S_IFDIR | 0o755,
                        st_uid=501,
                        st_gid=50,
                    )
                return real_lstat(path)

            with (
                patch.object(installer, "PRODUCTION_ROOT", root),
                patch.object(installer.os, "geteuid", return_value=0),
                patch.object(installer.os, "lstat", side_effect=alternate_layout),
                patch.object(installer.pwd, "getpwuid", side_effect=KeyError(501)),
                self.assertRaisesRegex(RuntimeError, "unsafe target parent"),
            ):
                installer._secure_target_parent(
                    alternate_root,
                    alternate_migrations / "0010_out001_synthetic.sql",
                    create=False,
                )

    def test_foreign_outbox_linked_money_and_schema_drift_block_without_deletion(self) -> None:
        cases = (
            "foreign_outbox", "payment", "schema", "order_column",
            "generated_column", "missing_known_link", "missing_surface_column",
            "foreign_key",
        )
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as tmp:
                database = create_database(Path(tmp))
                order_id = insert_bundle(database)
                connection = sqlite3.connect(database)
                try:
                    if case == "foreign_outbox":
                        connection.execute(
                            "INSERT INTO delivery_outbox"
                            "(order_id,kind,status,next_attempt_at,created_at,updated_at) "
                            "VALUES(?,'new_order','pending','now','now','now')",
                            (order_id,),
                        )
                    elif case == "payment":
                        connection.execute(
                            "INSERT INTO payments(order_id,amount) VALUES(?,100)",
                            (order_id,),
                        )
                    elif case == "schema":
                        connection.execute(
                            "CREATE TABLE future_rewards(order_identifier INTEGER)"
                        )
                        connection.execute(
                            "INSERT INTO future_rewards VALUES(?)", (order_id,)
                        )
                    elif case == "order_column":
                        connection.execute(
                            "ALTER TABLE orders ADD COLUMN wallet_credit INTEGER"
                        )
                    elif case == "generated_column":
                        connection.execute(
                            "ALTER TABLE orders ADD COLUMN wallet_credit INTEGER "
                            "GENERATED ALWAYS AS (100) VIRTUAL"
                        )
                    elif case == "missing_known_link":
                        connection.execute("DROP TABLE payments")
                        connection.execute(
                            "CREATE TABLE payments("
                            "id INTEGER PRIMARY KEY,case_ref INTEGER,amount INTEGER)"
                        )
                        connection.execute(
                            "INSERT INTO payments(case_ref,amount) VALUES(?,100)",
                            (order_id,),
                        )
                    elif case == "missing_surface_column":
                        connection.execute("DROP TABLE web_guest_orders")
                        connection.execute("DROP TABLE web_guest_sessions")
                        connection.execute(
                            "CREATE TABLE web_guest_sessions("
                            "session_digest TEXT PRIMARY KEY)"
                        )
                        connection.execute(
                            "CREATE TABLE web_guest_orders("
                            "token_digest TEXT NOT NULL,"
                            "order_id INTEGER NOT NULL REFERENCES orders(id),"
                            "PRIMARY KEY(token_digest,order_id))"
                        )
                    else:
                        connection.execute(
                            "CREATE TABLE future_case("
                            "case_ref INTEGER REFERENCES orders(id))"
                        )
                        connection.execute(
                            "INSERT INTO future_case VALUES(?)", (order_id,)
                        )
                    connection.commit()
                finally:
                    connection.close()
                with self.assertRaises(runtime.CleanupBlocked):
                    runtime.cleanup(
                        database,
                        RUN_ID,
                        order_id,
                        expected_economic_guard=runtime.economic_guard_digest(database),
                    )
                connection = sqlite3.connect(database)
                try:
                    self.assertEqual(
                        connection.execute(
                            "SELECT count(*) FROM orders WHERE id=?", (order_id,)
                        ).fetchone()[0],
                        1,
                    )
                    self.assertEqual(
                        connection.execute(
                            "SELECT count(*) FROM synthetic_probe_tombstones"
                        ).fetchone()[0],
                        0,
                    )
                finally:
                    connection.close()

    def test_generated_order_link_blocks_cleanup_without_deletion(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            database = create_database(Path(tmp))
            order_id = insert_bundle(database)
            connection = sqlite3.connect(database)
            try:
                connection.execute(
                    "CREATE TABLE future_refs("
                    "raw_id INTEGER,"
                    "order_id INTEGER GENERATED ALWAYS AS (raw_id) VIRTUAL)"
                )
                connection.execute(
                    "INSERT INTO future_refs(raw_id) VALUES(?)", (order_id,)
                )
                connection.commit()
            finally:
                connection.close()

            with self.assertRaisesRegex(
                runtime.CleanupBlocked, "synthetic_schema_drift"
            ):
                runtime.cleanup(
                    database,
                    RUN_ID,
                    order_id,
                    expected_economic_guard=runtime.economic_guard_digest(database),
                )

            connection = sqlite3.connect(database)
            try:
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM orders WHERE id=?", (order_id,)
                    ).fetchone()[0],
                    1,
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM future_refs WHERE order_id=?", (order_id,)
                    ).fetchone()[0],
                    1,
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM synthetic_probe_tombstones"
                    ).fetchone()[0],
                    0,
                )
            finally:
                connection.close()

    def test_installer_preflight_rejects_schema_drift_before_migration(self) -> None:
        runtime_asset = HERE.parents[1] / "out001_synthetic.py"
        mutations = {
            "generated": None,
            "missing_link": None,
            "event_data": ("order_events", "data", "payload"),
            "outbox_attempts": ("delivery_outbox", "attempts", "attempt_count"),
            "outbox_next_attempt": (
                "delivery_outbox", "next_attempt_at", "retry_after",
            ),
            "guest_session_expires": (
                "web_guest_sessions", "expires_at", "expires_on",
            ),
            "guest_order_created": ("web_guest_orders", "created_at", "linked_at"),
            "claim_consumed": (
                "order_claim_exchanges", "consumed_at", "used_at",
            ),
        }
        for mutation, renamed in mutations.items():
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as tmp:
                database = Path(tmp) / "salon.db"
                connection = sqlite3.connect(database)
                try:
                    connection.executescript(BASE_SCHEMA)
                    connection.commit()
                finally:
                    connection.close()
                installer._database_checks(
                    database,
                    runtime_asset,
                    migrated=False,
                )
                connection = sqlite3.connect(database)
                try:
                    if mutation == "generated":
                        connection.execute(
                            "ALTER TABLE orders ADD COLUMN wallet_credit INTEGER "
                            "GENERATED ALWAYS AS (100) VIRTUAL"
                        )
                    elif mutation == "missing_link":
                        connection.execute("DROP TABLE payments")
                        connection.execute(
                            "CREATE TABLE payments("
                            "id INTEGER PRIMARY KEY,case_ref INTEGER,amount INTEGER)"
                        )
                    else:
                        table, old, new = renamed
                        connection.execute(
                            f'ALTER TABLE "{table}" RENAME COLUMN "{old}" TO "{new}"'
                        )
                    connection.commit()
                finally:
                    connection.close()
                with self.assertRaisesRegex(RuntimeError, "pre-migration schema drift"):
                    installer._database_checks(
                        database,
                        runtime_asset,
                        migrated=False,
                    )

    def test_delivery_refuses_any_foreign_outbox_kind(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            database = create_database(Path(tmp))
            order_id = insert_bundle(database)
            connection = sqlite3.connect(database)
            try:
                connection.execute(
                    "INSERT INTO delivery_outbox"
                    "(order_id,kind,status,next_attempt_at,created_at,updated_at) "
                    "VALUES(?,'new_order','pending','now','now','now')",
                    (order_id,),
                )
                connection.commit()
            finally:
                connection.close()
            with self.assertRaisesRegex(runtime.ProbeError, "synthetic_outbox_invalid"):
                asyncio.run(runtime.deliver_isolated(database, order_id))
            connection = sqlite3.connect(database)
            try:
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM synthetic_delivery_receipts"
                    ).fetchone()[0],
                    0,
                )
                self.assertEqual(
                    connection.execute(
                        "SELECT count(*) FROM delivery_outbox"
                    ).fetchone()[0],
                    2,
                )
            finally:
                connection.close()

    def test_cleanup_rechecks_toctou_and_rolls_back_partial_delete(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            database = create_database(Path(tmp))
            economic_guard = runtime.economic_guard_digest(database)
            order_id = insert_bundle(database)
            asyncio.run(runtime.deliver_isolated(database, order_id))
            digest = runtime.cleanup(
                database,
                RUN_ID,
                order_id,
                expected_economic_guard=economic_guard,
            )["cleanup"]["dry_run_digest"]
            connection = sqlite3.connect(database)
            try:
                connection.execute(
                    "INSERT INTO payments(order_id,amount) VALUES(?,100)", (order_id,)
                )
                connection.commit()
            finally:
                connection.close()
            with self.assertRaisesRegex(runtime.CleanupBlocked, "synthetic_cleanup_changed"):
                runtime.cleanup(
                    database,
                    RUN_ID,
                    order_id,
                    apply=True,
                    dry_run_digest=digest,
                    expected_economic_guard=economic_guard,
                )

            connection = sqlite3.connect(database)
            try:
                connection.execute("DELETE FROM payments WHERE order_id=?", (order_id,))
                connection.execute(
                    "CREATE TRIGGER deny_probe_delete BEFORE DELETE ON delivery_outbox "
                    "WHEN OLD.kind='out001_synthetic' "
                    "BEGIN SELECT RAISE(ABORT,'deny'); END"
                )
                connection.commit()
            finally:
                connection.close()
            economic_guard = runtime.economic_guard_digest(database)
            digest = runtime.cleanup(
                database,
                RUN_ID,
                order_id,
                expected_economic_guard=economic_guard,
            )["cleanup"]["dry_run_digest"]
            with self.assertRaises(sqlite3.IntegrityError):
                runtime.cleanup(
                    database,
                    RUN_ID,
                    order_id,
                    apply=True,
                    dry_run_digest=digest,
                    expected_economic_guard=economic_guard,
                )
            connection = sqlite3.connect(database)
            try:
                self.assertEqual(connection.execute("SELECT count(*) FROM orders").fetchone()[0], 1)
                self.assertEqual(connection.execute("SELECT count(*) FROM order_events").fetchone()[0], 1)
                self.assertEqual(connection.execute("SELECT count(*) FROM delivery_outbox").fetchone()[0], 1)
                self.assertEqual(connection.execute("SELECT count(*) FROM synthetic_delivery_receipts").fetchone()[0], 1)
                self.assertEqual(connection.execute("SELECT count(*) FROM synthetic_probe_tombstones").fetchone()[0], 0)
            finally:
                connection.close()


if __name__ == "__main__":
    unittest.main()
