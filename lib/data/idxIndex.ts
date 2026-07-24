import { fetchJson } from "./client";

// Per-ticker index membership from the quarterly IDX index evaluation.
// Additive context: which indices a stock belongs to, its index weight, the
// official (index) free float, and the rebalance signal (Baru = new inclusion).

export type IndexLeg = { index?: string; weight: number | null; signal: string | null };

export type IdxIndexRecord = {
  ticker: string;
  memberships: string[];
  officialFreeFloat: number | null;
  ihsg: IndexLeg | null;
  sector: IndexLeg | null;
  primbank: boolean;
};

export type IdxIndexPayload = {
  effective: string;
  constituentCount: number;
  newInclusions: string[];
  records: Record<string, IdxIndexRecord>;
};

export async function loadIdxIndex(): Promise<IdxIndexPayload | null> {
  try {
    const raw = await fetchJson<IdxIndexPayload>("/data/idx-index/latest.json");
    return raw?.records ? raw : null;
  } catch {
    return null; // file may not exist yet; the drawer simply omits the panel
  }
}
