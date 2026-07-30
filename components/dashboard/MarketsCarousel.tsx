"use client";

import { useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { buildCard, type InstrumentSpec } from "./InstrumentCard";
import type { MarketContextPayload } from "@/lib/data/marketContext";
import { formatNumber, formatPercent } from "@/lib/format/number";

const MONO = "var(--font-mono)";
const KICKER: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };

// Cross-asset instruments, grouped by context (matches the redesign prototype).
const GROUPS: Array<{ label: string; specs: InstrumentSpec[] }> = [
  { label: "INDEX", specs: [
    { code: "EIDO", keys: ["EIDO"], tv: "AMEX:EIDO" },
    { code: "S&P 500", keys: ["SPX", "^GSPC"], tv: "SP:SPX" },
    { code: "KOSPI", keys: ["KOSPI", "^KS11"], tv: "KRX:KOSPI" },
  ] },
  { label: "MACRO · COMMODITIES", specs: [
    { code: "Coal", keys: ["COAL", "MTF=F"], tv: "NYMEX:MTF1!" },
    { code: "Brent", keys: ["BRENT", "BZ=F"], tv: "TVC:UKOIL" },
    { code: "Gold", keys: ["GOLD", "GC=F"], tv: "OANDA:XAUUSD" },
    { code: "DXY", keys: ["DXY", "DX-Y.NYB"], tv: "TVC:DXY" },
  ] },
  { label: "MONEYFLOW · RATES & FX", specs: [
    { code: "US 10Y", keys: ["US10Y", "^TNX"], tv: "TVC:US10Y" },
    { code: "USDIDR", keys: ["USDIDR", "IDR=X"], tv: "FX_IDC:USDIDR" },
    { code: "BTC", keys: ["BTC", "BTC-USD"], tv: "BINANCE:BTCUSDT" },
  ] },
];

const pctColor = (v: number | null) => (v == null || v === 0 ? "var(--flat)" : v > 0 ? "var(--up)" : "var(--down)");
const glyph = (v: number | null) => (v == null || v === 0 ? "•" : v > 0 ? "▲" : "▼");

type Card = ReturnType<typeof buildCard>;

