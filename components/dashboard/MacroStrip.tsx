"use client";

import { useApp } from "@/components/providers/AppProvider";

// Compact macro strip (DESIGN_SPEC §3.2): USD/IDR · US 10Y · DXY · BI rate · VIX.
// USD/IDR and VIX are real (market-context feed); US 10Y, DXY and BI rate are not
// in the feed, so they render an explicit "no data" rather than a fabricated
// number (no-fabrication rule; listed on Data Health).
const idid = (v: number, d: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
const pctColor = (r: number | null) => (r == null || r === 0 ? "var(--flat)" : r > 0 ? "var(--up)" : "var(--down)");
const glyph = (r: number | null) => (r == null || r === 0 ? "•" : r > 0 ? "▲" : "▼");
const fmtPct = (r: number | null) => (r == null ? "" : `${r > 0 ? "▲" : r < 0 ? "▼" : "•"} ${(Math.abs(r) * 100).toFixed(2)}%`);

export function MacroStrip() {
  const { marketContext, marketDate } = useApp();

  function reading(label: string): { value: number | null; day: number | null } {
    const inst = (marketContext?.instruments || []).find((i) => i.label.toUpperCase() === label);
    const rows = (inst?.rows || []).filter((r) => !marketDate || String(r.date) <= marketDate);
    const last = rows.at(-1), prev = rows.at(-2);
    const v = last ? Number(last.close ?? last.value) : null;
    const pv = prev ? Number(prev.close ?? prev.value) : null;
    const day = v != null && pv != null && pv !== 0 && isFinite(v) && isFinite(pv) ? v / pv - 1 : null;
    return { value: v != null && isFinite(v) ? v : null, day };
  }

  const usdidr = reading("USDIDR");
  const vix = reading("VIX");

  const items: Array<{ label: string; value: string; day: number | null; note?: string; nodata?: boolean }> = [
    { label: "USD/IDR", value: usdidr.value == null ? "—" : idid(usdidr.value, 0), day: usdidr.day },
    { label: "US 10Y", value: "no data", day: null, nodata: true },
    { label: "DXY", value: "no data", day: null, nodata: true },
    { label: "BI rate", value: "no data", day: null, nodata: true },
    { label: "VIX", value: vix.value == null ? "—" : idid(vix.value, 2), day: vix.day },
  ];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--sh, var(--shadow))", padding: "9px 14px", marginBottom: 14 }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)", flex: "none" }}>MACRO</span>
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "baseline", gap: 5, fontSize: 11, background: "var(--soft)", borderRadius: 7, padding: "4px 9px" }}>
          <span style={{ color: "var(--muted)", fontWeight: 600 }}>{it.label}</span>
          {it.nodata ? (
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--faint)", fontStyle: "italic" }}>no data</span>
          ) : (
            <>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{it.value}</span>
              {it.day != null ? <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: pctColor(it.day) }}>{glyph(it.day)} {(Math.abs(it.day) * 100).toFixed(2)}%</span> : null}
            </>
          )}
        </span>
      ))}
      <div style={{ flex: 1 }} />
      <span style={{ fontSize: 9.5, color: "var(--faint)" }}>rates &amp; policy calendar not in feed — see Data Health</span>
    </div>
  );
}
