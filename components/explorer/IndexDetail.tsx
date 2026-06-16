"use client";

import { useApp } from "@/components/providers/AppProvider";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import { Card, CardHeader } from "@/components/shared/Card";
import { Sparkline } from "@/components/shared/Sparkline";
import { capSeriesToDate, performance } from "@/lib/data/indexes";
import type { IndexGroup } from "@/lib/domain/types";
import { formatNumber, formatPercent } from "@/lib/format/number";

export function IndexDetail({ group, onClose }: { group: IndexGroup; onClose: () => void }) {
  const { marketDate, openTicker, bundle } = useApp();
  const series = capSeriesToDate(group.series, marketDate);
  const latest = series.at(-1);
  const buckets = [
    ["1D", performance(group.series, marketDate, 1)],
    ["5D", performance(group.series, marketDate, 5)],
    ["1M", performance(group.series, marketDate, 21)],
    ["6M", series.length > 126 ? performance(group.series, marketDate, 126) : null],
    ["YTD", performance(group.series, marketDate, "ytd")],
    ["All since 2026", performance(group.series, marketDate, "all")],
  ] as const;
  return (
    <Card className="border-accent/30">
      <CardHeader kicker="Local Research Index" title={group.label}>
        <Button type="button" variant="ghost" onClick={onClose}>Close detail</Button>
      </CardHeader>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-4 flex flex-wrap gap-3">
            <Badge tone="neutral">Capped at {marketDate}</Badge>
            <Badge tone="accent">{group.section}</Badge>
            <Badge tone="neutral">{group.constituents.length} constituents</Badge>
          </div>
          <Sparkline values={series.map((point) => point.value)} positive={(performance(group.series, marketDate, 1) || 0) >= 0} className="h-40 rounded-lg bg-white/[0.03] p-3" />
          <p className="mt-3 text-sm text-muted">
            Latest value {formatNumber(latest?.value, 2)}. Performance uses the nearest valid point available in the local series and avoids unavailable long-term horizons.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {buckets.filter(([, value]) => value !== null).map(([label, value]) => (
            <div className="metric-card" key={label}>
              <span>{label}</span>
              <strong className={value !== null && value < 0 ? "text-negative" : "text-positive"}>{formatPercent(value)}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-5 data-table-shell">
        <table className="data-table">
          <thead><tr><th>Ticker</th><th className="numeric">Weight</th><th>Sector</th><th>Industry</th><th className="numeric">Price</th><th className="numeric">Change %</th></tr></thead>
          <tbody>
            {group.constituents.slice(0, 80).map((item) => {
              const stock = bundle?.technical.get(item.ticker);
              return (
                <tr key={item.ticker}>
                  <td><button type="button" className="font-bold text-accent hover:underline" onClick={() => openTicker(item.ticker)}>{item.ticker}</button></td>
                  <td className="numeric">{formatPercent(item.weight)}</td>
                  <td>{stock?.sector || item.sector || "Others"}</td>
                  <td>{stock?.industry || item.industry || "Others"}</td>
                  <td className="numeric">{formatNumber(stock?.lastPrice, 0)}</td>
                  <td className="numeric">{formatPercent(stock?.changePercent)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
