# Research Dashboard redesign — data-model recommendations

Companion to the redesign port (prototype: *Research Dashboard - Redesign.dc.html*).
Per the Claude Code brief §0, this is the "keep / drop / upgrade" call for every
section, judged against one test: **does it help an IDX swing trader read
regime → tape → rotation → names in seconds?**

A note the brief got half-right: it assumed the prototype's instrument set and the
sector/konglo index series were placeholders. They are **not** — the repo already
ships real data for them (`lib/data/indexes.ts` → `IndexPayload.groups` with
`SECTORAL INDEX` / `KONGLO INDEX` sections; `fundamentals` Map with real Market Cap,
Free Float %, P/E, Dividend Yield). So most of this is **presentation**, not new data.
The one genuinely fabricated thing in the prototype — the seeded-random `_genSeries`
sparklines behind the multi-line charts and the `_stockDetail` treemap values — is
dropped entirely; the ported components read the committed JSON only.

---

## 1. INDEX group

| Item | Verdict | Why |
|---|---|---|
| **IHSG** standalone tile | **DROP** | Redundant — IHSG is already the hero live chart **and** the Market Read **and** the Risk gauge. A fourth IHSG readout is noise. |
| **EIDO** | **KEEP** | US-listed Indonesia ETF — the cleanest foreign-sentiment / overnight-gap proxy. Also feeds the Risk gauge's Foreign-flow metric. |
| **S&P 500** | **KEEP** | Global risk backdrop; already the Risk gauge's Global-backdrop input. |
| **KOSPI** | **KEEP** | Best liquid North-Asia risk peer; today's −5.7% was the clearest risk-off tell. |
| **Nikkei 225** (`^N225`) | **ADD** | Rounds out the Asia risk read (JP + KR together separate "Asia-wide" from "Korea-specific" moves). |
| **Hang Seng** (`^HSI`) | **ADD (optional)** | China/HK proxy — matters for IDX because China demand drives coal/nickel/CPO, IDX's export complex. Include if the row has space; else keep it in reserve. |

**Proposed INDEX basket:** EIDO · S&P 500 · KOSPI · Nikkei 225 (+ Hang Seng optional).

## 2. MACRO · COMMODITIES group

IDX is a commodity-heavy index; this group should mirror the *baskets that actually
move the tape*, not generic macro.

| Item | Verdict | Why |
|---|---|---|
| **Coal** (`MTF=F` / Newcastle) | **KEEP** | Huge IDX weight — ADRO, PTBA, ITMG, BUMI, INDY, BYAN. |
| **Brent** | **KEEP** | Energy complex + MEDC/PGAS; broad risk barometer. |
| **Gold** (XAU) | **KEEP** | Safe-haven read + ANTM/MDKA/BRMS; a "gold bid, tape soft" combo is a real regime signal. |
| **CPO / Palm oil** (Bursa `FCPO`) | **ADD** | Arguably the *most* IDX-specific commodity — AALI, LSIP, DSNG, TAPG, SIMP, SGRO. Currently missing. Sourcing: FCPO front-month (may need a non-yfinance feed; flag if unavailable). |
| **Nickel** (LME) | **ADD** | Indonesia is the world's #1 nickel producer — INCO, ANTM, NCKL, MBMA, HRUM(EV). High IDX relevance; source LME nickel or a proxy ETF. |

## 3. MONEYFLOW · RATES & FX group

| Item | Verdict | Why |
|---|---|---|
| **US 10Y** (`^TNX`) | **KEEP** | Global cost of capital / EM-flow driver. |
| **Indonesia 10Y (ID10Y / IDGB 10Y)** | **ADD** | More directly tied to IHSG than US10Y — local cost of capital and the foreign-bond-flow driver. **Sourcing caveat:** yfinance has no clean IDGB 10Y ticker; this needs a dedicated source (e.g. a scraped INDOGB yield or a proxy). Flagged as a backend task — do not fabricate a series. |
| **USD/IDR** | **KEEP** | The single most-watched FX for foreign flow into IDX. |
| **DXY** | **KEEP** | Broad USD; inverse tailwind/headwind for EM. |
| **Gold** | **MOVE** | Currently duplicated here and in COMMODITIES — keep it in COMMODITIES only. |
| **BTC** | **KEEP (demote)** | A retail risk-appetite gauge; useful but least IDX-specific — put it last in the row. |

