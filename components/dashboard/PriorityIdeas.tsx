"use client";

import { useApp } from "@/components/providers/AppProvider";
import { Badge } from "@/components/shared/Badge";
import { Card, CardHeader } from "@/components/shared/Card";
import { formatNumber, formatPercent } from "@/lib/format/number";

export function PriorityIdeas() {
  const { bundle, openTicker } = useApp();
  const rows = bundle?.screener.slice(0, 6) || [];
  return (
    <Card>
      <CardHeader kicker="Next Investigation" title="Priority research candidates" />
      <div className="grid gap-3 xl:grid-cols-2">
        {rows.map((row) => (
          <button
            key={`${row.ticker}-${row.signalLabel}`}
            type="button"
            onClick={() => openTicker(row.ticker)}
            className="rounded-lg border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-accent/40 hover:bg-accent/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <strong className="text-xl text-text">{row.ticker}</strong>
                <p className="text-sm text-muted">{row.sector} / {row.industry}</p>
              </div>
              <Badge tone="accent">{row.signalLabel}</Badge>
            </div>
            <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted">{row.summary}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-muted">
              <span>RVOL {formatNumber(row.rvol, 2)}</span>
              <span>{formatPercent(row.changePct)}</span>
              <span>{row.vwapZone}</span>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}
