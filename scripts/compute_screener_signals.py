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


def available_ohlcv_snapshots() -> list[str]:
    """Every date with its own full OHLCV archive, sorted ascending. Most
    of docs/data/dates/<date>/ are lighter snapshots (no docs/data/ohlcv/
    <date>/ folder at all) -- see load_hist()'s snapshot-selection docstring."""
    return sorted(p.name for p in OHLCV_DIR.iterdir() if p.is_dir())


def load_hist(ticker: str, snapshot_date: str, as_of_date: str | None = None) -> pd.DataFrame | None:
    """Load `ticker`'s OHLCV from the `snapshot_date` archive, trimmed to
    bars on or before `as_of_date` (defaults to `snapshot_date` itself).

    A full OHLCV snapshot's `rows` already holds a ticker's entire trailing
    history up to that snapshot's date, not just that one day -- so a date
    with no dedicated snapshot of its own (most of docs/data/dates/, ~90%
    of the archive) can still get a real, correctly-timed signal by reading
    the nearest LATER snapshot and trimming it back down to the actual
    target date, rather than being skipped for lack of a same-named
    archive folder."""
    path = OHLCV_DIR / snapshot_date / f"{ticker}.json"
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
    df = df[["Open", "High", "Low", "Close", "Volume"]].astype(float)
    if as_of_date is not None and as_of_date != snapshot_date:
        df = df.loc[df.index <= pd.Timestamp(as_of_date)]
    if len(df) < 30:
        return None
    return df


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


def rsi_divergence_today(hist: pd.DataFrame) -> tuple[bool, str | None]:
    """Regular Bullish RSI(10, EMA) divergence confirmed today, from the
    shared lifecycle-cluster detector -- price Lower Low + RSI Higher Low,
    at a genuine oversold extreme (the detector requires the RSI cluster to
    dip below 30). This is the classic reversal-style divergence; see
    hidden_bullish_divergence_today() below for the shallow-pullback variant.

    Returns (confirmed_today, pivot_date) -- pivot_date is the more recent
    of the two pivot bars the divergence is anchored on (div_ref2_date,
    "%d %b '%y"), which is NOT the same as "today": see the note below on
    why confirmation always lags the pivot by >= swing_window bars. Exposed
    so the UI can show both dates rather than just the confirmation date,
    after repeated real-example confusion over "why didn't it show on the
    pivot's own day".

    divergence_signals()'s own swing-pivot scan (`range(w, len(vals) - w)`)
    never lets the last `swing_window` bars become a pivot, so a cluster's
    representative date can never equal today's bar -- comparing
    div_ref2_date to today's own date (an earlier approach here) was
    therefore always false. "Confirmed today" instead means: the signal
    reads Bullish on today's full history but did not read that way (or
    pointed at a different cluster) on yesterday's -- i.e. it just became
    visible with today's bar providing the confirming swing point."""
    r = rsi_ema(hist["Close"], 10)
    res_today = divergence_signals(hist, r)
    if res_today.get("div_signal") != "Bullish" or res_today.get("div_strength") == "Hidden":
        return False, None
    prior = hist.iloc[:-1]
    res_yday = divergence_signals(prior, rsi_ema(prior["Close"], 10))
    newly_confirmed = res_yday.get("div_signal") != "Bullish" or res_yday.get("div_ref2_date") != res_today.get("div_ref2_date")
    if not newly_confirmed:
        return False, None
    return True, res_today.get("div_ref2_date")


def _swing_low_positions(vals: np.ndarray, w: int) -> list[int]:
    pos = []
    for i in range(w, len(vals) - w):
        c = vals[i]
        if np.isnan(c):
            continue
        left, right = vals[i - w:i], vals[i + 1:i + w + 1]
        if np.all(np.isnan(left)) or np.all(np.isnan(right)):
            continue
        if c <= np.nanmin(left) and c <= np.nanmin(right):
            pos.append(i)
    return pos


def _cluster_positions(positions: list[int], max_gap: int) -> list[list[int]]:
    if not positions:
        return []
    clusters = [[positions[0]]]
    for p in positions[1:]:
        if p - clusters[-1][-1] <= max_gap:
            clusters[-1].append(p)
        else:
            clusters.append([p])
    return clusters


