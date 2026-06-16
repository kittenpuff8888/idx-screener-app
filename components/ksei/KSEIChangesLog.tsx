"use client";

import { Card, CardHeader } from "@/components/shared/Card";
import type { KseiChange } from "@/lib/domain/types";
import { formatPlainPercent } from "@/lib/format/number";

export function KSEIChangesLog({ changes, onTicker }: { changes: KseiChange[]; onTicker: (ticker: string) => void }) {
  return (
    <Card>
      <CardHeader kicker="Latest Changes" title="Reported holder movement" />
      <div className="grid gap-3">
        {changes.map((change) => (
          <button key={`${change.ticker}-${change.investor}`} type="button" onClick={() => onTicker(change.ticker)} className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-left hover:border-accent/40">
            <div className="flex flex-wrap justify-between gap-2">
              <strong className="text-text">{change.ticker} / {change.companyName}</strong>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-accent">{change.changeType}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{change.investor}: {formatPlainPercent(change.oldPercentage, 2)} to {formatPlainPercent(change.newPercentage, 2)}</p>
          </button>
        ))}
      </div>
    </Card>
  );
}
