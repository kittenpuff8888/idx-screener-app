from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Iterable


REGISTRY_VERSION = 1
LAST_REVIEWED = "2026-06-12"
REQUIRED_FIELDS = {
    "id", "category", "displayName", "shortDefinition", "plainEnglishExplanation",
    "whyItMatters", "formulaPlainEnglish", "formulaTechnical", "inputs", "source",
    "sourcePriority", "outputSheets", "outputColumns", "thresholds", "interpretation",
    "neutralLabels", "limitations", "missingDataRules", "example",
    "relatedConcepts", "formulaVersion", "lastReviewed",
}
BANNED_ADVICE_WORDS = re.compile(
    r"\b(buy|sell|hold|opportunity|undervalued|overvalued|guaranteed)\b",
    re.IGNORECASE,
)


def concept(
    concept_id: str,
    category: str,
    display_name: str,
    short_definition: str,
    *,
    explanation: str | None = None,
    why: str = "It helps users interpret the published research field in context.",
    formula_plain: str = "Read from the published source field.",
    formula_technical: str = "source_field",
    inputs: Iterable[str] = (),
    source: str = "Workbook",
    source_priority: Iterable[str] = ("Workbook",),
    sheets: Iterable[str] = (),
    columns: Iterable[str] = (),
    thresholds: str = "No fixed threshold.",
    interpretation: str = "Read together with source status, market date, and related fields.",
    neutral_labels: Iterable[str] = (),
    limitations: str = "Availability and timing depend on the approved source.",
    missing: str = "Show value=null with status, reason, source, as-of date, and formula.",
    example: str = "Use the value as a research description, not as a recommendation.",
    related: Iterable[str] = (),
    formula_version: str = "source-limited-v3",
) -> dict[str, Any]:
    return {
        "id": concept_id,
        "category": category,
        "displayName": display_name,
        "shortDefinition": short_definition,
        "plainEnglishExplanation": explanation or short_definition,
        "whyItMatters": why,
        "formulaPlainEnglish": formula_plain,
        "formulaTechnical": formula_technical,
        "inputs": list(inputs),
        "source": source,
        "sourcePriority": list(source_priority),
        "outputSheets": list(sheets),
        "outputColumns": list(columns),
        "thresholds": thresholds,
        "interpretation": interpretation,
        "neutralLabels": list(neutral_labels) or [display_name],
        "limitations": limitations,
        "missingDataRules": missing,
        "example": example,
        "relatedConcepts": list(related),
        "formulaVersion": formula_version,
        "lastReviewed": LAST_REVIEWED,
    }


CORE = [
    concept(
        "market-date", "Data Sources & Freshness", "Market Date",
        "The published IDX session that controls every point-in-time page value.",
        why="It prevents a historical page from silently mixing values from a later session.",
        formula_plain="Use the selected archived session and exclude candles after that date.",
        formula_technical="bar.date <= selectedMarketDate",
        inputs=("selected market date", "manifest available dates"),
        source="Archive manifest", source_priority=("Archive manifest", "Workbook"),
        sheets=("Data Processing Results",), columns=("As-of Date",),
        thresholds="Only valid archived market sessions are selectable.",
        interpretation="All point-in-time price and technical fields should end on this date.",
        limitations="Fundamental and news fields may be marked latest-reference when a historical copy does not exist.",
        example="Selecting 2026-06-09 excludes the 2026-06-10 candle.",
        related=("historical-point-in-time", "last-successful-load"),
        formula_version="archive-schema-v5",
    ),
    concept(
        "last-successful-load", "Data Sources & Freshness", "Last Successful Dataset Load",
        "The newest market date whose full publication pipeline completed successfully.",
        formula_plain="Keep the previous successful date when a new run has no valid market data or fails validation.",
        formula_technical="manifest.lastSuccessfulDatasetLoad",
        source="Archive manifest", sheets=("Data Processing Results",),
        columns=("Last Successful Dataset Load",),
        interpretation="A date older than the current session indicates that the latest run did not publish a replacement.",
        formula_version="archive-schema-v5",
    ),
]