def hidden_bullish_divergence(hist: pd.DataFrame, lookback=75, swing_window=2, cluster_gap=6, min_separation=4, price_tol=0.0075, rsi_tol=2.0, max_last_swing_age=20) -> dict | None:
    """Hidden bullish RSI(10, EMA) divergence: price makes a HIGHER low
    while RSI makes a LOWER low -- an uptrend-continuation pattern that, by
    definition, happens on a shallow pullback, not at a deep oversold
    extreme. divergence_signals()'s shared detector requires its low-RSI
    cluster to dip below 30 before a cluster is even eligible, which is
    right for a reversal-style regular Bullish divergence but wrong here --
    it misses real hidden-bullish cases with RSI sitting in the 40s-50s.
    Deliberately no RSI<30 gate. Validated against a real example: BEST
    2026-08-13 (RSI 51.8, low 109) -> 2026-08-26 (RSI 47.5, low 117) --
    price Higher Low + RSI Lower Low, confirmed 2026-08-28 once the pivot
    had its 2 confirming bars.

    Returns the chosen pivot pair's dict (with `i2`, the confirming bar's
    position) when found, else None -- mirrors divergence_signals()'s
    lifecycle-cluster/pairing logic exactly, just without the oversold gate."""
    if hist is None or hist.empty or len(hist) < 25:
        return None
    df = hist.tail(lookback)
    close = df["Close"].astype(float)
    low = df["Low"].astype(float)
    r = rsi_ema(close, 10).values

    # Deliberately NOT clustered (unlike divergence_signals()'s regular-
    # bullish path): clustering chains together every pivot within
    # cluster_gap bars of the previous one, which over a multi-week uptrend
    # can chain-link pivots spanning 5+ weeks into one group and collapse
    # it down to its single deepest-RSI point -- silently discarding the
    # actual most recent, shallower pivot a hidden-bullish pattern needs.
    # Validated against BEST: clustering picked 2026-07-29 (RSI 30.0, the
    # cluster's oversold extreme) instead of the real pivot at 2026-08-13
    # (RSI 51.8). Comparing the last two INDIVIDUAL swing lows directly
    # avoids that and matches the real example exactly.
    pos = _swing_low_positions(r, swing_window)
    if len(pos) < 2:
        return None
    i1, i2 = pos[-2], pos[-1]
    if (i2 - i1) < min_separation or (len(df) - 1 - i2) > max_last_swing_age:
        return None
    p1, p2 = float(low.iloc[i1]), float(low.iloc[i2])
    r1, r2 = float(r[i1]), float(r[i2])
    if any(np.isnan(x) for x in (p1, p2, r1, r2)):
        return None
    price_higher_low = p2 > p1 + abs(p1) * price_tol
    rsi_lower_low = r2 < r1 - rsi_tol
    if not (price_higher_low and rsi_lower_low):
        return None
    return {"i2": i2, "ref2_date": df.index[i2].strftime("%d %b '%y"), "p1": p1, "p2": p2, "r1": r1, "r2": r2}


def hidden_bullish_divergence_today(hist: pd.DataFrame) -> tuple[bool, str | None]:
    """Hidden bullish divergence newly confirmed today -- same "confirmed
    today" diff-vs-yesterday approach as rsi_divergence_today(), since the
    swing-pivot scan can never mark today's own bar as a pivot either.
    Returns (confirmed_today, pivot_date) -- see rsi_divergence_today()'s
    docstring for why pivot_date is not "today"."""
    today = hidden_bullish_divergence(hist)
    if today is None:
        return False, None
    yday = hidden_bullish_divergence(hist.iloc[:-1])
    newly_confirmed = yday is None or yday["ref2_date"] != today["ref2_date"]
    if not newly_confirmed:
        return False, None
    return True, today["ref2_date"]


