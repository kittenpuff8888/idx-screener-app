// Horizontal line drawing primitive: one anchor price, drawn full pane width
// (not just a ray) with a small price label pinned to the left edge --
// pattern adapted from TradingView's own plugin-examples (Apache-2.0).
import type { IPrimitivePaneRenderer, IPrimitivePaneView } from "lightweight-charts";
import { PluginBase, positionsLine, type PaneRendererTarget } from "../lwcToolkitHelpers";
import { formatPrice } from "@/lib/format/number";

class HorizontalLineRenderer implements IPrimitivePaneRenderer {
  constructor(private y: number | null, private color: string, private label: string) {}
  draw(target: PaneRendererTarget) {
    target.useBitmapCoordinateSpace((scope) => {
      if (this.y == null) return;
      const ctx = scope.context;
      const { position, length } = positionsLine(this.y, scope.verticalPixelRatio, 2);
      ctx.fillStyle = this.color;
      ctx.fillRect(0, position, scope.bitmapSize.width, length);
      ctx.font = `${Math.round(11 * scope.verticalPixelRatio)}px var(--font-mono, monospace)`;
      const padX = 6 * scope.horizontalPixelRatio, padY = 3 * scope.verticalPixelRatio;
      const w = ctx.measureText(this.label).width + padX * 2;
      const h = 16 * scope.verticalPixelRatio;
      ctx.fillStyle = this.color;
      ctx.fillRect(4 * scope.horizontalPixelRatio, position - h / 2, w, h);
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      ctx.fillText(this.label, 4 * scope.horizontalPixelRatio + padX, position + padY / 2);
    });
  }
}

class HorizontalLineView implements IPrimitivePaneView {
  y: number | null = null;
  constructor(private source: HorizontalLine) {}
  update() { this.y = this.source.series.priceToCoordinate(this.source.price); }
  renderer() { return new HorizontalLineRenderer(this.y, this.source.color, formatPrice(this.source.price)); }
}

export class HorizontalLine extends PluginBase {
  private view = new HorizontalLineView(this);
  constructor(public price: number, public color: string) { super(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
}
