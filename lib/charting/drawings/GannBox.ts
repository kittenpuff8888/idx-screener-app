// Gann Box drawing primitive: an outer rectangle between two anchors (same
// as Rectangle.ts) subdivided by an internal 1/4-1/2-3/4 grid in both
// directions -- the shared geometry behind TradingView's "Gann Box",
// "Gann Square Fixed" and "Gann Square" tools, which render near-identically
// (a price/time box with an internal grid) and differ mainly in anchoring
// convenience, not drawn geometry. Grid lines are interpolated directly in
// pixel space between the two corners (not time/price), which is correct
// for a grid subdividing a box -- no per-gridline time lookup needed.
import type { IPrimitivePaneRenderer, IPrimitivePaneView } from "lightweight-charts";
import { PluginBase, positionsBox, type PaneRendererTarget } from "../lwcToolkitHelpers";
import type { DrawPoint } from "./TrendLine";

type ViewPoint = { x: number | null; y: number | null };

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const GRID_FRACTIONS = [0.25, 0.5, 0.75];

class GannBoxRenderer implements IPrimitivePaneRenderer {
  constructor(private p1: ViewPoint, private p2: ViewPoint, private color: string, private width: number) {}
  draw(target: PaneRendererTarget) {
    target.useBitmapCoordinateSpace((scope) => {
      if (this.p1.x == null || this.p1.y == null || this.p2.x == null || this.p2.y == null) return;
      const ctx = scope.context;
      const h = positionsBox(this.p1.x, this.p2.x, scope.horizontalPixelRatio);
      const v = positionsBox(this.p1.y, this.p2.y, scope.verticalPixelRatio);
      ctx.fillStyle = hexToRgba(this.color, 0.06);
      ctx.fillRect(h.position, v.position, h.length, v.length);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.width * scope.horizontalPixelRatio;
      ctx.strokeRect(h.position, v.position, h.length, v.length);
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1 * scope.horizontalPixelRatio;
      GRID_FRACTIONS.forEach((f) => {
        const x = Math.round((this.p1.x! + (this.p2.x! - this.p1.x!) * f) * scope.horizontalPixelRatio);
        ctx.beginPath(); ctx.moveTo(x, v.position); ctx.lineTo(x, v.position + v.length); ctx.stroke();
        const y = Math.round((this.p1.y! + (this.p2.y! - this.p1.y!) * f) * scope.verticalPixelRatio);
        ctx.beginPath(); ctx.moveTo(h.position, y); ctx.lineTo(h.position + h.length, y); ctx.stroke();
      });
      ctx.globalAlpha = 1;
    });
  }
}

class GannBoxView implements IPrimitivePaneView {
  p1: ViewPoint = { x: null, y: null };
  p2: ViewPoint = { x: null, y: null };
  constructor(private source: GannBox) {}
  update() {
    const s = this.source;
    this.p1 = { x: s.chart.timeScale().timeToCoordinate(s.a.time), y: s.series.priceToCoordinate(s.a.price) };
    this.p2 = { x: s.chart.timeScale().timeToCoordinate(s.b.time), y: s.series.priceToCoordinate(s.b.price) };
  }
  renderer() { return new GannBoxRenderer(this.p1, this.p2, this.source.color, this.source.width); }
}

export class GannBox extends PluginBase {
  private view = new GannBoxView(this);
  constructor(public a: DrawPoint, public b: DrawPoint, public color: string, public width = 1.5, public style: "solid" | "dashed" | "dotted" = "solid") { super(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
  setEndPoint(b: DrawPoint) { this.b = b; this.view.update(); this.requestUpdate(); }
  setStyle(color: string, width: number, _style: "solid" | "dashed" | "dotted") { this.color = color; this.width = width; this.requestUpdate(); }
}
