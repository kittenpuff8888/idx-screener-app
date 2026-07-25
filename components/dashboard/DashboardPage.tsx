"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { Provenance } from "@/components/shared/Metric";
import { IndexCompareSection, type CompareEntry } from "./IndexCompare";
import { MarketMap } from "./MarketMap";
import { MarketRisk } from "./MarketRisk";
import { InstrumentCard, buildCard, type InstrumentSpec } from "./InstrumentCard";
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

// Instruments grouped by context. VIX sits in the RISK section next to the risk gauge.
const INSTRUMENT_GROUPS: Array<{ title: string; specs: InstrumentSpec[] }> = [
  { title: "INDEX", specs: [
    { code: "IHSG", keys: ["IHSG", "^JKSE"], tv: "IDX:COMPOSITE" },
    { code: "EIDO", keys: ["EIDO"], tv: "AMEX:EIDO" },
    { code: "S&P 500", keys: ["SPX", "^GSPC"], tv: "SP:SPX" },
  ] },
  { title: "COMMODITIES", specs: [
    { code: "Coal", keys: ["COAL", "MTF=F"], tv: "NYMEX:MTF1!" },
    { code: "Brent", keys: ["BRENT", "BZ=F"], tv: "TVC:UKOIL" },
  ] },
  { title: "MONEYFLOW", specs: [
    { code: "US 10Y", keys: ["US10Y", "^TNX"], tv: "TVC:US10Y" },
    { code: "USDIDR", keys: ["USDIDR", "IDR=X"], tv: "FX_IDC:USDIDR" },
    { code: "DXY", keys: ["DXY", "DX-Y.NYB"], tv: "TVC:DXY" },
    { code: "Gold (XAU)", keys: ["GOLD", "GC=F"], tv: "OANDA:XAUUSD" },
    { code: "BTC", keys: ["BTC", "BTC-USD"], tv: "BINANCE:BTCUSDT" },
  ] },
];
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

  // ---- Instrument groups, by context (each a TV-linked chart card) ----
  const groups = useMemo(() => INSTRUMENT_GROUPS.map((g) => ({
    title: g.title,
    cards: g.specs.map((s) => buildCard(marketContext, s)),
  })), [marketContext]);
  const vixCard = useMemo(() => buildCard(marketContext, { code: "VIX", keys: ["VIX", "^VIX"], tv: "TVC:VIX" }), [marketContext]);

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

      {/* INDEX */}
      {(() => { const g = groups.find((x) => x.title === "INDEX"); return g ? (
        <div style={{ marginBottom: 18 }}>
          <div style={{ ...KICKER, marginBottom: 10 }}>{g.title}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(232px,1fr))", gap: 14 }}>
            {g.cards.map((c) => <InstrumentCard key={c.code} card={c} />)}
          </div>
        </div>
      ) : null; })()}

      {/* RISK — VIX + the composite risk gauge */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ ...KICKER, marginBottom: 10 }}>RISK</div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(232px, 0.8fr) minmax(320px, 1.6fr)", gap: 14 }}>
          <InstrumentCard card={vixCard} />
          <div style={CARD}>
            <MarketRisk risk={marketRisk} />
            <div style={{ marginTop: 10 }}><Provenance source="IHSG close + breadth" asOf={marketDate} /></div>
          </div>
        </div>
      </div>

      {/* COMMODITIES + MONEYFLOW */}
      {["COMMODITIES", "MONEYFLOW"].map((title) => { const g = groups.find((x) => x.title === title); return g ? (
        <div key={title} style={{ marginBottom: 18 }}>
          <div style={{ ...KICKER, marginBottom: 10 }}>{g.title}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14 }}>
            {g.cards.map((c) => <InstrumentCard key={c.code} card={c} />)}
          </div>
        </div>
      ) : null; })}

      {/* SECTOR ROTATION + signal strip */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ ...KICKER, marginBottom: 10 }}>SECTOR MOMENTUM · TODAY</div>
        <div style={CARD}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "8px 28px", marginBottom: 14 }}>
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
