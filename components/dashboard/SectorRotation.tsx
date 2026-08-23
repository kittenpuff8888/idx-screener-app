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

type PlotItem = { id: string; label: string; sublabel?: string; series: RrgPoint[]; trajectory: Trajectory };

const CAT = ["#2962FF", "#F23645", "#16A34A", "#D97706", "#9333EA", "#0891B2", "#DB2777", "#65A30D", "#7C3AED", "#EA580C"];

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

const PHASE_ORDER: Phase[] = ["Strengthening", "Fading", "Stabilizing", "Deteriorating", "Gaining Momentum", "Deepening Weakness", "Building Momentum", "Losing Momentum"];

export function SectorRotationSection({ ihsg, sectoralGroups, kongloGroups, marketDate, openTicker, technicalByTicker }: {
  ihsg: Pt[];
  sectoralGroups: IndexGroup[];
  kongloGroups: IndexGroup[];
  marketDate: string;
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
    Promise.all(stockCandidates.map((t) => loadOhlcv(marketDate, t).then((p) => [t, p] as const))).then((results) => {
      if (cancelled) return;
      const m = new Map<string, Pt[]>();
      for (const [t, payload] of results) {
        const rows = (payload?.rows || []).map((r) => ({ date: r.date, value: r.close })).filter((p) => Number.isFinite(p.value));
        if (rows.length) m.set(t, rows);
      }
      setOhlcvByTicker(m);
    });
    return () => { cancelled = true; };
  }, [mode, stockCandidates, marketDate]);

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
    let candidates: Array<{ id: string; label: string; sublabel?: string; series: Pt[] }> = [];
    if (mode === "sectors") {
      candidates = sectoralGroups.map((g) => ({ id: g.id, label: normalizeSector(g.label), series: g.series }));
    } else if (mode === "konglo") {
      let groups = kongloGroups;
      if (filterSector) groups = groups.filter((g) => g.constituents.some((c) => tickerSectorIndex.get(c.ticker)?.sector === filterSector));
      if (filterSub) groups = groups.filter((g) => g.constituents.some((c) => tickerSectorIndex.get(c.ticker)?.industry === filterSub));
      candidates = groups.map((g) => ({ id: g.id, label: g.label.replace(/\s*\(.*\)$/, ""), series: g.series }));
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
      built.push({ id: c.id, label: c.label, sublabel: c.sublabel, series: tail, trajectory });
    }
    return { items: built, hiddenCount: hidden };
  }, [mode, sectoralGroups, kongloGroups, stockCandidates, ohlcvByTicker, filterSector, filterSub, interval, tailPeriods, ihsgR, technicalByTicker, tickerSectorIndex]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (phaseFilter.size) list = list.filter((it) => phaseFilter.has(it.trajectory.phase));
    if (search.trim()) { const q = search.trim().toUpperCase(); list = list.filter((it) => it.id.toUpperCase().includes(q) || it.label.toUpperCase().includes(q)); }
    return list;
  }, [items, phaseFilter, search]);

  const distribution = useMemo(() => {
    const d: Record<Quadrant, number> = { leading: 0, improving: 0, weakening: 0, lagging: 0 };
    items.forEach((it) => { d[it.trajectory.quadrant] += 1; });
    return d;
  }, [items]);

  const selected = filteredItems.find((it) => it.id === selectedId) || null;

  // ── chart geometry ──
  const allPts = filteredItems.flatMap((it) => it.series);
  const ratios = allPts.map((p) => p.ratio).concat([100]);
  const moms = allPts.map((p) => p.momentum).concat([100]);
  const rMin = Math.min(...ratios), rMax = Math.max(...ratios);
  const mMin = Math.min(...moms), mMax = Math.max(...moms);
  const rPad = (rMax - rMin) * 0.15 || 3, mPad = (mMax - mMin) * 0.15 || 3;
  const rLo = rMin - rPad, rHi = rMax + rPad, mLo = mMin - mPad, mHi = mMax + mPad;
  const VW = 640, VH = 480;
  const xPx = (r: number) => ((r - rLo) / (rHi - rLo || 1)) * VW;
  const yPx = (m: number) => VH - ((m - mLo) / (mHi - mLo || 1)) * VH;
  const zeroX = xPx(100), zeroY = yPx(100);

  const modeLabel = mode === "sectors" ? "Sectors" : mode === "konglo" ? "Konglo" : "Stocks";
  const subtitle = mode === "stocks" && (filterSector || filterKonglo)
    ? `Constituents vs ${filterSector || (kongloGroups.find((g) => g.id === filterKonglo)?.label.replace(/\s*\(.*\)$/, "") || "")}`
    : `${modeLabel} vs Jakarta Composite Index`;

  const drill = (item: PlotItem) => {
    if (mode === "sectors") { setFilterSector(item.label); setFilterKonglo(""); setFilterSub(""); setMode("stocks"); setSelectedId(null); }
    else if (mode === "konglo") { setFilterKonglo(item.id); setFilterSector(""); setFilterSub(""); setMode("stocks"); setSelectedId(null); }
    else openTicker(item.id);
  };

  return (
    <div style={{ ...CARD, padding: "16px 18px", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
        <div>
          <span style={KICKER}>SECTOR ROTATION</span>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>{subtitle} · as of {marketDate}</div>
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--faint)", marginBottom: 10 }}>Where money is rotating — relative strength (x) against its momentum (y), both vs IHSG. The benchmark sits at the crosshair (100,100).</div>

      {/* mode row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {mode !== "sectors" ? (
          <button type="button" onClick={() => { setMode("sectors"); setFilterSector(""); setFilterSub(""); setFilterKonglo(""); setSelectedId(null); }} style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>Sectors ›</button>
        ) : null}
        <div style={{ display: "flex", gap: 3, background: "var(--soft)", borderRadius: 8, padding: 3 }}>
          {(["sectors", "konglo", "stocks"] as Mode[]).map((m) => (
            <button key={m} type="button" onClick={() => { setMode(m); setSelectedId(null); }} style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: mode === m ? "var(--accent)" : "transparent", color: mode === m ? "#fff" : "var(--muted)", textTransform: "capitalize" }}>{m}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 3, background: "var(--soft)", borderRadius: 8, padding: 3 }}>
          {(["weekly", "daily"] as Interval[]).map((iv) => (
            <button key={iv} type="button" onClick={() => setInterval_(iv)} style={{ fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: interval === iv ? "var(--accent)" : "transparent", color: interval === iv ? "#fff" : "var(--muted)", textTransform: "capitalize" }}>{iv}</button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 10, color: "var(--faint)" }}>TAIL</span>
          <input type="range" min={3} max={20} value={tailPeriods} onChange={(e) => setTailPeriods(Number(e.target.value))} style={{ width: 80, accentColor: "var(--accent)" }} />
          <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--muted)" }}>{tailPeriods} periods</span>
        </div>
      </div>

      {/* filter row */}
      {mode !== "sectors" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--faint)", letterSpacing: ".08em" }}>SECTOR</span>
          <select value={filterSector} onChange={(e) => { setFilterSector(e.target.value); setFilterSub(""); }} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 9px", cursor: "pointer" }}>
            <option value="">{mode === "stocks" ? "Choose a sector…" : "All sectors"}</option>
            {Object.values(IDX_SECTOR_MAP).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--faint)", letterSpacing: ".08em" }}>SUB-SECTOR</span>
          <select value={filterSub} onChange={(e) => setFilterSub(e.target.value)} disabled={!subOptions.length} style={{ fontSize: 11.5, fontWeight: 600, color: subOptions.length ? "var(--text)" : "var(--faint)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 9px", cursor: subOptions.length ? "pointer" : "not-allowed" }}>
            <option value="">All sub-sectors</option>
            {subOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {mode === "stocks" ? (
            <>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--faint)", letterSpacing: ".08em" }}>KONGLO</span>
              <select value={filterKonglo} onChange={(e) => { setFilterKonglo(e.target.value); setFilterSub(""); }} style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 9px", cursor: "pointer" }}>
                <option value="">{filterSector ? "Any group" : "Choose a group…"}</option>
                {kongloGroups.map((g) => <option key={g.id} value={g.id}>{g.label.replace(/\s*\(.*\)$/, "")}</option>)}
              </select>
            </>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* chart */}
        <div style={{ flex: "1 1 500px", minWidth: 320, position: "relative", background: "var(--soft)", borderRadius: 10, border: "1px solid var(--border)", overflow: "hidden" }}>
          {mode === "stocks" && !filterSector && !filterKonglo ? (
            <div style={{ padding: 60, textAlign: "center", color: "var(--faint)", fontSize: 12.5 }}>Pick a sector or konglo group above to see its stocks — {`{full universe}`} is too many names to plot meaningfully at once.</div>
          ) : (
            <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" style={{ display: "block" }} role="img" aria-label={`Relative rotation graph: ${subtitle}`}>
              <rect x={0} y={0} width={VW} height={zeroY} fill="var(--upSoft, rgba(22,163,74,.06))" />
              <rect x={0} y={zeroY} width={VW} height={VH - zeroY} fill="var(--downSoft, rgba(220,38,38,.05))" />
              <line x1={zeroX} y1={0} x2={zeroX} y2={VH} stroke="var(--hair)" strokeWidth={1.2} />
              <line x1={0} y1={zeroY} x2={VW} y2={zeroY} stroke="var(--hair)" strokeWidth={1.2} />
              <text x={8} y={14} fontSize={10} fontWeight={700} fill="var(--accent)">Improving</text>
              <text x={VW - 8} y={14} fontSize={10} fontWeight={700} fill="var(--up)" textAnchor="end">Leading</text>
              <text x={8} y={VH - 8} fontSize={10} fontWeight={700} fill="var(--down)" textAnchor="start">Lagging</text>
              <text x={VW - 8} y={VH - 8} fontSize={10} fontWeight={700} fill="var(--warning, #b45309)" textAnchor="end">Weakening</text>
              <text x={VW - 4} y={zeroY - 4} fontSize={9} fill="var(--faint)" textAnchor="end">RS-Ratio →</text>
              <text x={zeroX + 4} y={10} fontSize={9} fill="var(--faint)">↑ RS-Momentum</text>

              {filteredItems.map((it, i) => {
                const color = CAT[i % CAT.length];
                const path = it.series.map((p, k) => `${k ? "L" : "M"} ${xPx(p.ratio).toFixed(1)} ${yPx(p.momentum).toFixed(1)}`).join(" ");
                const last = it.series[it.series.length - 1];
                const on = selectedId === it.id;
                return (
                  <g key={it.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(it.id)} onDoubleClick={() => drill(it)}>
                    <path d={path} fill="none" stroke={color} strokeWidth={on ? 2 : 1.1} opacity={on || !selectedId ? 0.85 : 0.25} />
                    <circle cx={xPx(last.ratio)} cy={yPx(last.momentum)} r={on ? 6 : 4} fill={color} stroke="var(--panel)" strokeWidth={1.5} opacity={!selectedId || on ? 1 : 0.35} />
                    <text x={xPx(last.ratio) + 8} y={yPx(last.momentum) + 3} fontSize={9.5} fontWeight={700} fill={color} opacity={!selectedId || on ? 1 : 0.35}>{it.label}</text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* right rail: distribution + detail */}
        <div style={{ width: 220, flex: "none", display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)", marginBottom: 6 }}>DISTRIBUTION</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {(Object.keys(QUADRANT_META) as Quadrant[]).map((q) => (
                <div key={q} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--soft)", borderRadius: 7, padding: "5px 8px" }}>
                  <span style={{ fontSize: 10.5, color: QUADRANT_META[q].color, fontWeight: 700 }}>{QUADRANT_META[q].label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800 }}>{distribution[q]}</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 9.5, color: "var(--faint)", marginTop: 5, textAlign: "right" }}>{items.length} plotted</div>
          </div>

          <div style={{ background: "var(--soft)", borderRadius: 9, padding: "10px 11px", minHeight: 150 }}>
            {!selected ? (
              <div style={{ fontSize: 11, color: "var(--faint)", textAlign: "center", paddingTop: 40 }}>Click an item for details</div>
            ) : (
              <DetailPanel item={selected} onClose={() => setSelectedId(null)} />
            )}
          </div>
        </div>
      </div>

      {hiddenCount > 0 ? <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 8 }}>{hiddenCount} asset(s) hidden — not enough history vs IHSG to compute a rotation tail.</div> : null}

      {/* phase chips + search */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--hair)" }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search symbol…" style={{ fontSize: 11, fontFamily: MONO, border: "1px solid var(--border)", borderRadius: 8, padding: "5px 9px", background: "var(--panel)", color: "var(--text)", width: 130 }} />
        {PHASE_ORDER.map((p) => {
          const on = phaseFilter.has(p);
          return (
            <button key={p} type="button" onClick={() => setPhaseFilter((s) => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n; })} style={{ fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 999, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accentSoft)" : "transparent", color: on ? "var(--accent)" : "var(--muted)", cursor: "pointer" }}>{p}</button>
          );
        })}
      </div>

      {/* positions table */}
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)", marginBottom: 6 }}>POSITIONS · {filteredItems.length}</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5, minWidth: 480 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["SYMBOL", "QUADRANT", "RS-RATIO", "RS-MOM", "PHASE"].map((h) => <th key={h} style={{ textAlign: h === "SYMBOL" ? "left" : "right", padding: "6px 8px", fontSize: 9.5, fontWeight: 700, color: "var(--faint)" }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filteredItems.slice().sort((a, b) => a.trajectory.quadrant.localeCompare(b.trajectory.quadrant)).map((it) => {
                const last = it.series[it.series.length - 1];
                return (
                  <tr key={it.id} onClick={() => setSelectedId(it.id)} style={{ borderBottom: "1px solid var(--hair)", cursor: "pointer", background: selectedId === it.id ? "var(--accentSoft)" : "transparent" }}>
                    <td style={{ padding: "6px 8px", fontFamily: MONO, fontWeight: 700 }}>{it.label}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right" }}><span style={{ fontSize: 10, fontWeight: 700, color: QUADRANT_META[it.trajectory.quadrant].color, background: "var(--soft)", borderRadius: 5, padding: "2px 7px" }}>{QUADRANT_META[it.trajectory.quadrant].label}</span></td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: MONO }}>{last.ratio.toFixed(1)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontFamily: MONO }}>{last.momentum.toFixed(1)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", color: "var(--muted)" }}>{it.trajectory.phase}</td>
                  </tr>
                );
              })}
              {!filteredItems.length ? <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--faint)" }}>No positions match the current filters.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 12, lineHeight: 1.5 }}>
        RS-Ratio / RS-Momentum: our own implementation of the standard rotation-graph concept — a rolling z-score-normalized relative-strength ratio and a z-score-normalized rate-of-change of that ratio, both centered at 100 (see lib/indicators/rrg.ts). Real price series, real benchmark (IHSG) — not a copy of any specific commercial tool&apos;s proprietary constants. Double-click a Sector or Konglo point to drill into its Stocks. Phase/Rotation labels are our own interpretive scheme from quadrant + short-term trajectory direction.
      </div>
    </div>
  );
}

