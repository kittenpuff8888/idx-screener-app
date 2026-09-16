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

/** Wilder's Directional Movement Index -- matches Pine's `ta.dmi(len,
    adxSmoothing)`: +DI/-DI from Wilder-smoothed +DM/-DM/true-range, ADX
    from a second Wilder smoothing of DX = 100*|+DI - -DI|/(+DI + -DI).
    All three outputs aligned 1:1 with `highs`/`lows`/`closes`. Used to gate
    the RSI companion line's bull/bear coloring (see IndicatorCompanion). */
export function dmi(highs: number[], lows: number[], closes: number[], length = 14, adxSmoothing = 14): { diPlus: number[]; diMinus: number[]; adx: number[] } {
  const n = highs.length;
  const plusDm = new Array(n).fill(0), minusDm = new Array(n).fill(0), tr = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDm[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDm[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }
  const rma = (vals: number[], period: number) => {
    const out = new Array(n).fill(NaN);
    let sum = 0;
    for (let i = 1; i <= period && i < n; i++) sum += vals[i];
    if (n > period) { out[period] = sum; for (let i = period + 1; i < n; i++) out[i] = out[i - 1] - out[i - 1] / period + vals[i]; }
    return out;
  };
  const smoothTr = rma(tr, length), smoothPlus = rma(plusDm, length), smoothMinus = rma(minusDm, length);
  const diPlus = new Array(n).fill(NaN), diMinus = new Array(n).fill(NaN), dx = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(smoothTr[i]) || smoothTr[i] === 0) continue;
    diPlus[i] = (100 * smoothPlus[i]) / smoothTr[i];
    diMinus[i] = (100 * smoothMinus[i]) / smoothTr[i];
    const sum = diPlus[i] + diMinus[i];
    dx[i] = sum > 0 ? (100 * Math.abs(diPlus[i] - diMinus[i])) / sum : 0;
  }
  const adx = new Array(n).fill(NaN);
  let firstDx = -1;
  for (let i = 0; i < n; i++) { if (!Number.isNaN(dx[i])) { firstDx = i; break; } }
  if (firstDx >= 0 && firstDx + adxSmoothing < n) {
    let sum = 0;
    for (let i = firstDx; i < firstDx + adxSmoothing; i++) sum += dx[i];
    adx[firstDx + adxSmoothing - 1] = sum / adxSmoothing;
    for (let i = firstDx + adxSmoothing; i < n; i++) adx[i] = (adx[i - 1] * (adxSmoothing - 1) + dx[i]) / adxSmoothing;
  }
  return { diPlus, diMinus, adx };
}

/** MACD "4C Smooth": EMA(fast) - EMA(slow), optionally re-smoothed by EMA
    over `smooth` bars before the signal line is taken from it (a "4C" --
    four-color histogram -- variant rather than the classic unsmoothed MACD;
    `smooth <= 1` skips that extra step, reducing to the classic form).
    Histogram = macd - signal. All three outputs aligned 1:1 with `closes`. */
export function macdOf(closes: number[], fast = 12, slow = 26, signalLen = 9, smooth = 3): { macd: number[]; signal: number[]; hist: number[] } {
  const f = ema(closes, fast), sl = ema(closes, slow);
  const raw = closes.map((_, i) => (Number.isNaN(f[i]) || Number.isNaN(sl[i]) ? NaN : f[i] - sl[i]));
  const macd = smooth > 1 ? ema(raw, smooth) : raw;
  const signal = ema(macd, signalLen);
  const hist = macd.map((m, i) => (Number.isNaN(m) || Number.isNaN(signal[i]) ? NaN : m - signal[i]));
  return { macd, signal, hist };
}
