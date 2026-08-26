#!/usr/bin/env python3
"""Root-only production probe for the default-off OUT-001 synthetic plane.

The process keeps exact IDs, cookies and claim state in memory, prints one
bounded digest-only JSON document and removes its capability on every exit.
"""
from __future__ import annotations

import argparse
import hashlib
import http.cookiejar
import json
import os
import secrets
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

try:  # deployed location
    from app import config
    from app import out001_synthetic as runtime
except ImportError:  # hermetic repository tests
    from backend.salon_bot import out001_synthetic as runtime

    class _Config:
        DB_PATH = "salon.db"
        ORDER_CONSENT_DOC = "test-consent"
        SITE_URL = "https://akademsalon.ru"

    config = _Config()


PUBLIC_SCHEMA_VERSION = 1
MAX_PUBLIC_BYTES = 4096
class ProbeRunError(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def guard_digest(database: Path | str) -> str:
    """Compatibility wrapper for the runtime's full economic snapshot."""
    return runtime.economic_guard_digest(database)


class _RejectRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        raise ProbeRunError("http_redirect_forbidden")


def _json_request(
    opener: urllib.request.OpenerDirector,
    url: str,
    *,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
    timeout: float = 15,
) -> tuple[dict[str, Any], Any]:
    payload = None if body is None else runtime.canonical_json(body)
    request = urllib.request.Request(
        url,
        data=payload,
        method=method,
        headers={
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if payload is not None else {}),
            **(headers or {}),
        },
    )
    try:
        with opener.open(request, timeout=timeout) as response:
            status = int(getattr(response, "status", 0))
            raw = response.read(128 * 1024)
            response_headers = response.headers
    except urllib.error.HTTPError as exc:
        exc.read(128 * 1024)
        raise ProbeRunError(f"http_{int(exc.code)}") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ProbeRunError("http_unavailable") from None
    if status < 200 or status >= 300:
        raise ProbeRunError("http_status")
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        raise ProbeRunError("http_bad_json") from None
    if not isinstance(value, dict):
        raise ProbeRunError("http_bad_json")
    return value, response_headers


def _signed_headers(
    secret: bytes,
    timestamp: int,
    body: dict[str, Any],
    *,
    origin: str,
) -> dict[str, str]:
    return {
        "X-Session-Mode": "cookie",
        "X-Salon-Out001-Timestamp": str(timestamp),
        "X-Salon-Out001-Signature": runtime.request_signature(
            secret, timestamp, body, origin=origin
        ),
    }


def _claim_state(payload: dict[str, Any]) -> str:
    claim_url = str(payload.get("claim_url") or "")
    fragment = urllib.parse.urlsplit(claim_url).fragment
    values = urllib.parse.parse_qs(fragment, strict_parsing=True)
    state = (values.get("claim") or [""])[0]
    if not state.startswith("cx1_") or len(state) > 96:
        raise ProbeRunError("claim_missing")
    return state


def _private_order_id(payload: dict[str, Any]) -> int:
    value = payload.get("id")
    if not isinstance(value, int) or value <= 0:
        raise ProbeRunError("order_missing")
    return value


