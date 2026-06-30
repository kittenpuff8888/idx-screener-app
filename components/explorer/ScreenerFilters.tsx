"use client";

import type { ScreenerRow } from "@/lib/domain/types";

export type ScreenerFilterState = {
  search: string;
  sector: string;
  konglo: string;
  liquidity: string;
  signal: string;
};

export function ScreenerFilters({
  rows,
  kongloOptions,
  value,
  onChange,
}: {
  rows: ScreenerRow[];
  kongloOptions: Array<{ id: string; label: string }>;
  value: ScreenerFilterState;
  onChange: (next: ScreenerFilterState) => void;
}) {
  const sectors = [...new Set(rows.map((row) => row.sector))].sort();
  const liquidity = [...new Set(rows.map((row) => row.liquidityCategory))].sort();
  // Signal lenses come from the real signalLabel field, with each lens's row count.
  const signalCounts = new Map<string, number>();
  for (const row of rows) signalCounts.set(row.signalLabel, (signalCounts.get(row.signalLabel) || 0) + 1);
  const signals = [...signalCounts.entries()].sort((a, b) => b[1] - a[1]);
  return (
    <div className="screener-filter-stack">
      <div className="signal-lenses" role="group" aria-label="Signal filters">
        <button
          type="button"
          className={`lens-chip ${value.signal === "ALL" ? "active" : ""}`}
          onClick={() => onChange({ ...value, signal: "ALL" })}
        >
          All signals <span className="lens-count">{rows.length}</span>
        </button>
        {signals.map(([label, count]) => (
          <button
            key={label}
            type="button"
            className={`lens-chip ${value.signal === label ? "active" : ""}`}
            onClick={() => onChange({ ...value, signal: value.signal === label ? "ALL" : label })}
          >
            {label} <span className="lens-count">{count}</span>
          </button>
        ))}
      </div>
      <div className="screener-controls">
      <label>
        <span>Ticker</span>
        <input
          value={value.search}
          onChange={(event) => onChange({ ...value, search: event.target.value })}
          placeholder="Search ticker or company"
        />
      </label>
      <label>
        <span>Sector</span>
        <select value={value.sector} onChange={(event) => onChange({ ...value, sector: event.target.value })}>
          <option value="ALL">All sectors</option>
          {sectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
        </select>
      </label>
      <label>
        <span>Konglo Index</span>
        <select value={value.konglo} onChange={(event) => onChange({ ...value, konglo: event.target.value })}>
          <option value="ALL">All groups</option>
          {kongloOptions.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
        </select>
      </label>
      <label>
        <span>Liquidity</span>
        <select value={value.liquidity} onChange={(event) => onChange({ ...value, liquidity: event.target.value })}>
          <option value="ALL">All categories</option>
          {liquidity.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </label>
      </div>
    </div>
  );
}
