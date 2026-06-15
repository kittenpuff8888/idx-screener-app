import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"


class FullRebuildContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (DOCS / "index.html").read_text(encoding="utf-8")
        cls.app = (DOCS / "app.js").read_text(encoding="utf-8")
        cls.css = (DOCS / "styles.css").read_text(encoding="utf-8")

    def test_logo_assets_and_brand_markup_exist(self):
        self.assertIn('src="assets/idx-research-character.png"', self.html)
        for name in (
            "idx-research-character.png",
            "apple-touch-icon.png",
            "favicon-64.png",
            "favicon-32.png",
        ):
            self.assertTrue((DOCS / "assets" / name).is_file(), name)

    def test_primary_navigation_has_exact_required_destinations(self):
        block = self.html.split('<nav class="primary-nav"', 1)[1].split("</nav>", 1)[0]
        views = re.findall(r'data-view="([^"]+)"', block)
        self.assertEqual(
            views,
            ["dashboard", "screener", "watchlist", "ownership", "news", "advanced"],
        )

    def test_ticker_research_is_shared_drawer_with_one_unified_chart(self):
        self.assertIn('id="tickerResearchModal"', self.html)
        self.assertNotIn('data-view-panel="ticker"', self.html)
        self.assertIn('id="researchChartView"', self.html)
        self.assertNotIn('data-chart-mode=', self.html)
        self.assertNotIn('id="tradingViewChartView"', self.html)
        self.assertIn("function openTickerResearch()", self.app)
        self.assertIn("function closeTickerResearch()", self.app)
        self.assertIn(".filter((row) => row.date <= marketDate)", self.app)

    def test_header_controls_and_brand_follow_master_prompt(self):
        self.assertNotIn("Source-limited workstation", self.html)
        self.assertNotRegex(self.html, r'<button class="nav-item[^"]*"[^>]*><span>\d\d</span>')
        self.assertIn('id="themeToggle" class="theme-switch"', self.html)
        self.assertIn('role="switch"', self.html)
        self.assertIn('class="icon-button header-icon-button header-download"', self.html)

    def test_poppins_type_scale_has_a_twelve_pixel_floor(self):
        self.assertIn("family=Poppins", self.html)
        self.assertIn('--font-ui: "Poppins"', self.css)
        self.assertIn("--type-h1: 48px", self.css)
        self.assertIn("--type-h2: 36px", self.css)
        self.assertIn("--type-h3: 30px", self.css)
        self.assertIn("--type-h4: 24px", self.css)
        self.assertIn("--type-body: 16px", self.css)
        self.assertIn("--type-small: 14px", self.css)
        self.assertIn("--type-tiny: 12px", self.css)
        undersized = re.findall(r"font-size:\s*(?:[0-9]|1[01])(?:\.\d+)?px", self.css)
        self.assertEqual(undersized, [])

    def test_all_signal_categories_remain_visible_even_with_zero_rows(self):
        for signal in (
            "EMA Trend",
            "Golden Cross",
            "Structure Break",
            "Price Level Reclaim",
            "Equal-Level Breakout",
            "Near VWAP",
            "Structure Location",
        ):
            self.assertIn(f'label: "{signal}"', self.app)
        self.assertIn("SIGNAL_CATALOG.map", self.app)
        self.assertIn('id="signalCatalog"', self.html)

    def test_index_detail_preserves_fields_and_adds_weight_and_market_cap(self):
        self.assertIn("<th>Weight</th><th>Market Cap</th><th>Close</th>", self.app)
        self.assertIn("item.weight", self.app)
        self.assertIn("marketCapDisplay", self.app)

    def test_screener_has_exact_visible_column_contract(self):
        match = re.search(
            r"const screenerColumns = \[(.*?)\n\];",
            self.app,
            flags=re.DOTALL,
        )
        self.assertIsNotNone(match)
        labels = re.findall(r'\["([^"]*)",\s*"[^"]+"\]', match.group(1))
        self.assertEqual(
            labels,
            [
                "",
                "Ticker",
                "Emiten",
                "IDX Sector",
                "Industry",
                "Price",
                "Price Change %",
                "Beta vs IHSG",
                "RVOL 20D",
                "RVOL 20D Change %",
                "SMC",
                "VWAP Zone",
                "Market Profile Zone",
                "MA Zone",
                "Summary Screener",
            ],
        )

    def test_ksei_contract_is_latest_and_market_date_independent(self):
        manifest = json.loads((DOCS / "data" / "ksei" / "manifest.json").read_text(encoding="utf-8"))
        latest = json.loads((DOCS / "data" / "ksei" / "latest.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["schemaVersion"], 3)
        self.assertEqual(manifest["latestAsOf"], "2026-06-14")
        self.assertEqual(latest["asOf"], "2026-06-14")
        self.assertIn('data-ownership-mode="changes"', self.html)
        self.assertIn('id="kseiChangesTable"', self.html)
        self.assertNotIn("loadDate(marketDate", self.app.split("async function loadKseiLatest()", 1)[1].split("async function loadDate", 1)[0])

    def test_dashboard_and_news_remove_legacy_primary_blocks(self):
        self.assertNotIn("dashboard-market-suite", self.html)
        self.assertNotIn("dashboard-source-model", self.html)
        self.assertNotIn("dashboardResearchRows", self.html)
        self.assertNotIn("publishedNewsFeed", self.html)
        self.assertIn("TradingView News", self.html)

    def test_external_indexes_render_quotes_and_embedded_charts(self):
        self.assertIn("function externalIndexContext(item)", self.app)
        self.assertIn("function mountTradingViewMiniWidgets()", self.app)
        self.assertIn("embed-widget-mini-symbol-overview.js", self.app)
        self.assertIn("external-index-fallback", self.app)
        self.assertNotIn("<b>Live chart</b><small>TradingView display", self.app)


if __name__ == "__main__":
    unittest.main()
