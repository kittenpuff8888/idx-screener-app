"""Computes the four Screener filter signals directly from the already-
published OHLCV archive (docs/data/ohlcv/<date>/<TICKER>.json) -- no
yfinance re-fetch, so this runs in seconds against data the daily pipeline
already downloaded, rather than requiring a full 1.5-3h rerun.

Writes docs/data/dates/<date>/screener_signals.json, one record per roster
ticker:
  breakIbhIbl        -- today's close breaks above the monthly Initial
                         Balance High, after yesterday's close sat roughly
                         mid-band (real published field, technical.json's
                         marketProfile.ibh/ibl -- IDX_Screener.py's existing
                         monthly-IB computation, not re-derived here).
  rsiDivBullish       -- RSI(10, EMA-smoothed) regular bullish divergence,
                         reusing IDX_Screener.py's own divergence_signals()
                         lifecycle-cluster detector (already used for the
                         standard RSI(14) divergence field), confirmed on
                         today's bar specifically.
  rsiDivHiddenBullish -- same detector, hidden-bullish (continuation) case.
  stochRsiGoldenCross -- Stochastic RSI (RSI length 10, Stochastic length
                         10, K 3, D 3) %K crosses above %D today while
                         RSI(10) < 30 (oversold).
  nearPqM1 / nearPqM2 -- close within NEAR_PCT of the previous quarter's
  nearPyM1 / nearPyM2    anchored-VWAP -1sigma/-2sigma band (previous year
                         for the PY pair) -- same hlc3*volume anchored-VWAP
                         formula as lib/indicators/anchoredVwap.ts.

Real inputs only -- a ticker with too little history for a given signal
gets `false`/`null` for it, never a guess.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rebuild_backend.IDX_Screener import divergence_signals  # noqa: E402

OHLCV_DIR = ROOT / "docs" / "data" / "ohlcv"
DATES_DIR = ROOT / "docs" / "data" / "dates"
LISTED_PATH = ROOT / "data_sources" / "idx-listed.json"

NEAR_PCT = 0.01  # "near" a VWAP sigma level = within 1% of it, either side


def rsi_ema(series: pd.Series, period: int = 10) -> pd.Series:
    """RSI with EMA-smoothed up/down averages (not Wilder's RMA) -- matches
    a "RSI Smoothing Type: EMA" chart setting."""
    delta = series.diff()
    up = delta.clip(lower=0).ewm(span=period, adjust=False).mean()
    dn = (-delta.clip(upper=0)).ewm(span=period, adjust=False).mean()
    rs = up / dn.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def rsi_wilder(series: pd.Series, period: int = 10) -> pd.Series:
    delta = series.diff()
    up = delta.clip(lower=0).ewm(alpha=1.0 / period, adjust=False).mean()
    dn = (-delta.clip(upper=0)).ewm(alpha=1.0 / period, adjust=False).mean()
    rs = up / dn.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def stoch_of(series: pd.Series, length: int = 10, k_smooth: int = 3, d_smooth: int = 3):
    lo = series.rolling(length).min()
    hi = series.rolling(length).max()
    rng = hi - lo
    raw = pd.Series(np.where(rng > 0, 100 * (series - lo) / rng, np.nan), index=series.index)
    k = raw.rolling(k_smooth).mean()
    d = k.rolling(d_smooth).mean()
    return k, d


def anchored_vwap_band(hist: pd.DataFrame, start: pd.Timestamp, end: pd.Timestamp):
    seg = hist.loc[(hist.index >= start) & (hist.index <= end)]
    if seg.empty:
        return None
    src = (seg["High"] + seg["Low"] + seg["Close"]) / 3
    vol = seg["Volume"].fillna(0).astype(float)
    cum_v = vol.sum()
    if cum_v <= 0:
        return None
    vwap = float((src * vol).sum() / cum_v)
    var = float(((src - vwap) ** 2 * vol).sum() / cum_v)
    sd = math.sqrt(max(var, 0))
    return {"vwap": vwap, "l1": vwap - sd, "l2": vwap - 2 * sd}


def quarter_start(ts: pd.Timestamp) -> pd.Timestamp:
    q = (ts.month - 1) // 3
    return pd.Timestamp(ts.year, q * 3 + 1, 1)


def prev_quarter_bounds(ts: pd.Timestamp):
    start = quarter_start(ts)
    prev_end = start - pd.Timedelta(days=1)
    prev_start = quarter_start(prev_end)
    return prev_start, prev_end


def prev_year_bounds(ts: pd.Timestamp):
    y = ts.year - 1
    return pd.Timestamp(y, 1, 1), pd.Timestamp(y, 12, 31)


def near(price: float | None, level: float | None) -> bool:
    if price is None or level is None or not math.isfinite(level) or level <= 0:
        return False
    return abs(price - level) / level <= NEAR_PCT


def load_hist(ticker: str, market_date: str) -> pd.DataFrame | None:
    path = OHLCV_DIR / market_date / f"{ticker}.json"
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    rows = payload.get("rows") or []
    if len(rows) < 30:
        return None
    df = pd.DataFrame(rows)
    df["Date"] = pd.to_datetime(df["date"])
    df = df.set_index("Date").sort_index()
    df = df.rename(columns={"open": "Open", "high": "High", "low": "Low", "close": "Close", "volume": "Volume"})
    return df[["Open", "High", "Low", "Close", "Volume"]].astype(float)


def ib_break(hist: pd.DataFrame, ibh: float | None, ibl: float | None) -> bool:
    if ibh is None or ibl is None or ibh <= ibl or len(hist) < 2:
        return False
    today = hist.iloc[-1]
    yday = hist.iloc[-2]
    band = ibh - ibl
    mid_lo, mid_hi = ibl + band * 0.25, ibl + band * 0.75
    was_middling = mid_lo <= yday["Close"] <= mid_hi
    breaks_today = today["Close"] > ibh and yday["Close"] <= ibh
    return bool(was_middling and breaks_today)


def rsi_divergence_today(hist: pd.DataFrame) -> tuple[bool, bool]:
    """(bullish_confirmed_today, hidden_bullish_confirmed_today), from
    RSI(10, EMA) via the shared lifecycle-cluster detector."""
    r = rsi_ema(hist["Close"], 10)
    res = divergence_signals(hist, r)
    if res.get("div_signal") != "Bullish":
        return False, False
    # div_ref2_date is formatted "%d %b '%y" for the LAST bar in `hist` when
    # the most recent cluster's representative bar is today -- compare
    # against today's own bar formatted the same way rather than re-deriving
    # cluster ages here.
    today_label = hist.index[-1].strftime("%d %b '%y")
    if res.get("div_ref2_date") != today_label:
        return False, False
    hidden = res.get("div_strength") == "Hidden"
    return (not hidden), hidden


def stoch_rsi_golden_cross_today(hist: pd.DataFrame) -> bool:
    r = rsi_wilder(hist["Close"], 10)
    k, d = stoch_of(r, length=10, k_smooth=3, d_smooth=3)
    if len(k) < 2 or pd.isna(k.iloc[-1]) or pd.isna(d.iloc[-1]) or pd.isna(k.iloc[-2]) or pd.isna(d.iloc[-2]):
        return False
    crossed = k.iloc[-2] <= d.iloc[-2] and k.iloc[-1] > d.iloc[-1]
    oversold = pd.notna(r.iloc[-1]) and r.iloc[-1] < 30
    return bool(crossed and oversold)


def near_vwap_flags(hist: pd.DataFrame, close: float) -> dict:
    last_date = hist.index[-1]
    pq_start, pq_end = prev_quarter_bounds(last_date)
    py_start, py_end = prev_year_bounds(last_date)
    pq = anchored_vwap_band(hist, pq_start, pq_end)
    py = anchored_vwap_band(hist, py_start, py_end)
    return {
        "nearPqM1": near(close, pq["l1"] if pq else None),
        "nearPqM2": near(close, pq["l2"] if pq else None),
        "nearPyM1": near(close, py["l1"] if py else None),
        "nearPyM2": near(close, py["l2"] if py else None),
    }


def main(market_date: str) -> None:
    tech_path = DATES_DIR / market_date / "technical.json"
    tech = json.loads(tech_path.read_text(encoding="utf-8"))
    tech_records = tech.get("records") or {}
    listed = json.loads(LISTED_PATH.read_text(encoding="utf-8"))
    tickers = sorted({r["ticker"] for r in listed["records"]})

    out: dict[str, dict] = {}
    for i, ticker in enumerate(tickers, 1):
        hist = load_hist(ticker, market_date)
        if hist is None:
            continue
        mp = ((tech_records.get(ticker) or {}).get("technical") or {}).get("marketProfile") or {}
        ibh, ibl = mp.get("ibh"), mp.get("ibl")
        close = float(hist["Close"].iloc[-1])
        bullish, hidden = rsi_divergence_today(hist)
        record = {
            "breakIbhIbl": ib_break(hist, ibh, ibl),
            "rsiDivBullish": bullish,
            "rsiDivHiddenBullish": hidden,
            "stochRsiGoldenCross": stoch_rsi_golden_cross_today(hist),
            **near_vwap_flags(hist, close),
        }
        if any(record.values()):
            out[ticker] = record
        if i % 200 == 0:
            print(f"[{i}/{len(tickers)}] ...")

    payload = {
        "schemaVersion": 1,
        "marketDate": market_date,
        "note": (
            "Screener filter signals computed from the published OHLCV archive. "
            "breakIbhIbl/rsiDiv*/stochRsiGoldenCross are 'today' events; "
            "nearPq*/nearPy* are current-state proximity flags. "
            f"'Near' = within {NEAR_PCT * 100:.0f}% of the level. Only tickers "
            "with at least one true flag are listed -- absence means all false."
        ),
        "records": out,
    }
    out_path = DATES_DIR / market_date / "screener_signals.json"
    out_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(out)} tickers with at least one signal -> {out_path}")


if __name__ == "__main__":
    market_date = sys.argv[1] if len(sys.argv) > 1 else None
    if not market_date:
        manifest = json.loads((ROOT / "docs" / "data" / "manifest.json").read_text(encoding="utf-8"))
        market_date = max(d["marketDate"] for d in manifest["dates"])
    main(market_date)
