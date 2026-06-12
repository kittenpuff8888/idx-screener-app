# Data Quality Baseline

## Current Health

June 10, 2026:

- 956 tickers scanned
- 952 `OK`
- 4 `PARTIAL DATA`
- 0 `NO DATA`
- 9,560 calculation QA rows
- 9,108 QA passes
- 452 QA warnings
- 0 QA failures

This indicates good processing completion, but processing success is not the same as field completeness or point-in-time validity.

## Field Completeness

| Section | Rows | Fields | Fields with missing values | Always-missing fields |
|---|---:|---:|---:|---:|
| Screener | 35 | 29 | 4 | 2 |
| Technical | 956 | 147 | 111 | 0 |
| Fundamental | 952 | 91 | 81 | 11 |
| News | 952 | 10 | 9 | 4 |
| Processing | 956 | 7 | 0 | 0 |

High-impact examples:

- Screener `Corp. Action` and `Beta Zone`: 100% missing.
- Screener sentiment: 68.6% missing.
- Technical MACD cross: 93.3% missing.
- Technical divergence fields: 79.2% missing.
- Fundamental PBV regime/statistical fields: 100% missing.
- News sentiment and URL: 74.8% missing.
- News corporate-action fields: 100% missing.

Missingness is not automatically a bug. Some event fields should be sparse. The defect is that the contract does not say whether a blank means no event, unavailable data, insufficient history, or failed calculation.

## Critical Risks

### P0: Historical Truth Is Mixed

The date selector implies equivalent historical snapshots, but only two dates are full workbook runs. The other dates are technical reconstructions. Fundamentals and news shown beside historical technical values can be latest-reference data.

Required fix:

- Add `dataCompleteness`, `pointInTimeDomains`, and `referenceDomains` metadata per snapshot.
- Label latest-reference fundamentals/news on historical pages.
- Prefer generating full point-in-time backend runs where source licensing and runtime allow it.

### P0: Dual Calculation Engines

Technical indicators exist in Python and JavaScript. Formula drift can occur after either side changes.

Required fix:

- Create shared golden fixtures with OHLCV input and expected values.
- Run the same fixtures against Python and JavaScript in CI.
- Version every formula and expose the version in payload metadata.

### P1: Dual Schemas

The frontend supports schema v3 and v4 through fallback normalization. This increases branching and makes fields silently disappear by date.

Required fix:

- Define one canonical API schema.
- Export both full and historical runs into that schema.
- Move raw workbook data to offline artifacts, not the user payload.

### P1: Payload Bloat

- Latest full payload: 36.7 MB.
- Previous full payload: 36.6 MB.
- Historical compact snapshots: 93.2 MB total.
- Shared OHLCV: 59.7 MB.

The latest payload includes raw workbook sheets, field catalog, and ticker details that the UI does not display.

Required fix:

- Split overview, screener, ticker, fundamentals, and news endpoints.
- Remove `workbookSheets`, `fieldCatalog`, and `tickerDetails` from production browser payloads.
- Add Brotli/Gzip-aware hosting or migrate data delivery to an object store/CDN/API.

### P1: Type Instability

Fields can alternate among number, string, `-`, `N/A`, and null. Formatting logic uses permissive parsing, which can hide bad data.

Required fix:

- Validate generated JSON with JSON Schema.
- Use null for absent values.
- Keep labels and units separate from numeric values.
- Reject unexpected type changes in CI.

## Recommended Quality Dimensions

Measure these per market date and domain:

1. Completeness: expected non-null coverage.
2. Validity: type, range, allowed enumeration, and unit checks.
3. Timeliness: source timestamp versus market date and publication time.
4. Consistency: cross-field and cross-engine agreement.
5. Uniqueness: one canonical ticker record per date.
6. Accuracy: comparison against TradingView or another agreed benchmark.
7. Lineage: source and formula version attached to each derived field.

## Proposed Release Gates

- No payload with duplicate tickers.
- No OHLCV bar after the selected market date.
- Close must lie within low/high.
- Support must not exceed current price; resistance must not be below it.
- RSI must be between 0 and 100.
- Fast/slow MACD and EMA fixtures must match golden values within tolerance.
- Breadth totals must equal covered tickers.
- Signal counts must reconcile between summary, overview, and rows.
- Point-in-time domains must be explicitly declared.
- No unexpected 100%-missing production field without an approved exception.

