import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
NEXT_STACK = (ROOT / "next.config.ts").exists()
skip_legacy_ui = unittest.skipIf(
    NEXT_STACK,
    "Legacy single-page UI contract is superseded by the v13 Next.js contract.",
)


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
            self.assertEqual(
                {item["label"] for item in context},
                {"IHSG", "VIX", "EIDO", "USDIDR", "BTC", "SPX", "KOSPI"},
            )
            self.assertTrue(all(item["asOf"] <= market_date for item in context))
            self.assertTrue(all(len(item["series"]) <= 20 for item in context))
            self.assertTrue(all(item["series"][-1] == item["value"] for item in context if item["series"]))

    def test_latest_root_pointer_is_not_published(self):
        self.assertFalse((DATA / "latest.json").exists())

    def test_latest_workbook_indicators_and_levels_are_normalized(self):
        technical = json.loads(
            (DATA / "dates" / "2026-06-12" / "technical.json").read_text(encoding="utf-8")
        )
        bbca = technical["records"]["BBCA"]
        self.assertIsInstance(bbca["technical"]["macdLine"], (int, float))
        self.assertIsInstance(bbca["technical"]["vwap"], (int, float))
        self.assertEqual(bbca["_meta"]["macdLine"]["status"], "ok")
        self.assertEqual(bbca["_meta"]["vwap"]["status"], "ok")
        self.assertEqual(len(bbca["supportLevels"]), len(set(bbca["supportLevels"])))
        self.assertEqual(len(bbca["resistanceLevels"]), len(set(bbca["resistanceLevels"])))

    @skip_legacy_ui
    def test_steps_21_to_30_product_surface(self):
        html = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        css = (ROOT / "docs" / "styles.css").read_text(encoding="utf-8")
        disclaimer = "Research only. Not financial advice. Verify important information independently."
        self.assertEqual(html.count(disclaimer), 1)
        self.assertIn('id="datasetLine"', html)
        self.assertNotIn('id="datasetTitle"', html)
        self.assertNotIn('id="datasetFacts"', html)
        self.assertIn("<h2>Research Screener</h2>", html)
        self.assertIn('id="footerFreshness"', html)
        self.assertIn("function sparklineSvg(item)", app)
        self.assertIn("--accent:", css)
        self.assertIn(".market-context-sparkline", css)

    @skip_legacy_ui
    def test_follow_up_dashboard_and_research_workflow_exist(self):
        html = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "docs" / "app.js").read_text(encoding="utf-8")
        primary_nav = html.split('<nav class="primary-nav"', 1)[1].split("</nav>", 1)[0]
        self.assertEqual(primary_nav.count('class="nav-item'), 6)
        for view in ("dashboard", "screener", "news", "watchlist", "ownership", "advanced"):
            self.assertIn(f'data-view="{view}"', primary_nav)
        self.assertNotIn('data-view="market"', primary_nav)
        self.assertNotIn('data-view="ticker"', primary_nav)
        self.assertNotIn('data-view="guide"', primary_nav)
        self.assertNotIn('class="advanced-nav"', html)
        self.assertIn('data-view-panel="advanced"', html)
        self.assertIn('data-advanced-pane="quality"', html)
        self.assertIn('data-advanced-pane="explorer"', html)
        self.assertIn('data-advanced-pane="guide"', html)
        self.assertIn('data-view-panel="dashboard"', html)
        self.assertNotIn("Archived · Not real-time", html)
        self.assertNotIn('id="dashboardResearchRows"', html)
        self.assertNotIn('class="dashboard-market-suite"', html)
        self.assertNotIn('class="dashboard-source-model"', html)
        self.assertIn('id="indexSections"', html)
        self.assertNotIn('id="publishedNewsFeed"', html)
        self.assertIn('id="mobileTickerCommand"', html)
        self.assertIn('id="tickerResearchModal"', html)
        self.assertNotIn('data-view-panel="ticker"', html)
        self.assertIn('id="tickerKseiCard"', html)
        self.assertIn('id="tickerInvestors"', html)
        self.assertIn("function renderDashboard()", app)
        self.assertIn("function renderTickerKsei(ticker)", app)
        self.assertIn("function closeTickerResearch()", app)
        self.assertNotIn('["Legacy Code Audit", "legacy"]', app)

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
