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
import { loadStudies, subscribeStudies } from "@/lib/data/chartStudies";
import { ChartIndicatorPicker } from "@/components/dashboard/TradingViewChart";
import { computeInitialBalance, type IbBand } from "@/lib/indicators/initialBalance";
import { computeAnchoredVwap, periodLabel, VWAP_ANCHORS, type VwapAnchor, type AvwapPoint } from "@/lib/indicators/anchoredVwap";
import { ema, sma, rsiWilder, stochOf } from "@/lib/indicators/oscillators";
import { formatPrice, formatCompact, formatPercent } from "@/lib/format/number";
import { DrawingTool } from "@/lib/charting/DrawingTool";
import { ChartToolbar } from "@/components/dashboard/ChartToolbar";

// The site's own chart -- built on TradingView's open-source lightweight-charts
// engine (not the restricted embed above it), so it's the one place both
// custom overlays (monthly Initial Balance, Anchored VWAP -- Pine-only,
// can't run in an embedded iframe) and the 6 built-in studies
// (`lib/data/chartStudies.ts` -- EMA 25, EMA 50, SMA 200, Volume, RSI, Stoch
// RSI 10/10/3/3) can render together with full styling control (the embed
// can't set per-study colors at all). The ƒx Indicators picker is the SAME
// site-wide picker/state the embed above uses (`chartStudies.ts`) -- toggling
// a study here also affects the embed, and vice versa; that state is meant to
// carry over cleanly once the embed above is eventually retired and this
// chart is the only one left. Indicator math lives in
// `lib/indicators/oscillators.ts`, mirroring the Python backend's own
// rsi_wilder/stoch_of exactly, so this chart, the embed, and the Screener's
// own signals all read the same numbers for the same ticker/day. Honest
// about gaps: no bars ⇒ an explicit note, never a fabricated series.

const MONO = "var(--font-mono)";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r, 12px)", boxShadow: "var(--sh, var(--shadow))", padding: "14px 16px", marginBottom: 14 };
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const GOLD = "#D6A100";
const VWAP_BLUE = "#2962FF";
const VWAP_GREEN = "#16A34A";
const VWAP_CYAN = "#0891B2";
// Same colors requested for the TradingView embed's EMA/SMA/Stoch RSI studies
// (not achievable there -- per-study color is not overridable on that embed,
// see the note in chartStudies.ts) applied here instead, where full control
// is possible.
const EMA25_COLOR = "#2962FF";
const EMA50_COLOR = "#FF5050";
const SMA200_COLOR = "#FF9800";
const RSI_COLOR = "#7E57C2";
const STOCH_K_COLOR = "#2962FF";
const STOCH_D_COLOR = "#FF5050";
const STOCH_BAND_COLOR = "#dbdbdb";
// Fixed pixel height for each oscillator sub-pane (RSI, Stoch RSI) that's
// currently active; the price pane above keeps `priceHeight` and the total
// container height grows/shrinks with however many oscillator panes are on.
const OSC_PANE_HEIGHT = 110;

// Caps series count for very long histories under a fine anchor (e.g. weekly
// VWAP over years, or IB bands over many years) — keeps the chart responsive
// without silently truncating the visible-by-default window.
const MAX_VWAP_SEGMENTS = 60;
const MAX_IB_BANDS = 48;

// Picker ids from chartStudies.ts -- kept local rather than re-exported
// there, since this chart's mapping from an id to "what series to draw" is
// specific to this lightweight-charts build, not to the TradingView embed's
// `resolveStudy`.
const ID_EMA25 = "ema25", ID_EMA50 = "ema50", ID_SMA200 = "sma200";
const ID_VOLUME = "Volume@tv-basicstudies", ID_RSI = "RSI@tv-basicstudies", ID_STOCH = "stochRsi10_3_3";

const RANGE_BUTTONS = [
  { id: "1M", n: 22 }, { id: "3M", n: 66 }, { id: "6M", n: 130 }, { id: "1Y", n: 252 }, { id: "All", n: null },
] as const;

