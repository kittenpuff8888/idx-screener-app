import json
import unittest
from pathlib import Path

from scripts.export_ksei_ownership import compare


ROOT = Path(__file__).resolve().parents[1]


class KseiOwnershipTests(unittest.TestCase):
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
        # Older dated archives (from the retired multi-file source) stay valid
        # published history even after the single-workbook rebuild -- they're
        # what gives docs/data/ksei/trend.json more than one point.
        self.assertIn("2026-05-14", manifest["availableDates"])
        latest = json.loads((ksei / "latest.json").read_text(encoding="utf-8"))
        self.assertEqual(latest["asOf"], manifest["latestAsOf"])
        self.assertGreater(latest["summary"]["totalIssuers"], 900)
        self.assertGreater(len(latest["investorDirectory"]), 5000)
        self.assertEqual(latest["schemaVersion"], 4)
        self.assertIn("schemaWarnings", latest)
        issuers_with_investors = [r for r in latest["records"] if r["investors"]]
        self.assertGreater(len(issuers_with_investors), 900)
        self.assertTrue(
            all(
                "rank" in row and "originalLine" in row
                for row in issuers_with_investors[0]["investors"]
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

    def test_ticker_list_and_konglo_groups_regenerated(self):
        # Guards the single-workbook rebuild: idx-listed.json (every yfinance
        # fetch's universe) and index-definitions.json's Konglo groups both
        # come from data_sources/ksei-data-source.xlsx now, not hand-maintained
        # JSON -- a broken join here would silently shrink the scanned universe
        # or empty out every Konglo group.
        listed = json.loads((ROOT / "data_sources" / "idx-listed.json").read_text(encoding="utf-8"))
        self.assertGreater(listed["count"], 900)
        self.assertEqual(len(listed["records"]), listed["count"])
        self.assertTrue(all(r["ticker"] for r in listed["records"]))

        definitions = json.loads((ROOT / "data_sources" / "index-definitions.json").read_text(encoding="utf-8"))
        konglo = definitions.get("konglo") or {}
        self.assertGreater(len(konglo), 20)
        self.assertTrue(all(row.get("ticker") for group in konglo.values() for row in group))

        latest = json.loads((ROOT / "docs" / "data" / "ksei" / "latest.json").read_text(encoding="utf-8"))
        weighted = sum(1 for r in latest["records"] if r.get("idxSectorWeight") is not None)
        self.assertGreater(
            weighted, latest["summary"]["totalIssuers"] * 0.5,
            "most issuers should carry a real published sector-index weight now",
        )


if __name__ == "__main__":
    unittest.main()
