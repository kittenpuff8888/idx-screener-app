"use client";

import { useApp } from "@/components/providers/AppProvider";
import { Badge } from "@/components/shared/Badge";
import { Card } from "@/components/shared/Card";
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
    <Card className="overflow-hidden border-accent/25 bg-[linear-gradient(135deg,rgba(20,184,166,.16),rgba(13,24,40,.82)_42%,rgba(7,17,31,.96))] p-7">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Badge tone={tone === "Risk-on" ? "positive" : tone === "Defensive" ? "negative" : "warning"}>Market tone: {tone}</Badge>
          <h1 className="mt-5 max-w-5xl text-4xl font-black leading-[0.98] tracking-[-0.055em] md:text-6xl">
            {advances > declines
              ? "Participation is broadening across the IDX session."
              : "Participation is selective; read leadership before drilling into tickers."}
          </h1>
          <p className="mt-5 max-w-4xl text-base leading-8 text-muted md:text-lg">
            {advances} advancing names versus {declines} declining names on {marketDate}.{" "}
            {leader ? `${normalizeSector(String(leader.sector))} leads sector momentum with ${formatPercent(leader.avgChange)} average change.` : "Sector leadership is still loading."}
            {topSignal ? ` First research candidate to inspect: ${topSignal.ticker}, driven by ${topSignal.signalLabel}.` : " No active signal group is available for this session."}
          </p>
        </div>
        <div className="grid min-w-72 grid-cols-2 gap-3">
          <div className="metric-card">
            <span>Advancing</span>
            <strong>{formatNumber(advances, 0)}</strong>
          </div>
          <div className="metric-card">
            <span>Declining</span>
            <strong>{formatNumber(declines, 0)}</strong>
          </div>
          <div className="metric-card col-span-2">
            <span>Active signal tickers</span>
            <strong>{formatNumber(bundle?.overview.summary?.signalTickers, 0)}</strong>
          </div>
        </div>
      </div>
    </Card>
  );
}
