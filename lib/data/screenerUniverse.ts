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
  // monthly Initial Balance (technical.json marketProfile join). null until
  // the month's first 2 sessions lock the band (IDX_Screener.py "ibh"/"ibl").
  ibh: number | null;
  ibl: number | null;
  // technical.json macdDetail/rsiDetail join -- real backend-computed
  // crossover/divergence fields, not re-derived from price here.
  macdCross: string | null; // "Golden Cross" | "Dead Cross" | "N/A" | null
  rsiDivergence: string | null; // "Bullish" | "Bearish" | null
  // true when the backend classified the current divergence as "Hidden"
  // (continuation pattern) rather than regular Strong/Medium/Weak (reversal).
  rsiDivergenceHidden: boolean;
  stochCross: string | null; // "Golden Cross" | "Dead Cross" | null
  // scripts/compute_screener_signals.py join -- the four screener filters
  // below, computed fresh from the published OHLCV archive (see that
  // script's docstring for exact parameters). Absent for a ticker with too
  // little history for a given signal, never guessed.
  breakIbhIbl: boolean;
  rsiDivBullish: boolean;
  rsiDivHiddenBullish: boolean;
  stochRsiGoldenCross: boolean;
  nearPqM1: boolean;
  nearPqM2: boolean;
  nearPyM1: boolean;
  nearPyM2: boolean;
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
type TechnicalRecord = {
  technical?: {
    marketProfile?: { ibh?: unknown; ibl?: unknown };
    macdDetail?: { cross?: unknown };
    rsiDetail?: { cross?: unknown; divergenceSignal?: unknown; divergenceStrength?: unknown };
    stochDetail?: { cross?: unknown };
  };
  // On incremental-day snapshots (build_historical_snapshots.py's lighter
  // path, roughly half of all archived dates), ibh/ibl live here instead of
  // technical.marketProfile -- that nested object doesn't exist at all on
  // those days. Read both; prefer marketProfile, fall back to levels.
  levels?: { ibh?: unknown; ibl?: unknown };
};
type TechnicalDoc = { records?: Record<string, TechnicalRecord> };
type TechExtra = {
  ibh: number | null;
  ibl: number | null;
  macdCross: string | null;
  rsiDivergence: string | null;
  rsiDivergenceHidden: boolean;
  stochCross: string | null;
};
type IbMap = Record<string, TechExtra>;

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

