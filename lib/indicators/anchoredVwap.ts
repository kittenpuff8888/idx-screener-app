import type { OhlcvRow } from "@/lib/domain/types";

export type VwapAnchor = "week" | "month" | "quarter" | "year";

export type AvwapPoint = { key: string; vwap: number; u1: number; l1: number; u2: number; l2: number; u3: number; l3: number };
export type AnchoredVwapResult = {
  points: (AvwapPoint | null)[]; // aligned 1:1 with rows (null until volume accrues)
  currentKey: string | null;
  prevFinalVwap: number | null;      // final VWAP of the period before the current one (PQVWAP)
  prevFinalPoint: AvwapPoint | null; // same, with the full band set — the "Previous Q/Y VWAP" profile, frozen at the prior period's last bar
};

export const VWAP_ANCHORS: Array<{ id: VwapAnchor; short: string; label: string }> = [
  { id: "week", short: "W", label: "Weekly" },
  { id: "month", short: "M", label: "Monthly" },
  { id: "quarter", short: "Q", label: "Quarterly" },
  { id: "year", short: "Y", label: "Yearly" },
];

function isoWeekKey(y: number, m: number, d: number): string {
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = (dt.getUTCDay() + 6) % 7;         // Mon=0..Sun=6
  dt.setUTCDate(dt.getUTCDate() - day + 3);       // nearest Thursday
  const firstThu = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  const week = 1 + Math.round(((dt.getTime() - firstThu.getTime()) / 86400000 - 3 + firstDay) / 7);
  return `${dt.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Anchor-period key for a YYYY-MM-DD date. Bars sharing a key belong to one
    anchored-VWAP accumulation window. */
export function periodKey(date: string, anchor: VwapAnchor): string {
  const y = +date.slice(0, 4), m = +date.slice(5, 7), d = +date.slice(8, 10);
  switch (anchor) {
    case "year": return `${y}`;
    case "quarter": return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
    case "month": return `${y}-${String(m).padStart(2, "0")}`;
    case "week": return isoWeekKey(y, m, d);
  }
}

/** Human label for the current anchor window, e.g. "Q3 '25", "Aug '25". */
export function periodLabel(key: string | null, anchor: VwapAnchor): string {
  if (!key) return "";
  const yy = `'${key.slice(2, 4)}`;
  if (anchor === "quarter") return `${key.slice(5)} ${yy}`;
  if (anchor === "year") return key;
  if (anchor === "week") return `${key.slice(5)} ${yy}`;
  const mIdx = +key.slice(5, 7) - 1;
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mIdx] || key.slice(5);
  return `${mon} ${yy}`;
}

export type VwapSource = "(H+L+C)/3" | "(H+L)/2" | "(O+H+L+C)/4" | "Close";

export const VWAP_SOURCE_FN: Record<VwapSource, (r: OhlcvRow) => number> = {
  "(H+L+C)/3": (r) => (r.high + r.low + r.close) / 3,
  "(H+L)/2": (r) => (r.high + r.low) / 2,
  "(O+H+L+C)/4": (r) => (r.open + r.high + r.low + r.close) / 4,
  "Close": (r) => r.close,
};

/**
 * Anchored VWAP with standard-deviation bands, mirroring TradingView's built-in
 * "Volume Weighted Average Price" (Pine v6): src defaults to hlc3 (overridable
 * via `source`, the VWAP Suite's own source setting), cumulation resets each
 * anchor period, σ is the volume-weighted stdev of src about the VWAP, and bands
 * are vwap ± mult·σ. Rows must be ascending by date.
 */
export function computeAnchoredVwap(rows: OhlcvRow[], anchor: VwapAnchor = "quarter", mult1 = 1, mult2 = 2, mult3 = 3, source: VwapSource = "(H+L+C)/3"): AnchoredVwapResult {
  const srcFn = VWAP_SOURCE_FN[source];
  const points: (AvwapPoint | null)[] = [];
  let curKey: string | null = null;
  let cumPV = 0, cumV = 0, cumPV2 = 0;
  let prevFinal: number | null = null;
  let prevFinalPoint: AvwapPoint | null = null;
  let lastPoint: AvwapPoint | null = null;

  for (const r of rows) {
    const key = periodKey(String(r.date), anchor);
    if (key !== curKey) {
      if (lastPoint != null) { prevFinal = lastPoint.vwap; prevFinalPoint = lastPoint; }
      curKey = key;
      cumPV = 0; cumV = 0; cumPV2 = 0;
    }
    const src = srcFn(r);
    const vol = r.volume || 0;
    cumPV += src * vol; cumV += vol; cumPV2 += src * src * vol;
    if (cumV > 0) {
      const vwap = cumPV / cumV;
      const variance = Math.max(0, cumPV2 / cumV - vwap * vwap);
      const sd = Math.sqrt(variance);
      const point: AvwapPoint = { key, vwap, u1: vwap + mult1 * sd, l1: vwap - mult1 * sd, u2: vwap + mult2 * sd, l2: vwap - mult2 * sd, u3: vwap + mult3 * sd, l3: vwap - mult3 * sd };
      points.push(point);
      lastPoint = point;
    } else {
      points.push(null);
    }
  }
  return { points, currentKey: curKey, prevFinalVwap: prevFinal, prevFinalPoint };
}