/** One instrument card: value, area sparkline (prev-close ref + end dot + hover crosshair), 1D/5D/20D pills. */
function MarketCard({ card }: { card: Card }) {
  const [hover, setHover] = useState<{ xPct: number; yPct: number; value: number } | null>(null);
  const s = (card.series || []).filter(Number.isFinite).slice(-40);
  const min = s.length ? Math.min(...s) : 0;
  const max = s.length ? Math.max(...s) : 1;
  const range = max - min || 1;
  const H = 44, PAD = 4;
  const yOf = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);
  const d = s.map((v, i) => `${i ? "L" : "M"} ${((i / (s.length - 1)) * 100).toFixed(2)} ${yOf(v).toFixed(2)}`).join(" ");
  const prevTop = card.prev != null ? (yOf(card.prev) / H) * 100 : 50;
  const dotTop = card.value != null ? (yOf(card.value) / H) * 100 : 50;
  const color = card.up ? "var(--up)" : "var(--down)";
  const fill = card.up ? "var(--upSoft)" : "var(--downSoft)";

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (s.length < 2) return;
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const idx = Math.round(frac * (s.length - 1));
    const v = s[idx];
    setHover({ xPct: (idx / (s.length - 1)) * 100, yPct: (yOf(v) / H) * 100, value: v });
  }

  return (
    <div style={{ flex: "0 0 300px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 14, padding: "13px 14px", display: "flex", flexDirection: "column", gap: 9 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-.01em" }}>{card.code}</span>
        <a href={card.tv} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 7, padding: "3px 7px", textDecoration: "none", whiteSpace: "nowrap" }}>TradingView ↗</a>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontFamily: MONO, fontSize: 23, fontWeight: 700, lineHeight: 1 }}>{card.value == null ? "—" : formatNumber(card.value, 2)}</div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
          <div style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: pctColor(card.changePct) }}>{glyph(card.changePct)} {card.changePct == null ? "—" : formatPercent(card.changePct)}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--faint)" }}>Prev {card.prev == null ? "—" : formatNumber(card.prev, 2)}</div>
        </div>
      </div>
      <div style={{ position: "relative", height: 36 }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <svg viewBox="0 0 100 44" preserveAspectRatio="none" style={{ width: "100%", height: "100%", display: "block" }}>
          <path d={`${d} L 100 44 L 0 44 Z`} fill={fill} />
          <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div style={{ position: "absolute", left: 0, right: 0, top: `${prevTop}%`, borderTop: "1px dashed var(--faint)", opacity: 0.4 }} />
        <div style={{ position: "absolute", left: "calc(100% - 3px)", top: `${dotTop}%`, width: 7, height: 7, borderRadius: "50%", background: color, transform: "translate(-50%,-50%)", boxShadow: "0 0 0 2px var(--panel)" }} />
        {hover ? (
          <>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: `${hover.xPct}%`, width: 1, background: "var(--faint)", opacity: 0.6 }} />
            <div style={{ position: "absolute", left: `${hover.xPct}%`, top: `${hover.yPct}%`, width: 6, height: 6, borderRadius: "50%", background: color, transform: "translate(-50%,-50%)", boxShadow: "0 0 0 2px var(--panel)" }} />
            <div style={{ position: "absolute", left: `${hover.xPct}%`, top: -6, transform: `translate(${hover.xPct > 60 ? "-100%" : "0"},-100%)`, fontFamily: MONO, fontSize: 10, fontWeight: 700, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap", pointerEvents: "none" }}>{formatNumber(hover.value, 2)}</div>
          </>
        ) : null}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {card.periods.map((p) => (
          <div key={p.label} style={{ flex: 1, background: "var(--soft)", border: "1px solid var(--hair)", borderRadius: 9, padding: "5px 4px", textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "var(--faint)", letterSpacing: ".06em", marginBottom: 2 }}>{p.label}</div>
            <div style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: pctColor(p.val) }}>{p.val == null ? "—" : `${glyph(p.val)}${formatPercent(p.val)}`}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketsCarousel({ marketContext }: { marketContext: MarketContextPayload | null }) {
  const [group, setGroup] = useState(GROUPS[0].label);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const cards = useMemo(() => {
    const g = GROUPS.find((x) => x.label === group) || GROUPS[0];
    return g.specs.map((spec) => buildCard(marketContext, spec));
  }, [group, marketContext]);

  const scroll = (dir: number) => trackRef.current?.scrollBy({ left: dir * 324, behavior: "smooth" });

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))", padding: "16px 18px", margin: "18px 0 14px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
          <span style={KICKER}>MARKETS · CROSS-ASSET</span>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {GROUPS.map((g) => {
              const on = g.label === group;
              return (
                <button key={g.label} type="button" onClick={() => { setGroup(g.label); trackRef.current?.scrollTo({ left: 0 }); }}
                  style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".03em", padding: "5px 12px", borderRadius: 9, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--muted)", cursor: "pointer", whiteSpace: "nowrap" }}>
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {[["‹", -1], ["›", 1]].map(([lab, dir]) => (
            <button key={lab as string} type="button" onClick={() => scroll(dir as number)} aria-label={dir === -1 ? "Scroll left" : "Scroll right"}
              style={{ width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--border)", background: "var(--panel)", color: "var(--muted)", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>
              {lab}
            </button>
          ))}
        </div>
      </div>
      <div ref={trackRef} style={{ display: "flex", gap: 12, overflowX: "auto", scrollBehavior: "smooth", paddingBottom: 4 }}>
        {cards.map((c) => <MarketCard key={c.code} card={c} />)}
      </div>
    </div>
  );
}
