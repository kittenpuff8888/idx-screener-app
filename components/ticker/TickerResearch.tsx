"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useApp } from "@/components/providers/AppProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { fetchJson } from "@/lib/data/client";
import { loadOhlcv } from "@/lib/data/ticker";
import type { JsonRecord, OhlcvPayload, TechnicalRecord } from "@/lib/domain/types";
import { TradingViewChart, ChartIndicatorPicker } from "@/components/dashboard/TradingViewChart";
import { IndicatorCompanion } from "@/components/dashboard/IndicatorCompanion";
import { DcfPanel } from "@/components/ticker/DcfPanel";
import { computeDcf, DEFAULT_ASSUMPTIONS, type DcfInputs } from "@/lib/valuation/dcf";
import { computeSetupVerdict, type SetupVerdict } from "@/lib/valuation/setupVerdict";
import { computeAnchoredVolumeProfile, type VolumeProfileResult } from "@/lib/indicators/volumeProfile";
import { buildVolumeProfileLevels, buildMaLevels, buildQuarterVwapLevels, buildYearVwapLevels, buildInitialBalanceLevels, buildPreviousWeekLevels, buildCurrentWeekLevels, buildDcfLevels, GROUP_META, type LevelGroup, type PriceLevel } from "@/lib/valuation/priceLevels";
import { newsStories, type NewsStory } from "@/lib/data/news";
import { asNumber, formatNumber, formatPrice } from "@/lib/format/number";

const MONO = "var(--font-mono)";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))", padding: "16px 18px" };
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const HAIR = "1px solid var(--hair)";
const n = (v: unknown) => asNumber(v as never);
const NoData = ({ s = 11 }: { s?: number }) => <span style={{ fontFamily: MONO, color: "var(--faint)", fontStyle: "italic", fontSize: s }}>no data</span>;

// fraction → "+1.9%" ; billions → "Rp 470 T"
const sPct = (v: number | null, d = 1) => (v == null || !isFinite(v) ? "—" : `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(d)}%`);
const pol = (v: number | null) => (v == null || v === 0 ? "var(--flat)" : v > 0 ? "var(--up)" : "var(--down)");
const fmtT = (bn: number | null) => (bn == null ? "—" : bn >= 1000 ? `Rp ${(bn / 1000).toFixed(bn >= 100000 ? 0 : 1)} T` : `Rp ${Math.round(bn)} B`);

const SETUP_MAX: Record<string, number> = { location: 25, structure: 25, orderflow: 25, ownership: 20, liquidity: 5 };
const SETUP_ORDER = ["location", "structure", "orderflow", "ownership", "liquidity"] as const;
const SETUP_LABEL: Record<string, string> = { location: "Location", structure: "Structure", orderflow: "Order-flow", ownership: "Ownership", liquidity: "Liquidity" };

type Setup = { ticker: string; name?: string; sector?: string; close?: number; score: number; components: Record<string, number>; entryZone: number; invalidation: number; target: number; cvdSpark?: number[]; kseiFootprint?: { netDeltaPP?: number; accumulation?: boolean } | null; why: string; history?: { signals: number; hitRate: number } | null };
type HistEntry = { date: string; ticker: string; score: number; close: number; target: number; outcome: string };

function Section({ title, badge, children, style }: { title: string; badge?: React.ReactNode; children: React.ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ ...CARD, ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={KICKER}>{title}</span>
        <div style={{ flex: 1 }} />
        {badge}
      </div>
      {children}
    </div>
  );
}

