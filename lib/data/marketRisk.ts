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
  breadthRatio: number,        // advancers / (advancers + decliners), 0..1
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

  // 3) Breadth — share of directional tickers advancing
  const breadthScore = clamp01(breadthRatio);
  const breadthPct = Math.round(breadthRatio * 100);

  // 4) Foreign proxy — EIDO (US-listed Indonesia ETF) vs IHSG over 5d. EIDO
  //    leading IHSG implies foreign bid; lagging implies foreign supply.
  const eido = seriesOf(mc, "EIDO");
  const chg5 = (s: number[]) => (s.length >= 6 && s[s.length - 6] ? s.at(-1)! / s[s.length - 6] - 1 : 0);
  const flowGap = chg5(eido) - chg5(ihsg);
  const flowScore = clamp01(0.5 + flowGap * 12);
  const flowLabel = eido.length < 6 ? "n/a" : flowGap > 0.005 ? "Supportive" : flowGap < -0.005 ? "Draining" : "Neutral";

  const score = Math.round(100 * (0.30 * trendScore + 0.30 * breadthScore + 0.20 * volScore + 0.20 * flowScore));
  const label = score >= 55 ? "RISK-ON" : score <= 45 ? "RISK-OFF" : "NEUTRAL";
  const tone: RiskTone = score >= 55 ? "up" : score <= 45 ? "down" : "neutral";

  const driver = trendUp && breadthPct >= 55 ? "trend up, breadth broad"
    : !trendUp && breadthPct <= 45 ? "trend down, breadth thin"
    : trendUp ? "trend up, breadth mixed" : "trend soft";

  return {
    score, label, tone, asOf,
    why: `${driver}`,
    series: ihsg.slice(-90),
    metrics: [
      { name: "Trend", value: trendLabel, hint: "Which way IHSG has been heading (vs its 20-day average)", tone: chg20 > 0.005 ? "up" : chg20 < -0.005 ? "down" : "neutral" },
      { name: "Volatility", value: volLabel, hint: "How choppy prices are vs their norm", tone: vol > 0.018 ? "down" : vol < 0.008 ? "up" : "neutral" },
      { name: "Breadth", value: `${breadthPct}% up`, hint: "Share of directional stocks advancing", tone: breadthPct >= 55 ? "up" : breadthPct <= 45 ? "down" : "neutral" },
      { name: "Foreign flow", value: flowLabel, hint: "EIDO vs IHSG — foreign sentiment proxy", tone: flowGap > 0.005 ? "up" : flowGap < -0.005 ? "down" : "neutral" },
    ],
  };
}
