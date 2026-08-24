import type { JsonRecord, OhlcvRow } from "@/lib/domain/types";
import { asNumber } from "@/lib/format/number";
import { computeAnchoredVwap, type AvwapPoint } from "@/lib/indicators/anchoredVwap";
import type { VolumeProfileResult } from "@/lib/indicators/volumeProfile";

// Extra reference levels for the ticker-page price ladder, grouped so they
// can be toggled on/off. Every number here is either read directly from a
// published field, or computed client-side from real OHLCV using the exact
// same formulas already shipped elsewhere in this app (anchored VWAP + σ
// bands from the chart overlay, the anchored Volume Profile from
// lib/indicators/volumeProfile.ts). Nothing is invented — a group with no
// usable input simply contributes no levels.

export type LevelGroup = "vp" | "ma" | "cqvwap" | "pqvwap" | "cyvwap" | "pyvwap" | "ib" | "pwmp" | "cwmp" | "dcf";
export type PriceLevel = { id: string; group: LevelGroup; label: string; price: number; tone: "up" | "down" | "flat"; explain: string };

export const GROUP_META: Record<LevelGroup, { label: string; short: string }> = {
  vp: { label: "Volume Profile", short: "VP" },
  ma: { label: "Moving Averages", short: "MA" },
  cqvwap: { label: "Current Quarter VWAP", short: "CQ" },
  pqvwap: { label: "Previous Quarter VWAP", short: "PQ" },
  cyvwap: { label: "Current Year VWAP", short: "CY" },
  pyvwap: { label: "Previous Year VWAP", short: "PY" },
  ib: { label: "Initial Balance", short: "IB" },
  pwmp: { label: "Previous Week", short: "PW" },
  cwmp: { label: "Current Week", short: "CW" },
  dcf: { label: "DCF Fair Value", short: "DCF" },
};

/** VAH / POC / VAL from the anchored Volume Profile (real volume-at-price
    histogram over the most recent qualifying consolidation — see
    lib/indicators/volumeProfile.ts). Null input (no qualifying anchor found
    in the lookback) contributes no levels rather than a guess. */
export function buildVolumeProfileLevels(vp: VolumeProfileResult | null): PriceLevel[] {
  if (!vp) return [];
  const range = `${vp.anchor.startDate} → ${vp.anchor.endDate}`;
  return [
    { id: "vp-vah", group: "vp", label: "VAH", price: vp.vah, tone: "up", explain: `Value Area High — top of the zone holding 70% of volume, anchored to the last consolidation before the ${vp.anchor.direction === "up" ? "breakout up" : "breakdown"} (${range}).` },
    { id: "vp-poc", group: "vp", label: "POC", price: vp.poc, tone: "flat", explain: `Point of Control — the single price with the most traded volume in that same anchored range (${range}).` },
    { id: "vp-val", group: "vp", label: "VAL", price: vp.val, tone: "down", explain: `Value Area Low — bottom of the 70%-volume zone, same anchored range (${range}).` },
  ];
}

