// Per-ticker drawing persistence -- localStorage only (this is a static
// site with no backend/database; matches the pattern already used for the
// VWAP anchor and chart-studies picker). Drawings for a symbol are gone if
// the browser's storage is cleared, same tradeoff as those other pickers.
export type StoredPoint = { time: string; price: number };
export type StoredDrawing =
  | { id: string; type: "trend"; a: StoredPoint; b: StoredPoint }
  | { id: string; type: "hline"; price: number }
  | { id: string; type: "fib"; a: StoredPoint; b: StoredPoint }
  | { id: string; type: "rect"; a: StoredPoint; b: StoredPoint };

const KEY_PREFIX = "idxr:drawings:";

export function loadDrawings(symbol: string): StoredDrawing[] {
  if (typeof window === "undefined" || !symbol) return [];
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + symbol);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveDrawings(symbol: string, drawings: StoredDrawing[]): void {
  if (typeof window === "undefined" || !symbol) return;
  try {
    window.localStorage.setItem(KEY_PREFIX + symbol, JSON.stringify(drawings));
  } catch {
    // Storage full or unavailable (private browsing) -- drawings just won't
    // persist across reloads; not worth surfacing an error for.
  }
}