CORE.extend([
    concept(
        "data-quality-status", "Data Quality / Missing Data", "Data Quality Status",
        "A compact state showing whether a published record is complete, partial, unavailable, or warning-level.",
        formula_plain="Combine provider availability, required-field checks, and calculation validation results.",
        formula_technical="status in {OK, PARTIAL, NO_DATA, QA_WARNING}",
        inputs=("provider status", "required fields", "QA checks"),
        source="Derived", source_priority=("Workbook QA", "Provider status"),
        sheets=("IDX Overview", "Data Processing Results", "QA Calculation Audit"),
        columns=("Data Status", "Processing Status", "QA Status"),
        thresholds="OK has required data; PARTIAL remains usable with explicit gaps; NO_DATA has no valid record.",
        interpretation="Open the source and missing-reason details before using a partial or unavailable field.",
        formula_version="source-limited-v3",
    ),
    concept(
        "smc-overlay", "Structure / SMC Overlay", "SMC-style Structure Overlay",
        "OHLCV-derived price-structure annotations such as BOS, CHoCH, pivot boxes, equal levels, and zones.",
        why="It groups the attached Pine-derived structure tools in one editable research-chart layer.",
        formula_plain="Apply pivot, crossing, gap, and swing-range rules only to the selected ticker's published OHLCV.",
        formula_technical="pine-smc-ohlcv-v1",
        inputs=("open", "high", "low", "close", "volume"),
        source="Derived OHLCV", source_priority=("Workbook OHLCV", "yfinance", "Investing.com"),
        sheets=("Research Overlay View", "QA Calculation Audit"),
        columns=("BOS", "CHoCH", "Order Block", "EQH / EQL", "FVG"),
        interpretation="These are technical annotations, not evidence of participant transaction activity.",
        limitations="Pivot confirmation is delayed and results can differ when provider sessions or settings differ.",
        formula_version="pine-smc-ohlcv-v1",
    ),
    concept(
        "ksei-ownership-source", "Data Sources & Freshness", "KSEI Ownership Snapshot",
        "A dated workbook snapshot of published issuer ownership and concentration fields.",
        why="It supports point-in-time ownership research without inserting a later register into an earlier market view.",
        formula_plain="Select the newest KSEI snapshot whose as-of date is not later than the selected market date.",
        formula_technical="MAX(ksei.asOf WHERE ksei.asOf <= selectedMarketDate)",
        inputs=("KSEI workbook", "selected market date"),
        source="KSEI workbook", source_priority=("KSEI workbook",),
        sheets=("KSEI Ownership page",), columns=("As of", "Source"),
        interpretation="Treat the snapshot as a published ownership register, not a record of transactions between snapshots.",
        limitations="Only May 14 and June 6, 2026 snapshots are currently archived.",
        formula_version="ksei-ownership-v1",
    ),
    concept(
        "ksei-free-float", "Market Overview", "KSEI Free Float",
        "The percentage of issued shares classified as publicly available in the source workbook.",
        formula_plain="Read the published Free Float field.",
        formula_technical="KSEI.Free Float",
        inputs=("Free Float",), source="KSEI workbook",
        sheets=("KSEI Ownership page",), columns=("Free Float",),
        interpretation="Compare across issuers while checking the KSEI as-of date.",
        limitations="The published classification can change when the source register is refreshed.",
        formula_version="ksei-ownership-v1",
    ),
    concept(
        "ksei-hhi", "Market Overview", "Ownership HHI",
        "A concentration index formed from squared published ownership percentages.",
        formula_plain="Square each published holder percentage and add the results.",
        formula_technical="SUM(holder_percentage ^ 2)",
        inputs=("published holder percentages",), source="KSEI workbook / derived",
        sheets=("KSEI Ownership page",), columns=("Classic HHI",),
        thresholds="The dashboard highlights HHI at or above 2,500 as high concentration.",
        interpretation="A higher value indicates ownership is concentrated among fewer large holders.",
        limitations="Results reflect the holder coverage and threshold in the source workbook.",
        formula_version="ksei-ownership-v1",
    ),
    concept(
        "ksei-cr1-cr3", "Market Overview", "Ownership CR1 / CR3",
        "The combined ownership percentage of the largest one holder and largest three holders.",
        formula_plain="CR1 uses the largest published percentage; CR3 sums the three largest percentages.",
        formula_technical="CR1=MAX(pct); CR3=SUM(TOP3(pct))",
        inputs=("published holder percentages",), source="KSEI workbook",
        sheets=("KSEI Ownership page",), columns=("CR1", "CR3"),
        interpretation="Larger percentages indicate more of the issuer is held by the leading published holders.",
        formula_version="ksei-ownership-v1",
    ),
    concept(
        "ksei-ccs", "Market Overview", "CCS",
        "The source workbook's composite concentration score and category.",
        formula_plain="Read the published CCS and CCS Category fields.",
        formula_technical="KSEI.CCS",
        inputs=("CCS", "CCS Category"), source="KSEI workbook",
        sheets=("KSEI Ownership page",), columns=("CCS", "CCS Category"),
        interpretation="Use with HHI, CR1, CR3, and free float rather than as a standalone conclusion.",
        limitations="The underlying workbook methodology controls this score.",
        formula_version="ksei-ownership-v1",
    ),
    concept(
        "ksei-ownership-type", "Market Overview", "KSEI Ownership Type",
        "The source workbook's descriptive grouping of ownership concentration.",
        formula_plain="Read the published Ownership Type field.",
        formula_technical="KSEI.Ownership Type",
        inputs=("Ownership Type",), source="KSEI workbook",
        sheets=("KSEI Ownership page",), columns=("Ownership Type",),
        interpretation="Use the category to navigate similar concentration profiles.",
        limitations="It is a descriptive source label and does not describe investor intent.",
        formula_version="ksei-ownership-v1",
    ),
    concept(
        "source-workbook", "Data Sources & Freshness", "Workbook Data",
        "The final published output produced by the Python research pipeline.",
        why="It is the primary user-facing source for screener rows, workbook levels, fundamentals, news, and processing status.",
        formula_plain="Generate the workbook, validate it, then export its published fields to JSON.",
        formula_technical="IDX_Screener.py -> export_latest.py -> archive schema v5",
        inputs=("Python calculations", "approved provider records"),
        source="Workbook", source_priority=("Workbook",),
        sheets=("All workbook sheets", "Website archive"), columns=("Published fields",),
        limitations="A workbook field can still be partial when an upstream approved source is unavailable.",
        formula_version="source-limited-v3",
    ),
    concept(
        "source-yfinance", "Data Sources & Freshness", "yfinance",
        "The approved provider for OHLCV, company metadata, actions, and financial statements when available.",
        formula_plain="Request provider fields, cache the response, and preserve provider status when unavailable.",
        formula_technical="YFinanceProvider",
        inputs=("IDX ticker mapped to .JK", "date range"),
        source="yfinance", source_priority=("yfinance",),
        sheets=("Data Source Audit",), columns=("Source", "Provider Status"),
        limitations="Coverage, adjustments, and provider timestamps can change or be incomplete.",
        formula_version="provider-yfinance-v1",
    ),
    concept(
        "source-investing", "Data Sources & Freshness", "Investing.com Public Fields",
        "Public-page fields parsed only when available without bypassing access controls.",
        formula_plain="Fetch the public page through the provider adapter and report blocked, missing, or parsed status.",
        formula_technical="InvestingComProvider",
        inputs=("ticker", "public page response"),
        source="Investing.com", source_priority=("Investing.com public page",),
        sheets=("Data Source Audit",), columns=("Source", "Provider Status"),
        limitations="The provider can block requests or omit fields; the pipeline does not bypass those controls.",
        formula_version="provider-investing-v1",
    ),
    concept(
        "alphaflow-reference", "Compliance / Disclaimer", "AlphaFlow UI Reference",
        "A visual and interaction reference used for product direction only.",
        formula_plain="Apply general layout and readability ideas without importing unsupported datasets or claims.",
        formula_technical="ui_reference_only",
        source="Design reference", sheets=("Website UI",), columns=("Layout",),
        limitations="No AlphaFlow data, formulas, or proprietary behavior are used.",
        formula_version="ui-reference-v1",
    ),
])


