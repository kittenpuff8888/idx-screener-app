import type { OhlcvRow } from "@/lib/domain/types";

export type IbBand = {
  monthKey: string;   // "YYYY-MM"
  startIdx: number;   // row index where the month begins (inclusive)
  endIdx: number;     // row index where the month ends (inclusive)
  ibHigh: number;     // max high across the month's first `ibDays` sessions
  ibLow: number;      // min low across the same
  locked: boolean;    // true once `ibDays` sessions elapsed (band frozen)
};

/**
 * Monthly Initial Balance (IBH / IBL).
 *
 * For each calendar month the IB range is the high/low across that month's first
 * `ibDays` trading sessions; after that it locks and the band holds for the rest
 * of the month. This mirrors the "TSR × BuayaSerpong (IBH ~ IBL)" Pine v6 study
 * (Initial Balance Days = 2), computed from daily EOD bars — no intraday needed.
 *
 * Rows must be in ascending date order (the pipeline publishes them sorted).
 */
export function computeInitialBalance(rows: OhlcvRow[], ibDays = 2): IbBand[] {
  const days = Math.max(1, Math.floor(ibDays));
  const bands: IbBand[] = [];
  let cur: IbBand | null = null;
  let sessions = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const key = String(row.date).slice(0, 7); // YYYY-MM
    if (!cur || cur.monthKey !== key) {
      if (cur) bands.push(cur);
      cur = { monthKey: key, startIdx: i, endIdx: i, ibHigh: row.high, ibLow: row.low, locked: days <= 1 };
      sessions = 1;
      continue;
    }
    sessions += 1;
    cur.endIdx = i;
    if (!cur.locked) {
      cur.ibHigh = Math.max(cur.ibHigh, row.high);
      cur.ibLow = Math.min(cur.ibLow, row.low);
      if (sessions >= days) cur.locked = true;
    }
  }
  if (cur) bands.push(cur);
  return bands;
}
