"use client";

import { useApp } from "@/components/providers/AppProvider";
import { normalizeSector } from "@/lib/domain/sectors";
import { asNumber, formatPercent } from "@/lib/format/number";

export function SectorMomentum() {
  const { bundle } = useApp();
  const sectors = Array.isArray(bundle?.overview.overview?.sectors) ? bundle?.overview.overview?.sectors || [] : [];
  const max = Math.max(...sectors.map((item) => Math.abs(asNumber(item.avgChange) || 0)), 0.01);
  return (
    <article className="dashboard-summary-card">
      <span>SECTOR MOMENTUM</span>
      <strong>Where leadership is forming</strong>
      <div className="dashboard-sector-list">
        {sectors.slice(0, 8).map((item) => {
          const change = asNumber(item.avgChange) || 0;
          const width = Math.max(4, (Math.abs(change) / max) * 100);
          return (
            <div key={String(item.sector)} className="sector-row">
              <strong>{normalizeSector(String(item.sector))}</strong>
              <span className="sector-track"><i style={{ width: `${width}%` }} /></span>
              <b className={change >= 0 ? "text-positive" : "text-negative"}>{formatPercent(change)}</b>
            </div>
          );
        })}
      </div>
    </article>
  );
}
