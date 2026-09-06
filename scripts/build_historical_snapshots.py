from __future__ import annotations

import json
import math
import shutil
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from statistics import fmean
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from rebuild_backend.sector_normalization import normalize_idx_sector

DOCS = ROOT / "docs"
DATA = DOCS / "data"
SOURCE_DATE = "2026-06-10"
START_DATE = "2026-01-01"
END_DATE = "2026-06-10"
OHLCV_DIR = DATA / "ohlcv" / SOURCE_DATE
SNAPSHOT_DIR = ROOT / "data_sources" / "legacy-snapshots"
LATEST_PAYLOAD = ROOT / "data_sources" / "full-workbook" / f"{SOURCE_DATE}.json"
MANIFEST_PATH = DATA / "manifest.json"


def number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def ema(values: list[float | None], period: int) -> list[float | None]:
    multiplier = 2 / (period + 1)
    current: float | None = None
    output: list[float | None] = []
    for value in values:
        if value is not None:
            current = value if current is None else value * multiplier + current * (1 - multiplier)
        output.append(current)
    return output


def sma(values: list[float | None], period: int) -> list[float | None]:
    output: list[float | None] = []
    window: list[float | None] = []
    total = 0.0
    valid = 0
    for value in values:
        window.append(value)
        if value is not None:
            total += value
            valid += 1
        if len(window) > period:
            removed = window.pop(0)
            if removed is not None:
                total -= removed
                valid -= 1
        output.append(total / period if len(window) == period and valid == period else None)
    return output


def rma(values: list[float | None], period: int) -> list[float | None]:
    output: list[float | None] = []
    current: float | None = None
    for index, value in enumerate(values):
        if value is None:
            output.append(current)
            continue
        if current is None:
            seed = [item for item in values[max(0, index - period + 1):index + 1] if item is not None]
            current = fmean(seed) if len(seed) == period else None
        else:
            current = (current * (period - 1) + value) / period
        output.append(current)
    return output


def last_valid(values: list[float | None], index: int) -> float | None:
    if index < 0 or index >= len(values):
        return None
    return values[index]


def rolling_min(values: list[float | None], period: int) -> list[float | None]:
    output: list[float | None] = []
    for i in range(len(values)):
        window = [v for v in values[max(0, i - period + 1):i + 1] if v is not None]
        output.append(min(window) if len(window) == min(period, i + 1) and window else None)
    return output


def rolling_max(values: list[float | None], period: int) -> list[float | None]:
    output: list[float | None] = []
    for i in range(len(values)):
        window = [v for v in values[max(0, i - period + 1):i + 1] if v is not None]
        output.append(max(window) if len(window) == min(period, i + 1) and window else None)
    return output


def _swing_high_positions(values: list[float | None], window: int = 2) -> list[int]:
    positions = []
    for i in range(window, len(values) - window):
        c = values[i]
        if c is None:
            continue
        left = [v for v in values[i - window:i] if v is not None]
        right = [v for v in values[i + 1:i + window + 1] if v is not None]
        if left and right and c >= max(left) and c >= max(right):
            positions.append(i)
    return positions


def _swing_low_positions(values: list[float | None], window: int = 2) -> list[int]:
    positions = []
    for i in range(window, len(values) - window):
        c = values[i]
        if c is None:
            continue
        left = [v for v in values[i - window:i] if v is not None]
        right = [v for v in values[i + 1:i + window + 1] if v is not None]
        if left and right and c <= min(left) and c <= min(right):
            positions.append(i)
    return positions


def _cluster_positions(positions: list[int], max_gap: int = 6) -> list[list[int]]:
    if not positions:
        return []
    clusters = [[positions[0]]]
    for p in positions[1:]:
        if p - clusters[-1][-1] <= max_gap:
            clusters[-1].append(p)
        else:
            clusters.append([p])
    return clusters


