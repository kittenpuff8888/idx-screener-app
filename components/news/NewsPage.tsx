"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Badge } from "@/components/shared/Badge";
import { Card, CardHeader } from "@/components/shared/Card";
import { Provenance } from "@/components/shared/Metric";
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
    <section className="view active" data-view-panel="news">
      <div className="view-intro">
        <div>
          <span className="section-kicker">MARKET NEWS</span>
          <h2>IDX Ticker News</h2>
          <p>Search ticker context and open TradingView news timelines where available. Internal notes remain secondary to the research workflow.</p>
        </div>
        <Badge tone="accent">{marketDate}</Badge>
      </div>
      <Card className="news-search-panel">
        <CardHeader kicker="Search" title="Ticker and headline context" />
        <label><span>Ticker or issuer</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ticker, company, headline" /></label>
      </Card>
      <Card>
        <CardHeader kicker="Ticker context" title="News timeline">
          <Provenance source="Workbook news" asOf={marketDate} />
        </CardHeader>
        <div className="grid gap-3">
          {rows.map((item) => (
            <article key={item.ticker} className="news-card">
              <div className="news-card-head">
                <button type="button" onClick={() => openTicker(item.ticker)} className="text-button">{item.ticker} / {item.companyName}</button>
                <Badge tone={item.sentiment.toLowerCase().includes("bear") ? "negative" : item.sentiment.toLowerCase().includes("bull") ? "positive" : "neutral"}>{item.sentiment}</Badge>
              </div>
              <p>{item.headline}</p>
              <small>{item.corporateAction}</small>
              <a href={item.url} target="_blank" rel="noreferrer" className="text-button">Open TradingView news</a>
            </article>
          ))}
        </div>
      </Card>
    </section>
  );
}
