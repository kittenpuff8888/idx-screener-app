# Migration plan — 8888 Screener redesign

Step 0 of `design_handoff_8888_screener/BRIEF.md`: audit the live app, then diff it
against the handoff before writing code. This file records what is actually in the
repo today and what each item in the brief resolves to here.

**Audited at:** `main` @ `fe47a64c` (2026-08-11).

> **Context that changes the approach.** PRs #38–#41 (2026-08-09/10) landed a
> redesign under a `/v2` namespace and then promoted it to the real routes;
> PR #42 reverted all four the same day. The repo is back at its pre-redesign
> state. This plan therefore migrates the *existing* routes in place rather than
> reintroducing a parallel namespace — the namespace-then-promote approach is the
> one that was already rejected.

---

## Audit result: route → entry → data

| Route | Entry | Main component | Data source |
|---|---|---|---|
| `/dashboard` | `app/dashboard/page.tsx` | `components/dashboard/DashboardPage.tsx` | `AppProvider` bundle + `lib/data/marketRisk`, `marketContext`, `indexes` |
| `/screener` | `app/screener/page.tsx` | `components/screener/ScreenerPage.tsx` | `lib/data/screenerUniverse` |
| `/screener/history` | `app/screener/history/page.tsx` | `components/screener/PastSetupsPage.tsx` | `loadHistory` → `/data/setups-history.json` |
| `/explorer` | `app/explorer/page.tsx` | `components/explorer/ExplorerPage.tsx` | `/data/dates/<date>/setups.json` |
| `/setups` | `app/setups/page.tsx` | `components/setups/SetupsPage.tsx` | `/data/dates/<date>/setups.json`, `/data/setups-history.json` |
| `/setups/history` | `app/setups/history/page.tsx` | `components/setups/PastSetups.tsx` | `/data/setups-history.json` |
| `/ksei` | `app/ksei/page.tsx` | `components/ksei/*` | `lib/data/ksei` |
| `/watchlist` | `app/watchlist/page.tsx` | `components/watchlist/WatchlistPage.tsx` | `/data/dates/<date>/setups.json` |
| `/news` | `app/news/page.tsx` | `components/news/NewsPage.tsx` | `lib/data/news` |
| `/health` | `app/health/page.tsx` | `components/health/DataHealthPage.tsx` | `/data/data-health.json` |
| `/advanced?tab=guide` | `app/advanced/page.tsx` | `components/advanced/AdvancedPage.tsx` | — (static copy) |
| `/ticker` | `app/ticker/page.tsx` | `components/ticker/TickerResearch.tsx` | `lib/data/ticker` |

Shell is already shared: `app/layout.tsx` → `AppProvider` → `AppShell` → `Sidebar` + `TopBar`.
Deployment is a static export with `basePath: "/IDXScreener"` in production
(`next.config.ts`), which matters for the broken footer links below.

---

## What the brief got right, and what it did not

Three items in the brief's expected diff do **not** match the repo as it stands.
Recording them here so the divergence is deliberate:

