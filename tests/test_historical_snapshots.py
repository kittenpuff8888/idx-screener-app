import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"


class HistoricalSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((DATA / "manifest.json").read_text(encoding="utf-8"))

    def test_market_date_window_contains_real_sessions(self):
        dates = [entry["marketDate"] for entry in self.manifest["dates"]]
        self.assertEqual(self.manifest["schemaVersion"], 5)
        self.assertEqual(len(dates), 341)
        self.assertEqual(len(dates), len(set(dates)))
        self.assertIn("2025-01-02", dates)
        self.assertIn("2026-01-02", dates)
        self.assertIn("2026-06-10", dates)
        self.assertIn("2026-06-11", dates)
        self.assertIn("2026-06-12", dates)
        self.assertNotIn("2026-01-01", dates)

    def test_historical_snapshots_are_date_specific(self):
        january = json.loads(
            (DATA / "dates" / "2025-01-02" / "technical.json").read_text(encoding="utf-8")
        )
        june = json.loads(
            (DATA / "dates" / "2026-06-08" / "technical.json").read_text(encoding="utf-8")
        )
        self.assertEqual(january["records"]["BBCA"]["lastPrice"], 9900.0)
        self.assertEqual(june["records"]["BBCA"]["lastPrice"], 4850.0)
        self.assertNotEqual(
            january["records"]["BBCA"]["changePercent"],
            june["records"]["BBCA"]["changePercent"],
        )

    def test_full_workbook_dates_do_not_reuse_ticker_values(self):
        dates = ("2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12")
        for ticker in ("BBCA", "AADI"):
            observed = []
            for market_date in dates:
                payload = json.loads(
                    (DATA / "dates" / market_date / "technical.json").read_text(encoding="utf-8")
                )
                record = payload["records"][ticker]
                self.assertIsInstance(record["volume"], (int, float))
                self.assertIsInstance(record["averageVolume20"], (int, float))
                observed.append(
                    (
                        record["lastPrice"],
                        record["changePercent"],
                        record["volume"],
                        record["technical"]["rsi14"],
                    )
                )
            self.assertEqual(len(set(observed)), len(dates))

    def test_signal_files_match_manifest_counts(self):
        for entry in self.manifest["dates"]:
            if not entry["signalRows"]:
                continue
            screener = json.loads(
                (DATA / "dates" / entry["marketDate"] / "screener.json").read_text(encoding="utf-8")
            )
            self.assertEqual(len(screener["records"]), entry["signalRows"])
            self.assertNotEqual(screener["records"], [])

    def test_market_context_never_uses_a_future_value(self):
        for market_date in ("2025-01-02", "2026-06-09", "2026-06-12"):
            overview = json.loads(
                (DATA / "dates" / market_date / "overview.json").read_text(encoding="utf-8")
            )
            context = overview["overview"]["marketContext"]
            self.assertEqual({item["label"] for item in context}, {"IHSG", "VIX", "EIDO", "KOSPI"})
            self.assertTrue(all(item["asOf"] <= market_date for item in context))

    def test_reference_domains_are_explicit(self):
        fundamental = json.loads(
            (DATA / "dates" / "2025-01-02" / "fundamental.json").read_text(encoding="utf-8")
        )
        self.assertEqual(fundamental["dataMode"], "latest_reference_not_point_in_time")
        self.assertIsNotNone(fundamental["referenceMarketDate"])
        self.assertLessEqual(
            fundamental["referenceMarketDate"],
            self.manifest["latestMarketDate"],
        )

    def test_shared_history_is_capped_by_frontend_market_date(self):
        app = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn(".filter((row) => row.date <= marketDate)", app)
        self.assertIn("`${marketDate}:${ticker}`", app)

    def test_global_indicator_profile_is_not_ticker_or_date_scoped(self):
        app = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn('const INDICATOR_SETTINGS_KEY = "idx-research-indicators-v1"', app)
        self.assertNotIn("`${marketDate}:${ticker}:indicators`", app)

    def test_research_drawings_are_scoped_per_ticker(self):
        app = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn('const DRAWINGS_KEY_PREFIX = "idx-research-drawings:"', app)
        self.assertIn("`${DRAWINGS_KEY_PREFIX}${ticker}`", app)


if __name__ == "__main__":
    unittest.main()
