"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Modal } from "@/components/shared/Modal";
import { kseiSectorMap } from "@/lib/data/ksei";
import { loadUniverse, setupByKey, type Tone, type Universe, type UniverseRow } from "@/lib/data/screenerUniverse";
import { formatPercent, formatPrice } from "@/lib/format/number";

/** Advancers / Decliners / Unchanged, expanded into a page-sized popup with a
    bucket switcher and a Screener-style table (setup badges, trend/structure/
    VWAP/liquidity reads, entry/invalidation/target/R:R) — not just a bare
    ticker list. Rows join against the same scanned screener universe the
    Screener page uses; a ticker outside that scan still lists (price/chg are
    always real, from the technical map) but its screener-only columns read an
    explicit "no data" rather than a guess. */

export type MoveRow = { ticker: string; companyName: string; sector: string; price: number | null; changePct: number | null };
export type MoversBucket = "advancers" | "decliners" | "unchanged";

const MONO = "var(--font-mono)";
const KICKER: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)" };
const GRID = "128px 148px 1fr 1fr 1fr 1fr 72px 72px 72px 52px 74px 74px";

const BUCKET_META: Record<MoversBucket, { label: string; color: string }> = {
  advancers: { label: "ADVANCERS", color: "var(--up)" },
  decliners: { label: "DECLINERS", color: "var(--down)" },
  unchanged: { label: "UNCHANGED", color: "var(--flat)" },
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

export function MoversExplorer({ initialBucket, lists, marketDate, onClose }: {
  initialBucket: MoversBucket;
  lists: Record<MoversBucket, MoveRow[]>;
  marketDate: string;
  onClose: () => void;
}) {
  const { openTicker, ksei } = useApp();
  const [bucket, setBucket] = useState<MoversBucket>(initialBucket);
  const [search, setSearch] = useState("");
  const [universe, setUniverse] = useState<Universe | null>(null);

  useEffect(() => {
    if (!marketDate) return;
    let cancelled = false;
    loadUniverse(marketDate).then((u) => !cancelled && setUniverse(u)).catch(() => {});
    return () => { cancelled = true; };
  }, [marketDate]);

  const kseiSec = useMemo(() => kseiSectorMap(ksei), [ksei]);
  const universeByTicker = useMemo(() => {
    const m = new Map<string, UniverseRow>();
    (universe?.rows || []).forEach((r) => m.set(r.ticker, r));
    return m;
  }, [universe]);

  const rows = useMemo(() => {
    const needle = search.trim().toUpperCase();
    const list = lists[bucket];
    return needle ? list.filter((r) => r.ticker.includes(needle) || r.companyName.toUpperCase().includes(needle)) : list;
  }, [lists, bucket, search]);

  function jump(ticker: string) {
    onClose();
    openTicker(ticker);
  }

  const headers = ["TICKER", "SETUP", "TREND", "STRUCTURE", "VWAP", "LIQUIDITY", "ENTRY", "INVALID.", "TARGET", "R:R", "PRICE", "CHG"];

  return (
    <Modal title="Market Movers" kicker={`${marketDate} · scanned universe joined where available`} onClose={onClose} maxWidth={1180}>
      {/* bucket bubbles */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {(Object.keys(BUCKET_META) as MoversBucket[]).map((b) => {
          const on = bucket === b;
          const meta = BUCKET_META[b];
          return (
            <button key={b} type="button" onClick={() => setBucket(b)}
              style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 999, border: `1.5px solid ${on ? meta.color : "var(--border)"}`, cursor: "pointer", background: on ? meta.color : "var(--panel)", color: on ? "#fff" : "var(--muted)" }}>
              {meta.label} <span style={{ fontFamily: MONO, opacity: on ? 0.9 : 0.7 }}>{lists[b].length}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, border: "1px solid var(--border)", borderRadius: 10, padding: "7px 11px", background: "var(--panel)" }}>
          <span style={{ color: "var(--faint)", fontSize: 13 }}>⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter ticker or company…" aria-label="Filter movers" style={{ border: "none", outline: "none", background: "transparent", fontFamily: MONO, fontSize: 12, color: "var(--text)", width: 180 }} />
        </div>
      </div>

      {/* table */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 1120 }}>
            <div style={{ position: "sticky", top: 0, zIndex: 5, display: "grid", gridTemplateColumns: GRID, background: "var(--soft)", borderBottom: "1px solid var(--border)" }}>
              {headers.map((h, i) => (
                <div key={h} style={{ padding: "9px 11px", fontSize: 9, fontWeight: 700, letterSpacing: ".06em", color: "var(--faint)", textAlign: i >= 6 ? "right" : "left" }}>{h}</div>
              ))}
            </div>
            <div style={{ maxHeight: 420, overflowY: "auto" }}>
              {!rows.length ? (
                <div style={{ padding: 40, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>No tickers in this bucket{search ? " matching your filter" : ""}.</div>
              ) : null}
              {rows.map((mr) => {
                const ur = universeByTicker.get(mr.ticker);
                const sector = kseiSec.get(mr.ticker)?.label || mr.sector;
                const chgColor = (mr.changePct ?? 0) > 0 ? "var(--up)" : (mr.changePct ?? 0) < 0 ? "var(--down)" : "var(--flat)";
                return (
                  <div key={mr.ticker} role="button" tabIndex={0} onClick={() => jump(mr.ticker)} onKeyDown={(e) => { if (e.key === "Enter") jump(mr.ticker); }}
                    style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: "1px solid var(--hair)", background: ur?.hasEngineSetup ? "var(--accentSoft)" : "var(--panel)", cursor: "pointer" }}>
                    <div style={{ padding: "9px 11px", borderRight: "1px solid var(--hair)" }}>
                      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800 }}>{mr.ticker}</div>
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
                    <div style={{ padding: "9px 8px", textAlign: "right" }}><span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "var(--text)" }}>{mr.price == null ? "—" : formatPrice(mr.price)}</span></div>
                    <div style={{ padding: "9px 8px", textAlign: "right" }}>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: chgColor }}>
                        {ur ? formatPercent(ur.chg) : mr.changePct == null ? "—" : `${mr.changePct > 0 ? "+" : ""}${mr.changePct.toFixed(2)}%`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 12, lineHeight: 1.5 }}>
        Setup/Trend/Structure/VWAP/Liquidity/Entry/Invalidation/Target/R:R come from the same scanned Screener universe — a ticker outside that scan still lists here (price &amp; change are always real) but those columns read &ldquo;no data&rdquo; rather than a guess. Click a row to open its research page.
      </div>
    </Modal>
  );
}
