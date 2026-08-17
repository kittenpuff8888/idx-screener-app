"use client";

import type { CSSProperties } from "react";
import type { MarketBreadth } from "@/lib/data/marketBreadth";

const MONO = "var(--font-mono)";
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const pct = (v: number | null, d = 0) => (v == null ? "—" : `${Math.round(v * 100 * 10 ** d) / 10 ** d}%`);
const signed = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(1)}%`);
const col = (v: number | null) => (v == null ? "var(--muted)" : v >= 0 ? "var(--up)" : "var(--down)");

// Breadth heat for the sector bars: IDX runs structurally low, so anchor the
// scale to its own distribution (≈10% thin → ≈45% healthy) rather than a US 50%.
function heat(p: number): string {
  if (p >= 0.4) return "var(--up)";
  if (p >= 0.28) return "var(--cat-4, var(--accent))";
  if (p >= 0.2) return "var(--warning)";
  return "var(--down)";
}

/** Market Breadth & Regime — the IDX-breadth panel that replaces the old
    US-style 0–100 risk gauge (klinikpenyesalan breadth study). Descriptive
    context only: short vs long breadth, the cap-vs-equal gap, and sector breadth. */
export function MarketBreadthPanel({ data, asOf }: { data: MarketBreadth | null; asOf: string }) {
  if (!data) return <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Breadth unavailable — no moving-average data in this snapshot.</div>;
  const { pct200, pct50, sectors, medianRet1M, ihsgRet1M, regimeLabel, regimeNote, coverage } = data;
  const gap = medianRet1M != null && ihsgRet1M != null ? medianRet1M - ihsgRet1M : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={KICKER}>MARKET BREADTH · REGIME</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9.5, color: "var(--faint)" }}>as of {asOf}</span>
      </div>

      {/* Regime read (descriptive) */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, letterSpacing: "-.01em" }}>{regimeLabel}</div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5, marginTop: 4 }}>{regimeNote}</div>
      </div>

      {/* Short vs long breadth — the "80% yes, 25% no" headline */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {([["SHORT-TERM", pct50, "above 50-day MA", "near-term participation"], ["STRUCTURAL", pct200, "above 200-day MA", "market health"]] as const).map(([k, v, sub, note]) => (
          <div key={k} style={{ background: "var(--soft)", border: "1px solid var(--hair)", borderRadius: 10, padding: "11px 13px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", color: "var(--faint)" }}>{k}</div>
            <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: v == null ? "var(--muted)" : heat(v), marginTop: 2 }}>{pct(v)}</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>{sub}</div>
            <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 1 }}>{note}</div>
          </div>
        ))}
      </div>

      {/* The index flatters the average stock (cap vs equal-weight, snapshot) */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 11, flexWrap: "wrap" }}>
        <span style={{ ...KICKER, fontSize: 9 }}>TYPICAL STOCK vs INDEX · 1-MO</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: "var(--muted)" }}>median stock <b style={{ fontFamily: MONO, color: col(medianRet1M) }}>{signed(medianRet1M)}</b></span>
        <span style={{ color: "var(--faint)" }}>vs</span>
        <span style={{ color: "var(--muted)" }}>IHSG <b style={{ fontFamily: MONO, color: col(ihsgRet1M) }}>{signed(ihsgRet1M)}</b></span>
        {gap != null ? <span style={{ fontFamily: MONO, fontSize: 10, color: col(gap) }}>({gap >= 0 ? "+" : "−"}{(Math.abs(gap) * 100).toFixed(1)}pp)</span> : null}
      </div>

      {/* Sector breadth — where the strength/damage sits */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 auto" }}>
        <div style={{ ...KICKER, fontSize: 9, marginBottom: 2 }}>SECTOR BREADTH · % ABOVE 200-DAY MA</div>
        {sectors.map((s) => (
          <div key={s.sector} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10.5 }}>
            <span style={{ width: 118, flexShrink: 0, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`${s.sector} · ${s.n} stocks`}>{s.sector}</span>
            <span style={{ flex: 1, height: 7, background: "var(--soft)", borderRadius: 4, overflow: "hidden" }}>
              <span style={{ display: "block", width: `${Math.max(2, s.pct * 100)}%`, height: "100%", background: heat(s.pct), borderRadius: 4 }} />
            </span>
            <span style={{ fontFamily: MONO, fontWeight: 700, width: 34, textAlign: "right" }}>{Math.round(s.pct * 100)}%</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 9.5, color: "var(--faint)", lineHeight: 1.5, borderTop: "1px solid var(--hair)", paddingTop: 8 }}>
        Breadth is descriptive context — it confirms the trend and reveals concentration, not a timing signal (near-zero forward correlation on IDX). % above 200-day MA over {coverage} stocks · thresholds calibrated to IDX, not US. Source: workbook moving averages · {asOf}.
      </div>
    </div>
  );
}