// Exactly the eight screener filters requested — nothing else. Each reads a
// field scripts/compute_screener_signals.py computed fresh from the
// published OHLCV archive that day (see that script's docstring for exact
// parameters/formulas); "today" fields (breakIbhIbl, the two RSI divergence
// variants, stochRsiGoldenCross) are true only on the session the event
// itself occurred, not "still in that state from days ago".
export const SETUPS: SetupDef[] = [
  {
    key: "break_ibh_ibl",
    label: "Break IBH/IBL",
    icon: "⇕",
    hasBear: false,
    req: "Yesterday's close sat mid-band inside the monthly Initial Balance (first 2 sessions of the month), and today's close breaks above the IBH",
    bull: (r) => r.breakIbhIbl,
  },
  {
    key: "rsi10_div_bullish",
    label: "RSI 10 Divergence — Bullish",
    icon: "⤢",
    hasBear: false,
    req: "Regular bullish RSI(10, EMA-smoothed) divergence confirmed today — price lower low, RSI higher low (lifecycle-cluster method)",
    bull: (r) => r.rsiDivBullish,
  },
  {
    key: "rsi10_div_hidden_bullish",
    label: "RSI 10 Divergence — Hidden Bullish",
    icon: "⤢",
    hasBear: false,
    req: "Hidden bullish RSI(10, EMA-smoothed) divergence confirmed today — price higher low, RSI lower low (uptrend continuation)",
    bull: (r) => r.rsiDivHiddenBullish,
  },
  {
    key: "stoch_rsi_golden_cross",
    label: "Stoch RSI Golden Cross",
    icon: "✦",
    hasBear: false,
    req: "Stochastic RSI %K crosses above %D today (RSI length 10, Stochastic length 10, K 3, D 3, source Close) while RSI(10) is oversold (< 30)",
    bull: (r) => r.stochRsiGoldenCross,
  },
  {
    key: "near_vwap_pq_m1",
    label: "Near VWAP — PQ −1σ",
    icon: "≈",
    hasBear: false,
    req: "Close within 1% of the Previous Quarter anchored-VWAP −1σ band",
    bull: (r) => r.nearPqM1,
  },
  {
    key: "near_vwap_pq_m2",
    label: "Near VWAP — PQ −2σ",
    icon: "≈",
    hasBear: false,
    req: "Close within 1% of the Previous Quarter anchored-VWAP −2σ band",
    bull: (r) => r.nearPqM2,
  },
  {
    key: "near_vwap_py_m1",
    label: "Near VWAP — PY −1σ",
    icon: "≈",
    hasBear: false,
    req: "Close within 1% of the Previous Year anchored-VWAP −1σ band",
    bull: (r) => r.nearPyM1,
  },
  {
    key: "near_vwap_py_m2",
    label: "Near VWAP — PY −2σ",
    icon: "≈",
    hasBear: false,
    req: "Close within 1% of the Previous Year anchored-VWAP −2σ band",
    bull: (r) => r.nearPyM2,
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

export type ScreenerSignal = {
  breakIbhIbl?: boolean; rsiDivBullish?: boolean; rsiDivHiddenBullish?: boolean; stochRsiGoldenCross?: boolean;
  nearPqM1?: boolean; nearPqM2?: boolean; nearPyM1?: boolean; nearPyM2?: boolean;
};
export type ScreenerSignalsDoc = { records?: Record<string, ScreenerSignal> };

// ── build the typed universe from the raw workbook + engine docs ──
export function buildUniverse(scr: ScreenerDoc, setupsDoc: SetupsDoc, ibMap: IbMap = {}, signals: Record<string, ScreenerSignal> = {}): Universe {
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
  // screener.json's roster is a ~400-ticker subset (the legacy engine's own
  // "scanned" set); screener_signals.json is computed for the FULL ~962-
  // ticker universe. A ticker whose only distinction today is one of the 4
  // new signals (e.g. a thinly-traded name outside the legacy roster) must
  // still get a row here, or its real, computed signal can never surface in
  // the table — stub in the bare minimum (every other field degrades to its
  // existing "no data" / null handling).
  Object.keys(signals).forEach((t) => {
    const tu = t.toUpperCase();
    if (!byTicker[tu]) byTicker[tu] = { Ticker: tu };
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
    const sig = signals[str(rec.Ticker).toUpperCase()] || {};

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
      breakIbhIbl: !!sig.breakIbhIbl,
      rsiDivBullish: !!sig.rsiDivBullish,
      rsiDivHiddenBullish: !!sig.rsiDivHiddenBullish,
      stochRsiGoldenCross: !!sig.stochRsiGoldenCross,
      nearPqM1: !!sig.nearPqM1,
      nearPqM2: !!sig.nearPqM2,
      nearPyM1: !!sig.nearPyM1,
      nearPyM2: !!sig.nearPyM2,
      score: su && typeof su.score === "number" ? su.score : null,
      hasEngineSetup: !!su,
      isRecentIpo: su ? !!su.isRecentIpo : null,
      medianValueTraded: su && typeof su.medianValueTraded20 === "number" ? su.medianValueTraded20 : null,
      kseiDelta: su && su.kseiFootprint && su.kseiFootprint.available ? su.kseiFootprint.netDeltaPP ?? null : null,
      kseiAccum: su && su.kseiFootprint && su.kseiFootprint.available ? !!su.kseiFootprint.accumulation : null,
      capTier: (price ?? 0) > 3000 ? "Large cap" : (price ?? 0) >= 200 ? "Mid cap" : "Small cap",
      ibh: ibMap[str(rec.Ticker).toUpperCase()]?.ibh ?? null,
      ibl: ibMap[str(rec.Ticker).toUpperCase()]?.ibl ?? null,
      macdCross: ibMap[str(rec.Ticker).toUpperCase()]?.macdCross ?? null,
      rsiDivergence: ibMap[str(rec.Ticker).toUpperCase()]?.rsiDivergence ?? null,
      rsiDivergenceHidden: ibMap[str(rec.Ticker).toUpperCase()]?.rsiDivergenceHidden ?? false,
      stochCross: ibMap[str(rec.Ticker).toUpperCase()]?.stochCross ?? null,
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
  const [scr, setupsDoc, technicalDoc, signalsDoc] = await Promise.all([
    fetchJson<ScreenerDoc>(`${base}/screener.json`),
    fetchJson<SetupsDoc>(`${base}/setups.json`).catch(() => ({ setups: [] }) as SetupsDoc),
    fetchJson<TechnicalDoc>(`${base}/technical.json`).catch(() => ({ records: {} }) as TechnicalDoc),
    fetchJson<ScreenerSignalsDoc>(`${base}/screener_signals.json`).catch(() => ({ records: {} }) as ScreenerSignalsDoc),
  ]);
  const ibMap: IbMap = {};
  Object.entries(technicalDoc.records || {}).forEach(([ticker, rec]) => {
    const mp = rec.technical?.marketProfile;
    const macdCrossRaw = str(rec.technical?.macdDetail?.cross);
    const rsiDivRaw = str(rec.technical?.rsiDetail?.divergenceSignal);
    ibMap[ticker.toUpperCase()] = {
      ibh: num(mp?.ibh) ?? num(rec.levels?.ibh),
      ibl: num(mp?.ibl) ?? num(rec.levels?.ibl),
      macdCross: macdCrossRaw && macdCrossRaw !== "N/A" ? macdCrossRaw : null,
      rsiDivergence: rsiDivRaw || null,
      rsiDivergenceHidden: str(rec.technical?.rsiDetail?.divergenceStrength) === "Hidden",
      stochCross: (() => {
        const v = str(rec.technical?.stochDetail?.cross);
        return v && v !== "N/A" && v !== "-" ? v : null;
      })(),
    };
  });
  return buildUniverse(scr, setupsDoc, ibMap, signalsDoc.records || {});
}
