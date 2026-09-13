"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { DrawingTool, type ToolKind } from "@/lib/charting/DrawingTool";

// Left vertical drawing-tool strip -- a dedicated column beside the chart
// (not an overlay on top of it), matching the reference chart's own left
// toolbar layout without colliding with the pane-corner indicator labels
// that live at the same top-left corner of the plot area. Short text labels
// (same convention as this file's own VWAP anchor buttons: Q/M/W/Y) rather
// than icon glyphs -- reliable across fonts, no icon set to maintain.
const TOOLS: Array<{ id: ToolKind; label: string; title: string }> = [
  { id: "cursor", label: "•", title: "Cursor" },
  { id: "trend", label: "TL", title: "Trend Line -- click a start point, then an end point" },
  { id: "hline", label: "H", title: "Horizontal Line -- click a price level" },
  { id: "fib", label: "FIB", title: "Fibonacci Retracement -- click a start point, then an end point" },
  { id: "erase", label: "ER", title: "Erase -- click a drawing to remove it" },
];

const BTN: CSSProperties = {
  width: 26, height: 24, fontSize: 10, fontWeight: 800, border: "none", borderRadius: 6, cursor: "pointer",
  background: "transparent", color: "var(--muted)",
};

export function ChartToolbar({ tool, height }: { tool: DrawingTool | null; height: number }) {
  const [active, setActive] = useState<ToolKind>("cursor");
  const [, forceTick] = useState(0);

  useEffect(() => {
    if (!tool) return;
    setActive(tool.getTool());
    return tool.onChange(() => { setActive(tool.getTool()); forceTick((t) => t + 1); });
  }, [tool]);

  if (!tool) return <div style={{ width: 34 }} />;

  return (
    <div style={{ width: 34, height, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "6px 4px", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 8, marginRight: 8 }}>
      {TOOLS.map((t) => (
        <button key={t.id} type="button" title={t.title} onClick={() => tool.setTool(active === t.id ? "cursor" : t.id)}
          style={{ ...BTN, background: active === t.id ? "var(--accent)" : "transparent", color: active === t.id ? "#fff" : "var(--muted)" }}>
          {t.label}
        </button>
      ))}
      <div style={{ width: "100%", height: 1, background: "var(--hair)", margin: "2px 0" }} />
      <button type="button" title="Clear all drawings on this chart" onClick={() => tool.clearAll()}
        disabled={!tool.hasDrawings()}
        style={{ ...BTN, color: tool.hasDrawings() ? "var(--down)" : "var(--faint)", cursor: tool.hasDrawings() ? "pointer" : "default" }}>
        CLR
      </button>
    </div>
  );
}
