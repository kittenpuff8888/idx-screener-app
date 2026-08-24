// Setups-screener interpretation layer over the REAL IDX workbook
// (docs/data/dates/<date>/screener.json + setups.json). This is the typed
// INGEST boundary: the fragile string-parsing the workbook emits — VWAP sigma
// out of "Near +1 σ (0.06%)", RSI out of the summary sentence, the EMA stack
// out of the MA blob, the Foreign/Local flow (a labelled KSEI proxy, since no
// broker-level column exists) — is done ONCE here and exposed as clean typed
// fields. The UI consumes `UniverseRow`, never the raw strings.
//
// Nothing is fabricated. Genuinely-absent fields return {available:false} so
// the UI can render an explicit "no data". BOS has no dedicated workbook
// column, so it is an INFERRED predicate (flagged `inferred: true`).

import { fetchJson } from "./client";
import { IDX_SECTOR_MAP } from "@/lib/domain/sectors";

export type Tone = "up" | "down" | "flat";

/** Reality of a predicate/field against the workbook. */
export type Backing = true | false | "sparse";

/** One interpreted signal cell (Trend / Structure / VWAP / Liquidity / Flow). */
export type Cell =
  | { available: false }
  | {
      available: true;
      label: string;
      tone: Tone;
      /** Display value, e.g. "RSI 63.2" or "−1.4σ". */
      val: string;
      /** Raw provenance string this was derived from. */
      raw: string;
      /** Sort key for the column. */
      sort: number;
      /** True when the value is a labelled proxy (KSEI flow, not broker data). */
      proxy?: boolean;
    };

export type CapTier = "Large cap" | "Mid cap" | "Small cap";

/** A fully-typed, one-per-ticker universe row. */
export interface UniverseRow {
  ticker: string;
  sectorCode: string;
  sectorLabel: string;
  price: number | null;
  chg: number; // ratio (0.0176 = +1.76%)
  rvol: number | null;
  adr: number | null;
  rr: number | null;
  rsRating: number | null;
  signalType: string;
  summary: string;
  maRaw: string;
  news: string;
  entry: number | null;
  target: number | null;
  invalidation: number | null;
  entryPOI: string;
  targetPOI: string;
  // parsed-from-string, now typed:
  rsi: number | null;
  vwapSigma: number | null;
  vwapRaw: string | null;
  emaAboveKey: boolean;
  emaBelowKey: boolean;
  reclaim: boolean;
  // engine (setups.json) join:
  score: number | null;
  hasEngineSetup: boolean;
  isRecentIpo: boolean | null;
  medianValueTraded: number | null;
  kseiDelta: number | null; // percentage points, labelled proxy
  kseiAccum: boolean | null;
  // derived:
  capTier: CapTier;
  smcZone: string;
  setupsMatched: string[];
  setupsBear: string[];
  freshRank: number;
  cellTrend: Cell;
  cellStructure: Cell;
  cellVwap: Cell;
  cellLiquidity: Cell;
  cellFlow: Cell;
}

export interface Universe {
  marketDate: string;
  totalUniverse: number;
  scanned: number;
  rows: UniverseRow[];
}

// ── sector labels (workbook uses IDX* codes) ──
const SECTOR_LABEL: Record<string, string> = {
  ...IDX_SECTOR_MAP,
  Others: "Others",
};

// ── raw workbook record (only the fields we read) ──
type ScreenerRecord = Record<string, unknown>;
type ScreenerDoc = { marketDate?: string; records?: ScreenerRecord[]; uniqueTickerCount?: number };
type EngineSetup = {
  ticker: string;
  score?: number;
  isRecentIpo?: boolean;
  medianValueTraded20?: number;
  kseiFootprint?: { available?: boolean; netDeltaPP?: number; accumulation?: boolean } | null;
};
type SetupsDoc = { setups?: EngineSetup[]; scanned?: number };

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() && v.trim() !== "-") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// ── parse "Near +1 σ (0.06%)", "Between +2 σ and +1 σ", "Below -3 σ" → numeric sigma ──
export function parseSigma(input: unknown): number | null {
  const s = str(input);
  if (!s || s === "-") return null;
  const nums = (s.match(/[+-]?\d+(?:\.\d+)?(?=\s*σ)/g) || []).map(Number);
  if (/^Above/.test(s)) return 3.2;
  if (/^Below/.test(s)) return -3.2;
  if (/^Near/.test(s)) return nums[0] ?? 0;
  if (/^Between/.test(s)) return nums.length >= 2 ? (nums[0] + nums[1]) / 2 : nums[0] ?? 0;
  return nums[0] ?? 0;
}

