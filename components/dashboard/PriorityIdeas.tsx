"use client";

import { useApp } from "@/components/providers/AppProvider";
import { formatNumber, formatPercent } from "@/lib/format/number";

export function PriorityIdeas() {
  const { bundle, openTicker } = useApp();
  const rows = bundle?.screener.slice(0, 6) || [];
  return (
    <article className="dashboard-summary-card">
      <span>SIGNAL SUMMARY</span>
      <strong>{rows.length ? `${rows.length} priority research candidates` : "Preparing"}</strong>
      <div className="dashboard-chip-list">
        {rows.map((row) => (
          <button
            key={`${row.ticker}-${row.signalLabel}`}
            type="button"
            onClick={() => openTicker(row.ticker)}
            className="dashboard-chip"
          >
            <strong>{row.ticker}</strong>
            <span>{row.signalLabel}</span>
            <small>{row.sector} / RVOL {formatNumber(row.rvol, 2)} / {formatPercent(row.changePct)} / {row.vwapZone}</small>
          </button>
        ))}
      </div>
    </article>
  );
}
