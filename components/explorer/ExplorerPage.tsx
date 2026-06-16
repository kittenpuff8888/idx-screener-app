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
    <div className="page-stack">
      <div className="page-title">
        <div>
          <h1>Research Explorer</h1>
          <p>Discover signal rows, inspect index behavior, compare sectors, and trace group-level constituents for the selected IDX session.</p>
        </div>
        <Badge tone="accent">{marketDate}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize transition ${tab === item ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted hover:bg-white/5"}`}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "screener" ? (
        <>
          <ScreenerFilters rows={bundle?.screener || []} kongloOptions={kongloOptions} value={filters} onChange={setFilters} />
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="accent">{filteredRows.length} visible rows</Badge>
            <Badge tone="neutral">{bundle?.screener.length || 0} total signal rows</Badge>
          </div>
          <ScreenerTable rows={filteredRows} />
        </>
      ) : null}

      {tab === "indexes" ? (
        <div className="grid gap-4">
          {selectedIndex ? <IndexDetail group={selectedIndex} onClose={() => setSelectedIndex(null)} /> : null}
          <div className="grid gap-4 lg:grid-cols-3">
            {localIndexes.map((group) => {
              const series = capSeriesToDate(group.series, marketDate);
              const latest = series.at(-1);
              const perf = performance(group.series, marketDate, 1);
              return (
                <Card key={group.id} className="cursor-pointer transition hover:border-accent/40" >
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
    </div>
  );
}
