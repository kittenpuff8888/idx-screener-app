"use client";

import { V2Shell } from "@/components/v2/V2Shell";
import { ScreenerPage } from "@/components/screener/ScreenerPage";

// Screener (/screener) — faithful real-data realization of "2. Screener.dc.html":
// preset setups, confluence context builder, R/R-ranked results, β-IHSG column,
// CSV export, pagination, watchlist star, Past-Setups link.
export default function V2ScreenerPage() {
  return (
    <V2Shell active="screener" title="Screener">
      <main style={{ flex: 1, minWidth: 0, padding: "24px 30px 64px", background: "var(--bg)" }}>
        <ScreenerPage />
      </main>
    </V2Shell>
  );
}
