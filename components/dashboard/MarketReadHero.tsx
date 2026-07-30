"use client";

import type { CSSProperties } from "react";
import type { MarketRisk } from "@/lib/data/marketRisk";
import { latestInstrumentValue, type MarketContextPayload, type MarketInstrument } from "@/lib/data/marketContext";
import { formatNumber, formatPercent } from "@/lib/format/number";

const findInst = (mc: MarketContextPayload | null, ...keys: string[]): MarketInstrument | undefined =>
  (mc?.instruments || []).find((i) => keys.some((k) => i.label?.toUpperCase() === k.toUpperCase() || i.symbol?.toUpperCase() === k.toUpperCase()));

const metricValue = (risk: MarketRisk, name: string): string | null => risk.metrics.find((m) => m.name === name)?.value ?? null;

/** Regime word + qualifier from the composite score. */
function regime(risk: MarketRisk): { word: string; qualifier: string } {
  const s = risk.score;
  if (s >= 65) return { word: "RISK-ON", qualifier: "· firmly bid" };
  if (s >= 55) return { word: "RISK-ON", qualifier: "· leaning firm" };
  if (s > 45) return { word: "NEUTRAL", qualifier: s >= 50 ? "· leaning firm" : "· leaning soft" };
  if (s > 35) return { word: "RISK-OFF", qualifier: "· leaning soft" };
  return { word: "RISK-OFF", qualifier: "· defensive" };
}

/** Build the plain-language "why" from the live metrics — never a static string. */
function buildWhy(risk: MarketRisk, mc: MarketContextPayload | null): string {
  const ihsg = findInst(mc, "IHSG", "^JKSE");
  const ihsgChg = ihsg ? latestInstrumentValue(ihsg).changePct : null;
  const breadth = metricValue(risk, "Breadth");
  const vixName = risk.metrics.find((m) => m.name === "Volatility gauge")?.value ?? null;
  const spx = metricValue(risk, "Global backdrop");
  const dd = metricValue(risk, "Drawdown");

  const parts: string[] = [];
  if (ihsgChg !== null) parts.push(`IHSG ${formatPercent(ihsgChg)}`);
  if (breadth) parts.push(`breadth ${breadth}`);
  let lead = parts.join(" and ");

  const tail: string[] = [];
  if (vixName) tail.push(`VIX ${vixName.toLowerCase()}`);
  if (spx) tail.push(`S&P ${spx.toLowerCase()}`);
  if (dd) tail.push(`IHSG ${dd.toLowerCase()}`);

  // Notable cross-asset tells (largest 1-day moves among the risk peers).
  const tells: Array<{ code: string; pct: number }> = [];
  for (const [code, ...keys] of [["KOSPI", "KOSPI", "^KS11"], ["Brent", "BRENT", "BZ=F"], ["EIDO", "EIDO"], ["Gold", "GOLD", "GC=F"]] as string[][]) {
    const inst = findInst(mc, ...keys);
    const p = inst ? latestInstrumentValue(inst).changePct : null;
    if (p !== null && Math.abs(p) >= 0.02) tells.push({ code, pct: p });
  }
  tells.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
  const tellStr = tells.slice(0, 2).map((t) => `${t.code} ${formatPercent(t.pct)}`).join(" and ");

  let why = lead ? `${lead}` : "Regime read";
  if (tail.length) why += ` — ${tail.join(", ")}`;
  why += ".";
  if (tellStr) why += ` ${tellStr} ${tells.length > 1 ? "are" : "is"} the move${tells.length > 1 ? "s" : ""} to watch.`;
  return why;
}

const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".14em", color: "var(--faint)" };

export function MarketReadHero({ risk, mc }: { risk: MarketRisk | null; mc: MarketContextPayload | null }) {
  if (!risk) return null;
  const color = risk.tone === "up" ? "var(--up)" : risk.tone === "down" ? "var(--down)" : "var(--flat)";
  const tint = risk.tone === "up" ? "var(--upSoft)" : risk.tone === "down" ? "var(--downSoft)" : "var(--soft)";
  const { word, qualifier } = regime(risk);
  const why = buildWhy(risk, mc);

  const chips = ([
    ["IHSG", findInst(mc, "IHSG", "^JKSE"), 0],
    ["VIX", findInst(mc, "VIX", "^VIX"), 2],
    ["S&P 500", findInst(mc, "SPX", "^GSPC"), 0],
    ["KOSPI", findInst(mc, "KOSPI", "^KS11"), 0],
  ] as Array<[string, MarketInstrument | undefined, number]>).map(([label, inst, dp]) => {
    const v = inst ? latestInstrumentValue(inst) : null;
    const pct = v?.changePct ?? null;
    return {
      label,
      value: v?.value != null ? formatNumber(v.value, dp) : "—",
      color: pct == null || pct === 0 ? "var(--flat)" : pct > 0 ? "var(--up)" : "var(--down)",
      pct: pct == null ? "" : formatPercent(pct),
    };
  });

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 12, background: "var(--soft)", padding: "20px 22px", flex: "0 0 auto" }}>
      <div style={{ position: "absolute", inset: 0, background: tint, pointerEvents: "none" }} />
      <div style={{ position: "relative" }}>
        <div style={{ ...KICKER, marginBottom: 8 }}>TODAY&apos;S MARKET READ</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-.03em", lineHeight: 0.9, color }}>{word}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color }}>{qualifier}</div>
        </div>
        <p style={{ margin: "14px 0 0", color: "var(--muted)", fontSize: 13.5, lineHeight: 1.55, textWrap: "pretty" as CSSProperties["textWrap"] }}>{why}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {chips.map((ch) => (
            <div key={ch.label} style={{ display: "inline-flex", alignItems: "baseline", gap: 6, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "4px 9px" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "var(--faint)", letterSpacing: ".04em" }}>{ch.label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700 }}>{ch.value}</span>
              {ch.pct ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 700, color: ch.color }}>{ch.pct}</span> : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
