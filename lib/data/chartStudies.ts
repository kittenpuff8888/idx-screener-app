"use client";

// Site-wide chart indicator selection. Pine Script can't run in an embedded
// TradingView chart (Pine only executes on tradingview.com), so this exposes
// TradingView's BUILT-IN studies, persists the user's choice to localStorage,
// and broadcasts changes so every chart on the site re-mounts with the same
// set. No LIVE-TYPED per-study length input here (deliberately) -- that was
// tried once and reliably broke the embed: typing into a length input fires
// a chart rebuild on every keystroke, and rapid rebuilds from fast typing can
// race the container-teardown TradingViewChart.tsx guards against. Toggling
// a study on/off is a single discrete click, not a rebuild storm, so it's
// safe under the same guards -- and that's exactly what a STATIC baked-in
// `inputs` override is too (a fixed value picked once in code, never typed),
// so a few entries below carry one.
//
// The override key format is undocumented and inconsistent per study --
// found only by testing against the live embed, one isolated study at a
// time (same rule as `id` below: guessing in a batch risks misreading which
// change did what). What worked: the exact UI label text as it appears in
// that study's own Settings dialog ("length" lowercase for the two Moving
// Average studies; "K"/"D"/"RSI Length"/"Stochastic Length" for Stochastic
// RSI). Confirmed NOT overridable through this surface at all: plain RSI's
// own length (tried "RSI Length", "Length", "length", and positional
// "in_0" -- none apply, it stays fixed at 14 every time) -- so RSI(10) as
// its own chart indicator isn't achievable here; the Screener's RSI
// Divergence buttons compute RSI(10, EMA) correctly server-side regardless,
// this limitation is purely cosmetic (what number this one indicator shows
// on this one chart).
export type StudyDef = {
  id: string;
  /** Underlying TradingView study id sent in the `studies` array. Defaults
      to `id` when omitted -- only differs when two picker entries share one
      study with different `inputs` (e.g. EMA 25 and EMA 50 both resolve to
      MAExp@tv-basicstudies). */
  tvId?: string;
  /** Static input override, `{id, inputs}` instead of a bare id string.
      Fixed at build time, never edited by the user -- see the file-level
      note on why that's safe where a live-typed input wasn't. */
  inputs?: Record<string, number | string>;
  label: string;
  group: "overlay" | "oscillator" | "volume" | "technical-other";
};

