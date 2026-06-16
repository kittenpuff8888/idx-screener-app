"use client";

import { useApp } from "@/components/providers/AppProvider";
import { Badge } from "@/components/shared/Badge";
import { Button } from "@/components/shared/Button";
import type { KseiIssuer, TechnicalRecord } from "@/lib/domain/types";
import { directionClass, formatPercent, formatPrice } from "@/lib/format/number";

export function TickerHeader({ stock, ownership }: { stock?: TechnicalRecord; ownership?: KseiIssuer }) {
  const { selectedTicker, toggleWatchlist, isWatched } = useApp();
  const ticker = stock?.ticker || selectedTicker || "";
  return (
    <section className="rounded-xl border border-white/10 bg-surface/90 p-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-4xl font-black tracking-[-0.06em] text-text">{ticker}</h2>
            <Badge tone="accent">{stock?.sector || ownership?.sector || "Sector unavailable"}</Badge>
            <Badge tone="neutral">{stock?.industry || ownership?.industry || "Industry unavailable"}</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{stock?.companyName || ownership?.companyName || "Company profile is unavailable for this market session."}</p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">Last price</p>
            <strong className="quote-price">{formatPrice(stock?.lastPrice)}</strong>
          </div>
          <div className={`pb-2 text-2xl font-bold ${directionClass(stock?.changePercent)}`}>{formatPercent(stock?.changePercent)}</div>
          <Button type="button" onClick={() => toggleWatchlist(ticker)}>{isWatched(ticker) ? "Watched" : "Watch"}</Button>
        </div>
      </div>
    </section>
  );
}
