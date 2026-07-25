"use client";

import { latestInstrumentValue, type MarketContextPayload } from "@/lib/data/marketContext";
import { formatNumber, formatPercent } from "@/lib/format/number";

const MONO = "var(--mono, var(--font-mono))";
const chgColor = (v: number | null) => (v === null || v === 0 ? "var(--muted)" : v > 0 ? "var(--up)" : "var(--down)");

// IHSG-relevant macro drivers, compact. Rendered below the primary index cards.
const DRIVERS: Array<{ code: string; keys: string[]; note: string }> = [
  { code: "DXY", keys: ["DXY", "DX-Y.NYB"], note: "US dollar — EM/IDR flows" },
  { code: "US 10Y", keys: ["US10Y", "^TNX"], note: "Global rates" },
  { code: "Coal", keys: ["COAL", "MTF=F"], note: "Top Indonesian export" },
  { code: "Brent", keys: ["BRENT", "BZ=F"], note: "Oil / energy sector" },
  { code: "Gold", keys: ["GOLD", "GC=F"], note: "Safe haven" },
];

export function MacroStrip({ marketContext }: { marketContext: MarketContextPayload | null }) {
  const rows = DRIVERS.map((d) => {
    const inst = (marketContext?.instruments || []).find((i) =>
      d.keys.some((k) => i.label?.toUpperCase() === k.toUpperCase() || i.symbol?.toUpperCase() === k.toUpperCase()));
    const v = inst ? latestInstrumentValue(inst) : { value: null, changePct: null };
    return { ...d, value: v.value, changePct: v.changePct };
  });

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))", padding: "12px 16px", marginBottom: 16 }}>
      <div style={{ fontSize: 10.5, letterSpacing: ".12em", fontWeight: 700, color: "var(--faint)", marginBottom: 10 }}>MACRO DRIVERS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}>
        {rows.map((r) => (
          <div key={r.code} style={{ display: "flex", flexDirection: "column", gap: 2 }} title={r.note}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text)" }}>{r.code}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: chgColor(r.changePct) }}>{r.changePct === null ? "—" : formatPercent(r.changePct)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 600 }}>{r.value === null ? "—" : formatNumber(r.value, 2)}</span>
              <span style={{ fontSize: 9.5, color: "var(--faint)" }}>{r.note}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
