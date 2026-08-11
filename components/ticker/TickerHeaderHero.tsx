"use client";

import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import type { JsonRecord, TechnicalRecord } from "@/lib/domain/types";
import { asNumber, formatNumber, formatPercent, formatPrice } from "@/lib/format/number";

const MONO = "var(--font-mono)";
const chgColor = (v: number | null | undefined) => (v == null || v === 0 ? "var(--flat)" : v > 0 ? "var(--up)" : "var(--down)");
const glyph = (v: number | null | undefined) => (v == null || v === 0 ? "•" : v > 0 ? "▲" : "▼");

/** Rp market cap (stored in Rp bn) → "Rp 445,7 T" / "Rp 68,9 B". */
function fmtMcap(bn: number | null): string {
  if (bn == null) return "—";
  if (bn >= 1000) return `Rp ${formatNumber(bn / 1000, 1)} T`;
  return `Rp ${formatNumber(bn, 1)} B`;
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--faint)" }}>{label}</div>
    <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, marginTop: 3, whiteSpace: "nowrap" }}>{value}</div>
  </div>
);

const KICKER: CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--faint)" };

/** Ticker identity + 52-week range slider + key-stat tiles. */
export function TickerHeaderHero({ ticker, stock, fundamental, marketDate }: {
  ticker: string; stock?: TechnicalRecord; fundamental?: JsonRecord; marketDate: string;
}) {
  const f = fundamental;
  const price = stock?.lastPrice ?? asNumber(f?.["Price"]) ?? null;
  const chg = stock?.changePercent ?? asNumber(f?.["Price Change %"]) ?? null;
  const low = asNumber(f?.["52 Week Low"]);
  const high = asNumber(f?.["52 Week High"]);
  const pos = price != null && low != null && high != null && high > low ? (price - low) / (high - low) : null;

  const mcap = fmtMcap(asNumber(f?.["Market Cap"]));
  const pe = asNumber(f?.["Current PE Ratio (TTM)"]);
  const roe = asNumber(f?.["Return on Equity (TTM)"]);
  const dy = asNumber(f?.["Latest Dividend · Historical latest · yfinance · Dividend Yield (%)"]);
  const ff = asNumber(f?.["Free Float (%)"]);
  const rvol = stock?.rvol ?? asNumber(f?.["RVOL"]);

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))", padding: "18px 20px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800, letterSpacing: "-.01em" }}>{ticker}</span>
            {stock?.sector ? <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 999, padding: "3px 9px" }}>{stock.sector}</span> : null}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{stock?.companyName || "Company profile unavailable"}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, justifyContent: "flex-end" }}>
            <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{price == null ? "—" : formatPrice(price)}</span>
            <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: chgColor(chg) }}>{glyph(chg)} {chg == null ? "—" : formatPercent(chg)}</span>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 4 }}>
            Close · {marketDate} · <a href={`https://www.tradingview.com/symbols/IDX-${ticker}/`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>TradingView ↗</a>
          </div>
        </div>
      </div>

      {/* 52-week range slider */}
      {pos != null ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={KICKER}>52-WEEK RANGE</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)" }}>{Math.round(pos * 100)}% of range{low != null && price != null ? ` · ${Math.round((price / low - 1) * 100)}% off low` : ""}</span>
          </div>
          <div style={{ position: "relative", height: 8, background: "linear-gradient(90deg,var(--downSoft),var(--soft),var(--upSoft))", borderRadius: 5, border: "1px solid var(--border)" }}>
            <div style={{ position: "absolute", top: "50%", left: `${Math.max(0, Math.min(100, pos * 100))}%`, transform: "translate(-50%,-50%)", width: 4, height: 18, background: "var(--text)", borderRadius: 3 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10.5, color: "var(--faint)", marginTop: 5 }}>
            <span>{low == null ? "—" : formatNumber(low, 0)} low</span>
            <span>{high == null ? "—" : formatNumber(high, 0)} high</span>
          </div>
        </div>
      ) : null}

      {/* key-stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(96px,1fr))", gap: "12px 20px", marginTop: 16, borderTop: "1px solid var(--hair)", paddingTop: 14 }}>
        <Stat label="MKT CAP" value={mcap} />
        <Stat label="PE (TTM)" value={pe == null ? "—" : `${formatNumber(pe, 1)}×`} />
        <Stat label="ROE" value={roe == null ? "—" : formatPercent(roe).replace("+", "")} />
        <Stat label="DIV YIELD" value={dy == null ? "—" : formatPercent(dy).replace("+", "")} />
        <Stat label="FREE FLOAT" value={ff == null ? "—" : formatPercent(ff).replace("+", "")} />
        <Stat label="RVOL" value={rvol == null ? "—" : `${formatNumber(rvol, 1)}×`} />
      </div>
    </div>
  );
}
