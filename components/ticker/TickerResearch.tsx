"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useApp } from "@/components/providers/AppProvider";
import { EmptyState } from "@/components/shared/EmptyState";
import { fetchJson } from "@/lib/data/client";
import { loadOhlcv } from "@/lib/data/ticker";
import type { JsonRecord, OhlcvPayload } from "@/lib/domain/types";
import { TradingViewChart } from "@/components/dashboard/TradingViewChart";
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
  const news = ticker ? bundle?.news.get(ticker) : undefined;
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
  const firstLive = useMemo(() => (setups || [])[0]?.ticker, [setups]);

  // IHSG series for benchmark returns
  const ihsg = useMemo(() => {
    const inst = (marketContext?.instruments || []).find((i) => ["IHSG", "^JKSE"].includes((i.label || "").toUpperCase()) || ["IHSG", "^JKSE"].includes((i.symbol || "").toUpperCase()));
    return (inst?.rows || []).filter((r) => !marketDate || String(r.date) <= marketDate).map((r) => Number(r.close ?? r.value)).filter((v) => isFinite(v));
  }, [marketContext, marketDate]);

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
  const VAL = price != null ? Math.max(...supports.filter((s) => s < price), lo52 ?? -Infinity) : null;
  const VAH = price != null ? Math.min(...resist.filter((r) => r > price), hi52 ?? Infinity) : null;
  const PoC = vwap ?? (VAL != null && VAH != null ? (VAL + VAH) / 2 : null);

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

      {/* ── SETUP VERDICT | TRADE PLAN ─────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 14, marginBottom: 14, alignItems: "start" }}>
        <Section title="SETUP VERDICT">{setup ? <SetupActive setup={setup} /> : <SetupNone rangePos={rangePos} offLow={offLow} live={firstLive} onOpen={openTicker} />}</Section>
        <Section title="TRADE PLAN · PRICE LADDER" badge={<span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 6, padding: "2px 8px" }}>R:R {rr(setup, price, VAL, VAH)}</span>}>
          <TradePlan setup={setup} price={price} hi52={hi52} lo52={lo52} VAL={VAL} VAH={VAH} PoC={PoC} atr={n(t["atrPercent"])} />
        </Section>
      </div>

      {/* ── PRICE CHART ────────────────────────────────────────── */}
      <div style={{ ...CARD, marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={KICKER}>PRICE · {ticker} · VWAP + MA</span>
          {[["VAL", VAL], ["PoC", PoC], ["VAH", VAH]].map(([l, v]) => v != null ? <span key={l as string} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 5, padding: "2px 7px" }}>{l} {formatPrice(v as number)}</span> : null)}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 3, background: "var(--soft)", borderRadius: 8, padding: 3 }}>
            {(["1M", "3M", "6M", "1Y"] as const).map((r) => <button key={r} type="button" onClick={() => setRange(r)} style={{ fontSize: 10.5, fontWeight: 700, padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: range === r ? "var(--accent)" : "transparent", color: range === r ? "#fff" : "var(--muted)" }}>{r}</button>)}
          </div>
        </div>
        <TradingViewChart symbol={`IDX:${ticker}`} range={range === "1Y" ? "12M" : range} interval="1D" minHeight={420} showIndicatorPicker />
      </div>

      {/* ── KEY STATISTICS | COMPANY INFO ──────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 14, marginBottom: 14, alignItems: "start" }}>
        <Section title="KEY STATISTICS"><KeyStats fund={fund} /></Section>
        <Section title="COMPANY INFORMATION"><CompanyInfo fund={fund} ownership={ownership} /></Section>
      </div>

      {/* ── TECHNICAL ──────────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}><TechnicalCard t={t} ma={ma} price={price} VAL={VAL} VAH={VAH} PoC={PoC} /></div>

      {/* ── RETURNS | OWNERSHIP ────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 14, marginBottom: 14, alignItems: "start" }}>
        <Section title="RETURNS · vs SECTOR & IHSG"><Returns fund={fund} ihsg={ihsg} sectorSeries={sectorSeries(indexes, sector)} /></Section>
        <Section title="OWNERSHIP · KSEI" badge={<span style={{ fontSize: 9.5, color: "var(--faint)" }}>as of {ksei?.asOf || marketDate}</span>}><Ownership ownership={ownership} footprint={setup?.kseiFootprint} /></Section>
      </div>

      {/* ── DIVIDEND | NEWS | PEERS ────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14, marginBottom: 14, alignItems: "start" }}>
        <Section title="DIVIDEND"><Dividend fund={fund} /></Section>
        <Section title="NEWS & CATALYSTS"><NewsList news={news} /></Section>
        <Section title={`SECTOR PEERS · ${sector.toUpperCase()}`}><Peers ticker={ticker} sector={sector} ksei={ksei?.records || []} bundle={bundle} onOpen={openTicker} /></Section>
      </div>

      {/* ── CORP CALENDAR | FILINGS ────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(330px,1fr))", gap: 14, marginBottom: 14, alignItems: "start" }}>
        <Section title="CORPORATE-ACTION CALENDAR"><CorpCalendar fund={fund} /></Section>
        <Section title="FILINGS & DISCLOSURES"><Filings indexRecord={indexRecord} kseiAsOf={ksei?.asOf} marketDate={marketDate} /></Section>
      </div>

      {/* ── RECENT SETUPS ──────────────────────────────────────── */}
      <div style={{ marginBottom: 14 }}><Section title="RECENT SETUPS · SIGNAL ENGINE"><RecentSetups hist={hist} onOpen={openTicker} /></Section></div>

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

