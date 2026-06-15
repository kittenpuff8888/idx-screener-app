import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"


class V11FinalGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (DOCS / "index.html").read_text(encoding="utf-8")
        cls.app = (DOCS / "app.js").read_text(encoding="utf-8")
        cls.css = (DOCS / "styles.css").read_text(encoding="utf-8")
        cls.workflow = (
            ROOT / ".github" / "workflows" / "daily-idx-data-update.yml"
        ).read_text(encoding="utf-8")

    def test_horizontal_navigation_and_mobile_scroll_are_explicit(self):
        self.assertIn(".sidebar {\n  position: sticky;", self.css)
        self.assertIn(".primary-nav {\n  display: flex;", self.css)
        self.assertIn("overflow-x: auto;", self.css)
        self.assertIn(".menu-button {\n  display: none !important;", self.css)

    def test_primary_product_surfaces_avoid_technical_data_language(self):
        dashboard = self.html.split('data-view-panel="dashboard"', 1)[1].split(
            'data-view-panel="screener"', 1
        )[0]
        screener = self.html.split('data-view-panel="screener"', 1)[1].split(
            'data-view-panel="watchlist"', 1
        )[0]
        watchlist = self.html.split('data-view-panel="watchlist"', 1)[1].split(
            'data-view-panel="news"', 1
        )[0]
        ticker = self.html.split('id="tickerResearchModal"', 1)[1].split(
            'data-view-panel="ownership"', 1
        )[0]
        ownership = self.html.split('data-view-panel="ownership"', 1)[1].split(
            'data-view-panel="advanced"', 1
        )[0]
        primary = " ".join([dashboard, screener, watchlist, ticker, ownership]).lower()
        for forbidden in ("workbook", "archive", "provider", "provenance", "debug"):
            self.assertNotIn(forbidden, primary)

    def test_screener_has_only_four_visible_filters(self):
        block = self.html.split('data-view-panel="screener"', 1)[1].split(
            'data-view-panel="watchlist"', 1
        )[0]
        for field_id in (
            "screenerSearch",
            "sectorSelect",
            "kongloSelect",
            "liquiditySelect",
        ):
            self.assertIn(f'id="{field_id}"', block)
        self.assertNotIn('id="signalSelect"', block)
        self.assertNotIn('id="signalLenses"', block)

    def test_ticker_drawer_has_conclusion_trade_plan_chart_and_research_sections(self):
        for marker in (
            'id="tickerConclusionTitle"',
            'id="tickerResearchSummary"',
            'id="levelMap"',
            'id="researchChartView"',
            'id="tickerKseiCard"',
            'id="fundamentalGrid"',
            'id="newsPanel"',
        ):
            self.assertIn(marker, self.html)
        for marker in (
            "trade-plan-grid",
            "Entry POI",
            "Target POI",
            "Invalidation POI",
            "Risk / Reward",
        ):
            self.assertIn(marker, self.app)

    def test_fundamentals_use_investor_readable_groups(self):
        for title in (
            "Valuation",
            "Profitability",
            "Growth",
            "Balance Sheet",
            "Dividends",
        ):
            self.assertIn(f'["{title}", [', self.app)
        self.assertIn('class="fundamental-group"', self.app)

    def test_ksei_loading_is_independent_from_market_date(self):
        load_date = self.app.split("async function loadDate", 1)[1].split(
            "function rememberScrollPosition", 1
        )[0]
        self.assertNotIn("loadKseiLatest", load_date)
        self.assertNotIn("renderKseiOwnership", load_date)
        self.assertIn("loadKseiLatest().catch(() => null)", self.app)
        self.assertRegex(
            self.app,
            r"if \(!state\.kseiRendered\) \{\s*renderKseiOwnership\(\);\s*"
            r"state\.kseiRendered = true;",
        )

    def test_daily_workflow_keeps_required_check_and_post_ready_retries(self):
        for cron in (
            '"30 9 * * 1-5"',
            '"30 10 * * 1-5"',
            '"30 11 * * 1-5"',
        ):
            self.assertIn(cron, self.workflow)
        self.assertIn("--session-ready-time 17:00", self.workflow)
        self.assertIn("workflow_dispatch:", self.workflow)
        self.assertIn("Commit failure log", self.workflow)

    def test_no_false_no_signals_copy(self):
        self.assertNotIn("No signals found", self.html)
        self.assertNotIn("No signals found", self.app)
        self.assertIn("No active signals for this market session.", self.app)

    def test_primary_freshness_uses_last_successful_dataset(self):
        self.assertIn(
            "const lastLoad = state.manifest.lastSuccessfulDatasetLoad",
            self.app,
        )
        self.assertNotIn("const lastUpdate = state.updateLog.entries?.at(-1)", self.app)


if __name__ == "__main__":
    unittest.main()
