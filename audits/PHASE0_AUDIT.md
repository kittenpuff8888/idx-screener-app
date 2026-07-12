# PHASE 0 AUDIT — 8888 Screener Swing Upgrade
Date: 2026-07-12 · Executed in a sandboxed cloud session (no outbound network to Yahoo/IDX/TradingView; see "What could NOT be verified").

## 1. Site map (Next.js App Router, static export → GitHub Pages)
| Page | Route | Data dependencies | State |
|---|---|---|---|
| Research Dashboard | /dashboard | dates/<D>/overview.json, screener.json, fundamental.json, market-context.json, indexes.json, ksei/* | Working |
| Screener | /explorer | dates/<D>/screener.json + fundamental.json + technical.json | Working |
| KSEI | /ksei | ksei/manifest.json + ksei/dates/<S>/ownership.json | Working |
| Watchlist | /watchlist | localStorage + bundle | Working |
| News | /news | dates/<D>/news.json | Working |
| Ticker drawer | (overlay) | technical.json + fundamental.json + ohlcv/<D>/<T>.json (chart) | Working |
| Guide | /advanced?tab=guide | static | Working |
Data root: `docs/data/`, mirrored to `public/` at build by `scripts/prepare_next_data.py`.

## 2. Pipeline map — what actually feeds the site
**The live pipeline is `scripts/update_daily.py` + `rebuild_backend/` (providers: `yfinance_provider`, `investing_provider`, `tradingview_chart` link-builder), not the legacy `IDX_Screener.py`.**
- `IDX_Screener.py` (9,803 lines): legacy Excel workbook engine. Contains the reference signal implementations: market structure v1 (CHoCH/BOS, `compute_market_structure_v1`), Wyckoff, anchored VWAP + SD bands, POI ranking (`_poi_rank_v2`), reversal score (`_reversal_score`), swing score (`_swing_score`), conviction (`_conviction_score`), RRG, MACD/RSI divergence, ARA/ARB, beta/RS. Fetch chain: yfinance `<T>.JK`, `auto_adjust=False` (split-adjusted, dividend-unadjusted — matches §0.2 parity definition), retries + backoff.
- Daily workflow `.github/workflows/daily-idx-data-update.yml`: backfill → `update_daily.py` → `export_ksei_ownership.py` → `build_custom_indexes.py` → `validate_data.py` → unit tests → deploy on push to main.
- Emitted per market date `docs/data/dates/<D>/`: overview, screener (60 rows), technical (956 records incl. entry/target/invalidation POIs, structure, trend, rvol, RS, beta, liquidity, dataStatus/missingFields, provenance), fundamental, news, processing-results, qa-audit.
- **OHLCV cache exists** (App C.1 partially satisfied): `docs/data/ohlcv/<latest>/<TICKER>.json` — 956 tickers × ~700 daily bars, fields incl. `source:"yfinance"`, `adjusted:false`, `timezone:"Asia/Jakarta"`. Incremental update handled by backfill/update scripts.
- KSEI: 3 snapshots (2026-05-14, 06-06, 06-14) with `investorChanges` (old/new pct per investor), HHI/CR1/CR3/holderCount per issuer → month-over-month deltas available.
- Universe: defined by the KSEI workbook roster (956 tickers as of 2026-06-14 snapshot).

## 3. IPO gap analysis
**Could not fetch the live IDX listed-company roster from this environment (outbound network blocked).** Proxy evidence: the index builder already flags missing constituents — e.g. IDXENERGY missing PSAT, RATU; IDXBASIC missing ASPR, DGWG, EMAS, MINE; IDXHEALTH missing CHEK, DKHH, MDLA, OBAT; KONGLO groups missing CDIA, RATU, CBDK, BLOG, MERI (see `indexes.json` `missingTickers`). Several of these ARE in the 956 universe but lack OHLCV history (recent IPOs on yfinance lag) — consistent with §C.6.3. A live-roster diff must run in CI (see Phase 1 code: `--audit-universe` flag) — marked TODO until a networked run.

## 4. Data accuracy spot-check — honesty statement
**TradingView comparison could NOT be performed from this sandbox** (no access to TradingView or Yahoo). What WAS verified locally: OHLCV sanity on cached bars for 10 tickers (BBCA, BBRI, TLKM, ASII, ANTM, CUAN, RATU, PANI, SRAJ, KIOS): high ≥ max(o,c), low ≤ min(o,c), vol ≥ 0, no duplicate dates — all pass; BBCA close 2026-06-30 = 5,550 vs technical.json lastPrice 2026-07-01 = 5,600 (consistent day-over-day). Parity vs TradingView remains **UNVERIFIED** and is surfaced as a manual checklist on the new Data Health page.

## 5. Risk register
1. yfinance scrape (primary source) breaks or rate-limits silently → mitigated by retries; parity/second-source check not yet automated (Phase 1 adds dual-source hooks; live verification pending CI).
2. Recent IPOs absent from yfinance for days (observed: RATU, CDIA, etc.) → must surface as `pending_data`, not crash (index builder already tolerates; setups engine must too).
3. KSEI monthly lag (latest 2026-06-14 vs market 2026-07-01) → ownership signals are context, never timing; label the lag.
4. WIB vs UTC off-by-one: update_daily gates on WIB close; ohlcv rows carry Asia/Jakarta — OK, keep asserting.
5. Volume basis (RG vs RG+TN/NG) vs TradingView unverified (§C.6.1) — flagged on Guide/Data Health as unverified.
6. Obsidian vault not accessible in this environment → §2.3 baseline rules used as-is; override points marked `TODO(vault-rule)` in `scripts/build_swing_setups.py`.
7. Design tokens: repo now uses the 8888 Tracker v2 palette (blue #2563eb/#5b8cff, red #e5484d/#ff5c61). The prompt's "teal #14b8a6 / V13" reference is stale — per §0.2 "the repo wins".

**Gate result: PASS to Phase 1/2 with the documented environment limitations.**
