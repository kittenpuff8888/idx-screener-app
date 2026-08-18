"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { formatAsOf } from "@/lib/format/number";
import { newsStories, newsDisclosures, type NewsStory, type NewsTone, type NewsTopic } from "@/lib/data/news";
import { loadOhlcv } from "@/lib/data/ticker";
import { PageHeader } from "@/components/shared/PageHeader";

type OhlcvRow = { date?: unknown; close?: unknown; value?: unknown };

// Source → wire code + tier, a labelled classification of the headline's origin
// (primary filing / newswire / web) — derived from the source name, not invented.
function sourceTier(src: string): { wire: string; tier: string } {
  const s = src.toLowerCase();
  if (/\bidx\b|bursa efek|\bbei\b|ksei|\bojk\b|keterbukaan/.test(s)) return { wire: "IDX", tier: "primary" };
  if (/bloomberg|reuters|cnbc|antara|dow jones/.test(s)) return { wire: "WIRE", tier: "wire" };
  if (/kontan|bisnis|investor daily|kompas|detik|emiten|iqplus|pasardana|tradingview/.test(s)) return { wire: "DESK", tier: "desk" };
  return { wire: "WEB", tier: "media" };
}

// Real price move since the headline date: latest close vs the close ~ageDays
// calendar-days earlier in the ticker's own OHLCV series. Null if uncomputable.
function moveSince(rows: OhlcvRow[] | undefined, ageDays: number | null): number | null {
  if (!rows || !rows.length || ageDays == null) return null;
  const closeOf = (r: OhlcvRow) => Number(r.close ?? r.value);
  const last = rows[rows.length - 1];
  const lastClose = closeOf(last);
  if (!Number.isFinite(lastClose) || lastClose === 0) return null;
  const lastDate = String(last.date ?? "");
  const target = new Date(lastDate);
  if (Number.isNaN(target.getTime())) return null;
  target.setDate(target.getDate() - ageDays);
  const ts = target.toISOString().slice(0, 10);
  let past: number | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i].date ?? "") <= ts) { past = closeOf(rows[i]); break; }
  }
  if (past == null || !Number.isFinite(past) || past === 0) return null;
  return (lastClose / past - 1) * 100;
}

const MONO = "var(--mono, var(--font-mono))";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))" };
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };

function toneColor(t: NewsTone): string {
  return t === "up" ? "var(--up)" : t === "down" ? "var(--down)" : "var(--flat)";
}
function toneBg(t: NewsTone): string {
  return t === "up" ? "var(--upSoft)" : t === "down" ? "var(--downSoft)" : "var(--flatSoft, var(--soft))";
}
function toneGlyph(t: NewsTone): string {
  return t === "up" ? "▲" : t === "down" ? "▼" : "•";
}
function toneLabel(t: NewsTone): string {
  return t === "up" ? "Bullish" : t === "down" ? "Bearish" : "Neutral";
}
function ageLabel(d: number | null, when: string): string {
  if (d == null) return when || "—";
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  if (d < 7) return `${d} days ago`;
  if (d < 14) return "~1 week ago";
  if (d < 30) return `${Math.round(d / 7)} weeks ago`;
  return `${Math.round(d / 30)} mo ago`;
}

// Design filters by TOPIC (what a story is about), not sentiment. Sentiment
// stays in the tape-sentiment rail as a labelled model read.
type Cat = "all" | NewsTopic;
const CATS: Array<[Cat, string]> = [["all", "All"], ["earnings", "Earnings"], ["flow", "Flow"], ["company", "Company"], ["sector", "Sector"], ["macro", "Macro"]];

type Range = 7 | 14 | 31 | 93;
const RANGES: Array<[Range, string]> = [[7, "Last 1 week"], [14, "Last 2 weeks"], [31, "Last 1 month"], [93, "Last 3 months"]];

