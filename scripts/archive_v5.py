from __future__ import annotations

import json
import math
import shutil
import sys
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rebuild_backend.calculations.quality import ticker_quality, validate_ohlcv_record
from rebuild_backend.logic_reference import export_registry
from rebuild_backend.schema import SCHEMA_VERSION, field_metadata, missing
from rebuild_backend.source_registry import registry_payload
from scripts.build_historical_snapshots import build_snapshot, prepare_ticker


DATA = ROOT / "docs" / "data"
DATES_DIR = DATA / "dates"
MARKET_CONTEXT = ROOT / "data_sources" / "market-context.json"
FULL_PAYLOAD_DIR = ROOT / "data_sources" / "full-workbook"
DEFAULT_SOURCE_DATE = "2026-06-10"
DEFAULT_START = "2025-01-01"
DEFAULT_END = "2026-06-10"
FRIENDLY_SIGNALS = {
    "A": "EMA Trend",
    "B": "Golden Cross",
    "C": "Structure Break",
    "D": "Price Level Reclaim",
    "E": "Equal-Level Breakout",
    "F": "Near VWAP",
    "G": "Structure Location",
}
DISCLAIMER = (
    "Educational research only. Not financial advice. Data may be delayed, "
    "incomplete, or differ across providers. Do your own research."
)
TECHNICAL_FIELD_DEFINITIONS = {
    "lastPrice": {"source": "yfinance", "formula": "OHLCV.Close"},
    "changePercent": {"source": "derived", "formula": "Close / PreviousClose - 1"},
    "volume": {"source": "yfinance", "formula": "OHLCV.Volume"},
    "rvol": {"source": "derived", "formula": "Volume / SMA(Volume, 20)"},
    "rsRating": {"source": "derived", "formula": "60-bar return percentile"},
    "ema25": {"source": "derived", "formula": "EMA(Close, 25, adjust=False)"},
    "ema50": {"source": "derived", "formula": "EMA(Close, 50, adjust=False)"},
    "sma200": {"source": "derived", "formula": "SMA(Close, 200)"},
    "rsi14": {"source": "derived", "formula": "Wilder RSI(14)"},
    "macdLine": {"source": "derived", "formula": "EMA(Close,12) - EMA(Close,26)"},
    "vwap": {"source": "derived", "formula": "Cumulative TypicalPrice*Volume / Volume"},
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any, *, pretty: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            payload,
            ensure_ascii=False,
            indent=2 if pretty else None,
            separators=None if pretty else (",", ":"),
        ),
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


def legacy_number(value: Any) -> float | None:
    """Parse a workbook display number without guessing abbreviated suffixes."""
    if isinstance(value, str):
        value = value.strip().replace(",", "")
    return number(value)


def compact_idr(value: float | None) -> str | None:
    if value is None:
        return None
    if abs(value) >= 1_000_000_000_000:
        return f"Rp {value / 1_000_000_000_000:.2f} T"
    if abs(value) >= 1_000_000_000:
        return f"Rp {value / 1_000_000_000:.2f} B"
    if abs(value) >= 1_000_000:
        return f"Rp {value / 1_000_000:.2f} M"
    return f"Rp {value:,.0f}"


def normalize_market_cap(fundamentals: dict[str, Any]) -> None:
    raw = fundamentals.get("marketCap")
    parsed = legacy_number(raw)
    if parsed is None:
        return

    # Legacy workbook values are IDR billions. Numeric provider exports may
    # already be absolute IDR, so only scale the compact workbook form.
    legacy_billions = isinstance(raw, str) and parsed < 10_000_000
    absolute = parsed * 1_000_000_000 if legacy_billions else parsed
    fundamentals["marketCap"] = absolute
    fundamentals["marketCapUnit"] = "IDR"
    fundamentals["marketCapScale"] = "absolute"
    fundamentals["marketCapDisplay"] = compact_idr(absolute)


def clean_levels(value: Any) -> list[float]:
    if not isinstance(value, list):
        return []
    output: list[float] = []
    seen: set[float] = set()
    for item in value:
        parsed = number(item)
        if parsed is None:
            continue
        identity = round(parsed, 8)
        if identity in seen:
            continue
        seen.add(identity)
        output.append(parsed)
    return output


