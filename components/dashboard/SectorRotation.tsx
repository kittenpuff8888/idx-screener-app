"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { IndexGroup, TechnicalRecord } from "@/lib/domain/types";
import { normalizeSector, IDX_SECTOR_MAP } from "@/lib/domain/sectors";
import { loadOhlcv } from "@/lib/data/ticker";
import {
  computeRrgSeries, computeTrajectory, quadrantOf, QUADRANT_META,
  type Pt, type RrgPoint, type Quadrant, type Phase, type Trajectory,
} from "@/lib/indicators/rrg";

/** Sector Rotation — a Relative Rotation Graph (RRG): RS-Ratio (x) vs
    RS-Momentum (y) against IHSG, for Sectors, Konglo groups, or individual
    Stocks. Real price series in, our own documented RS-Ratio/RS-Momentum
    formula (lib/indicators/rrg.ts) — not a copy of any commercial tool's
    proprietary constants. Stocks mode requires a sector or konglo filter
    (narrows the ~950-ticker universe to something a scatter can show and
    something we can actually bulk-fetch OHLCV for). */

const MONO = "var(--font-mono)";
const KICKER: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))" };

type Mode = "sectors" | "konglo" | "stocks";
type Interval = "weekly" | "daily";

type PlotItem = { id: string; label: string; sublabel?: string; series: RrgPoint[]; trajectory: Trajectory; constituents?: string[] };

const CAT = ["#2962FF", "#F23645", "#16A34A", "#D97706", "#9333EA", "#0891B2", "#DB2777", "#65A30D", "#7C3AED", "#EA580C"];

// Slow/Moderate/Fast buckets for the single-period trajectory speed.
// Originally calibrated to real tercile boundaries of weekly-resampled RRG
// output at ratioScale/momentumScale=2.2 (n=56, p33≈1.4, p67≈2.2); rescaled
// by /2.2 for the current scale=1 default (see lib/indicators/rrg.ts) since
// z-score scale directly scales the typical single-period move magnitude.
const SPEED_SLOW_MAX = 0.64;
const SPEED_MODERATE_MAX = 1.0;

function resampleWeekly(series: Pt[]): Pt[] {
  const byWeek = new Map<string, Pt>();
  for (const p of series) {
    const d = new Date(p.date + "T00:00:00Z");
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    const key = d.toISOString().slice(0, 10);
    byWeek.set(key, p); // last bar seen in that week wins (series is ascending)
  }
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, p]) => p);
}

function trendOf(t: Trajectory) {
  const arrow = t.deltaRatio >= 0 && t.deltaMomentum >= 0 ? "↗" : t.deltaRatio >= 0 && t.deltaMomentum < 0 ? "↘" : t.deltaRatio < 0 && t.deltaMomentum >= 0 ? "↖" : "↙";
  const label = t.speed < SPEED_SLOW_MAX ? "Slow" : t.speed < SPEED_MODERATE_MAX ? "Moderate" : "Fast";
  const color = t.speed < SPEED_SLOW_MAX ? "var(--faint)" : t.speed < SPEED_MODERATE_MAX ? "var(--muted)" : QUADRANT_META[t.quadrant].color;
  return { arrow, label, color };
}

/** Smooth trail: each interior point is a quadratic-bezier control point,
    the midpoint between consecutive points is the curve anchor. */
function smoothPath(pts: Array<[number, number]>): string {
  if (!pts.length) return "";
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let k = 1; k < pts.length; k += 1) {
    const [cx0, cy0] = pts[k - 1], [cx1, cy1] = pts[k];
    if (k === pts.length - 1) d += ` L ${cx1.toFixed(1)} ${cy1.toFixed(1)}`;
    else { const mx = (cx0 + cx1) / 2, my = (cy0 + cy1) / 2; d += ` Q ${cx0.toFixed(1)} ${cy0.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`; }
  }
  return d;
}

