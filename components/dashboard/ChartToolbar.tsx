"use client";

import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { DrawingTool, type ToolKind } from "@/lib/charting/DrawingTool";

// Left vertical drawing-tool rail -- a dedicated column beside the chart
// (shares var(--panel) with the chart's own canvas background, no border/
// box of its own), matching TradingView's own left toolbar: a Cross
// cursor, six group buttons each opening a flyout of that group's tools
// (mirroring TradingView's drawing-tool menus -- Lines, Gann & Fibonacci,
// Patterns, Forecasting & measurement, Brushes/arrows/shapes, Annotation),
// then Measure, Magnet, Lock, Hide drawings, Remove drawings.
const ICON: CSSProperties = { width: 19, height: 19, flex: "none" };

// Icon path data, ported directly from the reference design (data, not
// logic) -- one `d` per tool id referenced from GROUPS below.
const P: Record<string, string> = {
  cross: "M14 4v20M4 14h20",
  diag: "M4 20 20 4", horiz: "M3 12h18", vert: "M12 3v18",
  ray: "M4 20 20 4M20 4h-5", ext: "M2 22 22 2", angle: "M5 19h14M5 19 17 7",
  hray: "M4 12h16M6 12a2 2 0 1 0 0 .01", rect: "M4 7h16v10H4z", rrect: "M7 5 19 9l-2 10L5 15z",
  fib: "M3 5h18M3 10h18M3 14h18M3 19h18", fibext: "M3 19h9M6 14h12M9 9h12M12 4h9",
  fibch: "M3 20 15 4M7 21 19 5M11 22 23 6", fibtime: "M5 4v16M10 4v16M15 4v16M20 4v16",
  fan: "M4 20 20 4M4 20h16M4 20 12 4", circles: "M12 12a8 8 0 1 0 .01 0M12 12a4 4 0 1 0 .01 0",
  spiral: "M12 12a3 3 0 1 1 3 3 6 6 0 1 1-6-6 9 9 0 1 1 9 9",
  arcs: "M4 20a8 8 0 0 1 8-8M4 20a14 14 0 0 1 14-14", wedge: "M4 20 20 4M4 20l14 2",
  gann: "M4 4h16v16H4zM4 12h16M12 4v16", gfan: "M4 20 20 4M4 20h16M4 20l10 4",
  long: "M4 9h16M4 15h16M8 9v6", short: "M4 15h16M4 9h16M8 15v-6",
  forecast: "M6 4v16M10 7v10M14 5v14M18 9v6", bars: "M6 8v8M10 5v14M14 9v6M18 6v12",
  ghost: "M4 16c2 0 2-4 4-4s2 4 4 4 2-4 4-4", sector: "M6 20V6l12 14z",
  avwap: "M12 4v16M8 8v8M16 7v10", profile: "M4 6h8M4 10h13M4 14h6M4 18h10",
  aprofile: "M4 10h10M4 14h6M16 6v12", prange: "M12 4v16M8 4h8M8 20h8",
  drange: "M4 12h16M4 8v8M20 8v8", dprange: "M4 4h16v16H4zM4 12h16M12 4v16",
  brush: "M4 20c4 0 6-2 8-6s4-6 8-6", highlight: "M4 20h7l9-9-4-4-9 9z",
  arrowMark: "M5 19 19 5m0 0h-6m6 0v6", arrow: "M4 20 20 4m0 0h-7m7 0v7",
  up: "M12 20V5m0 0-5 5m5-5 5 5", down: "M12 4v15m0 0 5-5m-5 5-5-5",
  path: "M4 18c4 0 4-8 8-8s4 6 8 6", circle: "M12 4a8 8 0 1 0 .01 0", ellipse: "M12 7c5 0 9 2 9 5s-4 5-9 5-9-2-9-5 4-5 9-5",
  poly: "M5 18 9 7l6 5 5-8", tri: "M12 5 20 19H4z", arc: "M4 19a10 10 0 0 1 16 0",
  curve: "M4 18c5 0 6-12 16-12", dcurve: "M3 17c4 0 4-8 8-8s5 8 9 8",
  text: "M5 6h14M12 6v13", anchoredText: "M6 6h12M12 6v12M4 20h4", note: "M6 4h12v16l-6-4-6 4z",
  callout: "M4 5h16v10H9l-4 4z", priceLabel: "M4 12h10l4-4v8l-4-4", flag: "M7 4v16M7 5h11l-3 4 3 4H7",
  measure: "M4 18 18 4l6 6L10 24z", magnet: "M7 5v9a7 7 0 0 0 14 0V5h-5v9a2 2 0 0 1-4 0V5Z",
  lock: "M7 13h14v10H7z M10 13v-3a4 4 0 0 1 8 0v3", hide: "M3 14s4.5-7 11-7 11 7 11 7-4.5 7-11 7S3 14 3 14Z",
  trash: "M5 9h18M11 9V6h6v3m-9 0 1 15h8l1-15",
  xabcd: "M4 18 9 8l5 7 6-11", cypher: "M5 19 10 6l4 9 5-10", hns: "M3 17 7 9l3 5 2-9 2 9 3-5 4 8",
  abcd: "M4 19 9 9l5 6 6-9", drives: "M4 18 8 9l3 6 3-9 3 7", ell: "M3 18 7 8l3 6 4-10 3 8 4-5",
};

