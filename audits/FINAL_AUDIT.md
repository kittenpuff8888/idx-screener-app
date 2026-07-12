# FINAL AUDIT — Swing Trading Upgrade (2026-07-12)

## 1. Manual 10-ticker parity spot-check
**NOT PERFORMED — FAIL (environment).** This session has no route to TradingView/Yahoo. The protocol is embedded on `/health` (prefilled close/volume + TV deep links) for the owner to execute; record results in `audits/PARITY_SPOTCHECK_<date>.md`.

## 2. End-to-end run
`python scripts/build_swing_setups.py --backtest 200` on the live repo cache: 956 scanned, 2 candidates, 0 quarantined, runtime ≈ 3 min in sandbox. The full networked pipeline (`update_daily.py`) was not run here (no network) — it runs in CI daily; the new stage is wired after `build_custom_indexes.py`.

## 3. Non-negotiables checklist (§0.3)
| Rule | Status |
|---|---|
| Priority order respected (data → signals → IPO → visuals) | PASS |
| Never fabricate; N/A with reason | PASS (nulls + reason strings; empty state honest) |
| Every number traceable to pipeline files | PASS (site renders setups.json/data-health.json only) |
| Python is single source of truth | PASS (engine is a pipeline script; no client recomputation) |
| Timestamps everywhere | PARTIAL — setups/health pages show marketDate + generatedAt; a global stale-data banner (>1 IDX trading day) is NOT yet implemented |
| No breaking changes | PASS (additive routes/files only; existing pages untouched) |
| Design for scarcity (App C) | PARTIAL — OHLCV incremental cache pre-existed and is reused; tiered budgets/backoff config NOT added this pass |
| Audit gates produced | PASS (PHASE0, PHASE1-3, FINAL in /audits) |

## 4. Known limitations (also belongs on Guide page — pending item)
- CVD is an approximation from daily candles, not tick/footprint data.
- KSEI ownership is monthly-lagged; context only, never timing.
- "Parity" = dual-source agreement, not a literal TradingView feed; currently **UNVERIFIED** end-to-end.
- Recent IPOs (<90 bars) are flagged; <30 bars are excluded from setups.
- Backtest is a sanity check on the price-computable core only; not a strategy validation.
- Obsidian vault rules not incorporated (`TODO(vault-rule)` markers in the engine).

## 5. Maintenance runbook
- **What breaks first**: yfinance scrape (silent empties) → Data Health run log shows NO_DATA/FAILURE; quarantine list grows.
- **Detect**: open `/health` — run log, quarantined count, universe size delta.
- **Fix**: re-run `update_daily.py` after source recovers; if a source schema changes, patch the matching `rebuild_backend/providers/*` adapter (signal engines never touch sources directly).
- **Setups engine knobs**: CONFIG at the top of `scripts/build_swing_setups.py` (liquidity floor, min score, lookbacks, weights).
