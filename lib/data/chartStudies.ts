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
// RSI). Confirmed NOT overridable through this surface at all:
//   - Plain RSI's own length (tried "RSI Length", "Length", "length",
//     positional "in_0") and its built-in MA-smoothing sub-inputs (tried
//     "Type"/"MA Type" + "Length"/"MA Length") -- neither applies, RSI
//     stays fixed at length 14 with no smoothing line every time. RSI(10)
//     (EMA- or any-smoothed) isn't achievable as its own chart indicator
//     here; the Screener's RSI Divergence buttons compute RSI(10, EMA)
//     correctly server-side regardless, this limitation is purely cosmetic
//     (what number this one indicator shows on this one chart).
//   - Per-study line/plot COLOR. Six different mechanisms were tried
//     against the live embed and every one either did nothing (chart
//     rendered, color stayed the study's built-in default) or broke the
//     study/chart entirely: per-study `styles: {plot_0: {...}}`, `styles`
//     keyed by lowercase/capitalized plot name ("plot"/"Plot"/"sma"),
//     Stoch RSI's own line names ("%K"/"%D"/"k"/"d"), a per-study
//     `overrides: {"Plot.color": ...}` key, and both a top-level
//     `overrides` and a top-level `studies_overrides` config field (the
//     latter two threw "[object Object] is not valid JSON" and suppressed
//     the indicator's legend/line entirely, not just the color). This
//     lightweight public embed appears to expose only `id` + `inputs` per
//     study, nothing for per-line visual styling -- a chart's colors are
//     whatever that study's own built-in default palette is.
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

// Deliberately pared down to exactly these 6 -- MAX_STUDIES below is also 6,
// so the picker never has anything left to add beyond this set anyway. Ids
// already confirmed live in production; TradingView does not publish an
// authoritative id reference for this embed, and an invalid id in `studies`
// breaks the ENTIRE chart (not just that one indicator, confirmed by testing
// several plausible-looking ids against the live embed), so any future
// addition here should be tested in isolation first, same as these were.
export const STUDIES: StudyDef[] = [
  { id: "ema25", tvId: "MAExp@tv-basicstudies", inputs: { length: 25 }, label: "EMA 25", group: "overlay" },
  { id: "ema50", tvId: "MAExp@tv-basicstudies", inputs: { length: 50 }, label: "EMA 50", group: "overlay" },
  { id: "sma200", tvId: "MASimple@tv-basicstudies", inputs: { length: 200 }, label: "SMA 200", group: "overlay" },
  { id: "Volume@tv-basicstudies", label: "Volume", group: "volume" },
  { id: "RSI@tv-basicstudies", label: "RSI (14 -- length fixed, see note above)", group: "oscillator" },
  {
    id: "stochRsi10_3_3", tvId: "StochasticRSI@tv-basicstudies",
    inputs: { K: 3, D: 3, "RSI Length": 10, "Stochastic Length": 10 },
    label: "Stoch RSI (10, 10, 3, 3)", group: "technical-other",
  },
];

// Ids individually tested against the live embed and confirmed INVALID --
// each one, alone, broke the whole chart (all-zero OHLC). Kept here so a
// future session doesn't re-waste time re-testing the same guesses:
// AccumulationDistribution@tv-basicstudies, AwesomeOscillator@tv-basicstudies,
// ChaikinMoneyFlow@tv-basicstudies, KeltnerChannels@tv-basicstudies.
//
// Other ids confirmed VALID and working (rendered correctly, just dropped
// from the picker above to keep it to the requested 6): VWAP@tv-basicstudies,
// BB@tv-basicstudies, IchimokuCloud@tv-basicstudies,
// PivotPointsStandard@tv-basicstudies, MACD@tv-basicstudies,
// Stochastic@tv-basicstudies, ADX@tv-basicstudies, ATR@tv-basicstudies,
// CCI@tv-basicstudies, MF@tv-basicstudies, ROC@tv-basicstudies,
// BalanceOfPower@tv-basicstudies, ChoppinessIndex@tv-basicstudies,
// CMO@tv-basicstudies, DonchianChannels@tv-basicstudies,
// DoubleEMA@tv-basicstudies, TripleEMA@tv-basicstudies,
// EldersForceIndex@tv-basicstudies, Envelope@tv-basicstudies,
// HullMA@tv-basicstudies -- add any of these back to STUDIES above (and
// swap one out, or raise MAX_STUDIES with care) rather than re-testing.

// Confirmed live against the embed: 6 simultaneous studies renders fine, 7
// breaks the entire chart (all-zero OHLC, not just a dropped indicator).
// TradingView doesn't document this cap for the free widget; found by
// bisecting combined-study-count tests directly against production.
export const MAX_STUDIES = 6;

const KEY = "idxr:chart:studies";
const EVENT = "idxr:studies-changed";
// All 6 available studies, active by default -- MAX_STUDIES caps the picker
// at exactly this many anyway, so "the full set" and "the default set" are
// the same thing here.
const DEFAULT = STUDIES.map((s) => s.id);

const STUDY_BY_ID: Record<string, StudyDef> = Object.fromEntries(STUDIES.map((s) => [s.id, s]));

/** Resolve a picker id (localStorage value, e.g. "ema25") to what
    TradingView's `studies` array actually needs -- a bare id string, or an
    `{id, inputs}` object for an entry carrying a static override. */
export function resolveStudy(pickerId: string): string | { id: string; inputs: Record<string, number | string> } {
  const def = STUDY_BY_ID[pickerId];
  if (!def) return pickerId;
  if (!def.inputs) return def.tvId ?? def.id;
  return { id: def.tvId ?? def.id, inputs: def.inputs };
}

/** Ids from before the `ema25`/`ema50`/`sma200`/`stochRsi10_3_3` rename
    (raw TradingView ids like "MAExp@tv-basicstudies", saved by anyone who
    used the picker before that change). Dropped on load below rather than
    passed through: a passthrough id resolves fine on the chart, but the
    picker has no entry to show it checked against, so it sits as an
    invisible slot -- still counted against MAX_STUDIES, but with no
    checkbox a user can see or toggle off. That's strictly worse than
    losing the stale selection, so load-time cleanup wins here. */
export function loadStudies(): string[] {
  if (typeof window === "undefined") return DEFAULT;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return DEFAULT;
    const known = arr.filter((x): x is string => typeof x === "string" && x in STUDY_BY_ID);
    // A non-empty saved array that resolved to nothing real (e.g. entirely
    // pre-rename raw ids) is stale data, not a deliberate "show zero
    // indicators" choice -- fall back rather than render that. An array
    // that was already empty IS a deliberate choice; leave it alone.
    if (arr.length > 0 && known.length === 0) return DEFAULT;
    return known;
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
