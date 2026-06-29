# DATA_GAPS.md — Field-Coverage Audit

> Generated as the first task of the UI/UX refit (IMPLEMENTATION_SPEC §1, §7.5).
> It records, per planned visualization, whether a **real backing field exists** in
> `docs/data/**`. Anything without backing renders in its **degraded state**
> (`—` / "No data" / hidden) via the `Cell` contract in `lib/dataReady.ts` — never a
> fabricated value (§0). This file is the running list of what is on a fallback and
> the feed that would light it up.

**Audited dataset:** latest market date `2026-06-12`; KSEI snapshots `2026-05-14`,
`2026-06-06`, `2026-06-14` (`docs/data/ksei/manifest.json`).
**Code grep:** no `Math.random` / seeded RNG feeds any displayed value (§7.2). ✅

---

## Summary: readiness is HIGH

Most of what the prototype shows is genuinely backed by real local JSON. The spec
assumed several feeds would be live/external (Yahoo, TradingView, news placeholders);
in this repo they are **already shipped as local files**, so the corresponding panels
do **not** need a fallback:

| Surface | Spec assumption | Reality in repo |
|---|---|---|
| Index strip (IHSG/EIDO/USDIDR/VIX/SPX) | live Yahoo fetch | **local** `market-context.json` `instruments[]` (real 20-pt series + `formula` + `status`) |
| Candlestick OHLC | live Yahoo `XXXX.JK` | **local** `docs/data/ohlcv/<date>/<TICKER>.json` (real OHLC rows) |
| Sector / Konglo indices | derive only | **local** `indexes.json` `groups[]` (real `series`, `weightMethod`, `formula`, `constituents`) |
| Per-ticker news | placeholder / pending | **real** `news.json` (952 rows: sentiment, headline, URL, corp action) |

---

## Per-view coverage map

Legend: ✅ backed · ⚠️ degraded/derived · ❌ no backing field (gap)

### Dashboard (§4.1)
| Component | Backing field(s) | State |
|---|---|---|
| Index strip — value, 1D % | `market-context.json` `instruments[].series` (IHSG, VIX, EIDO, USDIDR, SPX; also BTC, KOSPI) | ✅ |
| Index strip — 5D/20D returns | derived from `series` (only 20 points held → 1Y range disabled) | ⚠️ derived; ranges beyond series length disabled, not faked |
| Index strip — ID10Y | listed in `indexes.json` `externalIndexes` as a TradingView symbol only, no series | ⚠️ TradingView deep-link only; no inline sparkline |
| Breadth (adv/dec/unch + ratio) | `overview.json` `overview.breadth` | ✅ |
| Risk label (RISK-ON/OFF) | **derived** from breadth + index trend (transparent formula, captioned) | ⚠️ derivation — must be documented, not a magic number |
| KSEI Latest Δ | `ksei/latest.json` `investorChanges` / `comparison` (3 snapshots exist → diff available) | ✅ |
| Signal summary (firing/elite/not) | `overview.json` `overview.signals[]` (+ `screener.json` `signalType`) | ✅ |
| Sector momentum (diverging bars) | `overview.json` `overview.sectors[].avgChange` | ✅ |
| Top leaders / laggards | `overview.json` `topGainers` / `topDecliners` | ✅ |
| Sectoral indices vs IHSG (multi-line) | `indexes.json` `groups[].series` | ✅ |
| Sector detail — cap-weighted contributors | derived `mcap × chg` from `fundamental.json` + constituents | ⚠️ derived |
| Konglomerat index vs IHSG | `indexes.json` konglo groups + curated `lib/konglo.ts` mapping | ⚠️ group→constituent map is curated reference data; performance is real |
| Market map (heatmap) | `fundamental.json` `Market Cap` + `Price Change %` | ✅ |

### Screener (§4.2)
| Column | Backing field | State |
|---|---|---|
| Ticker / Name / Sector / Industry | `screener.json` + `technical.json` | ✅ |
| Price / Chg % | `screener.json` `Price`, `Chg %` | ✅ |
| Beta (vs IHSG) | `technical.json` `beta` (`screener.json` `Beta Zone` is often `null`) | ⚠️ source from `technical.json`; `—` when absent |
| RS rating | `screener.json` `RS Rating` / `technical.json` `rsRating` | ✅ |
| RVOL | `screener.json` `RVOL` | ✅ |
| SMC location | `technical.json` `structure` / nested `technical` | ✅ |
| VWAP zone | `screener.json` `Current Q VWAP` | ✅ |
| Summary tag (Accumulating/Distributing) | derived from signal + structure fields | ⚠️ derived; drop if not derivable |
| **Conviction score** | **none** — no `conviction` field in `screener.json` / `technical.json` / `fundamental.json` | ❌ **GAP** — drop column or define a documented formula |