// ── RSI out of the Summary Screener sentence ("… RSI 63.2 > 50 …") ──
export function parseRsi(summary: unknown): number | null {
  const m = str(summary).match(/RSI\s+([\d.]+)/i);
  return m ? Number(m[1]) : null;
}

// ── the preset setups — each a predicate over REAL fields, with a bear mirror
//    where derivable. `inferred` flags predicates with no dedicated column. ──
export interface SetupDef {
  key: string;
  label: string;
  icon: string;
  hasBear: boolean;
  req: string;
  inferred?: boolean;
  bull: (r: UniverseRow) => boolean;
  bear?: (r: UniverseRow) => boolean;
}

export const SETUPS: SetupDef[] = [
  {
    key: "swing",
    label: "Swing Setup",
    icon: "◆",
    hasBear: false,
    req: "Flagged by the swing engine with a published score & trade plan",
    bull: (r) => r.hasEngineSetup,
  },
  {
    key: "ema_trend",
    label: "EMA Trend up",
    icon: "↗",
    hasBear: true,
    req: "Close > EMA25 AND EMA25 > EMA50 AND RSI > 50",
    bull: (r) => r.signalType === "EMA Trend" || (r.emaAboveKey && (r.rsi ?? 0) > 50),
    bear: (r) => r.emaBelowKey && (r.rsi ?? 100) < 50,
  },
  {
    key: "golden_cross",
    label: "Golden Cross",
    icon: "✦",
    hasBear: false,
    req: "EMA golden cross OR MACD line crossed above signal",
    bull: (r) => r.signalType === "Golden Cross" || /golden cross|macd line crossed above/i.test(r.summary),
  },
  {
    key: "bos",
    label: "BOS Swing + Internal",
    icon: "⇱",
    hasBear: false,
    inferred: true, // no dedicated BOS column — inferred from reclaim + EMA stack
    req: "Bullish break of structure (swing or internal) — inferred from reclaim + EMA stack",
    bull: (r) => r.reclaim && r.emaAboveKey,
  },
  {
    key: "poi_reclaim",
    label: "POI Reclaim",
    icon: "⤺",
    hasBear: false,
    req: "Low touched a POI (VWAP / EMA / OB EQ) and close reclaimed above it",
    bull: (r) => r.reclaim && /vwap|ema|ob|eq/i.test(r.entryPOI),
  },
  {
    key: "eq_breakout",
    label: "EQ Breakout",
    icon: "▩",
    hasBear: false,
    req: "Price broke out of the VWAP equilibrium zone",
    bull: (r) => /^EQ/.test(r.entryPOI) || (/equilibrium/i.test(r.summary) && r.chg > 0),
  },
  {
    key: "near_vwap",
    label: "Near VWAP",
    icon: "◈",
    hasBear: true,
    req: "Price near Prev-Q or Prev-Y VWAP zone (current Q excluded)",
    bull: (r) => r.signalType === "Near VWAP" && (r.vwapSigma ?? 0) <= 0,
    bear: (r) => r.signalType === "Near VWAP" && (r.vwapSigma ?? 0) > 0,
  },
  {
    key: "smc",
    label: "SMC Location",
    icon: "◰",
    hasBear: false,
    req: "SMC zone: In Bull OB OR Equilibrium OR Discount",
    bull: (r) => /OB Bull/i.test(r.entryPOI) || /^EQ/.test(r.entryPOI) || (r.vwapSigma ?? 9) < -0.75,
  },
];

const SETUP_BY_KEY: Record<string, SetupDef> = Object.fromEntries(SETUPS.map((s) => [s.key, s]));
export function setupByKey(key: string): SetupDef | undefined {
  return SETUP_BY_KEY[key];
}

