// Orchestrates the chart's drawing tools: active-tool state, click/hover
// wiring (`chart.subscribeClick`/`subscribeCrosshairMove`, same pattern as
// TradingView's own RectangleDrawingTool plugin example), attaching/
// detaching primitives on the price series, and localStorage persistence
// per ticker. One instance per chart build -- IndicatorCompanion.tsx creates
// a fresh one inside the same effect that (re)builds the chart, so a
// dependency change that rebuilds the chart also rebuilds this from the same
// saved drawings, indistinguishably to the user.
//
// v1 scope, deliberately: click-to-place only, no post-hoc dragging of an
// existing drawing's endpoints (matching the official rectangle-drawing-tool
// example's own scope) -- delete and redraw is the edit workflow. Erase is a
// manual hit-test against each drawing's current pixel geometry (distance to
// a line segment, or to a horizontal/fib level) rather than the primitive
// hitTest()/hoveredObjectId wiring, since we already need that geometry for
// rendering and it's simpler to keep in one place.
import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from "lightweight-charts";
import { TrendLine } from "./drawings/TrendLine";
import { HorizontalLine } from "./drawings/HorizontalLine";
import { FibRetracement } from "./drawings/FibRetracement";
import { Rectangle } from "./drawings/Rectangle";
import { Measure } from "./drawings/Measure";
import { TextAnnotation } from "./drawings/TextAnnotation";
import { loadDrawings, saveDrawings, type StoredDrawing } from "./drawingStore";

export type ToolKind = "cursor" | "trend" | "hline" | "fib" | "rect" | "measure" | "text" | "erase";
export const TOOL_COLOR = "#2962FF";

type TwoPointPrimitive = TrendLine | FibRetracement | Rectangle | Measure;
type Placed = { id: string; stored: StoredDrawing; primitive: TrendLine | HorizontalLine | FibRetracement | Rectangle | Measure | TextAnnotation };
type DrawPoint = { time: Time; price: number };
/** Tool kinds that place via two clicks (start, then end) rather than one;
    "measure" is handled alongside these but separately, since it also
    needs a live bar-count tracked from `param.logical`, not just the two
    endpoints the others use. */
