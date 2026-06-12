from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rebuild_backend.schema import SCHEMA_VERSION


DATA = ROOT / "docs" / "data"
REQUIRED_DATE_FILES = (
    "overview.json",
    "screener.json",
    "technical.json",
    "fundamental.json",
    "news.json",
    "processing-results.json",
    "qa-audit.json",
)


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def validate_archive(data_dir: Path = DATA) -> list[str]:
    errors: list[str] = []
    manifest_path = data_dir / "manifest.json"
    if not manifest_path.exists():
        return ["manifest_missing"]
    manifest = read_json(manifest_path)
    if manifest.get("schemaVersion") != SCHEMA_VERSION:
        errors.append("manifest_schema_version")
    dates = manifest.get("dates") or []
    market_dates = [entry.get("marketDate") for entry in dates]
    if not dates:
        errors.append("manifest_dates_empty")
    if len(market_dates) != len(set(market_dates)):
        errors.append("manifest_duplicate_dates")
    if market_dates and manifest.get("latestMarketDate") != max(market_dates):
        errors.append("manifest_latest_mismatch")
    for entry in dates:
        market_date = entry.get("marketDate")
        target = data_dir / "dates" / str(market_date)
        for filename in REQUIRED_DATE_FILES:
            path = target / filename
            if not path.exists():
                errors.append(f"{market_date}:{filename}:missing")
                continue
            payload = read_json(path)
            if payload.get("schemaVersion") != SCHEMA_VERSION:
                errors.append(f"{market_date}:{filename}:schema")
            if payload.get("marketDate") != market_date:
                errors.append(f"{market_date}:{filename}:date")
        screener_path = target / "screener.json"
        if screener_path.exists():
            screener = read_json(screener_path)
            rows = screener.get("records") or []
            if len(rows) != entry.get("signalRows"):
                errors.append(f"{market_date}:signal_row_reconciliation")
            unique = len({str(row.get("Ticker") or "") for row in rows})
            if unique != entry.get("uniqueSignalTickers"):
                errors.append(f"{market_date}:signal_ticker_reconciliation")
            if any(str(row.get("signalType") or "").startswith("Filter ") for row in rows):
                errors.append(f"{market_date}:legacy_signal_label")
        qa_path = target / "qa-audit.json"
        if qa_path.exists():
            qa = read_json(qa_path)
            if (qa.get("summary") or {}).get("fail", 0):
                errors.append(f"{market_date}:qa_failure")
    latest_entry = next(
        (entry for entry in dates if entry.get("marketDate") == manifest.get("latestMarketDate")),
        None,
    )
    if latest_entry and manifest.get("latestMarketDate") == "2026-06-10":
        expected = {
            "totalScanned": 956,
            "okTickers": 952,
            "partialTickers": 4,
            "signalRows": 35,
            "uniqueSignalTickers": 22,
        }
        for key, value in expected.items():
            if latest_entry.get(key) != value:
                errors.append(f"2026-06-10:{key}:expected_{value}_got_{latest_entry.get(key)}")
    return errors


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, default=DATA)
    args = parser.parse_args()
    errors = validate_archive(args.data_dir)
    if errors:
        print("\n".join(errors))
        raise SystemExit(1)
    manifest = read_json(args.data_dir / "manifest.json")
    print(
        f"Schema v{SCHEMA_VERSION} archive valid: {len(manifest['dates'])} market dates, "
        f"latest {manifest['latestMarketDate']}."
    )


if __name__ == "__main__":
    main()
