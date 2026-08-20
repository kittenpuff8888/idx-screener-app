"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { OhlcvPayload } from "@/lib/domain/types";
import { loadOverlays, subscribeOverlays } from "@/lib/data/chartOverlays";
import { computeInitialBalance } from "@/lib/indicators/initialBalance";
import { formatPrice } from "@/lib/format/number";

// Companion candle chart for custom overlays that can't run in the TradingView
// embed (Pine only executes on tradingview.com). Renders NOTHING until a custom
// overlay is switched on in the ƒx picker, then draws our own candles from the
// published OHLCV JSON with the overlay on top. Honest about gaps: no bars ⇒ an
// explicit note, never a fabricated series.

const MONO = "var(--font-mono)";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r, 12px)", boxShadow: "var(--sh, var(--shadow))", padding: "14px 16px", marginBottom: 14 };
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const GOLD = "#D6A100";

// viewBox geometry (uniform scale — width:100% keeps text proportional).
const VW = 1000, VH = 340;
const PL = 8, PR = 930, PT = 14, PB = 250;      // price plot area
const VT = 262, VB = 314;                        // volume strip

export function IndicatorCompanion({ ohlcv, symbol, sessions = 140 }: { ohlcv: OhlcvPayload | null; symbol?: string; sessions?: number }) {
  const [overlays, setOverlays] = useState<string[]>([]);
  useEffect(() => {
    setOverlays(loadOverlays());
    return subscribeOverlays(setOverlays);
  }, []);

  const showIb = overlays.includes("ibhl");
  const allRows = ohlcv?.rows ?? [];

  const view = useMemo(() => {
    if (!showIb || allRows.length < 2) return null;
    const n = Math.min(allRows.length, Math.max(20, sessions));
    const off = allRows.length - n;                       // first visible index in allRows
    const rows = allRows.slice(off);
    const bandsAll = computeInitialBalance(allRows, 2);
    const bands = bandsAll
      .map((b) => ({ ...b, vStart: Math.max(b.startIdx, off), vEnd: Math.min(b.endIdx, allRows.length - 1) }))
      .filter((b) => b.vEnd >= off);

    let min = Infinity, max = -Infinity, maxVol = 1;
    for (const r of rows) { min = Math.min(min, r.low); max = Math.max(max, r.high); maxVol = Math.max(maxVol, r.volume || 0); }
    for (const b of bands) { min = Math.min(min, b.ibLow); max = Math.max(max, b.ibHigh); }
    const spread = max - min || 1;

    const xStep = (PR - PL) / n;
    const xLeft = (i: number) => PL + (i - off) * xStep;   // left edge of slot i
    const xMid = (i: number) => xLeft(i) + xStep / 2;
    const y = (v: number) => PT + (1 - (v - min) / spread) * (PB - PT);
    const vy = (v: number) => VB - ((v || 0) / maxVol) * (VB - VT);

    const last = rows[rows.length - 1];
    const current = bands[bands.length - 1] || null;
    return { rows, off, bands, xStep, xLeft, xMid, y, vy, last, current };
  }, [showIb, allRows, sessions]);

  if (!showIb) return null;

  if (!view) {
    return (
      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={KICKER}>IBH / IBL · INITIAL BALANCE</span>
          <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".08em", color: GOLD, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px" }}>CUSTOM</span>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5, margin: 0 }}>
          No local OHLCV history for {symbol || "this symbol"} to draw the Initial-Balance band. The TradingView chart above is unaffected — turn the overlay off in ƒx to hide this panel.
        </p>
      </div>
    );
  }

  const { rows, bands, xStep, xLeft, xMid, y, vy, last, current } = view;
  const cw = Math.max(1, xStep * 0.62);

  return (
    <div style={CARD}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={KICKER}>IBH / IBL · INITIAL BALANCE</span>
        <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".08em", color: GOLD, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px" }}>CUSTOM · OUR CHART</span>
        <span style={{ fontSize: 10, color: "var(--faint)" }}>first 2 sessions of each month, then locked</span>
        <div style={{ flex: 1 }} />
        {last ? <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)" }}><strong style={{ color: "var(--text)" }}>{formatPrice(last.close)}</strong> · {String(last.date)}</span> : null}
      </div>

      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ height: "auto", display: "block" }} role="img" aria-label={`${symbol || ""} candles with IBH/IBL initial-balance bands`}>
        {/* gridlines */}
        {[0, 1, 2, 3, 4].map((g) => { const yy = PT + (g / 4) * (PB - PT); return <line key={g} x1={PL} x2={PR} y1={yy} y2={yy} stroke="var(--hair, rgba(148,163,184,.18))" strokeWidth="1" />; })}

        {/* IB bands (drawn under candles) */}
        {bands.map((b) => {
          const x0 = xLeft(b.vStart), x1 = xLeft(b.vEnd) + xStep;
          const yh = y(b.ibHigh), yl = y(b.ibLow);
          return (
            <g key={b.monthKey}>
              <rect x={x0} y={yh} width={Math.max(0, x1 - x0)} height={Math.max(0, yl - yh)} fill="rgba(214,161,0,.12)" />
              <line x1={x0} x2={x1} y1={yh} y2={yh} stroke={GOLD} strokeWidth="1.4" />
              <line x1={x0} x2={x1} y1={yl} y2={yl} stroke={GOLD} strokeWidth="1.4" />
            </g>
          );
        })}

        {/* current-month IB levels extended to the right + tags */}
        {current ? (() => {
          const yh = y(current.ibHigh), yl = y(current.ibLow);
          const xr = xLeft(current.vEnd) + xStep;
          return (
            <g>
              <line x1={xr} x2={PR} y1={yh} y2={yh} stroke={GOLD} strokeWidth="1.2" strokeDasharray="5 4" />
              <line x1={xr} x2={PR} y1={yl} y2={yl} stroke={GOLD} strokeWidth="1.2" strokeDasharray="5 4" />
              <text x={PR + 6} y={yh + 3.5} fill={GOLD} fontSize="12" fontFamily="var(--font-mono)" fontWeight={700}>IBH {formatPrice(current.ibHigh)}</text>
              <text x={PR + 6} y={yl + 3.5} fill={GOLD} fontSize="12" fontFamily="var(--font-mono)" fontWeight={700}>IBL {formatPrice(current.ibLow)}</text>
            </g>
          );
        })() : null}

        {/* candles + volume */}
        {rows.map((r, k) => {
          const i = view.off + k;
          const x = xMid(i);
          const up = r.close >= r.open;
          const col = up ? "var(--up, var(--positive))" : "var(--down, var(--negative))";
          const yo = y(r.open), yc = y(r.close);
          const top = Math.min(yo, yc);
          const h = Math.max(1.2, Math.abs(yo - yc));
          return (
            <g key={r.date}>
              <line x1={x} x2={x} y1={y(r.high)} y2={y(r.low)} stroke={col} strokeWidth="1.2" />
              <rect x={x - cw / 2} y={top} width={cw} height={h} fill={col} />
              <rect x={x - cw / 2} y={vy(r.volume)} width={cw} height={VB - vy(r.volume)} fill="rgba(148,163,184,.42)" />
            </g>
          );
        })}
      </svg>

      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 10, lineHeight: 1.5 }}>
        Initial Balance = the high–low range of each month&apos;s first 2 trading sessions, held for the rest of the month (TSR × BuayaSerpong, Pine v6). Computed here from our published daily EOD bars — the dashed levels are the current month&apos;s IBH/IBL. Latest {rows.length} sessions.
      </div>
    </div>
  );
}