def stoch_rsi_golden_cross_today(hist: pd.DataFrame) -> bool:
    """K crosses above D today while the cross originates from the Stoch
    RSI's own oversold band (K and D both below 20 just before crossing) --
    "oversold" here means the STOCHASTIC-OF-RSI reading itself, the same
    dashed 20/80 bands a Stoch RSI chart draws, not the underlying RSI(10)
    value. Verified against BEST 2026-07-30: RSI(10) was 48.9 (not <30) but
    K/D were 8.1/16.6 just before crossing to 19.3/13.3 -- a real golden
    cross a raw-RSI<30 gate would have missed."""
    r = rsi_wilder(hist["Close"], 10)
    k, d = stoch_of(r, length=10, k_smooth=3, d_smooth=3)
    if len(k) < 2 or pd.isna(k.iloc[-1]) or pd.isna(d.iloc[-1]) or pd.isna(k.iloc[-2]) or pd.isna(d.iloc[-2]):
        return False
    crossed = k.iloc[-2] <= d.iloc[-2] and k.iloc[-1] > d.iloc[-1]
    oversold = k.iloc[-2] < 20 and d.iloc[-2] < 20
    return bool(crossed and oversold)


def stoch_rsi_oversold_today(hist: pd.DataFrame) -> bool:
    """Stoch RSI sitting in its own oversold band (K < 20) today but not yet
    crossed above D -- an earlier, higher-lead-time companion to
    stoch_rsi_golden_cross_today(). By construction a confirmed golden
    cross can only be seen after the bounce that produces it has already
    moved price (there is no way to see tomorrow's cross today), so this
    flags the watch-for-a-turn state instead of the confirmed turn itself.
    Unlike the golden-cross signal, this is a CURRENT-STATE flag (true on
    every day the condition holds, like nearPq*/nearPy*), not a one-day
    'today' event -- a ticker can sit oversold for many sessions before
    (or without ever) crossing, so this fires far more often and with much
    lower precision than the confirmed cross; a watchlist signal, not an
    entry trigger."""
    r = rsi_wilder(hist["Close"], 10)
    k, d = stoch_of(r, length=10, k_smooth=3, d_smooth=3)
    if len(k) < 1 or pd.isna(k.iloc[-1]) or pd.isna(d.iloc[-1]):
        return False
    return bool(k.iloc[-1] < 20 and k.iloc[-1] <= d.iloc[-1])


def monday_range(hist: pd.DataFrame) -> dict | None:
    """High/low of the current week's first published trading session
    (Monday, or the first session of the week when Monday itself was a
    holiday) plus where today's close sits vs that range -- same
    week-start rule as lib/valuation/priceLevels.ts's buildMondayRangeLevels
    (a day-of-week reset: this bar's weekday <= the previous bar's)."""
    if hist is None or len(hist) < 2:
        return None
    dows = hist.index.dayofweek.to_numpy()
    start = 0
    for i in range(1, len(dows)):
        if dows[i] <= dows[i - 1]:
            start = i
    row = hist.iloc[start]
    close = float(hist["Close"].iloc[-1])
    hi, lo = float(row["High"]), float(row["Low"])
    status = "Above" if close > hi else "Below" if close < lo else "Within"
    return {"high": hi, "low": lo, "date": hist.index[start].strftime("%Y-%m-%d"), "status": status}


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


def vwap_reading(band: dict | None, close: float) -> dict | None:
    """{vwap, sigma} for the Screener table's Previous QVWAP/YVWAP columns --
    sigma is how many standard deviations `close` sits from the anchored
    VWAP (band["l1"] is -1sigma, so vwap-l1 is one sigma). None when the
    anchor window has no data (band is None) or was degenerate (sd is 0,
    e.g. a single print with itself as both high and low)."""
    if band is None:
        return None
    sd = band["vwap"] - band["l1"]
    return {"vwap": band["vwap"], "sigma": (close - band["vwap"]) / sd if sd > 0 else None}


def pq_py_vwap_readings(hist: pd.DataFrame, close: float) -> dict:
    """Raw Previous-Quarter/Previous-Year anchored-VWAP readings, for
    archives whose technical.json predates the vwapProfiles field (see
    lib/data/screenerUniverse.ts's fallback for why this is needed at all --
    it reads this only when technical.json itself doesn't have the real
    reading)."""
    last_date = hist.index[-1]
    pq_start, pq_end = prev_quarter_bounds(last_date)
    py_start, py_end = prev_year_bounds(last_date)
    return {
        "pq": vwap_reading(anchored_vwap_band(hist, pq_start, pq_end), close),
        "py": vwap_reading(anchored_vwap_band(hist, py_start, py_end), close),
    }


