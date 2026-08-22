"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { OhlcvPayload } from "@/lib/domain/types";
import { loadOverlays, subscribeOverlays, loadVwapAnchor, saveVwapAnchor, subscribeVwapAnchor } from "@/lib/data/chartOverlays";
import { computeInitialBalance } from "@/lib/indicators/initialBalance";
import { computeMacd4c, MACD4C_COLORS } from "@/lib/indicators/macd4c";
import { computeAnchoredVwap, periodLabel, VWAP_ANCHORS, type VwapAnchor } from "@/lib/indicators/anchoredVwap";
import { formatPrice } from "@/lib/format/number";

// Companion chart for custom overlays that can't run in the TradingView embed
// (Pine only executes on tradingview.com). Renders NOTHING until a custom overlay
// is switched on in the ƒx picker, then draws our own candles from published
// OHLCV with each overlay stacked in its pane. Honest about gaps: no bars ⇒ an
// explicit note, never a fabricated series.

const MONO = "var(--font-mono)";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r, 12px)", boxShadow: "var(--sh, var(--shadow))", padding: "14px 16px", marginBottom: 14 };
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const GOLD = "#D6A100";

// Shared horizontal geometry (uniform scale — width:100% keeps text proportional).
const VW = 1000, PL = 8, GUTTER = 74, PR = VW - GUTTER;
// price pane
const PT = 14, PRICE_B = 206, VOL_T = 214, VOL_B = 248;
const GAP = 16;
// oscillator pane
const OSC_H = 150;

