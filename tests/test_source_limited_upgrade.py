import json
import math
import unittest
from datetime import datetime, time
from pathlib import Path
from tempfile import TemporaryDirectory
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from rebuild_backend.calculations import fundamental, technical
from rebuild_backend.providers.base import ProviderStatus
from rebuild_backend.providers.investing_provider import InvestingComProvider
from rebuild_backend.providers.tradingview_chart import TradingViewChartProvider
from rebuild_backend.schema import missing
from scripts.archive_v5 import FRIENDLY_SIGNALS, clean_levels, normalize_stocks, normalized_signal
from scripts.update_daily import latest_completed_market_day_at


ROOT = Path(__file__).resolve().parents[1]
WIB = ZoneInfo("Asia/Jakarta")
NEXT_STACK = (ROOT / "next.config.ts").exists()
skip_legacy_ui = unittest.skipIf(
    NEXT_STACK,
    "Legacy single-page UI contract is superseded by the v13 Next.js contract.",
)


class TechnicalFormulaTests(unittest.TestCase):
    def setUp(self):
        self.close = pd.Series(np.linspace(100, 150, 80))

    def test_sma_and_ema(self):
        pd.testing.assert_series_equal(
            technical.sma(self.close, 20),
            self.close.rolling(20, min_periods=20).mean(),
        )
        pd.testing.assert_series_equal(
            technical.ema(self.close, 20),
            self.close.ewm(span=20, adjust=False, min_periods=1).mean(),
        )

    def test_rsi_uses_wilder_smoothing_and_stays_bounded(self):
        values = technical.rsi(self.close, 14).dropna()
        self.assertTrue(len(values) > 0)
        self.assertTrue(((values >= 0) & (values <= 100)).all())

    def test_macd_identity(self):
        line, signal, histogram = technical.macd(self.close)
        pd.testing.assert_series_equal(histogram, line - signal)

    def test_rvol_and_adr(self):
        volume = pd.Series(np.arange(1, 81, dtype=float) * 1_000)
        result = technical.rvol(volume, 20)
        self.assertTrue(math.isclose(result.iloc[-1], volume.iloc[-1] / volume.tail(20).mean()))
        high = self.close + 2
        low = self.close - 2
        adr = technical.adr(high, low, self.close, 20)
        self.assertGreater(adr.iloc[-1], 0)


class FundamentalFormulaTests(unittest.TestCase):
    def test_core_valuation_formulas(self):
        self.assertEqual(fundamental.market_cap(100, 10), 1000)
        self.assertEqual(fundamental.enterprise_value(1000, 300, 100), 1200)
        self.assertEqual(fundamental.pe_ratio(1000, 100), 10)
        self.assertIsNone(fundamental.pe_ratio(1000, 0))

    def test_returns_and_solvency(self):
        self.assertEqual(fundamental.return_on_equity(100, 500), 0.2)
        self.assertEqual(fundamental.current_ratio(200, 100), 2)
        self.assertEqual(fundamental.free_cash_flow(150, -40), 110)

    def test_altman_missing_behavior(self):
        self.assertIsNone(
            fundamental.altman_z_original(1, None, 1, 1, 1, 1, 1)
        )

    def test_pbv_band_neutral_wording(self):
        result = fundamental.pbv_band(1.2, [0.8, 1.0, 1.2, 1.4])
        self.assertIn(
            result["regime"],
            {
                "Very Low vs 3Y Band",
                "Below 3Y Mean",
                "Near 3Y Mean",
                "Above 3Y Mean",
                "Very High vs 3Y Band",
            },
        )


class ProviderAndSchemaTests(unittest.TestCase):
    def test_tradingview_is_symbol_mapping_only(self):
        self.assertEqual(TradingViewChartProvider.symbol("BBCA"), "IDX:BBCA")
        self.assertEqual(TradingViewChartProvider.symbol("IDX:BBCA"), "IDX:BBCA")

    def test_investing_parser_reports_no_field_without_faking_data(self):
        with TemporaryDirectory() as temp_dir:
            provider = InvestingComProvider(cache_root=temp_dir, retries=1)
            parsed = provider._parse_public_page("<html><title>BBCA</title></html>", "BBCA")
            self.assertEqual(parsed["fields"], {})

    def test_provider_status_contract(self):
        self.assertEqual(ProviderStatus.BLOCKED.value, "BLOCKED")
        self.assertEqual(ProviderStatus.NO_FIELD.value, "NO_FIELD")

    def test_missing_value_contract(self):
        value = missing(
            reason="insufficient_history",
            source="yfinance",
            as_of="2026-06-10",
            formula="SMA(Close, 200)",
        )
        self.assertIsNone(value["value"])
        self.assertEqual(value["status"], "missing")
        self.assertEqual(value["display"], "\u2014")


