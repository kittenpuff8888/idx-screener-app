"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useApp } from "@/components/providers/AppProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { buildResearchSummary, loadOhlcv } from "@/lib/data/ticker";
import type { OhlcvPayload } from "@/lib/domain/types";
import { FundamentalsPanel } from "./FundamentalsPanel";
import { NewsPanel } from "./NewsPanel";
import { OwnershipPanel } from "./OwnershipPanel";
import { ResearchSummary } from "./ResearchSummary";
import { TechnicalsPanel } from "./TechnicalsPanel";
import { TickerHeaderHero } from "./TickerHeaderHero";
import { TradePlanLadder } from "./TradePlanLadder";
import { TradingViewChart } from "@/components/dashboard/TradingViewChart";
import { IndexPanel } from "./IndexPanel";
import { SetupPanel } from "./SetupPanel";
import { asNumber } from "@/lib/format/number";

export function TickerResearch() {
  const params = useSearchParams();
  const router = useRouter();
  // DESIGN_SPEC §3.1 deep-links as ?ticker=; ?symbol= was the pre-redesign
  // param and stays readable so existing links keep working.
  const ticker = (params.get("ticker") || params.get("symbol") || "").trim().toUpperCase().replace(".JK", "");
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
  const price = stock?.lastPrice ?? asNumber(fundamental?.["Price"]);
  const low52 = asNumber(fundamental?.["52 Week Low"]);
  const high52 = asNumber(fundamental?.["52 Week High"]);
  const CARD = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))", padding: "16px 18px" } as const;

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
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>
          {ticker ? `${ticker} research` : "Ticker research"}
        </h1>
      </div>

      {!ticker ? (
        <EmptyState title="No ticker selected" body="Open a ticker from the Screener, Watchlist, or search to see its research." />
      ) : !stock && !ownership ? (
        <EmptyState title="Ticker not found" body="This ticker is not available in the selected research session or latest ownership snapshot." />
      ) : (
        <div id="tickerContent">
          {/* Identity + 52-week range + key stats */}
          <TickerHeaderHero ticker={ticker} stock={stock} fundamental={fundamental} marketDate={marketDate || ""} />

          {/* Verdict / context  |  Trade-plan price ladder (R:R for every ticker) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14, marginBottom: 14, alignItems: "start" }}>
            <div style={CARD}>
              <SetupPanel ticker={ticker} />
              <ResearchSummary summary={summary} />
            </div>
            <div style={CARD}>
              <TradePlanLadder ticker={ticker} price={price ?? null} stock={stock} ohlcv={ohlcv} low52={low52} high52={high52} />
            </div>
          </div>

          {/* Live price chart */}
          <div style={{ ...CARD, marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>{ticker} · LIVE CHART</div>
            {/* DESIGN_SPEC §3.1: ticker charts carry VWAP + EMA. */}
            <TradingViewChart
              symbol={`IDX:${ticker}`}
              range="3M"
              interval="1D"
              studies={["VWAP@tv-basicstudies", "MAExp@tv-basicstudies"]}
              minHeight={420}
            />
          </div>

          {/* Fundamentals + technicals */}
          <div className="ticker-overview-grid">
            <FundamentalsPanel row={fundamental} stock={stock} asOf={marketDate} />
            <TechnicalsPanel stock={stock} />
          </div>
          {/* Ownership + index membership */}
          <div className="ticker-overview-grid">
            <OwnershipPanel ownership={ownership} />
            <IndexPanel record={indexRecord} effective={idxIndex?.effective} />
          </div>
          <NewsPanel ticker={ticker} row={news} />

          <p style={{ marginTop: 22 }}>
            <Link href="/screener" style={{ fontSize: 13, color: "var(--accent)" }}>← Back to Screener</Link>
          </p>
        </div>
      )}
    </section>
  );
}
