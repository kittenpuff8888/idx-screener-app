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
  rsiDivBullish       -- RSI(10, Wilder-smoothed -- TradingView's own RSI
                         is always RMA-based at its core, EMA is only ever
                         an optional secondary smoothing line on top, never
                         the base) regular bullish divergence: a literal
                         port of TradingView's own built-in "RSI" study's
                         divergence logic. LOW makes a lower low while RSI
                         makes a higher low, comparing the two most recent
                         confirmed pivots from a plain 5-bars-each-side
                         centered pivot scan (`ta.pivotlow` with
                         lookbackLeft=lookbackRight=5), gated only on the
                         gap between them (5-60 bars) -- no RSI-value
                         threshold, no clustering; both of those were this
                         function's own earlier invention, not part of the
                         real pattern, and got replaced after directly
                         reproducing a live TradingView-vs-screener mismatch
                         the user reported (BUKK, 2026-09-11: TradingView's
                         own chart marks its last divergence at 14 Aug with
                         nothing new since; the old version here reported a
                         spurious 09 Sep). Reversal-style: both pivots must
                         be confirmed swing lows, so confirmation lags the
                         more recent pivot by swing_window bars (pivot date
                         shown is that more recent pivot, not today).
  rsiDivHiddenBullish -- same RSI (also switched to Wilder), hidden-bullish
                         (continuation) case: CLOSE makes a Higher Low while
                         RSI makes a Lower Low, with the earlier pivot's RSI
                         required to start from a healthy 50-70 band (not
                         itself weak or oversold), pivot no more than ~4
                         weeks back. No official TradingView script covers
                         this hidden/continuation variant (only regular
                         bullish/bearish), so this half is still this
                         project's own design -- validated against a real
                         example (BEST 13 Aug -> 26 Aug) rather than a
                         reference script. Candidates are filtered to the
                         band FIRST, then clustered (representative = lowest
                         RSI among the already-in-band bars) -- clustering
                         after the band filter, not before: clustering raw
                         swing lows first and band-testing only each
                         cluster's single deepest point silently drops
                         genuinely in-band bars whenever a deeper,
                         out-of-band dip chains onto the same cluster; this
                         order can't lose an individually valid bar that
                         way. Continuation-style: only the earlier pivot
                         needs confirming; today's own bar is compared
                         directly, so this confirms same-day (pivot date
                         shown is the earlier reference point).
  breakSma200         -- today's close crosses above SMA200 (yesterday's
                         close was at or below it).
  emaGoldenCross      -- EMA25 crosses above EMA50 today (yesterday EMA25
                         was at or below EMA50).
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


def _cluster_positions(positions: list[int], max_gap: int) -> list[list[int]]:
    """Merge pivot positions that are within max_gap bars of the previous
    one in the run into a single lifecycle cluster -- several small wiggles
    inside one dip/rally count as one event, not several independent
    pivots. Ported from IDX_Screener.py's divergence_signals()."""
    if not positions:
        return []
    clusters = [[positions[0]]]
    for p in positions[1:]:
        if p - clusters[-1][-1] <= max_gap:
            clusters[-1].append(p)
        else:
            clusters.append([p])
    return clusters


