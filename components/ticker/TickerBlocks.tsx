"use client";

import { Card, CardHeader } from "@/components/shared/Card";
import { Provenance } from "@/components/shared/Metric";
import { newsDisclosures } from "@/lib/data/news";
import type { JsonRecord, KseiIssuer, OhlcvPayload, ResearchBundle } from "@/lib/domain/types";
import { asNumber, formatNumber, formatPrice } from "@/lib/format/number";

// The design's ticker page carries DIVIDEND, RETURNS vs SECTOR & IHSG, PEERS and
// FILINGS & DISCLOSURES blocks (design/0. Ticker Page.dc.html). These render real
// data where the feed has it and an explicit "no data" where it does not — the
// design keeps the card in place either way, never a fabricated value.

const MONO = "var(--font-mono)";
const pol = (v: number | null) => (v == null || v === 0 ? "var(--flat)" : v > 0 ? "var(--up)" : "var(--down)");
const glyph = (v: number | null) => (v == null || v === 0 ? "•" : v > 0 ? "▲" : "▼");
const pct = (r: number | null, d = 2) => (r == null ? "—" : `${glyph(r)} ${(Math.abs(r) * 100).toFixed(d)}%`);
const NoData = () => <span style={{ fontFamily: MONO, color: "var(--faint)", fontStyle: "italic", fontSize: 11 }}>no data</span>;

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderTop: "1px solid var(--hair)", fontSize: 12.5 }}>
    <span style={{ color: "var(--muted)" }}>{label}</span>
    <span style={{ fontFamily: MONO, fontWeight: 600 }}>{children}</span>
  </div>
);

// ── DIVIDEND ────────────────────────────────────────────────────────────────
const D = "Latest Dividend · Historical latest · yfinance · ";
const U = "Upcoming Dividend · Upcoming only · yfinance · ";
const val = (row: JsonRecord | undefined, k: string) => { const v = row?.[k]; return v == null || v === "-" || v === "" ? null : v; };

export function DividendPanel({ row }: { row?: JsonRecord }) {
  const latY = val(row, D + "Year"), latIdr = asNumber(val(row, D + "Dividend (IDR)")), latYld = asNumber(val(row, D + "Dividend Yield (%)")), latPayout = asNumber(val(row, D + "Payout Ratio (%)")), latEx = val(row, D + "Ex Date"), latPay = val(row, D + "Pay Date");
  const upY = val(row, U + "Year"), upIdr = asNumber(val(row, U + "Dividend (IDR)")), upYld = asNumber(val(row, U + "Dividend Yield (%)")), upEx = val(row, U + "Ex Date"), upPay = val(row, U + "Pay Date");
  const hasLatest = latIdr != null || latY != null;
  const hasUpcoming = upIdr != null || upEx != null;
  return (
    <Card>
      <CardHeader kicker="Dividend" title="Distributions" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", color: "var(--faint)", marginBottom: 2 }}>LATEST · {latY ? String(latY) : "—"}</div>
          {hasLatest ? (<>
            <Row label="Dividend / share">{latIdr == null ? <NoData /> : `Rp ${formatNumber(latIdr, 0)}`}</Row>
            <Row label="Yield">{latYld == null ? <NoData /> : `${(latYld * 100).toFixed(2)}%`}</Row>
            <Row label="Payout ratio">{latPayout == null ? <NoData /> : `${(latPayout * 100).toFixed(1)}%`}</Row>
            <Row label="Ex-date">{latEx == null ? <NoData /> : String(latEx)}</Row>
            <Row label="Pay-date">{latPay == null ? <NoData /> : String(latPay)}</Row>
          </>) : <div style={{ padding: "8px 0" }}><NoData /></div>}
        </div>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".08em", color: "var(--faint)", marginBottom: 2 }}>UPCOMING · {upY ? String(upY) : "—"}</div>
          {hasUpcoming ? (<>
            <Row label="Dividend / share">{upIdr == null ? <NoData /> : `Rp ${formatNumber(upIdr, 0)}`}</Row>
            <Row label="Yield">{upYld == null ? <NoData /> : `${(upYld * 100).toFixed(2)}%`}</Row>
            <Row label="Ex-date">{upEx == null ? <NoData /> : String(upEx)}</Row>
            <Row label="Pay-date">{upPay == null ? <NoData /> : String(upPay)}</Row>
          </>) : <div style={{ padding: "8px 0", fontSize: 11.5, color: "var(--faint)" }}>No upcoming dividend announced in the feed.</div>}
        </div>
      </div>
    </Card>
  );
}

