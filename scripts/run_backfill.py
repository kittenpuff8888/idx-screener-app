from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo


ROOT = Path(__file__).resolve().parents[1]
BACKEND_SCRIPT = ROOT / "rebuild_backend" / "IDX_Screener.py"


def parse_date(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d")


def market_weekdays(end_date: datetime, days: int) -> list[str]:
    dates: list[str] = []
    cursor = end_date
    while len(dates) < days:
        if cursor.weekday() < 5:
            dates.append(cursor.strftime("%Y-%m-%d"))
        cursor -= timedelta(days=1)
    return list(reversed(dates))


def latest_completed_market_day(now_wib: datetime) -> datetime:
    """
    IDX daily data is publishable only after 17:00 WIB.

    GitHub scheduled jobs can start many hours late. Before the cutoff, use
    the previous trading day so an overnight-delayed job cannot publish the
    current calendar date before that market session is complete.
    """
    cursor = now_wib
    if cursor.hour < 17:
        cursor -= timedelta(days=1)
    while cursor.weekday() >= 5:
        cursor -= timedelta(days=1)
    return cursor


def manifest_has_date(market_date: str, manifest_path: Path | None = None) -> bool:
    path = manifest_path or ROOT / "docs" / "data" / "manifest.json"
    if not path.exists():
        return False

    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False

    return any(item.get("date") == market_date for item in manifest.get("dates", []))


def published_market_dates(manifest_path: Path | None = None) -> list[str]:
    path = manifest_path or ROOT / "docs" / "data" / "manifest.json"
    if not path.exists():
        return []
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    dates = {
        str(item.get("date") or "")
        for item in manifest.get("dates", [])
        if item.get("date")
    }
    return sorted(dates)


def sync_local_source_once() -> None:
    if os.environ.get("GITHUB_ACTIONS") or os.environ.get("SKIP_LOCAL_SYNC") == "1":
        return
    sync_script = ROOT / "scripts" / "sync_local_source.py"
    try:
        subprocess.run([sys.executable, str(sync_script)], cwd=ROOT, check=True)
    except Exception as exc:
        print(f"[WARN] Local VWAP source sync skipped: {exc}")


def run_for_date(market_date: str) -> None:
    env = os.environ.copy()
    env["MARKET_DATE"] = market_date
    print(f"\n=== Running IDX screener for {market_date} ===")
    subprocess.run([sys.executable, str(BACKEND_SCRIPT)], cwd=ROOT, env=env, check=True)
    subprocess.run([sys.executable, str(ROOT / "scripts" / "export_latest.py")], cwd=ROOT, check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="Run one date, format YYYY-MM-DD")
    parser.add_argument("--end-date", help="Last date for backfill, default today in WIB")
    parser.add_argument("--days", type=int, default=1, help="Number of market weekdays to run")
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip dates already listed in the published site manifest",
    )
    parser.add_argument(
        "--rebuild-published",
        action="store_true",
        help="Rerun every market date already listed in the site manifest",
    )
    args = parser.parse_args()

    if args.days < 1:
        raise ValueError("--days must be at least 1")

    sync_local_source_once()

    if args.rebuild_published:
        dates = published_market_dates()
        if not dates:
            raise ValueError("No published market dates are available to rebuild")
    elif args.date:
        dates = [parse_date(args.date).strftime("%Y-%m-%d")]
    else:
        end_date = (
            parse_date(args.end_date)
            if args.end_date
            else latest_completed_market_day(datetime.now(ZoneInfo("Asia/Jakarta")))
        )
        dates = market_weekdays(end_date, args.days)

    if args.skip_existing:
        dates = [market_date for market_date in dates if not manifest_has_date(market_date)]
        if not dates:
            print("All requested market dates are already published; nothing to run.")

    for market_date in dates:
        run_for_date(market_date)


if __name__ == "__main__":
    main()
