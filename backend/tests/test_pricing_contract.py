from __future__ import annotations

import json
import re
import unittest
from pathlib import Path

from app import config, webapp


class PricingContractTests(unittest.IsolatedAsyncioTestCase):
    EXPECTED_SUPPORT = {
        "diplom": 40_000,
        "master": 60_000,
        "chapter": 30_000,
        "kandidat": 200_000,
        "course": 14_000,
        "course_emp": 20_000,
        "practice": 14_000,
        "vak": 18_000,
        "scopus": 35_000,
        "rinc": 9_000,
        "self": 2_500,
    }

    def test_versioned_catalog_preserves_production_support_prices(self) -> None:
        self.assertEqual(config.PRICING_SCHEMA_VERSION, "pricing.v1")
        actual = {work.id: work.prices["support"] for work in config.WORK_TYPES}
        self.assertEqual(actual, self.EXPECTED_SUPPORT)
        for work in config.WORK_TYPES:
            self.assertEqual(
                set(work.prices), {"diagnostic", "editing", "support"}
            )

    def test_tier_selects_an_explicit_result_instead_of_multiplying_a_label(self) -> None:
        self.assertEqual(config.quote("diplom", "hum", "free", "base"), (3_000, 4_000))
        self.assertEqual(config.quote("diplom", "hum", "free", "turn"), (24_000, 33_500))
        self.assertEqual(config.quote("diplom", "hum", "free", "vip"), (40_000, 56_000))
        self.assertEqual(
            config.quote("course_emp", "hum", "free", "vip"), (20_000, 28_000)
        )

    async def test_public_api_returns_the_exact_canonical_catalog(self) -> None:
        response = await webapp.pricing_catalog(None)
        payload = json.loads(response.body)
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["catalog"], config.PRICING_CATALOG)
        self.assertEqual(response.headers["Cache-Control"], "no-store")
        self.assertNotEqual(response.headers["Access-Control-Allow-Origin"], "*")

    def test_frontend_mirror_matches_the_versioned_catalog(self) -> None:
        """CI guard до перевода фронтенда на загрузку API-каталога."""
        app_js = (
            Path(__file__).resolve().parents[2] / "assets" / "js" / "app.js"
        ).read_text(encoding="utf-8")
        type_pattern = re.compile(
            r"\{\s*id:\s*'(?P<id>[a-z_]+)'.*?"
            r"label:\s*'(?P<label>[^']+)'.*?"
            r"prices:\s*\{\s*diagnostic:\s*(?P<diagnostic>\d+),\s*"
            r"editing:\s*(?P<editing>\d+),\s*"
            r"support:\s*(?P<support>\d+)\s*\}\s*\}",
            re.DOTALL,
        )
        frontend_prices = {
            match.group("id"): {
                "label": match.group("label"),
                "prices": {
                    "diagnostic": int(match.group("diagnostic")),
                    "editing": int(match.group("editing")),
                    "support": int(match.group("support")),
                },
            }
            for match in type_pattern.finditer(app_js)
        }
        catalog_prices = {
            item["id"]: {"label": item["label"], "prices": item["prices"]}
            for item in config.PRICING_CATALOG["types"]
        }
        self.assertEqual(frontend_prices, catalog_prices)

        tier_pattern = re.compile(
            r"\{\s*id:\s*'(?P<id>base|turn|vip)'.*?"
            r"priceKey:\s*'(?P<result>diagnostic|editing|support)'",
            re.DOTALL,
        )
        frontend_tiers = {
            match.group("id"): match.group("result")
            for match in tier_pattern.finditer(app_js)
        }
        catalog_tiers = {
            tier_id: tier["result"]
            for tier_id, tier in config.PRICING_CATALOG["tiers"].items()
        }
        self.assertEqual(frontend_tiers, catalog_tiers)


if __name__ == "__main__":
    unittest.main()
