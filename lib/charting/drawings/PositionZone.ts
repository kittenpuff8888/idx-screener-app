// Long/short position tool: a reward zone (entry-to-target) and a risk zone
// (entry-to-stop) as two shaded bands between two points in time, an entry
// line, and an R-multiple readout (reward/risk) -- entry/target/stop stay
// live (editable via `setLevels`) after initial placement.
import type { IPrimitivePaneRenderer, IPrimitivePaneView, PrimitivePaneViewZOrder, Time } from "lightweight-charts";
import { PluginBase, type PaneRendererTarget } from "../lwcToolkitHelpers";

export type PositionConfig = {
  t1: Time; t2: Time;
  entry: number; target: number; stop: number;
  fillUp: string; fillDn: string; stroke: string;
};

type BoxCoords = { x1: number; x2: number; yEntry: number; yTarget: number; yStop: number } | null;

class PositionZoneRenderer implements IPrimitivePaneRenderer {
  constructor(private box: BoxCoords, private cfg: PositionConfig) {}
  draw(target: PaneRendererTarget) {
    target.useMediaCoordinateSpace(({ context: ctx }) => {
      const b = this.box;
      if (!b) return;
      const w = Math.max(2, b.x2 - b.x1);
      ctx.fillStyle = this.cfg.fillUp;
      ctx.fillRect(b.x1, Math.min(b.yEntry, b.yTarget), w, Math.abs(b.yTarget - b.yEntry));
      ctx.fillStyle = this.cfg.fillDn;
      ctx.fillRect(b.x1, Math.min(b.yEntry, b.yStop), w, Math.abs(b.yStop - b.yEntry));
      ctx.strokeStyle = this.cfg.stroke;
      ctx.lineWidth = 1;
      ctx.strokeRect(b.x1, Math.min(b.yTarget, b.yStop), w, Math.abs(b.yStop - b.yTarget));
      ctx.beginPath();
      ctx.moveTo(b.x1, b.yEntry);
      ctx.lineTo(b.x2, b.yEntry);
      ctx.stroke();
      const risk = Math.abs(this.cfg.entry - this.cfg.stop), reward = Math.abs(this.cfg.target - this.cfg.entry);
      ctx.font = "10px 'JetBrains Mono', ui-monospace, monospace";
      ctx.fillStyle = this.cfg.stroke;
      ctx.textBaseline = "middle";
      ctx.fillText("R " + (risk ? (reward / risk).toFixed(2) : "—"), b.x1 + 6, b.yEntry - 9);
    });
  }
}

class PositionZoneView implements IPrimitivePaneView {
  box: BoxCoords = null;
  constructor(private source: PositionZone) {}
  update() {
    const s = this.source;
    const ts = s.chart.timeScale();
    const x1 = ts.timeToCoordinate(s.cfg.t1), x2 = ts.timeToCoordinate(s.cfg.t2);
    if (x1 == null || x2 == null) { this.box = null; return; }
    const yEntry = s.series.priceToCoordinate(s.cfg.entry);
    const yTarget = s.series.priceToCoordinate(s.cfg.target);
    const yStop = s.series.priceToCoordinate(s.cfg.stop);
    this.box = yEntry == null || yTarget == null || yStop == null ? null : { x1, x2, yEntry, yTarget, yStop };
  }
  renderer() { return new PositionZoneRenderer(this.box, this.source.cfg); }
  zOrder(): PrimitivePaneViewZOrder { return "normal"; }
}

export class PositionZone extends PluginBase {
  private view = new PositionZoneView(this);
  constructor(public cfg: PositionConfig) { super(); }
  setLevels(entry: number, target: number, stop: number) {
    this.cfg = { ...this.cfg, entry, target, stop };
    this.requestUpdate();
  }
  setStyle(color: string, _width: number, _style: "solid" | "dashed" | "dotted") { this.cfg = { ...this.cfg, stroke: color }; this.requestUpdate(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
}