// ── general top filters. Sector is REAL; Liquidity is a labelled RVOL/cap
//    proxy; Konglo has NO real column → its control renders "no data". ──
export const SECTOR_OPTIONS: Array<{ v: string; label: string }> = [
  { v: "", label: "All sectors" },
  ...Object.entries(SECTOR_LABEL).map(([v, label]) => ({ v, label })),
];
export const LIQUIDITY_OPTIONS: Array<{ v: string; label: string }> = [
  { v: "", label: "All liquidity" },
  { v: "surging", label: "Surging (RVOL ≥ 3×)" },
  { v: "busy", label: "Busy (RVOL ≥ 1.5×)" },
  { v: "avg", label: "Average" },
  { v: "quiet", label: "Quiet (RVOL < 0.5×)" },
];
export const KONGLO_OPTIONS: Array<{ v: string; label: string }> = [
  { v: "", label: "All konglo groups — no data" },
];

export function passLiquidity(r: UniverseRow, key: string): boolean {
  if (!key || r.rvol == null) return !key;
  if (key === "surging") return r.rvol >= 3;
  if (key === "busy") return r.rvol >= 1.5;
  if (key === "avg") return r.rvol >= 0.5 && r.rvol < 1.5;
  if (key === "quiet") return r.rvol < 0.5;
  return true;
}

// ── CONTEXT conditions for the custom builder: pick a plain-language STATE.
//    Each is a real predicate; fundamental states are real:false → "no data
//    at screen scope" (detail-page fields, absent from the screener universe). ──
export interface ContextCond {
  key: string;
  label: string;
  real: Backing;
  test: (r: UniverseRow) => boolean;
}
export interface ContextGroup {
  family: string;
  conds: ContextCond[];
}

export const CONTEXT_GROUPS: ContextGroup[] = [
  {
    family: "Momentum",
    conds: [
      { key: "rsi_bull", label: "RSI bullish (> 50)", real: true, test: (r) => (r.rsi ?? -1) > 50 },
      { key: "rsi_strong", label: "RSI strong (> 60)", real: true, test: (r) => (r.rsi ?? -1) > 60 },
      { key: "rsi_oversold", label: "RSI oversold (< 30)", real: true, test: (r) => (r.rsi ?? 999) < 30 },
      { key: "rsi_overbought", label: "RSI overbought (> 70)", real: true, test: (r) => (r.rsi ?? -1) > 70 },
      { key: "rs_leader", label: "RS Rating leader (≥ 80)", real: true, test: (r) => (r.rsRating ?? 0) >= 80 },
      { key: "up_today", label: "Up on the day", real: true, test: (r) => r.chg > 0 },
      { key: "down_today", label: "Down on the day", real: true, test: (r) => r.chg < 0 },
    ],
  },
  {
    family: "Trend",
    conds: [
      { key: "ema_above", label: "Above EMA25 & EMA50", real: true, test: (r) => r.emaAboveKey },
      { key: "ema_below", label: "Below key EMAs", real: true, test: (r) => r.emaBelowKey },
      { key: "sig_ema", label: "Engine: EMA Trend up", real: true, test: (r) => r.signalType === "EMA Trend" },
      {
        key: "sig_golden",
        label: "Engine: Golden Cross",
        real: true,
        test: (r) => r.signalType === "Golden Cross" || /golden cross|macd line crossed above/i.test(r.summary),
      },
    ],
  },
  {
    family: "Structure & VWAP",
    conds: [
      { key: "vwap_discount", label: "Discount to VWAP", real: true, test: (r) => (r.vwapSigma ?? 9) <= -0.6 },
      { key: "vwap_near", label: "Near VWAP", real: true, test: (r) => Math.abs(r.vwapSigma ?? 9) < 0.6 },
      { key: "vwap_premium", label: "Premium to VWAP", real: true, test: (r) => (r.vwapSigma ?? -9) >= 0.6 },
      { key: "smc_ob", label: "In bullish order block", real: true, test: (r) => /OB Bull/i.test(r.entryPOI) },
      { key: "smc_eq", label: "At equilibrium (EQ)", real: true, test: (r) => /^EQ/.test(r.entryPOI) },
      { key: "smc_disc", label: "SMC discount zone", real: true, test: (r) => (r.vwapSigma ?? 9) < -0.75 },
      { key: "reclaim", label: "Reclaimed a level", real: true, test: (r) => r.reclaim },
    ],
  },
  {
    family: "Trade plan",
    conds: [
      { key: "rr2", label: "Reward:Risk ≥ 2×", real: true, test: (r) => (r.rr ?? 0) >= 2 },
      { key: "rr3", label: "Reward:Risk ≥ 3×", real: true, test: (r) => (r.rr ?? 0) >= 3 },
      { key: "has_setup", label: "Has an engine setup", real: true, test: (r) => r.hasEngineSetup },
      { key: "score70", label: "Swing score ≥ 70", real: "sparse", test: (r) => (r.score ?? -1) >= 70 },
    ],
  },
  {
    family: "Liquidity",
    conds: [
      { key: "busy", label: "Busy (RVOL ≥ 1.5×)", real: true, test: (r) => (r.rvol ?? 0) >= 1.5 },
      { key: "surging", label: "Surging (RVOL ≥ 3×)", real: true, test: (r) => (r.rvol ?? 0) >= 3 },
      { key: "quiet", label: "Quiet (RVOL < 0.5×)", real: true, test: (r) => (r.rvol ?? 9) < 0.5 },
      { key: "large", label: "Large-cap tier", real: true, test: (r) => r.capTier === "Large cap" },
      { key: "mid", label: "Mid-cap tier", real: true, test: (r) => r.capTier === "Mid cap" },
      { key: "small", label: "Small-cap tier", real: true, test: (r) => r.capTier === "Small cap" },
    ],
  },
  {
    family: "Ownership (KSEI proxy)",
    conds: [
      { key: "ksei_accum", label: "KSEI accumulating", real: "sparse", test: (r) => r.kseiAccum === true },
      { key: "foreign_buy", label: "Foreign buying (proxy)", real: "sparse", test: (r) => (r.kseiDelta ?? 0) > 0 },
      { key: "foreign_sell", label: "Foreign selling (proxy)", real: "sparse", test: (r) => (r.kseiDelta ?? 0) < 0 },
    ],
  },
  {
    family: "Fundamental",
    conds: [
      { key: "pe_cheap", label: "PE cheap (detail-only)", real: false, test: () => false },
      { key: "pbv_cheap", label: "PBV cheap (detail-only)", real: false, test: () => false },
      { key: "roe_high", label: "ROE high (detail-only)", real: false, test: () => false },
    ],
  },
];

