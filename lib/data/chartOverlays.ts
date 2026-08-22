"use client";

// Custom chart overlays — indicators that CANNOT run inside the TradingView
// embed (Pine Script only executes on tradingview.com). Enabling one reveals a
// small companion candle chart, drawn from our own published OHLCV JSON, beneath
// the embed. This store runs parallel to chartStudies (TV built-ins): same
// localStorage + broadcast pattern, so the ƒx picker can toggle both and every
// companion chart on the page reacts.

export type OverlayDef = { id: string; label: string; note: string };

// Custom Pine indicators re-implemented on our own chart. Growable — IBH/IBL is
// the first; MACD-4C / IBH-IBL / SMC follow the same shape.
export const OVERLAYS: OverlayDef[] = [
  {
    id: "ibhl",
    label: "IBH / IBL · Initial Balance",
    note: "Monthly initial-balance band — the high/low of each month's first 2 sessions, locked for the rest of the month (TSR × BuayaSerpong, Pine v6).",
  },
  {
    id: "macd4c",
    label: "MACD 4C Smooth",
    note: "MACD (12/26/9) with an EMA-smoothed histogram and 4-colour momentum states — silver ≥0 rising, red ≥0 falling, bright-red <0 falling, blue <0 rising. Drawn in an oscillator sub-pane below the candles.",
  },
  {
    id: "avwap",
    label: "Anchored VWAP + σ bands",
    note: "Anchored VWAP (default Quarterly) with ±1σ / ±2σ bands on hlc3 volume, plus the previous period's VWAP (PQVWAP). Pick the anchor (W/M/Q/Y) on the companion chart.",
  },
];

// Anchor period for the anchored-VWAP overlay (persisted, broadcast like overlays).
const ANCHOR_KEY = "idxr:chart:vwapAnchor";
const ANCHOR_EVENT = "idxr:vwapAnchor-changed";
const ANCHOR_DEFAULT = "quarter";

export function loadVwapAnchor(): string {
  if (typeof window === "undefined") return ANCHOR_DEFAULT;
  return window.localStorage.getItem(ANCHOR_KEY) || ANCHOR_DEFAULT;
}
export function saveVwapAnchor(anchor: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ANCHOR_KEY, anchor);
  window.dispatchEvent(new CustomEvent(ANCHOR_EVENT, { detail: anchor }));
}
export function subscribeVwapAnchor(cb: (anchor: string) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => cb((e as CustomEvent<string>).detail ?? loadVwapAnchor());
  const onStorage = (e: StorageEvent) => { if (e.key === ANCHOR_KEY) cb(loadVwapAnchor()); };
  window.addEventListener(ANCHOR_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(ANCHOR_EVENT, onCustom); window.removeEventListener("storage", onStorage); };
}

const KEY = "idxr:chart:overlays";
const EVENT = "idxr:overlays-changed";
const DEFAULT: string[] = [];

export function loadOverlays(): string[] {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function saveOverlays(ids: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(ids));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: ids }));
}

/** Subscribe to overlay changes (same tab + other tabs). Returns unsubscribe. */
export function subscribeOverlays(cb: (ids: string[]) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => cb((e as CustomEvent<string[]>).detail ?? loadOverlays());
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(loadOverlays()); };
  window.addEventListener(EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, onCustom); window.removeEventListener("storage", onStorage); };
}
