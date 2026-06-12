from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class SourceDefinition:
    id: str
    label: str
    domains: tuple[str, ...]
    usage: str


SOURCES = {
    "workbook": SourceDefinition(
        id="workbook",
        label="Workbook",
        domains=("published_output", "signals", "levels"),
        usage="Final published user-facing output after the backend finishes.",
    ),
    "yfinance": SourceDefinition(
        id="yfinance",
        label="YF",
        domains=("ohlcv", "profile", "actions", "financial_statements"),
        usage="Approved backend source. Values may differ from TradingView.",
    ),
    "investing_com": SourceDefinition(
        id="investing_com",
        label="INV",
        domains=("public_profile", "fundamentals", "ratios"),
        usage="Public pages only, with cache and explicit blocked/error states.",
    ),
    "derived": SourceDefinition(
        id="derived",
        label="Derived",
        domains=("technical", "fundamental", "quality"),
        usage="Calculated from approved source inputs with a versioned formula.",
    ),
    "tradingview_chart": SourceDefinition(
        id="tradingview_chart",
        label="TradingView chart",
        domains=("chart_display",),
        usage="Display only. Never used as a hidden workbook calculation source.",
    ),
}


def registry_payload() -> list[dict]:
    return [asdict(source) for source in SOURCES.values()]
