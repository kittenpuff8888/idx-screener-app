from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rebuild_backend.sector_normalization import OFFICIAL_IDX_SECTORS, normalize_idx_sector

DATA_DIR = ROOT / "docs" / "data"
DEFINITIONS_PATH = ROOT / "data_sources" / "index-definitions.json"
KSEI_LATEST = DATA_DIR / "ksei" / "latest.json"
OUTPUT_PATH = DATA_DIR / "indexes.json"
FORMULA_VERSION = "custom-weighted-index-v1"

EXTERNAL_INDEXES = {
    "INDEX": [
        {"id": "IDX-COMPOSITE", "label": "IDX COMPOSITE", "symbol": "IDX:COMPOSITE"},
        {"id": "EIDO", "label": "EIDO", "symbol": "AMEX:EIDO"},
        {"id": "ID10Y", "label": "ID10Y", "symbol": "TVC:ID10Y"},
        {"id": "USDIDR", "label": "USDIDR", "symbol": "FX_IDC:USDIDR"},
    ],
    "OTHERS INDEX": [
        {"id": "VIX", "label": "VIX", "symbol": "CBOE:VIX"},
        {"id": "BTC", "label": "BTC", "symbol": "COINBASE:BTCUSD"},
        {"id": "SPX", "label": "SPX", "symbol": "SP:SPX"},
        {"id": "KOSPI", "label": "KOSPI", "symbol": "KRX:KOSPI"},
    ],
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def normalize_weights(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    positive = [row for row in rows if (number(row.get("weight")) or 0) > 0]
    total = sum(float(row["weight"]) for row in positive)
    if not total:
        equal = 1 / len(rows) if rows else 0
        return [{**row, "weight": equal, "weightSource": "equal_fallback"} for row in rows]
    return [
        {
            **row,
            "weight": (float(row.get("weight") or 0) / total),
        }
        for row in rows
        if (number(row.get("weight")) or 0) > 0
    ]


def weighted_index_value(
    constituents: list[dict[str, Any]],
    prices: dict[str, float],
    base_prices: dict[str, float],
) -> tuple[float | None, int, list[str]]:
    available = [
        row
        for row in constituents
        if row["ticker"] in prices and row["ticker"] in base_prices
        and prices[row["ticker"]] > 0 and base_prices[row["ticker"]] > 0
    ]
    missing = sorted({row["ticker"] for row in constituents} - {row["ticker"] for row in available})
    total_weight = sum(float(row["weight"]) for row in available)
    if not available or total_weight <= 0:
        return None, 0, missing
    value = 100 * sum(
        (float(row["weight"]) / total_weight)
        * prices[row["ticker"]]
        / base_prices[row["ticker"]]
        for row in available
    )
    return round(value, 6), len(available), missing


def load_market_history() -> tuple[list[str], dict[str, dict[str, dict[str, Any]]]]:
    manifest = read_json(DATA_DIR / "manifest.json")
    dates = sorted(
        str(item.get("marketDate"))
        for item in manifest.get("dates", [])
        if item.get("marketDate")
    )
    history: dict[str, dict[str, dict[str, Any]]] = {}
    for market_date in dates:
        path = DATA_DIR / "dates" / market_date / "technical.json"
        if not path.exists():
            continue
        records = read_json(path).get("records") or {}
        if isinstance(records, list):
            records = {
                str(row.get("ticker") or row.get("Ticker") or "").upper(): row
                for row in records
            }
        history[market_date] = records
    return [date for date in dates if date in history], history


def latest_market_caps(
    dates: list[str],
    history: dict[str, dict[str, dict[str, Any]]],
) -> dict[str, float]:
    output: dict[str, float] = {}
    for market_date in reversed(dates):
        for ticker, row in history[market_date].items():
            if ticker in output:
                continue
            value = number((row.get("fundamentals") or {}).get("marketCap"))
            if value and value > 0:
                output[ticker] = value
    return output


def build_definitions(
    definitions: dict[str, Any],
    ksei: dict[str, Any],
    market_caps: dict[str, float],
) -> list[dict[str, Any]]:
    groups: list[dict[str, Any]] = []
    ksei_records = ksei.get("records") or []
    for sector in OFFICIAL_IDX_SECTORS:
        rows = [
            {
                "ticker": row["ticker"],
                "category": "sector_member",
                "sector": sector,
                "industry": row.get("industry"),
                "weight": number(row.get("idxSectorWeight")) or 0,
                "weightSource": "KSEI IDX Sector Weight",
            }
            for row in ksei_records
            if normalize_idx_sector(row.get("idxSector")) == sector
        ]
        groups.append(
            {
                "id": sector,
                "label": sector,
                "section": "SECTORAL INDEX",
                "weightMethod": "KSEI IDX Sector Weight",
                "constituents": normalize_weights(rows),
            }
        )

    for group_name, seed_rows in definitions.get("konglo", {}).items():
        rows = []
        for seed in seed_rows:
            ticker = str(seed["ticker"]).upper()
            rows.append(
                {
                    "ticker": ticker,
                    "category": seed.get("category"),
                    "weight": market_caps.get(ticker, 0),
                    "weightSource": "latest available market cap",
                }
            )
        groups.append(
            {
                "id": f"KONGLO-{len(groups):02d}",
                "label": group_name,
                "section": "KONGLO INDEX",
                "weightMethod": "Latest available market cap; equal fallback",
                "constituents": normalize_weights(rows),
            }
        )

    primbank_rows = [
        {
            "ticker": row["ticker"],
            "category": "PRIMBANK10",
            "weight": number(row.get("weight")) or 0,
            "weightSource": "PRIMBANK10 post-evaluation weight",
        }
        for row in definitions.get("primbank10", [])
    ]
    groups.append(
        {
            "id": "PRIMBANK10",
            "label": "PRIMBANK10",
            "section": "INDEX",
            "weightMethod": "Provided PRIMBANK10 post-evaluation weight",
            "constituents": normalize_weights(primbank_rows),
        }
    )
    return groups


def build() -> dict[str, Any]:
    definitions = read_json(DEFINITIONS_PATH)
    ksei = read_json(KSEI_LATEST)
    dates, history = load_market_history()
    market_caps = latest_market_caps(dates, history)
    groups = build_definitions(definitions, ksei, market_caps)
    first_date = dates[0]

    for group in groups:
        base_prices = {}
        first_records = history[first_date]
        for row in group["constituents"]:
            ticker = row["ticker"]
            price = number((first_records.get(ticker) or {}).get("lastPrice"))
            if price and price > 0:
                base_prices[ticker] = price
        series = []
        all_missing = set()
        for market_date in dates:
            prices = {
                ticker: value
                for ticker, record in history[market_date].items()
                if (value := number(record.get("lastPrice"))) is not None and value > 0
            }
            value, available_count, missing = weighted_index_value(
                group["constituents"], prices, base_prices
            )
            all_missing.update(missing)
            series.append(
                {
                    "date": market_date,
                    "value": value,
                    "availableConstituents": available_count,
                    "totalConstituents": len(group["constituents"]),
                    "missingTickers": missing,
                }
            )
        group["baseDate"] = first_date
        group["formula"] = "100 * sum(normalizedWeight * priceOnDate / priceOnBaseDate)"
        group["formulaVersion"] = FORMULA_VERSION
        group["missingBaseTickers"] = sorted(
            {row["ticker"] for row in group["constituents"]} - set(base_prices)
        )
        group["series"] = series

    payload = {
        "schemaVersion": 1,
        "dataType": "custom_indexes",
        "generatedAt": read_json(DATA_DIR / "manifest.json").get("generatedAt"),
        "marketDateRange": {"start": dates[0], "end": dates[-1]},
        "externalIndexes": EXTERNAL_INDEXES,
        "groups": groups,
        "source": {
            "definitions": "Word requirement appendices A and B",
            "weights": "KSEI IDX Sector Weight, PRIMBANK10 reference, or latest available market cap",
            "prices": "schema-v5 date-capped technical archive",
        },
    }
    write_json(OUTPUT_PATH, payload)
    return payload


if __name__ == "__main__":
    result = build()
    print(
        f"Published {len(result['groups'])} custom indexes through "
        f"{result['marketDateRange']['end']}."
    )
