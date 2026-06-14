from __future__ import annotations

import json
import math
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rebuild_backend.sector_normalization import normalize_idx_sector

SOURCE_DIR = ROOT / "data_sources" / "ksei"
OUTPUT_DIR = ROOT / "docs" / "data" / "ksei"
SCHEMA_VERSION = 2
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


def normalized_header(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").strip().lower())


def normalize_frame(frame: pd.DataFrame) -> pd.DataFrame:
    aliases = {
        "kode": "Kode",
        "ticker": "Kode",
        "emiten": "Emiten",
        "company": "Emiten",
        "sektor": "Sektor",
        "sector": "Sektor",
        "industri": "Industri",
        "industry": "Industri",
        "investors": "Investors",
        "investor": "Investor",
        "freefloat": "Free Float",
        "classichhi": "Classic HHI",
        "concentrationratiotop1cr1": "Concentration Ratio Top 1 (CR1)",
        "concentrationratiotop3cr3": "Concentration Ratio Top 3 (CR3)",
        "holder": "Holder",
        "ccs": "CCS",
        "ownershiptype": "Ownership Type",
        "ccscategory": "CCS Category",
        "idxsector": "IDX Sector",
        "idxsectorweight": "IDX Sector Weight",
        "changetype": "Change Type",
        "oldt ipe": "Old Tipe",
        "oldtipe": "Old Tipe",
        "newtipe": "New Tipe",
        "oldpersentase": "Old Persentase",
        "newpersentase": "New Persentase",
        "oldinvestorline": "Old Investor Line",
        "newinvestorline": "New Investor Line",
        "notes": "Notes",
        "oldclassichhi": "Old Classic HHI",
        "newclassichhi": "New Classic HHI",
        "oldholder": "Old Holder",
        "newholder": "New Holder",
        "oldccs": "Old CCS",
        "newccs": "New CCS",
    }
    rename = {}
    for column in frame.columns:
        key = normalized_header(column)
        if key in aliases:
            rename[column] = aliases[key]
    return frame.rename(columns=rename)


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
    source_sector = text_value(row.get("Sektor"))
    idx_sector = normalize_idx_sector(row.get("IDX Sector"), source_sector)
    return {
        "ticker": text_value(row.get("Kode")).upper(),
        "companyName": text_value(row.get("Emiten")),
        "sector": idx_sector,
        "idxSector": idx_sector,
        "sourceSector": source_sector or "Others",
        "industry": text_value(row.get("Industri"), "Others"),
        "investors": investors,
        "freeFloat": finite_number(row.get("Free Float")),
        "hhi": finite_number(row.get("Classic HHI")),
        "cr1": finite_number(row.get("Concentration Ratio Top 1 (CR1)")),
        "cr3": finite_number(row.get("Concentration Ratio Top 3 (CR3)")),
        "holderCount": finite_number(row.get("Holder")),
        "ccs": finite_number(row.get("CCS")),
        "ownershipType": text_value(row.get("Ownership Type"), "Unclassified"),
        "ccsCategory": text_value(row.get("CCS Category"), "Unclassified"),
        "idxSectorWeight": finite_number(row.get("IDX Sector Weight")),
        "status": "partial" if missing_fields else "ok",
        "missingFields": missing_fields,
        "source": "KSEI workbook",
        "asOf": as_of,
        "formulaVersion": "ksei-ownership-v2",
    }


def change_records(frame: pd.DataFrame | None, as_of: str) -> list[dict[str, Any]]:
    if frame is None or frame.empty:
        return []
    frame = normalize_frame(frame)
    records = []
    for _, row in frame.iterrows():
        ticker = text_value(row.get("Kode")).upper()
        investor = text_value(row.get("Investor"))
        if not ticker or not investor:
            continue
        records.append(
            {
                "changeType": text_value(row.get("Change Type"), "Changed"),
                "ticker": ticker,
                "companyName": text_value(row.get("Emiten")),
                "investor": investor,
                "oldType": text_value(row.get("Old Tipe")) or None,
                "newType": text_value(row.get("New Tipe")) or None,
                "oldPercentage": finite_number(row.get("Old Persentase")),
                "newPercentage": finite_number(row.get("New Persentase")),
                "oldInvestorLine": text_value(row.get("Old Investor Line")) or None,
                "newInvestorLine": text_value(row.get("New Investor Line")) or None,
                "notes": text_value(row.get("Notes")) or None,
                "oldHHI": finite_number(row.get("Old Classic HHI")),
                "newHHI": finite_number(row.get("New Classic HHI")),
                "oldHolderCount": finite_number(row.get("Old Holder")),
                "newHolderCount": finite_number(row.get("New Holder")),
                "oldCCS": finite_number(row.get("Old CCS")),
                "newCCS": finite_number(row.get("New CCS")),
                "source": "KSEI workbook · Investor Changes",
                "asOf": as_of,
            }
        )
    return records


def investor_directory(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    investors: dict[str, dict[str, Any]] = {}
    for issuer in records:
        for holder in issuer["investors"]:
            key = normalized_name(holder["name"])
            item = investors.setdefault(
                key,
                {
                    "name": holder["name"],
                    "types": Counter(),
                    "tickers": [],
                    "totalPublishedPercentage": 0.0,
                },
            )
            item["types"][holder["type"]] += 1
            item["tickers"].append(
                {
                    "ticker": issuer["ticker"],
                    "companyName": issuer["companyName"],
                    "sector": issuer["sector"],
                    "industry": issuer["industry"],
                    "percentage": holder["percentage"],
                    "type": holder["type"],
                }
            )
            item["totalPublishedPercentage"] += holder["percentage"]
    output = []
    for item in investors.values():
        item["types"] = dict(item["types"].most_common())
        item["tickerCount"] = len(item["tickers"])
        item["totalPublishedPercentage"] = round(item["totalPublishedPercentage"], 4)
        item["tickers"].sort(key=lambda row: (-row["percentage"], row["ticker"]))
        output.append(item)
    return sorted(output, key=lambda item: (-item["tickerCount"], item["name"]))


def summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    def values(field: str) -> list[float]:
        return [float(item[field]) for item in records if item.get(field) is not None]

    free_float = values("freeFloat")
    hhi = values("hhi")
    ownership_types = Counter(item["ownershipType"] for item in records)
    ccs_categories = Counter(item["ccsCategory"] for item in records)
    sectors = Counter(item["sector"] or "Others" for item in records)
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


def preserve_generated_at(path: Path, payload: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return payload
    try:
        existing = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return payload
    comparable_existing = {key: value for key, value in existing.items() if key != "generatedAt"}
    comparable_payload = {key: value for key, value in payload.items() if key != "generatedAt"}
    if comparable_existing == comparable_payload and existing.get("generatedAt"):
        payload["generatedAt"] = existing["generatedAt"]
    return payload


def build() -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat()
    snapshots: list[dict[str, Any]] = []
    previous: dict[str, Any] | None = None
    for path in sorted(SOURCE_DIR.glob("*.xlsx")):
        as_of = path.stem
        sheets = pd.read_excel(path, sheet_name=None)
        frame = normalize_frame(sheets.get("KSEI Data", next(iter(sheets.values()))))
        changes = change_records(sheets.get("Investor Changes"), as_of)
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
            "investorChanges": changes,
            "investorDirectory": investor_directory(records),
        }
        payload["comparison"] = compare(previous, payload)
        if changes:
            payload["comparison"]["workbookChanges"] = changes
        dated_path = OUTPUT_DIR / "dates" / as_of / "ownership.json"
        payload = preserve_generated_at(dated_path, payload)
        write_json(dated_path, payload)
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
                "investorCount": len(item["investorDirectory"]),
                "changeCount": len(item["investorChanges"]),
                "status": "ok" if not item["summary"]["partialIssuers"] else "partial",
            }
            for item in snapshots
        ],
    }
    manifest = preserve_generated_at(OUTPUT_DIR / "manifest.json", manifest)
    write_json(OUTPUT_DIR / "manifest.json", manifest)
    write_json(OUTPUT_DIR / "latest.json", snapshots[-1])
    return manifest


if __name__ == "__main__":
    result = build()
    print(
        f"Published {len(result['availableDates'])} KSEI snapshots; "
        f"latest {result['latestAsOf']}."
    )
