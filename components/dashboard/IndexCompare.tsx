"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Modal } from "@/components/shared/Modal";
import { Provenance } from "@/components/shared/Metric";
import { UniverseTable, type UniverseTableRow } from "@/components/shared/UniverseTable";
import type { IndexGroup, JsonRecord } from "@/lib/domain/types";
import { loadUniverse, type Universe, type UniverseRow } from "@/lib/data/screenerUniverse";
import { asNumber, formatMarketCapBn, formatPercent } from "@/lib/format/number";

const MONO = "var(--mono, var(--font-mono))";
const KICKER: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: "var(--faint)" };
// Exact multi-line palette from the Claude Design prototype (11 fixed hues, never cycled).
const CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e34948", "#7048e8", "#0891b2", "#be185d", "#65a30d", "#db2777", "#0d9488"];
const X_TITLE: Record<string, string> = { "1W": "TRADING SESSIONS · LAST WEEK", "1M": "TRADING SESSIONS · LAST MONTH", "3M": "TRADING SESSIONS · LAST 3 MONTHS", "1Y": "TRADING SESSIONS · LAST YEAR" };

type Range = { key: string; steps: number };
const RANGES: Range[] = [
  { key: "1W", steps: 5 },
  { key: "1M", steps: 22 },
  { key: "3M", steps: 63 },
  { key: "1Y", steps: 252 },
];

type Pt = { date: string; value: number };
export type CompareEntry = { id: string; label: string; series: Pt[]; group?: IndexGroup };

function windowDates(series: Pt[], steps: number): string[] {
  const pts = series.filter((p) => Number.isFinite(p.value));
  if (pts.length < steps + 1) return [];
  return pts.slice(-(steps + 1)).map((p) => p.date);
}

/** % -return series over the last `steps` sessions, normalized to the range start (starts at 0).
    When `benchDates` is given (the benchmark's own trailing window), the series' own trailing
    window must land on those EXACT calendar dates in the same order, or this returns null —
    two index series sourced from pipelines that drifted out of sync (a real failure mode seen
    in this repo: docs/data/market-context.json vs indexes.json on different refresh cadences)
    must never get silently plotted against each other at the wrong x-position. */
function windowPct(series: Pt[], steps: number, benchDates?: string[]): number[] | null {
  const pts = series.filter((p) => Number.isFinite(p.value));
  if (pts.length < steps + 1) return null;
  const win = pts.slice(-(steps + 1));
  if (benchDates && !(win.length === benchDates.length && win.every((p, i) => p.date === benchDates[i]))) return null;
  const base = win[0].value;
  if (!base) return null;
  return win.map((p) => (p.value / base - 1) * 100);
}
const relFmt = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;

