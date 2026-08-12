// Setups-screener interpretation layer over the REAL IDX workbook (screener.json records +
// setups.json). Ported from the prototype's screener-data.js. Nothing is fabricated: every
// signal derives from a real field; genuinely-absent fields yield { available:false } so the
// UI renders an explicit "no data". The one true gap — broker-level buy/sell concentration —
// does not exist; KSEI foreign/local flow is used as a LABELLED proxy, never invented.

import type { JsonRecord, ScreenerRow } from "@/lib/domain/types";
import { asNumber, formatNumber } from "@/lib/format/number";
import { IDX_SECTOR_MAP } from "@/lib/domain/sectors";

// Single source of truth for sector names (GAP_ANALYSIS §8): derive from the
// canonical IDX-IC map in lib/domain/sectors, not a second hardcoded list.
export const SECTOR_LABEL: Record<string, string> = { ...IDX_SECTOR_MAP, Others: "Others" };

export type Cell = { available: boolean; label?: string; tone?: "up" | "down" | "flat"; val?: string; raw?: string; proxy?: boolean; sort?: number };
export type Tone = "up" | "down" | "flat";

export type SetupRow = {
  ticker: string; sector: string; sectorLabel: string; price: number | null; chg: number;
  rvol: number | null; rr: number | null; rsRating: number | null; signalType: string;
  summary: string; maRaw: string; entry: number | null; target: number | null; invalidation: number | null;
  entryPOI: string; rsi: number | null; vwapSigma: number | null; vwapRaw: string;
  emaAboveKey: boolean; emaBelowKey: boolean; reclaim: boolean; detail: string;
  score: number | null; hasEngineSetup: boolean; isRecentIpo: boolean | null;
  medianValueTraded: number | null; kseiDelta: number | null; kseiAccum: boolean | null;
  capTier: string; smcZone: string; setupsMatched: string[]; setupsBear: string[];
  cellTrend: Cell; cellStructure: Cell; cellVwap: Cell; cellLiquidity: Cell; cellWho: Cell;
  freshRank: number;
};

export type SetupDef = {
  key: string; label: string; icon: string; hasBear: boolean; exact: boolean; basis: string; req: string;
  bull: (r: SetupRow) => boolean; bear?: (r: SetupRow) => boolean;
};

// parse "Near +1 σ (0.06%)", "Between +2 σ and +1 σ", "Below -3 σ" → numeric sigma
function parseSigma(str: string | null | undefined): number | null {
  if (!str || str === "-") return null;
  const nums = (String(str).match(/[+-]?\d+(?:\.\d+)?(?=\s*σ)/g) || []).map(Number);
  if (/^Above/.test(str)) return 3.2;
  if (/^Below/.test(str)) return -3.2;
  if (/^Near/.test(str)) return nums[0] ?? 0;
  if (/^Between/.test(str)) return nums.length >= 2 ? (nums[0] + nums[1]) / 2 : (nums[0] ?? 0);
  return nums[0] ?? 0;
}
function parseRSI(sum: string): number | null { const m = (sum || "").match(/RSI\s+([\d.]+)/i); return m ? +m[1] : null; }