export const CONTEXT_BY_KEY: Record<string, ContextCond & { family: string }> = {};
CONTEXT_GROUPS.forEach((g) => g.conds.forEach((c) => (CONTEXT_BY_KEY[c.key] = { ...c, family: g.family })));

// ── interpreted cells ──
function trendCell(r: UniverseRow): Cell {
  if (r.rsi == null && !r.maRaw) return { available: false };
  const bull = r.emaAboveKey && (r.rsi ?? 0) > 50;
  const bear = r.emaBelowKey || (r.rsi != null && r.rsi < 45);
  const label = bull ? "Above EMA25 & EMA50" : r.emaAboveKey ? "Above key EMAs" : "Below key EMAs";
  const tone: Tone = bull ? "up" : bear ? "down" : "flat";
  return {
    available: true,
    label,
    tone,
    val: r.rsi != null ? `RSI ${r.rsi.toFixed(1)}` : r.maRaw,
    raw: r.summary || r.maRaw || "",
    sort: (r.emaAboveKey ? 100 : 0) + (r.rsi ?? 0),
  };
}

function structureCell(r: UniverseRow): Cell {
  const poi = r.entryPOI;
  if (/OB Bull/i.test(poi)) return { available: true, label: "In bullish order block", tone: "up", val: poi, raw: r.summary, sort: 3 };
  if (/^EQ/.test(poi)) return { available: true, label: "Equilibrium reclaim", tone: "up", val: poi, raw: r.summary, sort: 2 };
  if (r.reclaim && r.emaAboveKey) return { available: true, label: "Bullish reclaim", tone: "up", val: "reclaim + EMA stack", raw: r.summary, sort: 2 };
  if (/OB Bear/i.test(poi)) return { available: true, label: "At bearish order block", tone: "down", val: poi, raw: r.summary, sort: -2 };
  if ((r.vwapSigma ?? 9) < -0.75) return { available: true, label: "SMC discount", tone: "up", val: `${(r.vwapSigma ?? 0).toFixed(1)}σ`, raw: r.vwapRaw || "", sort: 1 };
  return { available: true, label: "Neutral structure", tone: "flat", val: poi || "—", raw: r.summary, sort: 0 };
}