def compute_rsi_divergence(
    highs: list[float | None],
    lows: list[float | None],
    rsi_values: list[float | None],
    index: int,
    *,
    lookback: int = 75,
    swing_window: int = 2,
    cluster_gap: int = 6,
    min_separation: int = 4,
    price_tol: float = 0.0075,
    rsi_tol: float = 2.0,
    max_last_swing_age: int = 20,
) -> dict[str, str | None]:
    """
    Pure-Python port of rebuild_backend.IDX_Screener.divergence_signals()'s
    lifecycle-cluster method -- ported rather than reimplemented from scratch
    so incremental-day results match full-workbook-day results for the same
    price action, instead of two different divergence definitions disagreeing
    with each other on different dates for the same ticker.

    Bearish = last 2 RSI-high clusters where cluster max RSI > 70.
    Bullish = last 2 RSI-low clusters where cluster min RSI < 30.
    Anchored at `index` (this date), not always the end of the full series.
    """
    empty = {"signal": None, "strength": None}
    start = max(0, index - lookback + 1)
    end = index + 1
    if end - start < 25:
        return empty

    high_tail = highs[start:end]
    low_tail = lows[start:end]
    rsi_tail = rsi_values[start:end]

    candidates = []

    hi_pos = _swing_high_positions(rsi_tail, swing_window)
    bear_valid = []
    for cl in _cluster_positions(hi_pos, cluster_gap):
        vals = [(p, rsi_tail[p]) for p in cl if rsi_tail[p] is not None]
        if not vals:
            continue
        rep, rep_val = max(vals, key=lambda item: item[1])
        if rep_val > 70:
            bear_valid.append(rep)
    if len(bear_valid) >= 2:
        i1, i2 = bear_valid[-2], bear_valid[-1]
        if (i2 - i1) >= min_separation and (len(rsi_tail) - 1 - i2) <= max_last_swing_age:
            p1, p2, r1, r2 = high_tail[i1], high_tail[i2], rsi_tail[i1], rsi_tail[i2]
            if None not in (p1, p2, r1, r2):
                tol_abs = abs(p1) * price_tol
                price_pat = "Higher High" if p2 > p1 + tol_abs else "Lower High" if p2 < p1 - tol_abs else "Equal High"
                rsi_pat = "Higher High" if r2 > r1 + rsi_tol else "Lower High" if r2 < r1 - rsi_tol else "Equal High"
                strength = None
                if price_pat == "Higher High" and rsi_pat == "Lower High":
                    strength = "Strong"
                elif price_pat == "Equal High" and rsi_pat == "Lower High":
                    strength = "Medium"
                elif price_pat == "Higher High" and rsi_pat == "Equal High":
                    strength = "Weak"
                elif price_pat == "Lower High" and rsi_pat == "Higher High":
                    strength = "Hidden"
                if strength:
                    candidates.append({"signal": "Bearish", "strength": strength, "age": len(rsi_tail) - 1 - i2})

    lo_pos = _swing_low_positions(rsi_tail, swing_window)
    bull_valid = []
    for cl in _cluster_positions(lo_pos, cluster_gap):
        vals = [(p, rsi_tail[p]) for p in cl if rsi_tail[p] is not None]
        if not vals:
            continue
        rep, rep_val = min(vals, key=lambda item: item[1])
        if rep_val < 30:
            bull_valid.append(rep)
    if len(bull_valid) >= 2:
        i1, i2 = bull_valid[-2], bull_valid[-1]
        if (i2 - i1) >= min_separation and (len(rsi_tail) - 1 - i2) <= max_last_swing_age:
            p1, p2, r1, r2 = low_tail[i1], low_tail[i2], rsi_tail[i1], rsi_tail[i2]
            if None not in (p1, p2, r1, r2):
                tol_abs = abs(p1) * price_tol
                price_pat = "Lower Low" if p2 < p1 - tol_abs else "Higher Low" if p2 > p1 + tol_abs else "Equal Low"
                rsi_pat = "Lower Low" if r2 < r1 - rsi_tol else "Higher Low" if r2 > r1 + rsi_tol else "Equal Low"
                strength = None
                if price_pat == "Lower Low" and rsi_pat == "Higher Low":
                    strength = "Strong"
                elif price_pat == "Equal Low" and rsi_pat == "Higher Low":
                    strength = "Medium"
                elif price_pat == "Lower Low" and rsi_pat == "Equal Low":
                    strength = "Weak"
                elif price_pat == "Higher Low" and rsi_pat == "Lower Low":
                    strength = "Hidden"
                if strength:
                    candidates.append({"signal": "Bullish", "strength": strength, "age": len(rsi_tail) - 1 - i2})

    if not candidates:
        return empty

    strength_rank = {"Strong": 4, "Medium": 3, "Weak": 2, "Hidden": 1}
    candidates.sort(key=lambda x: (x["age"], -strength_rank.get(x["strength"], 0)))
    chosen = candidates[0]
    return {"signal": chosen["signal"], "strength": chosen["strength"]}