for concept_id, name, definition, column in [
    ("total-scanned", "Total Scanned Tickers", "The number of ticker records evaluated by the pipeline.", "Total Tickers Scanned"),
    ("ok-tickers", "OK Tickers", "Ticker records with the required published fields available.", "OK  (full data)"),
    ("partial-tickers", "Partial Data Tickers", "Usable ticker records with one or more unavailable fields.", "Partial Data"),
    ("no-data-tickers", "No Data Tickers", "Ticker records without enough valid source data for publication.", "No Data"),
    ("signal-rows", "Signal Rows", "The number of matched screener conditions; one ticker may contribute more than one row.", "Signal Rows"),
    ("unique-signal-tickers", "Unique Signal Tickers", "The count of distinct tickers represented by signal rows.", "Unique Signal Tickers"),
]:
    CORE.append(concept(
        concept_id, "Market Overview", name, definition,
        formula_plain="Count records that meet the named publication status.",
        formula_technical=f"COUNT({column})",
        inputs=("processing records", "screener records"),
        source="Workbook / archive", sheets=("IDX Overview", "Data Processing Results"),
        columns=(column,), formula_version="archive-schema-v5",
    ))


SIGNALS = [
    ("signal-ema-trend", "EMA Trend", "Price and configured EMA alignment with momentum confirmation.", "Legacy workbook group A", "EMA values, close, momentum fields"),
    ("signal-golden-cross", "Golden Cross", "A configured average or MACD upward crossing condition.", "Legacy workbook group B", "moving averages or MACD line and signal"),
    ("signal-structure-break", "Structure Break", "Close moved beyond a confirmed workbook structure level.", "Legacy workbook group C", "close and confirmed pivot level"),
    ("signal-price-level-reclaim", "Price Level Reclaim", "Price moved back above an observed workbook level.", "Legacy workbook group D", "close and observed level"),
    ("signal-equal-level-breakout", "Equal-Level Breakout", "Price moved beyond a confirmed equal-level threshold.", "Legacy workbook group E", "close, equal high or equal low"),
    ("signal-near-vwap", "Near VWAP", "Price is within the workbook-defined distance from a VWAP level.", "Legacy workbook group F", "close and VWAP level"),
    ("signal-structure-location", "Structure Location", "Price location relative to workbook structure ranges.", "Legacy workbook group G", "close and structure levels"),
]
SIGNAL_ALIASES = {
    "signal-price-level-reclaim": ("POI Reclaim (legacy label)",),
    "signal-equal-level-breakout": ("EQ Breakout (legacy label)",),
    "signal-structure-location": ("SMC Location (legacy label)",),
}
for concept_id, name, definition, rule, inputs in SIGNALS:
    CORE.append(concept(
        concept_id, "Screener Signal Groups", name, definition,
        explanation=f"{definition} The label replaces an internal filter code in the user interface.",
        why="It explains why a screener row was published without implying an action.",
        formula_plain=rule, formula_technical="workbook_rule",
        inputs=tuple(part.strip() for part in inputs.split(",")),
        source="Workbook / derived", source_priority=("Workbook", "Derived OHLCV"),
        sheets=("IDX Screener",), columns=("Signal Type", "Summary Screener"),
        thresholds="Uses the thresholds configured by the Python workbook pipeline.",
        interpretation="Signal matched means the rule was true on the selected market date.",
        neutral_labels=(name, "Research signal", "Signal matched", *SIGNAL_ALIASES.get(concept_id, ())),
        limitations="A ticker can match several groups, so signal rows can exceed unique tickers.",
        example=f"A ticker appears under {name} when its published inputs satisfy the workbook rule.",
        formula_version="workbook-signal-v3",
    ))


