"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useApp } from "@/components/providers/AppProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { buildResearchSummary, loadOhlcv, tradePlanFromTechnical } from "@/lib/data/ticker";
import type { OhlcvPayload } from "@/lib/domain/types";
import { FundamentalsPanel } from "./FundamentalsPanel";
import { NewsPanel } from "./NewsPanel";
import { OwnershipPanel } from "./OwnershipPanel";
import { ResearchSummary } from "./ResearchSummary";
import { TechnicalsPanel } from "./TechnicalsPanel";
import { TickerChart } from "./TickerChart";
import { TickerHeader } from "./TickerHeader";
import { IndexPanel } from "./IndexPanel";
import { SetupPanel } from "./SetupPanel";
import { TradePlan } from "./TradePlan";

export function TickerResearch() {
  const params = useSearchParams();
  const router = useRouter();
  const ticker = (params.get("symbol") || "").trim().toUpperCase().replace(".JK", "");
  const { bundle, ksei, idxIndex, marketDate } = useApp();
  const [ohlcv, setOhlcv] = useState<OhlcvPayload | null>(null);

  const stock = ticker ? bundle?.technical.get(ticker) : undefined;
  const ownership = ticker ? ksei?.records.find((item) => item.ticker === ticker) : undefined;
  const indexRecord = ticker ? idxIndex?.records[ticker] : undefined;
  const fundamental = ticker ? bundle?.fundamentals.get(ticker) : undefined;
  const news = ticker ? bundle?.news.get(ticker) : undefined;

  useEffect(() => {
    let cancelled = false;
    setOhlcv(null);
    if (!ticker || !marketDate) return undefined;
    loadOhlcv(marketDate, ticker).then((payload) => {
      if (!cancelled) setOhlcv(payload);
    });
    return () => { cancelled = true; };
  }, [ticker, marketDate]);

  const summary = useMemo(() => buildResearchSummary(stock, ownership), [stock, ownership]);
  const plan = tradePlanFromTechnical(stock);

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => router.back()}
          style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", background: "var(--panel)", borderRadius: 9, padding: "7px 12px", fontSize: 13, color: "var(--muted)", cursor: "pointer" }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "-.01em" }}>
          {ticker ? `${ticker} research` : "Ticker research"}
        </h1>
      </div>

      {!ticker ? (
        <EmptyState title="No ticker selected" body="Open a ticker from the Screener, Watchlist, or search to see its research." />
      ) : !stock && !ownership ? (
        <EmptyState title="Ticker not found" body="This ticker is not available in the selected research session or latest ownership snapshot." />
      ) : (
        <div id="tickerContent">
          <TickerHeader stock={stock} ownership={ownership} />
          <SetupPanel ticker={ticker} />
          <article className="ticker-conclusion-card">
            <ResearchSummary summary={summary} />
          </article>
          <div className="ticker-overview-grid">
            <TradePlan plan={plan} />
            <OwnershipPanel ownership={ownership} />
          </div>
          <IndexPanel record={indexRecord} effective={idxIndex?.effective} />
          <TickerChart payload={ohlcv} stock={stock} />
          <div className="ticker-overview-grid">
            <FundamentalsPanel row={fundamental} stock={stock} asOf={marketDate} />
            <TechnicalsPanel stock={stock} />
          </div>
          <NewsPanel ticker={ticker} row={news} />

          <p style={{ marginTop: 22 }}>
            <Link href="/explorer" style={{ fontSize: 13, color: "var(--accent)" }}>← Back to Screener</Link>
          </p>
        </div>
      )}
    </section>
  );
}
