"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/providers/AppProvider";
import { Badge } from "@/components/shared/Badge";
import { Card, CardHeader } from "@/components/shared/Card";
import { formatNumber } from "@/lib/format/number";

const tabs = ["Data Quality", "Workbook Explorer"] as const;

// Deep-links use ?tab=quality|explorer. ?tab=guide is kept as a redirect to the
// standalone /guide page, which replaced this tab (BRIEF §1 UPGRADE).
const tabByParam: Record<string, (typeof tabs)[number]> = {
  quality: "Data Quality",
  explorer: "Workbook Explorer",
};

export function AdvancedPage() {
  const { manifest, bundle, ksei, indexes, marketDate } = useApp();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Data Quality");
  const router = useRouter();

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tab");
    // The Guide moved to its own route; keep the old query-string URL working.
    if (param === "guide") { router.replace("/guide"); return; }
    if (param && tabByParam[param]) setTab(tabByParam[param]);
  }, [router]);
  return (
    <section className="view active" data-view-panel="advanced">
      <div className="view-intro">
        <div><span className="section-kicker">ADVANCED</span><h2>Research Methods &amp; Data</h2><p>Audit data quality, workbook lineage, source provenance, and methodology. These technical terms stay here instead of the primary research flow.</p></div>
        <Badge tone="warning">Audit workspace</Badge>
      </div>
      <div className="advanced-tabs">
        {tabs.map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={tab === item ? "active" : ""}>{item}</button>
        ))}
      </div>
      {tab === "Data Quality" ? (
        <Card>
          <CardHeader kicker="Data Quality" title="Coverage, source status, and archive checks" />
          <div className="metric-grid">
            <div className="metric-card"><span>Latest Market Date</span><strong>{manifest?.latestMarketDate || "Unavailable"}</strong></div>
            <div className="metric-card"><span>Available Dates</span><strong>{formatNumber(manifest?.availableMarketDates.length, 0)}</strong></div>
            <div className="metric-card"><span>Screener Rows</span><strong>{formatNumber(bundle?.screener.length, 0)}</strong></div>
            <div className="metric-card"><span>KSEI Issuers</span><strong>{formatNumber(ksei?.records.length, 0)}</strong></div>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted">
            Provenance terms, provider diagnostics, QA notes, source freshness, and archive coverage are intentionally isolated in this Advanced area.
          </p>
        </Card>
      ) : null}
      {tab === "Workbook Explorer" ? (
        <Card>
          <CardHeader kicker="Workbook Explorer" title="Generated data shapes" />
          <div className="table-shell">
            <table className="data-table">
              <thead><tr><th>Artifact</th><th>Current Count</th><th>Purpose</th></tr></thead>
              <tbody>
                <tr><td>manifest.json</td><td>{formatNumber(manifest?.availableMarketDates.length, 0)} dates</td><td>Market-date availability and archive navigation.</td></tr>
                <tr><td>technical.json</td><td>{formatNumber(bundle?.technical.size, 0)} records</td><td>Ticker-level normalized technical data.</td></tr>
                <tr><td>screener.json</td><td>{formatNumber(bundle?.screener.length, 0)} rows</td><td>Filtered signal rows for {marketDate}.</td></tr>
                <tr><td>ksei/latest.json</td><td>{formatNumber(ksei?.records.length, 0)} records</td><td>Latest independent ownership snapshot.</td></tr>
                <tr><td>indexes.json</td><td>{formatNumber(indexes?.groups.length, 0)} groups</td><td>Local research index series and constituents.</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </section>
  );
}
