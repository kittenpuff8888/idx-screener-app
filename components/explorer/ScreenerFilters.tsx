"use client";

import type { ScreenerRow } from "@/lib/domain/types";

export type ScreenerFilterState = {
  search: string;
  sector: string;
  konglo: string;
  liquidity: string;
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
  return (
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
  );
}
