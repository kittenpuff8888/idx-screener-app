"use client";

import { V2Shell } from "@/components/v2/V2Shell";
import { DashboardPage } from "@/components/dashboard/DashboardPage";

// Research Dashboard (/) — the prototype's default route. DashboardPage is the
// faithful real-data realization of "1. Research Dashboard.dc.html" (regime/risk
// gauge, cross-asset markets, leaders/laggards, sectoral+konglo rotation, IHSG
// 1-day chart, squarified market map). The prototype's own data is seeded; we
// render the real feeds instead per the brief ("replace representative values").
export default function V2ResearchPage() {
  return (
    <V2Shell active="research" title="Research Dashboard">
      <main style={{ flex: 1, minWidth: 0, padding: "24px 30px 64px", background: "var(--bg)" }}>
        <DashboardPage />
      </main>
    </V2Shell>
  );
}
