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

type Tile = { label: string; up: number | null; down: number | null; upLabel: string; downLabel: string; note: string };

function compact(n: number): string {
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return formatNumber(n, 0);
}

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

    return [
      {
        label: "ADVANCERS / DECLINERS",
        up: advances,
        down: declines,
        upLabel: "advancing",
        downLabel: "declining",
        note: "counted across the scanned universe",
      },
      {
        label: "NEW HIGHS / LOWS",
        up: newHigh,
        down: newLow,
        upLabel: "at 52w high",
        downLabel: "at 52w low",
        note: "price at or through its 52-week bound",
      },
      {
        label: "UP / DOWN VOLUME",
        up: upVol,
        down: downVol,
        upLabel: "on advancers",
        downLabel: "on decliners",
        note: "shares traded, not value",
      },
      {
        label: "UNCHANGED",
        up: unchanged,
        down: null,
        upLabel: "flat on the session",
        downLabel: "",
        note: "no move recorded at the close",
      },
    ];
  }, [bundle]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginBottom: 14 }}>
      {tiles.map((t) => {
        const isVolume = t.label.startsWith("UP /");
        const fmt = (v: number) => (isVolume ? compact(v) : formatNumber(v, 0));
        const both = t.up !== null && t.down !== null ? t.up + t.down : null;
        const upShare = both && both > 0 ? (t.up! / both) * 100 : null;
        return (
          <div key={t.label} style={CARD}>
            <div style={KICKER}>{t.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: t.up === null ? "var(--faint)" : "var(--up)" }}>
                {t.up === null ? "no data" : fmt(t.up)}
              </span>
              {t.down !== null ? (
                <>
                  <span style={{ color: "var(--faint)", fontSize: 13 }}>/</span>
                  <span style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: "var(--down)" }}>{fmt(t.down)}</span>
                </>
              ) : null}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>
              {t.up === null ? t.note : t.down === null ? t.upLabel : `${t.upLabel} · ${t.downLabel}`}
            </div>
            {upShare !== null ? (
              <div style={{ display: "flex", height: 5, borderRadius: 4, overflow: "hidden", background: "var(--soft)", marginTop: 9 }} aria-hidden>
                <span style={{ width: `${upShare}%`, background: "var(--up)" }} />
                <span style={{ flex: 1, background: "var(--down)" }} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
