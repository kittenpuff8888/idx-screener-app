from __future__ import annotations

import math
from collections.abc import Iterable

import numpy as np


def safe_divide(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator is None:
        return None
    try:
        numerator_f = float(numerator)
        denominator_f = float(denominator)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(numerator_f) or not math.isfinite(denominator_f) or denominator_f == 0:
        return None
    return numerator_f / denominator_f


def market_cap(price: float | None, shares: float | None) -> float | None:
    return None if price is None or shares is None else float(price) * float(shares)


def enterprise_value(market_cap_value: float | None, total_debt: float | None, cash: float | None) -> float | None:
    if market_cap_value is None or total_debt is None or cash is None:
        return None
    return float(market_cap_value) + float(total_debt) - float(cash)


def pe_ratio(market_cap_value: float | None, net_income: float | None) -> float | None:
    return safe_divide(market_cap_value, net_income)


def price_to_sales(market_cap_value: float | None, revenue: float | None) -> float | None:
    return safe_divide(market_cap_value, revenue)


def price_to_book(market_cap_value: float | None, equity: float | None) -> float | None:
    return safe_divide(market_cap_value, equity)


def margin(profit: float | None, revenue: float | None) -> float | None:
    return safe_divide(profit, revenue)


def return_on_assets(net_income: float | None, average_assets: float | None) -> float | None:
    return safe_divide(net_income, average_assets)


def return_on_equity(net_income: float | None, average_equity: float | None) -> float | None:
    return safe_divide(net_income, average_equity)


def return_on_capital_employed(
    ebit: float | None,
    average_assets: float | None,
    average_current_liabilities: float | None,
) -> float | None:
    if average_assets is None or average_current_liabilities is None:
        return None
    return safe_divide(ebit, float(average_assets) - float(average_current_liabilities))


def return_on_invested_capital(
    ebit: float | None,
    tax_rate: float | None,
    debt: float | None,
    equity: float | None,
    cash: float | None,
) -> float | None:
    if None in (ebit, tax_rate, debt, equity, cash):
        return None
    nopat = float(ebit) * (1 - float(tax_rate))
    invested_capital = float(debt) + float(equity) - float(cash)
    return safe_divide(nopat, invested_capital)


def current_ratio(current_assets: float | None, current_liabilities: float | None) -> float | None:
    return safe_divide(current_assets, current_liabilities)


def quick_ratio(
    cash: float | None,
    short_term_investments: float | None,
    receivables: float | None,
    current_liabilities: float | None,
) -> float | None:
    if cash is None or receivables is None:
        return None
    numerator = float(cash) + float(short_term_investments or 0) + float(receivables)
    return safe_divide(numerator, current_liabilities)


def free_cash_flow(cash_from_operations: float | None, capex: float | None) -> float | None:
    if cash_from_operations is None or capex is None:
        return None
    return float(cash_from_operations) - abs(float(capex))


def altman_z_original(
    working_capital: float | None,
    retained_earnings: float | None,
    ebit: float | None,
    market_value_equity: float | None,
    revenue: float | None,
    total_assets: float | None,
    total_liabilities: float | None,
) -> float | None:
    if None in (
        working_capital,
        retained_earnings,
        ebit,
        market_value_equity,
        revenue,
        total_assets,
        total_liabilities,
    ):
        return None
    return (
        1.2 * safe_divide(working_capital, total_assets)
        + 1.4 * safe_divide(retained_earnings, total_assets)
        + 3.3 * safe_divide(ebit, total_assets)
        + 0.6 * safe_divide(market_value_equity, total_liabilities)
        + safe_divide(revenue, total_assets)
    )


def pbv_band(current_pbv: float | None, values: Iterable[float]) -> dict[str, float | str | None]:
    series = np.asarray([float(value) for value in values if value is not None and math.isfinite(float(value))])
    if current_pbv is None or len(series) < 2:
        return {
            "mean": None,
            "stddev": None,
            "zscore": None,
            "percentile": None,
            "regime": "Insufficient Data",
        }
    mean = float(np.mean(series))
    stddev = float(np.std(series, ddof=0))
    zscore = safe_divide(float(current_pbv) - mean, stddev)
    percentile = float(np.mean(series <= float(current_pbv)))
    if zscore is None:
        regime = "Near 3Y Mean"
    elif zscore <= -2:
        regime = "Very Low vs 3Y Band"
    elif zscore < -0.5:
        regime = "Below 3Y Mean"
    elif zscore <= 0.5:
        regime = "Near 3Y Mean"
    elif zscore < 2:
        regime = "Above 3Y Mean"
    else:
        regime = "Very High vs 3Y Band"
    return {
        "mean": mean,
        "stddev": stddev,
        "plus2": mean + 2 * stddev,
        "plus1": mean + stddev,
        "minus1": mean - stddev,
        "minus2": mean - 2 * stddev,
        "zscore": zscore,
        "percentile": percentile,
        "regime": regime,
    }