def regular_bullish_divergence(hist: pd.DataFrame, lookback=150, swing_window=5, min_separation=5, max_pivot_gap=60, max_last_swing_age=20) -> dict | None:
    """Regular Bullish RSI(10, Wilder) divergence -- a literal port of
    TradingView's own built-in "RSI" indicator's divergence logic
    (calculateDivergence=true path: `ta.pivotlow(rsi, 5, 5)`, compare the
    two most recent confirmed pivots, LOW makes a lower low while RSI
    makes a higher low, gap 5-60 bars, no RSI-value gate at all).

    Two corrections from an earlier version of this function, both found
    by directly reproducing a real, exact mismatch the user reported
    between this screener and a live TradingView chart (BUKK, 2026-09-11:
    TradingView's own divergence marker sits at 14 Aug with nothing new
    since; this function previously reported a spurious 09 Sep match):

    1. RSI basis was rsi_ema(10, EMA-smoothed) -- WRONG. TradingView's own
       RSI (any length) always uses `ta.rma` (Wilder/RMA smoothing) for
       the base line itself; EMA is only ever an optional secondary
       *smoothing* line drawn on top, never the RSI values TradingView's
       divergence logic (or its plotted RSI value) is computed from.
       Switched to rsi_wilder(10) -- confirmed this alone starts
       reproducing TradingView's real pivot dates.
    2. Pivot window was 2 bars each side with an RSI<30 oversold gate and
       a lifecycle-clustering step -- none of that exists in TradingView's
       own script. It uses a plain 5-bars-each-side centered pivot test
       (stronger, so far fewer/less noisy candidates qualify than a
       2-bar test does) and gates purely on the gap between the two most
       recent confirmed pivots (5-60 bars) -- no RSI-value threshold, no
       clustering. A "regular bullish divergence" in the standard
       definition can happen with RSI anywhere, not only when it dipped
       below 30; requiring that was this function's own invention, not
       part of the actual pattern.

    Verified directly against TradingView's live chart for BUKK
    (2026-09-11): this reproduces the exact 29 Jul -> 14 Aug pivot pair,
    the same one TradingView itself draws, with nothing newer confirmed
    since -- matching "none today" exactly.

    i2 is the most recent CONFIRMED pivot (needing swing_window bars after
    it, same as i1) -- not forced to today, matching TradingView's own
    plot (offset=-lookbackRight: the marker is drawn AT the pivot bar,
    which is necessarily swing_window bars before whatever bar the
    pattern was actually confirmed on)."""
    if hist is None or hist.empty or len(hist) < 25:
        return None
    df = hist.tail(lookback)
    low = df["Low"].astype(float).values
    r = rsi_wilder(df["Close"].astype(float), 10).values

    pivots = _swing_low_positions(r, swing_window)
    if len(pivots) < 2:
        return None
    i1, i2 = pivots[-2], pivots[-1]
    if (i2 - i1) < min_separation or (i2 - i1) > max_pivot_gap or (len(df) - 1 - i2) > max_last_swing_age:
        return None
    p1, p2 = float(low[i1]), float(low[i2])
    r1, r2 = float(r[i1]), float(r[i2])
    if any(np.isnan(x) for x in (p1, p2, r1, r2)):
        return None
    if not (p2 < p1 and r2 > r1):
        return None
    return {"i2": i2, "ref2_date": df.index[i2].strftime("%d %b '%y"), "p1": p1, "p2": p2, "r1": r1, "r2": r2}


def regular_bullish_divergence_today(hist: pd.DataFrame) -> tuple[bool, str | None]:
    """Regular Bullish divergence newly confirmed today -- "confirmed
    today" means the signal reads Bullish on today's full history but
    didn't (or pointed at a different pivot pair) on yesterday's, i.e. it
    just became visible with today's bar providing the confirming swing
    point for i2. Returns (confirmed_today, pivot_date) -- pivot_date is
    i2, the more recent of the two pivots (which is NOT today itself: see
    the module docstring on why confirmation lags the pivot by
    swing_window bars for this reversal-style detector)."""
    today = regular_bullish_divergence(hist)
    if today is None:
        return False, None
    yday = regular_bullish_divergence(hist.iloc[:-1])
    newly_confirmed = yday is None or yday["ref2_date"] != today["ref2_date"]
    if not newly_confirmed:
        return False, None
    return True, today["ref2_date"]


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


