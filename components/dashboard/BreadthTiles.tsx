"use client";

import { useMemo } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { asNumber, formatNumber } from "@/lib/format/number";

/** Four breadth tiles (DESIGN_SPEC §3.2). Each side of each tile is counted
    from published fields — advances/declines/unchanged from the overview
    breadth block, new highs/lows from 52-week bounds, up/down volume from
    per-ticker volume and change. A tile with no usable field reads `no data`
    rather than showing a zero that looks like a real count. */

const CARD: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r)",
  padding: "14px 16px",
  boxShadow: "var(--sh, var(--shadow))",
};

const KICKER: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const MONO = "var(--font-mono)";

// Design/1 breadth tiles: a headline (a two-part "up / down" pair, a single
// count, or a single ratio) plus a compact stat sub. No progress bar — the
// prototype conveys the split through the sub text ("34.7% up"), not a bar.
type Kind = "pair" | "single" | "ratio";
type Tile = { label: string; kind: Kind; up: number | null; down: number | null; ratio: number | null; sub: string; title?: string };

function compact(n: number): string {
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return formatNumber(n, 0);
}
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

export function BreadthTiles() {
  const { bundle } = useApp();

  const tiles = useMemo<Tile[]>(() => {
    const breadth = (bundle?.overview?.overview?.breadth || {}) as Record<string, unknown>;
    const advances = asNumber(breadth.advances);
    const declines = asNumber(breadth.declines);
    const unchanged = asNumber(breadth.unchanged);

    // New highs / lows — price at or through its published 52-week bound.
    let newHigh: number | null = null;
    let newLow: number | null = null;
    if (bundle?.fundamentals?.size) {
      newHigh = 0;
      newLow = 0;
      bundle.fundamentals.forEach((raw) => {
        const price = asNumber(raw["Price"]);
        const hi = asNumber(raw["52 Week High"]);
        const lo = asNumber(raw["52 Week Low"]);
        if (price === null) return;
        if (hi !== null && price >= hi) newHigh! += 1;
        if (lo !== null && price <= lo) newLow! += 1;
      });
    }

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

    const advDec = advances !== null && declines !== null ? advances + declines : null;
    const total = advDec !== null && unchanged !== null ? advDec + unchanged : null;
    const netHL = newHigh !== null && newLow !== null ? newHigh - newLow : null;
    const volRatio = upVol !== null && downVol !== null && downVol > 0 ? upVol / downVol : null;

    return [
      {
        label: "ADVANCERS / DECLINERS",
        kind: "pair", up: advances, down: declines, ratio: null,
        sub: advDec && advDec > 0 ? `${((advances! / advDec) * 100).toFixed(1)}% up` : "counted across the scanned universe",
      },
      {
        label: "NEW HIGHS / LOWS",
        kind: "pair", up: newHigh, down: newLow, ratio: null,
        sub: netHL !== null ? `net ${signed(netHL)}` : "price at or through its 52-week bound",
      },
      {
        label: "UP / DOWN VOLUME",
        kind: "ratio", up: upVol, down: downVol, ratio: volRatio,
        sub: volRatio === null ? "shares traded, not value" : volRatio >= 1.05 ? "buy-skewed" : volRatio <= 0.95 ? "sell-skewed" : "balanced",
        title: upVol !== null && downVol !== null ? `${compact(upVol)} up vs ${compact(downVol)} down (shares)` : undefined,
      },
      {
        label: "UNCHANGED",
        kind: "single", up: unchanged, down: null, ratio: null,
        sub: total !== null ? `of ${formatNumber(total, 0)}` : "no move recorded at the close",
      },
    ];
  }, [bundle]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginBottom: 14 }}>
      {tiles.map((t) => {
        const noData = t.kind === "ratio" ? t.ratio === null : t.up === null;
        // ratio tiles lean on the sub for polarity; count tiles stay neutral ink.
        const headColor = t.kind === "ratio"
          ? (t.ratio !== null && t.ratio >= 1.05 ? "var(--up)" : t.ratio !== null && t.ratio <= 0.95 ? "var(--down)" : "var(--flat)")
          : t.kind === "single" ? "var(--flat)" : "var(--up)";
        return (
          <div key={t.label} style={CARD} title={t.title}>
            <div style={KICKER}>{t.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
              {noData ? (
                <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: "var(--faint)" }}>no data</span>
              ) : t.kind === "ratio" ? (
                <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: headColor }}>{t.ratio!.toFixed(2)}×</span>
              ) : t.kind === "single" ? (
                <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: headColor }}>{formatNumber(t.up!, 0)}</span>
              ) : (
                <>
                  <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: "var(--up)" }}>{formatNumber(t.up!, 0)}</span>
                  <span style={{ color: "var(--faint)", fontSize: 13 }}>/</span>
                  <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: "var(--down)" }}>{t.down === null ? "—" : formatNumber(t.down, 0)}</span>
                </>
              )}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>{t.sub}</div>
          </div>
        );
      })}
    </div>
  );
}
