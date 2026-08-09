"use client";

import { V2Shell } from "@/components/v2/V2Shell";
import { NewsPage } from "@/components/news/NewsPage";

// News (/news) — faithful real-data realization of "5. News.dc.html": newest
// headlines, category + time-range filters, source attribution + WIB timestamps,
// outbound source links, NLP-provenance chip.
export default function V2NewsPage() {
  return (
    <V2Shell active="news" title="IDX Ticker News">
      <main style={{ flex: 1, minWidth: 0, padding: "24px 30px 64px", background: "var(--bg)" }}>
        <NewsPage />
      </main>
    </V2Shell>
  );
}