def round_value(value: float | None, digits: int = 4) -> float | None:
    return round(value, digits) if value is not None and math.isfinite(value) else None


def monday_key(date_text: str) -> str:
    date = datetime.strptime(date_text, "%Y-%m-%d")
    return datetime.fromordinal(date.toordinal() - date.weekday()).strftime("%Y-%m-%d")


def prepare_ticker(rows: list[dict[str, Any]]) -> dict[str, Any]:
    rows = sorted(
        (
            {
                "date": str(row.get("date") or ""),
                "open": number(row.get("open")),
                "high": number(row.get("high")),
                "low": number(row.get("low")),
                "close": number(row.get("close")),
                "volume": number(row.get("volume")) or 0.0,
            }
            for row in rows
            if row.get("date")
        ),
        key=lambda row: row["date"],
    )
    closes = [row["close"] for row in rows]
    volumes = [row["volume"] for row in rows]
    ema25 = ema(closes, 25)
    ema50 = ema(closes, 50)
    sma200 = sma(closes, 200)
    average_volume = sma(volumes, 20)

    changes = [
        None if index == 0 or closes[index] is None or closes[index - 1] is None
        else closes[index] - closes[index - 1]
        for index in range(len(rows))
    ]
    gains = [None if value is None else max(value, 0) for value in changes]
    losses = [None if value is None else max(-value, 0) for value in changes]
    avg_gain = rma(gains, 14)
    avg_loss = rma(losses, 14)
    rsi_values = [
        None if gain is None or loss is None
        else 100.0 if loss == 0
        else 100 - (100 / (1 + gain / loss))
        for gain, loss in zip(avg_gain, avg_loss)
    ]
    rsi_average = sma(rsi_values, 14)

    macd_fast = ema(closes, 12)
    macd_slow = ema(closes, 26)
    macd_line = [
        None if fast is None or slow is None else fast - slow
        for fast, slow in zip(macd_fast, macd_slow)
    ]
    macd_signal = ema(macd_line, 9)
    macd_raw_histogram = [
        None if line is None or signal is None else line - signal
        for line, signal in zip(macd_line, macd_signal)
    ]
    macd_histogram = ema(macd_raw_histogram, 3)

    # Stochastic (14, 3, 3) -- same parameters as TradingView's built-in
    # Stochastic study, matching rebuild_backend.IDX_Screener.compute_stochastic.
    highs = [row["high"] for row in rows]
    lows = [row["low"] for row in rows]
    lowest_low_14 = rolling_min(lows, 14)
    highest_high_14 = rolling_max(highs, 14)
    stoch_k_raw = [
        None if close is None or ll is None or hh is None or hh == ll
        else 100 * (close - ll) / (hh - ll)
        for close, ll, hh in zip(closes, lowest_low_14, highest_high_14)
    ]
    stoch_k = sma(stoch_k_raw, 3)
    stoch_d = sma(stoch_k, 3)

    true_ranges: list[float | None] = []
    daily_ranges: list[float | None] = []
    for index, row in enumerate(rows):
        high, low, close = row["high"], row["low"], row["close"]
        previous = closes[index - 1] if index else None
        if high is None or low is None:
            true_ranges.append(None)
            daily_ranges.append(None)
            continue
        candidates = [high - low]
        if previous is not None:
            candidates.extend([abs(high - previous), abs(low - previous)])
        true_ranges.append(max(candidates))
        daily_ranges.append((high - low) / low if low else None)
    atr = rma(true_ranges, 14)
    adr = sma(daily_ranges, 20)

    monthly_vwap: list[float | None] = []
    ibh: list[float | None] = []
    ibl: list[float | None] = []
    month_key = ""
    cumulative_volume = 0.0
    cumulative_price_volume = 0.0
    month_count = 0
    balance_high: float | None = None
    balance_low: float | None = None
    for row in rows:
        current_month = row["date"][:7]
        if current_month != month_key:
            month_key = current_month
            cumulative_volume = 0.0
            cumulative_price_volume = 0.0
            month_count = 0
            balance_high = None
            balance_low = None
        month_count += 1
        typical = None
        if row["high"] is not None and row["low"] is not None and row["close"] is not None:
            typical = (row["high"] + row["low"] + row["close"]) / 3
        if typical is not None and row["volume"] > 0:
            cumulative_volume += row["volume"]
            cumulative_price_volume += typical * row["volume"]
        monthly_vwap.append(cumulative_price_volume / cumulative_volume if cumulative_volume else None)
        if month_count <= 2:
            if row["high"] is not None:
                balance_high = row["high"] if balance_high is None else max(balance_high, row["high"])
            if row["low"] is not None:
                balance_low = row["low"] if balance_low is None else min(balance_low, row["low"])
        ibh.append(balance_high)
        ibl.append(balance_low)

    week_groups: dict[str, list[int]] = defaultdict(list)
    month_groups: dict[str, list[int]] = defaultdict(list)
    for index, row in enumerate(rows):
        week_groups[monday_key(row["date"])].append(index)
        month_groups[row["date"][:7]].append(index)

    previous_week: dict[str, tuple[float | None, float | None]] = {}
    week_keys = sorted(week_groups)
    for index, key in enumerate(week_keys):
        if index == 0:
            previous_week[key] = (None, None)
            continue
        prior_rows = [rows[item] for item in week_groups[week_keys[index - 1]]]
        previous_week[key] = (
            max((row["high"] for row in prior_rows if row["high"] is not None), default=None),
            min((row["low"] for row in prior_rows if row["low"] is not None), default=None),
        )

    previous_month: dict[str, tuple[float | None, float | None]] = {}
    month_keys = sorted(month_groups)
    for index, key in enumerate(month_keys):
        if index == 0:
            previous_month[key] = (None, None)
            continue
        prior_rows = [rows[item] for item in month_groups[month_keys[index - 1]]]
        previous_month[key] = (
            max((row["high"] for row in prior_rows if row["high"] is not None), default=None),
            min((row["low"] for row in prior_rows if row["low"] is not None), default=None),
        )

    return {
        "rows": rows,
        "index": {row["date"]: index for index, row in enumerate(rows)},
        "ema25": ema25,
        "ema50": ema50,
        "sma200": sma200,
        "average_volume": average_volume,
        "rsi": rsi_values,
        "rsi_average": rsi_average,
        "macd": macd_line,
        "macd_signal": macd_signal,
        "macd_histogram": macd_histogram,
        "atr": atr,
        "adr": adr,
        "monthly_vwap": monthly_vwap,
        "ibh": ibh,
        "ibl": ibl,
        "highs": highs,
        "lows": lows,
        "stoch_k": stoch_k,
        "stoch_d": stoch_d,
        "previous_week": previous_week,
        "previous_month": previous_month,
    }


