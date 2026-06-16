"use client";

import { useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Badge } from "@/components/shared/Badge";
import { Card, CardHeader } from "@/components/shared/Card";
import { formatNumber } from "@/lib/format/number";

const tabs = ["Data Quality", "Workbook Explorer", "Guide & Methodology"] as const;

export function AdvancedPage() {
  const { manifest, bundle, ksei, indexes, marketDate } = useApp();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Data Quality");
  return (
    <div className="page-stack">
      <div className="page-title">
        <div>
          <h1>Advanced</h1>
          <p>Audit data quality, workbook lineage, source provenance, and methodology. These technical terms stay here instead of the primary research flow.</p>
        </div>
        <Badge tone="warning">Audit workspace</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-full border px-4 py-2 text-sm font-semibold ${tab === item ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted"}`}>{item}</button>
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
          <div className="data-table-shell">
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
      {tab === "Guide & Methodology" ? (
        <Card>
          <CardHeader kicker="Guide" title="How to read the platform" />
          <div className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><h3 className="font-semibold">Dashboard</h3><p className="mt-2 text-sm leading-6 text-muted">Start with market tone, breadth, sector leadership, and ownership changes before drilling down.</p></article>
            <article className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><h3 className="font-semibold">Explorer</h3><p className="mt-2 text-sm leading-6 text-muted">Use the screener and index views to discover what deserves deeper ticker research.</p></article>
            <article className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><h3 className="font-semibold">Ticker Drawer</h3><p className="mt-2 text-sm leading-6 text-muted">Read the quote header, summary, trade plan, chart, ownership, fundamentals, technicals, and news in order.</p></article>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
