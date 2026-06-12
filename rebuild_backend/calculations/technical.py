from __future__ import annotations

import math
from typing import Iterable

import numpy as np
import pandas as pd


def _series(values: Iterable[float] | pd.Series) -> pd.Series:
    return pd.Series(values, dtype="float64") if not isinstance(values, pd.Series) else values.astype(float)


def sma(values: Iterable[float] | pd.Series, period: int) -> pd.Series:
    return _series(values).rolling(period, min_periods=period).mean()


def ema(values: Iterable[float] | pd.Series, period: int) -> pd.Series:
    return _series(values).ewm(span=period, adjust=False, min_periods=1).mean()


def rma(values: Iterable[float] | pd.Series, period: int) -> pd.Series:
    source = _series(values)
    output = pd.Series(np.nan, index=source.index, dtype="float64")
    valid = source.dropna()
    if len(valid) < period:
        return output
    seed_index = valid.index[period - 1]
    seed_position = source.index.get_loc(seed_index)
    output.iloc[seed_position] = valid.iloc[:period].mean()
    for position in range(seed_position + 1, len(source)):
        value = source.iloc[position]
        previous = output.iloc[position - 1]
        if math.isnan(value):
            output.iloc[position] = previous
        else:
            output.iloc[position] = (previous * (period - 1) + value) / period
    return output


def rsi(values: Iterable[float] | pd.Series, period: int = 14) -> pd.Series:
    close = _series(values)
    change = close.diff()
    gain = change.clip(lower=0)
    loss = -change.clip(upper=0)
    average_gain = rma(gain, period)
    average_loss = rma(loss, period)
    relative_strength = average_gain / average_loss.replace(0, np.nan)
    result = 100 - (100 / (1 + relative_strength))
    result = result.where(average_loss != 0, 100.0)
    result = result.where(average_gain != 0, 0.0)
    return result.clip(0, 100)


def macd(
    values: Iterable[float] | pd.Series,
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> tuple[pd.Series, pd.Series, pd.Series]:
    close = _series(values)
    line = ema(close, fast) - ema(close, slow)
    signal_line = ema(line, signal)
    return line, signal_line, line - signal_line


def rvol(volume: Iterable[float] | pd.Series, period: int = 20) -> pd.Series:
    values = _series(volume)
    average = sma(values, period)
    return values / average.replace(0, np.nan)


def adr(high: Iterable[float] | pd.Series, low: Iterable[float] | pd.Series, close: Iterable[float] | pd.Series, period: int = 20) -> pd.Series:
    high_s, low_s, close_s = _series(high), _series(low), _series(close)
    daily_range = (high_s - low_s) / close_s.replace(0, np.nan) * 100
    return sma(daily_range, period)


def price_return(close: Iterable[float] | pd.Series, bars: int) -> pd.Series:
    values = _series(close)
    return values / values.shift(bars) - 1


def anchored_vwap(frame: pd.DataFrame, anchor: pd.Series | None = None) -> pd.Series:
    typical = (frame["High"] + frame["Low"] + frame["Close"]) / 3
    volume = frame["Volume"].fillna(0).clip(lower=0)
    if anchor is None:
        anchor = pd.Series("all", index=frame.index)
    price_volume = typical * volume
    cumulative_volume = volume.groupby(anchor).cumsum()
    cumulative_value = price_volume.groupby(anchor).cumsum()
    return cumulative_value / cumulative_volume.replace(0, np.nan)


def quarter_anchor(index: pd.DatetimeIndex) -> pd.Series:
    return pd.Series(index.to_period("Q").astype(str), index=index)


def normalize_ohlcv(frame: pd.DataFrame, market_date: str | None = None) -> pd.DataFrame:
    required = ["Open", "High", "Low", "Close", "Volume"]
    missing_columns = [column for column in required if column not in frame.columns]
    if missing_columns:
        raise ValueError(f"OHLCV missing columns: {', '.join(missing_columns)}")
    output = frame.copy().sort_index()
    output = output[~output.index.duplicated(keep="last")]
    if market_date:
        output = output[output.index.strftime("%Y-%m-%d") <= market_date]
    invalid = (
        (output["High"] < output[["Open", "Close"]].max(axis=1))
        | (output["Low"] > output[["Open", "Close"]].min(axis=1))
        | (output["Volume"] < 0)
    )
    if invalid.any():
        raise ValueError(f"Invalid OHLCV rows: {int(invalid.sum())}")
    return output
