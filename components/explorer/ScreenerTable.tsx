"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import type { ScreenerRow } from "@/lib/domain/types";
import { asNumber, formatNumber, formatPercent, formatPrice } from "@/lib/format/number";

type SortKey = "ticker" | "price" | "chg" | "rvol";
type SortDir = "asc" | "desc";

const MONO = "var(--mono, var(--font-mono))";
const rsOf = (r: ScreenerRow) => asNumber(r.raw["RS Rating"] ?? r.raw.rsRating);
const sectorShort = (code: string) => code.replace(/^IDX/i, "").toUpperCase() || "—";
const chgColor = (v: number | null) => (v === null || v === 0 ? "var(--muted)" : v > 0 ? "var(--up)" : "var(--down)");

const TH: CSSProperties = { padding: "4px 8px 11px", textAlign: "right", cursor: "pointer", whiteSpace: "nowrap" };
const TD: CSSProperties = { padding: "11px 8px", fontFamily: MONO, fontSize: 12 };

export function ScreenerTable({ rows }: { rows: ScreenerRow[] }) {
  const { openTicker, toggleWatchlist, isWatched } = useApp();
  const [sortKey, setSortKey] = useState<SortKey | null>("chg");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const acc: Record<SortKey, (r: ScreenerRow) => number | string | null> = {
      ticker: (r) => r.ticker,
      price: (r) => r.price,
      chg: (r) => r.changePct,
      rvol: (r) => r.rvol,
    };
    const get = acc[sortKey];
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a), bv = get(b);
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  function toggle(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  }
  const caret = (k: SortKey) => (sortKey === k ? (sortDir === "asc" ? " ↑" : " ↓") : "");

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))", overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1280 }}>
          <thead>
            <tr>
              <th colSpan={6} style={{ textAlign: "left", padding: "11px 16px 5px", fontSize: 9.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>STOCK INFO</th>
              <th colSpan={10} style={{ textAlign: "left", padding: "11px 16px 5px", fontSize: 9.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--accent)", borderLeft: "1px solid var(--hair)" }}>PRICE ACTION</th>
            </tr>
            <tr style={{ color: "var(--muted)", fontSize: 10.5, borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "4px 6px 11px 16px", width: 34 }} />
              <th onClick={() => toggle("ticker")} style={{ ...TH, textAlign: "left" }}>Ticker{caret("ticker")}</th>
              <th style={{ padding: "4px 8px 11px", textAlign: "left" }}>Emiten</th>
              <th style={{ padding: "4px 8px 11px", textAlign: "left" }}>Sector</th>
              <th style={{ padding: "4px 8px 11px", textAlign: "left" }}>Industry</th>
              <th style={{ padding: "4px 8px 11px", textAlign: "right" }}>RS</th>
              <th onClick={() => toggle("price")} style={{ ...TH, borderLeft: "1px solid var(--hair)" }}>Price{caret("price")}</th>
              <th onClick={() => toggle("chg")} style={TH}>Chg %{caret("chg")}</th>
              <th style={{ padding: "4px 8px 11px", textAlign: "right" }}>IHSG β</th>
              <th onClick={() => toggle("rvol")} style={TH}>RVOL{caret("rvol")}</th>
              <th style={{ padding: "4px 8px 11px", textAlign: "right" }}>Score</th>
              <th style={{ padding: "4px 8px 11px", textAlign: "center" }}>SMC</th>
              <th style={{ padding: "4px 8px 11px", textAlign: "center" }}>VWAP</th>
              <th style={{ padding: "4px 8px 11px", textAlign: "center" }}>MP</th>
              <th style={{ padding: "4px 8px 11px", textAlign: "center" }}>MA</th>
              <th style={{ padding: "4px 16px 11px 8px", textAlign: "center" }}>Summary</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const rs = rsOf(r);
              const watched = isWatched(r.ticker);
              const pick = () => openTicker(r.ticker);
              return (
                <tr key={`${r.ticker}-${i}`} style={{ borderTop: "1px solid var(--hair)", cursor: "pointer", background: i % 2 ? "var(--softer)" : "transparent" }}>
                  <td style={{ padding: "11px 6px 11px 16px", textAlign: "center" }}>
                    <span onClick={() => toggleWatchlist(r.ticker)} style={{ fontSize: 15, color: watched ? "var(--accent)" : "var(--faint)", cursor: "pointer" }} title={watched ? "Unwatch" : "Watch"}>{watched ? "★" : "☆"}</span>
                  </td>
                  <td onClick={pick} style={{ ...TD, fontWeight: 700, fontSize: 12.5 }}>{r.ticker}</td>
                  <td onClick={pick} style={{ padding: "11px 8px", fontSize: 11.5, color: "var(--muted)", maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.companyName}</td>
                  <td onClick={pick} style={{ padding: "11px 8px" }}><span style={{ fontSize: 10, background: "var(--soft)", padding: "3px 7px", borderRadius: 6, color: "var(--muted)", whiteSpace: "nowrap" }}>{sectorShort(r.idxSectorRaw)}</span></td>
                  <td onClick={pick} style={{ padding: "11px 8px", fontSize: 11, color: "var(--muted)" }}>{r.industry}</td>
                  <td onClick={pick} style={{ padding: "11px 8px", textAlign: "right" }}><span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: rs === null ? "var(--muted)" : "var(--text)" }}>{rs === null ? "—" : formatNumber(rs, 0)}</span></td>
                  <td onClick={pick} style={{ ...TD, textAlign: "right", borderLeft: "1px solid var(--hair)" }}>{r.price === null ? "—" : formatPrice(r.price)}</td>
                  <td onClick={pick} style={{ ...TD, textAlign: "right", fontWeight: 600, color: chgColor(r.changePct) }}>{r.changePct === null ? "—" : formatPercent(r.changePct)}</td>
                  <td onClick={pick} style={{ padding: "11px 8px", textAlign: "right", fontFamily: MONO, fontSize: 11.5, color: "var(--muted)" }}>{r.beta === null ? "—" : formatNumber(r.beta, 2)}</td>
                  <td onClick={pick} style={{ padding: "11px 8px", textAlign: "right", fontFamily: MONO, fontSize: 11.5, color: chgColor((r.rvol ?? 0) - 1) }}>{r.rvol === null ? "—" : formatNumber(r.rvol, 2)}</td>
                  <td onClick={pick} style={{ padding: "11px 8px", textAlign: "right" }}><span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)" }} title="Conviction score — no backing field in dataset (see DATA_GAPS.md)">—</span></td>
                  <td onClick={pick} style={{ padding: "11px 8px", textAlign: "center", fontSize: 10, color: "var(--muted)", fontWeight: 600 }}>{r.smc}</td>
                  <td onClick={pick} style={{ padding: "11px 8px", textAlign: "center", fontSize: 10, color: "var(--muted)" }}>{r.vwapZone}</td>
                  <td onClick={pick} style={{ padding: "11px 8px", textAlign: "center", fontSize: 10, color: "var(--muted)" }}>{r.marketProfileZone}</td>
                  <td onClick={pick} style={{ padding: "11px 8px", textAlign: "center", fontSize: 10, color: "var(--muted)" }}>{r.maZone}</td>
                  <td onClick={pick} style={{ padding: "11px 16px 11px 8px", textAlign: "center" }}><span style={{ fontSize: 10, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: "var(--accentSoft)", color: "var(--accent)", whiteSpace: "nowrap" }}>{r.signalLabel}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
