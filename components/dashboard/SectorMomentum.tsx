"use client";

import { useApp } from "@/components/providers/AppProvider";
import { Card, CardHeader } from "@/components/shared/Card";
import { normalizeSector } from "@/lib/domain/sectors";
import { asNumber, formatPercent } from "@/lib/format/number";

export function SectorMomentum() {
  const { bundle } = useApp();
  const sectors = Array.isArray(bundle?.overview.overview?.sectors) ? bundle?.overview.overview?.sectors || [] : [];
  const max = Math.max(...sectors.map((item) => Math.abs(asNumber(item.avgChange) || 0)), 0.01);
  return (
    <Card>
      <CardHeader kicker="Sector Momentum" title="Where leadership is forming" />
      <div className="mini-bars">
        {sectors.slice(0, 8).map((item) => {
          const change = asNumber(item.avgChange) || 0;
          const width = Math.max(4, (Math.abs(change) / max) * 100);
          return (
            <div key={String(item.sector)} className="mini-bar">
              <strong className="text-text">{normalizeSector(String(item.sector))}</strong>
              <span className="mini-bar-track"><i style={{ width: `${width}%` }} /></span>
              <span className={change >= 0 ? "text-positive" : "text-negative"}>{formatPercent(change)}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