TECHNICAL = [
    ("vwap-default", "VWAP / Fair Value", "TradingView Default VWAP", "Average price weighted by volume from a selected anchor.", "SUM(hlc3 * volume) / SUM(volume)", ("high", "low", "close", "volume"), "pine-tv-vwap-v1"),
    ("vwap-current-quarter", "VWAP / Fair Value", "Current Quarter VWAP", "Developing volume-weighted average for the current quarter.", "quarter cumulative SUM(hlc3*volume)/SUM(volume)", ("high", "low", "close", "volume"), "pine-anchor-vwap-v1"),
    ("vwap-previous-quarter", "VWAP / Fair Value", "Previous Quarter VWAP", "Frozen volume-weighted average for the completed previous quarter.", "previous quarter SUM(hlc3*volume)/SUM(volume)", ("high", "low", "close", "volume"), "pine-anchor-vwap-v1"),
    ("vwap-previous-year", "VWAP / Fair Value", "Previous Year VWAP", "Frozen volume-weighted average for the completed previous year.", "previous year SUM(hlc3*volume)/SUM(volume)", ("high", "low", "close", "volume"), "pine-anchor-vwap-v1"),
    ("ema", "Trend Indicators", "EMA", "A moving average that gives more weight to recent prices.", "EMA_t = price*alpha + EMA_(t-1)*(1-alpha)", ("close", "length"), "source-limited-v3"),
    ("sma", "Trend Indicators", "SMA", "The arithmetic mean of the most recent prices.", "SUM(close, length)/length", ("close", "length"), "source-limited-v3"),
    ("ma200", "Trend Indicators", "MA200", "A 200-session simple moving average used as a long-window trend reference.", "SMA(close, 200)", ("close",), "pine-smc-ohlcv-v1"),
    ("rsi", "Momentum Indicators", "RSI", "A 0-to-100 measure of recent upward and downward price changes.", "100 - 100/(1 + RMA(gains)/RMA(losses))", ("close", "length"), "pine-rsi-v1"),
    ("macd", "Momentum Indicators", "MACD", "The difference between a faster and slower exponential average.", "EMA(close,12) - EMA(close,26)", ("close",), "source-limited-v3"),
    ("macd-4c", "Momentum Indicators", "MACD 4C Smooth", "MACD with an EMA signal and optionally smoothed histogram.", "EMA(EMA12-EMA26 - EMA9, histogram length)", ("close", "fast length", "slow length", "signal length", "histogram smoothing"), "pine-macd-4c-v1"),
    ("rvol", "Volume / Liquidity", "RVOL", "Current volume divided by normal recent volume.", "volume / SMA(volume,20)", ("volume",), "source-limited-v3"),
    ("volume-ma", "Volume / Liquidity", "Volume MA", "A moving average of daily traded volume.", "SMA(volume,20)", ("volume",), "pine-volume-ma-v1"),
    ("adr-percent", "Volume / Liquidity", "ADR %", "Average daily high-low range expressed relative to price.", "MEAN((high-low)/close,20)*100", ("high", "low", "close"), "source-limited-v3"),
    ("rs-rating", "Price Performance", "RS Rating", "A percentile ranking of medium-window price performance across the published universe.", "percentile_rank(60-session return)", ("close history", "ticker universe"), "source-limited-v3"),
    ("price-change-percent", "Price Performance", "Price Change %", "The percentage change from the previous close.", "(close/previous_close - 1)*100", ("close", "previous close"), "source-limited-v3"),
    ("ibh", "Levels & Risk Map", "IBH", "The highest wick during the first configured trading days of a month.", "MAX(high, first N monthly sessions)", ("high", "market session dates"), "pine-ibh-ibl-v1"),
    ("ibl", "Levels & Risk Map", "IBL", "The lowest wick during the first configured trading days of a month.", "MIN(low, first N monthly sessions)", ("low", "market session dates"), "pine-ibh-ibl-v1"),
]
for concept_id, category, name, definition, formula, inputs, version in TECHNICAL:
    CORE.append(concept(
        concept_id, category, name, definition,
        why="It provides a consistent technical reference calculated from the same OHLCV series as the research chart.",
        formula_plain=definition, formula_technical=formula, inputs=inputs,
        source="Derived OHLCV", source_priority=("Workbook OHLCV", "yfinance", "Investing.com"),
        sheets=("IDX Technical Detail", "Data Source Audit"),
        columns=(name,),
        thresholds="Settings are editable in Research Overlay View where applicable.",
        interpretation="Compare the value with price, its prior values, and related indicators.",
        limitations="Provider sessions, adjustments, and warm-up history can change the result.",
        example=f"{name} is displayed with its source, as-of date, and formula version.",
        formula_version=version,
    ))


STRUCTURE = [
    ("bos", "BOS", "A close crossing a confirmed pivot in the current structure direction."),
    ("choch", "CHoCH", "A close crossing a confirmed pivot against the previous structure direction."),
    ("order-block", "Order Block", "An OHLCV pivot-derived price box selected between a pivot and a structure break."),
    ("equal-high-low", "EQH / EQL", "Confirmed pivot highs or lows close enough to be treated as equal levels."),
    ("fvg", "FVG", "A three-candle price gap that satisfies the attached script conditions."),
    ("premium-zone", "Premium Zone", "The upper part of the active swing range."),
    ("equilibrium-zone", "Equilibrium Zone", "The narrow area around the midpoint of the active swing range."),
    ("discount-zone", "Discount Zone", "The lower part of the active swing range."),
    ("strong-high", "Strong High", "The latest swing high labelled strong when structure bias is downward."),
    ("weak-high", "Weak High", "The latest swing high labelled weak when structure bias is upward."),
    ("strong-low", "Strong Low", "The latest swing low labelled strong when structure bias is upward."),
    ("weak-low", "Weak Low", "The latest swing low labelled weak when structure bias is downward."),
]
for concept_id, name, definition in STRUCTURE:
    CORE.append(concept(
        concept_id, "Structure / SMC Overlay", name, definition,
        explanation=f"{definition} This is an OHLCV-derived technical annotation.",
        why="It helps describe price structure visually without using participant transaction data.",
        formula_plain="Apply the attached Pine-derived pivot and crossing rules to dated OHLCV candles.",
        formula_technical="pine-smc-ohlcv-v1",
        inputs=("open", "high", "low", "close", "volume"),
        source="Derived OHLCV", source_priority=("Workbook OHLCV", "yfinance", "Investing.com"),
        sheets=("Research Overlay View", "QA Calculation Audit"), columns=(name,),
        thresholds="Internal pivot length 5; swing length 50 by default. User settings can change display calculations.",
        interpretation="Treat the label as a technical structure annotation, not participant activity.",
        neutral_labels=(name, "Technical overlay", "Observed level"),
        limitations="Pivot confirmation introduces delay; provider/session differences can move levels.",
        example=f"The chart labels {name} only when the configured OHLCV rule is satisfied.",
        formula_version="pine-smc-ohlcv-v1",
    ))


