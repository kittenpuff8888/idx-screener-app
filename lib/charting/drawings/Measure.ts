// Measure tool: two clicks (start, end) draw a line between them plus a
// label reporting price delta ($ and %) and the bar count between the two
// points -- TradingView's own Measure tool reports the same three numbers.
import type { Coordinate, IPrimitivePaneRenderer, IPrimitivePaneView } from "lightweight-charts";
import { PluginBase, type PaneRendererTarget } from "../lwcToolkitHelpers";
import { formatPrice, formatPercent } from "@/lib/format/number";
import type { DrawPoint } from "./TrendLine";

type ViewPoint = { x: Coordinate | null; y: Coordinate | null };

class MeasureRenderer implements IPrimitivePaneRenderer {
  constructor(private p1: ViewPoint, private p2: ViewPoint, private label: string, private color: string) {}
  draw(target: PaneRendererTarget) {
    target.useBitmapCoordinateSpace((scope) => {
      if (this.p1.x == null || this.p1.y == null || this.p2.x == null || this.p2.y == null) return;
      const ctx = scope.context;
      const x1 = this.p1.x * scope.horizontalPixelRatio, y1 = this.p1.y * scope.verticalPixelRatio;
      const x2 = this.p2.x * scope.horizontalPixelRatio, y2 = this.p2.y * scope.verticalPixelRatio;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.5 * scope.horizontalPixelRatio;
      ctx.setLineDash([4 * scope.horizontalPixelRatio, 3 * scope.horizontalPixelRatio]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      [{ x: x1, y: y1 }, { x: x2, y: y2 }].forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3 * scope.horizontalPixelRatio, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
      });
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      ctx.font = `${Math.round(11 * scope.verticalPixelRatio)}px var(--font-mono, monospace)`;
      const padX = 6 * scope.horizontalPixelRatio, padY = 4 * scope.verticalPixelRatio;
      const w = ctx.measureText(this.label).width + padX * 2;
      const h = 16 * scope.verticalPixelRatio + padY;
      ctx.fillStyle = this.color;
      ctx.fillRect(mx - w / 2, my - h / 2, w, h);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.label, mx, my);
      ctx.textAlign = "start";
    });
  }
}

class MeasureView implements IPrimitivePaneView {
  p1: ViewPoint = { x: null, y: null };
  p2: ViewPoint = { x: null, y: null };
  constructor(private source: Measure) {}
  update() {
    const s = this.source;
    this.p1 = { x: s.chart.timeScale().timeToCoordinate(s.a.time), y: s.series.priceToCoordinate(s.a.price) };
    this.p2 = { x: s.chart.timeScale().timeToCoordinate(s.b.time), y: s.series.priceToCoordinate(s.b.price) };
  }
  renderer() {
    const delta = this.source.b.price - this.source.a.price;
    const pct = this.source.a.price !== 0 ? delta / this.source.a.price : 0;
    const bars = this.source.barCount;
    const label = `${delta >= 0 ? "+" : ""}${formatPrice(delta)} (${formatPercent(pct)})  ${bars} bars`;
    return new MeasureRenderer(this.p1, this.p2, label, this.source.color);
  }
}

export class Measure extends PluginBase {
  private view = new MeasureView(this);
  constructor(public a: DrawPoint, public b: DrawPoint, public barCount: number, public color: string) { super(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
  setEnd(b: DrawPoint, barCount: number) { this.b = b; this.barCount = barCount; this.view.update(); this.requestUpdate(); }
}
