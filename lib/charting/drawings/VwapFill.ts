// σ envelope fill for one anchored-VWAP period: a filled polygon between an
// upper and lower band series (±1σ or ±2σ) across that period's own bars.
// Media-coordinate space (not bitmap) since it fills an arbitrary polygon
// rather than axis-aligned rects/lines, matching the reference prototype.
import type { IPrimitivePaneRenderer, IPrimitivePaneView, PrimitivePaneViewZOrder, Time } from "lightweight-charts";
import { PluginBase, type PaneRendererTarget } from "../lwcToolkitHelpers";

type FillPoint = { x: number; yU: number; yL: number };

class VwapFillRenderer implements IPrimitivePaneRenderer {
  constructor(private pts: FillPoint[], private color: string) {}
  draw(target: PaneRendererTarget) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      if (this.pts.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(this.pts[0].x, this.pts[0].yU);
      for (let i = 1; i < this.pts.length; i++) ctx.lineTo(this.pts[i].x, this.pts[i].yU);
      for (let i = this.pts.length - 1; i >= 0; i--) ctx.lineTo(this.pts[i].x, this.pts[i].yL);
      ctx.closePath();
      ctx.fillStyle = this.color;
      ctx.fill();
    });
  }
}

class VwapFillView implements IPrimitivePaneView {
  pts: FillPoint[] = [];
  constructor(private source: VwapFill) {}
  update() {
    const s = this.source;
    const ts = s.chart.timeScale();
    const raw = s.times.map((t, i) => ({
      x: ts.timeToCoordinate(t),
      yU: s.series.priceToCoordinate(s.upper[i]),
      yL: s.series.priceToCoordinate(s.lower[i]),
    }));
    this.pts = [];
    for (const p of raw) if (p.x != null && p.yU != null && p.yL != null) this.pts.push({ x: p.x, yU: p.yU, yL: p.yL });
  }
  renderer() { return new VwapFillRenderer(this.pts, this.source.color); }
  zOrder(): PrimitivePaneViewZOrder { return "bottom"; }
}

export class VwapFill extends PluginBase {
  private view = new VwapFillView(this);
  constructor(public times: Time[], public upper: number[], public lower: number[], public color: string) { super(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
}
