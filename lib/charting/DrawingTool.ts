// Orchestrates the chart's drawing tools: active-tool state, click/hover
// wiring (`chart.subscribeClick`/`subscribeCrosshairMove`, same pattern as
// TradingView's own RectangleDrawingTool plugin example), attaching/
// detaching primitives on the price series, and localStorage persistence
// per ticker. One instance per chart build -- IndicatorCompanion.tsx creates
// a fresh one inside the same effect that (re)builds the chart.
//
// Tool taxonomy: the redesign's rail lists ~60 named tools across six
// groups (matching TradingView's own drawing-tool menus), but -- following
// the reference design prototype's own `onChartClick`, which does the same
// thing -- they collapse onto a much smaller set of shared placement
// behaviors. Exotic entries with no bespoke geometry in the source design
// either (Gann squares, Elliott waves, XABCD/harmonic patterns, brushes,
// arrows, most shapes) fall back to a plain two-point segment, same as
// Trend Line -- the rail's job is to expose TradingView's real taxonomy for
// muscle-memory and menu completeness, not to reimplement 60 distinct
// drawing engines the reference itself never built either.
//
// Selection (new this redesign): with "cursor" active, clicking within
// HIT_TOLERANCE of a placed drawing's geometry selects it (hitTest) instead
// of doing nothing -- the caller (ChartToolbar's selection toolbar) then
// drives restyle()/deleteSelected(). Magnet mode snaps a placement's price
// to the clicked bar's nearest O/H/L/C; Lock mode forces click-to-select
// only, no new placements; hideDrawings toggles visibility without
// discarding anything (distinct from clearAll).
import { LineSeries, LineStyle, type IChartApi, type ISeriesApi, type MouseEventParams, type SeriesType, type Time } from "lightweight-charts";
import type { OhlcvRow } from "@/lib/domain/types";
import { TrendLine } from "./drawings/TrendLine";
import { HorizontalLine } from "./drawings/HorizontalLine";
import { FibRetracement } from "./drawings/FibRetracement";
import { Rectangle } from "./drawings/Rectangle";
import { Measure } from "./drawings/Measure";
import { TextAnnotation } from "./drawings/TextAnnotation";
import { VLine } from "./drawings/VLine";
import { PositionZone } from "./drawings/PositionZone";
import { loadDrawings, saveDrawings, type StoredRecord, type RangeVariant } from "./drawingStore";
import { computeVwapFromAnchor } from "@/lib/indicators/anchoredVwap";

export type ToolKind =
  | "cursor"
  | "trend" | "ray" | "info" | "ext" | "angle" | "hline" | "hray" | "vline" | "crossline"
  | "fib" | "fibext" | "fibch" | "fibtime" | "fan" | "fibtrendtime" | "circles" | "spiral" | "arcs" | "wedge" | "pitchfan"
  | "gannbox" | "gannsqf" | "gannsq" | "gannfan"
  | "xabcd" | "cypher" | "hns" | "abcd" | "tripat" | "drives" | "ellimp" | "ellcorr" | "elltri"
  | "long" | "short" | "posfc" | "barspat" | "ghost" | "sector"
  | "avwap" | "frvp" | "avp"
  | "prange" | "drange" | "dprange" | "measure"
  | "brush" | "highlight" | "arrowmark" | "arrow" | "arrowup" | "arrowdown"
  | "rect" | "rrect" | "path" | "circle" | "ellipse" | "poly" | "tri" | "arc" | "curve" | "dcurve"
  | "text" | "anchoredtext" | "note" | "callout" | "pricelabel" | "flag";

export const TOOL_COLOR = "#2962FF";
export const FIB_COLOR = "#D6A100";
const HIT_TOLERANCE = 9;

