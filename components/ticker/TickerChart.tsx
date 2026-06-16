"use client";

import { Card, CardHeader } from "@/components/shared/Card";
import type { OhlcvPayload, TechnicalRecord } from "@/lib/domain/types";
import { formatCompact, formatPrice } from "@/lib/format/number";

export function TickerChart({ payload, stock }: { payload: OhlcvPayload | null; stock?: TechnicalRecord }) {
  const rows = (payload?.rows || []).slice(-90);
  if (rows.length < 2) {
    return (
      <Card>
        <CardHeader kicker="Chart" title="Price history unavailable" />
        <p className="text-sm leading-6 text-muted">This ticker/date does not have enough local OHLCV history to draw a candle workspace. Use the technical snapshot below or choose another available market date.</p>
      </Card>
    );
  }
  const min = Math.min(...rows.map((row) => row.low));
  const max = Math.max(...rows.map((row) => row.high));
  const spread = max - min || 1;
  const maxVolume = Math.max(...rows.map((row) => row.volume), 1);
  const xStep = 100 / rows.length;
  const y = (value: number) => 48 - ((value - min) / spread) * 40;
  const latest = rows.at(-1);
  const levels = [
    { label: "Entry", value: stock?.entry, color: "var(--accent)" },
    { label: "Target", value: stock?.target, color: "var(--positive)" },
    { label: "Invalidation", value: stock?.invalidation, color: "var(--negative)" },
  ].filter((item): item is { label: string; value: number; color: string } => typeof item.value === "number");

  return (
    <Card>
      <CardHeader kicker="Chart" title="Local candle workspace">
        <div className="text-right text-sm text-muted">
          <strong className="block text-text">{formatPrice(latest?.close)}</strong>
          <span>{latest?.date}</span>
        </div>
      </CardHeader>
      <div className="rounded-lg border border-white/10 bg-[#050b14] p-3">
        <svg viewBox="0 0 100 64" className="h-[360px] w-full" preserveAspectRatio="none" role="img" aria-label="Candlestick chart">
          {[0, 1, 2, 3, 4].map((line) => (
            <line key={line} x1="0" x2="100" y1={8 + line * 10} y2={8 + line * 10} stroke="rgba(148,163,184,.12)" strokeWidth=".2" />
          ))}
          {levels.map((level) => (
            <g key={level.label}>
              <line x1="0" x2="100" y1={y(level.value)} y2={y(level.value)} stroke={level.color} strokeDasharray="1 1" strokeWidth=".35" />
              <text x="1" y={y(level.value) - 1} fill={level.color} fontSize="2.1">{level.label}</text>
            </g>
          ))}
          {rows.map((row, index) => {
            const x = index * xStep + xStep / 2;
            const bullish = row.close >= row.open;
            const color = bullish ? "var(--positive)" : "var(--negative)";
            const bodyTop = Math.min(y(row.open), y(row.close));
            const bodyHeight = Math.max(0.7, Math.abs(y(row.open) - y(row.close)));
            return (
              <g key={row.date}>
                <line x1={x} x2={x} y1={y(row.high)} y2={y(row.low)} stroke={color} strokeWidth=".28" />
                <rect x={x - xStep * 0.28} y={bodyTop} width={Math.max(0.35, xStep * 0.56)} height={bodyHeight} fill={color} rx=".08" />
                <rect x={x - xStep * 0.3} y={54 - (row.volume / maxVolume) * 8} width={Math.max(0.35, xStep * 0.6)} height={(row.volume / maxVolume) * 8} fill="rgba(148,163,184,.52)" />
              </g>
            );
          })}
        </svg>
        <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-muted">
          <span>{rows[0]?.date}</span>
          <span>to {latest?.date}</span>
          <span>Volume {formatCompact(latest?.volume)}</span>
          <span>Zoom: latest 90 sessions</span>
        </div>
      </div>
    </Card>
  );
}
