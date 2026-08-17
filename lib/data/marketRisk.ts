import type { MarketContextPayload, MarketInstrument } from "./marketContext";
import { latestInstrumentValue } from "./marketContext";

export type RiskTone = "up" | "down" | "neutral";
export type RiskMetric = { name: string; value: string; hint: string; tone: RiskTone };
export type MarketRisk = {
  score: number;          // 0-100 (higher = more risk-on)
  label: string;          // RISK-ON / NEUTRAL / RISK-OFF
  tone: RiskTone;
  why: string;
  series: number[];       // IHSG close series for the trend chart
  metrics: RiskMetric[];
  asOf?: string;
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
function dailyReturns(s: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < s.length; i++) if (s[i - 1]) out.push(s[i] / s[i - 1] - 1);
  return out;
}
function seriesOf(mc: MarketContextPayload | null, ...keys: string[]): number[] {
  const inst = mc?.instruments.find((i: MarketInstrument) =>
    keys.some((k) => i.label?.toUpperCase() === k.toUpperCase() || i.symbol?.toUpperCase() === k.toUpperCase()));
  return inst ? latestInstrumentValue(inst).series : [];
}

// All inputs are daily closes (market-context) + advancers/decliners breadth.
// Everything is computed from close, per the spec.
export function computeMarketRisk(
  mc: MarketContextPayload | null,
  breadthRatio: number,        // advancers / (advancers + decliners), 0..1 (daily A/D, fallback only)
  above200: number | null,     // share of stocks above their 200-day SMA, 0..1 (structural breadth)
  above50: number | null,      // share above their 50-day/EMA, 0..1 (short-term breadth)
  asOf?: string,
): MarketRisk | null {
  const ihsg = seriesOf(mc, "IHSG", "^JKSE");
  if (ihsg.length < 6) return null;
  const last = ihsg.at(-1)!;

  // 1) Trend — last close vs its 20-day average, plus 20-day change
  const sma20 = mean(ihsg.slice(-20));
  const chg20 = ihsg.length >= 21 ? last / ihsg[ihsg.length - 21] - 1 : last / ihsg[0] - 1;
  const trendUp = last >= sma20;
  const trendScore = clamp01(0.5 + chg20 * 8); // ±6% ~ full swing
  const trendLabel = chg20 > 0.01 ? "Rising" : chg20 < -0.01 ? "Falling" : "Flat";

  // 2) Volatility — 20-day realised daily-return stdev (lower = calmer = more risk-on)
  const vol = stdev(dailyReturns(ihsg.slice(-21)));
  const volScore = clamp01(1 - vol / 0.022);
  const volLabel = vol > 0.018 ? "Elevated" : vol < 0.008 ? "Calm" : "Normal";

  // 3) Breadth — share of stocks above their 200-day MA (structural market health,
  //    per the IDX-breadth study), with % above 50-day as the faster read. The
  //    daily advancers/decliners ratio is a poor, IDX-biased measure and is used
  //    only as a fallback when MA breadth is unavailable.
  //    Recalibrated to IDX's own distribution (structurally low breadth): map
  //    ~15% → 0 and ~55% → 1, so ~35% above-200d reads neutral rather than
  //    forcing a US-style 50% neutral line that IDX rarely reaches.
  const pct200 = above200 == null ? null : Math.round(above200 * 100);
  const pct50 = above50 == null ? null : Math.round(above50 * 100);
  const breadthScore = above200 != null ? clamp01((above200 - 0.15) / 0.40) : clamp01(breadthRatio);
  const breadthPct = pct200 ?? Math.round(breadthRatio * 100); // headline breadth % for the driver text
  const longTone: RiskTone = pct200 == null ? "neutral" : pct200 >= 45 ? "up" : pct200 <= 25 ? "down" : "neutral";
  const shortTone: RiskTone = pct50 == null ? "neutral" : pct50 >= 55 ? "up" : pct50 <= 35 ? "down" : "neutral";

  // 4) Foreign proxy — EIDO (US-listed Indonesia ETF) vs IHSG over 5d. EIDO
  //    leading IHSG implies foreign bid; lagging implies foreign supply.
  const eido = seriesOf(mc, "EIDO");
  const chg5 = (s: number[]) => (s.length >= 6 && s[s.length - 6] ? s.at(-1)! / s[s.length - 6] - 1 : 0);
  const flowGap = chg5(eido) - chg5(ihsg);
  const flowScore = clamp01(0.5 + flowGap * 12);
  const flowLabel = eido.length < 6 ? "n/a" : flowGap > 0.005 ? "Supportive" : flowGap < -0.005 ? "Draining" : "Neutral";

  // --- extra display metrics (comprehensive), all from close ---
  // Momentum: IHSG 5-day change
  const mom5 = chg5(ihsg);
  const momLabel = mom5 > 0.005 ? "Positive" : mom5 < -0.005 ? "Negative" : "Flat";
  // VIX regime (global fear gauge)
  const vix = seriesOf(mc, "VIX", "^VIX");
  const vixLast = vix.at(-1);
  const vixLabel = vixLast == null ? "n/a" : vixLast < 15 ? "Calm" : vixLast > 25 ? "Fear" : "Normal";
  // Drawdown from the recent (90d) high
  const win = ihsg.slice(-90);
  const hi = Math.max(...win);
  const dd = hi ? last / hi - 1 : 0;
  const ddLabel = dd > -0.03 ? "Near highs" : dd > -0.1 ? `${(dd * 100).toFixed(1)}% off high` : `${(dd * 100).toFixed(0)}% correction`;
  // Global backdrop: S&P 500 20-day trend
  const spx = seriesOf(mc, "SPX", "^GSPC");
  const spx20 = spx.length >= 21 ? spx.at(-1)! / spx[spx.length - 21] - 1 : 0;
  const spxLabel = spx.length < 21 ? "n/a" : spx20 > 0.005 ? "Risk-on" : spx20 < -0.005 ? "Risk-off" : "Flat";

  const score = Math.round(100 * (0.30 * trendScore + 0.30 * breadthScore + 0.20 * volScore + 0.20 * flowScore));
  const label = score >= 55 ? "RISK-ON" : score <= 45 ? "RISK-OFF" : "NEUTRAL";
  const tone: RiskTone = score >= 55 ? "up" : score <= 45 ? "down" : "neutral";

  // Driver text uses IDX-calibrated breadth bands (200-day): broad ≥45%, thin ≤25%.
  const broad = breadthPct >= 45, thin = breadthPct <= 25;
  const driver = trendUp && broad ? "trend up, breadth broad"
    : !trendUp && thin ? "trend down, breadth thin"
    : trendUp ? "trend up, breadth still narrow" : "trend soft";

  return {
    score, label, tone, asOf,
    why: `${driver}`,
    series: ihsg.slice(-90),
    metrics: [
      { name: "Trend", value: trendLabel, hint: "Which way IHSG has been heading (vs its 20-day average)", tone: chg20 > 0.005 ? "up" : chg20 < -0.005 ? "down" : "neutral" },
      { name: "Volatility", value: volLabel, hint: "How choppy prices are vs their norm", tone: vol > 0.018 ? "down" : vol < 0.008 ? "up" : "neutral" },
      { name: "Breadth · long", value: pct200 == null ? "no data" : `${pct200}% > 200d MA`, hint: "Share of stocks above their 200-day average — structural market health. Descriptive context, not a timing signal (near-zero forward correlation on IDX).", tone: longTone },
      { name: "Breadth · short", value: pct50 == null ? "no data" : `${pct50}% > 50d MA`, hint: "Share above their 50-day average — faster, near-term participation. Short and long breadth can honestly disagree.", tone: shortTone },
      { name: "Foreign flow", value: flowLabel, hint: "EIDO vs IHSG — foreign sentiment proxy", tone: flowGap > 0.005 ? "up" : flowGap < -0.005 ? "down" : "neutral" },
      { name: "Momentum", value: momLabel, hint: "IHSG 5-day price push", tone: mom5 > 0.005 ? "up" : mom5 < -0.005 ? "down" : "neutral" },
      { name: "Volatility gauge", value: vixLabel + (vixLast != null ? ` (${vixLast.toFixed(1)})` : ""), hint: "VIX — global fear gauge", tone: vixLast == null ? "neutral" : vixLast < 15 ? "up" : vixLast > 25 ? "down" : "neutral" },
      { name: "Drawdown", value: ddLabel, hint: "IHSG distance from its 90-day high", tone: dd > -0.03 ? "up" : dd < -0.1 ? "down" : "neutral" },
      { name: "Global backdrop", value: spxLabel, hint: "S&P 500 20-day trend — risk appetite abroad", tone: spx20 > 0.005 ? "up" : spx20 < -0.005 ? "down" : "neutral" },
    ],
  };
}