// Tools that place with a single click (hline handled separately; text-ish
// prompts inline; everything else here is anchor-only, drawn as a vertical
// line -- volume-profile/forecast/ghost/sector/fib-time tools have no
// distinct geometry in the source design either, so they share it. Anchored
// VWAP is pulled OUT of this bucket below: unlike those, it's a real,
// well-defined TradingView tool (a genuine running VWAP from the clicked
// bar forward), not a placeholder marker, so it gets its own real math.
const VERTICAL = new Set<ToolKind>(["vline", "crossline", "frvp", "avp", "barspat", "ghost", "posfc", "fibtime", "fibtrendtime", "sector"]);
const TEXTISH = new Set<ToolKind>(["text", "anchoredtext", "note", "callout", "pricelabel", "flag"]);
const FIBISH = new Set<ToolKind>(["fib", "fibext", "fibch", "fan", "circles", "spiral", "arcs", "wedge", "pitchfan", "gannbox", "gannsqf", "gannsq", "gannfan"]);
const RECTISH = new Set<ToolKind>(["rect", "rrect", "ellipse", "circle"]);
const POSITION = new Set<ToolKind>(["long", "short"]);
const RANGE_VARIANT: Partial<Record<ToolKind, RangeVariant>> = { measure: "measure", prange: "price", drange: "date", dprange: "dateprice", info: "price" };

type AnyPrimitive = TrendLine | HorizontalLine | FibRetracement | Rectangle | Measure | TextAnnotation | VLine | PositionZone;
// Anchored VWAP is real chart series (a center line + two σ-band lines,
// same as the VWAP Suite indicator), not a primitive on the candle series
// like everything else here -- `series` carries those instead of
// `primitive` for that one drawing type; exactly one of the two is set.
type Placed = { id: string; stored: StoredRecord; primitive?: AnyPrimitive; series?: ISeriesApi<SeriesType>[] };
type DrawPointT = { time: Time; price: number };

function hexAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  if (Number.isNaN(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export type SelectionInfo = { id: string; title: string; color: string; width: number; style: "solid" | "dashed" | "dotted"; x: number; y: number } | null;

export class DrawingTool {
  private tool: ToolKind = "cursor";
  private placed: Placed[] = [];
  private pending: DrawPointT | null = null;
  private pendingLogical: number | null = null;
  private preview: TrendLine | FibRetracement | Rectangle | Measure | null = null;
  private listeners = new Set<() => void>();
  private selectionListeners = new Set<(sel: SelectionInfo) => void>();
  private selectedId: string | null = null;
  private selectedX = 0;
  private selectedY = 0;
  private magnetOn = false;
  private lockedOn = false;
  private hideAll = false;

  constructor(private chart: IChartApi, private series: ISeriesApi<SeriesType>, private symbol: string, private rows: OhlcvRow[]) {
    this.chart.subscribeClick(this.onClick);
    this.chart.subscribeCrosshairMove(this.onMove);
    this.restore();
  }

  /** A `Placed` is either a primitive on the candle series or a standalone
      set of chart series (Anchored VWAP) -- exactly one branch runs. */
  private detachPlaced(p: Placed) {
    if (p.primitive) this.series.detachPrimitive(p.primitive);
    else p.series?.forEach((s) => { try { this.chart.removeSeries(s); } catch { /* already gone with the chart */ } });
  }
  private stylePlaced(p: Placed, color: string, width: number, style: "solid" | "dashed" | "dotted") {
    if (p.primitive) { p.primitive.setStyle(color, width, style); return; }
    p.series?.forEach((s, i) => s.applyOptions({ color: i === 0 ? color : hexAlpha(color, 0.5), lineWidth: (Math.min(4, Math.max(1, width)) as 1 | 2 | 3 | 4) }));
  }

  destroy() {
    this.chart.unsubscribeClick(this.onClick);
    this.chart.unsubscribeCrosshairMove(this.onMove);
    this.clearPreview();
    this.placed.forEach((p) => this.detachPlaced(p));
    this.placed = [];
    this.listeners.clear();
    this.selectionListeners.clear();
  }

  getTool(): ToolKind { return this.tool; }
  isMagnet(): boolean { return this.magnetOn; }
  isLocked(): boolean { return this.lockedOn; }
  isHideAll(): boolean { return this.hideAll; }
  hasDrawings(): boolean { return this.placed.length > 0; }
  onChange(cb: () => void): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  onSelectionChange(cb: (sel: SelectionInfo) => void): () => void { this.selectionListeners.add(cb); return () => this.selectionListeners.delete(cb); }
  private emit() { this.listeners.forEach((cb) => cb()); }
  private emitSelection(sel: SelectionInfo) { this.selectionListeners.forEach((cb) => cb(sel)); }

  setTool(kind: ToolKind) {
    this.tool = kind;
    this.pending = null;
    this.pendingLogical = null;
    this.clearPreview();
    this.emit();
  }

  toggleMagnet() { this.magnetOn = !this.magnetOn; this.emit(); }
  toggleLock() { this.lockedOn = !this.lockedOn; this.emit(); }
  toggleHideAll() {
    this.hideAll = !this.hideAll;
    this.placed.forEach((p) => {
      if (p.primitive) { if (this.hideAll) this.series.detachPrimitive(p.primitive); else this.series.attachPrimitive(p.primitive); }
      else p.series?.forEach((s) => s.applyOptions({ visible: !this.hideAll }));
    });
    this.emit();
  }

  clearAll() {
    this.placed.forEach((p) => this.detachPlaced(p));
    this.placed = [];
    this.selectedId = null;
    this.persist();
    this.emit();
    this.emitSelection(null);
  }

  deleteSelected() {
    if (!this.selectedId) return;
    const idx = this.placed.findIndex((p) => p.id === this.selectedId);
    if (idx === -1) return;
    const [hit] = this.placed.splice(idx, 1);
    this.detachPlaced(hit);
    this.selectedId = null;
    this.persist();
    this.emit();
    this.emitSelection(null);
  }

  restyleSelected(color: string, width: number, style: "solid" | "dashed" | "dotted") {
    const p = this.placed.find((x) => x.id === this.selectedId);
    if (!p) return;
    this.stylePlaced(p, color, width, style);
    p.stored = { ...p.stored, color, width, style };
    this.persist();
    this.emitSelection({ id: p.id, title: labelFor(p.stored.type), color, width, style, x: this.selectedX, y: this.selectedY });
  }

  private restore() {
    loadDrawings(this.symbol).forEach((d) => this.place(d));
  }

  private persist() {
    saveDrawings(this.symbol, this.placed.map((p) => p.stored));
  }

  private place(stored: StoredRecord) {
    const color = stored.color ?? (stored.type === "fib" ? FIB_COLOR : TOOL_COLOR);
    const width = stored.width ?? 2;
    const style = stored.style ?? "solid";
    if (stored.type === "avwap") {
      const anchorIdx = this.rows.findIndex((r) => r.date === stored.at.time);
      if (anchorIdx === -1) return;
      const points = computeVwapFromAnchor(this.rows, anchorIdx);
      const mk = (values: (p: (typeof points)[number]) => number, w: number, dashed: boolean, col: string) => {
        const s = this.chart.addSeries(LineSeries, {
          color: col, lineWidth: w as 1 | 2 | 3 | 4, lineStyle: dashed ? LineStyle.Dashed : LineStyle.Solid,
          crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false, visible: !this.hideAll,
          autoscaleInfoProvider: () => null,
        });
        s.setData(points.map((p) => ({ time: this.rows[p.idx].date as Time, value: values(p) })));
        return s;
      };
      const series = [
        mk((p) => p.vwap, width, style !== "solid", color),
        mk((p) => p.u1, 1, true, hexAlpha(color, 0.5)),
        mk((p) => p.l1, 1, true, hexAlpha(color, 0.5)),
      ];
      this.placed.push({ id: stored.id, stored, series });
      return;
    }
    let primitive: AnyPrimitive;
    if (stored.type === "trend" || stored.type === "ray" || stored.type === "extended") {
      primitive = new TrendLine({ time: stored.a.time as Time, price: stored.a.price }, { time: stored.b.time as Time, price: stored.b.price }, color, width, style);
    } else if (stored.type === "fib") {
      primitive = new FibRetracement({ time: stored.a.time as Time, price: stored.a.price }, { time: stored.b.time as Time, price: stored.b.price }, color);
    } else if (stored.type === "rect") {
      primitive = new Rectangle({ time: stored.a.time as Time, price: stored.a.price }, { time: stored.b.time as Time, price: stored.b.price }, color, width, style);
    } else if (stored.type === "range") {
      primitive = new Measure({ time: stored.a.time as Time, price: stored.a.price }, { time: stored.b.time as Time, price: stored.b.price }, stored.barCount, color, stored.variant);
    } else if (stored.type === "position") {
      primitive = new PositionZone({
        t1: stored.a.time as Time, t2: stored.b.time as Time, entry: stored.entry, target: stored.target, stop: stored.stop,
        fillUp: "rgba(22,163,74,.18)", fillDn: "rgba(229,72,77,.18)", stroke: color,
      });
    } else if (stored.type === "text") {
      primitive = new TextAnnotation({ time: stored.at.time as Time, price: stored.at.price }, stored.text, color);
    } else if (stored.type === "vline" || stored.type === "crossline") {
      primitive = new VLine(stored.at.time as Time, color, stored.type === "crossline");
    } else {
      primitive = new HorizontalLine(stored.price, color);
    }
    if (!this.hideAll) this.series.attachPrimitive(primitive);
    this.placed.push({ id: stored.id, stored, primitive });
  }

  private clearPreview() {
    if (this.preview) { this.series.detachPrimitive(this.preview); this.preview = null; }
  }

  /** Snap a clicked price to the nearest O/H/L/C of that bar, when magnet mode is on. */
  private snap(price: number, logical: number | null): number {
    if (!this.magnetOn || logical == null) return price;
    const idx = Math.max(0, Math.min(this.rows.length - 1, Math.round(logical)));
    const r = this.rows[idx];
    const candidates = [r.open, r.high, r.low, r.close];
    return candidates.reduce((best, v) => (Math.abs(v - price) < Math.abs(best - price) ? v : best), candidates[0]);
  }

  private lastDate(): Time { return this.rows[this.rows.length - 1].date as Time; }
  private firstDate(): Time { return this.rows[0].date as Time; }
  private indexOf(t: Time): number { return this.rows.findIndex((r) => r.date === t); }

  private onClick = (param: MouseEventParams) => {
    if (!param.point || param.time == null) return;
    const rawPrice = this.series.coordinateToPrice(param.point.y);
    if (rawPrice == null) return;
    const price = this.snap(rawPrice, param.logical ?? null);
    const point: DrawPointT = { time: param.time, price };

    if (this.tool === "cursor" || this.lockedOn) {
      const hit = this.hitTest(param.point.x, param.point.y);
      this.selectedId = hit;
      this.selectedX = param.point.x;
      this.selectedY = param.point.y;
      if (hit) {
        const p = this.placed.find((x) => x.id === hit)!;
        this.emitSelection({ id: hit, title: labelFor(p.stored.type), color: p.stored.color ?? TOOL_COLOR, width: p.stored.width ?? 2, style: p.stored.style ?? "solid", x: this.selectedX, y: this.selectedY });
      } else {
        this.emitSelection(null);
      }
      return;
    }

    if (this.tool === "hline") {
      this.commit({ id: `hline-${Date.now()}`, type: "hline", price });
      this.setTool("cursor");
      return;
    }
    if (TEXTISH.has(this.tool)) {
      const text = typeof window !== "undefined" ? window.prompt("Annotation text:") : null;
      if (text && text.trim()) this.commit({ id: `${this.tool}-${Date.now()}`, type: "text", at: { time: String(point.time), price: point.price }, text: text.trim() });
      this.setTool("cursor");
      return;
    }
    if (VERTICAL.has(this.tool)) {
      this.commit({ id: `${this.tool}-${Date.now()}`, type: this.tool === "crossline" ? "crossline" : "vline", at: { time: String(point.time), price: point.price } });
      this.setTool("cursor");
      return;
    }
    if (this.tool === "avwap") {
      this.commit({ id: `avwap-${Date.now()}`, type: "avwap", at: { time: String(point.time), price: point.price } });
      this.setTool("cursor");
      return;
    }
    if (this.tool === "hray") {
      this.commit({ id: `hray-${Date.now()}`, type: "ray", a: { time: String(point.time), price: point.price }, b: { time: String(this.lastDate()), price: point.price } });
      this.setTool("cursor");
      return;
    }

    // Everything remaining is a two-point tool: first click arms a preview, second commits.
    if (!this.pending) {
      this.pending = point;
      this.pendingLogical = param.logical ?? null;
      this.preview = FIBISH.has(this.tool) ? new FibRetracement(point, point, FIB_COLOR)
        : RECTISH.has(this.tool) ? new Rectangle(point, point, TOOL_COLOR)
        : RANGE_VARIANT[this.tool] ? new Measure(point, point, 0, TOOL_COLOR, RANGE_VARIANT[this.tool])
        : new TrendLine(point, point, TOOL_COLOR);
      this.series.attachPrimitive(this.preview);
      return;
    }
    const a = this.pending, b = point;
    const barCount = this.pendingLogical != null && param.logical != null ? Math.round(Math.abs(param.logical - this.pendingLogical)) : 0;
    this.pending = null;
    this.pendingLogical = null;
    this.clearPreview();
    this.commitTwoPoint(this.tool, a, b, barCount);
    this.setTool("cursor");
  };

  private commitTwoPoint(tool: ToolKind, a: DrawPointT, b: DrawPointT, barCount: number) {
    const id = `${tool}-${Date.now()}`;
    const sa = { time: String(a.time), price: a.price }, sb = { time: String(b.time), price: b.price };
    if (FIBISH.has(tool)) { this.commit({ id, type: "fib", a: sa, b: sb }); return; }
    if (RECTISH.has(tool)) { this.commit({ id, type: "rect", a: sa, b: sb }); return; }
    if (RANGE_VARIANT[tool]) { this.commit({ id, type: "range", variant: RANGE_VARIANT[tool]!, a: sa, b: sb, barCount }); return; }
    if (POSITION.has(tool)) {
      const dir: 1 | -1 = tool === "long" ? 1 : -1;
      const risk = Math.abs(b.price - a.price) || Math.max(1, a.price * 0.01);
      this.commit({ id, type: "position", dir, a: sa, b: sb, entry: a.price, target: a.price + dir * risk * 2, stop: a.price - dir * risk });
      return;
    }
    if (tool === "ray") {
      const i1 = this.indexOf(a.time), i2 = this.indexOf(b.time);
      const slope = i2 === i1 ? 0 : (b.price - a.price) / (i2 - i1);
      const lastIdx = this.rows.length - 1;
      this.commit({ id, type: "ray", a: sa, b: { time: String(this.lastDate()), price: a.price + slope * (lastIdx - i1) } });
      return;
    }
    if (tool === "ext" || tool === "angle") {
      const i1 = this.indexOf(a.time), i2 = this.indexOf(b.time);
      const slope = i2 === i1 ? 0 : (b.price - a.price) / (i2 - i1);
      const lastIdx = this.rows.length - 1;
      this.commit({
        id, type: "extended",
        a: { time: String(this.firstDate()), price: a.price - slope * i1 },
        b: { time: String(this.lastDate()), price: a.price + slope * (lastIdx - i1) },
      });
      return;
    }
    // Fallback: a plain two-point segment -- Trend Line itself, and every
    // brush/arrow/shape/pattern/Elliott/XABCD entry with no bespoke
    // geometry (same fallback the source design's own onChartClick uses).
    this.commit({ id, type: "trend", a: sa, b: sb });
  }

  private commit(stored: StoredRecord) {
    this.place(stored);
    this.persist();
    this.emit();
  }

  private onMove = (param: MouseEventParams) => {
    if (!this.pending || !this.preview || !param.point || param.time == null) return;
    const price = this.series.coordinateToPrice(param.point.y);
    if (price == null) return;
    if (this.preview instanceof Measure) {
      const barCount = this.pendingLogical != null && param.logical != null ? Math.round(Math.abs(param.logical - this.pendingLogical)) : 0;
      this.preview.setEnd({ time: param.time, price }, barCount);
    } else {
      this.preview.setEndPoint({ time: param.time, price });
    }
  };

  private hitTest(px: number, py: number): string | null {
    const ts = this.chart.timeScale();
    const found = this.placed.find(({ stored }) => {
      if (stored.type === "hline") {
        const y = this.series.priceToCoordinate(stored.price);
        return y != null && Math.abs(py - y) <= HIT_TOLERANCE;
      }
      if (stored.type === "vline" || stored.type === "crossline") {
        const x = ts.timeToCoordinate(stored.at.time as Time);
        return x != null && Math.abs(px - x) <= HIT_TOLERANCE;
      }
      if (stored.type === "text") {
        const x = ts.timeToCoordinate(stored.at.time as Time), y = this.series.priceToCoordinate(stored.at.price);
        return x != null && y != null && Math.abs(px - x) <= 40 && py <= y + HIT_TOLERANCE && py >= y - 20;
      }
      if (stored.type === "position") {
        const x1 = ts.timeToCoordinate(stored.a.time as Time), x2 = ts.timeToCoordinate(stored.b.time as Time);
        const yE = this.series.priceToCoordinate(stored.entry), yT = this.series.priceToCoordinate(stored.target), yS = this.series.priceToCoordinate(stored.stop);
        if (x1 == null || x2 == null || yE == null || yT == null || yS == null) return false;
        const ys = [yE, yT, yS];
        return px >= Math.min(x1, x2) - HIT_TOLERANCE && px <= Math.max(x1, x2) + HIT_TOLERANCE
          && py >= Math.min(...ys) - HIT_TOLERANCE && py <= Math.max(...ys) + HIT_TOLERANCE;
      }
      if (stored.type === "avwap") {
        const anchorIdx = this.rows.findIndex((r) => r.date === stored.at.time);
        if (anchorIdx === -1) return false;
        const points = computeVwapFromAnchor(this.rows, anchorIdx);
        return points.some((p) => {
          const x = ts.timeToCoordinate(this.rows[p.idx].date as Time), y = this.series.priceToCoordinate(p.vwap);
          return x != null && y != null && Math.abs(px - x) <= HIT_TOLERANCE && Math.abs(py - y) <= HIT_TOLERANCE;
        });
      }
      const x1 = ts.timeToCoordinate(stored.a.time as Time), y1 = this.series.priceToCoordinate(stored.a.price);
      const x2 = ts.timeToCoordinate(stored.b.time as Time), y2 = this.series.priceToCoordinate(stored.b.price);
      if (x1 == null || y1 == null || x2 == null || y2 == null) return false;
      if (stored.type === "trend" || stored.type === "ray" || stored.type === "extended" || stored.type === "range") {
        return distToSegment(px, py, x1, y1, x2, y2) <= HIT_TOLERANCE;
      }
      if (stored.type === "rect") {
        return px >= Math.min(x1, x2) - HIT_TOLERANCE && px <= Math.max(x1, x2) + HIT_TOLERANCE
          && py >= Math.min(y1, y2) - HIT_TOLERANCE && py <= Math.max(y1, y2) + HIT_TOLERANCE;
      }
      // fib: hit if within the anchors' x-span and near any of the 7 levels
      if (px < Math.min(x1, x2) - HIT_TOLERANCE || px > Math.max(x1, x2) + HIT_TOLERANCE) return false;
      const span = stored.b.price - stored.a.price;
      return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].some((r) => {
        const y = this.series.priceToCoordinate(stored.a.price + span * r);
        return y != null && Math.abs(py - y) <= HIT_TOLERANCE;
      });
    });
    return found?.id ?? null;
  }
}

function labelFor(type: StoredRecord["type"]): string {
  const names: Record<StoredRecord["type"], string> = {
    trend: "Trend Line", ray: "Ray", extended: "Extended Line", hline: "Horizontal Line",
    vline: "Vertical Line", crossline: "Crossline", fib: "Fib Retracement", rect: "Rectangle",
    range: "Range", position: "Position", avwap: "Anchored VWAP", text: "Text",
  };
  return names[type] ?? "Drawing";
}
