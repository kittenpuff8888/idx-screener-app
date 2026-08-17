"use client";

import type { CSSProperties } from "react";
import type { MarketRisk, RiskTone } from "@/lib/data/marketRisk";

const MONO = "var(--font-mono)";
const toneColor = (t: RiskTone) => (t === "up" ? "var(--up)" : t === "down" ? "var(--down)" : "var(--flat)");
const toneChip = (t: RiskTone) => (t === "up" ? "var(--upSoft)" : t === "down" ? "var(--downSoft)" : "var(--soft)");
const toneGlyph = (t: RiskTone) => (t === "up" ? "▲" : t === "down" ? "▼" : "•");
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };

/**
 * MARKET RISK · 0–100 — big score, a zoned RISK-OFF◀…▶RISK-ON meter with a marker at
 * the score, the plain-language "why", and the eight sub-metrics as glyph chips.
 * All values come from lib/data/marketRisk.ts (computed from real close + breadth).
 */
export function RiskGauge({ risk }: { risk: MarketRisk | null }) {
  if (!risk) {
    return <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Market risk unavailable (no index history).</div>;
  }
  const c = toneColor(risk.tone);
  const meterLeft = `${Math.max(0, Math.min(100, risk.score))}%`;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={KICKER}>MARKET RISK · 0–100</div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "14px 0 16px" }}>
        <div style={{ fontFamily: MONO, fontSize: 54, fontWeight: 800, lineHeight: 0.85, color: c }}>{risk.score}</div>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", fontSize: 12, fontWeight: 800, letterSpacing: ".09em", padding: "4px 11px", borderRadius: 999, background: toneChip(risk.tone), color: c }}>
            {risk.label}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 5 }}>out of 100 · higher is risk-on</div>
        </div>
      </div>

      {/* Zoned meter: 45% RISK-OFF / 10% neutral / 45% RISK-ON, marker at the score */}
      <div style={{ position: "relative", height: 12, display: "flex" }}>
        <div style={{ width: "45%", background: "var(--down)", borderRadius: "999px 0 0 999px" }} />
        <div style={{ width: "10%", background: "var(--flat)", opacity: 0.32 }} />
        <div style={{ width: "45%", background: "var(--up)", borderRadius: "0 999px 999px 0" }} />
        <div style={{ position: "absolute", top: "50%", left: meterLeft, transform: "translate(-50%,-50%)", width: 20, height: 20, borderRadius: "50%", background: "var(--panel)", border: `3px solid ${c}`, boxShadow: "0 2px 7px rgba(11,14,20,.24)" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", marginTop: 10 }}>
        <span style={{ color: "var(--down)" }}>◀ RISK-OFF</span>
        <span style={{ color: "var(--faint)" }}>NEUTRAL</span>
        <span style={{ color: "var(--up)" }}>RISK-ON ▶</span>
      </div>

      <div style={{ fontSize: 11.5, color: "var(--muted)", margin: "12px 0 2px", lineHeight: 1.45, textWrap: "pretty" as CSSProperties["textWrap"] }}>Why: {risk.why}</div>

      <div style={{ borderTop: "1px solid var(--hair)", marginTop: 12, paddingTop: 10 }}>
        <div style={{ ...KICKER, marginBottom: 2 }}>{risk.metrics.length} SUB-METRICS</div>
        <div>
          {risk.metrics.map((m, i) => (
            <div key={m.name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--hair)" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{m.name}</div>
                <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.hint}</div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: MONO, fontSize: 11.5, fontWeight: 700, padding: "3px 8px", borderRadius: 7, background: toneChip(m.tone), color: toneColor(m.tone), whiteSpace: "nowrap" }}>
                {toneGlyph(m.tone)} {m.value}
              </span>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "1px solid var(--hair)", marginTop: 8, paddingTop: 8, fontSize: 10.5, color: "var(--faint)" }}>
          Score = 30% Trend + 30% Breadth + 20% Volatility + 20% Foreign flow · RISK-ON ≥ 55 · RISK-OFF ≤ 45
        </div>
      </div>
    </div>
  );
}