type Row = ["h", string] | [ToolKind, string, string, string];
const GROUPS: Record<string, { title: string; icon: string; rows: Row[] }> = {
  lines: { title: "Lines", icon: "diag", rows: [
    ["h", "Lines"],
    ["trend", "Trendline", "Alt + T", "diag"], ["ray", "Ray", "", "ray"], ["info", "Info line", "", "diag"],
    ["ext", "Extended line", "", "ext"], ["angle", "Trend angle", "", "angle"],
    ["hline", "Horizontal line", "Alt + H", "horiz"], ["hray", "Horizontal ray", "Alt + J", "hray"],
    ["vline", "Vertical line", "Alt + V", "vert"], ["crossline", "Crossline", "Alt + C", "cross"],
  ] },
  fib: { title: "Gann and Fibonacci tools", icon: "fib", rows: [
    ["h", "Fibonacci"],
    ["fib", "Fib retracement", "Alt + F", "fib"], ["fibext", "Trend-based fib extension", "", "fibext"],
    ["fibch", "Fib channel", "", "fibch"], ["fibtime", "Fib time zone", "", "fibtime"],
    ["fan", "Fib speed resistance fan", "", "fan"], ["fibtrendtime", "Trend-based fib time", "", "fibtime"],
    ["circles", "Fib circles", "", "circles"], ["spiral", "Fib spiral", "", "spiral"],
    ["arcs", "Fib speed resistance arcs", "", "arcs"], ["wedge", "Fib wedge", "", "wedge"],
    ["pitchfan", "Pitchfan", "", "fan"],
    ["h", "Gann"],
    ["gannbox", "Gann box", "", "gann"], ["gannsqf", "Gann square fixed", "", "gann"],
    ["gannsq", "Gann square", "", "gann"], ["gannfan", "Gann fan", "", "gfan"],
  ] },
  patterns: { title: "Patterns", icon: "xabcd", rows: [
    ["h", "Patterns"],
    ["xabcd", "XABCD pattern", "", "xabcd"], ["cypher", "Cypher pattern", "", "cypher"],
    ["hns", "Head and shoulders", "", "hns"], ["abcd", "ABCD pattern", "", "abcd"],
    ["tripat", "Triangle pattern", "", "tri"], ["drives", "Three drives pattern", "", "drives"],
    ["h", "Elliott"],
    ["ellimp", "Elliott impulse wave", "", "ell"], ["ellcorr", "Elliott correction wave", "", "ell"],
    ["elltri", "Elliott triangle wave", "", "ell"],
  ] },
  forecast: { title: "Forecasting and measurement tools", icon: "dprange", rows: [
    ["h", "Forecasting"],
    ["long", "Long position", "", "long"], ["short", "Short position", "", "short"],
    ["posfc", "Position forecast", "", "forecast"], ["barspat", "Bars pattern", "", "bars"],
    ["ghost", "Ghost feed", "", "ghost"], ["sector", "Sector", "", "sector"],
    ["h", "Volume-based"],
    ["avwap", "Anchored VWAP", "", "avwap"], ["frvp", "Fixed range volume profile", "", "profile"],
    ["avp", "Anchored volume profile", "", "aprofile"],
    ["h", "Measurers"],
    ["prange", "Price range", "", "prange"], ["drange", "Date range", "", "drange"],
    ["dprange", "Date and price range", "", "dprange"],
  ] },
  shapes: { title: "Brushes, arrows and shapes", icon: "brush", rows: [
    ["h", "Brushes"],
    ["brush", "Brush", "", "brush"], ["highlight", "Highlighter", "", "highlight"],
    ["h", "Arrows"],
    ["arrowmark", "Arrow marker", "", "arrowMark"], ["arrow", "Arrow", "", "arrow"],
    ["arrowup", "Arrow mark up", "", "up"], ["arrowdown", "Arrow mark down", "", "down"],
    ["h", "Shapes"],
    ["rect", "Rectangle", "Alt + Shift + R", "rect"], ["rrect", "Rotated rectangle", "", "rrect"],
    ["path", "Path", "", "path"], ["circle", "Circle", "", "circle"], ["ellipse", "Ellipse", "", "ellipse"],
    ["poly", "Polyline", "", "poly"], ["tri", "Triangle", "", "tri"], ["arc", "Arc", "", "arc"],
    ["curve", "Curve", "", "curve"], ["dcurve", "Double curve", "", "dcurve"],
  ] },
  text: { title: "Annotation tools", icon: "text", rows: [
    ["h", "Text"],
    ["text", "Text", "", "text"], ["anchoredtext", "Anchored text", "", "anchoredText"],
    ["note", "Note", "", "note"], ["callout", "Callout", "", "callout"],
    ["pricelabel", "Price label", "", "priceLabel"], ["flag", "Flag mark", "", "flag"],
  ] },
};
const GROUP_ORDER = ["lines", "fib", "patterns", "forecast", "shapes", "text"];

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 28 28" style={ICON} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

