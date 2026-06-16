import { DATA_COVERAGE_START } from "@/lib/domain/sectors";
import type { Manifest } from "@/lib/domain/types";
import { fetchJson } from "./client";

type RawManifest = Omit<Manifest, "dataCoverageStart"> & {
  historyRange?: { start?: string; end?: string };
};

export async function loadManifest(): Promise<Manifest> {
  const raw = await fetchJson<RawManifest>("/data/manifest.json");
  const availableMarketDates = (raw.availableMarketDates || [])
    .filter((date) => date >= DATA_COVERAGE_START)
    .sort();
  const latestMarketDate =
    [...availableMarketDates].reverse().find((date) => date <= (raw.latestMarketDate || raw.latest || "")) ||
    availableMarketDates.at(-1) ||
    raw.latestMarketDate ||
    raw.latest ||
    "";

  return {
    ...raw,
    latestMarketDate,
    availableMarketDates,
    dataCoverageStart: DATA_COVERAGE_START,
    dates: (raw.dates || []).filter((entry) => entry.marketDate >= DATA_COVERAGE_START),
  };
}

export function resolveMarketDate(
  manifest: Manifest,
  requested?: string | null,
): { marketDate: string; notice?: string } {
  if (!requested) return { marketDate: manifest.latestMarketDate };
  if (manifest.availableMarketDates.includes(requested)) return { marketDate: requested };
  return {
    marketDate: manifest.latestMarketDate,
    notice: `${requested} is not an available IDX session in this research archive. Showing ${manifest.latestMarketDate}.`,
  };
}
