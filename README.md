# IDX Screener Website

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
tests/
  test_calculation_logic.py
docs/
  index.html               # Dashboard structure
  styles.css               # Responsive Flow-inspired interface
  app.js                   # Overview, screener, candlesticks, QA, and workbook explorer
  data/                    # Published snapshots, QA reports, OHLCV, and field catalog
  downloads/               # Downloadable source workbooks
Raw/                       # Existing screener inputs
Output/                    # Generated workbooks
Cache/                     # Existing runtime cache
```

## How It Works

- `rebuild_backend/IDX_Screener.py` is the website's automation copy of the existing screener and creates an Excel workbook in `Output/`.
- `scripts/export_latest.py` converts every workbook sheet into the schema v3 web contract.
- `docs/index.html` provides market overview, screener, ticker research, data QA, and Workbook Explorer.
- `.github/workflows/idx-screener-pages.yml` runs every weekday at 17:00 WIB and deploys `docs/` to GitHub Pages.

The interface uses only workbook fields produced by the screener. It does not add broker-flow, Wyckoff, transaction-flow, or other unsupported analysis.

## GitHub Setup

1. Create a new GitHub repository.
2. Push these files to the `main` branch.
3. Open the repository on GitHub, then go to `Settings` -> `Pages`.
4. Set `Source` to `GitHub Actions`.
5. Open the `Actions` tab and run `IDX Screener Pages` manually once.

The scheduled run uses `10:00 UTC`, which is `17:00 WIB`.

## Updating From Your Local VWAP Screener Folder

When you change this file:

`C:\Users\azhar\OneDrive\Documents\VWAP Screener\IDX_Screener.py`

stage it first:

```powershell
python scripts/sync_local_source.py
```

The staged file is written to `rebuild_backend/incoming/IDX_Screener.py`. Compare and merge it into the audited backend copy, then run:

```powershell
python -m unittest tests/test_calculation_logic.py -v
python scripts/run_daily.py
git add rebuild_backend scripts tests docs Raw
git commit -m "Sync latest IDX screener script"
git push
```

This staging workflow prevents a new local script from silently removing the audited TradingView-alignment and website integration fixes. The OneDrive source is never edited.

## Backfill And Daily Data

- The scheduled workflow runs one market date each weekday, using the run date in WIB.
- Manual `Run workflow` can backfill the last 7 market weekdays by leaving `market_date` empty.
- To run only one date manually, fill `market_date` with `YYYY-MM-DD`.
- The sync script forces `BACKTEST_MODE = False` and `USE_CUSTOM_TICKERS_ONLY = False`, so the GitHub run uses the full KSEI ticker universe.
