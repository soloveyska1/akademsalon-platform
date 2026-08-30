"""Privacy-safe first-party analytics v2 for Academic Salon.

This module is deliberately self-contained: it owns an additive SQLite schema,
strictly validates the tracked JSON contract and exposes an optional aiohttp
adapter. Raw IP addresses and user-agent strings are used only in memory to
derive coarse categories and are never persisted.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import ipaddress
import json
import re
import sqlite3
import threading
import time
import uuid
from collections import defaultdict, deque
from contextlib import contextmanager, suppress
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Mapping


SCHEMA_VERSION = 2
DEFAULT_CONTRACT_PATH = Path(__file__).with_name("analytics_contract_v2.json")
BODY_LIMIT = 32 * 1024
EVENT_ID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
SESSION_ID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
VISITOR_ID_RE = re.compile(r"^v[0-9a-f]{18}$")
DELETE_SECRET_RE = re.compile(r"^[0-9a-f]{64}$")
SAFE_CODE_RE = re.compile(r"^[a-z][a-z0-9_-]{0,31}$")
BOT_RE = re.compile(
    r"bot|spider|crawl|slurp|curl|wget|python-requests|httpx|monitor|preview|"
    r"yandex\.com/bots|petalbot|ahrefs|semrush",
    re.I,
)
SESSION_NAMESPACE = uuid.UUID("cb81bc4b-ef10-4d18-a906-f32e8c1b1e82")


class AnalyticsError(Exception):
    """Safe public analytics error."""

    code = "analytics_error"


class ValidationError(AnalyticsError):
    code = "invalid_payload"

    def __init__(self, code: str = "invalid_payload") -> None:
        super().__init__(code)
        self.code = code


class RateLimited(AnalyticsError):
    code = "rate_limited"


class GrantBudgetExhausted(AnalyticsError):
    code = "grant_budget_exhausted"


class RevokedIdentity(AnalyticsError):
    code = "identity_revoked"


class RateLimiter:
    """In-memory, non-persistent rate budget; identifiers never leave memory."""

    def __init__(self, limit: int, global_limit: int, window_seconds: float = 60.0) -> None:
        self.limit = int(limit)
        self.global_limit = int(global_limit)
        self.window = float(window_seconds)
        self._per_key: dict[str, deque[float]] = defaultdict(deque)
        self._global: deque[float] = deque()
        self._lock = threading.Lock()

    @staticmethod
    def _prune(values: deque[float], cutoff: float) -> None:
        while values and values[0] <= cutoff:
            values.popleft()

    def reject_reason(
        self,
        key: str,
        cost: int = 1,
        *,
        consume: bool = True,
    ) -> str | None:
        cost = max(1, min(int(cost), self.limit))
        now = time.monotonic()
        cutoff = now - self.window
        with self._lock:
            values = self._per_key[str(key or "?")]
            self._prune(values, cutoff)
            self._prune(self._global, cutoff)
            if len(values) + cost > self.limit:
                return "key"
            if len(self._global) + cost > self.global_limit:
                return "global"
            if consume:
                values.extend([now] * cost)
                self._global.extend([now] * cost)
            if len(self._per_key) > 5000:
                for old_key in list(self._per_key)[:1000]:
                    self._prune(self._per_key[old_key], cutoff)
                    if not self._per_key[old_key]:
                        self._per_key.pop(old_key, None)
            return None

    def allow(self, key: str, cost: int = 1) -> bool:
        return self.reject_reason(key, cost) is None


def consume_rate_group(
    budgets: tuple[tuple[RateLimiter, str], ...],
    *,
    cost: int = 1,
    lock: threading.Lock,
) -> tuple[int, str] | None:
    """Atomically consume all budgets or none; return the rejecting budget."""
    with lock:
        for index, (limiter, key) in enumerate(budgets):
            reason = limiter.reject_reason(key, cost, consume=False)
            if reason is not None:
                return index, reason
        for limiter, key in budgets:
            limiter.reject_reason(key, cost)
    return None


class GrantSigner:
    """Short-lived, visitor/IP-bound ingest capability without cookies or stored IP."""

    def __init__(self, secret: str, *, ttl_minutes: int = 360, event_budget: int = 60) -> None:
        if len(str(secret or "")) < 32:
            raise RuntimeError("analytics_signing_secret_missing")
        self.secret = str(secret).encode("utf-8")
        self.ttl = timedelta(minutes=max(5, min(int(ttl_minutes), 360)))
        self.event_budget = max(10, min(int(event_budget), 100))

    @staticmethod
    def _b64encode(value: bytes) -> str:
        return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")

    @staticmethod
    def _b64decode(value: str) -> bytes:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))

    @staticmethod
    def _network(ip: str) -> str:
        try:
            address = ipaddress.ip_address(str(ip or ""))
            prefix = 24 if address.version == 4 else 56
            return str(ipaddress.ip_network(f"{address}/{prefix}", strict=False))
        except ValueError:
            return "unknown"

    def _network_tag(self, ip: str) -> str:
        return hmac.new(self.secret, ("network:" + self._network(ip)).encode("ascii"), hashlib.sha256).hexdigest()[:24]

    def issue(self, visitor_id: str, ip: str, now: datetime) -> dict[str, Any]:
        issued = int(now.timestamp())
        payload = {
            "v": SCHEMA_VERSION,
            "vid": visitor_id,
            "iat": issued,
            "exp": int((now + self.ttl).timestamp()),
            "nonce": uuid.uuid4().hex,
            "net": self._network_tag(ip),
            "budget": self.event_budget,
        }
        body = self._b64encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
        signature = self._b64encode(hmac.new(self.secret, body.encode("ascii"), hashlib.sha256).digest())
        return {"grant": body + "." + signature, "expires_at": payload["exp"]}

    def verify(self, token: Any, visitor_id: str, ip: str, now: datetime) -> dict[str, Any]:
        try:
            body, signature = str(token or "").split(".", 1)
            expected = self._b64encode(hmac.new(self.secret, body.encode("ascii"), hashlib.sha256).digest())
            if not hmac.compare_digest(signature, expected):
                raise ValidationError("grant_invalid")
            payload = json.loads(self._b64decode(body).decode("utf-8"))
        except ValidationError:
            raise
        except Exception as exc:
            raise ValidationError("grant_invalid") from exc
        if set(payload) != {"v", "vid", "iat", "exp", "nonce", "net", "budget"}:
            raise ValidationError("grant_invalid")
        if payload["v"] != SCHEMA_VERSION or payload["vid"] != visitor_id:
            raise ValidationError("grant_mismatch")
        if payload["net"] != self._network_tag(ip):
            raise ValidationError("grant_mismatch")
        timestamp = int(now.timestamp())
        if not isinstance(payload["iat"], int) or not isinstance(payload["exp"], int):
            raise ValidationError("grant_invalid")
        if payload["iat"] > timestamp + 60 or payload["exp"] < timestamp:
            raise ValidationError("grant_expired")
        if not re.fullmatch(r"[0-9a-f]{32}", str(payload["nonce"])):
            raise ValidationError("grant_invalid")
        if payload["budget"] != self.event_budget:
            raise ValidationError("grant_invalid")
        return payload


class AnalyticsStore:
    """Transactional analytics store and full-period server-side readback."""

    def __init__(
        self,
        db_path: str | Path,
        *,
        contract_path: str | Path = DEFAULT_CONTRACT_PATH,
        geo_db_path: str | Path | None = None,
        clock: Callable[[], datetime] | None = None,
    ) -> None:
        self.db_path = str(db_path)
        self.contract_path = Path(contract_path)
        self.contract = json.loads(self.contract_path.read_text(encoding="utf-8"))
        if self.contract.get("schema_version") != SCHEMA_VERSION:
            raise RuntimeError("analytics_contract_schema_mismatch")
        self.pages = dict(self.contract["pages"])
        self.events = dict(self.contract["events"])
        self.cta_values = set(self.contract.get("cta_values", []))
        self.variant_exact = set(self.contract.get("variant_exact", []))
        self.variant_re = re.compile(self.contract.get("variant_pattern", r"a^"))
        self.error_types = set(self.contract.get("error_types", [
            "type_error", "reference_error", "syntax_error", "security_error",
            "network_error", "runtime_error",
        ]))
        self.source_kinds = set(self.contract["source_kinds"])
        self.source_names = set(self.contract["source_names"])
        self.campaign_source_codes = set(self.contract.get("campaign_source_codes", []))
        self.campaign_medium_codes = set(self.contract.get("campaign_medium_codes", []))
        self.campaign_codes = set(self.contract.get("campaign_codes", []))
        self.release = str(self.contract["release"])
        self.session_timeout = timedelta(minutes=int(self.contract["session_timeout_minutes"]))
        self.retention = timedelta(days=int(self.contract["raw_retention_days"]))
        self.retention_cleanup_interval = max(
            60,
            min(int(self.contract.get("retention_cleanup_interval_seconds", 3600)), 86400),
        )
        self.clock = clock or (lambda: datetime.now(timezone.utc))
        self.geo_db_path = Path(geo_db_path) if geo_db_path else None
        self._geo_reader = None
        self._geo_lock = threading.Lock()
        self._cleanup_lock = threading.Lock()
        self._last_cleanup = 0.0

    def _now(self) -> datetime:
        value = self.clock()
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @staticmethod
    def _iso(value: datetime) -> str:
        return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    @staticmethod
    def _parse_iso(value: str, error_code: str = "invalid_time") -> datetime:
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except (TypeError, ValueError) as exc:
            raise ValidationError(error_code) from exc
        if parsed.tzinfo is None:
            raise ValidationError(error_code)
        return parsed.astimezone(timezone.utc)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=5.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    @contextmanager
    def _connection(self):
        conn = self._connect()
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def initialize(self) -> None:
        with self._connection() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS analytics_v2_visitors(
                  visitor_id TEXT PRIMARY KEY,
                  deletion_hash TEXT NOT NULL,
                  first_at TEXT NOT NULL,
                  last_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS analytics_v2_sessions(
                  id TEXT PRIMARY KEY,
                  visitor_id TEXT NOT NULL REFERENCES analytics_v2_visitors(visitor_id) ON DELETE CASCADE,
                  started_at TEXT NOT NULL,
                  last_at TEXT NOT NULL,
                  entry_page TEXT NOT NULL,
                  exit_page TEXT NOT NULL,
                  first_source_kind TEXT NOT NULL,
                  first_source_name TEXT NOT NULL,
                  first_source_medium TEXT NOT NULL DEFAULT '',
                  first_source_campaign TEXT NOT NULL DEFAULT '',
                  last_source_kind TEXT NOT NULL,
                  last_source_name TEXT NOT NULL,
                  last_source_medium TEXT NOT NULL DEFAULT '',
                  last_source_campaign TEXT NOT NULL DEFAULT '',
                  device TEXT NOT NULL,
                  browser TEXT NOT NULL,
                  os TEXT NOT NULL,
                  country TEXT NOT NULL DEFAULT '',
                  region TEXT NOT NULL DEFAULT '',
                  city TEXT NOT NULL DEFAULT '',
                  bot INTEGER NOT NULL DEFAULT 0,
                  pageviews INTEGER NOT NULL DEFAULT 0,
                  event_count INTEGER NOT NULL DEFAULT 0
                );
                CREATE INDEX IF NOT EXISTS idx_analytics_v2_sessions_visitor
                  ON analytics_v2_sessions(visitor_id, last_at DESC);
                CREATE INDEX IF NOT EXISTS idx_analytics_v2_sessions_last
                  ON analytics_v2_sessions(last_at DESC, id DESC);
                CREATE TABLE IF NOT EXISTS analytics_v2_events(
                  event_id TEXT PRIMARY KEY,
                  session_id TEXT NOT NULL REFERENCES analytics_v2_sessions(id) ON DELETE CASCADE,
                  visitor_id TEXT NOT NULL REFERENCES analytics_v2_visitors(visitor_id) ON DELETE CASCADE,
                  event TEXT NOT NULL,
                  page TEXT NOT NULL,
                  cta_id TEXT NOT NULL DEFAULT '',
                  variant TEXT NOT NULL DEFAULT '',
                  error_type TEXT NOT NULL DEFAULT '',
                  source_kind TEXT NOT NULL,
                  source_name TEXT NOT NULL,
                  source_medium TEXT NOT NULL DEFAULT '',
                  source_campaign TEXT NOT NULL DEFAULT '',
                  release TEXT NOT NULL,
                  device TEXT NOT NULL,
                  browser TEXT NOT NULL,
                  os TEXT NOT NULL,
                  country TEXT NOT NULL DEFAULT '',
                  region TEXT NOT NULL DEFAULT '',
                  city TEXT NOT NULL DEFAULT '',
                  bot INTEGER NOT NULL DEFAULT 0,
                  client_sequence INTEGER NOT NULL,
                  sequence INTEGER NOT NULL,
                  occurred_at TEXT NOT NULL,
                  received_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_analytics_v2_events_time
                  ON analytics_v2_events(occurred_at, event);
                CREATE INDEX IF NOT EXISTS idx_analytics_v2_events_session
                  ON analytics_v2_events(session_id, sequence);
                CREATE TABLE IF NOT EXISTS analytics_v2_health(
                  bucket TEXT PRIMARY KEY,
                  accepted INTEGER NOT NULL DEFAULT 0,
                  duplicate INTEGER NOT NULL DEFAULT 0,
                  invalid INTEGER NOT NULL DEFAULT 0,
                  rate_limited INTEGER NOT NULL DEFAULT 0,
                  revoked INTEGER NOT NULL DEFAULT 0,
                  server_error INTEGER NOT NULL DEFAULT 0
                );
                CREATE TABLE IF NOT EXISTS analytics_v2_revocations(
                  deletion_hash TEXT PRIMARY KEY,
                  revoked_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS analytics_v2_meta(
                  key TEXT PRIMARY KEY,
                  value TEXT NOT NULL
                );
                """
            )
            event_columns = {
                row["name"] for row in conn.execute("PRAGMA table_info(analytics_v2_events)")
            }
            if "client_sequence" not in event_columns:
                conn.execute(
                    "ALTER TABLE analytics_v2_events "
                    "ADD COLUMN client_sequence INTEGER NOT NULL DEFAULT 0"
                )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_analytics_v2_events_visitor_order "
                "ON analytics_v2_events(visitor_id,occurred_at,client_sequence,event_id)"
            )
            conn.execute(
                "INSERT INTO analytics_v2_meta(key,value) VALUES('schema_version',?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (str(SCHEMA_VERSION),),
            )
            conn.execute(
                "INSERT INTO analytics_v2_meta(key,value) VALUES('contract_version',?) "
                "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                (str(self.contract.get("contract_version", "")),),
            )
        self.cleanup_retention(force=True)

    def _health(
        self,
        conn: sqlite3.Connection,
        *,
        accepted: int = 0,
        duplicate: int = 0,
        invalid: int = 0,
        rate_limited: int = 0,
        revoked: int = 0,
        server_error: int = 0,
    ) -> None:
        bucket = self._now().strftime("%Y-%m-%dT%H:00:00Z")
        conn.execute(
            """
            INSERT INTO analytics_v2_health(
              bucket,accepted,duplicate,invalid,rate_limited,revoked,server_error
            ) VALUES(?,?,?,?,?,?,?)
            ON CONFLICT(bucket) DO UPDATE SET
              accepted=accepted+excluded.accepted,
              duplicate=duplicate+excluded.duplicate,
              invalid=invalid+excluded.invalid,
              rate_limited=rate_limited+excluded.rate_limited,
              revoked=revoked+excluded.revoked,
              server_error=server_error+excluded.server_error
            """,
            (bucket, accepted, duplicate, invalid, rate_limited, revoked, server_error),
        )

    def record_health(self, **values: int) -> None:
        with self._connection() as conn:
            self._health(conn, **values)

    @staticmethod
    def _deletion_hash(secret: str) -> str:
        return hashlib.sha256(("analytics-v2-delete:" + secret).encode("ascii")).hexdigest()

    @staticmethod
    def _safe_code(value: Any, *, allow_empty: bool = False) -> str:
        raw = str(value or "").strip().lower()
        if not raw and allow_empty:
            return ""
        if not SAFE_CODE_RE.fullmatch(raw):
            raise ValidationError("invalid_source_code")
        if len(re.findall(r"\d", raw)) >= 7:
            raise ValidationError("invalid_source_code")
        if re.fullmatch(r"[a-f0-9]{16,}", raw):
            raise ValidationError("invalid_source_code")
        if len(raw) >= 20 and re.search(r"[a-z]", raw) and re.search(r"\d", raw):
            raise ValidationError("invalid_source_code")
        return raw

    def _validate_source(self, value: Any) -> dict[str, str]:
        if not isinstance(value, dict) or set(value) - {"kind", "name", "medium", "campaign"}:
            raise ValidationError("invalid_source")
        kind = str(value.get("kind") or "")
        if kind not in self.source_kinds:
            raise ValidationError("invalid_source")
        name = self._safe_code(value.get("name"))
        if kind == "campaign":
            if name not in self.campaign_source_codes:
                raise ValidationError("unknown_campaign_source")
        elif name not in self.source_names:
            raise ValidationError("invalid_source")
        expected = {
            "search": {"yandex", "google", "bing"},
            "social": {"telegram", "vk"},
            "referral": {"mailru", "external"},
            "direct": {"direct"},
            "unknown": {"unknown"},
        }
        if kind in expected and name not in expected[kind]:
            raise ValidationError("invalid_source")
        medium = self._safe_code(value.get("medium"), allow_empty=True)
        campaign = self._safe_code(value.get("campaign"), allow_empty=True)
        if kind != "campaign" and (medium or campaign):
            raise ValidationError("invalid_source")
        if kind == "campaign":
            if medium and medium not in self.campaign_medium_codes:
                raise ValidationError("unknown_campaign_medium")
            if campaign and campaign not in self.campaign_codes:
                raise ValidationError("unknown_campaign")
        return {"kind": kind, "name": name, "medium": medium, "campaign": campaign}

    def _validate_event(self, value: Any, consent_at: datetime, now: datetime) -> dict[str, Any]:
        allowed_keys = {
            "event_id", "event", "page", "release", "source", "cta_id", "variant", "error_type",
            "occurred_at", "client_sequence",
        }
        if not isinstance(value, dict) or set(value) - allowed_keys:
            raise ValidationError("invalid_event_shape")
        try:
            event_id = str(uuid.UUID(str(value.get("event_id") or "")))
        except (ValueError, AttributeError) as exc:
            raise ValidationError("invalid_event_id") from exc
        if not EVENT_ID_RE.fullmatch(event_id):
            raise ValidationError("invalid_event_id")
        client_sequence = value.get("client_sequence")
        if (
            isinstance(client_sequence, bool)
            or not isinstance(client_sequence, int)
            or client_sequence < 1
            or client_sequence > 9_007_199_254_740_991
        ):
            raise ValidationError("invalid_client_sequence")
        occurred_at = self._parse_iso(str(value.get("occurred_at") or ""), "invalid_event_time")
        if occurred_at < consent_at - timedelta(seconds=10):
            raise ValidationError("event_before_consent")
        if occurred_at < now - timedelta(hours=int(self.contract.get("offline_queue_hours", 72)) + 1):
            raise ValidationError("event_too_old")
        if occurred_at > now + timedelta(minutes=10):
            raise ValidationError("event_in_future")
        event = str(value.get("event") or "")
        if event not in self.events:
            raise ValidationError("unknown_event")
        page = str(value.get("page") or "")
        if page not in self.pages:
            raise ValidationError("unknown_page")
        if value.get("release") != self.release:
            raise ValidationError("release_mismatch")
        cta = str(value.get("cta_id") or "")
        if cta and cta not in self.cta_values:
            raise ValidationError("unknown_cta")
        variant = str(value.get("variant") or "")
        if variant and variant not in self.variant_exact and not self.variant_re.fullmatch(variant):
            raise ValidationError("unknown_variant")
        error_type = str(value.get("error_type") or "")
        if event == "js_error":
            if error_type not in self.error_types:
                raise ValidationError("unknown_error_type")
        elif error_type:
            raise ValidationError("unexpected_error_type")
        return {
            "event_id": event_id,
            "event": event,
            "page": page,
            "release": self.release,
            "source": self._validate_source(value.get("source")),
            "cta_id": cta,
            "variant": variant,
            "error_type": error_type,
            "occurred_at": self._iso(occurred_at),
            "client_sequence": client_sequence,
        }

    def validate_envelope(
        self, payload: Any
    ) -> tuple[dict[str, Any], list[dict[str, Any]], list[str], int]:
        allowed_keys = {
            "schema_version", "visitor_id", "deletion_secret", "consent_version", "consent_at", "grant", "events"
        }
        if not isinstance(payload, dict) or set(payload) - allowed_keys:
            raise ValidationError("invalid_envelope")
        if payload.get("schema_version") != SCHEMA_VERSION:
            raise ValidationError("schema_mismatch")
        visitor_id = str(payload.get("visitor_id") or "").lower()
        secret = str(payload.get("deletion_secret") or "").lower()
        if not VISITOR_ID_RE.fullmatch(visitor_id):
            raise ValidationError("invalid_visitor_id")
        if not DELETE_SECRET_RE.fullmatch(secret):
            raise ValidationError("invalid_deletion_secret")
        consent_version = payload.get("consent_version")
        if not isinstance(consent_version, int) or consent_version < 3 or consent_version > 99:
            raise ValidationError("invalid_consent_version")
        consent_at = self._parse_iso(str(payload.get("consent_at") or ""), "invalid_consent_time")
        now = self._now()
        if consent_at > now + timedelta(minutes=10) or consent_at < now - timedelta(days=366):
            raise ValidationError("invalid_consent_time")
        values = payload.get("events")
        if not isinstance(values, list) or not 1 <= len(values) <= 20:
            raise ValidationError("invalid_batch")
        grant = str(payload.get("grant") or "")
        if not grant or len(grant) > 1024:
            raise ValidationError("grant_invalid")
        valid: list[dict[str, Any]] = []
        discarded: list[str] = []
        invalid_count = 0
        for value in values:
            try:
                valid.append(self._validate_event(value, consent_at, now))
            except ValidationError:
                invalid_count += 1
                try:
                    candidate = str(uuid.UUID(str((value or {}).get("event_id") or "")))
                except (ValueError, AttributeError):
                    candidate = ""
                if candidate:
                    discarded.append(candidate)
        envelope = {
            "visitor_id": visitor_id,
            "deletion_secret": secret,
            "consent_version": consent_version,
            "consent_at": self._iso(consent_at),
            "grant": grant,
        }
        return envelope, valid, discarded, invalid_count

    @staticmethod
    def _user_agent_categories(user_agent: str) -> dict[str, Any]:
        ua = str(user_agent or "")
        bot = bool(BOT_RE.search(ua))
        if bot:
            device = "robot"
        elif re.search(r"iPad|Tablet|Android(?!.*Mobile)", ua, re.I):
            device = "tablet"
        elif re.search(r"iPhone|Android.*Mobile|Mobile", ua, re.I):
            device = "phone"
        elif ua:
            device = "desktop"
        else:
            device = "unknown"
        if re.search(r"YaBrowser/", ua):
            browser = "yandex"
        elif re.search(r"Edg/", ua):
            browser = "edge"
        elif re.search(r"OPR/", ua):
            browser = "opera"
        elif re.search(r"Firefox/", ua):
            browser = "firefox"
        elif re.search(r"Chrome/|CriOS/", ua):
            browser = "chrome"
        elif re.search(r"Safari/", ua):
            browser = "safari"
        else:
            browser = "other"
        if re.search(r"iPhone|iPad|iOS", ua, re.I):
            os_name = "ios"
        elif re.search(r"Android", ua, re.I):
            os_name = "android"
        elif re.search(r"Windows", ua, re.I):
            os_name = "windows"
        elif re.search(r"Macintosh|Mac OS", ua, re.I):
            os_name = "macos"
        elif re.search(r"Linux", ua, re.I):
            os_name = "linux"
        else:
            os_name = "other"
        return {"device": device, "browser": browser, "os": os_name, "bot": bot}

    @staticmethod
    def _geo_text(value: Any) -> str:
        raw = str(value or "").strip()
        if not raw or len(raw) > 64 or re.search(r"[@/?#\\\x00-\x1f]", raw):
            return ""
        return raw

    def _geo_categories(self, ip: str) -> dict[str, str]:
        result = {"country": "", "region": "", "city": ""}
        try:
            address = ipaddress.ip_address(str(ip or ""))
            if address.is_private or address.is_loopback or address.is_reserved:
                return result
        except ValueError:
            return result
        if not self.geo_db_path or not self.geo_db_path.is_file():
            return result
        try:
            with self._geo_lock:
                if self._geo_reader is None:
                    import maxminddb  # type: ignore

                    self._geo_reader = maxminddb.open_database(str(self.geo_db_path))
                record = self._geo_reader.get(str(address)) or {}
            country_names = ((record.get("country") or {}).get("names") or {})
            subdivisions = record.get("subdivisions") or []
            region_names = ((subdivisions[0] if subdivisions else {}).get("names") or {})
            city_names = ((record.get("city") or {}).get("names") or {})
            result = {
                "country": self._geo_text(country_names.get("ru") or country_names.get("en")),
                "region": self._geo_text(region_names.get("ru") or region_names.get("en")),
                "city": self._geo_text(city_names.get("ru") or city_names.get("en")),
            }
        except Exception:
            return {"country": "", "region": "", "city": ""}
        return result

    @staticmethod
    def _event_signature(event: Mapping[str, Any]) -> tuple[Any, ...]:
        source = event["source"]
        return (
            event["event"], event["page"], event["cta_id"], event["variant"],
            event["error_type"], source["kind"], source["name"], source["medium"],
            source["campaign"], event["release"], event["occurred_at"],
            event["client_sequence"],
        )

    @staticmethod
    def _stored_event_signature(row: sqlite3.Row) -> tuple[Any, ...]:
        return (
            row["event"], row["page"], row["cta_id"], row["variant"],
            row["error_type"], row["source_kind"], row["source_name"],
            row["source_medium"], row["source_campaign"], row["release"],
            row["occurred_at"], row["client_sequence"],
        )

    def _rebuild_visitor_sessions(
        self, conn: sqlite3.Connection, visitor_id: str
    ) -> dict[str, str]:
        """Rebuild one visitor from event time, including delayed/out-of-order delivery."""
        rows = conn.execute(
            "SELECT * FROM analytics_v2_events WHERE visitor_id=? "
            "ORDER BY occurred_at,client_sequence,event_id",
            (visitor_id,),
        ).fetchall()
        if not rows:
            conn.execute("DELETE FROM analytics_v2_sessions WHERE visitor_id=?", (visitor_id,))
            conn.execute("DELETE FROM analytics_v2_visitors WHERE visitor_id=?", (visitor_id,))
            return {}

        groups: list[list[sqlite3.Row]] = []
        current: list[sqlite3.Row] = []
        previous_at: datetime | None = None
        for row in rows:
            occurred_at = self._parse_iso(row["occurred_at"], "invalid_stored_event_time")
            if previous_at is not None and occurred_at - previous_at > self.session_timeout:
                groups.append(current)
                current = []
            current.append(row)
            previous_at = occurred_at
        if current:
            groups.append(current)

        target_ids: list[str] = []
        event_sessions: dict[str, str] = {}
        for group in groups:
            first, last = group[0], group[-1]
            session_id = str(uuid.uuid5(
                SESSION_NAMESPACE, f"{visitor_id}:{first['event_id']}"
            ))
            target_ids.append(session_id)
            pageviews = sum(1 for row in group if row["event"] == "page_view")
            conn.execute(
                """
                INSERT INTO analytics_v2_sessions(
                  id,visitor_id,started_at,last_at,entry_page,exit_page,
                  first_source_kind,first_source_name,first_source_medium,first_source_campaign,
                  last_source_kind,last_source_name,last_source_medium,last_source_campaign,
                  device,browser,os,country,region,city,bot,pageviews,event_count
                ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                  visitor_id=excluded.visitor_id,started_at=excluded.started_at,
                  last_at=excluded.last_at,entry_page=excluded.entry_page,
                  exit_page=excluded.exit_page,first_source_kind=excluded.first_source_kind,
                  first_source_name=excluded.first_source_name,
                  first_source_medium=excluded.first_source_medium,
                  first_source_campaign=excluded.first_source_campaign,
                  last_source_kind=excluded.last_source_kind,
                  last_source_name=excluded.last_source_name,
                  last_source_medium=excluded.last_source_medium,
                  last_source_campaign=excluded.last_source_campaign,
                  device=excluded.device,browser=excluded.browser,os=excluded.os,
                  country=excluded.country,region=excluded.region,city=excluded.city,
                  bot=excluded.bot,pageviews=excluded.pageviews,event_count=excluded.event_count
                """,
                (
                    session_id, visitor_id, first["occurred_at"], last["occurred_at"],
                    first["page"], last["page"], first["source_kind"], first["source_name"],
                    first["source_medium"], first["source_campaign"], last["source_kind"],
                    last["source_name"], last["source_medium"], last["source_campaign"],
                    first["device"], first["browser"], first["os"], first["country"],
                    first["region"], first["city"], first["bot"], pageviews, len(group),
                ),
            )
            for sequence, row in enumerate(group, 1):
                conn.execute(
                    "UPDATE analytics_v2_events SET session_id=?,sequence=? WHERE event_id=?",
                    (session_id, sequence, row["event_id"]),
                )
                event_sessions[row["event_id"]] = session_id

        placeholders = ",".join("?" for _ in target_ids)
        conn.execute(
            f"DELETE FROM analytics_v2_sessions WHERE visitor_id=? AND id NOT IN ({placeholders})",
            [visitor_id] + target_ids,
        )
        conn.execute(
            "UPDATE analytics_v2_visitors SET first_at=?,last_at=? WHERE visitor_id=?",
            (rows[0]["occurred_at"], rows[-1]["occurred_at"], visitor_id),
        )
        return event_sessions

    def cleanup_retention(self, *, force: bool = False) -> dict[str, int]:
        now_monotonic = time.monotonic()
        with self._cleanup_lock:
            if not force and now_monotonic - self._last_cleanup < 3600:
                return {"events": 0, "sessions": 0, "visitors": 0, "revocations": 0}
            cutoff = self._iso(self._now() - self.retention)
            tombstone_cutoff = self._iso(self._now() - self.retention - timedelta(days=7))
            with self._connection() as conn:
                conn.execute("BEGIN IMMEDIATE")
                affected = [row[0] for row in conn.execute(
                    "SELECT DISTINCT visitor_id FROM analytics_v2_events WHERE occurred_at < ?",
                    (cutoff,),
                ).fetchall()]
                events = conn.execute(
                    "SELECT COUNT(*) FROM analytics_v2_events WHERE occurred_at < ?", (cutoff,)
                ).fetchone()[0]
                sessions_before = conn.execute(
                    "SELECT COUNT(*) FROM analytics_v2_sessions"
                ).fetchone()[0]
                visitors_before = conn.execute(
                    "SELECT COUNT(*) FROM analytics_v2_visitors"
                ).fetchone()[0]
                conn.execute("DELETE FROM analytics_v2_events WHERE occurred_at < ?", (cutoff,))
                for visitor_id in affected:
                    self._rebuild_visitor_sessions(conn, visitor_id)
                sessions_after = conn.execute(
                    "SELECT COUNT(*) FROM analytics_v2_sessions"
                ).fetchone()[0]
                visitors_after = conn.execute(
                    "SELECT COUNT(*) FROM analytics_v2_visitors"
                ).fetchone()[0]
                revocations = conn.execute(
                    "SELECT COUNT(*) FROM analytics_v2_revocations WHERE revoked_at < ?", (tombstone_cutoff,)
                ).fetchone()[0]
                conn.execute("DELETE FROM analytics_v2_revocations WHERE revoked_at < ?", (tombstone_cutoff,))
                conn.execute("DELETE FROM analytics_v2_health WHERE bucket < ?", (tombstone_cutoff,))
                series_start = conn.execute(
                    "SELECT MIN(occurred_at) FROM analytics_v2_events"
                ).fetchone()[0]
                if series_start:
                    conn.execute(
                        "INSERT INTO analytics_v2_meta(key,value) VALUES('series_start',?) "
                        "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                        (series_start,),
                    )
                else:
                    conn.execute("DELETE FROM analytics_v2_meta WHERE key='series_start'")
                conn.commit()
            self._last_cleanup = now_monotonic
            return {
                "events": int(events),
                "sessions": max(0, int(sessions_before) - int(sessions_after)),
                "visitors": max(0, int(visitors_before) - int(visitors_after)),
                "revocations": int(revocations),
            }

    def ingest(
        self,
        payload: Any,
        *,
        user_agent: str = "",
        ip: str = "",
        rate_check: Callable[[str, int], bool] | None = None,
    ) -> dict[str, Any]:
        envelope, valid_events, discarded, invalid_count = self.validate_envelope(payload)
        if not valid_events:
            self.record_health(invalid=invalid_count)
            return {
                "ok": True, "schema_version": SCHEMA_VERSION, "accepted": 0, "duplicate": 0,
                "invalid": invalid_count, "processed": [], "discarded": discarded,
            }
        self.cleanup_retention()
        now = self._now()
        now_iso = self._iso(now)
        visitor_id = envelope["visitor_id"]
        deletion_hash = self._deletion_hash(envelope["deletion_secret"])
        categories = self._user_agent_categories(user_agent)
        categories.update(self._geo_categories(ip))
        accepted_ids: list[str] = []
        duplicate_ids: list[str] = []
        collision_ids: list[str] = []
        session_id = ""

        grouped: dict[str, list[dict[str, Any]]] = {}
        for event in valid_events:
            grouped.setdefault(event["event_id"], []).append(event)
        unique_events: list[dict[str, Any]] = []
        for event_id, values in grouped.items():
            first_signature = self._event_signature(values[0])
            if any(self._event_signature(value) != first_signature for value in values[1:]):
                invalid_count += len(values)
                collision_ids.append(event_id)
                continue
            unique_events.append(values[0])
            duplicate_ids.extend([event_id] * (len(values) - 1))

        with self._connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            if conn.execute(
                "SELECT 1 FROM analytics_v2_revocations WHERE deletion_hash=?", (deletion_hash,)
            ).fetchone():
                conn.rollback()
                self.record_health(invalid=len(valid_events) + invalid_count)
                raise RevokedIdentity()
            visitor = conn.execute(
                "SELECT deletion_hash FROM analytics_v2_visitors WHERE visitor_id=?", (visitor_id,)
            ).fetchone()
            if visitor and visitor["deletion_hash"] != deletion_hash:
                conn.rollback()
                self.record_health(invalid=len(valid_events) + invalid_count)
                raise ValidationError("identity_mismatch")
            new_events: list[dict[str, Any]] = []
            for event in unique_events:
                existing = conn.execute(
                    "SELECT * FROM analytics_v2_events WHERE event_id=?", (event["event_id"],)
                ).fetchone()
                if not existing:
                    new_events.append(event)
                elif (
                    existing["visitor_id"] == visitor_id
                    and self._stored_event_signature(existing) == self._event_signature(event)
                ):
                    duplicate_ids.append(event["event_id"])
                else:
                    collision_ids.append(event["event_id"])
                    invalid_count += 1
            if new_events:
                if rate_check and not rate_check(visitor_id, len(new_events)):
                    self._health(
                        conn,
                        duplicate=len(duplicate_ids),
                        invalid=invalid_count,
                        rate_limited=len(new_events),
                    )
                    conn.commit()
                    raise RateLimited()
                first_at = min(event["occurred_at"] for event in new_events)
                last_at = max(event["occurred_at"] for event in new_events)
                if not visitor:
                    conn.execute(
                        "INSERT INTO analytics_v2_visitors(visitor_id,deletion_hash,first_at,last_at) "
                        "VALUES(?,?,?,?)",
                        (visitor_id, deletion_hash, first_at, last_at),
                    )
                placeholder = str(uuid.uuid4())
                first = min(
                    new_events,
                    key=lambda item: (
                        item["occurred_at"], item["client_sequence"], item["event_id"]
                    ),
                )
                source = first["source"]
                conn.execute(
                    """
                    INSERT INTO analytics_v2_sessions(
                      id,visitor_id,started_at,last_at,entry_page,exit_page,
                      first_source_kind,first_source_name,first_source_medium,first_source_campaign,
                      last_source_kind,last_source_name,last_source_medium,last_source_campaign,
                      device,browser,os,country,region,city,bot,pageviews,event_count
                    ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0)
                    """,
                    (
                        placeholder, visitor_id, first_at, last_at, first["page"], first["page"],
                        source["kind"], source["name"], source["medium"], source["campaign"],
                        source["kind"], source["name"], source["medium"], source["campaign"],
                        categories["device"], categories["browser"], categories["os"],
                        categories["country"], categories["region"], categories["city"],
                        int(categories["bot"]),
                    ),
                )
                for event in new_events:
                    source = event["source"]
                    conn.execute(
                        """
                        INSERT INTO analytics_v2_events(
                          event_id,session_id,visitor_id,event,page,cta_id,variant,error_type,
                          source_kind,source_name,source_medium,source_campaign,release,
                          device,browser,os,country,region,city,bot,client_sequence,sequence,
                          occurred_at,received_at
                        ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                        """,
                        (
                            event["event_id"], placeholder, visitor_id, event["event"], event["page"],
                            event["cta_id"], event["variant"], event["error_type"],
                            source["kind"], source["name"], source["medium"], source["campaign"],
                            event["release"], categories["device"], categories["browser"],
                            categories["os"], categories["country"], categories["region"],
                            categories["city"], int(categories["bot"]),
                            event["client_sequence"], 0,
                            event["occurred_at"], now_iso,
                        ),
                    )
                    accepted_ids.append(event["event_id"])
                rebuilt = self._rebuild_visitor_sessions(conn, visitor_id)
                latest_new = max(
                    new_events,
                    key=lambda item: (
                        item["occurred_at"], item["client_sequence"], item["event_id"]
                    ),
                )
                session_id = rebuilt.get(latest_new["event_id"], "")
                conn.execute(
                    "INSERT INTO analytics_v2_meta(key,value) VALUES('series_start',?) "
                    "ON CONFLICT(key) DO UPDATE SET value=MIN(value,excluded.value)",
                    (first_at,),
                )
            for event_id in collision_ids:
                if event_id not in discarded:
                    discarded.append(event_id)
            self._health(
                conn,
                accepted=len(accepted_ids),
                duplicate=len(duplicate_ids),
                invalid=invalid_count,
            )
            conn.commit()
        return {
            "ok": True,
            "schema_version": SCHEMA_VERSION,
            "accepted": len(accepted_ids),
            "duplicate": len(duplicate_ids),
            "invalid": invalid_count,
            "processed": list(dict.fromkeys(accepted_ids + duplicate_ids)),
            "discarded": discarded,
            "session_id": session_id or None,
        }

    def revoke(self, visitor_id: str, deletion_secret: str) -> dict[str, Any]:
        visitor_id = str(visitor_id or "").lower()
        deletion_secret = str(deletion_secret or "").lower()
        if not VISITOR_ID_RE.fullmatch(visitor_id) or not DELETE_SECRET_RE.fullmatch(deletion_secret):
            raise ValidationError("invalid_revoke")
        deletion_hash = self._deletion_hash(deletion_secret)
        now_iso = self._iso(self._now())
        with self._connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            visitor = conn.execute(
                "SELECT deletion_hash FROM analytics_v2_visitors WHERE visitor_id=?", (visitor_id,)
            ).fetchone()
            if visitor and visitor["deletion_hash"] != deletion_hash:
                conn.rollback()
                self.record_health(invalid=1)
                raise ValidationError("revoke_secret_mismatch")
            sessions = conn.execute(
                "SELECT COUNT(*) FROM analytics_v2_sessions WHERE visitor_id=?", (visitor_id,)
            ).fetchone()[0]
            events = conn.execute(
                "SELECT COUNT(*) FROM analytics_v2_events WHERE visitor_id=?", (visitor_id,)
            ).fetchone()[0]
            visitors = 1 if visitor else 0
            conn.execute(
                "INSERT INTO analytics_v2_revocations(deletion_hash,revoked_at) VALUES(?,?) "
                "ON CONFLICT(deletion_hash) DO UPDATE SET revoked_at=excluded.revoked_at",
                (deletion_hash, now_iso),
            )
            conn.execute("DELETE FROM analytics_v2_visitors WHERE visitor_id=?", (visitor_id,))
            self._health(conn, revoked=1)
            conn.commit()
        return {
            "ok": True,
            "deleted_visitors": visitors,
            "deleted_sessions": sessions,
            "deleted_events": events,
        }

    @staticmethod
    def _percentage(numerator: int, denominator: int) -> float:
        if denominator <= 0:
            return 0.0
        return round(min(100.0, max(0.0, numerator * 100.0 / denominator)), 1)

    def _window_cte(
        self,
        cutoff: str,
        end: str,
        filters: Mapping[str, Any] | None = None,
    ) -> tuple[str, list[Any]]:
        """One canonical event window shared by every metric and session row."""
        filters = filters or {}
        clauses = ["1=1"]
        params: list[Any] = [cutoff, end]
        if not filters.get("include_bots"):
            clauses.append("s.bot=0")
        source = str(filters.get("source") or "")
        if source:
            if source not in self.source_names and not SAFE_CODE_RE.fullmatch(source):
                raise ValidationError("invalid_filter")
            clauses.append("s.first_source_name=?")
            params.append(source)
        device = str(filters.get("device") or "")
        if device:
            if device not in {"desktop", "phone", "tablet", "robot", "unknown"}:
                raise ValidationError("invalid_filter")
            clauses.append("s.device=?")
            params.append(device)
        page = str(filters.get("page") or "")
        if page:
            if page not in self.pages:
                raise ValidationError("invalid_filter")
            clauses.append(
                "EXISTS(SELECT 1 FROM window_events fp "
                "WHERE fp.session_id=s.id AND fp.page=?)"
            )
            params.append(page)
        where = " AND ".join(clauses)
        return f"""
            WITH window_events AS (
              SELECT * FROM analytics_v2_events
              WHERE occurred_at>=? AND occurred_at<=?
            ),
            window_sessions AS (
              SELECT s.*,
                     MIN(e.occurred_at) window_started_at,
                     MAX(e.occurred_at) window_last_at,
                     MAX(e.received_at) window_received_at,
                     SUM(CASE WHEN e.event='page_view' THEN 1 ELSE 0 END) window_pageviews,
                     COUNT(*) window_event_count,
                     MAX(CASE WHEN e.event='submit_success' THEN 1 ELSE 0 END) window_converted,
                     (SELECT first_event.page FROM window_events first_event
                       WHERE first_event.session_id=s.id
                       ORDER BY first_event.occurred_at,first_event.client_sequence,
                                first_event.event_id LIMIT 1
                     ) window_entry_page,
                     (SELECT last_event.page FROM window_events last_event
                       WHERE last_event.session_id=s.id
                       ORDER BY last_event.occurred_at DESC,last_event.client_sequence DESC,
                                last_event.event_id DESC LIMIT 1
                     ) window_exit_page
              FROM analytics_v2_sessions s
              JOIN window_events e ON e.session_id=s.id
              WHERE {where}
              GROUP BY s.id
            )
        """, params

    def overview(
        self,
        *,
        hours: int = 24,
        filters: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        hours = max(1, min(int(hours), 24 * 90))
        now = self._now()
        cutoff = self._iso(now - timedelta(hours=hours))
        end = self._iso(now)
        cte, params = self._window_cte(cutoff, end, filters)
        online_cutoff = self._iso(now - timedelta(minutes=3))
        with self._connection() as conn:
            session_row = conn.execute(
                cte + """
                SELECT COUNT(*) sessions,COUNT(DISTINCT visitor_id) visitors,
                       COALESCE(AVG((julianday(window_last_at)-julianday(window_started_at))*86400.0),0) avg_duration_s,
                       COALESCE(AVG(window_pageviews),0) avg_pageviews,
                       COALESCE(SUM(CASE WHEN window_last_at>=? AND window_received_at>=? THEN 1 ELSE 0 END),0) online
                FROM window_sessions
                """,
                params + [online_cutoff, online_cutoff],
            ).fetchone()
            event_row = conn.execute(
                cte + """
                SELECT COUNT(*) events,
                       COALESCE(SUM(CASE WHEN e.event='page_view' THEN 1 ELSE 0 END),0) pageviews,
                       COUNT(DISTINCT CASE WHEN e.event='submit_success' THEN e.session_id END) converted_sessions,
                       COUNT(DISTINCT CASE WHEN e.event='submit_success' THEN ws.visitor_id END) converted_visitors,
                       MAX(e.occurred_at) latest_event_at,
                       MAX(e.received_at) latest_received_at
                FROM window_events e JOIN window_sessions ws ON ws.id=e.session_id
                """,
                params,
            ).fetchone()
            diagnostics_row = conn.execute(
                cte + """
                SELECT
                  COUNT(DISTINCT CASE
                    WHEN e.event='config_open'
                    THEN e.session_id END
                  ) configurator_sessions,
                  COUNT(DISTINCT CASE
                    WHEN e.event IN (
                      'case_route_change','case_route_confirm',
                      'quote_scope_continue','first_input'
                    ) AND EXISTS (
                      SELECT 1 FROM window_events opened
                      WHERE opened.session_id=e.session_id
                        AND opened.event='config_open'
                        AND (
                          opened.occurred_at<e.occurred_at OR
                          (opened.occurred_at=e.occurred_at AND opened.client_sequence<e.client_sequence) OR
                          (opened.occurred_at=e.occurred_at AND opened.client_sequence=e.client_sequence
                           AND opened.event_id<e.event_id)
                        )
                    ) THEN e.session_id END
                  ) engaged_sessions,
                  COUNT(DISTINCT CASE
                    WHEN e.event='case_step_view'
                      AND (
                        (e.variant LIKE 'r1_s2_%' AND (
                          SELECT opened.cta_id FROM window_events opened
                          WHERE opened.session_id=e.session_id
                            AND opened.event='config_open'
                            AND (
                              opened.occurred_at<e.occurred_at OR
                              (opened.occurred_at=e.occurred_at AND opened.client_sequence<e.client_sequence) OR
                              (opened.occurred_at=e.occurred_at AND opened.client_sequence=e.client_sequence
                               AND opened.event_id<e.event_id)
                            )
                          ORDER BY opened.occurred_at DESC,opened.client_sequence DESC,opened.event_id DESC
                          LIMIT 1
                        )='calculator') OR
                        (e.variant LIKE 'r1_s1_%' AND (
                          SELECT opened.cta_id FROM window_events opened
                          WHERE opened.session_id=e.session_id
                            AND opened.event='config_open'
                            AND (
                              opened.occurred_at<e.occurred_at OR
                              (opened.occurred_at=e.occurred_at AND opened.client_sequence<e.client_sequence) OR
                              (opened.occurred_at=e.occurred_at AND opened.client_sequence=e.client_sequence
                               AND opened.event_id<e.event_id)
                            )
                          ORDER BY opened.occurred_at DESC,opened.client_sequence DESC,opened.event_id DESC
                          LIMIT 1
                        ) LIKE 'service:%')
                      ) THEN e.session_id END
                  ) contact_step_sessions
                FROM window_events e JOIN window_sessions ws ON ws.id=e.session_id
                """,
                params,
            ).fetchone()
            sessions_count = int(session_row["sessions"] or 0)
            visitors_count = int(session_row["visitors"] or 0)
            converted_sessions = int(event_row["converted_sessions"] or 0)
            converted_visitors = int(event_row["converted_visitors"] or 0)
            configurator_sessions = int(diagnostics_row["configurator_sessions"] or 0)
            engaged_sessions = int(diagnostics_row["engaged_sessions"] or 0)
            contact_step_sessions = int(diagnostics_row["contact_step_sessions"] or 0)
            metrics = {
                "visitors": visitors_count,
                "sessions": sessions_count,
                "pageviews": int(event_row["pageviews"] or 0),
                "events": int(event_row["events"] or 0),
                "converted_sessions": converted_sessions,
                "converted_visitors": converted_visitors,
                "session_conversion_pct": self._percentage(converted_sessions, sessions_count),
                "visitor_conversion_pct": self._percentage(converted_visitors, visitors_count),
                "configurator_sessions": configurator_sessions,
                "engaged_sessions": engaged_sessions,
                "contact_step_sessions": contact_step_sessions,
                "engaged_from_config_pct": self._percentage(
                    engaged_sessions, configurator_sessions
                ),
                "contact_from_config_pct": self._percentage(
                    contact_step_sessions, configurator_sessions
                ),
                "online": int(session_row["online"] or 0),
                "avg_duration_s": round(float(session_row["avg_duration_s"] or 0), 1),
                "avg_pageviews": round(float(session_row["avg_pageviews"] or 0), 1),
            }
            grain = "hour" if hours <= 72 else "day"
            bucket_sql = (
                "substr(datetime(e.occurred_at,'+3 hours'),1,13)||':00'"
                if grain == "hour"
                else "substr(datetime(e.occurred_at,'+3 hours'),1,10)"
            )
            trend = [dict(row) for row in conn.execute(
                cte + f"""
                SELECT {bucket_sql} bucket,
                       COUNT(DISTINCT e.session_id) sessions,
                       COUNT(DISTINCT ws.visitor_id) visitors,
                       SUM(CASE WHEN e.event='page_view' THEN 1 ELSE 0 END) pageviews,
                       COUNT(DISTINCT CASE WHEN e.event='submit_success' THEN e.session_id END) conversions
                FROM window_events e JOIN window_sessions ws ON ws.id=e.session_id
                GROUP BY bucket ORDER BY bucket
                """,
                params,
            ).fetchall()]
            sources = [dict(row) for row in conn.execute(
                cte + """
                SELECT first_source_kind kind,first_source_name name,
                       first_source_medium medium,first_source_campaign campaign,
                       COUNT(*) sessions,COUNT(DISTINCT visitor_id) visitors,
                       SUM(window_converted) conversions
                FROM window_sessions
                GROUP BY kind,name,medium,campaign ORDER BY sessions DESC,name LIMIT 50
                """,
                params,
            ).fetchall()]
            geo = [dict(row) for row in conn.execute(
                cte + """
                SELECT country,region,city,COUNT(*) sessions,
                       COUNT(DISTINCT visitor_id) visitors
                FROM window_sessions
                GROUP BY country,region,city ORDER BY sessions DESC LIMIT 50
                """,
                params,
            ).fetchall()]
            devices = [dict(row) for row in conn.execute(
                cte + "SELECT device name,COUNT(*) sessions FROM window_sessions "
                "GROUP BY device ORDER BY sessions DESC",
                params,
            ).fetchall()]
            browsers = [dict(row) for row in conn.execute(
                cte + "SELECT browser name,COUNT(*) sessions FROM window_sessions "
                "GROUP BY browser ORDER BY sessions DESC",
                params,
            ).fetchall()]
            operating_systems = [dict(row) for row in conn.execute(
                cte + "SELECT os name,COUNT(*) sessions FROM window_sessions "
                "GROUP BY os ORDER BY sessions DESC",
                params,
            ).fetchall()]
            page_rows: dict[str, dict[str, Any]] = {}
            for row in conn.execute(
                cte + """
                SELECT e.page,COUNT(*) views,COUNT(DISTINCT e.session_id) sessions
                FROM window_events e JOIN window_sessions ws ON ws.id=e.session_id
                WHERE e.event='page_view'
                GROUP BY e.page ORDER BY views DESC
                """,
                params,
            ).fetchall():
                page_rows[row["page"]] = {
                    "page": row["page"], "views": row["views"], "sessions": row["sessions"],
                    "entries": 0, "exits": 0, "conversions": 0,
                }
            for field, key in (("window_entry_page", "entries"), ("window_exit_page", "exits")):
                for row in conn.execute(
                    cte + f"SELECT {field} page,COUNT(*) value FROM window_sessions "
                    f"GROUP BY {field}",
                    params,
                ).fetchall():
                    page_rows.setdefault(row["page"], {
                        "page": row["page"], "views": 0, "sessions": 0,
                        "entries": 0, "exits": 0, "conversions": 0,
                    })[key] = row["value"]
            for row in conn.execute(
                cte + """
                SELECT e.page,COUNT(DISTINCT e.session_id) value
                FROM window_events e JOIN window_sessions ws ON ws.id=e.session_id
                WHERE e.event='submit_success'
                GROUP BY e.page
                """,
                params,
            ).fetchall():
                page_rows.setdefault(row["page"], {
                    "page": row["page"], "views": 0, "sessions": 0,
                    "entries": 0, "exits": 0, "conversions": 0,
                })["conversions"] = row["value"]
            pages = sorted(page_rows.values(), key=lambda row: (-row["views"], row["page"]))
            transitions = [dict(row) for row in conn.execute(
                cte.rstrip() + """,
                page_sequence AS (
                  SELECT e.session_id,e.page,
                         LAG(e.page) OVER(
                           PARTITION BY e.session_id
                           ORDER BY e.occurred_at,e.client_sequence,e.event_id
                         ) previous_page
                  FROM window_events e JOIN window_sessions ws ON ws.id=e.session_id
                  WHERE e.event='page_view'
                )
                SELECT previous_page from_page,page to_page,COUNT(*) transitions
                FROM page_sequence
                WHERE previous_page IS NOT NULL AND previous_page<>page
                GROUP BY previous_page,page ORDER BY transitions DESC,previous_page,page LIMIT 50
                """,
                params,
            ).fetchall()]
            event_mix = [dict(row) for row in conn.execute(
                cte + """
                SELECT e.event,COUNT(*) events,COUNT(DISTINCT e.session_id) sessions
                FROM window_events e JOIN window_sessions ws ON ws.id=e.session_id
                GROUP BY e.event ORDER BY events DESC,e.event
                """,
                params,
            ).fetchall()]
            errors = [dict(row) for row in conn.execute(
                cte + """
                SELECT e.error_type,e.page,e.browser,e.release,COUNT(*) errors,
                       MIN(e.occurred_at) first_at,MAX(e.occurred_at) last_at
                FROM window_events e JOIN window_sessions ws ON ws.id=e.session_id
                WHERE e.event='js_error'
                GROUP BY e.error_type,e.page,e.browser,e.release
                ORDER BY errors DESC,last_at DESC LIMIT 50
                """,
                params,
            ).fetchall()]
            stage_events = [set(stage["events"]) for stage in self.contract["funnel"]]
            progress: dict[str, int] = defaultdict(int)
            for row in conn.execute(
                cte + """
                SELECT e.session_id,e.event,e.occurred_at,e.client_sequence,e.event_id
                FROM window_events e JOIN window_sessions ws ON ws.id=e.session_id
                ORDER BY e.session_id,e.occurred_at,e.client_sequence,e.event_id
                """,
                params,
            ).fetchall():
                next_stage = progress[row["session_id"]]
                if next_stage < len(stage_events) and row["event"] in stage_events[next_stage]:
                    progress[row["session_id"]] = next_stage + 1
            funnel = []
            previous = 0
            for index, stage in enumerate(self.contract["funnel"]):
                count = sum(1 for completed in progress.values() if completed >= index + 1)
                funnel.append({
                    "id": stage["id"], "label": stage["label"], "sessions": count,
                    "from_start_pct": self._percentage(count, funnel[0]["sessions"] if funnel else count),
                    "from_previous_pct": self._percentage(count, previous if index else count),
                })
                previous = count
            health = dict(conn.execute(
                """
                SELECT COALESCE(SUM(accepted),0) accepted,COALESCE(SUM(duplicate),0) duplicate,
                       COALESCE(SUM(invalid),0) invalid,COALESCE(SUM(rate_limited),0) rate_limited,
                       COALESCE(SUM(revoked),0) revoked,COALESCE(SUM(server_error),0) server_error
                FROM analytics_v2_health WHERE bucket>=?
                """,
                (cutoff,),
            ).fetchone())
            series = conn.execute(
                "SELECT value FROM analytics_v2_meta WHERE key='series_start'"
            ).fetchone()
            geo_defined = conn.execute(
                cte + "SELECT COUNT(*) FROM window_sessions "
                "WHERE country<>'' OR region<>'' OR city<>''",
                params,
            ).fetchone()[0]
            source_known = conn.execute(
                cte + "SELECT COUNT(*) FROM window_sessions "
                "WHERE first_source_kind<>'unknown'",
                params,
            ).fetchone()[0]
        latest = event_row["latest_event_at"]
        latest_received = event_row["latest_received_at"]
        delay = None
        if latest_received:
            try:
                delay = max(0, int((now - self._parse_iso(latest_received)).total_seconds()))
            except ValidationError:
                delay = None
        return {
            "ok": True,
            "schema_version": SCHEMA_VERSION,
            "generated_at": self._iso(now),
            "period": {"hours": hours, "from": cutoff, "to": end, "timezone": "Europe/Moscow"},
            "metrics": metrics,
            "trend_grain": grain,
            "trend": trend,
            "sources": sources,
            "geo": geo,
            "devices": devices,
            "browsers": browsers,
            "operating_systems": operating_systems,
            "pages": pages,
            "transitions": transitions,
            "funnel": funnel,
            "events": event_mix,
            "errors": errors,
            "health": health,
            "quality": {
                "coverage": "consented_first_party_sample",
                "coverage_known": False,
                "series_start": series["value"] if series else None,
                "latest_event_at": latest,
                "latest_received_at": latest_received,
                "data_delay_seconds": delay,
                "geo_defined_pct": self._percentage(int(geo_defined), sessions_count),
                "source_known_pct": self._percentage(int(source_known), sessions_count),
                "funnel_mode": "strict_sequence",
            },
            "labels": {
                "pages": self.pages,
                "events": {key: value["label"] for key, value in self.events.items()},
            },
        }

    @staticmethod
    def _cursor_encode(last_at: str, session_id: str) -> str:
        raw = (last_at + "\n" + session_id).encode("utf-8")
        return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")

    @staticmethod
    def _cursor_decode(cursor: str) -> tuple[str, str]:
        try:
            raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode("utf-8")
            last_at, session_id = raw.split("\n", 1)
        except Exception as exc:
            raise ValidationError("invalid_cursor") from exc
        if not last_at or not SESSION_ID_RE.fullmatch(session_id):
            raise ValidationError("invalid_cursor")
        return last_at, session_id

    @staticmethod
    def _visitor_label(visitor_id: str) -> str:
        digest = hashlib.sha256(("analytics-v2-admin:" + visitor_id).encode("ascii")).hexdigest()
        return "П-" + digest[:6].upper()

    @staticmethod
    def _session_label(session_id: str) -> str:
        return "С-" + session_id.replace("-", "")[:6].upper()

    def _safe_session(self, row: sqlite3.Row, now: datetime) -> dict[str, Any]:
        keys = set(row.keys())
        started_at = row["window_started_at"] if "window_started_at" in keys else row["started_at"]
        last_at = row["window_last_at"] if "window_last_at" in keys else row["last_at"]
        received_at = row["window_received_at"] if "window_received_at" in keys else last_at
        entry_page = row["window_entry_page"] if "window_entry_page" in keys else row["entry_page"]
        exit_page = row["window_exit_page"] if "window_exit_page" in keys else row["exit_page"]
        pageviews = row["window_pageviews"] if "window_pageviews" in keys else row["pageviews"]
        event_count = row["window_event_count"] if "window_event_count" in keys else row["event_count"]
        converted = row["window_converted"] if "window_converted" in keys else row["converted"]
        try:
            duration = max(0, int((self._parse_iso(last_at) - self._parse_iso(started_at)).total_seconds()))
            online_cutoff = now - timedelta(minutes=3)
            active = (
                self._parse_iso(last_at) >= online_cutoff
                and self._parse_iso(received_at) >= online_cutoff
            )
        except ValidationError:
            duration, active = 0, False
        return {
            "session_id": row["id"],
            "session_label": self._session_label(row["id"]),
            "visitor_label": self._visitor_label(row["visitor_id"]),
            "started_at": started_at,
            "last_at": last_at,
            "duration_s": duration,
            "entry_page": entry_page,
            "exit_page": exit_page,
            "source": {
                "kind": row["first_source_kind"], "name": row["first_source_name"],
                "medium": row["first_source_medium"], "campaign": row["first_source_campaign"],
            },
            "device": row["device"],
            "browser": row["browser"],
            "os": row["os"],
            "geo": {"country": row["country"], "region": row["region"], "city": row["city"]},
            "bot": bool(row["bot"]),
            "pageviews": int(pageviews),
            "event_count": int(event_count),
            "converted": bool(converted),
            "active": active,
        }

    def sessions(
        self,
        *,
        hours: int = 24,
        limit: int = 50,
        cursor: str = "",
        filters: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        hours = max(1, min(int(hours), 24 * 90))
        limit = max(1, min(int(limit), 100))
        now = self._now()
        cutoff = self._iso(now - timedelta(hours=hours))
        end = self._iso(now)
        cte, params = self._window_cte(cutoff, end, filters)
        cursor_clause = ""
        if cursor:
            last_at, session_id = self._cursor_decode(cursor)
            cursor_clause = "WHERE (window_last_at<? OR (window_last_at=? AND id<?))"
            params.extend([last_at, last_at, session_id])
        with self._connection() as conn:
            rows = conn.execute(
                cte + f"""
                SELECT * FROM window_sessions {cursor_clause}
                ORDER BY window_last_at DESC,id DESC LIMIT ?
                """,
                params + [limit + 1],
            ).fetchall()
        has_more = len(rows) > limit
        rows = rows[:limit]
        items = [self._safe_session(row, now) for row in rows]
        next_cursor = self._cursor_encode(rows[-1]["window_last_at"], rows[-1]["id"]) if has_more and rows else None
        return {
            "ok": True,
            "period": {"hours": hours, "from": cutoff, "to": end, "timezone": "Europe/Moscow"},
            "items": items,
            "next_cursor": next_cursor,
        }

    def session_detail(self, session_id: str, *, hours: int = 24) -> dict[str, Any]:
        session_id = str(session_id or "").lower()
        if not SESSION_ID_RE.fullmatch(session_id):
            raise ValidationError("invalid_session")
        hours = max(1, min(int(hours), 24 * 90))
        now = self._now()
        cutoff = self._iso(now - timedelta(hours=hours))
        end = self._iso(now)
        cte, params = self._window_cte(cutoff, end, {"include_bots": True})
        with self._connection() as conn:
            row = conn.execute(
                cte + "SELECT * FROM window_sessions WHERE id=?",
                params + [session_id],
            ).fetchone()
            if not row:
                raise ValidationError("session_not_found")
            events = [dict(event) for event in conn.execute(
                """
                SELECT event,page,cta_id,variant,error_type,release,sequence,occurred_at
                FROM analytics_v2_events
                WHERE session_id=? AND occurred_at>=? AND occurred_at<=?
                ORDER BY occurred_at,client_sequence,event_id
                """,
                (session_id, cutoff, end),
            ).fetchall()]
        result = self._safe_session(row, now)
        result["ok"] = True
        result["period"] = {"hours": hours, "from": cutoff, "to": end, "timezone": "Europe/Moscow"}
        result["events"] = events
        return result


async def retention_cleanup_worker(
    store: AnalyticsStore,
    *,
    interval_seconds: float | None = None,
) -> None:
    """Delete expired rows while aiohttp stays up, even when ingest is idle."""
    delay = max(
        0.01,
        float(
            store.retention_cleanup_interval
            if interval_seconds is None
            else interval_seconds
        ),
    )
    while True:
        await asyncio.sleep(delay)
        try:
            await asyncio.to_thread(store.cleanup_retention, force=True)
        except asyncio.CancelledError:
            raise
        except Exception:
            with suppress(Exception):
                await asyncio.to_thread(store.record_health, server_error=1)


def register_aiohttp(
    app: Any,
    *,
    db_path: str | Path,
    site_origin: str,
    admin_guard: Callable[[Any], Any],
    signing_secret: str,
    contract_path: str | Path = DEFAULT_CONTRACT_PATH,
    geo_db_path: str | Path | None = None,
) -> AnalyticsStore:
    """Register v2 routes into the existing aiohttp application."""
    from aiohttp import web

    store = AnalyticsStore(
        db_path,
        contract_path=contract_path,
        geo_db_path=geo_db_path,
    )
    store.initialize()
    signer = GrantSigner(
        signing_secret,
        ttl_minutes=int(store.contract.get("grant_ttl_minutes", 360)),
        event_budget=int(store.contract.get("grant_event_budget", 60)),
    )
    request_limiter = RateLimiter(limit=180, global_limit=18000, window_seconds=3600)
    grant_ip_limiter = RateLimiter(limit=240, global_limit=10000, window_seconds=3600)
    grant_visitor_limiter = RateLimiter(limit=12, global_limit=10000, window_seconds=3600)
    grant_rate_lock = threading.Lock()
    grant_event_limiter = RateLimiter(
        limit=signer.event_budget,
        global_limit=12000,
        window_seconds=signer.ttl.total_seconds(),
    )
    ip_event_limiter = RateLimiter(limit=120, global_limit=12000, window_seconds=3600)
    visitor_event_limiter = RateLimiter(limit=120, global_limit=12000, window_seconds=3600)
    ip_daily_event_limiter = RateLimiter(limit=300, global_limit=10000, window_seconds=86400)
    visitor_daily_event_limiter = RateLimiter(limit=300, global_limit=10000, window_seconds=86400)
    event_rate_lock = threading.Lock()
    boundary_limiter = RateLimiter(limit=30, global_limit=300, window_seconds=60)
    headers = {
        "Access-Control-Allow-Origin": site_origin,
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Vary": "Origin",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
    }

    def response(
        data: Mapping[str, Any],
        status: int = 200,
        extra_headers: Mapping[str, str] | None = None,
    ) -> Any:
        response_headers = dict(headers)
        response_headers.update(extra_headers or {})
        return web.json_response(dict(data), status=status, headers=response_headers)

    def request_ip(request: Any) -> str:
        return request.headers.get("X-Real-IP") or request.remote or "?"

    def public_boundary(request: Any) -> str | None:
        if request.headers.get("Origin", "") != site_origin:
            return "origin_forbidden"
        fetch_site = request.headers.get("Sec-Fetch-Site", "")
        if fetch_site and fetch_site != "same-origin":
            return "fetch_site_forbidden"
        content_type = request.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type not in {"text/plain", "application/json"}:
            return "content_type_forbidden"
        if request.content_length is not None and request.content_length > BODY_LIMIT:
            return "body_too_large"
        return None

    async def record_health_async(**values: int) -> None:
        """Keep SQLite diagnostics away from the aiohttp event loop."""
        await asyncio.to_thread(store.record_health, **values)

    async def boundary_response(request: Any) -> Any | None:
        boundary = public_boundary(request)
        if not boundary:
            return None
        ip = request_ip(request)
        if not boundary_limiter.allow("boundary:" + ip):
            return response(
                {"ok": False, "error": "rate_limited"},
                429,
                {"Retry-After": "60"},
            )
        await record_health_async(invalid=1)
        status = (
            413
            if boundary == "body_too_large"
            else 415
            if boundary == "content_type_forbidden"
            else 403
        )
        return response({"ok": False, "error": boundary}, status)

    async def read_payload(request: Any) -> Any:
        raw = await request.content.read(BODY_LIMIT + 1)
        if len(raw) > BODY_LIMIT:
            raise ValidationError("body_too_large")
        try:
            value = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ValidationError("bad_json") from exc
        return value

    async def events_handler(request: Any) -> Any:
        rejected = await boundary_response(request)
        if rejected is not None:
            return rejected
        ip = request_ip(request)
        if not request_limiter.allow(ip):
            await record_health_async(rate_limited=1)
            return response(
                {"ok": False, "error": "rate_limited"},
                429,
                {"Retry-After": "60"},
            )
        try:
            payload = await read_payload(request)
            visitor_id = str((payload or {}).get("visitor_id") or "").lower()
            if not VISITOR_ID_RE.fullmatch(visitor_id):
                raise ValidationError("invalid_visitor_id")
            claims = signer.verify((payload or {}).get("grant"), visitor_id, ip, store._now())

            def allow_new_events(validated_visitor: str, cost: int) -> bool:
                if validated_visitor != claims["vid"]:
                    return False
                checks = (
                    (grant_event_limiter, "grant:" + claims["nonce"]),
                    (ip_event_limiter, "ip:" + ip),
                    (visitor_event_limiter, "visitor:" + validated_visitor),
                    (ip_daily_event_limiter, "ip-day:" + ip),
                    (visitor_daily_event_limiter, "visitor-day:" + validated_visitor),
                )
                rejected_budget = consume_rate_group(
                    checks,
                    cost=cost,
                    lock=event_rate_lock,
                )
                if rejected_budget == (0, "key"):
                    raise GrantBudgetExhausted()
                if rejected_budget is not None:
                    return False
                return True

            result = await asyncio.to_thread(
                store.ingest,
                payload,
                user_agent=request.headers.get("User-Agent", ""),
                ip=ip,
                rate_check=allow_new_events,
            )
            return response(result)
        except GrantBudgetExhausted as exc:
            await record_health_async(rate_limited=1)
            return response({"ok": False, "error": exc.code}, 429)
        except RateLimited as exc:
            await record_health_async(rate_limited=1)
            return response(
                {"ok": False, "error": exc.code},
                429,
                {"Retry-After": "60"},
            )
        except RevokedIdentity as exc:
            return response({"ok": False, "error": exc.code}, 409)
        except ValidationError as exc:
            await record_health_async(invalid=1)
            status = 403 if exc.code.startswith("grant_") else 400
            return response({"ok": False, "error": exc.code}, status)
        except Exception:
            await record_health_async(server_error=1)
            return response({"ok": False, "error": "temporary_failure"}, 503)

    async def grant_handler(request: Any) -> Any:
        rejected = await boundary_response(request)
        if rejected is not None:
            return rejected
        ip = request_ip(request)
        try:
            payload = await read_payload(request)
            if not isinstance(payload, dict) or set(payload) != {"schema_version", "visitor_id"}:
                raise ValidationError("invalid_grant_request")
            if payload.get("schema_version") != SCHEMA_VERSION:
                raise ValidationError("schema_mismatch")
            visitor_id = str(payload.get("visitor_id") or "").lower()
            if not VISITOR_ID_RE.fullmatch(visitor_id):
                raise ValidationError("invalid_visitor_id")
            grant_rejected = consume_rate_group(
                (
                    (grant_ip_limiter, "grant-ip:" + ip),
                    (grant_visitor_limiter, "grant-visitor:" + visitor_id),
                ),
                lock=grant_rate_lock,
            )
            if grant_rejected is not None:
                await record_health_async(rate_limited=1)
                return response(
                    {"ok": False, "error": "rate_limited"},
                    429,
                    {"Retry-After": "60"},
                )
            issued = signer.issue(visitor_id, ip, store._now())
            return response({"ok": True, "schema_version": SCHEMA_VERSION, **issued})
        except ValidationError as exc:
            await record_health_async(invalid=1)
            return response({"ok": False, "error": exc.code}, 400)
        except Exception:
            await record_health_async(server_error=1)
            return response({"ok": False, "error": "temporary_failure"}, 503)

    async def revoke_handler(request: Any) -> Any:
        rejected = await boundary_response(request)
        if rejected is not None:
            return rejected
        ip = request_ip(request)
        if not request_limiter.allow("revoke:" + ip):
            await record_health_async(rate_limited=1)
            return response(
                {"ok": False, "error": "rate_limited"},
                429,
                {"Retry-After": "60"},
            )
        try:
            payload = await read_payload(request)
            if not isinstance(payload, dict) or set(payload) - {"schema_version", "visitor_id", "deletion_secret"}:
                raise ValidationError("invalid_revoke")
            if payload.get("schema_version") != SCHEMA_VERSION:
                raise ValidationError("schema_mismatch")
            result = await asyncio.to_thread(
                store.revoke,
                payload.get("visitor_id", ""),
                payload.get("deletion_secret", ""),
            )
            return response(result)
        except ValidationError as exc:
            await record_health_async(invalid=1)
            return response({"ok": False, "error": exc.code}, 400)
        except Exception:
            await record_health_async(server_error=1)
            return response({"ok": False, "error": "temporary_failure"}, 503)

    async def require_admin(request: Any) -> Any | None:
        user = await admin_guard(request)
        if not user:
            return response({"ok": False, "error": "forbidden"}, 403)
        return None

    @staticmethod
    def hours_from(request: Any) -> int:
        try:
            return max(1, min(24 * 90, int(request.query.get("hours") or 24)))
        except (TypeError, ValueError):
            return 24

    @staticmethod
    def filters_from(request: Any) -> dict[str, Any]:
        return {
            "include_bots": request.query.get("bots") == "1",
            "source": request.query.get("source", ""),
            "device": request.query.get("device", ""),
            "page": request.query.get("page", ""),
        }

    async def overview_handler(request: Any) -> Any:
        denied = await require_admin(request)
        if denied:
            return denied
        try:
            result = await asyncio.to_thread(
                store.overview,
                hours=hours_from(request),
                filters=filters_from(request),
            )
            return response(result)
        except ValidationError as exc:
            return response({"ok": False, "error": exc.code}, 400)
        except Exception:
            await record_health_async(server_error=1)
            return response({"ok": False, "error": "temporary_failure"}, 503)

    async def sessions_handler(request: Any) -> Any:
        denied = await require_admin(request)
        if denied:
            return denied
        try:
            limit = max(1, min(100, int(request.query.get("limit") or 50)))
            result = await asyncio.to_thread(
                store.sessions,
                hours=hours_from(request),
                limit=limit,
                cursor=request.query.get("cursor", ""),
                filters=filters_from(request),
            )
            return response(result)
        except (TypeError, ValueError, ValidationError) as exc:
            code = exc.code if isinstance(exc, ValidationError) else "invalid_filter"
            return response({"ok": False, "error": code}, 400)
        except Exception:
            await record_health_async(server_error=1)
            return response({"ok": False, "error": "temporary_failure"}, 503)

    async def session_handler(request: Any) -> Any:
        denied = await require_admin(request)
        if denied:
            return denied
        try:
            result = await asyncio.to_thread(
                store.session_detail,
                request.match_info.get("session_id", ""),
                hours=hours_from(request),
            )
            return response(result)
        except ValidationError as exc:
            status = 404 if exc.code == "session_not_found" else 400
            return response({"ok": False, "error": exc.code}, status)
        except Exception:
            await record_health_async(server_error=1)
            return response({"ok": False, "error": "temporary_failure"}, 503)

    app.router.add_post("/api/analytics/grant", grant_handler)
    app.router.add_post("/api/analytics/events", events_handler)
    app.router.add_post("/api/analytics/revoke", revoke_handler)
    app.router.add_get("/api/admin/analytics/overview", overview_handler)
    app.router.add_get("/api/admin/analytics/sessions", sessions_handler)
    app.router.add_get("/api/admin/analytics/session/{session_id}", session_handler)

    async def retention_lifecycle(_: Any):
        task = asyncio.create_task(
            retention_cleanup_worker(store),
            name="analytics-v2-retention",
        )
        app["analytics_v2_retention_task"] = task
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    app.cleanup_ctx.append(retention_lifecycle)
    app["analytics_v2_store"] = store
    return store
