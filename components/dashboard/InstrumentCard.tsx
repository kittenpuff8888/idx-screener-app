"use client";

import { latestInstrumentValue, type MarketContextPayload } from "@/lib/data/marketContext";
import { formatNumber, formatPercent } from "@/lib/format/number";

const MONO = "var(--mono, var(--font-mono))";
const chgColor = (v: number | null) => (v === null || v === 0 ? "var(--muted)" : v > 0 ? "var(--up)" : "var(--down)");

export type InstrumentSpec = { code: string; keys: string[]; tv: string };

function pctOver(series: number[], back: number): number | null {
  if (series.length <= back) return null;
  const a = series[series.length - 1 - back];
  const b = series.at(-1);
  return a && b ? b / a - 1 : null;
}

function Spark({ series, up }: { series: number[]; up: boolean }) {
  if (series.length < 2) return <div style={{ height: 34 }} />;
  const s = series.slice(-40);
  const min = Math.min(...s), max = Math.max(...s), range = max - min || 1;
  const w = 100, h = 34;
  const pts = s.map((v, i) => `${(i / (s.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ");
  const c = up ? "var(--up)" : "var(--down)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 34 }}>
      <polyline points={pts} fill="none" stroke={c} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function buildCard(mc: MarketContextPayload | null, spec: InstrumentSpec) {
  const inst = (mc?.instruments || []).find((i) =>
    spec.keys.some((k) => i.label?.toUpperCase() === k.toUpperCase() || i.symbol?.toUpperCase() === k.toUpperCase()));
  const v = inst ? latestInstrumentValue(inst) : { value: null, change: null, changePct: null, series: [] as number[] };
  return {
    code: spec.code,
    tv: `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(spec.tv)}`,
    value: v.value,
    prev: v.value !== null && v.change !== null ? v.value - v.change : null,
    changePct: v.changePct,
    series: v.series,
    up: (v.changePct ?? 0) >= 0,
    periods: [
      { label: "1D", val: v.changePct },
      { label: "5D", val: pctOver(v.series, 5) },
      { label: "20D", val: pctOver(v.series, 19) },
    ],
  };
}

const CARD = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))" } as const;

export function InstrumentCard({ card }: { card: ReturnType<typeof buildCard> }) {
  return (
    <div style={{ ...CARD, padding: "15px 16px", display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, letterSpacing: ".04em" }}>{card.code}</span>
        <a href={card.tv} target="_blank" rel="noreferrer" style={{ fontFamily: MONO, fontSize: 10, color: "var(--faint)", textDecoration: "none" }}>TV ↗</a>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 23, fontWeight: 600, lineHeight: 1 }}>{card.value === null ? "—" : formatNumber(card.value, 2)}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
          <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 600, color: chgColor(card.changePct) }}>{card.changePct === null ? "—" : formatPercent(card.changePct)}</div>
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)" }}>Prev {card.prev === null ? "—" : formatNumber(card.prev, 2)}</div>
        </div>
      </div>
      <div style={{ height: 34 }}><Spark series={card.series} up={card.up} /></div>
      <div style={{ display: "flex", gap: 6 }}>
        {card.periods.map((p) => (
          <div key={p.label} style={{ flex: 1, background: "var(--soft)", borderRadius: 8, padding: "6px 7px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "var(--faint)", letterSpacing: ".06em", marginBottom: 2 }}>{p.label}</div>
            <div style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, color: chgColor(p.val) }}>{p.val === null ? "—" : formatPercent(p.val)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
