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

    def test_published_latest_snapshot_is_june_14(self):
        manifest = json.loads(
            (ROOT / "docs" / "data" / "ksei" / "manifest.json").read_text(encoding="utf-8")
        )
        self.assertEqual(manifest["latestAsOf"], "2026-06-14")
        self.assertIn("2026-05-14", manifest["availableDates"])
        latest = json.loads(
            (ROOT / "docs" / "data" / "ksei" / "latest.json").read_text(encoding="utf-8")
        )
        self.assertEqual(latest["summary"]["totalIssuers"], 956)
        self.assertEqual(latest["summary"]["sectors"]["Others"], 44)
        self.assertEqual(len(latest["investorChanges"]), 8)
        self.assertGreater(len(latest["investorDirectory"]), 5000)


if __name__ == "__main__":
    unittest.main()