function Spark({ vals, color, h = 34 }: { vals: number[]; color: string; h?: number }) {
  if (!vals || vals.length < 2) return null;
  const mn = Math.min(...vals), mx = Math.max(...vals), sp = mx - mn || 1;
  const d = vals.map((v, i) => `${i ? "L" : "M"} ${((i / (vals.length - 1)) * 100).toFixed(2)} ${(18 - ((v - mn) / sp) * 16 - 1).toFixed(2)}`).join(" ");
  return <svg viewBox="0 0 100 18" preserveAspectRatio="none" style={{ width: "100%", height: h }} aria-hidden><path d={d} fill="none" stroke={color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg>;
}

export function TickerResearch() {
  const params = useSearchParams();
  const router = useRouter();
  const ticker = (params.get("ticker") || params.get("symbol") || "").trim().toUpperCase().replace(".JK", "");
  const { bundle, ksei, idxIndex, indexes, marketContext, marketDate, openTicker } = useApp();

  const [ohlcv, setOhlcv] = useState<OhlcvPayload | null>(null);
  const [setups, setSetups] = useState<Setup[] | null>(null);
  const [hist, setHist] = useState<HistEntry[]>([]);
  const [range, setRange] = useState<"1M" | "3M" | "6M" | "1Y">("3M");

  const stock = ticker ? bundle?.technical.get(ticker) : undefined;
  const fund = ticker ? bundle?.fundamentals.get(ticker) : undefined;
  const ownership = ticker ? ksei?.records.find((r) => r.ticker === ticker) : undefined;
  const tickerNews = useMemo(() => (ticker ? newsStories(bundle).filter((nn) => nn.ticker === ticker) : []), [bundle, ticker]);
  const indexRecord = ticker ? idxIndex?.records[ticker] : undefined;

  useEffect(() => {
    let cancel = false; setOhlcv(null);
    if (ticker && marketDate) loadOhlcv(marketDate, ticker).then((p) => { if (!cancel) setOhlcv(p); });
    return () => { cancel = true; };
  }, [ticker, marketDate]);
  useEffect(() => {
    if (!marketDate) return;
    fetchJson<{ setups: Setup[] }>(`/data/dates/${marketDate}/setups.json`).then((p) => setSetups(p.setups || [])).catch(() => setSetups([]));
    fetchJson<{ entries?: HistEntry[] }>("/data/setups-history.json").then((p) => setHist(p.entries || [])).catch(() => setHist([]));
  }, [marketDate]);

  const setup = useMemo(() => (setups || []).find((s) => s.ticker === ticker) || null, [setups, ticker]);
  const verdict = useMemo(() => (setup ? null : computeSetupVerdict(stock, fund)), [setup, stock, fund]);
  const firstLive = useMemo(() => (setups || [])[0]?.ticker, [setups]);

  // IHSG series for benchmark returns
  const ihsg = useMemo(() => {
    const inst = (marketContext?.instruments || []).find((i) => ["IHSG", "^JKSE"].includes((i.label || "").toUpperCase()) || ["IHSG", "^JKSE"].includes((i.symbol || "").toUpperCase()));
    return (inst?.rows || []).filter((r) => !marketDate || String(r.date) <= marketDate).map((r) => Number(r.close ?? r.value)).filter((v) => isFinite(v));
  }, [marketContext, marketDate]);

  // Real anchored Volume Profile — the default ladder's VAH/POC/VAL now come
  // from an actual volume-at-price histogram over the most recent qualifying
  // consolidation, not a nearest-support/resistance proxy (see lib/indicators/
  // volumeProfile.ts for the anchor rule and methodology).
  const volumeProfile = useMemo(() => computeAnchoredVolumeProfile(ohlcv?.rows), [ohlcv]);

  if (!ticker) return <section><Back router={router} label="Ticker research" /><EmptyState title="No ticker selected" body="Open a ticker from the Screener, Watchlist, or search." /></section>;
  if (!stock && !fund && !ownership) return <section><Back router={router} label={`${ticker} research`} /><EmptyState title="Ticker not found" body="This symbol is not in the current research session or KSEI snapshot." /></section>;

  const price = n(stock?.lastPrice) ?? n(fund?.["Price"]);
  const chg = n(stock?.changePercent) ?? n(fund?.["Price Change %"]);
  const name = setup?.name || (fund?.["Company Name"] as string) || stock?.companyName || ownership?.companyName || ticker;
  const sector = ownership?.sector || setup?.sector || "—";
  const hi52 = n(fund?.["52 Week High"]); const lo52 = n(fund?.["52 Week Low"]);
  const rangePos = hi52 != null && lo52 != null && hi52 > lo52 && price != null ? ((price - lo52) / (hi52 - lo52)) * 100 : null;
  const offLow = lo52 != null && price != null && lo52 > 0 ? ((price - lo52) / lo52) * 100 : null;

  const t = (stock?.["technical"] || {}) as JsonRecord;
  const ma = (stock?.["movingAverages"] || {}) as JsonRecord;
  const supports = (stock?.["supportLevels"] as number[]) || [];
  const resist = (stock?.["resistanceLevels"] as number[]) || [];
  const vwap = n(t["vwap"]);
  // Real Volume Profile when a qualifying consolidation anchor was found;
  // falls back to the nearest-support/resistance proxy only when it wasn't
  // (e.g. a ticker that's been trending the whole lookback with no clean
  // range to anchor on) — never regress to blank when the old method could
  // still show something reasonable.
  const VAL = volumeProfile?.val ?? (price != null ? Math.max(...supports.filter((s) => s < price), lo52 ?? -Infinity) : null);
  const VAH = volumeProfile?.vah ?? (price != null ? Math.min(...resist.filter((r) => r > price), hi52 ?? Infinity) : null);
  const PoC = volumeProfile?.poc ?? vwap ?? (VAL != null && VAH != null ? (VAL + VAH) / 2 : null);

  const stats: Array<[string, string, boolean?]> = [
    ["MKT CAP", fmtT(n(fund?.["Market Cap"]))],
    ["PE (TTM)", n(fund?.["Current PE Ratio (TTM)"]) == null ? "—" : `${n(fund?.["Current PE Ratio (TTM)"])!.toFixed(1)}×`],
    ["ROE", n(fund?.["Return on Equity (TTM)"]) == null ? "—" : `${(n(fund?.["Return on Equity (TTM)"])! * 100).toFixed(2)}%`],
    ["DIV YIELD", n(fund?.["Latest Dividend · Historical latest · yfinance · Dividend Yield (%)"]) == null ? "—" : `${(n(fund?.["Latest Dividend · Historical latest · yfinance · Dividend Yield (%)"])! * 100).toFixed(2)}%`],
    ["FREE FLOAT", n(fund?.["Free Float (%)"]) == null ? "—" : `${(n(fund?.["Free Float (%)"])! * 100).toFixed(2)}%`],
    ["RVOL", n(stock?.["rvol"]) == null ? "—" : `${n(stock?.["rvol"])!.toFixed(2)}×`],
    ["BETA vs IHSG", n(stock?.["beta"]) == null ? "—" : n(stock?.["beta"])!.toFixed(2)],
  ];

  return (
    <section>
      <Back router={router} label={`${ticker} research`} switcher={{ current: ticker, live: firstLive, onOpen: openTicker }} />

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={{ ...CARD, marginBottom: 14, display: "grid", gridTemplateColumns: "minmax(220px,1.1fr) minmax(200px,1fr) minmax(220px,1fr)", gap: 18, alignItems: "start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>{ticker}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 6, padding: "2px 8px" }}>{sector}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, maxWidth: 300 }}>{name}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 8 }}>
            <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800 }}>{price == null ? "—" : formatPrice(price)}</span>
            <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, color: pol(chg) }}>{chg == null ? "" : `${chg >= 0 ? "▲" : "▼"} ${sPct(chg, 2)}`}</span>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 4 }}>Close · {marketDate} · <a href={`https://www.tradingview.com/chart/?symbol=IDX%3A${ticker}`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>TradingView ↗</a></div>
        </div>
        <div>
          <div style={{ ...KICKER, fontSize: 9 }}>52-WEEK RANGE</div>
          {hi52 != null && lo52 != null ? (<>
            <div style={{ position: "relative", height: 8, background: "var(--soft)", borderRadius: 5, marginTop: 12 }}>
              <div style={{ position: "absolute", left: 0, right: 0, top: 3, height: 2, background: "linear-gradient(90deg,var(--down),var(--flat),var(--up))", opacity: .5 }} />
              {rangePos != null ? <div style={{ position: "absolute", left: `${Math.max(0, Math.min(100, rangePos))}%`, top: -3, width: 14, height: 14, borderRadius: "50%", background: "var(--accent)", border: "2px solid var(--panel)", transform: "translateX(-50%)" }} /> : null}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10.5, color: "var(--muted)", marginTop: 6 }}><span>{formatPrice(lo52)} low</span><span>{formatPrice(hi52)} high</span></div>
            <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 4 }}>{rangePos != null ? `${Math.round(rangePos)}% of range` : ""}{offLow != null ? ` · ${offLow.toFixed(0)}% off low` : ""}</div>
          </>) : <div style={{ marginTop: 12, fontSize: 11.5, color: "var(--faint)" }}>52-week range not available for this ticker.</div>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
          {stats.map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".07em", color: "var(--faint)" }}>{k}</div>
              <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, marginTop: 1 }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SETUP VERDICT | TRADE PLAN (design/00) ─────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(0,1fr)", gap: 14, marginBottom: 14, alignItems: "stretch" }}>
        <div style={{ ...CARD, display: "flex", flexDirection: "column" }}>
          <div style={{ ...KICKER, marginBottom: 12 }}>SETUP VERDICT</div>
          {setup ? <SetupActive setup={setup} /> : <SetupVerdictCard verdict={verdict} rangePos={rangePos} offLow={offLow} />}
        </div>
        <div style={{ ...CARD, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={KICKER}>TRADE PLAN · PRICE LADDER</span>
          </div>
          <TradePlan setup={setup} price={price} hi52={hi52} lo52={lo52} VAL={VAL} VAH={VAH} PoC={PoC} atr={n(t["atrPercent"])} ma={ma} technical={t} ohlcv={ohlcv} stock={stock} fund={fund} volumeProfile={volumeProfile} />
        </div>
      </div>

      {/* ── PRICE CHART (full width, design/00) ─────────────────── */}
      <div style={{ ...CARD, marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={KICKER}>PRICE · {ticker} · VWAP + MA</span>
          {[["VAL", VAL], ["PoC", PoC], ["VAH", VAH]].map(([l, v]) => v != null ? <span key={l as string} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 5, padding: "2px 7px" }}>{l} {formatPrice(v as number)}</span> : null)}
          <div style={{ flex: 1 }} />
          <ChartIndicatorPicker />
          <div style={{ display: "flex", gap: 3, background: "var(--soft)", borderRadius: 8, padding: 3 }}>
            {(["1M", "3M", "6M", "1Y"] as const).map((r) => <button key={r} type="button" onClick={() => setRange(r)} style={{ fontSize: 10.5, fontWeight: 700, padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: range === r ? "var(--accent)" : "transparent", color: range === r ? "#fff" : "var(--muted)" }}>{r}</button>)}
          </div>
        </div>
        <TradingViewChart symbol={`IDX:${ticker}`} range={range === "1Y" ? "12M" : range} interval="1D" minHeight={460} />
      </div>

      {/* Custom-overlay companion (renders only when a ƒx CUSTOM overlay is on) */}
      <IndicatorCompanion ohlcv={ohlcv} symbol={ticker} sessions={{ "1M": 22, "3M": 66, "6M": 130, "1Y": 252 }[range] ?? 140} />

      {/* ── DCF VALUATION ──────────────────────────────────────── */}
      <DcfPanel ticker={ticker} stock={stock} fund={fund} marketDate={marketDate} />

      {/* ── KEY STATISTICS | COMPANY INFO ──────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 14, marginBottom: 14, alignItems: "stretch" }}>
        <Section title="KEY STATISTICS"><KeyStats fund={fund} marketDate={marketDate} /></Section>
        <Section title="COMPANY INFORMATION"><CompanyInfo fund={fund} ownership={ownership} /></Section>
      </div>

      {/* ── TECHNICAL ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}><TechnicalCard stock={stock as JsonRecord | undefined} t={t} ma={ma} price={price} VAL={VAL} VAH={VAH} PoC={PoC} /></div>

      {/* ── RETURNS | OWNERSHIP ────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 14, marginBottom: 14, alignItems: "stretch" }}>
        <Section title="RETURNS · vs SECTOR & IHSG"><Returns fund={fund} ihsg={ihsg} sectorSeries={sectorSeries(indexes, sector)} /></Section>
        <Section title="OWNERSHIP · KSEI" badge={<span style={{ fontSize: 9.5, color: "var(--faint)" }}>as of {ksei?.asOf || marketDate}</span>}><Ownership ownership={ownership} footprint={setup?.kseiFootprint} /></Section>
      </div>

      {/* ── DIVIDEND | NEWS | PEERS ────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14, marginBottom: 14, alignItems: "stretch" }}>
        <Section title="DIVIDEND"><Dividend fund={fund} /></Section>
        <Section title="NEWS & CATALYSTS"><NewsList stories={tickerNews} /></Section>
        <Section title={`SECTOR PEERS · ${sector.toUpperCase()}`}><Peers ticker={ticker} sector={sector} ksei={ksei?.records || []} bundle={bundle} onOpen={openTicker} /></Section>
      </div>

      {/* ── CORP CALENDAR | FILINGS ────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 14, marginBottom: 14, alignItems: "stretch" }}>
        <Section title="CORPORATE-ACTION CALENDAR"><CorpCalendar fund={fund} /></Section>
        <Section title="FILINGS & DISCLOSURES"><Filings indexRecord={indexRecord} kseiAsOf={ksei?.asOf} marketDate={marketDate} /></Section>
      </div>


      <p style={{ fontSize: 10, color: "var(--faint)", lineHeight: 1.6, margin: "4px 4px 20px" }}>
        <b style={{ color: "var(--muted)" }}>Real vs modelled.</b> <b style={{ color: "var(--up)" }}>Real</b> (decision-grade): setup score &amp; components, entry/stop/target, ROE, returns, 52-week range, KSEI net-flow. <b style={{ color: "var(--warning)" }}>Modelled / representative</b> (labelled): technical RSI/MA reads, ownership foreign/local split, corporate-action &amp; filings calendar, sample news. Genuinely-absent fields read <b>no data</b>, never fabricated. Data as of {marketDate} close (EOD, delayed) — not investment advice.
      </p>
    </section>
  );
}

// ── sub-sections ────────────────────────────────────────────────

function Back({ router, label, switcher }: { router: ReturnType<typeof useRouter>; label: string; switcher?: { current: string; live?: string; onOpen: (t: string) => void } }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
      <button type="button" onClick={() => router.back()} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--border)", background: "var(--panel)", borderRadius: 9, padding: "7px 12px", fontSize: 13, color: "var(--muted)", cursor: "pointer" }}>‹ Back</button>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" }}>{label}</h1>
      <div style={{ flex: 1 }} />
      {switcher?.live && switcher.live !== switcher.current ? <button type="button" onClick={() => switcher.onOpen(switcher.live!)} style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>{switcher.live}</button> : null}
    </div>
  );
}

function SetupActive({ setup }: { setup: Setup }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 44, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>{setup.score}</span>
        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: ".04em", color: setup.score >= 75 ? "var(--up)" : "var(--muted)", paddingBottom: 5 }}>{setup.score >= 75 ? "STRONG" : setup.score >= 60 ? "MODERATE" : "WEAK"}</span>
        <div style={{ flex: 1 }} />
        {setup.cvdSpark?.length ? <div style={{ width: 120 }}><div style={{ fontSize: 8.5, color: "var(--faint)", textAlign: "right" }}>CVD · ORDER-FLOW</div><Spark vals={setup.cvdSpark} color="var(--accent)" h={24} /></div> : null}
      </div>
      <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 4 }}>setup score · 0–100</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0" }}>
        {SETUP_ORDER.map((k) => {
          const v = setup.components[k] ?? 0, mx = SETUP_MAX[k];
          const good = v >= mx * 0.8, mid = v >= mx * 0.4;
          return (
            <div key={k} style={{ flex: "1 1 80px", background: "var(--soft)", borderRadius: 9, padding: "8px 6px", textAlign: "center" }}>
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: good ? "var(--up)" : mid ? "var(--warning)" : "var(--down)" }}>{v}/{mx}</div>
              <div style={{ fontSize: 8.5, color: "var(--muted)", marginTop: 1 }}>{SETUP_LABEL[k]}</div>
            </div>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: "var(--muted)", lineHeight: 1.55 }}>{setup.why}</p>
      <div style={{ display: "flex", gap: 12, fontFamily: MONO, fontSize: 11.5, marginTop: 10 }}>
        <span>entry <b>{formatPrice(setup.entryZone)}</b></span>
        <span style={{ color: "var(--down)" }}>stop <b>{formatPrice(setup.invalidation)}</b></span>
        <span style={{ color: "var(--up)" }}>target <b>{formatPrice(setup.target)}</b></span>
      </div>
    </div>
  );
}

const TILT_COLOR: Record<SetupVerdict["tilt"], string> = {
  "Bullish Tilt": "var(--up)", "Constructive": "var(--up)", "Neutral / Mixed": "var(--muted)", "Cautious": "var(--warning)", "Bearish Tilt": "var(--down)",
};

/** Shown when the signal engine hasn't flagged a triggered entry (no row in
    setups.json — that only means "no tradeable pattern today", not "no
    opinion"). computeSetupVerdict blends technical + fundamental signals
    (real, published fields) into a directional tilt; SetupNone (below) is
    the true last-resort when there isn't even enough data for that. */
function SetupVerdictCard({ verdict, rangePos, offLow }: { verdict: SetupVerdict | null; rangePos: number | null; offLow: number | null }) {
  if (!verdict) return <SetupNone rangePos={rangePos} offLow={offLow} />;
  const color = TILT_COLOR[verdict.tilt];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 34, fontWeight: 800, color, lineHeight: 1 }}>{verdict.score >= 0 ? "+" : ""}{Math.round(verdict.score)}</span>
        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: ".02em", color, paddingBottom: 4 }}>{verdict.tilt.toUpperCase()}</span>
      </div>
      <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 4 }}>fundamental + technical blend · −100 to +100 · not an active setup</div>
      <div style={{ display: "flex", gap: 6, margin: "12px 0" }}>
        <div style={{ flex: 1, background: "var(--soft)", borderRadius: 9, padding: "8px 10px" }}>
          <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800 }}>{verdict.technicalScore >= 0 ? "+" : ""}{Math.round(verdict.technicalScore)}</div>
          <div style={{ fontSize: 8.5, color: "var(--muted)", marginTop: 1 }}>Technical · {Math.round(verdict.technicalWeight * 100)}% weight</div>
        </div>
        <div style={{ flex: 1, background: "var(--soft)", borderRadius: 9, padding: "8px 10px" }}>
          <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: verdict.fundamentalScore == null ? "var(--faint)" : undefined }}>{verdict.fundamentalScore == null ? "—" : `${verdict.fundamentalScore >= 0 ? "+" : ""}${Math.round(verdict.fundamentalScore)}`}</div>
          <div style={{ fontSize: 8.5, color: "var(--muted)", marginTop: 1 }}>Fundamental · {Math.round(verdict.fundamentalWeight * 100)}% weight</div>
        </div>
      </div>
      <div style={{ fontSize: 9.5, color: "var(--faint)", marginBottom: 8 }}>Weighting profile: {verdict.weightProfile}{verdict.dcfIneligibleReason ? ` · DCF not eligible (${verdict.dcfIneligibleReason.toLowerCase()}) — fundamental score dropped, all weight on technical` : ""}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {verdict.factors.map((f) => {
          const pts = Math.round(f.points);
          return (
            <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
              <span style={{ fontFamily: MONO, fontWeight: 700, width: 34, textAlign: "right", color: pts > 0 ? "var(--up)" : "var(--down)" }}>{pts > 0 ? "+" : ""}{pts}</span>
              <span style={{ color: "var(--muted)", flex: 1 }}>{f.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--faint)" }}>{f.detail}</span>
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 10, color: "var(--faint)", lineHeight: 1.5, marginTop: 10 }}>
        Our own interpretive scoring from real technical + fundamental fields (not a triggered entry signal) — not investment advice. {rangePos != null ? `At ${Math.round(rangePos)}% of its 52-week range${offLow != null ? ` and ${offLow.toFixed(0)}% off the low` : ""}.` : ""}
      </p>
    </div>
  );
}

