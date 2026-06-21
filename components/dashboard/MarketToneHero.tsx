"use client";

import { useApp } from "@/components/providers/AppProvider";
import { asNumber, formatNumber, formatPercent } from "@/lib/format/number";
import { normalizeSector } from "@/lib/domain/sectors";

export function MarketToneHero() {
  const { bundle, marketDate } = useApp();
  const breadth = bundle?.overview.overview?.breadth || {};
  const sectors = Array.isArray(bundle?.overview.overview?.sectors) ? bundle?.overview.overview?.sectors || [] : [];
  const advances = asNumber(breadth.advances) || 0;
  const declines = asNumber(breadth.declines) || 0;
  const leader = sectors[0];
  const tone = advances > declines * 1.5 ? "Risk-on" : declines > advances ? "Defensive" : "Mixed";
  const topSignal = bundle?.screener[0];

  return (
    <section className="dashboard-hero">
      <div>
        <span className="section-kicker">TODAY&apos;S MARKET READ</span>
        <h2>
          {advances > declines
            ? "Participation is broadening across the IDX session."
            : "Participation is selective; read leadership before drilling into tickers."}
        </h2>
        <p>
            {advances} advancing names versus {declines} declining names on {marketDate}.{" "}
            {leader ? `${normalizeSector(String(leader.sector))} leads sector momentum with ${formatPercent(leader.avgChange)} average change.` : "Sector leadership is still loading."}
            {topSignal ? ` First research candidate to inspect: ${topSignal.ticker}, driven by ${topSignal.signalLabel}.` : " No active signal group is available for this session."}
        </p>
        <div className="dashboard-next-step">
          <span>Market tone</span>
          <strong>{tone}</strong>
        </div>
      </div>
      <div className="dashboard-actions">
        <div className="hero-stat-card">
          <span>Advancing</span>
          <strong>{formatNumber(advances, 0)}</strong>
        </div>
        <div className="hero-stat-card">
          <span>Declining</span>
          <strong>{formatNumber(declines, 0)}</strong>
        </div>
        <div className="hero-stat-card">
          <span>Active signal tickers</span>
          <strong>{formatNumber(bundle?.overview.summary?.signalTickers, 0)}</strong>
        </div>
      </div>
    </section>
  );
}