function DetailPanel({ item, onClose }: { item: PlotItem; onClose: () => void }) {
  const last = item.series[item.series.length - 1];
  const t = item.trajectory;
  const ratios = item.series.map((p) => p.ratio), moms = item.series.map((p) => p.momentum);
  const lo = Math.min(...ratios, ...moms), hi = Math.max(...ratios, ...moms), spread = hi - lo || 1;
  const spark = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"} ${((i / (vals.length - 1 || 1)) * 100).toFixed(1)} ${(28 - ((v - lo) / spread) * 26).toFixed(1)}`).join(" ");
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: 13 }}>{item.label}</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", color: "var(--faint)", cursor: "pointer", fontSize: 13 }}>✕</button>
      </div>
      {item.sublabel ? <div style={{ fontSize: 10, color: "var(--muted)" }}>{item.sublabel}</div> : null}
      <span style={{ display: "inline-block", marginTop: 6, fontSize: 10, fontWeight: 700, color: QUADRANT_META[t.quadrant].color, background: "var(--panel)", borderRadius: 6, padding: "2px 8px" }}>{QUADRANT_META[t.quadrant].label}</span>
      <svg viewBox="0 0 100 30" preserveAspectRatio="none" style={{ width: "100%", height: 34, marginTop: 8 }} aria-hidden>
        <path d={spark(ratios)} fill="none" stroke="#2962FF" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
        <path d={spark(moms)} fill="none" stroke="#F23645" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ display: "flex", gap: 10, fontSize: 9, color: "var(--faint)", marginTop: 2 }}><span><span style={{ color: "#2962FF" }}>—</span> RS-Ratio</span><span><span style={{ color: "#F23645" }}>—</span> RS-Mom</span></div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 8px", fontSize: 11, marginTop: 8 }}>
        <span style={{ color: "var(--muted)" }}>RS-Ratio</span><span style={{ fontFamily: MONO, fontWeight: 700, textAlign: "right" }}>{last.ratio.toFixed(1)}</span>
        <span style={{ color: "var(--muted)" }}>RS-Momentum</span><span style={{ fontFamily: MONO, fontWeight: 700, textAlign: "right" }}>{last.momentum.toFixed(1)}</span>
      </div>
      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--faint)", marginTop: 10, marginBottom: 4 }}>TRAJECTORY</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 8px", fontSize: 11 }}>
        <span style={{ color: "var(--muted)" }}>Phase</span><span style={{ fontWeight: 700, textAlign: "right" }}>{t.phase}</span>
        <span style={{ color: "var(--muted)" }}>Rotation</span><span style={{ fontWeight: 700, textAlign: "right", color: t.rotation === "counter" ? "var(--down)" : t.rotation === "clockwise" ? "var(--up)" : "var(--muted)" }}>{t.rotation === "clockwise" ? "↻ Normal" : t.rotation === "counter" ? "↺ Counter" : "— Flat"}</span>
        <span style={{ color: "var(--muted)" }}>Direction</span><span style={{ fontFamily: MONO, fontWeight: 700, textAlign: "right", fontSize: 10 }}>{t.deltaRatio >= 0 ? "+" : ""}{t.deltaRatio.toFixed(2)} R, {t.deltaMomentum >= 0 ? "+" : ""}{t.deltaMomentum.toFixed(2)} M</span>
        <span style={{ color: "var(--muted)" }}>Speed</span><span style={{ fontFamily: MONO, fontWeight: 700, textAlign: "right" }}>{t.speed.toFixed(2)} u/period</span>
      </div>
    </div>
  );
}
