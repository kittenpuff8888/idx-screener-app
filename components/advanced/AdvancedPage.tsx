"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Badge } from "@/components/shared/Badge";
import { Card, CardHeader } from "@/components/shared/Card";
import { formatNumber } from "@/lib/format/number";

const tabs = ["Data Quality", "Workbook Explorer", "Guide & Methodology"] as const;

// Sidebar deep-links use ?tab=quality|explorer|guide.
const tabByParam: Record<string, (typeof tabs)[number]> = {
  quality: "Data Quality",
  explorer: "Workbook Explorer",
  guide: "Guide & Methodology",
};

export function AdvancedPage() {
  const { manifest, bundle, ksei, indexes, marketDate } = useApp();
  const [tab, setTab] = useState<(typeof tabs)[number]>("Data Quality");

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("tab");
    if (param && tabByParam[param]) setTab(tabByParam[param]);
  }, []);
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
      {tab === "Guide & Methodology" ? (
        <Card>
          <CardHeader kicker="Guide" title="How to read the platform" />
          <div className="guide-grid">
            <article><h3>Dashboard</h3><p>Start with market tone, breadth, sector leadership, and ownership changes before drilling down.</p></article>
            <article><h3>Screener</h3><p>Use the screener and index views to discover what deserves deeper ticker research.</p></article>
            <article><h3>Ticker Drawer</h3><p>Read the quote header, summary, trade plan, chart, ownership, fundamentals, technicals, and news in order.</p></article>
            <article><h3>Swing Setups &amp; CVD (approx.)</h3><p>Setups are 2–5 day long-reversal candidates requiring location (POI or 20-day low band), structure (bullish CHoCH or a swept-and-reclaimed low), and orderflow confirmation. &ldquo;CVD (approx.)&rdquo; is estimated from daily candles — per-bar delta = volume × (2·(close−low)/(high−low) − 1) — because true tick/footprint data is unavailable for IDX retail. It is an approximation, never footprint data. Scores are 0–100 with weights location 25 / structure 25 / orderflow 25 / ownership 15 / liquidity 10. Outputs are screening analytics, not trade advice.</p></article>
            <article><h3>KSEI ownership lag</h3><p>KSEI snapshots are monthly. Ownership accumulation is a conviction bonus and context only — never a timing trigger. The snapshot date is shown wherever ownership data appears.</p></article>
            <article><h3>Parity &amp; data limits</h3><p>&ldquo;TradingView parity&rdquo; is approximated by agreement between two independent sources that mirror the IDX feed (a literal TradingView feed requires a paid subscription). Prices are split-adjusted, dividend-unadjusted. Tickers failing the dual-source check are flagged PARITY_FAIL and excluded from setups for that run. Recent IPOs (&lt;90 bars) are flagged; under 30 bars they are excluded rather than computed on partial windows. The stale-data banner is weekend-aware but does not model IDX holidays. See the Data Health page for the current run report.</p></article>
          </div>
        </Card>
      ) : null}
    </section>
  );
}
