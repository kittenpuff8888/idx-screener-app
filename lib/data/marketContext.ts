import { fetchJson } from "./client";

export type MarketInstrument = {
  label: string;
  symbol: string;
  status?: string;
  rows?: Array<{ date: string; close?: number; value?: number }>;
  series?: number[];
};

export type MarketContextPayload = {
  generatedAt?: string;
  instruments: MarketInstrument[];
};

export async function loadMarketContext(): Promise<MarketContextPayload | null> {
  try {
    return await fetchJson<MarketContextPayload>("/data/market-context.json");
  } catch {
    return null;
  }
}

export function latestInstrumentValue(item: MarketInstrument): { value: number | null; change: number | null; changePct: number | null; series: number[] } {
  const series = item.rows?.map((row) => Number(row.close ?? row.value)).filter(Number.isFinite) || item.series || [];
  const latest = series.at(-1);
  const previous = series.at(-2);
  if (latest === undefined || previous === undefined) return { value: latest ?? null, change: null, changePct: null, series };
  return {
    value: latest,
    change: latest - previous,
    changePct: previous ? ((latest / previous) - 1) * 100 : null,
    series,
  };
}
