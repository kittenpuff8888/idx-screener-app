import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SESSION = ROOT / "docs" / "data" / "dates" / "2026-06-12"


class V11CalculationRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        technical = json.loads((SESSION / "technical.json").read_text(encoding="utf-8"))
        cls.technical = technical["records"]
        if isinstance(cls.technical, list):
            cls.technical = {row["ticker"]: row for row in cls.technical}
        screener = json.loads((SESSION / "screener.json").read_text(encoding="utf-8"))
        cls.screener = screener["records"]

    def test_reference_ticker_calculations_are_unchanged(self):
        expected = {
            "BBCA": (5925, 0.01716738197424893, 1.158153174887111, 4, 5778, 7665, 4960),
            "AADI": (8650, 0.07453416149068323, 1.235642086752161, 6, 8546, 8996, 8409),
            "MPRO": (7000, -0.09967845659163987, 0.5538461538461539, 8, None, None, None),
            "ICON": (102, 0.009900990099009901, 0.1981598504255697, 9, None, None, None),
            "TKIM": (5650, 0.008928571428571428, 0.2711709704415518, 4, None, None, None),
        }
        for ticker, values in expected.items():
            row = self.technical[ticker]
            actual = (
                row["lastPrice"],
                row["changePercent"],
                row["rvol"],
                row["rsRating"],
                row["entry"],
                row["target"],
                row["invalidation"],
            )
            self.assertEqual(actual, values, ticker)

    def test_reference_session_signal_rows_are_unchanged(self):
        self.assertEqual(len(self.screener), 49)
        signals = {
            (row.get("Ticker"), row.get("signalType"))
            for row in self.screener
        }
        self.assertIn(("BBCA", "Golden Cross"), signals)
        self.assertIn(("AADI", "Golden Cross"), signals)


if __name__ == "__main__":
    unittest.main()