## 4. Market Read + Risk gauge — **KEEP (flagship)**

The 0–100 gauge and its 8 sub-metrics (`lib/data/marketRisk.ts`) are the 3-second
regime read and stay central. One upgrade: the **Foreign-flow** metric is an EIDO-vs-IHSG
proxy — once **ID10Y** and a real foreign-net-buy feed exist, fold them in for a truer
read. The Market-Read "why" paragraph should be **generated from the live metrics**
(trend/breadth/VIX/drawdown), not a static string.

## 5. Leaders / Laggards — **KEEP, refine the weighting**

Columns END PRC / %CHG / **POINTS** / **%IDX MV** are already computed from *real*
market cap (`ihsg_prev × mcap/Σmcap × chg`). Refinement: IHSG is **free-float
weighted**, and `fundamental.json` already carries **Free Float (%)** — switch the
contribution weight from raw Market Cap to **free-float-adjusted** cap for a truer
index-point number. Label it "est." since official IDX weights aren't published intraday.

## 6. Sectoral indices vs IHSG — **UPGRADE the form (this is the one you flagged)**

The data is real (`SECTORAL INDEX` groups). The problem is the **% return line chart**:
11 sector lines that co-move ~70–90% with IHSG just redraw the benchmark — you can't
extract a decision. Recommended presentation, all from the same real series:

1. **Relative-strength ranking** — a sorted diverging bar of each sector's return
   **relative to IHSG** (sector index ÷ IHSG − 1), across **1D / 5D / 20D**. Answers
   "who's actually leading the market, and is it persistent?"
2. **Rotation quadrant (RRG)** — relative-strength (x) vs relative-momentum (y),
   quadrants Leading / Weakening / Lagging / Improving. Answers "accelerating or
   fading?" — which a static line can't.
3. Keep the raw multi-line as a **secondary toggle** for anyone who wants the absolute
   picture, but it's not the default.

## 7. Konglo index vs IHSG — **UPGRADE identically; confirm the basket**

Konglo index series exist (`KONGLO INDEX` groups). Current featured baskets:
**Barito · Salim · Sinarmas · Astra · Djarum · Saratoga · Bakrie · Lippo**
(`DashboardPage.KONGLO_FEATURED`). Same treatment as sectors: relative-strength +
rotation beats raw lines. **Action for you:** confirm/adjust this list — e.g. add
**Prajogo (BREN/BRPT/CUAN/PTRO)**, **MNC**, **Emtek/Sinarmas-tech** if you want them,
and tell me each basket's constituent tickers so the composite is exact. Until then I
use the existing eight.

## 8. Market Map (treemap) — **KEEP, one data gap**

Size = market cap, color = %chg, grouped by IDX Sector — all real from `fundamental.json`
(Market Cap, Price Change %, IDX Sector, P/E, Dividend Yield). **Gap:** `fundamental.json`
has **no Volume field**, so the tooltip's "Volume" row can't be filled. Options: (a) add
Volume to the fundamental export (recommended), or (b) drop the Volume row from the
tooltip. I'll drop it until the export carries volume — no fabricated value.

## 9. Breadth — **KEEP** (advancers/decliners are real in `overview.breadth`).

---

### Backend follow-ups this implies (no fabrication until done)
- [ ] Add **Nikkei 225** (and optional Hang Seng) to `fetch_market_context.py`.
- [ ] Add **CPO/FCPO** and **Nickel** to the commodity fetch (may need non-yfinance sources).
- [ ] Source **Indonesia 10Y** yield (dedicated feed; not in yfinance).
- [ ] Add **Volume** to the fundamental export (for the treemap tooltip).
- [ ] Optionally switch leader **POINTS** weighting to free-float-adjusted cap.
- [ ] Confirm the **konglo basket** constituents.
