"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Modal } from "@/components/shared/Modal";
import { normalizeSector } from "@/lib/domain/sectors";
import { asNumber, formatNumber, formatPercent, parseCount } from "@/lib/format/number";

const MONO = "var(--font-mono)";
const KICKER: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };

// mcap is null for a real, KSEI-classified ticker that has a price change but
// no Market Cap anywhere (published or computable) — still shown, at a floor
// size, rather than dropped; see the layoutTickers floor-value comment below.
type Tile = { ticker: string; mcap: number | null; change: number; price: number | null; pe: number | null; yld: number | null; sector: string };
type Sector = { sector: string; count: number; flooredCount: number; weight: number; capChange: number; tiles: Tile[] };
type Rect = { x: number; y: number; w: number; h: number };

// Squarified treemap (Bruls et al.): lay {value} items into a rect at good aspect ratios.
function squarify<T extends { value: number }>(items: T[], x: number, y: number, w: number, h: number): Array<T & { rect: Rect }> {
  const total = items.reduce((s, it) => s + it.value, 0) || 1;
  const area = w * h;
  const scaled = items.map((it) => ({ ref: it, a: (it.value / total) * area }));
  const out: Array<T & { rect: Rect }> = [];
  let rx = x, ry = y, rw = w, rh = h;
  const worst = (row: Array<{ a: number }>, len: number) => {
    const s = row.reduce((a, b) => a + b.a, 0);
    const mx = Math.max(...row.map((r) => r.a)), mn = Math.min(...row.map((r) => r.a));
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  const lay = (row: Array<{ ref: T; a: number }>) => {
    const s = row.reduce((a, b) => a + b.a, 0);
    if (rw >= rh) {
      const cw = s / rh; let cy = ry;
      row.forEach((r) => { const ch = r.a / cw; out.push({ ...r.ref, rect: { x: rx, y: cy, w: cw, h: ch } }); cy += ch; });
      rx += cw; rw -= cw;
    } else {
      const chh = s / rw; let cx = rx;
      row.forEach((r) => { const cw = r.a / chh; out.push({ ...r.ref, rect: { x: cx, y: ry, w: cw, h: chh } }); cx += cw; });
      ry += chh; rh -= chh;
    }
  };
  let row: Array<{ ref: T; a: number }> = [];
  const rest = [...scaled];
  while (rest.length) {
    const len = Math.min(rw, rh) || 1;
    const next = rest[0];
    if (!row.length) { row.push(next); rest.shift(); continue; }
    if (worst(row, len) >= worst([...row, next], len)) { row.push(next); rest.shift(); }
    else { lay(row); row = []; }
  }
  if (row.length) lay(row);
  return out;
}

// Compact market-cap for the tile caption: billions → "258 T" / "87.7 T" / "500 B".
// Keeps the tile from cramming a long raw number (was "Rp 258.282").
function fmtCap(bn: number): string {
  if (bn >= 1000) return `${(bn / 1000).toFixed(bn >= 100000 ? 0 : 1)} T`;
  return `${Math.round(bn)} B`;
}

function tileColor(change: number): string {
  const inten = 0.5 + Math.min(1, Math.abs(change) / 0.045) * 0.45;
  const rgb = change >= 0 ? "37, 99, 235" : "229, 72, 77";
  return `rgba(${rgb}, ${inten.toFixed(3)})`;
}

// Smallest tile a ticker label can render into legibly. Also the threshold the
// compact map uses to decide whether a ticker "fits" at all (see fitTickers).
const MIN_TILE_W = 38, MIN_TILE_H = 18;

// Largest legible font that fits the tile; hide labels that can't fit (hover still surfaces detail).
function labelFit(ticker: string, pxW: number, pxH: number) {
  const fit = (fs: number) => ticker.length * fs * 0.62 <= pxW - 6 && fs + 2 <= pxH;
  const steps: Array<[number, number, number]> = [[15, 110, 56], [13, 80, 46], [11.5, 58, 34], [10, 46, 24], [9, MIN_TILE_W, MIN_TILE_H]];
  let fsT = 0;
  for (const [fs, minW, minH] of steps) { if (pxW >= minW && pxH >= minH && fit(fs)) { fsT = fs; break; } }
  const showTicker = fsT > 0;
  // Cap needs a comfortable third line — hold it back until the tile is tall
  // enough so ticker/pct/cap don't get clipped in the middle.
  return { showTicker, showPct: showTicker && pxW >= 58 && pxH >= 36, showCap: showTicker && pxW >= 96 && pxH >= 74, fsT, fsP: pxH >= 58 ? 11.5 : 10 };
}

const W = 1000, GAP = 2.4, HEAD = 20;

export function MarketMapTreemap() {
  const { bundle, ksei, marketDate, openTicker } = useApp();
  // The fundamentals workbook ships "IDX Sector" as "-", so classify each
  // ticker from the KSEI registry instead (issuer.sector is the display name,
  // e.g. "Energy"). Without this every name collapses into a single "Others".
  const sectorByTicker = useMemo(() => {
    const m = new Map<string, string>();
    ksei?.records.forEach((r) => { if (r.sector && r.sector !== "Others") m.set(r.ticker, r.sector); });
    return m;
  }, [ksei]);
  const [zoom, setZoom] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Every ticker with a real price change is placed on the map — cap-weighted
  // when it has a Market Cap (published, or computed from Price × Shares
  // Outstanding when the field itself reads "-", same fallback as the
  // Dashboard's Leaders/Laggards table), and at a small floor size otherwise
  // (see layoutTickers) rather than dropped. Only a ticker with NEITHER a
  // Market Cap NOR a price change is genuinely unplaceable — that's the only
  // thing counted/disclosed as excluded now.
  const { sectors, excludedCount, excludedBySector } = useMemo(() => {
    const bySector = new Map<string, Tile[]>();
    const excludedBy = new Map<string, number>();
    let excluded = 0;
    bundle?.fundamentals.forEach((raw, ticker) => {
      const change = asNumber(raw["Price Change %"]);
      const price = asNumber(raw["Price"]);
      let mcap = asNumber(raw["Market Cap"]);
      if (mcap === null && price !== null) {
        const sh = parseCount(raw["Current Share Outstanding"]) ?? parseCount(raw["Shares Outstanding"]);
        if (sh !== null) mcap = (price * sh) / 1e9;
      }
      const sector = sectorByTicker.get(ticker) || normalizeSector(String(raw["IDX Sector"] ?? "Others"));
      if (change === null) {
        excluded += 1;
        if (sector !== "Others") excludedBy.set(sector, (excludedBy.get(sector) || 0) + 1);
        return;
      }
      const list = bySector.get(sector) || [];
      list.push({ ticker, mcap: mcap !== null && mcap > 0 ? mcap : null, change, sector, price, pe: asNumber(raw["Current PE Ratio (TTM)"]), yld: asNumber(raw["Latest Dividend · Historical latest · yfinance · Dividend Yield (%)"]) });
      bySector.set(sector, list);
    });
    const sec = [...bySector.entries()]
      .map(([sector, list]) => {
        list.sort((a, b) => (b.mcap ?? 0) - (a.mcap ?? 0));
        const weight = list.reduce((s, t) => s + (t.mcap ?? 0), 0);
        const capChange = weight ? list.reduce((s, t) => s + (t.mcap ?? 0) * t.change, 0) / weight : 0;
        const flooredCount = list.filter((t) => t.mcap === null).length;
        return { sector, count: list.length, flooredCount, weight, capChange, tiles: list };
      })
      .sort((a, b) => b.weight - a.weight);
    return { sectors: sec, excludedCount: excluded, excludedBySector: excludedBy };
  }, [bundle, sectorByTicker]);

  if (!sectors.length) return null;
  const includedCount = sectors.reduce((n, s) => n + s.tiles.length, 0);
  const flooredTotal = sectors.reduce((n, s) => n + s.flooredCount, 0);
  const scannedCount = includedCount + excludedCount;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0 10px", flexWrap: "wrap" }}>
        <span style={KICKER}>MARKET MAP · CAP-WEIGHTED, COLOURED BY % CHANGE</span>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 6, padding: "3px 8px" }}>size ≈ market cap (dampened) · click a sector to see all its tickers · hover for detail</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setDetailsOpen(true)} style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "5px 11px", cursor: "pointer" }}>⤢ Show details · {includedCount} tickers</button>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9.5, color: "var(--faint)" }}>
          <span>−5%</span>
          <span style={{ width: 120, height: 9, borderRadius: 5, background: "linear-gradient(90deg,var(--down),var(--soft),var(--up))", border: "1px solid var(--border)" }} />
          <span>+5%</span>
        </div>
      </div>

      <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))", padding: "14px 16px", marginBottom: 14 }}>
        <TreemapView sectors={sectors} zoom={zoom} setZoom={setZoom} openTicker={openTicker} dropTiny ratio={7 / 16} excludedBySector={excludedBySector} />
        <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 8 }}>
          Fundamentals · {marketDate} · click a tile to open the ticker · tickers too small to label here are folded into &ldquo;Show details&rdquo;. Tile area uses a dampened (square-root) scale so one dominant name never swallows the view — bigger is still bigger, hover for the exact figures.{" "}
          {flooredTotal > 0 ? <>{flooredTotal} of {includedCount} shown tickers have no Market Cap (published or computable) and render at a small floor size instead of being sized by cap.</> : null}
          {excludedCount > 0 ? <> {excludedCount} of {scannedCount} scanned tickers have no price change data at all and can&apos;t be placed on the map.</> : null}
        </div>
      </div>

      {detailsOpen ? (
        <Modal title={`Market Map · ${includedCount} tickers`} kicker={`${marketDate} · cap-weighted, coloured by % change`} onClose={() => setDetailsOpen(false)} maxWidth={1280}>
          <DetailsTreemap sectors={sectors} openTicker={openTicker} onClose={() => setDetailsOpen(false)} excludedCount={excludedCount} flooredTotal={flooredTotal} scannedCount={scannedCount} excludedBySector={excludedBySector} />
        </Modal>
      ) : null}
    </div>
  );
}

