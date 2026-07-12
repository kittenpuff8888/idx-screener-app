"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Modal } from "@/components/shared/Modal";
import { normalizeSector } from "@/lib/domain/sectors";
import { asNumber, formatPercent } from "@/lib/format/number";

const MONO = "var(--mono, var(--font-mono))";
const KICKER: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: "var(--faint)" };

type Tile = { ticker: string; mcap: number; change: number };
type SectorGroup = { sector: string; count: number; weight: number; capChange: number; tiles: Tile[] };

// Blue (up) / red (down) soft fill by magnitude of the daily change; white text
// only when the fill is saturated enough. No green (prototype palette).
function tileColor(change: number): { bg: string; light: boolean } {
  const intensity = Math.min(0.92, Math.abs(change) * 11 + 0.1);
  const rgb = change >= 0 ? "37, 99, 235" : "229, 72, 77";
  return { bg: `rgba(${rgb}, ${intensity.toFixed(3)})`, light: intensity > 0.45 };
}

function TileButton({ tile, big, onClick }: { tile: Tile; big?: boolean; onClick: () => void }) {
  const { bg, light } = tileColor(tile.change);
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${tile.ticker} · ${formatPercent(tile.change)}`}
      style={{
        border: "none",
        borderRadius: 7,
        cursor: "pointer",
        background: bg,
        color: light ? "#fff" : "var(--text)",
        padding: big ? "8px 10px" : "6px 8px",
        minWidth: big ? 72 : 46,
        flexGrow: Math.max(1, Math.sqrt(tile.mcap)),
        textAlign: "left",
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <strong style={{ fontFamily: MONO, fontSize: big ? 11.5 : 10.5, fontWeight: 700, letterSpacing: ".02em" }}>{tile.ticker}</strong>
      {big ? <span style={{ fontFamily: MONO, fontSize: 9.5, opacity: 0.85 }}>{formatPercent(tile.change)}</span> : null}
    </button>
  );
}

export function MarketMap() {
  const { bundle, marketDate, openTicker } = useApp();
  const [detail, setDetail] = useState<SectorGroup | null>(null);

  const sectors = useMemo<SectorGroup[]>(() => {
    const bySector = new Map<string, Tile[]>();
    bundle?.fundamentals.forEach((raw, ticker) => {
      const mcap = asNumber(raw["Market Cap"]);
      const change = asNumber(raw["Price Change %"]);
      if (mcap === null || mcap <= 0 || change === null) return;
      const sector = normalizeSector(String(raw["IDX Sector"] ?? "Others"));
      const list = bySector.get(sector) || [];
      list.push({ ticker, mcap, change });
      bySector.set(sector, list);
    });
    return [...bySector.entries()]
      .map(([sector, list]) => {
        list.sort((a, b) => b.mcap - a.mcap);
        const weight = list.reduce((sum, t) => sum + t.mcap, 0);
        // Cap-weighted sector change — documented derivation (spec §0.5).
        const capChange = weight ? list.reduce((sum, t) => sum + t.mcap * t.change, 0) / weight : 0;
        return { sector, count: list.length, weight, capChange, tiles: list };
      })
      .sort((a, b) => b.weight - a.weight);
  }, [bundle]);

  if (!sectors.length) return null;

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "16px 18px", boxShadow: "var(--shadow)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 15 }}>
        <span style={KICKER}>MARKET MAP · % CHANGE</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: "var(--faint)" }}>size = market cap · blue up / red down · Fundamentals · {marketDate}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px 22px" }}>
        {sectors.map((group) => (
          <div key={group.sector}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 7 }}>
              <span style={{ fontSize: 11.5, fontWeight: 700 }}>{group.sector}</span>
              <span style={{ fontSize: 10.5, color: "var(--faint)" }}>· {group.count}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, color: group.capChange >= 0 ? "var(--up)" : "var(--down)" }}>{formatPercent(group.capChange)}</span>
              <button
                type="button"
                onClick={() => setDetail(group)}
                style={{ border: "none", background: "transparent", color: "var(--accent)", fontSize: 10.5, fontWeight: 600, cursor: "pointer", padding: 0 }}
              >
                view all ›
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {group.tiles.slice(0, 12).map((tile, i) => (
                <TileButton key={tile.ticker} tile={tile} big={i === 0} onClick={() => openTicker(tile.ticker)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {detail ? (
        <Modal
          title={`${detail.sector} · ${detail.count} tickers`}
          kicker="MARKET MAP · SECTOR DETAIL"
          onClose={() => setDetail(null)}
          maxWidth={860}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
            <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, color: detail.capChange >= 0 ? "var(--up)" : "var(--down)" }}>{formatPercent(detail.capChange)}</span>
            <span style={{ fontSize: 11, color: "var(--faint)" }}>cap-weighted change · Fundamentals · {marketDate}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {detail.tiles.map((tile, i) => (
              <TileButton key={tile.ticker} tile={tile} big={i < 3} onClick={() => { setDetail(null); openTicker(tile.ticker); }} />
            ))}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