type TwoPointType = "trend" | "fib" | "rect";
const TWO_POINT: Partial<Record<ToolKind, TwoPointType>> = { trend: "trend", fib: "fib", rect: "rect" };

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export class DrawingTool {
  private tool: ToolKind = "cursor";
  private placed: Placed[] = [];
  private pending: DrawPoint | null = null;
  private pendingLogical: number | null = null;
  private preview: TwoPointPrimitive | null = null;
  private listeners = new Set<() => void>();

  constructor(private chart: IChartApi, private series: ISeriesApi<SeriesType>, private symbol: string) {
    this.chart.subscribeClick(this.onClick);
    this.chart.subscribeCrosshairMove(this.onMove);
    this.restore();
  }

  destroy() {
    this.chart.unsubscribeClick(this.onClick);
    this.chart.unsubscribeCrosshairMove(this.onMove);
    this.clearPreview();
    this.placed.forEach((p) => this.series.detachPrimitive(p.primitive));
    this.placed = [];
    this.listeners.clear();
  }

  getTool(): ToolKind { return this.tool; }
  hasDrawings(): boolean { return this.placed.length > 0; }
  onChange(cb: () => void): () => void { this.listeners.add(cb); return () => this.listeners.delete(cb); }
  private emit() { this.listeners.forEach((cb) => cb()); }

  setTool(kind: ToolKind) {
    this.tool = kind;
    this.pending = null;
    this.pendingLogical = null;
    this.clearPreview();
    this.emit();
  }

  clearAll() {
    this.placed.forEach((p) => this.series.detachPrimitive(p.primitive));
    this.placed = [];
    this.persist();
    this.emit();
  }

  private restore() {
    loadDrawings(this.symbol).forEach((d) => this.place(d));
  }

  private persist() {
    saveDrawings(this.symbol, this.placed.map((p) => p.stored));
  }

  private place(stored: StoredDrawing) {
    let primitive: Placed["primitive"];
    if (stored.type === "trend") primitive = new TrendLine({ time: stored.a.time as Time, price: stored.a.price }, { time: stored.b.time as Time, price: stored.b.price }, TOOL_COLOR);
    else if (stored.type === "fib") primitive = new FibRetracement({ time: stored.a.time as Time, price: stored.a.price }, { time: stored.b.time as Time, price: stored.b.price }, TOOL_COLOR);
    else if (stored.type === "rect") primitive = new Rectangle({ time: stored.a.time as Time, price: stored.a.price }, { time: stored.b.time as Time, price: stored.b.price }, TOOL_COLOR);
    else if (stored.type === "measure") primitive = new Measure({ time: stored.a.time as Time, price: stored.a.price }, { time: stored.b.time as Time, price: stored.b.price }, stored.barCount, TOOL_COLOR);
    else if (stored.type === "text") primitive = new TextAnnotation({ time: stored.at.time as Time, price: stored.at.price }, stored.text, TOOL_COLOR);
    else primitive = new HorizontalLine(stored.price, TOOL_COLOR);
    this.series.attachPrimitive(primitive);
    this.placed.push({ id: stored.id, stored, primitive });
  }

  private clearPreview() {
    if (this.preview) { this.series.detachPrimitive(this.preview); this.preview = null; }
  }

  private onClick = (param: MouseEventParams) => {
    if (!param.point || param.time == null) return;
    const price = this.series.coordinateToPrice(param.point.y);
    if (price == null) return;
    const point: DrawPoint = { time: param.time, price };

    if (this.tool === "hline") {
      const id = `hline-${Date.now()}`;
      this.place({ id, type: "hline", price });
      this.persist();
      this.setTool("cursor");
      return;
    }
    if (this.tool === "text") {
      const text = typeof window !== "undefined" ? window.prompt("Annotation text:") : null;
      if (text && text.trim()) {
        const id = `text-${Date.now()}`;
        this.place({ id, type: "text", at: { time: String(point.time), price: point.price }, text: text.trim() });
        this.persist();
      }
      this.setTool("cursor");
      return;
    }
    if (this.tool === "measure") {
      if (!this.pending) {
        this.pending = point;
        this.pendingLogical = param.logical ?? null;
        this.preview = new Measure(point, point, 0, TOOL_COLOR);
        this.series.attachPrimitive(this.preview);
      } else {
        const barCount = this.pendingLogical != null && param.logical != null ? Math.round(Math.abs(param.logical - this.pendingLogical)) : 0;
        const id = `measure-${Date.now()}`;
        this.place({ id, type: "measure", a: { time: String(this.pending.time), price: this.pending.price }, b: { time: String(point.time), price: point.price }, barCount });
        this.persist();
        this.pending = null;
        this.pendingLogical = null;
        this.clearPreview();
        this.setTool("cursor");
      }
      return;
    }
    const twoPointType = TWO_POINT[this.tool];
    if (twoPointType) {
      if (!this.pending) {
        this.pending = point;
        this.preview = twoPointType === "trend" ? new TrendLine(point, point, TOOL_COLOR)
          : twoPointType === "fib" ? new FibRetracement(point, point, TOOL_COLOR)
          : new Rectangle(point, point, TOOL_COLOR);
        this.series.attachPrimitive(this.preview);
      } else {
        const id = `${twoPointType}-${Date.now()}`;
        this.place({ id, type: twoPointType, a: { time: String(this.pending.time), price: this.pending.price }, b: { time: String(point.time), price: point.price } });
        this.persist();
        this.pending = null;
        this.clearPreview();
        this.setTool("cursor");
      }
      return;
    }
    if (this.tool === "erase") {
      this.eraseNear(param.point.x, param.point.y);
    }
  };

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

  private eraseNear(px: number, py: number) {
    const TOL = 6;
    const ts = this.chart.timeScale();
    const hitIdx = this.placed.findIndex(({ stored }) => {
      if (stored.type === "hline") {
        const y = this.series.priceToCoordinate(stored.price);
        return y != null && Math.abs(py - y) <= TOL;
      }
      if (stored.type === "text") {
        const x = ts.timeToCoordinate(stored.at.time as Time), y = this.series.priceToCoordinate(stored.at.price);
        return x != null && y != null && Math.abs(px - x) <= 40 && py <= y + TOL && py >= y - 20;
      }
      const x1 = ts.timeToCoordinate(stored.a.time as Time), y1 = this.series.priceToCoordinate(stored.a.price);
      const x2 = ts.timeToCoordinate(stored.b.time as Time), y2 = this.series.priceToCoordinate(stored.b.price);
      if (x1 == null || y1 == null || x2 == null || y2 == null) return false;
      if (stored.type === "trend" || stored.type === "measure") return distToSegment(px, py, x1, y1, x2, y2) <= TOL;
      if (stored.type === "rect") {
        return px >= Math.min(x1, x2) - TOL && px <= Math.max(x1, x2) + TOL
          && py >= Math.min(y1, y2) - TOL && py <= Math.max(y1, y2) + TOL;
      }
      // fib: hit if within the anchors' x-span and near any of the 7 levels
      if (px < Math.min(x1, x2) - TOL || px > Math.max(x1, x2) + TOL) return false;
      const span = stored.b.price - stored.a.price;
      return [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1].some((r) => {
        const y = this.series.priceToCoordinate(stored.a.price + span * r);
        return y != null && Math.abs(py - y) <= TOL;
      });
    });
    if (hitIdx === -1) return;
    const [hit] = this.placed.splice(hitIdx, 1);
    this.series.detachPrimitive(hit.primitive);
    this.persist();
    this.emit();
  }
}