def price_zone(close: float | None, ema25: float | None, ema50: float | None, sma200: float | None) -> str:
    available = [("EMA25", ema25), ("EMA50", ema50), ("SMA200", sma200)]
    above = [name for name, value in available if value is not None and close is not None and close >= value]
    below = [name for name, value in available if value is not None and close is not None and close < value]
    if above and not below:
        return "Above All Available MA"
    if below and not above:
        return "Below All Available MA"
    return f"Above {', '.join(above)} | Below {', '.join(below)}"


def build_stock(
    ticker: str,
    prepared: dict[str, Any],
    index: int,
    static: dict[str, Any],
    rs_rating: int,
) -> dict[str, Any]:
    rows = prepared["rows"]
    row = rows[index]
    previous = rows[index - 1] if index else None
    close = row["close"]
    change = None
    if previous and close is not None and previous["close"]:
        change = close / previous["close"] - 1
    ema25 = last_valid(prepared["ema25"], index)
    ema50 = last_valid(prepared["ema50"], index)
    sma200 = last_valid(prepared["sma200"], index)
    average_volume = last_valid(prepared["average_volume"], index)
    rvol = row["volume"] / average_volume if average_volume else None
    rsi_value = last_valid(prepared["rsi"], index)
    rsi_average = last_valid(prepared["rsi_average"], index)
    macd_value = last_valid(prepared["macd"], index)
    macd_signal = last_valid(prepared["macd_signal"], index)
    histogram = last_valid(prepared["macd_histogram"], index)
    prev_macd_value = last_valid(prepared["macd"], index - 1) if index else None
    prev_macd_signal = last_valid(prepared["macd_signal"], index - 1) if index else None
    macd_cross = "N/A"
    if None not in (macd_value, macd_signal, prev_macd_value, prev_macd_signal):
        if prev_macd_value <= prev_macd_signal and macd_value > macd_signal:
            macd_cross = "Golden Cross"
        elif prev_macd_value >= prev_macd_signal and macd_value < macd_signal:
            macd_cross = "Dead Cross"
        else:
            macd_cross = "-"

    stoch_k_value = last_valid(prepared["stoch_k"], index)
    stoch_d_value = last_valid(prepared["stoch_d"], index)
    prev_stoch_k = last_valid(prepared["stoch_k"], index - 1) if index else None
    prev_stoch_d = last_valid(prepared["stoch_d"], index - 1) if index else None
    stoch_cross = "N/A"
    if None not in (stoch_k_value, stoch_d_value, prev_stoch_k, prev_stoch_d):
        if prev_stoch_k <= prev_stoch_d and stoch_k_value > stoch_d_value:
            stoch_cross = "Golden Cross"
        elif prev_stoch_k >= prev_stoch_d and stoch_k_value < stoch_d_value:
            stoch_cross = "Dead Cross"
        else:
            stoch_cross = "-"

    divergence = compute_rsi_divergence(prepared["highs"], prepared["lows"], prepared["rsi"], index)

    vwap = last_valid(prepared["monthly_vwap"], index)
    lookback = rows[max(0, index - 20):index]
    prior_support = min((item["low"] for item in lookback if item["low"] is not None), default=row["low"])
    prior_resistance = max((item["high"] for item in lookback if item["high"] is not None), default=row["high"])
    support = min(value for value in (prior_support, row["low"]) if value is not None)
    resistance = max(value for value in (prior_resistance, row["high"]) if value is not None)
    pwh, pwl = prepared["previous_week"].get(monday_key(row["date"]), (None, None))
    mdh, mdl = prepared["previous_month"].get(row["date"][:7], (None, None))
    internal = "Bullish" if close is not None and ema25 is not None and close >= ema25 else "Bearish"
    swing_reference = sma200 if sma200 is not None else ema50
    swing = "Bullish" if close is not None and swing_reference is not None and close >= swing_reference else "Bearish"
    structure = "Range"
    if close is not None and prior_resistance is not None and close > prior_resistance:
        structure = "Upward Structure Break"
    elif close is not None and prior_support is not None and close < prior_support:
        structure = "Downward Structure Break"
    rsi_status = "Strong" if rsi_value is not None and rsi_value >= 55 else "Weak" if rsi_value is not None and rsi_value <= 45 else "Neutral"
    macd_position = "Above Zero" if macd_value is not None and macd_value >= 0 else "Below Zero"
    wave = "Mountain (Rising)" if histogram is not None and histogram >= 0 else "Valley (Recovering)"
    vwap_position = "-"
    if close is not None and vwap is not None:
        vwap_position = "Above VWAP" if close >= vwap else "Below VWAP"
    return {
        "ticker": ticker,
        "companyName": static.get("companyName") or ticker,
        "sector": normalize_idx_sector(static.get("idxSector"), static.get("sector")),
        "industry": static.get("industry") or "-",
        "lastPrice": round_value(close, 2),
        "changePercent": round_value(change, 6),
        "volume": round_value(row["volume"], 0),
        "averageVolume20": round_value(average_volume, 0),
        "rvol": round_value(rvol, 4),
        "rsRating": rs_rating,
        "trend": {"internal": internal, "swing": swing},
        "structure": {"internal": structure, "swing": structure},
        "movingAverages": {
            "ema25": round_value(ema25, 4),
            "ema50": round_value(ema50, 4),
            "sma200": round_value(sma200, 4),
            "zone": price_zone(close, ema25, ema50, sma200),
        },
        "supportLevels": [round_value(support, 2), round_value(pwl, 2), round_value(mdl, 2)],
        "resistanceLevels": [round_value(resistance, 2), round_value(pwh, 2), round_value(mdh, 2)],
        "levels": {
            "ibh": round_value(last_valid(prepared["ibh"], index), 2),
            "ibl": round_value(last_valid(prepared["ibl"], index), 2),
            "pwh": round_value(pwh, 2),
            "pwl": round_value(pwl, 2),
            "mdh": round_value(mdh, 2),
            "mdl": round_value(mdl, 2),
        },
        "technical": {
            "rsi14": round_value(rsi_value, 4),
            "rsiMa14": round_value(rsi_average, 4),
            "rsiStatus": rsi_status,
            "macdLine": round_value(macd_value, 6),
            "macdSignal": round_value(macd_signal, 6),
            "macdHistogram": round_value(histogram, 6),
            "macdPosition": macd_position,
            "wavePattern": wave,
            "vwap": round_value(vwap, 4),
            "vwapPosition": vwap_position,
            "adr": round_value((last_valid(prepared["adr"], index) or 0) * 100, 4),
            "atr": round_value(
                ((last_valid(prepared["atr"], index) or 0) / close * 100) if close else None,
                4,
            ),
            "priceLocation": f"{internal} trend, {vwap_position.lower()}",
            "macdDetail": {"cross": macd_cross},
            "stochDetail": {"cross": stoch_cross},
            "rsiDetail": {
                "divergenceSignal": divergence["signal"],
                "divergenceStrength": divergence["strength"],
            },
        },
        # Fundamentals/beta don't move meaningfully day-to-day (unlike price/
        # technicals, which this function recomputes fresh from OHLCV every
        # time) -- carrying them forward from the nearest full-workbook fetch
        # is far more useful than leaving every ticker's fundamentals blank on
        # every day this lighter reconstruction path runs, which is the
        # majority of days. Never fabricated: only ever a real value this
        # pipeline already fetched and published on some other date.
        "beta": static.get("beta"),
        "fundamentals": static.get("fundamentals"),
    }


