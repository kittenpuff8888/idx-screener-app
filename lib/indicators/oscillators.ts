// RSI / Stochastic-RSI helpers for the ticker page's custom overlay chart.
// Mirrors scripts/compute_screener_signals.py's Python implementations
// exactly (rsi_ema, rsi_wilder, stoch_of) so the chart and the Screener's
// "RSI 10 Divergence" / "Stoch RSI Golden Cross" buttons read the same
// numbers for the same ticker on the same day.

/** Exponential moving average, aligned 1:1 with `values` (NaN until warm). */
export function ema(values: number[], period: number): number[] {
  const out = new Array(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let prev = NaN;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isNaN(prev)) prev = v;
    else prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Simple moving average, aligned 1:1 with `values` -- NaN wherever the
    trailing `period` window isn't entirely valid yet (matches pandas'
    `rolling(period).mean()` default: any NaN in the window ⇒ NaN out, and it
    recovers once a full clean window comes around). Tracks a running sum of
    only the valid entries plus how many are in the window, rather than a
    naive running sum of `values` itself -- that naive form breaks the moment
    a single NaN enters it, since `NaN + x` never recovers back to a number,
    permanently NaN-ing every value after (the RSI/Stoch RSI callers below
    always start with a NaN warm-up prefix, so this isn't an edge case). */
export function sma(values: number[], period: number): number[] {
  const n = values.length;
  const out = new Array(n).fill(NaN);
  let sum = 0;
  let validCount = 0;
  for (let i = 0; i < n; i++) {
    const vIn = values[i];
    if (!Number.isNaN(vIn)) { sum += vIn; validCount++; }
    if (i >= period) {
      const vOut = values[i - period];
      if (!Number.isNaN(vOut)) { sum -= vOut; validCount--; }
    }
    if (i >= period - 1 && validCount === period) out[i] = sum / period;
  }
  return out;
}

/** RSI with EMA-smoothed up/down averages ("RSI Smoothing Type: EMA" in a
    chart's settings) -- matches Python's rsi_ema(). */
export function rsiEma(closes: number[], period = 10): number[] {
  const n = closes.length;
  const up = new Array(n).fill(0);
  const dn = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const d = closes[i] - closes[i - 1];
    up[i] = Math.max(d, 0);
    dn[i] = Math.max(-d, 0);
  }
  const upEma = ema(up, period);
  const dnEma = ema(dn, period);
  const out = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i === 0) continue;
    const rs = dnEma[i] === 0 ? Infinity : upEma[i] / dnEma[i];
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

/** RSI with Wilder's RMA smoothing (the classic/default RSI) -- matches
    Python's rsi_wilder(); this is what feeds the Stochastic-RSI below. */
export function rsiWilder(closes: number[], period = 10): number[] {
  const n = closes.length;
  const out = new Array(n).fill(NaN);
  let avgUp = 0, avgDn = 0;
  for (let i = 1; i < n; i++) {
    const d = closes[i] - closes[i - 1];
    const u = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= period) {
      avgUp += u / period;
      avgDn += dn / period;
      if (i === period) {
        const rs = avgDn === 0 ? Infinity : avgUp / avgDn;
        out[i] = 100 - 100 / (1 + rs);
      }
      continue;
    }
    avgUp = (avgUp * (period - 1) + u) / period;
    avgDn = (avgDn * (period - 1) + dn) / period;
    const rs = avgDn === 0 ? Infinity : avgUp / avgDn;
    out[i] = 100 - 100 / (1 + rs);
  }
  return out;
}

/** Stochastic of an arbitrary series (e.g. RSI) -- %K = smoothed raw
    stochastic over `length` bars, %D = SMA of %K. Matches Python's
    stoch_of(). Both outputs are aligned 1:1 with `series`. */
export function stochOf(series: number[], length = 10, kSmooth = 3, dSmooth = 3): { k: number[]; d: number[] } {
  const n = series.length;
  const raw = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(series[i])) continue;
    let lo = Infinity, hi = -Infinity, have = false;
    for (let j = Math.max(0, i - length + 1); j <= i; j++) {
      const v = series[j];
      if (Number.isNaN(v)) continue;
      have = true;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!have) continue;
    const range = hi - lo;
    raw[i] = range > 0 ? (100 * (series[i] - lo)) / range : NaN;
  }
  const k = sma(raw.map((v) => (Number.isNaN(v) ? NaN : v)), kSmooth).map((v, i) => (Number.isNaN(raw[i]) ? NaN : v));
  const d = sma(k.map((v) => (Number.isNaN(v) ? NaN : v)), dSmooth).map((v, i) => (Number.isNaN(k[i]) ? NaN : v));
  return { k, d };
}
