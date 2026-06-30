"use client";

import { useMemo } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Provenance } from "@/components/shared/Metric";
import { normalizeSector } from "@/lib/domain/sectors";
import { asNumber, formatPercent } from "@/lib/format/number";

type Tile = { ticker: string; mcap: number; change: number; sector: string };

// Blue (up) / red (down) intensity by magnitude of the daily change. No green.
function tileColor(change: number): { bg: string; light: boolean } {
  const intensity = Math.min(0.9, Math.abs(change) * 12 + 0.12);
  const rgb = change >= 0 ? "29, 78, 216" : "217, 45, 32";
  return { bg: `rgba(${rgb}, ${intensity.toFixed(3)})`, light: intensity > 0.42 };
}

export function MarketMap() {
  const { bundle, marketDate, openTicker } = useApp();

  const sectors = useMemo(() => {
    const tiles: Tile[] = [];
    bundle?.fundamentals.forEach((raw, ticker) => {
      const mcap = asNumber(raw["Market Cap"]);
      const change = asNumber(raw["Price Change %"]);
      if (mcap === null || mcap <= 0 || change === null) return;
      tiles.push({ ticker, mcap, change, sector: normalizeSector(String(raw["IDX Sector"] ?? "Others")) });
    });
    const bySector = new Map<string, Tile[]>();
    for (const tile of tiles) {
      const list = bySector.get(tile.sector) || [];
      list.push(tile);
      bySector.set(tile.sector, list);
    }
    return [...bySector.entries()]
      .map(([sector, list]) => ({
        sector,
        weight: list.reduce((sum, t) => sum + t.mcap, 0),
        tiles: list.sort((a, b) => b.mcap - a.mcap).slice(0, 12),
      }))
      .sort((a, b) => b.weight - a.weight);
  }, [bundle]);

  if (!sectors.length) return null;

  return (
    <article className="panel market-map">
      <div className="panel-head">
        <div>
          <span className="panel-kicker">MARKET MAP</span>
          <h3>Market capitalisation heatmap</h3>
        </div>
        <Provenance source="Fundamentals" asOf={marketDate} />
      </div>
      <div className="heatmap">
        {sectors.map((group) => (
          <div key={group.sector} className="heatmap-sector">
            <div className="heatmap-sector-label">{group.sector}</div>
            <div className="heatmap-tiles">
              {group.tiles.map((tile) => {
                const { bg, light } = tileColor(tile.change);
                return (
                  <button
                    key={tile.ticker}
                    type="button"
                    className="heatmap-tile"
                    style={{ background: bg, color: light ? "#fff" : "var(--text)", flexGrow: Math.max(1, Math.sqrt(tile.mcap)) }}
                    onClick={() => openTicker(tile.ticker)}
                    title={`${tile.ticker} · ${formatPercent(tile.change)}`}
                  >
                    <strong>{tile.ticker}</strong>
                    <span>{formatPercent(tile.change)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