const PHASE_ORDER: Phase[] = [
  "Entering Leading", "Strengthening", "Fading", "Collapsing",
  "Rotating → Weakening", "Stabilizing", "Deteriorating",
  "Fast Recovery", "Gaining Momentum", "Deepening Weakness",
  "Rotating → Improving", "Recovering → Leading", "Losing Momentum",
];
const DIST_ORDER: Quadrant[] = ["leading", "improving", "weakening", "lagging"];

export function SectorRotationSection({ ihsg, sectoralGroups, kongloGroups, marketDate, latestMarketDate, openTicker, technicalByTicker }: {
  ihsg: Pt[];
  sectoralGroups: IndexGroup[];
  kongloGroups: IndexGroup[];
  marketDate: string;
  latestMarketDate?: string;
  openTicker: (t: string) => void;
  technicalByTicker: Map<string, TechnicalRecord>;
}) {
  const [mode, setMode] = useState<Mode>("sectors");
  const [interval, setInterval_] = useState<Interval>("weekly");
  const [tailPeriods, setTailPeriods] = useState(8);
  const [filterSector, setFilterSector] = useState("");
  const [filterSub, setFilterSub] = useState("");
  const [filterKonglo, setFilterKonglo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [quadrantFilter, setQuadrantFilter] = useState<Quadrant | null>(null);
  const [phaseFilter, setPhaseFilter] = useState<Set<Phase>>(new Set());
  const [search, setSearch] = useState("");
  const [ohlcvByTicker, setOhlcvByTicker] = useState<Map<string, Pt[]>>(new Map());

  const ihsgR = useMemo(() => (interval === "weekly" ? resampleWeekly(ihsg) : ihsg), [ihsg, interval]);

  // Konglo groups' own constituents carry no sector/industry (published null for
  // every entry) — Sectoral groups' constituents DO (real, populated), and
  // between the 11 of them cover every real ticker. Reused as the sector/
  // industry lookup for Konglo-mode filtering instead of the empty field.
  const tickerSectorIndex = useMemo(() => {
    const m = new Map<string, { sector: string; industry: string }>();
    sectoralGroups.forEach((g) => g.constituents.forEach((c) => {
      if (c.sector) m.set(c.ticker, { sector: normalizeSector(c.sector), industry: c.industry || "" });
    }));
    return m;
  }, [sectoralGroups]);

  // ── candidate resolution per mode ──
  const stockCandidates = useMemo(() => {
    if (mode !== "stocks") return [];
    let tickers: Set<string> | null = null;
    const intersect = (s: Set<string>) => { tickers = tickers ? new Set([...tickers].filter((t) => s.has(t))) : s; };
    if (filterSector) {
      const g = sectoralGroups.find((x) => normalizeSector(x.label) === filterSector);
      if (g) intersect(new Set(g.constituents.map((c) => c.ticker)));
    }
    if (filterKonglo) {
      const g = kongloGroups.find((x) => x.id === filterKonglo);
      if (g) intersect(new Set(g.constituents.map((c) => c.ticker)));
    }
    if (!tickers) return [];
    let list = [...tickers];
    if (filterSub) list = list.filter((t) => tickerSectorIndex.get(t)?.industry === filterSub);
    return list;
  }, [mode, filterSector, filterSub, filterKonglo, sectoralGroups, kongloGroups, tickerSectorIndex]);

  useEffect(() => {
    if (mode !== "stocks" || !stockCandidates.length || !marketDate) { setOhlcvByTicker(new Map()); return; }
    let cancelled = false;
    Promise.all(stockCandidates.map((t) => loadOhlcv(marketDate, t, latestMarketDate).then((p) => [t, p] as const))).then((results) => {
      if (cancelled) return;
      const m = new Map<string, Pt[]>();
      for (const [t, payload] of results) {
        const rows = (payload?.rows || []).map((r) => ({ date: r.date, value: r.close })).filter((p) => Number.isFinite(p.value));
        if (rows.length) m.set(t, rows);
      }
      setOhlcvByTicker(m);
    });
    return () => { cancelled = true; };
  }, [mode, stockCandidates, marketDate, latestMarketDate]);

  // sub-sector (industry) options for the active filter context. The SECTOR
  // filter is what scopes this in both Konglo and Stocks mode (Konglo mode
  // never exposes a konglo-group selector of its own); Stocks mode falls back
  // to the picked konglo group's holdings when no sector is chosen yet.
  const subOptions = useMemo(() => {
    let tickers: string[] = [];
    if (filterSector) {
      const g = sectoralGroups.find((x) => normalizeSector(x.label) === filterSector);
      tickers = g ? g.constituents.map((c) => c.ticker) : [];
    } else if (mode === "stocks" && filterKonglo) {
      const g = kongloGroups.find((x) => x.id === filterKonglo);
      tickers = g ? g.constituents.map((c) => c.ticker) : [];
    }
    const set = new Set(tickers.map((t) => tickerSectorIndex.get(t)?.industry).filter((x): x is string => !!x));
    return [...set].sort();
  }, [mode, filterSector, filterKonglo, sectoralGroups, kongloGroups, tickerSectorIndex]);

  // ── build plotted items for the active mode ──
  const { items, hiddenCount } = useMemo(() => {
    let candidates: Array<{ id: string; label: string; sublabel?: string; series: Pt[]; constituents?: string[] }> = [];
    if (mode === "sectors") {
      candidates = sectoralGroups.map((g) => ({ id: g.id, label: normalizeSector(g.label), series: g.series, constituents: g.constituents.map((c) => c.ticker) }));
    } else if (mode === "konglo") {
      let groups = kongloGroups;
      if (filterSector) groups = groups.filter((g) => g.constituents.some((c) => tickerSectorIndex.get(c.ticker)?.sector === filterSector));
      if (filterSub) groups = groups.filter((g) => g.constituents.some((c) => tickerSectorIndex.get(c.ticker)?.industry === filterSub));
      candidates = groups.map((g) => ({ id: g.id, label: g.label.replace(/\s*\(.*\)$/, ""), series: g.series, constituents: g.constituents.map((c) => c.ticker) }));
    } else {
      candidates = stockCandidates.map((t) => ({ id: t, label: t, sublabel: technicalByTicker.get(t)?.companyName, series: ohlcvByTicker.get(t) || [] }));
    }
    const built: PlotItem[] = [];
    let hidden = 0;
    for (const c of candidates) {
      if (!c.series.length) { hidden += 1; continue; }
      const series = interval === "weekly" ? resampleWeekly(c.series) : c.series;
      const full = computeRrgSeries(series, ihsgR);
      if (full.length < 3) { hidden += 1; continue; }
      const tail = full.slice(-Math.max(3, tailPeriods));
      const trajectory = computeTrajectory(tail);
      if (!trajectory) { hidden += 1; continue; }
      built.push({ id: c.id, label: c.label, sublabel: c.sublabel, series: tail, trajectory, constituents: c.constituents });
    }
    return { items: built, hiddenCount: hidden };
  }, [mode, sectoralGroups, kongloGroups, stockCandidates, ohlcvByTicker, filterSector, filterSub, interval, tailPeriods, ihsgR, technicalByTicker, tickerSectorIndex]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (quadrantFilter) list = list.filter((it) => it.trajectory.quadrant === quadrantFilter);
    if (phaseFilter.size) list = list.filter((it) => phaseFilter.has(it.trajectory.phase));
    if (search.trim()) { const q = search.trim().toUpperCase(); list = list.filter((it) => it.id.toUpperCase().includes(q) || it.label.toUpperCase().includes(q)); }
    return list;
  }, [items, quadrantFilter, phaseFilter, search]);

  const distribution = useMemo(() => {
    const d: Record<Quadrant, number> = { leading: 0, improving: 0, weakening: 0, lagging: 0 };
    items.forEach((it) => { d[it.trajectory.quadrant] += 1; });
    return d;
  }, [items]);

  const selected = filteredItems.find((it) => it.id === selectedId) || null;

  // ── chart geometry ──
  const VW = 1100, VH = 700;
  const allPts = filteredItems.flatMap((it) => it.series);
  const ratios = allPts.map((p) => p.ratio).concat([100]);
  const moms = allPts.map((p) => p.momentum).concat([100]);
  const rMin = Math.min(...ratios), rMax = Math.max(...ratios);
  const mMin = Math.min(...moms), mMax = Math.max(...moms);
  const rPad = (rMax - rMin) * 0.18 || 3, mPad = (mMax - mMin) * 0.18 || 3;
  const rLo = rMin - rPad, rHi = rMax + rPad, mLo = mMin - mPad, mHi = mMax + mPad;
  const xPx = (r: number) => ((r - rLo) / (rHi - rLo || 1)) * VW;
  const yPx = (m: number) => VH - ((m - mLo) / (mHi - mLo || 1)) * VH;
  const zeroX = xPx(100), zeroY = yPx(100);
  const rightW = VW - zeroX, bottomH = VH - zeroY;

  const modeLabel = mode === "sectors" ? "Sectors" : mode === "konglo" ? "Konglo" : "Stocks";
  const kongloName = kongloGroups.find((g) => g.id === filterKonglo)?.label.replace(/\s*\(.*\)$/, "") || "";
  const subtitle = mode === "stocks" && (filterSector || filterKonglo)
    ? `${filterSector || kongloName} constituents`
    : `${modeLabel} vs Jakarta Composite Index`;

  const drill = (item: PlotItem) => {
    if (mode === "sectors") { setFilterSector(item.label); setFilterKonglo(""); setFilterSub(""); setMode("stocks"); setSelectedId(null); }
    else if (mode === "konglo") { setFilterKonglo(item.id); setFilterSector(""); setFilterSub(""); setMode("stocks"); setSelectedId(null); }
    else openTicker(item.id);
  };

  const resetToSectors = () => { setMode("sectors"); setFilterSector(""); setFilterSub(""); setFilterKonglo(""); setSelectedId(null); setQuadrantFilter(null); };
  const chartEmpty = mode === "stocks" && !filterSector && !filterKonglo;

  return (
    <div style={{ ...CARD, padding: "16px 18px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={KICKER}>SECTOR ROTATION</span>
            {mode !== "sectors" ? (
              <button type="button" onClick={resetToSectors} style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "none", borderRadius: 999, cursor: "pointer", padding: "3px 10px" }}>← All sectors</button>
            ) : null}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-.005em", marginTop: 4, color: "var(--text)" }}>{subtitle}</div>
          <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 2 }}>Relative strength vs momentum, both indexed to IHSG · as of {marketDate}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 3, background: "var(--soft)", borderRadius: 8, padding: 3 }}>
            {(["sectors", "konglo", "stocks"] as Mode[]).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setSelectedId(null); setQuadrantFilter(null); }} style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: mode === m ? "var(--accent)" : "transparent", color: mode === m ? "#fff" : "var(--muted)", textTransform: "capitalize" }}>{m}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 3, background: "var(--soft)", borderRadius: 8, padding: 3 }}>
            {(["weekly", "daily"] as Interval[]).map((iv) => (
              <button key={iv} type="button" onClick={() => setInterval_(iv)} style={{ fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: interval === iv ? "var(--accent)" : "transparent", color: interval === iv ? "#fff" : "var(--muted)", textTransform: "capitalize" }}>{iv}</button>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--soft)", borderRadius: 8, padding: "5px 10px" }}>
            <span style={{ fontSize: 10, color: "var(--faint)", fontWeight: 700 }}>TAIL</span>
            <input type="range" min={3} max={20} value={tailPeriods} onChange={(e) => setTailPeriods(Number(e.target.value))} style={{ width: 70, accentColor: "var(--accent)" }} />
            <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--muted)" }}>{tailPeriods}p</span>
          </div>
        </div>
      </div>

      {/* filter row */}
      {mode !== "sectors" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
          <select value={filterSector} onChange={(e) => { setFilterSector(e.target.value); setFilterSub(""); }} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 9px", cursor: "pointer" }}>
            <option value="">{mode === "stocks" ? "Choose a sector…" : "All sectors"}</option>
            {Object.values(IDX_SECTOR_MAP).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterSub} onChange={(e) => setFilterSub(e.target.value)} disabled={!subOptions.length} style={{ fontSize: 11.5, fontWeight: 600, color: subOptions.length ? "var(--text)" : "var(--faint)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 9px", cursor: subOptions.length ? "pointer" : "not-allowed" }}>
            <option value="">All sub-sectors</option>
            {subOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {mode === "stocks" ? (
            <select value={filterKonglo} onChange={(e) => { setFilterKonglo(e.target.value); setFilterSub(""); }} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 9px", cursor: "pointer" }}>
              <option value="">{filterSector ? "Any group" : "Choose a group…"}</option>
              {kongloGroups.map((g) => <option key={g.id} value={g.id}>{g.label.replace(/\s*\(.*\)$/, "")}</option>)}
            </select>
          ) : null}
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search symbol…" style={{ fontSize: 11.5, fontFamily: MONO, border: "1px solid var(--border)", borderRadius: 8, padding: "5px 9px", background: "var(--panel)", color: "var(--text)", width: 140 }} />
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 14, alignItems: "stretch", flexWrap: "wrap" }}>
        {/* chart */}
        <div style={{ flex: "1 1 500px", minWidth: 320, aspectRatio: `${VW} / ${VH}`, position: "relative", background: "var(--soft)", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }}>
          {chartEmpty ? (
            <div style={{ padding: 70, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>Pick a sector or konglo group above to see its stocks.</div>
          ) : (
            <>
              <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block" }} role="img" aria-label={`Relative rotation graph: ${subtitle}`}>
                <rect x={0} y={0} width={zeroX} height={zeroY} fill={QUADRANT_META.improving.tint} />
                <rect x={zeroX} y={0} width={rightW} height={zeroY} fill={QUADRANT_META.leading.tint} />
                <rect x={0} y={zeroY} width={zeroX} height={bottomH} fill={QUADRANT_META.lagging.tint} />
                <rect x={zeroX} y={zeroY} width={rightW} height={bottomH} fill={QUADRANT_META.weakening.tint} />
                <line x1={zeroX} y1={0} x2={zeroX} y2={VH} stroke="var(--hair)" strokeWidth={1.4} />
                <line x1={0} y1={zeroY} x2={VW} y2={zeroY} stroke="var(--hair)" strokeWidth={1.4} />
                <text x={18} y={26} fontSize={13} fontWeight={800} fill={QUADRANT_META.improving.color}>Improving</text>
                <text x={VW - 18} y={26} fontSize={13} fontWeight={800} fill={QUADRANT_META.leading.color} textAnchor="end">Leading</text>
                <text x={18} y={VH - 18} fontSize={13} fontWeight={800} fill={QUADRANT_META.lagging.color}>Lagging</text>
                <text x={VW - 18} y={VH - 18} fontSize={13} fontWeight={800} fill={QUADRANT_META.weakening.color} textAnchor="end">Weakening</text>
                <text x={VW / 2} y={18} fontSize={10.5} fill="var(--faint)" textAnchor="middle">↑ Relative Momentum</text>
                <text x={VW - 18} y={zeroY - 8} fontSize={10.5} fill="var(--faint)" textAnchor="end">Relative Strength →</text>
                <circle cx={zeroX} cy={zeroY} r={4} fill="var(--faint)" />
                <text x={zeroX + 8} y={zeroY - 8} fontSize={10} fontWeight={700} fill="var(--faint)">IHSG</text>

                {filteredItems.map((it, i) => {
                  const color = CAT[i % CAT.length];
                  const pxPts = it.series.map((p) => [xPx(p.ratio), yPx(p.momentum)] as [number, number]);
                  const path = smoothPath(pxPts);
                  const last = it.series[it.series.length - 1];
                  const on = selectedId === it.id;
                  const dim = !!selectedId && !on;
                  return (
                    <g key={it.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(it.id)} onDoubleClick={() => drill(it)}>
                      <path d={path} fill="none" stroke={color} strokeWidth={on ? 2.6 : 1} opacity={on ? 0.95 : dim ? 0.1 : 0.26} strokeLinecap="round" />
                      <circle cx={xPx(last.ratio)} cy={yPx(last.momentum)} r={on ? 7 : 4.5} fill={color} stroke="var(--panel)" strokeWidth={2} opacity={on ? 1 : dim ? 0.35 : 0.85} />
                    </g>
                  );
                })}
              </svg>
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {filteredItems.map((it, i) => {
                  const color = CAT[i % CAT.length];
                  const last = it.series[it.series.length - 1];
                  const on = selectedId === it.id;
                  const dim = !!selectedId && !on;
                  const lx = xPx(last.ratio) + 9, ly = yPx(last.momentum) + 4;
                  return (
                    <span key={it.id} style={{ position: "absolute", left: `${((lx / VW) * 100).toFixed(2)}%`, top: `${(((ly + 3) / VH) * 100).toFixed(2)}%`, transform: "translateY(-50%)", fontSize: 10.5, fontWeight: 800, color, opacity: on ? 1 : dim ? 0.3 : 0.92, background: "var(--panel)", padding: "2px 7px", borderRadius: 6, whiteSpace: "nowrap", boxShadow: "0 1px 4px rgba(11,14,20,.14)" }}>{it.label}</span>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* right rail: distribution + detail */}
        <div style={{ width: 260, flex: "none", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)" }}>DISTRIBUTION</span>
              <span style={{ fontSize: 9.5, color: "var(--faint)" }}>{items.length} plotted</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {DIST_ORDER.map((q) => {
                const on = quadrantFilter === q;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => { setQuadrantFilter((cur) => (cur === q ? null : q)); setSelectedId(null); }}
                    title={`Show only ${QUADRANT_META[q].label}`}
                    style={{ display: "flex", flexDirection: "column", gap: 3, textAlign: "left", background: QUADRANT_META[q].tint, border: `1.5px solid ${on ? QUADRANT_META[q].color : "transparent"}`, borderRadius: 10, padding: "9px 10px", cursor: "pointer" }}
                  >
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: QUADRANT_META[q].color }}>{QUADRANT_META[q].label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 800, color: "var(--text)" }}>{distribution[q]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 16, flex: 1, minHeight: 0, overflow: "auto" }}>
            {!selected ? (
              <div style={{ fontSize: 11, color: "var(--faint)", textAlign: "center", paddingTop: 60 }}>Click a point for details · double-click to drill in</div>
            ) : (
              <DetailPanel item={selected} mode={mode} onClose={() => setSelectedId(null)} openTicker={openTicker} onDrill={() => drill(selected)} />
            )}
          </div>
        </div>
      </div>

      {hiddenCount > 0 ? <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 8 }}>{hiddenCount} asset(s) hidden — not enough history vs IHSG to compute a rotation tail.</div> : null}

      {/* phase chips */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 16 }}>
        {PHASE_ORDER.map((p) => {
          const on = phaseFilter.has(p);
          return (
            <button key={p} type="button" onClick={() => setPhaseFilter((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; })} style={{ fontSize: 10.5, fontWeight: 700, padding: "5px 11px", borderRadius: 999, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--muted)", cursor: "pointer" }}>{p}</button>
          );
        })}
      </div>

      {/* positions table */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)" }}>POSITIONS · {filteredItems.length}</span>
          {mode === "stocks" ? <span style={{ fontSize: 9.5, color: "var(--faint)" }}>Click a symbol to open its ticker page</span> : null}
        </div>
        <div style={{ overflow: "auto", maxHeight: 285, border: "1px solid var(--hair)", borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, minWidth: 560 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["SYMBOL", "QUADRANT", "RS-RATIO", "RS-MOM", "PHASE", "TREND"].map((h) => <th key={h} style={{ position: "sticky", top: 0, background: "var(--panel)", textAlign: h === "SYMBOL" || h === "PHASE" ? "left" : "right", padding: "8px 10px", fontSize: 9.5, fontWeight: 700, color: "var(--faint)", letterSpacing: ".06em" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filteredItems.slice().sort((a, b) => a.trajectory.quadrant.localeCompare(b.trajectory.quadrant)).map((it) => {
                const last = it.series[it.series.length - 1];
                const trend = trendOf(it.trajectory);
                return (
                  <tr key={it.id} onClick={() => setSelectedId(it.id)} style={{ borderBottom: "1px solid var(--hair)", cursor: "pointer", background: selectedId === it.id ? "var(--accentSoft)" : "transparent" }}>
                    <td style={{ padding: "8px 10px", fontFamily: MONO, fontWeight: 700 }}>
                      {mode === "stocks" ? (
                        <a onClick={(e) => { e.stopPropagation(); openTicker(it.id); }} style={{ color: "var(--accent)", textDecoration: "none", cursor: "pointer" }}>{it.label}</a>
                      ) : it.label}
                    </td>
                    <td style={{ padding: "8px 10px" }}><span style={{ fontSize: 10, fontWeight: 700, color: QUADRANT_META[it.trajectory.quadrant].color, background: QUADRANT_META[it.trajectory.quadrant].tint, borderRadius: 6, padding: "3px 8px" }}>{QUADRANT_META[it.trajectory.quadrant].label}</span></td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: MONO }}>{last.ratio.toFixed(1)}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: MONO }}>{last.momentum.toFixed(1)}</td>
                    <td style={{ padding: "8px 10px", color: "var(--muted)" }}>{it.trajectory.phase}</td>
                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: trend.color }}>{trend.arrow} {trend.label}</td>
                  </tr>
                );
              })}
              {!filteredItems.length ? <tr><td colSpan={6} style={{ padding: 26, textAlign: "center", color: "var(--faint)" }}>No positions match the current filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 14, lineHeight: 1.5 }}>
        RS-Ratio / RS-Momentum: our own implementation of the standard rotation-graph concept — a rolling z-score-normalized relative-strength ratio and a z-score-normalized rate-of-change of that ratio, both centered at 100 (see lib/indicators/rrg.ts). Real price series, real benchmark (IHSG) — not a copy of any specific commercial tool&apos;s proprietary constants. Double-click a Sector or Konglo point to drill into its Stocks. Phase/Trend labels are our own interpretive scheme from quadrant + short-term trajectory direction.
      </div>
    </div>
  );
}

