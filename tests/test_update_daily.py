import unittest
import json
from datetime import datetime, time
from pathlib import Path
from tempfile import TemporaryDirectory
from zoneinfo import ZoneInfo

from scripts.update_daily import (
    awaiting_session_publication,
    latest_completed_market_day_at,
    latest_observed_ohlcv_date,
)


class UpdateDailyTimingTests(unittest.TestCase):
    def setUp(self):
        self.zone = ZoneInfo("Asia/Jakarta")
        self.close_time = time.fromisoformat("16:30")
        self.ready_time = time.fromisoformat("17:00")

    def test_required_market_close_check_waits_for_session_publication(self):
        now = datetime(2026, 6, 15, 16, 30, tzinfo=self.zone)
        self.assertTrue(awaiting_session_publication(now, self.close_time, self.ready_time))

    def test_current_session_is_ready_after_five_pm(self):
        now = datetime(2026, 6, 15, 17, 30, tzinfo=self.zone)
        self.assertFalse(awaiting_session_publication(now, self.close_time, self.ready_time))
        self.assertEqual(
            latest_completed_market_day_at(now, self.close_time).strftime("%Y-%m-%d"),
            "2026-06-15",
        )

    def test_before_market_close_uses_previous_trading_day(self):
        now = datetime(2026, 6, 15, 16, 0, tzinfo=self.zone)
        self.assertEqual(
            latest_completed_market_day_at(now, self.close_time).strftime("%Y-%m-%d"),
            "2026-06-12",
        )

    def test_latest_observed_date_uses_majority_of_real_ohlcv_files(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            for ticker, date in (
                ("BBCA", "2026-06-12"),
                ("BMRI", "2026-06-12"),
                ("AADI", "2026-06-12"),
                ("TEST", "2026-06-15"),
            ):
                (root / f"{ticker}.json").write_text(
                    json.dumps({"rows": [{"date": date, "close": 1}]}),
                    encoding="utf-8",
                )
            self.assertEqual(latest_observed_ohlcv_date(root), "2026-06-12")


if __name__ == "__main__":
    unittest.main()
