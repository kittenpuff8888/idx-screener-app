"use client";

import { Drawer } from "@/components/shared/Drawer";
import { Button } from "@/components/shared/Button";
import type { KseiIssuer } from "@/lib/domain/types";
import { formatNumber, formatPlainPercent } from "@/lib/format/number";

export function KSEIIssuerDrawer({
  issuer,
  onClose,
  onTicker,
}: {
  issuer: KseiIssuer | null;
  onClose: () => void;
  onTicker: (ticker: string) => void;
}) {
  return (
    <Drawer open={Boolean(issuer)} onClose={onClose} title={issuer ? `${issuer.ticker} ownership` : "Ownership detail"}>
      {issuer ? (
        <div className="grid gap-5">
          <div className="metric-grid">
            <div className="metric-card"><span>Free Float</span><strong>{formatPlainPercent(issuer.freeFloat, 2)}</strong></div>
            <div className="metric-card"><span>HHI</span><strong>{formatNumber(issuer.hhi, 0)}</strong></div>
            <div className="metric-card"><span>CR1</span><strong>{formatPlainPercent(issuer.cr1, 2)}</strong></div>
            <div className="metric-card"><span>CR3</span><strong>{formatPlainPercent(issuer.cr3, 2)}</strong></div>
          </div>
          <p className="text-sm leading-6 text-muted">{issuer.companyName} is classified as {issuer.ownershipType}. Inspect top holders to understand concentration and public float context.</p>
          <div className="grid gap-3">
            {issuer.investors.map((investor) => (
              <div key={`${investor.rank}-${investor.name}`} className="rounded-md border border-white/10 bg-white/[0.03] p-3">
                <strong>{investor.rank}. {investor.name}</strong>
                <p className="text-sm text-muted">{investor.type} / {formatPlainPercent(investor.percentage, 2)}</p>
              </div>
            ))}
          </div>
          <Button type="button" onClick={() => onTicker(issuer.ticker)}>Open ticker research</Button>
        </div>
      ) : null}
    </Drawer>
  );
}
