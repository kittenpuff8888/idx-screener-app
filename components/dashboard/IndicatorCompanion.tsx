"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  createChart, CandlestickSeries, HistogramSeries, LineSeries,
  LineStyle, LineType, CrosshairMode,
  type IChartApi, type Time, type MouseEventParams,
} from "lightweight-charts";
import type { OhlcvPayload } from "@/lib/domain/types";
import { loadOverlays, subscribeOverlays, loadVwapAnchor, saveVwapAnchor, subscribeVwapAnchor } from "@/lib/data/chartOverlays";
import { computeInitialBalance, type IbBand } from "@/lib/indicators/initialBalance";
import { computeMacd4c, MACD4C_COLORS, type Macd4cPoint } from "@/lib/indicators/macd4c";
import { computeAnchoredVwap, periodLabel, VWAP_ANCHORS, type VwapAnchor, type AvwapPoint } from "@/lib/indicators/anchoredVwap";
import { formatPrice, formatCompact } from "@/lib/format/number";

// Companion chart for custom overlays that can't run in the TradingView embed
// (Pine only executes on tradingview.com). Renders NOTHING until a custom
// overlay is switched on in the ƒx picker. Built on TradingView's own
// lightweight-charts engine — same panning, zoom, and hover-legend feel as
// the embed above it, even though the indicators are our own re-implementation
// drawn over our own published OHLCV JSON. Honest about gaps: no bars ⇒ an
// explicit note, never a fabricated series.

const MONO = "var(--font-mono)";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r, 12px)", boxShadow: "var(--sh, var(--shadow))", padding: "14px 16px", marginBottom: 14 };
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const GOLD = "#D6A100";
const VWAP_BLUE = "#2962FF";
const VWAP_GREEN = "#16A34A";
const VWAP_CYAN = "#0891B2";
const MACD_BLUE = "#2962FF";
const MACD_RED = "#F23645";

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

type Legend = {
  date: string; o: number; h: number; l: number; c: number; vol: number;
  ib: IbBand | null; vwap: AvwapPoint | null; macd: Macd4cPoint | null;
};

