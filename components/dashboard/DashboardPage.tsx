"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { IndexCompareSection, type CompareEntry } from "./IndexCompare";
import { SectorRotationSection } from "./SectorRotation";
import { TradingViewChart, ChartIndicatorPicker } from "./TradingViewChart";
import { MarketBreadthPanel } from "./MarketBreadthPanel";
import { MarketsCarousel } from "./MarketsCarousel";
import { BreadthTiles } from "./BreadthTiles";
import { MarketMapTreemap } from "./MarketMapTreemap";
import { computeMarketBreadth } from "@/lib/data/marketBreadth";
import { normalizeSector } from "@/lib/domain/sectors";
import type { JsonRecord } from "@/lib/domain/types";
import { asNumber, formatPercent, formatPrice, parseCount } from "@/lib/format/number";
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

// Compact market cap (value is in Rp billions): "Rp 258 T" / "Rp 87.7 T" / "Rp 500 B".
function fmtMcapBn(bn: number | null): string {
  if (bn === null) return "—";
  if (bn >= 1000) return `Rp ${(bn / 1000).toFixed(bn >= 100000 ? 0 : 1)} T`;
  return `Rp ${Math.round(bn)} B`;
}

const KONGLO_FEATURED = ["Barito", "Salim", "Sinarmas", "Astra", "Djarum", "Saratoga", "Bakrie", "Lippo"];

