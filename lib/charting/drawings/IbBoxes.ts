// Monthly Initial Balance as TradingView-style boxes: one stroked+filled
// rectangle per month, spanning that month's bars at the IB high/low --
// replaces an earlier continuous-staircase-line rendering (still correct,
// but the redesign calls for boxes specifically, matching the reference
// Pine script's own box + connector-line look more directly for this
// component's purposes). Needs both the series (for y) and the chart (for
// x via its own timeScale), so -- unlike BandFill -- reads `this.chart` too.
import type { IPrimitivePaneRenderer, IPrimitivePaneView, PrimitivePaneViewZOrder, Time } from "lightweight-charts";
import { PluginBase, type PaneRendererTarget } from "../lwcToolkitHelpers";
import type { IbBand } from "@/lib/indicators/initialBalance";

type BoxCoords = { x1: number | null; x2: number | null; yHi: number | null; yLo: number | null };

class IbBoxesRenderer implements IPrimitivePaneRenderer {
  constructor(private boxes: BoxCoords[], private stroke: string, private fill: string, private width: number) {}
  draw(target: PaneRendererTarget) {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.lineWidth = Math.max(1, Math.round(this.width * scope.horizontalPixelRatio));
      for (const b of this.boxes) {
        if (b.x1 == null || b.x2 == null || b.yHi == null || b.yLo == null) continue;
        const x = b.x1 * scope.horizontalPixelRatio;
        const w = Math.max(1, (b.x2 - b.x1) * scope.horizontalPixelRatio);
        const y = b.yHi * scope.verticalPixelRatio;
        const h = Math.max(1, (b.yLo - b.yHi) * scope.verticalPixelRatio);
        ctx.fillStyle = this.fill;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = this.stroke;
        ctx.strokeRect(x, y, w, h);
      }
    });
  }
}

class IbBoxesView implements IPrimitivePaneView {
  boxes: BoxCoords[] = [];
  constructor(private source: IbBoxes) {}
  update() {
    const s = this.source;
    const ts = s.chart.timeScale();
    this.boxes = s.bands.map((b) => ({
      x1: ts.timeToCoordinate(s.rows[b.startIdx].date as Time),
      x2: ts.timeToCoordinate(s.rows[b.endIdx].date as Time),
      yHi: s.series.priceToCoordinate(b.ibHigh),
      yLo: s.series.priceToCoordinate(b.ibLow),
    }));
  }
  renderer() { return new IbBoxesRenderer(this.boxes, this.source.stroke, this.source.fill, this.source.width); }
  zOrder(): PrimitivePaneViewZOrder { return "bottom"; }
}

export class IbBoxes extends PluginBase {
  private view = new IbBoxesView(this);
  constructor(public bands: IbBand[], public rows: Array<{ date: string }>, public stroke: string, public fill: string, public width: number) { super(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
}
