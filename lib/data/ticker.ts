import type { KseiIssuer, OhlcvPayload, TechnicalRecord, TradePlan } from "@/lib/domain/types";
import { asNumber, formatPercent, sentenceJoin } from "@/lib/format/number";
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
    ? `Ownership is ${ownership.ownershipType.toLowerCase()} with CR1 at ${formatPercent(ownership.cr1, 1)} and free float at ${formatPercent(ownership.freeFloat, 1)}.`
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

export async function loadOhlcv(marketDate: string, ticker: string): Promise<OhlcvPayload | null> {
  try {
    const payload = await fetchJson<OhlcvPayload>(`/data/ohlcv/${marketDate}/${ticker.toUpperCase()}.json`);
    return {
      ...payload,
      rows: (payload.rows || []).filter((row) => row.date >= "2026-01-01" && row.date <= marketDate),
    };
  } catch {
    return null;
  }
}