// the 7 preset setups — each a predicate over REAL fields, exact vs inferred labelled.
export const SETUPS: SetupDef[] = [
  { key: "swing", label: "Swing Setup", icon: "◆", hasBear: false, exact: true, basis: "engine setups.json flag",
    req: "Flagged by the swing engine with a published score & trade plan", bull: (r) => r.hasEngineSetup },
  { key: "ema_trend", label: "EMA Trend up", icon: "↗", hasBear: true, exact: true, basis: "engine signalType + MA/RSI fields",
    req: "Close > EMA25 AND EMA25 > EMA50 AND RSI > 50",
    bull: (r) => r.signalType === "EMA Trend" || (r.emaAboveKey && (r.rsi ?? 0) > 50),
    bear: (r) => r.emaBelowKey && (r.rsi ?? 100) < 50 },
  { key: "golden_cross", label: "Golden Cross", icon: "✦", hasBear: false, exact: true, basis: "engine signalType",
    req: "EMA golden cross OR MACD line crossed above signal",
    bull: (r) => r.signalType === "Golden Cross" || /golden cross|macd line crossed above/i.test(r.summary) },
  { key: "bos", label: "BOS Swing + Internal", icon: "⇱", hasBear: false, exact: false, basis: "INFERRED — no BOS column; reclaim + EMA stack proxy",
    req: "Bullish break of structure (swing or internal) on the market date", bull: (r) => r.reclaim && r.emaAboveKey },
  { key: "poi_reclaim", label: "POI Reclaim", icon: "⤺", hasBear: false, exact: false, basis: "INFERRED — reclaim keyword + Entry POI zone",
    req: "Low touched a POI (VWAP / EMA / OB EQ) and close reclaimed above it",
    bull: (r) => r.reclaim && /vwap|ema|ob|eq/i.test(r.entryPOI || "") },
  { key: "eq_breakout", label: "EQ Breakout", icon: "▩", hasBear: false, exact: false, basis: "INFERRED — EQ zone + summary/chg",
    req: "Price broke out of the VWAP equilibrium zone",
    bull: (r) => /^EQ/.test(r.entryPOI || "") || (/equilibrium/i.test(r.summary) && r.chg > 0) },
  { key: "near_vwap", label: "Near VWAP", icon: "◈", hasBear: true, exact: true, basis: "engine signalType + parsed VWAP σ",
    req: "Price near Prev-Q or Prev-Y VWAP zone (current Q excluded)",
    bull: (r) => r.signalType === "Near VWAP" && (r.vwapSigma ?? 0) <= 0,
    bear: (r) => r.signalType === "Near VWAP" && (r.vwapSigma ?? 0) > 0 },
  { key: "smc", label: "SMC Location", icon: "◰", hasBear: false, exact: false, basis: "INFERRED — Entry POI zone + VWAP σ",
    req: "SMC zone: In Bull OB OR Equilibrium OR Discount",
    bull: (r) => /OB Bull/i.test(r.entryPOI || "") || /^EQ/.test(r.entryPOI || "") || (r.vwapSigma ?? 9) < -0.75 },
];

