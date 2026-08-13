"use client";

import { Card, CardHeader } from "@/components/shared/Card";
import { Provenance, Stat } from "@/components/shared/Metric";
import { cell } from "@/lib/dataReady";
import type { JsonRecord, TechnicalRecord } from "@/lib/domain/types";
import { asNumber, formatCompact, formatNumber, formatPercent, formatPrice } from "@/lib/format/number";

type StatDef = { label: string; key?: string; raw?: unknown; kind: "price" | "compact" | "rpbn" | "ratio" | "percent" | "int" };

// Market Cap / Enterprise Value / FCF / Cash are stored in Rp BILLION (e.g.
// 471,300 = Rp 471.3 T). Plain compact mislabels them "rb" (thousand), so format
// as Rp trillions/billions the same way the header hero does.
function fmtRpBn(bn: number): string {
  if (!isFinite(bn)) return "—";
  return bn >= 1000 ? `Rp ${formatNumber(bn / 1000, 1)} T` : `Rp ${formatNumber(bn, 1)} B`;
}

const SECTIONS: Array<{ title: string; rows: Array<{ label: string; key: string; kind: StatDef["kind"] }> }> = [
  {
    title: "Key Statistics",
    rows: [
      { label: "Market Cap", key: "Market Cap", kind: "rpbn" },
      { label: "Enterprise Value", key: "Enterprise Value", kind: "rpbn" },
      { label: "Shares Outstanding", key: "Shares Outstanding", kind: "compact" },
      { label: "Free Float %", key: "Free Float (%)", kind: "percent" },
      { label: "52W High", key: "52 Week High", kind: "price" },
      { label: "52W Low", key: "52 Week Low", kind: "price" },
    ],
  },
  {
    title: "Valuation",
    rows: [
      { label: "P/E (TTM)", key: "Current PE Ratio (TTM)", kind: "ratio" },
      { label: "P/S (TTM)", key: "Current Price to Sales (TTM)", kind: "ratio" },
      { label: "P/B", key: "Current Price to Book Value", kind: "ratio" },
      { label: "EV/EBITDA (TTM)", key: "EV to EBITDA (TTM)", kind: "ratio" },
      { label: "Earnings Yield (TTM)", key: "Earnings Yield (TTM)", kind: "percent" },
    ],
  },
  {
    title: "Profitability",
    rows: [
      { label: "Net Margin (Q)", key: "Net Profit Margin (Quarter)", kind: "percent" },
      { label: "ROA (TTM)", key: "Return on Assets (TTM)", kind: "percent" },
      { label: "ROE (TTM)", key: "Return on Equity (TTM)", kind: "percent" },
      { label: "ROIC (TTM)", key: "Return On Invested Capital (TTM)", kind: "percent" },
    ],
  },
  {
    title: "Solvency & Cash",
    rows: [
      { label: "Current Ratio (Q)", key: "Current Ratio (Quarter)", kind: "ratio" },
      { label: "Debt/Equity (Q)", key: "Debt to Equity Ratio (Quarter)", kind: "ratio" },
      { label: "Free Cash Flow (TTM)", key: "Free cash flow (TTM)", kind: "rpbn" },
      { label: "Cash (Q)", key: "Cash (Quarter)", kind: "rpbn" },
    ],
  },
];

function formatBy(kind: StatDef["kind"]): (v: number) => string {
  switch (kind) {
    case "price": return (v) => formatPrice(v);
    case "compact": return (v) => formatCompact(v);
    case "rpbn": return (v) => fmtRpBn(v);
    // Workbook percent fields (Free Float, ROE, margins, yields) are stored as
    // fractions (0.4597 = 45.97%), matching how the header hero renders them.
    // formatPlainPercent skipped the ×100 → "0.46%"; use formatPercent, sign-free.
    case "percent": return (v) => formatPercent(v, 2).replace("+", "");
    case "int": return (v) => formatNumber(v, 0);
    default: return (v) => formatNumber(v, 2);
  }
}

export function FundamentalsPanel({ row, asOf }: { row?: JsonRecord; stock?: TechnicalRecord; asOf: string }) {
  const summary = String(row?.["Business Summary"] ?? "");
  return (
    <Card>
      <CardHeader kicker="Fundamentals" title="Key statistics" />
      {summary && summary !== "-" ? (
        <p className="mb-4 rounded-md border border-border bg-soft p-3 text-sm leading-6 text-muted">{summary}</p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <div key={section.title} className="rounded-md border border-border bg-soft p-3">
            <h3 className="mb-2 text-sm font-semibold text-text">{section.title}</h3>
            <div className="flex flex-col">
              {section.rows.map((r) => (
                <Stat
                  key={r.key}
                  label={r.label}
                  cell={cell(asNumber(row?.[r.key]), "Fundamentals", asOf, "Not reported")}
                  format={formatBy(r.kind)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Provenance source="Fundamentals (yfinance / workbook)" asOf={asOf} />
      </div>
    </Card>
  );
}
