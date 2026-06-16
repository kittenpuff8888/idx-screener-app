"use client";

import { Card, CardHeader } from "@/components/shared/Card";
import type { KseiIssuer } from "@/lib/domain/types";
import { formatNumber, formatPlainPercent } from "@/lib/format/number";

export function OwnershipPanel({ ownership }: { ownership?: KseiIssuer }) {
  if (!ownership) {
    return <Card><CardHeader kicker="Ownership" title="Ownership context unavailable" /><p className="text-sm text-muted">No matching issuer record is available in the latest KSEI snapshot.</p></Card>;
  }
  return (
    <Card>
      <CardHeader kicker="Ownership" title="Who controls the company" />
      <div className="metric-grid">
        <div className="metric-card"><span>Free Float</span><strong>{formatPlainPercent(ownership.freeFloat, 2)}</strong></div>
        <div className="metric-card"><span>HHI</span><strong>{formatNumber(ownership.hhi, 0)}</strong></div>
        <div className="metric-card"><span>CR1</span><strong>{formatPlainPercent(ownership.cr1, 2)}</strong></div>
        <div className="metric-card"><span>CR3</span><strong>{formatPlainPercent(ownership.cr3, 2)}</strong></div>
      </div>
      <div className="mt-5 grid gap-3">
        {ownership.investors.slice(0, 8).map((investor) => (
          <div key={`${investor.rank}-${investor.name}`} className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
            <div>
              <strong className="text-text">{investor.name}</strong>
              <p className="text-sm text-muted">{investor.type}</p>
            </div>
            <span className="font-mono text-sm text-accent">{formatPlainPercent(investor.percentage, 2)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
