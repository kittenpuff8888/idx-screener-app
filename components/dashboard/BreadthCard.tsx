"use client";

import { useApp } from "@/components/providers/AppProvider";
import { Card, CardHeader } from "@/components/shared/Card";
import { asNumber, formatNumber } from "@/lib/format/number";

export function BreadthCard() {
  const { bundle } = useApp();
  const breadth = bundle?.overview.overview?.breadth || {};
  const advances = asNumber(breadth.advances) || 0;
  const declines = asNumber(breadth.declines) || 0;
  const unchanged = asNumber(breadth.unchanged) || 0;
  const total = advances + declines + unchanged || 1;
  const advancePct = (advances / total) * 100;
  const declinePct = (declines / total) * 100;
  return (
    <Card>
      <CardHeader kicker="Breadth" title="Participation balance" />
      <div className="flex h-4 overflow-hidden rounded-full bg-white/10" aria-label="Market breadth ratio">
        <div style={{ width: `${advancePct}%` }} className="bg-positive" />
        <div style={{ width: `${declinePct}%` }} className="bg-negative" />
      </div>
      <p className="mt-4 text-sm leading-6 text-muted">
        {formatNumber(advances, 0)} advancing, {formatNumber(declines, 0)} declining, and {formatNumber(unchanged, 0)} unchanged names.
        The next useful check is whether leadership is concentrated in a few sectors or spread across several groups.
      </p>
    </Card>
  );
}
