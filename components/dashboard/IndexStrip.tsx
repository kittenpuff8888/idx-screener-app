"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/AppProvider";
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
  const local = (indexes?.groups || []).filter((group) => group.id === "PRIMBANK10" || group.section === "SECTORAL INDEX").slice(0, 10);
  const external = Object.values(indexes?.externalIndexes || {}).flat().slice(0, 8);
  const instrumentMap = new Map(
    (marketContext?.instruments || []).flatMap((item) => [
      [item.label.toUpperCase(), item] as const,
      [item.symbol.toUpperCase(), item] as const,
    ]),
  );

  return (
    <section data-testid="index-ecosystem" className="index-workspace" aria-labelledby="indexWorkspaceTitle">
      <div className="view-intro compact-intro">
        <div>
          <span className="section-kicker">INDEX ECOSYSTEM</span>
          <h2 id="indexWorkspaceTitle">Live references and local research indexes</h2>
          <p>Follow current external instruments separately from indexes calculated for the selected market session.</p>
        </div>
      </div>
      <div className="index-sections">
        <section className="index-section">
          <div className="panel-head">
            <div><span className="panel-kicker">Live References</span><h3>External market instruments</h3></div>
            <span className="status-badge info">TradingView links</span>
          </div>
          <div className="index-grid">
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
                  className="index-card"
            >
                  <div className="index-card-head">
                <div>
                      <span data-testid="index-card-title">{item.label}</span>
                      <strong data-testid="index-card-value">{formatNumber(latest.value, 2)}</strong>
                      <small>{item.symbol}</small>
                    </div>
                    <b data-testid="index-card-change" className={latest.changePct !== null && latest.changePct < 0 ? "text-negative" : "text-positive"}>
                    {hasSeries ? `${formatNumber(latest.change, 2)} / ${formatPercent(latest.changePct)}` : "Local provider series unavailable"}
                    </b>
                </div>
              <Sparkline values={latest.series} positive={(latest.changePct || 0) >= 0} className="mt-4" />
              {!hasSeries ? (
                    <p data-testid="index-card-note" className="index-note">
                  Opens in TradingView; no local yfinance/workbook series is available for this reference.
                </p>
              ) : null}
            </a>
          );
        })}
          </div>
        </section>
        <section className="index-section">
          <div className="panel-head">
            <div><span className="panel-kicker">Local Research</span><h3>Selected session indexes</h3></div>
            <span className="status-badge neutral">Capped at {marketDate}</span>
          </div>
          <div className="index-grid">
        {local.map((group) => {
          const series = capSeriesToDate(group.series, marketDate);
          const latest = series.at(-1);
          const perf = performance(group.series, marketDate, 1);
          return (
            <Link
              key={group.id}
              data-testid="index-card"
              href="/screener"
                  className="index-card"
            >
                  <div className="index-card-head">
                <div>
                      <span data-testid="index-card-title">{group.label}</span>
                      <strong data-testid="index-card-value">{formatNumber(latest?.value, 2)}</strong>
                      <small>{group.section}</small>
                </div>
                    <b data-testid="index-card-change" className={perf !== null && perf < 0 ? "text-negative" : "text-positive"}>{formatPercent(perf)}</b>
              </div>
              <Sparkline values={series.map((point) => point.value)} positive={(perf || 0) >= 0} className="mt-4" />
            </Link>
          );
        })}
          </div>
        </section>
      </div>
    </section>
  );
}
