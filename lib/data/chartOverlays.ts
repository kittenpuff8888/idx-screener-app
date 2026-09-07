"use client";

// Custom chart overlays — indicators that CANNOT run inside the TradingView
// embed (Pine Script only executes on tradingview.com). Always drawn on the
// companion candle chart beneath the embed, for every ticker — no on/off
// toggle: the ƒx picker on the price chart controls TradingView's own
// built-in studies only (see lib/data/chartStudies.ts). Exactly two
// overlays: IBH/IBL (monthly Initial Balance) and Anchored VWAP + σ bands.

// Anchor period for the anchored-VWAP overlay (persisted, broadcast across tabs).
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