// ── Detail-modal statistics — all derived from the same cumulative %-return
// series (base=0 at window start) already used to draw the chart, so there's
// no separate fetch: daily returns are reconstructed day-over-day from it. ──
function toDailyReturns(pct: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < pct.length; i++) {
    const prev = 1 + pct[i - 1] / 100, cur = 1 + pct[i] / 100;
    out.push(prev ? cur / prev - 1 : 0);
  }
  return out;
}
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; cov += da * db; va += da * da; vb += db * db; }
  return va === 0 || vb === 0 ? null : cov / Math.sqrt(va * vb);
}
function beta(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let cov = 0, vb = 0;
  for (let i = 0; i < n; i++) { const da = a[i] - ma, db = b[i] - mb; cov += da * db; vb += db * db; }
  return vb === 0 ? null : cov / vb;
}
function annualizedVol(a: number[]): number | null {
  if (a.length < 2) return null;
  const m = mean(a);
  const variance = a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252) * 100;
}
function maxDrawdown(pct: number[]): number | null {
  if (!pct.length) return null;
  let peak = 1 + pct[0] / 100, worst = 0;
  for (const p of pct) {
    const v = 1 + p / 100;
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return worst * 100;
}
function beatRate(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (!n) return null;
  let wins = 0;
  for (let i = 0; i < n; i++) if (a[i] > b[i]) wins++;
  return (wins / n) * 100;
}
// Which precomputed period-return fundamentals field lines up with each
// range selector -- reused for the window (no per-constituent OHLCV fetch).
const RETURN_FIELD: Record<string, string> = { "1M": "1 Month Price Returns", "3M": "3 Month Price Returns", "1Y": "1 Year Price Returns" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtTick(iso: string, rangeKey: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m) return "";
  if (rangeKey === "1Y") return `${MONTHS[m - 1]} '${String(y).slice(2)}`;
  // 1W / 1M / 3M: day + month, so the 5 pivots read as distinct dates.
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]}`;
}

function linePath(vals: number[], min: number, spread: number, w = 100, h = 60): string {
  const pT = 7, pB = 6;
  return vals
    .map((v, i) => `${i === 0 ? "M" : "L"} ${((i / (vals.length - 1)) * w).toFixed(2)} ${(pT + (1 - (v - min) / spread) * (h - pT - pB)).toFixed(2)}`)
    .join(" ");
}
const yPct = (v: number, min: number, spread: number, h = 60) => { const pT = 7, pB = 6; return (pT + (1 - (v - min) / spread) * (h - pT - pB)) / h * 100; };

/** Detail modal: range area chart + every constituent, in the same
    Screener-style table every other ticker-list popup uses (see
    UniverseTable), ordered by market cap and carrying an extra MKT CAP
    column — the index-specific context "you can adjust it" covers. */
const StatRow = ({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: "1px solid var(--hair)", fontSize: 12 }}>
    <span style={{ color: "var(--muted)" }}>{k}</span>
    <span style={{ fontFamily: MONO, fontWeight: 700, color: tone }}>{v}</span>
  </div>
);

function DetailModal({ entry, ihsg, steps, rangeKey, marketDate, onClose }: { entry: CompareEntry; ihsg: Pt[]; steps: number; rangeKey: string; marketDate: string; onClose: () => void }) {
  const { bundle, openTicker } = useApp();
  const [universe, setUniverse] = useState<Universe | null>(null);
  const pct = windowPct(entry.series, steps);
  const dates = windowDates(ihsg, steps);
  const ihsgPct = windowPct(ihsg, steps, dates.length ? dates : undefined);
  const chg = pct ? pct[pct.length - 1] / 100 : null;
  const ihsgChg = ihsgPct ? ihsgPct[ihsgPct.length - 1] / 100 : null;

  const stats = useMemo(() => {
    if (!pct || !ihsgPct) return null;
    const a = toDailyReturns(pct), b = toDailyReturns(ihsgPct);
    return { corr: correlation(a, b), beta: beta(a, b), vol: annualizedVol(a), maxDd: maxDrawdown(pct), beatRate: beatRate(a, b) };
  }, [pct, ihsgPct]);

  useEffect(() => {
    if (!marketDate) return;
    let cancelled = false;
    loadUniverse(marketDate).then((u) => !cancelled && setUniverse(u)).catch(() => {});
    return () => { cancelled = true; };
  }, [marketDate]);

  const universeByTicker = useMemo(() => {
    const m = new Map<string, UniverseRow>();
    (universe?.rows || []).forEach((r) => m.set(r.ticker, r));
    return m;
  }, [universe]);

  const constituents = useMemo(() => {
    // Every real constituent is listed — a ticker with no published Market
    // Cap still appears (MKT CAP reads "—" for it) rather than being dropped,
    // same "don't silently shrink the real membership" rule Market Map
    // follows for its own treemap tiles. Sorted by market cap descending;
    // the mcap-less tail keeps the group's original constituent order.
    const rows = (entry.group?.constituents || []).map((c) => {
      const raw = bundle?.fundamentals.get(c.ticker.toUpperCase()) as JsonRecord | undefined;
      return { ticker: c.ticker.toUpperCase(), mcap: asNumber(raw?.["Market Cap"]), fund: raw };
    });
    const withCap = rows.filter((r) => r.mcap !== null && r.mcap > 0).sort((a, b) => (b.mcap as number) - (a.mcap as number));
    const withoutCap = rows.filter((r) => r.mcap === null || r.mcap <= 0);
    return [...withCap, ...withoutCap];
  }, [entry, bundle]);
  const totalConstituents = entry.group?.constituents?.length ?? 0;
  const mcapByTicker = useMemo(() => new Map(constituents.map((c) => [c.ticker, c.mcap])), [constituents]);
  const tableRows: UniverseTableRow[] = constituents.map((c) => ({ ticker: c.ticker, ur: universeByTicker.get(c.ticker) }));

  // Leaders/Laggards: each constituent's own published period-return field
  // (matching the selected range — see RETURN_FIELD) vs the index's own
  // IHSG return over the same window. Reuses fundamentals already loaded
  // in `bundle` — no extra per-constituent OHLCV fetch.
  const returnField = RETURN_FIELD[rangeKey];
  const ranked = useMemo(() => {
    if (!returnField) return null;
    const rows = constituents
      .map((c) => ({ ticker: c.ticker, ret: asNumber(c.fund?.[returnField]) }))
      .filter((r): r is { ticker: string; ret: number } => r.ret !== null);
    return rows.sort((a, b) => b.ret - a.ret);
  }, [constituents, returnField]);
  const leaders = ranked ? ranked.slice(0, 5) : [];
  const laggards = ranked ? [...ranked].reverse().slice(0, 5) : [];

  let chart: React.ReactNode = <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No data for this range.</div>;
  if (pct) {
    const allVals = [...pct, ...(ihsgPct || []), 0];
    const min = Math.min(...allVals), spread = Math.max(...allVals) - min || 1;
    const d = linePath(pct, min, spread);
    const yTicks = Array.from({ length: 5 }, (_, i) => { const v = Math.max(...allVals) - spread * i / 4; return { v, top: yPct(v, min, spread) }; });
    const nX = 5;
    const xIdx = dates.length ? [...new Set(Array.from({ length: nX }, (_, i) => Math.round(i * (dates.length - 1) / (nX - 1))))] : [];
    chart = (
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ position: "relative", width: 40, flex: "none" }}>
          {yTicks.map((t, i) => <div key={i} style={{ position: "absolute", right: 4, top: `${t.top}%`, transform: "translateY(-50%)", fontFamily: MONO, fontSize: 9.5, color: "var(--faint)" }}>{relFmt(t.v)}</div>)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ position: "relative", height: 220 }}>
            {yTicks.map((t, i) => <div key={i} style={{ position: "absolute", left: 0, right: 0, top: `${t.top}%`, borderTop: "1px solid var(--hair)" }} />)}
            <div style={{ position: "absolute", left: 0, right: 0, top: `${yPct(0, min, spread)}%`, borderTop: "1.5px dashed var(--muted)", opacity: 0.6 }} />
            <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }} aria-label={`${entry.label} vs IHSG % return`}>
              <path d={`${d} L 100 60 L 0 60 Z`} fill={(chg ?? 0) >= 0 ? "var(--upSoft)" : "var(--downSoft)"} />
              <path d={d} fill="none" stroke={(chg ?? 0) >= 0 ? "var(--up)" : "var(--down)"} strokeWidth={2.2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              {ihsgPct ? <path d={linePath(ihsgPct, min, spread)} fill="none" stroke="var(--text)" strokeWidth={1.6} strokeDasharray="3 2" opacity={0.75} vectorEffect="non-scaling-stroke" /> : null}
            </svg>
          </div>
          <div style={{ position: "relative", height: 14, marginTop: 4 }}>
            {xIdx.map((idx, i) => (
              <div key={i} style={{ position: "absolute", left: `${(idx / (dates.length - 1)) * 100}%`, transform: idx === 0 ? "translateX(0)" : idx === dates.length - 1 ? "translateX(-100%)" : "translateX(-50%)", fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", whiteSpace: "nowrap" }}>{fmtTick(dates[idx], rangeKey)}</div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 8, fontSize: 11 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 14, height: 2, background: (chg ?? 0) >= 0 ? "var(--up)" : "var(--down)", display: "inline-block" }} />{entry.label}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--muted)" }}><span style={{ width: 14, height: 0, borderTop: "1.6px dashed var(--text)", display: "inline-block" }} />IHSG</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Modal title={`${entry.label} — Return vs IHSG`} kicker="INDEX DETAIL" onClose={onClose} maxWidth={1180}>
      <div style={{ fontSize: 10.5, color: "var(--faint)", marginBottom: 12 }}>Latest data: {marketDate}</div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 460px", minWidth: 300 }}>{chart}</div>
        <div style={{ display: "flex", gap: 20, flex: "1 1 320px", minWidth: 280 }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...KICKER, marginBottom: 4 }}>RETURNS</div>
            <StatRow k={entry.label} v={chg === null ? "—" : formatPercent(chg)} tone={chg == null ? undefined : chg >= 0 ? "var(--up)" : "var(--down)"} />
            <StatRow k="IHSG" v={ihsgChg === null ? "—" : formatPercent(ihsgChg)} tone={ihsgChg == null ? undefined : ihsgChg >= 0 ? "var(--up)" : "var(--down)"} />
            <StatRow k="Excess" v={chg != null && ihsgChg != null ? formatPercent(chg - ihsgChg) : "—"} tone={chg != null && ihsgChg != null ? (chg - ihsgChg >= 0 ? "var(--up)" : "var(--down)") : undefined} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ ...KICKER, marginBottom: 4 }}>STATS VS IHSG</div>
            <StatRow k="Correlation" v={stats?.corr != null ? stats.corr.toFixed(2) : "—"} />
            <StatRow k="Beta" v={stats?.beta != null ? stats.beta.toFixed(2) : "—"} />
            <StatRow k="Max drawdown" v={stats?.maxDd != null ? `${stats.maxDd.toFixed(1)}%` : "—"} tone="var(--down)" />
            <StatRow k="Vol (ann.)" v={stats?.vol != null ? `${stats.vol.toFixed(1)}%` : "—"} />
            <StatRow k="Beat rate" v={stats?.beatRate != null ? `${stats.beatRate.toFixed(0)}%` : "—"} />
          </div>
        </div>
      </div>

      {ranked ? (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 18 }}>
          <div style={{ flex: "1 1 240px", minWidth: 220 }}>
            <div style={{ ...KICKER, marginBottom: 6 }}>LEADERS · {RETURN_FIELD[rangeKey].replace(" Price Returns", "")}</div>
            {leaders.length ? leaders.map((r) => (
              <div key={r.ticker} onClick={() => { onClose(); openTicker(r.ticker); }} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--hair)", fontSize: 12, cursor: "pointer" }}>
                <span style={{ fontFamily: MONO, fontWeight: 700 }}>{r.ticker}</span>
                <span style={{ display: "flex", gap: 10 }}>
                  <span style={{ fontFamily: MONO, color: r.ret >= 0 ? "var(--up)" : "var(--down)" }}>{formatPercent(r.ret)}</span>
                  <span style={{ fontFamily: MONO, color: "var(--faint)" }}>{ihsgChg != null ? relFmt((r.ret - ihsgChg) * 100) : "—"}</span>
                </span>
              </div>
            )) : <div style={{ fontSize: 11.5, color: "var(--faint)" }}>No constituents with a published return for this range.</div>}
          </div>
          <div style={{ flex: "1 1 240px", minWidth: 220 }}>
            <div style={{ ...KICKER, marginBottom: 6 }}>LAGGARDS · {RETURN_FIELD[rangeKey].replace(" Price Returns", "")}</div>
            {laggards.length ? laggards.map((r) => (
              <div key={r.ticker} onClick={() => { onClose(); openTicker(r.ticker); }} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid var(--hair)", fontSize: 12, cursor: "pointer" }}>
                <span style={{ fontFamily: MONO, fontWeight: 700 }}>{r.ticker}</span>
                <span style={{ display: "flex", gap: 10 }}>
                  <span style={{ fontFamily: MONO, color: r.ret >= 0 ? "var(--up)" : "var(--down)" }}>{formatPercent(r.ret)}</span>
                  <span style={{ fontFamily: MONO, color: "var(--faint)" }}>{ihsgChg != null ? relFmt((r.ret - ihsgChg) * 100) : "—"}</span>
                </span>
              </div>
            )) : <div style={{ fontSize: 11.5, color: "var(--faint)" }}>No constituents with a published return for this range.</div>}
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 12 }}>Leaders/laggards aren&apos;t available at the 1-week range (no published weekly return field) — switch to 1M, 3M, or 1Y.</div>
      )}

      {tableRows.length ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ ...KICKER, marginBottom: 9 }}>CONSTITUENTS · {totalConstituents} · BY MARKET CAP</div>
          <UniverseTable
            rows={tableRows}
            onOpenTicker={(t) => { onClose(); openTicker(t); }}
            emptyLabel="No constituents with a published market cap."
            extraColumn={{ header: "MKT CAP", width: "82px", render: (row) => <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>Rp {formatMarketCapBn(mcapByTicker.get(row.ticker))}</span> }}
          />
        </div>
      ) : null}
      {entry.group?.weightMethod ? (
        <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 10 }}>Weighted by: {entry.group.weightMethod}{entry.group.weightMethod.toLowerCase().includes("equal fallback") ? " — falls back to equal weighting for any constituent without a real market cap." : "."}</div>
      ) : null}
      <div style={{ marginTop: 12 }}><Provenance source="Local research index · fundamentals" asOf={marketDate} /></div>
    </Modal>
  );
}

// Grey-by-default multi-line chart, every series indexed to 100 at the window start —
// the y-axis reads directly as "% return since the start of the window". Click a series
// (line or legend row) to toggle it; IHSG is the dashed benchmark.
export function IndexCompareSection({ title, badge, hint, entries, ihsg, defaultRange = "1W" }: {
  title: string; badge: string; hint: string; entries: CompareEntry[]; ihsg: Pt[]; defaultRange?: string;
}) {
  const { marketDate } = useApp();
  const [rangeKey, setRangeKey] = useState(defaultRange);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<CompareEntry | null>(null);
  const range = RANGES.find((r) => r.key === rangeKey) || RANGES[0];
  const toggle = (id: string) => setOff((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const model = useMemo(() => {
    const dates = windowDates(ihsg, range.steps);
    const ihsgPct = windowPct(ihsg, range.steps);
    // Entries must land on IHSG's exact trailing dates to be plotted against
    // it — a series whose pipeline fell out of sync with IHSG's (different
    // latest date, a gap, etc.) is dropped from this range rather than
    // silently drawn at the wrong x-position (see windowPct's doc comment).
    const benchDates = dates.length ? dates : undefined; // IHSG itself short on data for this range → don't suppress entries that have their own
    const series = entries.map((entry, i) => ({ entry, color: CAT[i % CAT.length], pct: windowPct(entry.series, range.steps, benchDates) }))
      .filter((s): s is { entry: CompareEntry; color: string; pct: number[] } => s.pct !== null);
    const droppedForStaleness = dates.length > 0 && entries.length > series.length;
    const onVals = series.filter((s) => !off.has(s.entry.id)).flatMap((s) => s.pct);
    const allVals = [...onVals, ...(ihsgPct || []), 0];
    const min = Math.min(...allVals), max = Math.max(...allVals);
    const spread = max - min || 1;
    return { series, ihsgPct, min, max, spread, dates, droppedForStaleness };
  }, [entries, ihsg, range, off]);

  if (!entries.length) return null;
  const { series, ihsgPct, min, max, spread, dates, droppedForStaleness } = model;
  const selCount = series.filter((s) => !off.has(s.entry.id)).length;

  // y gridlines (5) labelled as % vs the 0 start
  const yTicks = Array.from({ length: 5 }, (_, i) => { const v = max - (spread) * i / 4; return { v, top: yPct(v, min, spread) }; });
  // x ticks — ~4 evenly spaced dates, de-duplicated month labels
  const nX = 6; // 6 pivot dates on the x-axis for every timeframe
  const xIdx = dates.length ? [...new Set(Array.from({ length: nX }, (_, i) => Math.round(i * (dates.length - 1) / (nX - 1))))] : [];
  let lastLabel = "";
  const xTicks = xIdx.map((idx) => { let lab = fmtTick(dates[idx], rangeKey); if (rangeKey !== "1W" && lab === lastLabel) lab = ""; else lastLabel = lab; return { left: (idx / (dates.length - 1)) * 100, lab }; });

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "16px 18px", boxShadow: "var(--shadow)", marginBottom: 16, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 11 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <span style={KICKER}>{title}</span>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", background: "var(--soft)", borderRadius: 6, padding: "2px 7px" }}>{badge}</span>
          </div>
          <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 4 }}>{hint}</div>
          {droppedForStaleness ? (
            <div style={{ fontSize: 10, color: "var(--warning)", marginTop: 4 }}>
              {entries.length - series.length} of {entries.length} series hidden for this range — their data doesn&apos;t line up on IHSG&apos;s trading dates (a source out of sync), so they&apos;re dropped rather than plotted at the wrong date.
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 3, flexShrink: 0 }}>
          {RANGES.map((r) => {
            const enabled = windowPct(ihsg, r.steps) !== null || entries.some((e) => windowPct(e.series, r.steps) !== null);
            const active = r.key === rangeKey;
            return (
              <button key={r.key} type="button" disabled={!enabled} onClick={() => setRangeKey(r.key)} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "4px 10px", borderRadius: 7, border: "none", cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.4, background: active ? "var(--accent)" : "var(--soft)", color: active ? "#fff" : "var(--muted)" }}>{r.key}</button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "stretch", flexWrap: "wrap", flex: 1 }}>
        <div style={{ flex: "1 1 460px", minWidth: 300, display: "flex", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", flex: "none" }}>
            <span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: ".14em", color: "var(--faint)", writingMode: "vertical-rl", transform: "rotate(180deg)", whiteSpace: "nowrap" }}>% RETURN SINCE START</span>
          </div>
          <div style={{ position: "relative", width: 34, flex: "none" }}>
            {yTicks.map((t, i) => (
              <div key={i} style={{ position: "absolute", right: 0, top: `${t.top}%`, transform: "translateY(-50%)", fontFamily: MONO, fontSize: 9, fontWeight: Math.abs(t.v) < 1e-6 ? 700 : 500, color: Math.abs(t.v) < 1e-6 ? "var(--muted)" : "var(--faint)" }}>{relFmt(t.v)}</div>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ position: "relative", flex: 1, minHeight: 340 }}>
              {yTicks.map((t, i) => <div key={i} style={{ position: "absolute", left: 0, right: 0, top: `${t.top}%`, borderTop: "1px solid var(--hair)" }} />)}
              <div style={{ position: "absolute", left: 0, right: 0, top: `${yPct(0, min, spread)}%`, borderTop: "1.5px dashed var(--muted)", opacity: 0.75 }} />
              <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }} aria-label={`${title}: % return`}>
                {series.map((s) => {
                  const on = !off.has(s.entry.id);
                  return <path key={s.entry.id} d={linePath(s.pct, min, spread)} fill="none" stroke={on ? s.color : "var(--faint)"} strokeWidth={on ? 2.4 : 1.2} opacity={on ? 1 : 0.28} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />;
                })}
                {ihsgPct ? <path d={linePath(ihsgPct, min, spread)} fill="none" stroke="var(--text)" strokeWidth={2} strokeDasharray="3 2" vectorEffect="non-scaling-stroke" opacity={0.8} /> : null}
              </svg>
              {/* end labels + dots for selected series */}
              {series.filter((s) => !off.has(s.entry.id)).map((s) => {
                const v = s.pct[s.pct.length - 1];
                return <div key={s.entry.id}>
                  <div style={{ position: "absolute", left: "calc(100% - 3px)", top: `${yPct(v, min, spread)}%`, width: 7, height: 7, borderRadius: "50%", background: s.color, transform: "translate(-50%,-50%)", boxShadow: "0 0 0 2px var(--panel)" }} />
                  <div style={{ position: "absolute", right: 0, top: `${yPct(v, min, spread)}%`, transform: "translate(calc(100% + 4px),-50%)", fontFamily: MONO, fontSize: 9, fontWeight: 700, color: s.color, whiteSpace: "nowrap" }}>{relFmt(v)}</div>
                </div>;
              })}
            </div>
            <div style={{ position: "relative", height: 13, marginTop: 5 }}>
              {xTicks.map((t, i) => <div key={i} style={{ position: "absolute", left: `${t.left}%`, transform: t.left <= 2 ? "translateX(0)" : t.left >= 98 ? "translateX(-100%)" : "translateX(-50%)", fontFamily: MONO, fontSize: 9, color: "var(--faint)", whiteSpace: "nowrap" }}>{t.lab}</div>)}
            </div>
            <div style={{ textAlign: "center", fontFamily: MONO, fontSize: 8.5, letterSpacing: ".12em", color: "var(--faint)", marginTop: 2 }}>{X_TITLE[rangeKey] || "TRADING SESSIONS"}</div>
          </div>
          <div style={{ width: 28, flex: "none" }} />
        </div>

        <div style={{ width: 200, flex: "none", display: "flex", flexDirection: "column", borderLeft: "1px solid var(--hair)", paddingLeft: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>SERIES</span>
            <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 5, padding: "1px 7px" }}>{selCount}/{series.length}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--hair)", marginBottom: 4 }}>
            <span style={{ width: 15, height: 0, borderTop: "2px dashed var(--text)", flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 700, flex: 1 }}>IHSG</span>
            <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)" }}>bench</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, maxHeight: 340 }}>
            {series.map((s) => {
              const on = !off.has(s.entry.id);
              const v = s.pct[s.pct.length - 1] / 100;
              return (
                <div key={s.entry.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button type="button" onClick={() => toggle(s.entry.id)} style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, padding: "5px 6px", border: "none", borderRadius: 8, background: on ? "var(--soft)" : "transparent", cursor: "pointer", textAlign: "left" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: on ? s.color : "var(--faint)", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 500, color: on ? "var(--text)" : "var(--muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.entry.label}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: on ? (v >= 0 ? "var(--up)" : "var(--down)") : "var(--faint)" }}>{formatPercent(v)}</span>
                  </button>
                  <button type="button" onClick={() => setDetail(s.entry)} title={`${s.entry.label} detail`} style={{ border: "none", background: "transparent", color: "var(--faint)", cursor: "pointer", fontSize: 12, padding: "0 2px" }}>›</button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {detail ? <DetailModal entry={detail} ihsg={ihsg} steps={range.steps} rangeKey={rangeKey} marketDate={marketDate} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}