function SetupNone({ rangePos, offLow }: { rangePos: number | null; offLow: number | null }) {
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>No active setup</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Not flagged by the signal engine — monitoring.</div>
      <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, marginTop: 12 }}>
        {rangePos != null ? `At ${Math.round(rangePos)}% of its 52-week range${offLow != null ? ` and ${offLow.toFixed(0)}% off the low` : ""} — a value location. ` : ""}The signal engine has not flagged a triggered entry, and there isn&apos;t enough technical or fundamental data for an independent read either.
      </p>
    </div>
  );
}

type LadderRow = { id: string; v: number; label: string; tone: "up" | "down" | "flat"; explain?: string };

function TradePlan({ setup, price, hi52, lo52, VAL, VAH, PoC, atr, ma, technical, ohlcv, stock, fund, volumeProfile }: {
  setup: Setup | null; price: number | null; hi52: number | null; lo52: number | null; VAL: number | null; VAH: number | null; PoC: number | null; atr: number | null;
  ma?: JsonRecord; technical?: JsonRecord; ohlcv: OhlcvPayload | null; stock?: TechnicalRecord; fund?: JsonRecord; volumeProfile: VolumeProfileResult | null;
}) {
  // Volume Profile is the default basis for the core Target/Invalidation
  // rows (see VAL/VAH above) — pre-enabled here too so its own VAH/POC/VAL
  // rows are visible by default, consistent with the other opt-in groups.
  const [activeGroups, setActiveGroups] = useState<Set<LevelGroup>>(new Set<LevelGroup>(["vp"]));
  const [targetSel, setTargetSel] = useState<string | null>(null);
  const [invalSel, setInvalSel] = useState<string | null>(null);
  const toggleGroup = (g: LevelGroup) => setActiveGroups((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; });

  // VAH/POC/VAL are no longer pushed into core directly — they're now the
  // "vp" (Volume Profile) toggle group below, defaulted on, so they still
  // show by default without duplicating the same price rows under two labels.
  const core: LadderRow[] = [];
  const push = (id: string, v: number | null, label: string, tone: "up" | "down" | "flat") => { if (v != null && isFinite(v)) core.push({ id, v, label, tone }); };
  if (setup) {
    push("core-target", setup.target, "Target", "up");
    push("core-close", price, "CLOSE", "flat"); push("core-entry", setup.entryZone, "Entry", "flat"); push("core-stop", setup.invalidation, "Stop · invalidation", "down");
  } else {
    push("core-hi52", hi52, "52w swing high", "up");
    push("core-close", price, "CLOSE", "flat");
    push("core-lo52", lo52, "52w swing low", "down");
  }

  // Optional groups — real published/computed levels, opt-in via the chips below.
  const dcfLevel = useMemo(() => {
    const beta = n(stock?.beta);
    const fcfTtmBn = n(fund?.["Free cash flow (TTM)"]);
    const revenueGrowth = n(fund?.["Revenue (Quarter YoY Growth)"]);
    const marketCapAbs = n((stock?.fundamentals as JsonRecord | undefined)?.["marketCap"]);
    const sharesOutstanding = marketCapAbs != null && price != null && price > 0 ? marketCapAbs / price : null;
    const inputs: DcfInputs = { ticker: "", price, beta, fcfTtmBn, revenueGrowth, sharesOutstanding, week52High: null, week52Low: null, currency: "IDR" };
    const fcfGrowthRate = revenueGrowth == null || !isFinite(revenueGrowth) ? 0.05 : Math.max(-0.3, Math.min(0.4, revenueGrowth));
    const result = computeDcf(inputs, { ...DEFAULT_ASSUMPTIONS, fcfGrowthRate });
    return result.eligible ? buildDcfLevels(result.fairValuePerShare, result.bearFairValue, result.bullFairValue) : [];
  }, [stock, fund, price]);

  const extraByGroup: Record<LevelGroup, PriceLevel[]> = useMemo(() => {
    const q = buildQuarterVwapLevels(ohlcv?.rows);
    const y = buildYearVwapLevels(ohlcv?.rows);
    return {
      vp: buildVolumeProfileLevels(volumeProfile),
      ma: buildMaLevels(ma),
      cqvwap: q.current,
      pqvwap: q.previous,
      cyvwap: y.current,
      pyvwap: y.previous,
      ib: buildInitialBalanceLevels(technical),
      pwmp: buildPreviousWeekLevels(technical),
      cwmp: buildCurrentWeekLevels(technical),
      dcf: dcfLevel,
    };
  }, [volumeProfile, ma, ohlcv, technical, dcfLevel]);

  const extraRows: LadderRow[] = useMemo(
    () => (Object.keys(extraByGroup) as LevelGroup[]).filter((g) => activeGroups.has(g)).flatMap((g) => extraByGroup[g].map((l) => ({ id: l.id, v: l.price, label: l.label, tone: l.tone, explain: l.explain }))),
    [activeGroups, extraByGroup],
  );

  const rows = [...core, ...extraRows];
  // Merge levels that land on (near-)identical prices instead of silently
  // dropping every label but the first — e.g. PWH and MDH are frequently the
  // exact same real number, and both deserve to show on that rung.
  const uniq: LadderRow[] = [];
  for (const r of [...rows].sort((a, b) => b.v - a.v)) {
    const last = uniq[uniq.length - 1];
    if (last && r.label !== "CLOSE" && last.label !== "CLOSE" && Math.abs(last.v - r.v) < 0.5) {
      last.label = `${last.label} · ${r.label}`;
      const parts = [last.explain, r.explain].filter(Boolean);
      last.explain = parts.length ? parts.join(" ") : undefined;
      continue;
    }
    uniq.push({ ...r });
  }

  // Selected (or default) target/invalidation — click any non-CLOSE row's T/S
  // button to override; R:R and the reward/risk readout recompute live.
  const defaultTargetId = setup ? "core-target" : "vp-vah";
  const defaultInvalId = setup ? "core-stop" : "vp-val";
  const targetRow = uniq.find((r) => r.id === (targetSel ?? defaultTargetId)) ?? uniq.find((r) => r.id === defaultTargetId);
  const invalRow = uniq.find((r) => r.id === (invalSel ?? defaultInvalId)) ?? uniq.find((r) => r.id === defaultInvalId);
  // Fall back to the raw VAH/VAL props (not just the "vp" row list) so the
  // Reward:Risk readout still works even if the user toggles the Volume
  // Profile chip off — it stays the real default basis, just optionally hidden.
  const rewardTo = targetRow?.v ?? (!setup ? VAH : null);
  const riskTo = invalRow?.v ?? (!setup ? VAL : null);
  const reward = rewardTo != null && price != null ? rewardTo - price : null;
  const risk = riskTo != null && price != null ? riskTo - price : null;
  const targetRole = targetRow?.label ?? (setup ? "target" : "VAH"); const invalRole = invalRow?.label ?? (setup ? "stop" : "VAL");
  const rrRatio = reward != null && risk != null && risk !== 0 ? Math.abs(reward / risk) : null;
  const isCustomSelection = targetSel != null || invalSel != null;

  // ── Ladder geometry (design/00): dots sit at TRUE price on the spine, label
  //    rows are spaced evenly (MG + i·step → never overlap), connected by elbow
  //    leader lines. Row height/ladder height scale with the row count so
  //    toggling groups on doesn't cram the default (compact) view. ──
  const ROW_H = 24, MG = 14, spineX = 12;
  const N = uniq.length, H = Math.max(300, MG * 2 + Math.max(1, N - 1) * ROW_H), step = N > 1 ? (H - 2 * MG) / (N - 1) : 0;
  const pxs = uniq.map((r) => r.v);
  const hiP = Math.max(...pxs), loP = Math.min(...pxs), pad = (hiP - loP) * 0.06 || 1;
  const axMax = hiP + pad, axMin = loP - pad, axSpan = axMax - axMin || 1;
  const trueY = (v: number) => MG + ((axMax - v) / axSpan) * (H - 2 * MG);
  const close = price ?? (loP + hiP) / 2;
  const maxDist = Math.max(1, ...uniq.filter((r) => r.label !== "CLOSE").map((r) => Math.abs(r.v - close)));
  const rungs = uniq.map((r, i) => {
    const isClose = r.label === "CLOSE";
    const rank = isClose ? 0 : Math.abs(r.v - close) / maxDist;
    const rel = close ? r.v / close - 1 : 0;
    const next = uniq[i + 1];
    const gap = next ? r.v / next.v - 1 : null;
    const dc = isClose ? "var(--text)" : r.tone === "up" ? "var(--up)" : r.tone === "down" ? "var(--down)" : "var(--flat)";
    const isTarget = r.id === (targetRow?.id); const isInval = r.id === (invalRow?.id);
    return { id: r.id, label: r.label, explain: r.explain, isClose, isTarget, isInval, dotY: trueY(r.v), rowTop: MG + i * step, dotR: isClose ? 4 : 3, dotColor: dc,
      priceStr: formatPrice(r.v), priceColor: isClose ? "var(--text)" : "var(--muted)",
      rel: isClose ? "" : sPct(rel, 1), relColor: isClose ? "var(--faint)" : rel > 0 ? "var(--up)" : rel < 0 ? "var(--down)" : "var(--flat)",
      roleColor: isClose ? "var(--text)" : "var(--muted)",
      fs: isClose ? 13 : 12 - 2 * rank, roleFs: isClose ? 11 : 10.5 - 1.5 * rank, opacity: isClose ? 1 : 1 - 0.4 * rank,
      gapShow: gap != null && Math.abs(gap) > 0.001, gapText: gap != null ? `${(Math.abs(gap) * 100).toFixed(1)}% ↓` : "" };
  });
  const closeY = price != null ? trueY(price) : H / 2;
  const targetY = rewardTo != null ? trueY(rewardTo) : closeY;
  const invalY = riskTo != null ? trueY(riskTo) : closeY;
  const rewardY = Math.min(closeY, targetY), rewardH = Math.abs(closeY - targetY);
  const riskY = Math.min(closeY, invalY), riskH = Math.abs(closeY - invalY);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto" }}>
      {/* mode row */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)", background: "var(--soft)", borderRadius: 6, padding: "2px 8px" }}>{setup ? "Active setup" : "Structural · no active setup"}</span>
        <span style={{ fontSize: 10.5, color: "var(--faint)" }}>R:R {rrRatio != null ? `${rrRatio.toFixed(1)}:1` : "—"} {isCustomSelection ? "· custom levels" : `· ${setup ? "from entry" : "from close"}`}</span>
        {isCustomSelection ? <button type="button" onClick={() => { setTargetSel(null); setInvalSel(null); }} style={{ fontSize: 9.5, fontWeight: 700, color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>reset</button> : null}
      </div>
      {/* level-group toggles */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 12 }}>
        {(Object.keys(GROUP_META) as LevelGroup[]).map((g) => {
          const on = activeGroups.has(g);
          const count = extraByGroup[g].length;
          return (
            <button key={g} type="button" onClick={() => toggleGroup(g)} disabled={!count} title={GROUP_META[g].label} style={{ fontSize: 9.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accentSoft)" : "transparent", color: !count ? "var(--faint)" : on ? "var(--accent)" : "var(--muted)", cursor: count ? "pointer" : "not-allowed" }}>{GROUP_META[g].short}{count ? ` · ${count}` : ""}</button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, flex: "1 1 auto" }}>
        {/* Left: true-price spine (reward/risk zones + dots) + evenly-spaced leader rows */}
        <div style={{ position: "relative", flex: "1 1 auto", minWidth: 0, height: H }}>
          <svg viewBox={`0 0 44 ${H}`} preserveAspectRatio="none" style={{ position: "absolute", left: 0, top: 0, width: 44, height: H, overflow: "visible" }}>
            {rewardH > 0.5 ? <rect x={4} y={rewardY} width={16} height={rewardH} rx={3} fill="var(--upSoft)" /> : null}
            {riskH > 0.5 ? <rect x={4} y={riskY} width={16} height={riskH} rx={3} fill="var(--downSoft)" /> : null}
            <line x1={spineX} y1={MG} x2={spineX} y2={H - MG} stroke="var(--hair)" strokeWidth={2} />
            {rungs.map((r) => (
              <g key={r.id}>
                <polyline points={`${spineX},${r.dotY} ${spineX + 13},${r.dotY} ${spineX + 22},${r.rowTop} ${spineX + 30},${r.rowTop}`} fill="none" stroke={r.dotColor} strokeWidth={1} opacity={0.45} />
                <circle cx={spineX} cy={r.dotY} r={r.dotR} fill={r.dotColor} />
              </g>
            ))}
          </svg>
          {rungs.map((r) => (
            <div key={r.id} title={r.explain} style={{ position: "absolute", left: 46, right: 0, top: r.rowTop, transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 5, opacity: r.opacity, background: r.isTarget ? "var(--upSoft)" : r.isInval ? "var(--downSoft)" : "transparent", borderRadius: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: r.fs, fontWeight: 800, width: 44, textAlign: "right", color: r.priceColor }}>{r.priceStr}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, width: 38, textAlign: "right", color: r.relColor }}>{r.rel}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: r.roleFs, fontWeight: 700, color: r.roleColor, lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
                {r.gapShow ? <span style={{ display: "block", fontFamily: MONO, fontSize: 8, color: "var(--faint)" }}>{r.gapText}</span> : null}
              </span>
              {!r.isClose ? (
                <span style={{ display: "flex", gap: 2, flex: "none" }}>
                  <button type="button" onClick={() => setTargetSel(r.id === defaultTargetId ? null : r.id)} title="Set as Target" style={{ width: 15, height: 15, fontSize: 8.5, fontWeight: 800, lineHeight: "13px", borderRadius: 4, border: `1px solid ${r.isTarget ? "var(--up)" : "var(--border)"}`, background: r.isTarget ? "var(--up)" : "transparent", color: r.isTarget ? "#fff" : "var(--faint)", cursor: "pointer", padding: 0 }}>T</button>
                  <button type="button" onClick={() => setInvalSel(r.id === defaultInvalId ? null : r.id)} title="Set as Invalidation" style={{ width: 15, height: 15, fontSize: 8.5, fontWeight: 800, lineHeight: "13px", borderRadius: 4, border: `1px solid ${r.isInval ? "var(--down)" : "var(--border)"}`, background: r.isInval ? "var(--down)" : "transparent", color: r.isInval ? "#fff" : "var(--faint)", cursor: "pointer", padding: 0 }}>S</button>
                </span>
              ) : null}
            </div>
          ))}
        </div>
        {/* Right: reward / risk readout — compact, fixed width so the ladder gets the room */}
        <div style={{ width: 138, flex: "none", display: "flex", flexDirection: "column", justifyContent: "center", gap: 7, minWidth: 0 }}>
          <div style={{ background: "var(--upSoft)", borderRadius: 9, padding: "8px 10px" }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".04em", color: "var(--up)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>REWARD · to {targetRole}</div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: "var(--up)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{reward == null ? "—" : `+${formatNumber(Math.abs(reward), 0)}`}</div>
            {reward != null && price ? <div style={{ fontSize: 10, fontWeight: 600, color: "var(--up)" }}>({sPct(Math.abs(reward) / price, 1)})</div> : null}
          </div>
          <div style={{ background: "var(--downSoft)", borderRadius: 9, padding: "8px 10px" }}>
            <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".04em", color: "var(--down)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>RISK · to {invalRole}</div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: "var(--down)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{risk == null ? "—" : `−${formatNumber(Math.abs(risk), 0)}`}</div>
            {risk != null && price ? <div style={{ fontSize: 10, fontWeight: 600, color: "var(--down)" }}>({sPct(-Math.abs(risk) / price, 1)})</div> : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ background: "var(--soft)", borderRadius: 8, padding: "6px 9px" }}><div style={{ fontSize: 8, color: "var(--faint)" }}>ATR (14)</div><div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{atr == null ? "—" : `${atr.toFixed(1)}%`}</div></div>
            <div style={{ background: "var(--soft)", borderRadius: 8, padding: "6px 9px" }}><div style={{ fontSize: 8, color: "var(--faint)" }}>Reference</div><div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>Close {price == null ? "—" : formatPrice(price)}</div></div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--hair)", fontSize: 10.5, color: "var(--faint)", lineHeight: 1.45 }}>
        {setup ? "Entry · stop · target" : "Value-area frame · VAH target / VAL invalidation"} · levels nearest the close are most prominent. Hover any level for what it means; use T/S to make it the target/invalidation. Toggled groups are real published or computed levels — nothing fabricated.
      </div>
    </div>
  );
}

function KeyStats({ fund, marketDate }: { fund?: JsonRecord; marketDate?: string | null }) {
  if (!fund) return <div style={{ fontSize: 12, color: "var(--muted)" }}>Fundamental statistics not available for this ticker.</div>;
  const asOf = fund["Fundamentals As Of"] as string | undefined;
  const isStale = !!asOf && asOf !== marketDate;
  const roe = n(fund["Return on Equity (TTM)"]), nm = n(fund["Net Profit Margin (Quarter)"]), rev = n(fund["Revenue (Quarter YoY Growth)"]), pe = n(fund["Current PE Ratio (TTM)"]), az = n(fund["Altman Z-Score (Modified)"]), ff = n(fund["Free Float (%)"]);
  const tiles: Array<{ k: string; v: string | null; good: boolean | null }> = [
    { k: "ROE (TTM)", v: roe == null ? null : `${(roe * 100).toFixed(1)}%`, good: roe == null ? null : roe >= 0.12 },
    { k: "Net margin (Q)", v: nm == null ? null : `${(nm * 100).toFixed(1)}%`, good: nm == null ? null : nm >= 0.1 },
    { k: "Revenue YoY (Q)", v: rev == null ? null : sPct(rev, 1), good: rev == null ? null : rev >= 0 },
    { k: "PE (TTM)", v: pe == null ? null : `${pe.toFixed(1)}×`, good: pe == null ? null : pe > 0 && pe < 20 },
    { k: "Altman Z (mod.)", v: az == null ? null : az.toFixed(2), good: az == null ? null : az >= 2.6 },
    { k: "Free float", v: ff == null ? null : `${(ff * 100).toFixed(1)}%`, good: ff == null ? null : ff >= 0.2 },
  ];
  const peLo = 9, peHi = 25, pePos = pe == null ? null : Math.max(0, Math.min(100, ((pe - peLo) / (peHi - peLo)) * 100));
  const rows: Array<[string, number | null, string, boolean?]> = [
    ["Return on Equity (TTM)", roe, "pct"], ["Return on Assets (TTM)", n(fund["Return on Assets (TTM)"]), "pct"],
    ["Net Profit Margin (Q)", nm, "pct"], ["Revenue YoY (Q)", rev, "spct"],
    ["PE Ratio (TTM)", pe, "x"], ["Altman Z-Score (mod.)", az, "num"],
    ["Free Float", ff, "pct"], ["Market Cap", n(fund["Market Cap"]), "cap"],
  ];
  const fmt = (v: number | null, kind: string) => v == null ? "—" : kind === "pct" ? `${(v * 100).toFixed(2)}%` : kind === "spct" ? sPct(v, 2) : kind === "x" ? `${v.toFixed(2)}×` : kind === "cap" ? fmtT(v) : v.toFixed(3);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {tiles.map((t) => (
          <div key={t.k} style={{ background: t.good == null ? "var(--soft)" : t.good ? "var(--upSoft)" : "var(--warnSoft)", borderRadius: 9, padding: "9px 10px" }}>
            <div style={{ fontSize: 9, color: "var(--muted)" }}>{t.good == null ? "•" : t.good ? "✓" : "⚠"} {t.k}</div>
            <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, marginTop: 2 }}>{t.v ?? <NoData />}</div>
          </div>
        ))}
      </div>
      {pe != null ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5 }}><span style={KICKER}>VALUATION · PE (TTM)</span><span style={{ fontFamily: MONO, fontWeight: 800 }}>{pe.toFixed(1)}×</span></div>
          <div style={{ position: "relative", height: 6, background: "linear-gradient(90deg,var(--up),var(--soft),var(--down))", borderRadius: 4, marginTop: 8 }}>
            <div style={{ position: "absolute", left: `${pePos}%`, top: -3, width: 12, height: 12, borderRadius: "50%", background: "var(--accent)", border: "2px solid var(--panel)", transform: "translateX(-50%)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--faint)", marginTop: 3 }}><span>9× cheap</span><span>market ~15×</span><span>25× dear</span></div>
        </div>
      ) : null}
      <div style={{ marginTop: 14 }}>
        {rows.map(([label, v, kind], i) => i % 2 === 0 ? (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 8, padding: "5px 0", borderTop: i ? HAIR : "none", fontSize: 11.5 }}>
            <span style={{ color: "var(--muted)" }}>{label}</span><span style={{ fontFamily: MONO, fontWeight: 700 }}>{fmt(v, kind)}</span>
            <span style={{ color: "var(--muted)", textAlign: "right" }}>{rows[i + 1]?.[0]}</span><span style={{ fontFamily: MONO, fontWeight: 700, textAlign: "right" }}>{rows[i + 1] ? fmt(rows[i + 1][1], rows[i + 1][2]) : ""}</span>
          </div>
        ) : null)}
      </div>
      {isStale ? (
        <div style={{ marginTop: 12, fontSize: 10, color: "var(--warning)", background: "var(--warnSoft)", borderRadius: 8, padding: "6px 9px", lineHeight: 1.4 }}>
          ⚠ Fundamentals as of {asOf} — the live fetch had no data for {marketDate ? `this ticker on ${marketDate}` : "this ticker today"} (yfinance was unavailable), so the most recent real values are shown instead of blanking to &ldquo;—&rdquo;.
        </div>
      ) : null}
    </div>
  );
}

