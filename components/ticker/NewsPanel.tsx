"use client";

import { Card, CardHeader } from "@/components/shared/Card";
import type { JsonRecord } from "@/lib/domain/types";
import { tradingViewUrl } from "@/lib/data/client";

export function NewsPanel({ ticker, row }: { ticker: string; row?: JsonRecord }) {
  return (
    <Card>
      <CardHeader kicker="News" title="Ticker context" />
      <div className="grid gap-3">
        <p className="text-sm leading-6 text-muted">{String(row?.["Sentiment News"] || "No internal research note is available for this ticker.")}</p>
        <p className="text-sm leading-6 text-muted">{String(row?.["Corp. Action"] || "No corporate action is flagged in the current dataset.")}</p>
        <a href={tradingViewUrl(ticker)} target="_blank" rel="noreferrer" className="inline-flex w-fit rounded-md border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent hover:bg-accent/15">
          Open TradingView news for {ticker}
        </a>
      </div>
    </Card>
  );
}