/** The details popup gets its own zoom state (always starts at the full
    all-sectors view) and closes before navigating to a ticker. */
function DetailsTreemap({ sectors, openTicker, onClose, excludedCount, flooredTotal, scannedCount, excludedBySector }: { sectors: Sector[]; openTicker: (t: string) => void; onClose: () => void; excludedCount: number; flooredTotal: number; scannedCount: number; excludedBySector: Map<string, number> }) {
  const [zoom, setZoom] = useState<string | null>(null);
  const jump = (ticker: string) => { onClose(); openTicker(ticker); };
  const includedCount = sectors.reduce((n, s) => n + s.tiles.length, 0);
  return (
    <>
      <TreemapView sectors={sectors} zoom={zoom} setZoom={setZoom} openTicker={jump} dropTiny={false} ratio={7 / 16} excludedBySector={excludedBySector} />
      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 10, lineHeight: 1.5 }}>
        Every real ticker with a price change is included here — {includedCount} of {scannedCount} scanned — even ones too small to carry a legible label at this size; hover any tile for its detail, click to open it. Double-click a sector header (or a tile) to zoom into that sector.
        {flooredTotal > 0 ? <> {flooredTotal} of them have no Market Cap (published or computable) and render at a small floor size rather than a cap-weighted one.</> : null}
        {excludedCount > 0 ? <> The remaining {excludedCount} scanned tickers have no price change data at all — a gap upstream — and can&apos;t be placed on the map; they&apos;re not omitted by choice.</> : null}
      </div>
    </>
  );
}

