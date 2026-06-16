from pathlib import Path
import json
import unittest


ROOT = Path(__file__).resolve().parents[1]


class V13NextContractTests(unittest.TestCase):
    def test_next_stack_files_exist(self):
        required = [
            "package.json",
            "next.config.ts",
            "tailwind.config.ts",
            "app/layout.tsx",
            "app/dashboard/page.tsx",
            "app/explorer/page.tsx",
            "app/watchlist/page.tsx",
            "app/ksei/page.tsx",
            "app/news/page.tsx",
            "app/advanced/page.tsx",
            "components/layout/Sidebar.tsx",
            "components/ticker/TickerDrawer.tsx",
            "lib/data/metadata.ts",
            "lib/data/screener.ts",
            "lib/data/ksei.ts",
            "lib/data/indexes.ts",
        ]
        missing = [path for path in required if not (ROOT / path).exists()]
        self.assertEqual(missing, [])

    def test_package_uses_required_frontend_stack(self):
        package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
        deps = {**package.get("dependencies", {}), **package.get("devDependencies", {})}
        self.assertIn("next", deps)
        self.assertIn("typescript", deps)
        self.assertIn("tailwindcss", deps)
        self.assertIn("react", deps)

    def test_next_config_static_export_for_github_pages(self):
        config = (ROOT / "next.config.ts").read_text(encoding="utf-8")
        self.assertIn('output: "export"', config)
        self.assertIn('basePath: isProd ? "/IDXScreener" : ""', config)
        self.assertIn('assetPrefix: isProd ? "/IDXScreener/" : ""', config)

    def test_v13_primary_shell_uses_left_sidebar(self):
        sidebar = (ROOT / "components/layout/Sidebar.tsx").read_text(encoding="utf-8")
        self.assertIn("Research Dashboard", sidebar)
        self.assertIn("Research Explorer", sidebar)
        self.assertIn("KSEI Ownership", sidebar)
        self.assertIn("hidden min-h-screen w-72", sidebar)
        self.assertNotIn("data-view", sidebar)

    def test_data_coverage_is_capped_from_2026_for_next_ui(self):
        metadata = (ROOT / "lib/data/metadata.ts").read_text(encoding="utf-8")
        sectors = (ROOT / "lib/domain/sectors.ts").read_text(encoding="utf-8")
        self.assertIn('DATA_COVERAGE_START = "2026-01-01"', sectors)
        self.assertIn("date >= DATA_COVERAGE_START", metadata)

    def test_advanced_is_only_next_primary_place_for_forbidden_terms(self):
        primary_files = [
            "components/dashboard/DashboardPage.tsx",
            "components/explorer/ExplorerPage.tsx",
            "components/watchlist/WatchlistPage.tsx",
            "components/ksei/KseiPage.tsx",
            "components/news/NewsPage.tsx",
            "components/ticker/TickerDrawer.tsx",
        ]
        forbidden = ["Workbook Explorer", "source status", "Source-Limited", "QA SUMMARY"]
        combined = "\n".join((ROOT / path).read_text(encoding="utf-8") for path in primary_files)
        for term in forbidden:
            self.assertNotIn(term, combined)


if __name__ == "__main__":
    unittest.main()