LEVELS = [
    ("entry-poi", "Entry POI", "The workbook label describing the basis for the entry level.", "workbook field"),
    ("entry-level", "Entry", "A workbook-observed reference level used in the risk map.", "workbook field"),
    ("target-poi", "Target POI", "The workbook label describing the basis for the target level.", "workbook field"),
    ("target-level", "Target", "A workbook-observed comparison level above or below entry.", "workbook field"),
    ("target-upside", "Target Upside %", "Percentage distance from entry to target.", "(target-entry)/entry*100"),
    ("invalidation-poi", "Invalidation POI", "The workbook label describing the basis for invalidation.", "workbook field"),
    ("invalidation-level", "Invalidation", "A workbook level at which the displayed condition is no longer valid.", "workbook field"),
    ("risk-reward", "R/R", "Distance from entry to target divided by distance from entry to invalidation.", "ABS(target-entry)/ABS(entry-invalidation)"),
    ("beta-zone", "Beta Zone", "A workbook classification of relative price variability.", "workbook rule"),
    ("liquidity-category", "Liquidity Category", "A workbook grouping based on traded value or volume availability.", "workbook rule"),
    ("value-approximation", "Value Approximation", "An approximate traded-value field derived from price and volume.", "close*volume"),
]
for concept_id, name, definition, formula in LEVELS:
    CORE.append(concept(
        concept_id, "Levels & Risk Map", name, definition,
        why="It helps users understand the workbook level map without presenting a recommendation.",
        formula_plain=definition, formula_technical=formula,
        inputs=("workbook level fields",), source="Workbook / derived",
        sheets=("IDX Screener", "Ticker Intelligence"), columns=(name,),
        interpretation="Use as a neutral workbook level and compare it with the selected-date price.",
        limitations="A missing level remains explicit and the map is not a forecast.",
        example=f"{name} appears only when the workbook publishes its required inputs.",
        formula_version="workbook-level-map-v1",
    ))


