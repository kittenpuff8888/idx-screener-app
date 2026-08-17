"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useApp } from "@/components/providers/AppProvider";
import { fetchJson } from "@/lib/data/client";

const MONO = "var(--font-mono)";
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))", padding: "16px 18px" };

type Entry = { date: string; ticker: string; score: number; close: number; target: number; invalidation: number; outcome: string; barsObserved: number };
type HistoryDoc = { asOf?: string; entries?: Entry[]; summary?: { total?: number; decided?: number; targetFirst?: number; hitRate?: number | null }; note?: string };

const OUTCOME: Record<string, { color: string; label: string }> = {
  target: { color: "var(--up)", label: "TARGET" }, invalidated: { color: "var(--down)", label: "INVALIDATED" },
  undecided: { color: "var(--muted)", label: "UNDECIDED (5 bars)" }, open: { color: "var(--warning)", label: "OPEN" },
};

/** Planned R:R from the trade levels; realized R (+RR on target, −1 on invalidation, else null). */
function realizedR(e: Entry): number | null {
  const risk = e.close - e.invalidation;
  const rr = risk > 0 ? (e.target - e.close) / risk : null;
  if (e.outcome === "target") return rr;
  if (e.outcome === "invalidated") return -1;
  return null; // undecided / open — not decided
}

