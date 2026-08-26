"""Default-off, DB-local observability for one OUT-001 order journey.

The synthetic branch is deliberately narrower than a test account. It exists
only while a short-lived root-owned capability file is present, accepts one
exact non-client fixture, stores no contact or user identity and can deliver
only to an isolated SQLite receipt. Public helpers return bounded digests and
typed counts; exact identifiers stay inside the root-only probe process.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import os
import re
import sqlite3
import stat
import time
import urllib.parse
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping


CONTRACT_VERSION = 1
MIGRATION_VERSION = "0010_out001_synthetic"
OUTBOX_KIND = "out001_synthetic"
ISOLATED_SINK = "isolated-out001"
DEFAULT_ORIGIN = "https://akademsalon.ru"
DEFAULT_CAPABILITY_PATH = Path("/run/salon-bot/out001-capability.json")
MAX_CAPABILITY_BYTES = 4096
MAX_CAPABILITY_TTL = 5 * 60
MAX_CLOCK_SKEW = 60

RUN_RE = re.compile(r"^out001_[0-9a-f]{32}$")
REQUEST_RE = re.compile(r"^syn_[0-9a-f]{40}$")
HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
RESERVED_FIELDS = frozenset({"synthetic", "test_run_id"})

FIXTURE_NAME = "OUT-001 probe"
FIXTURE_TOPIC = "OUT-001 delivery probe"
FIXTURE_DETAILS = "Synthetic fixture; no customer content."
FIXTURE_PAGE = "out001://synthetic-e2e"
FIXTURE_TYPE = "custom"

CONTRACT_SHA256 = hashlib.sha256(
    b"out001-synthetic-contract-v1\0exact-fixture\0isolated-sink\0dry-run-digest"
).hexdigest()

COUNT_KEYS = (
    "order",
    "marker",
    "created_event",
    "outbox",
    "receipt",
    "cabinet_membership",
    "claim_exchange",
    "guest_session",
    "files",
    "items",
)

ORDER_SCHEMA_SHA256 = "c7b91d09c4a0f4f1ff737d1c650bca508cdb70ba2977bd9ede9775829ca941bb"

ECONOMIC_TABLES = frozenset(
    {
        "bonus_ledger",
        "delivery_artifact_files",
        "delivery_artifacts",
        "deposit_ledger",
        "deposit_v2_allocations",
        "deposit_v2_lots",
        "deposit_v2_ops",
        "deposit_v2_reward_claims",
        "deposits",
        "economic_bonus_debts",
        "economic_lot_reward_adjustments",
        "economic_order_reward_refunds",
        "economic_reward_reversals",
        "gift_ledger",
        "gifts",
        "offers",
        "payment_receipts",
        "payments",
        "promo_campaign_intents",
        "promo_first_order_claims",
        "promo_grants",
        "promo_retention_grants",
        "promos",
        "quote_drafts",
        "referral_v2_obligations",
        "subscriptions",
        "tips",
    }
)
ECONOMIC_TABLE_TOKENS = (
    "bonus", "cashback", "credit", "deposit", "economic", "gift",
    "invoice", "offer", "payment", "promo", "quote", "referral",
    "reward", "subscription", "tariff", "tip", "wallet",
)
ECONOMIC_SETTING_TOKENS = ECONOMIC_TABLE_TOKENS + (
    "payrec", "payrem", "requisites", "slots_quota", "slots_extra", "subs_",
)
ECONOMIC_ORDER_COLUMNS = (
    "id", "user_id", "status", "quote_low", "quote_high", "price", "prepay",
    "bonus_spent", "promo_code", "promo_discount", "sub_discount", "gift_code",
    "gift_amount", "ref_hint", "deleted", "guest_contact", "work_type",
    "parts_done", "stages_total",
)
ECONOMIC_USER_COLUMNS = (
    "id", "referrer_id", "welcome_at", "subscribed", "subscribed_at",
    "email", "phone", "username", "created_at",
)

BLOCKER_CODES = frozenset(
    {
        "schema_drift",
        "run_reused",
        "order_cardinality",
        "marker_invalid",
        "economics_or_identity",
        "event_cardinality",
        "outbox_cardinality",
        "outbox_kind",
        "outbox_state",
        "receipt_cardinality",
        "receipt_invalid",
        "membership_cardinality",
        "claim_cardinality",
        "guest_session_cardinality",
        "guest_session_shared",
        "linked_business_data",
        "files_present",
        "items_present",
        "cleanup_residual",
    }
)

# Production order-link schema reviewed read-only on 2026-08-26. The set is an
# exact contract: both a new link and a missing/renamed reviewed link block the
# probe until the release contract is deliberately updated.
KNOWN_ORDER_LINKS = frozenset(
    {
        ("bonus_ledger", "order_id"),
        ("delivery_artifacts", "order_id"),
        ("delivery_outbox", "order_id"),
        ("deposit_ledger", "order_id"),
        ("deposit_v2_ops", "order_id"),
        ("deposit_v2_reward_claims", "order_id"),
        ("economic_lot_reward_adjustments", "order_id"),
        ("economic_order_reward_refunds", "order_id"),
        ("economic_reward_reversals", "order_id"),
        ("gift_ledger", "order_id"),
        ("leads", "order_id"),
        ("messages", "order_id"),
        ("msg_map", "order_id"),
        ("offers", "order_id"),
        ("order_claim_exchanges", "order_id"),
        ("order_events", "order_id"),
        ("order_files", "order_id"),
        ("order_items", "order_id"),
        ("order_specifications", "order_id"),
        ("payment_receipts", "order_id"),
        ("payments", "order_id"),
        ("promo_first_order_claims", "order_id"),
        ("promo_retention_grants", "consumed_order_id"),
        ("referral_v2_obligations", "source_order_id"),
        ("reviews", "order_id"),
        ("subscriptions", "order_id"),
        ("synthetic_delivery_receipts", "order_id"),
        ("tips", "order_id"),
        ("visits", "order_id"),
        ("web_guest_orders", "order_id"),
    }
)

ALLOWED_LINKS = frozenset(
    {
        ("delivery_outbox", "order_id"),
        ("order_claim_exchanges", "order_id"),
        ("order_events", "order_id"),
        ("synthetic_delivery_receipts", "order_id"),
        ("web_guest_orders", "order_id"),
    }
)

REQUIRED_ORDER_COLUMNS = frozenset(
    {
        "id", "status", "user_id", "source", "guest_contact", "guest_name",
        "work_type", "topic", "details", "deadline_text", "deadline_date",
        "quote_low", "quote_high", "price", "prepay", "bonus_spent",
        "promo_code", "promo_discount", "sub_discount", "gift_code",
        "gift_amount", "ref_hint", "topic_id", "admin_note", "cancel_reason",
        "stages_total", "stage", "parts_done", "archived_client",
        "archived_admin", "paused", "paused_by", "paused_at", "pinned_client",
        "pinned_admin", "final_ready", "final_ready_at", "files_seen_at",
        "part_ready", "handoff_artifact_id", "handoff_phase", "handoff_version",
        "page", "client_request_id", "request_fingerprint", "access_token",
        "access_token_digest", "consent_at", "consent_doc", "synthetic",
        "test_run_id", "synthetic_run_hash", "synthetic_sink",
    }
)

# Columns read or mutated by the synthetic journey outside ``orders``. This
# is intentionally a required subset rather than a hash of whole tables: an
# unrelated additive application migration stays compatible, while a renamed
# or missing probe surface blocks installation before any write.
BASE_SURFACE_COLUMNS = {
    "order_events": frozenset({"order_id", "kind", "data", "created_at"}),
    "delivery_outbox": frozenset(
        {
            "id", "order_id", "kind", "status", "attempts", "done_steps",
            "next_attempt_at", "last_error", "created_at", "updated_at",
        }
    ),
    "web_guest_sessions": frozenset(
        {"token_digest", "created_at", "last_used_at", "expires_at"}
    ),
    "web_guest_orders": frozenset({"token_digest", "order_id", "created_at"}),
    "order_claim_exchanges": frozenset(
        {
            "state_digest", "order_id", "channel", "created_at",
            "expires_at", "consumed_at",
        }
    ),
    "order_files": frozenset({"order_id"}),
    "order_items": frozenset({"order_id"}),
}
POST_SURFACE_COLUMNS = {
    **BASE_SURFACE_COLUMNS,
    "synthetic_delivery_receipts": frozenset(
        {"order_id", "run_hash", "sink", "receipt_key", "created_at"}
    ),
    "synthetic_probe_tombstones": frozenset(
        {
            "run_hash", "tuple_hash", "proof_digest", "surface_mask",
            "contract_version", "result", "cleaned_at",
        }
    ),
}


class ProbeError(RuntimeError):
    """Categorical failure that does not carry database values."""

    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


class CleanupBlocked(ProbeError):
    """Cleanup refusal with an already-sanitized public result."""

    def __init__(self, code: str, result: Mapping[str, Any] | None = None):
        super().__init__(code)
        self.result = dict(result or {})


@dataclass(frozen=True)
class SyntheticContext:
    run_id: str
    request_id: str
    consent_doc: str
    sink: str = ISOLATED_SINK
    origin: str = DEFAULT_ORIGIN

    @property
    def run_hash(self) -> str:
        return run_hash(self.run_id)


def _digest(domain: str, *values: Any) -> str:
    material = domain.encode("ascii") + b"\0"
    for value in values:
        material += str(value).encode("utf-8") + b"\0"
    return hashlib.sha256(material).hexdigest()


def run_hash(run_id: str) -> str:
    if not RUN_RE.fullmatch(run_id):
        raise ProbeError("synthetic_run_invalid")
    return _digest("out001-run-v1", run_id)


def tuple_hash(run_id: str, order_id: int) -> str:
    return _digest("out001-order-ref-v1", run_id, int(order_id))


def receipt_key(run_id: str, order_id: int) -> str:
    return _digest("out001-receipt-v1", run_id, int(order_id))


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def canonical_origin(value: str) -> str:
    try:
        parsed = urllib.parse.urlsplit(str(value))
        port = parsed.port
    except (TypeError, ValueError) as exc:
        raise ProbeError("synthetic_origin_invalid") from exc
    if (
        parsed.scheme.lower() != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
        or port not in {None, 443}
    ):
        raise ProbeError("synthetic_origin_invalid")
    host = parsed.hostname.lower().rstrip(".")
    return f"https://{host}"


def fixture_body(context: SyntheticContext) -> dict[str, Any]:
    return {
        "type": FIXTURE_TYPE,
        "topic": FIXTURE_TOPIC,
        "details": FIXTURE_DETAILS,
        "name": FIXTURE_NAME,
        "contact": "",
        "consent": True,
        "consent_doc": context.consent_doc,
        "page": FIXTURE_PAGE,
        "client_request_id": context.request_id,
        "synthetic": True,
        "test_run_id": context.run_id,
        "website": "",
    }


def request_signature(
    secret: bytes,
    timestamp: int,
    body: Mapping[str, Any],
    *,
    method: str = "POST",
    path: str = "/api/orders",
    origin: str = DEFAULT_ORIGIN,
) -> str:
    if len(secret) != 32:
        raise ValueError("OUT-001 secret must contain exactly 32 bytes")
    body_sha = hashlib.sha256(canonical_json(body)).hexdigest()
    normalized_origin = canonical_origin(origin)
    material = (
        f"v1\n{normalized_origin}\n{method.upper()}\n{path}\n{int(timestamp)}\n"
        f"{body.get('test_run_id', '')}\n{body_sha}"
    )
    return hmac.new(secret, material.encode("utf-8"), hashlib.sha256).hexdigest()


def _request_header(request: Any, name: str) -> str:
    try:
        return str(getattr(request, "headers", {}).get(name, ""))
    except Exception as exc:  # pragma: no cover - adapter boundary
        raise ProbeError("synthetic_transport_forbidden") from exc


def _query_string(request: Any) -> str:
    raw = getattr(request, "query_string", "")
    if raw:
        return str(raw)
    rel_url = getattr(request, "rel_url", None)
    return str(getattr(rel_url, "query_string", "") or "")


def _validate_transport(request: Any) -> None:
    if getattr(request, "method", "").upper() != "POST":
        raise ProbeError("synthetic_route_invalid")
    if getattr(request, "path", "") != "/api/orders" or _query_string(request):
        raise ProbeError("synthetic_route_invalid")
    if getattr(request, "cookies", None):
        raise ProbeError("synthetic_transport_forbidden")
    forbidden = (
        "Authorization", "Cookie", "X-CSRF-Token", "X-Order-Token",
        "X-Order-Tokens", "X-Claim-Exchange",
    )
    if any(_request_header(request, name) for name in forbidden):
        raise ProbeError("synthetic_transport_forbidden")
    if _request_header(request, "X-Session-Mode") != "cookie":
        raise ProbeError("synthetic_transport_forbidden")
    content_type = _request_header(request, "Content-Type").split(";", 1)[0].strip().lower()
    if content_type != "application/json":
        raise ProbeError("synthetic_transport_forbidden")


def _request_host(request: Any) -> str:
    raw = str(getattr(request, "host", "") or _request_header(request, "Host"))
    try:
        parsed = urllib.parse.urlsplit(f"//{raw}")
        port = parsed.port
    except ValueError as exc:
        raise ProbeError("synthetic_transport_forbidden") from exc
    if (
        not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or port not in {None, 443}
    ):
        raise ProbeError("synthetic_transport_forbidden")
    return parsed.hostname.lower().rstrip(".")


def _secure_parent(path: Path, *, expected_uid: int) -> None:
    if not path.is_absolute():
        raise ProbeError("synthetic_capability_unsafe")
    parent = path.parent
    try:
        if parent.resolve(strict=True) != parent:
            raise ProbeError("synthetic_capability_unsafe")
        info = os.lstat(parent)
    except (OSError, RuntimeError) as exc:
        raise ProbeError("synthetic_capability_unsafe") from exc
    if (
        not stat.S_ISDIR(info.st_mode)
        or info.st_uid != expected_uid
        or stat.S_IMODE(info.st_mode) != 0o700
    ):
        raise ProbeError("synthetic_capability_unsafe")


def _secure_capability(path: Path, *, expected_uid: int | None = None) -> dict[str, Any]:
    owner = 0 if expected_uid is None else int(expected_uid)
    _secure_parent(path, expected_uid=owner)
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        descriptor = os.open(path, flags)
    except OSError as exc:
        raise ProbeError("synthetic_disabled") from exc
    try:
        info = os.fstat(descriptor)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != owner
            or info.st_nlink != 1
            or stat.S_IMODE(info.st_mode) != 0o600
            or info.st_size <= 0
            or info.st_size > MAX_CAPABILITY_BYTES
        ):
            raise ProbeError("synthetic_capability_unsafe")
        raw = os.read(descriptor, MAX_CAPABILITY_BYTES + 1)
    finally:
        os.close(descriptor)
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProbeError("synthetic_capability_invalid") from exc
    required = {
        "version", "run_id", "request_id", "consent_doc", "issued_at",
        "expires_at", "secret_b64", "sink", "origin",
    }
    if not isinstance(value, dict) or set(value) != required:
        raise ProbeError("synthetic_capability_invalid")
    return value


def _decode_capability(
    value: Mapping[str, Any],
    *,
    now: int,
) -> tuple[SyntheticContext, bytes]:
    run_id = value.get("run_id")
    request_id = value.get("request_id")
    consent_doc = value.get("consent_doc")
    issued_at = value.get("issued_at")
    expires_at = value.get("expires_at")
    try:
        origin = canonical_origin(str(value.get("origin") or ""))
    except ProbeError as exc:
        raise ProbeError("synthetic_capability_invalid") from exc
    if (
        value.get("version") != CONTRACT_VERSION
        or not isinstance(run_id, str) or not RUN_RE.fullmatch(run_id)
        or not isinstance(request_id, str) or not REQUEST_RE.fullmatch(request_id)
        or not isinstance(consent_doc, str) or not consent_doc or len(consent_doc) > 80
        or not isinstance(issued_at, int) or not isinstance(expires_at, int)
        or expires_at <= issued_at or expires_at - issued_at > MAX_CAPABILITY_TTL
        or now < issued_at - 5 or now > expires_at
        or value.get("sink") != ISOLATED_SINK
        or origin != value.get("origin")
    ):
        raise ProbeError("synthetic_capability_invalid")
    try:
        secret = base64.b64decode(str(value.get("secret_b64") or ""), validate=True)
    except (ValueError, TypeError) as exc:
        raise ProbeError("synthetic_capability_invalid") from exc
    if len(secret) != 32:
        raise ProbeError("synthetic_capability_invalid")
    return SyntheticContext(run_id, request_id, consent_doc, ISOLATED_SINK, origin), secret


def authorize_order(
    request: Any,
    body: Mapping[str, Any],
    *,
    capability_path: Path | str = DEFAULT_CAPABILITY_PATH,
    now: int | None = None,
    expected_uid: int | None = None,
) -> SyntheticContext | None:
    """Return context for the exact signed fixture, None for ordinary traffic."""
    present = RESERVED_FIELDS.intersection(body)
    if not present:
        return None
    if present != RESERVED_FIELDS:
        raise ProbeError("synthetic_reserved_fields")
    _validate_transport(request)
    now_value = int(time.time()) if now is None else int(now)
    capability = _secure_capability(Path(capability_path), expected_uid=expected_uid)
    context, secret = _decode_capability(capability, now=now_value)
    if _request_host(request) != urllib.parse.urlsplit(context.origin).hostname:
        raise ProbeError("synthetic_transport_forbidden")
    if dict(body) != fixture_body(context):
        raise ProbeError("synthetic_payload_forbidden")
    try:
        timestamp = int(_request_header(request, "X-Salon-Out001-Timestamp"))
    except ValueError as exc:
        raise ProbeError("synthetic_signature_invalid") from exc
    supplied = _request_header(request, "X-Salon-Out001-Signature").lower()
    if abs(now_value - timestamp) > MAX_CLOCK_SKEW or not HEX64_RE.fullmatch(supplied):
        raise ProbeError("synthetic_signature_invalid")
    expected = request_signature(secret, timestamp, body, origin=context.origin)
    if not hmac.compare_digest(supplied, expected):
        raise ProbeError("synthetic_signature_invalid")
    return context


def make_capability(
    run_id: str,
    request_id: str,
    consent_doc: str,
    secret: bytes,
    *,
    issued_at: int,
    ttl: int = 180,
    origin: str = DEFAULT_ORIGIN,
) -> dict[str, Any]:
    if not RUN_RE.fullmatch(run_id) or not REQUEST_RE.fullmatch(request_id):
        raise ValueError("non-canonical OUT-001 identity")
    if not consent_doc or len(consent_doc) > 80 or len(secret) != 32:
        raise ValueError("invalid OUT-001 capability")
    if ttl <= 0 or ttl > MAX_CAPABILITY_TTL:
        raise ValueError("invalid OUT-001 capability bounds")
    try:
        normalized_origin = canonical_origin(origin)
    except ProbeError as exc:
        raise ValueError("invalid OUT-001 origin") from exc
    return {
        "version": CONTRACT_VERSION,
        "run_id": run_id,
        "request_id": request_id,
        "consent_doc": consent_doc,
        "issued_at": int(issued_at),
        "expires_at": int(issued_at) + int(ttl),
        "secret_b64": base64.b64encode(secret).decode("ascii"),
        "sink": ISOLATED_SINK,
        "origin": normalized_origin,
    }


def write_capability(path: Path | str, value: Mapping[str, Any]) -> None:
    destination = Path(path)
    if not destination.parent.exists():
        destination.parent.mkdir(mode=0o700)
    _secure_parent(destination, expected_uid=os.geteuid())
    encoded = canonical_json(value) + b"\n"
    if len(encoded) > MAX_CAPABILITY_BYTES:
        raise ValueError("capability too large")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_CLOEXEC", 0)
    descriptor = os.open(destination, flags, 0o600)
    try:
        os.write(descriptor, encoded)
        os.fsync(descriptor)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        os.close(descriptor)


def remove_capability(path: Path | str, run_id: str, *, expected_uid: int | None = None) -> None:
    destination = Path(path)
    value = _secure_capability(destination, expected_uid=expected_uid)
    if value.get("run_id") != run_id:
        raise ProbeError("synthetic_capability_mismatch")
    destination.unlink()


def _connect(database: Path | str, *, readonly: bool = False) -> sqlite3.Connection:
    path = Path(database).resolve()
    connection = sqlite3.connect(
        f"file:{path}?mode=ro" if readonly else str(path),
        uri=readonly,
        timeout=5,
    )
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    connection.execute("PRAGMA busy_timeout=5000")
    return connection


def _table_exists(connection: sqlite3.Connection, table: str) -> bool:
    return connection.execute(
        "SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?", (table,)
    ).fetchone() is not None


def _identifier(value: str) -> str:
    return '"' + str(value).replace('"', '""') + '"'


def _columns(connection: sqlite3.Connection, table: str) -> set[str]:
    if not _table_exists(connection, table):
        return set()
    return {
        str(row[1])
        for row in connection.execute(f"PRAGMA table_info({_identifier(table)})")
    }


def _normalized_schema_sql(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def order_schema_digest(connection: sqlite3.Connection) -> str:
    """Hash columns including hidden/generated state plus all order DDL."""
    columns = [
        list(row)
        for row in connection.execute(f"PRAGMA table_xinfo({_identifier('orders')})")
    ]
    schema = [
        [str(row[0]), str(row[1]), _normalized_schema_sql(row[2])]
        for row in connection.execute(
            "SELECT type,name,sql FROM sqlite_schema WHERE tbl_name='orders' "
            "AND type IN ('table','index','trigger') ORDER BY type,name"
        )
    ]
    return hashlib.sha256(
        b"out001-orders-schema-v2\0" + canonical_json(
            {"columns": columns, "schema": schema}
        )
    ).hexdigest()


def surface_schema_exact(
    connection: sqlite3.Connection,
    *,
    migrated: bool = True,
) -> bool:
    required = POST_SURFACE_COLUMNS if migrated else BASE_SURFACE_COLUMNS
    for table, columns in required.items():
        available = {
            str(row[1])
            for row in connection.execute(
                f"PRAGMA table_xinfo({_identifier(table)})"
            )
        }
        if not columns.issubset(available):
            return False
    return True


def order_schema_exact(connection: sqlite3.Connection) -> bool:
    return (
        order_schema_digest(connection) == ORDER_SCHEMA_SHA256
        and _order_links(connection) == KNOWN_ORDER_LINKS
        and surface_schema_exact(connection, migrated=True)
    )


def _value_frame(value: Any) -> bytes:
    if value is None:
        tag, payload = b"N", b""
    elif isinstance(value, bool):
        tag, payload = b"I", b"1" if value else b"0"
    elif isinstance(value, int):
        tag, payload = b"I", str(value).encode("ascii")
    elif isinstance(value, float):
        tag, payload = b"F", value.hex().encode("ascii")
    elif isinstance(value, bytes):
        tag, payload = b"B", value
    elif isinstance(value, str):
        tag, payload = b"S", value.encode("utf-8")
    else:  # pragma: no cover - sqlite adapters return only scalar types
        raise ProbeError("economic_snapshot_type")
    return tag + len(payload).to_bytes(8, "big") + payload


def _update_rows_digest(
    digest: Any,
    connection: sqlite3.Connection,
    *,
    domain: str,
    table: str,
    columns: tuple[str, ...],
    where: str = "",
    args: tuple[Any, ...] = (),
) -> None:
    available = _columns(connection, table)
    if not set(columns).issubset(available):
        raise ProbeError("economic_schema_drift")
    selected = ",".join(_identifier(column) for column in columns)
    ordering = ",".join(_identifier(column) for column in columns)
    sql = f"SELECT {selected} FROM {_identifier(table)}"
    if where:
        sql += f" WHERE {where}"
    sql += f" ORDER BY {ordering}"
    digest.update(_value_frame(domain))
    digest.update(_value_frame(table))
    for column in columns:
        digest.update(_value_frame(column))
    for row in connection.execute(sql, args):
        digest.update(b"R")
        for value in row:
            digest.update(_value_frame(value))


def _economic_guard_digest(connection: sqlite3.Connection) -> str:
    """Hash exact economic state while excluding the synthetic surface itself."""
    digest = hashlib.sha256(b"out001-economic-snapshot-v2\0")
    tables = {
        str(row[0])
        for row in connection.execute(
            "SELECT name FROM sqlite_schema WHERE type='table' "
            "AND name NOT LIKE 'sqlite_%'"
        )
    }
    selected_tables = sorted(
        table
        for table in tables
        if table in ECONOMIC_TABLES
        or any(token in table.casefold() for token in ECONOMIC_TABLE_TOKENS)
    )
    for table in selected_tables:
        schema_rows = [
            list(row)
            for row in connection.execute(
                "SELECT type,name,sql FROM sqlite_schema WHERE tbl_name=? "
                "AND type IN ('table','index','trigger') ORDER BY type,name",
                (table,),
            )
        ]
        digest.update(_value_frame("schema"))
        digest.update(_value_frame(table))
        digest.update(_value_frame(canonical_json(schema_rows)))
        columns = tuple(
            str(row[1])
            for row in connection.execute(f"PRAGMA table_info({_identifier(table)})")
        )
        if not columns:
            raise ProbeError("economic_schema_drift")
        _update_rows_digest(
            digest,
            connection,
            domain="table",
            table=table,
            columns=columns,
        )

    _update_rows_digest(
        digest,
        connection,
        domain="ordinary-order-economics",
        table="orders",
        columns=ECONOMIC_ORDER_COLUMNS,
        where="coalesce(synthetic,0)=0",
    )
    if "users" in tables:
        _update_rows_digest(
            digest,
            connection,
            domain="user-economics",
            table="users",
            columns=ECONOMIC_USER_COLUMNS,
        )
    if "settings" in tables:
        columns = _columns(connection, "settings")
        if not {"key", "value"}.issubset(columns):
            raise ProbeError("economic_schema_drift")
        digest.update(_value_frame("economic-settings"))
        for key, value in connection.execute(
            "SELECT key,value FROM settings ORDER BY key"
        ):
            lowered = str(key).casefold()
            if any(token in lowered for token in ECONOMIC_SETTING_TOKENS):
                digest.update(b"R")
                digest.update(_value_frame(key))
                digest.update(_value_frame(value))
    return digest.hexdigest()


def economic_guard_digest(database: Path | str) -> str:
    connection = _connect(database, readonly=True)
    try:
        connection.execute("BEGIN")
        return _economic_guard_digest(connection)
    finally:
        connection.rollback()
        connection.close()


def _count(
    connection: sqlite3.Connection,
    table: str,
    column: str,
    order_id: int,
    *,
    suffix: str = "",
    args: tuple[Any, ...] = (),
) -> int:
    if not _table_exists(connection, table):
        return 0
    sql = (
        f"SELECT count(*) FROM {_identifier(table)} "
        f"WHERE {_identifier(column)}=? {suffix}"
    )
    return int(connection.execute(sql, (int(order_id), *args)).fetchone()[0])


def _guest_surface(
    connection: sqlite3.Connection,
    order_id: int,
) -> tuple[list[str], int, bool]:
    if not _table_exists(connection, "web_guest_orders"):
        return [], 0, False
    tokens = [
        str(row[0])
        for row in connection.execute(
            "SELECT token_digest FROM web_guest_orders WHERE order_id=? "
            "ORDER BY token_digest",
            (int(order_id),),
        )
    ]
    if not tokens or not _table_exists(connection, "web_guest_sessions"):
        return tokens, 0, False
    sessions = 0
    shared = False
    for token in tokens:
        sessions += int(
            connection.execute(
                "SELECT count(*) FROM web_guest_sessions WHERE token_digest=?",
                (token,),
            ).fetchone()[0]
        )
        if int(
            connection.execute(
                "SELECT count(*) FROM web_guest_orders WHERE token_digest=?",
                (token,),
            ).fetchone()[0]
        ) != 1:
            shared = True
    return tokens, sessions, shared


def _order_links(connection: sqlite3.Connection) -> set[tuple[str, str]]:
    links: set[tuple[str, str]] = set()
    tables = [
        str(row[0]) for row in connection.execute(
            "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    ]
    for table in tables:
        for column in connection.execute(f"PRAGMA table_xinfo({_identifier(table)})"):
            name = str(column[1])
            lowered = name.lower()
            if "order" in lowered and "id" in lowered:
                links.add((table, name))
        for foreign_key in connection.execute(
            f"PRAGMA foreign_key_list({_identifier(table)})"
        ):
            if str(foreign_key[2]).casefold() == "orders":
                links.add((table, str(foreign_key[3])))
    return links


def ensure_run_available(database: Path | str, context: SyntheticContext) -> str:
    """Return missing/active; a tombstoned or conflicting run fails closed."""
    connection = _connect(database, readonly=True)
    try:
        if not order_schema_exact(connection):
            raise ProbeError("synthetic_schema_drift")
        if not _table_exists(connection, "synthetic_probe_tombstones"):
            raise ProbeError("synthetic_schema_missing")
        if connection.execute(
            "SELECT 1 FROM synthetic_probe_tombstones WHERE run_hash=?",
            (context.run_hash,),
        ).fetchone():
            raise ProbeError("synthetic_run_retired")
        rows = connection.execute(
            "SELECT client_request_id,synthetic_run_hash,synthetic_sink "
            "FROM orders WHERE test_run_id=?",
            (context.run_id,),
        ).fetchall()
        if not rows:
            return "missing"
        if len(rows) != 1:
            raise ProbeError("synthetic_run_conflict")
        row = rows[0]
        if (
            row["client_request_id"] != context.request_id
            or row["synthetic_run_hash"] != context.run_hash
            or row["synthetic_sink"] != context.sink
        ):
            raise ProbeError("synthetic_run_conflict")
        return "active"
    finally:
        connection.close()


def recover_exact_order_id(
    database: Path | str,
    context: SyntheticContext,
) -> int | None:
    """Private lost-response recovery; callers must never export the raw ID."""
    connection = _connect(database, readonly=True)
    try:
        if not order_schema_exact(connection):
            raise ProbeError("synthetic_schema_drift")
        rows = connection.execute(
            "SELECT id FROM orders WHERE synthetic=1 AND test_run_id=? "
            "AND synthetic_run_hash=? AND synthetic_sink=? "
            "AND client_request_id=?",
            (
                context.run_id,
                context.run_hash,
                context.sink,
                context.request_id,
            ),
        ).fetchall()
        if not rows:
            return None
        if len(rows) != 1:
            raise ProbeError("synthetic_run_conflict")
        return int(rows[0]["id"])
    finally:
        connection.close()


def _order_neutral(connection: sqlite3.Connection, row: sqlite3.Row) -> bool:
    if not order_schema_exact(connection):
        return False
    zero_fields = (
        "bonus_spent", "promo_discount", "sub_discount", "gift_amount",
        "parts_done", "archived_client", "archived_admin", "paused",
        "pinned_client", "pinned_admin", "final_ready", "part_ready",
        "handoff_version",
    )
    none_fields = (
        "user_id", "guest_contact", "deadline_text", "deadline_date",
        "quote_low", "quote_high", "price", "prepay", "promo_code",
        "gift_code", "ref_hint", "topic_id", "admin_note", "cancel_reason",
        "stages_total", "paused_by", "paused_at", "final_ready_at",
        "files_seen_at", "handoff_artifact_id", "handoff_phase",
    )
    return (
        row["status"] == "new"
        and row["source"] == "сайт"
        and row["work_type"] == FIXTURE_TYPE
        and row["guest_name"] == FIXTURE_NAME
        and row["topic"] == FIXTURE_TOPIC
        and row["details"] == FIXTURE_DETAILS
        and row["page"] == FIXTURE_PAGE
        and row["synthetic"] == 1
        and row["synthetic_sink"] == ISOLATED_SINK
        and row["synthetic_run_hash"] == run_hash(row["test_run_id"])
        and REQUEST_RE.fullmatch(str(row["client_request_id"] or "")) is not None
        and all(row[name] in (None, 0) for name in zero_fields)
        and all(row[name] is None for name in none_fields)
        and row["stage"] in (None, 1)
        and bool(row["request_fingerprint"])
        and bool(row["access_token"])
        and bool(row["access_token_digest"])
        and bool(row["consent_at"])
        and bool(row["consent_doc"])
    )


def _deliver_sync(database: Path | str, order_id: int) -> dict[str, Any]:
    connection = _connect(database)
    try:
        connection.execute("BEGIN IMMEDIATE")
        order = connection.execute("SELECT * FROM orders WHERE id=?", (int(order_id),)).fetchone()
        if not order or not _order_neutral(connection, order):
            raise ProbeError("synthetic_delivery_target_invalid")
        outboxes = connection.execute(
            "SELECT id,kind,status FROM delivery_outbox WHERE order_id=?",
            (int(order_id),),
        ).fetchall()
        if (
            len(outboxes) != 1
            or outboxes[0]["kind"] != OUTBOX_KIND
            or outboxes[0]["status"] not in {"pending", "failed", "dead", "done"}
        ):
            raise ProbeError("synthetic_outbox_invalid")
        receipts = connection.execute(
            "SELECT run_hash,sink,receipt_key FROM synthetic_delivery_receipts WHERE order_id=?",
            (int(order_id),),
        ).fetchall()
        expected_key = receipt_key(order["test_run_id"], int(order_id))
        if len(receipts) > 1:
            raise ProbeError("synthetic_receipt_cardinality")
        if receipts and (
            receipts[0]["run_hash"] != order["synthetic_run_hash"]
            or receipts[0]["sink"] != ISOLATED_SINK
            or receipts[0]["receipt_key"] != expected_key
        ):
            raise ProbeError("synthetic_receipt_invalid")
        if not receipts:
            connection.execute(
                "INSERT INTO synthetic_delivery_receipts"
                "(order_id,run_hash,sink,receipt_key,created_at) "
                "VALUES(?,?,?,?,strftime('%Y-%m-%dT%H:%M:%S','now'))",
                (int(order_id), order["synthetic_run_hash"], ISOLATED_SINK, expected_key),
            )
        connection.execute(
            "UPDATE delivery_outbox SET status='done',done_steps='isolated',"
            "last_error=NULL,updated_at=strftime('%Y-%m-%dT%H:%M:%S','now') "
            "WHERE id=? AND order_id=? AND kind=?",
            (outboxes[0]["id"], int(order_id), OUTBOX_KIND),
        )
        if connection.execute("SELECT changes()").fetchone()[0] != 1:
            raise ProbeError("synthetic_outbox_cardinality")
        if _count(connection, "synthetic_delivery_receipts", "order_id", int(order_id)) != 1:
            raise ProbeError("synthetic_receipt_cardinality")
        connection.commit()
        return {"receipt": 1, "outbox_state": "done"}
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


async def deliver_isolated(database: Path | str, order_id: int) -> dict[str, Any]:
    return await asyncio.to_thread(_deliver_sync, database, int(order_id))


def _empty_counts() -> dict[str, int]:
    return {key: 0 for key in COUNT_KEYS}


def _blocker_result(codes: set[str]) -> dict[str, Any]:
    safe = sorted(code for code in codes if code in BLOCKER_CODES)
    return {"present": bool(safe), "codes": safe}


def _tombstone_residual(
    connection: sqlite3.Connection,
    *,
    order_id: int,
    run_digest: str,
    tombstone: sqlite3.Row,
) -> dict[str, Any]:
    counts = _empty_counts()
    codes: set[str] = set()
    counts["order"] = int(
        connection.execute("SELECT count(*) FROM orders WHERE id=?", (order_id,)).fetchone()[0]
    )
    if counts["order"]:
        codes.add("order_cardinality")
    links = _order_links(connection)
    if links != KNOWN_ORDER_LINKS or order_schema_digest(connection) != ORDER_SCHEMA_SHA256:
        codes.add("schema_drift")
    events = _count(connection, "order_events", "order_id", order_id)
    counts["created_event"] = _count(
        connection, "order_events", "order_id", order_id,
        suffix="AND kind='created'",
    )
    if events:
        codes.add("event_cardinality")
    outboxes = (
        connection.execute(
            "SELECT kind,status FROM delivery_outbox WHERE order_id=?",
            (order_id,),
        ).fetchall()
        if _table_exists(connection, "delivery_outbox")
        else []
    )
    counts["outbox"] = len(outboxes)
    if outboxes:
        codes.add("outbox_cardinality")
    counts["receipt"] = _count(
        connection, "synthetic_delivery_receipts", "order_id", order_id
    )
    if counts["receipt"]:
        codes.add("receipt_cardinality")
    counts["cabinet_membership"] = _count(
        connection, "web_guest_orders", "order_id", order_id
    )
    if counts["cabinet_membership"]:
        codes.add("membership_cardinality")
    if _table_exists(connection, "web_guest_sessions") and _table_exists(
        connection, "web_guest_orders"
    ):
        counts["guest_session"] = int(
            connection.execute(
                "SELECT count(DISTINCT s.token_digest) FROM web_guest_sessions s "
                "JOIN web_guest_orders g ON g.token_digest=s.token_digest "
                "WHERE g.order_id=?",
                (order_id,),
            ).fetchone()[0]
        )
    if counts["guest_session"]:
        codes.add("guest_session_cardinality")
    counts["claim_exchange"] = _count(
        connection, "order_claim_exchanges", "order_id", order_id
    )
    if counts["claim_exchange"]:
        codes.add("claim_cardinality")
    counts["files"] = _count(connection, "order_files", "order_id", order_id)
    counts["items"] = _count(connection, "order_items", "order_id", order_id)
    if counts["files"]:
        codes.add("files_present")
    if counts["items"]:
        codes.add("items_present")
    for table, column in sorted(links - ALLOWED_LINKS):
        if _count(connection, table, column, order_id):
            codes.add("linked_business_data")
            break
    if any(counts.values()) or codes:
        codes.add("cleanup_residual")
        return {
            "state": "residual",
            "run_hash": run_digest,
            "tuple_hash": tombstone["tuple_hash"],
            "counts": counts,
            "blocker_codes": codes,
            "outbox_state": "invalid" if outboxes else "absent",
            "proof_ready": False,
            "cleanable": False,
            "stored_proof_digest": tombstone["proof_digest"],
            "surface_mask": int(tombstone["surface_mask"]),
        }
    return {
        "state": "cleaned",
        "run_hash": run_digest,
        "tuple_hash": tombstone["tuple_hash"],
        "counts": counts,
        "blocker_codes": set(),
        "outbox_state": "absent",
        "proof_ready": False,
        "cleanable": False,
        "stored_proof_digest": tombstone["proof_digest"],
        "surface_mask": int(tombstone["surface_mask"]),
    }


def _lookup_raw(
    connection: sqlite3.Connection,
    run_id: str,
    *,
    order_id: int | None = None,
) -> dict[str, Any]:
    if not RUN_RE.fullmatch(run_id):
        raise ProbeError("synthetic_run_invalid")
    if not order_schema_exact(connection):
        raise CleanupBlocked("synthetic_schema_drift")
    run_digest = run_hash(run_id)
    tombstone = None
    if _table_exists(connection, "synthetic_probe_tombstones"):
        tombstone = connection.execute(
            "SELECT tuple_hash,proof_digest,surface_mask FROM synthetic_probe_tombstones "
            "WHERE run_hash=?",
            (run_digest,),
        ).fetchone()
    rows: list[sqlite3.Row] = []
    if "test_run_id" in _columns(connection, "orders"):
        rows = connection.execute(
            "SELECT * FROM orders WHERE test_run_id=?", (run_id,)
        ).fetchall()
    if not rows:
        if tombstone:
            if order_id is not None and tuple_hash(
                run_id, int(order_id)
            ) != tombstone["tuple_hash"]:
                raise CleanupBlocked("synthetic_exact_id_mismatch")
            if order_id is not None:
                return _tombstone_residual(
                    connection,
                    order_id=int(order_id),
                    run_digest=run_digest,
                    tombstone=tombstone,
                )
            return {
                "state": "retired",
                "run_hash": run_digest,
                "tuple_hash": tombstone["tuple_hash"],
                "counts": _empty_counts(),
                "blocker_codes": set(),
                "outbox_state": "absent",
                "proof_ready": False,
                "cleanable": False,
                "stored_proof_digest": tombstone["proof_digest"],
                "surface_mask": int(tombstone["surface_mask"]),
            }
        return {
            "state": "missing",
            "run_hash": run_digest,
            "tuple_hash": None,
            "counts": _empty_counts(),
            "blocker_codes": set(),
            "outbox_state": "absent",
            "proof_ready": False,
            "cleanable": False,
        }
    if len(rows) != 1:
        raise CleanupBlocked("synthetic_order_cardinality")
    row = rows[0]
    actual_order_id = int(row["id"])
    if order_id is not None and int(order_id) != actual_order_id:
        raise CleanupBlocked("synthetic_exact_id_mismatch")

    counts = _empty_counts()
    counts["order"] = 1
    marker_valid = (
        row["synthetic"] == 1
        and row["test_run_id"] == run_id
        and row["synthetic_run_hash"] == run_digest
        and row["synthetic_sink"] == ISOLATED_SINK
    )
    counts["marker"] = 1 if marker_valid else 0
    codes: set[str] = set()
    if tombstone:
        codes.add("run_reused")
    links = _order_links(connection)
    if links != KNOWN_ORDER_LINKS or order_schema_digest(connection) != ORDER_SCHEMA_SHA256:
        codes.add("schema_drift")
    if not marker_valid:
        codes.add("marker_invalid")
    if not _order_neutral(connection, row):
        codes.add("economics_or_identity")

    created = _count(
        connection,
        "order_events",
        "order_id",
        actual_order_id,
        suffix="AND kind='created'",
    )
    total_events = _count(connection, "order_events", "order_id", actual_order_id)
    counts["created_event"] = created
    if created != 1 or total_events != 1:
        codes.add("event_cardinality")

    outbox_rows = (
        connection.execute(
            "SELECT kind,status FROM delivery_outbox WHERE order_id=?",
            (actual_order_id,),
        ).fetchall()
        if _table_exists(connection, "delivery_outbox")
        else []
    )
    counts["outbox"] = len(outbox_rows)
    outbox_state = "absent"
    if len(outbox_rows) != 1:
        codes.add("outbox_cardinality")
        outbox_state = "invalid" if outbox_rows else "absent"
    else:
        outbox_state = str(outbox_rows[0]["status"] or "invalid")
        if outbox_rows[0]["kind"] != OUTBOX_KIND:
            codes.add("outbox_kind")
        if outbox_state not in {"pending", "done", "failed", "dead"}:
            codes.add("outbox_state")
            outbox_state = "invalid"

    receipt_rows = (
        connection.execute(
            "SELECT run_hash,sink,receipt_key FROM synthetic_delivery_receipts "
            "WHERE order_id=?",
            (actual_order_id,),
        ).fetchall()
        if _table_exists(connection, "synthetic_delivery_receipts")
        else []
    )
    counts["receipt"] = len(receipt_rows)
    if len(receipt_rows) > 1:
        codes.add("receipt_cardinality")
    if receipt_rows and (
        receipt_rows[0]["run_hash"] != run_digest
        or receipt_rows[0]["sink"] != ISOLATED_SINK
        or receipt_rows[0]["receipt_key"] != receipt_key(run_id, actual_order_id)
    ):
        codes.add("receipt_invalid")

    counts["cabinet_membership"] = _count(
        connection, "web_guest_orders", "order_id", actual_order_id
    )
    counts["claim_exchange"] = _count(
        connection, "order_claim_exchanges", "order_id", actual_order_id
    )
    if counts["cabinet_membership"] > 1:
        codes.add("membership_cardinality")
    if counts["claim_exchange"] > 1:
        codes.add("claim_cardinality")
    _guest_tokens, counts["guest_session"], guest_session_shared = _guest_surface(
        connection, actual_order_id
    )
    if counts["guest_session"] > 1:
        codes.add("guest_session_cardinality")
    if guest_session_shared:
        codes.add("guest_session_shared")
    counts["files"] = _count(connection, "order_files", "order_id", actual_order_id)
    counts["items"] = _count(connection, "order_items", "order_id", actual_order_id)
    if counts["files"]:
        codes.add("files_present")
    if counts["items"]:
        codes.add("items_present")

    for table, column in sorted(links - ALLOWED_LINKS):
        if _count(connection, table, column, actual_order_id):
            codes.add("linked_business_data")
            break

    proof_ready = (
        not codes
        and counts["order"] == counts["marker"] == counts["created_event"] == 1
        and counts["outbox"] == counts["receipt"] == 1
        and counts["cabinet_membership"] == counts["guest_session"] == 1
        and counts["claim_exchange"] in {0, 1}
        and counts["files"] == counts["items"] == 0
        and outbox_state == "done"
    )
    cleanable = (
        not codes
        and counts["order"] == 1
        and counts["marker"] == 1
        and counts["outbox"] == 1
        and counts["created_event"] == 1
        and counts["receipt"] <= 1
        and counts["cabinet_membership"] <= 1
        and counts["claim_exchange"] <= 1
        and counts["guest_session"] <= 1
    )
    return {
        "state": "active",
        "run_hash": run_digest,
        "tuple_hash": tuple_hash(run_id, actual_order_id),
        "order_id": actual_order_id,
        "counts": counts,
        "blocker_codes": codes,
        "outbox_state": outbox_state,
        "proof_ready": proof_ready,
        "cleanable": cleanable,
    }


def _surface_mask(counts: Mapping[str, int]) -> int:
    mask = 0
    for index, key in enumerate(COUNT_KEYS):
        if int(counts.get(key, 0)):
            mask |= 1 << index
    return mask


def _cleanup_digest(raw: Mapping[str, Any], economic_guard: str) -> str:
    if not HEX64_RE.fullmatch(economic_guard):
        raise ProbeError("synthetic_economic_guard_invalid")
    manifest = {
        "contract": CONTRACT_SHA256,
        "economic_guard": economic_guard,
        "run_hash": raw["run_hash"],
        "tuple_hash": raw["tuple_hash"],
        "counts": {key: int(raw["counts"].get(key, 0)) for key in COUNT_KEYS},
        "outbox_state": raw["outbox_state"],
        "blockers": sorted(raw["blocker_codes"]),
        "cleanable": bool(raw["cleanable"]),
    }
    return hashlib.sha256(
        b"out001-cleanup-proof-v1\0" + canonical_json(manifest)
    ).hexdigest()


def _public(
    raw: Mapping[str, Any],
    *,
    dry_run_digest: str | None = None,
) -> dict[str, Any]:
    result = {
        "schema_version": CONTRACT_VERSION,
        "contract_sha256": CONTRACT_SHA256,
        "run_hash": raw.get("run_hash"),
        "order_ref_hash": raw.get("tuple_hash"),
        "state": raw.get("state"),
        "counts": {
            key: int((raw.get("counts") or {}).get(key, 0)) for key in COUNT_KEYS
        },
        "outbox_state": raw.get("outbox_state", "absent"),
        "blockers": _blocker_result(set(raw.get("blocker_codes") or set())),
        "proof_ready": bool(raw.get("proof_ready")),
        "cleanup": {
            "dry_run_digest": dry_run_digest,
            "applied": bool(raw.get("applied")),
            "active_zero": raw.get("state") == "cleaned",
            "tombstone_count": 1 if raw.get("state") == "cleaned" else 0,
            "second_noop": bool(raw.get("second_noop")),
            "economic_guard_unchanged": bool(raw.get("economic_guard_unchanged")),
        },
    }
    if len(canonical_json(result)) > 4096:
        raise ProbeError("synthetic_public_result_too_large")
    return result


def lookup(
    database: Path | str,
    run_id: str,
    *,
    order_id: int | None = None,
) -> dict[str, Any]:
    """Return only bounded public evidence; exact IDs are never exported."""
    connection = _connect(database, readonly=True)
    try:
        return _public(_lookup_raw(connection, run_id, order_id=order_id))
    finally:
        connection.close()


def cleanup(
    database: Path | str,
    run_id: str,
    order_id: int,
    *,
    apply: bool = False,
    dry_run_digest: str | None = None,
    expected_economic_guard: str | None = None,
) -> dict[str, Any]:
    """Dry-run or delete one exact tuple; apply requires its prior digest."""
    connection = _connect(database, readonly=True)
    try:
        connection.execute("BEGIN")
        initial = _lookup_raw(connection, run_id, order_id=int(order_id))
        initial_economic_guard = _economic_guard_digest(connection)
    except CleanupBlocked as exc:
        raise CleanupBlocked(exc.code) from None
    finally:
        connection.rollback()
        connection.close()
    if initial["state"] == "cleaned":
        result = {**initial, "second_noop": True, "applied": False}
        return _public(result, dry_run_digest=initial.get("stored_proof_digest"))
    if initial["state"] != "active":
        raise CleanupBlocked("synthetic_target_missing", _public(initial))
    if (
        not isinstance(expected_economic_guard, str)
        or not HEX64_RE.fullmatch(expected_economic_guard)
    ):
        raise CleanupBlocked("synthetic_economic_guard_required", _public(initial))
    if not hmac.compare_digest(initial_economic_guard, expected_economic_guard):
        raise CleanupBlocked("synthetic_cleanup_changed", _public(initial))
    initial = {**initial, "economic_guard_unchanged": True}
    proof = _cleanup_digest(initial, initial_economic_guard)
    if not apply:
        if not initial["cleanable"]:
            raise CleanupBlocked(
                "synthetic_cleanup_blocked",
                _public(initial, dry_run_digest=proof),
            )
        return _public(initial, dry_run_digest=proof)
    if not dry_run_digest:
        raise CleanupBlocked(
            "synthetic_dry_run_required",
            _public(initial, dry_run_digest=proof),
        )
    if not initial["cleanable"] or not hmac.compare_digest(dry_run_digest, proof):
        raise CleanupBlocked(
            "synthetic_cleanup_changed",
            _public(initial, dry_run_digest=proof),
        )

    connection = _connect(database)
    try:
        connection.execute("BEGIN IMMEDIATE")
        current = _lookup_raw(connection, run_id, order_id=int(order_id))
        current_economic_guard = _economic_guard_digest(connection)
        current = {**current, "economic_guard_unchanged": hmac.compare_digest(
            expected_economic_guard, current_economic_guard
        )}
        current_proof = _cleanup_digest(current, current_economic_guard)
        if (
            not current["cleanable"]
            or not current["economic_guard_unchanged"]
            or not hmac.compare_digest(dry_run_digest, current_proof)
        ):
            raise CleanupBlocked(
                "synthetic_cleanup_changed",
                _public(current, dry_run_digest=current_proof),
            )
        tokens, session_count, shared_session = _guest_surface(
            connection, int(order_id)
        )
        session_expected = {
            token: int(
                connection.execute(
                    "SELECT count(*) FROM web_guest_sessions WHERE token_digest=?",
                    (token,),
                ).fetchone()[0]
            )
            for token in tokens
        }
        if (
            len(tokens) != int(current["counts"]["cabinet_membership"])
            or session_count != int(current["counts"]["guest_session"])
            or shared_session
        ):
            raise CleanupBlocked("synthetic_cleanup_changed")
        connection.execute(
            "INSERT INTO synthetic_probe_tombstones"
            "(run_hash,tuple_hash,proof_digest,surface_mask,contract_version,result,cleaned_at) "
            "VALUES(?,?,?,?,?,'cleaned',strftime('%Y-%m-%dT%H:%M:%S','now'))",
            (
                current["run_hash"],
                current["tuple_hash"],
                current_proof,
                _surface_mask(current["counts"]),
                CONTRACT_VERSION,
            ),
        )
        delete_specs = (
            (
                "web_guest_orders", "order_id=?", (int(order_id),),
                int(current["counts"]["cabinet_membership"]),
            ),
            (
                "order_claim_exchanges", "order_id=?", (int(order_id),),
                int(current["counts"]["claim_exchange"]),
            ),
            (
                "synthetic_delivery_receipts", "order_id=?", (int(order_id),),
                int(current["counts"]["receipt"]),
            ),
            (
                "delivery_outbox",
                "order_id=? AND kind=?",
                (int(order_id), OUTBOX_KIND),
                int(current["counts"]["outbox"]),
            ),
            (
                "order_events", "order_id=? AND kind='created'", (int(order_id),),
                int(current["counts"]["created_event"]),
            ),
        )
        for table, where, args, expected in delete_specs:
            connection.execute(f'DELETE FROM "{table}" WHERE {where}', args)
            if int(connection.execute("SELECT changes()").fetchone()[0]) != expected:
                raise CleanupBlocked("synthetic_surface_delete_cardinality")
        for token in tokens:
            connection.execute(
                "DELETE FROM web_guest_sessions WHERE token_digest=? "
                "AND NOT EXISTS(SELECT 1 FROM web_guest_orders WHERE token_digest=?)",
                (token, token),
            )
            if int(connection.execute("SELECT changes()").fetchone()[0]) != session_expected[token]:
                raise CleanupBlocked("synthetic_session_delete_cardinality")
            if int(
                connection.execute(
                    "SELECT count(*) FROM web_guest_orders WHERE token_digest=?",
                    (token,),
                ).fetchone()[0]
            ) or int(
                connection.execute(
                    "SELECT count(*) FROM web_guest_sessions WHERE token_digest=?",
                    (token,),
                ).fetchone()[0]
            ):
                raise CleanupBlocked("synthetic_session_delete_residual")
        connection.execute(
            "DELETE FROM orders WHERE id=? AND synthetic=1 AND test_run_id=? "
            "AND synthetic_run_hash=? AND synthetic_sink=?",
            (int(order_id), run_id, current["run_hash"], ISOLATED_SINK),
        )
        if connection.execute("SELECT changes()").fetchone()[0] != 1:
            raise CleanupBlocked("synthetic_order_delete_cardinality")
        post_delete = _lookup_raw(connection, run_id, order_id=int(order_id))
        if post_delete["state"] != "cleaned" or any(post_delete["counts"].values()):
            raise CleanupBlocked("synthetic_cleanup_postcheck")
        if not hmac.compare_digest(
            expected_economic_guard, _economic_guard_digest(connection)
        ):
            raise CleanupBlocked("synthetic_economic_guard_changed")
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()

    final_connection = _connect(database, readonly=True)
    try:
        final = _lookup_raw(final_connection, run_id, order_id=int(order_id))
    finally:
        final_connection.close()
    if final["state"] != "cleaned" or any(final["counts"].values()):
        raise CleanupBlocked("synthetic_cleanup_postcheck", _public(final))
    return _public(
        {**final, "applied": True, "economic_guard_unchanged": True},
        dry_run_digest=current_proof,
    )
