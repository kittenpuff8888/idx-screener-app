from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import yfinance as yf


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "data_sources" / "market-context.json"
INSTRUMENTS = (
    {"label": "IHSG", "symbol": "^JKSE"},
    {"label": "VIX", "symbol": "^VIX"},
    {"label": "EIDO", "symbol": "EIDO"},
    {"label": "USDIDR", "symbol": "IDR=X"},
    {"label": "BTC", "symbol": "BTC-USD"},
    {"label": "SPX", "symbol": "^GSPC"},
    {"label": "KOSPI", "symbol": "^KS11"},
    # IHSG-relevant macro drivers (added 2026-07): dollar strength and global
    # rates move EM/IDR flows; coal is Indonesia's top export; oil + gold round
    # out the commodity/safe-haven picture. Indonesia's own 10Y is not on Yahoo,
    # so US 10Y stands in as the global-rates proxy.
    {"label": "DXY", "symbol": "DX-Y.NYB"},
    {"label": "US10Y", "symbol": "^TNX"},
    {"label": "COAL", "symbol": "MTF=F"},
    {"label": "BRENT", "symbol": "BZ=F"},
    {"label": "GOLD", "symbol": "GC=F"},
)


def close_series(frame: pd.DataFrame) -> pd.Series:
    if frame.empty:
        return pd.Series(dtype=float)
    close = frame.get("Close")
    if isinstance(close, pd.DataFrame):
        close = close.iloc[:, 0]
    if not isinstance(close, pd.Series):
        return pd.Series(dtype=float)
    close.index = pd.to_datetime(close.index).tz_localize(None)
    return pd.to_numeric(close, errors="coerce").dropna()


def fetch_instrument(symbol: str, start: str, end: str) -> list[dict[str, Any]]:
    exclusive_end = (date.fromisoformat(end) + timedelta(days=1)).isoformat()
    frame = yf.download(
        symbol,
        start=start,
        end=exclusive_end,
        interval="1d",
        auto_adjust=False,
        progress=False,
        threads=False,
    )
    closes = close_series(frame)
    rows: list[dict[str, Any]] = []
    previous: float | None = None
    for timestamp, value in closes.items():
        close = float(value)
        change = None if previous in (None, 0) else close / previous - 1
        rows.append(
            {
                "date": timestamp.date().isoformat(),
                "value": round(close, 6),
                "changePercent": round(change, 8) if change is not None else None,
            }
        )
        previous = close
    return rows


def build_payload(start: str, end: str) -> dict[str, Any]:
    instruments = []
    for item in INSTRUMENTS:
        try:
            rows = fetch_instrument(item["symbol"], start, end)
            status = "ok" if rows else "missing"
            reason = None if rows else "provider_returned_no_rows"
        except Exception as exc:  # Provider failures must remain explicit.
            rows = []
            status = "failed"
            reason = f"{type(exc).__name__}: {exc}"
        instruments.append(
            {
                **item,
                "source": "yfinance",
                "formula": "Daily Close; change = Close / PreviousClose - 1",
                "status": status,
                "reason": reason,
                "series": [row["value"] for row in rows[-20:]],
                "rows": rows,
            }
        )
    return {
        "schemaVersion": 1,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "historyRange": {"start": start, "end": end},
        "instruments": instruments,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch date-aware market context from yfinance.")
    parser.add_argument("--start", default="2024-12-01")
    parser.add_argument("--end", default=date.today().isoformat())
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    payload = build_payload(args.start, args.end)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    counts = {item["symbol"]: len(item["rows"]) for item in payload["instruments"]}
    print(f"Market context written to {args.output}: {counts}")


if __name__ == "__main__":
    main()
