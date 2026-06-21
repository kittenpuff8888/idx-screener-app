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
    <section className="ticker-hero">
      <div>
        <div>
          <div className="ticker-title-row">
            <h2>{ticker}</h2>
            <Badge tone="accent">{stock?.sector || ownership?.sector || "Sector unavailable"}</Badge>
            <Badge tone="neutral">{stock?.industry || ownership?.industry || "Industry unavailable"}</Badge>
          </div>
          <p>{stock?.companyName || ownership?.companyName || "Company profile is unavailable for this market session."}</p>
        </div>
      </div>
      <div className="ticker-quote">
        <span>Last price</span>
        <strong className="quote-price">{formatPrice(stock?.lastPrice)}</strong>
        <b className={directionClass(stock?.changePercent)}>{formatPercent(stock?.changePercent)}</b>
        <Button type="button" onClick={() => toggleWatchlist(ticker)}>{isWatched(ticker) ? "Watched" : "Watch"}</Button>
      </div>
    </section>
  );
}
