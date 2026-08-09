"use client";

import { V2Shell } from "@/components/v2/V2Shell";
import { SetupsPage } from "@/components/setups/SetupsPage";

// Past Setups (/screener/history) — faithful real-data realization of
// "2.2 Past Setups.dc.html": expectancy (hit-rate + CI, avg R, equity curve),
// sample-size/survivorship notes, per-setup + per-sector breakdown vs IHSG.
export default function V2PastSetupsPage() {
  return (
    <V2Shell active="screener" title="Past Setups">
      <main style={{ flex: 1, minWidth: 0, padding: "24px 30px 64px", background: "var(--bg)" }}>
        <SetupsPage />
      </main>
    </V2Shell>
  );
}
