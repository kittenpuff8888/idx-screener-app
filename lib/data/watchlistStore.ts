import type { OhlcvRow } from "@/lib/domain/types";

/** Watchlist groups + rows, persisted locally (DESIGN_SPEC §3.4, §5).
    Nothing is seeded — a fresh install has zero groups by design. */

export const WATCHLIST_KEY = "idxr:watchlist";

export type WatchlistRow = {
  symbol: string;
  /** ISO date the row was added, and the close at that moment. Storing the
      close is what makes SINCE ADDED a real measured number rather than a
      modelled one — without it there is nothing to measure against. */
  addedAt: string;
  addedClose: number | null;
};

export type WatchlistGroup = {
  id: string;
  name: string;
  rows: WatchlistRow[];
};

export type WatchlistState = {
  groups: WatchlistGroup[];
  activeGroupId: string | null;
  selectedSymbol: string | null;
};

export const EMPTY_STATE: WatchlistState = { groups: [], activeGroupId: null, selectedSymbol: null };

export function loadWatchlist(): WatchlistState {
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return EMPTY_STATE;
    const parsed = JSON.parse(raw) as Partial<WatchlistState>;
    const groups = Array.isArray(parsed.groups) ? parsed.groups.filter(isGroup) : [];
    const activeGroupId = groups.some((g) => g.id === parsed.activeGroupId) ? parsed.activeGroupId! : groups[0]?.id ?? null;
    return {
      groups,
      activeGroupId,
      selectedSymbol: typeof parsed.selectedSymbol === "string" ? parsed.selectedSymbol : null,
    };
  } catch {
    return EMPTY_STATE;
  }
}

export function saveWatchlist(state: WatchlistState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable or full — the session keeps working in memory */
  }
}

function isGroup(g: unknown): g is WatchlistGroup {
  if (!g || typeof g !== "object") return false;
  const c = g as WatchlistGroup;
  return typeof c.id === "string" && typeof c.name === "string" && Array.isArray(c.rows);
}

export function newGroupId(): string {
  return `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* ── Returns computed from real bars ─────────────────────────────────────────
   Every figure below is measured off the OHLCV series the pipeline publishes.
   When the series does not reach far enough back, the caller renders `no data`
   rather than extrapolating — see the table footnote and Data Health. */

/** Close on the last bar at or before `target`. Returns null when the series
    starts after `target` — the lookback is longer than our coverage, so the
    honest answer is "no data", not the oldest bar we happen to hold. */
function closeOnOrBefore(rows: OhlcvRow[], target: string): number | null {
  let found: number | null = null;
  for (const row of rows) {
    if (row.date <= target) found = row.close;
    else break;
  }
  return found;
}

function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export type WatchlistMetrics = {
  close: number | null;
  d1: number | null;
  w1: number | null;
  m1: number | null;
  m3: number | null;
  ytd: number | null;
  /** Highest high in the published series, with the date coverage starts so the
      UI can say "since <date>" instead of implying a true all-time high. */
  high: number | null;
  highSince: string | null;
};

function pctChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || from === 0) return null;
  return ((to - from) / from) * 100;
}

export function computeMetrics(rows: OhlcvRow[]): WatchlistMetrics {
  const empty: WatchlistMetrics = { close: null, d1: null, w1: null, m1: null, m3: null, ytd: null, high: null, highSince: null };
  if (!rows.length) return empty;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  const asOf = last.date;
  const prev = sorted.length > 1 ? sorted[sorted.length - 2].close : null;
  const year = asOf.slice(0, 4);

  // YTD convention: measure from the prior year's final close when we hold it.
  // Published coverage starts 2026-01-01, so for the current year we usually do
  // not — fall back to the first bar of the year and say so in the footnote.
  const priorYearClose = closeOnOrBefore(sorted, `${year}-01-01`);
  const firstBarOfYear = sorted.find((r) => r.date.slice(0, 4) === year);
  const ytdBase = priorYearClose ?? firstBarOfYear?.close ?? null;

  return {
    close: last.close,
    d1: pctChange(prev, last.close),
    w1: pctChange(closeOnOrBefore(sorted, shiftDays(asOf, 7)), last.close),
    m1: pctChange(closeOnOrBefore(sorted, shiftDays(asOf, 30)), last.close),
    m3: pctChange(closeOnOrBefore(sorted, shiftDays(asOf, 91)), last.close),
    ytd: pctChange(ytdBase, last.close),
    high: sorted.reduce((max, r) => (r.high > max ? r.high : max), sorted[0].high),
    highSince: sorted[0].date,
  };
}
