"use client";

import { Suspense } from "react";
import { V2Shell } from "@/components/v2/V2Shell";
import { TickerResearch } from "@/components/ticker/TickerResearch";

// Client shell for the v2 ticker path route. Server page supplies the resolved
// symbol from /v2/ticker/[code]; TickerResearch is the faithful real-data port
// of "0. Ticker Page.dc.html".
export function V2TickerClient({ symbol }: { symbol: string }) {
  return (
    <V2Shell active="none" title={`${symbol} · Research`}>
      <main style={{ flex: 1, minWidth: 0, padding: "24px 30px 64px", background: "var(--bg)" }}>
        <Suspense fallback={<section />}>
          <TickerResearch symbol={symbol} />
        </Suspense>
      </main>
    </V2Shell>
  );
}
