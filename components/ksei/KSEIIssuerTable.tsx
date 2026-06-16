"use client";

import type { KseiIssuer } from "@/lib/domain/types";
import { formatNumber, formatPlainPercent } from "@/lib/format/number";

export function KSEIIssuerTable({
  rows,
  onIssuer,
  onTicker,
}: {
  rows: KseiIssuer[];
  onIssuer: (issuer: KseiIssuer) => void;
  onTicker: (ticker: string) => void;
}) {
  return (
    <div className="data-table-shell">
      <table className="data-table">
        <thead><tr><th>Ticker</th><th>Company</th><th>IDX Sector</th><th className="numeric">Free Float</th><th className="numeric">HHI</th><th className="numeric">CR1</th><th className="numeric">CR3</th><th className="numeric">Holders</th><th className="numeric">CCS</th><th>Ownership Type</th></tr></thead>
        <tbody>
          {rows.map((issuer) => (
            <tr key={issuer.ticker}>
              <td><button type="button" className="font-bold text-accent hover:underline" onClick={() => onTicker(issuer.ticker)}>{issuer.ticker}</button></td>
              <td><button type="button" onClick={() => onIssuer(issuer)} className="text-left hover:text-accent">{issuer.companyName}</button></td>
              <td>{issuer.sector}</td>
              <td className="numeric">{formatPlainPercent(issuer.freeFloat, 2)}</td>
              <td className="numeric">{formatNumber(issuer.hhi, 0)}</td>
              <td className="numeric">{formatPlainPercent(issuer.cr1, 2)}</td>
              <td className="numeric">{formatPlainPercent(issuer.cr3, 2)}</td>
              <td className="numeric">{formatNumber(issuer.holderCount, 0)}</td>
              <td className="numeric">{formatNumber(issuer.ccs, 0)}</td>
              <td>{issuer.ownershipType}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