function RailButton({ active, title, onClick, children }: { active: boolean; title: string; onClick: () => void; children: ReactNode }) {
  const [hover, setHover] = useState(false);
  return (
    <button type="button" title={title} onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ width: 32, height: 32, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 7, cursor: "pointer", background: active ? "var(--accent)" : hover ? "var(--soft)" : "transparent", color: active ? "#fff" : "var(--muted)" }}>
      {children}
    </button>
  );
}

export function ChartToolbar({ tool, height }: { tool: DrawingTool | null; height: number }) {
  const [active, setActive] = useState<ToolKind>("cursor");
  const [magnet, setMagnet] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hideAll, setHideAll] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  useEffect(() => {
    if (!tool) return;
    const sync = () => { setActive(tool.getTool()); setMagnet(tool.isMagnet()); setLocked(tool.isLocked()); setHideAll(tool.isHideAll()); };
    sync();
    return tool.onChange(sync);
  }, [tool]);

  if (!tool) return <div style={{ width: 32 + 12 }} />;
  const group = openGroup ? GROUPS[openGroup] : null;

  return (
    <div style={{ position: "relative", width: 32, height, flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingTop: 2, marginRight: 12 }}>
      <RailButton active={active === "cursor"} title="Cross" onClick={() => { tool.setTool("cursor"); setOpenGroup(null); }}><Icon d={P.cross} /></RailButton>
      <div style={{ width: 22, height: 1, margin: "3px 0", background: "var(--hair)" }} />
      {GROUP_ORDER.map((gid) => {
        const g = GROUPS[gid];
        const isActiveGroup = g.rows.some((r) => r[0] !== "h" && r[0] === active);
        return (
          <RailButton key={gid} active={isActiveGroup} title={g.title} onClick={() => setOpenGroup(openGroup === gid ? null : gid)}>
            <Icon d={P[g.icon]} />
          </RailButton>
        );
      })}
      <div style={{ width: 22, height: 1, margin: "3px 0", background: "var(--hair)" }} />
      <RailButton active={active === "measure"} title="Measure" onClick={() => { tool.setTool("measure"); setOpenGroup(null); }}><Icon d={P.measure} /></RailButton>
      <RailButton active={magnet} title="Magnet mode" onClick={() => tool.toggleMagnet()}><Icon d={P.magnet} /></RailButton>
      <RailButton active={locked} title="Lock drawings" onClick={() => tool.toggleLock()}><Icon d={P.lock} /></RailButton>
      <RailButton active={hideAll} title="Hide drawings" onClick={() => tool.toggleHideAll()}><Icon d={P.hide} /></RailButton>
      <RailButton active={false} title="Remove drawings" onClick={() => tool.clearAll()}><Icon d={P.trash} /></RailButton>

      {group ? (
        <div style={{ position: "absolute", left: 38, top: 0, zIndex: 35, width: 300, maxHeight: 520, overflow: "auto", borderRadius: 10, border: "1px solid var(--border)", background: "var(--panel)", boxShadow: "0 20px 48px var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--hair)" }}>
            <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{group.title}</span>
            <button type="button" onClick={() => setOpenGroup(null)} style={{ width: 20, height: 20, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 5, cursor: "pointer", background: "transparent", color: "var(--faint)" }}>
              <svg style={{ flex: "none" }} viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={1.8}><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: "2px 4px 8px" }}>
            {group.rows.map((row, i) => row[0] === "h" ? (
              <div key={i} style={{ padding: "8px 10px 4px", fontSize: 9, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>{row[1]}</div>
            ) : (
              <RowButton key={row[0]} label={row[1]} shortcut={row[2]} iconPath={P[row[3]] ?? P.diag} active={active === row[0]}
                onClick={() => { tool.setTool(row[0] as ToolKind); setOpenGroup(null); }} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RowButton({ label, shortcut, iconPath, active, onClick }: { label: string; shortcut: string; iconPath: string; active: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 7, cursor: "pointer", background: active ? "var(--accent-soft)" : hover ? "var(--soft)" : "transparent" }}>
      <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" style={{ flex: "none", color: "var(--muted)" }}><path d={iconPath} /></svg>
      <span style={{ flex: "1 1 auto", minWidth: 0, fontSize: 12, fontWeight: 500, letterSpacing: ".02em", color: active ? "var(--accent)" : "var(--text)" }}>{label}</span>
      <span style={{ fontSize: 10.5, color: "var(--faint)" }}>{shortcut}</span>
    </div>
  );
}
