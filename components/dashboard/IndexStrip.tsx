"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/AppProvider";
import { Badge } from "@/components/shared/Badge";
import { Sparkline } from "@/components/shared/Sparkline";
import { capSeriesToDate, performance } from "@/lib/data/indexes";
import { latestInstrumentValue } from "@/lib/data/marketContext";
import { formatNumber, formatPercent } from "@/lib/format/number";

const instrumentAliases: Record<string, string[]> = {
  "IDX COMPOSITE": ["IHSG", "IDX COMPOSITE", "COMPOSITE"],
  EIDO: ["EIDO"],
  ID10Y: ["ID10Y", "INDONESIA 10Y", "TVC:ID10Y"],
  USDIDR: ["USDIDR", "IDR=X"],
  VIX: ["VIX"],
  BTC: ["BTC", "BTC-USD"],
  SPX: ["SPX", "GSPC", "^GSPC"],
  KOSPI: ["KOSPI", "KS11", "^KS11"],
};

function lookupInstrument<T>(map: Map<string, T>, label: string, id: string) {
  const keys = [label, id, ...(instrumentAliases[label.toUpperCase()] || []), ...(instrumentAliases[id.toUpperCase()] || [])];
  for (const key of keys) {
    const found = map.get(key.toUpperCase());
    if (found) return found;
  }
  return null;
}

export function IndexStrip() {
  const { indexes, marketContext, marketDate } = useApp();
  const local = (indexes?.groups || []).filter((group) => group.id === "PRIMBANK10" || group.section === "SECTORAL INDEX").slice(0, 6);
  const external = Object.values(indexes?.externalIndexes || {}).flat().slice(0, 8);
  const instrumentMap = new Map(
    (marketContext?.instruments || []).flatMap((item) => [
      [item.label.toUpperCase(), item] as const,
      [item.symbol.toUpperCase(), item] as const,
    ]),
  );

  return (
    <section data-testid="index-ecosystem" className="rounded-lg border border-white/10 bg-surface/80 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent">Index Ecosystem</p>
          <h2 className="text-xl font-semibold text-text">Live references and local research indexes</h2>
        </div>
        <Badge tone="neutral">Local indexes capped at {marketDate}</Badge>
      </div>
      <div className="flex max-w-full gap-3 overflow-x-auto pb-2">
        {external.map((item) => {
          const instrument = lookupInstrument(instrumentMap, item.label, item.id);
          const latest = instrument ? latestInstrumentValue(instrument) : { value: null, change: null, changePct: null, series: [] as number[] };
          const hasSeries = latest.value !== null && latest.series.length > 0;
          return (
            <a
              key={item.id}
              data-testid="index-card"
              href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(item.symbol)}`}
              target="_blank"
              rel="noreferrer"
              className="min-w-72 rounded-lg border border-white/10 bg-white/[0.03] p-4 transition hover:border-accent/40 hover:bg-accent/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p data-testid="index-card-title" className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{item.label}</p>
                  <strong data-testid="index-card-value" className="mt-1 block text-2xl text-text">{formatNumber(latest.value, 2)}</strong>
                  <span data-testid="index-card-change" className={latest.changePct !== null && latest.changePct < 0 ? "text-negative" : "text-positive"}>
                    {hasSeries ? `${formatNumber(latest.change, 2)} / ${formatPercent(latest.changePct)}` : "Local provider series unavailable"}
                  </span>
                </div>
                <Badge tone="accent">Live Reference</Badge>
              </div>
              <Sparkline values={latest.series} positive={(latest.changePct || 0) >= 0} className="mt-4" />
              {!hasSeries ? (
                <p data-testid="index-card-note" className="mt-3 text-xs leading-relaxed text-muted">
                  Opens in TradingView; no local yfinance/workbook series is available for this reference.
                </p>
              ) : null}
            </a>
          );
        })}
        {local.map((group) => {
          const series = capSeriesToDate(group.series, marketDate);
          const latest = series.at(-1);
          const perf = performance(group.series, marketDate, 1);
          return (
            <Link
              key={group.id}
              data-testid="index-card"
              href="/explorer?tab=indexes"
              className="min-w-72 rounded-lg border border-white/10 bg-white/[0.03] p-4 transition hover:border-accent/40 hover:bg-accent/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p data-testid="index-card-title" className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{group.label}</p>
                  <strong data-testid="index-card-value" className="mt-1 block text-2xl text-text">{formatNumber(latest?.value, 2)}</strong>
                  <span data-testid="index-card-change" className={perf !== null && perf < 0 ? "text-negative" : "text-positive"}>{formatPercent(perf)}</span>
                </div>
                <Badge tone="neutral">Local Research Index</Badge>
              </div>
              <Sparkline values={series.map((point) => point.value)} positive={(perf || 0) >= 0} className="mt-4" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
