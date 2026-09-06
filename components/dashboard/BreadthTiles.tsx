"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Modal } from "@/components/shared/Modal";
import { UniverseTable, type UniverseTableRow } from "@/components/shared/UniverseTable";
import { kseiSectorMap } from "@/lib/data/ksei";
import { loadUniverse, type Universe, type UniverseRow } from "@/lib/data/screenerUniverse";
import { MoversExplorer, type MoveRow, type MoversBucket } from "./MoversExplorer";
import { asNumber, formatNumber, formatPercent, formatPrice } from "@/lib/format/number";

/** Breadth tiles (DESIGN_SPEC §3.2). Advancers / Decliners / Unchanged and New
    Highs / New Lows each open a page-sized popup with a bucket switcher and
    the same Screener-style table (see UniverseTable) — one shared design for
    every ticker-list popup on this page, not a bespoke mini-list per tile.
    Up/Down Volume stays a standalone, non-clickable tile. Every count and
    every listed ticker is read from published fields — a tile or list with
    no usable field reads `no data` / "no tickers" rather than a fabricated
    zero. */

const CARD: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r)",
  padding: "14px 16px",
  boxShadow: "var(--sh, var(--shadow))",
};

const KICKER: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const MONO = "var(--font-mono)";
/** Same bare-chevron affordance the KONGLO/SECTORAL index series rows use for
    "open detail" — swapped in here for the old "VIEW TICKERS →" text badge
    so every "this opens a ticker-list popup" hint reads the same way. */
const OPEN_CHEVRON: CSSProperties = { fontSize: 13, color: "var(--faint)", fontWeight: 700 };

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

type BoundRow = { ticker: string; companyName: string; sector: string; price: number; bound: number; distancePct: number };
type HLBucket = "highs" | "lows";

const HL_META: Record<HLBucket, { label: string; color: string }> = {
  highs: { label: "NEW HIGHS", color: "var(--up)" },
  lows: { label: "NEW LOWS", color: "var(--down)" },
};

function NewHighLowModal({ newHighs, newLows, marketDate, onClose }: {
  newHighs: BoundRow[]; newLows: BoundRow[]; marketDate: string; onClose: () => void;
}) {
  const { openTicker } = useApp();
  const [bucket, setBucket] = useState<HLBucket>("highs");
  const [universe, setUniverse] = useState<Universe | null>(null);

  useEffect(() => {
    if (!marketDate) return;
    let cancelled = false;
    loadUniverse(marketDate).then((u) => !cancelled && setUniverse(u)).catch(() => {});
    return () => { cancelled = true; };
  }, [marketDate]);

  const universeByTicker = useMemo(() => {
    const m = new Map<string, UniverseRow>();
    (universe?.rows || []).forEach((r) => m.set(r.ticker, r));
    return m;
  }, [universe]);

  const lists: Record<HLBucket, BoundRow[]> = { highs: newHighs, lows: newLows };
  const boundByTicker = useMemo(() => {
    const m = new Map<string, BoundRow>();
    lists[bucket].forEach((r) => m.set(r.ticker, r));
    return m;
  }, [lists, bucket]);

  const rows: UniverseTableRow[] = lists[bucket].map((r) => ({ ticker: r.ticker, sector: r.sector, ur: universeByTicker.get(r.ticker) }));

  function jump(ticker: string) {
    onClose();
    openTicker(ticker);
  }

  return (
    <Modal title="New Highs / New Lows" kicker={`${marketDate} · price at or through its 52-week bound`} onClose={onClose} maxWidth={1180}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {(Object.keys(HL_META) as HLBucket[]).map((b) => {
          const on = bucket === b;
          const meta = HL_META[b];
          return (
            <button key={b} type="button" onClick={() => setBucket(b)}
              style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, padding: "8px 14px", borderRadius: 999, border: `1.5px solid ${on ? meta.color : "var(--border)"}`, cursor: "pointer", background: on ? meta.color : "var(--panel)", color: on ? "#fff" : "var(--muted)" }}>
              {meta.label} <span style={{ fontFamily: MONO, opacity: on ? 0.9 : 0.7 }}>{lists[b].length}</span>
            </button>
          );
        })}
      </div>
      <UniverseTable
        rows={rows}
        onOpenTicker={jump}
        emptyLabel="No tickers."
        extraColumn={{
          header: "52W BOUND",
          width: "100px",
          render: (row) => {
            const b = boundByTicker.get(row.ticker);
            if (!b) return <span style={{ color: "var(--faint)" }}>—</span>;
            return (
              <>
                <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>{formatPrice(b.bound)}</div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", marginTop: 1 }}>{formatPercent(b.distancePct / 100)}</div>
              </>
            );
          },
        }}
      />
      <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 12, lineHeight: 1.5 }}>
        Setup/Trend/Structure/VWAP/Liquidity/Entry/Invalidation/Target/R:R/Chg come from the same scanned Screener universe — a ticker outside that scan still lists here but those columns read &ldquo;no data&rdquo; rather than a guess. 52W BOUND is the published high/low the price touched, and its distance from that bound. Click a row to open its research page.
      </div>
    </Modal>
  );
}

