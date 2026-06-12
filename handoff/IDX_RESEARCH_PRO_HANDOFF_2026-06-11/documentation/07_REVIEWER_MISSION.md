# Reviewer Mission

Use this brief when handing the package to another engineer or researcher.

## Objective

Audit and improve IDX RESEARCH as a trustworthy, fast, maintainable IDX stock-research product. Preserve the existing screener’s supported calculations and data boundaries. Do not invent unavailable datasets or imply full TradingView parity.

## Required Workstreams

### Data Engineering

- Unify schema v3 and v4.
- Add formal JSON Schema and CI validation.
- Add source, as-of timestamp, formula version, and missing reason.
- Establish true point-in-time behavior by domain.
- Reduce payload size and split data by user need.

### Quantitative QA

- Compare Python and JavaScript indicators against golden fixtures.
- Benchmark agreed indicators against TradingView using fixed symbols and dates.
- Verify all date transitions and prevent future-data leakage.
- Reconcile summary, signal, breadth, and ticker-level calculations.

### Software Engineering

- Modularize the Python backend.
- Remove dead frontend code and raw production exports.
- Add automated browser tests for routes, calendar, chart, and settings.
- Add build observability and failure reporting.

### Product And UI/UX

- Research investor workflows and terminology.
- Make data provenance visible at section level.
- Simplify the screener without removing expert detail.
- Improve evidence presentation, units, formatting, accessibility, and mobile use.

## Non-Negotiable Constraints

- Bullish is blue; bearish is red.
- Keep the Market Workspace concept.
- Indicator settings apply globally to all tickers and dates.
- Do not expose raw workbook rows in the normal product interface.
- Do not add broker flow, Wyckoff, smart-money tracking, or unavailable proprietary data.
- Do not overwrite the original OneDrive Python source.
- Any calculation change must rebuild and retest historical outputs.

## Expected Deliverables

1. Architecture decision record.
2. Canonical schema and migration plan.
3. Data-quality scorecard.
4. Calculation parity report.
5. User-research findings and revised journeys.
6. Prioritized implementation plan.
7. Tested code with before/after performance measurements.

