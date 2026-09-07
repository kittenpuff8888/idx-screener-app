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

// Every factor below is ALWAYS pushed, in the same fixed order, even when
// its underlying field is missing (detail reads "no data", points 0) or its
// reading is neutral (points legitimately 0) -- so the card is the same
// fixed height on every ticker page, never a variable-length list a reader
// has to scroll to finish. A row that's genuinely inapplicable is still
// disclosed as such rather than silently omitted.
function technicalFactors(stock: TechnicalRecord): { factors: VerdictFactor[]; hasData: boolean } {
  const t = (stock.technical || {}) as JsonRecord;
  const trend = (stock.trend || {}) as JsonRecord;
  const structure = (stock.structure || {}) as JsonRecord;
  const out: VerdictFactor[] = [];
  let hasData = false;

  const internalTrend = String(trend.internal || "");
  if (internalTrend) hasData = true;
  out.push({ label: "Internal trend", detail: internalTrend || "no data", points: internalTrend.includes("Bullish") ? 15 : internalTrend.includes("Bearish") ? -15 : 0 });
  const swingTrend = String(trend.swing || "");
  if (swingTrend) hasData = true;
  out.push({ label: "Swing trend", detail: swingTrend || "no data", points: swingTrend.includes("Bullish") ? 15 : swingTrend.includes("Bearish") ? -15 : 0 });

  const internalStruct = String(structure.internal || "");
  if (internalStruct) hasData = true;
  out.push({ label: "Internal structure", detail: internalStruct || "no data", points: internalStruct.includes("Bullish") ? 10 : internalStruct.includes("Bearish") ? -10 : 0 });
  const swingStruct = String(structure.swing || "");
  if (swingStruct) hasData = true;
  out.push({ label: "Swing structure", detail: swingStruct || "no data", points: swingStruct.includes("Bullish") ? 10 : swingStruct.includes("Bearish") ? -10 : 0 });

  const maZone = String(t.maZone || "");
  if (maZone) hasData = true;
  out.push({ label: "Moving-average zone", detail: maZone || "no data", points: maZone === "Above All MA" ? 15 : maZone === "Below All MA" ? -15 : maZone.includes("Above") ? 7 : maZone.includes("Below") ? -7 : 0 });

  const macdPos = String(t.macdPosition || "");
  if (macdPos) hasData = true;
  out.push({ label: "MACD lines", detail: macdPos || "no data", points: macdPos === "Bullish" ? 10 : macdPos === "Bearish" ? -10 : 0 });

  const rsiStatus = String(t.rsiStatus || "");
  if (rsiStatus) hasData = true;
  out.push({ label: "RSI status", detail: rsiStatus || "no data", points: rsiStatus === "Oversold" ? 10 : rsiStatus === "Overbought" ? -10 : 0 });

  const rsRating = asNumber(stock.rsRating);
  if (rsRating != null) hasData = true;
  out.push({ label: "RS Rating vs IHSG", detail: rsRating != null ? `${rsRating}/99` : "no data", points: rsRating == null ? 0 : rsRating >= 80 ? 10 : rsRating <= 30 ? -10 : 0 });

  return { factors: out, hasData };
}

function fundamentalFactors(fund: JsonRecord | undefined, dcfInputs: DcfInputs): { factors: VerdictFactor[]; ineligibleReason: string | null; hasData: boolean } {
  const factors: VerdictFactor[] = [];
  let hasData = false;
  const dcf = computeDcf(dcfInputs, { ...DEFAULT_ASSUMPTIONS, fcfGrowthRate: clamp(dcfInputs.revenueGrowth ?? 0.05, -0.3, 0.4) });
  let ineligibleReason: string | null = null;
  if (dcf.eligible) {
    hasData = true;
    const dcfPoints = clamp(dcf.upsidePct * 150, -50, 50);
    factors.push({ label: "DCF fair value", detail: `${dcf.recommendation} · ${dcf.upsidePct >= 0 ? "+" : ""}${(dcf.upsidePct * 100).toFixed(1)}% upside`, points: dcfPoints });
  } else {
    ineligibleReason = dcf.gates.find((g) => !g.pass)?.label || "DCF inputs incomplete";
    factors.push({ label: "DCF fair value", detail: "not eligible", points: 0 });
  }

  const roe = asNumber(fund?.["Return on Equity (TTM)"]);
  if (roe != null) hasData = true;
  factors.push({ label: "Return on Equity (TTM)", detail: roe != null ? `${(roe * 100).toFixed(1)}%` : "no data", points: roe == null ? 0 : roe >= 0.15 ? 10 : roe < 0 ? -15 : 0 });

  const altman = asNumber(fund?.["Altman Z-Score (Modified)"]);
  if (altman != null) hasData = true;
  factors.push({ label: "Altman Z-Score", detail: altman != null ? altman.toFixed(2) : "no data", points: altman == null ? 0 : altman < 1.8 ? -15 : altman > 3 ? 5 : 0 });

  const pbvZ = asNumber(fund?.["PBV Z-Score"]);
  if (pbvZ != null) hasData = true;
  factors.push({ label: "PBV vs 3-year mean", detail: pbvZ != null ? `${pbvZ >= 0 ? "+" : ""}${pbvZ.toFixed(2)}σ` : "no data", points: pbvZ == null ? 0 : pbvZ <= -1 ? 15 : pbvZ >= 1 ? -15 : 0 });

  return { factors, ineligibleReason, hasData };
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

  const { factors: techFactors, hasData: techHasData } = technicalFactors(stock);
  const { factors: fundFactorsList, ineligibleReason, hasData: fundHasData } = fundamentalFactors(fund, dcfInputs);
  if (!techHasData && !fundHasData) return null; // genuinely no usable input at all

  const technicalScore = clamp(techFactors.reduce((s, f) => s + f.points, 0), -100, 100);
  const fundamentalScore = fundHasData ? clamp(fundFactorsList.reduce((s, f) => s + f.points, 0), -100, 100) : null;

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
    factors: [...techFactors, ...fundFactorsList],
    dcfIneligibleReason: ineligibleReason,
  };
}
