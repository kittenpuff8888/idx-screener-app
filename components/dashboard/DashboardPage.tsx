"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { Provenance } from "@/components/shared/Metric";
import { MarketMap } from "./MarketMap";
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

export function DashboardPage() {
  const { loading, bundle, ksei, marketContext, marketDate, openTicker } = useApp();

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
  const risk = ratio >= 0.55 ? { label: "RISK-ON", color: "var(--up)", bg: "var(--upSoft)" }
    : ratio <= 0.45 ? { label: "RISK-OFF", color: "var(--down)", bg: "var(--downSoft)" }
      : { label: "NEUTRAL", color: "var(--muted)", bg: "var(--soft)" };

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

  // ---- Leaders / laggards ----
  const movers = (list: JsonRecord[] | undefined) => (list || []).map((r) => ({
    ticker: String(r.ticker ?? "").toUpperCase(),
    sector: normalizeSector(String(r.sector ?? "Others")),
    price: asNumber(r.price),
    chg: asNumber(r.change) ?? 0,
  })).filter((m) => m.ticker).slice(0, 8);
  const leaders = movers(overview.topGainers as JsonRecord[] | undefined);
  const laggards = movers(overview.topDecliners as JsonRecord[] | undefined);
  const leadMax = Math.max(1e-4, ...leaders.map((m) => Math.abs(m.chg)));
  const lagMax = Math.max(1e-4, ...laggards.map((m) => Math.abs(m.chg)));

  if (loading && !bundle) {
    return <section style={{ display: "grid", gap: 14 }}><SkeletonCard /><SkeletonCard /></section>;
  }

  return (
    <section style={{ maxWidth: 1320, margin: "0 auto" }}>
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
              <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 600, color: chgColor(ix.changePct) }}>{ix.changePct === null ? "—" : formatPercent(ix.changePct)}</div>
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

      {/* four boxes */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14, marginBottom: 16 }}>
        {/* market risk + breadth */}
        <div style={CARD}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}>
            <div style={KICKER}>MARKET RISK</div>
            <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, padding: "4px 9px", borderRadius: 7, background: risk.bg, color: risk.color }}>{risk.label}</span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.45, marginBottom: 13 }}>
            Advancers / (advancers + decliners) = {(ratio * 100).toFixed(0)}% of directional tickers.
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 9 }}>
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: "var(--up)" }}>{formatNumber(adv, 0)}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Advancing</div>
            <div style={{ flex: 1 }} />
            <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 600, color: "var(--down)" }}>{formatNumber(dec, 0)}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Declining</div>
          </div>
          <div style={{ display: "flex", height: 8, borderRadius: 6, overflow: "hidden", gap: 2, marginBottom: 13 }}>
            <div style={{ width: `${(adv / total) * 100}%`, background: "var(--up)" }} />
            <div style={{ width: `${(unc / total) * 100}%`, background: "var(--border)" }} />
            <div style={{ width: `${(dec / total) * 100}%`, background: "var(--down)" }} />
          </div>
          <Provenance source="Overview breadth" asOf={marketDate} />
        </div>

        {/* ksei change */}
        <div style={CARD}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={KICKER}>KSEI OWNERSHIP · LATEST Δ</div>
            <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--faint)" }}>{ksei?.asOf ?? "—"}</span>
          </div>
          {kseiChanges.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {kseiChanges.map((k, i) => (
                <button key={`${k.ticker}-${i}`} type="button" onClick={() => openTicker(k.ticker)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: "var(--text)" }}>
                  <span style={{ fontFamily: MONO, fontWeight: 600, width: 46 }}>{k.ticker}</span>
                  <span style={{ color: "var(--muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.label}</span>
                  <span style={{ fontFamily: MONO, fontWeight: 600, color: chgColor(k.delta) }}>{k.delta > 0 ? "+" : ""}{formatPlainPercent(k.delta)} pp</span>
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No reported holder changes in the latest snapshot.</div>
          )}
        </div>

        {/* signal summary */}
        <div style={CARD}>
          <div style={{ ...KICKER, marginBottom: 14 }}>SIGNAL SUMMARY</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {signalStats.map((s) => (
              <div key={s.label} style={{ flex: 1, background: "var(--soft)", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: s.color }}>{formatNumber(s.count, 0)}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {topSignals.map((t) => (
              <button key={`${t.ticker}-${t.signalLabel}`} type="button" onClick={() => openTicker(t.ticker)} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer", background: "transparent", border: "none", padding: 0, textAlign: "left", color: "var(--text)" }}>
                <span style={{ fontFamily: MONO, fontWeight: 600, width: 46 }}>{t.ticker}</span>
                <span style={{ background: "var(--accentSoft)", color: "var(--accent)", fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 6 }}>{t.signalLabel}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: chgColor(t.changePct), marginLeft: "auto" }}>{formatPercent(t.changePct)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* sector momentum */}
        <div style={CARD}>
          <div style={{ ...KICKER, marginBottom: 14 }}>SECTOR MOMENTUM · TODAY</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
        </div>
      </div>

      {/* leaders / laggards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 14, marginBottom: 16 }}>
        {([["TOP LEADERS · TODAY", leaders, leadMax, "var(--up)"], ["TOP LAGGARDS · TODAY", laggards, lagMax, "var(--down)"]] as const).map(([title, rows, mx, color]) => (
          <div key={title} style={{ ...CARD, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 13 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
                <span style={KICKER}>{title}</span>
              </div>
              <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--faint)" }}>% change</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {rows.map((m) => (
                <button key={m.ticker} type="button" onClick={() => openTicker(m.ticker)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid var(--hair)", background: "transparent", border: "none", borderTopWidth: 1, borderTopStyle: "solid", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
                  <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12.5, width: 50 }}>{m.ticker}</span>
                  <span style={{ fontSize: 10.5, color: "var(--muted)", width: 84, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.sector}</span>
                  <div style={{ flex: 1, height: 6, background: "var(--soft)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${(Math.abs(m.chg) / mx) * 100}%`, height: "100%", background: color, borderRadius: 4 }} />
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", width: 52, textAlign: "right" }}>{formatPrice(m.price)}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: chgColor(m.chg), width: 62, textAlign: "right" }}>{formatPercent(m.chg)}</span>
                </button>
              ))}
              {!rows.length ? <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "8px 0" }}>No movers reported.</div> : null}
            </div>
          </div>
        ))}
      </div>

      <MarketMap />
    </section>
  );
}
