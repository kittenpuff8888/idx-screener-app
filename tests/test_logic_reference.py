import json
import re
import unittest
from pathlib import Path

from rebuild_backend.logic_reference import (
    LOGIC_REFERENCE,
    REQUIRED_FIELDS,
    validate_registry,
)
from scripts.archive_v5 import FRIENDLY_SIGNALS


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_NAMES = {
    "Market Date", "Last Successful Dataset Load", "Total Scanned Tickers",
    "OK Tickers", "Partial Data Tickers", "No Data Tickers", "Signal Rows",
    "Unique Signal Tickers", "EMA Trend", "Golden Cross", "Structure Break",
    "Price Level Reclaim", "Equal-Level Breakout", "Near VWAP",
    "Structure Location", "BOS", "CHoCH", "Order Block", "Premium Zone",
    "Equilibrium Zone", "Discount Zone", "Strong High", "Weak High",
    "Strong Low", "Weak Low", "FVG", "IBH", "IBL",
    "Current Quarter VWAP", "Previous Quarter VWAP", "Previous Year VWAP",
    "TradingView Default VWAP", "EMA", "SMA", "MA200", "RSI", "MACD",
    "MACD 4C Smooth", "RVOL", "Volume MA", "ADR %", "RS Rating",
    "Price Change %", "Liquidity Category", "Market Cap",
    "Value Approximation", "Entry POI", "Entry", "Target POI", "Target",
    "Target Upside %", "Invalidation POI", "Invalidation", "R/R", "Beta Zone",
    "Sentiment News", "Corporate Action", "Current PE Ratio Annualised",
    "Current PE Ratio TTM", "Earnings Yield TTM", "Price to Sales TTM",
    "Price to Book Value", "EV to EBIT TTM", "EV to EBITDA TTM",
    "Enterprise Value", "Shares Outstanding", "Gross Profit Margin",
    "Operating Profit Margin", "Net Profit Margin", "ROA", "ROE", "ROCE",
    "ROIC", "DSO", "Asset Turnover", "Days Inventory", "Days Payables",
    "Cash Conversion Cycle", "Receivables Turnover", "Current Ratio",
    "Quick Ratio", "Debt to Equity", "LT Debt to Equity",
    "Total Liabilities to Equity", "Financial Leverage", "Interest Coverage",
    "Free Cash Flow", "Altman Z-Score Original", "Altman Z-Score Modified",
    "1M Return", "3M Return", "6M Return", "1Y Return", "3Y Return",
    "YTD Return", "52 Week High", "52 Week Low", "Book Value",
    "Book Value Per Share", "Tangible Book Value",
    "Tangible Book Value Per Share", "Short-term Debt", "Long-term Debt",
    "Cash", "Total Assets", "Total Liabilities", "EPS TTM",
    "EPS Quarter YoY Growth", "Revenue TTM", "Revenue Quarter YoY Growth",
    "Net Income TTM", "EBIT TTM", "CFO TTM", "CFI TTM", "CFF TTM",
    "Capex TTM", "FCF TTM", "Current PBV", "Mean PBV 3Y", "PBV +2 SD",
    "PBV +1 SD", "PBV -1 SD", "PBV -2 SD", "PBV Z-Score",
    "PBV Percentile", "PBV Regime",
}


class LogicReferenceTests(unittest.TestCase):
    def test_registry_loads_and_has_unique_ids(self):
        self.assertEqual(validate_registry(), [])
        ids = [item["id"] for item in LOGIC_REFERENCE]
        self.assertEqual(len(ids), len(set(ids)))

    def test_required_fields_exist(self):
        for item in LOGIC_REFERENCE:
            self.assertTrue(REQUIRED_FIELDS.issubset(item), item["id"])

    def test_all_required_concepts_exist(self):
        names = {item["displayName"] for item in LOGIC_REFERENCE}
        self.assertFalse(REQUIRED_NAMES - names)

    def test_every_signal_group_is_documented(self):
        names = {item["displayName"] for item in LOGIC_REFERENCE}
        self.assertTrue(set(FRIENDLY_SIGNALS.values()).issubset(names))

    def test_website_json_matches_registry(self):
        payload = json.loads((ROOT / "docs" / "data" / "logic-reference.json").read_text(encoding="utf-8"))
        self.assertEqual(payload["recordCount"], len(LOGIC_REFERENCE))
        self.assertEqual({item["id"] for item in payload["records"]}, {item["id"] for item in LOGIC_REFERENCE})

    def test_tooltip_ids_resolve(self):
        app = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        ids = {item["id"] for item in LOGIC_REFERENCE}
        referenced = set(re.findall(r'guideLink\("([^"]+)"|shortTooltip\("([^"]+)"', app))
        flattened = {left or right for left, right in referenced}
        self.assertTrue(flattened.issubset(ids))

    def test_formula_versions_are_documented(self):
        versions = {item["formulaVersion"] for item in LOGIC_REFERENCE}
        for expected in ("source-limited-v3", "archive-schema-v5", "chart-v4", "pine-tv-vwap-v1", "pine-rsi-v1", "pine-macd-4c-v1", "pine-smc-ohlcv-v1"):
            self.assertIn(expected, versions)


if __name__ == "__main__":
    unittest.main()
