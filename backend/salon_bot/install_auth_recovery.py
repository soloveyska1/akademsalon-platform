#!/usr/bin/env python3
"""Fail-closed hotfix installer for stale admin authentication cookies.

The production bot checkout is intentionally separate from the public-site
repository.  This installer patches one reviewed middleware block only, refuses
unknown source hashes, keeps an exact rollback copy and installs atomically.
It never reads the database, environment variables, sessions or client data.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path


KNOWN_WEBAPP_SHA256 = "6c30cf2f02fcda1247131cc87078bb643307b5746880825bf7b6bec4fce55c05"
KNOWN_WEBAPP_POST_SHA256 = "14a45362e9ce17416c552557f4610546ce23549a4fc35dbbccc46d9e624448ee"
MARKER = "admin-auth-stale-cookie-recovery:20260824"


OLD_MIDDLEWARE = '''@web.middleware
async def _security_middleware(request: web.Request, handler):
    """Require exact-origin, double-submit CSRF for cookie-auth mutations."""
    if (
        request.method in _UNSAFE_METHODS
        and not _bearer_token(request)
        and request.cookies.get(SESSION_COOKIE)
    ):
        origin = request.headers.get("Origin", "")
        header_csrf = request.headers.get("X-CSRF-Token", "")
        cookie_csrf = request.cookies.get(CSRF_COOKIE, "")
        valid = (
            origin == _SITE_ORIGIN
            and bool(header_csrf)
            and bool(cookie_csrf)
            and secrets.compare_digest(header_csrf, cookie_csrf)
            and await db.session_csrf_valid(
                request.cookies.get(SESSION_COOKIE, ""),
                header_csrf,
            )
        )
        if not valid:
            return _err("csrf", 403)
    return await handler(request)
'''


NEW_MIDDLEWARE = '''@web.middleware
async def _security_middleware(request: web.Request, handler):
    """Require CSRF for valid cookie sessions; recover Telegram auth from stale ones."""
    session_cookie = request.cookies.get(SESSION_COOKIE, "")
    if (
        request.method in _UNSAFE_METHODS
        and not _bearer_token(request)
        and session_cookie
    ):
        # admin-auth-stale-cookie-recovery:20260824
        # An expired/revoked cookie authorizes nothing.  Only the public
        # Telegram bootstrap may discard it and continue anonymously; every
        # other unsafe route remains fail-closed.  A valid session still uses
        # the unchanged exact-origin double-submit check below.
        if request.method == "POST" and request.path == "/api/auth/start":
            session_user = await _session_user(request)
            if session_user is None:
                response = await handler(request)
                _clear_auth_cookies(response)
                return response
        origin = request.headers.get("Origin", "")
        header_csrf = request.headers.get("X-CSRF-Token", "")
        cookie_csrf = request.cookies.get(CSRF_COOKIE, "")
        valid = (
            origin == _SITE_ORIGIN
            and bool(header_csrf)
            and bool(cookie_csrf)
            and secrets.compare_digest(header_csrf, cookie_csrf)
            and await db.session_csrf_valid(session_cookie, header_csrf)
        )
        if not valid:
            return _err("csrf", 403)
    return await handler(request)
'''


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def patch_webapp(text: str) -> str:
    """Return the one-block patch or fail closed on source drift."""
    if MARKER in text:
        return text
    count = text.count(OLD_MIDDLEWARE)
    if count != 1:
        raise RuntimeError(f"security middleware anchor: expected one, got {count}")
    return text.replace(OLD_MIDDLEWARE, NEW_MIDDLEWARE, 1)


def validate_candidate(text: str) -> None:
    compile(text, "webapp.py", "exec")
    if text.count(MARKER) != 1:
        raise RuntimeError("candidate must contain exactly one recovery marker")
    if text.count('request.method == "POST" and request.path == "/api/auth/start"') != 1:
        raise RuntimeError("candidate auth-start recovery scope drifted")


def atomic_text_replace(
    path: Path,
    content: str,
    *,
    expected_current: str | None = None,
) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.auth-recovery.tmp")
    shutil.copy2(path, temporary)
    try:
        temporary.write_text(content, encoding="utf-8")
        if expected_current:
            require_hash(path, expected_current)
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def require_hash(path: Path, *expected: str) -> str:
    actual = sha256(path)
    allowed = {item for item in expected if item}
    if actual not in allowed:
        raise RuntimeError(
            f"unknown source {path}: {actual}; expected one of {sorted(allowed)}"
        )
    return actual


def preview(
    root: Path,
    *,
    expected_before: str = KNOWN_WEBAPP_SHA256,
    expected_after: str = KNOWN_WEBAPP_POST_SHA256,
) -> dict:
    source = root / "app" / "webapp.py"
    before = require_hash(source, expected_before, expected_after)
    current = source.read_text(encoding="utf-8")
    candidate = patch_webapp(current)
    validate_candidate(candidate)
    after = sha256_text(candidate)
    if expected_after and not expected_after.startswith("__") and after != expected_after:
        raise RuntimeError(f"candidate hash drift: {after}; expected {expected_after}")
    return {
        "ok": True,
        "changed": before != after,
        "before_sha256": before,
        "after_sha256": after,
        "source": str(source),
    }


def install(
    root: Path,
    backup_root: Path,
    *,
    expected_before: str = KNOWN_WEBAPP_SHA256,
    expected_after: str = KNOWN_WEBAPP_POST_SHA256,
    now: datetime | None = None,
) -> dict:
    source = root / "app" / "webapp.py"
    state = preview(
        root,
        expected_before=expected_before,
        expected_after=expected_after,
    )
    if not state["changed"]:
        state["backup"] = None
        return state

    candidate = patch_webapp(source.read_text(encoding="utf-8"))
    post_hash = sha256_text(candidate)
    if expected_after and not expected_after.startswith("__") and post_hash != expected_after:
        raise RuntimeError(f"refusing unpinned candidate hash {post_hash}")

    stamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%dT%H%M%S%fZ")
    backup = backup_root / f"admin-auth-recovery-{stamp}"
    backup.mkdir(parents=True, mode=0o700)
    preserved = backup / "webapp.py"
    shutil.copy2(source, preserved)
    if sha256(preserved) != expected_before:
        raise RuntimeError("rollback copy does not match the reviewed source")
    manifest = {
        "kind": "admin-auth-stale-cookie-recovery",
        "created_at": (now or datetime.now(timezone.utc)).isoformat(),
        "source": str(source),
        "before_sha256": expected_before,
        "after_sha256": post_hash,
    }
    (backup / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    replacement_completed = False
    try:
        # Check immediately before os.replace, after the candidate is fully
        # staged.  If drift is detected, atomic_text_replace has not touched
        # the source and this installer must preserve the unknown new bytes.
        atomic_text_replace(
            source,
            candidate,
            expected_current=expected_before,
        )
        replacement_completed = True
        require_hash(source, post_hash)
    except Exception:
        # Restore only a post-image this installer demonstrably installed.
        # Never overwrite an unknown concurrent source revision.
        if replacement_completed and sha256(source) == post_hash:
            atomic_text_replace(
                source,
                preserved.read_text(encoding="utf-8"),
                expected_current=post_hash,
            )
            require_hash(source, expected_before)
        raise
    state.update({"after_sha256": post_hash, "backup": str(backup)})
    return state


def rollback(
    root: Path,
    backup: Path,
    *,
    expected_before: str = KNOWN_WEBAPP_SHA256,
    expected_after: str = KNOWN_WEBAPP_POST_SHA256,
) -> dict:
    source = root / "app" / "webapp.py"
    preserved = backup / "webapp.py"
    require_hash(source, expected_after)
    require_hash(preserved, expected_before)
    atomic_text_replace(
        source,
        preserved.read_text(encoding="utf-8"),
        expected_current=expected_after,
    )
    require_hash(source, expected_before)
    return {
        "ok": True,
        "rolled_back": True,
        "source": str(source),
        "sha256": expected_before,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("/root/salon_bot"))
    parser.add_argument(
        "--backup-root",
        type=Path,
        default=Path("/root/salon_bot/backups"),
    )
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--check", action="store_true")
    action.add_argument("--apply", action="store_true")
    action.add_argument("--rollback", type=Path)
    args = parser.parse_args()

    if args.rollback:
        result = rollback(args.root, args.rollback)
    elif args.apply:
        result = install(args.root, args.backup_root)
    else:
        result = preview(args.root)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
