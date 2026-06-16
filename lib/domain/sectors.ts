export const DATA_COVERAGE_START = "2026-01-01";

export const IDX_SECTOR_MAP = {
  IDXENERGY: "Energy",
  IDXBASIC: "Basic Materials",
  IDXINDUST: "Industrials",
  IDXNONCYC: "Non-Cyclical Consumer",
  IDXCYCLIC: "Cyclical Consumer",
  IDXHEALTH: "Healthcare",
  IDXFINANCE: "Financials",
  IDXPROPERT: "Properties & Real Estate",
  IDXTECHNO: "Technology",
  IDXINFRA: "Infrastructure",
  IDXTRANS: "Transportation & Logistics",
} as const;

export const IDX_SECTOR_CODES = Object.keys(IDX_SECTOR_MAP);

export function normalizeSector(raw?: string | null): string {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v || v === "-") return "Others";
  return IDX_SECTOR_MAP[v as keyof typeof IDX_SECTOR_MAP] ?? "Others";
}

export function sectorCode(raw?: string | null): string {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v || v === "-") return "Others";
  return v in IDX_SECTOR_MAP ? v : "Others";
}
