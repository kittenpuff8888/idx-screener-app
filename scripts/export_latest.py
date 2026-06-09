from __future__ import annotations

import argparse
import json
import math
import re
import shutil
from collections import Counter, defaultdict
from datetime import date, datetime, time
from pathlib import Path
from typing import Any, Iterable

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "Output"
DOCS_DIR = ROOT / "docs"
DATA_DIR = DOCS_DIR / "data"
DOWNLOADS_DIR = DOCS_DIR / "downloads"

LEGACY_SCREENER_COLUMNS = [
    "Filter",
    "Ticker",
    "Sector",
    "Price",
    "Chg %",
    "RVOL",
    "ADR & ATR (14)",
    "Zone",
    "MP Profile",
    "MA Position",
    "POI",
    "Anchor",
    "Entry",
    "Target",
    "Upside %",
    "Invalidation",
    "R/R",
]

FILTER_LABELS = {
    "A": "EMA Trend",
    "B": "Golden Cross",
    "C": "Swing BOS",
    "D": "POI Reclaim",
    "E": "EQ Breakout",
    "F": "Near VWAP",
    "G": "SMC Location",
}


def clean_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat(sep=" ")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, time):
        return value.isoformat()
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    return value


def number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and math.isfinite(float(value)):
        return float(value)
    if value in (None, "", "-"):
        return None
    text = str(value).strip().replace(",", "")
    match = re.search(r"-?\d+(?:\.\d+)?", text)
    if not match:
        return None
    try:
        return float(match.group())
    except ValueError:
        return None


def first_value(row: dict[str, Any], names: Iterable[str]) -> Any:
    for name in names:
        value = row.get(name)
        if value not in (None, "", "-"):
            return value
    return None


def slug_date(value: Any) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = str(value or "").strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%B %d, %Y", "%B %d %Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Unsupported market date: {value!r}")


def latest_workbook() -> Path:
    files = [
        path
        for path in OUTPUT_DIR.glob("IDX Screener as of *.xlsx")
        if not path.name.startswith("~$")
    ]
    if not files:
        raise FileNotFoundError(f"No IDX Screener workbook found in {OUTPUT_DIR}")
    return max(files, key=lambda path: path.stat().st_mtime)


def find_stat(ws, label: str) -> Any:
    target = re.sub(r"\s+", " ", label).strip().lower()
    for row in ws.iter_rows(values_only=True):
        cells = list(row)
        for index, value in enumerate(cells):
            normalized = re.sub(r"\s+", " ", str(value or "")).strip().lower()
            if normalized == target:
                return cells[index + 1] if index + 1 < len(cells) else None
    return None


def find_header_row(ws, required: set[str], limit: int = 30) -> int | None:
    for row_idx in range(1, min(ws.max_row, limit) + 1):
        values = {
            str(ws.cell(row_idx, col).value or "").strip()
            for col in range(1, ws.max_column + 1)
        }
        if required.issubset(values):
            return row_idx
    return None


def unique_headers(ws, header_row: int, start_col: int = 2) -> list[tuple[int, str]]:
    raw = [
        str(ws.cell(header_row, col).value or "").strip()
        for col in range(start_col, ws.max_column + 1)
    ]
    counts = Counter(header for header in raw if header)
    current_group = ""
    groups: list[str] = []
    for col in range(start_col, ws.max_column + 1):
        group = str(ws.cell(max(1, header_row - 1), col).value or "").strip()
        if group:
            current_group = re.sub(r"\s+", " ", group)
        groups.append(current_group)

    used: Counter[str] = Counter()
    result: list[tuple[int, str]] = []
    for offset, header in enumerate(raw):
        if not header:
            continue
        used[header] += 1
        name = header
        if counts[header] > 1:
            group = groups[offset]
            name = f"{group} · {header}" if group else f"{header} {used[header]}"
        result.append((start_col + offset, name))
    return result


def parse_table(ws, header_row: int | None = None) -> list[dict[str, Any]]:
    header_row = header_row or find_header_row(ws, {"Ticker"})
    if not header_row:
        return []
    headers = unique_headers(ws, header_row)
    rows: list[dict[str, Any]] = []
    for row_idx in range(header_row + 1, ws.max_row + 1):
        item = {
            header: clean_value(ws.cell(row_idx, col).value)
            for col, header in headers
        }
        if item.get("Ticker") not in (None, "", "-"):
            rows.append(item)
    return rows