def build_signal(stock: dict[str, Any], prepared: dict[str, Any], index: int) -> list[dict[str, Any]]:
    close = number(stock.get("lastPrice"))
    ema25 = number(stock.get("movingAverages", {}).get("ema25"))
    ema50 = number(stock.get("movingAverages", {}).get("ema50"))
    rsi_value = number(stock.get("technical", {}).get("rsi14"))
    macd_line = number(stock.get("technical", {}).get("macdLine"))
    macd_signal = number(stock.get("technical", {}).get("macdSignal"))
    support = number((stock.get("supportLevels") or [None])[0])
    resistance = number((stock.get("resistanceLevels") or [None])[0])
    rvol = number(stock.get("rvol"))
    rs_rating = number(stock.get("rsRating"))
    change = number(stock.get("changePercent"))
    current_low = number(prepared["rows"][index].get("low"))
    previous_ema25 = last_valid(prepared["ema25"], index - 1)
    previous_ema50 = last_valid(prepared["ema50"], index - 1)
    previous_macd = last_valid(prepared["macd"], index - 1)
    previous_signal = last_valid(prepared["macd_signal"], index - 1)
    conditions: list[tuple[str, str, str]] = []
    if (
        all(value is not None for value in (close, ema25, ema50, rsi_value, rvol, rs_rating, change))
        and close > ema25 > ema50
        and rsi_value > 50
        and rvol >= 0.8
        and rs_rating >= 7
        and change > 0
    ):
        conditions.append(("A", "EMA Trend", f"Close {close:g} > EMA25 {ema25:.1f}; EMA25 > EMA50; RSI {rsi_value:.1f} > 50"))
    ema_cross = (
        ema25 is not None and ema50 is not None and previous_ema25 is not None and previous_ema50 is not None
        and previous_ema25 <= previous_ema50 and ema25 > ema50
    )
    macd_cross = (
        macd_line is not None and macd_signal is not None and previous_macd is not None and previous_signal is not None
        and previous_macd <= previous_signal and macd_line > macd_signal
    )
    if ema_cross or macd_cross:
        conditions.append(("B", "Golden Cross", "EMA or MACD crossed above its signal on this market date"))
    if (
        close is not None and support is not None and current_low is not None and rvol is not None
        and current_low <= support < close
        and rvol >= 1.2
    ):
        conditions.append(("D", "Price Level Reclaim", f"Price reclaimed support at {support:g} with RVOL {rvol:.2f}"))

    rows = []
    for tag, label, explanation in conditions:
        entry = ema25 or close
        target = resistance if resistance and close and resistance > close else close * 1.08 if close else None
        invalidation = support if support and close and support < close else close * 0.95 if close else None
        upside = target / close - 1 if target and close else None
        downside = 1 - invalidation / close if invalidation and close else None
        risk_reward = upside / downside if upside is not None and downside and downside > 0 else None
        rows.append({
            "Ticker": stock["ticker"],
            "Sector": stock["sector"],
            "Price": close,
            "Chg %": stock["changePercent"],
            "RVOL": stock["rvol"],
            "MA": stock["movingAverages"]["zone"],
            "RS Rating": stock["rsRating"],
            "Entry": round_value(entry, 2),
            "Target": round_value(target, 2),
            "Target Upside %": round_value(upside, 6),
            "Invalidation": round_value(invalidation, 2),
            "Invalidation Down %": round_value(downside, 6),
            "R/R": round_value(risk_reward, 4),
            "Summary Screener": explanation,
            "Filter": tag,
            "Filter Label": label,
            "Section": explanation,
        })
    return rows


