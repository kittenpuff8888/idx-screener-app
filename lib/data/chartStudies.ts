"use client";

// Site-wide chart indicator selection. Pine Script can't run in an embedded
// TradingView chart (Pine only executes on tradingview.com), so this exposes
// TradingView's BUILT-IN studies, persists the user's choice to localStorage,
// and broadcasts changes so every chart on the site re-mounts with the same set.

export type StudyDef = { id: string; label: string; group: "overlay" | "oscillator" | "volume" };

// Built-in study ids that work in the advanced-chart embed.
export const STUDIES: StudyDef[] = [
  { id: "MAExp@tv-basicstudies", label: "EMA", group: "overlay" },
  { id: "MASimple@tv-basicstudies", label: "SMA", group: "overlay" },
  { id: "VWAP@tv-basicstudies", label: "VWAP", group: "overlay" },
  { id: "BB@tv-basicstudies", label: "Bollinger Bands", group: "overlay" },
  { id: "IchimokuCloud@tv-basicstudies", label: "Ichimoku Cloud", group: "overlay" },
  { id: "PivotPointsStandard@tv-basicstudies", label: "Pivot Points", group: "overlay" },
  { id: "RSI@tv-basicstudies", label: "RSI", group: "oscillator" },
  { id: "MACD@tv-basicstudies", label: "MACD", group: "oscillator" },
  { id: "Stochastic@tv-basicstudies", label: "Stochastic", group: "oscillator" },
  { id: "ADX@tv-basicstudies", label: "ADX / DMI", group: "oscillator" },
  { id: "ATR@tv-basicstudies", label: "ATR", group: "oscillator" },
  { id: "Volume@tv-basicstudies", label: "Volume", group: "volume" },
  { id: "CCI@tv-basicstudies", label: "CCI", group: "oscillator" },
  { id: "MF@tv-basicstudies", label: "Money Flow", group: "oscillator" },
];

const KEY = "idxr:chart:studies";
const EVENT = "idxr:studies-changed";
const DEFAULT = ["MAExp@tv-basicstudies", "VWAP@tv-basicstudies"];

export function loadStudies(): string[] {
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

export function saveStudies(ids: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(ids));
  // Notify every chart on the page (storage event only fires cross-tab).
  window.dispatchEvent(new CustomEvent(EVENT, { detail: ids }));
}

/** Subscribe to site-wide study changes (same tab + other tabs). Returns an
    unsubscribe fn. */
export function subscribeStudies(cb: (ids: string[]) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => cb((e as CustomEvent<string[]>).detail ?? loadStudies());
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(loadStudies()); };
  window.addEventListener(EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, onCustom); window.removeEventListener("storage", onStorage); };
}
