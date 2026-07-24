"use client";

import { Card, CardHeader } from "@/components/shared/Card";
import type { IdxIndexRecord } from "@/lib/data/idxIndex";
import { formatPlainPercent } from "@/lib/format/number";

const SIGNAL: Record<string, { label: string; cls: string }> = {
  Baru: { label: "★ New inclusion", cls: "text-accent" },
  Naik: { label: "▲ Weight up", cls: "text-up" },
  Turun: { label: "▼ Weight down", cls: "text-down" },
  Tetap: { label: "= Unchanged", cls: "text-muted" },
};

export function IndexPanel({ record, effective }: { record?: IdxIndexRecord; effective?: string }) {
  if (!record) return null; // non-constituent: omit the panel entirely

  const sig = record.sector?.signal ? SIGNAL[record.sector.signal] : null;

  return (
    <Card>
      <CardHeader kicker="Index membership" title="Where it sits in the indices" />
      <div className="flex flex-wrap gap-2 mb-4">
        {record.memberships.map((m) => (
          <span key={m} className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-text">{m}</span>
        ))}
      </div>
      <div className="metric-grid">
        <div className="metric-card"><span>Sector index</span><strong>{record.sector?.index || "—"}</strong></div>
        <div className="metric-card"><span>Index weight</span><strong>{record.sector?.weight != null ? formatPlainPercent(record.sector.weight * 100, 2) : "—"}</strong></div>
        <div className="metric-card"><span>Official free float</span><strong>{record.officialFreeFloat != null ? formatPlainPercent(record.officialFreeFloat * 100, 1) : "—"}</strong></div>
        <div className="metric-card"><span>Rebalance</span><strong className={sig?.cls}>{sig?.label || "—"}</strong></div>
      </div>
      {effective ? <p className="text-xs text-muted mt-3">IDX index evaluation · effective {effective}</p> : null}
    </Card>
  );
}