// ── RETURNS vs SECTOR & IHSG ─────────────────────────────────────────────────
function windowReturn(rows: Array<{ date: string; close: number }>, bars: number): number | null {
  if (rows.length < 2) return null;
  const last = rows[rows.length - 1];
  const prevIdx = bars === -1 ? rows.findIndex((r) => r.date >= `${last.date.slice(0, 4)}-01-01`) : rows.length - 1 - bars;
  const prev = rows[Math.max(0, prevIdx)];
  if (!prev || !prev.close) return null;
  return last.close / prev.close - 1;
}
export function ReturnsPanel({ ohlcv, ihsg, sectorLabel }: { ohlcv: OhlcvPayload | null; ihsg: Array<{ date: string; close: number }>; sectorLabel?: string }) {
  const tRows = (ohlcv?.rows || []).map((r) => ({ date: String(r.date), close: Number(r.close) })).filter((r) => isFinite(r.close));
  const windows: Array<[string, number]> = [["1M", 21], ["3M", 63], ["YTD", -1]];
  return (
    <Card>
      <CardHeader kicker="Returns · vs IHSG" title="Relative performance" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {windows.map(([label, bars]) => {
          const tr = windowReturn(tRows, bars), br = windowReturn(ihsg, bars);
          const rel = tr != null && br != null ? tr - br : null;
          return (
            <div key={label} style={{ background: "var(--soft)", border: "1px solid var(--hair)", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: "var(--faint)" }}>{label}</div>
              <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: pol(tr), marginTop: 3 }}>{tr == null ? "—" : pct(tr)}</div>
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>IHSG {br == null ? "—" : pct(br)}</div>
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: pol(rel) }}>{rel == null ? "" : `${rel >= 0 ? "+" : "−"}${(Math.abs(rel) * 100).toFixed(1)}pp vs mkt`}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 8 }}>Ticker EOD vs IHSG over the same window{sectorLabel ? ` · sector: ${sectorLabel}` : ""}. Sector-index return not wired — shown vs IHSG only.</div>
    </Card>
  );
}

// ── PEERS (same IDX sector, by market cap) ───────────────────────────────────
export function PeersPanel({ ticker, ownership, bundle, kseiRecords, onOpen }: { ticker: string; ownership?: KseiIssuer; bundle: ResearchBundle | null; kseiRecords: KseiIssuer[]; onOpen: (t: string) => void }) {
  const sectorRaw = ownership?.idxSectorRaw;
  const peers = (() => {
    if (!sectorRaw || sectorRaw === "-" || !bundle) return [];
    // Same IDX sector via KSEI's idxSectorRaw (the workbook "IDX Sector" is often
    // blank); market cap + change from the fundamentals bundle.
    const rows: Array<{ ticker: string; name: string; mcap: number; chg: number | null }> = [];
    kseiRecords.forEach((k) => {
      if (k.ticker === ticker || k.idxSectorRaw !== sectorRaw) return;
      const f = bundle.fundamentals.get(k.ticker);
      const mcap = f ? asNumber(f["Market Cap"]) : null;
      if (mcap == null) return;
      rows.push({ ticker: k.ticker, name: bundle.technical.get(k.ticker)?.companyName || k.companyName || k.ticker, mcap, chg: f ? asNumber(f["Price Change %"]) : null });
    });
    return rows.sort((a, b) => b.mcap - a.mcap).slice(0, 6);
  })();
  return (
    <Card>
      <CardHeader kicker="Peers" title="Same-sector, by market cap" />
      {peers.length ? (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {peers.map((p, i) => (
            <button key={p.ticker} type="button" onClick={() => onOpen(p.ticker)} style={{ display: "grid", gridTemplateColumns: "64px 1fr 90px 64px", alignItems: "center", gap: 8, padding: "8px 0", borderTop: i ? "1px solid var(--hair)" : "none", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", color: "var(--text)" }}>
              <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: 12.5, color: "var(--accent)" }}>{p.ticker}</span>
              <span style={{ fontSize: 11.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, textAlign: "right" }}>Rp {p.mcap >= 1000 ? `${formatNumber(p.mcap / 1000, 1)} T` : `${formatNumber(p.mcap, 1)} B`}</span>
              <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, textAlign: "right", color: pol(p.chg) }}>{p.chg == null ? "—" : pct(p.chg)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: "var(--faint)", padding: "6px 0" }}>Sector not classified in the workbook for {ticker} — peer set unavailable (no data).</div>
      )}
    </Card>
  );
}

// ── FILINGS & DISCLOSURES (real corp actions from the workbook) ──────────────
export function FilingsPanel({ ticker, bundle }: { ticker: string; bundle: ResearchBundle | null }) {
  const rows = newsDisclosures(bundle).filter((d) => d.ticker === ticker);
  return (
    <Card>
      <CardHeader kicker="Filings & Disclosures" title="Corporate actions" />
      {rows.length ? (
        rows.slice(0, 8).map((d, i) => (
          <div key={i} style={{ padding: "8px 0", borderTop: i ? "1px solid var(--hair)" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)", background: "var(--soft)", borderRadius: 5, padding: "2px 6px" }}>{d.category}</span>
              {d.when ? <span style={{ fontSize: 10, color: "var(--faint)" }}>{d.when}</span> : null}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>{d.title}</div>
          </div>
        ))
      ) : (
        <div style={{ fontSize: 11.5, color: "var(--faint)", padding: "6px 0" }}>No corporate actions flagged for {ticker} in this snapshot.</div>
      )}
      <div style={{ marginTop: 8 }}><Provenance source="Workbook · Corp. Action column" asOf="" /></div>
    </Card>
  );
}