function CompanyInfo({ fund, ownership }: { fund?: JsonRecord; ownership?: { industry?: string; sector?: string } }) {
  const rows: Array<[string, React.ReactNode]> = [
    ["IPO date", (fund?.["IPO Date"] as string) && fund!["IPO Date"] !== "-" ? String(fund!["IPO Date"]) : <NoData />],
    ["Industry", ownership?.sector || <NoData />],
    ["Sub-industry", (ownership?.industry && ownership.industry !== "-") ? ownership.industry : <NoData />],
    ["Shares out.", (fund?.["Shares Outstanding"] as string) && fund!["Shares Outstanding"] !== "-" ? String(fund!["Shares Outstanding"]) : <NoData />],
  ];
  const summary = (fund?.["Business Summary"] as string) || "";
  return (
    <div>
      {rows.map(([k, v], i) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 0", borderTop: i ? HAIR : "none", fontSize: 12 }}>
          <span style={{ color: "var(--muted)" }}>{k}</span><span style={{ fontFamily: MONO, fontWeight: 600, textAlign: "right" }}>{v}</span>
        </div>
      ))}
      {summary ? <p style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55, marginTop: 12, display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{summary}</p> : null}
    </div>
  );
}

const posColor = (p?: string) => /Above|Bull|Strong|Buy/i.test(p || "") ? "var(--up)" : /Below|Bear|Weak|Sell/i.test(p || "") ? "var(--down)" : "var(--muted)";
const KV = ({ k, v, tone }: { k: string; v: React.ReactNode; tone?: string }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderTop: HAIR, fontSize: 11.5 }}>
    <span style={{ color: "var(--muted)" }}>{k}</span><span style={{ fontFamily: MONO, fontWeight: 700, textAlign: "right", color: tone }}>{v}</span>
  </div>
);
const Chip = ({ children, tone }: { children: React.ReactNode; tone?: string }) => (
  <span style={{ fontSize: 9, fontWeight: 700, color: tone || "var(--muted)", background: "var(--soft)", borderRadius: 5, padding: "2px 7px" }}>{children}</span>
);
const px = (v: number | null | undefined) => (v == null ? "—" : formatPrice(v));

