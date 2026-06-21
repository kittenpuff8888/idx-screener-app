"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Badge } from "@/components/shared/Badge";
import { Card, CardHeader } from "@/components/shared/Card";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { capSeriesToDate, performance } from "@/lib/data/indexes";
import type { IndexGroup } from "@/lib/domain/types";
import { formatNumber, formatPercent } from "@/lib/format/number";
import { IndexDetail } from "./IndexDetail";
import { KongloView } from "./KongloView";
import { ScreenerFilters, type ScreenerFilterState } from "./ScreenerFilters";
import { ScreenerTable } from "./ScreenerTable";
import { SectorView } from "./SectorView";

const tabs = ["screener", "indexes", "sectors", "konglo"] as const;
type Tab = typeof tabs[number];

export function ExplorerPage() {
  const { bundle, indexes, marketDate, loading } = useApp();
  const [tab, setTab] = useState<Tab>("screener");
  const [selectedIndex, setSelectedIndex] = useState<IndexGroup | null>(null);
  const [filters, setFilters] = useState<ScreenerFilterState>({
    search: "",
    sector: "ALL",
    konglo: "ALL",
    liquidity: "ALL",
  });
  const kongloOptions = (indexes?.groups || []).filter((group) => group.section === "KONGLO INDEX").map((group) => ({ id: group.id, label: group.label }));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested && tabs.includes(requested as Tab)) setTab(requested as Tab);
  }, []);
  const filteredRows = useMemo(() => {
    const needle = filters.search.trim().toLowerCase();
    return (bundle?.screener || []).filter((row) => {
      if (needle && !`${row.ticker} ${row.companyName}`.toLowerCase().includes(needle)) return false;
      if (filters.sector !== "ALL" && row.sector !== filters.sector) return false;
      if (filters.konglo !== "ALL" && !row.kongloGroups.includes(filters.konglo)) return false;
      if (filters.liquidity !== "ALL" && row.liquidityCategory !== filters.liquidity) return false;
      return true;
    });
  }, [bundle, filters]);

  if (loading && !bundle) return <SkeletonCard />;

  const localIndexes = (indexes?.groups || []).filter((group) => group.section !== "KONGLO INDEX");

  return (
    <section className="view active" data-view-panel="screener">
      <div className="view-intro">
        <div>
          <span className="section-kicker">SIGNAL DISCOVERY</span>
          <h2>Research Screener</h2>
          <p>Find liquid, momentum-qualified IDX tickers and open the full research drawer from any row.</p>
        </div>
        <span className="hero-stat">{filteredRows.length} rows</span>
      </div>
      <div className="screener-mode-tabs">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={tab === item ? "active" : ""}
          >
            {item === "screener" ? "Screener" : item}
          </button>
        ))}
      </div>

      {tab === "screener" ? (
        <article className="panel screener-panel">
          <div className="filter-gate-notice">
            <strong>Filter gates</strong>
            <span>(ADTR 20D ≥ Rp5B OR ADTV 20D ≥ 5M shares) AND RSI ≥ 50</span>
          </div>
          <ScreenerFilters rows={bundle?.screener || []} kongloOptions={kongloOptions} value={filters} onChange={setFilters} />
          <div className="screener-insight-strip">
            <Badge tone="accent">{filteredRows.length} visible rows</Badge>
            <Badge tone="neutral">{bundle?.screener.length || 0} total signal rows</Badge>
            <Badge tone="neutral">{marketDate}</Badge>
          </div>
          <details className="signal-guide">
            <summary>Signal definitions</summary>
            <div className="signal-catalog">
              <span>EMA Trend</span>
              <span>Golden Cross</span>
              <span>Structure Break</span>
              <span>POI Reclaim</span>
              <span>Equal-Level Breakout</span>
            </div>
          </details>
          <ScreenerTable rows={filteredRows} />
        </article>
      ) : null}

      {tab === "indexes" ? (
        <div className="index-sections">
          {selectedIndex ? <IndexDetail group={selectedIndex} onClose={() => setSelectedIndex(null)} /> : null}
          <div className="index-grid">
            {localIndexes.map((group) => {
              const series = capSeriesToDate(group.series, marketDate);
              const latest = series.at(-1);
              const perf = performance(group.series, marketDate, 1);
              return (
                <Card key={group.id}>
                  <button type="button" onClick={() => setSelectedIndex(group)} className="block w-full text-left">
                    <CardHeader kicker={group.section} title={group.label} />
                    <div className="metric-grid">
                      <div className="metric-card"><span>Latest</span><strong>{formatNumber(latest?.value, 2)}</strong></div>
                      <div className="metric-card"><span>1D</span><strong className={perf !== null && perf < 0 ? "text-negative" : "text-positive"}>{formatPercent(perf)}</strong></div>
                    </div>
                    <p className="mt-4 text-sm text-muted">{group.constituents.length} constituents / click for performance horizons and constituent weights.</p>
                  </button>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}

      {tab === "sectors" ? <SectorView /> : null}
      {tab === "konglo" ? <KongloView /> : null}
    </section>
  );
}