def percentile_ratings(returns: dict[str, float | None]) -> dict[str, int]:
    ranked = sorted((value, ticker) for ticker, value in returns.items() if value is not None)
    count = max(1, len(ranked) - 1)
    output = {ticker: 1 for ticker in returns}
    for index, (_, ticker) in enumerate(ranked):
        output[ticker] = min(10, max(1, 1 + round(index / count * 9)))
    return output


def market_overview(stocks: dict[str, dict[str, Any]], signals: list[dict[str, Any]]) -> dict[str, Any]:
    advances = sum(1 for stock in stocks.values() if (number(stock.get("changePercent")) or 0) > 0)
    declines = sum(1 for stock in stocks.values() if (number(stock.get("changePercent")) or 0) < 0)
    unchanged = len(stocks) - advances - declines
    signal_tickers = {str(row.get("Ticker") or "") for row in signals}
    sector_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for stock in stocks.values():
        sector_rows[normalize_idx_sector(stock.get("idxSector"), stock.get("sector"))].append(stock)
    sectors = []
    for sector, rows in sector_rows.items():
        changes = [number(row.get("changePercent")) for row in rows]
        valid = [value for value in changes if value is not None]
        sectors.append({
            "sector": sector,
            "count": len(rows),
            "advances": sum(1 for value in valid if value > 0),
            "declines": sum(1 for value in valid if value < 0),
            "avgChange": fmean(valid) if valid else 0,
            "signals": sum(1 for row in rows if row["ticker"] in signal_tickers),
        })
    movers = [
        {
            "ticker": stock["ticker"],
            "price": stock["lastPrice"],
            "change": stock["changePercent"],
            "sector": stock["sector"],
        }
        for stock in stocks.values()
        if number(stock.get("changePercent")) is not None
    ]
    filter_counts: dict[str, int] = defaultdict(int)
    filter_labels = {"A": "EMA Trend", "B": "Golden Cross", "D": "Price Level Reclaim"}
    for row in signals:
        filter_counts[str(row.get("Filter") or "")] += 1
    return {
        "breadth": {"advances": advances, "declines": declines, "unchanged": unchanged},
        "signals": [
            {"id": tag, "label": label, "count": filter_counts.get(tag, 0)}
            for tag, label in filter_labels.items()
        ],
        "sectors": sorted(sectors, key=lambda row: row["avgChange"], reverse=True),
        "topGainers": sorted(movers, key=lambda row: row["change"], reverse=True)[:8],
        "topDecliners": sorted(movers, key=lambda row: row["change"])[:8],
        "processingStatus": {"OK": len(stocks), "PARTIAL DATA": 0},
    }


