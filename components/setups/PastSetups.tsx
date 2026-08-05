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

  if (!doc) return <section><h1 style={{ fontSize: 24, fontWeight: 700 }}>Past Setups</h1><p style={{ color: "var(--muted)" }}>Loading forward-outcome history…</p></section>;

  const { entries, decided, wins, hitRate, ci, avgR, curve, total } = model;
  const cMin = Math.min(0, ...curve), cMax = Math.max(0, ...curve), cRange = cMax - cMin || 1;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-.01em" }}>Past Setups</h1>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 6, padding: "3px 8px" }}>Forward outcomes · as of {doc.asOf || marketDate || "—"}</span>
        <div style={{ flex: 1 }} />
        <Link href="/explorer" style={{ fontSize: 12, color: "var(--accent)" }}>← Setups Screener</Link>
      </div>

      {/* EXPECTANCY */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14, marginBottom: 14 }}>
        <div style={CARD}>
          <div style={KICKER}>HIT-RATE (95% CI)</div>
          <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800, marginTop: 6 }}>{hitRate == null ? "—" : `${Math.round(hitRate * 100)}%`}</div>
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{ci ? `95% CI ${Math.round(ci[0] * 100)}–${Math.round(ci[1] * 100)}%` : "—"} · {wins}/{decided.length} decided</div>
        </div>
        <div style={CARD}>
          <div style={KICKER}>AVG R / TRADE</div>
          <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800, marginTop: 6, color: (avgR ?? 0) >= 0 ? "var(--up)" : "var(--down)" }}>{avgR == null ? "—" : `${avgR >= 0 ? "+" : "−"}${Math.abs(avgR).toFixed(2)}R`}</div>
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>realized over {decided.length} decided setups</div>
        </div>
        <div style={CARD}>
          <div style={KICKER}>EXPECTANCY · DECIDED SETUPS</div>
          <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800, marginTop: 6 }}>{decided.length}<span style={{ fontSize: 14, color: "var(--faint)" }}> / {total}</span></div>
          <div style={{ fontSize: 11, color: "var(--faint)", marginTop: 2 }}>{total - decided.length} still open/undecided</div>
        </div>
      </div>

      {decided.length < 20 ? (
        <div style={{ ...CARD, background: "var(--warnSoft)", border: "1px solid var(--warning)", color: "var(--text)", fontSize: 12, marginBottom: 14 }}>
          ⚠ Small sample ({decided.length} decided) — the hit-rate and avg-R are indicative only, not statistically robust. Outcomes are forward-tracked as the daily pipeline publishes sessions; survivorship / look-ahead caveats apply.
        </div>
      ) : null}

      {/* EQUITY CURVE */}
      <div style={{ ...CARD, marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={KICKER}>EQUITY CURVE · R MULTIPLES · CUMULATIVE</span>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: (curve.at(-1) ?? 0) >= 0 ? "var(--up)" : "var(--down)" }}>{curve.length ? `${(curve.at(-1) ?? 0) >= 0 ? "+" : "−"}${Math.abs(curve.at(-1) ?? 0).toFixed(1)}R total` : "—"}</span>
        </div>
        {curve.length >= 2 ? (
          <svg viewBox="0 0 100 44" preserveAspectRatio="none" style={{ width: "100%", height: 120 }}>
            <line x1={0} y1={((cMax - 0) / cRange * 40 + 2).toFixed(1)} x2={100} y2={((cMax - 0) / cRange * 40 + 2).toFixed(1)} stroke="var(--hair)" strokeWidth={1} strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
            <path d={curve.map((v, i) => `${i ? "L" : "M"} ${(i / (curve.length - 1) * 100).toFixed(2)} ${(2 + (cMax - v) / cRange * 40).toFixed(2)}`).join(" ")}
              fill="none" stroke={(curve.at(-1) ?? 0) >= 0 ? "var(--up)" : "var(--down)"} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        ) : <div style={{ fontSize: 12, color: "var(--muted)", padding: "20px 0" }}>Not enough decided setups for a curve yet.</div>}
      </div>

      {/* FORWARD OUTCOMES */}
      <div style={CARD}>
        <div style={{ ...KICKER, marginBottom: 10 }}>PUBLISHED SETUPS · FORWARD OUTCOMES</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {entries.slice().reverse().map((e, i) => {
            const st = OUTCOME[e.outcome] || OUTCOME.open; const r = realizedR(e);
            return (
              <div key={`${e.date}-${e.ticker}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderTop: i ? "1px solid var(--hair)" : "none", fontSize: 12 }}>
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--faint)", width: 82 }}>{e.date}</span>
                <span style={{ fontFamily: MONO, fontWeight: 700, width: 56 }}>{e.ticker}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", width: 34 }}>{e.score}</span>
                <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: st.color, width: 150 }}>{st.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: r == null ? "var(--faint)" : r >= 0 ? "var(--up)" : "var(--down)" }}>{r == null ? "—" : `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(1)}R`}</span>
              </div>
            );
          })}
        </div>
        {doc.note ? <p style={{ margin: "10px 0 0", fontSize: 10, color: "var(--faint)" }}>{doc.note}</p> : null}
      </div>
    </section>
  );
}
