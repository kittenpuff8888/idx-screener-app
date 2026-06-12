from __future__ import annotations

import math
from typing import Any


def number(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def validate_ohlcv_record(row: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    open_value = number(row.get("open", row.get("Open")))
    high = number(row.get("high", row.get("High")))
    low = number(row.get("low", row.get("Low")))
    close = number(row.get("close", row.get("Close")))
    volume = number(row.get("volume", row.get("Volume")))
    if None in (open_value, high, low, close):
        errors.append("missing_ohlc")
        return errors
    if high < max(open_value, close):
        errors.append("high_below_open_or_close")
    if low > min(open_value, close):
        errors.append("low_above_open_or_close")
    if volume is None:
        errors.append("missing_volume")
    elif volume < 0:
        errors.append("negative_volume")
    return errors


def ticker_quality(stock: dict[str, Any]) -> tuple[str, list[str]]:
    required = ("lastPrice", "changePercent", "volume")
    missing = [field for field in required if stock.get(field) is None]
    if len(missing) == len(required):
        return "NO_DATA", missing
    if missing:
        return "PARTIAL", missing
    return "OK", []
