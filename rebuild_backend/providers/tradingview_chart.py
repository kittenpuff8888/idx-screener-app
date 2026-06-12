from __future__ import annotations

from urllib.parse import quote


class TradingViewChartProvider:
    """Symbol/display configuration only; never a calculation provider."""

    name = "tradingview_chart"

    @staticmethod
    def symbol(ticker: str) -> str:
        clean = ticker.upper().replace(".JK", "").replace("IDX:", "").strip()
        return f"IDX:{clean}"

    @classmethod
    def chart_url(cls, ticker: str) -> str:
        return f"https://www.tradingview.com/chart/?symbol={quote(cls.symbol(ticker))}"
