"use client";

import { useApp } from "@/components/providers/AppProvider";
import { asNumber, formatNumber } from "@/lib/format/number";

export function BreadthCard() {
  const { bundle } = useApp();
  const breadth = bundle?.overview.overview?.breadth || {};
  const advances = asNumber(breadth.advances) || 0;
  const declines = asNumber(breadth.declines) || 0;
  const unchanged = asNumber(breadth.unchanged) || 0;
  const total = advances + declines + unchanged || 1;
  const advancePct = (advances / total) * 100;
  const declinePct = (declines / total) * 100;
  return (
    <article className="dashboard-summary-card">
      <span>MARKET BREADTH</span>
      <strong>Participation balance</strong>
      <div className="breadth-numbers">
        <b>{formatNumber(advances, 0)} advancing</b>
        <b>{formatNumber(declines, 0)} declining</b>
        <b>{formatNumber(unchanged, 0)} unchanged</b>
      </div>
      <div className="breadth-track" aria-label="Market breadth ratio">
        <i style={{ width: `${advancePct}%` }} />
        <b style={{ width: `${declinePct}%` }} />
      </div>
      <p>The next useful check is whether leadership is concentrated in a few sectors or spread across several groups.</p>
    </article>
  );
}
