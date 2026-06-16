import { asNumber } from "@/lib/format/number";
import { normalizeSector, sectorCode } from "@/lib/domain/sectors";
import type {
  JsonRecord,
  OverviewPayload,
  ResearchBundle,
  ScreenerRow,
  TechnicalRecord,
  TradePlan,
} from "@/lib/domain/types";
import { fetchJson } from "./client";

type RawScreener = {
  marketDate: string;
  rowCount?: number;
  uniqueTickerCount?: number;
  records?: JsonRecord[];
};

type RawTechnical = {
  marketDate: string;
  recordCount?: number;
  records?: Record<string, TechnicalRecord & JsonRecord>;
};

type RawRecords = {
  records?: JsonRecord[];
};

function text(value: unknown, fallback = "Unavailable"): string {
  if (value === null || value === undefined) return fallback;
  const out = String(value).trim();
  return out && out !== "-" ? out : fallback;
}

function rowTicker(row: JsonRecord): string {
  return text(row.Ticker || row.ticker || row.Kode, "").toUpperCase().replace(".JK", "");
}

function tradePlanFrom(row: JsonRecord, stock?: TechnicalRecord): TradePlan {
  return {
    entryPoi: text(row["Entry POI"] || stock?.entryPoi, ""),
    entry: asNumber(row.Entry ?? stock?.entry),
    entryDistancePct: asNumber(row["Entry Distance %"] ?? stock?.entryDistancePercent),
    targetPoi: text(row["Target POI"] || stock?.targetPoi, ""),
    target: asNumber(row.Target ?? stock?.target),
    targetUpsidePct: asNumber(row["Target Upside %"] ?? stock?.upsidePercent),
    invalidationPoi: text(row["Invalidation POI"] || stock?.invalidationPoi, ""),
    invalidation: asNumber(row.Invalidation ?? stock?.invalidation),
    invalidationDownPct: asNumber(row["Invalidation Down %"] ?? stock?.downsidePercent),
    rr: asNumber(row["R/R"] ?? stock?.riskReward),
  };
}

export function normalizeScreenerRows(
  rows: JsonRecord[],
  technical: Map<string, TechnicalRecord>,
  kongloMembership: Map<string, string[]>,
): ScreenerRow[] {
  return rows.map((row) => {
    const ticker = rowTicker(row);
    const stock = technical.get(ticker);
    const nested = (stock?.technical || {}) as JsonRecord;
    const sectorRaw = text(row.Sector || row["IDX Sector"] || stock?.sector, "Others");
    const signalLabel = text(row["Filter Label"] || row.signalType || row.Section, "Research signal");
    return {
      ticker,
      companyName: text(stock?.companyName || row.Company || row.Emiten, ticker),
      sector: normalizeSector(sectorRaw),
      idxSectorRaw: sectorCode(sectorRaw),
      industry: text(stock?.industry || row.Industry, "Others"),
      price: asNumber(row.Price ?? stock?.lastPrice),
      changePct: asNumber(row["Chg %"] ?? stock?.changePercent),
      beta: asNumber(row["Beta Zone"] ?? stock?.beta),
      rvol: asNumber(row.RVOL ?? stock?.rvol),
      rvolChangePct: asNumber(stock?.rvolChangePercent),
      liquidityCategory: text(stock?.liquidityCategory, "Liquidity not classified"),
      smc: text(nested.smcSummary || (nested.smc as JsonRecord | undefined)?.summary || stock?.structure?.swing, "Structure not flagged"),
      vwapZone: text(row["Current Q VWAP"] || nested.vwapPosition, "VWAP zone unavailable"),
      marketProfileZone: text(nested.marketProfileZone || (nested.marketProfile as JsonRecord | undefined)?.summary, "Market profile unavailable"),
      maZone: text(row.MA || nested.maZone || (stock?.movingAverages as JsonRecord | undefined)?.zone, "Moving average context unavailable"),
      summary: text(row["Summary Screener"] || stock?.summaryScreener || stock?.signalExplanation, "No concise summary available"),
      signalLabel,
      kongloGroups: kongloMembership.get(ticker) || [],
      tradePlan: tradePlanFrom(row, stock),
      raw: row,
    };
  });
}

export async function loadResearchBundle(marketDate: string, kongloMembership: Map<string, string[]>): Promise<ResearchBundle> {
  const base = `/data/dates/${marketDate}`;
  const [overview, screener, technical, fundamental, news] = await Promise.all([
    fetchJson<OverviewPayload>(`${base}/overview.json`),
    fetchJson<RawScreener>(`${base}/screener.json`),
    fetchJson<RawTechnical>(`${base}/technical.json`),
    fetchJson<RawRecords>(`${base}/fundamental.json`),
    fetchJson<RawRecords>(`${base}/news.json`),
  ]);

  const technicalMap = new Map<string, TechnicalRecord>();
  Object.entries(technical.records || {}).forEach(([ticker, record]) => {
    technicalMap.set(ticker.toUpperCase(), { ...record, ticker: ticker.toUpperCase(), raw: record });
  });

  const fundamentals = new Map<string, JsonRecord>();
  (fundamental.records || []).forEach((record) => {
    const ticker = rowTicker(record);
    if (ticker) fundamentals.set(ticker, record);
  });

  const newsMap = new Map<string, JsonRecord>();
  (news.records || []).forEach((record) => {
    const ticker = rowTicker(record);
    if (ticker) newsMap.set(ticker, record);
  });

  return {
    marketDate,
    overview,
    screener: normalizeScreenerRows(screener.records || [], technicalMap, kongloMembership),
    technical: technicalMap,
    fundamentals,
    news: newsMap,
  };
}
