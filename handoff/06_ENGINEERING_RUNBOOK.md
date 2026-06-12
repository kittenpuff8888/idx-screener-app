# Engineering Runbook

## Local Setup

```powershell
cd "C:\Users\azhar\Documents\Codex\2026-06-09\could-you-learn-this-website-ui\work\IDXScreener-rebuild"
python -m pip install -r requirements.txt
python -m http.server 8765 --directory docs
```

Open:

```text
http://127.0.0.1:8765/#overview
http://127.0.0.1:8765/#screener
http://127.0.0.1:8765/#ticker/BBCA
```

## Test Suite

```powershell
python -m unittest discover -s tests -v
node --check docs/app.js
node --check docs/indicators.js
git diff --check
```

Current expected result: 15 Python tests pass.

## Update Backend Safely

The original local source is:

```text
C:\Users\azhar\OneDrive\Documents\VWAP Screener\IDX_Screener.py
```

Stage, do not overwrite:

```powershell
python scripts/sync_local_source.py
```

Review:

```text
rebuild_backend/incoming/IDX_Screener.py
```

Merge deliberately into:

```text
rebuild_backend/IDX_Screener.py
```

Preserve:

- `MARKET_DATE` hard cutoff
- full universe mode
- TradingView-aligned formulas
- fallback source handling
- website export integration

## Generate Data

One market date:

```powershell
python scripts/run_backfill.py --date 2026-06-10
```

Latest completed market date:

```powershell
python scripts/run_daily.py
```

Rebuild compact historical snapshots:

```powershell
python scripts/build_historical_snapshots.py
```

Regenerate this handoff’s machine-readable evidence:

```powershell
python scripts/build_handoff_package.py
```

## Deployment

- GitHub Pages serves `main/docs`.
- Scheduled workflow runs at 17:00, 19:00, and 21:00 WIB on weekdays.
- Existing market dates are skipped on retry.
- Generated data is committed using `IDX_PAGES_DEPLOY_KEY`.

Before publishing:

1. Run all tests.
2. Validate every JSON file parses.
3. Compare at least BBCA and AADI across two dates.
4. Confirm chart history ends on the selected date.
5. Test 390 px, 768 px, and desktop widths.
6. Verify no browser console errors.
7. Confirm live manifest count after Pages deployment.

## Known Technical Debt

- Dead legacy functions remain in `docs/app.js`, including workbook/data-quality renderers.
- Backend is monolithic.
- Full payloads include unused raw workbook structures.
- Historical reconstruction does not equal a full historical backend run.
- Indicator settings are browser-local only.
- Static hosting has no server-side cache, query layer, or private user state.

