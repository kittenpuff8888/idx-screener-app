// RSI overbought/oversold gradient glow -- the one piece of TradingView's
// own built-in "RSI" script not covered by BandFill: a per-bar vertical
// gradient between the RSI value and the 70 (or 30) threshold, opacity
// increasing the deeper into overbought/oversold territory the bar is.
// Literal port of the script's two fill() calls:
//   fill(rsiPlot, midline, 100, 70, top_color=blue@0%, bottom_color=blue@100%)
//   fill(rsiPlot, midline, 30, 0, top_color=red@100%, bottom_color=red@0%)
// Pine's fill() is inherently per-bar (not a smoothed path), so this
// renders one small gradient rectangle per bar rather than a single filled
// curve -- the same visual unit Pine itself draws with.
import type { IPrimitivePaneRenderer, IPrimitivePaneView, PrimitivePaneViewZOrder, Time } from "lightweight-charts";
import { PluginBase, type PaneRendererTarget } from "../lwcToolkitHelpers";

type Bar = { x: number | null; y: number | null };

class RsiGradientRenderer implements IPrimitivePaneRenderer {
  constructor(private bars: Bar[], private barSpacing: number, private yTop: number, private y70: number, private y30: number, private yBottom: number) {}
  draw(target: PaneRendererTarget) {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      const halfW = Math.max(1, (this.barSpacing * scope.horizontalPixelRatio) / 2);
      const yTop = this.yTop * scope.verticalPixelRatio, y70 = this.y70 * scope.verticalPixelRatio;
      const y30 = this.y30 * scope.verticalPixelRatio, yBottom = this.yBottom * scope.verticalPixelRatio;
      for (const bar of this.bars) {
        if (bar.x == null || bar.y == null || Number.isNaN(bar.y)) continue;
        const x = bar.x * scope.horizontalPixelRatio;
        const y = bar.y * scope.verticalPixelRatio;
        if (y < y70) {
          // Overbought: y is smaller (higher price/value) than the y70 pixel
          // row since canvas y grows downward -- fill from the bar's own
          // value up to the 70 line, opaque at the value end, transparent at 70.
          const grad = ctx.createLinearGradient(0, y70, 0, yTop);
          grad.addColorStop(0, "rgba(41,98,255,0)");
          grad.addColorStop(1, "rgba(41,98,255,0.55)");
          ctx.fillStyle = grad;
          ctx.fillRect(x - halfW, Math.max(y, yTop), halfW * 2, y70 - Math.max(y, yTop));
        } else if (y > y30) {
          const grad = ctx.createLinearGradient(0, y30, 0, yBottom);
          grad.addColorStop(0, "rgba(255,80,80,0)");
          grad.addColorStop(1, "rgba(255,80,80,0.55)");
          ctx.fillStyle = grad;
          ctx.fillRect(x - halfW, y30, halfW * 2, Math.min(y, yBottom) - y30);
        }
      }
    });
  }
}

class RsiGradientView implements IPrimitivePaneView {
  bars: Bar[] = [];
  barSpacing = 6;
  yTop = 0; y70 = 0; y30 = 0; yBottom = 0;
  constructor(private source: RsiGradientFill) {}
  update() {
    const s = this.source;
    const ts = s.chart.timeScale();
    this.barSpacing = ts.options().barSpacing;
    this.bars = s.times.map((t, i) => {
      const v = s.values[i];
      return { x: ts.timeToCoordinate(t), y: Number.isNaN(v) ? null : s.series.priceToCoordinate(v) };
    });
    this.yTop = s.series.priceToCoordinate(100) ?? 0;
    this.y70 = s.series.priceToCoordinate(70) ?? 0;
    this.y30 = s.series.priceToCoordinate(30) ?? 0;
    this.yBottom = s.series.priceToCoordinate(0) ?? 0;
  }
  renderer() { return new RsiGradientRenderer(this.bars, this.barSpacing, this.yTop, this.y70, this.y30, this.yBottom); }
  zOrder(): PrimitivePaneViewZOrder { return "bottom"; }
}

export class RsiGradientFill extends PluginBase {
  private view = new RsiGradientView(this);
  constructor(public times: Time[], public values: number[]) { super(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
}
