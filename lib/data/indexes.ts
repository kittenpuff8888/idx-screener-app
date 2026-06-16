import type { ExternalIndex, IndexGroup, IndexPayload, IndexPoint } from "@/lib/domain/types";
import { fetchJson } from "./client";

type RawIndexes = {
  generatedAt?: string;
  marketDateRange?: { start?: string; end?: string };
  externalIndexes?: Record<string, Array<{ id: string; label: string; symbol: string }>>;
  groups?: Array<Omit<IndexGroup, "type" | "series"> & { series?: IndexPoint[] }>;
};

export async function loadIndexes(): Promise<IndexPayload> {
  const raw = await fetchJson<RawIndexes>("/data/indexes.json");
  const externalIndexes: Record<string, ExternalIndex[]> = {};
  Object.entries(raw.externalIndexes || {}).forEach(([group, items]) => {
    externalIndexes[group] = items.map((item) => ({ ...item, type: "live-reference" as const }));
  });
  return {
    generatedAt: raw.generatedAt,
    marketDateRange: raw.marketDateRange,
    externalIndexes,
    groups: (raw.groups || []).map((group) => ({
      ...group,
      type: "local-research-index" as const,
      constituents: group.constituents || [],
      series: group.series || [],
    })),
  };
}

export function buildKongloMembership(indexes: IndexPayload | null): Map<string, string[]> {
  const map = new Map<string, string[]>();
  (indexes?.groups || [])
    .filter((group) => group.section === "KONGLO INDEX")
    .forEach((group) => {
      group.constituents.forEach((item) => {
        const ticker = item.ticker.toUpperCase();
        const current = map.get(ticker) || [];
        current.push(group.id);
        map.set(ticker, current);
      });
    });
  return map;
}

export function capSeriesToDate(series: IndexPoint[], marketDate: string): IndexPoint[] {
  return series.filter((point) => point.date >= "2026-01-01" && point.date <= marketDate);
}

export function performance(series: IndexPoint[], marketDate: string, offsetDays: number | "ytd" | "all"): number | null {
  const capped = capSeriesToDate(series, marketDate);
  const latest = capped.at(-1);
  if (!latest) return null;
  let start: IndexPoint | undefined;
  if (offsetDays === "all") start = capped[0];
  else if (offsetDays === "ytd") start = capped.find((point) => point.date >= `${marketDate.slice(0, 4)}-01-01`) || capped[0];
  else start = capped[Math.max(0, capped.length - 1 - offsetDays)];
  if (!start || !start.value) return null;
  return (latest.value / start.value - 1) * 100;
}
