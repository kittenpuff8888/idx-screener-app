"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries,
  LineStyle, LineType, CrosshairMode,
  type IChartApi, type Time, type MouseEventParams,
} from "lightweight-charts";
import type { OhlcvPayload } from "@/lib/domain/types";
import { loadVwapAnchor, saveVwapAnchor, subscribeVwapAnchor } from "@/lib/data/chartOverlays";
import { computeInitialBalance, type IbBand } from "@/lib/indicators/initialBalance";
import { computeAnchoredVwap, periodLabel, VWAP_ANCHORS, type VwapAnchor, type AvwapPoint } from "@/lib/indicators/anchoredVwap";
import { formatPrice, formatCompact } from "@/lib/format/number";

// Companion chart for the two custom overlays that can't run in the
// TradingView embed (Pine only executes on tradingview.com): monthly
// Initial Balance (IBH/IBL) and Anchored VWAP + σ bands. Always drawn, for
// every ticker — no on/off toggle (the ƒx picker on the price chart above
// controls TradingView's own built-in studies only). Built on TradingView's
// own lightweight-charts engine — same panning, zoom, and hover-legend feel
// as the embed. Honest about gaps: no bars ⇒ an explicit note, never a
// fabricated series.

const MONO = "var(--font-mono)";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r, 12px)", boxShadow: "var(--sh, var(--shadow))", padding: "14px 16px", marginBottom: 14 };
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const GOLD = "#D6A100";
const VWAP_BLUE = "#2962FF";
const VWAP_GREEN = "#16A34A";
const VWAP_CYAN = "#0891B2";

// Caps series count for very long histories under a fine anchor (e.g. weekly
// VWAP over years, or IB bands over many years) — keeps the chart responsive
// without silently truncating the visible-by-default window.
const MAX_VWAP_SEGMENTS = 60;
const MAX_IB_BANDS = 48;

