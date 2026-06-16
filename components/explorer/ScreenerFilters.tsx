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
    <div className="rounded-lg border border-white/10 bg-surface/80 p-4">
      <p className="mb-4 text-sm leading-6 text-muted">
        Filter Gates: (ADTR 20D ≥ Rp5B OR ADTV 20D ≥ 5M shares) AND RSI ≥ 50
      </p>
      <div className="grid gap-3 md:grid-cols-4">
        <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.16em] text-muted">
          Ticker
          <input
            value={value.search}
            onChange={(event) => onChange({ ...value, search: event.target.value })}
            placeholder="Search ticker or company"
            className="min-h-10 rounded-md border border-white/10 bg-surface-2 px-3 text-sm font-semibold normal-case tracking-normal text-text focus:border-accent focus:outline-none"
          />
        </label>
        <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.16em] text-muted">
          Sector
          <select value={value.sector} onChange={(event) => onChange({ ...value, sector: event.target.value })} className="min-h-10 rounded-md border border-white/10 bg-surface-2 px-3 text-sm normal-case tracking-normal text-text">
            <option value="ALL">All sectors</option>
            {sectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.16em] text-muted">
          Konglo Index
          <select value={value.konglo} onChange={(event) => onChange({ ...value, konglo: event.target.value })} className="min-h-10 rounded-md border border-white/10 bg-surface-2 px-3 text-sm normal-case tracking-normal text-text">
            <option value="ALL">All groups</option>
            {kongloOptions.map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.16em] text-muted">
          Liquidity
          <select value={value.liquidity} onChange={(event) => onChange({ ...value, liquidity: event.target.value })} className="min-h-10 rounded-md border border-white/10 bg-surface-2 px-3 text-sm normal-case tracking-normal text-text">
            <option value="ALL">All categories</option>
            {liquidity.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}
