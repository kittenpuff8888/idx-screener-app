"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { Provenance } from "@/components/shared/Metric";
import { IndexCompareSection, type CompareEntry } from "./IndexCompare";
import { MarketMap } from "./MarketMap";
import { MarketRisk } from "./MarketRisk";
import { MacroStrip } from "./MacroStrip";
import { computeMarketRisk } from "@/lib/data/marketRisk";
import { latestInstrumentValue } from "@/lib/data/marketContext";
import { normalizeSector } from "@/lib/domain/sectors";
import type { JsonRecord } from "@/lib/domain/types";
import { asNumber, formatNumber, formatPercent, formatPlainPercent, formatPrice } from "@/lib/format/number";

const CARD: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r)",
  padding: 16,
  boxShadow: "var(--sh, var(--shadow))",
};
const KICKER: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: "var(--faint)" };
const MONO = "var(--mono, var(--font-mono))";

function chgColor(v: number | null): string {
  if (v === null || v === 0) return "var(--muted)";
  return v > 0 ? "var(--up)" : "var(--down)";
}

/** Token-coloured area sparkline (34px), no fabricated points. */
function Spark({ series, up, h = 34 }: { series: number[]; up: boolean; h?: number }) {
  const pts = series.filter(Number.isFinite).slice(-20);
  if (pts.length < 2) return <div style={{ height: h }} />;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const spread = max - min || 1;
  const d = pts
    .map((v, i) => `${i === 0 ? "M" : "L"} ${((i / (pts.length - 1)) * 100).toFixed(2)} ${(30 - ((v - min) / spread) * 26).toFixed(2)}`)
    .join(" ");
  return (
    <svg style={{ height: h, width: "100%", overflow: "visible" }} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L 100 32 L 0 32 Z`} fill={up ? "var(--upSoft)" : "var(--downSoft)"} />
      <path d={d} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function pctOver(series: number[], back: number): number | null {
  const n = series.length;
  if (n < back + 1) return null;
  const a = series[n - 1 - back];
  const b = series[n - 1];
  if (!Number.isFinite(a) || !a) return null;
  // Ratio — formatPercent scales ×100 at render time.
  return b / a - 1;
}

const KONGLO_FEATURED = ["Barito", "Salim", "Sinarmas", "Astra", "Djarum", "Saratoga", "Bakrie", "Lippo"];

export function DashboardPage() {
  const { loading, bundle, indexes, ksei, marketContext, marketDate, openTicker } = useApp();

  const overview = (bundle?.overview?.overview || {}) as JsonRecord;
  const summary = (bundle?.overview?.summary || {}) as JsonRecord;

  // ---- Index strip (real market-context series) ----
  const indices = useMemo(() => {
    const want: Array<{ code: string; keys: string[]; symbol: string }> = [
      { code: "IHSG", keys: ["IHSG", "^JKSE"], symbol: "IDX:COMPOSITE" },
      { code: "EIDO", keys: ["EIDO"], symbol: "AMEX:EIDO" },
      { code: "USDIDR", keys: ["USDIDR", "IDR=X"], symbol: "FX_IDC:USDIDR" },
      { code: "VIX", keys: ["VIX", "^VIX"], symbol: "TVC:VIX" },
      { code: "S&P 500", keys: ["SPX", "^GSPC"], symbol: "SP:SPX" },
    ];
    const map = new Map((marketContext?.instruments || []).map((i) => [i.label.toUpperCase(), i] as const));
    const map2 = new Map((marketContext?.instruments || []).map((i) => [i.symbol.toUpperCase(), i] as const));
    return want.map((w) => {
      const inst = w.keys.map((k) => map.get(k.toUpperCase()) || map2.get(k.toUpperCase())).find(Boolean);
      const v = inst ? latestInstrumentValue(inst) : { value: null, change: null, changePct: null, series: [] as number[] };
      const up = (v.changePct ?? 0) >= 0;
      return {
        code: w.code,
        tv: `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(w.symbol)}`,
        value: v.value,
        prev: v.value !== null && v.change !== null ? v.value - v.change : null,
        changePct: v.changePct,
        series: v.series,
        up,
        periods: [
          { label: "1D", val: v.changePct },
          { label: "5D", val: pctOver(v.series, 5) },
          { label: "20D", val: pctOver(v.series, 19) },
        ],
      };
    });
  }, [marketContext]);

  // ---- Breadth + risk ----
  const breadth = (overview.breadth || {}) as JsonRecord;
  const adv = asNumber(breadth.advances) ?? 0;
  const dec = asNumber(breadth.declines) ?? 0;
  const unc = asNumber(breadth.unchanged) ?? 0;
  const total = adv + dec + unc || 1;
  const ratio = adv + dec ? adv / (adv + dec) : 0;
  const marketRisk = useMemo(() => computeMarketRisk(marketContext, ratio, marketDate), [marketContext, ratio, marketDate]);

  // ---- KSEI latest changes ----
  // KSEI percentages are already in percent points (e.g. 5.71), not ratios —
  // delta is a percentage-point change rendered with formatPlainPercent.
  const kseiChanges = (ksei?.investorChanges || []).map((c) => ({
    ticker: c.ticker,
    label: c.investor,
    delta: (asNumber(c.newPercentage) ?? 0) - (asNumber(c.oldPercentage) ?? 0),
  })).slice(0, 4);

  // ---- Signal summary ----
  const signalStats = [
    { label: "Signal rows", count: asNumber(summary.signalRows) ?? 0, color: "var(--accent)" },
    { label: "Tickers", count: asNumber(summary.signalTickers) ?? 0, color: "var(--up)" },
    { label: "Scanned", count: asNumber(summary.totalScanned) ?? 0, color: "var(--text)" },
  ];
  const topSignals = (bundle?.screener || []).slice(0, 4);

  // ---- Sector momentum ----
  const sectorsRaw = Array.isArray(overview.sectors) ? (overview.sectors as JsonRecord[]) : [];
  const sectors = sectorsRaw
    .map((s) => ({ code: normalizeSector(String(s.sector ?? "Others")), v: asNumber(s.avgChange) ?? 0 }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 7);
  const maxAbs = Math.max(1e-4, ...sectors.map((s) => Math.abs(s.v)));

  // ---- IHSG series (market context) — shared by charts and points derivation ----
  const ihsgSeries = useMemo(() => {
    const inst = (marketContext?.instruments || []).find((i) => i.label.toUpperCase() === "IHSG" || i.symbol.toUpperCase() === "^JKSE");
    return (inst?.rows || [])
      .filter((r) => !marketDate || String(r.date) <= marketDate)
      .map((r) => ({ date: String(r.date), value: Number(r.close ?? r.value) }))
      .filter((p) => Number.isFinite(p.value));
  }, [marketContext, marketDate]);

  // ---- Leaders / laggards (Bandar Metrics-style content) ----
  // POINTS ≈ index-point contribution: IHSG_prev × (mcap / Σ mcap) × chg.
  // %IDX MV = points / |IHSG move| — both documented derivations (spec §0.5).
  const totalMcap = useMemo(() => {
    let sum = 0;
    bundle?.fundamentals.forEach((raw) => { sum += asNumber(raw["Market Cap"]) ?? 0; });
    return sum;
  }, [bundle]);
  const ihsgLast = ihsgSeries.at(-1)?.value ?? null;
  const ihsgPrev = ihsgSeries.at(-2)?.value ?? null;
  const idxMove = ihsgLast !== null && ihsgPrev !== null ? ihsgLast - ihsgPrev : null;

  const movers = (list: JsonRecord[] | undefined) => (list || []).map((r) => {
    const ticker = String(r.ticker ?? "").toUpperCase();
    const chg = asNumber(r.change) ?? 0;
    const mcap = asNumber((bundle?.fundamentals.get(ticker) as JsonRecord | undefined)?.["Market Cap"]);
    const points = ihsgPrev !== null && mcap !== null && totalMcap > 0 ? ihsgPrev * (mcap / totalMcap) * chg : null;
    return {
      ticker,
      name: bundle?.technical.get(ticker)?.companyName || normalizeSector(String(r.sector ?? "Others")),
      price: asNumber(r.price),
      chg,
      points,
      pctIdxMv: points !== null && idxMove ? points / Math.abs(idxMove) : null,
    };
  }).filter((m) => m.ticker).slice(0, 8);
  const leaders = movers(overview.topGainers as JsonRecord[] | undefined);
  const laggards = movers(overview.topDecliners as JsonRecord[] | undefined);
  const leadMax = Math.max(1e-4, ...leaders.map((m) => Math.abs(m.chg)));
  const lagMax = Math.max(1e-4, ...laggards.map((m) => Math.abs(m.chg)));

  // ---- Sectoral & konglo compare entries (local research indexes) ----
  const sectoralEntries = useMemo<CompareEntry[]>(() => (indexes?.groups || [])
    .filter((g) => g.section === "SECTORAL INDEX" && g.series.length)
    .map((g) => ({
      id: g.id,
      label: g.label,
      group: g,
      series: g.series.filter((p) => !marketDate || p.date <= marketDate),
    })), [indexes, marketDate]);

  const kongloEntries = useMemo<CompareEntry[]>(() => KONGLO_FEATURED
    .map((key) => (indexes?.groups || []).find((g) => g.section === "KONGLO INDEX" && g.label.toLowerCase().includes(key.toLowerCase())))
    .filter((g): g is NonNullable<typeof g> => Boolean(g && g.series.length))
    .map((g) => ({
      id: g.id,
      label: g.label.replace(/\s*\(.*\)$/, ""),
      group: g,
      series: g.series.filter((p) => !marketDate || p.date <= marketDate),
    })), [indexes, marketDate]);

  if (loading && !bundle) {
    return <section style={{ display: "grid", gap: 14 }}><SkeletonCard /><SkeletonCard /></section>;
  }

  return (
    <section>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700, letterSpacing: "-.01em" }}>Research Dashboard</h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13.5, maxWidth: 680, lineHeight: 1.5 }}>
          One screen for the market — index regime, breadth, ownership flow, signal confluence and sector rotation across {asNumber(summary.totalScanned) ?? "—"} IDX tickers.
        </p>
      </div>

      {/* index cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(232px,1fr))", gap: 14, marginBottom: 16 }}>
        {indices.map((ix) => (
          <div key={ix.code} style={{ ...CARD, padding: "15px 16px", display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: ".04em" }}>{ix.code}</span>
              <a href={ix.tv} target="_blank" rel="noreferrer" style={{ fontFamily: MONO, fontSize: 10, color: "var(--faint)", textDecoration: "none" }}>TV ↗</a>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontFamily: MONO, fontSize: 23, fontWeight: 600, lineHeight: 1 }}>{ix.value === null ? "—" : formatNumber(ix.value, 2)}</div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
                <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 600, color: chgColor(ix.changePct) }}>{ix.changePct === null ? "—" : formatPercent(ix.changePct)}</div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)" }}>Prev {ix.prev === null ? "—" : formatNumber(ix.prev, 2)}</div>
              </div>
            </div>
            <div style={{ height: 34 }}><Spark series={ix.series} up={ix.up} /></div>
            <div style={{ display: "flex", gap: 6 }}>
              {ix.periods.map((p) => (
                <div key={p.label} style={{ flex: 1, background: "var(--soft)", borderRadius: 8, padding: "6px 7px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: "var(--faint)", letterSpacing: ".06em", marginBottom: 2 }}>{p.label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, color: chgColor(p.val) }}>{p.val === null ? "—" : formatPercent(p.val)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <MacroStrip marketContext={marketContext} />

      {/* market overview — risk gauge + sector rotation, with a compact signal strip */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ ...KICKER, marginBottom: 10 }}>MARKET OVERVIEW</div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(300px, 1.2fr) minmax(260px, 1fr)", gap: 14 }}>
          <div style={CARD}>
            <MarketRisk risk={marketRisk} />
            <div style={{ marginTop: 10 }}><Provenance source="IHSG close + breadth" asOf={marketDate} /></div>
          </div>

          <div style={CARD}>
            <div style={{ ...KICKER, marginBottom: 12 }}>SECTOR MOMENTUM · TODAY</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              {sectors.map((m) => {
                const up = m.v >= 0;
                const w = `${(Math.abs(m.v) / maxAbs) * 48}%`;
                return (
                  <div key={m.code} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <span style={{ fontFamily: MONO, fontSize: 10.5, width: 74, color: "var(--muted)" }}>{m.code}</span>
                    <div style={{ flex: 1, height: 7, background: "var(--soft)", borderRadius: 5, position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: 0, [up ? "left" : "right"]: "50%", width: w, height: "100%", background: up ? "var(--up)" : "var(--down)", borderRadius: 5 }} />
                      <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: "var(--border)" }} />
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, width: 48, textAlign: "right", color: up ? "var(--up)" : "var(--down)" }}>{formatPercent(m.v)}</span>
                  </div>
                );
              })}
            </div>
            {/* compact signal-summary strip (folded in from the old box) */}
            <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--hair)", paddingTop: 12 }}>
              {signalStats.map((s) => (
                <div key={s.label} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontFamily: MONO, fontSize: 17, fontWeight: 600, color: s.color }}>{formatNumber(s.count, 0)}</div>
                  <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 1 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* leaders / laggards — Bandar Metrics-style content: END PRC / %CHG / POINTS / %IDX MV */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(400px,1fr))", gap: 14, marginBottom: 16 }}>
        {([["TOP LEADERS · TODAY", leaders, leadMax, "var(--up)"], ["TOP LAGGARDS · TODAY", laggards, lagMax, "var(--down)"]] as const).map(([title, rows, mx, color]) => (
          <div key={title} style={{ ...CARD, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
              <span style={KICKER}>{title}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 0 6px", borderBottom: "1px solid var(--hair)" }}>
              <span style={{ fontSize: 9.5, color: "var(--faint)", letterSpacing: ".06em", flex: 1 }}>TICKER</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", width: 56, textAlign: "right" }}>END PRC</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", width: 58, textAlign: "right" }}>% CHG</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", width: 48, textAlign: "right" }}>POINTS</span>
              <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", width: 56, textAlign: "right" }}>%IDX MV</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {rows.map((m, i) => (
                <button key={m.ticker} type="button" onClick={() => openTicker(m.ticker)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", background: "transparent", border: "none", borderTop: i === 0 ? "none" : "1px solid var(--hair)", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
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

      <IndexCompareSection
        title="SECTORAL INDICES vs IHSG"
        badge="basis: % return"
        hint="click a sector for detail"
        entries={sectoralEntries}
        ihsg={ihsgSeries}
      />

      <IndexCompareSection
        title="KONGLO INDEX vs IHSG"
        badge="basis: % return · base 100"
        hint="market-cap weighted"
        entries={kongloEntries}
        ihsg={ihsgSeries}
      />

      <MarketMap />
    </section>
  );
}