1. **"ADD: Ticker page"** — already exists (`app/ticker/page.tsx`, shipped in PRs
   #24 and #32). This is an UPDATE to spec §3.1, not an ADD.
2. **"UPDATE: extract sidebar/header into one shell"** — already one shell
   (`AppShell`). There are no duplicate per-page sidebar definitions to remove.
   The real work is the *content* of that shell, not its extraction.
3. **"DELETE: duplicate sidebar definitions per page"** — nothing to delete.

Everything else in the brief is confirmed against the code.

---

## DELETE

| Item | Confirmed in repo | Action |
|---|---|---|
| `/explorer/` route + components | `app/explorer/`, `components/explorer/` (2 files) | Delete both. Add a client redirect `/explorer/` → `/screener/`. Referrers to fix: `components/ticker/TickerResearch.tsx:105`, `components/setups/PastSetups.tsx:69`, `components/layout/MobileNav.tsx:9`, `components/layout/Sidebar.tsx:16`, `components/dashboard/IndexStrip.tsx:105` (`/explorer?tab=indexes`). `components/advanced/AdvancedPage.tsx:14` has an unrelated `explorer` tab (Workbook Explorer) — **keep**, different thing. |
| Standalone "Today's Market Read" card | `components/dashboard/MarketReadHero.tsx` | Fold into the Market Risk panel per spec §3.2; the read block becomes the `margin-top:auto` filler that equalises hero column heights. |
| Draft badges / TODO copy / dead CSS vars | to be swept per route | Sweep during each route's pass; verify against acceptance item 9. |

## UPDATE

| Item | Current state | Target |
|---|---|---|
| Sidebar menu | **7 items**: Research, Screener, Explorer, Setups, KSEI, Watchlist, News | **5 items**: Research, Screener, KSEI, Watchlist, News. Explorer deleted; Setups reachable only via the Screener footer link. |
| Sidebar support block | Two plain nav links under a `SUPPORT` label | Two pinned **two-line cards** (`margin-top:auto` on the first): bordered, `--soft` fill, title 12/700 + subtitle 10.5 `--muted` — "sources & freshness", "how everything works". Drop the `SUPPORT` label. |
| Brand mark | 36px, `--ink` fill, `--panel` text | 34px, `--accentSoft` fill, `--accent` text (spec §2). |
| Sidebar border | `border-right: 1px solid var(--hair)`, no background | `border-right: 1px solid var(--border)`, `background: var(--panel)`. |
| Shell scroll | Page scrolls; sidebar `position: sticky` | Root `height:100vh; overflow:hidden`; sidebar `height:100vh`; `<main>` is the only scroll container (`flex:1; height:100vh; overflow:auto`). |
| Content width | `padding: 26px 30px 60px`, no max width | max-width 1360px, 22px gutters, 14px vertical rhythm. |
| Theme key | `idx-research-theme` (`TopBar.tsx:7`) | **`idxr:theme`**, values `light`\|`dark`, on `document.documentElement.dataset.theme`, default light. Migrate the old key on first read so existing users keep their choice. |
| TradingView | `allow_symbol_change: true`, no `hide_top_toolbar`, `interval: "D"` | `interval: "1D"`, `hide_top_toolbar: true`, `allow_symbol_change: false` on **every** embed. Without these TradingView restores a saved intraday interval. |
| Screener footer link | `<a href="/screener/history">` (`ScreenerPage.tsx:358`) — raw `<a>`, absolute path, **breaks under `basePath: /IDXScreener`** | `next/link` to the Past Setups route. Same fix for `ExplorerPage.tsx:210` (`/setups/history`) before that file is deleted. |
| Snapshot date | `AppProvider` resolves `marketDate`; not printed uniformly | One source of truth, printed identically in every page header. |
| Reload button | present in `TopBar` | Must actually refetch. |
| `/ksei/` | 5 tabs already correct | Restyle to shared shell; Conglomerates → master-detail; all labels English. |
| `/watchlist/` | Empty state only; **no `localStorage` at all** | Full rebuild per §3.4: groups, add-ticker dialog, metrics table, chart below, `localStorage` persistence, no seeded samples. |
| Help & Guide | `/advanced?tab=guide` | Standalone `/guide` route, 8 sections, anchor nav; redirect the old query-string URL. |

## UPGRADE

| Item | Target |
|---|---|
| Screener results table | Horizontal scroll inside the card, sticky header, per-cell interpreted signals (blue bullish / red bearish / gray neutral), hover shows raw value, row → ticker page. Keep page-size (25/50/100/250) and CSV export. |
| Screener setup cards | 8 presets, multi-select, AND/OR combine, Clear, live per-card count, EXACT/INFERRED badge, polarity toggle, custom-context builder, save preset (`localStorage["idxr:screenerPresets"]`). |
| Dashboard | Macro strip → 4 breadth tiles → two-column hero (`minmax(340px,1.35fr) minmax(300px,1fr)`, equal heights) → sector rotation → named lists. |
| Data Health | Per-source freshness cards: status pill, row count, last-updated, explicit gap list (incl. the modelled Watchlist columns). |

## ADD

| Item | Detail |
|---|---|
| Ticker deep links | Every ticker cell in Screener / Past Setups / News / Watchlist → `?ticker=SYMBOL`. |
| Watchlist groups | User-created, `localStorage`-persisted, no seeds. |
| Shared empty states | One component, used by every list. |

---

## Order of work

1. ~~Audit + this file~~
2. ~~Shared shell~~ — 5 menu items + 2 support cards, fixed-height scroll model, `idxr:theme`, 1360px content width.
3. ~~Screener → Ticker page~~ — Screener already met most of §3.3; gaps closed were the EXACT/INFERRED badge and the base-path-broken footer link. Ticker gained VWAP + EMA studies and the `?ticker=` deep link.
4. ~~Dashboard~~ — reordered to macro → breadth → hero; Market Read moved into the Risk panel base.
5. ~~Watchlist, KSEI~~ — Watchlist rebuilt from scratch; KSEI Conglomerates converted to master-detail.
6. ~~News, Data Health, Help & Guide~~
7. ~~Delete `/explorer/`, add redirects, run the §9 acceptance checklist~~

## §9 acceptance checklist

| Item | State |
|---|---|
| `/explorer/` removed + redirected; 5 menu items + 2 support cards | done |
| One shell component; sidebar/header/theme/reload identical everywhere | done (was already shared; contents rebuilt) |
| One snapshot date printed on every page, sourced from data | done via the shell's `DatePicker`, fed by `AppProvider.marketDate` |
| Theme persists across navigation; dark mode on all routes | done — `idxr:theme` on `documentElement`, legacy key migrated |
| Every TradingView chart opens on daily bars, interval toolbar hidden | done — single embed component, `interval:"1D"` + `hide_top_toolbar` + `allow_symbol_change:false` |
| Watchlist starts empty; New group / Add ticker first; groups persist | done |
| KSEI five tabs; Conglomerates master-detail; labels English | done (labels were already English) |
| Every ticker cell links to `?ticker=SYMBOL` and that page loads | done — `openTicker` emits `?ticker=`, page reads `?ticker=` then legacy `?symbol=` |
| No `NaN`, `undefined`, unresolved holes, dead CSS variables | swept; §6 status tokens (`--good/--warn/--serious/--critical`) were referenced but undefined, now added to `styles/globals.css` |
| Every number traces to a real field; gaps say `no data` | done — see the deviation note below |

## Deviation from the spec, on purpose

§3.4 and §3.7 describe the Watchlist's multi-period returns, ATH and
since-added as **modelled**, and ask Data Health to list them as such. They are
not modelled in this build. 1W/1M/3M/YTD and HIGH are measured off the
published daily bars, and SINCE ADDED is measured against the close recorded
when the row was added. Where coverage does not reach back far enough the cell
reads `no data`.

This is a deliberate departure: shipping modelled numbers in those columns
would have violated the repo's no-fabricated-data rule, and real ones were
derivable. The known-gaps list on Data Health states what is actually true —
coverage starts 2026-01-01, so long lookbacks read `no data`, and HIGH is the
high since coverage began rather than an all-time high.

The same reasoning applies to two of the four breadth tiles: only
advances/declines/unchanged are published, so new highs/lows is counted from
52-week bounds and up/down volume from per-ticker volume and change.

## Non-negotiable

No fabricated data. Absent fields render an explicit `no data` and get listed on
Data Health. KSEI flow stays labelled as a proxy, never presented as broker data.
The prototypes' numbers are placeholders — every shipped number traces to a real
field in this repo's data files.
