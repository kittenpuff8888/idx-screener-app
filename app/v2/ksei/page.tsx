"use client";

import { V2Shell } from "@/components/v2/V2Shell";
import { KseiPage } from "@/components/ksei/KseiPage";

// KSEI Ownership (/ksei) — faithful real-data realization of "4. KSEI
// Ownership.dc.html": Stock Summary / By Investor / Metrics / Changelog,
// ownership composition (labelled). 956 real tickers.
export default function V2KseiPage() {
  return (
    <V2Shell active="ksei" title="KSEI Ownership">
      <main style={{ flex: 1, minWidth: 0, padding: "24px 30px 64px", background: "var(--bg)" }}>
        <KseiPage />
      </main>
    </V2Shell>
  );
}
