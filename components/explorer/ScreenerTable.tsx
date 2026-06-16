"use client";

import { useApp } from "@/components/providers/AppProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import type { ScreenerRow } from "@/lib/domain/types";
import { directionClass, formatNumber, formatPercent, formatPrice } from "@/lib/format/number";

export function ScreenerTable({ rows }: { rows: ScreenerRow[] }) {
  const { openTicker, toggleWatchlist, isWatched } = useApp();
  if (!rows.length) {
    return (
      <EmptyState
        title="No active signals for this market session"
        body="The selected filters remove every current row. Clear filters or choose another available market date."
      />
    );
  }

  return (
    <div className="data-table-shell">
      <table className="data-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Emiten</th>
            <th>IDX Sector</th>
            <th>Industry</th>
            <th className="numeric">Price</th>
            <th className="numeric">Price Change %</th>
            <th className="numeric">Beta vs IHSG</th>
            <th className="numeric">RVOL 20D</th>
            <th className="numeric">RVOL Change %</th>
            <th>SMC</th>
            <th>VWAP Zone</th>
            <th>Market Profile Zone</th>
            <th>MA Zone</th>
            <th>Summary Screener</th>
            <th>Watch</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.ticker}-${row.signalLabel}-${index}`} data-testid="screener-row" onDoubleClick={() => openTicker(row.ticker)}>
              <td>
                <button
                  className="font-bold text-accent hover:underline"
                  type="button"
                  data-testid="open-ticker"
                  data-ticker={row.ticker}
                  data-row-index={index}
                  onClick={() => openTicker(row.ticker)}
                >
                  {row.ticker}
                </button>
              </td>
              <td>{row.companyName}</td>
              <td>{row.sector}</td>
              <td>{row.industry}</td>
              <td className="numeric">{formatPrice(row.price)}</td>
              <td className={`numeric ${directionClass(row.changePct)}`}>{formatPercent(row.changePct)}</td>
              <td className="numeric">{formatNumber(row.beta, 2)}</td>
              <td className="numeric">{formatNumber(row.rvol, 2)}</td>
              <td className={`numeric ${directionClass(row.rvolChangePct)}`}>{formatPercent(row.rvolChangePct)}</td>
              <td>{row.smc}</td>
              <td>{row.vwapZone}</td>
              <td>{row.marketProfileZone}</td>
              <td>{row.maZone}</td>
              <td>{row.summary}</td>
              <td>
                <button
                  type="button"
                  aria-label={isWatched(row.ticker) ? `Remove ${row.ticker} from watchlist` : `Add ${row.ticker} to watchlist`}
                  onClick={() => toggleWatchlist(row.ticker)}
                  className="rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-accent hover:bg-accent/10"
                >
                  {isWatched(row.ticker) ? "Saved" : "Watch"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