export function NewsPage() {
  const { bundle, marketDate, openTicker } = useApp();
  const [cat, setCat] = useState<Cat>("all");
  const [range, setRange] = useState<Range>(7);
  const [q, setQ] = useState("");

  const all = useMemo(() => newsStories(bundle), [bundle]);
  const disclosures = useMemo(() => newsDisclosures(bundle), [bundle]);

  const inRange = (n: NewsStory) => n.ageDays == null || n.ageDays <= range;
  const catCount = (k: Cat) => all.filter((n) => (k === "all" || n.topic === k) && inRange(n)).length;

  const needle = q.trim().toLowerCase();
  const items = useMemo(() => all
    .filter((n) => (cat === "all" || n.topic === cat) && inRange(n) && (!needle || `${n.title} ${n.ticker} ${n.company} ${n.sector} ${n.source}`.toLowerCase().includes(needle)))
    .sort((a, b) => (a.ageDays ?? 999) - (b.ageDays ?? 999)), [all, cat, range, needle]);

  // Tickers with a real corporate-action disclosure this snapshot → DISCLOSURE badge.
  const disclosureSet = useMemo(() => new Set(disclosures.map((d) => d.ticker)), [disclosures]);

  // Real "move since headline": load each visible story's OHLCV once and compute
  // the price change over its age. RVOL comes free from the technical bundle.
  const [ohlcv, setOhlcv] = useState<Record<string, OhlcvRow[]>>({});
  const tickerKey = useMemo(() => [...new Set(items.map((n) => n.ticker).filter(Boolean))].join(","), [items]);
  useEffect(() => {
    if (!marketDate) return;
    const wanted = tickerKey.split(",").filter((t) => t && !(t in ohlcv));
    if (!wanted.length) return;
    let cancelled = false;
    Promise.all(wanted.slice(0, 60).map(async (t) => [t, (await loadOhlcv(marketDate, t))?.rows || []] as const)).then((pairs) => {
      if (!cancelled) setOhlcv((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => { cancelled = true; };
  }, [tickerKey, marketDate, ohlcv]);

  // tape sentiment (real, over all parsed headlines)
  const up = all.filter((n) => n.tone === "up").length;
  const down = all.filter((n) => n.tone === "down").length;
  const flat = all.length - up - down;
  const tot = all.length || 1;
  const pct = (n: number) => `${((n / tot) * 100).toFixed(1)}%`;

  // most-mentioned tickers: real mention frequency across all parsed headlines
  const mentioned = (() => {
    const counts: Record<string, { ticker: string; count: number; tone: NewsTone }> = {};
    all.forEach((n) => { if (!n.ticker) return; counts[n.ticker] = counts[n.ticker] || { ticker: n.ticker, count: 0, tone: n.tone }; counts[n.ticker].count++; });
    const arr = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 8);
    const mx = Math.max(1, ...arr.map((t) => t.count));
    return arr.map((t) => ({ ...t, barW: `${((t.count / mx) * 100).toFixed(0)}%` }));
  })();

  return (
    <section>
      <PageHeader title="News & Catalysts" pill="TAPE & DISCLOSURES">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: ".04em", color: "var(--up)", background: "var(--upSoft)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 10px" }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--up)" }} /> Feed live · {formatAsOf(marketDate) || marketDate}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 11px", minWidth: 180, maxWidth: 280 }}>
          <span style={{ color: "var(--faint)", fontSize: 13 }}>⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search news, ticker, sector…" aria-label="Search news" style={{ border: "none", outline: "none", background: "transparent", fontSize: 12.5, color: "var(--text)", width: "100%" }} />
        </div>
      </PageHeader>

      {/* filters: sentiment + time range */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
        {CATS.map(([k, label]) => {
          const on = cat === k;
          return (
            <button key={k} type="button" onClick={() => setCat(k)} style={{ fontSize: 11, fontWeight: 700, padding: "6px 13px", borderRadius: 9, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--muted)", cursor: "pointer" }}>
              {label} <span style={{ fontFamily: MONO, opacity: 0.7 }}>{catCount(k)}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <span style={{ ...KICKER, marginRight: 2 }}>TIME RANGE</span>
        {RANGES.map(([k, label]) => {
          const on = range === k;
          return (
            <button key={k} type="button" onClick={() => setRange(k)} style={{ fontSize: 10.5, fontWeight: 700, padding: "5px 10px", borderRadius: 8, border: `1px solid ${on ? "var(--text)" : "var(--border)"}`, background: on ? "var(--text)" : "transparent", color: on ? "var(--panel)" : "var(--muted)", cursor: "pointer" }}>
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        {/* DESIGN_SPEC §3.6: the counter reports the filtered set against the
            whole feed, so a narrow filter is visible as such. */}
        <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>
          <strong style={{ color: "var(--text)" }}>{items.length}</strong> of {all.length} stories
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 16 }}>
        {/* feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((n, i) => (
            <NewsCard
              key={`${n.ticker}-${i}`}
              n={n}
              rvol={n.ticker ? (typeof bundle?.technical.get(n.ticker)?.rvol === "number" ? (bundle!.technical.get(n.ticker)!.rvol as number) : null) : null}
              move={moveSince(ohlcv[n.ticker], n.ageDays)}
              disclosure={disclosureSet.has(n.ticker)}
              onOpen={() => n.ticker && openTicker(n.ticker)}
            />
          ))}
          {bundle && !items.length ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--faint)", fontSize: 12 }}>No stories match this filter.</div>
          ) : null}
          {!bundle ? <div style={{ padding: "40px 0", textAlign: "center", color: "var(--faint)", fontSize: 12 }}>Loading the newswire…</div> : null}
        </div>

        {/* right rail */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* tape sentiment */}
          <div style={{ ...CARD, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={KICKER}>TAPE SENTIMENT · {formatAsOf(marketDate) || marketDate}</span>
              <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".08em", color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px" }}>MODELLED</span>
            </div>
            <div style={{ display: "flex", gap: 2, height: 14, borderRadius: 6, overflow: "hidden", marginBottom: 12 }} role="img" aria-label={`Sentiment: ${up} bullish, ${flat} neutral, ${down} bearish`}>
              <div style={{ width: pct(up), background: "var(--up)" }} />
              <div style={{ width: pct(flat), background: "var(--flat)", opacity: 0.4 }} />
              <div style={{ width: pct(down), background: "var(--down)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--up)", fontWeight: 700 }}>▲ Positive</span><span style={{ fontFamily: MONO }}>{up}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--muted)", fontWeight: 700 }}>• Neutral</span><span style={{ fontFamily: MONO }}>{flat}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--down)", fontWeight: 700 }}>▼ Negative</span><span style={{ fontFamily: MONO }}>{down}</span></div>
            </div>
            <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 10, lineHeight: 1.45 }}>Sentiment is a labelled model read on {all.length} headlines in this snapshot — not a price signal.</div>
          </div>

          {/* disclosure (real corporate actions) */}
          <div style={{ ...CARD, padding: "16px 18px" }}>
            <div style={{ ...KICKER, marginBottom: 12 }}>DISCLOSURE · CORPORATE ACTIONS</div>
            {disclosures.length ? (
              disclosures.slice(0, 8).map((d, i) => (
                <button key={`${d.ticker}-${i}`} type="button" onClick={() => openTicker(d.ticker)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 0", borderTop: i ? "1px solid var(--hair)" : "none", background: "transparent", border: "none", cursor: "pointer", color: "var(--text)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: "var(--accent)" }}>{d.ticker}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)", background: "var(--soft)", borderRadius: 5, padding: "2px 6px" }}>{d.category}</span>
                    <div style={{ flex: 1 }} />
                    {d.when ? <span style={{ fontSize: 10, color: "var(--faint)" }}>{d.when}</span> : null}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.35 }}>{d.title}</div>
                </button>
              ))
            ) : (
              <div style={{ fontSize: 11.5, color: "var(--faint)" }}>No corporate actions flagged in this snapshot.</div>
            )}
          </div>

          {/* most-mentioned tickers (design/5. News.dc.html) — real mention frequency */}
          <div style={{ ...CARD, padding: "16px 18px" }}>
            <div style={{ ...KICKER, marginBottom: 10 }}>MOST-MENTIONED TICKERS</div>
            {mentioned.length ? (
              mentioned.map((t, i) => (
                <button key={`${t.ticker}-${i}`} type="button" onClick={() => t.ticker && openTicker(t.ticker)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--hair)" : "none", background: "transparent", border: "none", width: "100%", textAlign: "left", cursor: "pointer", color: "var(--text)" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, width: 52, flex: "none" }}>{t.ticker}</span>
                  <span style={{ flex: 1, height: 6, background: "var(--soft)", borderRadius: 4, overflow: "hidden" }}><span style={{ display: "block", width: t.barW, height: "100%", background: toneColor(t.tone), borderRadius: 4 }} /></span>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "var(--muted)", width: 20, textAlign: "right" }}>{t.count}</span>
                </button>
              ))
            ) : (
              <div style={{ fontSize: 11.5, color: "var(--faint)" }}>No ticker-tagged headlines in this snapshot.</div>
            )}
          </div>

          {/* economic & events calendar — honest: no forward calendar in the feed */}
          <div style={{ ...CARD, padding: "16px 18px" }}>
            <div style={{ ...KICKER, marginBottom: 10 }}>ECONOMIC &amp; EVENTS CALENDAR</div>
            <div style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5 }}>
              No forward-dated event calendar in this snapshot. The workbook flags corporate actions after the fact — see DISCLOSURE above ({disclosures.length} flagged). A dated calendar is not fabricated here.
            </div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.5, maxWidth: 820, marginTop: 16 }}>
        Real workbook news feed · {marketDate}. {all.length} headlines parsed from the source snapshot; each opens the ticker detail page. Sentiment (▲/▼/•) is a <strong>labelled model</strong> read, not a price signal. Topic categories (Earnings / Flow / Company / Sector / Macro) are <strong>derived from the headline text</strong> — the feed carries no topic field (see Data Health). <strong>Move-since-headline</strong> and <strong>RVOL</strong> are computed from the real OHLCV series; the wire·tier chip is a labelled classification of the source name. Age is the source-reported recency; DISCLOSURE flags a ticker with a real corporate action this snapshot. Records without a headline are omitted (never fabricated); no external article URLs are published because the feed stores none.
      </div>
    </section>
  );
}

