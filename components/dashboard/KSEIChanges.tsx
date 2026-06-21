"use client";

import Link from "next/link";
import { useApp } from "@/components/providers/AppProvider";
import { formatPlainPercent } from "@/lib/format/number";

export function KSEIChanges() {
  const { ksei, openTicker } = useApp();
  const changes = ksei?.investorChanges || [];
  return (
    <article className="dashboard-summary-card">
      <span>LATEST KSEI OWNERSHIP CHANGES</span>
      <strong>{ksei?.asOf || "Preparing"}</strong>
      <p>KSEI ownership is independent from the selected market session.</p>
      <div className="dashboard-chip-list">
        {changes.slice(0, 5).map((change) => (
          <button
            key={`${change.ticker}-${change.investor}`}
            type="button"
            onClick={() => openTicker(change.ticker)}
            className="dashboard-chip"
          >
            <strong>{change.ticker}</strong>
            <span>{change.changeType}</span>
            <small>
              {change.investor}: {formatPlainPercent(change.oldPercentage, 2)} to {formatPlainPercent(change.newPercentage, 2)}
            </small>
          </button>
        ))}
      </div>
      <Link className="text-button" href="/ksei">Review ownership changes</Link>
    </article>
  );
}