def load_sources() -> tuple[dict[str, Any], dict[str, dict[str, Any]], list[str]]:
    latest = json.loads(LATEST_PAYLOAD.read_text(encoding="utf-8"))
    static_stocks = latest.get("stocks") or {}
    if not static_stocks:
        static_stocks = {
            str(row.get("Ticker") or ""): {
                "ticker": row.get("Ticker"),
                "companyName": row.get("Emiten"),
                "sector": normalize_idx_sector(row.get("IDX Sector"), row.get("Sector")),
                "industry": row.get("Industry"),
            }
            for row in latest.get("technical", [])
            if row.get("Ticker")
        }
    prepared: dict[str, dict[str, Any]] = {}
    for source_file in sorted(OHLCV_DIR.glob("*.json")):
        try:
            payload = json.loads(source_file.read_text(encoding="utf-8"))
            rows = payload.get("rows") or []
            if rows:
                prepared[source_file.stem.upper()] = prepare_ticker(rows)
        except (OSError, json.JSONDecodeError, TypeError):
            continue
    reference = prepared.get("BBCA") or next(iter(prepared.values()))
    market_dates = [
        row["date"]
        for row in reference["rows"]
        if START_DATE <= row["date"] <= END_DATE
    ]
    return static_stocks, prepared, market_dates


