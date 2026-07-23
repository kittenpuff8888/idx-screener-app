// Live quote overlay on top of the committed archive.
//
// The archive stays the point-in-time record; this only answers "what is the
// price right now". When live data is unavailable the UI must fall back to the
// archived close and say so — never silently mix the two, and never fabricate.

export type LiveQuote = {
  /** last traded price */
  p: number;
  /** percent change vs previous close, null when Yahoo omits it */
  c: number | null;
  /** volume */
  v: number | null;
  /** exchange timestamp, unix seconds */
  t: number | null;
};

export type LiveSnapshot = {
  fetchedAt: string;
  covered: number;
  requested: number;
  quotes: Record<string, LiveQuote>;
};

/** Set to the deployed function origin, e.g. https://<project>.vercel.app/api/live */
export const LIVE_ENDPOINT = process.env.NEXT_PUBLIC_LIVE_ENDPOINT || "";

export const LIVE_POLL_MS = 60_000;

/** IDX regular session, WIB. Outside this window the last snapshot is final. */
export function isMarketOpen(now = new Date()): boolean {
  const wib = new Date(now.getTime() + (now.getTimezoneOffset() + 420) * 60_000);
  const day = wib.getDay();
  if (day === 0 || day === 6) return false;
  const minutes = wib.getHours() * 60 + wib.getMinutes();
  return minutes >= 9 * 60 && minutes <= 16 * 60 + 30;
}

export async function fetchLive(signal?: AbortSignal): Promise<LiveSnapshot | null> {
  if (!LIVE_ENDPOINT) return null;
  try {
    const response = await fetch(LIVE_ENDPOINT, { signal, cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as LiveSnapshot;
    return data?.quotes ? data : null;
  } catch {
    return null; // degrade to archived values rather than showing nothing
  }
}

/** Age of a snapshot in seconds, for the freshness indicator. */
export function snapshotAgeSeconds(snapshot: LiveSnapshot | null): number | null {
  if (!snapshot?.fetchedAt) return null;
  return Math.max(0, Math.round((Date.now() - new Date(snapshot.fetchedAt).getTime()) / 1000));
}

/**
 * Overlay live prices onto archived rows.
 *
 * Rows keep their archived values and gain `livePrice` / `liveChange` / `isLive`
 * so the UI can render the live figure while still showing what was archived.
 */
export function applyLive<T extends { ticker: string }>(
  rows: T[],
  snapshot: LiveSnapshot | null
): (T & { livePrice?: number; liveChange?: number | null; liveAt?: number | null; isLive: boolean })[] {
  return rows.map((row) => {
    const quote = snapshot?.quotes?.[row.ticker.toUpperCase()];
    if (!quote) return { ...row, isLive: false };
    return {
      ...row,
      livePrice: quote.p,
      liveChange: quote.c,
      liveAt: quote.t,
      isLive: true,
    };
  });
}
