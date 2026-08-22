"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Modal } from "@/components/shared/Modal";
import { kseiSectorMap } from "@/lib/data/ksei";
import { MoversExplorer, type MoveRow, type MoversBucket } from "./MoversExplorer";
import { asNumber, formatNumber, formatPrice } from "@/lib/format/number";

/** Breadth tiles (DESIGN_SPEC §3.2). Advancers / Decliners / Unchanged share one
    tile and open the page-sized MoversExplorer (bucket bubbles + a Screener-style
    table) on click; New Highs / New Lows share another tile and open a smaller
    two-column popup. Up/Down Volume stays a standalone, non-clickable tile.
    Every count and every listed ticker is read from published fields — a tile
    or list with no usable field reads `no data` / "no tickers" rather than a
    fabricated zero. */

const CARD: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r)",
  padding: "14px 16px",
  boxShadow: "var(--sh, var(--shadow))",
};

const KICKER: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const MONO = "var(--font-mono)";

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

type BoundRow = { ticker: string; companyName: string; price: number; bound: number; distancePct: number };

function TickerRow({ ticker, companyName, right, rightColor, onOpen }: { ticker: string; companyName: string; right: string; rightColor: string; onOpen: (t: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(ticker)}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 4px", border: "none", borderBottom: "1px solid var(--hair)", background: "transparent", cursor: "pointer" }}
    >
      <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, width: 68, flexShrink: 0 }}>{ticker}</span>
      <span style={{ fontSize: 11.5, color: "var(--muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{companyName}</span>
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: rightColor, flexShrink: 0 }}>{right}</span>
    </button>
  );
}

export function BreadthTiles() {
  const { bundle, openTicker, ksei, marketDate } = useApp();
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
        if (hi !== null && price >= hi) newHighs.push({ ticker, companyName, price, bound: hi, distancePct: hi > 0 ? ((price - hi) / hi) * 100 : 0 });
        if (lo !== null && price <= lo) newLows.push({ ticker, companyName, price, bound: lo, distancePct: lo > 0 ? ((price - lo) / lo) * 100 : 0 });
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

  function jump(ticker: string) {
    setModal(null);
    openTicker(ticker);
  }

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
              <div style={{ ...KICKER, display: "flex", alignItems: "center", gap: 6 }}>ADVANCERS / DECLINERS / UNCHANGED<span style={{ fontSize: 9, color: "var(--accent)", fontWeight: 700 }}>VIEW TICKERS →</span></div>
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
              <div style={{ ...KICKER, display: "flex", alignItems: "center", gap: 6 }}>NEW HIGHS / LOWS<span style={{ fontSize: 9, color: "var(--accent)", fontWeight: 700 }}>VIEW TICKERS →</span></div>
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
        <Modal title="New Highs / New Lows" kicker="price at or through its 52-week bound" onClose={() => setModal(null)} maxWidth={640}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ ...KICKER, color: "var(--up)", marginBottom: 6 }}>NEW HIGHS · {model.newHighs.length}</div>
              <div style={{ maxHeight: 380, overflowY: "auto" }}>
                {model.newHighs.length ? model.newHighs.map((r) => (
                  <TickerRow key={r.ticker} ticker={r.ticker} companyName={r.companyName} right={formatPrice(r.price)} rightColor="var(--up)" onOpen={jump} />
                )) : <div style={{ fontSize: 11.5, color: "var(--faint)", padding: "8px 4px" }}>no tickers</div>}
              </div>
            </div>
            <div>
              <div style={{ ...KICKER, color: "var(--down)", marginBottom: 6 }}>NEW LOWS · {model.newLows.length}</div>
              <div style={{ maxHeight: 380, overflowY: "auto" }}>
                {model.newLows.length ? model.newLows.map((r) => (
                  <TickerRow key={r.ticker} ticker={r.ticker} companyName={r.companyName} right={formatPrice(r.price)} rightColor="var(--down)" onOpen={jump} />
                )) : <div style={{ fontSize: 11.5, color: "var(--faint)", padding: "8px 4px" }}>no tickers</div>}
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