def section_filter(text: str) -> tuple[str, str]:
    match = re.search(r"\bFilter\s+([A-G])\b", text, flags=re.IGNORECASE)
    if match:
        tag = match.group(1).upper()
        return tag, FILTER_LABELS.get(tag, f"Filter {tag}")
    normalized = text.lower()
    for tag, label in FILTER_LABELS.items():
        if label.lower() in normalized:
            return tag, label
    return "", ""


def parse_legacy_screener(ws) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    current_section = ""
    for row_idx in range(1, ws.max_row + 1):
        first = str(ws.cell(row_idx, 2).value or "").strip()
        tag, label = section_filter(first)
        if tag and not re.fullmatch(r"[A-G]", first):
            current_section = first
            continue
        if not re.fullmatch(r"[A-G]", first):
            continue
        values = [clean_value(ws.cell(row_idx, col).value) for col in range(2, 19)]
        item = dict(zip(LEGACY_SCREENER_COLUMNS, values))
        item["Filter Label"] = FILTER_LABELS.get(first, label or f"Filter {first}")
        item["Section"] = current_section or f"Filter {first}"
        rows.append(item)
    return rows


def parse_idx_screener(ws) -> list[dict[str, Any]]:
    header_row = find_header_row(ws, {"Ticker", "Summary Screener"})
    if not header_row:
        return parse_legacy_screener(ws)

    headers = unique_headers(ws, header_row)
    ticker_col = next(col for col, header in headers if header == "Ticker")
    rows: list[dict[str, Any]] = []
    current_filter = ""
    current_label = ""
    current_section = ""

    for row_idx in range(header_row + 1, ws.max_row + 1):
        first = str(ws.cell(row_idx, 2).value or "").strip()
        ticker = str(ws.cell(row_idx, ticker_col).value or "").strip()
        tag, label = section_filter(first)
        if tag and not ticker:
            current_filter, current_label, current_section = tag, label, first
            continue
        if not ticker or ticker.lower().startswith("no tickers"):
            continue

        item = {
            header: clean_value(ws.cell(row_idx, col).value)
            for col, header in headers
        }
        item["Filter"] = current_filter or str(item.get("Filter") or "")
        item["Filter Label"] = current_label or FILTER_LABELS.get(item["Filter"], "")
        item["Section"] = current_section or f"Filter {item['Filter']}"
        rows.append(item)
    return rows


def signal_summary(screener: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts = Counter(str(row.get("Filter") or "") for row in screener)
    tags = sorted(set(FILTER_LABELS) | set(counts))
    return [
        {"id": tag, "label": FILTER_LABELS.get(tag, f"Filter {tag}"), "count": counts[tag]}
        for tag in tags
        if counts[tag] or tag in FILTER_LABELS
    ]


def market_overview(
    screener: list[dict[str, Any]],
    technical: list[dict[str, Any]],
    processing: list[dict[str, Any]],
) -> dict[str, Any]:
    breadth = {"advances": 0, "declines": 0, "unchanged": 0}
    sectors: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "advances": 0, "declines": 0, "changeTotal": 0.0, "changeCount": 0}
    )
    movers: list[dict[str, Any]] = []

    for row in technical:
        ticker = str(row.get("Ticker") or "").strip()
        change = number(first_value(row, ("Price Change %", "Chg %")))
        price = number(first_value(row, ("Closing Price", "Price")))
        sector = str(first_value(row, ("IDX Sector", "Sector")) or "Unclassified")
        if change is not None:
            if change > 0:
                breadth["advances"] += 1
                sectors[sector]["advances"] += 1
            elif change < 0:
                breadth["declines"] += 1
                sectors[sector]["declines"] += 1
            else:
                breadth["unchanged"] += 1
            sectors[sector]["changeTotal"] += change
            sectors[sector]["changeCount"] += 1
            movers.append({"ticker": ticker, "price": price, "change": change, "sector": sector})
        sectors[sector]["count"] += 1

    signal_tickers: dict[str, set[str]] = defaultdict(set)
    for row in screener:
        sector = str(first_value(row, ("Sector", "IDX Sector")) or "Unclassified")
        signal_tickers[sector].add(str(row.get("Ticker") or ""))

    sector_rows = []
    for sector, stats in sectors.items():
        count = stats["changeCount"]
        sector_rows.append(
            {
                "sector": sector,
                "count": stats["count"],
                "advances": stats["advances"],
                "declines": stats["declines"],
                "avgChange": stats["changeTotal"] / count if count else None,
                "signals": len(signal_tickers.get(sector, set())),
            }
        )
    sector_rows.sort(key=lambda row: (row["avgChange"] is not None, row["avgChange"] or 0), reverse=True)

    statuses = Counter(str(row.get("Status") or "Unknown") for row in processing)
    movers.sort(key=lambda row: row["change"])
    return {
        "breadth": breadth,
        "signals": signal_summary(screener),
        "sectors": sector_rows,
        "topGainers": list(reversed(movers[-8:])),
        "topDecliners": movers[:8],
        "processingStatus": dict(statuses),
    }


