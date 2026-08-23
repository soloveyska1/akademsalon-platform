from __future__ import annotations

import ast
import secrets
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

HERE = Path(__file__).resolve()
sys.path.insert(0, str(HERE.parents[1]))

from install_auth_recovery import (
    MARKER,
    OLD_MIDDLEWARE,
    install,
    patch_webapp,
    rollback,
    sha256,
    sha256_text,
)


PREFIX = '''from types import SimpleNamespace
SESSION_COOKIE = "__Host-salon_session"
CSRF_COOKIE = "__Host-salon_csrf"
_UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
_SITE_ORIGIN = "https://akademsalon.ru"
'''
SUFFIX = "\nRECOVERY_TEST_SENTINEL = True\n"
SOURCE = PREFIX + OLD_MIDDLEWARE + SUFFIX


class Response:
    def __init__(self, status: int = 200) -> None:
        self.status = status
        self.cookies: dict[str, str] = {"__Host-salon_guest": "preserved"}
        self.deleted: dict[str, dict] = {}

    @property
    def cleared(self) -> bool:
        return set(self.deleted) == {
            "__Host-salon_session",
            "__Host-salon_csrf",
        }


class Request:
    def __init__(
        self,
        *,
        path: str,
        session: str = "",
        csrf: str = "",
        header_csrf: str | None = None,
        method: str = "POST",
        origin: str = "https://akademsalon.ru",
    ) -> None:
        self.method = method
        self.path = path
        self.cookies = {}
        if session:
            self.cookies["__Host-salon_session"] = session
        if csrf:
            self.cookies["__Host-salon_csrf"] = csrf
        self.headers = {
            "Origin": origin,
            "X-CSRF-Token": csrf if header_csrf is None else header_csrf,
        }


def executable_middleware(*, user, csrf_valid: bool):
    patched = patch_webapp(SOURCE)
    tree = ast.parse(patched)
    node = next(
        item
        for item in tree.body
        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef))
        and item.name == "_security_middleware"
    )
    module = ast.Module(body=[node], type_ignores=[])

    async def session_user(_request):
        return user

    class Db:
        async def session_csrf_valid(self, _session, _csrf):
            return csrf_valid

    def clear_auth(response):
        response.deleted["__Host-salon_session"] = {
            "secure": True,
            "httponly": True,
            "samesite": "Lax",
            "path": "/",
        }
        response.deleted["__Host-salon_csrf"] = {
            "secure": True,
            "httponly": False,
            "samesite": "Strict",
            "path": "/",
        }

    def error(_code, status):
        return Response(status)

    namespace = {
        "web": SimpleNamespace(middleware=lambda function: function, Request=object),
        "SESSION_COOKIE": "__Host-salon_session",
        "CSRF_COOKIE": "__Host-salon_csrf",
        "_UNSAFE_METHODS": frozenset({"POST", "PUT", "PATCH", "DELETE"}),
        "_SITE_ORIGIN": "https://akademsalon.ru",
        "_bearer_token": lambda _request: "",
        "_session_user": session_user,
        "_clear_auth_cookies": clear_auth,
        "_err": error,
        "db": Db(),
        "secrets": secrets,
    }
    exec(compile(module, "middleware-test", "exec"), namespace)
    return namespace["_security_middleware"]


