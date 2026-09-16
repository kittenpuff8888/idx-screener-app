// RSI divergence detection for the ticker page's own chart -- a direct port
// of a user-supplied Pine Script v6 divergence indicator's pivot logic
// (ta.pivothigh/pivotlow(rsi, left, right), compare each new pivot only
// against the one immediately before it, `strict` gating whether equal
// highs/lows count). Distinct from scripts/compute_screener_signals.py's
// Python divergence functions (which only cover regular/hidden BULLISH,
// gate on a 5-60 bar pivot-separation window, and only report the latest
// pair) -- this covers all four types and returns every qualifying
// consecutive pivot pair across the whole series, matching the Pine
// script's own behavior of drawing one line per confirmed pair as it plays
// out bar by bar, not just the most recent one.
export type DivergenceType = "regularBull" | "hiddenBull" | "regularBear" | "hiddenBear";
export type DivergencePivot = { idx: number; price: number; rsi: number };
export type Divergence = { type: DivergenceType; a: DivergencePivot; b: DivergencePivot };

/** Symmetric left/right pivot-low scan -- matches Pine's `ta.pivotlow(src,
    left, right)`. Ties allowed on either side (a flat bottom is still a
    valid pivot), matching this project's existing Python pivot helpers;
    `strict` only affects the divergence COMPARISON step below, not pivot
    detection itself -- the Pine script's own `strict` input does the same
    (its tooltip is about "equal highs/lows" between two pivots, not about
    how a single pivot is found). */
function pivotLows(vals: number[], left: number, right: number): number[] {
  const out: number[] = [];
  for (let i = left; i < vals.length - right; i++) {
    const c = vals[i];
    if (Number.isNaN(c)) continue;
    let ok = true;
    for (let j = i - left; j < i && ok; j++) if (!Number.isNaN(vals[j]) && vals[j] < c) ok = false;
    for (let j = i + 1; j <= i + right && ok; j++) if (!Number.isNaN(vals[j]) && vals[j] < c) ok = false;
    if (ok) out.push(i);
  }
  return out;
}

function pivotHighs(vals: number[], left: number, right: number): number[] {
  const out: number[] = [];
  for (let i = left; i < vals.length - right; i++) {
    const c = vals[i];
    if (Number.isNaN(c)) continue;
    let ok = true;
    for (let j = i - left; j < i && ok; j++) if (!Number.isNaN(vals[j]) && vals[j] > c) ok = false;
    for (let j = i + 1; j <= i + right && ok; j++) if (!Number.isNaN(vals[j]) && vals[j] > c) ok = false;
    if (ok) out.push(i);
  }
  return out;
}

/** All regular/hidden bullish/bearish divergences across `rsi` vs
    `highs`/`lows`, one entry per consecutive qualifying pivot pair.
    `left`/`right` are the pivot window (Pine default 5/5); `strict` picks
    strict (`>`/`<`) vs inclusive (`>=`/`<=`) comparison for the HH/LL/HL/LH
    test between two pivots (Pine's "Strict HH/LL Comparison" input). */
export function computeDivergences(highs: number[], lows: number[], rsi: number[], left = 5, right = 5, strict = true): Divergence[] {
  const higher = strict ? (a: number, b: number) => a > b : (a: number, b: number) => a >= b;
  const lower = strict ? (a: number, b: number) => a < b : (a: number, b: number) => a <= b;
  const out: Divergence[] = [];

  let prevLow: DivergencePivot | null = null;
  for (const idx of pivotLows(rsi, left, right)) {
    const cur: DivergencePivot = { idx, price: lows[idx], rsi: rsi[idx] };
    if (prevLow) {
      // Regular Bullish: price Lower Low + RSI Higher Low (reversal).
      if (lower(cur.price, prevLow.price) && higher(cur.rsi, prevLow.rsi)) out.push({ type: "regularBull", a: prevLow, b: cur });
      // Hidden Bullish: price Higher Low + RSI Lower Low (continuation).
      if (higher(cur.price, prevLow.price) && lower(cur.rsi, prevLow.rsi)) out.push({ type: "hiddenBull", a: prevLow, b: cur });
    }
    prevLow = cur;
  }

  let prevHigh: DivergencePivot | null = null;
  for (const idx of pivotHighs(rsi, left, right)) {
    const cur: DivergencePivot = { idx, price: highs[idx], rsi: rsi[idx] };
    if (prevHigh) {
      // Regular Bearish: price Higher High + RSI Lower High (reversal).
      if (higher(cur.price, prevHigh.price) && lower(cur.rsi, prevHigh.rsi)) out.push({ type: "regularBear", a: prevHigh, b: cur });
      // Hidden Bearish: price Lower High + RSI Higher High (continuation).
      if (lower(cur.price, prevHigh.price) && higher(cur.rsi, prevHigh.rsi)) out.push({ type: "hiddenBear", a: prevHigh, b: cur });
    }
    prevHigh = cur;
  }

  return out;
}
