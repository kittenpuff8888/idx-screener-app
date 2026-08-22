import type { JsonRecord, OhlcvRow } from "@/lib/domain/types";
import { asNumber } from "@/lib/format/number";
import { computeAnchoredVwap, type AvwapPoint } from "@/lib/indicators/anchoredVwap";

// Extra reference levels for the ticker-page price ladder, grouped so they
// can be toggled on/off. Every number here is either read directly from a
// published field, or computed client-side from real OHLCV using the exact
// same formulas already shipped elsewhere in this app (anchored VWAP + σ
// bands from the chart overlay). Nothing is invented — a group with no
// usable input simply contributes no levels.

export type LevelGroup = "ma" | "vwap" | "smc" | "pivot" | "dcf";
export type PriceLevel = { id: string; group: LevelGroup; label: string; price: number; tone: "up" | "down" | "flat"; explain: string };

export const GROUP_META: Record<LevelGroup, { label: string; short: string }> = {
  ma: { label: "Moving Averages", short: "MA" },
  vwap: { label: "Anchored VWAP", short: "AVWAP" },
  smc: { label: "SMC / Structure", short: "SMC" },
  pivot: { label: "Pivot Points", short: "Pivot" },
  dcf: { label: "DCF Fair Value", short: "DCF" },
};

