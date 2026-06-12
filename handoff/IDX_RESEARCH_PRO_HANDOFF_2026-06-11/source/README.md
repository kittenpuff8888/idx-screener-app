# IDX RESEARCH

Static GitHub Pages website for the IDX VWAP screener.

## Project Structure

```text
rebuild_backend/
  IDX_Screener.py          # Audited website backend copy; original OneDrive file remains untouched
scripts/
  sync_local_source.py     # Stages a new OneDrive source for review and merge
  run_backfill.py          # Runs one or more market dates
  export_latest.py         # Exports schema v3, all workbook sheets, QA, and ticker details
  add_qa_audit.py          # Adds QA traceability to an existing workbook copy
  fetch_site_ohlcv.py      # Seeds static daily OHLCV files when needed
  build_historical_snapshots.py # Recalculates Jan 1-Jun 10 historical sessions
tests/
  test_calculation_logic.py
docs/
  index.html               # Dashboard structure
  styles.css               # Responsive Flow-inspired interface
  app.js                   # Overview, screener, ticker research, calendar, and chart controls
  indicators.js            # Pine-equivalent VWAP, RSI, MACD, IBH/IBL, MA, and SMC calculations
  data/                    # Published snapshots, QA reports, and OHLCV
  downloads/               # Downloadable source workbooks
Raw/                       # Existing screener inputs
Output/                    # Generated workbooks
Cache/                     # Existing runtime cache
```

## How It Works

- `rebuild_backend/IDX_Screener.py` is the website's automation copy of the existing screener and creates an Excel workbook in `Output/`.
- `scripts/export_latest.py` converts every workbook sheet into the schema v3 web contract.
- `docs/index.html` provides market overview, screener, and TradingView-style ticker research.
- The calendar exposes 103 actual IDX sessions from January 2 through June 10, 2026. January 1 was not a market session.
- Chart indicator settings are one browser-wide profile. A setting changed on one ticker applies to every ticker and market date.
- `scripts/build_historical_snapshots.py` rebuilds the historical window from published OHLCV whenever the daily pipeline runs.
- `.github/workflows/idx-screener-pages.yml` runs after the market cutoff and publishes generated data to the `main` branch.
- GitHub Pages serves the committed `docs/` directory directly from `main`.

The interface uses only workbook fields produced by the screener. It does not add broker-flow, Wyckoff, transaction-flow, or other unsupported analysis.

## GitHub Setup

1. Create a new GitHub repository.
2. Push these files to the `main` branch.
3. Open the repository on GitHub, then go to `Settings` -> `Pages`.
4. Set `Source` to `Deploy from a branch`, branch `main`, folder `/docs`.
5. Open the `Actions` tab and run `IDX Screener Pages` manually once.

Scheduled data commits use the repository-scoped `IDX_PAGES_DEPLOY_KEY` Actions
secret. Its matching public key must be registered as a write-enabled deploy key.

The scheduled workflow tries at `10:00`, `12:00`, and `14:00 UTC`, which is
`17:00`, `19:00`, and `21:00 WIB`. Retry runs skip a market date once it is
already present in the published manifest.

## Updating From Your Local VWAP Screener Folder

When you change this file:

`C:\Users\azhar\OneDrive\Documents\VWAP Screener\IDX_Screener.py`

stage it first:

```powershell
python scripts/sync_local_source.py
```

The staged file is written to `rebuild_backend/incoming/IDX_Screener.py`. Compare and merge it into the audited backend copy, then run:

```powershell
python -m unittest discover -s tests -v
python scripts/run_daily.py
git add rebuild_backend scripts tests docs Raw
git commit -m "Sync latest IDX screener script"
git push
```

This staging workflow prevents a new local script from silently removing the audited TradingView-alignment and website integration fixes. The OneDrive source is never edited.

When a committed change touches `rebuild_backend/IDX_Screener.py`, GitHub Actions
reruns workbook-backed dates and then rebuilds all historical website snapshots.
This keeps the published date selector aligned with the current calculation logic.

## Backfill And Daily Data

- The scheduled workflow runs one completed market date each weekday, using
  the 17:00 WIB publication cutoff and guarded retry windows.
- Manual `Run workflow` can backfill the last 7 market weekdays by leaving `market_date` empty.
- To run only one date manually, fill `market_date` with `YYYY-MM-DD`.
- The sync script forces `BACKTEST_MODE = False` and `USE_CUSTOM_TICKERS_ONLY = False`, so the GitHub run uses the full KSEI ticker universe.
