"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DrawingTool, type ToolKind } from "@/lib/charting/DrawingTool";

// Left vertical drawing-tool strip -- a dedicated column beside the chart
// (not an overlay on top of it, so it never collides with the pane-corner
// indicator labels living at the same top-left corner of the plot area),
// with NO background/border of its own: it shares `var(--panel)` with both
// the card and the chart's own canvas background, so it reads as part of
// the chart widget rather than a separate boxed-on control -- the specific
// complaint about the first version of this toolbar.
const ICON: CSSProperties = { width: 18, height: 18 };

function IconCrosshair() {
  return <svg viewBox="0 0 24 24" style={ICON} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
  </svg>;
}
function IconTrendLine() {
  return <svg viewBox="0 0 24 24" style={ICON} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
    <circle cx="5" cy="19" r="2" />
    <circle cx="19" cy="5" r="2" />
    <path d="M6.6 17.4 17.4 6.6" />
  </svg>;
}
function IconHLine() {
  return <svg viewBox="0 0 24 24" style={ICON} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
    <circle cx="4.5" cy="12" r="1.8" />
    <path d="M8 12h13" />
  </svg>;
}
function IconRect() {
  return <svg viewBox="0 0 24 24" style={ICON} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="6" width="16" height="12" rx="1.5" />
  </svg>;
}
function IconFib() {
  return <svg viewBox="0 0 24 24" style={ICON} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
    <path d="M3 5h18M3 9.5h13M3 14h9M3 18.5h15" />
  </svg>;
}
function IconErase() {
  return <svg viewBox="0 0 24 24" style={ICON} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3 21 7 9 19H5v-4Z" />
    <path d="m14 6 4 4" />
  </svg>;
}
function IconTrash() {
  return <svg viewBox="0 0 24 24" style={ICON} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
  </svg>;
}

const TOOLS: Array<{ id: ToolKind; icon: () => ReactNode; title: string }> = [
  { id: "cursor", icon: IconCrosshair, title: "Cursor" },
  { id: "trend", icon: IconTrendLine, title: "Trend Line -- click a start point, then an end point" },
  { id: "hline", icon: IconHLine, title: "Horizontal Line -- click a price level" },
  { id: "rect", icon: IconRect, title: "Rectangle -- click one corner, then the opposite corner" },
  { id: "fib", icon: IconFib, title: "Fibonacci Retracement -- click a start point, then an end point" },
  { id: "erase", icon: IconErase, title: "Erase -- click a drawing to remove it" },
];

function ToolButton({ active, title, onClick, children, dangerHover }: { active: boolean; title: string; onClick: () => void; children: ReactNode; dangerHover?: boolean }) {
  const [hover, setHover] = useState(false);
  const bg = active ? "var(--accent)" : hover ? "var(--soft)" : "transparent";
  const color = active ? "#fff" : hover && dangerHover ? "var(--down)" : hover ? "var(--text)" : "var(--muted)";
  return (
    <button type="button" title={title} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 7, cursor: "pointer", background: bg, color, flex: "none" }}>
      {children}
    </button>
  );
}

export function ChartToolbar({ tool, height }: { tool: DrawingTool | null; height: number }) {
  const [active, setActive] = useState<ToolKind>("cursor");

  useEffect(() => {
    if (!tool) return;
    setActive(tool.getTool());
    return tool.onChange(() => setActive(tool.getTool()));
  }, [tool]);

  if (!tool) return <div style={{ width: 30 + 12 }} />;

  return (
    <div style={{ width: 30, height, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingTop: 2, marginRight: 12 }}>
      {TOOLS.map((t) => (
        <ToolButton key={t.id} active={active === t.id} title={t.title} onClick={() => tool.setTool(active === t.id ? "cursor" : t.id)}>
          <t.icon />
        </ToolButton>
      ))}
      <div style={{ width: 18, height: 1, background: "var(--hair)", margin: "4px 0" }} />
      <ToolButton active={false} dangerHover title="Clear all drawings on this chart" onClick={() => tool.clearAll()}>
        <IconTrash />
      </ToolButton>
    </div>
  );
}