function parseRange(v: unknown): [number, number] | null {
  if (typeof v !== "string") return null;
  const m = v.match(/(-?[\d,.]+)\s*-\s*(-?[\d,.]+)/);
  if (!m) return null;
  const a = asNumber(m[1]), b = asNumber(m[2]);
  return a != null && b != null ? [Math.min(a, b), Math.max(a, b)] : null;
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

/** Adds one VWAP profile's centerline + ±1σ/±2σ/±3σ bands to `out`. */
function pushVwapProfile(out: PriceLevel[], idPrefix: string, label: string, period: string, pt: AvwapPoint): void {
  out.push({ id: `${idPrefix}-c`, group: "vwap", label, price: pt.vwap, tone: "flat", explain: `Volume-weighted average price over ${period} — the average price institutions actually transacted at over that period.` });
  const bands: Array<[1 | 2 | 3, "u1" | "u2" | "u3", "l1" | "l2" | "l3"]> = [[1, "u1", "l1"], [2, "u2", "l2"], [3, "u3", "l3"]];
  for (const [n, uk, lk] of bands) {
    out.push({ id: `${idPrefix}-u${n}`, group: "vwap", label: `${label} +${n}σ`, price: pt[uk], tone: "up", explain: `${n} standard deviation${n > 1 ? "s" : ""} above ${label} — a ${n === 3 ? "statistically extreme" : "common resistance / profit-taking"} zone.` });
    out.push({ id: `${idPrefix}-l${n}`, group: "vwap", label: `${label} −${n}σ`, price: pt[lk], tone: "down", explain: `${n} standard deviation${n > 1 ? "s" : ""} below ${label} — a ${n === 3 ? "statistically extreme" : "common support / value-seeking"} zone.` });
  }
}

/** Anchored VWAP + σ-band levels for the same three profiles the reference
    workbook tracks — Current Quarter, Previous Quarter, and Previous Year —
    computed client-side from real OHLCV. The backend publishes only the
    centerline (vwapProfiles.*.vwap), not the σ-band prices, so this reuses
    the exact engine behind the chart's AVWAP overlay to derive them honestly;
    "previous" profiles use its frozen last-bar-of-period snapshot rather than
    a live running value. */
export function buildVwapLevels(rows: OhlcvRow[] | undefined): PriceLevel[] {
  if (!rows || rows.length < 5) return [];
  const out: PriceLevel[] = [];
  const q = computeAnchoredVwap(rows, "quarter");
  const lastQ = [...q.points].reverse().find((p) => p);
  if (lastQ) pushVwapProfile(out, "vwap-cq", "Current QVWAP", "the current quarter", lastQ);
  if (q.prevFinalPoint) pushVwapProfile(out, "vwap-pq", "Prev QVWAP", "the previous (completed) quarter", q.prevFinalPoint);
  const y = computeAnchoredVwap(rows, "year");
  if (y.prevFinalPoint) pushVwapProfile(out, "vwap-py", "Prev Year VWAP", "the previous (completed) year", y.prevFinalPoint);
  return out;
}

/** SMC / market-structure levels already published per ticker: order blocks,
    equilibrium, premium/discount bounds, previous-week and today's initial-
    balance high/low, and structural swing extremes. */
export function buildSmcLevels(technical: JsonRecord | undefined): PriceLevel[] {
  const out: PriceLevel[] = [];
  const smc = (technical?.["smc"] || {}) as JsonRecord;
  const mp = (technical?.["marketProfile"] || {}) as JsonRecord;
  const push = (id: string, label: string, price: number | null | undefined, tone: "up" | "down" | "flat", explain: string) => {
    if (price != null && isFinite(price)) out.push({ id, group: "smc", label, price, tone, explain });
  };
  const ob = (key: string, side: "Bull" | "Bear") => {
    const range = parseRange(smc[key]);
    if (!range) return;
    const tone = side === "Bull" ? "up" : "down";
    push(`smc-${key}-hi`, `OB ${side} High`, range[1], tone, `${side === "Bull" ? "Bullish" : "Bearish"} order block — the last ${side === "Bull" ? "down" : "up"}-close candle before an aggressive ${side === "Bull" ? "rally" : "selloff"}; price often returns here before continuing.`);
    push(`smc-${key}-lo`, `OB ${side} Low`, range[0], tone, `${side === "Bull" ? "Bullish" : "Bearish"} order block boundary — see OB ${side} High for context.`);
  };
  ob("closestBullishBlock", "Bull");
  ob("closestBearishBlock", "Bear");
  const eq = parseRange(smc["equilibrium"]);
  if (eq) {
    push("smc-eq-hi", "EQ High", eq[1], "flat", "Equilibrium — the midpoint band of the current dealing range (Smart Money Concepts); a common reaction zone.");
    push("smc-eq-lo", "EQ Low", eq[0], "flat", "Equilibrium — the midpoint band of the current dealing range (Smart Money Concepts); a common reaction zone.");
  }
  push("smc-strong-high", "Strong High", asNumber(smc["strongHigh"]), "up", "Structural swing high defining the top of the current range — a break above often confirms a new leg up.");
  push("smc-weak-high", "Weak High", asNumber(smc["weakHigh"]), "up", "A minor swing high inside the current range — less significant than Strong High, but still a local supply zone.");
  push("smc-strong-low", "Strong Low", asNumber(smc["strongLow"]), "down", "Structural swing low defining the bottom of the current range — a break below often confirms a new leg down.");
  push("smc-weak-low", "Weak Low", asNumber(smc["weakLow"]), "down", "The most recent minor swing low — a break below it often confirms the range has failed to hold.");
  push("mp-pwh", "PWH", asNumber(mp["pwh"]), "up", "Previous week's high — a widely-watched short-term reference level.");
  push("mp-pwl", "PWL", asNumber(mp["pwl"]), "down", "Previous week's low — a widely-watched short-term reference level.");
  push("mp-ibh", "IBH", asNumber(mp["ibh"]), "up", "Today's Initial Balance high — the range set in the opening sessions; a breakout above often sets the day's directional bias.");
  push("mp-ibl", "IBL", asNumber(mp["ibl"]), "down", "Today's Initial Balance low — the range set in the opening sessions; a breakdown below often sets the day's directional bias.");
  push("mp-mdh", "MDH", asNumber(mp["mdh"]), "up", "The current week's first trading day (Monday) high — an early-week reference level.");
  push("mp-mdl", "MDL", asNumber(mp["mdl"]), "down", "The current week's first trading day (Monday) low — an early-week reference level.");
  return out;
}

/** Most recent swing-low bar: a 5-bar fractal (low[i] below the `lookback`
    bars on each side). Searches backward from the latest bar. */
export function findLatestSwingLow(rows: OhlcvRow[], lookback = 2): OhlcvRow | null {
  for (let i = rows.length - 1 - lookback; i >= lookback; i -= 1) {
    const lo = rows[i].low;
    let isPivot = true;
    for (let k = 1; k <= lookback; k += 1) {
      if (rows[i - k].low <= lo || rows[i + k].low <= lo) { isPivot = false; break; }
    }
    if (isPivot) return rows[i];
  }
  return null;
}

/** Classic floor-trader pivot points, anchored to the latest swing-low bar's
    H/L/C rather than the usual "prior period" — per the explicit ask: a
    pivot ladder that starts from the latest swing low. */
export function buildPivotLevels(rows: OhlcvRow[] | undefined): PriceLevel[] {
  if (!rows || rows.length < 6) return [];
  const anchor = findLatestSwingLow(rows);
  if (!anchor) return [];
  const { high: h, low: l, close: c } = anchor;
  const p = (h + l + c) / 3;
  const r1 = 2 * p - l, s1 = 2 * p - h;
  const r2 = p + (h - l), s2 = p - (h - l);
  const r3 = h + 2 * (p - l), s3 = l - 2 * (h - p);
  const note = `Classic pivot, anchored to the latest swing-low session (${anchor.date}) rather than the usual prior period.`;
  return [
    { id: "pivot-r3", group: "pivot", label: "R3", price: r3, tone: "up", explain: `Third resistance. ${note}` },
    { id: "pivot-r2", group: "pivot", label: "R2", price: r2, tone: "up", explain: `Second resistance. ${note}` },
    { id: "pivot-r1", group: "pivot", label: "R1", price: r1, tone: "up", explain: `First resistance. ${note}` },
    { id: "pivot-p", group: "pivot", label: "Pivot (P)", price: p, tone: "flat", explain: `Central pivot = (H+L+C)/3 of the anchor session. ${note}` },
    { id: "pivot-s1", group: "pivot", label: "S1", price: s1, tone: "down", explain: `First support. ${note}` },
    { id: "pivot-s2", group: "pivot", label: "S2", price: s2, tone: "down", explain: `Second support. ${note}` },
    { id: "pivot-s3", group: "pivot", label: "S3", price: s3, tone: "down", explain: `Third support. ${note}` },
  ];
}

export function buildDcfLevels(fairValue: number | null, bear: number | null, bull: number | null): PriceLevel[] {
  const out: PriceLevel[] = [];
  if (fairValue != null && isFinite(fairValue)) out.push({ id: "dcf-fair", group: "dcf", label: "DCF Fair Value", price: fairValue, tone: "flat", explain: "Discounted-cash-flow fair value per share under current-close assumptions — see the DCF panel below for the full model and adjustable inputs." });
  if (bear != null && isFinite(bear)) out.push({ id: "dcf-bear", group: "dcf", label: "DCF Bear Case", price: bear, tone: "down", explain: "DCF fair value with the discount rate shifted +1.5pp — the model's bear-case estimate." });
  if (bull != null && isFinite(bull)) out.push({ id: "dcf-bull", group: "dcf", label: "DCF Bull Case", price: bull, tone: "up", explain: "DCF fair value with the discount rate shifted −1.5pp — the model's bull-case estimate." });
  return out;
}