// custom-builder context states: pick a plain-language STATE. real:false => "no data at screen scope".
export type Ctx = { key: string; label: string; real: boolean | "sparse"; test: (r: SetupRow) => boolean };
export const CONTEXT_GROUPS: Array<{ family: string; conds: Ctx[] }> = [
  { family: "Momentum", conds: [
    { key: "rsi_bull", label: "RSI bullish (> 50)", real: true, test: (r) => (r.rsi ?? -1) > 50 },
    { key: "rsi_strong", label: "RSI strong (> 60)", real: true, test: (r) => (r.rsi ?? -1) > 60 },
    { key: "rsi_oversold", label: "RSI oversold (< 30)", real: true, test: (r) => (r.rsi ?? 999) < 30 },
    { key: "rsi_overbought", label: "RSI overbought (> 70)", real: true, test: (r) => (r.rsi ?? -1) > 70 },
    { key: "rs_leader", label: "RS Rating leader (≥ 80)", real: true, test: (r) => (r.rsRating ?? 0) >= 80 },
    { key: "up_today", label: "Up on the day", real: true, test: (r) => r.chg > 0 },
    { key: "down_today", label: "Down on the day", real: true, test: (r) => r.chg < 0 },
  ] },
  { family: "Trend", conds: [
    { key: "ema_above", label: "Above EMA25 & EMA50", real: true, test: (r) => r.emaAboveKey },
    { key: "ema_below", label: "Below key EMAs", real: true, test: (r) => r.emaBelowKey },
    { key: "sig_ema", label: "Engine: EMA Trend up", real: true, test: (r) => r.signalType === "EMA Trend" },
    { key: "sig_golden", label: "Engine: Golden Cross", real: true, test: (r) => r.signalType === "Golden Cross" || /golden cross|macd line crossed above/i.test(r.summary) },
  ] },
  { family: "Structure & VWAP", conds: [
    { key: "vwap_discount", label: "Discount to VWAP", real: true, test: (r) => (r.vwapSigma ?? 9) <= -0.6 },
    { key: "vwap_near", label: "Near VWAP", real: true, test: (r) => Math.abs(r.vwapSigma ?? 9) < 0.6 },
    { key: "vwap_premium", label: "Premium to VWAP", real: true, test: (r) => (r.vwapSigma ?? -9) >= 0.6 },
    { key: "smc_ob", label: "In bullish order block", real: true, test: (r) => /OB Bull/i.test(r.entryPOI || "") },
    { key: "smc_eq", label: "At equilibrium (EQ)", real: true, test: (r) => /^EQ/.test(r.entryPOI || "") },
    { key: "reclaim", label: "Reclaimed a level", real: true, test: (r) => r.reclaim },
  ] },
  { family: "Trade plan", conds: [
    { key: "rr2", label: "Reward:Risk ≥ 2×", real: true, test: (r) => (r.rr ?? 0) >= 2 },
    { key: "rr3", label: "Reward:Risk ≥ 3×", real: true, test: (r) => (r.rr ?? 0) >= 3 },
    { key: "has_setup", label: "Has an engine setup", real: true, test: (r) => r.hasEngineSetup },
    { key: "score70", label: "Swing score ≥ 70", real: "sparse", test: (r) => (r.score ?? -1) >= 70 },
  ] },
  { family: "Liquidity", conds: [
    { key: "busy", label: "Busy (RVOL ≥ 1.5×)", real: true, test: (r) => (r.rvol ?? 0) >= 1.5 },
    { key: "surging", label: "Surging (RVOL ≥ 3×)", real: true, test: (r) => (r.rvol ?? 0) >= 3 },
    { key: "quiet", label: "Quiet (RVOL < 0.5×)", real: true, test: (r) => (r.rvol ?? 9) < 0.5 },
    { key: "large", label: "Large-cap tier", real: true, test: (r) => r.capTier === "Large cap" },
    { key: "mid", label: "Mid-cap tier", real: true, test: (r) => r.capTier === "Mid cap" },
    { key: "small", label: "Small-cap tier", real: true, test: (r) => r.capTier === "Small cap" },
  ] },
  { family: "Ownership (KSEI proxy)", conds: [
    { key: "ksei_accum", label: "KSEI accumulating", real: "sparse", test: (r) => r.kseiAccum === true },
    { key: "foreign_buy", label: "Foreign buying (proxy)", real: "sparse", test: (r) => (r.kseiDelta ?? 0) > 0 },
    { key: "foreign_sell", label: "Foreign selling (proxy)", real: "sparse", test: (r) => (r.kseiDelta ?? 0) < 0 },
  ] },
  { family: "Fundamental (detail-only)", conds: [
    { key: "pe_cheap", label: "PE cheap — no data at screen scope", real: false, test: () => false },
    { key: "pbv_cheap", label: "PBV cheap — no data at screen scope", real: false, test: () => false },
    { key: "roe_high", label: "ROE high — no data at screen scope", real: false, test: () => false },
  ] },
];
export const CONTEXT_BY_KEY: Record<string, Ctx & { family: string }> = {};
CONTEXT_GROUPS.forEach((g) => g.conds.forEach((c) => { CONTEXT_BY_KEY[c.key] = { ...c, family: g.family }; }));

export const SECTOR_OPTIONS = [{ v: "", label: "All sectors" }, ...Object.entries(SECTOR_LABEL).map(([v, label]) => ({ v, label }))];
export const LIQUIDITY_OPTIONS = [
  { v: "", label: "All liquidity" }, { v: "surging", label: "Surging (RVOL ≥ 3×)" },
  { v: "busy", label: "Busy (RVOL ≥ 1.5×)" }, { v: "avg", label: "Average" }, { v: "quiet", label: "Quiet (RVOL < 0.5×)" },
];
export function passLiquidity(r: SetupRow, key: string): boolean {
  if (!key || r.rvol == null) return !key;
  if (key === "surging") return r.rvol >= 3;
  if (key === "busy") return r.rvol >= 1.5;
  if (key === "avg") return r.rvol >= 0.5 && r.rvol < 1.5;
  if (key === "quiet") return r.rvol < 0.5;
  return true;
}

