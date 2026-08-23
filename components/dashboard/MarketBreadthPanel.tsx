"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { fetchJson } from "@/lib/data/client";
import { breadthRegime, type BreadthHistory, type MarketBreadth } from "@/lib/data/marketBreadth";

const MONO = "var(--font-mono)";
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const signed = (v: number | null) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(1)}%`);
const col = (v: number | null) => (v == null ? "var(--muted)" : v >= 0 ? "var(--up)" : "var(--down)");

// IDX-anchored heat: structurally low market, so ≈10% thin → ≈45% healthy.
function heat(p: number): string {
  if (p >= 0.4) return "var(--up)";
  if (p >= 0.28) return "var(--cat-4, var(--accent))";
  if (p >= 0.2) return "var(--warning)";
  return "var(--down)";
}

// Tiny sparkline of a 0..1 series.
function Spark({ vals, color }: { vals: number[]; color: string }) {
  if (vals.length < 2) return null;
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const d = vals.map((v, i) => `${i ? "L" : "M"} ${((i / (vals.length - 1)) * 100).toFixed(2)} ${(18 - ((v - min) / span) * 16 - 1).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 18" preserveAspectRatio="none" style={{ width: "100%", height: 26 }} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

/** Market Breadth & Regime — the IDX-breadth panel (klinikpenyesalan study).
    Headline breadth and its 20-day slope come from a fixed liquid universe
    (breadth-history.json); sector breadth + the cap/equal gap are live. */
export function MarketBreadthPanel({ data, asOf }: { data: MarketBreadth | null; asOf: string }) {
  const [hist, setHist] = useState<BreadthHistory | null>(null);
  useEffect(() => { fetchJson<BreadthHistory>("/data/breadth-history.json").then(setHist).catch(() => setHist(null)); }, []);

  if (!data) return <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Breadth unavailable — no moving-average data in this snapshot.</div>;
  const { sectors, medianRet1M, ihsgRet1M } = data;

  // Prefer the fixed liquid-universe series (article's method); fall back to the
  // live all-universe reading if the history file is unavailable.
  const pts = hist?.points ?? [];
  const last = pts.at(-1);
  const prior20 = pts.length >= 21 ? pts[pts.length - 21] : pts[0];
  const headline200 = last?.pct200 ?? data.pct200;
  const headline50 = last?.pct50 ?? data.pct50;
  const slope20 = last?.pct200 != null && prior20?.pct200 != null ? last.pct200 - prior20.pct200 : null;
  const series200 = pts.map((p) => p.pct200).filter((v): v is number => v != null);
  // The 50-day and 200-day tiles are independently gated (a ticker can have
  // one moving average without the other) — n200/universeSize is always the
  // full fixed-liquid-universe count by construction, but n50 can be smaller
  // (a top-300-by-liquidity ticker can lack a 50-day EMA). Disclose both
  // counts whenever they actually differ, instead of reusing one number
  // (200-day coverage) as the caption for both tiles.
  const histN50 = last?.n50;
  const struct200N = hist ? hist.universeSize : data.coverage;
  const short50N = hist ? (histN50 ?? hist.universeSize) : data.coverage50;
  const uni = short50N === struct200N
    ? (hist ? `top ${struct200N} by liquidity` : `${struct200N} stocks`)
    : (hist ? `top ${struct200N} by liquidity (${short50N} for the 50-day read)` : `${short50N} stocks (50-day) / ${struct200N} stocks (200-day)`);
  const regime = breadthRegime(headline200, headline50);
  const gap = medianRet1M != null && ihsgRet1M != null ? medianRet1M - ihsgRet1M : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={KICKER}>MARKET BREADTH · REGIME</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9.5, color: "var(--faint)" }}>as of {asOf}</span>
      </div>

      <div>
        <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, letterSpacing: "-.01em" }}>{regime.label}</div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5, marginTop: 4 }}>{regime.note}</div>
      </div>

      {/* Short vs long breadth — the "80% yes, 25% no" headline */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {([["SHORT-TERM", headline50, "above 50-day MA", "near-term participation"], ["STRUCTURAL", headline200, "above 200-day MA", "market health"]] as const).map(([k, v, sub, note]) => (
          <div key={k} style={{ background: "var(--soft)", border: "1px solid var(--hair)", borderRadius: 10, padding: "11px 13px" }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".08em", color: "var(--faint)" }}>{k}</div>
            <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: v == null ? "var(--muted)" : heat(v), marginTop: 2 }}>{pct(v)}</div>
            <div style={{ fontSize: 10, color: "var(--muted)" }}>{sub}</div>
            <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 1 }}>{note}</div>
          </div>
        ))}
      </div>

      {/* Direction of travel — the article's key finding: slope > level */}
      {slope20 != null ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flexShrink: 0 }}>
            <div style={{ ...KICKER, fontSize: 9 }}>DIRECTION · 20d</div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: col(slope20) }}>
              {slope20 >= 0 ? "▲" : "▼"} {slope20 >= 0 ? "+" : "−"}{Math.abs(slope20 * 100).toFixed(0)} pts
            </div>
            <div style={{ fontSize: 8.5, color: "var(--faint)" }}>structural breadth</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}><Spark vals={series200} color={col(slope20)} /></div>
        </div>
      ) : null}

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
        Breadth is descriptive context — direction matters more than level (weight the 20-day slope over the raw %); near-zero forward correlation on IDX. Headline over the {uni}; sectors over all stocks with a 200-day MA. Calibrated to IDX, not US. Source: workbook moving averages · {asOf}.
      </div>
    </div>
  );
}
