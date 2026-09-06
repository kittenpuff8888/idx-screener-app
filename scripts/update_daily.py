from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from collections import Counter
from datetime import datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.archive_v5 import build_archive
from scripts.export_latest import rebuild_history
from scripts.run_backfill import manifest_has_date


MANIFEST = ROOT / "docs" / "data" / "manifest.json"
UPDATE_LOG = ROOT / "docs" / "data" / "update-log.json"


def latest_observed_ohlcv_date(directory: Path) -> str | None:
    latest_dates: Counter[str] = Counter()
    if not directory.exists():
        return None
    for path in directory.glob("*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            rows = payload.get("rows") or []
            latest = rows[-1].get("date") if rows else None
            if latest:
                latest_dates[str(latest)] += 1
        except (OSError, json.JSONDecodeError, AttributeError, TypeError):
            continue
    return latest_dates.most_common(1)[0][0] if latest_dates else None


def discard_unpublished_export(market_date: str) -> None:
    targets = (
        ROOT / "data_sources" / "full-workbook" / f"{market_date}.json",
        ROOT / "data_sources" / "full-workbook" / "qa" / f"{market_date}.qa.json",
        ROOT / "docs" / "downloads" / f"{market_date}.xlsx",
        ROOT / "docs" / "data" / "ohlcv" / market_date,
    )
    for target in targets:
        if target.is_dir():
            shutil.rmtree(target)
        elif target.exists():
            target.unlink()
    rebuild_history()


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


def awaiting_session_publication(now: datetime, close_time: time, ready_time: time) -> bool:
    local_time = now.timetz().replace(tzinfo=None)
    return now.weekday() < 5 and close_time <= local_time < ready_time


def run_stage(label: str, command: list[str]) -> None:
    print(f"[update_daily] {label}: {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=ROOT, check=True)


def session_data_is_ready(market_date: str) -> bool:
    """Cheap probe for whether yfinance has actually published `market_date`'s
    session yet -- one index symbol instead of running the full ~1.5h,
    963-ticker pipeline just to discover it isn't ready. IHSG updates as
    early as any IDX symbol, since it's an aggregate of the same session."""
    import yfinance as yf
    from datetime import date

    exclusive_end = (date.fromisoformat(market_date) + timedelta(days=1)).isoformat()
    frame = yf.download(
        "^JKSE",
        start=market_date,
        end=exclusive_end,
        interval="1d",
        auto_adjust=False,
        progress=False,
        threads=False,
    )
    if frame.empty:
        return False
    return frame.index[-1].date().isoformat() == market_date


def main() -> None:
    parser = argparse.ArgumentParser(description="Update the latest completed IDX dataset.")
    parser.add_argument("--timezone", default="Asia/Jakarta")
    parser.add_argument("--market-close-time", default="16:30")
    parser.add_argument(
        "--session-ready-time",
        default="17:00",
        help="Earliest local time the current session may be treated as publishable.",
    )
    parser.add_argument("--market-date")
    parser.add_argument("--skip-backend", action="store_true")
    args = parser.parse_args()

    zone = ZoneInfo(args.timezone)
    close_time = time.fromisoformat(args.market_close_time)
    ready_time = time.fromisoformat(args.session_ready_time)
    now = datetime.now(zone)
    if args.market_date:
        market_date = args.market_date
    else:
        if awaiting_session_publication(now, close_time, ready_time):
            market_date = now.strftime("%Y-%m-%d")
            message = (
                f"Market-close check completed at {now.strftime('%H:%M %Z')}; "
                f"the current session is retried after {args.session_ready_time}."
            )
            append_log("WAITING", market_date, message)
            print(message)
            return
        market_date = latest_completed_market_day_at(now, close_time).strftime("%Y-%m-%d")

    if manifest_has_date(market_date, MANIFEST):
        append_log("NO_CHANGE", market_date, "Dataset already published; last successful snapshot preserved.")
        print(f"{market_date} is already published; no files were overwritten.")
        return

    if not args.market_date and not session_data_is_ready(market_date):
        message = (
            f"{market_date} session not yet published upstream (checked IHSG); "
            "skipping this attempt without running the full pipeline. Retried at the next scheduled slot."
        )
        append_log("NO_DATA", market_date, message)
        print(f"[update_daily] {message}", flush=True)
        return

    try:
        append_log("STARTED", market_date, "Daily update pipeline started.")
        run_stage(
            "Fetch market context",
            [
                sys.executable,
                str(ROOT / "scripts" / "fetch_market_context.py"),
                "--end",
                market_date,
            ],
        )
        if not args.skip_backend:
            run_stage(
                "Run screener backend",
                [sys.executable, str(ROOT / "scripts" / "run_backfill.py"), "--date", market_date],
            )
        observed_date = latest_observed_ohlcv_date(
            ROOT / "docs" / "data" / "ohlcv" / market_date
        )
        if observed_date != market_date:
            discard_unpublished_export(market_date)
            message = (
                f"No valid IDX session was available for {market_date}; "
                f"latest observed OHLCV date was {observed_date or 'unavailable'}. "
                "The last successful snapshot was preserved."
            )
            append_log("NO_DATA", market_date, message)
            print(f"[update_daily] {message}", flush=True)
            return
        print(f"[update_daily] Build dated archive through {market_date}", flush=True)
        manifest = build_archive(end=market_date, source_date=market_date, clean=False)
        if not any(
            item.get("marketDate") == market_date
            for item in manifest.get("dates", [])
        ):
            raise RuntimeError(
                f"Archive validation failed: {market_date} was not added to manifest.json."
            )
        run_stage(
            "Export KSEI ownership",
            [sys.executable, str(ROOT / "scripts" / "export_ksei_ownership.py")],
        )
        run_stage(
            "Build custom indexes",
            [sys.executable, str(ROOT / "scripts" / "build_custom_indexes.py")],
        )
        run_stage(
            "Validate generated data",
            [sys.executable, str(ROOT / "scripts" / "validate_data.py")],
        )
        append_log("SUCCESS", market_date, "Created and validated a new dated snapshot.")
        print(f"[update_daily] Published {market_date} successfully.", flush=True)
    except Exception as exc:
        append_log("FAILED", market_date, f"{type(exc).__name__}: {exc}")
        raise


if __name__ == "__main__":
    main()