def hidden_bullish_divergence(hist: pd.DataFrame, lookback=75, swing_window=2, max_pivot_gap=20, cluster_gap=3, price_tol=0.0075, rsi_tol=2.0, rsi_band_lo=50.0, rsi_band_hi=70.0) -> dict | None:
    """Hidden bullish RSI(10, EMA) divergence: CLOSE makes a HIGHER low
    while RSI makes a LOWER low -- an uptrend-continuation pattern that, by
    definition, happens on a shallow pullback, not at a deep oversold
    extreme. Deliberately no RSI<30 gate -- real hidden-bullish cases sit
    with RSI in the 40s-50s. Validated against a real example: BEST
    2026-08-13 (RSI 51.8, close 109) -> 2026-08-26 (RSI 47.5, close 117), 7
    bars apart -- price Higher Low + RSI Lower Low. RSI basis switched from
    rsi_ema to rsi_wilder alongside regular_bullish_divergence()'s same fix
    -- TradingView's own RSI (any length) is always Wilder/RMA-smoothed at
    its base, confirmed live for this function too (BEST's pair above
    still confirms, with r1/r2 shifting from 51.8/47.5 to 56.7/54.2 -- the
    same two calendar pivots, just Wilder's own numbers for them).

    i2 is always the LAST bar (today) directly, same reasoning as
    regular_bullish_divergence(): comparing today's own RSI/price against
    the most recent already-confirmed pivot (i1) means the pivot pair's
    later date and the date the screener shows it are the same day, rather
    than lagging by swing_window bars the way a centered pivot scan on
    today's own bar would. BEST's pair above now confirms directly on
    2026-08-26, not 2026-08-28.

    The earlier pivot (r1) must sit in (rsi_band_lo, rsi_band_hi) -- the
    trend has to already be healthy (not itself weak or oversold) before a
    pullback can be "shallow" relative to it. Gate is on r1 only, not r2:
    the whole point of the pattern is r2 dips BELOW r1, so r1's 50-70 floor
    doesn't force r2 there too (BEST's real r2 above is 47.5, just under
    50 -- still a valid shallow pullback since r1=51.8 was in-band). Without
    this gate a case like PYFA's 2026-08-13/26 pair (r1=42.4, r2=40.2 -- an
    already-weak trend, not a healthy one taking a shallow dip) would
    incorrectly pass just because r2 < r1.

    Candidates are filtered to the 50-70 band FIRST, then clustered
    (representative = lowest RSI among the already-in-band bars in that
    cluster) -- clustering before the band filter instead (cluster all raw
    swing lows, then band-test only each cluster's single deepest point,
    IDX_Screener.py's own order for its single-threshold <30/>70 gates)
    silently drops genuinely in-band bars whenever a nearby deeper,
    out-of-band dip chains onto the same cluster and becomes its
    representative. Confirmed live: with band-filter-after-clustering and
    the reference's own cluster_gap=6, BEST's 13 Aug bar (RSI 51.8, in-band)
    chained into a 24-bar cluster (13 Jul-13 Aug) whose deepest point (29
    Jul, RSI 30) is NOT in-band, so the whole cluster -- 13 Aug included --
    got dropped and this signal's original validation case disappeared.
    Filtering to the band before clustering can't lose an individually
    valid bar that way.

    max_pivot_gap is much tighter than regular_bullish_divergence()'s (20
    bars, ~4 weeks, vs 60): once 13 Aug is excluded as PYFA's anchor by the
    band gate above, the candidate search falls back to the next-eligible
    swing low, which for PYFA is 2026-07-20 -- 25 bars back, a 5-week
    reach that isn't a "shallow" pullback by any reasonable reading of the
    term. Capping the gap at 20 bars excludes that fallback while still
    comfortably covering BEST's real 7-bar case."""
    if hist is None or hist.empty or len(hist) < 25:
        return None
    df = hist.tail(lookback)
    close = df["Close"].astype(float).values
    r = rsi_wilder(df["Close"].astype(float), 10).values
    i2 = len(df) - 1
    if np.isnan(r[i2]):
        return None

    band_pos = [i for i in _swing_low_positions(r, swing_window) if not np.isnan(r[i]) and rsi_band_lo < r[i] < rsi_band_hi]
    if not band_pos:
        return None
    last_cluster = _cluster_positions(band_pos, cluster_gap)[-1]
    i1 = min(last_cluster, key=lambda i: r[i])
    if (i2 - i1) > max_pivot_gap:
        return None
    p1, p2 = float(close[i1]), float(close[i2])
    r1, r2 = float(r[i1]), float(r[i2])
    if any(np.isnan(x) for x in (p1, p2, r1, r2)):
        return None
    price_higher_low = p2 > p1 + abs(p1) * price_tol
    rsi_lower_low = r2 < r1 - rsi_tol
    if not (price_higher_low and rsi_lower_low):
        return None
    return {"i1": i1, "ref1_date": df.index[i1].strftime("%d %b '%y"), "p1": p1, "p2": p2, "r1": r1, "r2": r2}


