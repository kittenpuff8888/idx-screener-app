import type { KseiPayload, ResearchBundle } from "@/lib/domain/types";
import type { MarketContextPayload, MarketInstrument } from "./marketContext";
import { latestInstrumentValue } from "./marketContext";
import { asNumber } from "@/lib/format/number";

// Market-breadth model for the IDX (klinikpenyesalan breadth study, 2026-07-27).
// Breadth is treated as DESCRIPTIVE context — it confirms the trend and reveals
// concentration, it is not a predictive/timing signal (near-zero forward
// correlation on IDX). % above the long (200-day) MA is the structural
// market-health read; % above the short (50-day) MA is near-term participation;
// the two honestly disagree in a young recovery ("80% yes, 25% no").

export type SectorBreadth = { sector: string; pct: number; n: number };
export type MarketBreadth = {
  pct200: number | null;    // share of stocks above their 200-day SMA (0..1)
  pct50: number | null;     // share above their 50-day/EMA (0..1)
  coverage: number;         // # stocks with a usable 200-day MA
  coverage50: number;       // # stocks with a usable 50-day MA (can differ from coverage — independent gates)
  sectors: SectorBreadth[]; // per IDX sector, % above 200-day, richest → thinnest
  medianRet1M: number | null; // median 1-month stock return (the "typical stock")
  ihsgRet1M: number | null;   // IHSG 1-month return (the cap-weighted index)
  regimeLabel: string;
  regimeNote: string;
};

function ihsgSeries(mc: MarketContextPayload | null): number[] {
  const inst = mc?.instruments.find((i: MarketInstrument) =>
    ["IHSG", "^JKSE"].includes((i.label || "").toUpperCase()) || ["IHSG", "^JKSE"].includes((i.symbol || "").toUpperCase()));
  return inst ? latestInstrumentValue(inst).series : [];
}

export function computeMarketBreadth(
  bundle: ResearchBundle | null,
  ksei: KseiPayload | null,
  mc: MarketContextPayload | null,
): MarketBreadth | null {
  if (!bundle?.technical?.size) return null;

  // ticker → IDX sector display name (fundamentals/technical ship "IDX Sector"
  // as "-", so classify from the KSEI registry — issuer.sector is the name).
  const sectorOf = new Map<string, string>();
  ksei?.records.forEach((r) => { if (r.sector && r.sector !== "Others") sectorOf.set(r.ticker, r.sector); });

  let n200 = 0, a200 = 0, n50 = 0, a50 = 0;
  const bySec = new Map<string, [number, number]>(); // sector → [above, total]
  bundle.technical.forEach((t, ticker) => {
    const price = asNumber(t.lastPrice);
    const ma = (t.movingAverages || {}) as Record<string, unknown>;
    const s200 = asNumber(ma.sma200), e50 = asNumber(ma.ema50);
    if (price != null && s200 != null && s200 > 0) {
      n200 += 1;
      const above = price >= s200;
      if (above) a200 += 1;
      const sec = sectorOf.get(ticker) || "Others";
      const cur = bySec.get(sec) || [0, 0];
      cur[1] += 1; if (above) cur[0] += 1;
      bySec.set(sec, cur);
    }
    if (price != null && e50 != null && e50 > 0) { n50 += 1; if (price >= e50) a50 += 1; }
  });

  const sectors = [...bySec.entries()]
    .filter(([s, [, n]]) => s !== "Others" && n >= 5)
    .map(([sector, [a, n]]) => ({ sector, pct: n ? a / n : 0, n }))
    .sort((x, y) => y.pct - x.pct);

  const pct200 = n200 ? a200 / n200 : null;
  const pct50 = n50 ? a50 / n50 : null;

  // "The index flatters the average stock": the typical (median) stock's 1-month
  // return vs the cap-weighted IHSG's — the cap-weight/equal-weight gap as a snapshot.
  const rets: number[] = [];
  bundle.fundamentals?.forEach((r) => { const v = asNumber(r["1 Month Price Returns"]); if (v != null) rets.push(v); });
  rets.sort((a, b) => a - b);
  const medianRet1M = rets.length ? rets[Math.floor(rets.length / 2)] : null;
  const ihsg = ihsgSeries(mc);
  const ihsgRet1M = ihsg.length >= 22 && ihsg[ihsg.length - 22] ? ihsg.at(-1)! / ihsg[ihsg.length - 22] - 1 : null;

  const { label: regimeLabel, note: regimeNote } = breadthRegime(pct200, pct50);
  return { pct200, pct50, coverage: n200, coverage50: n50, sectors, medianRet1M, ihsgRet1M, regimeLabel, regimeNote };
}

/** Descriptive regime read from the two breadth measures (IDX-calibrated bands).
    Exported so the panel can apply it to the liquid-universe headline. */
export function breadthRegime(pct200: number | null, pct50: number | null): { label: string; note: string } {
  const p200 = pct200 == null ? null : pct200 * 100;
  const p50 = pct50 == null ? null : pct50 * 100;
  if (p200 == null || p50 == null) return { label: "—", note: "Breadth unavailable in this snapshot." };
  if (p200 >= 50) return { label: "BROAD STRENGTH", note: "Most stocks are above both their 50- and 200-day averages — participation is wide." };
  if (p50 >= 50 && p200 < 35) return { label: "EARLY RECOVERY", note: `Near-term breadth is broad (${Math.round(p50)}% above 50-day), but ${Math.round(100 - p200)}% of stocks are still below their 200-day average — a young, structurally-incomplete recovery.` };
  if (p50 < 40 && p200 < 30) return { label: "BROADLY WEAK", note: "Both short- and long-term breadth are thin — the typical stock is in a downtrend." };
  if (p50 < 45 && p200 >= 35) return { label: "COOLING", note: "Long-term breadth is holding up but near-term participation is fading." };
  return { label: "MIXED", note: `Short-term breadth ${Math.round(p50)}%, structural breadth ${Math.round(p200)}% — the two honestly disagree.` };
}

// n200 always equals universeSize by construction (the fixed liquid universe is
// pre-filtered on having sma200); n50 is independently gated and can be smaller
// (optional — absent on points written before this field existed).
export type BreadthHistory = { universeSize: number; method: string; points: Array<{ date: string; pct200: number | null; pct50: number | null; n: number; n50?: number }> };
