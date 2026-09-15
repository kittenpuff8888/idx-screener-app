// Generic labeled-segment drawing primitive: N arbitrary (possibly sloped)
// time/price line segments, each with its own optional label -- the shared
// renderer behind Trend-Based Fib Extension, Fib Channel and Gann Fan.
// Those three tools all reduce to "a handful of lines computed from 2-3
// anchor points", differing only in the math that produces the segment
// list (done by the caller, DrawingTool.ts), not in how a segment is drawn
// -- so one renderer replaces three near-identical ones. Style follows
// FibRetracement's own precedent (thin lines, a small price/ratio label
// past the far endpoint) generalized from horizontal-only to any slope.
import type { IPrimitivePaneRenderer, IPrimitivePaneView, Time } from "lightweight-charts";
import { PluginBase, type PaneRendererTarget } from "../lwcToolkitHelpers";

export type DrawPoint = { time: Time; price: number };
export type Seg = { a: DrawPoint; b: DrawPoint; label: string; dashed?: boolean; emphasis?: boolean };

type ViewSeg = { x1: number | null; y1: number | null; x2: number | null; y2: number | null; label: string; dashed?: boolean; emphasis?: boolean };

class LevelLinesRenderer implements IPrimitivePaneRenderer {
  constructor(private segs: ViewSeg[], private color: string) {}
  draw(target: PaneRendererTarget) {
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      this.segs.forEach((s) => {
        if (s.x1 == null || s.y1 == null || s.x2 == null || s.y2 == null) return;
        const x1 = s.x1 * scope.horizontalPixelRatio, y1 = s.y1 * scope.verticalPixelRatio;
        const x2 = s.x2 * scope.horizontalPixelRatio, y2 = s.y2 * scope.verticalPixelRatio;
        ctx.strokeStyle = this.color;
        ctx.globalAlpha = s.emphasis ? 1 : 0.65;
        ctx.lineWidth = (s.emphasis ? 1.5 : 1) * scope.horizontalPixelRatio;
        ctx.setLineDash(s.dashed ? [5, 4].map((d) => d * scope.horizontalPixelRatio) : []);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (s.label) {
          ctx.font = `${Math.round(10.5 * scope.verticalPixelRatio)}px var(--font-mono, monospace)`;
          ctx.fillStyle = this.color;
          ctx.textBaseline = "middle";
          ctx.fillText(s.label, x2 + 4 * scope.horizontalPixelRatio, y2);
        }
      });
    });
  }
}

class LevelLinesView implements IPrimitivePaneView {
  segs: ViewSeg[] = [];
  constructor(private source: LevelLines) {}
  update() {
    const s = this.source;
    const ts = s.chart.timeScale();
    this.segs = s.segs.map((seg) => ({
      x1: ts.timeToCoordinate(seg.a.time), y1: s.series.priceToCoordinate(seg.a.price),
      x2: ts.timeToCoordinate(seg.b.time), y2: s.series.priceToCoordinate(seg.b.price),
      label: seg.label, dashed: seg.dashed, emphasis: seg.emphasis,
    }));
  }
  renderer() { return new LevelLinesRenderer(this.segs, this.source.color); }
}

export class LevelLines extends PluginBase {
  private view = new LevelLinesView(this);
  constructor(public segs: Seg[], public color: string) { super(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
  setStyle(color: string, _width: number, _style: "solid" | "dashed" | "dotted") { this.color = color; this.requestUpdate(); }
}
