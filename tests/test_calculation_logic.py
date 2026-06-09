import importlib.util
import math
import unittest
from pathlib import Path

import numpy as np
import pandas as pd


MODULE_PATH = Path(__file__).resolve().parents[1] / "rebuild_backend" / "IDX_Screener.py"
SPEC = importlib.util.spec_from_file_location("idx_screener_rebuild", MODULE_PATH)
SCREENER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SCREENER)


class CalculationLogicTests(unittest.TestCase):
    def setUp(self):
        index = pd.date_range("2026-01-02", periods=40, freq="B")
        close = pd.Series(np.linspace(100, 145, len(index)), index=index)
        self.history = pd.DataFrame({
            "Open": close - 1,
            "High": close + 2,
            "Low": close - 2,
            "Close": close,
            "Volume": np.linspace(1_000_000, 2_000_000, len(index)),
        })

    def test_completed_anchor_delta_uses_same_fixed_bands(self):
        current_close = 151.0
        previous_close = 147.0
        block = SCREENER.anchored_vwap_block(
            self.history,
            selected_close=current_close,
            previous_close=previous_close,
        )
        expected = (current_close - previous_close) / block["sd"]
        self.assertTrue(math.isclose(block["sd_delta"], expected, rel_tol=1e-12))

    def test_vwap_zone_is_never_dash_when_levels_exist(self):
        block = SCREENER.anchored_vwap_block(self.history)
        label = SCREENER.vwap_near_zone_label(
            130.0,
            block["sd_score"],
            block["vwap"],
            block["m1"],
            block["m2"],
            block["m3"],
            block["p1"],
            block["p2"],
            block["p3"],
        )
        self.assertNotEqual(label, "-")
        self.assertTrue(label.startswith(("Near ", "Above ", "Below ", "Between ")))

    def test_ema_uses_adjust_false(self):
        actual = SCREENER.ema(self.history["Close"], 25)
        expected = self.history["Close"].ewm(span=25, adjust=False).mean()
        pd.testing.assert_series_equal(actual, expected)

    def test_wilder_rsi_stays_in_bounds(self):
        values = SCREENER.rsi(self.history["Close"], 14).dropna()
        self.assertTrue(((values >= 0) & (values <= 100)).all())


if __name__ == "__main__":
    unittest.main()
