"use client";

import { useApp } from "@/components/providers/AppProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { Provenance } from "@/components/shared/Metric";
import type { JsonRecord } from "@/lib/domain/types";
import { asNumber, formatPercent, formatPrice } from "@/lib/format/number";

type Mover = { ticker: string; sector: string; price: number | null; change: number };

function readMovers(list: JsonRecord[] | undefined): Mover[] {
  return (list || [])
    .map((row) => ({
      ticker: String(row.ticker ?? "").toUpperCase(),
      sector: String(row.sector ?? "Others"),
      price: asNumber(row.price),
      change: asNumber(row.change) ?? Number.NaN,
    }))
    .filter((m) => m.ticker && Number.isFinite(m.change))
    .slice(0, 8);
}

function MoversCard({ title, kicker, movers, marketDate }: { title: string; kicker: string; movers: Mover[]; marketDate: string }) {
  const { openTicker } = useApp();
  const max = Math.max(1, ...movers.map((m) => Math.abs(m.change)));
  if (!movers.length) return null;
  return (
    <article className="panel">
      <div className="panel-head">
        <div>
          <span className="panel-kicker">{kicker}</span>
          <h3>{title}</h3>
        </div>
        <Provenance source="Overview" asOf={marketDate} />
      </div>
      <div className="movers-list">
        {movers.map((m) => (
          <button key={m.ticker} type="button" className="movers-row" onClick={() => openTicker(m.ticker)}>
            <span className="movers-ticker">{m.ticker}</span>
            <span className="movers-sector">{m.sector}</span>
            <span className="movers-bar-track">
              <span
                className="movers-bar"
                style={{ width: `${(Math.abs(m.change) / max) * 100}%`, background: m.change >= 0 ? "var(--up)" : "var(--down)" }}
              />
            </span>
            <span className="movers-price">{formatPrice(m.price)}</span>
            <span className="font-mono" style={{ color: m.change >= 0 ? "var(--up)" : "var(--down)" }}>{formatPercent(m.change)}</span>
          </button>
        ))}
      </div>
    </article>
  );
}

export function Leaders() {
  const { bundle, marketDate } = useApp();
  const overview = bundle?.overview?.overview;
  const gainers = readMovers(overview?.topGainers);
  const decliners = readMovers(overview?.topDecliners);

  if (!gainers.length && !decliners.length) {
    return <EmptyState title="No movers reported" body="The overview snapshot did not include top movers for this session." />;
  }

  return (
    <section className="leaders-grid">
      <MoversCard title="Top Leaders" kicker="LEADERS" movers={gainers} marketDate={marketDate} />
      <MoversCard title="Top Laggards" kicker="LAGGARDS" movers={decliners} marketDate={marketDate} />
    </section>
  );
}
