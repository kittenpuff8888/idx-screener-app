import type { KseiIssuer, OhlcvPayload, TechnicalRecord, TradePlan } from "@/lib/domain/types";
import { asNumber, formatPercent, formatPlainPercent, sentenceJoin } from "@/lib/format/number";
import { fetchJson } from "./client";

export function tradePlanFromTechnical(stock?: TechnicalRecord): TradePlan | undefined {
  if (!stock) return undefined;
  return {
    entryPoi: stock.entryPoi,
    entry: asNumber(stock.entry),
    entryDistancePct: asNumber(stock.entryDistancePercent),
    targetPoi: stock.targetPoi,
    target: asNumber(stock.target),
    targetUpsidePct: asNumber(stock.upsidePercent),
    invalidationPoi: stock.invalidationPoi,
    invalidation: asNumber(stock.invalidation),
    invalidationDownPct: asNumber(stock.downsidePercent),
    rr: asNumber(stock.riskReward),
  };
}

export function buildResearchSummary(stock?: TechnicalRecord, ownership?: KseiIssuer): string {
  if (!stock) return "This ticker is not available in the selected market session. Try another available date or ticker.";
  const technical = stock.technical || {};
  const smc = technical.smcSummary || stock.structure?.swing || "market structure context is limited";
  const vwap = technical.vwapPosition || (technical.vwapProfiles as Record<string, { zone?: string }> | undefined)?.currentQuarter?.zone;
  const ma = (technical.movingAverageDetail as Record<string, unknown> | undefined)
    ? stock.movingAverages?.zone || technical.maZone
    : stock.movingAverages?.zone;
  const liquidity = stock.liquidityCategory || "liquidity is not classified";
  const ownershipText = ownership
    ? `Ownership is ${ownership.ownershipType.toLowerCase()} with CR1 at ${formatPlainPercent(ownership.cr1, 1)} and free float at ${formatPlainPercent(ownership.freeFloat, 1)}.`
    : "Ownership context is not available in the latest KSEI snapshot.";
  const trade = stock.riskReward
    ? `The mapped plan shows ${formatPercent(stock.upsidePercent, 1)} upside versus ${formatPercent(stock.downsidePercent, 1).replace("+", "")} downside.`
    : null;
  return sentenceJoin([
    `${stock.ticker} sits in ${stock.industry || "its industry"} with ${formatPercent(stock.changePercent, 2)} price movement on the selected session.`,
    `Structure reads as ${String(smc).toLowerCase()}, while VWAP context is ${String(vwap || "not available").toLowerCase()} and MA context is ${String(ma || "not available").toLowerCase()}.`,
    `RVOL is ${stock.rvol?.toFixed(2) || "unavailable"} and ${liquidity.toLowerCase()}.`,
    ownershipText,
    trade,
  ]);
}

/** `docs/data/ohlcv/<date>/` is a rolling cache, not a full per-date archive
    — most historical dates' own directories get pruned as newer ones are
    added. Every surviving directory still holds each ticker's *cumulative*
    row history through that date, so any later snapshot that does exist
    covers an earlier marketDate just as well once re-clipped below. Pass
    `fallbackDate` (e.g. the manifest's overall latest date) so a browsed
    historical date whose own snapshot has rotated out still resolves. */
export async function loadOhlcv(marketDate: string, ticker: string, fallbackDate?: string): Promise<OhlcvPayload | null> {
  const cutoff = `${Number(marketDate.slice(0, 4)) - 1}-01-01`;
  const fetchFrom = async (date: string) => {
    const payload = await fetchJson<OhlcvPayload>(`/data/ohlcv/${date}/${ticker.toUpperCase()}.json`);
    return {
      ...payload,
      rows: (payload.rows || []).filter((row) => row.date >= cutoff && row.date <= marketDate),
    };
  };
  try {
    return await fetchFrom(marketDate);
  } catch {
    if (!fallbackDate || fallbackDate === marketDate) return null;
    try {
      return await fetchFrom(fallbackDate);
    } catch {
      return null;
    }
  }
}
