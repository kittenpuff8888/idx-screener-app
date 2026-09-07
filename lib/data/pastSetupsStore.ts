import type { OhlcvRow } from "@/lib/domain/types";
import { loadOhlcv } from "@/lib/data/ticker";
import type { WatchlistRow, WatchlistState } from "@/lib/data/watchlistStore";

// A personal, purely watchlist-driven "closed positions" log — replaces the
// old signal-engine-sourced Past Setups (docs/data/setups-history.json,
// removed) entirely, per the project owner's explicit "rebuild from zero"
// direction. Every entry here traces back to a real watchlist add: the
// entry/target/invalidation/R:R are whatever the user set manually (see
// lib/data/watchlistStore.ts's upsertWatchlistLevel), and the outcome is a
// real OHLCV bar that touched one of those two levels — nothing modelled or
// backtested.

export const PAST_SETUPS_KEY = "idxr:past-setups";

export type PastSetupOutcome = "target" | "invalidation";
export type PastSetupEntry = {
  symbol: string;
  addedAt: string;
  addedClose: number | null;
  entry: number | null;
  target: number | null;
  invalidation: number | null;
  rr: number | null;
  rrSource: "manual" | "setup" | "volume-profile" | null;
  resolvedAt: string;   // date of the bar that hit the level
  resolvedPrice: number; // the target or invalidation price itself
  outcome: PastSetupOutcome;
};

export function loadPastSetups(): PastSetupEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PAST_SETUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.symbol === "string") : [];
  } catch {
    return [];
  }
}

export function savePastSetups(entries: PastSetupEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PAST_SETUPS_KEY, JSON.stringify(entries));
  } catch {
    /* storage unavailable or full — the session keeps working in memory */
  }
}

/** Did this bar touch target or invalidation first? Checks target before
    invalidation when a single bar's range spans both (rare, but a real
    possibility on a large-range day) — an arbitrary but disclosed tie-break,
    not a hidden assumption. */
function checkBar(row: OhlcvRow, target: number | null, invalidation: number | null): PastSetupOutcome | null {
  if (target != null && row.high >= target) return "target";
  if (invalidation != null && row.low <= invalidation) return "invalidation";
  return null;
}

/** For one watchlist row with a locked-in target/invalidation, scan real
    OHLCV from the day AFTER it was added forward, looking for the first bar
    that touched either level. Returns null if neither has been hit yet (or
    there's no target/invalidation to check against). */
async function checkRowOutcome(row: WatchlistRow, marketDate: string): Promise<PastSetupEntry | null> {
  if (row.target == null && row.invalidation == null) return null;
  const payload = await loadOhlcv(marketDate, row.symbol).catch(() => null);
  const rows = (payload?.rows || []).filter((r) => r.date > row.addedAt);
  for (const bar of rows) {
    const outcome = checkBar(bar, row.target ?? null, row.invalidation ?? null);
    if (outcome) {
      return {
        symbol: row.symbol, addedAt: row.addedAt, addedClose: row.addedClose ?? null,
        entry: row.entry ?? null, target: row.target ?? null, invalidation: row.invalidation ?? null,
        rr: row.rr ?? null, rrSource: row.rrSource ?? null,
        resolvedAt: bar.date, resolvedPrice: outcome === "target" ? (row.target as number) : (row.invalidation as number),
        outcome,
      };
    }
  }
  return null;
}

/** Scan every row in every group for a target/invalidation hit; return the
    watchlist with hit rows removed, plus the new Past Setups entries for
    them. Rows with no locked-in target/invalidation (added before this
    feature, or the anchor/setup lookup failed) are left alone indefinitely —
    never silently dropped. */
export async function resolveWatchlistOutcomes(state: WatchlistState, marketDate: string): Promise<{ nextState: WatchlistState; resolved: PastSetupEntry[] }> {
  if (!marketDate) return { nextState: state, resolved: [] };
  const resolved: PastSetupEntry[] = [];
  const nextGroups = await Promise.all(state.groups.map(async (g) => {
    const kept: WatchlistRow[] = [];
    for (const row of g.rows) {
      const outcome = await checkRowOutcome(row, marketDate);
      if (outcome) resolved.push(outcome);
      else kept.push(row);
    }
    return { ...g, rows: kept };
  }));
  if (!resolved.length) return { nextState: state, resolved: [] };
  return { nextState: { ...state, groups: nextGroups }, resolved };
}