def prepared_index(
    prepared: dict[str, dict[str, Any]] | None,
    ticker: str,
    market_date: str,
) -> tuple[dict[str, Any], int] | None:
    item = (prepared or {}).get(ticker)
    if not item:
        return None
    index = item.get("index", {}).get(market_date)
    if index is None:
        return None
    return item, int(index)


def load_market_context() -> dict[str, Any]:
    if not MARKET_CONTEXT.exists():
        return {"instruments": []}
    try:
        return read_json(MARKET_CONTEXT)
    except (OSError, json.JSONDecodeError):
        return {"instruments": []}


def market_context_for_date(history: dict[str, Any], market_date: str) -> list[dict[str, Any]]:
    output = []
    for instrument in history.get("instruments") or []:
        available = [
            row
            for row in instrument.get("rows") or []
            if str(row.get("date") or "") <= market_date
        ]
        latest = available[-1] if available else None
        output.append(
            {
                "label": instrument.get("label"),
                "symbol": instrument.get("symbol"),
                "value": latest.get("value") if latest else None,
                "changePercent": latest.get("changePercent") if latest else None,
                "series": [
                    value
                    for row in available[-20:]
                    if (value := number(row.get("value"))) is not None
                ],
                "status": "ok" if latest else instrument.get("status") or "missing",
                "reason": None if latest else instrument.get("reason") or "no_value_on_or_before_market_date",
                "source": instrument.get("source") or "yfinance",
                "asOf": latest.get("date") if latest else market_date,
                "formula": instrument.get("formula"),
            }
        )
    return output