FUNDAMENTAL_SPECS = [
    ("market-cap", "Fundamental Valuation", "Market Cap", "Company equity value at the observed price.", "price * shares outstanding", ("price", "shares outstanding")),
    ("enterprise-value", "Fundamental Valuation", "Enterprise Value", "Equity value adjusted for debt and cash.", "market cap + debt - cash", ("market cap", "debt", "cash")),
    ("shares-outstanding", "Fundamental Valuation", "Shares Outstanding", "Published number of company shares.", "provider field", ("shares outstanding",)),
    ("pe-annualised", "Fundamental Valuation", "Current PE Ratio Annualised", "Price relative to annualised current-period earnings.", "market cap / annualised net income", ("market cap", "annualised net income")),
    ("pe-ttm", "Fundamental Valuation", "Current PE Ratio TTM", "Price relative to trailing twelve-month earnings.", "market cap / net income TTM", ("market cap", "net income TTM")),
    ("earnings-yield", "Fundamental Valuation", "Earnings Yield TTM", "Trailing earnings as a percentage of market value.", "net income TTM / market cap", ("net income TTM", "market cap")),
    ("price-sales", "Fundamental Valuation", "Price to Sales TTM", "Market value relative to trailing revenue.", "market cap / revenue TTM", ("market cap", "revenue TTM")),
    ("price-book", "Fundamental Valuation", "Price to Book Value", "Market value relative to published equity.", "market cap / total equity", ("market cap", "total equity")),
    ("ev-ebit", "Fundamental Valuation", "EV to EBIT TTM", "Enterprise value relative to trailing operating earnings before interest and tax.", "enterprise value / EBIT TTM", ("enterprise value", "EBIT TTM")),
    ("ev-ebitda", "Fundamental Valuation", "EV to EBITDA TTM", "Enterprise value relative to trailing EBITDA.", "enterprise value / EBITDA TTM", ("enterprise value", "EBITDA TTM")),
    ("gross-margin", "Profitability", "Gross Profit Margin", "Gross profit as a percentage of revenue.", "gross profit / revenue", ("gross profit", "revenue")),
    ("operating-margin", "Profitability", "Operating Profit Margin", "Operating profit as a percentage of revenue.", "operating income / revenue", ("operating income", "revenue")),
    ("net-margin", "Profitability", "Net Profit Margin", "Net income as a percentage of revenue.", "net income / revenue", ("net income", "revenue")),
    ("roa", "Management Effectiveness", "ROA", "Net income relative to assets.", "net income / average assets", ("net income", "assets")),
    ("roe", "Management Effectiveness", "ROE", "Net income relative to equity.", "net income / average equity", ("net income", "equity")),
    ("roce", "Management Effectiveness", "ROCE", "Operating return relative to capital employed.", "EBIT / capital employed", ("EBIT", "capital employed")),
    ("roic", "Management Effectiveness", "ROIC", "After-tax operating return relative to invested capital.", "NOPAT / invested capital", ("NOPAT", "invested capital")),
    ("dso", "Management Effectiveness", "DSO", "Approximate days required to collect receivables.", "receivables / revenue * days", ("receivables", "revenue")),
    ("asset-turnover", "Management Effectiveness", "Asset Turnover", "Revenue produced per unit of assets.", "revenue / average assets", ("revenue", "assets")),
    ("days-inventory", "Management Effectiveness", "Days Inventory", "Approximate days inventory remains before use or sale.", "inventory / cost of revenue * days", ("inventory", "cost of revenue")),
    ("days-payables", "Management Effectiveness", "Days Payables", "Approximate days used to settle payables.", "payables / cost of revenue * days", ("payables", "cost of revenue")),
    ("cash-conversion-cycle", "Management Effectiveness", "Cash Conversion Cycle", "Collection days plus inventory days minus payable days.", "DSO + days inventory - days payables", ("DSO", "days inventory", "days payables")),
    ("receivables-turnover", "Management Effectiveness", "Receivables Turnover", "Revenue relative to average receivables.", "revenue / average receivables", ("revenue", "receivables")),
    ("current-ratio", "Solvency", "Current Ratio", "Current assets divided by current liabilities.", "current assets / current liabilities", ("current assets", "current liabilities")),
    ("quick-ratio", "Solvency", "Quick Ratio", "Liquid current assets divided by current liabilities.", "(current assets - inventory) / current liabilities", ("current assets", "inventory", "current liabilities")),
    ("debt-equity", "Solvency", "Debt to Equity", "Debt relative to equity.", "total debt / total equity", ("total debt", "total equity")),
    ("lt-debt-equity", "Solvency", "LT Debt to Equity", "Long-term debt relative to equity.", "long-term debt / total equity", ("long-term debt", "total equity")),
    ("liabilities-equity", "Solvency", "Total Liabilities to Equity", "Total liabilities relative to equity.", "total liabilities / total equity", ("total liabilities", "total equity")),
    ("financial-leverage", "Solvency", "Financial Leverage", "Assets relative to equity.", "average assets / average equity", ("assets", "equity")),
    ("interest-coverage", "Solvency", "Interest Coverage", "Operating earnings relative to interest expense.", "EBIT / interest expense", ("EBIT", "interest expense")),
    ("free-cash-flow", "Cash Flow", "Free Cash Flow", "Operating cash flow after capital expenditure.", "CFO + capex when capex is reported negative", ("CFO", "capex")),
    ("altman-original", "Solvency", "Altman Z-Score Original", "A multi-ratio financial distress indicator using the original public-company coefficients.", "1.2X1 + 1.4X2 + 3.3X3 + 0.6X4 + 1.0X5", ("working capital", "assets", "retained earnings", "EBIT", "market cap", "liabilities", "revenue")),
    ("altman-modified", "Solvency", "Altman Z-Score Modified", "A modified multi-ratio financial distress indicator.", "6.56X1 + 3.26X2 + 6.72X3 + 1.05X4", ("working capital", "assets", "retained earnings", "EBIT", "equity", "liabilities")),
]


for period in ("1M", "3M", "6M", "1Y", "3Y", "YTD"):
    FUNDAMENTAL_SPECS.append((
        f"return-{period.lower()}", "Price Performance", f"{period} Return",
        f"Price return over the published {period} comparison window.",
        "(latest close / comparison close - 1) * 100", ("close history",),
    ))


FUNDAMENTAL_SPECS.extend([
    ("week52-high", "Price Performance", "52 Week High", "Highest close or high in the published 52-week window.", "MAX(price, 52 weeks)", ("price history",)),
    ("week52-low", "Price Performance", "52 Week Low", "Lowest close or low in the published 52-week window.", "MIN(price, 52 weeks)", ("price history",)),
    ("book-value", "Balance Sheet", "Book Value", "Published total equity attributable to owners.", "total equity", ("equity",)),
    ("book-value-share", "Balance Sheet", "Book Value Per Share", "Book value divided by shares outstanding.", "book value / shares outstanding", ("book value", "shares outstanding")),
    ("tangible-book", "Balance Sheet", "Tangible Book Value", "Book value after subtracting intangible assets.", "book value - intangible assets", ("book value", "intangible assets")),
    ("tangible-book-share", "Balance Sheet", "Tangible Book Value Per Share", "Tangible book value divided by shares outstanding.", "tangible book value / shares outstanding", ("tangible book value", "shares outstanding")),
    ("short-debt", "Balance Sheet", "Short-term Debt", "Published debt due in the short term.", "provider field", ("short-term debt",)),
    ("long-debt", "Balance Sheet", "Long-term Debt", "Published debt due after the short term.", "provider field", ("long-term debt",)),
    ("cash", "Balance Sheet", "Cash", "Published cash and cash-equivalent amount.", "provider field", ("cash",)),
    ("total-assets", "Balance Sheet", "Total Assets", "Published total resources controlled by the company.", "provider field", ("total assets",)),
    ("total-liabilities", "Balance Sheet", "Total Liabilities", "Published total obligations.", "provider field", ("total liabilities",)),
    ("eps-ttm", "Income Statement", "EPS TTM", "Trailing twelve-month earnings per share.", "net income TTM / diluted shares", ("net income TTM", "diluted shares")),
    ("eps-quarter-growth", "Income Statement", "EPS Quarter YoY Growth", "Percentage change in quarterly EPS from the comparable prior-year quarter.", "(current EPS / prior-year EPS - 1)*100", ("current quarter EPS", "prior-year quarter EPS")),
    ("revenue-ttm", "Income Statement", "Revenue TTM", "Revenue summed over the trailing twelve months.", "SUM(last four quarters revenue)", ("quarterly revenue",)),
    ("revenue-quarter-growth", "Income Statement", "Revenue Quarter YoY Growth", "Percentage change in quarterly revenue from the comparable prior-year quarter.", "(current revenue/prior-year revenue - 1)*100", ("current quarter revenue", "prior-year quarter revenue")),
    ("net-income-ttm", "Income Statement", "Net Income TTM", "Net income summed over the trailing twelve months.", "SUM(last four quarters net income)", ("quarterly net income",)),
    ("ebit-ttm", "Income Statement", "EBIT TTM", "Operating earnings before interest and tax over the trailing twelve months.", "SUM(last four quarters EBIT)", ("quarterly EBIT",)),
    ("cfo-ttm", "Cash Flow", "CFO TTM", "Operating cash flow over the trailing twelve months.", "SUM(last four quarters CFO)", ("quarterly CFO",)),
    ("cfi-ttm", "Cash Flow", "CFI TTM", "Investing cash flow over the trailing twelve months.", "SUM(last four quarters CFI)", ("quarterly CFI",)),
    ("cff-ttm", "Cash Flow", "CFF TTM", "Financing cash flow over the trailing twelve months.", "SUM(last four quarters CFF)", ("quarterly CFF",)),
    ("capex-ttm", "Cash Flow", "Capex TTM", "Capital expenditure over the trailing twelve months.", "SUM(last four quarters capex)", ("quarterly capex",)),
    ("fcf-ttm", "Cash Flow", "FCF TTM", "Free cash flow over the trailing twelve months.", "CFO TTM + capex TTM when capex is negative", ("CFO TTM", "capex TTM")),
])


