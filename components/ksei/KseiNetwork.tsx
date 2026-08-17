"use client";

import { useEffect, useMemo, useRef } from "react";
import type { InvestorEntry, KseiPayload } from "@/lib/domain/types";

// KSEI connection network (design/4): a canvas force-directed graph anchored on
// a stock or an investor, edges weighted by % ownership. Click a node to
// traverse (multi-hop), drag to pan, scroll to zoom. Ported from the prototype.

type GNode = { id: string; type: "stock" | "inv"; label: string; short?: string; tip?: string; r: number; anchor?: boolean; color?: string; x: number; y: number; vx: number; vy: number };
type GEdge = { a: string; b: string; w: number };
type Graph = { nodes: GNode[]; edges: GEdge[] };
export type Anchor = { type: "stock" | "inv"; id: string };

const TYPE_COLOR: Record<string, string> = { Corporate: "var(--cat-1)", Individual: "var(--cat-2)", Bank: "var(--cat-3)", Securities: "var(--cat-4)", Insurance: "var(--cat-5)", "Mutual Fund": "var(--cat-6)", "Pension Fund": "var(--cat-7)", Other: "var(--cat-8)" };
const initials = (n: string) => n.replace(/PT |TBK|PERSERO|\(|\)/g, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
const normType = (t: string) => (TYPE_COLOR[t] ? t : /Individual/i.test(t) ? "Individual" : /Bank/i.test(t) ? "Bank" : /Corporate/i.test(t) ? "Corporate" : "Other");

class GraphEngine {
  c: HTMLCanvasElement; ctx: CanvasRenderingContext2D; onFocus: (n: GNode) => void;
  nodes: GNode[] = []; edges: GEdge[] = []; adj: Record<string, Set<string>> = {};
  scale = 1; ox = 0; oy = 0; alpha = 1; hover: GNode | null = null; dragging = false; moved = false;
  raf = 0; _lx = 0; _ly = 0; _fitT: ReturnType<typeof setTimeout> | null = null;
  _down!: (e: MouseEvent) => void; _move!: (e: MouseEvent) => void; _up!: (e: MouseEvent) => void; _wheel!: (e: WheelEvent) => void;
  constructor(canvas: HTMLCanvasElement, onFocus: (n: GNode) => void) {
    this.c = canvas; this.ctx = canvas.getContext("2d")!; this.onFocus = onFocus; this._bind();
  }
  _css(v: string) { return getComputedStyle(this.c).getPropertyValue(v).trim() || "#888"; }
  _bind() {
    const c = this.c;
    this._down = (e) => { const p = this._pt(e); this.dragging = true; this.moved = false; this._lx = p.x; this._ly = p.y; c.style.cursor = "grabbing"; };
    this._move = (e) => { const p = this._pt(e); if (this.dragging) { this.ox += p.x - this._lx; this.oy += p.y - this._ly; this._lx = p.x; this._ly = p.y; this.moved = true; this.alpha = Math.max(this.alpha, .15); } else { this.hover = this._hit(p); c.style.cursor = this.hover ? "pointer" : "grab"; } };
    this._up = (e) => { if (this.dragging && !this.moved) { const n = this._hit(this._pt(e)); if (n) this.onFocus?.(n); } this.dragging = false; c.style.cursor = "grab"; };
    this._wheel = (e) => { e.preventDefault(); const p = this._pt(e); this._zoomAt(p.x, p.y, e.deltaY < 0 ? 1.12 : 0.89); };
    c.addEventListener("mousedown", this._down); window.addEventListener("mousemove", this._move); window.addEventListener("mouseup", this._up);
    c.addEventListener("wheel", this._wheel, { passive: false }); c.addEventListener("mouseleave", () => { this.hover = null; });
  }
  _pt(e: MouseEvent) { const r = this.c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  _world(p: { x: number; y: number }) { return { x: (p.x - this.ox) / this.scale, y: (p.y - this.oy) / this.scale }; }
  _hit(p: { x: number; y: number }) { const w = this._world(p); let best: GNode | null = null, bd = 1e9; for (const n of this.nodes) { const d = Math.hypot(n.x - w.x, n.y - w.y); if (d < n.r + 4 && d < bd) { bd = d; best = n; } } return best; }
  _zoomAt(px: number, py: number, f: number) { const nx = (px - this.ox) / this.scale, ny = (py - this.oy) / this.scale; this.scale = Math.min(3, Math.max(.3, this.scale * f)); this.ox = px - nx * this.scale; this.oy = py - ny * this.scale; }
  zoom(f: number) { const r = this.c.getBoundingClientRect(); this._zoomAt(r.width / 2, r.height / 2, f); }
  setGraph(g: Graph) {
    this.nodes = g.nodes; this.edges = g.edges; this.alpha = 1;
    const r = this.c.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2;
    this.nodes.forEach((n, i) => { const a = (i / this.nodes.length) * Math.PI * 2, rad = n.anchor ? 0 : 120; n.x = cx + rad * Math.cos(a) + (Math.random() - .5) * 30; n.y = cy + rad * Math.sin(a) + (Math.random() - .5) * 30; n.vx = 0; n.vy = 0; });
    this.adj = {}; this.nodes.forEach((n) => (this.adj[n.id] = new Set()));
    this.edges.forEach((e) => { this.adj[e.a]?.add(e.b); this.adj[e.b]?.add(e.a); });
    if (this._fitT) clearTimeout(this._fitT); this._fitT = setTimeout(() => this.fit(), 700);
  }
  fit() { const r = this.c.getBoundingClientRect(); if (!this.nodes.length) return; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; this.nodes.forEach((n) => { x0 = Math.min(x0, n.x - n.r); y0 = Math.min(y0, n.y - n.r); x1 = Math.max(x1, n.x + n.r); y1 = Math.max(y1, n.y + n.r); }); const w = x1 - x0, h = y1 - y0, s = Math.min(3, Math.max(.3, Math.min((r.width - 40) / w, (r.height - 40) / h))); this.scale = s; this.ox = r.width / 2 - ((x0 + x1) / 2) * s; this.oy = r.height / 2 - ((y0 + y1) / 2) * s; }
  _byId(id: string) { return this.nodes.find((n) => n.id === id); }
  _step() {
    const n = this.nodes, r = this.c.getBoundingClientRect(), cx = r.width / 2, cy = r.height / 2, k = 64;
    for (let i = 0; i < n.length; i++) for (let j = i + 1; j < n.length; j++) { const a = n[i], b = n[j]; let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy; if (d2 < 25) d2 = 25; const d = Math.sqrt(d2), f = Math.min(6, (k * k) / d2 * 0.9), fx = dx / d * f, fy = dy / d * f; if (!a.anchor) { a.vx += fx; a.vy += fy; } if (!b.anchor) { b.vx -= fx; b.vy -= fy; } }
    for (const e of this.edges) { const a = this._byId(e.a), b = this._byId(e.b); if (!a || !b) continue; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, s = (d - 110) * 0.03, fx = dx / d * s, fy = dy / d * s; if (!a.anchor) { a.vx += fx; a.vy += fy; } if (!b.anchor) { b.vx -= fx; b.vy -= fy; } }
    for (const p of n) { if (p.anchor) { p.x = cx; p.y = cy; continue; } p.vx += (cx - p.x) * 0.01; p.vy += (cy - p.y) * 0.01; p.vx *= .8; p.vy *= .8; const v = Math.hypot(p.vx, p.vy); if (v > 18) { p.vx = p.vx / v * 18; p.vy = p.vy / v * 18; } p.x += p.vx * this.alpha; p.y += p.vy * this.alpha; }
    this.alpha *= 0.99; if (this.alpha < .05) this.alpha = .05;
  }
  _rr(x: number, y: number, w: number, h: number, r: number) { const c = this.ctx; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  _draw() {
    const ctx = this.ctx, r = this.c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (this.c.width !== r.width * dpr || this.c.height !== r.height * dpr) { this.c.width = r.width * dpr; this.c.height = r.height * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
    ctx.save(); ctx.translate(this.ox, this.oy); ctx.scale(this.scale, this.scale);
    const acc = this._css("--accent"), bord = this._css("--border"), txt = this._css("--text");
    const hl = this.hover ? this.adj[this.hover.id] : null;
    for (const e of this.edges) { const a = this._byId(e.a), b = this._byId(e.b); if (!a || !b) continue; const on = !!this.hover && (e.a === this.hover.id || e.b === this.hover.id), dim = !!this.hover && !on; ctx.globalAlpha = dim ? .12 : (on ? .95 : .4); ctx.strokeStyle = on ? acc : bord; ctx.lineWidth = Math.max(.6, Math.min(4, e.w * 4)); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    for (const n of this.nodes) {
      const dim = !!this.hover && n !== this.hover && !(hl && hl.has(n.id)); ctx.globalAlpha = dim ? .25 : 1;
      if (n.type === "stock") { const w = Math.max(30, n.label.length * 7.5 + 14), h = 20; ctx.fillStyle = n.anchor ? acc : this._css("--accentSoft"); this._rr(n.x - w / 2, n.y - h / 2, w, h, 7); ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = acc; ctx.stroke(); ctx.fillStyle = n.anchor ? "#fff" : acc; ctx.font = "800 11px var(--font-mono),monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(n.label, n.x, n.y); }
      else { ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fillStyle = this._css("--panel"); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = n.color || bord; ctx.stroke(); ctx.fillStyle = txt; ctx.font = "700 9px Inter,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(n.short || "", n.x, n.y); }
    }
    ctx.globalAlpha = 1; ctx.restore();
    if (this.hover) { const p = { x: this.hover.x * this.scale + this.ox, y: this.hover.y * this.scale + this.oy }, label = this.hover.tip || this.hover.label; ctx.font = "600 10px Inter,sans-serif"; const tw = ctx.measureText(label).width, bx = Math.min(Math.max(4, p.x - tw / 2 - 6), r.width - tw - 16), by = p.y - this.hover.r * this.scale - 26; ctx.fillStyle = txt; this._rr(bx, by, tw + 12, 18, 5); ctx.fill(); ctx.fillStyle = this._css("--panel"); ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(label, bx + 6, by + 9); }
  }
  start() { const loop = () => { this._step(); this._draw(); this.raf = requestAnimationFrame(loop); }; if (!this.raf) loop(); }
  destroy() { cancelAnimationFrame(this.raf); this.raf = 0; this.c.removeEventListener("mousedown", this._down); window.removeEventListener("mousemove", this._move); window.removeEventListener("mouseup", this._up); this.c.removeEventListener("wheel", this._wheel); }
}

export function KseiNetwork({ ksei, anchor }: { ksei: KseiPayload | null; anchor: Anchor | null }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GraphEngine | null>(null);

  const { stocks, investors } = useMemo(() => {
    const stocks: Record<string, { ticker: string; name: string; holders: Array<{ name: string; type: string; pct: number }> }> = {};
    const investors: Record<string, { type: string; holdings: Array<{ ticker: string; pct: number }> }> = {};
    (ksei?.records || []).forEach((r) => {
      const holders = ((r.investors || []) as InvestorEntry[]).map((h) => ({ name: h.name, type: normType(h.type), pct: Number(h.percentage) || 0 }));
      stocks[r.ticker] = { ticker: r.ticker, name: r.companyName || r.ticker, holders };
      holders.forEach((h) => { (investors[h.name] ||= { type: h.type, holdings: [] }).holdings.push({ ticker: r.ticker, pct: h.pct }); });
    });
    Object.values(investors).forEach((iv) => iv.holdings.sort((a, b) => b.pct - a.pct));
    return { stocks, investors };
  }, [ksei]);

  const builders = useMemo(() => {
    const graphForStock = (ticker: string): Graph => {
      const st = stocks[ticker]; if (!st) return { nodes: [], edges: [] };
      const nodes: GNode[] = [{ id: "S:" + ticker, type: "stock", label: ticker, tip: st.name, r: 16, anchor: true, x: 0, y: 0, vx: 0, vy: 0 }];
      const edges: GEdge[] = []; const seen: Record<string, 1> = {};
      st.holders.filter((h) => h.name !== "MASYARAKAT (PUBLIK)").slice(0, 10).forEach((h) => {
        const iid = "I:" + h.name; if (!seen[iid]) { nodes.push({ id: iid, type: "inv", label: h.name, short: initials(h.name), tip: h.name, r: 11, color: TYPE_COLOR[h.type], x: 0, y: 0, vx: 0, vy: 0 }); seen[iid] = 1; }
        edges.push({ a: "S:" + ticker, b: iid, w: Math.min(1, h.pct / 60) });
      });
      return { nodes, edges };
    };
    const graphForInvestor = (name: string): Graph => {
      const iv = investors[name]; if (!iv) return { nodes: [], edges: [] };
      const nodes: GNode[] = [{ id: "I:" + name, type: "inv", label: name, short: initials(name), tip: name, r: 16, anchor: true, color: TYPE_COLOR[iv.type], x: 0, y: 0, vx: 0, vy: 0 }];
      const edges: GEdge[] = []; const seen: Record<string, 1> = {};
      iv.holdings.slice(0, 8).forEach((o) => {
        const sid = "S:" + o.ticker; if (!seen[sid]) { nodes.push({ id: sid, type: "stock", label: o.ticker, tip: stocks[o.ticker]?.name, r: 12, x: 0, y: 0, vx: 0, vy: 0 }); seen[sid] = 1; }
        edges.push({ a: "I:" + name, b: sid, w: Math.min(1, o.pct / 60) });
        (stocks[o.ticker]?.holders || []).filter((h) => h.name !== name && h.name !== "MASYARAKAT (PUBLIK)").slice(0, 2).forEach((h) => {
          const iid = "I:" + h.name; if (!seen[iid]) { nodes.push({ id: iid, type: "inv", label: h.name, short: initials(h.name), tip: h.name, r: 10, color: TYPE_COLOR[h.type], x: 0, y: 0, vx: 0, vy: 0 }); seen[iid] = 1; }
          edges.push({ a: sid, b: iid, w: Math.min(1, h.pct / 60) });
        });
      });
      return { nodes, edges };
    };
    return { graphForStock, graphForInvestor };
  }, [stocks, investors]);

  const anchorKey = anchor ? `${anchor.type}:${anchor.id}` : "";
  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const eng = new GraphEngine(el, (node) => { eng.setGraph(node.type === "stock" ? builders.graphForStock(node.label) : builders.graphForInvestor(node.label)); });
    engineRef.current = eng;
    if (anchor) eng.setGraph(anchor.type === "stock" ? builders.graphForStock(anchor.id) : builders.graphForInvestor(anchor.id));
    eng.start();
    return () => { eng.destroy(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on anchorKey, not the anchor object identity
  }, [anchorKey, builders]);

  const btn: React.CSSProperties = { width: 26, height: 26, borderRadius: 7, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--muted)", cursor: "pointer", fontSize: 13, lineHeight: "24px", textAlign: "center", padding: 0 };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>CONNECTION NETWORK</span>
        <div style={{ flex: 1 }} />
        <button type="button" title="Zoom in" style={btn} onClick={() => engineRef.current?.zoom(1.2)}>+</button>
        <button type="button" title="Zoom out" style={btn} onClick={() => engineRef.current?.zoom(0.83)}>−</button>
        <button type="button" title="Fit" style={btn} onClick={() => engineRef.current?.fit()}>⤢</button>
        <button type="button" title="Reset" style={btn} onClick={() => anchor && engineRef.current?.setGraph(anchor.type === "stock" ? builders.graphForStock(anchor.id) : builders.graphForInvestor(anchor.id))}>↺</button>
      </div>
      <canvas ref={canvasRef} style={{ width: "100%", height: 320, display: "block", borderRadius: 10, background: "var(--soft)", border: "1px solid var(--hair)", cursor: "grab" }} />
      <div style={{ fontSize: 9.5, color: "var(--faint)", marginTop: 6 }}>Click a node to traverse (multi-hop) · drag to pan · scroll to zoom. Line thickness ∝ % ownership.</div>
    </div>
  );
}