def _poll_proof(
    database: Path,
    run_id: str,
    order_id: int,
    *,
    timeout: float,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    last = runtime.lookup(database, run_id, order_id=order_id)
    while not last["proof_ready"] and time.monotonic() < deadline:
        if last["blockers"]["present"]:
            break
        time.sleep(0.25)
        last = runtime.lookup(database, run_id, order_id=order_id)
    return last


def _safe_failure(code: str, run_id: str | None = None) -> dict[str, Any]:
    return {
        "schema_version": PUBLIC_SCHEMA_VERSION,
        "contract_sha256": runtime.CONTRACT_SHA256,
        "run_hash": runtime.run_hash(run_id) if run_id else None,
        "state": "failed",
        "failure_code": code if code in {
            "not_root", "capability_exists", "http_400", "http_403", "http_404",
            "http_409", "http_422", "http_429", "http_500", "http_502",
            "http_503", "http_504", "http_status", "http_unavailable",
            "http_bad_json", "http_redirect_forbidden", "claim_missing",
            "order_missing", "duplicate_mismatch",
            "claim_mismatch", "cabinet_mismatch", "detail_mismatch",
            "delivery_timeout", "guard_changed", "cleanup_failed", "runtime_error",
        } else "runtime_error",
    }


def run_probe(
    *,
    base_url: str,
    database: Path,
    capability: Path,
    migration: Path,
    timeout: float = 20,
    require_root: bool = True,
    run_id: str | None = None,
) -> dict[str, Any]:
    if require_root and os.geteuid() != 0:
        raise ProbeRunError("not_root")
    capability_uid = 0 if require_root else os.geteuid()
    if capability.exists() or capability.is_symlink():
        raise ProbeRunError("capability_exists")
    try:
        origin = runtime.canonical_origin(base_url)
        expected_origin = runtime.canonical_origin(config.SITE_URL)
    except runtime.ProbeError:
        raise ProbeRunError("runtime_error") from None
    if origin != expected_origin:
        raise ProbeRunError("runtime_error")
    run_id = run_id or "out001_" + secrets.token_hex(16)
    if not runtime.RUN_RE.fullmatch(run_id):
        raise ProbeRunError("runtime_error")
    request_id = "syn_" + secrets.token_hex(20)
    secret = secrets.token_bytes(32)
    context = runtime.SyntheticContext(
        run_id,
        request_id,
        config.ORDER_CONSENT_DOC,
        runtime.ISOLATED_SINK,
        origin,
    )
    body = runtime.fixture_body(context)
    jar = http.cookiejar.CookieJar()
    cabinet = urllib.request.build_opener(
        _RejectRedirects(), urllib.request.HTTPCookieProcessor(jar)
    )
    anonymous = urllib.request.build_opener(_RejectRedirects())
    guard_before = guard_digest(database)
    order_id: int | None = None
    proof: dict[str, Any] | None = None
    cleanup_result: dict[str, Any] | None = None
    capability_written = False
    try:
        runtime.write_capability(
            capability,
            runtime.make_capability(
                run_id,
                request_id,
                config.ORDER_CONSENT_DOC,
                secret,
                issued_at=int(time.time()),
                ttl=min(180, runtime.MAX_CAPABILITY_TTL),
                origin=origin,
            ),
        )
        capability_written = True
        timestamp = int(time.time())
        created, _ = _json_request(
            cabinet,
            origin + "/api/orders",
            method="POST",
            body=body,
            headers=_signed_headers(secret, timestamp, body, origin=origin),
            timeout=timeout,
        )
        order_id = _private_order_id(created)
        claim_state = _claim_state(created)

        duplicate_timestamp = int(time.time())
        duplicate, _ = _json_request(
            anonymous,
            origin + "/api/orders",
            method="POST",
            body=body,
            headers=_signed_headers(secret, duplicate_timestamp, body, origin=origin),
            timeout=timeout,
        )
        if _private_order_id(duplicate) != order_id or duplicate.get("duplicate") is not True:
            raise ProbeRunError("duplicate_mismatch")

        runtime.remove_capability(capability, run_id, expected_uid=capability_uid)
        capability_written = False

        exchanged, _ = _json_request(
            cabinet,
            origin + "/api/orders/access/exchange",
            method="POST",
            body={},
            headers={"X-Claim-Exchange": claim_state, "X-Session-Mode": "cookie"},
            timeout=timeout,
        )
        if exchanged.get("order_id") != order_id:
            raise ProbeRunError("claim_mismatch")

        listed, _ = _json_request(
            cabinet,
            origin + "/api/orders",
            headers={"X-Session-Mode": "cookie"},
            timeout=timeout,
        )
        listed_ids = [item.get("id") for item in listed.get("orders", []) if isinstance(item, dict)]
        if listed_ids.count(order_id) != 1:
            raise ProbeRunError("cabinet_mismatch")
        detailed, _ = _json_request(
            cabinet,
            origin + f"/api/orders/{order_id}",
            headers={"X-Session-Mode": "cookie"},
            timeout=timeout,
        )
        if (detailed.get("order") or {}).get("id") != order_id:
            raise ProbeRunError("detail_mismatch")

        proof = _poll_proof(database, run_id, order_id, timeout=timeout)
        if not proof["proof_ready"]:
            raise ProbeRunError("delivery_timeout")
        dry = runtime.cleanup(
            database,
            run_id,
            order_id,
            expected_economic_guard=guard_before,
        )
        digest = dry["cleanup"]["dry_run_digest"]
        cleanup_result = runtime.cleanup(
            database,
            run_id,
            order_id,
            apply=True,
            dry_run_digest=digest,
            expected_economic_guard=guard_before,
        )
        second = runtime.cleanup(database, run_id, order_id, apply=True)
        if not second["cleanup"]["second_noop"]:
            raise ProbeRunError("cleanup_failed")
        result = {
            "schema_version": PUBLIC_SCHEMA_VERSION,
            "contract_sha256": runtime.CONTRACT_SHA256,
            "runtime_sha256": sha256_file(Path(runtime.__file__).resolve()),
            "migration_sha256": sha256_file(migration.resolve()),
            "economic_guard_unchanged": cleanup_result["cleanup"][
                "economic_guard_unchanged"
            ],
            "run_hash": proof["run_hash"],
            "order_ref_hash": proof["order_ref_hash"],
            "state": "passed",
            "counts": proof["counts"],
            "outbox_state": proof["outbox_state"],
            "blockers": proof["blockers"],
            "proof_ready": proof["proof_ready"],
            "cleanup": {
                **cleanup_result["cleanup"],
                "second_noop": second["cleanup"]["second_noop"],
            },
        }
        if len(runtime.canonical_json(result)) > MAX_PUBLIC_BYTES:
            raise ProbeRunError("runtime_error")
        return result
    finally:
        if capability_written:
            try:
                runtime.remove_capability(
                    capability, run_id, expected_uid=capability_uid
                )
            except runtime.ProbeError:
                pass
        # A failed run still attempts only the same guarded exact cleanup. Any
        # blocker leaves the record quarantined and disabled for investigation.
        if order_id is None:
            try:
                order_id = runtime.recover_exact_order_id(database, context)
            except (runtime.ProbeError, sqlite3.Error):
                order_id = None
        if order_id is not None and cleanup_result is None:
            try:
                dry = runtime.cleanup(
                    database,
                    run_id,
                    order_id,
                    expected_economic_guard=guard_before,
                )
                digest = dry["cleanup"]["dry_run_digest"]
                runtime.cleanup(
                    database,
                    run_id,
                    order_id,
                    apply=True,
                    dry_run_digest=digest,
                    expected_economic_guard=guard_before,
                )
            except (runtime.ProbeError, sqlite3.Error):
                pass


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument("--base-url", default=config.SITE_URL)
    value.add_argument("--database", type=Path, default=Path(config.DB_PATH))
    value.add_argument("--capability", type=Path, default=runtime.DEFAULT_CAPABILITY_PATH)
    value.add_argument(
        "--migration",
        type=Path,
        default=Path(__file__).resolve().parent / "migrations" / "0010_out001_synthetic.sql",
    )
    value.add_argument("--timeout", type=float, default=20)
    return value


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    run_id = "out001_" + secrets.token_hex(16)
    try:
        result = run_probe(
            base_url=args.base_url,
            database=args.database,
            capability=args.capability,
            migration=args.migration,
            timeout=max(2, min(args.timeout, 60)),
            run_id=run_id,
        )
        code = 0
    except ProbeRunError as exc:
        result = _safe_failure(exc.code, run_id)
        code = 1
    except (runtime.ProbeError, sqlite3.Error):
        result = _safe_failure("runtime_error", run_id)
        code = 1
    except Exception:  # bounded public failure; never emit traceback or values
        result = _safe_failure("runtime_error", run_id)
        code = 1
    encoded = runtime.canonical_json(result)
    if len(encoded) > MAX_PUBLIC_BYTES:
        encoded = runtime.canonical_json(_safe_failure("runtime_error", run_id))
        code = 1
    sys.stdout.buffer.write(encoded + b"\n")
    return code


if __name__ == "__main__":
    raise SystemExit(main())