def read_payload(path: Path) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def rebuild_history() -> None:
    history: dict[str, list[dict[str, Any]]] = defaultdict(list)
    dates: list[str] = []
    for path in sorted(DATA_DIR.glob("20??-??-??.json")):
        payload = read_payload(path)
        if not payload:
            continue
        market_date = str(payload.get("date") or path.stem)
        dates.append(market_date)
        for row in payload.get("technical", []):
            ticker = str(row.get("Ticker") or "").strip()
            price = number(first_value(row, ("Closing Price", "Price")))
            change = number(first_value(row, ("Price Change %", "Chg %")))
            if ticker and price is not None:
                history[ticker].append(
                    {"date": market_date, "price": price, "change": change}
                )
    payload = {
        "dates": sorted(set(dates)),
        "tickers": {ticker: points for ticker, points in sorted(history.items())},
    }
    (DATA_DIR / "history.json").write_text(
        json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )


def update_manifest(entry: dict[str, Any]) -> None:
    manifest_path = DATA_DIR / "manifest.json"
    manifest = read_payload(manifest_path) or {"latest": None, "dates": []}
    dates = [item for item in manifest.get("dates", []) if item.get("date") != entry["date"]]
    dates.append(entry)
    dates.sort(key=lambda item: item["date"], reverse=True)
    manifest["dates"] = dates
    manifest["latest"] = dates[0]["date"] if dates else None
    manifest["history"] = "data/history.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def export_workbook(workbook_path: Path) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

    wb = load_workbook(workbook_path, read_only=False, data_only=True)
    if "Data Processing Results" not in wb.sheetnames:
        raise ValueError("Workbook has no Data Processing Results sheet")
    processing_sheet = wb["Data Processing Results"]
    market_date = slug_date(find_stat(processing_sheet, "As-of Date"))

    run_time = clean_value(find_stat(processing_sheet, "Run Time"))
    total_scanned = clean_value(find_stat(processing_sheet, "Total Tickers Scanned"))
    ok_count = clean_value(find_stat(processing_sheet, "OK  (full data)"))
    partial_count = clean_value(find_stat(processing_sheet, "Partial Data"))
    no_data_count = clean_value(find_stat(processing_sheet, "No Data"))

    screener = parse_idx_screener(wb["IDX Screener"])
    technical = parse_table(wb["IDX Technical Detail"])
    fundamental = parse_table(wb["IDX Fundamental Detail"])
    processing = parse_table(processing_sheet)
    news = parse_table(wb["IDX News"]) if "IDX News" in wb.sheetnames else []

    overview = market_overview(screener, technical, processing)
    payload = {
        "schemaVersion": 2,
        "date": market_date,
        "runTime": run_time,
        "workbook": f"downloads/{market_date}.xlsx",
        "summary": {
            "totalScanned": total_scanned,
            "ok": ok_count,
            "partial": partial_count,
            "noData": no_data_count,
            "signalRows": len(screener),
            "signalTickers": len({str(row.get("Ticker") or "") for row in screener}),
        },
        "overview": overview,
        "columns": {
            "screener": list(screener[0].keys()) if screener else [],
            "technical": list(technical[0].keys()) if technical else [],
            "fundamental": list(fundamental[0].keys()) if fundamental else [],
            "news": list(news[0].keys()) if news else [],
            "processing": list(processing[0].keys()) if processing else [],
        },
        "screener": screener,
        "technical": technical,
        "fundamental": fundamental,
        "news": news,
        "processing": processing,
    }

    data_path = DATA_DIR / f"{market_date}.json"
    data_path.write_text(
        json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    download_path = DOWNLOADS_DIR / f"{market_date}.xlsx"
    if workbook_path.resolve() != download_path.resolve():
        shutil.copy2(workbook_path, download_path)

    update_manifest(
        {
            "date": market_date,
            "runTime": run_time,
            "rows": len(screener),
            "tickers": payload["summary"]["signalTickers"],
            "file": f"data/{market_date}.json",
            "workbook": f"downloads/{market_date}.xlsx",
        }
    )
    rebuild_history()
    return data_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workbook", type=Path, default=None)
    args = parser.parse_args()

    workbook = args.workbook or latest_workbook()
    data_path = export_workbook(workbook)
    print(f"Exported {workbook.name} -> {data_path}")


if __name__ == "__main__":
    main()