function rr(setup: Setup | null, price: number | null, VAL: number | null, VAH: number | null): string {
  if (setup) { const risk = setup.entryZone - setup.invalidation; const rew = setup.target - setup.entryZone; return risk > 0 ? `${(rew / risk).toFixed(1)}:1` : "—"; }
  if (price != null && VAL != null && VAH != null && price - VAL > 0) return `${((VAH - price) / (price - VAL)).toFixed(1)}:1`;
  return "—";
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

function SetupNone({ rangePos, offLow, live, onOpen }: { rangePos: number | null; offLow: number | null; live?: string; onOpen: (t: string) => void }) {
  return (
    <div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>No active setup</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Not flagged by the signal engine — monitoring.</div>
      <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, marginTop: 12 }}>
        {rangePos != null ? `At ${Math.round(rangePos)}% of its 52-week range${offLow != null ? ` and ${offLow.toFixed(0)}% off the low` : ""} — a value location. ` : ""}The signal engine has not flagged a triggered entry.
      </p>
      {live ? <button type="button" onClick={() => onOpen(live)} style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 9, padding: "8px 12px", cursor: "pointer" }}>▶ See a live setup · {live}</button> : null}
    </div>
  );
}

function TradePlan({ setup, price, hi52, lo52, VAL, VAH, PoC, atr }: { setup: Setup | null; price: number | null; hi52: number | null; lo52: number | null; VAL: number | null; VAH: number | null; PoC: number | null; atr: number | null }) {
  const rows: Array<{ v: number; label: string; tone: "up" | "down" | "flat" }> = [];
  const push = (v: number | null, label: string, tone: "up" | "down" | "flat") => { if (v != null && isFinite(v)) rows.push({ v, label, tone }); };
  if (setup) {
    push(setup.target, "Target", "up"); push(VAH, "Value-area high", "up"); push(PoC, "PoC", "flat");
    push(price, "CLOSE", "flat"); push(setup.entryZone, "Entry", "flat"); push(VAL, "Value-area low", "down"); push(setup.invalidation, "Stop · invalidation", "down");
  } else {
    push(hi52, "52w swing high", "up"); push(VAH, "Value-area high", "up"); push(PoC, "PoC · resistance", "flat");
    push(price, "CLOSE", "flat"); push(VAL, "Value-area low", "down"); push(lo52, "52w swing low", "down");
  }
  const uniq = rows.filter((r, i, a) => a.findIndex((x) => Math.abs(x.v - r.v) < 0.5) === i).sort((a, b) => b.v - a.v);
  const rewardTo = setup ? setup.target : VAH; const riskTo = setup ? setup.invalidation : VAL;
  const reward = rewardTo != null && price != null ? rewardTo - price : null;
  const risk = riskTo != null && price != null ? riskTo - price : null;
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {uniq.map((r) => {
          const rel = price != null && price > 0 ? (r.v - price) / price : null;
          const isClose = r.label === "CLOSE";
          return (
            <div key={r.label} style={{ display: "grid", gridTemplateColumns: "58px 1fr 66px", alignItems: "center", gap: 8, padding: "3px 0", borderTop: isClose ? "2px solid var(--text)" : "none" }}>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: isClose ? 800 : 600 }}>{formatPrice(r.v)}</span>
              <span style={{ fontSize: 10.5, color: isClose ? "var(--text)" : "var(--muted)", fontWeight: isClose ? 800 : 400 }}>{r.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, textAlign: "right", color: r.tone === "up" ? "var(--up)" : r.tone === "down" ? "var(--down)" : "var(--faint)" }}>{rel == null ? "" : sPct(rel, 1)}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        <div style={{ background: "var(--upSoft)", borderRadius: 9, padding: "8px 11px" }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: "var(--up)" }}>REWARD · to {setup ? "target" : "VAH"}</div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: "var(--up)" }}>{reward == null ? "—" : `${reward >= 0 ? "+" : ""}${formatNumber(reward, 0)}`} {reward != null && price ? <span style={{ fontSize: 10 }}>({sPct(reward / price, 1)})</span> : null}</div>
        </div>
        <div style={{ background: "var(--downSoft)", borderRadius: 9, padding: "8px 11px" }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: "var(--down)" }}>RISK · to {setup ? "stop" : "VAL"}</div>
          <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 800, color: "var(--down)" }}>{risk == null ? "—" : `${formatNumber(risk, 0)}`} {risk != null && price ? <span style={{ fontSize: 10 }}>({sPct(risk / price, 1)})</span> : null}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 10, fontFamily: MONO, fontSize: 11 }}>
        <span style={{ color: "var(--muted)" }}>ATR {atr == null ? "—" : `${atr.toFixed(1)}%`}</span>
        <span style={{ color: "var(--muted)" }}>Reference · Close {price == null ? "—" : formatPrice(price)}</span>
      </div>
      <p style={{ fontSize: 10, color: "var(--faint)", marginTop: 8, lineHeight: 1.5 }}>Levels nearest the close are most prominent. Real structural levels only — nothing fabricated.</p>
    </div>
  );
}

