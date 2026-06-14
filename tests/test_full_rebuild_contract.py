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
            ["dashboard", "screener", "news", "watchlist", "ownership", "advanced"],
        )

    def test_ticker_research_is_shared_drawer_with_two_chart_modes(self):
        self.assertIn('id="tickerResearchModal"', self.html)
        self.assertNotIn('data-view-panel="ticker"', self.html)
        self.assertIn('data-chart-mode="research"', self.html)
        self.assertIn('data-chart-mode="tradingview"', self.html)
        self.assertIn("function openTickerResearch()", self.app)
        self.assertIn("function closeTickerResearch()", self.app)
        self.assertIn(".filter((row) => row.date <= marketDate)", self.app)

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


if __name__ == "__main__":
    unittest.main()
