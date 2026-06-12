from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "docs" / "data"
OUTPUT = ROOT / "handoff" / "machine-readable"
LATEST_DATE = "2026-06-10"
SECTIONS = ("screener", "technical", "fundamental", "news", "processing")
MISSING_VALUES = (None, "", "-", "N/A")


def json_load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def value_type(value: Any) -> str:
    if value in MISSING_VALUES:
        return "missing"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "string"


def profile_rows(section: str, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    fields: list[str] = []
    seen: set[str] = set()
    for row in rows:
        for field in row:
            if field not in seen:
                seen.add(field)
                fields.append(field)

    output = []
    for field in fields:
        values = [row.get(field) for row in rows]
        missing_count = sum(value in MISSING_VALUES for value in values)
        types = Counter(value_type(value) for value in values if value not in MISSING_VALUES)
        examples = []
        for value in values:
            if value not in MISSING_VALUES and value not in examples:
                examples.append(value)
            if len(examples) == 3:
                break
        output.append({
            "section": section,
            "field": field,
            "row_count": len(rows),
            "missing_count": missing_count,
            "missing_percent": round((missing_count / len(rows) * 100) if rows else 0, 2),
            "observed_types": "|".join(sorted(types)),
            "type_counts": json.dumps(types, ensure_ascii=False, sort_keys=True),
            "examples": json.dumps(examples, ensure_ascii=False),
        })
    return output


def representative_sample(latest: dict[str, Any], historical: dict[str, Any]) -> dict[str, Any]:
    return {
        "notes": {
            "latest": "Full workbook-backed schema v3 record.",
            "historical": "Compact OHLCV-reconstructed schema v4 record.",
            "warning": "Historical fundamentals and news are not point-in-time snapshots.",
        },
        "latestDate": latest["date"],
        "historicalDate": historical["date"],
        "latestBBCA": {
            "stock": latest.get("stocks", {}).get("BBCA"),
            "technical": next(
                (row for row in latest.get("technical", []) if row.get("Ticker") == "BBCA"),
                None,
            ),
            "fundamental": next(
                (row for row in latest.get("fundamental", []) if row.get("Ticker") == "BBCA"),
                None,
            ),
            "signals": [
                row for row in latest.get("screener", []) if row.get("Ticker") == "BBCA"
            ],
            "news": [
                row for row in latest.get("news", []) if row.get("Ticker") == "BBCA"
            ],
        },
        "historicalBBCA": historical.get("stocks", {}).get("BBCA"),
        "latestSignalSamples": latest.get("screener", [])[:5],
    }


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = json_load(DATA / "manifest.json")
    latest = json_load(DATA / f"{LATEST_DATE}.json")
    historical = json_load(DATA / "snapshots" / "2026-06-08.json")

    profiles = []
    for section in SECTIONS:
        profiles.extend(profile_rows(section, latest.get(section, [])))

    with (OUTPUT / "field_profile_latest.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as handle:
        writer = csv.DictWriter(handle, fieldnames=list(profiles[0]))
        writer.writeheader()
        writer.writerows(profiles)

    with (OUTPUT / "market_dates.csv").open(
        "w", encoding="utf-8-sig", newline=""
    ) as handle:
        fields = (
            "date", "schema_mode", "file", "workbook", "ohlcv",
            "signal_rows", "signal_tickers", "run_time",
        )
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for entry in sorted(manifest["dates"], key=lambda item: item["date"]):
            writer.writerow({
                "date": entry["date"],
                "schema_mode": entry.get("snapshotMode") or "workbook-v3",
                "file": entry.get("file"),
                "workbook": entry.get("workbook"),
                "ohlcv": entry.get("ohlcv"),
                "signal_rows": entry.get("rows"),
                "signal_tickers": entry.get("tickers"),
                "run_time": entry.get("runTime"),
            })

    section_summary = {}
    for section in SECTIONS:
        rows = latest.get(section, [])
        section_profiles = [item for item in profiles if item["section"] == section]
        section_summary[section] = {
            "rows": len(rows),
            "fields": len(section_profiles),
            "fieldsWithMissing": sum(item["missing_count"] > 0 for item in section_profiles),
            "fieldsAlwaysMissing": sum(item["missing_percent"] == 100 for item in section_profiles),
        }

    inventory = {
        "generatedAt": datetime.now().astimezone().isoformat(),
        "website": "https://kittenpuff8888.github.io/IDXScreener/",
        "repository": "https://github.com/kittenpuff8888/IDXScreener",
        "latestDate": manifest["latest"],
        "firstDate": min(entry["date"] for entry in manifest["dates"]),
        "marketDateCount": len(manifest["dates"]),
        "fullWorkbookDates": sum(bool(entry.get("workbook")) for entry in manifest["dates"]),
        "historicalCompactDates": sum(
            entry.get("snapshotMode") == "historical-ohlcv"
            for entry in manifest["dates"]
        ),
        "latestSchemaVersion": latest.get("schemaVersion"),
        "historicalSchemaVersion": historical.get("schemaVersion"),
        "latestSummary": latest.get("summary"),
        "sectionSummary": section_summary,
        "processingStatus": Counter(
            str(row.get("Status")) for row in latest.get("processing", [])
        ),
        "qa": {
            "pass": latest.get("qa", {}).get("pass"),
            "warn": latest.get("qa", {}).get("warn"),
            "fail": latest.get("qa", {}).get("fail"),
            "rows": len(latest.get("qa", {}).get("rows", [])),
        },
        "sizesBytes": {
            "latestPayload": (DATA / f"{LATEST_DATE}.json").stat().st_size,
            "previousPayload": (DATA / "2026-06-09.json").stat().st_size,
            "historicalSnapshotsTotal": sum(
                path.stat().st_size for path in (DATA / "snapshots").glob("*.json")
            ),
            "sharedOhlcvTotal": sum(
                path.stat().st_size
                for path in (DATA / "ohlcv" / LATEST_DATE).glob("*.json")
            ),
        },
    }
    inventory["processingStatus"] = dict(inventory["processingStatus"])
    (OUTPUT / "site_inventory.json").write_text(
        json.dumps(inventory, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    (OUTPUT / "representative_samples.json").write_text(
        json.dumps(representative_sample(latest, historical), indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    route_map = {
        "routes": [
            {"hash": "#overview", "purpose": "Market breadth, signals, sectors, movers"},
            {"hash": "#screener", "purpose": "Filter and sort published screener signals"},
            {"hash": "#ticker/{TICKER}", "purpose": "Ticker analysis and interactive chart"},
        ],
        "modals": [
            {"id": "datePickerModal", "purpose": "Published market-date selection"},
            {"id": "indicatorSettingsModal", "purpose": "Global chart indicator profile"},
        ],
        "frontendFiles": {
            "structure": "docs/index.html",
            "styles": "docs/styles.css",
            "application": "docs/app.js",
            "indicators": "docs/indicators.js",
        },
    }
    (OUTPUT / "route_component_map.json").write_text(
        json.dumps(route_map, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"Generated handoff machine-readable files in {OUTPUT}")


if __name__ == "__main__":
    main()
