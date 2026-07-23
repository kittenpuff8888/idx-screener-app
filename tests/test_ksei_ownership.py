import json
import unittest
from pathlib import Path

from scripts.export_ksei_ownership import compare, parse_investors


ROOT = Path(__file__).resolve().parents[1]


class KseiOwnershipTests(unittest.TestCase):
    def test_investor_parser_accepts_optional_percent_sign(self):
        rows = parse_investors(
            "1. HOLDER ONE - Corporate - 51.25%\n"
            "2. HOLDER TWO - Individual - 2.5"
        )
        self.assertEqual([item["percentage"] for item in rows], [51.25, 2.5])
        self.assertEqual([item["rank"] for item in rows], [1, 2])
        self.assertEqual(rows[0]["originalLine"], "1. HOLDER ONE - Corporate - 51.25%")

    def test_comparison_does_not_invent_changes(self):
        record = {
            "ticker": "TEST",
            "investors": [{"name": "Holder", "type": "Corporate", "percentage": 51.0}],
            "freeFloat": 49,
            "hhi": 2601,
            "cr1": 51,
            "cr3": 51,
            "holderCount": 1,
            "ccs": 50,
        }
        previous = {"asOf": "2026-05-14", "records": [record]}
        current = {"asOf": "2026-06-06", "records": [dict(record)]}
        result = compare(previous, current)
        self.assertEqual(result["changedTickers"], [])
        self.assertEqual(result["investorAdditions"], [])

    def test_published_latest_snapshot_is_consistent(self):
        # Deliberately asserts invariants, not literal dates/counts: this test used
        # to pin latestAsOf to a specific day, so every new snapshot broke CI and
        # blocked the commit step that publishes data.
        ksei = ROOT / "docs" / "data" / "ksei"
        manifest = json.loads((ksei / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["latestAsOf"], max(manifest["availableDates"]))
        self.assertIn("2026-05-14", manifest["availableDates"])
        latest = json.loads((ksei / "latest.json").read_text(encoding="utf-8"))
        self.assertEqual(latest["asOf"], manifest["latestAsOf"])
        self.assertGreater(latest["summary"]["totalIssuers"], 900)
        self.assertGreater(len(latest["investorDirectory"]), 5000)
        self.assertEqual(latest["schemaVersion"], 3)
        self.assertIn("changesByTicker", latest)
        self.assertIn("changesByInvestor", latest)
        self.assertIn("schemaWarnings", latest)
        self.assertTrue(
            all(
                "rank" in row and "originalLine" in row
                for row in latest["records"][0]["investors"]
            )
        )

    def test_published_snapshot_has_real_sector_classification(self):
        # Regression guard: the 2026-07-20 import shipped with no "IDX Sector"
        # column, so all 955 issuers collapsed into Others and the dashboard's
        # sector views went blank. Nothing asserted sector health directly, so
        # this only surfaced as an unrelated hardcoded-date assertion failing.
        latest = json.loads(
            (ROOT / "docs" / "data" / "ksei" / "latest.json").read_text(encoding="utf-8")
        )
        sectors = latest["summary"]["sectors"]
        official = {code: n for code, n in sectors.items() if code != "Others"}
        self.assertGreaterEqual(
            len(official), 8, f"expected most IDX sectors represented, got {sorted(official)}"
        )
        total = latest["summary"]["totalIssuers"]
        self.assertLess(
            sectors.get("Others", 0),
            total * 0.25,
            "more than a quarter of issuers are unclassified - sector join likely broke",
        )


if __name__ == "__main__":
    unittest.main()
