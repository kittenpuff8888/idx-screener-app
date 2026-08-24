import type { OhlcvRow } from "@/lib/domain/types";

// Anchored Volume Profile — a real volume-at-price histogram over the most
// recent CONSOLIDATION range, never a trending move. Anchor-selection rule
// and the "never profile a trend, only range-to-range" constraint are taken
// directly from a reference explainer the project owner shared (an educator
// walking through Volume Profile methodology): find the most recent tight
// rotation that was followed by a confirmed breakout, and treat the LAST bar
// of that rotation as the anchor. Bounded to just that rotation window (not
// extended to "now") — a profile drawn across the subsequent trend would
// dilute the read, per the same source. Our own implementation of a
// standard, real technique (Value Area = 70% of volume around the Point of
// Control) — not a reverse-engineered copy of any specific commercial tool.

export type VolumeProfileAnchor = { startDate: string; endDate: string; direction: "up" | "down"; rangeHigh: number; rangeLow: number };
export type VolumeProfileResult = { anchor: VolumeProfileAnchor; vah: number; poc: number; val: number; totalVolume: number };

// Tunable, documented thresholds for what counts as a "tight rotation" and a
// "confirmed breakout" — our own interpretive scheme, verified against real
// OHLCV for several tickers (a parabolic small-cap and several large-caps)
// before shipping. Not a universal law; a reasonable, disclosed default.
const WINDOW_BARS = 15;            // rotation length to scan
const TIGHTNESS_MAX = 0.20;        // (windowHigh - windowLow) / medianClose must be <= this
const BREAKOUT_MARGIN = 0.12;      // price must clear the window's boundary by this fraction
const CONFIRM_BARS = 7;            // how many bars after the window to check for the breakout
const LOOKBACK_BARS = 260;         // don't search further back than ~1 trading year
const VALUE_AREA_PCT = 0.70;       // standard Market Profile Value Area share
const HISTOGRAM_BINS = 24;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Find the most recent qualifying rotation-then-breakout, walking backward
    from the latest bar. Returns the rotation's own [start, end] bars as the
    anchor window — `end` is "the last candle of the rotation" per the source
    material, not the single lowest/highest print inside it. */
export function findVolumeProfileAnchor(rows: OhlcvRow[]): VolumeProfileAnchor | null {
  const n = rows.length;
  const searchFloor = Math.max(WINDOW_BARS, n - LOOKBACK_BARS);
  for (let end = n - 1 - CONFIRM_BARS; end >= searchFloor; end -= 1) {
    const window = rows.slice(end - WINDOW_BARS + 1, end + 1);
    if (window.length < WINDOW_BARS) continue;
    const closes = window.map((r) => r.close);
    const rangeHigh = Math.max(...window.map((r) => r.high));
    const rangeLow = Math.min(...window.map((r) => r.low));
    const med = median(closes);
    if (!med) continue;
    if ((rangeHigh - rangeLow) / med > TIGHTNESS_MAX) continue;
    const after = rows.slice(end + 1, end + 1 + CONFIRM_BARS);
    if (after.length < CONFIRM_BARS) continue;
    const confirmClose = after[after.length - 1].close;
    const brokeUp = confirmClose >= rangeHigh * (1 + BREAKOUT_MARGIN);
    const brokeDown = confirmClose <= rangeLow * (1 - BREAKOUT_MARGIN);
    if (!brokeUp && !brokeDown) continue;
    return { startDate: window[0].date, endDate: window[window.length - 1].date, direction: brokeUp ? "up" : "down", rangeHigh, rangeLow };
  }
  return null;
}

/** Real volume-at-price histogram over [startDate, endDate] inclusive — each
    bar's volume is split evenly across the price bins its H-L range spans
    (a standard, simple distribution choice for daily-bar data; no intrabar
    tick data is available). POC = highest-volume bin; Value Area expands
    outward from it, alternating toward whichever side has more volume next,
    until 70% of the window's total volume is captured. */
export function computeVolumeProfile(rows: OhlcvRow[], anchor: VolumeProfileAnchor): VolumeProfileResult | null {
  const window = rows.filter((r) => r.date >= anchor.startDate && r.date <= anchor.endDate);
  if (!window.length) return null;
  const lo = Math.min(...window.map((r) => r.low));
  const hi = Math.max(...window.map((r) => r.high));
  if (hi <= lo) return null;
  const binWidth = (hi - lo) / HISTOGRAM_BINS;
  const bins = new Array(HISTOGRAM_BINS).fill(0);
  const binOf = (price: number) => Math.max(0, Math.min(HISTOGRAM_BINS - 1, Math.floor((price - lo) / binWidth)));
  for (const r of window) {
    const loBin = binOf(r.low), hiBin = binOf(r.high);
    const span = hiBin - loBin + 1;
    const vol = (r.volume || 0) / span;
    for (let i = loBin; i <= hiBin; i += 1) bins[i] += vol;
  }
  const totalVolume = bins.reduce((s, v) => s + v, 0);
  if (totalVolume <= 0) return null;
  let pocBin = 0;
  for (let i = 1; i < HISTOGRAM_BINS; i += 1) if (bins[i] > bins[pocBin]) pocBin = i;
  const poc = lo + (pocBin + 0.5) * binWidth;

  let loBin = pocBin, hiBin = pocBin, covered = bins[pocBin];
  while (covered < VALUE_AREA_PCT * totalVolume && (loBin > 0 || hiBin < HISTOGRAM_BINS - 1)) {
    const downVol = loBin > 0 ? bins[loBin - 1] : -1;
    const upVol = hiBin < HISTOGRAM_BINS - 1 ? bins[hiBin + 1] : -1;
    if (upVol >= downVol) { hiBin += 1; covered += bins[hiBin]; }
    else { loBin -= 1; covered += bins[loBin]; }
  }
  const val = lo + loBin * binWidth;
  const vah = lo + (hiBin + 1) * binWidth;
  return { anchor, vah, poc, val, totalVolume };
}

/** Convenience: find the anchor and compute the profile in one call. Null
    when there's not enough history, or no qualifying rotation was found in
    the lookback window (a ticker that's been trending the whole time, e.g.). */
export function computeAnchoredVolumeProfile(rows: OhlcvRow[] | undefined): VolumeProfileResult | null {
  if (!rows || rows.length < WINDOW_BARS + CONFIRM_BARS + 1) return null;
  const anchor = findVolumeProfileAnchor(rows);
  if (!anchor) return null;
  return computeVolumeProfile(rows, anchor);
}