/** One treemap instance: sector bands + ticker tiles + hover tooltip + zoom
    breadcrumb. `dropTiny` reflows each sector's tickers to only the ones large
    enough to carry a legible label (used by the compact card); the details
    popup passes `dropTiny={false}` so nothing is left out. */
function TreemapView({ sectors, zoom, setZoom, openTicker, dropTiny, ratio, excludedBySector }: {
  sectors: Sector[];
  zoom: string | null;
  setZoom: (s: string | null) => void;
  openTicker: (t: string) => void;
  dropTiny: boolean;
  ratio: number;
  excludedBySector: Map<string, number>;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [mapW, setMapW] = useState(900);
  const [tip, setTip] = useState<{ x: number; y: number; t: Tile } | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => setMapW(el.clientWidth || 900);
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Zooming into one sector must show EVERY ticker in it — never drop any,
  // regardless of which parent view (compact card or "Show details") the
  // zoom was triggered from — and give it real room: the box grows taller
  // with ticker count rather than staying pinned to the all-sectors ratio,
  // scrolling internally past a cap so one big sector can't blow out the page.
  const zoomedSector = zoom ? sectors.find((s) => s.sector === zoom) : null;
  const effectiveDropTiny = zoom ? false : dropTiny;
  const ZOOM_BASELINE_COUNT = 14; // ticker count the normal ratio already handles well
  const MAX_SCROLL_PX = 720;
  // Capped, not unbounded: growing the canvas linearly with ticker count (a
  // sector can have 100+ real names now that capless tickers are included
  // too) made one dominant, cap-weighted tile taller than the entire visible
  // viewport before a viewer had scrolled past it at all. A capped multiplier
  // plus the sqrt-dampened tile values below (see layoutTickers) keeps any
  // single name's tile within a reasonable fraction of the first screenful;
  // scrolling is still there, but now only for genuine ticker-count overflow.
  const ZOOM_RATIO_CAP = 2.2;
  const effectiveRatio = zoom && zoomedSector ? ratio * Math.min(ZOOM_RATIO_CAP, Math.max(1, zoomedSector.tiles.length / ZOOM_BASELINE_COUNT)) : ratio;

  const H = W * effectiveRatio;
  const mapH = mapW * effectiveRatio;
  const scrollCapped = zoom !== null && mapH > MAX_SCROLL_PX;
  // Clamp each rect to the container so accumulated squarify rounding can't push a
  // tile past the right/bottom edge (which the container would otherwise shave off).
  const pct = (r: Rect) => {
    const left = Math.max(0, Math.min(100, (r.x / W) * 100));
    const top = Math.max(0, Math.min(100, (r.y / H) * 100));
    const width = Math.max(0, Math.min((r.w / W) * 100, 100 - left));
    const height = Math.max(0, Math.min((r.h / H) * 100, 100 - top));
    return { left: `${left.toFixed(3)}%`, top: `${top.toFixed(3)}%`, width: `${width.toFixed(3)}%`, height: `${height.toFixed(3)}%`, wFrac: r.w / W, hFrac: r.h / H };
  };

  // Lay out one sector's tickers into `inner`. When dropTiny is on: squarify
  // everyone once, drop tickers whose resulting tile can't carry a label, then
  // re-squarify only the survivors into the SAME rect so their tiles grow to
  // fill the freed space (no leftover gaps). Falls back to the single biggest
  // ticker if every one of them would've been dropped, so a sector never
  // renders empty.
  //
  // Tile AREA is √marketCap, not marketCap — a real market is heavy-tailed
  // (one bank can be 30%+ of its whole sector), and sizing linearly meant
  // that one name's "correctly proportioned" tile could still be taller than
  // the entire scrollable viewport before a viewer saw anything else. The
  // square root keeps strict rank order (bigger cap is always a bigger tile)
  // while compressing the spread enough that no single name swallows the
  // view — this is the same dampening real market-map tools use for
  // power-law-distributed caps. A ticker with no computable cap at all gets
  // a small floor value (60% of the smallest real tile in the same list, or
  // 1 if the whole list has none) so it still gets a real, clickable tile —
  // never a fabricated cap NUMBER, just a nominal minimum drawing area.
  function layoutTickers(tickers: Tile[], inner: Rect): Array<Tile & { rect: Rect }> {
    const realSqrt = tickers.filter((t) => t.mcap !== null).map((t) => Math.sqrt(t.mcap as number));
    const floor = realSqrt.length ? Math.min(...realSqrt) * 0.6 : 1;
    const withValue = (list: Tile[]) => list.map((t) => ({ ...t, value: t.mcap !== null ? Math.sqrt(t.mcap) : floor }));
    const run = (list: Tile[]) => squarify(withValue(list), inner.x, inner.y, inner.w, inner.h);
    const first = run(tickers);
    if (!effectiveDropTiny) return first;
    const survivors = first.filter((t) => (t.rect.w / W) * mapW >= MIN_TILE_W && (t.rect.h / H) * mapH >= MIN_TILE_H);
    if (survivors.length === first.length) return first;
    if (!survivors.length) return run(tickers.slice(0, 1));
    return run(survivors.map(({ rect: _rect, value: _value, ...t }) => t));
  }

  const layout = useMemo(() => {
    if (!sectors.length) return { tiles: [] as Array<Tile & { rect: Rect }>, bands: [] as Array<{ sector: string; rect: Rect; capChange: number; hasHead: boolean }> };
    if (zoom) {
      const g = sectors.find((s) => s.sector === zoom);
      if (!g) return { tiles: [], bands: [] };
      const tiles = layoutTickers(g.tiles, { x: GAP, y: GAP, w: W - GAP * 2, h: H - GAP * 2 });
      return { tiles, bands: [] };
    }
    const secRects = squarify(sectors.map((g) => ({ ...g, value: g.weight })), 0, 0, W, H);
    const tiles: Array<Tile & { rect: Rect }> = [];
    const bands: Array<{ sector: string; rect: Rect; capChange: number; hasHead: boolean }> = [];
    secRects.forEach((g) => {
      const r = g.rect, head = r.h > 46 ? HEAD : 0;
      bands.push({ sector: g.sector, rect: r, capChange: g.capChange, hasHead: head > 0 });
      const inner = { x: r.x + GAP, y: r.y + head, w: Math.max(1, r.w - GAP * 2), h: Math.max(1, r.h - head - GAP) };
      layoutTickers(g.tiles, inner).forEach((s) => tiles.push(s));
    });
    return { tiles, bands };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layoutTickers closes over dropTiny/mapW/mapH/ratio, already listed
  }, [sectors, zoom, effectiveDropTiny, mapW, mapH, H]);

  const zoomInfo = zoom ? sectors.find((s) => s.sector === zoom) : null;
  const zoomExcluded = zoom ? excludedBySector.get(zoom) || 0 : 0;
  const zoomRealTotal = zoomInfo ? zoomInfo.tiles.length + zoomExcluded : 0;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 11.5 }}>
        <button type="button" onClick={() => setZoom(null)} style={{ display: "inline-flex", alignItems: "center", gap: 5, border: "none", background: "transparent", cursor: zoom ? "pointer" : "default", fontSize: 11.5, fontWeight: 700, color: zoom ? "var(--accent)" : "var(--muted)", padding: "2px 0" }}>▦ All sectors</button>
        {zoom ? (
          <>
            <span style={{ color: "var(--faint)" }}>›</span>
            <span style={{ fontWeight: 800 }}>{zoom}</span>
            {zoomInfo ? <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: zoomInfo.capChange >= 0 ? "var(--up)" : "var(--down)" }}>{formatPercent(zoomInfo.capChange)}</span> : null}
            {zoomInfo ? (
              <span style={{ fontSize: 10, color: "var(--faint)" }}>
                · {zoomInfo.tiles.length} tickers{zoomInfo.flooredCount > 0 ? ` (${zoomInfo.flooredCount} without a market cap)` : ""}{zoomExcluded > 0 ? ` · ${zoomExcluded} of ${zoomRealTotal} real names have no price data` : ""}{scrollCapped ? " · scroll for more" : ""}
              </span>
            ) : null}
            <div style={{ flex: 1 }} />
            <button type="button" onClick={() => setZoom(null)} style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}>‹ Back to market</button>
          </>
        ) : null}
      </div>

      <div ref={boxRef} style={{ width: "100%", maxHeight: scrollCapped ? MAX_SCROLL_PX : undefined, overflowY: scrollCapped ? "auto" : "visible", borderRadius: 10 }}>
      <div style={{ position: "relative", width: "100%", height: zoom ? mapH : undefined, aspectRatio: zoom ? undefined : `1 / ${ratio}`, borderRadius: 10, overflow: "hidden", background: "var(--soft)" }} onMouseLeave={() => setTip(null)}>
        {layout.bands.map((b) => {
          const p = pct(b.rect);
          const showHead = b.hasHead && p.wFrac * mapW > 76;
          return (
            <div key={`band-${b.sector}`}>
              <div onDoubleClick={() => setZoom(b.sector)} style={{ position: "absolute", left: p.left, top: p.top, width: p.width, height: p.height, border: "1px solid var(--panel)", borderRadius: 6, pointerEvents: "none" }} />
              {showHead ? (
                <div onClick={() => setZoom(b.sector)} onDoubleClick={() => setZoom(b.sector)} title={`See all ${b.sector} tickers`} style={{ position: "absolute", left: p.left, top: p.top, display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", margin: "3px 0 0 3px", cursor: "pointer", zIndex: 3, background: "rgba(255,255,255,.82)", borderRadius: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: "#0b0e14", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.sector}</span>
                  <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 800, color: b.capChange >= 0 ? "var(--up)" : "var(--down)" }}>{formatPercent(b.capChange)}</span>
                  <span style={{ fontSize: 9, color: "var(--faint)" }}>›</span>
                </div>
              ) : null}
            </div>
          );
        })}
        {layout.tiles.map((t) => {
          const p = pct(t.rect);
          const lab = labelFit(t.ticker, p.wFrac * mapW, p.hFrac * mapH);
          return (
            <div key={`${t.sector}:${t.ticker}`}
              onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, t })}
              onMouseLeave={() => setTip(null)}
              onClick={() => openTicker(t.ticker)}
              onDoubleClick={() => (zoom ? undefined : setZoom(t.sector))}
              style={{ position: "absolute", left: p.left, top: p.top, width: p.width, height: p.height, background: tileColor(t.change), color: "#fff", border: "1px solid var(--panel)", borderRadius: 4, padding: "3px 5px", overflow: "hidden", cursor: "pointer", display: "flex", flexDirection: "column", justifyContent: "center", textShadow: "0 1px 2px rgba(0,0,0,.32)" }}>
              {lab.showTicker ? <strong style={{ fontFamily: MONO, fontSize: lab.fsT, fontWeight: 700, letterSpacing: ".02em", lineHeight: 1.05 }}>{t.ticker}</strong> : null}
              {lab.showPct ? <span style={{ fontFamily: MONO, fontSize: lab.fsP, fontWeight: 600, opacity: 0.92, lineHeight: 1.1 }}>{formatPercent(t.change)}</span> : null}
              {lab.showCap && t.mcap !== null ? <span style={{ fontFamily: MONO, fontSize: 9, opacity: 0.72, lineHeight: 1.1 }}>Rp {fmtCap(t.mcap)}</span> : null}
            </div>
          );
        })}
      </div>
      </div>

      {zoomInfo && (zoomInfo.flooredCount > 0 || zoomExcluded > 0) ? (
        <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 8, lineHeight: 1.5 }}>
          {zoom} has {zoomRealTotal} real tickers in the KSEI registry — all {zoomInfo.tiles.length} with real price data are shown here.
          {zoomInfo.flooredCount > 0 ? <> {zoomInfo.flooredCount} of them have no Market Cap, published or computable, and render at a small floor size instead of being sized by cap.</> : null}
          {zoomExcluded > 0 ? <> The remaining {zoomExcluded} have no price change data at all (a gap upstream) and can&apos;t be placed on the map.</> : null}
        </div>
      ) : null}

      {tip ? (
        <div style={{ position: "fixed", left: tip.x, top: tip.y, transform: "translate(16px,-50%)", zIndex: 200, pointerEvents: "none", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 11, boxShadow: "0 10px 30px rgba(11,14,20,.2)", padding: "11px 13px", minWidth: 186 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: tileColor(tip.t.change) }} />
            <span style={{ fontFamily: MONO, fontSize: 13.5, fontWeight: 800 }}>{tip.t.ticker}</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: tip.t.change >= 0 ? "var(--up)" : "var(--down)" }}>{formatPercent(tip.t.change)}</span>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--faint)", margin: "2px 0 8px" }}>{tip.t.sector}</div>
          <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "5px 16px", fontSize: 11 }}>
            <span style={{ color: "var(--muted)" }}>Price</span><span style={{ fontFamily: MONO, fontWeight: 600, textAlign: "right" }}>{tip.t.price == null ? "—" : `Rp ${formatNumber(tip.t.price, 0)}`}</span>
            <span style={{ color: "var(--muted)" }}>Mkt cap</span><span style={{ fontFamily: MONO, fontWeight: 600, textAlign: "right" }}>{tip.t.mcap == null ? "—" : `Rp ${formatNumber(tip.t.mcap, 0)}`}</span>
            <span style={{ color: "var(--muted)" }}>P / E</span><span style={{ fontFamily: MONO, fontWeight: 600, textAlign: "right" }}>{tip.t.pe == null ? "—" : formatNumber(tip.t.pe, 1)}</span>
            <span style={{ color: "var(--muted)" }}>Div yield</span><span style={{ fontFamily: MONO, fontWeight: 600, textAlign: "right" }}>{tip.t.yld == null ? "—" : `${formatNumber(tip.t.yld, 1)}%`}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}