// Built-in study ids that work in the advanced-chart embed. Only ids already
// confirmed live in production are listed -- TradingView does not publish an
// authoritative id reference for this embed, and an invalid id in `studies`
// breaks the ENTIRE chart (not just that one indicator, confirmed by testing
// several plausible-looking ids against the live embed), so this list is kept
// conservative rather than guessed-and-hoped.
export const STUDIES: StudyDef[] = [
  { id: "ema25", tvId: "MAExp@tv-basicstudies", inputs: { length: 25 }, label: "EMA 25", group: "overlay" },
  { id: "ema50", tvId: "MAExp@tv-basicstudies", inputs: { length: 50 }, label: "EMA 50", group: "overlay" },
  { id: "sma200", tvId: "MASimple@tv-basicstudies", inputs: { length: 200 }, label: "SMA 200", group: "overlay" },
  { id: "VWAP@tv-basicstudies", label: "VWAP", group: "overlay" },
  { id: "BB@tv-basicstudies", label: "Bollinger Bands", group: "overlay" },
  { id: "IchimokuCloud@tv-basicstudies", label: "Ichimoku Cloud", group: "overlay" },
  { id: "PivotPointsStandard@tv-basicstudies", label: "Pivot Points", group: "overlay" },
  { id: "RSI@tv-basicstudies", label: "RSI (14 -- length fixed, see note above)", group: "oscillator" },
  { id: "MACD@tv-basicstudies", label: "MACD", group: "oscillator" },
  { id: "Stochastic@tv-basicstudies", label: "Stochastic", group: "oscillator" },
  { id: "ADX@tv-basicstudies", label: "ADX / DMI", group: "oscillator" },
  { id: "ATR@tv-basicstudies", label: "ATR", group: "oscillator" },
  { id: "Volume@tv-basicstudies", label: "Volume", group: "volume" },
  { id: "CCI@tv-basicstudies", label: "CCI", group: "oscillator" },
  { id: "MF@tv-basicstudies", label: "Money Flow", group: "oscillator" },

  // "Technical Others" -- each id below was individually verified against the
  // live embed (isolated, one at a time -- a bad id breaks the whole chart,
  // not just itself, so batch-guessing is unsafe). No "Fundamental Others"
  // group exists: this embed's `studies` array only ever reaches technical
  // studies -- TradingView's fundamentals overlays aren't addressable this
  // way in the free widget, confirmed by testing, not assumed. Real
  // fundamentals (Market Cap, ROE, PE, ...) live on the ticker page's own
  // Key Statistics / DCF sections instead, sourced from our own pipeline.
  { id: "ROC@tv-basicstudies", label: "Rate of Change", group: "technical-other" },
  {
    id: "stochRsi10_3_3", tvId: "StochasticRSI@tv-basicstudies",
    inputs: { K: 3, D: 3, "RSI Length": 10, "Stochastic Length": 10 },
    label: "Stoch RSI (10, 10, 3, 3)", group: "technical-other",
  },
  { id: "BalanceOfPower@tv-basicstudies", label: "Balance of Power", group: "technical-other" },
  { id: "ChoppinessIndex@tv-basicstudies", label: "Choppiness Index", group: "technical-other" },
  { id: "CMO@tv-basicstudies", label: "Chande Momentum Oscillator", group: "technical-other" },
  { id: "DonchianChannels@tv-basicstudies", label: "Donchian Channels", group: "technical-other" },
  { id: "DoubleEMA@tv-basicstudies", label: "Double EMA", group: "technical-other" },
  { id: "TripleEMA@tv-basicstudies", label: "Triple EMA", group: "technical-other" },
  { id: "EldersForceIndex@tv-basicstudies", label: "Elder's Force Index", group: "technical-other" },
  { id: "Envelope@tv-basicstudies", label: "Envelopes", group: "technical-other" },
  { id: "HullMA@tv-basicstudies", label: "Hull Moving Average", group: "technical-other" },
];

// Ids individually tested against the live embed and confirmed INVALID --
// each one, alone, broke the whole chart (all-zero OHLC). Kept here so a
// future session doesn't re-waste time re-testing the same guesses:
// AccumulationDistribution@tv-basicstudies, AwesomeOscillator@tv-basicstudies,
// ChaikinMoneyFlow@tv-basicstudies, KeltnerChannels@tv-basicstudies.

// Confirmed live against the embed: 6 simultaneous studies renders fine, 7
// breaks the entire chart (all-zero OHLC, not just a dropped indicator).
// TradingView doesn't document this cap for the free widget; found by
// bisecting combined-study-count tests directly against production.
export const MAX_STUDIES = 6;

const KEY = "idxr:chart:studies";
const EVENT = "idxr:studies-changed";
const DEFAULT = ["ema25", "ema50", "sma200", "stochRsi10_3_3"];

const STUDY_BY_ID: Record<string, StudyDef> = Object.fromEntries(STUDIES.map((s) => [s.id, s]));

/** Resolve a picker id (localStorage value, e.g. "ema25") to what
    TradingView's `studies` array actually needs -- a bare id string, or an
    `{id, inputs}` object for an entry carrying a static override. Unknown
    ids (a stale localStorage value from a picker entry that no longer
    exists) pass through as bare strings rather than being dropped, since an
    unrecognized-but-harmless string is safer than silently changing what
    the user had selected. */
export function resolveStudy(pickerId: string): string | { id: string; inputs: Record<string, number | string> } {
  const def = STUDY_BY_ID[pickerId];
  if (!def) return pickerId;
  if (!def.inputs) return def.tvId ?? def.id;
  return { id: def.tvId ?? def.id, inputs: def.inputs };
}

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
