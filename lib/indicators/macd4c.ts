import type { OhlcvRow } from "@/lib/domain/types";

export type Macd4cColor = "posRise" | "posFall" | "negFall" | "negRise";
export type Macd4cPoint = { macd: number; signal: number; hist: number; color: Macd4cColor };

/** EMA seeded with the first value (Pine ta.ema's steady-state behaviour). */
function ema(values: number[], len: number): number[] {
  const k = 2 / (len + 1);
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/**
 * MACD 4C Smooth (Pine v6). fast/slow/signal EMAs on close, histogram = MACD −
 * signal optionally EMA-smoothed, coloured by the user's 4-state rule:
 *   ≥0 & rising → posRise · ≥0 & falling → posFall
 *   <0 & falling → negFall · <0 & rising → negRise
 * Rows must be ascending by date.
 */
export function computeMacd4c(rows: OhlcvRow[], fast = 12, slow = 26, signalLen = 9, histSmooth = 3): Macd4cPoint[] {
  const close = rows.map((r) => r.close);
  const fastMA = ema(close, fast);
  const slowMA = ema(close, slow);
  const macd = fastMA.map((f, i) => f - slowMA[i]);
  const signal = ema(macd, signalLen);
  const histRaw = macd.map((m, i) => m - signal[i]);
  const hist = histSmooth > 1 ? ema(histRaw, histSmooth) : histRaw;
  return rows.map((_, i) => {
    const h = hist[i];
    const hp = i > 0 ? hist[i - 1] : hist[i];
    let color: Macd4cColor;
    if (h >= 0 && h > hp) color = "posRise";
    else if (h >= 0) color = "posFall";
    else if (h < hp) color = "negFall";
    else color = "negRise";
    return { macd: macd[i], signal: signal[i], hist: h, color };
  });
}

export const MACD4C_COLORS: Record<Macd4cColor, string> = {
  posRise: "#B2B5BE", // silver — positive & rising
  posFall: "#F23645", // red — positive & falling
  negFall: "#FF5050", // bright red — negative & falling
  negRise: "#2962FF", // blue — negative & rising
};
