# UI/UX Research Brief

## Product Intent

IDX RESEARCH should help an Indonesian equity user move through this sequence:

1. Understand today’s market condition.
2. Discover technically qualified candidates.
3. Inspect one ticker’s chart and evidence.
4. Understand why it matched.
5. Evaluate entry, target, invalidation, and risk/reward.
6. Distinguish strong data from partial or reference-only data.

## Current Information Architecture

- Market Map
- Signal Screener
- Watchlist
- Ticker Intelligence
- KSEI Ownership
- Guide
- Market-date calendar modal
- Global indicator-settings modal

Internal tools, reachable from the footer but removed from primary navigation:

- Workbook Explorer
- Data Quality

Raw workbook records are not presented in the main product experience.

## Current Strengths

- Focused six-page primary navigation.
- Prominent ticker chart.
- Bullish blue and bearish red are consistent.
- Market date is visible and selectable from a calendar.
- Header reload and point-in-time workbook download are easy to reach.
- Market context is date-capped and separate from issuer data.
- Sector groups are collapsed by default to reduce scanning load.
- Chart handles missing history with a proper empty state.
- Indicator settings are global and persist across dates and tickers.
- Research drawings persist per ticker in the local browser.
- Desktop and mobile layouts avoid horizontal page overflow.
- Raw workbook rows are not shown in the main product experience.

## Current UX Risks

### Historical Data Confidence

The strongest risk is conceptual, not visual. A user can select a historical date and see latest-reference fundamentals or news without a prominent point-in-time disclaimer.

Current response:

- Use one compact source footnote at the bottom of Ticker Intelligence.
- State when fundamentals or news are latest-reference fields.
- Keep price, technical values, and signals explicitly capped to the selected date.
- Use inline missing-value metadata for unavailable fields.

### Signal Density

The screener table has 14 columns. It is useful for experts but demanding on smaller screens.

Design response:

- Define a primary compact view: ticker, signal, price/change, RVOL, RS, setup quality.
- Move trade-plan detail to expandable rows or ticker analysis.
- Allow saved column presets.

### Chart Tool Expectations

The custom tool rail resembles TradingView but supports a smaller set of interactions.

Design response:

- Keep the compact T/R/F/A controls with descriptive tooltips and accessible names.
- Clearly label unsupported drawing functions.
- Avoid implying full TradingView feature parity.

### Chart Annotation Overload

The current default SMC markers can place many `SH`, `SL`, `EQH`, `EQL`, and `BOS` labels on the same viewport. On BBCA’s one-year view this substantially obscures candles and other indicators.

Current response:

- Internal structure, order blocks, and equal-high/low markers default off.
- Swing structure remains available.
- Structure labels are capped at 15 and the chart reports hidden older labels.
- Separate indicator settings remain available for advanced users.

### Analysis Explanation

Signals are described, but there is no consistent evidence hierarchy.

Design response:

- Use a structured “Why it matched” pattern:
  - Rule
  - Current value
  - Threshold
  - Pass/fail
  - Data source and as-of date

### Fundamentals Readability

Raw decimals can appear without investor-friendly units or percentage formatting.

Design response:

- Define display metadata for each field: label, unit, decimals, scale, good/bad direction.
- Separate raw value from display value.

## Research Questions

Interview at least three user types:

- Active IDX trader
- Swing trader using TradingView
- Research-oriented investor

Questions:

1. Can users explain why a ticker matched without reading every card?
2. Can users distinguish a live/full date from a reconstructed date?
3. Which five screener columns drive decisions?
4. Do users trust the trade plan, and what evidence is missing?
5. Which indicators should be on by default?
6. Is global indicator persistence expected or surprising?
7. Can users recover from partial/missing data?
8. Does the terminology match Indonesian market practice?

## Suggested Usability Tasks

1. Find the strongest EMA Trend candidate on June 10.
2. Open its ticker analysis and explain the entry and invalidation.
3. Change to June 8 and identify what changed.
4. Change RSI from 14 to 10, open another ticker, and confirm persistence.
5. Identify whether fundamentals are point-in-time on the historical date.
6. Find a ticker with partial history and explain the empty-state message.

## Success Metrics

- Time to first qualified ticker
- Percentage who correctly explain signal logic
- Percentage who correctly identify data provenance
- Screener-to-ticker conversion
- Date-switch error/confusion rate
- Chart-setting completion rate
- Mobile task completion
- Trust score before and after provenance labels

## Accessibility Review

Required next checks:

- WCAG contrast audit in both themes.
- Keyboard focus order through chart controls and modals.
- Focus trapping and focus return for modals.
- Screen-reader descriptions for chart state and indicator values.
- 200% zoom testing.
- Reduced-motion support.
- Replace abbreviation-only chart controls with accessible names and icons.
