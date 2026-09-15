"use client";

// Per-study settings (numeric inputs, colors, fill toggles) for the site's
// OWN chart (IndicatorCompanion.tsx, built on lightweight-charts) -- unlike
// the TradingView embed above it, this chart's indicator math and rendering
// are our own code (lib/indicators/*, lib/charting/drawings/*), so every one
// of these really is editable, matching a TradingView study's own Settings
// dialog (Inputs / Style / Visibility tabs). Global, not per-ticker (same as
// chartStudies.ts' on/off picker) -- these are a preference for how you read
// charts, not a per-symbol fact. Same load/save/subscribe + storage-event
// broadcast pattern as chartOverlays.ts, one JSON blob instead of one string.
//
// `hidden` (per-indicator eye-toggle visibility, distinct from `settings`)
// lives in this same module as a second, identically-shaped load/save/
// subscribe pair -- it's the same kind of global per-viewer preference, just
// a different key so toggling visibility doesn't rewrite the whole settings
// blob and vice versa.

export type StudySettings = {
  volMaLen: number;
  volMaWidth: number;
  ibDays: number;
  sma200Len: number;
  rsiLen: number;
  rsiMaLen: number;
  rsiUpper: number;
  rsiLower: number;
  ribbon1Len: number;
  ribbon2Len: number;
  ribbonWidth: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  macdSmooth: number;
  stochSmoothK: number;
  stochSmoothD: number;
  stochRsiLen: number;
  stochLen: number;
  stochUpper: number;
  stochLower: number;
  vwapAnchor: "week" | "month" | "quarter" | "year";
  vwapSource: "(H+L+C)/3" | "(H+L)/2" | "(O+H+L+C)/4" | "Close";
  vwapColor: string;
  vwapWidth: number;
  vwapMult1: number;
  vwapMult2: number;
  vwapBands: boolean;
  vwapLines: boolean;
  vwapText: boolean;
  ibColor: string;
  ibFill: boolean;
  ibWidth: number;
  volUpColor: string;
  volDnColor: string;
  volMaColor: string;
  ribbonColor: string;
  smaColor: string;
  smaWidth: number;
  rsiColor: string;
  rsiMaColor: string;
  rsiWidth: number;
  rsiMaWidth: number;
  rsiFill: boolean;
  macdColor: string;
  macdSignalColor: string;
  macdWidth: number;
  macdSignalWidth: number;
  macdHistUp: string;
  macdHistDn: string;
  stochKColor: string;
  stochDColor: string;
  stochKWidth: number;
  stochDWidth: number;
  stochFill: boolean;
};

export const DEFAULT_STUDY_SETTINGS: StudySettings = {
  volMaLen: 20, volMaWidth: 1, ibDays: 2, sma200Len: 200,
  rsiLen: 10, rsiMaLen: 14, rsiUpper: 60, rsiLower: 20,
  ribbon1Len: 25, ribbon2Len: 50, ribbonWidth: 1,
  macdFast: 12, macdSlow: 26, macdSignal: 9, macdSmooth: 3,
  stochSmoothK: 3, stochSmoothD: 3, stochRsiLen: 10, stochLen: 10, stochUpper: 80, stochLower: 20,
  vwapAnchor: "quarter", vwapSource: "(H+L+C)/3", vwapColor: "#787b86", vwapWidth: 2,
  vwapMult1: 1, vwapMult2: 2,
  vwapBands: true, vwapLines: true, vwapText: true,
  ibColor: "#D6A100", ibFill: true, ibWidth: 1,
  volUpColor: "#2962FF", volDnColor: "#969ba5", volMaColor: "#2962FF",
  ribbonColor: "#2962FF", smaColor: "#FF9800", smaWidth: 2,
  rsiColor: "#2962FF", rsiMaColor: "#FF5050", rsiWidth: 1, rsiMaWidth: 1, rsiFill: true,
  macdColor: "#2962FF", macdSignalColor: "#FF5050", macdWidth: 1, macdSignalWidth: 1,
  macdHistUp: "#2962FF", macdHistDn: "#FF5050",
  stochKColor: "#2962FF", stochDColor: "#FF9800", stochKWidth: 1, stochDWidth: 1, stochFill: true,
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

// ---- Per-indicator visibility (the legend row's own eye toggle) ----------

export type StudyId = "volume" | "vwap" | "ib" | "ribbon" | "sma200" | "rsi" | "macd" | "stoch";
export type HiddenMap = Record<StudyId, boolean>;

export const DEFAULT_HIDDEN: HiddenMap = {
  volume: false, vwap: false, ib: false, ribbon: true, sma200: true, rsi: false, macd: false, stoch: false,
};

const HIDDEN_KEY = "idxr:chart:studyHidden";
const HIDDEN_EVENT = "idxr:studyHidden-changed";

export function loadHiddenMap(): HiddenMap {
  if (typeof window === "undefined") return DEFAULT_HIDDEN;
  try {
    const raw = window.localStorage.getItem(HIDDEN_KEY);
    if (!raw) return DEFAULT_HIDDEN;
    return { ...DEFAULT_HIDDEN, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_HIDDEN;
  }
}

export function saveHiddenMap(hidden: HiddenMap): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
  window.dispatchEvent(new CustomEvent(HIDDEN_EVENT, { detail: hidden }));
}

export function subscribeHiddenMap(cb: (hidden: HiddenMap) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = (e: Event) => cb((e as CustomEvent<HiddenMap>).detail ?? loadHiddenMap());
  const onStorage = (e: StorageEvent) => { if (e.key === HIDDEN_KEY) cb(loadHiddenMap()); };
  window.addEventListener(HIDDEN_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(HIDDEN_EVENT, onCustom); window.removeEventListener("storage", onStorage); };
}
