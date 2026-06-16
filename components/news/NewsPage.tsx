"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Badge } from "@/components/shared/Badge";
import { Card, CardHeader } from "@/components/shared/Card";
import { newsItems } from "@/lib/data/news";

export function NewsPage() {
  const { bundle, openTicker, marketDate } = useApp();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return newsItems(bundle)
      .filter((item) => !needle || `${item.ticker} ${item.companyName} ${item.headline}`.toLowerCase().includes(needle))
      .slice(0, 80);
  }, [bundle, query]);
  return (
    <div className="page-stack">
      <div className="page-title">
        <div>
          <h1>IDX Ticker News</h1>
          <p>Search ticker context and open TradingView news timelines where available. Internal notes remain secondary to the research workflow.</p>
        </div>
        <Badge tone="accent">{marketDate}</Badge>
      </div>
      <Card>
        <CardHeader kicker="Search" title="Ticker and headline context" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticker, company, headline" className="mb-4 min-h-10 w-full rounded-md border border-white/10 bg-surface-2 px-3 text-sm text-text focus:border-accent focus:outline-none" />
        <div className="grid gap-3">
          {rows.map((item) => (
            <article key={item.ticker} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button type="button" onClick={() => openTicker(item.ticker)} className="text-lg font-bold text-accent hover:underline">{item.ticker} / {item.companyName}</button>
                <Badge tone={item.sentiment.toLowerCase().includes("bear") ? "negative" : item.sentiment.toLowerCase().includes("bull") ? "positive" : "neutral"}>{item.sentiment}</Badge>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted">{item.headline}</p>
              <p className="mt-1 text-sm text-muted">{item.corporateAction}</p>
              <a href={item.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-semibold text-accent hover:underline">Open TradingView news</a>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
