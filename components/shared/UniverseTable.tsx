"use client";

import type { CSSProperties, ReactNode } from "react";
import { setupByKey, type Tone, type UniverseRow } from "@/lib/data/screenerUniverse";
import { formatPercent, formatPrice } from "@/lib/format/number";

/** The Screener page's own row design (setup badges, trend/structure/VWAP/
    liquidity reads, entry/invalidation/target/R:R, change), reused as one
    shared component everywhere a popup lists tickers — Market Movers, New
    Highs/Lows, and a Konglo/Sectoral index's constituents — so every one of
    those popups shows the same information the same way, not a bespoke
    mini-list per popup. A ticker outside the scanned screener universe
    (`ur` absent) still lists — its own price/change fallback still renders —
    but the screener-only columns read an explicit "no data" rather than a
    guess. `extraColumn` adds one context-specific trailing column (e.g. a
    52-week bound for New Highs/Lows, or market cap for an index's
    constituents) without turning this into a fully generic table. */

const MONO = "var(--font-mono)";
const GRID_BASE = "128px 148px 1fr 1fr 1fr 1fr 72px 72px 72px 52px 74px";

export type UniverseTableRow = {
  ticker: string;
  /** Fallback sector label, used only when `ur` is absent. */
  sector?: string;
  /** Fallback change ratio (0.0176 = +1.76%), used only when `ur` is absent
      — a ticker outside the scanned screener universe can still have a real,
      published price change from the technical map. */
  chg?: number | null;
  ur?: UniverseRow;
};

export type UniverseTableExtraColumn = {
  header: string;
  width?: string;
  align?: "left" | "right";
  render: (row: UniverseTableRow) => ReactNode;
};

function toneColor(t: Tone): string {
  return t === "up" ? "var(--up)" : t === "down" ? "var(--down)" : "var(--flat)";
}

function SignalCell({ c }: { c: UniverseRow["cellTrend"] }) {
  if (!c.available) return <span style={{ fontSize: 10, color: "var(--faint)", fontStyle: "italic" }}>no data</span>;
  return (
    <div title={c.raw}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: toneColor(c.tone), flex: "none" }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: toneColor(c.tone), lineHeight: 1.25 }}>{c.tone === "up" ? "▲ " : c.tone === "down" ? "▼ " : ""}{c.label}</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", marginTop: 1 }}>{c.val}{c.proxy ? " · proxy" : ""}</div>
    </div>
  );
}

function MoneyCell({ v, color }: { v: number | null; color: string }) {
  return <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: v == null ? "var(--faint)" : color }}>{v == null ? "—" : formatPrice(v)}</span>;
}

export function UniverseTable({ rows, onOpenTicker, emptyLabel = "No tickers.", extraColumn }: {
  rows: UniverseTableRow[];
  onOpenTicker: (t: string) => void;
  emptyLabel?: string;
  extraColumn?: UniverseTableExtraColumn;
}) {
  const grid = extraColumn ? `${GRID_BASE} ${extraColumn.width || "90px"}` : GRID_BASE;
  const headers = ["TICKER", "SETUP", "TREND", "STRUCTURE", "VWAP", "LIQUIDITY", "ENTRY", "INVALID.", "TARGET", "R:R", "CHG", ...(extraColumn ? [extraColumn.header] : [])];
  const minWidth = extraColumn ? 1040 : 950;

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth }}>
          <div style={{ position: "sticky", top: 0, zIndex: 5, display: "grid", gridTemplateColumns: grid, background: "var(--soft)", borderBottom: "1px solid var(--border)" }}>
            {headers.map((h, i) => (
              <div key={h} style={{ padding: "9px 11px", fontSize: 9, fontWeight: 700, letterSpacing: ".06em", color: "var(--faint)", textAlign: i >= 6 ? "right" : "left" }}>{h}</div>
            ))}
          </div>
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {!rows.length ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>{emptyLabel}</div>
            ) : null}
            {rows.map((row) => {
              const ur = row.ur;
              const sector = ur?.sectorLabel || row.sector || "Others";
              const chg = ur ? ur.chg : row.chg ?? null;
              const chgColor = chg == null ? "var(--faint)" : chg > 0 ? "var(--up)" : chg < 0 ? "var(--down)" : "var(--flat)";
              return (
                <div key={row.ticker} role="button" tabIndex={0} onClick={() => onOpenTicker(row.ticker)} onKeyDown={(e) => { if (e.key === "Enter") onOpenTicker(row.ticker); }}
                  style={{ display: "grid", gridTemplateColumns: grid, borderBottom: "1px solid var(--hair)", background: ur?.hasEngineSetup ? "var(--accentSoft)" : "var(--panel)", cursor: "pointer" }}>
                  <div style={{ padding: "9px 11px", borderRight: "1px solid var(--hair)" }}>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800 }}>{row.ticker}</div>
                    <div style={{ fontSize: 9, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sector}</div>
                  </div>
                  <div style={{ padding: "9px 11px", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                    {ur ? (
                      ur.setupsMatched.length ? ur.setupsMatched.slice(0, 3).map((k) => {
                        const s = setupByKey(k);
                        return <span key={k} title={s?.label} style={{ fontSize: 9, fontWeight: 700, color: "var(--up)", background: "var(--upSoft)", borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap" }}>{s ? s.label.split(" ")[0] : k}</span>;
                      }) : <span style={{ fontSize: 9.5, color: "var(--faint)" }}>—</span>
                    ) : <span style={{ fontSize: 10, color: "var(--faint)", fontStyle: "italic" }}>no data</span>}
                  </div>
                  {ur ? [ur.cellTrend, ur.cellStructure, ur.cellVwap, ur.cellLiquidity].map((c, i) => (
                    <div key={i} style={{ padding: "9px 11px" }}><SignalCell c={c} /></div>
                  )) : Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} style={{ padding: "9px 11px" }}><span style={{ fontSize: 10, color: "var(--faint)", fontStyle: "italic" }}>no data</span></div>
                  ))}
                  <div style={{ padding: "9px 8px", textAlign: "right" }}><MoneyCell v={ur?.entry ?? null} color="var(--muted)" /></div>
                  <div style={{ padding: "9px 8px", textAlign: "right" }}><MoneyCell v={ur?.invalidation ?? null} color="var(--down)" /></div>
                  <div style={{ padding: "9px 8px", textAlign: "right" }}><MoneyCell v={ur?.target ?? null} color="var(--up)" /></div>
                  <div style={{ padding: "9px 8px", textAlign: "right" }}><span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: ur?.rr && ur.rr >= 2 ? "var(--up)" : "var(--muted)" }}>{ur?.rr == null ? "—" : `${ur.rr.toFixed(1)}×`}</span></div>
                  <div style={{ padding: "9px 8px", textAlign: "right" }}><span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: chgColor }}>{chg == null ? "—" : formatPercent(chg)}</span></div>
                  {extraColumn ? <div style={{ padding: "9px 8px", textAlign: extraColumn.align || "right" }}>{extraColumn.render(row)}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