// Pane-corner overlay labels sit on a solid card, not just a text shadow --
// some existing price-line labels (Monthly IBH/IBL, Anchored VWAP) carry
// long titles and render wide near the top of the price pane, right where
// these corner labels also live; a card behind the text keeps it legible
// regardless of what's drawn on the canvas underneath. `zIndex` makes that
// explicit rather than relying on DOM order against the chart's own
// absolutely-positioned canvases.
const CORNER_LABEL: CSSProperties = {
  position: "absolute", left: 8, zIndex: 5, pointerEvents: "none", fontFamily: MONO, fontSize: 10.5,
  background: "var(--panel)", borderRadius: 6, padding: "3px 7px", border: "1px solid var(--hair)",
};

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

// RSI/Stoch RSI are bounded [0,100] by definition; floating-point rounding in
// the underlying series (e.g. price exactly at the trailing low) can land a
// hair on the wrong side of 0 or 100 -- clamp for display only, the same
// value either way.
function fmtOsc(v: number): string {
  return Math.min(100, Math.max(0, v)).toFixed(1);
}

type Legend = {
  date: string; o: number; h: number; l: number; c: number; vol: number;
  chg: number | null; chgPct: number | null;
  ib: IbBand | null; vwap: AvwapPoint | null;
  ema25: number | null; ema50: number | null; sma200: number | null;
  rsi: number | null; stochK: number | null; stochD: number | null;
};