function chip(label: string, color: string): CSSProperties {
  return { fontSize: 8.5, fontWeight: 800, letterSpacing: ".06em", color, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px" };
}

export function IndicatorCompanion({ ohlcv, symbol, sessions = 140 }: { ohlcv: OhlcvPayload | null; symbol?: string; sessions?: number }) {
  const [overlays, setOverlays] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string>("quarter");
  useEffect(() => {
    setOverlays(loadOverlays());
    return subscribeOverlays(setOverlays);
  }, []);
  useEffect(() => {
    setAnchor(loadVwapAnchor());
    return subscribeVwapAnchor(setAnchor);
  }, []);

  const hasIb = overlays.includes("ibhl");
  const hasMacd = overlays.includes("macd4c");
  const hasVwap = overlays.includes("avwap");
  const anyOn = hasIb || hasMacd || hasVwap;
  const allRows = ohlcv?.rows ?? [];

  const view = useMemo(() => {
    if (!anyOn || allRows.length < 2) return null;
    const n = Math.min(allRows.length, Math.max(20, sessions));
    const off = allRows.length - n;
    const rows = allRows.slice(off);

    // IB bands over the full series, clipped to the visible window.
    const bands = hasIb
      ? computeInitialBalance(allRows, 2)
          .map((b) => ({ ...b, vStart: Math.max(b.startIdx, off), vEnd: Math.min(b.endIdx, allRows.length - 1) }))
          .filter((b) => b.vEnd >= off)
      : [];

    // MACD over the full series (EMA warmup), visible slice only.
    const macd = hasMacd ? computeMacd4c(allRows).slice(off) : [];

    // Anchored VWAP over the full series; split the visible window into per-period
    // segments so the line + bands break (reset) at each anchor boundary.
    const vw = hasVwap ? computeAnchoredVwap(allRows, anchor as VwapAnchor) : null;
    const vwapVis = vw ? vw.points.slice(off) : [];
    const vwapSegs: Array<{ key: string; pts: Array<{ i: number; p: NonNullable<typeof vwapVis[number]> }> }> = [];
    if (vw) {
      let seg: (typeof vwapSegs)[number] | null = null;
      vwapVis.forEach((p, k) => {
        if (!p) { seg = null; return; }
        if (!seg || seg.key !== p.key) { seg = { key: p.key, pts: [] }; vwapSegs.push(seg); }
        seg.pts.push({ i: off + k, p });
      });
    }
    const vwapCurrent = [...vwapVis].reverse().find((p) => p) || null;

    let min = Infinity, max = -Infinity, maxVol = 1;
    for (const r of rows) { min = Math.min(min, r.low); max = Math.max(max, r.high); maxVol = Math.max(maxVol, r.volume || 0); }
    for (const b of bands) { min = Math.min(min, b.ibLow); max = Math.max(max, b.ibHigh); }
    for (const p of vwapVis) { if (p) { min = Math.min(min, p.l2); max = Math.max(max, p.u2); } }
    const spread = max - min || 1;

    const xStep = (PR - PL) / n;
    const xLeft = (i: number) => PL + (i - off) * xStep;
    const xMid = (i: number) => xLeft(i) + xStep / 2;
    const yP = (v: number) => PT + (1 - (v - min) / spread) * (PRICE_B - PT);
    const vy = (v: number) => VOL_B - ((v || 0) / maxVol) * (VOL_B - VOL_T);

    // MACD pane mapping
    const macdTop = PRICE_B + 42 + GAP;         // below the volume strip
    const macdBottom = macdTop + OSC_H;
    let mmin = 0, mmax = 0;
    for (const p of macd) { mmin = Math.min(mmin, p.macd, p.signal, p.hist); mmax = Math.max(mmax, p.macd, p.signal, p.hist); }
    const mspread = mmax - mmin || 1;
    const oscTop = macdTop + 12, oscBot = macdBottom - 12;
    const yM = (v: number) => oscTop + (1 - (v - mmin) / mspread) * (oscBot - oscTop);

    const VH = (hasMacd ? macdBottom : (PRICE_B + 42)) + 8;
    const last = rows[rows.length - 1];
    const current = bands[bands.length - 1] || null;
    const lastMacd = macd[macd.length - 1] || null;
    return { rows, off, bands, macd, xStep, xLeft, xMid, yP, vy, yM, VH, macdTop, macdBottom, last, current, lastMacd, vwapSegs, vwapCurrent, vwapPrevFinal: vw?.prevFinalVwap ?? null, vwapKey: vw?.currentKey ?? null };
  }, [anyOn, hasIb, hasMacd, hasVwap, anchor, allRows, sessions]);

  if (!anyOn) return null;

  if (!view) {
    return (
      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={KICKER}>CUSTOM OVERLAYS</span>
          <span style={chip("CUSTOM", GOLD)}>CUSTOM</span>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5, margin: 0 }}>
          No local OHLCV history for {symbol || "this symbol"} to draw the enabled overlay. The TradingView chart above is unaffected — turn the overlay off in ƒx to hide this panel.
        </p>
      </div>
    );
  }

  const { rows, bands, xStep, xLeft, xMid, yP, vy, yM, VH, macdTop, current, last, lastMacd, vwapSegs, vwapCurrent, vwapPrevFinal, vwapKey } = view;
  const cw = Math.max(1, xStep * 0.62);
  const macdPts = view.macd.map((p, k) => `${xMid(view.off + k)},${yM(p.macd)}`).join(" ");
  const sigPts = view.macd.map((p, k) => `${xMid(view.off + k)},${yM(p.signal)}`).join(" ");
  const pct = (v: number) => (last && last.close ? `${v >= last.close ? "+" : ""}${(((v - last.close) / last.close) * 100).toFixed(2)}%` : "");
  const rightX = view.xLeft(rows.length - 1 + view.off) + xStep; // right edge of the last candle slot
  const vwapAnchorLabel = periodLabel(vwapKey, anchor as VwapAnchor);

  return (
    <div style={CARD}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={KICKER}>CUSTOM OVERLAYS</span>
        <span style={chip("OUR CHART", GOLD)}>OUR CHART</span>
        {hasIb ? <span style={chip("IBH / IBL", GOLD)}>IBH / IBL</span> : null}
        {hasMacd ? <span style={chip("MACD 4C", "#2962FF")}>MACD 4C</span> : null}
        {hasVwap ? <span style={chip("VWAP", "#2962FF")}>A-VWAP{vwapAnchorLabel ? ` · ${vwapAnchorLabel}` : ""}</span> : null}
        {hasVwap ? (
          <div style={{ display: "flex", gap: 2, background: "var(--soft)", borderRadius: 7, padding: 2 }}>
            {VWAP_ANCHORS.map((a) => (
              <button key={a.id} type="button" title={`Anchor VWAP ${a.label}`} onClick={() => { setAnchor(a.id); saveVwapAnchor(a.id); }}
                style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 5, border: "none", cursor: "pointer", background: anchor === a.id ? "#2962FF" : "transparent", color: anchor === a.id ? "#fff" : "var(--muted)" }}>{a.short}</button>
            ))}
          </div>
        ) : null}
        <div style={{ flex: 1 }} />
        {last ? <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)" }}><strong style={{ color: "var(--text)" }}>{formatPrice(last.close)}</strong> · {String(last.date)}</span> : null}
      </div>

      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ height: "auto", display: "block" }} role="img" aria-label={`${symbol || ""} companion chart with custom overlays`}>
        {/* price gridlines */}
        {[0, 1, 2, 3, 4].map((g) => { const yy = PT + (g / 4) * (PRICE_B - PT); return <line key={g} x1={PL} x2={PR} y1={yy} y2={yy} stroke="var(--hair, rgba(148,163,184,.18))" strokeWidth="1" />; })}

        {/* IB bands under the candles */}
        {bands.map((b) => {
          const x0 = xLeft(b.vStart), x1 = xLeft(b.vEnd) + xStep;
          const yh = yP(b.ibHigh), yl = yP(b.ibLow);
          return (
            <g key={b.monthKey}>
              <rect x={x0} y={yh} width={Math.max(0, x1 - x0)} height={Math.max(0, yl - yh)} fill="rgba(214,161,0,.12)" />
              <line x1={x0} x2={x1} y1={yh} y2={yh} stroke={GOLD} strokeWidth="1.4" />
              <line x1={x0} x2={x1} y1={yl} y2={yl} stroke={GOLD} strokeWidth="1.4" />
            </g>
          );
        })}

        {/* current-month IB levels extended + tags */}
        {current ? (() => {
          const yh = yP(current.ibHigh), yl = yP(current.ibLow);
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

        {/* Anchored-VWAP σ bands + period boundaries (under candles) */}
        {hasVwap ? vwapSegs.slice(1).map((seg) => { const x = xLeft(seg.pts[0].i); return <line key={`vb-${seg.key}`} x1={x} x2={x} y1={PT} y2={PRICE_B} stroke="var(--hair, rgba(148,163,184,.28))" strokeWidth="1" strokeDasharray="3 3" />; }) : null}
        {hasVwap ? vwapSegs.map((seg) => {
          const up2 = seg.pts.map(({ i, p }) => `${xMid(i)},${yP(p.u2)}`);
          const lo2 = seg.pts.map(({ i, p }) => `${xMid(i)},${yP(p.l2)}`);
          const up1 = seg.pts.map(({ i, p }) => `${xMid(i)},${yP(p.u1)}`);
          const lo1 = seg.pts.map(({ i, p }) => `${xMid(i)},${yP(p.l1)}`);
          return (
            <g key={`vw-${seg.key}`}>
              <polygon points={up2.concat(lo2.slice().reverse()).join(" ")} fill="rgba(41,98,255,.05)" />
              <polygon points={up1.concat(lo1.slice().reverse()).join(" ")} fill="rgba(41,98,255,.10)" />
              <polyline points={up1.join(" ")} fill="none" stroke="rgba(22,163,74,.5)" strokeWidth="0.8" />
              <polyline points={lo1.join(" ")} fill="none" stroke="rgba(22,163,74,.5)" strokeWidth="0.8" />
              <polyline points={up2.join(" ")} fill="none" stroke="rgba(8,145,178,.45)" strokeWidth="0.8" />
              <polyline points={lo2.join(" ")} fill="none" stroke="rgba(8,145,178,.45)" strokeWidth="0.8" />
            </g>
          );
        }) : null}

        {/* candles + volume */}
        {rows.map((r, k) => {
          const i = view.off + k;
          const x = xMid(i);
          const up = r.close >= r.open;
          const col = up ? "var(--up, var(--positive))" : "var(--down, var(--negative))";
          const yo = yP(r.open), yc = yP(r.close);
          const top = Math.min(yo, yc);
          const h = Math.max(1.2, Math.abs(yo - yc));
          return (
            <g key={r.date}>
              <line x1={x} x2={x} y1={yP(r.high)} y2={yP(r.low)} stroke={col} strokeWidth="1.2" />
              <rect x={x - cw / 2} y={top} width={cw} height={h} fill={col} />
              <rect x={x - cw / 2} y={vy(r.volume)} width={cw} height={VOL_B - vy(r.volume)} fill="rgba(148,163,184,.42)" />
            </g>
          );
        })}

        {/* Anchored-VWAP centre line (on top) + current-period levels */}
        {hasVwap ? vwapSegs.map((seg) => (
          <polyline key={`vl-${seg.key}`} points={seg.pts.map(({ i, p }) => `${xMid(i)},${yP(p.vwap)}`).join(" ")} fill="none" stroke="#2962FF" strokeWidth="1.7" />
        )) : null}
        {hasVwap && vwapPrevFinal != null ? (
          <g>
            <line x1={PL} x2={PR} y1={yP(vwapPrevFinal)} y2={yP(vwapPrevFinal)} stroke="var(--faint, #94a3b8)" strokeWidth="1" strokeDasharray="2 4" opacity={0.7} />
            <text x={PR + 6} y={yP(vwapPrevFinal) - 2} fill="var(--faint)" fontSize="10.5" fontFamily="var(--font-mono)" fontWeight={700}>PQVWAP {formatPrice(vwapPrevFinal)}</text>
          </g>
        ) : null}
        {hasVwap && vwapCurrent ? (() => {
          const vlabels: Array<[string, number, string]> = [
            ["VWAP", vwapCurrent.vwap, "#2962FF"],
            ["+1σ", vwapCurrent.u1, "#16A34A"],
            ["+2σ", vwapCurrent.u2, "#0891B2"],
            ["−1σ", vwapCurrent.l1, "#16A34A"],
            ["−2σ", vwapCurrent.l2, "#0891B2"],
          ];
          return (
            <g>
              {vlabels.map(([lab, val, col]) => (
                <g key={lab}>
                  <line x1={rightX} x2={PR} y1={yP(val)} y2={yP(val)} stroke={col} strokeWidth="1" strokeDasharray="4 3" opacity={0.85} />
                  <text x={PR + 6} y={yP(val) + 3.5} fill={col} fontSize="11" fontFamily="var(--font-mono)" fontWeight={700}>{lab} {formatPrice(val)} · {pct(val)}</text>
                </g>
              ))}
            </g>
          );
        })() : null}

        {/* ── MACD 4C oscillator sub-pane ─────────────────────────── */}
        {hasMacd ? (
          <g>
            <text x={PL} y={macdTop - 2} fill="var(--faint)" fontSize="11" fontWeight={700} letterSpacing=".08em">MACD 4C · 12·26·9</text>
            <line x1={PL} x2={PR} y1={yM(0)} y2={yM(0)} stroke="var(--hair, rgba(148,163,184,.3))" strokeWidth="1" />
            {view.macd.map((p, k) => {
              const x = xMid(view.off + k);
              const y0 = yM(0), yh = yM(p.hist);
              return <rect key={k} x={x - cw / 2} y={Math.min(y0, yh)} width={cw} height={Math.max(0.6, Math.abs(yh - y0))} fill={MACD4C_COLORS[p.color]} />;
            })}
            <polyline points={macdPts} fill="none" stroke="#2962FF" strokeWidth="1.4" />
            <polyline points={sigPts} fill="none" stroke="#F23645" strokeWidth="1.4" />
            {lastMacd ? (
              <text x={PR + 6} y={yM(lastMacd.macd) + 3.5} fill="#2962FF" fontSize="11" fontFamily="var(--font-mono)" fontWeight={700}>MACD {lastMacd.macd.toFixed(1)}</text>
            ) : null}
            {lastMacd ? (
              <text x={PR + 6} y={yM(lastMacd.signal) + 3.5} fill="#F23645" fontSize="11" fontFamily="var(--font-mono)" fontWeight={700}>SIG {lastMacd.signal.toFixed(1)}</text>
            ) : null}
          </g>
        ) : null}
      </svg>

      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 10, lineHeight: 1.5 }}>
        {hasIb ? <>Initial Balance = the high–low range of each month&apos;s first 2 trading sessions, held for the rest of the month (dashed = current month&apos;s IBH/IBL). </> : null}
        {hasMacd ? <>MACD 4C: EMA 12/26 with a signal-9 line and EMA-3 smoothed histogram — silver ≥0 rising, red ≥0 falling, bright-red &lt;0 falling, blue &lt;0 rising. </> : null}
        {hasVwap ? <>Anchored VWAP on hlc3·volume, reset each {({ week: "week", month: "month", quarter: "quarter", year: "year" } as Record<string, string>)[anchor] || "period"} (vertical dashes = anchor resets), with ±1σ/±2σ bands; PQVWAP = the previous period&apos;s closing VWAP. Right-axis % is distance from last close. </> : null}
        Computed from our published daily EOD bars. Latest {rows.length} sessions.
      </div>
    </div>
  );
}
