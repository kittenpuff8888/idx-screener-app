// Text annotation: one click, one prompt for the text, placed at that
// time/price anchor.
import type { Coordinate, IPrimitivePaneRenderer, IPrimitivePaneView } from "lightweight-charts";
import { PluginBase, type PaneRendererTarget } from "../lwcToolkitHelpers";
import type { DrawPoint } from "./TrendLine";

type ViewPoint = { x: Coordinate | null; y: Coordinate | null };

class TextRenderer implements IPrimitivePaneRenderer {
  constructor(private p: ViewPoint, private text: string, private color: string) {}
  draw(target: PaneRendererTarget) {
    target.useBitmapCoordinateSpace((scope) => {
      if (this.p.x == null || this.p.y == null) return;
      const ctx = scope.context;
      const x = this.p.x * scope.horizontalPixelRatio, y = this.p.y * scope.verticalPixelRatio;
      ctx.font = `${Math.round(12 * scope.verticalPixelRatio)}px var(--font-mono, monospace)`;
      ctx.fillStyle = this.color;
      ctx.textBaseline = "bottom";
      ctx.fillText(this.text, x + 4 * scope.horizontalPixelRatio, y - 4 * scope.verticalPixelRatio);
    });
  }
}

class TextView implements IPrimitivePaneView {
  p: ViewPoint = { x: null, y: null };
  constructor(private source: TextAnnotation) {}
  update() {
    const s = this.source;
    this.p = { x: s.chart.timeScale().timeToCoordinate(s.at.time), y: s.series.priceToCoordinate(s.at.price) };
  }
  renderer() { return new TextRenderer(this.p, this.source.text, this.source.color); }
}

export class TextAnnotation extends PluginBase {
  private view = new TextView(this);
  constructor(public at: DrawPoint, public text: string, public color: string) { super(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
  setStyle(color: string, _width: number, _style: "solid" | "dashed" | "dotted") { this.color = color; this.requestUpdate(); }
}