const TOPIC_LABEL: Record<NewsTopic, string> = { earnings: "Earnings", flow: "Flow", company: "Company", sector: "Sector", macro: "Macro" };

function NewsCard({ n, rvol, move, disclosure, onOpen }: { n: NewsStory; rvol: number | null; move: number | null; disclosure: boolean; onOpen: () => void }) {
  const { wire, tier } = sourceTier(n.source);
  const moveColor = move == null ? "var(--faint)" : move > 0 ? "var(--up)" : move < 0 ? "var(--down)" : "var(--flat)";
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} style={{ ...CARD, borderRadius: 13, padding: "15px 17px", cursor: n.ticker ? "pointer" : "default", color: "var(--text)", borderLeft: `3px solid ${toneColor(n.tone)}` }}>
      {/* header: ticker · topic · disclosure · recency */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7, flexWrap: "wrap" }}>
        {n.ticker ? <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 6, padding: "3px 8px" }}>{n.ticker}</span> : null}
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: toneColor(n.tone), background: toneBg(n.tone), borderRadius: 6, padding: "3px 8px" }}>{TOPIC_LABEL[n.topic]}</span>
        {disclosure ? <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".04em", color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 5, padding: "2px 6px" }}>DISCLOSURE</span> : null}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--faint)" }}>{ageLabel(n.ageDays, n.when)}</span>
      </div>
      {/* headline */}
      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>{n.title}</div>
      {/* footer: source · wire·tier · sector · move · rvol · sentiment (modelled) */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9, fontSize: 10.5, color: "var(--faint)", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, color: "var(--muted)" }}>{n.source}</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)", background: "var(--soft)", borderRadius: 4, padding: "1px 5px" }}>{wire} · {tier}</span>
        {n.sector && n.sector !== "—" ? <><span>·</span><span>{n.sector}</span></> : null}
        <div style={{ flex: 1 }} />
        {move != null ? <span style={{ fontFamily: MONO, fontWeight: 700, color: moveColor }}>{move > 0 ? "▲" : move < 0 ? "▼" : "•"} {move > 0 ? "+" : ""}{move.toFixed(1)}% since</span> : null}
        {rvol != null ? <span style={{ fontFamily: MONO, color: "var(--muted)" }}>RVOL {rvol.toFixed(1)}×</span> : null}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, color: toneColor(n.tone) }}>
          {toneGlyph(n.tone)} {toneLabel(n.tone)}
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 4px" }}>MODELLED</span>
        </span>
      </div>
    </div>
  );
}
