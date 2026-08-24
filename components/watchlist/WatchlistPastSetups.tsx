"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { PastSetupEntry } from "@/lib/data/pastSetupsStore";
import { formatPrice } from "@/lib/format/number";

// Past Setups — a personal, watchlist-driven closed-positions log. Every
// entry here graduated from an active watchlist row whose real price action
// touched its locked-in target or invalidation (see WatchlistPage.tsx's
// resolveWatchlistOutcomes). Replaces the old signal-engine-sourced Past
// Setups page entirely — rebuilt from zero, nothing migrated.

const MONO = "var(--font-mono)";
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))", padding: "16px 18px" };

const OUTCOME_META = {
  target: { color: "var(--up)", label: "TARGET" },
  invalidation: { color: "var(--down)", label: "INVALIDATED" },
} as const;

/** Realized R for one entry: +locked-in R:R on a target hit, −1R on an
    invalidation hit (the standard convention — a full stop-out is defined as
    losing exactly the risked unit). */
function realizedR(e: PastSetupEntry): number | null {
  if (e.outcome === "target") return e.rr ?? null;
  if (e.outcome === "invalidation") return -1;
  return null;
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

export function WatchlistPastSetups({ entries }: { entries: PastSetupEntry[] }) {
  const [filter, setFilter] = useState<"all" | "target" | "invalidation">("all");

  const model = useMemo(() => {
    const sorted = entries.slice().sort((a, b) => a.resolvedAt.localeCompare(b.resolvedAt));
    const wins = sorted.filter((e) => e.outcome === "target").length;
    const losses = sorted.length - wins;
    const hitRate = sorted.length ? wins / sorted.length : null;
    const ci = wilson(wins, sorted.length);
    const rs = sorted.map(realizedR).filter((r): r is number => r != null);
    const avgR = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
    let cum = 0;
    const curve = sorted.map((e) => { cum += realizedR(e) ?? 0; return cum; });
    return { sorted, wins, losses, hitRate, ci, avgR, curve };
  }, [entries]);

  const { sorted, wins, losses, hitRate, ci, avgR, curve } = model;
  const cMin = Math.min(0, ...curve), cMax = Math.max(0, ...curve), cRange = cMax - cMin || 1;
  const tabs = [["all", "All", sorted.length], ["target", "Target", wins], ["invalidation", "Invalidated", losses]] as const;
  const rows = sorted.slice().reverse().filter((e) => filter === "all" || e.outcome === filter);

  if (!entries.length) {
    return (
      <div style={CARD}>
        <div style={{ ...KICKER, marginBottom: 8 }}>PAST SETUPS</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Empty so far — when a watchlisted ticker hits its locked-in target or invalidation, it graduates here automatically.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={KICKER}>PAST SETUPS</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 6, padding: "3px 8px" }}>WATCHLIST OUTCOMES</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14, marginBottom: 14, alignItems: "start" }}>
        <div style={CARD}>
          <div style={{ ...KICKER, marginBottom: 12 }}>EXPECTANCY · {sorted.length} RESOLVED</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><div style={{ fontSize: 9, color: "var(--faint)" }}>HIT-RATE (95% CI)</div><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800 }}>{hitRate == null ? "—" : `${Math.round(hitRate * 100)}%`}</div><div style={{ fontSize: 9.5, color: "var(--faint)" }}>{ci ? `CI ${Math.round(ci[0] * 100)}–${Math.round(ci[1] * 100)}%` : "—"}</div></div>
            <div><div style={{ fontSize: 9, color: "var(--faint)" }}>AVG R / TRADE</div><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: (avgR ?? 0) >= 0 ? "var(--up)" : "var(--down)" }}>{avgR == null ? "—" : `${avgR >= 0 ? "+" : "−"}${Math.abs(avgR).toFixed(2)}R`}</div><div style={{ fontSize: 9.5, color: "var(--faint)" }}>n = {sorted.length}</div></div>
            <div><div style={{ fontSize: 9, color: "var(--faint)" }}>CUMULATIVE</div><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: (curve.at(-1) ?? 0) >= 0 ? "var(--up)" : "var(--down)" }}>{curve.length ? `${(curve.at(-1) ?? 0) >= 0 ? "+" : "−"}${Math.abs(curve.at(-1) ?? 0).toFixed(1)}R` : "—"}</div><div style={{ fontSize: 9.5, color: "var(--faint)" }}>win +locked R:R · loss −1R</div></div>
          </div>
          {sorted.length < 20 ? <div style={{ marginTop: 12, background: "var(--warnSoft)", border: "1px solid var(--warning)", borderRadius: 9, padding: "9px 11px", fontSize: 11, color: "var(--text)", lineHeight: 1.5 }}>⚠ Small sample (n &lt; 20) — wide CI; treat as indicative, not a track record yet.</div> : null}
        </div>

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
          ) : <div style={{ fontSize: 12, color: "var(--muted)", padding: "20px 0" }}>Not enough resolved setups for a curve yet.</div>}
          <div style={{ display: "flex", height: 12, borderRadius: 5, overflow: "hidden", gap: 2, marginTop: 10 }}>
            {([[wins, "var(--up)"], [losses, "var(--down)"]] as const).map(([v, c], i) => v > 0 ? <div key={i} style={{ flex: v, background: c }} /> : null)}
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 10.5 }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--up)", marginRight: 4 }} />Target <b>{wins}</b></span>
            <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "var(--down)", marginRight: 4 }} />Invalidated <b>{losses}</b></span>
          </div>
        </div>
      </div>

      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={KICKER}>RESOLVED</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 3, background: "var(--soft)", borderRadius: 8, padding: 3 }}>
            {tabs.map(([k, l, c]) => <button key={k} type="button" onClick={() => setFilter(k)} style={{ fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: filter === k ? "var(--accent)" : "transparent", color: filter === k ? "#fff" : "var(--muted)" }}>{l} {c}</button>)}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 640 }}>
            <div style={{ display: "grid", gridTemplateColumns: "80px 66px 80px 80px 80px 56px 80px 1fr", gap: 8, fontSize: 8.5, fontWeight: 700, color: "var(--faint)", paddingBottom: 8, borderBottom: "1px solid var(--hair)" }}>
              <span>ADDED</span><span>TICKER</span><span style={{ textAlign: "right" }}>ENTRY</span><span style={{ textAlign: "right" }}>INVALID.</span><span style={{ textAlign: "right" }}>TARGET</span><span style={{ textAlign: "right" }}>R:R</span><span>RESOLVED</span><span>OUTCOME</span>
            </div>
            {rows.map((e, i) => {
              const st = OUTCOME_META[e.outcome];
              return (
                <div key={`${e.symbol}-${e.addedAt}-${e.resolvedAt}`} style={{ display: "grid", gridTemplateColumns: "80px 66px 80px 80px 80px 56px 80px 1fr", gap: 8, alignItems: "center", padding: "8px 0", borderTop: i ? "1px solid var(--hair)" : "none", fontSize: 11.5 }}>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--faint)" }}>{e.addedAt}</span>
                  <span style={{ fontFamily: MONO, fontWeight: 800 }}>{e.symbol}</span>
                  <span style={{ fontFamily: MONO, textAlign: "right" }}>{e.entry == null ? "—" : formatPrice(e.entry)}</span>
                  <span style={{ fontFamily: MONO, textAlign: "right", color: "var(--down)" }}>{e.invalidation == null ? "—" : formatPrice(e.invalidation)}</span>
                  <span style={{ fontFamily: MONO, textAlign: "right", color: "var(--accent)" }}>{e.target == null ? "—" : formatPrice(e.target)}</span>
                  <span style={{ fontFamily: MONO, textAlign: "right", color: "var(--accent)" }}>{e.rr == null ? "—" : `${e.rr.toFixed(1)}×`}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--faint)" }}>{e.resolvedAt}</span>
                  <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: st.color }}>{st.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 10, color: "var(--faint)", lineHeight: 1.5 }}>Real forward outcomes of your own watchlist adds — target/invalidation locked in at the moment each ticker was added (from a live setup when one was active, else the ticker&apos;s own anchored Volume Profile). Not a backtest, not advice.</p>
      </div>
    </div>
  );
}
