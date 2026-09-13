// Fibonacci retracement drawing primitive: standard 0/23.6/38.2/50/61.8/78.6/100
// levels between two anchor points (a swing high and low), each level drawn
// as a horizontal segment spanning just the two anchors' time range (not the
// full pane) with a "{level}% {price}" label -- TradingView's own default
// span for this tool. Pattern adapted from TradingView's plugin-examples
// (Apache-2.0); no official fib-retracement example ships in that repo, so
// this reuses the same renderer/view/PluginBase shape as trend-line instead
// of a 1:1 port.
import type { Coordinate, IPrimitivePaneRenderer, IPrimitivePaneView, Time } from "lightweight-charts";
import { PluginBase, type PaneRendererTarget } from "../lwcToolkitHelpers";
import { formatPrice } from "@/lib/format/number";

export type DrawPoint = { time: Time; price: number };
const LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

type LevelLine = { x1: Coordinate | null; x2: Coordinate | null; y: Coordinate | null; ratio: number; price: number };

class FibRenderer implements IPrimitivePaneRenderer {
  constructor(private lines: LevelLine[], private color: string) {}
  draw(target: PaneRendererTarget) {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      this.lines.forEach((l) => {
        if (l.x1 == null || l.x2 == null || l.y == null) return;
        const x1 = Math.round(l.x1 * scope.horizontalPixelRatio), x2 = Math.round(l.x2 * scope.horizontalPixelRatio);
        const y = Math.round(l.y * scope.verticalPixelRatio);
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = l.ratio === 0 || l.ratio === 1 ? 1 : 0.6;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.min(x1, x2), y);
        ctx.lineTo(Math.max(x1, x2), y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        const label = `${(l.ratio * 100).toFixed(1)}% ${formatPrice(l.price)}`;
        ctx.font = `${Math.round(10.5 * scope.verticalPixelRatio)}px var(--font-mono, monospace)`;
        ctx.fillStyle = this.color;
        ctx.textBaseline = "bottom";
        ctx.fillText(label, Math.max(x1, x2) + 4 * scope.horizontalPixelRatio, y - 2 * scope.verticalPixelRatio);
      });
    });
  }
}

class FibView implements IPrimitivePaneView {
  lines: LevelLine[] = [];
  constructor(private source: FibRetracement) {}
  update() {
    const s = this.source;
    const x1 = s.chart.timeScale().timeToCoordinate(s.a.time);
    const x2 = s.chart.timeScale().timeToCoordinate(s.b.time);
    const span = s.b.price - s.a.price;
    this.lines = LEVELS.map((ratio) => {
      const price = s.a.price + span * ratio;
      return { x1, x2, y: s.series.priceToCoordinate(price), ratio, price };
    });
  }
  renderer() { return new FibRenderer(this.lines, this.source.color); }
}

export class FibRetracement extends PluginBase {
  private view = new FibView(this);
  constructor(public a: DrawPoint, public b: DrawPoint, public color: string) { super(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
  /** Live-drag the second anchor while previewing -- see TrendLine.setEndPoint. */
  setEndPoint(b: DrawPoint) { this.b = b; this.view.update(); this.requestUpdate(); }
}