class PatchContractTest(unittest.TestCase):
    def test_patch_is_single_anchor_idempotent_and_compilable(self):
        patched = patch_webapp(SOURCE)
        self.assertEqual(patched.count(MARKER), 1)
        self.assertIn(
            'request.method == "POST" and request.path == "/api/auth/start"',
            patched,
        )
        self.assertIn("session_user = await _session_user(request)", patched)
        self.assertEqual(patch_webapp(patched), patched)
        compile(patched, "webapp.py", "exec")

    def test_patch_refuses_unknown_source(self):
        with self.assertRaisesRegex(RuntimeError, "expected one, got 0"):
            patch_webapp(SOURCE.replace("double-submit", "double submit"))

    def test_installer_is_atomic_idempotent_and_rollback_is_exact(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            root = base / "root"
            source = root / "app" / "webapp.py"
            source.parent.mkdir(parents=True)
            source.write_text(SOURCE, encoding="utf-8")
            source.chmod(0o640)
            backups = base / "backups"
            before = sha256(source)
            after = sha256_text(patch_webapp(SOURCE))
            now = datetime(2026, 8, 24, 0, 0, tzinfo=timezone.utc)

            first = install(
                root,
                backups,
                expected_before=before,
                expected_after=after,
                now=now,
            )
            self.assertTrue(first["changed"])
            self.assertEqual(sha256(source), after)
            self.assertEqual(source.stat().st_mode & 0o777, 0o640)
            backup = Path(first["backup"])
            self.assertEqual(sha256(backup / "webapp.py"), before)

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
            self.assertEqual(sha256(source), before)
            self.assertEqual(source.read_text(encoding="utf-8"), SOURCE)

    def test_installer_refuses_unknown_hash_without_backup(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            root = base / "root"
            source = root / "app" / "webapp.py"
            source.parent.mkdir(parents=True)
            source.write_text(SOURCE + "# drift\n", encoding="utf-8")
            backups = base / "backups"
            with self.assertRaisesRegex(RuntimeError, "unknown source"):
                install(
                    root,
                    backups,
                    expected_before=sha256_text(SOURCE),
                    expected_after=sha256_text(patch_webapp(SOURCE)),
                )
            self.assertFalse(backups.exists())

    def test_installer_preserves_concurrent_drift_detected_before_replace(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            root = base / "root"
            source = root / "app" / "webapp.py"
            source.parent.mkdir(parents=True)
            source.write_text(SOURCE, encoding="utf-8")
            backups = base / "backups"
            before = sha256(source)
            after = sha256_text(patch_webapp(SOURCE))
            concurrent = SOURCE + "# concurrent revision\n"

            from install_auth_recovery import atomic_text_replace as real_replace

            def inject_drift(path, content, **kwargs):
                path.write_text(concurrent, encoding="utf-8")
                return real_replace(path, content, **kwargs)

            with patch(
                "install_auth_recovery.atomic_text_replace",
                side_effect=inject_drift,
            ):
                with self.assertRaisesRegex(RuntimeError, "unknown source"):
                    install(
                        root,
                        backups,
                        expected_before=before,
                        expected_after=after,
                    )

            self.assertEqual(source.read_text(encoding="utf-8"), concurrent)
            self.assertNotEqual(sha256(source), after)


class MiddlewareRuntimeTest(unittest.IsolatedAsyncioTestCase):
    async def test_stale_cookie_recovers_only_auth_start_and_is_cleared(self):
        middleware = executable_middleware(user=None, csrf_valid=False)
        called = 0

        async def handler(_request):
            nonlocal called
            called += 1
            return Response(200)

        response = await middleware(
            Request(path="/api/auth/start", session="expired", csrf="stale"),
            handler,
        )
        self.assertEqual(response.status, 200)
        self.assertEqual(called, 1)
        self.assertTrue(response.cleared)
        self.assertEqual(response.cookies["__Host-salon_guest"], "preserved")
        self.assertEqual(
            response.deleted["__Host-salon_session"],
            {
                "secure": True,
                "httponly": True,
                "samesite": "Lax",
                "path": "/",
            },
        )
        self.assertEqual(
            response.deleted["__Host-salon_csrf"],
            {
                "secure": True,
                "httponly": False,
                "samesite": "Strict",
                "path": "/",
            },
        )

        blocked = await middleware(
            Request(path="/api/orders", session="expired", csrf="stale"),
            handler,
        )
        self.assertEqual(blocked.status, 403)
        self.assertEqual(called, 1)
        self.assertFalse(blocked.cleared)

        for method in ("PUT", "PATCH", "DELETE"):
            blocked = await middleware(
                Request(
                    path="/api/auth/start",
                    session="expired",
                    csrf="stale",
                    method=method,
                ),
                handler,
            )
            self.assertEqual(blocked.status, 403)
            self.assertFalse(blocked.cleared)
        self.assertEqual(called, 1)

        near_miss = await middleware(
            Request(path="/api/auth/start/", session="expired", csrf="stale"),
            handler,
        )
        self.assertEqual(near_miss.status, 403)
        self.assertEqual(called, 1)

    async def test_stale_cookie_preserves_handler_status_and_clean_browser_is_unchanged(self):
        middleware = executable_middleware(user=None, csrf_valid=False)

        async def limited(_request):
            return Response(429)

        response = await middleware(
            Request(path="/api/auth/start", session="expired", csrf="stale"),
            limited,
        )
        self.assertEqual(response.status, 429)
        self.assertTrue(response.cleared)

        async def clean_handler(_request):
            return Response(200)

        response = await middleware(
            Request(path="/api/auth/start"),
            clean_handler,
        )
        self.assertEqual(response.status, 200)
        self.assertFalse(response.cleared)

    async def test_valid_session_still_requires_exact_csrf(self):
        called = 0

        async def handler(_request):
            nonlocal called
            called += 1
            return Response(200)

        db_rejected = executable_middleware(user={"id": 1}, csrf_valid=False)
        response = await db_rejected(
            Request(path="/api/auth/start", session="valid", csrf="wrong"),
            handler,
        )
        self.assertEqual(response.status, 403)
        self.assertFalse(response.cleared)

        shape_rejected = executable_middleware(user={"id": 1}, csrf_valid=True)
        rejected_requests = (
            Request(
                path="/api/auth/start",
                session="valid",
                csrf="right",
                origin="https://example.invalid",
            ),
            Request(
                path="/api/auth/start",
                session="valid",
                csrf="right",
                header_csrf="mismatch",
            ),
            Request(
                path="/api/auth/start",
                session="valid",
                csrf="",
                header_csrf="",
            ),
        )
        for request in rejected_requests:
            response = await shape_rejected(request, handler)
            self.assertEqual(response.status, 403)
            self.assertFalse(response.cleared)
        self.assertEqual(called, 0)

        accepted = executable_middleware(user={"id": 1}, csrf_valid=True)
        response = await accepted(
            Request(path="/api/auth/start", session="valid", csrf="right"),
            handler,
        )
        self.assertEqual(response.status, 200)
        self.assertEqual(called, 1)
        self.assertFalse(response.cleared)


if __name__ == "__main__":
    unittest.main()
