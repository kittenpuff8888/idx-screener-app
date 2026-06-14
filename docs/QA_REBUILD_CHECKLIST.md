# IDXScreener Full Rebuild QA Checklist

Source of truth: `IDXScreener_Codex_Full_Rebuild_QA_Prompt.md`

## Research Dashboard

QA Item:
Dashboard information architecture

Current Result:
The deployed dashboard includes the four summary cards and index framework, but also retains Priority Research Rows, a source-model strip, Market Command Center, Market Map, Sector x Signal, Quality Funnel, and Activity Map.

Expected Result:
Top controls, four summary cards, four index sections, and one compact bottom data-quality note only.

Discrepancy:
Legacy analytical blocks make the dashboard longer and conflict with the required hierarchy.

Fix Required:
Remove the legacy dashboard blocks and retain the required summary and index structure.

Acceptance Criteria:
No legacy market-map, quality-funnel, secondary-analysis, priority-row, or source-model section is rendered on Research Dashboard.

## Shared Ticker Research

QA Item:
Ticker research entry flow

Current Result:
Ticker Research is a standalone page panel and changes the primary page route.

Expected Result:
Every ticker entry point opens one shared modal/drawer without replacing the current page.

Discrepancy:
The current route interrupts dashboard, screener, watchlist, ownership, and index workflows.

Fix Required:
Convert the existing ticker workspace to a shared accessible drawer and preserve old `#ticker/TICKER` links as compatibility routes.

Acceptance Criteria:
Ticker search, screener rows, watchlist rows, KSEI tables, index constituents, and old ticker hashes all open the same drawer.

## Navigation And Advanced

QA Item:
Primary navigation and advanced tools

Current Result:
Five primary destinations are shown and Advanced is a disclosure containing three separate routes.

Expected Result:
Six primary destinations, including Advanced as one page with Data Quality, Visual Explorer, and Guide tabs.

Discrepancy:
Advanced tools are fragmented and raw workbook terminology remains prominent.

Fix Required:
Add Advanced to primary navigation and consolidate internal tools into one tabbed workspace.

Acceptance Criteria:
Primary navigation contains exactly Research Dashboard, Screener, IDX Ticker News, Watchlist, KSEI Ownership, and Advanced.

## Screener

QA Item:
Screener filters, columns, and empty state

Current Result:
The four required filters exist, but the table has an extra ADR column and some missing values are still rendered as bare dashes in secondary content.

Expected Result:
Exactly four filters and exactly 15 required columns, with source/status/reason for unavailable values.

Discrepancy:
The visible table does not match the required contract.

Fix Required:
Remove ADR from the visible table, keep normalized signal labels, and use explicit missing-value metadata.

Acceptance Criteria:
The header contains star, Ticker, Emiten, IDX Sector, Industry, Price, Price Change %, Beta, RVOL, RVOL Change, SMC, VWAP Zone, Market Profile Zone, MA Zone, and Summary.

## Watchlist

QA Item:
Watchlist research density

Current Result:
The watchlist uses an older status-oriented table that is not aligned with Screener.

Expected Result:
A compact TradingView-style research table using the selected market-date values.

Discrepancy:
Key technical fields and consistent row interactions are missing.

Fix Required:
Align Watchlist fields and ticker interactions with Screener while preserving localStorage behavior.

Acceptance Criteria:
Watchlist values update with market date and every row opens the shared ticker drawer.

## KSEI Ownership

QA Item:
Latest source, independence, and ownership exploration

Current Result:
The June 14 workbook loads and is independent of market date, but only By Ticker and By Investor modes exist. Holder rank and original source line are discarded by the generator.

Expected Result:
By Ticker, By Investor, and Ownership Changes modes with auditable holder details and latest KSEI data independent of market date.

Discrepancy:
The generated contract cannot fully support the required detail views.

Fix Required:
Publish rank, original line, schema warnings, and indexed change records; add the third UI mode.

Acceptance Criteria:
KSEI stays at June 14 when market date changes, all three modes work, and every ticker link opens the shared ticker drawer.

## Index Framework

QA Item:
Index cards and detail flow

Current Result:
Index groups and detail modals exist, but cards do not consistently expose month, quarter, and year comparisons.

Expected Result:
Four index sections with local/external source distinction, return comparisons where available, detail history, and constituent ticker actions.

Discrepancy:
The framework reads as incomplete at card level.

Fix Required:
Add MoM, QoQ, and YoY values to local index cards and retain transparent formula/source labels.

Acceptance Criteria:
Local index cards are date-capped and external TradingView references are explicitly live/display-only.

## IDX Ticker News

QA Item:
News source behavior

Current Result:
TradingView search is mixed with a workbook intelligence feed.

Expected Result:
TradingView external/search experience only, with a structured fallback if the widget cannot load.

Discrepancy:
The page exposes an unsupported second news product.

Fix Required:
Remove the workbook feed from the primary News page and add external-link fallback actions.

Acceptance Criteria:
The page contains no published-workbook news feed and does not imply hidden or server-side news ingestion.

## Data Presentation

QA Item:
Investor-facing source and missing-value language

Current Result:
Workbook/archive/provider terms remain visible in primary content and several fallback paths use a plain dash.

Expected Result:
Product language first; technical source details only where they aid auditability. Missing values must include status, reason, source, and as-of.

Discrepancy:
The product still resembles an internal workbook viewer in places.

Fix Required:
Move raw inspection into Advanced and standardize missing-value rendering.

Acceptance Criteria:
Primary pages do not expose raw workbook rows or silent `-` placeholders.

## Branding And Responsive UI

QA Item:
Brand mark, readability, and mobile behavior

Current Result:
The sidebar uses an `IX` text tile and the old page-panel ticker layout.

Expected Result:
The supplied character image is the logo, text remains legible, bullish is blue, bearish is red, and the drawer works across desktop and mobile.

Discrepancy:
Branding is not updated and the current ticker layout is not suitable for an overlay workflow.

Fix Required:
Integrate generated transparent logo assets, add favicon metadata, and implement responsive drawer/mobile styles.

Acceptance Criteria:
Logo renders in sidebar and browser metadata; 390 px, 620 px, 820 px, and desktop layouts remain usable.