function TechnicalCard({ stock, t, ma, price, VAL, VAH, PoC }: { stock?: JsonRecord; t: JsonRecord; ma: JsonRecord; price: number | null; VAL: number | null; VAH: number | null; PoC: number | null }) {
  const [tab, setTab] = useState("structure");
  const tabs = [["structure", "Structure · SMC"], ["profile", "Market Profile"], ["momentum", "RSI & MACD"], ["vwap", "VWAP"], ["ma", "Moving Averages"], ["liquidity", "Volume & Vol"]] as const;
  return (
    <div style={CARD}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={KICKER}>TECHNICAL</span><div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 3, background: "var(--soft)", borderRadius: 8, padding: 3, flexWrap: "wrap" }}>
          {tabs.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} style={{ fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: tab === k ? "var(--accent)" : "transparent", color: tab === k ? "#fff" : "var(--muted)" }}>{l}</button>)}
        </div>
      </div>
      {tab === "structure" ? <StructureTab stock={stock} t={t} /> : null}
      {tab === "profile" ? <ProfileTab t={t} price={price} VAL={VAL} VAH={VAH} PoC={PoC} /> : null}
      {tab === "momentum" ? <MomentumTab t={t} /> : null}
      {tab === "vwap" ? <VwapTab t={t} price={price} /> : null}
      {tab === "ma" ? <MaTab ma={ma} t={t} price={price} /> : null}
      {tab === "liquidity" ? <LiquidityTab t={t} /> : null}
    </div>
  );
}

