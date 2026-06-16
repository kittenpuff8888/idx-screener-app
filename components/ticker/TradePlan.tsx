"use client";

import { Card, CardHeader } from "@/components/shared/Card";
import type { TradePlan as TradePlanType } from "@/lib/domain/types";
import { formatNumber, formatPercent, formatPrice } from "@/lib/format/number";

const fields = [
  ["Entry POI", "entryPoi", (v: unknown) => String(v || "Unavailable")],
  ["Entry", "entry", formatPrice],
  ["Entry Distance", "entryDistancePct", formatPercent],
  ["Target POI", "targetPoi", (v: unknown) => String(v || "Unavailable")],
  ["Target", "target", formatPrice],
  ["Target Upside", "targetUpsidePct", formatPercent],
  ["Invalidation POI", "invalidationPoi", (v: unknown) => String(v || "Unavailable")],
  ["Invalidation", "invalidation", formatPrice],
  ["Invalidation Down", "invalidationDownPct", (v: unknown) => formatPercent(v).replace("+", "")],
  ["R/R", "rr", (v: unknown) => formatNumber(v, 2)],
] as const;

export function TradePlan({ plan }: { plan?: TradePlanType }) {
  return (
    <Card>
      <CardHeader kicker="Trade Plan" title="Mapped levels and risk frame" />
      <div className="metric-grid">
        {fields.map(([label, key, formatter]) => (
          <div className="metric-card" key={key}>
            <span>{label}</span>
            <strong>{formatter(plan?.[key])}</strong>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm leading-6 text-muted">
        These fields are mapped from the current screener logic. Treat them as research levels to inspect against chart structure, not as instructions.
      </p>
    </Card>
  );
}
