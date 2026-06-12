from __future__ import annotations

import json
import math
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "data_sources" / "ksei"
OUTPUT_DIR = ROOT / "docs" / "data" / "ksei"
SCHEMA_VERSION = 1
HOLDER_PATTERN = re.compile(
    r"^\s*\d+\.\s*(.*?)\s+-\s+(.+?)\s+-\s+([0-9]+(?:\.[0-9]+)?)%?\s*$"
)


def finite_number(value: Any) -> float | int | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(parsed):
        return None
    return int(parsed) if parsed.is_integer() else parsed


def text_value(value: Any, fallback: str = "") -> str:
    if value is None or pd.isna(value):
        return fallback
    return str(value).strip()


def normalized_name(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().upper())


def parse_investors(value: Any) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line in str(value or "").splitlines():
        match = HOLDER_PATTERN.match(line)
        if not match:
            continue
        name, holder_type, percentage = match.groups()
        records.append(
            {
                "name": re.sub(r"\s+", " ", name.strip()),
                "type": holder_type.strip(),
                "percentage": float(percentage),
            }
        )
    return records


def record_from_row(row: pd.Series, as_of: str) -> dict[str, Any]:
    investors = parse_investors(row.get("Investors"))
    required = ("Kode", "Emiten", "Free Float", "Classic HHI", "CCS")
    missing_fields = [field for field in required if pd.isna(row.get(field))]
    return {
        "ticker": text_value(row.get("Kode")).upper(),
        "companyName": text_value(row.get("Emiten")),
        "sector": text_value(row.get("Sektor"), "Unclassified"),
        "industry": text_value(row.get("Industri"), "Unclassified"),
        "investors": investors,
        "freeFloat": finite_number(row.get("Free Float")),
        "hhi": finite_number(row.get("Classic HHI")),
        "cr1": finite_number(row.get("Concentration Ratio Top 1 (CR1)")),
        "cr3": finite_number(row.get("Concentration Ratio Top 3 (CR3)")),
        "holderCount": finite_number(row.get("Holder")),
        "ccs": finite_number(row.get("CCS")),
        "ownershipType": text_value(row.get("Ownership Type"), "Unclassified"),
        "ccsCategory": text_value(row.get("CCS Category"), "Unclassified"),
        "idxSector": text_value(row.get("IDX Sector"), "Unclassified"),
        "idxSectorWeight": finite_number(row.get("IDX Sector Weight")),
        "status": "partial" if missing_fields else "ok",
        "missingFields": missing_fields,
        "source": "KSEI workbook",
        "asOf": as_of,
        "formulaVersion": "ksei-ownership-v1",
    }


def summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    def values(field: str) -> list[float]:
        return [float(item[field]) for item in records if item.get(field) is not None]

    free_float = values("freeFloat")
    hhi = values("hhi")
    ownership_types = Counter(item["ownershipType"] for item in records)
    ccs_categories = Counter(item["ccsCategory"] for item in records)
    sectors = Counter(item["sector"] or "Unclassified" for item in records)
    return {
        "totalIssuers": len(records),
        "okIssuers": sum(item["status"] == "ok" for item in records),
        "partialIssuers": sum(item["status"] == "partial" for item in records),
        "averageFreeFloat": round(sum(free_float) / len(free_float), 2) if free_float else None,
        "averageHHI": round(sum(hhi) / len(hhi), 1) if hhi else None,
        "highConcentrationIssuers": sum((item.get("hhi") or 0) >= 2500 for item in records),
        "highCCSIssuers": sum(item["ccsCategory"].lower() == "tinggi" for item in records),
        "ownershipTypes": dict(ownership_types.most_common()),
        "ccsCategories": dict(ccs_categories.most_common()),
        "sectors": dict(sectors.most_common()),
    }


def compare(previous: dict[str, Any] | None, current: dict[str, Any]) -> dict[str, Any]:
    if not previous:
        return {
            "previousAsOf": None,
            "newTickers": [],
            "removedTickers": [],
            "changedTickers": [],
            "investorAdditions": [],
            "investorRemovals": [],
        }
    old = {item["ticker"]: item for item in previous["records"]}
    new = {item["ticker"]: item for item in current["records"]}
    additions: list[dict[str, Any]] = []
    removals: list[dict[str, Any]] = []
    changed: list[str] = []
    for ticker in sorted(old.keys() & new.keys()):
        old_holders = {normalized_name(item["name"]): item for item in old[ticker]["investors"]}
        new_holders = {normalized_name(item["name"]): item for item in new[ticker]["investors"]}
        for key in sorted(new_holders.keys() - old_holders.keys()):
            additions.append({"ticker": ticker, **new_holders[key]})
        for key in sorted(old_holders.keys() - new_holders.keys()):
            removals.append({"ticker": ticker, **old_holders[key]})
        numeric_changed = any(
            old[ticker].get(field) != new[ticker].get(field)
            for field in ("freeFloat", "hhi", "cr1", "cr3", "holderCount", "ccs")
        )
        holder_changed = bool(old_holders.keys() ^ new_holders.keys()) or any(
            old_holders[key]["percentage"] != new_holders[key]["percentage"]
            for key in old_holders.keys() & new_holders.keys()
        )
        if numeric_changed or holder_changed:
            changed.append(ticker)
    return {
        "previousAsOf": previous["asOf"],
        "newTickers": sorted(new.keys() - old.keys()),
        "removedTickers": sorted(old.keys() - new.keys()),
        "changedTickers": changed,
        "investorAdditions": additions,
        "investorRemovals": removals,
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def build() -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat()
    snapshots: list[dict[str, Any]] = []
    previous: dict[str, Any] | None = None
    for path in sorted(SOURCE_DIR.glob("*.xlsx")):
        as_of = path.stem
        frame = pd.read_excel(path)
        records = [
            record_from_row(row, as_of)
            for _, row in frame.iterrows()
            if text_value(row.get("Kode"))
        ]
        payload = {
            "schemaVersion": SCHEMA_VERSION,
            "dataType": "ksei_ownership",
            "asOf": as_of,
            "generatedAt": generated_at,
            "source": {
                "name": "KSEI workbook",
                "file": path.name,
                "sourceMode": "point_in_time",
            },
            "summary": summary(records),
            "records": records,
        }
        payload["comparison"] = compare(previous, payload)
        write_json(OUTPUT_DIR / "dates" / as_of / "ownership.json", payload)
        snapshots.append(payload)
        previous = payload

    if not snapshots:
        raise FileNotFoundError(f"No KSEI workbooks found in {SOURCE_DIR}")
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "dataType": "ksei_ownership",
        "generatedAt": generated_at,
        "latestAsOf": snapshots[-1]["asOf"],
        "availableDates": [item["asOf"] for item in snapshots],
        "snapshots": [
            {
                "asOf": item["asOf"],
                "path": f"data/ksei/dates/{item['asOf']}/ownership.json",
                "recordCount": len(item["records"]),
                "status": "ok" if not item["summary"]["partialIssuers"] else "partial",
            }
            for item in snapshots
        ],
    }
    write_json(OUTPUT_DIR / "manifest.json", manifest)
    write_json(OUTPUT_DIR / "latest.json", snapshots[-1])
    return manifest


if __name__ == "__main__":
    result = build()
    print(
        f"Published {len(result['availableDates'])} KSEI snapshots; "
        f"latest {result['latestAsOf']}."
    )
