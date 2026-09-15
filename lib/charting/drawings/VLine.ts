// A single vertical line at a fixed time -- the shared primitive behind
// every "anchor at one point in time" drawing tool (Vertical line, Crossline,
// and the anchor-only tools that don't get bespoke geometry: Anchored VWAP,
// volume-profile variants, bar/ghost/position-forecast, fib time zones).
import type { IPrimitivePaneRenderer, IPrimitivePaneView, PrimitivePaneViewZOrder, Time } from "lightweight-charts";
import { PluginBase, type PaneRendererTarget } from "../lwcToolkitHelpers";

class VLineRenderer implements IPrimitivePaneRenderer {
  constructor(private x: number | null, private color: string, private dashed: boolean) {}
  draw(target: PaneRendererTarget) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      if (this.x == null) return;
      ctx.save();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1;
      if (this.dashed) ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(this.x, 0);
      ctx.lineTo(this.x, mediaSize.height);
      ctx.stroke();
      ctx.restore();
    });
  }
}

class VLineView implements IPrimitivePaneView {
  x: number | null = null;
  constructor(private source: VLine) {}
  update() { this.x = this.source.chart.timeScale().timeToCoordinate(this.source.time); }
  renderer() { return new VLineRenderer(this.x, this.source.color, this.source.dashed); }
  zOrder(): PrimitivePaneViewZOrder { return "normal"; }
}

export class VLine extends PluginBase {
  private view = new VLineView(this);
  constructor(public time: Time, public color: string, public dashed: boolean) { super(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
  setStyle(color: string, _width: number, _style: "solid" | "dashed" | "dotted") { this.color = color; this.requestUpdate(); }
}