def hidden_bullish_divergence_today(hist: pd.DataFrame) -> tuple[bool, str | None]:
    """Hidden bullish divergence newly confirmed today -- same "confirmed
    today" diff-vs-yesterday / i1-changed approach as
    regular_bullish_divergence_today(); see its docstring. Returns
    (confirmed_today, pivot_date) -- pivot_date is i1, the earlier reference
    low (not today, which is implied)."""
    today = hidden_bullish_divergence(hist)
    if today is None:
        return False, None
    yday = hidden_bullish_divergence(hist.iloc[:-1])
    newly_confirmed = yday is None or yday["i1"] != today["i1"]
    if not newly_confirmed:
        return False, None
    return True, today["ref1_date"]


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
    """Stoch RSI sitting in its own oversold band -- K AND D both under 20
    today, K still at or below D (hasn't crossed yet) but converging on it
    (today's K-D gap narrower than yesterday's, i.e. K visibly closing in on
    a cross) -- an earlier, higher-lead-time companion to
    stoch_rsi_golden_cross_today(). By construction a confirmed golden
    cross can only be seen after the bounce that produces it has already
    moved price (there is no way to see tomorrow's cross today), so this
    flags the watch-for-a-turn state instead of the confirmed turn itself.

    D<20 is required, not just K<20: K alone dipping under 20 for a bar or
    two while D is still elevated (e.g. K=15, D=45) is a fast wiggle inside
    an otherwise-elevated Stoch RSI, not a genuine oversold reading -- both
    lines need to be down in the band together. Real counterexample this
    fixes: a ticker whose K/D actually read ~57/~70 (nowhere near oversold)
    was passing the old K-only check on an earlier bar where K alone had
    briefly dipped under 20.

    Unlike the golden-cross signal, this is a CURRENT-STATE flag (true on
    every day the condition holds, like nearPq*/nearPy*), not a one-day
    'today' event -- a ticker can sit oversold for many sessions before
    (or without ever) crossing, so this fires far more often and with much
    lower precision than the confirmed cross; a watchlist signal, not an
    entry trigger."""
    r = rsi_wilder(hist["Close"], 10)
    k, d = stoch_of(r, length=10, k_smooth=3, d_smooth=3)
    if len(k) < 2 or pd.isna(k.iloc[-1]) or pd.isna(d.iloc[-1]) or pd.isna(k.iloc[-2]) or pd.isna(d.iloc[-2]):
        return False
    both_oversold = k.iloc[-1] < 20 and d.iloc[-1] < 20
    not_yet_crossed = k.iloc[-1] <= d.iloc[-1]
    converging = (d.iloc[-1] - k.iloc[-1]) < (d.iloc[-2] - k.iloc[-2])
    return bool(both_oversold and not_yet_crossed and converging)


def break_sma200_today(hist: pd.DataFrame) -> bool:
    """Today's close crosses above SMA200 -- yesterday's close was at or
    below it, today's is above. A standard long-term trend-change signal.
    False (not a guess) for a ticker with under 200 bars of history, same
    as every other signal here."""
    close = hist["Close"]
    s200 = close.rolling(200).mean()
    if len(s200) < 2 or pd.isna(s200.iloc[-1]) or pd.isna(s200.iloc[-2]):
        return False
    return bool(close.iloc[-2] <= s200.iloc[-2] and close.iloc[-1] > s200.iloc[-1])


def ema_golden_cross_today(hist: pd.DataFrame) -> bool:
    """EMA25 crosses above EMA50 today -- yesterday EMA25 was at or below
    EMA50, today it's above. Matches the site's own chart default overlay
    (EMA 25 / EMA 50, see lib/data/chartStudies.ts)."""
    close = hist["Close"]
    e25 = close.ewm(span=25, adjust=False).mean()
    e50 = close.ewm(span=50, adjust=False).mean()
    if len(e25) < 2 or pd.isna(e25.iloc[-1]) or pd.isna(e50.iloc[-1]) or pd.isna(e25.iloc[-2]) or pd.isna(e50.iloc[-2]):
        return False
    return bool(e25.iloc[-2] <= e50.iloc[-2] and e25.iloc[-1] > e50.iloc[-1])


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
        rsi_div_bullish, rsi_div_bullish_pivot = regular_bullish_divergence_today(hist)
        rsi_div_hidden, rsi_div_hidden_pivot = hidden_bullish_divergence_today(hist)
        record = {
            "breakIbhIbl": ib_break(hist, ibh, ibl),
            "rsiDivBullish": rsi_div_bullish,
            "rsiDivBullishPivotDate": rsi_div_bullish_pivot,
            "rsiDivHiddenBullish": rsi_div_hidden,
            "rsiDivHiddenBullishPivotDate": rsi_div_hidden_pivot,
            "stochRsiGoldenCross": stoch_rsi_golden_cross_today(hist),
            "stochRsiOversold": stoch_rsi_oversold_today(hist),
            "breakSma200": break_sma200_today(hist),
            "emaGoldenCross": ema_golden_cross_today(hist),
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
