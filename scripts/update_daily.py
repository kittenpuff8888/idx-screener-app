from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.archive_v5 import build_archive
from scripts.run_backfill import manifest_has_date


MANIFEST = ROOT / "docs" / "data" / "manifest.json"
UPDATE_LOG = ROOT / "docs" / "data" / "update-log.json"


def append_log(status: str, market_date: str, message: str) -> None:
    payload = {"entries": []}
    if UPDATE_LOG.exists():
        try:
            payload = json.loads(UPDATE_LOG.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            payload = {"entries": []}
    payload.setdefault("entries", []).append(
        {
            "timestamp": datetime.now(ZoneInfo("Asia/Jakarta")).isoformat(),
            "marketDate": market_date,
            "status": status,
            "message": message,
        }
    )
    payload["entries"] = payload["entries"][-100:]
    UPDATE_LOG.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def latest_completed_market_day_at(now: datetime, close_time: time) -> datetime:
    cursor = now
    if now.timetz().replace(tzinfo=None) < close_time:
        cursor -= timedelta(days=1)
    while cursor.weekday() >= 5:
        cursor -= timedelta(days=1)
    return cursor


def main() -> None:
    parser = argparse.ArgumentParser(description="Update the latest completed IDX dataset.")
    parser.add_argument("--timezone", default="Asia/Jakarta")
    parser.add_argument("--market-close-time", default="16:30")
    parser.add_argument("--market-date")
    parser.add_argument("--skip-backend", action="store_true")
    args = parser.parse_args()

    zone = ZoneInfo(args.timezone)
    close_time = time.fromisoformat(args.market_close_time)
    now = datetime.now(zone)
    if args.market_date:
        market_date = args.market_date
    else:
        market_date = latest_completed_market_day_at(now, close_time).strftime("%Y-%m-%d")

    if manifest_has_date(market_date, MANIFEST):
        append_log("NO_CHANGE", market_date, "Dataset already published; last successful snapshot preserved.")
        print(f"{market_date} is already published; no files were overwritten.")
        return

    try:
        subprocess.run(
            [
                sys.executable,
                str(ROOT / "scripts" / "fetch_market_context.py"),
                "--end",
                market_date,
            ],
            cwd=ROOT,
            check=True,
        )
        if not args.skip_backend:
            subprocess.run(
                [sys.executable, str(ROOT / "scripts" / "run_backfill.py"), "--date", market_date],
                cwd=ROOT,
                check=True,
            )
        build_archive(end=market_date, source_date=market_date, clean=False)
        subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "export_ksei_ownership.py")],
            cwd=ROOT,
            check=True,
        )
        subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "build_custom_indexes.py")],
            cwd=ROOT,
            check=True,
        )
        subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "validate_data.py")],
            cwd=ROOT,
            check=True,
        )
        append_log("SUCCESS", market_date, "Created and validated a new dated snapshot.")
    except Exception as exc:
        append_log("FAILED", market_date, f"{type(exc).__name__}: {exc}")
        raise


if __name__ == "__main__":
    main()