function StructureTab({ stock, t }: { stock?: JsonRecord; t: JsonRecord }) {
  const trend = (stock?.["trend"] || {}) as JsonRecord; const struct = (stock?.["structure"] || {}) as JsonRecord;
  const smc = (t["smc"] || {}) as JsonRecord;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
      <div>
        <div style={{ ...KICKER, fontSize: 9, marginBottom: 4 }}>TREND & STRUCTURE</div>
        <KV k="Internal trend" v={String(trend["internal"] ?? "—")} tone={posColor(trend["internal"] as string)} />
        <KV k="Swing trend" v={String(trend["swing"] ?? "—")} tone={posColor(trend["swing"] as string)} />
        <KV k="Internal structure" v={String(struct["internal"] ?? "—")} tone={posColor(struct["internal"] as string)} />
        <KV k="Swing structure" v={String(struct["swing"] ?? "—")} tone={posColor(struct["swing"] as string)} />
        <KV k="Wave pattern" v={String(t["wavePattern"] ?? "—")} />
      </div>
      <div>
        <div style={{ ...KICKER, fontSize: 9, marginBottom: 4 }}>SMC LEVELS</div>
        <KV k="Strong / Weak high" v={`${px(n(smc["strongHigh"]))} · ${px(n(smc["weakHigh"]))}`} />
        <KV k="Strong / Weak low" v={`${px(n(smc["strongLow"]))} · ${px(n(smc["weakLow"]))}`} />
        <KV k="Premium zone" v={String(smc["premiumZone"] ?? "—")} tone="var(--down)" />
        <KV k="Equilibrium" v={String(smc["equilibrium"] ?? "—")} />
        <KV k="Discount zone" v={String(smc["discountZone"] ?? "—")} tone="var(--up)" />
        <KV k="Bull OB" v={<>{String(smc["closestBullishBlock"] ?? "—")} {smc["bullishBlockAgeDays"] != null ? <span style={{ color: "var(--faint)", fontSize: 9 }}>· {String(smc["bullishBlockAgeDays"])}d</span> : null}</>} tone="var(--up)" />
        <KV k="Bear OB" v={<>{String(smc["closestBearishBlock"] ?? "—")} {smc["bearishBlockAgeDays"] != null ? <span style={{ color: "var(--faint)", fontSize: 9 }}>· {String(smc["bearishBlockAgeDays"])}d</span> : null}</>} tone="var(--down)" />
      </div>
    </div>
  );
}

function ProfileTab({ t, price, VAL, VAH, PoC }: { t: JsonRecord; price: number | null; VAL: number | null; VAH: number | null; PoC: number | null }) {
  const mp = (t["marketProfile"] || {}) as JsonRecord;
  const lo = VAL, hi = VAH; const pos = price != null && lo != null && hi != null && hi > lo ? ((price - lo) / (hi - lo)) * 100 : 50;
  return (
    <div>
      <div style={{ position: "relative", height: 18, marginTop: 6 }}>
        <div style={{ position: "absolute", left: "10%", right: "10%", top: 8, height: 6, background: "var(--soft)", borderRadius: 4 }} />
        {price != null ? <div style={{ position: "absolute", left: `${10 + Math.max(0, Math.min(1, pos / 100)) * 80}%`, top: 0, width: 2, height: 18, background: "var(--accent)" }} /> : null}
      </div>
      <div style={{ textAlign: "center", fontFamily: MONO, fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>price {price == null ? "—" : formatPrice(price)}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
        {[["VAL · value-area low", VAL], ["PoC · point of control", PoC], ["VAH · value-area high", VAH]].map(([l, v]) => (
          <div key={l as string} style={{ background: "var(--soft)", borderRadius: 9, padding: "10px 12px" }}>
            <div style={{ fontSize: 8.5, color: "var(--faint)" }}>{l}</div>
            <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, marginTop: 2 }}>{v == null ? "—" : formatPrice(v as number)}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ ...KICKER, fontSize: 9, marginBottom: 2 }}>INITIAL BALANCE / PRIOR WEEK / MULTI-DAY</div>
        <KV k="Initial balance H / L" v={<>{px(n(mp["ibh"]))} · {px(n(mp["ibl"]))} <Chip tone={posColor(mp["vsIbl"] as string)}>{String(mp["vsIbl"] ?? "")}</Chip></>} />
        <KV k="Prior week H / L" v={<>{px(n(mp["pwh"]))} · {px(n(mp["pwl"]))} <Chip tone={posColor(mp["vsPwl"] as string)}>{String(mp["vsPwl"] ?? "")}</Chip></>} />
        <KV k="Multi-day H / L" v={<>{px(n(mp["mdh"]))} · {px(n(mp["mdl"]))} <Chip tone={posColor(mp["vsMdl"] as string)}>{String(mp["vsMdl"] ?? "")}</Chip></>} />
      </div>
      {mp["summary"] ? <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>{String(mp["summary"])}</p> : null}
    </div>
  );
}

function MomentumTab({ t }: { t: JsonRecord }) {
  const rsi = n(t["rsi14"]); const rd = (t["rsiDetail"] || {}) as JsonRecord; const md = (t["macdDetail"] || {}) as JsonRecord; const macd = n(t["macdLine"]);
  const pos = rsi == null ? 50 : Math.max(0, Math.min(100, rsi));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
      <div>
        <div style={{ ...KICKER, fontSize: 9, marginBottom: 4 }}>RSI (14) · {String(t["rsiStatus"] ?? "")}</div>
        <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: rsi == null ? "var(--muted)" : rsi >= 70 ? "var(--down)" : rsi >= 50 ? "var(--up)" : "var(--muted)" }}>{rsi == null ? "—" : rsi.toFixed(1)}</div>
        <div style={{ position: "relative", height: 5, background: "linear-gradient(90deg,var(--down),var(--soft),var(--up))", borderRadius: 3, margin: "6px 0" }}><div style={{ position: "absolute", left: `${pos}%`, top: -2, width: 9, height: 9, borderRadius: "50%", background: "var(--accent)", transform: "translateX(-50%)" }} /></div>
        <KV k="RSI MA (14)" v={n(rd["average14"]) == null ? "—" : n(rd["average14"])!.toFixed(1)} />
        <KV k="Position" v={String(rd["position"] ?? "—")} tone={posColor(rd["position"] as string)} />
        <KV k="Δ 1D" v={n(rd["change1d"]) == null ? "—" : `${n(rd["change1d"])! >= 0 ? "+" : ""}${n(rd["change1d"])!.toFixed(1)}`} />
        {rd["divergenceSignal"] ? <KV k="Divergence" v={<>{String(rd["divergenceSignal"])} {rd["divergenceConfirmDate"] ? <span style={{ color: "var(--faint)", fontSize: 9 }}>· {String(rd["divergenceConfirmDate"])}</span> : null}</>} tone={posColor(rd["divergenceSignal"] as string)} /> : null}
      </div>
      <div>
        <div style={{ ...KICKER, fontSize: 9, marginBottom: 4 }}>MACD · {String(t["macdPosition"] ?? "")}</div>
        <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, color: macd == null ? "var(--muted)" : macd >= 0 ? "var(--up)" : "var(--down)" }}>{macd == null ? "—" : macd.toFixed(1)}</div>
        <div style={{ height: 11 }} />
        <KV k="Signal line" v={n(md["signalLine"]) == null ? "—" : n(md["signalLine"])!.toFixed(1)} />
        <KV k="Histogram" v={n(md["histogram"]) == null ? "—" : n(md["histogram"])!.toFixed(1)} tone={n(md["histogram"]) == null ? undefined : n(md["histogram"])! >= 0 ? "var(--up)" : "var(--down)"} />
        <KV k="Cross" v={String(md["cross"] ?? "—")} />
        <KV k="Wave pattern" v={String(t["wavePattern"] ?? "—")} />
      </div>
    </div>
  );
}

// Horizontal −3σ..+3σ position gauge — same visual language as the RSI dial
// in MomentumTab, applied to how many standard deviations price currently
// sits from each period's anchored VWAP (a real published field, priceSigma).
function SigmaGauge({ sigma }: { sigma: number }) {
  const clamped = Math.max(-3, Math.min(3, sigma));
  const pos = ((clamped + 3) / 6) * 100;
  const color = sigma >= 1 ? "var(--up)" : sigma <= -1 ? "var(--down)" : "var(--muted)";
  return (
    <div style={{ position: "relative", height: 5, background: "linear-gradient(90deg,var(--down),var(--soft),var(--up))", borderRadius: 3, margin: "5px 0" }}>
      <div style={{ position: "absolute", left: `${pos}%`, top: -2, width: 9, height: 9, borderRadius: "50%", background: color, transform: "translateX(-50%)" }} />
    </div>
  );
}

function VwapTab({ t, price }: { t: JsonRecord; price: number | null }) {
  const vp = (t["vwapProfiles"] || {}) as JsonRecord;
  // All 5 real published profiles — previousQuarter/previousYear were
  // computed but never shown here despite carrying real, sometimes striking
  // reads (e.g. price several σ below the previous-year VWAP).
  const periods = [["currentMonth", "Current month"], ["previousMonth", "Previous month"], ["currentQuarter", "Current quarter"], ["previousQuarter", "Previous quarter"], ["previousYear", "Previous year"]] as const;
  const rows = periods.map(([k, label]) => ({ k, label, p: (vp[k] || {}) as JsonRecord, v: n((vp[k] as JsonRecord | undefined)?.["vwap"]) })).filter((r) => r.v != null);
  if (!rows.length) return <div style={{ fontSize: 12, color: "var(--muted)" }}>No VWAP profile data in this snapshot.</div>;
  return (
    <div>
      {rows.map(({ k, label, p, v }, i) => {
        const sigma = n(p["priceSigma"]);
        return (
          <div key={k} style={{ padding: "9px 0", borderTop: i ? HAIR : "none" }}>
            <div style={{ display: "grid", gridTemplateColumns: "110px 90px 1fr", gap: 10, alignItems: "center", fontSize: 12 }}>
              <span style={{ color: "var(--muted)" }}>{label}</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, color: price != null && v != null ? (price >= v ? "var(--up)" : "var(--down)") : undefined }}>{v == null ? "—" : formatPrice(v)}</span>
              <span style={{ fontSize: 10.5, color: "var(--faint)" }}>{String(p["zone"] ?? "")}{sigma != null ? ` · ${sigma >= 0 ? "+" : ""}${sigma.toFixed(2)}σ` : ""}{p["runningDays"] != null ? ` · ${String(p["runningDays"])}d` : ""}</span>
            </div>
            {sigma != null ? <SigmaGauge sigma={sigma} /> : null}
          </div>
        );
      })}
      <p style={{ fontSize: 10, color: "var(--faint)", marginTop: 8 }}>Price vs the volume-weighted average and its standard-deviation bands, per period. Gauge spans −3σ to +3σ.</p>
    </div>
  );
}

