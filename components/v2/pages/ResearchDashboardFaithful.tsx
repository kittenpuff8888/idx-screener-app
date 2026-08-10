"use client";

import { useMemo } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { V2Shell } from "@/components/v2/V2Shell";
import { DashboardPage } from "@/components/dashboard/DashboardPage";
import { asNumber } from "@/lib/format/number";
import type { JsonRecord } from "@/lib/domain/types";

// Faithful port of "1. Research Dashboard.dc.html". The prototype's own data is
// seeded; the repo already computes the real equivalents of every module (regime
// read, risk gauge, cross-asset carousel, leaders/laggards, sectoral+konglo
// rotation, squarified treemap) — rendered here via <DashboardPage hideIntro/>.
// This adds the two prototype-specific strips the repo lacked: the MACRO econ
// rail and the breadth-internals row, both wired to real feeds.

const pctColor = (r: number | null) => (r == null || r === 0 ? "var(--flat)" : r > 0 ? "var(--up)" : "var(--down)");
const glyph = (r: number | null) => (r == null || r === 0 ? "•" : r > 0 ? "▲" : "▼");
const fmtPct = (r: number | null) => (r == null ? "—" : `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r * 100).toFixed(2)}%`);
const idid = (v: number, d: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);

export function ResearchDashboardFaithful() {
  const { marketContext, bundle, marketDate } = useApp();

  // ── MACRO econ rail — real latest value + day change per instrument ──
  const econRail = useMemo(() => {
    return (marketContext?.instruments || []).map((inst) => {
      const rows = (inst.rows || []).filter((r) => !marketDate || String(r.date) <= marketDate);
      const last = rows.at(-1), prev = rows.at(-2);
      const val = last ? Number(last.close ?? last.value) : null;
      const prevVal = prev ? Number(prev.close ?? prev.value) : null;
      const day = val != null && prevVal != null && prevVal !== 0 ? val / prevVal - 1 : null;
      const dp = inst.label === "USDIDR" ? 0 : inst.label === "VIX" ? 2 : inst.label === "BTC" ? 0 : 2;
      return { label: inst.label, value: val == null || !isFinite(val) ? "—" : idid(val, dp), chg: fmtPct(day), color: pctColor(day) };
    }).filter((e) => e.value !== "—");
  }, [marketContext, marketDate]);

  // ── breadth internals — real advances/declines/unchanged ──
  const breadth = useMemo(() => {
    const b = ((bundle?.overview?.overview as JsonRecord)?.breadth || {}) as JsonRecord;
    const adv = asNumber(b.advances) ?? 0, dec = asNumber(b.declines) ?? 0, unch = asNumber(b.unchanged) ?? 0;
    const total = adv + dec + unch || 1;
    const upPct = (adv / (adv + dec || 1)) * 100;
    return [
      { label: "% ADVANCING", value: `${upPct.toFixed(0)}%`, sub: `${adv}/${adv + dec}`, color: upPct >= 50 ? "var(--up)" : "var(--down)" },
      { label: "ADVANCERS", value: String(adv), sub: `${((adv / total) * 100).toFixed(0)}% of tape`, color: "var(--up)" },
      { label: "DECLINERS", value: String(dec), sub: `${((dec / total) * 100).toFixed(0)}% of tape`, color: "var(--down)" },
      { label: "UNCHANGED", value: String(unch), sub: `${((unch / total) * 100).toFixed(0)}% of tape`, color: "var(--flat)" },
    ];
  }, [bundle]);

  const meta = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10.5, fontWeight: 600, color: "var(--muted)" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--flat)" }} />src: IDX close · as of {marketDate} · EOD
    </span>
  );

  return (
    <V2Shell active="research" title="Research Dashboard" meta={meta}>
      <main style={{ flex: 1, minWidth: 0, padding: "24px 30px 64px", background: "var(--bg)" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-.01em" }}>Research Dashboard</h1>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 999, padding: "3px 9px" }}>REDESIGN</span>
          </div>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13.5, maxWidth: 720, lineHeight: 1.5 }}>
            Read top-down — <strong style={{ color: "var(--text)", fontWeight: 700 }}>regime → tape → rotation → names</strong>. Every mark is validated blue-up / red-down, always paired with a sign and glyph.
          </p>
        </div>

        {/* MACRO econ rail (real) */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--sh)", padding: "9px 14px", marginBottom: 14 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)", flex: "none" }}>MACRO</span>
          {econRail.map((e) => (
            <span key={e.label} style={{ display: "inline-flex", alignItems: "baseline", gap: 5, fontSize: 11, background: "var(--soft)", borderRadius: 7, padding: "4px 9px" }}>
              <span style={{ color: "var(--muted)", fontWeight: 600 }}>{e.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{e.value}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: e.color }}>{e.chg}</span>
            </span>
          ))}
        </div>

        {/* breadth internals (real) */}
        <div style={{ display: "flex", alignItems: "stretch", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          {breadth.map((b) => (
            <div key={b.label} style={{ flex: 1, minWidth: 150, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "var(--sh)", padding: "11px 14px" }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", color: "var(--faint)" }}>{b.label}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 4 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 800, color: b.color }}>{b.value}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--muted)" }}>{b.sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* the real regime read, carousel, leaders, rotation, treemap */}
        <DashboardPage hideIntro />
      </main>
    </V2Shell>
  );
}
