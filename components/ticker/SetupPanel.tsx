"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { fetchJson } from "@/lib/data/client";
import { formatPrice } from "@/lib/format/number";

type Setup = { ticker: string; score: number; components: Record<string, number>; entryZone: number; invalidation: number; target: number; why: string; history?: { signals: number; hitRate: number } | null };

/** Compact swing-setup context for the ticker research drawer. Renders nothing
    when the ticker is not a current candidate (no filler). */
export function SetupPanel({ ticker }: { ticker: string }) {
  const { marketDate } = useApp();
  const [setup, setSetup] = useState<Setup | null>(null);
  useEffect(() => {
    if (!marketDate || !ticker) return;
    setSetup(null);
    fetchJson<{ setups: Setup[] }>(`/data/dates/${marketDate}/setups.json`)
      .then((p) => setSetup((p.setups || []).find((s) => s.ticker === ticker.toUpperCase()) || null))
      .catch(() => setSetup(null));
  }, [marketDate, ticker]);

  if (!setup) return null;
  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--accentLine)", borderRadius: "var(--r)", padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: "var(--accent)" }}>SWING SETUP · TODAY</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--mono, var(--font-mono))", fontSize: 16, fontWeight: 700, color: "var(--accent)" }}>{setup.score}</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, color: "var(--muted)", marginBottom: 8 }}>
        {Object.entries(setup.components).map(([k, v]) => <span key={k}>{k} <b style={{ fontFamily: "var(--mono, var(--font-mono))" }}>{v}</b></span>)}
      </div>
      <div style={{ display: "flex", gap: 12, fontFamily: "var(--mono, var(--font-mono))", fontSize: 11.5, marginBottom: 8 }}>
        <span>entry <b>{formatPrice(setup.entryZone)}</b></span>
        <span style={{ color: "var(--down)" }}>inval <b>{formatPrice(setup.invalidation)}</b></span>
        <span style={{ color: "var(--up)" }}>target <b>{formatPrice(setup.target)}</b></span>
      </div>
      <p style={{ margin: 0, fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5 }}>{setup.why}</p>
      {setup.history ? <p style={{ margin: "7px 0 0", fontSize: 10, color: "var(--faint)" }}>Ticker history (core signal): {setup.history.signals} decided, hit-rate {Math.round(setup.history.hitRate * 100)}% — small sample, analytics only.</p> : null}
    </div>
  );
}