function vwapCell(r: UniverseRow): Cell {
  if (r.vwapSigma == null) return { available: false };
  const s = r.vwapSigma;
  if (/^EQ/.test(r.entryPOI) && r.reclaim) return { available: true, label: "Reclaimed EQ", tone: "up", val: r.vwapRaw || "", raw: r.vwapRaw || "", sort: 2 };
  let label: string;
  let tone: Tone;
  if (s <= -2) { label = "Deep discount to VWAP"; tone = "up"; }
  else if (s <= -0.6) { label = "Below VWAP (discount)"; tone = "up"; }
  else if (s < 0.6) { label = "Near VWAP"; tone = "flat"; }
  else if (s < 2) { label = "Above VWAP (premium)"; tone = "down"; }
  else { label = "Rich vs VWAP"; tone = "down"; }
  const val = `${s > 0 ? "+" : s < 0 ? "−" : ""}${Math.abs(s).toFixed(1)}σ`;
  return { available: true, label, tone, val, raw: r.vwapRaw || "", sort: -s };
}

function liquidityCell(r: UniverseRow): Cell {
  if (r.rvol == null) return { available: false };
  const busy = r.rvol >= 1.5;
  const thin = r.rvol < 0.5;
  const label = busy ? "Busy vs its norm" : thin ? "Quiet vs its norm" : "Average activity";
  const adtv = r.medianValueTraded != null ? ` · ADTV ${(r.medianValueTraded / 1e9).toFixed(1)}B` : "";
  return {
    available: true,
    label,
    tone: busy ? "up" : "flat",
    val: `RVOL ${r.rvol.toFixed(2)}×${adtv}`,
    raw: `RVOL ${r.rvol.toFixed(3)}${adtv ? " (ADTV real)" : " (ADTV: no data)"}`,
    sort: r.rvol,
  };
}

// Foreign/Local flow — a LABELLED KSEI proxy. Broker-level buy/sell does not
// exist in the data, so we never invent broker counts.
function flowCell(r: UniverseRow): Cell {
  if (r.kseiDelta == null) return { available: false };
  const d = r.kseiDelta;
  if (Math.abs(d) < 0.05) return { available: true, label: "Balanced flow", tone: "flat", val: "KSEI proxy 0.0pp", raw: `KSEI net ${d.toFixed(2)}pp (proxy)`, proxy: true, sort: 0 };
  const fb = d > 0;
  return {
    available: true,
    label: fb ? "Foreign buying, local selling" : "Foreign selling, local buying",
    tone: fb ? "up" : "down",
    val: `KSEI proxy ${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}pp`,
    raw: `KSEI net ${d.toFixed(2)}pp (proxy — no broker data)`,
    proxy: true,
    sort: d,
  };
}

