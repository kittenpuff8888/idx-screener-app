"use client";

import { Card, CardHeader } from "@/components/shared/Card";
import { Provenance } from "@/components/shared/Metric";
import type { KseiPayload } from "@/lib/domain/types";
import { formatAsOf, formatNumber, formatPlainPercent } from "@/lib/format/number";

export function KSEIConcentration({ ksei }: { ksei: KseiPayload | null }) {
  const summary = ksei?.summary || {};
  return (
    <Card>
      <CardHeader kicker="Ownership Intelligence" title="Control and concentration overview">
        <Provenance source="KSEI" asOf={formatAsOf(ksei?.asOf)} />
      </CardHeader>
      <div className="metric-grid">
        <div className="metric-card"><span>Issuers</span><strong>{formatNumber(summary.totalIssuers, 0)}</strong></div>
        <div className="metric-card"><span>Average Free Float</span><strong>{formatPlainPercent(summary.averageFreeFloat, 2)}</strong></div>
        <div className="metric-card"><span>Average HHI</span><strong>{formatNumber(summary.averageHHI, 0)}</strong></div>
        <div className="metric-card"><span>High Concentration</span><strong>{formatNumber(summary.highConcentrationIssuers, 0)}</strong></div>
      </div>
      <p className="mt-4 text-sm leading-6 text-muted">
        This view is independent of the market-date selector and reflects the latest KSEI snapshot: {ksei?.asOf || "loading"}.
      </p>
    </Card>
  );
}
