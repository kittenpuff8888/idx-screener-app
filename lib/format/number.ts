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

export function formatNumber(value: unknown, digits = 2): string {
  const parsed = asNumber(value);
  if (parsed === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(parsed);
}

export function formatPrice(value: unknown): string {
  const parsed = asNumber(value);
  if (parsed === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(parsed);
}

export function formatPercent(value: unknown, digits = 2): string {
  const parsed = asNumber(value);
  if (parsed === null) return "Unavailable";
  const pct = Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

export function formatPlainPercent(value: unknown, digits = 2): string {
  const parsed = asNumber(value);
  if (parsed === null) return "Unavailable";
  const pct = Math.abs(parsed) <= 1 ? parsed * 100 : parsed;
  return `${pct.toFixed(digits)}%`;
}

export function formatCompact(value: unknown): string {
  const parsed = asNumber(value);
  if (parsed === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(parsed);
}

export function directionClass(value: unknown): "text-positive" | "text-negative" | "text-muted" {
  const parsed = asNumber(value);
  if (parsed === null || parsed === 0) return "text-muted";
  return parsed > 0 ? "text-positive" : "text-negative";
}

export function sentenceJoin(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
