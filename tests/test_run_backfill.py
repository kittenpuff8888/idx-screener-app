import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from scripts.run_backfill import latest_completed_market_day


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


if __name__ == "__main__":
    unittest.main()
