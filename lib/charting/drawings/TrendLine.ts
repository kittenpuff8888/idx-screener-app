// Trend line drawing primitive -- adapted from TradingView's own
// plugin-examples (trend-line, Apache-2.0): two anchor points in time/price
// space, rendered as a line with a price label at each end that stays put as
// the chart pans/zooms (`update()` re-resolves pixel coordinates from the
// live time/price scales every redraw, never caching pixels).
import type { Coordinate, IPrimitivePaneRenderer, IPrimitivePaneView, Time } from "lightweight-charts";
import { PluginBase, type PaneRendererTarget } from "../lwcToolkitHelpers";

export type DrawPoint = { time: Time; price: number };
type ViewPoint = { x: Coordinate | null; y: Coordinate | null };

class TrendLineRenderer implements IPrimitivePaneRenderer {
  constructor(private p1: ViewPoint, private p2: ViewPoint, private color: string) {}
  draw(target: PaneRendererTarget) {
    target.useBitmapCoordinateSpace((scope) => {
      if (this.p1.x == null || this.p1.y == null || this.p2.x == null || this.p2.y == null) return;
      const ctx = scope.context;
      const x1 = Math.round(this.p1.x * scope.horizontalPixelRatio), y1 = Math.round(this.p1.y * scope.verticalPixelRatio);
      const x2 = Math.round(this.p2.x * scope.horizontalPixelRatio), y2 = Math.round(this.p2.y * scope.verticalPixelRatio);
      ctx.lineWidth = 2;
      ctx.strokeStyle = this.color;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      [{ x: x1, y: y1 }, { x: x2, y: y2 }].forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * scope.horizontalPixelRatio, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
      });
    });
  }
}

class TrendLineView implements IPrimitivePaneView {
  p1: ViewPoint = { x: null, y: null };
  p2: ViewPoint = { x: null, y: null };
  constructor(private source: TrendLine) {}
  update() {
    const s = this.source;
    this.p1 = { x: s.chart.timeScale().timeToCoordinate(s.a.time), y: s.series.priceToCoordinate(s.a.price) };
    this.p2 = { x: s.chart.timeScale().timeToCoordinate(s.b.time), y: s.series.priceToCoordinate(s.b.price) };
  }
  renderer() { return new TrendLineRenderer(this.p1, this.p2, this.source.color); }
}

export class TrendLine extends PluginBase {
  private view = new TrendLineView(this);
  constructor(public a: DrawPoint, public b: DrawPoint, public color: string) { super(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
  /** Live-drag the second anchor while previewing (before the second click
      commits it) -- mutating `.b` directly wouldn't repaint on its own since
      `requestUpdate` is only reachable from inside this class hierarchy. */
  setEndPoint(b: DrawPoint) { this.b = b; this.view.update(); this.requestUpdate(); }
}