export function BreadthTiles() {
  const { bundle, ksei, marketDate } = useApp();
  const [modal, setModal] = useState<null | MoversBucket | "highLow">(null);
  const kseiSec = useMemo(() => kseiSectorMap(ksei), [ksei]);

  const model = useMemo(() => {
    const breadth = (bundle?.overview?.overview?.breadth || {}) as Record<string, unknown>;

    // Advancers / decliners / unchanged — walked per-ticker so the tile count
    // always matches the list in the popup (same source as up/down volume).
    const advancers: MoveRow[] = [];
    const decliners: MoveRow[] = [];
    const unchanged: MoveRow[] = [];
    if (bundle?.technical?.size) {
      bundle.technical.forEach((rec) => {
        const chg = asNumber(rec.changePercent);
        if (chg === null) return;
        const row: MoveRow = {
          ticker: rec.ticker,
          companyName: rec.companyName || rec.ticker,
          sector: kseiSec.get(rec.ticker)?.label || rec.sector || "Others",
          price: asNumber(rec.lastPrice),
          changePct: chg,
        };
        if (chg > 0) advancers.push(row);
        else if (chg < 0) decliners.push(row);
        else unchanged.push(row);
      });
    }
    advancers.sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
    decliners.sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));
    unchanged.sort((a, b) => a.ticker.localeCompare(b.ticker));
    const advances = bundle?.technical?.size ? advancers.length : asNumber(breadth.advances);
    const declines = bundle?.technical?.size ? decliners.length : asNumber(breadth.declines);
    const unchangedCount = bundle?.technical?.size ? unchanged.length : asNumber(breadth.unchanged);
    const advDec = advances !== null && declines !== null ? advances + declines : null;

    // New highs / lows — price at or through its published 52-week bound.
    const newHighs: BoundRow[] = [];
    const newLows: BoundRow[] = [];
    if (bundle?.fundamentals?.size) {
      bundle.fundamentals.forEach((raw, ticker) => {
        const price = asNumber(raw["Price"]);
        const hi = asNumber(raw["52 Week High"]);
        const lo = asNumber(raw["52 Week Low"]);
        if (price === null) return;
        const companyName = bundle.technical.get(ticker)?.companyName || ticker;
        const sector = kseiSec.get(ticker)?.label || bundle.technical.get(ticker)?.sector || "Others";
        if (hi !== null && price >= hi) newHighs.push({ ticker, companyName, sector, price, bound: hi, distancePct: hi > 0 ? ((price - hi) / hi) * 100 : 0 });
        if (lo !== null && price <= lo) newLows.push({ ticker, companyName, sector, price, bound: lo, distancePct: lo > 0 ? ((price - lo) / lo) * 100 : 0 });
      });
    }
    newHighs.sort((a, b) => b.distancePct - a.distancePct);
    newLows.sort((a, b) => a.distancePct - b.distancePct);
    const newHigh = bundle?.fundamentals?.size ? newHighs.length : null;
    const newLow = bundle?.fundamentals?.size ? newLows.length : null;
    const netHL = newHigh !== null && newLow !== null ? newHigh - newLow : null;

    // Up / down volume — traded volume on advancing vs declining names.
    let upVol: number | null = null;
    let downVol: number | null = null;
    if (bundle?.technical?.size) {
      upVol = 0;
      downVol = 0;
      bundle.technical.forEach((rec) => {
        const vol = asNumber(rec.volume);
        const chg = asNumber(rec.changePercent);
        if (vol === null || chg === null) return;
        if (chg > 0) upVol! += vol;
        else if (chg < 0) downVol! += vol;
      });
    }
    const volRatio = upVol !== null && downVol !== null && downVol > 0 ? upVol / downVol : null;

    return { advancers, decliners, unchanged, advances, declines, advDec, unchangedCount, newHighs, newLows, newHigh, newLow, netHL, upVol, downVol, volRatio };
  }, [bundle, kseiSec]);

  const advDecNoData = model.advances === null && model.declines === null;
  const hlNoData = model.newHigh === null && model.newLow === null;
  const volNoData = model.volRatio === null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginBottom: 14 }}>
        {/* Advancers / Decliners / Unchanged — merged */}
        <div style={CARD}>
          {advDecNoData ? (
            <>
              <div style={KICKER}>ADVANCERS / DECLINERS / UNCHANGED</div>
              <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: "var(--faint)", marginTop: 8 }}>no data</div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>counted across the scanned universe</div>
            </>
          ) : (
            <button type="button" onClick={() => setModal("advancers")} style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", background: "transparent", border: "none", padding: 0 }}>
              <div style={{ ...KICKER, display: "flex", alignItems: "center", gap: 6 }}>ADVANCERS / DECLINERS / UNCHANGED<span style={{ flex: 1 }} /><span style={OPEN_CHEVRON}>›</span></div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: "var(--up)" }}>{formatNumber(model.advances!, 0)}</span>
                <span style={{ color: "var(--faint)", fontSize: 13 }}>/</span>
                <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: "var(--down)" }}>{model.declines === null ? "—" : formatNumber(model.declines, 0)}</span>
                <span style={{ color: "var(--faint)", fontSize: 13 }}>/</span>
                <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: "var(--flat)" }}>{model.unchangedCount === null ? "—" : formatNumber(model.unchangedCount, 0)}</span>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>
                {model.advDec && model.advDec > 0 ? `${((model.advances! / model.advDec) * 100).toFixed(1)}% up` : "counted across the scanned universe"} · click to view tickers
              </div>
            </button>
          )}
        </div>

        {/* New Highs / New Lows */}
        <div style={CARD}>
          {hlNoData ? (
            <>
              <div style={KICKER}>NEW HIGHS / LOWS</div>
              <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: "var(--faint)", marginTop: 8 }}>no data</div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>price at or through its 52-week bound</div>
            </>
          ) : (
            <button type="button" onClick={() => setModal("highLow")} style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", background: "transparent", border: "none", padding: 0 }}>
              <div style={{ ...KICKER, display: "flex", alignItems: "center", gap: 6 }}>NEW HIGHS / LOWS<span style={{ flex: 1 }} /><span style={OPEN_CHEVRON}>›</span></div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
                <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: "var(--up)" }}>{formatNumber(model.newHigh!, 0)}</span>
                <span style={{ color: "var(--faint)", fontSize: 13 }}>/</span>
                <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: "var(--down)" }}>{model.newLow === null ? "—" : formatNumber(model.newLow, 0)}</span>
              </div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>{model.netHL !== null ? `net ${signed(model.netHL)}` : "price at or through its 52-week bound"} · click to view tickers</div>
            </button>
          )}
        </div>

        {/* Up / Down Volume */}
        <div style={CARD} title={model.upVol !== null && model.downVol !== null ? `${formatNumber(model.upVol, 0)} up vs ${formatNumber(model.downVol, 0)} down (shares)` : undefined}>
          <div style={KICKER}>UP / DOWN VOLUME</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
            {volNoData ? (
              <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: "var(--faint)" }}>no data</span>
            ) : (
              <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: model.volRatio! >= 1.05 ? "var(--up)" : model.volRatio! <= 0.95 ? "var(--down)" : "var(--flat)" }}>{model.volRatio!.toFixed(2)}×</span>
            )}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>{volNoData ? "shares traded, not value" : model.volRatio! >= 1.05 ? "buy-skewed" : model.volRatio! <= 0.95 ? "sell-skewed" : "balanced"}</div>
        </div>
      </div>

      {modal === "advancers" || modal === "decliners" || modal === "unchanged" ? (
        <MoversExplorer
          initialBucket={modal}
          lists={{ advancers: model.advancers, decliners: model.decliners, unchanged: model.unchanged }}
          marketDate={marketDate || ""}
          onClose={() => setModal(null)}
        />
      ) : null}

      {modal === "highLow" ? (
        <NewHighLowModal newHighs={model.newHighs} newLows={model.newLows} marketDate={marketDate || ""} onClose={() => setModal(null)} />
      ) : null}
    </>
  );
}