// interpreted cells — each returns { available:false } for "no data"
function trendCell(r: SetupRow): Cell {
  if (r.rsi == null && !r.maRaw) return { available: false };
  const bull = r.emaAboveKey && (r.rsi ?? 0) > 50;
  const bear = r.emaBelowKey || (r.rsi != null && r.rsi < 45);
  const label = bull ? "Above EMA25 & EMA50" : r.emaAboveKey ? "Above key EMAs" : "Below key EMAs";
  const tone: Tone = bull ? "up" : bear ? "down" : "flat";
  return { available: true, label, tone, val: r.rsi != null ? "RSI " + r.rsi.toFixed(1) : r.maRaw, raw: r.summary || r.maRaw, sort: (r.emaAboveKey ? 100 : 0) + (r.rsi ?? 0) };
}
function structureCell(r: SetupRow): Cell {
  const poi = r.entryPOI || "";
  if (/OB Bull/i.test(poi)) return { available: true, label: "In bullish order block", tone: "up", val: poi, raw: r.summary, sort: 3 };
  if (/^EQ/.test(poi)) return { available: true, label: "Equilibrium reclaim", tone: "up", val: poi, raw: r.summary, sort: 2 };
  if (r.reclaim && r.emaAboveKey) return { available: true, label: "Bullish reclaim", tone: "up", val: "reclaim + EMA stack", raw: r.summary, sort: 2 };
  if (/OB Bear/i.test(poi)) return { available: true, label: "At bearish order block", tone: "down", val: poi, raw: r.summary, sort: -2 };
  if ((r.vwapSigma ?? 9) < -0.75) return { available: true, label: "SMC discount", tone: "up", val: (r.vwapSigma as number).toFixed(1) + "σ", raw: r.vwapRaw, sort: 1 };
  return { available: true, label: "Neutral structure", tone: "flat", val: poi || "—", raw: r.summary, sort: 0 };
}
function vwapCell(r: SetupRow): Cell {
  if (r.vwapSigma == null) return { available: false };
  const s = r.vwapSigma;
  if (/^EQ/.test(r.entryPOI || "") && r.reclaim) return { available: true, label: "Reclaimed EQ", tone: "up", val: r.vwapRaw, raw: r.vwapRaw, sort: 2 };
  let label: string, tone: Tone;
  if (s <= -2) { label = "Deep discount to VWAP"; tone = "up"; }
  else if (s <= -0.6) { label = "Below VWAP (discount)"; tone = "up"; }
  else if (s < 0.6) { label = "Near VWAP"; tone = "flat"; }
  else if (s < 2) { label = "Above VWAP (premium)"; tone = "down"; }
  else { label = "Rich vs VWAP"; tone = "down"; }
  const val = (s > 0 ? "+" : s < 0 ? "−" : "") + Math.abs(s).toFixed(1) + "σ";
  return { available: true, label, tone, val, raw: r.vwapRaw, sort: -s };
}
function liquidityCell(r: SetupRow): Cell {
  if (r.rvol == null) return { available: false };
  const busy = r.rvol >= 1.5;
  const label = busy ? "Busy vs its norm" : r.rvol < 0.5 ? "Quiet vs its norm" : "Average activity";
  const adtv = r.medianValueTraded != null ? " · ADTV " + formatNumber(r.medianValueTraded / 1e9, 1) + "B" : "";
  return { available: true, label, tone: busy ? "up" : "flat", val: "RVOL " + r.rvol.toFixed(2) + "×" + adtv, raw: "RVOL " + r.rvol.toFixed(3) + (adtv ? " (ADTV real)" : " (ADTV: no data)"), sort: r.rvol };
}
function whoTradingCell(r: SetupRow): Cell {
  if (r.kseiDelta == null) return { available: false };
  const d = r.kseiDelta;
  if (Math.abs(d) < 0.05) return { available: true, label: "Balanced flow", tone: "flat", val: "KSEI proxy 0.0pp", raw: "KSEI net " + d.toFixed(2) + "pp (proxy)", proxy: true, sort: 0 };
  const fb = d > 0;
  return { available: true, label: fb ? "Foreign buying, local selling" : "Foreign selling, local buying", tone: fb ? "up" : "down",
    val: "KSEI proxy " + (d > 0 ? "+" : "−") + Math.abs(d).toFixed(1) + "pp", raw: "KSEI net " + d.toFixed(2) + "pp (proxy — no broker data)", proxy: true, sort: d };
}

type EngineSetup = { ticker: string; score?: number; isRecentIpo?: boolean; medianValueTraded20?: number; kseiFootprint?: { available?: boolean; netDeltaPP?: number; accumulation?: boolean } };

