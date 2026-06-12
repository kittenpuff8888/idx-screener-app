# Data Contract And Lineage

## Source Hierarchy

| Domain | Current source | Notes |
|---|---|---|
| Price and volume | Yahoo Finance OHLCV cache | Hard-clipped to `MARKET_DATE` in the backend |
| Universe | KSEI/raw workbook inputs | Full universe mode is forced for website runs |
| Technical indicators | Python backend and browser indicator engine | Two implementations require parity testing |
| Fundamentals | yfinance, then IDX API, then Investing.com fallback | Historical fundamentals are not replay-adjusted |
| News | Workbook-exported fetched news | Sparse; historical snapshots reuse latest reference data in UI |
| Corporate actions | Workbook fields when available | Latest dataset is largely empty |
| Ownership/concentration | Raw workbook/KSEI-derived fields | Present only in full workbook-backed payloads |

## Contract A: Full Workbook Export

- Schema version: 3
- Dates currently available: June 9 and June 10, 2026
- Typical size: approximately 35 MB per date
- Top-level collections:

| Collection | June 10 rows | Fields | Purpose |
|---|---:|---:|---|
| `screener` | 35 | 29 | Published filter matches and trade-plan values |
| `technical` | 956 | 147 | Technical, structure, VWAP, momentum, ownership summary |
| `fundamental` | 952 | 91 | Valuation, profitability, balance sheet, returns, dividends |
| `news` | 952 | 10 | News, sentiment, and corporate-event placeholders |
| `processing` | 956 | 7 | Source status, bars, retries, latest market day |
| `stocks` | 956 | normalized object | Product-facing normalized ticker model |
| `workbookSheets` | 8 sheets | raw workbook-shaped | Legacy/raw export; not displayed in current UI |
| `fieldCatalog` | 299 | metadata rows | Legacy field index |
| `tickerDetails` | 956 | nested raw records | Legacy all-fields structure |

## Contract B: Historical Compact Snapshot

- Schema version: 4
- Dates currently available: 101 sessions from January 2 through June 8, 2026
- Typical size: approximately 0.9 MB per date
- Generated from shared OHLCV through `scripts/build_historical_snapshots.py`
- Top-level content:
  - `summary`
  - `overview`
  - `screener`
  - `stocks`
  - provenance markers: `snapshotMode` and `sourceLogic`

Historical compact snapshots recalculate:

- OHLCV and daily change
- EMA25, EMA50, SMA200
- RSI14 and RSI average
- MACD 12/26/9 with EMA3 histogram smoothing
- monthly VWAP
- monthly IBH/IBL
- prior-week and prior-month levels
- rolling support/resistance
- trend and simplified structure
- relative-strength percentile
- simplified A/B/D signals and trade-plan levels

They do not preserve historical:

- fundamentals as known on that date
- news as known on that date
- ownership changes
- corporate actions
- complete backend filters C/E/F/G
- exact full-workbook field set

## Normalized Product Model

The preferred frontend model is `stocks[ticker]`. Important fields:

| Group | Fields |
|---|---|
| Identity | `ticker`, `companyName`, `sector`, `industry` |
| Quote | `lastPrice`, `changePercent`, `volume`, `rvol`, `rsRating` |
| Trend | `trend.internal`, `trend.swing` |
| Structure | `structure.internal`, `structure.swing` |
| Moving averages | `movingAverages.ema25`, `ema50`, `sma200`, `zone` |
| Levels | `supportLevels`, `resistanceLevels`, `levels.ibh/ibl/pwh/pwl/mdh/mdl` |
| Trade plan | `entry`, `target`, `invalidation`, `riskReward`, `upsidePercent`, `downsidePercent` |
| Technical | RSI, MACD, VWAP, ADR, ATR, price location |
| Fundamentals | market cap, PE, PBV, ROE, debt/equity, dividend yield, free float |
| Intelligence | `news`, `signalExplanation`, `signalCount` |

## Missing-Value Semantics

Current payloads mix `null`, empty string, `-`, and `N/A`. This prevents reliable distinction between:

- unavailable from source
- insufficient history
- not applicable
- not calculated
- calculation error
- intentionally suppressed

Recommended representation:

```json
{
  "value": null,
  "status": "missing",
  "reason": "insufficient_history",
  "source": "yahoo_ohlcv",
  "asOf": "2026-06-10",
  "formulaVersion": "SMA_200_V1"
}
```

## Full Field Dictionary

Use `machine-readable/field_profile_latest.csv`. It contains section, field, row count, missing count, missing percentage, observed types, and examples for every latest-workbook field.

