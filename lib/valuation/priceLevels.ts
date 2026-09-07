import type { OhlcvRow } from "@/lib/domain/types";
import { computeAnchoredVwap, type AvwapPoint } from "@/lib/indicators/anchoredVwap";
import { computeInitialBalance } from "@/lib/indicators/initialBalance";

// Extra reference levels for the ticker-page price ladder, grouped so they
// can be toggled on/off. Every group here is computed client-side from the
// ticker's own real published OHLCV -- not from precomputed backend fields
// (fundamentals, technical.movingAverages, marketProfile), which have shown
// real coverage gaps for some tickers. Deriving from OHLCV directly means
// any ticker with published bars gets a real value; a group only comes back
// empty when there truly isn't enough history yet (e.g. SMA 200 needs 200
// bars) -- an honest gap, never fabricated.

export type LevelGroup = "ma" | "pqvwap" | "pyvwap" | "ibhl" | "mondayRange" | "w52";
export type PriceLevel = { id: string; group: LevelGroup; label: string; price: number; tone: "up" | "down" | "flat"; explain: string };

export const GROUP_META: Record<LevelGroup, { label: string; short: string }> = {
  ma: { label: "Moving Average", short: "Moving Average" },
  pqvwap: { label: "PQ VWAP", short: "PQ VWAP" },
  pyvwap: { label: "PY VWAP", short: "PY VWAP" },
  ibhl: { label: "IBH/IBL", short: "IBH/IBL" },
  mondayRange: { label: "Monday Range", short: "Monday Range" },
  w52: { label: "52W Range", short: "52W Range" },
};

