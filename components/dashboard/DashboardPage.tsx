"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { Provenance } from "@/components/shared/Metric";
import { IndexCompareSection, type CompareEntry } from "./IndexCompare";
import { TradingViewChart } from "./TradingViewChart";
import { RiskGauge } from "./RiskGauge";
import { MarketReadHero } from "./MarketReadHero";
import { MarketsCarousel } from "./MarketsCarousel";
import { BreadthTiles } from "./BreadthTiles";
import { MarketMapTreemap } from "./MarketMapTreemap";
import { computeMarketRisk } from "@/lib/data/marketRisk";
import { normalizeSector } from "@/lib/domain/sectors";
import type { JsonRecord } from "@/lib/domain/types";
import { asNumber, formatPercent, formatPrice } from "@/lib/format/number";
import { PageHeader } from "@/components/shared/PageHeader";

const CARD: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r)",
  padding: 16,
  boxShadow: "var(--sh, var(--shadow))",
};
const KICKER: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const MONO = "var(--font-mono)";

function chgColor(v: number | null): string {
  if (v === null || v === 0) return "var(--muted)";
  return v > 0 ? "var(--up)" : "var(--down)";
}

// Parse counts that may carry a K/M/B/T suffix (e.g. "7.79 B" shares outstanding).
const COUNT_SUFFIX: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
function parseCount(v: unknown): number | null {
  if (v == null) return null;
  const m = String(v).replace(/,/g, "").trim().match(/^(-?[\d.]+)\s*([KMBT])?/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n * (m[2] ? COUNT_SUFFIX[m[2].toUpperCase()] : 1) : null;
}

const KONGLO_FEATURED = ["Barito", "Salim", "Sinarmas", "Astra", "Djarum", "Saratoga", "Bakrie", "Lippo"];

export function DashboardPage() {
  const { loading, bundle, indexes, marketContext, marketDate, openTicker } = useApp();

  const overview = (bundle?.overview?.overview || {}) as JsonRecord;
  const summary = (bundle?.overview?.summary || {}) as JsonRecord;

  // ---- Breadth + composite risk (drives the hero regime read + the gauge) ----
  const breadth = (overview.breadth || {}) as JsonRecord;
  const adv = asNumber(breadth.advances) ?? 0;
  const dec = asNumber(breadth.declines) ?? 0;
  const ratio = adv + dec ? adv / (adv + dec) : 0;
  const marketRisk = useMemo(() => computeMarketRisk(marketContext, ratio, marketDate), [marketContext, ratio, marketDate]);

  // ---- IHSG series (market context) — benchmark for rotation + leader points ----
  const ihsgSeries = useMemo(() => {
    const inst = (marketContext?.instruments || []).find((i) => i.label.toUpperCase() === "IHSG" || i.symbol.toUpperCase() === "^JKSE");
    return (inst?.rows || [])
      .filter((r) => !marketDate || String(r.date) <= marketDate)
      .map((r) => ({ date: String(r.date), value: Number(r.close ?? r.value) }))
      .filter((p) => Number.isFinite(p.value));
  }, [marketContext, marketDate]);

  // ---- Leaders / laggards — top 30 movers computed from the FULL universe (fundamentals),
  // since overview.topGainers/Decliners only carry ~8. POINTS ≈ index-point contribution:
  // IHSG_prev × (mcap/Σmcap) × chg; market cap falls back to price × shares ÷ 1e9.
  const ihsgLast = ihsgSeries.at(-1)?.value ?? null;
  const ihsgPrev = ihsgSeries.at(-2)?.value ?? null;
  const idxMove = ihsgLast !== null && ihsgPrev !== null ? ihsgLast - ihsgPrev : null;

  const { leaders, laggards, leadMax, lagMax } = useMemo(() => {
    type Mv = { ticker: string; name: string; price: number | null; chg: number; mcap: number | null; points: number | null; pctIdxMv: number | null };
    const universe: Array<Omit<Mv, "points" | "pctIdxMv">> = [];
    let totalMcap = 0;
    bundle?.fundamentals.forEach((raw, ticker) => {
      const chg = asNumber(raw["Price Change %"]);
      const price = asNumber(raw["Price"]);
      if (chg === null || price === null) return;
      let mcap = asNumber(raw["Market Cap"]);
      if (mcap === null) {
        const sh = parseCount(raw["Current Share Outstanding"]) ?? parseCount(raw["Shares Outstanding"]);
        if (sh !== null) mcap = (price * sh) / 1e9;
      }
      if (mcap !== null) totalMcap += mcap;
      universe.push({ ticker, name: bundle.technical.get(ticker)?.companyName || normalizeSector(String(raw["IDX Sector"] ?? "Others")), price, chg, mcap });
    });
    const withPoints = (m: Omit<Mv, "points" | "pctIdxMv">): Mv => {
      const points = ihsgPrev !== null && m.mcap !== null && totalMcap > 0 ? ihsgPrev * (m.mcap / totalMcap) * m.chg : null;
      return { ...m, points, pctIdxMv: points !== null && idxMove ? points / Math.abs(idxMove) : null };
    };
    const sorted = [...universe].sort((a, b) => b.chg - a.chg);
    const lead = sorted.slice(0, 30).map(withPoints);
    const lag = sorted.slice(-30).reverse().map(withPoints);
    return {
      leaders: lead, laggards: lag,
      leadMax: Math.max(1e-4, ...lead.map((m) => Math.abs(m.chg))),
      lagMax: Math.max(1e-4, ...lag.map((m) => Math.abs(m.chg))),
    };
  }, [bundle, ihsgPrev, idxMove]);

  // ---- Sectoral & konglo local research indexes (for the rotation views) ----
  const sectoralEntries = useMemo<CompareEntry[]>(() => (indexes?.groups || [])
    .filter((g) => g.section === "SECTORAL INDEX" && g.series.length)
    .map((g) => ({ id: g.id, label: normalizeSector(g.label), group: g, series: g.series.filter((p) => !marketDate || p.date <= marketDate) })), [indexes, marketDate]);

  const kongloEntries = useMemo<CompareEntry[]>(() => KONGLO_FEATURED
    .map((key) => (indexes?.groups || []).find((g) => g.section === "KONGLO INDEX" && g.label.toLowerCase().includes(key.toLowerCase())))
    .filter((g): g is NonNullable<typeof g> => Boolean(g && g.series.length))
    .map((g) => ({ id: g.id, label: g.label.replace(/\s*\(.*\)$/, ""), group: g, series: g.series.filter((p) => !marketDate || p.date <= marketDate) })), [indexes, marketDate]);

  if (loading && !bundle) {
    return <section style={{ display: "grid", gap: 14 }}><SkeletonCard /><SkeletonCard /></section>;
  }

  return (
    <section>
      <PageHeader
        title="Research Dashboard"
        pill="REGIME → TAPE → ROTATION"
        meta={<>Read top-down — <strong style={{ color: "var(--text)", fontWeight: 700 }}>regime → tape → rotation → names</strong>. Every mark is validated blue-up / red-down, always with a sign and glyph.</>}
      />

      {/* MACRO STRIP — cross-asset context reads first (DESIGN_SPEC §3.2) */}
      <MarketsCarousel marketContext={marketContext} />

      {/* BREADTH — four tiles */}
      <BreadthTiles />

      {/* HERO — IHSG live chart | Market Risk with the market read pinned to
          its base. The read block is what makes the two columns equal height,
          so it lives in the right card, not under the chart. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(340px,1.35fr) minmax(300px,1fr)", gap: 14, marginBottom: 14, alignItems: "stretch" }}>
        <div style={{ ...CARD, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ ...KICKER, fontSize: 10.5 }}>IHSG · LIVE CHART</div>
            <a href="https://www.tradingview.com/chart/?symbol=IDX%3ACOMPOSITE" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "4px 9px", textDecoration: "none" }}>TradingView ↗</a>
          </div>
          <div style={{ flex: "1 1 auto", minHeight: 620, borderRadius: 12, overflow: "hidden" }}>
            <TradingViewChart symbol="IDX:COMPOSITE" range="YTD" minHeight={620} />
          </div>
        </div>
        <div style={{ ...CARD, padding: "18px 20px", display: "flex", flexDirection: "column" }}>
          <RiskGauge risk={marketRisk} />
          <div style={{ marginTop: 10 }}><Provenance source="IHSG close + breadth" asOf={marketDate} /></div>
          <div style={{ marginTop: "auto", paddingTop: 14 }}>
            <MarketReadHero risk={marketRisk} mc={marketContext} />
          </div>
        </div>
      </div>

      {/* LEADERS / LAGGARDS — top 30, box scrolls (≈10 visible); # / END PRC / %CHG / POINTS / %IDX MV */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(400px,1fr))", gap: 14, marginBottom: 16 }}>
        {([["TOP LEADERS · TODAY", leaders, leadMax, "var(--up)"], ["TOP LAGGARDS · TODAY", laggards, lagMax, "var(--down)"]] as const).map(([title, rows, mx, color]) => (
          <div key={title} style={{ ...CARD, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
              <span style={KICKER}>{title}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 9.5, color: "var(--faint)" }}>{rows.length} names · scroll</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px 6px 0", borderBottom: "1px solid var(--hair)" }}>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", width: 20, textAlign: "right" }}>#</span>
              <span style={{ fontSize: 9.5, color: "var(--faint)", letterSpacing: ".06em", flex: 1 }}>TICKER</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", width: 56, textAlign: "right" }}>END PRC</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", width: 58, textAlign: "right" }}>% CHG</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", width: 48, textAlign: "right" }}>POINTS</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", width: 56, textAlign: "right" }}>%IDX MV</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", maxHeight: 440, overflowY: "auto" }}>
              {rows.map((m, i) => (
                <button key={m.ticker} type="button" onClick={() => openTicker(m.ticker)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px 7px 0", background: "transparent", border: "none", borderTop: i === 0 ? "none" : "1px solid var(--hair)", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: "var(--faint)", width: 20, flexShrink: 0, textAlign: "right" }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12.5, width: 48, flexShrink: 0 }}>{m.ticker}</span>
                      <span style={{ flex: 1, height: 5, background: "var(--soft)", borderRadius: 4, overflow: "hidden", minWidth: 30 }}>
                        <span style={{ display: "block", width: `${(Math.abs(m.chg) / mx) * 100}%`, height: "100%", background: color, borderRadius: 4 }} />
                      </span>
                    </span>
                    <span style={{ display: "block", fontSize: 9.5, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{m.name}</span>
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", width: 56, textAlign: "right" }}>{m.price === null ? "—" : formatPrice(m.price)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, color: chgColor(m.chg), width: 58, textAlign: "right" }}>{formatPercent(m.chg)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: m.points === null ? "var(--faint)" : chgColor(m.points), width: 48, textAlign: "right" }}>{m.points === null ? "—" : `${m.points > 0 ? "+" : ""}${m.points.toFixed(2)}`}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: m.pctIdxMv === null ? "var(--faint)" : chgColor(m.pctIdxMv), width: 56, textAlign: "right" }}>{m.pctIdxMv === null ? "—" : formatPercent(m.pctIdxMv)}</span>
                </button>
              ))}
              {!rows.length ? <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "8px 0" }}>No movers reported.</div> : null}
            </div>
          </div>
        ))}
      </div>

      {/* SECTORAL / KONGLO vs IHSG — interactive multi-line % return (matches Claude Design) */}
      <IndexCompareSection title="SECTORAL INDICES vs IHSG" badge="basis: % return" hint="click a series to toggle · % vs window start" entries={sectoralEntries} ihsg={ihsgSeries} />
      <IndexCompareSection title="KONGLO INDEX vs IHSG" badge="basis: % return" hint="click a series to toggle · % vs window start" entries={kongloEntries} ihsg={ihsgSeries} />

      {/* MARKET MAP — squarified, cap-weighted treemap */}
      <MarketMapTreemap />
    </section>
  );
}
