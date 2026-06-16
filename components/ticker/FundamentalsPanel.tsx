"use client";

import { Card, CardHeader } from "@/components/shared/Card";
import type { JsonRecord, TechnicalRecord } from "@/lib/domain/types";
import { formatCompact, formatNumber, formatPlainPercent } from "@/lib/format/number";

const groups = [
  ["Valuation", ["Current PE Ratio (TTM)", "Current Price to Sales (TTM)", "Current Price to Book Value", "EV to EBITDA (TTM)"]],
  ["Profitability", ["Net Profit Margin (Quarter)", "Return on Assets (TTM)", "Return on Equity (TTM)", "Return On Invested Capital (TTM)"]],
  ["Balance Sheet", ["Current Ratio (Quarter)", "Quick Ratio (Quarter)", "Debt to Equity Ratio (Quarter)", "Total Assets (Quarter)"]],
  ["Cash Flow", ["Free cash flow (Quarter)", "Cash (Quarter)", "Operating Cash Flow (TTM)"]],
  ["Growth / Dividend", ["Revenue Growth (YoY)", "Net Income Growth (YoY)", "Dividend Yield", "Payout Ratio"]],
] as const;

export function FundamentalsPanel({ row, stock }: { row?: JsonRecord; stock?: TechnicalRecord }) {
  const fundamentals = stock?.fundamentals || {};
  return (
    <Card>
      <CardHeader kicker="Fundamentals" title="Yahoo-style key statistics" />
      <div className="mb-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
        <p className="text-sm leading-6 text-muted">{String(row?.["Business Summary"] || fundamentals.businessSummary || "Business summary is unavailable for this issuer.")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map(([title, keys]) => (
          <div key={title} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
            <h3 className="mb-3 font-semibold text-text">{title}</h3>
            <dl className="grid gap-2">
              {keys.map((key) => {
                const value = row?.[key] ?? fundamentals[key as keyof typeof fundamentals];
                const rendered = key.includes("Ratio") || key.includes("EV") ? formatNumber(value, 2)
                  : key.includes("Margin") || key.includes("Return") || key.includes("Yield") || key.includes("Growth") || key.includes("Payout") ? formatPlainPercent(value, 2)
                  : formatCompact(value);
                return (
                  <div key={key} className="flex justify-between gap-3 border-b border-white/5 pb-2 text-sm">
                    <dt className="text-muted">{key}</dt>
                    <dd className="font-mono text-text">{rendered}</dd>
                  </div>
                );
              })}
            </dl>
          </div>
        ))}
      </div>
    </Card>
  );
}
