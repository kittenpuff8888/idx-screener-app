import type { JsonRecord, TechnicalRecord } from "@/lib/domain/types";
import { asNumber } from "@/lib/format/number";
import { computeDcf, DEFAULT_ASSUMPTIONS, type DcfInputs } from "./dcf";

// A descriptive read for tickers the signal engine hasn't flagged a triggered
// entry for (setups.json has no row) — "no active setup" isn't "no opinion".
// Blends a technical score (trend/structure/momentum/moving averages/relative
// strength, all real published fields) with a fundamental score (the same DCF
// model already shown in the DCF panel below, plus quality/valuation
// context), weighted by the workbook's own "Verdict Weight Profiles" category
// (Institutional Driven / Low Liquidity·Small Cap / Mid Cap·Moderate — a real
// published field, technical.regime.verdictProfile, previously unused). Our
// own interpretive scoring scheme, not a reverse-engineered copy of any
// commercial tool's proprietary weights — every input is real, every
// contribution is disclosed, and a component that has no usable input simply
// contributes nothing rather than being guessed.

export type VerdictFactor = { label: string; detail: string; points: number };
export type VerdictTilt = "Bullish Tilt" | "Constructive" | "Neutral / Mixed" | "Cautious" | "Bearish Tilt";

export type SetupVerdict = {
  tilt: VerdictTilt;
  score: number; // -100..100, the final weighted blend
  weightProfile: string;
  technicalScore: number; // -100..100
  fundamentalScore: number | null; // -100..100, null when DCF is ineligible
  technicalWeight: number; // 0..1, what actually applied (redistributed to 1 if fundamental is null)
  fundamentalWeight: number;
  factors: VerdictFactor[];
  dcfIneligibleReason: string | null;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function technicalFactors(stock: TechnicalRecord): VerdictFactor[] {
  const t = (stock.technical || {}) as JsonRecord;
  const trend = (stock.trend || {}) as JsonRecord;
  const structure = (stock.structure || {}) as JsonRecord;
  const out: VerdictFactor[] = [];

  const internalTrend = String(trend.internal || "");
  if (internalTrend) out.push({ label: "Internal trend", detail: internalTrend, points: internalTrend.includes("Bullish") ? 15 : internalTrend.includes("Bearish") ? -15 : 0 });
  const swingTrend = String(trend.swing || "");
  if (swingTrend) out.push({ label: "Swing trend", detail: swingTrend, points: swingTrend.includes("Bullish") ? 15 : swingTrend.includes("Bearish") ? -15 : 0 });

  const internalStruct = String(structure.internal || "");
  if (internalStruct) out.push({ label: "Internal structure", detail: internalStruct, points: internalStruct.includes("Bullish") ? 10 : internalStruct.includes("Bearish") ? -10 : 0 });
  const swingStruct = String(structure.swing || "");
  if (swingStruct) out.push({ label: "Swing structure", detail: swingStruct, points: swingStruct.includes("Bullish") ? 10 : swingStruct.includes("Bearish") ? -10 : 0 });

  const maZone = String(t.maZone || "");
  if (maZone) out.push({ label: "Moving-average zone", detail: maZone, points: maZone === "Above All MA" ? 15 : maZone === "Below All MA" ? -15 : maZone.includes("Above") ? 7 : maZone.includes("Below") ? -7 : 0 });

  const macdPos = String(t.macdPosition || "");
  if (macdPos) out.push({ label: "MACD lines", detail: macdPos, points: macdPos === "Bullish" ? 10 : macdPos === "Bearish" ? -10 : 0 });

  const rsiStatus = String(t.rsiStatus || "");
  if (rsiStatus) out.push({ label: "RSI status", detail: rsiStatus, points: rsiStatus === "Oversold" ? 10 : rsiStatus === "Overbought" ? -10 : 0 });

  const rsRating = asNumber(stock.rsRating);
  if (rsRating != null) out.push({ label: "RS Rating vs IHSG", detail: `${rsRating}/99`, points: rsRating >= 80 ? 10 : rsRating <= 30 ? -10 : 0 });

  return out;
}

function fundamentalFactors(fund: JsonRecord | undefined, dcfInputs: DcfInputs): { factors: VerdictFactor[]; ineligibleReason: string | null } {
  const factors: VerdictFactor[] = [];
  const dcf = computeDcf(dcfInputs, { ...DEFAULT_ASSUMPTIONS, fcfGrowthRate: clamp(dcfInputs.revenueGrowth ?? 0.05, -0.3, 0.4) });
  let ineligibleReason: string | null = null;
  if (dcf.eligible) {
    const dcfPoints = clamp(dcf.upsidePct * 150, -50, 50);
    factors.push({ label: "DCF fair value", detail: `${dcf.recommendation} · ${dcf.upsidePct >= 0 ? "+" : ""}${(dcf.upsidePct * 100).toFixed(1)}% upside`, points: dcfPoints });
  } else {
    ineligibleReason = dcf.gates.find((g) => !g.pass)?.label || "DCF inputs incomplete";
  }

  const roe = asNumber(fund?.["Return on Equity (TTM)"]);
  if (roe != null) factors.push({ label: "Return on Equity (TTM)", detail: `${(roe * 100).toFixed(1)}%`, points: roe >= 0.15 ? 10 : roe < 0 ? -15 : 0 });

  const altman = asNumber(fund?.["Altman Z-Score (Modified)"]);
  if (altman != null) factors.push({ label: "Altman Z-Score", detail: altman.toFixed(2), points: altman < 1.8 ? -15 : altman > 3 ? 5 : 0 });

  const pbvZ = asNumber(fund?.["PBV Z-Score"]);
  if (pbvZ != null) factors.push({ label: "PBV vs 3-year mean", detail: `${pbvZ >= 0 ? "+" : ""}${pbvZ.toFixed(2)}σ`, points: pbvZ <= -1 ? 15 : pbvZ >= 1 ? -15 : 0 });

  return { factors, ineligibleReason };
}

/** technical/fundamental weight split by the workbook's own weighting-profile
    category. A profile string we don't recognize falls back to balanced. */
function weightsFor(profile: string): { technicalWeight: number; fundamentalWeight: number } {
  const p = profile.toLowerCase();
  if (p.includes("institutional")) return { technicalWeight: 0.4, fundamentalWeight: 0.6 };
  if (p.includes("low liquidity") || p.includes("small cap")) return { technicalWeight: 0.65, fundamentalWeight: 0.35 };
  return { technicalWeight: 0.5, fundamentalWeight: 0.5 }; // Mid Cap / Moderate, or unrecognized
}

function tiltOf(score: number): VerdictTilt {
  if (score >= 40) return "Bullish Tilt";
  if (score >= 15) return "Constructive";
  if (score > -15) return "Neutral / Mixed";
  if (score > -40) return "Cautious";
  return "Bearish Tilt";
}

export function computeSetupVerdict(stock: TechnicalRecord | undefined, fund: JsonRecord | undefined): SetupVerdict | null {
  if (!stock) return null;
  const price = asNumber(stock.lastPrice ?? fund?.["Price"]);
  const beta = asNumber(stock.beta);
  const fcfTtmBn = asNumber(fund?.["Free cash flow (TTM)"]);
  const revenueGrowth = asNumber(fund?.["Revenue (Quarter YoY Growth)"]);
  const marketCapAbs = asNumber((stock.fundamentals as JsonRecord | undefined)?.["marketCap"]);
  const sharesOutstanding = marketCapAbs != null && price != null && price > 0 ? marketCapAbs / price : null;
  const dcfInputs: DcfInputs = {
    ticker: stock.ticker, price, beta, fcfTtmBn, revenueGrowth, sharesOutstanding,
    week52High: asNumber(fund?.["52 Week High"]), week52Low: asNumber(fund?.["52 Week Low"]), currency: "IDR",
  };

  const techFactors = technicalFactors(stock);
  const { factors: fundFactorsList, ineligibleReason } = fundamentalFactors(fund, dcfInputs);
  if (!techFactors.length && !fundFactorsList.length) return null; // genuinely no usable input at all

  const technicalScore = clamp(techFactors.reduce((s, f) => s + f.points, 0), -100, 100);
  const fundamentalScore = fundFactorsList.length ? clamp(fundFactorsList.reduce((s, f) => s + f.points, 0), -100, 100) : null;

  const profile = String((stock.technical?.regime as JsonRecord | undefined)?.verdictProfile || "");
  const { technicalWeight: tw0, fundamentalWeight: fw0 } = weightsFor(profile);
  // No fundamental read at all → all weight goes to technical rather than
  // silently treating the missing half as a neutral 0.
  const technicalWeight = fundamentalScore == null ? 1 : tw0;
  const fundamentalWeight = fundamentalScore == null ? 0 : fw0;
  const score = clamp(technicalScore * technicalWeight + (fundamentalScore ?? 0) * fundamentalWeight, -100, 100);

  return {
    tilt: tiltOf(score), score,
    weightProfile: profile || "Balanced (no profile published)",
    technicalScore, fundamentalScore, technicalWeight, fundamentalWeight,
    factors: [...techFactors, ...fundFactorsList].filter((f) => Math.round(f.points) !== 0),
    dcfIneligibleReason: ineligibleReason,
  };
}