for concept_id, category, name, definition, formula, inputs in FUNDAMENTAL_SPECS:
    CORE.append(concept(
        concept_id, category, name, definition,
        formula_plain=definition, formula_technical=formula, inputs=inputs,
        source="Workbook / yfinance / Investing.com",
        source_priority=("Workbook", "yfinance", "Investing.com"),
        sheets=("IDX Fundamental Detail", "Data Source Audit"), columns=(name,),
        interpretation="Compare across time, sector context, and related fields; do not interpret one ratio alone.",
        limitations="Statement periods, currency units, restatements, and provider field coverage can differ.",
        example=f"If {name} is unavailable, the site shows its source and missing reason.",
        formula_version="fundamental-source-limited-v1",
    ))


PBV = [
    ("current-pbv", "Current PBV", "The latest published price-to-book value."),
    ("mean-pbv-3y", "Mean PBV 3Y", "Average PBV over the available three-year window."),
    ("pbv-plus-2sd", "PBV +2 SD", "Three-year mean PBV plus two standard deviations."),
    ("pbv-plus-1sd", "PBV +1 SD", "Three-year mean PBV plus one standard deviation."),
    ("pbv-minus-1sd", "PBV -1 SD", "Three-year mean PBV minus one standard deviation."),
    ("pbv-minus-2sd", "PBV -2 SD", "Three-year mean PBV minus two standard deviations."),
    ("pbv-zscore", "PBV Z-Score", "Standardised distance of current PBV from its historical mean."),
    ("pbv-percentile", "PBV Percentile", "Percent of historical PBV observations at or below the current value."),
    ("pbv-regime", "PBV Regime", "Neutral label describing current PBV location within its historical band."),
]
for concept_id, name, definition in PBV:
    CORE.append(concept(
        concept_id, "PBV Band Analysis", name, definition,
        formula_plain=definition,
        formula_technical="PBV history mean, standard deviation, z-score, or percentile as named",
        inputs=("current PBV", "historical PBV observations"),
        source="Workbook / derived financial history",
        sheets=("IDX Fundamental Detail",), columns=(name,),
        interpretation="Labels describe relative historical position, not a valuation conclusion.",
        neutral_labels=(name, "Low vs 3Y band", "Near 3Y mean", "High vs 3Y band"),
        limitations="Requires enough comparable history and can shift after statement restatements.",
        formula_version="pbv-band-v1",
    ))


CORE.extend([
    concept(
        "sentiment-news", "News & Corporate Actions", "Sentiment News",
        "A workbook summary label for available recent news text.",
        formula_plain="Apply the workbook news parser to available recent headlines.",
        formula_technical="workbook_news_rule", inputs=("headline", "published date"),
        source="Workbook / available news source", sheets=("IDX News", "IDX Screener"),
        columns=("Sentiment News",), thresholds="Only the configured freshness window is included.",
        limitations="Text coverage can be incomplete and the label is not a price forecast.",
        formula_version="news-window-v1",
    ),
    concept(
        "corporate-action", "News & Corporate Actions", "Corporate Action",
        "A published company event such as dividend, split, rights issue, or another available action.",
        formula_plain="Read provider action records within the configured date window.",
        formula_technical="cutoff <= action.date <= market_date",
        inputs=("action type", "action date"), source="Workbook / yfinance",
        sheets=("IDX News", "IDX Screener"), columns=("Corp. Action",),
        limitations="Historical event availability depends on provider coverage.",
        formula_version="corp-action-window-v1",
    ),
])


