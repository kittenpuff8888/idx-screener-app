"use client";

import { useApp } from "@/components/providers/AppProvider";
import { Card, CardHeader } from "@/components/shared/Card";
import { normalizeSector } from "@/lib/domain/sectors";
import { asNumber, formatNumber, formatPercent } from "@/lib/format/number";

export function SectorView() {
  const { bundle } = useApp();
  const sectors = Array.isArray(bundle?.overview.overview?.sectors) ? bundle?.overview.overview?.sectors || [] : [];
  return (
    <Card>
      <CardHeader kicker="Sectors" title="Sector breadth and signal concentration" />
      <div className="data-table-shell">
        <table className="data-table">
          <thead><tr><th>Sector</th><th className="numeric">Tickers</th><th className="numeric">Advancing</th><th className="numeric">Declining</th><th className="numeric">Avg Change</th><th className="numeric">Signal Rows</th></tr></thead>
          <tbody>
            {sectors.map((item) => (
              <tr key={String(item.sector)}>
                <td><strong>{normalizeSector(String(item.sector))}</strong></td>
                <td className="numeric">{formatNumber(item.count, 0)}</td>
                <td className="numeric text-positive">{formatNumber(item.advances, 0)}</td>
                <td className="numeric text-negative">{formatNumber(item.declines, 0)}</td>
                <td className="numeric">{formatPercent(asNumber(item.avgChange))}</td>
                <td className="numeric">{formatNumber(item.signals, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
