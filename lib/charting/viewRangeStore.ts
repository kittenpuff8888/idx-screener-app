// Per-ticker visible-range (zoom + pan) persistence -- localStorage only,
// same "static site, no backend" tradeoff as drawingStore.ts and the
// VWAP-anchor/study pickers. Without this the chart always reopens on its
// 3M default, discarding wherever a viewer last left it zoomed/panned to
// for this specific symbol, even across a hard refresh.
export type StoredRange = { from: string; to: string };

const KEY_PREFIX = "idxr:viewrange:";

export function loadViewRange(symbol: string): StoredRange | null {
  if (typeof window === "undefined" || !symbol) return null;
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + symbol);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.from === "string" && typeof parsed.to === "string" ? parsed : null;
  } catch {
    return null;
  }
}

export function saveViewRange(symbol: string, range: StoredRange): void {
  if (typeof window === "undefined" || !symbol) return;
  try {
    window.localStorage.setItem(KEY_PREFIX + symbol, JSON.stringify(range));
  } catch {
    // Storage full/unavailable -- the chart just falls back to the 3M
    // default next time; not worth surfacing an error for.
  }
}
