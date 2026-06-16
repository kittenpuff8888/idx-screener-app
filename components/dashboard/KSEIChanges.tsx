"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/AppProvider";
import { Card, CardHeader } from "@/components/shared/Card";
import { formatPlainPercent } from "@/lib/format/number";

export function KSEIChanges() {
  const { ksei, openTicker } = useApp();
  const changes = ksei?.investorChanges || [];
  return (
    <Card>
      <CardHeader kicker="KSEI Ownership" title="Latest ownership changes" />
      <p className="mb-4 text-sm leading-6 text-muted">
        KSEI snapshot {ksei?.asOf || "loading"} tracks reported holder changes independently from the selected market session.
      </p>
      <div className="grid gap-3">
        {changes.slice(0, 5).map((change) => (
          <button
            key={`${change.ticker}-${change.investor}`}
            type="button"
            onClick={() => openTicker(change.ticker)}
            className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-accent/40 hover:bg-accent/10"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-text">{change.ticker}</strong>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">{change.changeType}</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {change.investor}: {formatPlainPercent(change.oldPercentage, 2)} to {formatPlainPercent(change.newPercentage, 2)}
            </p>
          </button>
        ))}
      </div>
      <Link className="mt-4 inline-flex rounded-md border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-text hover:border-accent/40 hover:bg-accent/10" href="/ksei">
        Open ownership intelligence
      </Link>
    </Card>
  );
}
