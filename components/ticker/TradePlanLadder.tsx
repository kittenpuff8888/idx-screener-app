"use client";

import type { CSSProperties } from "react";
import type { OhlcvPayload, TechnicalRecord } from "@/lib/domain/types";
import { formatNumber } from "@/lib/format/number";

const MONO = "var(--font-mono)";
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };

type Rung = { name: string; price: number; kind: "target" | "entry" | "close" | "stop"; note?: string };

/** Build the trade-plan levels — real setup levels when the ticker is an active
 *  candidate, otherwise structural levels derived from recent OHLC + 52w range.
 *  Never fabricates: if there isn't enough price data, returns null. */
function buildPlan(price: number, stock: TechnicalRecord | undefined, ohlcv: OhlcvPayload | null, low52: number | null, high52: number | null) {
  const entry = typeof stock?.entry === "number" ? stock.entry : null;
  const target = typeof stock?.target === "number" ? stock.target : null;
  const stop = typeof stock?.invalidation === "number" ? stock.invalidation : null;

  if (target != null && stop != null && target > stop) {
    const e = entry ?? price;
    const rr = e - stop > 0 ? (target - e) / (e - stop) : null;
    const rungs: Rung[] = [
      { name: "Target", price: target, kind: "target", note: stock?.targetPoi },
      { name: "Entry", price: e, kind: "entry", note: stock?.entryPoi },
      { name: "Close", price, kind: "close" },
      { name: "Invalidation", price: stop, kind: "stop", note: stock?.invalidationPoi },
    ];
    return { mode: "Active setup" as const, rr, rungs, reward: target - e, risk: e - stop };
  }

  // Structural fallback — nearest swing resistance/support from the last ~20 sessions,
  // widened to the 52-week extremes, around the close.
  const rows = ohlcv?.rows || [];
  if (rows.length < 5 && low52 == null && high52 == null) return null;
  const win = rows.slice(-20);
  const swingHigh = win.length ? Math.max(...win.map((r) => r.high)) : null;
  const swingLow = win.length ? Math.min(...win.map((r) => r.low)) : null;

  const resAbove = [swingHigh, high52].filter((v): v is number => v != null && v > price * 1.002);
  const supBelow = [swingLow, low52].filter((v): v is number => v != null && v < price * 0.998);
  const resTarget = resAbove.length ? Math.min(...resAbove) : null;   // nearest resistance above
  const supStop = supBelow.length ? Math.max(...supBelow) : null;     // nearest support below
  if (resTarget == null && supStop == null) return null;

  const rr = resTarget != null && supStop != null && price - supStop > 0 ? (resTarget - price) / (price - supStop) : null;
  const rungs: Rung[] = [];
  if (high52 != null && high52 !== resTarget) rungs.push({ name: "52w high", price: high52, kind: "target" });
  if (resTarget != null) rungs.push({ name: "Resistance", price: resTarget, kind: "target", note: "recent swing high" });
  rungs.push({ name: "Close", price, kind: "close" });
  if (supStop != null) rungs.push({ name: "Support", price: supStop, kind: "stop", note: "recent swing low" });
  if (low52 != null && low52 !== supStop) rungs.push({ name: "52w low", price: low52, kind: "stop" });
  return {
    mode: "Structural" as const, rr, rungs,
    reward: resTarget != null ? resTarget - price : null, risk: supStop != null ? price - supStop : null,
  };
}

const KIND_COLOR: Record<Rung["kind"], string> = { target: "var(--up)", entry: "var(--accent)", close: "var(--text)", stop: "var(--down)" };