function MaTab({ ma, t, price }: { ma: JsonRecord; t: JsonRecord; price: number | null }) {
  const md = (t["movingAverageDetail"] || {}) as JsonRecord;
  const rows = [["EMA 25", n(ma["ema25"]), n(md["ema25DifferencePercent"]), md["ema25Position"]], ["EMA 50", n(ma["ema50"]), n(md["ema50DifferencePercent"]), md["ema50Position"]], ["SMA 200", n(ma["sma200"]), n(md["sma200DifferencePercent"]), md["sma200Position"]]] as const;
  return (
    <div>
      {rows.map(([k, v, diff, posv], i) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "70px 1fr 70px 60px", gap: 8, alignItems: "center", padding: "8px 0", borderTop: i ? HAIR : "none", fontSize: 12 }}>
          <span style={{ color: "var(--muted)" }}>{k}</span>
          <span style={{ fontFamily: MONO, fontWeight: 700 }}>{v == null ? "—" : formatPrice(v)}</span>
          <span style={{ fontFamily: MONO, fontSize: 11, textAlign: "right", color: diff == null ? "var(--faint)" : diff >= 0 ? "var(--up)" : "var(--down)" }}>{diff == null ? "" : `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%`}</span>
          <span style={{ fontSize: 10, textAlign: "right", color: posColor(posv as string) }}>{String(posv ?? (v != null && price != null ? (price >= v ? "Above" : "Below") : ""))}</span>
        </div>
      ))}
      {t["maZone"] ? <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>{String(t["maZone"])}</p> : null}
    </div>
  );
}

function LiquidityTab({ t }: { t: JsonRecord }) {
  const lq = (t["liquidity"] || {}) as JsonRecord; const rg = (t["regime"] || {}) as JsonRecord;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 20px" }}>
      <div>
        <div style={{ ...KICKER, fontSize: 9, marginBottom: 4 }}>VOLUME & VOLATILITY</div>
        <KV k="RVOL (20D)" v={String(lq["rvolZone"] ?? "—")} />
        <KV k="RVOL change" v={String(lq["rvolChangeZone"] ?? "—")} />
        <KV k="ADR %" v={n(t["adrPercent"]) == null ? "—" : `${n(t["adrPercent"])!.toFixed(2)}%`} />
        <KV k="ATR (14) %" v={n(t["atrPercent"]) == null ? "—" : `${n(t["atrPercent"])!.toFixed(2)}%`} />
        <KV k="Range zone" v={String(lq["rangeZone"] ?? "—")} />
      </div>
      <div>
        <div style={{ ...KICKER, fontSize: 9, marginBottom: 4 }}>LIQUIDITY & REGIME</div>
        <KV k="Value (approx)" v={String(lq["valueApprox"] ?? "—")} />
        <KV k="Avg value 20D" v={String(lq["averageValue20"] ?? "—")} />
        <KV k="Avg volume 20D" v={String(lq["averageVolume20"] ?? "—")} />
        <KV k="Liquidity" v={String(rg["liquidityCategory"] ?? "—")} />
        <KV k="Profile" v={String(rg["verdictProfile"] ?? "—")} />
      </div>
    </div>
  );
}

function windowRet(series: number[], bars: number): number | null {
  if (series.length < 2) return null;
  const last = series.at(-1)!;
  if (bars === -1) { const yr = series.length; const first = series[Math.max(0, yr - 1)]; return first ? last / series[0] - 1 : null; }
  const prev = series[series.length - 1 - bars];
  return prev ? last / prev - 1 : null;
}
function sectorSeries(indexes: { groups?: Array<{ section?: string; label?: string; series?: Array<{ date: string; value?: number; close?: number }> }> } | null, sector: string): number[] {
  const g = (indexes?.groups || []).find((x) => x.section === "SECTORAL INDEX" && (x.label || "").toLowerCase().includes(sector.toLowerCase().split(" ")[0]));
  return (g?.series || []).map((p) => Number(p.value ?? p.close)).filter((v) => isFinite(v));
}
function Returns({ fund, ihsg, sectorSeries: sec }: { fund?: JsonRecord; ihsg: number[]; sectorSeries: number[] }) {
  const wins: Array<[string, string, number]> = [["1M", "1 Month Price Returns", 21], ["3M", "3 Month Price Returns", 63], ["6M", "6 Month Price Returns", 126], ["1Y", "1 Year Price Returns", 252], ["YTD", "Year to Date Price Returns", -1]];
  const mx = Math.max(0.01, ...wins.map(([, key]) => Math.abs(n(fund?.[key]) ?? 0)));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "34px 1fr 58px 58px", gap: 8, fontSize: 8.5, fontWeight: 700, letterSpacing: ".05em", color: "var(--faint)", paddingBottom: 6, borderBottom: HAIR }}>
        <span></span><span>ABSOLUTE</span><span style={{ textAlign: "right" }}>vs SECTOR</span><span style={{ textAlign: "right" }}>vs IHSG</span>
      </div>
      {wins.map(([label, key, bars]) => {
        const abs = n(fund?.[key]); const bi = windowRet(ihsg, bars); const bs = windowRet(sec, bars);
        const vSec = abs != null && bs != null ? abs - bs : null; const vIhsg = abs != null && bi != null ? abs - bi : null;
        return (
          <div key={label} style={{ display: "grid", gridTemplateColumns: "34px 1fr 58px 58px", gap: 8, alignItems: "center", padding: "7px 0", borderTop: HAIR, fontSize: 11 }}>
            <span style={{ fontFamily: MONO, fontWeight: 700, color: "var(--faint)" }}>{label}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ flex: 1, height: 6, background: "var(--soft)", borderRadius: 4, overflow: "hidden", position: "relative" }}>{abs != null ? <span style={{ position: "absolute", left: abs < 0 ? "auto" : "50%", right: abs < 0 ? "50%" : "auto", width: `${(Math.abs(abs) / mx) * 50}%`, height: "100%", background: pol(abs), borderRadius: 4 }} /> : null}</span>
              <span style={{ fontFamily: MONO, fontWeight: 700, width: 48, textAlign: "right", color: pol(abs) }}>{abs == null ? "—" : sPct(abs, 1)}</span>
            </span>
            <span style={{ fontFamily: MONO, textAlign: "right", color: pol(vSec) }}>{vSec == null ? "—" : sPct(vSec, 1)}</span>
            <span style={{ fontFamily: MONO, textAlign: "right", color: pol(vIhsg) }}>{vIhsg == null ? "—" : sPct(vIhsg, 1)}</span>
          </div>
        );
      })}
      <p style={{ fontSize: 10, color: "var(--faint)", marginTop: 8 }}>Relative = ticker − benchmark. Positive = leading, negative = lagging even if absolute is green.</p>
    </div>
  );
}

function isForeign(name: string): boolean {
  return /Limited|LTD\b|PTE|LLC|N\.V\.|S\.A\.|GmbH|PLC\b|FUND|GLOBAL|EMERGING|NOMURA|JPMORGAN|MORGAN|CITI|HSBC|UBS|BNP|DEUTSCHE|VANGUARD|BLACKROCK|FIDELITY|GIC\b|TEMASEK|NORGES|AUTHORITY/i.test(name) && !/\bPT\.?\s|TBK|PERSERO|INDONESIA|NEGARA|DAERAH/i.test(name);
}
function Ownership({ ownership, footprint }: { ownership?: { investors?: Array<{ name: string; type: string; percentage: number }>; freeFloat?: number | null }; footprint?: { netDeltaPP?: number; accumulation?: boolean } | null }) {
  if (!ownership) return <div style={{ fontSize: 12, color: "var(--muted)" }}>No KSEI issuer record in the latest snapshot.</div>;
  const inv = ownership.investors || [];
  let foreign = 0, localInst = 0, localRetail = 0;
  inv.forEach((h) => { const p = Number(h.percentage) || 0; if (isForeign(h.name)) foreign += p; else if (/Individual/i.test(h.type)) localRetail += p; else localInst += p; });
  const tot = foreign + localInst + localRetail || 1;
  const segs = [["Foreign", foreign, "var(--cat-1)"], ["Local institutional", localInst, "var(--cat-6, var(--up))"], ["Local retail", localRetail, "var(--cat-5, var(--warning))"]] as const;
  const nd = footprint?.netDeltaPP;
  return (
    <div>
      <div style={{ display: "flex", height: 20, borderRadius: 7, overflow: "hidden", gap: 2 }}>
        {segs.map(([l, v, c]) => v > 0 ? <div key={l} style={{ width: `${(v / tot) * 100}%`, background: c }} title={`${l} ${((v / tot) * 100).toFixed(1)}%`} /> : null)}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 11 }}>
        {segs.map(([l, v, c]) => <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: c }} /><span style={{ color: "var(--muted)" }}>{l}</span> <b style={{ fontFamily: MONO }}>{((v / tot) * 100).toFixed(1)}%</b></span>)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, paddingTop: 12, borderTop: HAIR }}>
        <div><div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: nd == null || nd === 0 ? "var(--flat)" : nd > 0 ? "var(--up)" : "var(--down)" }}>{nd == null ? "—" : `${nd > 0 ? "▲ +" : nd < 0 ? "▼ −" : "• "}${Math.abs(nd).toFixed(1)}pp`}</div><div style={{ fontSize: 10, color: "var(--muted)" }}>KSEI net delta over the last month</div></div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".06em", color: footprint?.accumulation ? "var(--up)" : "var(--muted)", background: footprint?.accumulation ? "var(--upSoft)" : "var(--soft)", borderRadius: 6, padding: "5px 9px" }}>{footprint?.accumulation ? "ACCUMULATION" : "NO ACCUMULATION"}</span>
      </div>
      <p style={{ fontSize: 10, color: "var(--faint)", marginTop: 8 }}>Foreign/local split is a labelled name-heuristic proxy on the holder list — KSEI carries no nationality field.</p>
    </div>
  );
}

