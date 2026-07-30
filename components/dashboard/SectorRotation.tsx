"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

const MONO = "var(--font-mono)";
const KICKER: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };

export type SectorSeries = { label: string; series: Array<{ date: string; value: number }> };

type Row = { label: string; rel1: number; rel5: number; rel20: number };

const relFmt = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
const pctColor = (v: number) => (v > 0 ? "var(--up)" : v < 0 ? "var(--down)" : "var(--flat)");

/** Return over the last `steps` sessions, as a ratio. */
function pctOver(values: number[], steps: number): number | null {
  const n = values.length;
  if (n < steps + 1) return null;
  const a = values[n - 1 - steps], b = values[n - 1];
  return a ? b / a - 1 : null;
}

const SHORT: Record<string, string> = {
  "Healthcare": "Health", "Consumer Non-Cyclicals": "Staples", "Consumer Cyclicals": "Cyclical",
  "Infrastructure": "Infra", "Industrials": "Industry", "Properties & Real Estate": "Property",
  "Transportation & Logistics": "Transport", "Financials": "Finance", "Basic Materials": "Materials",
  "Technology": "Tech", "Energy": "Energy",
};
const shortName = (label: string) => SHORT[label] || label.replace(/^IDX/i, "").slice(0, 8);

export function SectorRotation({ sectors, ihsg, title = "SECTOR ROTATION vs IHSG", subtitle = "relative strength — leadership beats the benchmark, not just the tape" }: { sectors: SectorSeries[]; ihsg: Array<{ date: string; value: number }>; title?: string; subtitle?: string }) {
  const [win, setWin] = useState<"rel1" | "rel5" | "rel20">("rel20");

  const rows = useMemo<Row[]>(() => {
    const iv = ihsg.map((p) => p.value).filter(Number.isFinite);
    const i1 = pctOver(iv, 1), i5 = pctOver(iv, 5), i20 = pctOver(iv, 20);
    return sectors.map((s) => {
      const v = s.series.map((p) => p.value).filter(Number.isFinite);
      const p1 = pctOver(v, 1), p5 = pctOver(v, 5), p20 = pctOver(v, 20);
      return {
        label: s.label,
        rel1: p1 !== null && i1 !== null ? (p1 - i1) * 100 : 0,
        rel5: p5 !== null && i5 !== null ? (p5 - i5) * 100 : 0,
        rel20: p20 !== null && i20 !== null ? (p20 - i20) * 100 : 0,
      };
    }).sort((a, b) => b.rel20 - a.rel20);
  }, [sectors, ihsg]);

  if (!rows.length) return null;
  const maxAbs = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.rel1), Math.abs(r.rel5), Math.abs(r.rel20)]));

  // RRG geometry: x = relative strength (rel20), y = relative momentum (rel5 − rel20).
  const VW = 360, VH = 240, CX = 180, CY = 118;
  const rs = rows.map((r) => r.rel20), rm = rows.map((r) => r.rel5 - r.rel20);
  const xr = Math.max(4, ...rs.map(Math.abs)), yr = Math.max(2, ...rm.map(Math.abs));
  const X = (v: number) => CX + (v / xr) * 165;
  const Y = (v: number) => CY - (v / yr) * 100;

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))", padding: "16px 18px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 2 }}>
        <span style={KICKER}>{title}</span>
        <span style={{ fontSize: 10, color: "var(--faint)" }}>{subtitle}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.1fr) minmax(0,1fr)", gap: 20, marginTop: 12 }}>
        {/* Leadership ranking — diverging bars vs IHSG, window-toggled */}
        <div>
          <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
            {([["1D", "rel1"], ["5D", "rel5"], ["20D", "rel20"]] as const).map(([lab, k]) => {
              const on = k === win;
              return (
                <button key={k} type="button" onClick={() => setWin(k)} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 8, border: `1px solid ${on ? "var(--accent-border)" : "transparent"}`, background: on ? "var(--accentSoft)" : "var(--soft)", color: on ? "var(--accent)" : "var(--muted)", cursor: "pointer" }}>{lab}</button>
              );
            })}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map((r) => {
              const v = r[win];
              const lead = v >= 0;
              return (
                <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{ fontSize: 11, width: 92, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.label}>{r.label}</span>
                  <div style={{ flex: 1, height: 9, background: "var(--soft)", borderRadius: 5, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: 0, [lead ? "left" : "right"]: "50%", width: `${(Math.abs(v) / maxAbs) * 48}%`, height: "100%", background: lead ? "var(--up)" : "var(--down)", borderRadius: 5 }} />
                    <div style={{ position: "absolute", left: "50%", top: 0, width: 1, height: "100%", background: "var(--border)" }} />
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, width: 52, textAlign: "right", color: pctColor(v) }}>{lead ? "▲" : "▼"} {relFmt(v)}</span>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 8 }}>vs IHSG · 0% line = matching the index</div>
        </div>

        {/* RRG — relative strength (x) vs relative momentum (y) */}
        <div>
          <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: "100%", height: "auto", display: "block" }}>
            <rect x={CX} y={0} width={VW - CX} height={CY} fill="var(--upSoft)" />
            <rect x={0} y={CY} width={CX} height={VH - CY} fill="var(--downSoft)" />
            <line x1={CX} y1={0} x2={CX} y2={VH} stroke="var(--border)" strokeWidth={1} />
            <line x1={0} y1={CY} x2={VW} y2={CY} stroke="var(--border)" strokeWidth={1} />
            <text x={VW - 4} y={12} textAnchor="end" fontSize={8.5} fontWeight={700} fill="var(--up)" fontFamily="var(--font-mono)">LEADING</text>
            <text x={4} y={12} textAnchor="start" fontSize={8.5} fontWeight={700} fill="var(--flat)" fontFamily="var(--font-mono)">IMPROVING</text>
            <text x={4} y={VH - 5} textAnchor="start" fontSize={8.5} fontWeight={700} fill="var(--down)" fontFamily="var(--font-mono)">LAGGING</text>
            <text x={VW - 4} y={VH - 5} textAnchor="end" fontSize={8.5} fontWeight={700} fill="var(--flat)" fontFamily="var(--font-mono)">WEAKENING</text>
            {rows.map((r) => {
              const x = X(r.rel20), y = Y(r.rel5 - r.rel20);
              const lead = r.rel20 >= 0;
              return (
                <g key={r.label}>
                  <circle cx={x} cy={y} r={4.5} fill={lead ? "var(--up)" : "var(--down)"} stroke="var(--panel)" strokeWidth={1.5} />
                  <text x={x + 6} y={y + 3} fontSize={8.5} fontWeight={600} fill="var(--text)" fontFamily="var(--font-mono)">{shortName(r.label)}</text>
                </g>
              );
            })}
          </svg>
          <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 4, textAlign: "center" }}>x = strength vs IHSG (20D) · y = momentum (5D − 20D)</div>
        </div>
      </div>
    </div>
  );
}
