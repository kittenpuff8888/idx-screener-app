# IDX RESEARCH Professional Handoff

Prepared for an end-to-end engineer, data-quality specialist, product designer, and UI/UX researcher.

## Start Here

1. Read `01_SYSTEM_ARCHITECTURE.md`.
2. Read `02_DATA_CONTRACT_AND_LINEAGE.md`.
3. Review `03_DATA_QUALITY_BASELINE.md`.
4. Review `04_UI_UX_RESEARCH_BRIEF.md`.
5. Use `05_PRIORITIZED_IMPROVEMENT_BACKLOG.md` to plan delivery.
6. Follow `06_ENGINEERING_RUNBOOK.md` before changing calculations or deployment.

Machine-readable evidence is under `machine-readable/`:

- `site_inventory.json`: system counts, schema versions, status, QA, and storage size.
- `field_profile_latest.csv`: every latest-workbook field with missingness, observed type, and examples.
- `market_dates.csv`: all 103 selectable sessions and their source mode.
- `representative_samples.json`: BBCA latest/full and historical/compact examples plus signal samples.
- `route_component_map.json`: routes, modals, and frontend ownership.

Visual references are under `visual-reference/`:

- `overview.png`
- `screener.png`
- `ticker-BBCA.png`

Reviewable production data is under `data-samples/`:

- `latest-full-2026-06-10.json`: complete schema v3 production payload.
- `historical-2026-06-08.json`: compact reconstructed schema v4 payload.
- `manifest.json`: all selectable dates and source modes.
- `ohlcv-BBCA.json`: representative chart history.
- `qa-2026-06-10.json`: complete calculation QA audit for the latest date.

## Current Product

- Live website: https://kittenpuff8888.github.io/IDXScreener/
- Repository: https://github.com/kittenpuff8888/IDXScreener
- Product name: IDX RESEARCH
- Latest published market date in this package: June 10, 2026
- Coverage: 956 IDX tickers
- Selectable sessions: 103, from January 2 through June 10, 2026
- Latest full-workbook result: 35 signal rows across 22 tickers

## Important Interpretation Warning

The date selector currently combines two different data products:

- June 9 and June 10 are full workbook-backed schema v3 exports.
- The other 101 dates are compact schema v4 snapshots reconstructed from OHLCV.

Historical prices and technical calculations vary correctly by date. Historical fundamentals, news, ownership, and corporate-action data are not preserved point in time. A professional redesign must communicate or eliminate this distinction.

## Scope Guardrails

The product must not claim broker-flow, Wyckoff, transaction-flow, institutional-flow, or unavailable proprietary data. Pine scripts are translated into browser-side calculations; the website does not execute Pine Script or embed the full TradingView terminal.