export function IndicatorCompanion({ ohlcv, symbol, sessions = 140 }: { ohlcv: OhlcvPayload | null; symbol?: string; sessions?: number }) {
  const [anchor, setAnchor] = useState<string>("quarter");
  const [studies, setStudies] = useState<string[]>(() => loadStudies());
  const [legend, setLegend] = useState<Legend | null>(null);
  const [themeTick, setThemeTick] = useState(0);
  const [drawingTool, setDrawingTool] = useState<DrawingTool | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => { setAnchor(loadVwapAnchor()); return subscribeVwapAnchor(setAnchor); }, []);
  useEffect(() => subscribeStudies(setStudies), []);
  useEffect(() => {
    const obs = new MutationObserver(() => setThemeTick((t) => t + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const rows = ohlcv?.rows;
  const priceHeight = 340;

  const active = useMemo(() => new Set(studies), [studies]);
  const showEma25 = active.has(ID_EMA25), showEma50 = active.has(ID_EMA50), showSma200 = active.has(ID_SMA200);
  const showVolume = active.has(ID_VOLUME), showRsi = active.has(ID_RSI), showStochRsi = active.has(ID_STOCH);
  const oscCount = (showRsi ? 1 : 0) + (showStochRsi ? 1 : 0);
  const totalHeight = priceHeight + OSC_PANE_HEIGHT * oscCount;
  // Corner-label offsets inside the chart wrapper -- price pane's own corner
  // is always at the top, each active oscillator pane's corner stacks below
  // the ones before it (an oscillator that's off contributes no gap).
  const rsiTop = priceHeight;
  const stochTop = priceHeight + (showRsi ? OSC_PANE_HEIGHT : 0);

  const [activeRangeId, setActiveRangeId] = useState<string>(() =>
    sessions <= 30 ? "1M" : sessions <= 80 ? "3M" : sessions <= 180 ? "6M" : "1Y");

  // Label-only metadata for the header badge — cheap to recompute separately
  // from the imperative chart build below, which needs the same call anyway.
  const vwapKeyLabel = useMemo(() => {
    if (!rows || rows.length < 5) return "";
    return periodLabel(computeAnchoredVwap(rows, anchor as VwapAnchor).currentKey, anchor as VwapAnchor);
  }, [rows, anchor]);

  function applyRange(id: string) {
    setActiveRangeId(id);
    if (!rows || !chartRef.current) return;
    const btn = RANGE_BUTTONS.find((r) => r.id === id);
    if (!btn || btn.n == null) { chartRef.current.timeScale().fitContent(); return; }
    const fromIdx = Math.max(0, rows.length - btn.n);
    chartRef.current.timeScale().setVisibleRange({ from: rows[fromIdx].date as Time, to: rows[rows.length - 1].date as Time });
  }

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

    // Drawings persist per ticker (localStorage) -- a fresh DrawingTool per
    // chart build (this effect re-runs on theme/study/anchor changes, which
    // tear down and recreate the whole chart+series) just reloads the same
    // saved drawings onto the new series, indistinguishably to the user.
    const drawing = new DrawingTool(chart, candles, symbol || "");
    setDrawingTool(drawing);

    if (showVolume) {
      const volume = chart.addSeries(HistogramSeries, { priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });
      volume.setData(rows.map((r) => ({ time: r.date as Time, value: r.volume || 0, color: r.close >= r.open ? "rgba(22,163,74,.35)" : "rgba(220,38,38,.35)" })));
    }

    // ── EMA 25 / EMA 50 / SMA 200 -- same 3 overlay studies (and math) as
    //    the TradingView chart above; `lineData` drops the NaN warm-up tail
    //    (e.g. SMA 200 needs 200 bars) rather than plotting a fabricated value. ──
    const closes = rows.map((r) => r.close);
    const ema25Arr = ema(closes, 25);
    const ema50Arr = ema(closes, 50);
    const sma200Arr = sma(closes, 200);
    const rsiArr = rsiWilder(closes, 14);
    const stochRsiBase = rsiWilder(closes, 10);
    const stoch = stochOf(stochRsiBase, 10, 3, 3);
    const lineData = (vals: number[]) => rows.map((r, i) => ({ time: r.date as Time, value: vals[i] })).filter((p) => !Number.isNaN(p.value));

    if (showEma25) {
      const ema25Line = chart.addSeries(LineSeries, { color: EMA25_COLOR, lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: true, priceLineVisible: false, title: "EMA 25" });
      ema25Line.setData(lineData(ema25Arr));
    }
    if (showEma50) {
      const ema50Line = chart.addSeries(LineSeries, { color: EMA50_COLOR, lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: true, priceLineVisible: false, title: "EMA 50" });
      ema50Line.setData(lineData(ema50Arr));
    }
    if (showSma200) {
      const sma200Line = chart.addSeries(LineSeries, { color: SMA200_COLOR, lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: true, priceLineVisible: false, title: "SMA 200" });
      sma200Line.setData(lineData(sma200Arr));
    }

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

    // ── RSI(14) -- own pane below price/volume, same math as the TradingView
    //    chart's RSI study and the Screener's own RSI reads. Fixed 0-100
    //    scale, with 70/30 reference lines (TradingView's own RSI defaults). ──
    let nextPane = 1;
    if (showRsi) {
      const rsiLine = chart.addSeries(LineSeries, {
        color: RSI_COLOR, lineWidth: 1, crosshairMarkerVisible: true, lastValueVisible: true, priceLineVisible: false, title: "RSI 14",
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
      }, nextPane++);
      rsiLine.setData(lineData(rsiArr));
      rsiLine.createPriceLine({ price: 70, color: colors.faint, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "70" });
      rsiLine.createPriceLine({ price: 30, color: colors.faint, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "30" });
    }

    // ── Stochastic RSI (10,10,3,3) -- own pane, same math as the TradingView
    //    chart's Stoch RSI study: %K/%D over an RSI(10) base. Upper/Lower
    //    Band mirror TradingView's own Stoch RSI style dialog (flat lines at
    //    80/20). ──
    if (showStochRsi) {
      const stochPane = nextPane++;
      const stochD = chart.addSeries(LineSeries, { color: STOCH_D_COLOR, lineWidth: 1, crosshairMarkerVisible: true, lastValueVisible: true, priceLineVisible: false, title: "Stoch RSI D" }, stochPane);
      stochD.setData(lineData(stoch.d));
      const stochK = chart.addSeries(LineSeries, {
        color: STOCH_K_COLOR, lineWidth: 1, crosshairMarkerVisible: true, lastValueVisible: true, priceLineVisible: false, title: "Stoch RSI K",
        autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
      }, stochPane);
      stochK.setData(lineData(stoch.k));
      stochK.createPriceLine({ price: 80, color: STOCH_BAND_COLOR, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "Upper Band" });
      stochK.createPriceLine({ price: 20, color: STOCH_BAND_COLOR, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "Lower Band" });
    }

    // Price pane keeps roughly `priceHeight`, each active oscillator pane
    // roughly `OSC_PANE_HEIGHT`, by weighting stretch factors with those same
    // pixel numbers (relative, not absolute) -- `setHeight` looked equivalent
    // but its fixed-pixel push gets silently overwritten by the chart's own
    // initial layout pass right after pane creation; stretch factors are
    // what that layout pass itself honors on every resize.
    const panes = chart.panes();
    panes[0]?.setStretchFactor(priceHeight);
    for (let i = 1; i < panes.length; i++) panes[i]?.setStretchFactor(OSC_PANE_HEIGHT);

    // ── Initial view: last `sessions` bars, fully pannable/zoomable beyond it. ──
    const fromIdx = Math.max(0, rows.length - sessions);
    const initialRange = { from: rows[fromIdx].date as Time, to: rows[rows.length - 1].date as Time };
    chart.timeScale().setVisibleRange(initialRange);

    // ── Live hover legend — TradingView-style readout that updates with the
    //    crosshair; defaults to the last bar when the pointer isn't over the chart. ──
    const nz = (v: number | undefined) => (v == null || Number.isNaN(v) ? null : v);
    const legendAt = (idx: number): Legend => {
      const r = rows[idx];
      const prevClose = idx > 0 ? rows[idx - 1].close : null;
      const chg = prevClose != null ? r.close - prevClose : null;
      const chgPct = prevClose ? chg! / prevClose : null;
      const ib = bands.find((b) => idx >= b.startIdx && idx <= Math.min(b.endIdx, rows.length - 1)) ?? null;
      return {
        date: r.date, o: r.open, h: r.high, l: r.low, c: r.close, vol: r.volume, chg, chgPct, ib, vwap: vw.points[idx] ?? null,
        ema25: nz(ema25Arr[idx]), ema50: nz(ema50Arr[idx]), sma200: nz(sma200Arr[idx]),
        rsi: nz(rsiArr[idx]), stochK: nz(stoch.k[idx]), stochD: nz(stoch.d[idx]),
      };
    };
    setLegend(legendAt(rows.length - 1));
    const onMove = (param: MouseEventParams) => {
      if (param.logical == null) { setLegend(legendAt(rows.length - 1)); return; }
      setLegend(legendAt(Math.max(0, Math.min(rows.length - 1, Math.round(param.logical)))));
    };
    chart.subscribeCrosshairMove(onMove);

    return () => {
      chart.unsubscribeCrosshairMove(onMove);
      drawing.destroy();
      setDrawingTool(null);
      chart.remove();
      chartRef.current = null;
    };
  }, [anchor, rows, sessions, themeTick, showEma25, showEma50, showSma200, showVolume, showRsi, showStochRsi, symbol]);

  if (!rows || rows.length < 2) {
    return (
      <div style={CARD}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={KICKER}>CHART</span>
          <span style={chip("CUSTOM", GOLD)}>CUSTOM</span>
        </div>
        <p style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5, margin: 0 }}>
          No local OHLCV history for {symbol || "this symbol"} to draw IBH/IBL and Anchored VWAP.
        </p>
      </div>
    );
  }

  const chgUp = legend ? (legend.chgPct ?? 0) >= 0 : true;
  const priceCol = chgUp ? "var(--up)" : "var(--down)";

  return (
    <div style={CARD}>
      {/* Ticker/OHLC header row — mirrors the TradingView chart's own inline readout. */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
        <span style={KICKER}>CHART</span>
        <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: 13 }}>{symbol}</span>
        <span style={{ fontSize: 10.5, color: "var(--faint)" }}>· 1D · IDX</span>
        {legend ? (
          <span style={{ fontFamily: MONO, fontSize: 11, color: priceCol }}>
            O {formatPrice(legend.o)} H {formatPrice(legend.h)} L {formatPrice(legend.l)} C {formatPrice(legend.c)}
            {legend.chg != null ? ` ${legend.chg >= 0 ? "+" : ""}${formatPrice(legend.chg)} (${formatPercent(legend.chgPct)})` : ""}
          </span>
        ) : null}
      </div>
      {legend && showVolume ? (
        <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--faint)", marginBottom: 8 }}>Volume {formatCompact(legend.vol)}</div>
      ) : <div style={{ marginBottom: 8 }} />}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={chip("IBH / IBL", GOLD)}>IBH / IBL</span>
        <span style={chip("VWAP", VWAP_BLUE)}>A-VWAP{vwapKeyLabel ? ` · ${vwapKeyLabel}` : ""}</span>
        <div style={{ display: "flex", gap: 2, background: "var(--soft)", borderRadius: 7, padding: 2 }}>
          {VWAP_ANCHORS.map((a) => (
            <button key={a.id} type="button" title={`Anchor VWAP ${a.label}`} onClick={() => { setAnchor(a.id); saveVwapAnchor(a.id); }}
              style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 5, border: "none", cursor: "pointer", background: anchor === a.id ? VWAP_BLUE : "transparent", color: anchor === a.id ? "#fff" : "var(--muted)" }}>{a.short}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <ChartIndicatorPicker />
        <div style={{ display: "flex", gap: 2, background: "var(--soft)", borderRadius: 7, padding: 2 }}>
          {RANGE_BUTTONS.map((r) => (
            <button key={r.id} type="button" onClick={() => applyRange(r.id)}
              style={{ fontSize: 10, fontWeight: 800, padding: "3px 9px", borderRadius: 5, border: "none", cursor: "pointer", background: activeRangeId === r.id ? "var(--accent)" : "transparent", color: activeRangeId === r.id ? "#fff" : "var(--muted)" }}>{r.id}</button>
          ))}
        </div>
      </div>

      {/* Live legend — IBH/IBL and Anchored VWAP detail; EMA/RSI/Stoch RSI show
          in their own pane's corner overlay below instead, matching how
          TradingView's own chart labels each pane. */}
      {legend ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 14px", fontFamily: MONO, fontSize: 11, marginBottom: 8, color: "var(--muted)" }}>
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

      <div style={{ display: "flex", alignItems: "stretch" }}>
        <ChartToolbar tool={drawingTool} height={totalHeight} />
        <div style={{ position: "relative", flex: "1 1 auto", minWidth: 0 }}>
          <div ref={containerRef} style={{ width: "100%", height: totalHeight, borderRadius: 8, overflow: "hidden" }} />
          {/* Pane-corner overlays -- TradingView-style "{study} {source} {value}"
              labels pinned to each pane's own top-left corner, updating with the
              crosshair; pointer-events:none so they never block chart interaction. */}
          {legend ? (
            <div style={{ ...CORNER_LABEL, top: 6, lineHeight: 1.7 }}>
              {showEma25 && legend.ema25 != null ? <div>EMA 25 close <b style={{ color: EMA25_COLOR }}>{formatPrice(legend.ema25)}</b></div> : null}
              {showEma50 && legend.ema50 != null ? <div>EMA 50 close <b style={{ color: EMA50_COLOR }}>{formatPrice(legend.ema50)}</b></div> : null}
              {showSma200 && legend.sma200 != null ? <div>SMA 200 close <b style={{ color: SMA200_COLOR }}>{formatPrice(legend.sma200)}</b></div> : null}
            </div>
          ) : null}
          {showRsi && legend?.rsi != null ? (
            <div style={{ ...CORNER_LABEL, top: rsiTop + 6 }}>
              RSI 14 close <b style={{ color: RSI_COLOR }}>{fmtOsc(legend.rsi)}</b>
            </div>
          ) : null}
          {showStochRsi && (legend?.stochK != null || legend?.stochD != null) ? (
            <div style={{ ...CORNER_LABEL, top: stochTop + 6 }}>
              Stoch RSI 3 3 10 10 close{" "}
              {legend?.stochK != null ? <b style={{ color: STOCH_K_COLOR }}>{fmtOsc(legend.stochK)}</b> : null}{" "}
              {legend?.stochD != null ? <b style={{ color: STOCH_D_COLOR }}>{fmtOsc(legend.stochD)}</b> : null}
            </div>
          ) : null}
        </div>
      </div>

      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 10, lineHeight: 1.5 }}>
        Initial Balance = the high–low range of each month&apos;s first 2 trading sessions, held for the rest of the month (bright gold = current month). Anchored VWAP on hlc3·volume, reset each {({ week: "week", month: "month", quarter: "quarter", year: "year" } as Record<string, string>)[anchor] || "period"} (each period is its own line, breaking cleanly at the reset), with ±1σ/±2σ bands for the current period and center/±1σ for the previous one — every label shows price and % from the latest close.
        EMA/SMA/RSI/Stoch RSI above come from the ƒx Indicators picker (top right) — the same picker and saved selection as the TradingView chart above.
        Left toolbar: Trend Line and Fib Retracement take two clicks (start, then end), Horizontal Line takes one; Erase removes whatever drawing you click on next; CLR removes all of them. Drawings save per ticker in this browser only.
        Computed from our published daily EOD bars, {rows.length} sessions total — drag to pan, scroll/pinch to zoom, hover for the readout above.
      </div>
    </div>
  );
}