export function IndicatorCompanion({ ohlcv, symbol, sessions = 140 }: { ohlcv: OhlcvPayload | null; symbol?: string; sessions?: number }) {
  const [overlays, setOverlays] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string>("quarter");
  const [legend, setLegend] = useState<Legend | null>(null);
  const [themeTick, setThemeTick] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const macdContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);

  useEffect(() => { setOverlays(loadOverlays()); return subscribeOverlays(setOverlays); }, []);
  useEffect(() => { setAnchor(loadVwapAnchor()); return subscribeVwapAnchor(setAnchor); }, []);
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick((t) => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const hasIb = overlays.includes("ibhl");
  const hasMacd = overlays.includes("macd4c");
  const hasVwap = overlays.includes("avwap");
  const anyOn = hasIb || hasMacd || hasVwap;
  const rows = ohlcv?.rows;
  const priceHeight = 320;
  const macdHeight = 130;

  // Label-only metadata for the header badge — cheap to recompute separately
  // from the imperative chart build below, which needs the same call anyway.
  const vwapKeyLabel = useMemo(() => {
    if (!hasVwap || !rows || rows.length < 5) return "";
    return periodLabel(computeAnchoredVwap(rows, anchor as VwapAnchor).currentKey, anchor as VwapAnchor);
  }, [hasVwap, rows, anchor]);

  useEffect(() => {
    const el = containerRef.current;
    if (!anyOn || !el || !rows || rows.length < 2) { setLegend(null); return; }

    const colors = themeColors();
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: colors.bg }, textColor: colors.muted, panes: { separatorColor: colors.hair, separatorHoverColor: colors.border } },
      grid: { vertLines: { color: colors.hair }, horzLines: { color: colors.hair } },
      rightPriceScale: { borderColor: colors.border },
      // When the MACD sub-chart is present it owns the shared bottom time axis
      // (see below) — hiding this one avoids showing the same dates twice.
      timeScale: { borderColor: colors.border, rightOffset: 3, visible: !hasMacd },
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
    const bands: IbBand[] = hasIb ? computeInitialBalance(rows, 2).slice(-MAX_IB_BANDS) : [];
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
        hi.createPriceLine({ price: b.ibHigh, color: GOLD, lineWidth: 1, lineStyle: LineStyle.Dashed, title: "IBH", axisLabelVisible: true });
        lo.createPriceLine({ price: b.ibLow, color: GOLD, lineWidth: 1, lineStyle: LineStyle.Dashed, title: "IBL", axisLabelVisible: true });
      }
    });

    // ── Anchored VWAP — one center-line series per anchor period (breaks
    //    naturally at resets); ±1σ/±2σ bands only for the current period. ──
    const vw = hasVwap ? computeAnchoredVwap(rows, anchor as VwapAnchor) : null;
    if (vw) {
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
        const center = chart.addSeries(LineSeries, {
          color: isCurrent ? VWAP_BLUE : "rgba(41,98,255,.4)", lineWidth: isCurrent ? 2 : 1,
          crosshairMarkerVisible: isCurrent, lastValueVisible: isCurrent, priceLineVisible: false, title: isCurrent ? "VWAP" : "",
        });
        center.setData(seg.idxs.map((i) => ({ time: rows[i].date as Time, value: (vw.points[i] as AvwapPoint).vwap })));
        if (isCurrent) {
          const band = (color: string, key: "u1" | "l1" | "u2" | "l2", title: string) => {
            const s = chart.addSeries(LineSeries, { color, lineWidth: 1, lineStyle: LineStyle.Dashed, crosshairMarkerVisible: false, lastValueVisible: true, priceLineVisible: false, title });
            s.setData(seg.idxs.map((i) => ({ time: rows[i].date as Time, value: (vw.points[i] as AvwapPoint)[key] })));
          };
          band(VWAP_GREEN, "u1", "+1σ"); band(VWAP_GREEN, "l1", "−1σ");
          band(VWAP_CYAN, "u2", "+2σ"); band(VWAP_CYAN, "l2", "−2σ");
          if (vw.prevFinalVwap != null) {
            center.createPriceLine({ price: vw.prevFinalVwap, color: colors.faint, lineWidth: 1, lineStyle: LineStyle.Dotted, title: "PQVWAP", axisLabelVisible: true });
          }
        }
      });
    }

    // ── Initial view: last `sessions` bars, fully pannable/zoomable beyond it. ──
    const fromIdx = Math.max(0, rows.length - sessions);
    const initialRange = { from: rows[fromIdx].date as Time, to: rows[rows.length - 1].date as Time };
    chart.timeScale().setVisibleRange(initialRange);

    // ── MACD 4C — a second, separately-created chart stacked below the price
    //    chart and pan/zoom-synced to it (lightweight-charts' own multi-pane
    //    API doesn't reliably materialize a pane added after chart creation —
    //    a dual-chart-instance sub-pane is the well-established fallback). ──
    const macdArr: Macd4cPoint[] = hasMacd ? computeMacd4c(rows) : [];
    const macdEl = macdContainerRef.current;
    const macdChart = hasMacd && macdEl ? createChart(macdEl, {
      autoSize: true,
      layout: { background: { color: colors.bg }, textColor: colors.muted },
      grid: { vertLines: { color: colors.hair }, horzLines: { color: colors.hair } },
      rightPriceScale: { borderColor: colors.border },
      timeScale: { borderColor: colors.border, rightOffset: 3 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.faint, width: 1, style: LineStyle.Dashed, labelBackgroundColor: colors.muted },
        horzLine: { color: colors.faint, width: 1, style: LineStyle.Dashed, labelBackgroundColor: colors.muted },
      },
    }) : null;
    macdChartRef.current = macdChart;
    if (macdChart) {
      const hist = macdChart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false });
      hist.setData(rows.map((r, i) => ({ time: r.date as Time, value: macdArr[i].hist, color: MACD4C_COLORS[macdArr[i].color] })));
      const macdLine = macdChart.addSeries(LineSeries, { color: MACD_BLUE, lineWidth: 2, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false, title: "MACD" });
      macdLine.setData(rows.map((r, i) => ({ time: r.date as Time, value: macdArr[i].macd })));
      const sigLine = macdChart.addSeries(LineSeries, { color: MACD_RED, lineWidth: 2, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false, title: "Signal" });
      sigLine.setData(rows.map((r, i) => ({ time: r.date as Time, value: macdArr[i].signal })));
      macdChart.timeScale().setVisibleRange(initialRange);
    }

    // Two-way pan/zoom sync between the price and MACD charts, guarded against
    // the infinite loop a naive bidirectional subscription would cause.
    let syncingRange = false;
    const syncRange = (from: IChartApi, to: IChartApi) => {
      from.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (syncingRange || !range) return;
        syncingRange = true;
        to.timeScale().setVisibleLogicalRange(range);
        syncingRange = false;
      });
    };
    if (macdChart) { syncRange(chart, macdChart); syncRange(macdChart, chart); }

    // ── Live hover legend — TradingView-style readout that updates with the
    //    crosshair; defaults to the last bar when the pointer isn't over the chart. ──
    const legendAt = (idx: number): Legend => {
      const r = rows[idx];
      const ib = bands.find((b) => idx >= b.startIdx && idx <= Math.min(b.endIdx, rows.length - 1)) ?? null;
      return { date: r.date, o: r.open, h: r.high, l: r.low, c: r.close, vol: r.volume, ib, vwap: vw?.points[idx] ?? null, macd: macdArr[idx] ?? null };
    };
    setLegend(legendAt(rows.length - 1));
    const onMove = (param: MouseEventParams) => {
      if (param.logical == null) { setLegend(legendAt(rows.length - 1)); return; }
      setLegend(legendAt(Math.max(0, Math.min(rows.length - 1, Math.round(param.logical)))));
    };
    chart.subscribeCrosshairMove(onMove);
    macdChart?.subscribeCrosshairMove(onMove);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      macdChart?.unsubscribeCrosshairMove(onMove);
      chart.remove();
      macdChart?.remove();
      chartRef.current = null;
      macdChartRef.current = null;
    };
  }, [anyOn, hasIb, hasMacd, hasVwap, anchor, rows, sessions, themeTick]);

  if (!anyOn) return null;

  if (!rows || rows.length < 2) {
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

  const up = legend ? legend.c >= legend.o : true;
  const priceCol = up ? "var(--up)" : "var(--down)";

  return (
    <div style={CARD}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={KICKER}>CUSTOM OVERLAYS</span>
        <span style={chip("CUSTOM", GOLD)}>CUSTOM</span>
        {hasIb ? <span style={chip("IBH / IBL", GOLD)}>IBH / IBL</span> : null}
        {hasMacd ? <span style={chip("MACD 4C", MACD_BLUE)}>MACD 4C</span> : null}
        {hasVwap ? <span style={chip("VWAP", VWAP_BLUE)}>A-VWAP{vwapKeyLabel ? ` · ${vwapKeyLabel}` : ""}</span> : null}
        {hasVwap ? (
          <div style={{ display: "flex", gap: 2, background: "var(--soft)", borderRadius: 7, padding: 2 }}>
            {VWAP_ANCHORS.map((a) => (
              <button key={a.id} type="button" title={`Anchor VWAP ${a.label}`} onClick={() => { setAnchor(a.id); saveVwapAnchor(a.id); }}
                style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 5, border: "none", cursor: "pointer", background: anchor === a.id ? VWAP_BLUE : "transparent", color: anchor === a.id ? "#fff" : "var(--muted)" }}>{a.short}</button>
            ))}
          </div>
        ) : null}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => { chartRef.current?.timeScale().fitContent(); macdChartRef.current?.timeScale().fitContent(); }} title="Fit all history"
          style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 7, padding: "3px 9px", cursor: "pointer" }}>⤢ Fit</button>
        <button type="button" onClick={() => { const fromIdx = Math.max(0, rows.length - sessions); const range = { from: rows[fromIdx].date as Time, to: rows[rows.length - 1].date as Time }; chartRef.current?.timeScale().setVisibleRange(range); macdChartRef.current?.timeScale().setVisibleRange(range); }} title="Reset zoom"
          style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 7, padding: "3px 9px", cursor: "pointer" }}>↺ Reset</button>
      </div>

      {/* Live legend — mirrors the embed's own hover readout; updates with the crosshair. */}
      {legend ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 14px", fontFamily: MONO, fontSize: 11, marginBottom: 8, color: "var(--muted)" }}>
          <span style={{ color: "var(--faint)" }}>{legend.date}</span>
          <span style={{ color: priceCol }}>O {formatPrice(legend.o)} H {formatPrice(legend.h)} L {formatPrice(legend.l)} C {formatPrice(legend.c)}</span>
          <span>Vol {formatCompact(legend.vol)}</span>
          {hasIb && legend.ib ? <span style={{ color: GOLD }}>IBH {formatPrice(legend.ib.ibHigh)} IBL {formatPrice(legend.ib.ibLow)}</span> : null}
          {hasVwap && legend.vwap ? (
            <span>
              <span style={{ color: VWAP_BLUE }}>VWAP {formatPrice(legend.vwap.vwap)}</span>{" "}
              <span style={{ color: VWAP_GREEN }}>±1σ {formatPrice(legend.vwap.l1)}–{formatPrice(legend.vwap.u1)}</span>{" "}
              <span style={{ color: VWAP_CYAN }}>±2σ {formatPrice(legend.vwap.l2)}–{formatPrice(legend.vwap.u2)}</span>
            </span>
          ) : null}
          {hasMacd && legend.macd ? (
            <span>
              <span style={{ color: MACD_BLUE }}>MACD {legend.macd.macd.toFixed(1)}</span>{" "}
              <span style={{ color: MACD_RED }}>SIG {legend.macd.signal.toFixed(1)}</span>{" "}
              <span>HIST {legend.macd.hist.toFixed(1)}</span>
            </span>
          ) : null}
        </div>
      ) : null}

      <div ref={containerRef} style={{ width: "100%", height: priceHeight, borderRadius: hasMacd ? "8px 8px 0 0" : 8, overflow: "hidden" }} />
      {hasMacd ? <div ref={macdContainerRef} style={{ width: "100%", height: macdHeight, borderRadius: "0 0 8px 8px", overflow: "hidden", borderTop: "1px solid var(--hair)" }} /> : null}

      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 10, lineHeight: 1.5 }}>
        {hasIb ? <>Initial Balance = the high–low range of each month&apos;s first 2 trading sessions, held for the rest of the month (bright gold = current month). </> : null}
        {hasMacd ? <>MACD 4C: EMA 12/26 with a signal-9 line and EMA-3 smoothed histogram — silver ≥0 rising, red ≥0 falling, bright-red &lt;0 falling, blue &lt;0 rising. </> : null}
        {hasVwap ? <>Anchored VWAP on hlc3·volume, reset each {({ week: "week", month: "month", quarter: "quarter", year: "year" } as Record<string, string>)[anchor] || "period"} (each period is its own line, so it breaks cleanly at the reset), with ±1σ/±2σ bands on the current period; PQVWAP = the previous period&apos;s closing VWAP. </> : null}
        Computed from our published daily EOD bars, {rows.length} sessions total — drag to pan, scroll/pinch to zoom, hover for the readout above.
      </div>
    </div>
  );
}
