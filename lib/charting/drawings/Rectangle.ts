// Rectangle drawing primitive -- adapted from TradingView's own
// plugin-examples (rectangle-drawing-tool, Apache-2.0): two opposite
// corners in time/price space, filled with a translucent tint of the tool
// color so candles underneath stay legible.
import type { IPrimitivePaneRenderer, IPrimitivePaneView } from "lightweight-charts";
import { PluginBase, positionsBox, type PaneRendererTarget } from "../lwcToolkitHelpers";
import type { DrawPoint } from "./TrendLine";

type ViewPoint = { x: number | null; y: number | null };

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

class RectangleRenderer implements IPrimitivePaneRenderer {
  constructor(private p1: ViewPoint, private p2: ViewPoint, private color: string) {}
  draw(target: PaneRendererTarget) {
    target.useBitmapCoordinateSpace((scope) => {
      if (this.p1.x == null || this.p1.y == null || this.p2.x == null || this.p2.y == null) return;
      const ctx = scope.context;
      const h = positionsBox(this.p1.x, this.p2.x, scope.horizontalPixelRatio);
      const v = positionsBox(this.p1.y, this.p2.y, scope.verticalPixelRatio);
      ctx.fillStyle = hexToRgba(this.color, 0.15);
      ctx.fillRect(h.position, v.position, h.length, v.length);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.5 * scope.horizontalPixelRatio;
      ctx.strokeRect(h.position, v.position, h.length, v.length);
    });
  }
}

class RectangleView implements IPrimitivePaneView {
  p1: ViewPoint = { x: null, y: null };
  p2: ViewPoint = { x: null, y: null };
  constructor(private source: Rectangle) {}
  update() {
    const s = this.source;
    this.p1 = { x: s.chart.timeScale().timeToCoordinate(s.a.time), y: s.series.priceToCoordinate(s.a.price) };
    this.p2 = { x: s.chart.timeScale().timeToCoordinate(s.b.time), y: s.series.priceToCoordinate(s.b.price) };
  }
  renderer() { return new RectangleRenderer(this.p1, this.p2, this.source.color); }
}

export class Rectangle extends PluginBase {
  private view = new RectangleView(this);
  constructor(public a: DrawPoint, public b: DrawPoint, public color: string) { super(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
  setEndPoint(b: DrawPoint) { this.b = b; this.view.update(); this.requestUpdate(); }
}
