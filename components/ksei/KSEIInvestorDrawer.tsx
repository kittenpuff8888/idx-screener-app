"use client";

import { Drawer } from "@/components/shared/Drawer";
import type { KseiIssuer } from "@/lib/domain/types";
import { formatPlainPercent } from "@/lib/format/number";

export function KSEIInvestorDrawer({
  investor,
  rows,
  onClose,
  onTicker,
}: {
  investor: string | null;
  rows: Array<{ issuer: KseiIssuer; rank: number; type: string; percentage: number }>;
  onClose: () => void;
  onTicker: (ticker: string) => void;
}) {
  return (
    <Drawer open={Boolean(investor)} onClose={onClose} title={investor || "Investor detail"}>
      <div className="grid gap-3">
        <p className="text-sm text-muted">{rows.length} related issuer holdings are reported in the latest KSEI snapshot.</p>
        {rows.map((row) => (
          <button key={`${row.issuer.ticker}-${row.rank}`} type="button" onClick={() => onTicker(row.issuer.ticker)} className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-left hover:border-accent/40">
            <strong>{row.issuer.ticker} / {row.issuer.companyName}</strong>
            <p className="text-sm text-muted">{row.type} / {formatPlainPercent(row.percentage, 2)} / rank {row.rank}</p>
          </button>
        ))}
      </div>
    </Drawer>
  );
}
