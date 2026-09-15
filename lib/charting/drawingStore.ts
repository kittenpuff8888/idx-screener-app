// Per-ticker drawing persistence -- localStorage only (this is a static
// site with no backend/database; matches the pattern already used for the
// VWAP anchor and chart-studies picker). Drawings for a symbol are gone if
// the browser's storage is cleared, same tradeoff as those other pickers --
// so the stored shape can evolve freely between sessions with no migration
// step: an old, differently-shaped record for a `type` that no longer
// exists is simply never restored (DrawingTool.place() ignores unknown
// types), not a compatibility break worth guarding against.
export type StoredPoint = { time: string; price: number };
// "range"'s three sub-variants share one segment+label shape, differing
// only in what the label reads (measure: price/%/bars; price: price/%
// only; date: bar count only; dateprice: both) -- one stored type instead
// of four avoids duplicating the same two points for a cosmetic difference.
export type RangeVariant = "measure" | "price" | "date" | "dateprice";

export type StoredDrawing =
  | { id: string; type: "trend"; a: StoredPoint; b: StoredPoint }
  | { id: string; type: "ray"; a: StoredPoint; b: StoredPoint }
  | { id: string; type: "extended"; a: StoredPoint; b: StoredPoint }
  | { id: string; type: "hline"; price: number }
  | { id: string; type: "vline"; at: StoredPoint }
  | { id: string; type: "crossline"; at: StoredPoint }
  | { id: string; type: "fib"; a: StoredPoint; b: StoredPoint }
  | { id: string; type: "rect"; a: StoredPoint; b: StoredPoint }
  | { id: string; type: "range"; variant: RangeVariant; a: StoredPoint; b: StoredPoint; barCount: number }
  | { id: string; type: "position"; dir: 1 | -1; a: StoredPoint; b: StoredPoint; entry: number; target: number; stop: number }
  | { id: string; type: "avwap"; at: StoredPoint }
  | { id: string; type: "text"; at: StoredPoint; text: string };

// Common styling every stored drawing carries once selectable/restylable
// (color/width/style), stored alongside the geometry above rather than
// folded into the union so every branch gets it without repeating it.
export type DrawingStyle = { color: string; width: number; style: "solid" | "dashed" | "dotted" };
export type StoredRecord = StoredDrawing & Partial<DrawingStyle>;

const KEY_PREFIX = "idxr:drawings:";

export function loadDrawings(symbol: string): StoredRecord[] {
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

export function saveDrawings(symbol: string, drawings: StoredRecord[]): void {
  if (typeof window === "undefined" || !symbol) return;
  try {
    window.localStorage.setItem(KEY_PREFIX + symbol, JSON.stringify(drawings));
  } catch {
    // Storage full or unavailable (private browsing) -- drawings just won't
    // persist across reloads; not worth surfacing an error for.
  }
}
