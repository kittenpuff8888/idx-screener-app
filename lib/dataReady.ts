/**
 * The No-Bluffing Data-Readiness Contract (IMPLEMENTATION_SPEC §0).
 *
 * Every number rendered on a surface must trace to a real data field, a fetched
 * feed, or a documented derivation. When a value is missing/null/stale we never
 * invent one — we degrade to a `missing` cell carrying a human reason, and the
 * UI shows "—" / "No data" / a skeleton instead.
 *
 * There is no code path that prints a number we did not get from data.
 */

export type CellPresent<T> = { value: T; source: string; asOf: string };
export type CellMissing = { missing: true; reason: string };
export type Cell<T> = CellPresent<T> | CellMissing;

/**
 * Wrap a raw value in a Cell. Null, undefined, and NaN degrade to `missing`.
 * Empty strings and the institutional "-" placeholder also degrade — the
 * pipeline emits those for "not reported".
 */
export function cell<T>(
  value: T | null | undefined,
  source: string,
  asOf: string,
  reason = "No data",
): Cell<T> {
  const isBlank =
    value === null ||
    value === undefined ||
    (typeof value === "number" && Number.isNaN(value)) ||
    (typeof value === "string" && (value.trim() === "" || value.trim() === "-"));
  return isBlank
    ? { missing: true, reason }
    : { value: value as T, source, asOf };
}

/** Type guard: true when the cell has no backing data. */
export function isMissing<T>(c: Cell<T>): c is CellMissing {
  return (c as CellMissing).missing === true;
}

/** Type guard: true when the cell carries a real value. */
export function isPresent<T>(c: Cell<T>): c is CellPresent<T> {
  return !isMissing(c);
}

/** Read the value if present, otherwise a fallback. Never throws. */
export function cellValueOr<T>(c: Cell<T>, fallback: T): T {
  return isPresent(c) ? c.value : fallback;
}

/** A provenance caption string, e.g. "KSEI · 14 Jun 2026". */
export function provenance(source: string, asOf: string): string {
  return asOf ? `${source} · ${asOf}` : source;
}

/**
 * True when at least one cell in the set carries data. Use to decide whether a
 * whole panel should render or be hidden (§0 rule 3 "Hide").
 */
export function anyPresent(cells: Array<Cell<unknown>>): boolean {
  return cells.some(isPresent);
}
