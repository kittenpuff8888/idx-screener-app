# IDX RESEARCH

IDX RESEARCH is a static GitHub Pages research dashboard. Python generates the
workbook and versioned JSON archive; the browser renders committed files without
a production application server or database.

## Approved Sources

- Existing workbook outputs are the final published user-facing source.
- `yfinance` provides OHLCV, metadata, actions, and financial statements when available.
- Public Investing.com pages may provide fields through the cache-aware adapter.
- TradingView-compatible chart components are display only and are never a hidden calculation source.

Provider failures, unavailable fields, and insufficient history remain explicit.
The dashboard does not create synthetic historical values.

## Architecture

```text
rebuild_backend/
  IDX_Screener.py
  schema.py
  source_registry.py
  providers/
  calculations/
scripts/
  export_latest.py
  fetch_market_context.py
  archive_v5.py
  backfill_history.py
  update_daily.py
  validate_data.py
docs/
  index.html
  app.js
  indicators.js
  styles.css
  data/
    manifest.json
    logic-reference.json
    update-log.json
    dates/YYYY-MM-DD/
data_sources/
  full-workbook/YYYY-MM-DD.json
  market-context.json
tests/
.github/workflows/daily-idx-data-update.yml
```

The original files under the owner's OneDrive folder are reference inputs and
are not overwritten by this repository.

## Schema V5 Archive

Each real market session has:

```text
docs/data/dates/YYYY-MM-DD/overview.json
docs/data/dates/YYYY-MM-DD/screener.json
docs/data/dates/YYYY-MM-DD/technical.json
docs/data/dates/YYYY-MM-DD/fundamental.json
docs/data/dates/YYYY-MM-DD/news.json
docs/data/dates/YYYY-MM-DD/processing-results.json
docs/data/dates/YYYY-MM-DD/qa-audit.json
```

The current backfill contains 341 real sessions from January 2, 2025 through
June 12, 2026. Dates are discovered from stored OHLCV sessions, so weekends,
exchange holidays, and absent sessions are not fabricated.

June 9 through June 12 use full workbook data. Earlier sessions reconstruct
price/technical fields from real OHLCV. Fundamentals and news that were not
captured point-in-time are marked `latest_reference_not_point_in_time`.

## Commands

Historical backfill:

```powershell
python scripts/backfill_history.py --start 2025-01-01 --end 2026-06-12 --source-date 2026-06-12
```

Daily update:

```powershell
python scripts/update_daily.py --timezone Asia/Jakarta --market-close-time 16:30 --session-ready-time 17:00
```

Validation and tests:

```powershell
python scripts/validate_data.py
python -m unittest discover -s tests -v
node --check docs/app.js
node --check docs/indicators.js
```

## Daily Automation

`.github/workflows/daily-idx-data-update.yml` runs at:

```text
30 9 * * 1-5
30 10 * * 1-5
30 11 * * 1-5
```

These are the required 16:30 WIB close check plus 17:30 and 18:30 WIB retries.
The workflow also supports `workflow_dispatch`.

Each run:

1. Resolves the completed market date.
2. Waits until the current session is expected to be available after 17:00 WIB.
3. Runs the workbook backend and exporter when a new date is needed.
4. Confirms the latest observed IDX OHLCV date matches the requested market date.
5. Discards a date-stamped export when its underlying IDX prices are still stale.
6. Creates a new dated schema-v5 folder only for a valid market session.
7. Preserves older dated folders.
8. Validates schema and reconciliation counts.
9. Runs Python and JavaScript checks.
10. Commits generated files only when content changed.

If no new valid dataset exists, the last successful snapshot remains active and
the updater writes an explicit log entry.

## Current June 12 Baseline

- 956 scanned tickers
- 952 OK tickers
- 4 partial-data tickers
- 0 no-data tickers
- 49 screener signal rows
- 35 unique signal tickers

## Frontend

The date selector affects Research Dashboard, Screener, Watchlist values,
Ticker Research, local research indexes, internal QA tools, and chart history.
The selected date remains visible in the sticky top bar.

KSEI Ownership is intentionally independent of the selected market date. It loads
the latest KSEI ownership snapshot once and does not reload when price-research
dates change.

Main pages:

- Research Dashboard
- Screener
- Watchlist
- KSEI Ownership
- IDX Ticker News
- Advanced

Ticker Research opens as a shared drawer from search, Screener, Watchlist, KSEI,
and index details. Data Quality, Workbook Explorer, and Guide & Methodology remain
reachable inside Advanced without dominating the primary research workflow.

Indicator settings use one browser-wide profile and apply to every ticker and
market date.

Research only. Not financial advice. Verify important information independently.