export function DashboardPage() {
  const { loading, bundle, ksei, indexes, marketContext, marketDate, manifest, openTicker } = useApp();

  const overview = (bundle?.overview?.overview || {}) as JsonRecord;
  const summary = (bundle?.overview?.summary || {}) as JsonRecord;

  // ---- Market breadth & regime (IDX-breadth study): % above 200-day/50-day MA,
  //      sector breadth, and the cap-vs-equal gap. Descriptive context, not a
  //      predictive score. ----
  const marketBreadth = useMemo(() => computeMarketBreadth(bundle, ksei, marketContext), [bundle, ksei, marketContext]);

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
    type Mv = { ticker: string; name: string; price: number | null; chg: number; yr1: number | null; mcap: number | null; points: number | null; pctIdxMv: number | null };
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
      universe.push({ ticker, name: bundle.technical.get(ticker)?.companyName || normalizeSector(String(raw["IDX Sector"] ?? "Others")), price, chg, yr1: asNumber(raw["1 Year Price Returns"]), mcap });
    });
    const withPoints = (m: Omit<Mv, "points" | "pctIdxMv">): Mv => {
      const points = ihsgPrev !== null && m.mcap !== null && totalMcap > 0 ? ihsgPrev * (m.mcap / totalMcap) * m.chg : null;
      return { ...m, points, pctIdxMv: points !== null && idxMove ? points / Math.abs(idxMove) : null };
    };
    // Rank by IDX index-move (points contributed), not raw %change: the names
    // that actually moved the index most. Gainers desc, losers asc; a name with
    // no market cap (no points) falls back to |%change| so it still ranks.
    const all = universe.map(withPoints);
    const rankVal = (m: Mv) => (m.points !== null ? m.points : m.chg * 1e-9); // tiny fallback keeps mcap-less names below real movers
    const lead = all.filter((m) => m.chg > 0).sort((a, b) => rankVal(b) - rankVal(a)).slice(0, 30);
    const lag = all.filter((m) => m.chg < 0).sort((a, b) => rankVal(a) - rankVal(b)).slice(0, 30);
    return {
      leaders: lead, laggards: lag,
      leadMax: Math.max(1e-4, ...lead.map((m) => Math.abs(m.points ?? m.chg))),
      lagMax: Math.max(1e-4, ...lag.map((m) => Math.abs(m.points ?? m.chg))),
    };
  }, [bundle, ihsgPrev, idxMove]);

  // ---- Sectoral & konglo local research indexes (for the rotation views) ----
  const sectoralEntries = useMemo<CompareEntry[]>(() => (indexes?.groups || [])
    .filter((g) => g.section === "SECTORAL INDEX" && g.series.length)
    .map((g) => ({ id: g.id, label: normalizeSector(g.label), group: g, series: g.series.filter((p) => !marketDate || p.date <= marketDate) })), [indexes, marketDate]);

  // ── MACRO rail (design/1 · section 0): compact cross-asset strip from the real
  //    market-context feed. The design's US 10Y / DXY / BI-rate aren't in the feed,
  //    so the rail carries only the instruments we actually track — labelled, real. ──
  const macroRail = useMemo(() => {
    const insts = marketContext?.instruments || [];
    const disp: Record<string, string> = { USDIDR: "USD/IDR", VIX: "VIX", SPX: "S&P 500", KOSPI: "KOSPI", BTC: "BTC" };
    return (["USDIDR", "VIX", "SPX", "KOSPI", "BTC"] as const).map((sym) => {
      const inst = insts.find((i) => i.label.toUpperCase() === sym || i.symbol.toUpperCase() === sym);
      if (!inst) return null;
      const vals = (inst.rows || [])
        .filter((r) => !marketDate || String(r.date) <= marketDate)
        .map((r) => Number(r.close ?? r.value))
        .filter((v) => Number.isFinite(v));
      const last = vals.at(-1) ?? null, prev = vals.at(-2) ?? null;
      if (last == null) return null;
      const chg = prev != null && prev !== 0 ? (last / prev - 1) * 100 : null;
      const value = last >= 1000 ? last.toLocaleString("en-US", { maximumFractionDigits: 0 }) : last.toFixed(2);
      return { label: disp[sym], value, chg };
    }).filter((x): x is { label: string; value: string; chg: number | null } => x !== null);
  }, [marketContext, marketDate]);

  const kongloEntries = useMemo<CompareEntry[]>(() => KONGLO_FEATURED
    .map((key) => (indexes?.groups || []).find((g) => g.section === "KONGLO INDEX" && g.label.toLowerCase().includes(key.toLowerCase())))
    .filter((g): g is NonNullable<typeof g> => Boolean(g && g.series.length))
    .map((g) => ({ id: g.id, label: g.label.replace(/\s*\(.*\)$/, ""), group: g, series: g.series.filter((p) => !marketDate || p.date <= marketDate) })), [indexes, marketDate]);

  // Raw groups (not the CompareEntry-transformed subset above) — Sector
  // Rotation needs every real sector and every real konglo group, plus each
  // group's constituent tickers, to drive its filters and Stocks drill-down.
  const sectoralGroupsRaw = useMemo(() => (indexes?.groups || []).filter((g) => g.section === "SECTORAL INDEX" && g.series.length), [indexes]);
  const kongloGroupsRaw = useMemo(() => (indexes?.groups || []).filter((g) => g.section === "KONGLO INDEX" && g.series.length), [indexes]);

  if (loading && !bundle) {
    return <section style={{ display: "grid", gap: 14 }}><SkeletonCard /><SkeletonCard /></section>;
  }

  return (
    <section>
      <PageHeader
        title="Research Dashboard"
        pill="MARKET OVERVIEW"
        meta={<>Read top-down — <strong style={{ color: "var(--text)", fontWeight: 700 }}>regime → tape → rotation → names</strong>. Every mark is validated blue-up / red-down, always with a sign and glyph.</>}
      />

      {/* Source provenance line (design/1. Research Dashboard.dc.html) */}
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, margin: "-2px 0 14px", fontSize: 10.5, fontWeight: 600, color: "var(--muted)" }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--flat)" }} />
        src: IDX close · as of {marketDate} 16:00:00 WIB · EOD (delayed)
      </div>

      {/* MACRO rail (design/1 · section 0) — compact real cross-asset strip */}
      {macroRail.length ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", ...CARD, borderRadius: 12, padding: "9px 14px", marginBottom: 14 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)", flex: "none" }}>MACRO</span>
          {macroRail.map((m) => (
            <span key={m.label} style={{ display: "inline-flex", alignItems: "baseline", gap: 5, fontSize: 11, background: "var(--soft)", borderRadius: 7, padding: "4px 9px" }}>
              <span style={{ color: "var(--muted)", fontWeight: 600 }}>{m.label}</span>
              <span style={{ fontFamily: MONO, fontWeight: 700 }}>{m.value}</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: chgColor(m.chg) }}>{m.chg == null ? "" : `${m.chg > 0 ? "▲" : m.chg < 0 ? "▼" : "•"} ${m.chg > 0 ? "+" : ""}${m.chg.toFixed(2)}%`}</span>
            </span>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 9.5, color: "var(--faint)" }}>cross-asset · EOD {marketDate}</span>
        </div>
      ) : null}

      {/* BREADTH — four tiles (prototype: breadth before the cross-asset row) */}
      <BreadthTiles />

      {/* HERO — IHSG live chart | Market Risk. Equal-size columns; heights
          match via align-items:stretch. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14, marginBottom: 14, alignItems: "stretch" }}>
        <div style={{ ...CARD, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ ...KICKER, fontSize: 10.5 }}>IHSG · LIVE CHART</div>
            <div style={{ flex: 1 }} />
            <ChartIndicatorPicker />
            <a href="https://www.tradingview.com/chart/?symbol=IDX%3ACOMPOSITE" target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "4px 9px", textDecoration: "none" }}>TradingView ↗</a>
          </div>
          <div style={{ flex: "1 1 auto", minHeight: 620, borderRadius: 12, overflow: "hidden" }}>
            <TradingViewChart symbol="IDX:COMPOSITE" range="YTD" minHeight={620} />
          </div>
        </div>
        <div style={{ ...CARD, padding: "18px 20px", display: "flex", flexDirection: "column" }}>
          <MarketBreadthPanel data={marketBreadth} asOf={marketDate || "—"} />
        </div>
      </div>

      {/* MARKETS · CROSS-ASSET carousel (prototype: below the hero, in the
          lower "what else moved" band, not above breadth) */}
      <MarketsCarousel marketContext={marketContext} />

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
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", width: 66, textAlign: "right" }}>MKT CAP</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", width: 54, textAlign: "right" }}>CLOSE</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", width: 54, textAlign: "right" }}>% CHG</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", width: 58, textAlign: "right" }}>52W %</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", width: 54, textAlign: "right" }}>%IDX MV</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", maxHeight: 440, overflowY: "auto" }}>
              {rows.map((m, i) => (
                <button key={m.ticker} type="button" onClick={() => openTicker(m.ticker)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px 7px 0", background: "transparent", border: "none", borderTop: i === 0 ? "none" : "1px solid var(--hair)", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: "var(--faint)", width: 20, flexShrink: 0, textAlign: "right" }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12.5, width: 48, flexShrink: 0 }}>{m.ticker}</span>
                      <span style={{ flex: 1, height: 5, background: "var(--soft)", borderRadius: 4, overflow: "hidden", minWidth: 30 }}>
                        <span style={{ display: "block", width: `${(Math.abs(m.points ?? m.chg) / mx) * 100}%`, height: "100%", background: color, borderRadius: 4 }} />
                      </span>
                    </span>
                    <span style={{ display: "block", fontSize: 9.5, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>{m.name}</span>
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", width: 66, textAlign: "right" }}>{fmtMcapBn(m.mcap)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", width: 54, textAlign: "right" }}>{m.price === null ? "—" : formatPrice(m.price)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, color: chgColor(m.chg), width: 54, textAlign: "right" }}>{formatPercent(m.chg)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: chgColor(m.yr1), width: 58, textAlign: "right" }}>{m.yr1 === null ? "—" : formatPercent(m.yr1)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: m.pctIdxMv === null ? "var(--faint)" : chgColor(m.pctIdxMv), width: 54, textAlign: "right" }}>{m.pctIdxMv === null ? "—" : formatPercent(m.pctIdxMv)}</span>
                </button>
              ))}
              {!rows.length ? <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "8px 0" }}>No movers reported.</div> : null}
            </div>
          </div>
        ))}
      </div>

      {/* SECTORAL | KONGLO vs IHSG — side by side (design/1), interactive multi-line % return */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))", gap: 14, marginBottom: 14, alignItems: "stretch" }}>
        <IndexCompareSection title="SECTORAL INDEX vs IHSG" badge="basis: % return" hint="click a series to toggle · % vs window start" entries={sectoralEntries} ihsg={ihsgSeries} />
        <IndexCompareSection title="KONGLO INDEX vs IHSG" badge="basis: % return" hint="click a series to toggle · % vs window start" entries={kongloEntries} ihsg={ihsgSeries} />
      </div>

      {/* SECTOR ROTATION — relative rotation graph: Sectors / Konglo / Stocks */}
      <SectorRotationSection ihsg={ihsgSeries} sectoralGroups={sectoralGroupsRaw} kongloGroups={kongloGroupsRaw} marketDate={marketDate || ""} latestMarketDate={manifest?.latestMarketDate} openTicker={openTicker} technicalByTicker={bundle?.technical || new Map()} />

      {/* MARKET MAP — squarified, cap-weighted treemap */}
      <MarketMapTreemap />

      {/* CVD palette / no-fabrication footnote (design/1. Research Dashboard.dc.html) */}
      <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.5, maxWidth: 820, marginTop: 14 }}>
        Palette validated for CVD &amp; contrast (OKLab ΔE ≥ 8 on every adjacent pair; blue-up/red-down protan ΔE 23.8). Polarity always ships with a sign + ▲/▼/• glyph; multi-series always carries a legend. Real snapshot {marketDate} — no fabricated data.
      </div>
    </section>
  );
}
