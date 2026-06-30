"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import type { ScreenerRow } from "@/lib/domain/types";
import { asNumber, directionClass, formatNumber, formatPercent, formatPrice } from "@/lib/format/number";

type SortKey =
  | "ticker"
  | "companyName"
  | "sector"
  | "price"
  | "changePct"
  | "beta"
  | "rs"
  | "rvol"
  | "rvolChangePct";

type SortDir = "asc" | "desc";

function rsOf(row: ScreenerRow): number | null {
  return asNumber(row.raw["RS Rating"] ?? row.raw.rsRating);
}

// Render a numeric cell, degrading missing values to a muted em dash (no bluffing).
function numCell(value: unknown, format: (v: unknown) => string, extraClass = "") {
  const parsed = asNumber(value);
  if (parsed === null) return <td className={`numeric ${extraClass}`}><span className="text-muted">—</span></td>;
  return <td className={`numeric ${extraClass}`}>{format(value)}</td>;
}

export function ScreenerTable({ rows }: { rows: ScreenerRow[] }) {
  const { openTicker, toggleWatchlist, isWatched } = useApp();
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const accessor: Record<SortKey, (r: ScreenerRow) => number | string | null> = {
      ticker: (r) => r.ticker,
      companyName: (r) => r.companyName,
      sector: (r) => r.sector,
      price: (r) => r.price,
      changePct: (r) => r.changePct,
      beta: (r) => r.beta,
      rs: (r) => rsOf(r),
      rvol: (r) => r.rvol,
      rvolChangePct: (r) => r.rvolChangePct,
    };
    const get = accessor[sortKey];
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      // Missing values always sort to the bottom regardless of direction.
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  if (!rows.length) {
    return (
      <EmptyState
        title="No active signals for this market session"
        body="The selected filters remove every current row. Clear filters or choose another available market date."
      />
    );
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function sortable(key: SortKey, label: string, numeric = false) {
    const active = sortKey === key;
    return (
      <th className={numeric ? "numeric" : ""}>
        <button type="button" className="th-sort" onClick={() => toggleSort(key)} aria-label={`Sort by ${label}`}>
          {label}
          <span className="th-sort-caret">{active ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
        </button>
      </th>
    );
  }

  return (
    <div className="table-shell">
      <table className="data-table screener-table">
        <thead>
          <tr>
            {sortable("ticker", "Ticker")}
            {sortable("companyName", "Emiten")}
            {sortable("sector", "IDX Sector")}
            <th>Industry</th>
            {sortable("price", "Price", true)}
            {sortable("changePct", "Chg %", true)}
            {sortable("beta", "Beta", true)}
            {sortable("rs", "RS", true)}
            {sortable("rvol", "RVOL", true)}
            {sortable("rvolChangePct", "RVOL Δ%", true)}
            <th>SMC</th>
            <th>VWAP Zone</th>
            <th>MA Zone</th>
            <th>Summary Screener</th>
            <th>Watch</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr key={`${row.ticker}-${row.signalLabel}-${index}`} data-testid="screener-row" onDoubleClick={() => openTicker(row.ticker)}>
              <td>
                <button
                  className="font-bold text-accent hover:underline"
                  type="button"
                  data-testid="open-ticker"
                  data-ticker={row.ticker}
                  data-row-index={index}
                  onClick={() => openTicker(row.ticker)}
                >
                  {row.ticker}
                </button>
              </td>
              <td>{row.companyName}</td>
              <td>{row.sector}</td>
              <td>{row.industry}</td>
              {numCell(row.price, (v) => formatPrice(v))}
              {numCell(row.changePct, (v) => formatPercent(v), directionClass(row.changePct))}
              {numCell(row.beta, (v) => formatNumber(v, 2))}
              {numCell(rsOf(row), (v) => formatNumber(v, 0))}
              {numCell(row.rvol, (v) => formatNumber(v, 2))}
              {numCell(row.rvolChangePct, (v) => formatPercent(v), directionClass(row.rvolChangePct))}
              <td>{row.smc}</td>
              <td>{row.vwapZone}</td>
              <td>{row.maZone}</td>
              <td>{row.summary}</td>
              <td>
                <button
                  type="button"
                  aria-label={isWatched(row.ticker) ? `Remove ${row.ticker} from watchlist` : `Add ${row.ticker} to watchlist`}
                  onClick={() => toggleWatchlist(row.ticker)}
                  className="text-button"
                >
                  {isWatched(row.ticker) ? "Saved" : "Watch"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
