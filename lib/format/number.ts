export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim();
    if (!cleaned || cleaned === "-") return null;
    const match = cleaned.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

// Indonesian convention: dot thousands, comma decimal (e.g. 6.007,66) — IMPLEMENTATION_SPEC §2.
const LOCALE = "id-ID";

export function formatNumber(value: unknown, digits = 2): string {
  const parsed = asNumber(value);
  if (parsed === null) return "Unavailable";
  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(parsed);
}

export function formatPrice(value: unknown): string {
  const parsed = asNumber(value);
  if (parsed === null) return "Unavailable";
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 }).format(parsed);
}

/** Market Cap fields are published in billions of Rupiah — compact that for
    a tile/table caption: billions → "258 T" / "87.7 T" / "500 B" (was a raw
    "Rp 258.282", cramped and unreadable at small sizes). */
export function formatMarketCapBn(value: unknown): string {
  const parsed = asNumber(value);
  if (parsed === null) return "—";
  if (parsed >= 1000) return `${(parsed / 1000).toFixed(parsed >= 100000 ? 0 : 1)} T`;
  return `${Math.round(parsed)} B`;
}

/**
 * Signed percentage for RATIO inputs (the repo's price/change/sector/screener
 * convention, e.g. 0.0176 → "+1,76%"). Input is a fraction of 1; it is scaled
 * ×100 exactly once. Do NOT pre-multiply callers — pass the raw ratio.
 */
export function formatPercent(value: unknown, digits = 2): string {
  const parsed = asNumber(value);
  if (parsed === null) return "Unavailable";
  const pct = parsed * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

/**
 * Unsigned percentage for values ALREADY expressed in percent points — the
 * KSEI ownership convention (freeFloat 20.51, cr1 41.1, oldPercentage 5.71).
 * No scaling is applied.
 */
export function formatPlainPercent(value: unknown, digits = 2): string {
  const parsed = asNumber(value);
  if (parsed === null) return "Unavailable";
  return `${parsed.toFixed(digits)}%`;
}

export function formatCompact(value: unknown): string {
  const parsed = asNumber(value);
  if (parsed === null) return "Unavailable";
  return new Intl.NumberFormat(LOCALE, {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(parsed);
}

/**
 * Format an ISO date (or YYYY-MM-DD) into a compact provenance stamp,
 * e.g. "2026-06-14" → "14 Jun 2026". Returns the raw input on parse failure
 * rather than inventing a date.
 */
export function formatAsOf(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

// Parse counts that may carry a K/M/B/T suffix (e.g. "7.79 B" shares outstanding).
const COUNT_SUFFIX: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
export function parseCount(v: unknown): number | null {
  if (v == null) return null;
  const m = String(v).replace(/,/g, "").trim().match(/^(-?[\d.]+)\s*([KMBT])?/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n * (m[2] ? COUNT_SUFFIX[m[2].toUpperCase()] : 1) : null;
}

export function directionClass(value: unknown): "text-positive" | "text-negative" | "text-muted" {
  const parsed = asNumber(value);
  if (parsed === null || parsed === 0) return "text-muted";
  return parsed > 0 ? "text-positive" : "text-negative";
}

export function sentenceJoin(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