// Wilson 95% score interval for a proportion (z = 1.96).
function wilson(hits: number, n: number): [number, number] | null {
  if (!n) return null;
  const z = 1.96, p = hits / n, z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

export function PastSetups() {
  const { marketDate } = useApp();
  const [doc, setDoc] = useState<HistoryDoc | null>(null);
  const [filter, setFilter] = useState<"all" | "target" | "invalidated" | "open">("all");
  useEffect(() => { fetchJson<HistoryDoc>("/data/setups-history.json").then(setDoc).catch(() => setDoc({ entries: [], summary: {} })); }, []);

  const model = useMemo(() => {
    const entries = (doc?.entries || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const decided = entries.filter((e) => e.outcome === "target" || e.outcome === "invalidated");
    const wins = decided.filter((e) => e.outcome === "target").length;
    const hitRate = decided.length ? wins / decided.length : null;
    const ci = wilson(wins, decided.length);
    const rs = decided.map(realizedR).filter((r): r is number => r != null);
    const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
    // equity curve: cumulative realized R over decided trades, in date order
    let cum = 0; const curve = decided.map((e) => { const r = realizedR(e) ?? 0; cum += r; return cum; });
    return { entries, decided, wins, hitRate, ci, avgR, curve, total: entries.length };
  }, [doc]);

  if (!doc) return <section><h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Past Setups</h1><p style={{ color: "var(--muted)" }}>Loading forward-outcome history…</p></section>;

  const { entries, decided, wins, hitRate, ci, avgR, curve, total } = model;
  const cMin = Math.min(0, ...curve), cMax = Math.max(0, ...curve), cRange = cMax - cMin || 1;
  const invalidated = decided.length - wins;
  const openCount = total - decided.length;
  const tabs = [["all", "All", total], ["target", "Target", wins], ["invalidated", "Invalidated", invalidated], ["open", "Open", openCount]] as const;
  const rows = entries.slice().reverse().filter((e) => filter === "all" || (filter === "target" && e.outcome === "target") || (filter === "invalidated" && e.outcome === "invalidated") || (filter === "open" && e.outcome !== "target" && e.outcome !== "invalidated"));

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <Link href="/screener" style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", background: "var(--panel)", borderRadius: 9, padding: "7px 12px", fontSize: 13, color: "var(--muted)", textDecoration: "none" }}>‹ Screener</Link>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>Past Setups</h1>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 6, padding: "3px 8px" }}>FORWARD OUTCOMES</span>
      </div>

      {/* KPI tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14, marginBottom: 14 }}>
        {([["PUBLISHED", String(total), "setups logged", "var(--text)"], ["DECIDED", String(decided.length), "target or invalidated", "var(--text)"], ["HIT-RATE", hitRate == null ? "—" : `${Math.round(hitRate * 100)}%`, "reached target first", hitRate != null && hitRate >= 0.5 ? "var(--up)" : "var(--down)"], ["TARGET-FIRST", String(wins), "of the decided", "var(--accent)"]] as const).map(([k, v, sub, c]) => (
          <div key={k} style={CARD}>
            <div style={KICKER}>{k}</div>
            <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800, marginTop: 6, color: c }}>{v}</div>
            <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14, marginBottom: 14, alignItems: "start" }}>
        {/* EXPECTANCY */}
        <div style={CARD}>
          <div style={{ ...KICKER, marginBottom: 12 }}>EXPECTANCY · DECIDED SETUPS</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><div style={{ fontSize: 9, color: "var(--faint)" }}>HIT-RATE (95% CI)</div><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800 }}>{hitRate == null ? "—" : `${Math.round(hitRate * 100)}%`}</div><div style={{ fontSize: 9.5, color: "var(--faint)" }}>{ci ? `CI ${Math.round(ci[0] * 100)}–${Math.round(ci[1] * 100)}%` : "—"}</div></div>
            <div><div style={{ fontSize: 9, color: "var(--faint)" }}>AVG R / TRADE</div><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: (avgR ?? 0) >= 0 ? "var(--up)" : "var(--down)" }}>{avgR == null ? "—" : `${avgR >= 0 ? "+" : "−"}${Math.abs(avgR).toFixed(2)}R`}</div><div style={{ fontSize: 9.5, color: "var(--faint)" }}>n = {decided.length}</div></div>
            <div><div style={{ fontSize: 9, color: "var(--faint)" }}>CUMULATIVE</div><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: (curve.at(-1) ?? 0) >= 0 ? "var(--up)" : "var(--down)" }}>{curve.length ? `${(curve.at(-1) ?? 0) >= 0 ? "+" : "−"}${Math.abs(curve.at(-1) ?? 0).toFixed(1)}R` : "—"}</div><div style={{ fontSize: 9.5, color: "var(--faint)" }}>win +planned · loss −1R</div></div>
          </div>
          {decided.length < 20 ? <div style={{ marginTop: 12, background: "var(--warnSoft)", border: "1px solid var(--warning)", borderRadius: 9, padding: "9px 11px", fontSize: 11, color: "var(--text)", lineHeight: 1.5 }}>⚠ Small sample (n &lt; 20) — wide CI; treat as indicative. Log may carry survivorship/look-ahead bias until an audited forward record accrues.</div> : null}
        </div>

        {/* EQUITY CURVE + outcome bar */}
        <div style={CARD}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={KICKER}>EQUITY CURVE · R MULTIPLES</span>
            <span style={{ fontSize: 9.5, color: "var(--faint)" }}>flat line = breakeven</span>
          </div>
          {curve.length >= 2 ? (
            <svg viewBox="0 0 100 44" preserveAspectRatio="none" style={{ width: "100%", height: 96 }}>
              <line x1={0} y1={((cMax - 0) / cRange * 40 + 2).toFixed(1)} x2={100} y2={((cMax - 0) / cRange * 40 + 2).toFixed(1)} stroke="var(--hair)" strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
              <path d={curve.map((v, i) => `${i ? "L" : "M"} ${(i / (curve.length - 1) * 100).toFixed(2)} ${(2 + (cMax - v) / cRange * 40).toFixed(2)}`).join(" ")} fill="none" stroke={(curve.at(-1) ?? 0) >= 0 ? "var(--up)" : "var(--down)"} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
          ) : <div style={{ fontSize: 12, color: "var(--muted)", padding: "20px 0" }}>Not enough decided setups for a curve yet.</div>}
          <div style={{ display: "flex", height: 12, borderRadius: 5, overflow: "hidden", gap: 2, marginTop: 10 }}>
            {([[wins, "var(--up)"], [invalidated, "var(--down)"], [openCount, "var(--muted)"]] as const).map(([v, c], i) => v > 0 ? <div key={i} style={{ flex: v, background: c }} /> : null)}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10.5 }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--up)", marginRight: 4 }} />Target-first <b>{wins}</b></span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--down)", marginRight: 4 }} />Invalidated <b>{invalidated}</b></span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--muted)", marginRight: 4 }} />Still open <b>{openCount}</b></span>
          </div>
        </div>
      </div>

      {/* PUBLISHED SETUPS table */}
      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={KICKER}>PUBLISHED SETUPS</span>
          <span style={{ fontSize: 10, color: "var(--faint)" }}>vs IHSG benchmark over the same window</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 3, background: "var(--soft)", borderRadius: 8, padding: 3 }}>
            {tabs.map(([k, l, c]) => <button key={k} type="button" onClick={() => setFilter(k)} style={{ fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: filter === k ? "var(--accent)" : "transparent", color: filter === k ? "#fff" : "var(--muted)" }}>{l} {c}</button>)}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 620 }}>
            <div style={{ display: "grid", gridTemplateColumns: "90px 70px 56px 70px 70px 70px 56px 1fr", gap: 8, fontSize: 8.5, fontWeight: 700, color: "var(--faint)", paddingBottom: 8, borderBottom: "1px solid var(--hair)" }}>
              <span>DATE ▼</span><span>TICKER</span><span style={{ textAlign: "right" }}>SCORE</span><span style={{ textAlign: "right" }}>CLOSE</span><span style={{ textAlign: "right" }}>INVALID.</span><span style={{ textAlign: "right" }}>TARGET</span><span style={{ textAlign: "right" }}>R:R</span><span>OUTCOME</span>
            </div>
            {rows.map((e, i) => {
              const st = OUTCOME[e.outcome] || OUTCOME.open; const risk = e.close - e.invalidation; const rr = risk > 0 ? (e.target - e.close) / risk : null;
              return (
                <div key={`${e.date}-${e.ticker}`} style={{ display: "grid", gridTemplateColumns: "90px 70px 56px 70px 70px 70px 56px 1fr", gap: 8, alignItems: "center", padding: "8px 0", borderTop: i ? "1px solid var(--hair)" : "none", fontSize: 11.5 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--faint)" }}>{e.date}</span>
                  <span style={{ fontFamily: MONO, fontWeight: 800 }}>{e.ticker}</span>
                  <span style={{ fontFamily: MONO, fontWeight: 700, textAlign: "right", color: e.score >= 70 ? "var(--accent)" : "var(--muted)" }}>{e.score}</span>
                  <span style={{ fontFamily: MONO, textAlign: "right" }}>{e.close.toLocaleString("id-ID")}</span>
                  <span style={{ fontFamily: MONO, textAlign: "right", color: "var(--down)" }}>{e.invalidation.toLocaleString("id-ID")}</span>
                  <span style={{ fontFamily: MONO, textAlign: "right", color: "var(--accent)" }}>{e.target.toLocaleString("id-ID")}</span>
                  <span style={{ fontFamily: MONO, textAlign: "right", color: "var(--accent)" }}>{rr == null ? "—" : `${rr.toFixed(1)}×`}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: st.color }}>{st.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 10, color: "var(--faint)", lineHeight: 1.5 }}>{doc.note || "Forward outcomes of published setups (5 bars). Blue = reached target, red = invalidated, gray = still open. Small samples early on — analytics, not advice."}</p>
      </div>
    </section>
  );
}
