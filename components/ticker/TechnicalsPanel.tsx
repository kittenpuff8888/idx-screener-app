"use client";

import { Card, CardHeader } from "@/components/shared/Card";
import type { JsonRecord, TechnicalRecord } from "@/lib/domain/types";
import { formatNumber, formatPercent } from "@/lib/format/number";

function renderValue(value: unknown): string {
  if (typeof value === "number") return Math.abs(value) <= 1 ? formatPercent(value) : formatNumber(value, 2);
  if (value === null || value === undefined || value === "-") return "Unavailable";
  return String(value);
}

const groups: Array<[string, (stock: TechnicalRecord) => Record<string, unknown>]> = [
  // "Market Cap" itself is deliberately NOT shown here: this record's regime.marketCap
  // comes from a different worksheet (IDX Screener) than FundamentalsPanel's "Market
  // Cap" (IDX Fundamental Detail) and the two can disagree for the same ticker/date —
  // showing both side by side on the ticker page is confusing, not informative. The
  // category bucket is still useful and isn't a numeric duplicate of anything shown
  // elsewhere, so it stays.
  ["Stock Regime", (s) => ({ "Market Cap Category": (s.technical?.regime as JsonRecord | undefined)?.marketCapCategory, "Liquidity": s.liquidityCategory, "RS Rating": s.rsRating })],
  ["Market Structure & SMC", (s) => ({ "Internal Trend": s.trend?.internal, "Swing Trend": s.trend?.swing, "Latest Internal": s.structure?.internal, "Latest Swing": s.structure?.swing, ...(s.technical?.smc as JsonRecord | undefined || {}) })],
  ["Liquidity", (s) => ({ "Volume": s.volumeDisplay || s.volume, "Average Volume 20D": s.averageVolume20, "RVOL 20D": s.rvol, "RVOL Change": s.rvolChangePercent, ...((s.technical?.liquidity as JsonRecord | undefined) || {}) })],
  ["Market Profile", (s) => ((s.technical?.marketProfile as JsonRecord | undefined) || {})],
  ["VWAP Family", (s) => ({ "Current VWAP": s.technical?.vwap, "VWAP Position": s.technical?.vwapPosition, ...((s.technical?.vwapProfiles as JsonRecord | undefined) || {}) })],
  ["Moving Average", (s) => ({ ...s.movingAverages, ...((s.technical?.movingAverageDetail as JsonRecord | undefined) || {}) })],
  ["RSI Momentum", (s) => ({ "RSI 14": s.technical?.rsi14, "RSI Status": s.technical?.rsiStatus, ...((s.technical?.rsiDetail as JsonRecord | undefined) || {}) })],
  ["MACD Momentum", (s) => ({ "MACD Line": s.technical?.macdLine, "MACD Position": s.technical?.macdPosition, "Wave Pattern": s.technical?.wavePattern, ...((s.technical?.macdDetail as JsonRecord | undefined) || {}) })],
];

export function TechnicalsPanel({ stock }: { stock?: TechnicalRecord }) {
  if (!stock) return <Card><CardHeader kicker="Technicals" title="Technical snapshot unavailable" /><p className="text-sm text-muted">No technical record is available for this ticker/date.</p></Card>;
  return (
    <Card>
      <CardHeader kicker="Technicals" title="Technical field groups" />
      <div className="grid gap-3">
        {groups.map(([title, build], index) => {
          const values = build(stock);
          return (
            <details key={title} open={index < 3} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <summary className="cursor-pointer font-semibold text-text">{title}</summary>
              <dl className="mt-4 grid gap-2 md:grid-cols-2">
                {Object.entries(values).slice(0, 16).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-3 border-b border-white/5 pb-2 text-sm">
                    <dt className="text-muted">{key}</dt>
                    <dd className="max-w-[55%] text-right font-mono text-text">{renderValue(value)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          );
        })}
      </div>
    </Card>
  );
}
