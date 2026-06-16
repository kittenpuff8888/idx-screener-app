"use client";

import { useApp } from "@/components/providers/AppProvider";

export function DatePicker() {
  const { manifest, marketDate, setMarketDate } = useApp();
  const dates = manifest?.availableMarketDates || [];
  return (
    <label className="flex min-w-48 flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
      Market date
      <select
        value={marketDate}
        onChange={(event) => setMarketDate(event.target.value)}
        className="min-h-10 rounded-md border border-white/10 bg-surface-2 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-text focus:border-accent focus:outline-none"
        aria-label="Select available IDX market date"
      >
        {dates.map((date) => (
          <option key={date} value={date}>
            {date}
          </option>
        ))}
      </select>
    </label>
  );
}
