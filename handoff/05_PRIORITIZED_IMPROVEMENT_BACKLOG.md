# Prioritized Improvement Backlog

## P0: Trust And Correctness

| Item | Outcome | Acceptance criteria |
|---|---|---|
| Unified canonical schema | Same fields and semantics on every date | One versioned JSON Schema; frontend has no v3/v4 branch |
| Historical provenance | Users know which domains are point-in-time | Every section displays source mode and as-of timestamp |
| Cross-engine parity tests | Python and browser indicators cannot drift silently | Golden tests for EMA, SMA, RSI, MACD, VWAP, IBH/IBL, SMC pivots |
| Date reconciliation suite | Date selector never repeats or leaks future data | Automated checks across all dates and representative tickers |
| Missing-reason taxonomy | Blank values become interpretable | Null plus status/reason/source metadata |

## P1: Performance And Maintainability

| Item | Outcome | Acceptance criteria |
|---|---|---|
| Split production payloads | Faster initial load and lower bandwidth | Overview under 250 KB; ticker detail loaded on demand |
| Remove raw browser exports | No unused workbook dump in production | Exclude workbook sheets, catalog, and tickerDetails |
| Modularize backend | Lower regression risk | Separate data fetch, indicators, signals, workbook, and export modules |
| Formal schema validation | Contract failures stop deployment | CI validates every generated payload |
| Data catalog | Every field has owner, unit, source, formula, freshness | Machine-readable catalog published with build |
| Observability | Failures are actionable | Build summary reports source errors, stale data, missingness deltas |

## P1: Product Clarity

| Item | Outcome | Acceptance criteria |
|---|---|---|
| Evidence-based signal card | Users can verify each signal | Rule/value/threshold/status/source shown |
| Section-level provenance badges | Historical limitations are visible | Badge on chart, technical, fundamental, news sections |
| Investor-friendly formatting | Values read naturally | IDR scales, percentages, ratios, dates, and null states standardized |
| Compact screener mode | Better scan speed and mobile usability | Six primary columns, expandable detail |

## P2: Advanced UX

| Item | Outcome | Acceptance criteria |
|---|---|---|
| URL date state | Shareable historical analysis | Date and ticker are represented in URL |
| Saved views | Repeatable research workflow | Persist filters, sort, columns, and indicator presets |
| Comparison view | Compare candidates | Two to four tickers with normalized metrics |
| Watchlist | Track selected tickers | Local-first watchlist with clear persistence behavior |
| Chart legend controls | Faster visual inspection | Click indicator legend to hide/show |
| SMC density controls | Candles remain readable | Swing/internal toggles, collision control, sensible default |
| Research notes | Preserve user reasoning | Local notes exportable without private server dependency |

## Suggested Delivery Sequence

### Phase 1: Two weeks

- Canonical schema and provenance model
- Missing-value taxonomy
- Golden calculation fixtures
- Date reconciliation tests
- Remove unused raw production payload

### Phase 2: Two to four weeks

- Endpoint/file splitting
- Backend modularization
- Data catalog and CI validation
- Section badges and evidence-based signal explanations
- Formatting system

### Phase 3: Four to eight weeks

- User research and usability iteration
- Screener presets and compact mode
- Shareable date URLs
- Watchlists and comparisons
- Accessibility conformance work