def pick_snapshot(market_date: str, snapshots: list[str]) -> str | None:
    """Nearest OHLCV snapshot on or after `market_date` -- its `rows` cover
    every earlier trading day too, so it can stand in for a date that has
    no dedicated archive of its own. None if `market_date` is newer than
    every snapshot taken so far (nothing to trim down from yet)."""
    if market_date in snapshots:
        return market_date
    for s in snapshots:
        if s >= market_date:
            return s
    return None


def main(market_date: str) -> None:
    tech_path = DATES_DIR / market_date / "technical.json"
    tech = json.loads(tech_path.read_text(encoding="utf-8"))
    tech_records = tech.get("records") or {}
    listed = json.loads(LISTED_PATH.read_text(encoding="utf-8"))
    tickers = sorted({r["ticker"] for r in listed["records"]})

    snapshot_date = pick_snapshot(market_date, available_ohlcv_snapshots())
    if snapshot_date is None:
        print(f"No OHLCV snapshot on or after {market_date} yet -- nothing to compute from.")
        return
    if snapshot_date != market_date:
        print(f"{market_date} has no dedicated OHLCV archive -- reconstructing from the {snapshot_date} snapshot, trimmed back.")

    out: dict[str, dict] = {}
    monday: dict[str, dict] = {}
    vwap_out: dict[str, dict] = {}
    for i, ticker in enumerate(tickers, 1):
        hist = load_hist(ticker, snapshot_date, market_date)
        if hist is None:
            continue
        mp = ((tech_records.get(ticker) or {}).get("technical") or {}).get("marketProfile") or {}
        ibh, ibl = mp.get("ibh"), mp.get("ibl")
        close = float(hist["Close"].iloc[-1])
        rsi_div_bullish, rsi_div_bullish_pivot = rsi_divergence_today(hist)
        rsi_div_hidden, rsi_div_hidden_pivot = hidden_bullish_divergence_today(hist)
        record = {
            "breakIbhIbl": ib_break(hist, ibh, ibl),
            "rsiDivBullish": rsi_div_bullish,
            "rsiDivBullishPivotDate": rsi_div_bullish_pivot,
            "rsiDivHiddenBullish": rsi_div_hidden,
            "rsiDivHiddenBullishPivotDate": rsi_div_hidden_pivot,
            "stochRsiGoldenCross": stoch_rsi_golden_cross_today(hist),
            "stochRsiOversold": stoch_rsi_oversold_today(hist),
            **near_vwap_flags(hist, close),
        }
        if any(v for k, v in record.items() if not k.endswith("PivotDate")):
            out[ticker] = record
        mr = monday_range(hist)
        if mr is not None:
            monday[ticker] = mr
        vwap = pq_py_vwap_readings(hist, close)
        if vwap["pq"] is not None or vwap["py"] is not None:
            vwap_out[ticker] = vwap
        if i % 200 == 0:
            print(f"[{i}/{len(tickers)}] ...")

    payload = {
        "schemaVersion": 2,
        "marketDate": market_date,
        "note": (
            "Screener filter signals computed from the published OHLCV archive. "
            "breakIbhIbl/rsiDiv*/stochRsiGoldenCross are 'today' events; "
            "nearPq*/nearPy* are current-state proximity flags. "
            f"'Near' = within {NEAR_PCT * 100:.0f}% of the level. Only tickers "
            "with at least one true flag are listed in `records` -- absence "
            "means all false. `mondayRange` and `vwap` are populated for every "
            "ticker with enough history (display fields, not sparse signal "
            "lists) -- `vwap` is a fallback source for archives whose "
            "technical.json predates the vwapProfiles field."
        ),
        "records": out,
        "mondayRange": monday,
        "vwap": vwap_out,
    }
    out_path = DATES_DIR / market_date / "screener_signals.json"
    out_path.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Wrote {len(out)} tickers with at least one signal, {len(monday)} with mondayRange -> {out_path}")


if __name__ == "__main__":
    market_date = sys.argv[1] if len(sys.argv) > 1 else None
    if not market_date:
        manifest = json.loads((ROOT / "docs" / "data" / "manifest.json").read_text(encoding="utf-8"))
        market_date = max(d["marketDate"] for d in manifest["dates"])
    main(market_date)
