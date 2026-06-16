"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Button } from "@/components/shared/Button";
import { DatePicker } from "./DatePicker";

export function TopBar() {
  const { tickerOptions, openTicker, reload, loading, marketDate, notice } = useApp();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return tickerOptions
      .filter((item) => item.ticker.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [query, tickerOptions]);

  function submitTicker(ticker: string) {
    openTicker(ticker);
    setQuery("");
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-bg/88 px-4 py-4 backdrop-blur lg:px-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-accent">Indonesian Equity Research Platform</p>
          <h2 className="text-2xl font-semibold text-text">IDX RESEARCH</h2>
          <p className="mt-1 text-sm text-muted">
            Selected IDX session: <span className="font-semibold text-text">{marketDate || "Preparing"}</span>
            {notice ? <span className="ml-2 text-warning">{notice}</span> : null}
          </p>
        </div>
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div className="relative min-w-72">
            <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Ticker command
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && matches[0]) submitTicker(matches[0].ticker);
                }}
                placeholder="Search BBCA, AADI, sector names"
                className="min-h-10 rounded-md border border-white/10 bg-surface-2 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-text placeholder:text-faint focus:border-accent focus:outline-none"
                aria-label="Search ticker"
              />
            </label>
            {matches.length ? (
              <div className="absolute left-0 right-0 top-[68px] z-50 overflow-hidden rounded-lg border border-white/10 bg-surface shadow-terminal">
                {matches.map((item) => (
                  <button
                    key={item.ticker}
                    type="button"
                    onClick={() => submitTicker(item.ticker)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-accent/10 focus:bg-accent/10 focus:outline-none"
                  >
                    <strong className="text-text">{item.ticker}</strong>
                    <span className="truncate text-muted">{item.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <DatePicker />
          <Button type="button" onClick={reload} disabled={loading} aria-label="Reload datasets">
            {loading ? "Loading" : "Reload"}
          </Button>
        </div>
      </div>
    </header>
  );
}
