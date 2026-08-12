from __future__ import annotations

import asyncio
import json
import sqlite3
import sys
import tempfile
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

HERE = Path(__file__).resolve()
ROOT = HERE.parents[3]
sys.path.insert(0, str(HERE.parents[1]))

from analytics_v2 import (  # noqa: E402
    AnalyticsStore,
    consume_rate_group,
    GrantBudgetExhausted,
    GrantSigner,
    RateLimiter,
    RevokedIdentity,
    retention_cleanup_worker,
)
from install_analytics_v2 import (  # noqa: E402
    install,
    patch_db,
    patch_nginx_headers,
    patch_nginx_site,
    patch_webapp,
    require_hash,
    rollback,
    sha256,
    sha256_text,
)


class Clock:
    def __init__(self) -> None:
        self.value = datetime(2026, 8, 12, 9, 0, tzinfo=timezone.utc)

    def __call__(self) -> datetime:
        return self.value

    def advance(self, **kwargs) -> None:
        self.value += timedelta(**kwargs)


class AnalyticsV2Test(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmp.name) / "salon.db")
        self.clock = Clock()
        self.client_sequence = 0
        self.store = AnalyticsStore(
            self.db_path,
            contract_path=ROOT / "analytics" / "contract.json",
            clock=self.clock,
        )
        self.store.initialize()

    def tearDown(self) -> None:
        self.tmp.cleanup()

    def event(self, name: str, page: str = "/", **extra):
        self.client_sequence += 1
        item = {
            "event_id": str(uuid.uuid4()),
            "event": name,
            "page": page,
            "release": "20260812analytics2",
            "source": {"kind": "search", "name": "yandex", "medium": "", "campaign": ""},
            "occurred_at": self.clock.value.isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "client_sequence": self.client_sequence,
        }
        item.update(extra)
        return item

    def payload(self, visitor: str, secret: str, events, *, consent_at: str = "2026-08-12T08:59:00.000Z"):
        return {
            "schema_version": 2,
            "visitor_id": visitor,
            "deletion_secret": secret,
            "consent_version": 3,
            "consent_at": consent_at,
            "grant": "test-grant",
            "events": events,
        }

    def test_idempotent_ingest_and_server_side_metrics(self):
        visitor, secret = "v" + "1" * 18, "a" * 64
        events = [
            self.event("page_view"),
            self.event("config_open", cta_id="calculator"),
            self.event("submit_success", page="/configurator.html"),
        ]
        first = self.store.ingest(self.payload(visitor, secret, events), user_agent="Mozilla/5.0", ip="203.0.113.4")
        second = self.store.ingest(self.payload(visitor, secret, events), user_agent="Mozilla/5.0", ip="203.0.113.4")
        self.assertEqual(first["accepted"], 3)
        self.assertEqual(second["accepted"], 0)
        self.assertEqual(second["duplicate"], 3)
        overview = self.store.overview(hours=24)
        self.assertEqual(overview["metrics"]["visitors"], 1)
        self.assertEqual(overview["metrics"]["sessions"], 1)
        self.assertEqual(overview["metrics"]["pageviews"], 1)
        self.assertEqual(overview["metrics"]["converted_sessions"], 1)
        self.assertEqual(overview["metrics"]["session_conversion_pct"], 100.0)
        self.assertEqual(overview["sources"][0]["name"], "yandex")

    def test_one_visitor_two_converted_sessions_never_exceeds_100_percent(self):
        visitor, secret = "v" + "2" * 18, "b" * 64
        self.store.ingest(self.payload(visitor, secret, [self.event("page_view"), self.event("submit_success")]))
        self.clock.advance(minutes=31)
        self.store.ingest(self.payload(visitor, secret, [self.event("page_view"), self.event("submit_success")]))
        overview = self.store.overview(hours=24)
        self.assertEqual(overview["metrics"]["visitors"], 1)
        self.assertEqual(overview["metrics"]["sessions"], 2)
        self.assertEqual(overview["metrics"]["converted_sessions"], 2)
        self.assertEqual(overview["metrics"]["converted_visitors"], 1)
        self.assertEqual(overview["metrics"]["session_conversion_pct"], 100.0)
        self.assertEqual(overview["metrics"]["visitor_conversion_pct"], 100.0)

    def test_invalid_event_is_visible_but_does_not_create_a_row(self):
        event = self.event("contact@example.com")
        result = self.store.ingest(self.payload("v" + "3" * 18, "c" * 64, [event]))
        self.assertEqual(result["accepted"], 0)
        self.assertEqual(result["invalid"], 1)
        self.assertEqual(result["discarded"], [event["event_id"]])
        self.assertEqual(self.store.overview(hours=24)["metrics"]["events"], 0)

    def test_campaign_dimensions_reject_arbitrary_query_text(self):
        event = self.event("page_view")
        event["source"] = {
            "kind": "campaign",
            "name": "semen_semenov",
            "medium": "private_note",
            "campaign": "phone_79991234567",
        }
        result = self.store.ingest(self.payload("v" + "3a" * 9, "ca" * 32, [event]))
        self.assertEqual(result["accepted"], 0)
        self.assertEqual(result["invalid"], 1)
        conn = sqlite3.connect(self.db_path)
        try:
            dump = "\n".join(conn.iterdump())
        finally:
            conn.close()
        self.assertNotIn("semen_semenov", dump)
        self.assertNotIn("79991234567", dump)

    def test_raw_ip_user_agent_and_forbidden_fields_are_absent_from_v2_schema(self):
        self.store.ingest(self.payload("v" + "4" * 18, "d" * 64, [self.event("page_view")]),
                          user_agent="Secret Browser 1", ip="198.51.100.77")
        conn = sqlite3.connect(self.db_path)
        try:
            for table in ("analytics_v2_visitors", "analytics_v2_sessions", "analytics_v2_events"):
                columns = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
                self.assertFalse(columns & {"ip", "ua", "contact", "order_id", "user_id", "raw_referrer"})
            dump = "\n".join(conn.iterdump())
        finally:
            conn.close()
        self.assertNotIn("198.51.100.77", dump)
        self.assertNotIn("Secret Browser 1", dump)

    def test_revoke_cascades_raw_rows_and_tombstone_blocks_offline_replay(self):
        visitor, secret = "v" + "5" * 18, "e" * 64
        self.store.ingest(self.payload(visitor, secret, [self.event("page_view"), self.event("submit_success")]))
        result = self.store.revoke(visitor, secret)
        self.assertEqual(result["deleted_visitors"], 1)
        self.assertEqual(result["deleted_sessions"], 1)
        self.assertEqual(result["deleted_events"], 2)
        with self.assertRaises(RevokedIdentity):
            self.store.ingest(self.payload(visitor, secret, [self.event("page_view")]))
        self.assertEqual(self.store.overview(hours=24)["metrics"]["events"], 0)

    def test_more_than_300_sessions_remain_exact_and_paginate(self):
        for index in range(305):
            visitor = "v" + format(index + 1000, "018x")
            secret = format(index + 1, "064x")
            self.store.ingest(self.payload(visitor, secret, [self.event("page_view")]))
        overview = self.store.overview(hours=24)
        self.assertEqual(overview["metrics"]["sessions"], 305)
        first = self.store.sessions(hours=24, limit=100)
        second = self.store.sessions(hours=24, limit=100, cursor=first["next_cursor"])
        third = self.store.sessions(hours=24, limit=100, cursor=second["next_cursor"])
        fourth = self.store.sessions(hours=24, limit=100, cursor=third["next_cursor"])
        ids = [item["session_id"] for page in (first, second, third, fourth) for item in page["items"]]
        self.assertEqual(len(ids), 305)
        self.assertEqual(len(set(ids)), 305)

    def test_session_detail_contains_safe_timeline_only(self):
        visitor, secret = "v" + "6" * 18, "f" * 64
        self.store.ingest(self.payload(visitor, secret, [self.event("page_view", "/services.html")]))
        row = self.store.sessions(hours=24, limit=10)["items"][0]
        detail = self.store.session_detail(row["session_id"])
        self.assertEqual(detail["visitor_label"], row["visitor_label"])
        self.assertEqual(detail["events"][0]["event"], "page_view")
        self.assertNotIn("visitor_id", json.dumps(detail))
        self.assertNotIn("deletion", json.dumps(detail))

    def test_retention_deletes_parent_and_cascaded_events_transactionally(self):
        visitor, secret = "v" + "7" * 18, "1" * 64
        self.store.ingest(self.payload(visitor, secret, [self.event("page_view")]))
        self.clock.advance(days=366)
        result = self.store.cleanup_retention(force=True)
        self.assertEqual(result["sessions"], 1)
        self.assertEqual(result["visitors"], 1)
        self.assertEqual(self.store.overview(hours=24 * 90)["metrics"]["events"], 0)

    def test_duplicate_event_id_inside_one_batch_is_idempotent(self):
        visitor, secret = "v" + "8" * 18, "2" * 64
        event = self.event("page_view")
        result = self.store.ingest(self.payload(visitor, secret, [event, dict(event)]))
        self.assertEqual(result["accepted"], 1)
        self.assertEqual(result["duplicate"], 1)
        self.assertEqual(result["invalid"], 0)
        self.assertEqual(result["processed"], [event["event_id"]])
        self.assertEqual(self.store.overview(hours=24)["metrics"]["events"], 1)

    def test_invalid_row_without_uuid_is_counted_in_mixed_batch(self):
        visitor, secret = "v" + "9" * 18, "3" * 64
        valid = self.event("page_view")
        invalid = dict(valid)
        invalid.pop("event_id")
        result = self.store.ingest(self.payload(visitor, secret, [invalid, valid]))
        self.assertEqual(result["accepted"], 1)
        self.assertEqual(result["invalid"], 1)
        self.assertEqual(result["discarded"], [])
        self.assertEqual(self.store.overview(hours=24)["health"]["invalid"], 1)

    def test_conflicting_same_id_is_rejected_without_partial_insert(self):
        visitor, secret = "v" + "a" * 18, "4" * 64
        first = self.event("page_view")
        conflict = dict(first)
        conflict["event"] = "submit_success"
        result = self.store.ingest(self.payload(visitor, secret, [first, conflict]))
        self.assertEqual(result["accepted"], 0)
        self.assertEqual(result["invalid"], 2)
        self.assertEqual(result["discarded"], [first["event_id"]])
        self.assertEqual(self.store.overview(hours=24)["metrics"]["events"], 0)

    def test_submit_only_does_not_invent_previous_funnel_stages(self):
        visitor, secret = "v" + "b" * 18, "5" * 64
        self.store.ingest(self.payload(visitor, secret, [self.event("submit_success")]))
        funnel = self.store.overview(hours=24)["funnel"]
        self.assertTrue(funnel)
        self.assertEqual([stage["sessions"] for stage in funnel], [0] * len(funnel))

    def test_equal_millisecond_uses_client_sequence_for_timeline_and_funnel(self):
        visitor, secret = "v" + "0" * 18, "9" * 64
        names = [
            "page_view", "cta_click", "config_open", "first_input",
            "submit_attempt", "submit_success",
        ]
        timestamp = self.clock.value.isoformat(timespec="milliseconds").replace("+00:00", "Z")
        events = []
        for index, name in enumerate(names):
            events.append(self.event(
                name,
                event_id=f"ffffffff-ffff-4fff-bfff-{6 - index:012d}",
                occurred_at=timestamp,
                client_sequence=index + 1,
            ))
        result = self.store.ingest(self.payload(visitor, secret, events))
        self.assertEqual(result["accepted"], 6)
        overview = self.store.overview(hours=24)
        self.assertEqual([stage["sessions"] for stage in overview["funnel"]], [1] * 6)
        session = self.store.sessions(hours=24)["items"][0]
        detail = self.store.session_detail(session["session_id"], hours=24)
        self.assertEqual([event["event"] for event in detail["events"]], names)

    def test_retention_removes_old_event_inside_otherwise_fresh_session(self):
        visitor, secret = "v" + "c" * 18, "6" * 64
        old_at = (self.clock.value - timedelta(minutes=75)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        fresh_at = (self.clock.value - timedelta(minutes=45)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        events = [
            self.event("page_view", occurred_at=old_at),
            self.event("page_view", occurred_at=fresh_at),
        ]
        self.store.ingest(self.payload(
            visitor,
            secret,
            events,
            consent_at="2026-08-12T07:00:00.000Z",
        ))
        self.store.retention = timedelta(hours=1)
        result = self.store.cleanup_retention(force=True)
        self.assertEqual(result["events"], 1)
        overview = self.store.overview(hours=2)
        self.assertEqual(overview["metrics"]["events"], 1)
        self.assertEqual(overview["metrics"]["sessions"], 1)

    def test_delayed_events_keep_occurrence_time_and_are_not_marked_online(self):
        visitor, secret = "v" + "d" * 18, "7" * 64
        first_at = (self.clock.value - timedelta(minutes=60)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        second_at = (self.clock.value - timedelta(minutes=40)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
        self.store.ingest(self.payload(
            visitor,
            secret,
            [
                self.event("page_view", occurred_at=first_at),
                self.event("cta_click", occurred_at=second_at),
            ],
            consent_at="2026-08-12T07:00:00.000Z",
        ))
        overview = self.store.overview(hours=2)
        item = self.store.sessions(hours=2)["items"][0]
        self.assertEqual(overview["metrics"]["sessions"], 1)
        self.assertEqual(overview["metrics"]["online"], 0)
        self.assertEqual(item["started_at"], first_at)
        self.assertEqual(item["last_at"], second_at)
        self.assertFalse(item["active"])

    def test_every_metric_and_session_row_use_the_same_period_window(self):
        visitor, secret = "v" + "e" * 18, "8" * 64
        offsets = [-80, -60, -40, -20, 0]
        events = []
        for index, offset in enumerate(offsets):
            occurred_at = (self.clock.value + timedelta(minutes=offset)).isoformat(
                timespec="milliseconds"
            ).replace("+00:00", "Z")
            events.append(self.event("page_view", f"/guide-{index}.html", occurred_at=occurred_at))
        events[0]["page"] = "/"
        events[1]["page"] = "/services.html"
        events[2]["page"] = "/configurator.html"
        events[3]["page"] = "/privacy.html"
        events[4]["page"] = "/about.html"
        submit = self.event(
            "submit_success",
            occurred_at=(self.clock.value - timedelta(minutes=75)).isoformat(
                timespec="milliseconds"
            ).replace("+00:00", "Z"),
        )
        self.store.ingest(self.payload(
            visitor,
            secret,
            events + [submit],
            consent_at="2026-08-12T07:00:00.000Z",
        ))
        overview = self.store.overview(hours=1)
        item = self.store.sessions(hours=1)["items"][0]
        self.assertEqual(overview["metrics"]["pageviews"], 4)
        self.assertEqual(overview["metrics"]["avg_pageviews"], 4.0)
        self.assertEqual(overview["metrics"]["converted_sessions"], 0)
        self.assertEqual(item["pageviews"], 4)
        self.assertFalse(item["converted"])
        self.assertEqual(item["entry_page"], "/services.html")

    def test_signed_grant_is_bound_to_visitor_network_and_expiry(self):
        signer = GrantSigner("s" * 32, ttl_minutes=10, event_budget=60)
        issued = signer.issue("v" + "f" * 18, "203.0.113.4", self.clock.value)
        claims = signer.verify(issued["grant"], "v" + "f" * 18, "203.0.113.99", self.clock.value)
        self.assertEqual(claims["budget"], 60)
        with self.assertRaises(Exception):
            signer.verify(issued["grant"], "v" + "f" * 18, "203.0.114.4", self.clock.value)
        with self.assertRaises(Exception):
            signer.verify(
                issued["grant"],
                "v" + "f" * 18,
                "203.0.113.4",
                self.clock.value + timedelta(minutes=11),
            )

    def test_grant_budget_exhaustion_rejects_event_61_without_partial_write(self):
        visitor, secret = "v" + "1a" * 9, "a1" * 32
        limiter = RateLimiter(limit=60, global_limit=60, window_seconds=3600)

        def allow(_visitor: str, cost: int) -> bool:
            if not limiter.allow("grant", cost):
                raise GrantBudgetExhausted()
            return True

        for _ in range(3):
            events = [self.event("page_view") for _ in range(20)]
            self.assertEqual(
                self.store.ingest(self.payload(visitor, secret, events), rate_check=allow)["accepted"],
                20,
            )
        with self.assertRaises(GrantBudgetExhausted):
            self.store.ingest(
                self.payload(visitor, secret, [self.event("page_view")]),
                rate_check=allow,
            )
        conn = sqlite3.connect(self.db_path)
        try:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM analytics_v2_events").fetchone()[0], 60)
        finally:
            conn.close()

    def test_rate_limiter_distinguishes_key_budget_from_global_load(self):
        per_key = RateLimiter(limit=2, global_limit=10, window_seconds=3600)
        self.assertIsNone(per_key.reject_reason("grant-a", 2))
        self.assertEqual(per_key.reject_reason("grant-a", 1), "key")

        global_load = RateLimiter(limit=2, global_limit=1, window_seconds=3600)
        self.assertIsNone(global_load.reject_reason("grant-a", 1))
        self.assertEqual(global_load.reject_reason("grant-b", 1), "global")

        preview = RateLimiter(limit=1, global_limit=1, window_seconds=3600)
        self.assertIsNone(preview.reject_reason("grant-a", 1, consume=False))
        self.assertIsNone(preview.reject_reason("grant-a", 1))
        self.assertEqual(preview.reject_reason("grant-a", 1), "key")

    def test_grouped_grant_limits_reject_atomically_under_concurrency(self):
        ip_limiter = RateLimiter(limit=13, global_limit=100, window_seconds=3600)
        visitor_limiter = RateLimiter(limit=12, global_limit=100, window_seconds=3600)
        lock = __import__("threading").Lock()

        def issue(visitor: str):
            return consume_rate_group(
                ((ip_limiter, "ip:nat"), (visitor_limiter, "visitor:" + visitor)),
                lock=lock,
            )

        with ThreadPoolExecutor(max_workers=20) as pool:
            results = list(pool.map(lambda _: issue("same"), range(20)))
        self.assertEqual(results.count(None), 12)
        self.assertTrue(all(result in (None, (1, "key")) for result in results))
        # The eight rejected requests did not consume the IP budget: a new
        # visitor behind the same NAT still receives the thirteenth slot.
        self.assertIsNone(issue("other"))
        self.assertEqual(issue("third"), (0, "key"))

    def test_background_retention_worker_cleans_without_new_ingest(self):
        visitor, secret = "v" + "2a" * 9, "a2" * 32
        self.store.ingest(self.payload(visitor, secret, [self.event("page_view")]))
        self.store.retention = timedelta(hours=1)
        self.clock.advance(hours=2)

        async def exercise() -> None:
            task = asyncio.create_task(
                retention_cleanup_worker(self.store, interval_seconds=0.01)
            )
            await asyncio.sleep(0.04)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task

        asyncio.run(exercise())
        conn = sqlite3.connect(self.db_path)
        try:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM analytics_v2_events").fetchone()[0], 0)
        finally:
            conn.close()


class InstallerPatchTest(unittest.TestCase):
    def fixture(self, folder: str) -> SimpleNamespace:
        root = Path(folder) / "production"
        app = root / "app"
        app.mkdir(parents=True)
        webapp = app / "webapp.py"
        webapp.write_text('''from . import config, db, keyboards as kb, texts

async def legacy(request):
    """
    Максимально дёшев и неболтлив: битые данные молча отбрасываем,
    ответ всегда 204 — фронт на него не смотрит.
    """
    ip = _ip(request)

def routes(r, admin_requisites, handle_options):
    r.add_post("/api/admin/requisites", admin_requisites)
    r.add_options("/api/{tail:.*}", handle_options)
''', encoding="utf-8")
        db_module = app / "db.py"
        db_module.write_text(
            'async def cleanup(_conn, analytics_cutoff):\n'
            '    await _conn.execute("DELETE FROM visits WHERE last_at < ?", (analytics_cutoff,))\n',
            encoding="utf-8",
        )
        nginx_site = root / "nginx-site.conf"
        nginx_site.write_text('''# Академический Салон · основной домен akademsalon.ru (переезд 20260710-042330)
server {
    location = /admin.html {
        root /var/www/academic_saloon/current;
        try_files $uri =404;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
        include /etc/nginx/snippets/akademsalon-security-headers.conf;
    }
    # --- API бота (SQLite-картотека, 8090) ---
    location /api/ {
}
''', encoding="utf-8")
        nginx_headers = root / "nginx-security-headers.conf"
        nginx_headers.write_text(
            'add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;\n',
            encoding="utf-8",
        )
        conn = sqlite3.connect(root / "salon.db")
        try:
            conn.execute("CREATE TABLE smoke(id INTEGER PRIMARY KEY)")
            conn.commit()
        finally:
            conn.close()
        return SimpleNamespace(
            root=root,
            database="salon.db",
            module=ROOT / "backend" / "salon_bot" / "analytics_v2.py",
            contract=ROOT / "analytics" / "contract.json",
            nginx_site=nginx_site,
            nginx_headers=nginx_headers,
            webapp_sha=sha256(webapp),
            webapp_post_sha=sha256_text(patch_webapp(webapp.read_text(encoding="utf-8"))),
            db_sha=sha256(db_module),
            db_post_sha=sha256_text(patch_db(db_module.read_text(encoding="utf-8"))),
            nginx_site_sha=sha256(nginx_site),
            nginx_site_post_sha=sha256_text(patch_nginx_site(nginx_site.read_text(encoding="utf-8"))),
            nginx_headers_sha=sha256(nginx_headers),
            nginx_headers_post_sha=sha256_text(
                patch_nginx_headers(nginx_headers.read_text(encoding="utf-8"))
            ),
            rollback=None,
        )

    def test_marker_does_not_bypass_exact_hash_check(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "webapp.py"
            path.write_text("arbitrary\n" + "analytics-v2-integration:20260812", encoding="utf-8")
            with self.assertRaises(RuntimeError):
                require_hash(path, "0" * 64)

    def test_webapp_patch_is_exact_and_idempotent(self):
        source = '''from . import config, db, keyboards as kb, texts
    Максимально дёшев и неболтлив: битые данные молча отбрасываем,
    ответ всегда 204 — фронт на него не смотрит.
    """
    ip = _ip(request)
    r.add_post("/api/admin/requisites", admin_requisites)
    r.add_options("/api/{tail:.*}", handle_options)
'''
        patched = patch_webapp(source)
        self.assertIn("analytics_v2.register_aiohttp", patched)
        self.assertIn("ANALYTICS_LEGACY_ENABLED", patched)
        self.assertEqual(patch_webapp(patched), patched)

    def test_legacy_retention_patch_deletes_children_before_parent(self):
        source = '    await _conn.execute("DELETE FROM visits WHERE last_at < ?", (analytics_cutoff,))\n'
        patched = patch_db(source)
        self.assertLess(patched.index("DELETE FROM funnel_events"), patched.index("DELETE FROM visits"))
        self.assertEqual(patch_db(patched), patched)

    def test_nginx_patch_adds_csp_private_page_and_exact_body_limit(self):
        headers = 'add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;\n'
        site = '''# Академический Салон · основной домен akademsalon.ru (переезд 20260710-042330)
server {
    location = /admin.html {
        root /var/www/academic_saloon/current;
        try_files $uri =404;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
        add_header X-Robots-Tag "noindex, nofollow, noarchive" always;
        include /etc/nginx/snippets/akademsalon-security-headers.conf;
    }
    # --- API бота (SQLite-картотека, 8090) ---
    location /api/ {
}
'''
        patched_headers = patch_nginx_headers(headers)
        patched_site = patch_nginx_site(site)
        self.assertIn("Content-Security-Policy", patched_headers)
        self.assertIn("location = /admin-analytics.html", patched_site)
        self.assertIn("client_max_body_size 32k", patched_site)
        self.assertIn("limit_req_zone", patched_site)
        self.assertIn("limit_req zone=analytics_v2_public", patched_site)
        admin_block = patched_site.split("location = /admin-analytics.html", 1)[1].split("}", 1)[0]
        self.assertIn("script-src 'self'; style-src 'self'", admin_block)
        self.assertNotIn("unsafe-inline", admin_block)
        self.assertNotIn("mc.yandex", admin_block)
        self.assertEqual(patch_nginx_headers(patched_headers), patched_headers)
        self.assertEqual(patch_nginx_site(patched_site), patched_site)

    def test_installer_rejects_unpinned_module_and_contract(self):
        with tempfile.TemporaryDirectory() as folder:
            args = self.fixture(folder)
            fake_module = Path(folder) / "analytics_v2.py"
            fake_module.write_text("VALUE = 1\n", encoding="utf-8")
            args.module = fake_module
            with self.assertRaisesRegex(RuntimeError, "unknown source"):
                install(args)

        with tempfile.TemporaryDirectory() as folder:
            args = self.fixture(folder)
            fake_contract = Path(folder) / "contract.json"
            fake_contract.write_text(
                json.dumps({"schema_version": 2, "release": "20260812analytics2"}),
                encoding="utf-8",
            )
            args.contract = fake_contract
            with self.assertRaisesRegex(RuntimeError, "unknown source"):
                install(args)

    def test_rollback_refuses_newer_state_without_overwriting_it(self):
        with tempfile.TemporaryDirectory() as folder:
            args = self.fixture(folder)
            backup = install(args)
            webapp = args.root / "app" / "webapp.py"
            webapp.write_text("NEWER-UNRELATED-STATE\n", encoding="utf-8")
            args.rollback = backup
            with self.assertRaisesRegex(RuntimeError, "refusing stale rollback"):
                rollback(args)
            self.assertEqual(webapp.read_text(encoding="utf-8"), "NEWER-UNRELATED-STATE\n")

    def test_repeat_install_rollback_restores_immediate_previous_release(self):
        with tempfile.TemporaryDirectory() as folder:
            args = self.fixture(folder)
            install(args)
            destination = args.root / "app" / "analytics_v2.py"
            previous = destination.read_text(encoding="utf-8") + "\n# previous-reviewed-v2\n"
            destination.write_text(previous, encoding="utf-8")
            second_backup = install(args)
            self.assertNotEqual(destination.read_text(encoding="utf-8"), previous)
            args.rollback = second_backup
            rollback(args)
            self.assertEqual(destination.read_text(encoding="utf-8"), previous)
            self.assertTrue(any((args.root / "backups").glob("rollback-safety-analytics-v2-*")))

    def test_first_install_rollback_removes_release_files_and_restores_seams(self):
        with tempfile.TemporaryDirectory() as folder:
            args = self.fixture(folder)
            original_webapp = (args.root / "app" / "webapp.py").read_text(encoding="utf-8")
            backup = install(args)
            args.rollback = backup
            rollback(args)
            self.assertEqual(
                (args.root / "app" / "webapp.py").read_text(encoding="utf-8"),
                original_webapp,
            )
            self.assertFalse((args.root / "app" / "analytics_v2.py").exists())
            self.assertFalse((args.root / "app" / "analytics_contract_v2.json").exists())


if __name__ == "__main__":
    unittest.main()