def neutral_text(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    replacements = {
        "BOS": "Structure Break",
        "POI": "Price Level",
        "EQ Breakout": "Equal-Level Breakout",
        "SMC Location": "Structure Location",
    }
    output = value
    for old, new in replacements.items():
        output = output.replace(old, new)
    return output


def normalized_signal(row: dict[str, Any]) -> dict[str, Any]:
    item = {key: neutral_text(value) for key, value in row.items()}
    legacy = str(item.get("Filter") or item.get("legacyFilter") or "").upper()
    label = FRIENDLY_SIGNALS.get(legacy) or str(item.get("Filter Label") or "").strip()
    item["legacyFilter"] = legacy or None
    item["signalType"] = label or "Workbook Signal"
    item["Filter Label"] = item["signalType"]
    item.pop("Filter", None)
    return item


def stock_metadata(
    stock: dict[str, Any],
    market_date: str,
    source: str,
    *,
    derived_fields: set[str] | None = None,
) -> dict[str, Any]:
    technical = stock.get("technical") or {}
    moving = stock.get("movingAverages") or {}
    formulas = {
        "lastPrice": "OHLCV.Close",
        "changePercent": "Close / PreviousClose - 1",
        "volume": "OHLCV.Volume",
        "rvol": "Volume / SMA(Volume, 20)",
        "rsRating": "60-bar return percentile",
        "ema25": "EMA(Close, 25, adjust=False)",
        "ema50": "EMA(Close, 50, adjust=False)",
        "sma200": "SMA(Close, 200)",
        "rsi14": "Wilder RSI(14)",
        "macdLine": "EMA(Close,12) - EMA(Close,26)",
        "vwap": "Cumulative TypicalPrice*Volume / Volume",
    }
    values = {
        "lastPrice": stock.get("lastPrice"),
        "changePercent": stock.get("changePercent"),
        "volume": stock.get("volume"),
        "rvol": stock.get("rvol"),
        "rsRating": stock.get("rsRating"),
        "ema25": moving.get("ema25"),
        "ema50": moving.get("ema50"),
        "sma200": moving.get("sma200"),
        "rsi14": technical.get("rsi14"),
        "macdLine": technical.get("macdLine"),
        "vwap": technical.get("vwap"),
    }
    reasons = {
        "sma200": "insufficient_history",
        "rvol": "insufficient_history",
        "rsi14": "insufficient_history",
        "macdLine": "insufficient_history",
        "vwap": "insufficient_history",
    }
    output = {}
    derived_fields = derived_fields or set()
    for field, value in values.items():
        if field in derived_fields or value is None or value == "" or value == "-" or value == "N/A":
            metadata_source = "yfinance" if field in derived_fields else (
                TECHNICAL_FIELD_DEFINITIONS[field]["source"] if source != "workbook" else source
            )
            output[field] = field_metadata(
                value,
                source=metadata_source,
                as_of=market_date,
                formula=formulas[field],
                reason=reasons.get(field, "source_unavailable"),
            )
    return output


def prepared_value(
    prepared_ticker: dict[str, Any],
    field: str,
    row_index: int,
    *,
    minimum_rows: int = 1,
) -> float | None:
    if row_index + 1 < minimum_rows:
        return None
    values = prepared_ticker.get(field) or []
    if row_index >= len(values):
        return None
    return number(values[row_index])


def normalize_stocks(
    stocks: dict[str, dict[str, Any]],
    market_date: str,
    *,
    source: str,
    prepared: dict[str, dict[str, Any]] | None = None,
) -> tuple[dict[str, dict[str, Any]], Counter]:
    counts: Counter = Counter()
    output: dict[str, dict[str, Any]] = {}
    for ticker, raw_stock in sorted(stocks.items()):
        stock = dict(raw_stock)
        derived_fields: set[str] = set()
        for group_name in ("trend", "structure", "movingAverages", "technical"):
            if isinstance(stock.get(group_name), dict):
                stock[group_name] = {
                    key: neutral_text(value)
                    for key, value in stock[group_name].items()
                }
        stock["ticker"] = ticker
        stock["supportLevels"] = clean_levels(stock.get("supportLevels"))
        stock["resistanceLevels"] = clean_levels(stock.get("resistanceLevels"))

        point_in_time = prepared_index(prepared, ticker, market_date)
        if point_in_time:
            prepared_ticker, row_index = point_in_time
            historical_row = prepared_ticker["rows"][row_index]
            stock["volumeDisplay"] = stock.get("volume")
            stock["volume"] = number(historical_row.get("volume"))
            stock["averageVolume20"] = number(
                prepared_ticker.get("average_volume", [None])[row_index]
            )
            moving = dict(stock.get("movingAverages") or {})
            technical = dict(stock.get("technical") or {})
            prepared_fields = (
                ("ema25", moving, "ema25", 1),
                ("ema50", moving, "ema50", 1),
                ("sma200", moving, "sma200", 200),
                ("rsi14", technical, "rsi", 15),
                ("macdLine", technical, "macd", 26),
                ("vwap", technical, "monthly_vwap", 1),
            )
            for public_field, target, prepared_field, minimum_rows in prepared_fields:
                if number(target.get(public_field)) is not None:
                    continue
                calculated = prepared_value(
                    prepared_ticker,
                    prepared_field,
                    row_index,
                    minimum_rows=minimum_rows,
                )
                if calculated is None:
                    continue
                target[public_field] = round(calculated, 6)
                derived_fields.add(public_field)
            stock["movingAverages"] = moving
            stock["technical"] = technical

            if number(stock.get("rvol")) is None:
                average_volume = number(stock.get("averageVolume20"))
                volume = number(stock.get("volume"))
                if volume is not None and average_volume:
                    stock["rvol"] = round(volume / average_volume, 6)
                    derived_fields.add("rvol")

        fundamentals = stock.get("fundamentals")
        if isinstance(fundamentals, dict):
            fundamentals = dict(fundamentals)
            normalize_market_cap(fundamentals)
            stock["fundamentals"] = fundamentals

        status, missing_fields = ticker_quality(stock)
        counts[status] += 1
        stock["dataStatus"] = status
        stock["missingFields"] = missing_fields
        stock["_meta"] = stock_metadata(
            stock,
            market_date,
            source,
            derived_fields=derived_fields,
        )
        stock["provenance"] = {
            "marketDate": market_date,
            "source": source,
            "pointInTime": True,
        }
        output[ticker] = stock
    return output, counts


def load_prepared(source_date: str) -> dict[str, dict[str, Any]]:
    directory = DATA / "ohlcv" / source_date
    if not directory.exists():
        raise FileNotFoundError(f"Missing OHLCV directory: {directory}")
    prepared: dict[str, dict[str, Any]] = {}
    for source_file in sorted(directory.glob("*.json")):
        try:
            rows = read_json(source_file).get("rows") or []
            if rows:
                prepared[source_file.stem.upper()] = prepare_ticker(rows)
        except (OSError, json.JSONDecodeError, TypeError, ValueError):
            continue
    if not prepared:
        raise ValueError(f"No valid OHLCV files found in {directory}")
    return prepared


def discover_market_dates(
    prepared: dict[str, dict[str, Any]],
    start: str,
    end: str,
) -> list[str]:
    reference = prepared.get("BBCA") or max(prepared.values(), key=lambda item: len(item["rows"]))
    return sorted(
        {
            row["date"]
            for row in reference["rows"]
            if start <= row["date"] <= end
        }
    )


def full_payload_for_date(market_date: str) -> dict[str, Any] | None:
    path = FULL_PAYLOAD_DIR / f"{market_date}.json"
    if not path.exists():
        return None
    payload = read_json(path)
    return payload if payload.get("technical") else None


def historical_payload(
    market_date: str,
    static_stocks: dict[str, Any],
    prepared: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    return build_snapshot(market_date, static_stocks, prepared)


def build_processing(
    market_date: str,
    universe: list[str],
    stocks: dict[str, dict[str, Any]],
    *,
    full_processing: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if full_processing:
        statuses = Counter(str(row.get("Status") or "UNKNOWN").upper() for row in full_processing)
        return {
            "schemaVersion": SCHEMA_VERSION,
            "marketDate": market_date,
            "summary": {
                "totalScanned": len(full_processing),
                "ok": statuses.get("OK", 0),
                "partial": sum(count for status, count in statuses.items() if "PARTIAL" in status),
                "noData": sum(count for status, count in statuses.items() if "NO DATA" in status),
            },
            "records": full_processing,
        }
    available = set(stocks)
    no_data = [
        {
            "ticker": ticker,
            "status": "NO_DATA",
            "field": missing(
                reason="source_unavailable",
                source="yfinance",
                as_of=market_date,
                formula="Historical OHLCV lookup",
            ),
        }
        for ticker in universe
        if ticker not in available
    ]
    partial = [
        {
            "ticker": ticker,
            "status": stock.get("dataStatus"),
            "missingFields": stock.get("missingFields") or [],
        }
        for ticker, stock in stocks.items()
        if stock.get("dataStatus") == "PARTIAL"
    ]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "marketDate": market_date,
        "summary": {
            "totalScanned": len(universe),
            "ok": sum(stock.get("dataStatus") == "OK" for stock in stocks.values()),
            "partial": len(partial),
            "noData": len(no_data),
        },
        "records": [*partial, *no_data],
        "recordMode": "exceptions_only",
    }


def build_qa(
    market_date: str,
    stocks: dict[str, dict[str, Any]],
    signals: list[dict[str, Any]],
    prepared: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    issues: list[dict[str, Any]] = []
    checks = 0
    for ticker, stock in stocks.items():
        checks += 3
        rsi_value = number((stock.get("technical") or {}).get("rsi14"))
        if rsi_value is not None and not 0 <= rsi_value <= 100:
            issues.append({"ticker": ticker, "check": "rsi_range", "status": "FAIL", "value": rsi_value})
        data = prepared.get(ticker)
        if data and market_date in data["index"]:
            row = data["rows"][data["index"][market_date]]
            for error in validate_ohlcv_record(row):
                issues.append({"ticker": ticker, "check": error, "status": "FAIL"})
        if stock.get("provenance", {}).get("marketDate") != market_date:
            issues.append({"ticker": ticker, "check": "market_date_provenance", "status": "FAIL"})
    duplicate_rows = len(signals) - len(
        {
            (
                str(row.get("Ticker") or ""),
                str(row.get("signalType") or ""),
                str(row.get("Summary Screener") or ""),
            )
            for row in signals
        }
    )
    checks += 1
    if duplicate_rows:
        issues.append({"check": "duplicate_signal_rows", "status": "WARN", "count": duplicate_rows})
    fail = sum(issue["status"] == "FAIL" for issue in issues)
    warn = sum(issue["status"] == "WARN" for issue in issues)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "marketDate": market_date,
        "summary": {"checks": checks, "pass": checks - fail - warn, "warn": warn, "fail": fail},
        "issues": issues,
    }


def split_payload(
    market_date: str,
    payload: dict[str, Any],
    prepared: dict[str, dict[str, Any]],
    static_stocks: dict[str, Any],
    source_date: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    full = bool(payload.get("technical"))
    raw_stocks = payload.get("stocks") or {}
    source = "workbook" if full else "derived"
    stocks, quality_counts = normalize_stocks(
        raw_stocks,
        market_date,
        source=source,
        prepared=prepared,
    )
    signals = [normalized_signal(row) for row in payload.get("screener") or []]
    universe = sorted(static_stocks)
    processing = build_processing(
        market_date,
        universe,
        stocks,
        full_processing=payload.get("processing") if full else None,
    )
    summary = dict(payload.get("summary") or {})
    if not full:
        summary = {
            "totalScanned": len(universe),
            "ok": processing["summary"]["ok"],
            "partial": processing["summary"]["partial"],
            "noData": processing["summary"]["noData"],
            "signalRows": len(signals),
            "signalTickers": len({str(row.get("Ticker") or "") for row in signals}),
        }
    else:
        summary.update(
            {
                "signalRows": len(signals),
                "signalTickers": len({str(row.get("Ticker") or "") for row in signals}),
            }
        )
    snapshot_mode = "full_workbook" if full else "historical_ohlcv_reconstruction"
    provenance = {
        "snapshotMode": snapshot_mode,
        "priceTechnical": {"source": source, "pointInTime": True},
        "signals": {
            "source": "workbook" if full else "derived",
            "pointInTime": True,
            "coverage": "A-G workbook filters" if full else "Source-limited EMA Trend, Golden Cross, Price Level Reclaim",
        },
        "fundamentals": {
            "source": "workbook",
            "pointInTime": full,
            "referenceMarketDate": None if full else source_date,
        },
        "news": {
            "source": "workbook",
            "pointInTime": full,
            "referenceMarketDate": None if full else source_date,
        },
    }
    common = {
        "schemaVersion": SCHEMA_VERSION,
        "marketDate": market_date,
        "generatedAt": f"{market_date}T16:30:00+07:00",
        "provenance": provenance,
        "disclaimer": DISCLAIMER,
    }
    overview = {
        **common,
        "summary": summary,
        "overview": payload.get("overview") or {},
        "datasetStatus": "ok" if stocks else "unavailable",
    }
    screener = {
        **common,
        "status": "loaded",
        "rowCount": len(signals),
        "uniqueTickerCount": len({str(row.get("Ticker") or "") for row in signals}),
        "records": signals,
    }
    technical = {
        **common,
        "recordCount": len(stocks),
        "records": stocks,
        "quality": dict(quality_counts),
        "fieldDefinitions": TECHNICAL_FIELD_DEFINITIONS,
    }
    if full:
        fundamental = {
            **common,
            "dataMode": "point_in_time_workbook",
            "recordCount": len(payload.get("fundamental") or []),
            "records": payload.get("fundamental") or [],
        }
        news = {
            **common,
            "dataMode": "point_in_time_workbook",
            "recordCount": len(payload.get("news") or []),
            "records": payload.get("news") or [],
        }
    else:
        fundamental = {
            **common,
            "dataMode": "latest_reference_not_point_in_time",
            "referenceMarketDate": source_date,
            "referencePath": f"../{source_date}/fundamental.json",
            "recordCount": 0,
            "records": [],
        }
        news = {
            **common,
            "dataMode": "latest_reference_not_point_in_time",
            "referenceMarketDate": source_date,
            "referencePath": f"../{source_date}/news.json",
            "recordCount": 0,
            "records": [],
        }
    qa = build_qa(market_date, stocks, signals, prepared)
    files = {
        "overview.json": overview,
        "screener.json": screener,
        "technical.json": technical,
        "fundamental.json": fundamental,
        "news.json": news,
        "processing-results.json": processing,
        "qa-audit.json": qa,
    }
    manifest_entry = {
        "marketDate": market_date,
        "path": f"data/dates/{market_date}/",
        "totalScanned": int(number(summary.get("totalScanned")) or 0),
        "okTickers": int(number(summary.get("ok")) or 0),
        "partialTickers": int(number(summary.get("partial")) or 0),
        "noDataTickers": int(number(summary.get("noData")) or 0),
        "signalRows": len(signals),
        "uniqueSignalTickers": len({str(row.get("Ticker") or "") for row in signals}),
        "status": "ok" if stocks else "unavailable",
        "snapshotMode": snapshot_mode,
        "workbook": payload.get("workbook"),
        "ohlcv": f"data/ohlcv/{source_date}",
    }
    return files, manifest_entry


def build_archive(
    *,
    start: str = DEFAULT_START,
    end: str = DEFAULT_END,
    source_date: str = DEFAULT_SOURCE_DATE,
    clean: bool = True,
) -> dict[str, Any]:
    latest_payload = read_json(FULL_PAYLOAD_DIR / f"{source_date}.json")
    static_stocks = latest_payload.get("stocks") or {}
    prepared = load_prepared(source_date)
    market_context = load_market_context()
    market_dates = discover_market_dates(prepared, start, end)
    if not market_dates:
        raise ValueError(f"No real market sessions found from {start} through {end}")
    existing_manifest = {}
    if not clean and (DATA / "manifest.json").exists():
        try:
            existing_manifest = {
                entry["marketDate"]: entry
                for entry in read_json(DATA / "manifest.json").get("dates", [])
                if entry.get("marketDate")
            }
        except (OSError, json.JSONDecodeError, KeyError):
            existing_manifest = {}
    if clean and DATES_DIR.exists():
        shutil.rmtree(DATES_DIR)
    DATES_DIR.mkdir(parents=True, exist_ok=True)
    entries: list[dict[str, Any]] = []
    for index, market_date in enumerate(market_dates, start=1):
        target = DATES_DIR / market_date
        if not clean and market_date in existing_manifest and all(
            (target / filename).exists()
            for filename in (
                "overview.json",
                "screener.json",
                "technical.json",
                "fundamental.json",
                "news.json",
                "processing-results.json",
                "qa-audit.json",
            )
        ):
            entries.append(existing_manifest[market_date])
            print(f"[{index:03d}/{len(market_dates):03d}] {market_date}: preserved existing snapshot")
            continue
        payload = full_payload_for_date(market_date)
        if payload is None:
            payload = historical_payload(market_date, static_stocks, prepared)
        payload.setdefault("overview", {})["marketContext"] = market_context_for_date(
            market_context,
            market_date,
        )
        files, entry = split_payload(
            market_date,
            payload,
            prepared,
            static_stocks,
            source_date,
        )
        for filename, content in files.items():
            write_json(target / filename, content)
        entries.append(entry)
        print(
            f"[{index:03d}/{len(market_dates):03d}] {market_date}: "
            f"{entry['okTickers']} OK, {entry['signalRows']} signal rows"
        )
    latest_market_date = entries[-1]["marketDate"]
    manifest = {
        "schemaVersion": SCHEMA_VERSION,
        "latestMarketDate": latest_market_date,
        "latest": latest_market_date,
        "generatedAt": f"{latest_market_date}T16:30:00+07:00",
        "lastSuccessfulDatasetLoad": f"{latest_market_date}T16:30:00+07:00",
        "updateSchedule": {
            "timezone": "Asia/Jakarta",
            "localTime": "16:30",
            "cronUtc": "30 9 * * 1-5",
        },
        "historyRange": {"start": start, "end": end},
        "availableMarketDates": market_dates,
        "sourceVersions": {
            "archive": "schema-v5",
            "formula": "source-limited-v3",
            "historicalSignals": "ohlcv-reconstruction-v2",
        },
        "sources": registry_payload(),
        "dates": entries,
    }
    write_json(DATA / "manifest.json", manifest, pretty=True)
    export_registry(DATA / "logic-reference.json")
    return manifest