function KeyStats({ fund }: { fund?: JsonRecord }) {
  if (!fund) return <div style={{ fontSize: 12, color: "var(--muted)" }}>Fundamental statistics not available for this ticker.</div>;
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

function TechnicalCard({ t, ma, price, VAL, VAH, PoC }: { t: JsonRecord; ma: JsonRecord; price: number | null; VAL: number | null; VAH: number | null; PoC: number | null }) {
  const [tab, setTab] = useState<"profile" | "rsi" | "ma">("profile");
  const tabs = [["profile", "Market Profile"], ["rsi", "RSI & Momentum"], ["ma", "Moving Averages"]] as const;
  return (
    <div style={CARD}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <span style={KICKER}>TECHNICAL</span><div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 3, background: "var(--soft)", borderRadius: 8, padding: 3 }}>
          {tabs.map(([k, l]) => <button key={k} type="button" onClick={() => setTab(k)} style={{ fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", background: tab === k ? "var(--accent)" : "transparent", color: tab === k ? "#fff" : "var(--muted)" }}>{l}</button>)}
        </div>
      </div>
      {tab === "profile" ? <ProfileTab price={price} VAL={VAL} VAH={VAH} PoC={PoC} zone={t["marketProfileZone"] as string} /> : null}
      {tab === "rsi" ? <RsiTab t={t} /> : null}
      {tab === "ma" ? <MaTab ma={ma} zone={t["maZone"] as string} price={price} /> : null}
    </div>
  );
}
function ProfileTab({ price, VAL, VAH, PoC, zone }: { price: number | null; VAL: number | null; VAH: number | null; PoC: number | null; zone?: string }) {
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
      <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10 }}>{price != null && PoC != null ? (price >= PoC ? "Price above the point of control — acceptance higher." : "Price below PoC, holding above the value-area low — balancing.") : "Value-area read from real structural levels."} {zone ? <span style={{ color: "var(--faint)" }}>· {zone}</span> : null}</p>
      <p style={{ fontSize: 10, color: "var(--faint)", marginTop: 4 }}>Technical read illustrative from real levels — wire to the OHLCV service.</p>
    </div>
  );
}
function RsiTab({ t }: { t: JsonRecord }) {
  const rsi = n(t["rsi14"]); const macd = n(t["macdLine"]); const pos = rsi == null ? 50 : Math.max(0, Math.min(100, rsi));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div><div style={{ fontSize: 9, color: "var(--faint)" }}>RSI (14) · {String(t["rsiStatus"] ?? "")}</div><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: rsi == null ? "var(--muted)" : rsi >= 70 ? "var(--down)" : rsi >= 50 ? "var(--up)" : "var(--muted)" }}>{rsi == null ? "—" : rsi.toFixed(1)}</div>
          <div style={{ position: "relative", height: 5, background: "linear-gradient(90deg,var(--down),var(--soft),var(--up))", borderRadius: 3, marginTop: 6 }}><div style={{ position: "absolute", left: `${pos}%`, top: -2, width: 9, height: 9, borderRadius: "50%", background: "var(--accent)", transform: "translateX(-50%)" }} /></div></div>
        <div><div style={{ fontSize: 9, color: "var(--faint)" }}>MACD · {String(t["macdPosition"] ?? "")}</div><div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 800, color: macd == null ? "var(--muted)" : macd >= 0 ? "var(--up)" : "var(--down)" }}>{macd == null ? "—" : macd.toFixed(1)}</div></div>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10 }}>Momentum read from the workbook technical block. {t["wavePattern"] ? `Wave: ${t["wavePattern"]}.` : ""}</p>
    </div>
  );
}
function MaTab({ ma, zone, price }: { ma: JsonRecord; zone?: string; price: number | null }) {
  const rows = [["EMA 25", n(ma["ema25"])], ["EMA 50", n(ma["ema50"])], ["SMA 200", n(ma["sma200"])]] as const;
  return (
    <div>
      {rows.map(([k, v], i) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderTop: i ? HAIR : "none", fontSize: 12 }}>
          <span style={{ color: "var(--muted)" }}>{k}</span>
          <span style={{ fontFamily: MONO, fontWeight: 700 }}>{v == null ? "—" : formatPrice(v)} {v != null && price != null ? <span style={{ fontSize: 10, color: price >= v ? "var(--up)" : "var(--down)" }}>{price >= v ? "above" : "below"}</span> : null}</span>
        </div>
      ))}
      {zone ? <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>{zone}</p> : null}
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

function NewsList({ news }: { news?: { stories?: Array<{ title: string; category?: string; when?: string }> } }) {
  const stories = news?.stories || [];
  if (!stories.length) return <div style={{ fontSize: 12, color: "var(--muted)" }}>No recent headlines for this ticker.</div>;
  return (
    <div>{stories.slice(0, 4).map((s, i) => (
      <div key={i} style={{ padding: "8px 0", borderTop: i ? HAIR : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
          {s.category ? <span style={{ fontSize: 8.5, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 5, padding: "2px 6px" }}>{s.category}</span> : null}
          {s.when ? <span style={{ fontSize: 9.5, color: "var(--faint)" }}>{s.when}</span> : null}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>{s.title}</div>
      </div>
    ))}</div>
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