// ── build the typed universe from the raw workbook + engine docs ──
export function buildUniverse(scr: ScreenerDoc, setupsDoc: SetupsDoc): Universe {
  const setupByTicker: Record<string, EngineSetup> = {};
  (setupsDoc.setups || []).forEach((s) => (setupByTicker[s.ticker] = s));

  // one record per ticker — keep the best-R/R signal row
  const byTicker: Record<string, ScreenerRecord> = {};
  (scr.records || []).forEach((rec) => {
    const t = str(rec.Ticker).toUpperCase();
    if (!t) return;
    const cur = byTicker[t];
    if (!cur || (num(rec["R/R"]) ?? 0) > (num(cur["R/R"]) ?? 0)) byTicker[t] = rec;
  });

  const rows: UniverseRow[] = Object.values(byTicker).map((rec) => {
    const su = setupByTicker[str(rec.Ticker).toUpperCase()];
    const maRaw = str(rec.MA);
    const summary = str(rec["Summary Screener"]);
    const emaAboveKey =
      /Above All Available MA/.test(maRaw) ||
      /Above[^|]*EMA25[^|]*EMA50/.test(maRaw) ||
      /Close .*> EMA25.*EMA25.*> EMA50/i.test(summary);
    const emaBelowKey = /Below[^|]*EMA50/.test(maRaw) && !emaAboveKey;
    const sectorCode = str(rec.Sector) || "Others";
    const price = num(rec.Price);

    const r: UniverseRow = {
      ticker: str(rec.Ticker).toUpperCase(),
      sectorCode,
      sectorLabel: SECTOR_LABEL[sectorCode] || sectorCode,
      price,
      chg: num(rec["Chg %"]) ?? 0,
      rvol: num(rec.RVOL),
      adr: num(rec["ADR %"]),
      rr: num(rec["R/R"]),
      rsRating: num(rec["RS Rating"]),
      signalType: str(rec.signalType),
      summary,
      maRaw,
      news: str(rec["Sentiment News"]),
      entry: num(rec.Entry),
      target: num(rec.Target),
      invalidation: num(rec.Invalidation),
      entryPOI: str(rec["Entry POI"]),
      targetPOI: str(rec["Target POI"]),
      rsi: parseRsi(summary),
      vwapSigma: parseSigma(rec["Current Q VWAP"]),
      vwapRaw: str(rec["Current Q VWAP"]) || null,
      emaAboveKey,
      emaBelowKey,
      reclaim: /reclaim/i.test(summary),
      score: su && typeof su.score === "number" ? su.score : null,
      hasEngineSetup: !!su,
      isRecentIpo: su ? !!su.isRecentIpo : null,
      medianValueTraded: su && typeof su.medianValueTraded20 === "number" ? su.medianValueTraded20 : null,
      kseiDelta: su && su.kseiFootprint && su.kseiFootprint.available ? su.kseiFootprint.netDeltaPP ?? null : null,
      kseiAccum: su && su.kseiFootprint && su.kseiFootprint.available ? !!su.kseiFootprint.accumulation : null,
      capTier: (price ?? 0) > 3000 ? "Large cap" : (price ?? 0) >= 200 ? "Mid cap" : "Small cap",
      smcZone: "",
      setupsMatched: [],
      setupsBear: [],
      freshRank: 0,
      cellTrend: { available: false },
      cellStructure: { available: false },
      cellVwap: { available: false },
      cellLiquidity: { available: false },
      cellFlow: { available: false },
    };

    r.setupsMatched = SETUPS.filter((s) => {
      try { return s.bull(r); } catch { return false; }
    }).map((s) => s.key);
    r.setupsBear = SETUPS.filter((s) => s.hasBear && s.bear)
      .filter((s) => {
        try { return s.bear!(r); } catch { return false; }
      })
      .map((s) => s.key);

    r.cellTrend = trendCell(r);
    r.cellStructure = structureCell(r);
    r.cellVwap = vwapCell(r);
    r.cellLiquidity = liquidityCell(r);
    r.cellFlow = flowCell(r);

    r.smcZone = /OB Bull/i.test(r.entryPOI)
      ? "Bull OB"
      : /^EQ/.test(r.entryPOI)
        ? "Equilibrium"
        : (r.vwapSigma ?? 9) < -0.75
          ? "Discount"
          : (r.vwapSigma ?? -9) > 0.75
            ? "Premium"
            : "—";

    r.freshRank =
      (su && typeof su.score === "number" ? 100000 + su.score * 100 : 0) +
      r.setupsMatched.length * 100 +
      (r.rvol ?? 0);
    return r;
  });

  return {
    marketDate: str(scr.marketDate),
    totalUniverse: setupsDoc.scanned || scr.uniqueTickerCount || rows.length,
    scanned: rows.length,
    rows,
  };
}

/** Precomputed solo (single-setup) match counts across the universe. */
export function soloCounts(rows: UniverseRow[]): Record<string, { bull: number; bear: number }> {
  const out: Record<string, { bull: number; bear: number }> = {};
  SETUPS.forEach((s) => {
    out[s.key] = {
      bull: rows.reduce((n, r) => n + (r.setupsMatched.includes(s.key) ? 1 : 0), 0),
      bear: rows.reduce((n, r) => n + (r.setupsBear.includes(s.key) ? 1 : 0), 0),
    };
  });
  return out;
}

// ── loader: fetch the workbook + engine docs for a market date ──
export async function loadUniverse(marketDate: string): Promise<Universe> {
  const base = `/data/dates/${marketDate}`;
  const [scr, setupsDoc] = await Promise.all([
    fetchJson<ScreenerDoc>(`${base}/screener.json`),
    fetchJson<SetupsDoc>(`${base}/setups.json`).catch(() => ({ setups: [] }) as SetupsDoc),
  ]);
  return buildUniverse(scr, setupsDoc);
}