### Ticker page (§4.3)
| Component | Backing field | State |
|---|---|---|
| Candlestick + EMA/VWAP | `ohlcv/<date>/<TICKER>.json` `rows[]`; EMA/VWAP derived | ✅ (TradingView embed as fallback if file missing) |
| Key statistics rail | `fundamental.json` (Prev Close via OHLC, 52W H/L, Mkt Cap, P/E, P/B, returns, dividends…) | ✅ |
| Day range / Volume / Avg Vol | `technical.json` `volume`, `averageVolume20`; day range from OHLC | ✅ |
| Targets / POI | `screener.json` / `technical.json` `entry/target/invalidation` + POI | ✅ |
| MACD / money-flow panels | `technical.json` nested `technical` (verify per ticker; `—` if absent) | ⚠️ render only if field present |
| Real-time bid/ask, intraday tick volume | **none** | ❌ **GAP** — EOD only; mark "unavailable" |

### KSEI (§4.4)
| Component | Backing field | State |
|---|---|---|
| Summary strip | `ksei/latest.json` `summary` | ✅ |
| Per-issuer table + concentration metrics | `records[].investors`, `summary` per issuer | ✅ (partial issuers → `—` "Not in snapshot") |
| Local/foreign split, HHI, CR1/CR3 | `records[]` fields | ✅ where reported; `—` otherwise |
| Foreign-ownership trend | 3 snapshots available → real multi-point line | ✅ (single-snapshot issuers → one point + "Single snapshot") |
| Investor directory / per-investor holdings | `investorDirectory`, `changesByInvestor` | ✅ |
| Changes log | `investorChanges` / `changesByTicker` | ✅ |
| Modeled holders / invented stake % | — | ❌ **REMOVE** prototype behavior; never model holders |

### Watchlist / News / Guide (§4.5)
| Component | Backing field | State |
|---|---|---|
| Watchlist | `localStorage` + loaded rows | ✅ |
| News list + sentiment | `news.json` (`Sentiment`, headline, `News URL`, `Corp. Action`) | ✅ **real** — spec's "placeholder" note does not apply here |
| Guide | static methodology content | ✅ |

---

## Gaps requiring a feed (the actionable list)

| # | Component | Missing | Feed / fix that lights it up |
|---|---|---|---|
| 1 | Screener **Conviction score** | no `conviction` field anywhere | Define a documented composite (e.g. RS + signal count + RVOL) in `IDX_Screener.py`, or drop the column. Currently rendered as `—`. |
| 2 | Ticker **bid/ask, intraday tick volume** | EOD-only dataset | A real-time/intraday feed (none free for IDX wired); marked "unavailable". |
| 3 | Index strip **1Y range** & long sparklines | only 20-point series in `market-context.json` | Extend `historyRange` in the pipeline; ranges beyond series length are disabled, not faked. |
| 4 | **ID10Y** inline sparkline | TradingView symbol only in `indexes.json`, no series | Add an ID10Y series to the pipeline, or keep as TradingView deep-link. |
| 5 | Sector/Konglo **"Accumulating/Distributing" tag** | derived heuristic, not a stored field | Document the derivation; until then it degrades to "Neutral"/`—`. |

## Acceptance-criteria status (§7)
- [x] §7.2 No `Math.random` / seeded RNG feeding displayed values (grep clean).
- [x] `Cell` contract implemented (`lib/dataReady.ts`) + `Metric`/`Stat`/`ChartFrame` primitives.
- [ ] §7.4 Provenance caption on every surface — rolling out per view as components are refit.
- [ ] §7.1/§7.6 Visual parity + light/dark — token foundation landed; per-view rewrites pending.
- [ ] §7.3 Tested empty/degraded state on every panel — pending per-view refit.

_This file is updated as each view is refit; the unchecked items above track remaining work._
