import { normalizeSector, sectorCode } from "@/lib/domain/sectors";
import type { JsonRecord, KseiChange, KseiIssuer, KseiPayload } from "@/lib/domain/types";
import { asNumber } from "@/lib/format/number";
import { fetchJson } from "./client";

type RawKsei = {
  asOf: string;
  generatedAt?: string;
  summary?: JsonRecord;
  records?: JsonRecord[];
  investorChanges?: JsonRecord[];
};

function text(value: unknown, fallback = "Unavailable"): string {
  if (value === null || value === undefined) return fallback;
  const out = String(value).trim();
  return out && out !== "-" ? out : fallback;
}

export async function loadKsei(): Promise<KseiPayload> {
  const raw = await fetchJson<RawKsei>("/data/ksei/latest.json");
  return {
    asOf: raw.asOf,
    generatedAt: raw.generatedAt,
    summary: raw.summary || {},
    records: (raw.records || []).map((record): KseiIssuer => {
      const sectorRaw = text(record.idxSector || record.sector, "Others");
      return {
        ticker: text(record.ticker, "").toUpperCase(),
        companyName: text(record.companyName || record.Emiten, "Unnamed issuer"),
        sector: normalizeSector(sectorRaw),
        idxSectorRaw: sectorCode(sectorRaw),
        industry: text(record.industry, "Others"),
        investors: Array.isArray(record.investors) ? record.investors as KseiIssuer["investors"] : [],
        freeFloat: asNumber(record.freeFloat),
        hhi: asNumber(record.hhi),
        cr1: asNumber(record.cr1),
        cr3: asNumber(record.cr3),
        holderCount: asNumber(record.holderCount),
        ccs: asNumber(record.ccs),
        ownershipType: text(record.ownershipType, "Unclassified"),
        ccsCategory: text(record.ccsCategory, "Unclassified"),
        idxSectorWeight: asNumber(record.idxSectorWeight),
        composition: (record.composition as KseiIssuer["composition"]) ?? null,
        raw: record,
      };
    }),
    investorChanges: (raw.investorChanges || []).map((change): KseiChange => ({
      changeType: text(change.changeType, "Change"),
      ticker: text(change.ticker, "").toUpperCase(),
      companyName: text(change.companyName, "Unnamed issuer"),
      investor: text(change.investor, "Unnamed investor"),
      oldPercentage: asNumber(change.oldPercentage) ?? undefined,
      newPercentage: asNumber(change.newPercentage) ?? undefined,
      notes: text(change.notes, ""),
    })),
  };
}

export function buildInvestorDirectory(ksei: KseiPayload | null) {
  const directory = new Map<string, Array<{ issuer: KseiIssuer; rank: number; type: string; percentage: number }>>();
  (ksei?.records || []).forEach((issuer) => {
    issuer.investors.forEach((investor) => {
      const key = investor.name.toUpperCase();
      const rows = directory.get(key) || [];
      rows.push({ issuer, rank: investor.rank, type: investor.type, percentage: investor.percentage });
      directory.set(key, rows);
    });
  });
  return directory;
}