function Dividend({ fund }: { fund?: JsonRecord }) {
  const P = "Latest Dividend · Historical latest · yfinance · ";
  const yld = n(fund?.[P + "Dividend Yield (%)"]); const yr = fund?.[P + "Year"]; const ex = fund?.[P + "Ex Date"]; const pay = fund?.[P + "Pay Date"]; const idr = n(fund?.[P + "Dividend (IDR)"]);
  if (yld == null && idr == null) return <div style={{ fontSize: 12, color: "var(--muted)" }}>No dividend data for this ticker.</div>;
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 30, fontWeight: 800, color: "var(--up)" }}>{yld == null ? "—" : `${(yld * 100).toFixed(2)}%`}</div>
      <div style={{ fontSize: 10.5, color: "var(--muted)" }}>trailing yield{yr && yr !== "-" ? ` · FY${String(yr)}` : ""}</div>
      <div style={{ marginTop: 12 }}>
        <Row label="Dividend / share">{idr == null ? <NoData /> : `Rp ${formatNumber(idr, 0)}`}</Row>
        <Row label="Ex-date">{ex && ex !== "-" ? String(ex) : <NoData />}</Row>
        <Row label="Pay-date">{pay && pay !== "-" ? String(pay) : <NoData />}</Row>
      </div>
    </div>
  );
}
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: HAIR, fontSize: 12 }}><span style={{ color: "var(--muted)" }}>{label}</span><span style={{ fontFamily: MONO, fontWeight: 600 }}>{children}</span></div>
);

const NEWS_TOPIC: Record<string, string> = { earnings: "Earnings", flow: "Flow", company: "Company", sector: "Sector", macro: "Macro" };
function NewsList({ stories }: { stories: NewsStory[] }) {
  if (!stories.length) return <div style={{ fontSize: 12, color: "var(--muted)" }}>No recent headlines for this ticker.</div>;
  return (
    <div>{stories.slice(0, 5).map((s, i) => {
      const dot = s.tone === "up" ? "var(--up)" : s.tone === "down" ? "var(--down)" : "var(--flat)";
      const age = s.ageDays == null ? s.when : s.ageDays === 0 ? "today" : s.ageDays === 1 ? "1 day ago" : s.ageDays < 7 ? `${s.ageDays} days ago` : s.ageDays < 30 ? `~${Math.round(s.ageDays / 7)}w ago` : `${Math.round(s.ageDays / 30)}mo ago`;
      return (
        <div key={i} style={{ display: "flex", gap: 9, padding: "8px 0", borderTop: i ? HAIR : "none" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, marginTop: 6, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, lineHeight: 1.35 }}>{s.title}</div>
            <div style={{ display: "flex", gap: 7, alignItems: "center", marginTop: 3 }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 5, padding: "2px 6px" }}>{NEWS_TOPIC[s.topic] || s.topic}</span>
              <span style={{ fontSize: 9.5, color: "var(--faint)" }}>{s.source}{age ? ` · ${age}` : ""}</span>
            </div>
          </div>
        </div>
      );
    })}</div>
  );
}

function Peers({ ticker, sector, ksei, bundle, onOpen }: { ticker: string; sector: string; ksei: Array<{ ticker: string; sector?: string }>; bundle: { fundamentals?: Map<string, JsonRecord> } | null; onOpen: (t: string) => void }) {
  const peers = useMemo(() => {
    if (!bundle?.fundamentals || sector === "—") return [];
    const rows: Array<{ ticker: string; chg: number | null; pe: number | null; roe: number | null; ytd: number | null; mcap: number }> = [];
    ksei.forEach((k) => {
      if (k.sector !== sector) return;
      const f = bundle.fundamentals!.get(k.ticker); if (!f) return;
      const mcap = n(f["Market Cap"]); if (mcap == null) return;
      rows.push({ ticker: k.ticker, chg: n(f["Price Change %"]), pe: n(f["Current PE Ratio (TTM)"]), roe: n(f["Return on Equity (TTM)"]), ytd: n(f["Year to Date Price Returns"]), mcap });
    });
    return rows.sort((a, b) => b.mcap - a.mcap).slice(0, 6);
  }, [ticker, sector, ksei, bundle]);
  if (!peers.length) return <div style={{ fontSize: 11.5, color: "var(--faint)" }}>Sector not classified for peer comparison.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "52px 56px 44px 48px 56px", gap: 6, fontSize: 8.5, fontWeight: 700, color: "var(--faint)", paddingBottom: 5, borderBottom: HAIR }}>
        <span>TICKER</span><span style={{ textAlign: "right" }}>%CHG</span><span style={{ textAlign: "right" }}>PE</span><span style={{ textAlign: "right" }}>ROE</span><span style={{ textAlign: "right" }}>YTD</span>
      </div>
      {peers.map((p) => (
        <button key={p.ticker} type="button" onClick={() => onOpen(p.ticker)} style={{ display: "grid", gridTemplateColumns: "52px 56px 44px 48px 56px", gap: 6, alignItems: "center", padding: "6px 0", borderTop: HAIR, background: p.ticker === ticker ? "var(--accentSoft)" : "transparent", border: "none", cursor: "pointer", width: "100%", textAlign: "left", fontSize: 11 }}>
          <span style={{ fontFamily: MONO, fontWeight: 800, color: "var(--accent)" }}>{p.ticker}</span>
          <span style={{ fontFamily: MONO, textAlign: "right", color: pol(p.chg) }}>{p.chg == null ? "—" : sPct(p.chg, 2)}</span>
          <span style={{ fontFamily: MONO, textAlign: "right" }}>{p.pe == null ? "—" : `${p.pe.toFixed(1)}×`}</span>
          <span style={{ fontFamily: MONO, textAlign: "right" }}>{p.roe == null ? "—" : `${(p.roe * 100).toFixed(1)}%`}</span>
          <span style={{ fontFamily: MONO, textAlign: "right", color: pol(p.ytd) }}>{p.ytd == null ? "—" : sPct(p.ytd, 1)}</span>
        </button>
      ))}
    </div>
  );
}

function CorpCalendar({ fund }: { fund?: JsonRecord }) {
  const P = "Latest Dividend · Historical latest · yfinance · ";
  const ex = fund?.[P + "Ex Date"], pay = fund?.[P + "Pay Date"];
  const rows: Array<[string, string, string]> = [];
  if (ex && ex !== "-") rows.push([String(ex), "Ex-dividend", "Dividend"]);
  if (pay && pay !== "-") rows.push([String(pay), "Dividend payment", "Dividend"]);
  if (!rows.length) return <div style={{ fontSize: 12, color: "var(--muted)" }}>No scheduled corporate actions in the feed.</div>;
  return (
    <div>{rows.map(([d, l, tag], i) => (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? HAIR : "none", fontSize: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--accent)", width: 88 }}>{d}</span>
        <span style={{ flex: 1, color: "var(--muted)" }}>{l}</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 5, padding: "2px 7px" }}>{tag}</span>
      </div>
    ))}</div>
  );
}

function Filings({ kseiAsOf, marketDate }: { indexRecord?: unknown; kseiAsOf?: string; marketDate?: string | null }) {
  const rows: Array<[string, string, string]> = [];
  if (kseiAsOf) rows.push([kseiAsOf, ">5% holder / ownership update", "KSEI"]);
  if (marketDate) rows.push([marketDate, "Latest workbook snapshot published", "IDX"]);
  if (!rows.length) return <div style={{ fontSize: 12, color: "var(--muted)" }}>No filings tracked for this ticker.</div>;
  return (
    <div>{rows.map(([d, l, tag], i) => (
      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? HAIR : "none", fontSize: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", width: 88 }}>{d}</span>
        <span style={{ flex: 1, color: "var(--muted)" }}>{l}</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 5, padding: "2px 7px" }}>{tag}</span>
      </div>
    ))}</div>
  );
}

const OUTCOME_COLOR: Record<string, string> = { target: "var(--up)", invalidated: "var(--down)", open: "var(--warning)", undecided: "var(--muted)" };
function RecentSetups({ hist, onOpen }: { hist: HistEntry[]; onOpen: (t: string) => void }) {
  const rows = hist.slice().reverse().slice(0, 8);
  if (!rows.length) return <div style={{ fontSize: 12, color: "var(--muted)" }}>No recent published setups.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ minWidth: 480 }}>
        <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 60px 70px 70px 90px", gap: 8, fontSize: 8.5, fontWeight: 700, color: "var(--faint)", paddingBottom: 6, borderBottom: HAIR }}>
          <span>DATE</span><span>TICKER</span><span style={{ textAlign: "right" }}>SCORE</span><span style={{ textAlign: "right" }}>CLOSE</span><span style={{ textAlign: "right" }}>TARGET</span><span style={{ textAlign: "right" }}>OUTCOME</span>
        </div>
        {rows.map((e, i) => (
          <button key={`${e.date}-${e.ticker}`} type="button" onClick={() => onOpen(e.ticker)} style={{ display: "grid", gridTemplateColumns: "70px 1fr 60px 70px 70px 90px", gap: 8, alignItems: "center", padding: "7px 0", borderTop: i ? HAIR : "none", background: "transparent", border: "none", cursor: "pointer", width: "100%", textAlign: "left", fontSize: 11.5 }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--faint)" }}>{e.date}</span>
            <span style={{ fontFamily: MONO, fontWeight: 800, color: "var(--accent)" }}>{e.ticker}</span>
            <span style={{ fontFamily: MONO, textAlign: "right", fontWeight: 700 }}>{e.score}</span>
            <span style={{ fontFamily: MONO, textAlign: "right" }}>{formatPrice(e.close)}</span>
            <span style={{ fontFamily: MONO, textAlign: "right" }}>{formatPrice(e.target)}</span>
            <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, textAlign: "right", color: OUTCOME_COLOR[e.outcome] || "var(--muted)" }}>{e.outcome}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