function DetailPanel({ item, mode, onClose, openTicker, onDrill }: {
  item: PlotItem; mode: Mode; onClose: () => void; openTicker: (t: string) => void; onDrill: () => void;
}) {
  const onOpenTicker = () => openTicker(item.id);
  const last = item.series[item.series.length - 1];
  const t = item.trajectory;
  const trend = trendOf(t);
  const ratios = item.series.map((p) => p.ratio), moms = item.series.map((p) => p.momentum);
  const lo = Math.min(...ratios, ...moms), hi = Math.max(...ratios, ...moms), spread = hi - lo || 1;
  const spark = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"} ${((i / (vals.length - 1 || 1)) * 100).toFixed(1)} ${(28 - ((v - lo) / spread) * 26).toFixed(1)}`).join(" ");
  const constituents = item.constituents || [];
  const SHOWN_CONSTITUENTS = 14;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {mode === "stocks" ? (
          <a onClick={onOpenTicker} style={{ fontFamily: MONO, fontWeight: 800, fontSize: 14, color: "var(--accent)", textDecoration: "none", cursor: "pointer" }}>{item.label}</a>
        ) : (
          <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: 14 }}>{item.label}</span>
        )}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", color: "var(--faint)", cursor: "pointer", fontSize: 14 }}>✕</button>
      </div>
      {item.sublabel ? <div style={{ fontSize: 11, color: "var(--muted)" }}>{item.sublabel}</div> : null}
      <span style={{ display: "inline-block", marginTop: 6, fontSize: 10, fontWeight: 700, color: QUADRANT_META[t.quadrant].color, background: QUADRANT_META[t.quadrant].tint, borderRadius: 6, padding: "3px 9px" }}>{QUADRANT_META[t.quadrant].label}</span>

      {mode === "stocks" ? (
        <button type="button" onClick={onOpenTicker} style={{ display: "block", width: "100%", marginTop: 9, fontSize: 11, fontWeight: 700, color: "#fff", background: "var(--accent)", border: "none", borderRadius: 7, padding: "6px 0", cursor: "pointer" }}>Open ticker page →</button>
      ) : (
        <button type="button" onClick={onDrill} style={{ display: "block", width: "100%", marginTop: 9, fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "none", borderRadius: 7, padding: "6px 0", cursor: "pointer" }}>View constituent stocks →</button>
      )}

      <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: "100%", height: 36, marginTop: 10 }} aria-hidden>
        <path d={spark(ratios)} fill="none" stroke="#2962FF" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        <path d={spark(moms)} fill="none" stroke="#F23645" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: "flex", gap: 10, fontSize: 9, color: "var(--faint)", marginTop: 2 }}><span><span style={{ color: "#2962FF" }}>—</span> RS-Ratio</span><span><span style={{ color: "#F23645" }}>—</span> RS-Mom</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "4px 8px", fontSize: 11.5, marginTop: 10 }}>
        <span style={{ color: "var(--muted)" }}>RS-Ratio</span><span style={{ fontFamily: MONO, fontWeight: 700, textAlign: "right" }}>{last.ratio.toFixed(1)}</span>
        <span style={{ color: "var(--muted)" }}>RS-Momentum</span><span style={{ fontFamily: MONO, fontWeight: 700, textAlign: "right" }}>{last.momentum.toFixed(1)}</span>
        <span style={{ color: "var(--muted)" }}>Phase</span><span style={{ fontWeight: 700, textAlign: "right" }}>{t.phase}</span>
        <span style={{ color: "var(--muted)" }}>Trend</span><span style={{ fontWeight: 700, textAlign: "right", color: trend.color }}>{trend.arrow} {trend.label}</span>
        <span style={{ color: "var(--muted)" }}>Speed</span><span style={{ fontFamily: MONO, fontWeight: 700, textAlign: "right" }}>{t.speed.toFixed(2)} u/period</span>
      </div>

      {mode === "konglo" && constituents.length ? (
        <>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--faint)", marginTop: 12, marginBottom: 5 }}>CONSTITUENTS · {constituents.length}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {constituents.slice(0, SHOWN_CONSTITUENTS).map((tk) => (
              <a key={tk} onClick={() => openTicker(tk)} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 7px", cursor: "pointer", textDecoration: "none" }}>{tk}</a>
            ))}
            {constituents.length > SHOWN_CONSTITUENTS ? <span style={{ fontSize: 10, color: "var(--faint)", padding: "2px 4px" }}>+{constituents.length - SHOWN_CONSTITUENTS} more</span> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
