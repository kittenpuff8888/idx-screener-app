// VWAP readouts drawn as plain text in the empty right-hand margin past the
// last bar, TradingView-style: "label • price • %from-close", in two
// right-aligned columns (col 0 = the live period, inboard; col 1 = closed
// periods, outboard). Two correctness constraints (learned from the design
// prototype, kept here): de-collide within a column by pushing each row to
// at least one line height below the previous (clustered VWAPs would
// otherwise overlap into unreadable garbage), and drop any row that no
// longer fits the pane rather than letting it spill past the bottom edge.
import type { IPrimitivePaneRenderer, IPrimitivePaneView, PrimitivePaneViewZOrder, Time } from "lightweight-charts";
import { PluginBase, type PaneRendererTarget } from "../lwcToolkitHelpers";

export type MarginLabelItem = { text: string; price: number; col: 0 | 1 };
type LabelRow = { text: string; col: 0 | 1; y: number };

const LINE_HEIGHT = 12;

class MarginLabelsRenderer implements IPrimitivePaneRenderer {
  constructor(private rows: LabelRow[], private x: number | null, private color: string, private font: string) {}
  draw(target: PaneRendererTarget) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const x = this.x;
      if (x == null) return;
      ctx.font = this.font;
      ctx.fillStyle = this.color;
      ctx.textBaseline = "middle";
      const widest = (col: 0 | 1) => this.rows.filter((r) => r.col === col)
        .reduce((w, r) => Math.max(w, ctx.measureText(r.text).width), 0);
      const w0 = widest(0), w1 = widest(1);
      const x1 = mediaSize.width - w1 - 8;
      const x0 = w1 ? x1 - w0 - 14 : mediaSize.width - w0 - 8;
      ([0, 1] as const).forEach((col) => {
        const colRows = this.rows.filter((r) => r.col === col).sort((a, b) => a.y - b.y);
        let prevY = -Infinity;
        for (const r of colRows) {
          const y = Math.max(r.y, prevY + LINE_HEIGHT);
          if (y > mediaSize.height - 4) continue;
          prevY = y;
          ctx.fillText(r.text, Math.max(x, col === 1 ? x1 : x0), y);
        }
      });
    });
  }
}

class MarginLabelsView implements IPrimitivePaneView {
  rows: LabelRow[] = [];
  x: number | null = null;
  constructor(private source: MarginLabels) {}
  update() {
    const s = this.source;
    const ts = s.chart.timeScale();
    const xAnchor = ts.timeToCoordinate(s.anchorTime);
    this.x = xAnchor == null ? null : xAnchor + 16;
    const raw = s.items.map((it) => ({ text: it.text, col: it.col, y: s.series.priceToCoordinate(it.price) }));
    this.rows = [];
    for (const r of raw) if (r.y != null) this.rows.push({ text: r.text, col: r.col, y: r.y });
  }
  renderer() { return new MarginLabelsRenderer(this.rows, this.x, this.source.color, this.source.font); }
  zOrder(): PrimitivePaneViewZOrder { return "top"; }
}

export class MarginLabels extends PluginBase {
  private view = new MarginLabelsView(this);
  constructor(public items: MarginLabelItem[], public anchorTime: Time, public color: string, public font: string) { super(); }
  updateAllViews() { this.view.update(); }
  paneViews() { return [this.view]; }
}
