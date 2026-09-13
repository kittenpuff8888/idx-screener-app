// Static full-width horizontal band fill between two fixed price levels --
// e.g. an oscillator's 30-70 "neutral zone" background, matching how
// TradingView's own built-in RSI/Stoch RSI studies shade that region.
// Not a user-placed drawing (no click handling); just a lightweight
// ISeriesPrimitive so it can live in the same pane as the oscillator line
// and stay correctly positioned as the chart pans/zooms/resizes.
import type { IPrimitivePaneRenderer, IPrimitivePaneView, PrimitivePaneViewZOrder } from "lightweight-charts";
import { PluginBase, type PaneRendererTarget } from "../lwcToolkitHelpers";

class BandFillRenderer implements IPrimitivePaneRenderer {
  constructor(private yHi: number | null, private yLo: number | null, private color: string) {}
  draw(target: PaneRendererTarget) {
    target.useBitmapCoordinateSpace((scope) => {
      if (this.yHi == null || this.yLo == null) return;
      const ctx = scope.context;
      const top = Math.round(Math.min(this.yHi, this.yLo) * scope.verticalPixelRatio);
      const bottom = Math.round(Math.max(this.yHi, this.yLo) * scope.verticalPixelRatio);
      ctx.fillStyle = this.color;
      ctx.fillRect(0, top, scope.bitmapSize.width, Math.max(1, bottom - top));
    });
  }
}

class BandFillView implements IPrimitivePaneView {
  yHi: number | null = null;
  yLo: number | null = null;
  constructor(private source: BandFill) {}
  update() {
    this.yHi = this.source.series.priceToCoordinate(this.source.hiPrice);
    this.yLo = this.source.series.priceToCoordinate(this.source.loPrice);
  }
  renderer() { return new BandFillRenderer(this.yHi, this.yLo, this.source.color); }
  // Draw beneath the oscillator line and its reference lines, not over them.
  zOrder(): PrimitivePaneViewZOrder { return "bottom"; }
}

export class BandFill extends PluginBase {
  private view = new BandFillView(this);
  constructor(public hiPrice: number, public loPrice: number, public color: string) { super(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
}