class ArchiveAndScheduleTests(unittest.TestCase):
    def test_friendly_signal_mapping(self):
        for legacy, label in FRIENDLY_SIGNALS.items():
            row = normalized_signal({"Ticker": "TEST", "Filter": legacy})
            self.assertEqual(row["signalType"], label)
            self.assertNotIn("Filter", row)

    def test_full_workbook_stock_normalization_is_numeric(self):
        stocks = {
            "BBCA": {
                "lastPrice": 6875,
                "volume": "747.37 M",
                "supportLevels": [None, 4820, "5525"],
                "resistanceLevels": [8750, None],
                "fundamentals": {"marketCap": "694,251"},
            }
        }
        prepared = {
            "BBCA": {
                "rows": [{"date": "2026-06-10", "volume": 747_370_000}],
                "index": {"2026-06-10": 0},
                "average_volume": [612_000_000],
            }
        }

        normalized, _ = normalize_stocks(
            stocks,
            "2026-06-10",
            source="workbook",
            prepared=prepared,
        )
        bbca = normalized["BBCA"]

        self.assertEqual(bbca["volume"], 747_370_000)
        self.assertEqual(bbca["averageVolume20"], 612_000_000)
        self.assertEqual(bbca["supportLevels"], [4820.0, 5525.0])
        self.assertEqual(bbca["resistanceLevels"], [8750.0])
        self.assertEqual(bbca["fundamentals"]["marketCap"], 694_251_000_000_000)
        self.assertEqual(bbca["fundamentals"]["marketCapUnit"], "IDR")
        self.assertEqual(bbca["fundamentals"]["marketCapDisplay"], "Rp 694.25 T")

    def test_price_levels_are_deduplicated_in_source_order(self):
        self.assertEqual(
            clean_levels([4820, "5525", 4820.0, None, "5525.00000000", 4850]),
            [4820.0, 5525.0, 4850.0],
        )

    def test_missing_shared_indicators_are_derived_from_prepared_ohlcv(self):
        rows = [
            {
                "date": f"2026-05-{index + 1:02d}",
                "volume": 1_000_000 + index,
            }
            for index in range(26)
        ]
        prepared = {
            "BBCA": {
                "rows": rows,
                "index": {rows[-1]["date"]: 25},
                "average_volume": [None] * 25 + [1_000_012.5],
                "ema25": [None] * 25 + [5020],
                "ema50": [None] * 25 + [4980],
                "sma200": [None] * 26,
                "rsi": [None] * 25 + [54.2],
                "macd": [None] * 25 + [12.4],
                "monthly_vwap": [None] * 25 + [5001.5],
            }
        }
        stocks = {
            "BBCA": {
                "lastPrice": 5050,
                "volume": None,
                "rvol": None,
                "movingAverages": {},
                "technical": {},
            }
        }

        normalized, _ = normalize_stocks(
            stocks,
            rows[-1]["date"],
            source="workbook",
            prepared=prepared,
        )
        bbca = normalized["BBCA"]

        self.assertEqual(bbca["technical"]["macdLine"], 12.4)
        self.assertEqual(bbca["technical"]["vwap"], 5001.5)
        self.assertEqual(bbca["_meta"]["macdLine"]["status"], "ok")
        self.assertEqual(bbca["_meta"]["macdLine"]["source"], "yfinance")
        self.assertEqual(bbca["_meta"]["vwap"]["status"], "ok")

    def test_daily_cutoff_is_1630_wib(self):
        before = datetime(2026, 6, 10, 16, 29, tzinfo=WIB)
        after = datetime(2026, 6, 10, 16, 30, tzinfo=WIB)
        self.assertEqual(
            latest_completed_market_day_at(before, time(16, 30)).date().isoformat(),
            "2026-06-09",
        )
        self.assertEqual(
            latest_completed_market_day_at(after, time(16, 30)).date().isoformat(),
            "2026-06-10",
        )

    def test_rendered_ui_has_no_unsupported_research_claims(self):
        html = (ROOT / "docs" / "index.html").read_text(encoding="utf-8").lower()
        app = (ROOT / "docs" / "app.js").read_text(encoding="utf-8").lower()
        rendered = f"{html}\n{app}"
        for phrase in (
            "broker flow",
            "order flow",
            "foreign flow",
            "smart money",
            "wyckoff",
        ):
            self.assertNotIn(phrase, rendered)

    @skip_legacy_ui
    def test_advanced_is_one_primary_navigation_destination(self):
        html = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
        primary_nav = html.split('<nav class="primary-nav"', 1)[1].split("</nav>", 1)[0]
        self.assertNotIn('data-view="quality"', primary_nav)
        self.assertNotIn('data-view="explorer"', primary_nav)
        self.assertIn('data-view="advanced"', primary_nav)
        self.assertNotIn('data-view-panel="quality"', html)
        self.assertNotIn('data-view-panel="explorer"', html)
        self.assertIn('data-view-panel="advanced"', html)
        self.assertIn('data-advanced-tab="quality"', html)
        self.assertIn('data-advanced-tab="explorer"', html)

    def test_price_direction_colors_are_blue_and_red(self):
        app = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        self.assertIn('upColor: "#3b82f6"', app)
        self.assertIn('downColor: "#ef4444"', app)

    def test_workflow_schedule_and_manual_trigger(self):
        workflow = (
            ROOT / ".github" / "workflows" / "daily-idx-data-update.yml"
        ).read_text(encoding="utf-8")
        self.assertIn('cron: "30 9 * * 1-5"', workflow)
        self.assertIn("workflow_dispatch:", workflow)
        self.assertIn("contents: write", workflow)


if __name__ == "__main__":
    unittest.main()
