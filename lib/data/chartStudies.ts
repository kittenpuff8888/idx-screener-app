"use client";

// Site-wide chart indicator selection. Pine Script can't run in an embedded
// TradingView chart (Pine only executes on tradingview.com), so this exposes
// TradingView's BUILT-IN studies, persists the user's choice to localStorage,
// and broadcasts changes so every chart on the site re-mounts with the same set.

export type StudyDef = {
  id: string;
  label: string;
  group: "overlay" | "oscillator" | "volume";
  /** TradingView studies_overrides key for this study's length input (lowercase
      study name + ".length", per TV's convention) -- only set for studies where
      we expose a length control, since the override key is study-specific. */
  lengthOverrideKey?: string;
  defaultLength?: number;
};

// Built-in study ids that work in the advanced-chart embed. Only ids already
// confirmed live in production are listed -- TradingView does not publish an
// authoritative id reference for this embed, and an invalid id in `studies`
// breaks the ENTIRE chart (not just that one indicator, confirmed by testing
// several plausible-looking ids against the live embed), so this list is kept
// conservative rather than guessed-and-hoped.
export const STUDIES: StudyDef[] = [
  { id: "MAExp@tv-basicstudies", label: "EMA", group: "overlay", lengthOverrideKey: "moving average exponential.length", defaultLength: 9 },
  { id: "MASimple@tv-basicstudies", label: "SMA", group: "overlay", lengthOverrideKey: "moving average.length", defaultLength: 9 },
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

// ── per-study length overrides (e.g. EMA 200 instead of TradingView's default
//    9) -- saved site-wide alongside the on/off selection above, so a custom
//    length survives a page refresh instead of resetting every time the
//    embed remounts. ──
const LENGTH_KEY = "idxr:chart:study-lengths";
const LENGTH_EVENT = "idxr:study-lengths-changed";

export function loadStudyLengths(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LENGTH_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export function saveStudyLength(id: string, length: number): void {
  if (typeof window === "undefined") return;
  const next = { ...loadStudyLengths(), [id]: length };
  window.localStorage.setItem(LENGTH_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(LENGTH_EVENT, { detail: next }));
}

export function subscribeStudyLengths(cb: (lengths: Record<string, number>) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => cb((e as CustomEvent<Record<string, number>>).detail ?? loadStudyLengths());
  const onStorage = (e: StorageEvent) => { if (e.key === LENGTH_KEY) cb(loadStudyLengths()); };
  window.addEventListener(LENGTH_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(LENGTH_EVENT, onCustom); window.removeEventListener("storage", onStorage); };
}

/** Build the studies_overrides object TradingView expects, from saved lengths. */
export function buildStudyOverrides(lengths: Record<string, number>): Record<string, number> {
  const overrides: Record<string, number> = {};
  STUDIES.forEach((s) => {
    if (s.lengthOverrideKey && lengths[s.id] != null) overrides[s.lengthOverrideKey] = lengths[s.id];
  });
  return overrides;
}
