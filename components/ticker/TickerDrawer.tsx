"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Drawer } from "@/components/shared/Drawer";
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
import { TradePlan } from "./TradePlan";

export function TickerDrawer() {
  const { selectedTicker, closeTicker, bundle, ksei, marketDate } = useApp();
  const [ohlcv, setOhlcv] = useState<OhlcvPayload | null>(null);
  const stock = selectedTicker ? bundle?.technical.get(selectedTicker) : undefined;
  const ownership = selectedTicker ? ksei?.records.find((item) => item.ticker === selectedTicker) : undefined;
  const fundamental = selectedTicker ? bundle?.fundamentals.get(selectedTicker) : undefined;
  const news = selectedTicker ? bundle?.news.get(selectedTicker) : undefined;

  useEffect(() => {
    let cancelled = false;
    setOhlcv(null);
    if (!selectedTicker || !marketDate) return undefined;
    loadOhlcv(marketDate, selectedTicker).then((payload) => {
      if (!cancelled) setOhlcv(payload);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedTicker, marketDate]);

  const summary = useMemo(() => buildResearchSummary(stock, ownership), [stock, ownership]);
  const plan = tradePlanFromTechnical(stock);

  return (
    <Drawer open={Boolean(selectedTicker)} onClose={closeTicker} title={selectedTicker ? `${selectedTicker} research` : "Ticker research"} wide>
      {!selectedTicker ? null : (
        <div className="grid gap-5">
          {!stock && !ownership ? (
            <EmptyState title="Ticker not found" body="This ticker is not available in the selected research session or latest ownership snapshot." />
          ) : (
            <>
              <TickerHeader stock={stock} ownership={ownership} />
              <ResearchSummary summary={summary} />
              <TradePlan plan={plan} />
              <TickerChart payload={ohlcv} stock={stock} />
              <OwnershipPanel ownership={ownership} />
              <FundamentalsPanel row={fundamental} stock={stock} />
              <TechnicalsPanel stock={stock} />
              <NewsPanel ticker={selectedTicker} row={news} />
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
