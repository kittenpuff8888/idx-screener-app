import unittest
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from zoneinfo import ZoneInfo

from scripts.run_backfill import latest_completed_market_day, manifest_has_date, published_market_dates


WIB = ZoneInfo("Asia/Jakarta")


class CompletedMarketDayTests(unittest.TestCase):
    def test_weekday_before_cutoff_uses_previous_day(self):
        now = datetime(2026, 6, 10, 7, 0, tzinfo=WIB)
        self.assertEqual(latest_completed_market_day(now).strftime("%Y-%m-%d"), "2026-06-09")

    def test_weekday_at_cutoff_uses_current_day(self):
        now = datetime(2026, 6, 10, 17, 0, tzinfo=WIB)
        self.assertEqual(latest_completed_market_day(now).strftime("%Y-%m-%d"), "2026-06-10")

    def test_monday_before_cutoff_uses_friday(self):
        now = datetime(2026, 6, 15, 8, 0, tzinfo=WIB)
        self.assertEqual(latest_completed_market_day(now).strftime("%Y-%m-%d"), "2026-06-12")

    def test_weekend_uses_friday(self):
        now = datetime(2026, 6, 13, 18, 0, tzinfo=WIB)
        self.assertEqual(latest_completed_market_day(now).strftime("%Y-%m-%d"), "2026-06-12")

    def test_manifest_has_date(self):
        with TemporaryDirectory() as temp_dir:
            manifest_path = Path(temp_dir) / "manifest.json"
            manifest_path.write_text(
                '{"latest":"2026-06-10","dates":[{"date":"2026-06-10"}]}',
                encoding="utf-8",
            )
            self.assertTrue(manifest_has_date("2026-06-10", manifest_path))
            self.assertFalse(manifest_has_date("2026-06-09", manifest_path))

    def test_manifest_has_date_supports_schema_v5(self):
        with TemporaryDirectory() as temp_dir:
            manifest_path = Path(temp_dir) / "manifest.json"
            manifest_path.write_text(
                '{"schemaVersion":5,"dates":[{"marketDate":"2026-06-10"}]}',
                encoding="utf-8",
            )
            self.assertTrue(manifest_has_date("2026-06-10", manifest_path))

    def test_manifest_has_date_handles_missing_or_invalid_file(self):
        with TemporaryDirectory() as temp_dir:
            manifest_path = Path(temp_dir) / "manifest.json"
            self.assertFalse(manifest_has_date("2026-06-10", manifest_path))
            manifest_path.write_text("not-json", encoding="utf-8")
            self.assertFalse(manifest_has_date("2026-06-10", manifest_path))

    def test_published_market_dates_are_sorted_and_unique(self):
        with TemporaryDirectory() as temp_dir:
            manifest_path = Path(temp_dir) / "manifest.json"
            manifest_path.write_text(
                '{"dates":[{"date":"2026-06-10"},{"date":"2026-06-09"},{"date":"2026-06-10"}]}',
                encoding="utf-8",
            )
            self.assertEqual(
                published_market_dates(manifest_path),
                ["2026-06-09", "2026-06-10"],
            )

    def test_published_market_dates_support_schema_v5(self):
        with TemporaryDirectory() as temp_dir:
            manifest_path = Path(temp_dir) / "manifest.json"
            manifest_path.write_text(
                '{"schemaVersion":5,"dates":[{"marketDate":"2026-06-10"},{"marketDate":"2026-06-09"}]}',
                encoding="utf-8",
            )
            self.assertEqual(
                published_market_dates(manifest_path),
                ["2026-06-09", "2026-06-10"],
            )


if __name__ == "__main__":
    unittest.main()