export function buildMaLevels(ma: JsonRecord | undefined): PriceLevel[] {
  const out: PriceLevel[] = [];
  const ema25 = asNumber(ma?.["ema25"]);
  const ema50 = asNumber(ma?.["ema50"]);
  const sma200 = asNumber(ma?.["sma200"]);
  if (ema25 != null) out.push({ id: "ma-ema25", group: "ma", label: "EMA 25", price: ema25, tone: "flat", explain: "25-session exponential moving average — a fast trend reference; a close crossing it often signals a short-term shift." });
  if (ema50 != null) out.push({ id: "ma-ema50", group: "ma", label: "EMA 50", price: ema50, tone: "flat", explain: "50-session exponential moving average — the medium-term trend line most swing setups key off." });
  if (sma200 != null) out.push({ id: "ma-sma200", group: "ma", label: "SMA 200", price: sma200, tone: "flat", explain: "200-session simple moving average — the standard long-term trend line and a widely-watched support/resistance level." });
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

/** Current + Previous Quarter/Year anchored-VWAP bands, computed client-side
    from real OHLCV with the same engine behind the chart's AVWAP overlay.
    "Current" is the live, still-accruing period; "Previous" is frozen at the
    prior period's last bar. */
export function buildQuarterVwapLevels(rows: OhlcvRow[] | undefined): { current: PriceLevel[]; previous: PriceLevel[] } {
  if (!rows || rows.length < 5) return { current: [], previous: [] };
  const q = computeAnchoredVwap(rows, "quarter");
  const lastQ = [...q.points].reverse().find((p) => p);
  return {
    current: lastQ ? vwapProfileLevels("cqvwap", "CQVWAP", "the current quarter", lastQ) : [],
    previous: q.prevFinalPoint ? vwapProfileLevels("pqvwap", "PQVWAP", "the previous (completed) quarter", q.prevFinalPoint) : [],
  };
}

export function buildYearVwapLevels(rows: OhlcvRow[] | undefined): { current: PriceLevel[]; previous: PriceLevel[] } {
  if (!rows || rows.length < 5) return { current: [], previous: [] };
  const y = computeAnchoredVwap(rows, "year");
  const lastY = [...y.points].reverse().find((p) => p);
  return {
    current: lastY ? vwapProfileLevels("cyvwap", "CYVWAP", "the current year", lastY) : [],
    previous: y.prevFinalPoint ? vwapProfileLevels("pyvwap", "PYVWAP", "the previous (completed) year", y.prevFinalPoint) : [],
  };
}

/** Today's Initial Balance (opening-session range). */
export function buildInitialBalanceLevels(technical: JsonRecord | undefined): PriceLevel[] {
  const mp = (technical?.["marketProfile"] || {}) as JsonRecord;
  const out: PriceLevel[] = [];
  const ibh = asNumber(mp["ibh"]), ibl = asNumber(mp["ibl"]);
  if (ibh != null) out.push({ id: "ib-ibh", group: "ib", label: "IBH", price: ibh, tone: "up", explain: "Today's Initial Balance high — the range set in the opening sessions; a breakout above often sets the day's directional bias." });
  if (ibl != null) out.push({ id: "ib-ibl", group: "ib", label: "IBL", price: ibl, tone: "down", explain: "Today's Initial Balance low — the range set in the opening sessions; a breakdown below often sets the day's directional bias." });
  return out;
}

/** Previous week's high/low. */
export function buildPreviousWeekLevels(technical: JsonRecord | undefined): PriceLevel[] {
  const mp = (technical?.["marketProfile"] || {}) as JsonRecord;
  const out: PriceLevel[] = [];
  const pwh = asNumber(mp["pwh"]), pwl = asNumber(mp["pwl"]);
  if (pwh != null) out.push({ id: "pw-pwh", group: "pwmp", label: "PWH", price: pwh, tone: "up", explain: "Previous week's high — a widely-watched short-term reference level." });
  if (pwl != null) out.push({ id: "pw-pwl", group: "pwmp", label: "PWL", price: pwl, tone: "down", explain: "Previous week's low — a widely-watched short-term reference level." });
  return out;
}

/** Current week's first trading day (Monday) high/low. */
export function buildCurrentWeekLevels(technical: JsonRecord | undefined): PriceLevel[] {
  const mp = (technical?.["marketProfile"] || {}) as JsonRecord;
  const out: PriceLevel[] = [];
  const mdh = asNumber(mp["mdh"]), mdl = asNumber(mp["mdl"]);
  if (mdh != null) out.push({ id: "cw-mdh", group: "cwmp", label: "MDH", price: mdh, tone: "up", explain: "The current week's first trading day (Monday) high — an early-week reference level." });
  if (mdl != null) out.push({ id: "cw-mdl", group: "cwmp", label: "MDL", price: mdl, tone: "down", explain: "The current week's first trading day (Monday) low — an early-week reference level." });
  return out;
}

export function buildDcfLevels(fairValue: number | null, bear: number | null, bull: number | null): PriceLevel[] {
  const out: PriceLevel[] = [];
  if (fairValue != null && isFinite(fairValue)) out.push({ id: "dcf-fair", group: "dcf", label: "DCF Fair Value", price: fairValue, tone: "flat", explain: "Discounted-cash-flow fair value per share under current-close assumptions — see the DCF panel below for the full model and adjustable inputs." });
  if (bear != null && isFinite(bear)) out.push({ id: "dcf-bear", group: "dcf", label: "DCF Bear Case", price: bear, tone: "down", explain: "DCF fair value with the discount rate shifted +1.5pp — the model's bear-case estimate." });
  if (bull != null && isFinite(bull)) out.push({ id: "dcf-bull", group: "dcf", label: "DCF Bull Case", price: bull, tone: "up", explain: "DCF fair value with the discount rate shifted −1.5pp — the model's bull-case estimate." });
  return out;
}
