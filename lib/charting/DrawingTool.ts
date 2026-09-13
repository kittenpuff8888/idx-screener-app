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
import { loadDrawings, saveDrawings, type StoredDrawing } from "./drawingStore";

export type ToolKind = "cursor" | "trend" | "hline" | "fib" | "erase";
export const TOOL_COLOR = "#2962FF";

type Placed = { id: string; stored: StoredDrawing; primitive: TrendLine | HorizontalLine | FibRetracement };
type DrawPoint = { time: Time; price: number };

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
  private preview: TrendLine | FibRetracement | null = null;
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
    let primitive: TrendLine | HorizontalLine | FibRetracement;
    if (stored.type === "trend") primitive = new TrendLine({ time: stored.a.time as Time, price: stored.a.price }, { time: stored.b.time as Time, price: stored.b.price }, TOOL_COLOR);
    else if (stored.type === "fib") primitive = new FibRetracement({ time: stored.a.time as Time, price: stored.a.price }, { time: stored.b.time as Time, price: stored.b.price }, TOOL_COLOR);
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
    if (this.tool === "trend" || this.tool === "fib") {
      if (!this.pending) {
        this.pending = point;
        this.preview = this.tool === "trend"
          ? new TrendLine(point, point, TOOL_COLOR)
          : new FibRetracement(point, point, TOOL_COLOR);
        this.series.attachPrimitive(this.preview);
      } else {
        const id = `${this.tool}-${Date.now()}`;
        this.place(this.tool === "trend"
          ? { id, type: "trend", a: { time: String(this.pending.time), price: this.pending.price }, b: { time: String(point.time), price: point.price } }
          : { id, type: "fib", a: { time: String(this.pending.time), price: this.pending.price }, b: { time: String(point.time), price: point.price } });
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
    this.preview.setEndPoint({ time: param.time, price });
  };

  private eraseNear(px: number, py: number) {
    const TOL = 6;
    const ts = this.chart.timeScale();
    const hitIdx = this.placed.findIndex(({ stored }) => {
      if (stored.type === "hline") {
        const y = this.series.priceToCoordinate(stored.price);
        return y != null && Math.abs(py - y) <= TOL;
      }
      const x1 = ts.timeToCoordinate(stored.a.time as Time), y1 = this.series.priceToCoordinate(stored.a.price);
      const x2 = ts.timeToCoordinate(stored.b.time as Time), y2 = this.series.priceToCoordinate(stored.b.price);
      if (x1 == null || y1 == null || x2 == null || y2 == null) return false;
      if (stored.type === "trend") return distToSegment(px, py, x1, y1, x2, y2) <= TOL;
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
