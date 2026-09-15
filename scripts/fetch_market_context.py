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
OHLCV_DIR = ROOT / "docs" / "data" / "ohlcv"
# The only instrument with a real per-bar OHLCV chart on the site (the
# Dashboard's IHSG hero, replacing what used to be a TradingView embed) --
# every other instrument here only ever needed a close-price series.
OHLCV_INSTRUMENT = {"symbol": "^JKSE", "ticker": "COMPOSITE"}
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


def download_frame(symbol: str, start: str, end: str) -> pd.DataFrame:
    exclusive_end = (date.fromisoformat(end) + timedelta(days=1)).isoformat()
    return yf.download(
        symbol,
        start=start,
        end=exclusive_end,
        interval="1d",
        auto_adjust=False,
        progress=False,
        threads=False,
    )


def rows_from_frame(frame: pd.DataFrame) -> list[dict[str, Any]]:
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


def fetch_instrument(symbol: str, start: str, end: str) -> list[dict[str, Any]]:
    return rows_from_frame(download_frame(symbol, start, end))


def _col(frame: pd.DataFrame, name: str) -> pd.Series:
    col = frame.get(name)
    if isinstance(col, pd.DataFrame):
        col = col.iloc[:, 0]
    return pd.to_numeric(col, errors="coerce") if col is not None else pd.Series(dtype=float)


def write_ohlcv_snapshot(frame: pd.DataFrame, ticker: str, end: str) -> int:
    """Writes docs/data/ohlcv/<end>/<ticker>.json in the same schema the
    per-stock pipeline uses (see scripts/compute_screener_signals.py's
    load_hist) -- real O/H/L/C/V from the same yfinance frame
    fetch_instrument already downloads for the close-only market-context
    series, just kept instead of discarded, so the Dashboard's IHSG chart
    can be the same real chart every ticker page uses instead of an
    embed with no matching per-bar data of its own."""
    if frame.empty:
        return 0
    idx = pd.to_datetime(frame.index).tz_localize(None)
    o, h, l, c, v = _col(frame, "Open"), _col(frame, "High"), _col(frame, "Low"), _col(frame, "Close"), _col(frame, "Volume")
    rows: list[dict[str, Any]] = []
    for i, timestamp in enumerate(idx):
        if pd.isna(c.iloc[i]) or pd.isna(o.iloc[i]) or pd.isna(h.iloc[i]) or pd.isna(l.iloc[i]):
            continue
        rows.append(
            {
                "date": timestamp.date().isoformat(),
                "open": round(float(o.iloc[i]), 4),
                "high": round(float(h.iloc[i]), 4),
                "low": round(float(l.iloc[i]), 4),
                "close": round(float(c.iloc[i]), 4),
                "volume": float(v.iloc[i]) if not pd.isna(v.iloc[i]) else 0.0,
                "source": "yfinance",
                "adjusted": False,
                "timezone": "Asia/Jakarta",
                "session": "IDX regular daily session",
            }
        )
    if not rows:
        return 0
    payload = {
        "schemaVersion": 1,
        "ticker": ticker,
        "date": end,
        "source": "yfinance",
        "adjusted": False,
        "timezone": "Asia/Jakarta",
        "session": "IDX regular daily session",
        "formulaVersion": "ohlcv-series-v1",
        "rows": rows,
    }
    out_dir = OHLCV_DIR / end
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{ticker}.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return len(rows)


def build_payload(start: str, end: str) -> dict[str, Any]:
    instruments = []
    ohlcv_written = 0
    for item in INSTRUMENTS:
        try:
            if item["symbol"] == OHLCV_INSTRUMENT["symbol"]:
                # One download serves both: the existing close-only series
                # below, and the real O/H/L/C/V snapshot the Dashboard's
                # chart reads -- no second API call for the same symbol.
                frame = download_frame(item["symbol"], start, end)
                rows = rows_from_frame(frame)
                ohlcv_written = write_ohlcv_snapshot(frame, OHLCV_INSTRUMENT["ticker"], end)
            else:
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
    }, ohlcv_written


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch date-aware market context from yfinance.")
    parser.add_argument("--start", default="2024-12-01")
    parser.add_argument("--end", default=date.today().isoformat())
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    payload, ohlcv_written = build_payload(args.start, args.end)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    counts = {item["symbol"]: len(item["rows"]) for item in payload["instruments"]}
    print(f"Market context written to {args.output}: {counts}")
    print(f"IHSG OHLCV snapshot written to {OHLCV_DIR / args.end / (OHLCV_INSTRUMENT['ticker'] + '.json')}: {ohlcv_written} rows")


if __name__ == "__main__":
    main()