function chip(label: string, color: string): CSSProperties {
  return { fontSize: 8.5, fontWeight: 800, letterSpacing: ".06em", color, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px" };
}

// Canvas rendering needs literal colors, not CSS var() references — resolve
// the site's theme tokens once per (re)build so the chart matches light/dark.
function themeColors() {
  const cs = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const v = (name: string, fallback: string) => (cs?.getPropertyValue(name).trim() || fallback);
  const dark = typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
  return {
    bg: v("--panel", dark ? "#11151b" : "#ffffff"),
    text: v("--text", dark ? "#e6e9ef" : "#0b0e14"),
    muted: v("--muted", dark ? "#9aa4b2" : "#5b6472"),
    faint: v("--faint", "#94a3b8"),
    border: v("--border", "rgba(148,163,184,.24)"),
    hair: v("--hair", "rgba(148,163,184,.16)"),
    up: v("--up", "#16a34a"),
    down: v("--down", "#dc2626"),
  };
}

// "{label} · {price} · {±pct}% from close" — matches every price-line title
// on the companion chart (IBH/IBL, current + previous VWAP bands).
function lineTitle(label: string, price: number, close: number | null): string {
  if (close == null || close === 0) return `${label} · ${formatPrice(price)}`;
  const pct = ((price - close) / close) * 100;
  return `${label} · ${formatPrice(price)} · ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

type Legend = { date: string; o: number; h: number; l: number; c: number; vol: number; ib: IbBand | null; vwap: AvwapPoint | null };

export function IndicatorCompanion({ ohlcv, symbol, sessions = 140 }: { ohlcv: OhlcvPayload | null; symbol?: string; sessions?: number }) {
  const [anchor, setAnchor] = useState<string>("quarter");
  const [legend, setLegend] = useState<Legend | null>(null);
  const [themeTick, setThemeTick] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => { setAnchor(loadVwapAnchor()); return subscribeVwapAnchor(setAnchor); }, []);
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick((t) => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const rows = ohlcv?.rows;
  const priceHeight = 340;

  // Label-only metadata for the header badge — cheap to recompute separately
  // from the imperative chart build below, which needs the same call anyway.
  const vwapKeyLabel = useMemo(() => {
    if (!rows || rows.length < 5) return "";
    return periodLabel(computeAnchoredVwap(rows, anchor as VwapAnchor).currentKey, anchor as VwapAnchor);
  }, [rows, anchor]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !rows || rows.length < 2) { setLegend(null); return; }

    const colors = themeColors();
    const close = rows[rows.length - 1].close;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: colors.bg }, textColor: colors.muted, panes: { separatorColor: colors.hair, separatorHoverColor: colors.border } },
      grid: { vertLines: { color: colors.hair }, horzLines: { color: colors.hair } },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border, rightOffset: 3 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.faint, width: 1, style: LineStyle.Dashed, labelBackgroundColor: colors.muted },
        horzLine: { color: colors.faint, width: 1, style: LineStyle.Dashed, labelBackgroundColor: colors.muted },
      },
    });
    chartRef.current = chart;

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: colors.up, downColor: colors.down, borderVisible: false, wickUpColor: colors.up, wickDownColor: colors.down,
    });
    candles.setData(rows.map((r) => ({ time: r.date as Time, open: r.open, high: r.high, low: r.low, close: r.close })));

    const volume = chart.addSeries(HistogramSeries, { priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
    volume.setData(rows.map((r) => ({ time: r.date as Time, value: r.volume || 0, color: r.close >= r.open ? "rgba(22,163,74,.35)" : "rgba(220,38,38,.35)" })));

    // ── Initial Balance bands — one short 2-point step line per month so
    //    each period's band draws independently (no cross-month connector). ──
    const bands: IbBand[] = computeInitialBalance(rows, 2).slice(-MAX_IB_BANDS);
    bands.forEach((b, bi) => {
      const start = rows[b.startIdx]?.date, end = rows[Math.min(b.endIdx, rows.length - 1)]?.date;
      if (!start || !end) return;
      const isLast = bi === bands.length - 1;
      const color = isLast ? GOLD : "rgba(214,161,0,.5)";
      const hi = chart.addSeries(LineSeries, { color, lineWidth: isLast ? 2 : 1, lineType: LineType.WithSteps, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: isLast, title: isLast ? "IBH" : "" });
      const lo = chart.addSeries(LineSeries, { color, lineWidth: isLast ? 2 : 1, lineType: LineType.WithSteps, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: isLast, title: isLast ? "IBL" : "" });
      hi.setData([{ time: start as Time, value: b.ibHigh }, { time: end as Time, value: b.ibHigh }]);
      lo.setData([{ time: start as Time, value: b.ibLow }, { time: end as Time, value: b.ibLow }]);
      if (isLast) {
        hi.createPriceLine({ price: b.ibHigh, color: GOLD, lineWidth: 1, lineStyle: LineStyle.Dashed, title: lineTitle("Monthly IBH ~ IBL:IB High", b.ibHigh, close), axisLabelVisible: true });
        lo.createPriceLine({ price: b.ibLow, color: GOLD, lineWidth: 1, lineStyle: LineStyle.Dashed, title: lineTitle("Monthly IBH ~ IBL:IB Low", b.ibLow, close), axisLabelVisible: true });
      }
    });

    // ── Anchored VWAP — one center-line series per anchor period (breaks
    //    naturally at resets); current period gets ±1σ/±2σ price-line labels,
    //    the previous period gets center + ±1σ (matching a classic AVWAP
    //    reference layout: QVWAP/±1σ/±2σ for "now", PQVWAP/P±1σ for "prior"). ──
    const vw = computeAnchoredVwap(rows, anchor as VwapAnchor);
    const segs: Array<{ key: string; idxs: number[] }> = [];
    vw.points.forEach((p, i) => {
      if (!p) return;
      const last = segs[segs.length - 1];
      if (!last || last.key !== p.key) segs.push({ key: p.key, idxs: [i] });
      else last.idxs.push(i);
    });
    const visSegs = segs.slice(-MAX_VWAP_SEGMENTS);
    visSegs.forEach((seg, si) => {
      const isCurrent = si === visSegs.length - 1;
      const isPrevious = si === visSegs.length - 2;
      const center = chart.addSeries(LineSeries, {
        color: isCurrent ? VWAP_BLUE : "rgba(41,98,255,.4)", lineWidth: isCurrent ? 2 : 1,
        crosshairMarkerVisible: isCurrent, lastValueVisible: isCurrent, priceLineVisible: false, title: isCurrent ? "VWAP" : "",
      });
      center.setData(seg.idxs.map((i) => ({ time: rows[i].date as Time, value: (vw.points[i] as AvwapPoint).vwap })));
      const lastPt = vw.points[seg.idxs[seg.idxs.length - 1]] as AvwapPoint;
      const periodLbl = periodLabel(seg.key, anchor as VwapAnchor);
      if (isCurrent) {
        center.createPriceLine({ price: lastPt.vwap, color: VWAP_BLUE, lineWidth: 1, lineStyle: LineStyle.Dotted, title: lineTitle("QVWAP", lastPt.vwap, close), axisLabelVisible: true });
        const band = (color: string, price: number, title: string) => {
          const s = chart.addSeries(LineSeries, { color, lineWidth: 1, lineStyle: LineStyle.Dashed, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false });
          s.setData(seg.idxs.map((i) => ({ time: rows[i].date as Time, value: (vw.points[i] as AvwapPoint)[title.includes("+1") ? "u1" : title.includes("−1") ? "l1" : title.includes("+2") ? "u2" : "l2"] })));
          s.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, title: lineTitle(title, price, close), axisLabelVisible: true });
        };
        band(VWAP_GREEN, lastPt.u1, "+1σ"); band(VWAP_GREEN, lastPt.l1, "−1σ");
        band(VWAP_CYAN, lastPt.u2, "+2σ"); band(VWAP_CYAN, lastPt.l2, "−2σ");
      } else if (isPrevious) {
        center.createPriceLine({ price: lastPt.vwap, color: colors.faint, lineWidth: 1, lineStyle: LineStyle.Dotted, title: lineTitle(`P${periodLbl || "Q"}VWAP`, lastPt.vwap, close), axisLabelVisible: true });
        center.createPriceLine({ price: lastPt.u1, color: colors.faint, lineWidth: 1, lineStyle: LineStyle.Dotted, title: lineTitle("P +1σ", lastPt.u1, close), axisLabelVisible: true });
        center.createPriceLine({ price: lastPt.l1, color: colors.faint, lineWidth: 1, lineStyle: LineStyle.Dotted, title: lineTitle("P −1σ", lastPt.l1, close), axisLabelVisible: true });
      }
    });

    // ── Initial view: last `sessions` bars, fully pannable/zoomable beyond it. ──
    const fromIdx = Math.max(0, rows.length - sessions);
    const initialRange = { from: rows[fromIdx].date as Time, to: rows[rows.length - 1].date as Time };
    chart.timeScale().setVisibleRange(initialRange);

    // ── Live hover legend — TradingView-style readout that updates with the
    //    crosshair; defaults to the last bar when the pointer isn't over the chart. ──
    const legendAt = (idx: number): Legend => {
      const r = rows[idx];
      const ib = bands.find((b) => idx >= b.startIdx && idx <= Math.min(b.endIdx, rows.length - 1)) ?? null;
      return { date: r.date, o: r.open, h: r.high, l: r.low, c: r.close, vol: r.volume, ib, vwap: vw.points[idx] ?? null };
    };
    setLegend(legendAt(rows.length - 1));
    const onMove = (param: MouseEventParams) => {
      if (param.logical == null) { setLegend(legendAt(rows.length - 1)); return; }
      setLegend(legendAt(Math.max(0, Math.min(rows.length - 1, Math.round(param.logical)))));
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      chart.remove();
      chartRef.current = null;
    };
  }, [anchor, rows, sessions, themeTick]);

  if (!rows || rows.length < 2) {
    return (
      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={KICKER}>CUSTOM OVERLAYS</span>
          <span style={chip("CUSTOM", GOLD)}>CUSTOM</span>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5, margin: 0 }}>
          No local OHLCV history for {symbol || "this symbol"} to draw IBH/IBL and Anchored VWAP.
        </p>
      </div>
    );
  }

  const up = legend ? legend.c >= legend.o : true;
  const priceCol = up ? "var(--up)" : "var(--down)";

  return (
    <div style={CARD}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={KICKER}>CUSTOM OVERLAYS</span>
        <span style={chip("IBH / IBL", GOLD)}>IBH / IBL</span>
        <span style={chip("VWAP", VWAP_BLUE)}>A-VWAP{vwapKeyLabel ? ` · ${vwapKeyLabel}` : ""}</span>
        <div style={{ display: "flex", gap: 2, background: "var(--soft)", borderRadius: 7, padding: 2 }}>
          {VWAP_ANCHORS.map((a) => (
            <button key={a.id} type="button" title={`Anchor VWAP ${a.label}`} onClick={() => { setAnchor(a.id); saveVwapAnchor(a.id); }}
              style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 5, border: "none", cursor: "pointer", background: anchor === a.id ? VWAP_BLUE : "transparent", color: anchor === a.id ? "#fff" : "var(--muted)" }}>{a.short}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => chartRef.current?.timeScale().fitContent()} title="Fit all history"
          style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 7, padding: "3px 9px", cursor: "pointer" }}>⤢ Fit</button>
        <button type="button" onClick={() => { const fromIdx = Math.max(0, rows.length - sessions); const range = { from: rows[fromIdx].date as Time, to: rows[rows.length - 1].date as Time }; chartRef.current?.timeScale().setVisibleRange(range); }} title="Reset zoom"
          style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 7, padding: "3px 9px", cursor: "pointer" }}>↺ Reset</button>
      </div>

      {/* Live legend — mirrors the embed's own hover readout; updates with the crosshair. */}
      {legend ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 14px", fontFamily: MONO, fontSize: 11, marginBottom: 8, color: "var(--muted)" }}>
          <span style={{ color: "var(--faint)" }}>{legend.date}</span>
          <span style={{ color: priceCol }}>O {formatPrice(legend.o)} H {formatPrice(legend.h)} L {formatPrice(legend.l)} C {formatPrice(legend.c)}</span>
          <span>Vol {formatCompact(legend.vol)}</span>
          {legend.ib ? <span style={{ color: GOLD }}>IBH {formatPrice(legend.ib.ibHigh)} IBL {formatPrice(legend.ib.ibLow)}</span> : null}
          {legend.vwap ? (
            <span>
              <span style={{ color: VWAP_BLUE }}>VWAP {formatPrice(legend.vwap.vwap)}</span>{" "}
              <span style={{ color: VWAP_GREEN }}>±1σ {formatPrice(legend.vwap.l1)}–{formatPrice(legend.vwap.u1)}</span>{" "}
              <span style={{ color: VWAP_CYAN }}>±2σ {formatPrice(legend.vwap.l2)}–{formatPrice(legend.vwap.u2)}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div ref={containerRef} style={{ width: "100%", height: priceHeight, borderRadius: 8, overflow: "hidden" }} />

      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 10, lineHeight: 1.5 }}>
        Initial Balance = the high–low range of each month&apos;s first 2 trading sessions, held for the rest of the month (bright gold = current month). Anchored VWAP on hlc3·volume, reset each {({ week: "week", month: "month", quarter: "quarter", year: "year" } as Record<string, string>)[anchor] || "period"} (each period is its own line, breaking cleanly at the reset), with ±1σ/±2σ bands for the current period and center/±1σ for the previous one — every label shows price and % from the latest close.
        Computed from our published daily EOD bars, {rows.length} sessions total — drag to pan, scroll/pinch to zoom, hover for the readout above.
      </div>
    </div>
  );
}
