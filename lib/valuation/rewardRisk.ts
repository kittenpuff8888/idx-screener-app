/** Reward:Risk from three real price levels — reused everywhere this ratio
    is computed (previously duplicated inline in PastSetups.tsx,
    TradePlanLadder.tsx, and TickerResearch.tsx with three slightly different
    copies of the same formula). Returns null when risk is zero or any input
    is missing, rather than dividing by zero or guessing. */
export function computeRewardRisk(entry: number | null, target: number | null, invalidation: number | null): number | null {
  if (entry == null || target == null || invalidation == null) return null;
  const risk = entry - invalidation;
  if (risk === 0) return null;
  return Math.abs((target - entry) / risk);
}
