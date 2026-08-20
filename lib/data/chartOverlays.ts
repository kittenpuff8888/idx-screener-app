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
];

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