for concept_id, name, definition in [
    ("status-ok", "OK", "The record passed required publication checks."),
    ("status-partial", "Partial Data", "The record is usable but one or more fields are unavailable."),
    ("status-no-data", "No Data", "No valid source record was available for the selected date."),
    ("qa-warning", "QA Warning", "A validation check found a condition that needs attention but may not block publication."),
    ("missing-field", "Missing Field", "A required or optional published field has no usable value."),
    ("source-unavailable", "Source Unavailable", "The approved provider returned no usable response."),
    ("insufficient-history", "Insufficient History", "The formula requires more dated observations than are available."),
    ("not-applicable", "Formula Not Applicable", "The formula does not apply to this company, field, or period."),
]:
    CORE.append(concept(
        concept_id, "Data Quality / Missing Data", name, definition,
        formula_plain="Publish status and reason instead of replacing the value with an unexplained dash.",
        formula_technical="value=null; status; reason; source; asOf; formula",
        inputs=("provider result", "validation rules"), source="QA pipeline",
        sheets=("Data Processing Results", "QA Calculation Audit", "Data Source Audit"),
        columns=(name,), interpretation="Inspect the source, reason, as-of date, and formula before using adjacent values.",
        formula_version="source-limited-v3",
    ))


CORE.extend([
    concept(
        "historical-point-in-time", "Historical Data / Point-in-Time Rules", "Point-in-Time Data",
        "Data calculated only from information available on or before the selected market date.",
        formula_plain="Clip every OHLCV series to the selected date before calculations.",
        formula_technical="rows.filter(date <= selectedMarketDate)",
        inputs=("dated source records", "selected market date"), source="Archive pipeline",
        sheets=("Historical archive",), columns=("sourceMode",),
        limitations="Some fundamentals and news were not archived point-in-time and are separately labelled latest-reference.",
        example="The June 9 chart cannot use the June 10 candle.",
        formula_version="archive-schema-v5",
    ),
    concept(
        "latest-reference", "Historical Data / Point-in-Time Rules", "Latest-Reference Data",
        "A newer fundamental or news record shown with an explicit reference badge in a historical view.",
        formula_plain="Load the named reference date without presenting it as point-in-time.",
        formula_technical="sourceMode=latest_reference_not_point_in_time",
        inputs=("reference market date",), source="Workbook archive",
        sheets=("IDX Fundamental Detail", "IDX News"), columns=("sourceMode",),
        limitations="It must not be interpreted as information known on the selected historical date.",
        formula_version="archive-schema-v5",
    ),
    concept(
        "tradingview-display", "TradingView Chart Notes", "TradingView Display",
        "An embedded external chart for visual inspection using TradingView-managed data.",
        formula_plain="Map the ticker to IDX:TICKER and load the public Advanced Chart widget.",
        formula_technical="TradingView symbol mapping only",
        inputs=("ticker",), source="TradingView display",
        sheets=("Ticker Intelligence",), columns=("TradingView View",),
        limitations="Values and sessions may differ from workbook and website-calculated overlays; it is not a hidden calculation source.",
        formula_version="tradingview-display-v1",
    ),
    concept(
        "research-overlay", "TradingView Chart Notes", "Research Overlay View",
        "The auditable chart calculated from the project's approved OHLCV series.",
        formula_plain="Calculate enabled indicators from the same date-capped OHLCV rows.",
        formula_technical="website indicator engine",
        inputs=("OHLCV", "indicator settings", "market date"),
        source="Workbook / yfinance / Investing.com",
        sheets=("Ticker Intelligence",), columns=("Research Overlay View",),
        formula_version="chart-v4",
    ),
    concept(
        "disclaimer", "Compliance / Disclaimer", "Educational Research Only",
        "The dashboard presents research data and technical descriptions, not financial advice.",
        formula_plain="Display the disclaimer throughout the product.",
        formula_technical="compliance_copy_v1", source="Product policy",
        sheets=("All website pages", "Guide & Logic Reference"), columns=("Disclaimer",),
        interpretation="Users remain responsible for independent research and decisions.",
        formula_version="compliance-copy-v1",
    ),
])


LOGIC_REFERENCE = CORE


def validate_registry(records: list[dict[str, Any]] | None = None) -> list[str]:
    records = records or LOGIC_REFERENCE
    errors: list[str] = []
    ids: set[str] = set()
    for index, item in enumerate(records):
        missing = REQUIRED_FIELDS - set(item)
        if missing:
            errors.append(f"record {index} missing fields: {sorted(missing)}")
        item_id = str(item.get("id") or "")
        if item_id in ids:
            errors.append(f"duplicate id: {item_id}")
        ids.add(item_id)
        text = json.dumps(item, ensure_ascii=False)
        match = BANNED_ADVICE_WORDS.search(text)
        if match:
            errors.append(f"{item_id} contains banned wording: {match.group(0)}")
    return errors


def registry_payload() -> dict[str, Any]:
    errors = validate_registry()
    if errors:
        raise ValueError("; ".join(errors))
    return {
        "schemaVersion": REGISTRY_VERSION,
        "generatedAt": LAST_REVIEWED,
        "recordCount": len(LOGIC_REFERENCE),
        "records": LOGIC_REFERENCE,
    }


def export_registry(path: str | Path) -> Path:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(registry_payload(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return target


def workbook_rows() -> list[list[str]]:
    return [[
        item["category"],
        item["displayName"],
        item["shortDefinition"],
        item["whyItMatters"],
        item["formulaPlainEnglish"],
        ", ".join(item["inputs"]),
        item["source"],
        "; ".join(
            f"{sheet}: {', '.join(item['outputColumns'])}"
            for sheet in item["outputSheets"]
        ),
        item["interpretation"],
        item["thresholds"],
        item["missingDataRules"],
        item["limitations"],
        item["example"],
        item["formulaVersion"],
    ] for item in LOGIC_REFERENCE]
