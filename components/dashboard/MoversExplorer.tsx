"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Modal } from "@/components/shared/Modal";
import { UniverseTable, type UniverseTableRow } from "@/components/shared/UniverseTable";
import { kseiSectorMap } from "@/lib/data/ksei";
import { loadUniverse, type Universe, type UniverseRow } from "@/lib/data/screenerUniverse";
import { formatPrice } from "@/lib/format/number";

/** Advancers / Decliners / Unchanged, expanded into a page-sized popup with a
    bucket switcher and the same Screener-style table every other ticker-list
    popup uses (see UniverseTable) — not a bespoke mini-list. Rows join
    against the same scanned screener universe the Screener page uses; a
    ticker outside that scan still lists (price/chg are always real, from the
    technical map) but its screener-only columns read an explicit "no data"
    rather than a guess. */

export type MoveRow = { ticker: string; companyName: string; sector: string; price: number | null; changePct: number | null };
export type MoversBucket = "advancers" | "decliners" | "unchanged";

const MONO = "var(--font-mono)";

const BUCKET_META: Record<MoversBucket, { label: string; color: string }> = {
  advancers: { label: "ADVANCERS", color: "var(--up)" },
  decliners: { label: "DECLINERS", color: "var(--down)" },
  unchanged: { label: "UNCHANGED", color: "var(--flat)" },
};

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
  const priceByTicker = useMemo(() => {
    const m = new Map<string, number | null>();
    lists.advancers.concat(lists.decliners, lists.unchanged).forEach((r) => m.set(r.ticker, r.price));
    return m;
  }, [lists]);

  const rows = useMemo(() => {
    const needle = search.trim().toUpperCase();
    const list = lists[bucket];
    const filtered = needle ? list.filter((r) => r.ticker.includes(needle) || r.companyName.toUpperCase().includes(needle)) : list;
    return filtered.map((mr): UniverseTableRow => ({ ticker: mr.ticker, sector: kseiSec.get(mr.ticker)?.label || mr.sector, chg: mr.changePct, ur: universeByTicker.get(mr.ticker) }));
  }, [lists, bucket, search, kseiSec, universeByTicker]);

  function jump(ticker: string) {
    onClose();
    openTicker(ticker);
  }

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

      <UniverseTable
        rows={rows}
        onOpenTicker={jump}
        emptyLabel={`No tickers in this bucket${search ? " matching your filter" : ""}.`}
        extraColumn={{
          header: "PRICE",
          render: (row) => {
            const v = priceByTicker.get(row.ticker) ?? null;
            return <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "var(--text)" }}>{v == null ? "—" : formatPrice(v)}</span>;
          },
        }}
      />
      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 12, lineHeight: 1.5 }}>
        Setup/Trend/Structure/VWAP/Liquidity/Entry/Invalidation/Target/R:R/Chg come from the same scanned Screener universe — a ticker outside that scan still lists here (price is always real) but those columns read &ldquo;no data&rdquo; rather than a guess. Click a row to open its research page.
      </div>
    </Modal>
  );
}