def build_snapshot(
    market_date: str,
    static_stocks: dict[str, Any],
    prepared: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    returns: dict[str, float | None] = {}
    indexes: dict[str, int] = {}
    for ticker, data in prepared.items():
        index = data["index"].get(market_date)
        if index is None:
            continue
        indexes[ticker] = index
        close = data["rows"][index]["close"]
        prior_index = max(0, index - 60)
        prior = data["rows"][prior_index]["close"]
        returns[ticker] = close / prior - 1 if close and prior and index > prior_index else None
    ratings = percentile_ratings(returns)

    stocks: dict[str, dict[str, Any]] = {}
    signals: list[dict[str, Any]] = []
    for ticker, index in indexes.items():
        stock = build_stock(ticker, prepared[ticker], index, static_stocks.get(ticker, {}), ratings[ticker])
        stocks[ticker] = stock
        signals.extend(build_signal(stock, prepared[ticker], index))

    overview = market_overview(stocks, signals)
    return {
        "schemaVersion": 4,
        "date": market_date,
        "runTime": f"{market_date} 17:15:00 WIB",
        "workbook": None,
        "snapshotMode": "historical-ohlcv",
        "sourceLogic": "IDX_Screener indicators recalculated from published OHLCV",
        "summary": {
            "totalScanned": len(stocks),
            "ok": len(stocks),
            "partial": 0,
            "noData": 0,
            "signalRows": len(signals),
            "signalTickers": len({row["Ticker"] for row in signals}),
        },
        "overview": overview,
        "screener": signals,
        "stocks": stocks,
    }


def update_manifest(market_dates: list[str]) -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if int(manifest.get("schemaVersion") or 0) >= 5:
        print("Schema-v5 manifest is managed by scripts/archive_v5.py; legacy manifest update skipped.")
        return
    existing = {str(entry.get("date")): entry for entry in manifest.get("dates", [])}
    entries = []
    for market_date in market_dates:
        if market_date in {"2026-06-09", "2026-06-10"} and market_date in existing:
            entries.append(existing[market_date])
            continue
        snapshot_path = SNAPSHOT_DIR / f"{market_date}.json"
        payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
        entries.append({
            "date": market_date,
            "runTime": payload["runTime"],
            "rows": payload["summary"]["signalRows"],
            "tickers": payload["summary"]["signalTickers"],
            "file": f"data/snapshots/{market_date}.json",
            "workbook": None,
            "qa": None,
            "ohlcv": f"data/ohlcv/{SOURCE_DATE}",
            "isTradingDate": True,
            "snapshotMode": "historical-ohlcv",
        })
    entries.extend(
        entry
        for date_text, entry in existing.items()
        if date_text not in set(market_dates)
    )
    manifest["latest"] = max(entry["date"] for entry in entries)
    manifest["dates"] = sorted(entries, key=lambda entry: entry["date"], reverse=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")


def main() -> None:
    if not OHLCV_DIR.exists():
        raise FileNotFoundError(f"Missing OHLCV source directory: {OHLCV_DIR}")
    if SNAPSHOT_DIR.exists():
        shutil.rmtree(SNAPSHOT_DIR)
    SNAPSHOT_DIR.mkdir(parents=True)
    static_stocks, prepared, market_dates = load_sources()
    for index, market_date in enumerate(market_dates, start=1):
        if market_date in {"2026-06-09", "2026-06-10"}:
            continue
        payload = build_snapshot(market_date, static_stocks, prepared)
        (SNAPSHOT_DIR / f"{market_date}.json").write_text(
            json.dumps(payload, separators=(",", ":"), ensure_ascii=False),
            encoding="utf-8",
        )
        print(f"[{index:03d}/{len(market_dates):03d}] {market_date}: {payload['summary']['signalRows']} signals")
    update_manifest(market_dates)
    print(f"Published {len(market_dates)} IDX market dates from {market_dates[0]} through {market_dates[-1]}.")


if __name__ == "__main__":
    main()
