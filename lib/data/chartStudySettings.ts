"use client";

// Per-study numeric settings (length/smoothing) for the site's OWN chart
// (IndicatorCompanion.tsx, built on lightweight-charts) -- unlike the
// TradingView embed above it, this chart's indicator math is our own code
// (lib/indicators/oscillators.ts, initialBalance.ts), so every period here
// really can be edited, matching a TradingView study's own Settings dialog.
// Global, not per-ticker (same as chartStudies.ts' on/off picker) -- a
// length you set is a preference for how you read charts, not a per-symbol
// fact. Same load/save/subscribe + storage-event broadcast pattern as
// chartOverlays.ts, one JSON blob instead of one string.

export type StudySettings = {
  ema25Len: number;
  ema50Len: number;
  sma200Len: number;
  rsiLen: number;
  stochRsiLen: number;
  stochLen: number;
  stochSmoothK: number;
  stochSmoothD: number;
  volMaLen: number;
  ibDays: number;
};

export const DEFAULT_STUDY_SETTINGS: StudySettings = {
  ema25Len: 25,
  ema50Len: 50,
  sma200Len: 200,
  rsiLen: 14,
  stochRsiLen: 10,
  stochLen: 10,
  stochSmoothK: 3,
  stochSmoothD: 3,
  volMaLen: 20,
  ibDays: 2,
};

const KEY = "idxr:chart:studySettings";
const EVENT = "idxr:studySettings-changed";

export function loadStudySettings(): StudySettings {
  if (typeof window === "undefined") return DEFAULT_STUDY_SETTINGS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STUDY_SETTINGS;
    return { ...DEFAULT_STUDY_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STUDY_SETTINGS;
  }
}

export function saveStudySettings(settings: StudySettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: settings }));
}

export function subscribeStudySettings(cb: (settings: StudySettings) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => cb((e as CustomEvent<StudySettings>).detail ?? loadStudySettings());
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(loadStudySettings()); };
  window.addEventListener(EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, onCustom); window.removeEventListener("storage", onStorage); };
}
