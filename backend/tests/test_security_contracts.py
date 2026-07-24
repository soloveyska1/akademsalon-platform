from __future__ import annotations

import asyncio
import tempfile
import unittest
import json
import os
import urllib.parse
from pathlib import Path
from unittest.mock import AsyncMock, patch

import aiosqlite
from aiohttp.test_utils import make_mocked_request

from app import config, db, webapp


class _JsonRequest:
    def __init__(self, payload: dict) -> None:
        self._payload = payload
        self.headers: dict[str, str] = {}
        self.query: dict[str, str] = {}
        self.remote = "127.0.0.1"

    async def json(self) -> dict:
        return self._payload

    async def text(self) -> str:
        return json.dumps(self._payload)


class SecurityContractTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "test.sqlite3")
        await db.init(self.db_path)
        await db.conn().execute(
            "INSERT INTO users(id,first_name,created_at,last_seen_at)"
            " VALUES(123,'Тест','2026-07-24T00:00:00','2026-07-24T00:00:00')"
        )
        await db.conn().commit()
        self.order_id = await db.create_order(
            user_id=123,
            work_type="course",
            work_label="Курсовая",
            topic="Тест",
            status="done",
            source="test",
        )

    async def asyncTearDown(self) -> None:
        await db.close()
        self.tmp.cleanup()

    async def test_migrations_are_versioned_and_idempotent(self) -> None:
        cur = await db.conn().execute(
            "SELECT version FROM schema_migrations ORDER BY version"
        )
        self.assertEqual(
            [row["version"] for row in await cur.fetchall()],
            [
                "0001_review_publication_consent",
                "0002_session_expiry",
                "0003_gift_purchase_consent",
                "0004_order_consent_enforcement",
                "0005_session_token_hash",
            ],
        )
        await db.close()
        await db.init(self.db_path)
        cur = await db.conn().execute("SELECT count(*) AS n FROM schema_migrations")
        self.assertEqual((await cur.fetchone())["n"], 5)

    def test_consent_versions_match_database_guards(self) -> None:
        migration_dir = Path(__file__).resolve().parents[1] / "migrations"
        self.assertIn(
            config.PUBLICATION_CONSENT_DOC,
            (migration_dir / "0001_review_publication_consent.sql").read_text(
                encoding="utf-8"
            ),
        )
        self.assertIn(
            config.GIFT_CONSENT_DOC,
            (migration_dir / "0003_gift_purchase_consent.sql").read_text(
                encoding="utf-8"
            ),
        )
        self.assertIn(
            config.ORDER_CONSENT_DOC,
            (migration_dir / "0004_order_consent_enforcement.sql").read_text(
                encoding="utf-8"
            ),
        )

    async def test_review_cannot_be_published_without_separate_consent(self) -> None:
        review_id = await db.review_upsert(
            self.order_id, 123, 5, "Спасибо", "Клиент"
        )
        self.assertEqual(
            await db.review_moderate(review_id, "approved"),
            "consent_required",
        )
        with self.assertRaises(aiosqlite.IntegrityError):
            await db.conn().execute(
                "UPDATE reviews SET status='approved' WHERE id=?", (review_id,)
            )
        await db.conn().rollback()
        self.assertEqual(await db.reviews_public(), [])

    async def test_public_author_requires_its_own_category(self) -> None:
        review_id = await db.review_upsert(
            self.order_id,
            123,
            5,
            "Понятно и аккуратно",
            "Ирина",
            publication_consent=True,
            publication_categories={
                "rating_text": True,
                "author": False,
                "screenshot": False,
            },
            publication_consent_doc=config.PUBLICATION_CONSENT_DOC,
        )
        self.assertEqual(await db.review_moderate(review_id, "approved"), "approved")
        rows = await db.reviews_public()
        self.assertEqual(len(rows), 1)
        self.assertIsNone(rows[0]["author"])
        self.assertEqual(rows[0]["text"], "Понятно и аккуратно")

    async def test_invalid_consent_document_does_not_unlock_publication(self) -> None:
        review_id = await db.review_upsert(
            self.order_id,
            123,
            5,
            "Текст",
            "Клиент",
            publication_consent=True,
            publication_categories={"rating_text": True, "author": True},
            publication_consent_doc="unknown-version",
        )
        self.assertEqual(
            await db.review_moderate(review_id, "approved"),
            "consent_required",
        )

    async def test_session_has_ttl_and_expired_token_is_removed(self) -> None:
        with patch.object(config, "SESSION_ABSOLUTE_TTL_SECONDS", 3600):
            token = await db.session_create(123)
        cur = await db.conn().execute(
            "SELECT token,expires_at,token_hash_version FROM sessions"
        )
        stored = await cur.fetchone()
        self.assertTrue(stored["expires_at"])
        self.assertNotEqual(stored["token"], token)
        self.assertEqual(stored["token_hash_version"], 1)
        await db.conn().execute(
            "UPDATE sessions SET expires_at='2000-01-01T00:00:00' WHERE token=?",
            (stored["token"],),
        )
        await db.conn().commit()
        self.assertIsNone(await db.session_user(token))
        cur = await db.conn().execute(
            "SELECT count(*) AS n FROM sessions WHERE token=?", (stored["token"],)
        )
        self.assertEqual((await cur.fetchone())["n"], 0)

    async def test_legacy_plaintext_session_is_hashed_without_logout(self) -> None:
        raw_token = "legacy-session-token-for-test"
        await db.conn().execute(
            "INSERT INTO sessions("
            "token,user_id,created_at,last_used_at,imp,expires_at,"
            "revoked_at,token_hash_version"
            ") VALUES(?,123,?,?,0,NULL,NULL,0)",
            (raw_token, db.now_iso(), db.now_iso()),
        )
        await db.conn().commit()
        await db.close()
        await db.init(self.db_path)
        cur = await db.conn().execute(
            "SELECT token,token_hash_version FROM sessions WHERE user_id=123"
        )
        stored = await cur.fetchone()
        self.assertNotEqual(stored["token"], raw_token)
        self.assertEqual(stored["token_hash_version"], 1)
        user = await db.session_user(raw_token)
        self.assertIsNotNone(user)
        self.assertEqual(user["id"], 123)

    async def test_session_token_in_url_is_rejected_but_bearer_is_accepted(self) -> None:
        token = await db.session_create(123)
        query_request = make_mocked_request("GET", f"/api/me?session={token}")
        self.assertIsNone(await webapp._session_user(query_request))
        bearer_request = make_mocked_request(
            "GET",
            "/api/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        user = await webapp._session_user(bearer_request)
        self.assertIsNotNone(user)
        self.assertEqual(user["id"], 123)

    async def test_oauth_link_start_binds_user_without_session_in_url(self) -> None:
        token = await db.session_create(123)
        request = _JsonRequest({})
        request.headers["Authorization"] = f"Bearer {token}"
        request.match_info = {"prov": "vk"}
        webapp._OAUTH_STATES.clear()
        with patch.dict(os.environ, {"VK_CLIENT_ID": "test-client"}), patch.object(
            webapp, "_rate_ok", return_value=True
        ):
            response = await webapp.oauth_link_start(request)
        payload = json.loads(response.body)
        self.assertTrue(payload["ok"])
        self.assertNotIn(token, payload["url"])
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(payload["url"]).query)
        state = query["state"][0]
        self.assertEqual(webapp._OAUTH_STATES[state]["link"], 123)

    async def test_visit_geolocation_does_not_disclose_ip_to_external_http(self) -> None:
        ip = "203.0.113.42"
        with patch.object(
            webapp.aiohttp_client,
            "ClientSession",
            side_effect=AssertionError("external geo request is forbidden"),
        ):
            await webapp._geo_resolve(ip)
        row = await db.geo_get(ip)
        self.assertIsNotNone(row)
        self.assertEqual(row["label"], "геолокация отключена")

    async def test_visit_beacon_never_links_account_order_or_contact(self) -> None:
        token = await db.session_create(123)
        request = _JsonRequest({
            "vid": "visitor-test-01",
            "kind": "order",
            "page": "/configurator.html?token=secret",
            "order": self.order_id,
            "token": "must-not-be-stored",
            "contact": "must-not-be-stored@example.test",
        })
        request.headers["Authorization"] = f"Bearer {token}"
        with patch.object(webapp, "_rate_ok", return_value=True):
            response = await webapp.visit_beacon(request)
        self.assertEqual(response.status, 204)
        await asyncio.sleep(0)
        cur = await db.conn().execute(
            "SELECT user_id,order_id,contact,page,step FROM visits "
            "WHERE vid='visitor-test-01'"
        )
        row = await cur.fetchone()
        self.assertIsNotNone(row)
        self.assertIsNone(row["user_id"])
        self.assertIsNone(row["order_id"])
        self.assertIsNone(row["contact"])
        self.assertNotIn("secret", row["page"])
        self.assertEqual(row["step"], "заявка отправлена")
        admin_request = _JsonRequest({})
        with patch.object(
            webapp, "_admin_user", new=AsyncMock(return_value={"id": 999})
        ):
            dashboard_response = await webapp.admin_visits(admin_request)
        dashboard = json.loads(dashboard_response.body)
        self.assertTrue(dashboard["ok"])
        self.assertIn("stats", dashboard)
        self.assertGreaterEqual(len(dashboard["visits"]), 1)

    async def test_analytics_retention_purges_old_raw_ip_and_legacy_links(self) -> None:
        await db.conn().execute(
            "INSERT INTO visits("
            "vid,user_id,ip,order_id,contact,pages,bot,started_at,last_at"
            ") VALUES('old-visit',123,'203.0.113.8',?,"
            "'old@example.test',1,0,'2020-01-01T00:00:00','2020-01-01T00:00:00')",
            (self.order_id,),
        )
        await db.conn().execute(
            "INSERT INTO visits("
            "vid,user_id,ip,order_id,contact,pages,bot,started_at,last_at"
            ") VALUES('recent-visit',123,'203.0.113.9',?,"
            "'recent@example.test',1,0,?,?)",
            (self.order_id, db.now_iso(), db.now_iso()),
        )
        await db.conn().execute(
            "INSERT INTO geo_cache(ip,label,at) "
            "VALUES('203.0.113.8','old','2020-01-01T00:00:00')"
        )
        await db.conn().commit()
        await db.close()
        await db.init(self.db_path)
        cur = await db.conn().execute(
            "SELECT count(*) AS n FROM visits WHERE vid='old-visit'"
        )
        self.assertEqual((await cur.fetchone())["n"], 0)
        cur = await db.conn().execute(
            "SELECT user_id,order_id,contact FROM visits WHERE vid='recent-visit'"
        )
        recent = await cur.fetchone()
        self.assertIsNotNone(recent)
        self.assertIsNone(recent["user_id"])
        self.assertIsNone(recent["order_id"])
        self.assertIsNone(recent["contact"])
        self.assertIsNone(await db.geo_get("203.0.113.8"))

    async def test_authenticated_user_cannot_bypass_order_consent(self) -> None:
        request = _JsonRequest({"type": "course"})
        authenticated = {"id": 123, "banned": 0, "session_imp": 0}
        with patch.object(
            webapp, "_rate_ok", return_value=True
        ), patch.object(
            webapp, "_session_user", new=AsyncMock(return_value=authenticated)
        ):
            response = await webapp.orders_create(request)
        self.assertEqual(response.status, 400)
        self.assertEqual(json.loads(response.body)["error"], "consent_required")

    async def test_guest_order_header_token_grants_access_without_url_secret(self) -> None:
        guest_token = "guest-capability-token"
        guest_order_id = await db.create_order(
            user_id=None,
            work_type="course",
            work_label="Курсовая",
            source="test",
            access_token=guest_token,
        )
        request = _JsonRequest({})
        request.headers["X-Order-Token"] = guest_token
        order, user = await webapp._order_access(request, guest_order_id)
        self.assertIsNone(user)
        self.assertIsNotNone(order)
        self.assertEqual(order["id"], guest_order_id)
        self.assertIn("X-Order-Token", webapp.CORS["Access-Control-Allow-Headers"])
        self.assertIn("X-Order-Tokens", webapp.CORS["Access-Control-Allow-Headers"])
        list_request = _JsonRequest({})
        list_request.headers["X-Order-Tokens"] = guest_token
        response = await webapp.orders_list(list_request)
        payload = json.loads(response.body)
        self.assertTrue(payload["ok"])
        self.assertIn(guest_order_id, [item["id"] for item in payload["orders"]])

    async def test_order_rejects_stale_consent_version_for_authenticated_user(self) -> None:
        request = _JsonRequest({
            "type": "course",
            "consent": True,
            "consent_doc": "consent 1.4 · privacy 2.0 · oferta 2.0",
        })
        authenticated = {"id": 123, "banned": 0, "session_imp": 0}
        with patch.object(
            webapp, "_rate_ok", return_value=True
        ), patch.object(
            webapp, "_session_user", new=AsyncMock(return_value=authenticated)
        ):
            response = await webapp.orders_create(request)
        self.assertEqual(response.status, 409)
        self.assertEqual(
            json.loads(response.body)["error"], "consent_version_mismatch"
        )

    async def test_database_blocks_site_order_without_recorded_consent(self) -> None:
        with self.assertRaises(aiosqlite.IntegrityError):
            await db.create_order(
                user_id=123,
                work_type="course",
                work_label="Курсовая",
                source="сайт",
            )
        await db.conn().rollback()

    async def test_authenticated_user_cannot_bypass_gift_purchase_consent(self) -> None:
        request = _JsonRequest({
            "amount": 5_000,
            "buyer_contact": "buyer@example.test",
        })
        authenticated = {
            "id": 123,
            "email": "buyer@example.test",
            "banned": 0,
            "session_imp": 0,
        }
        with patch.object(
            webapp, "_rate_ok", return_value=True
        ), patch.object(
            webapp, "_session_user", new=AsyncMock(return_value=authenticated)
        ):
            response = await webapp.gift_create(request)
        self.assertEqual(response.status, 400)
        self.assertEqual(json.loads(response.body)["error"], "consent_required")

    async def test_database_blocks_site_gift_without_recorded_consent(self) -> None:
        with self.assertRaises(aiosqlite.IntegrityError):
            await db.gift_create(
                code="AS-TEST-NOPE-0001",
                amount=5_000,
                status="pending",
                via="сайт",
                buy_token="test-token",
            )
        await db.conn().rollback()


if __name__ == "__main__":
    unittest.main()
