"use client";

import type { CSSProperties } from "react";
import type { MarketRisk } from "@/lib/data/marketRisk";

const toneColor = (t: string) => (t === "up" ? "var(--up)" : t === "down" ? "var(--down)" : "var(--muted)");

function TrendChart({ series, tone }: { series: number[]; tone: string }) {
  if (series.length < 2) return <div style={{ height: 56 }} />;
  const min = Math.min(...series), max = Math.max(...series);
  const range = max - min || 1;
  const w = 100, h = 56;
  const pts = series.map((v, i) => `${(i / (series.length - 1)) * w},${h - ((v - min) / range) * (h - 6) - 3}`).join(" ");
  const stroke = toneColor(tone);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 56 }}>
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const KICKER: CSSProperties = { fontSize: 10.5, letterSpacing: ".12em", fontWeight: 700, color: "var(--faint)" };

export function MarketRisk({ risk }: { risk: MarketRisk | null }) {
  if (!risk) return <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Market risk unavailable (no index history).</div>;
  const c = toneColor(risk.tone);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={KICKER}>MARKET RISK</div>
        <span style={{ fontFamily: "var(--mono, var(--font-mono))", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 7, background: risk.tone === "up" ? "var(--upSoft)" : risk.tone === "down" ? "var(--downSoft)" : "var(--soft)", color: c }}>
          {risk.label} {risk.score}/100
        </span>
      </div>

      {/* 0-100 meter */}
      <div style={{ height: 6, borderRadius: 4, background: "var(--soft)", overflow: "hidden", marginBottom: 10 }}>
        <div style={{ width: `${risk.score}%`, height: "100%", background: c }} />
      </div>

      <TrendChart series={risk.series} tone={risk.tone} />
      <div style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0 14px" }}>Why: {risk.why}</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {risk.metrics.map((m, i) => (
          <div key={m.name} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--hair)" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{m.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1, lineHeight: 1.35, maxWidth: 240 }}>{m.hint}</div>
            </div>
            <div style={{ fontFamily: "var(--mono, var(--font-mono))", fontSize: 13, fontWeight: 600, color: toneColor(m.tone), whiteSpace: "nowrap" }}>{m.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
