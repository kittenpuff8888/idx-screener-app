from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd
import yfinance as yf


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "docs" / "data"


def clean_number(value):
    try:
        if pd.isna(value):
            return None
        return float(value)
    except Exception:
        return None


def fetch_ticker(ticker: str, market_date: str) -> tuple[str, list[dict]]:
    end = (pd.Timestamp(market_date) + pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    history = yf.download(
        f"{ticker}.JK",
        start="1990-01-01",
        end=end,
        interval="1d",
        auto_adjust=False,
        progress=False,
        threads=False,
    )
    if isinstance(history.columns, pd.MultiIndex):
        history.columns = history.columns.get_level_values(0)
    rows = []
    for timestamp, row in history.iterrows():
        rows.append({
            "date": pd.Timestamp(timestamp).strftime("%Y-%m-%d"),
            "open": clean_number(row.get("Open")),
            "high": clean_number(row.get("High")),
            "low": clean_number(row.get("Low")),
            "close": clean_number(row.get("Close")),
            "volume": clean_number(row.get("Volume")),
        })
    # Keep ~5 years of daily bars for charts (yfinance is fetched from 1990;
    # this is the retained window). 1250 trading days ≈ 5 years.
    return ticker, rows[-1250:]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True)
    parser.add_argument("--signals-only", action="store_true")
    parser.add_argument("--include", nargs="*", default=[])
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args()

    payload_path = DATA_DIR / f"{args.date}.json"
    payload = json.loads(payload_path.read_text(encoding="utf-8"))
    if args.signals_only:
        tickers = {str(row.get("Ticker") or "").upper() for row in payload.get("screener", [])}
    else:
        tickers = {
            str(row.get("Ticker") or "").upper()
            for row in payload.get("technical", [])
        }
        tickers.update(payload.get("stocks", {}).keys())
    tickers.update(str(ticker).upper().replace(".JK", "") for ticker in args.include)
    tickers.discard("")

    target = DATA_DIR / "ohlcv" / args.date
    target.mkdir(parents=True, exist_ok=True)
    # yfinance download state is not reliably thread-safe across many tickers.
    # Sequential writes prevent one ticker's columns from contaminating another.
    for ticker in sorted(tickers):
        try:
            _, rows = fetch_ticker(ticker, args.date)
            (target / f"{ticker}.json").write_text(
                json.dumps({"ticker": ticker, "date": args.date, "rows": rows}, separators=(",", ":")),
                encoding="utf-8",
            )
            print(f"{ticker}: {len(rows)} rows")
        except Exception as exc:
            print(f"{ticker}: ERROR {exc}")


if __name__ == "__main__":
    main()