function sma(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(closes.length - period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function ema(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let value = closes.slice(0, period).reduce((a, b) => a + b, 0) / period; // seed = SMA of the first `period` closes
  for (let i = period; i < closes.length; i++) value = closes[i] * k + value * (1 - k);
  return value;
}

/** EMA 25 / EMA 50 / SMA 200, computed directly from published daily closes
    (not the backend's precomputed movingAverages field). */
export function buildMaLevels(rows: OhlcvRow[] | undefined): PriceLevel[] {
  if (!rows || !rows.length) return [];
  const closes = rows.map((r) => r.close);
  const out: PriceLevel[] = [];
  const e25 = ema(closes, 25);
  const e50 = ema(closes, 50);
  const s200 = sma(closes, 200);
  if (e25 != null) out.push({ id: "ma-ema25", group: "ma", label: "EMA 25", price: e25, tone: "flat", explain: "25-session exponential moving average, computed from published daily closes — a fast trend reference." });
  if (e50 != null) out.push({ id: "ma-ema50", group: "ma", label: "EMA 50", price: e50, tone: "flat", explain: "50-session exponential moving average, computed from published daily closes — the medium-term trend line most swing setups key off." });
  if (s200 != null) out.push({ id: "ma-sma200", group: "ma", label: "SMA 200", price: s200, tone: "flat", explain: "200-session simple moving average, computed from published daily closes — the standard long-term trend line and a widely-watched support/resistance level." });
  return out;
}

/** One VWAP profile's ±2σ/±1σ/centerline bands, tagged to the given group. */
function vwapProfileLevels(group: LevelGroup, label: string, period: string, pt: AvwapPoint): PriceLevel[] {
  return [
    { id: `${group}-u2`, group, label: `${label} +2σ`, price: pt.u2, tone: "up", explain: `2 standard deviations above ${label} — a statistically extreme zone, over ${period}.` },
    { id: `${group}-u1`, group, label: `${label} +1σ`, price: pt.u1, tone: "up", explain: `1 standard deviation above ${label} — a common resistance / profit-taking zone, over ${period}.` },
    { id: `${group}-c`, group, label, price: pt.vwap, tone: "flat", explain: `Volume-weighted average price over ${period} — the average price institutions actually transacted at over that period.` },
    { id: `${group}-l1`, group, label: `${label} −1σ`, price: pt.l1, tone: "down", explain: `1 standard deviation below ${label} — a common support / value-seeking zone, over ${period}.` },
    { id: `${group}-l2`, group, label: `${label} −2σ`, price: pt.l2, tone: "down", explain: `2 standard deviations below ${label} — a statistically extreme zone, over ${period}.` },
  ];
}

/** Previous (completed) Quarter VWAP ±σ bands, computed client-side from
    real OHLCV with the same engine behind the chart's AVWAP overlay. */
export function buildPqVwapLevels(rows: OhlcvRow[] | undefined): PriceLevel[] {
  if (!rows || rows.length < 5) return [];
  const q = computeAnchoredVwap(rows, "quarter");
  return q.prevFinalPoint ? vwapProfileLevels("pqvwap", "PQVWAP", "the previous (completed) quarter", q.prevFinalPoint) : [];
}

/** Previous (completed) Year VWAP ±σ bands. */
export function buildPyVwapLevels(rows: OhlcvRow[] | undefined): PriceLevel[] {
  if (!rows || rows.length < 5) return [];
  const y = computeAnchoredVwap(rows, "year");
  return y.prevFinalPoint ? vwapProfileLevels("pyvwap", "PYVWAP", "the previous (completed) year", y.prevFinalPoint) : [];
}

/** Monthly Initial Balance (IBH/IBL) — high/low across the most recent
    calendar month's first 2 trading sessions, locked for the rest of that
    month. lib/indicators/initialBalance.ts is the single source of this
    calculation (also used by the companion-chart overlay). */
export function buildIbhIblLevels(rows: OhlcvRow[] | undefined): PriceLevel[] {
  if (!rows || !rows.length) return [];
  const bands = computeInitialBalance(rows);
  const band = bands[bands.length - 1];
  if (!band) return [];
  return [
    { id: "ibhl-high", group: "ibhl", label: "IBH", price: band.ibHigh, tone: "up", explain: `Monthly Initial Balance high — the high across ${band.monthKey}'s first 2 trading sessions, locked for the rest of the month.` },
    { id: "ibhl-low", group: "ibhl", label: "IBL", price: band.ibLow, tone: "down", explain: `Monthly Initial Balance low — same window (${band.monthKey}), locked for the rest of the month.` },
  ];
}

/** Index of the current (most recent) week's first trading day — the week
    "resets" whenever a bar's weekday doesn't come after the previous bar's
    (a Monday after a Friday, or a Tuesday after a Monday holiday-shifted
    week, etc.), so this also covers weeks where Monday itself was a holiday. */
function lastWeekStartIndex(rows: OhlcvRow[]): number {
  let start = 0;
  for (let i = 1; i < rows.length; i++) {
    const dow = new Date(`${rows[i].date}T00:00:00Z`).getUTCDay();
    const prevDow = new Date(`${rows[i - 1].date}T00:00:00Z`).getUTCDay();
    if (dow <= prevDow) start = i;
  }
  return start;
}

/** High/low of the current week's first trading day (Monday, or the first
    session of that week when Monday was a holiday). */
export function buildMondayRangeLevels(rows: OhlcvRow[] | undefined): PriceLevel[] {
  if (!rows || !rows.length) return [];
  const row = rows[lastWeekStartIndex(rows)];
  return [
    { id: "monday-high", group: "mondayRange", label: "Monday High", price: row.high, tone: "up", explain: `High of the current week's first trading day (${row.date}).` },
    { id: "monday-low", group: "mondayRange", label: "Monday Low", price: row.low, tone: "down", explain: `Low of the current week's first trading day (${row.date}).` },
  ];
}

/** 52-week high/low measured directly off the last ~252 published trading
    days — not the (sometimes-missing) fundamentals field. Discloses the
    real window when less than a full year is available, rather than
    silently scoping down. */
export function buildFiftyTwoWeekLevels(rows: OhlcvRow[] | undefined): PriceLevel[] {
  if (!rows || !rows.length) return [];
  const window = rows.slice(-252);
  const hi = Math.max(...window.map((r) => r.high));
  const lo = Math.min(...window.map((r) => r.low));
  const partial = window.length < 252 ? ` (only ${window.length} trading days published)` : "";
  return [
    { id: "w52-hi", group: "w52", label: "52W High", price: hi, tone: "up", explain: `Highest high since ${window[0].date}${partial}.` },
    { id: "w52-lo", group: "w52", label: "52W Low", price: lo, tone: "down", explain: `Lowest low since ${window[0].date}${partial}.` },
  ];
}
