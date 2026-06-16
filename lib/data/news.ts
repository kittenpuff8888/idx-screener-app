import type { JsonRecord, ResearchBundle } from "@/lib/domain/types";
import { tradingViewUrl } from "./client";

export type NewsItem = {
  ticker: string;
  companyName: string;
  headline: string;
  sentiment: string;
  corporateAction: string;
  url: string;
};

function text(value: unknown, fallback = "Unavailable"): string {
  if (value === null || value === undefined) return fallback;
  const out = String(value).trim();
  return out && out !== "-" ? out : fallback;
}

export function newsItems(bundle: ResearchBundle | null): NewsItem[] {
  if (!bundle) return [];
  return [...bundle.news.entries()].map(([ticker, row]: [string, JsonRecord]) => ({
    ticker,
    companyName: text(row.Company || bundle.technical.get(ticker)?.companyName, ticker),
    headline: text(row["Sentiment News"], "No internal note available"),
    sentiment: text(row.Sentiment, "Neutral"),
    corporateAction: text(row["Corp. Action"], "No corporate action flagged"),
    url: tradingViewUrl(ticker),
  }));
}