/** Build one interpreted row per ticker from the real screener records + engine setups. */
export function buildSetupRows(screener: ScreenerRow[], engineSetups: EngineSetup[]): SetupRow[] {
  const setupByTicker: Record<string, EngineSetup> = {};
  (engineSetups || []).forEach((s) => { setupByTicker[String(s.ticker).toUpperCase()] = s; });

  // one record per ticker — keep the best-R/R signal row
  const byTicker: Record<string, JsonRecord> = {};
  (screener || []).forEach((sr) => {
    const rec = sr.raw; const t = String(rec.Ticker).toUpperCase();
    const cur = byTicker[t];
    if (!cur || (asNumber(rec["R/R"]) ?? 0) > (asNumber(cur["R/R"]) ?? 0)) byTicker[t] = rec;
  });

  return Object.values(byTicker).map((rec) => {
    const ticker = String(rec.Ticker).toUpperCase();
    const su = setupByTicker[ticker];
    const maRaw = String(rec.MA || ""), sum = String(rec["Summary Screener"] || "");
    const emaAboveKey = /Above All Available MA/.test(maRaw) || /Above[^|]*EMA25[^|]*EMA50/.test(maRaw) || /Close .*> EMA25.*EMA25.*> EMA50/i.test(sum);
    const emaBelowKey = /Below[^|]*EMA50/.test(maRaw) && !emaAboveKey;
    const price = asNumber(rec.Price);
    const r: SetupRow = {
      ticker, sector: String(rec.Sector || "Others"), sectorLabel: SECTOR_LABEL[String(rec.Sector)] || String(rec.Sector || "Others"),
      price, chg: asNumber(rec["Chg %"]) ?? 0, rvol: asNumber(rec.RVOL), rr: asNumber(rec["R/R"]), rsRating: asNumber(rec["RS Rating"]),
      signalType: String(rec.signalType || ""), summary: sum, maRaw,
      entry: asNumber(rec.Entry), target: asNumber(rec.Target), invalidation: asNumber(rec.Invalidation), entryPOI: String(rec["Entry POI"] || ""),
      rsi: parseRSI(sum), vwapSigma: parseSigma(String(rec["Current Q VWAP"] ?? "")), vwapRaw: String(rec["Current Q VWAP"] ?? ""),
      emaAboveKey, emaBelowKey, reclaim: /reclaim/i.test(sum),
      detail: "/ticker?symbol=" + ticker,
      score: su?.score ?? null, hasEngineSetup: !!su, isRecentIpo: su ? !!su.isRecentIpo : null,
      medianValueTraded: su?.medianValueTraded20 ?? null,
      kseiDelta: su?.kseiFootprint?.available ? (su.kseiFootprint.netDeltaPP ?? null) : null,
      kseiAccum: su?.kseiFootprint?.available ? (su.kseiFootprint.accumulation ?? null) : null,
      capTier: (price ?? 0) > 3000 ? "Large cap" : (price ?? 0) >= 200 ? "Mid cap" : "Small cap",
      smcZone: "—", setupsMatched: [], setupsBear: [],
      cellTrend: { available: false }, cellStructure: { available: false }, cellVwap: { available: false }, cellLiquidity: { available: false }, cellWho: { available: false },
      freshRank: 0,
    };
    r.setupsMatched = SETUPS.filter((s) => { try { return s.bull(r); } catch { return false; } }).map((s) => s.key);
    r.setupsBear = SETUPS.filter((s) => s.hasBear && s.bear).filter((s) => { try { return s.bear!(r); } catch { return false; } }).map((s) => s.key);
    r.cellTrend = trendCell(r); r.cellStructure = structureCell(r); r.cellVwap = vwapCell(r);
    r.cellLiquidity = liquidityCell(r); r.cellWho = whoTradingCell(r);
    r.smcZone = /OB Bull/i.test(r.entryPOI) ? "Bull OB" : /^EQ/.test(r.entryPOI) ? "Equilibrium" : (r.vwapSigma ?? 9) < -0.75 ? "Discount" : (r.vwapSigma ?? -9) > 0.75 ? "Premium" : "—";
    r.freshRank = (su ? 100000 + (su.score ?? 0) * 100 : 0) + r.setupsMatched.length * 100 + (r.rvol ?? 0);
    return r;
  });
}
