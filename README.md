# IDX Screener Website

Static GitHub Pages website for the IDX VWAP screener.

## Project Structure

```text
rebuild_backend/
  IDX_Screener.py          # Website automation copy; calculations remain from the source script
scripts/
  sync_local_source.py     # Copies the OneDrive source without overwriting it
  run_backfill.py          # Runs one or more market dates
  export_latest.py         # Converts workbook sheets into the versioned web data contract
docs/
  index.html               # Dashboard structure
  styles.css               # Responsive Flow-inspired interface
  app.js                   # Overview, screener, ticker analysis, and data-quality interactions
  data/                    # Published JSON snapshots plus lightweight ticker history
  downloads/               # Downloadable source workbooks
Raw/                       # Existing screener inputs
Output/                    # Generated workbooks
Cache/                     # Existing runtime cache
```

## How It Works

- `rebuild_backend/IDX_Screener.py` is the website's automation copy of the existing screener and creates an Excel workbook in `Output/`.
- `scripts/export_latest.py` converts the latest workbook into `docs/data/YYYY-MM-DD.json`.
- `docs/index.html` reads `docs/data/manifest.json` and provides the market overview, screener, and ticker research workspace.
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

run:

```powershell
python scripts/sync_local_source.py
git add rebuild_backend/IDX_Screener.py Raw
git commit -m "Sync latest IDX screener script"
git push
```

The sync copies the source into `rebuild_backend/` and makes only two integration adjustments: `MARKET_DATE` can come from the automation environment, and the existing `Raw/`, `Cache/`, and `Output/` folders remain rooted at the project level. It never edits the OneDrive source or changes screener calculations. GitHub Actions cannot read your OneDrive folder directly, so the updated copy must be pushed to GitHub.

## Backfill And Daily Data

- The scheduled workflow runs one market date each weekday, using the run date in WIB.
- Manual `Run workflow` can backfill the last 7 market weekdays by leaving `market_date` empty.
- To run only one date manually, fill `market_date` with `YYYY-MM-DD`.
- The sync script forces `BACKTEST_MODE = False` and `USE_CUSTOM_TICKERS_ONLY = False`, so the GitHub run uses the full KSEI ticker universe.
