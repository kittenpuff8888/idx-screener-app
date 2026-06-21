"use client";

import { useApp } from "@/components/providers/AppProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatPercent, formatPrice } from "@/lib/format/number";

export function WatchlistPage() {
  const { watchlist, bundle, ksei, openTicker, toggleWatchlist } = useApp();
  const rows = watchlist.map((ticker) => ({
    ticker,
    stock: bundle?.technical.get(ticker),
    ownership: ksei?.records.find((item) => item.ticker === ticker),
  }));

  return (
    <section className="view active" data-view-panel="watchlist">
      <div className="view-intro">
        <div><span className="section-kicker">LOCAL RESEARCH LIST</span><h2>Watchlist</h2><p>Track research candidates you saved from the screener or ticker drawer. Data follows the selected IDX market session, while ownership follows latest KSEI.</p></div>
      </div>
      {!rows.length ? (
        <EmptyState title="No tickers saved yet" body="Save a ticker from the screener or ticker research drawer to build your research board." />
      ) : (
        <article className="panel">
        <div className="table-shell">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ticker</th>
                <th>Company</th>
                <th className="numeric">Price</th>
                <th className="numeric">Change %</th>
                <th>Sector</th>
                <th>Signal / Research Summary</th>
                <th>Ownership Summary</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ ticker, stock, ownership }) => (
                <tr key={ticker}>
                  <td><button type="button" onClick={() => openTicker(ticker)} className="font-bold text-accent hover:underline">{ticker}</button></td>
                  <td>{stock?.companyName || ownership?.companyName || "Company unavailable"}</td>
                  <td className="numeric">{formatPrice(stock?.lastPrice)}</td>
                  <td className="numeric">{formatPercent(stock?.changePercent)}</td>
                  <td>{stock?.sector || ownership?.sector || "Others"}</td>
                  <td>{stock?.summaryScreener || "No active signal summary for this date."}</td>
                  <td>{ownership ? `${ownership.ownershipType} / CR1 ${formatPercent(ownership.cr1)}` : "Ownership unavailable"}</td>
                  <td>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => toggleWatchlist(ticker)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </article>
      )}
    </section>
  );
}