export function TradePlanLadder({ ticker, price, stock, ohlcv, low52, high52 }: {
  ticker: string; price: number | null; stock?: TechnicalRecord; ohlcv: OhlcvPayload | null; low52: number | null; high52: number | null;
}) {
  if (price == null) return <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No price for {ticker}.</div>;
  const plan = buildPlan(price, stock, ohlcv, low52, high52);

  if (!plan) {
    return (
      <div>
        <div style={KICKER}>TRADE PLAN · REWARD-TO-RISK</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 10 }}>Levels unavailable — not enough price history for {ticker}.</div>
      </div>
    );
  }

  const prices = plan.rungs.map((r) => r.price);
  const lo = Math.min(...prices), hi = Math.max(...prices);
  const span = hi - lo || 1;
  const H = 260, PAD = 16;
  const y = (p: number) => PAD + (1 - (p - lo) / span) * (H - PAD * 2);
  const yClose = y(price);
  const yTarget = plan.rungs.find((r) => r.kind === "target") ? y(Math.max(...plan.rungs.filter((r) => r.price > price).map((r) => r.price), price)) : yClose;
  const yStop = plan.rungs.find((r) => r.kind === "stop") ? y(Math.min(...plan.rungs.filter((r) => r.price < price).map((r) => r.price), price)) : yClose;
  const rrMeets = plan.rr != null && plan.rr >= 2;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
        <div style={KICKER}>TRADE PLAN · REWARD-TO-RISK</div>
        <span style={{ fontSize: 9.5, fontWeight: 700, color: plan.mode === "Active setup" ? "var(--up)" : "var(--muted)", background: plan.mode === "Active setup" ? "var(--upSoft)" : "var(--soft)", borderRadius: 6, padding: "2px 8px" }}>{plan.mode}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--faint)", marginBottom: 10 }}>Levels around the close · reward blue / risk red</div>

      <div style={{ display: "flex", gap: 12 }}>
        {/* ladder */}
        <div style={{ position: "relative", width: 30, height: H, flex: "none" }}>
          {/* reward zone (close -> target) */}
          <div style={{ position: "absolute", left: 12, right: 6, top: Math.min(yClose, yTarget), height: Math.abs(yClose - yTarget), background: "var(--upSoft)", borderRadius: 3 }} />
          {/* risk zone (close -> stop) */}
          <div style={{ position: "absolute", left: 12, right: 6, top: Math.min(yClose, yStop), height: Math.abs(yClose - yStop), background: "var(--downSoft)", borderRadius: 3 }} />
          <div style={{ position: "absolute", left: 18, top: PAD, bottom: PAD, width: 1, background: "var(--hair)" }} />
          {plan.rungs.map((r) => (
            <div key={r.name} style={{ position: "absolute", left: 12, right: 2, top: y(r.price), height: r.kind === "close" ? 2 : 1, background: KIND_COLOR[r.kind], opacity: r.kind === "close" ? 1 : 0.7, transform: "translateY(-50%)" }} />
          ))}
        </div>
        {/* rung labels */}
        <div style={{ position: "relative", flex: 1, height: H }}>
          {plan.rungs.map((r) => {
            const pctFromClose = ((r.price - price) / price) * 100;
            return (
              <div key={r.name} style={{ position: "absolute", left: 0, right: 0, top: y(r.price), transform: "translateY(-50%)", display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 11, fontWeight: r.kind === "close" ? 800 : 600, color: r.kind === "close" ? "var(--text)" : KIND_COLOR[r.kind], width: 92, flexShrink: 0 }}>{r.name}{r.note ? <span style={{ color: "var(--faint)", fontWeight: 400, fontSize: 9.5 }}> · {r.note}</span> : null}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{formatNumber(r.price, 0)}</span>
                {r.kind !== "close" ? <span style={{ fontFamily: MONO, fontSize: 10.5, color: pctFromClose >= 0 ? "var(--up)" : "var(--down)" }}>{pctFromClose >= 0 ? "+" : "−"}{Math.abs(pctFromClose).toFixed(1)}%</span> : <span style={{ fontSize: 9.5, color: "var(--faint)" }}>anchor</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* R:R badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, borderTop: "1px solid var(--hair)", paddingTop: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: rrMeets ? "var(--up)" : "var(--flat)" }}>{plan.rr == null ? "—" : `${plan.rr.toFixed(1)}R`}</span>
        <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.4 }}>
          reward {plan.reward == null ? "—" : `+${((plan.reward / price) * 100).toFixed(1)}%`} / risk {plan.risk == null ? "—" : `−${((plan.risk / price) * 100).toFixed(1)}%`}
          {rrMeets ? <span style={{ color: "var(--up)", fontWeight: 700 }}> · meets ≥2R</span> : null}
        </div>
      </div>
    </div>
  );
}
