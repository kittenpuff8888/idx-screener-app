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
        dates = [entry["date"] for entry in self.manifest["dates"]]
        self.assertEqual(len(dates), 103)
        self.assertEqual(len(dates), len(set(dates)))
        self.assertIn("2026-01-02", dates)
        self.assertIn("2026-06-10", dates)
        self.assertNotIn("2026-01-01", dates)

    def test_historical_snapshots_are_date_specific(self):
        january = json.loads(
            (DATA / "snapshots" / "2026-01-02.json").read_text(encoding="utf-8")
        )
        june = json.loads(
            (DATA / "snapshots" / "2026-06-08.json").read_text(encoding="utf-8")
        )
        self.assertEqual(january["stocks"]["BBCA"]["lastPrice"], 8025.0)
        self.assertEqual(june["stocks"]["BBCA"]["lastPrice"], 4850.0)
        self.assertNotEqual(
            january["stocks"]["BBCA"]["changePercent"],
            june["stocks"]["BBCA"]["changePercent"],
        )

    def test_shared_history_is_capped_by_frontend_market_date(self):
        app = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn(".filter((row) => row.date <= marketDate)", app)
        self.assertIn("`${marketDate}:${ticker}`", app)

    def test_global_indicator_profile_is_not_ticker_or_date_scoped(self):
        app = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn('const INDICATOR_SETTINGS_KEY = "idx-research-indicators-v1"', app)
        self.assertNotIn("`${marketDate}:${ticker}:indicators`", app)


if __name__ == "__main__":
    unittest.main()
