"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { V2Shell } from "@/components/v2/V2Shell";
import { formatAsOf } from "@/lib/format/number";
import { newsStories, newsDisclosures, type NewsStory, type NewsTone } from "@/lib/data/news";

// Faithful port of "5. News.dc.html" — prototype layout (tone-bordered cards +
// right rail) fed by the REAL workbook news feed. Fields the real feed genuinely
// lacks (move-since-headline, RVOL, external URL, Earnings/Flow taxonomy) render
// an explicit "no data" rather than the prototype's representative values.

const MONO = "var(--font-mono)";
const toneColor = (t: NewsTone) => (t === "up" ? "var(--up)" : t === "down" ? "var(--down)" : "var(--flat)");
const toneBg = (t: NewsTone) => (t === "up" ? "var(--upSoft)" : t === "down" ? "var(--downSoft)" : "var(--flatSoft, var(--soft))");
const toneGlyph = (t: NewsTone) => (t === "up" ? "▲" : t === "down" ? "▼" : "•");
const toneWord = (t: NewsTone) => (t === "up" ? "Positive" : t === "down" ? "Negative" : "Neutral");
function ageLabel(d: number | null, when: string): string {
  if (d == null) return when || "—";
  if (d === 0) return "today"; if (d === 1) return "1 day ago"; if (d < 7) return `${d} days ago`;
  if (d < 14) return "~1 week ago"; if (d < 30) return `${Math.round(d / 7)} weeks ago`; return `${Math.round(d / 30)} mo ago`;
}
// Source tier heuristic (real feed has no tier field): primary filing/exchange/regulator = 1.
function tierOf(src: string): { wire: string; tier: number } {
  const s = (src || "").toLowerCase();
  if (/idx|ojk|bank indonesia|\bbi\b|filing|disclosure|keterbukaan/.test(s)) return { wire: "IDX", tier: 1 };
  if (/reuters|bloomberg|antara|kontan|bisnis|cnbc|wire/.test(s)) return { wire: "WIRE", tier: 2 };
  return { wire: "DESK", tier: 3 };
}
const tierWord = (t: number) => (t === 1 ? "primary" : t === 2 ? "wire" : "desk");

type Cat = "all" | "up" | "flat" | "down";
const CATS: Array<[Cat, string]> = [["all", "All"], ["up", "Bullish"], ["flat", "Neutral"], ["down", "Bearish"]];
type Range = 0 | 3 | 7 | 14 | 999;
const RANGES: Array<[Range, string]> = [[999, "All"], [14, "≤ 2 weeks"], [7, "≤ 1 week"], [3, "≤ 3 days"], [0, "Today"]];

export function NewsFaithful() {
  const { bundle, marketDate, openTicker } = useApp();
  const [cat, setCat] = useState<Cat>("all");
  const [range, setRange] = useState<Range>(999);
  const [q, setQ] = useState("");

  const all = useMemo(() => newsStories(bundle), [bundle]);
  const disclosures = useMemo(() => newsDisclosures(bundle), [bundle]);

  const inRange = (n: NewsStory) => range === 999 || (n.ageDays != null && n.ageDays <= range);
  const catCount = (k: Cat) => all.filter((n) => (k === "all" || n.tone === k) && inRange(n)).length;
  const needle = q.trim().toLowerCase();
  const filtered = all
    .filter((n) => (cat === "all" || n.tone === cat) && inRange(n) && (!needle || `${n.title} ${n.ticker} ${n.company} ${n.sector} ${n.source}`.toLowerCase().includes(needle)))
    .sort((a, b) => (a.ageDays ?? 999) - (b.ageDays ?? 999));
  const totalInRange = filtered.length;
  const items = filtered.slice(0, 10);

  const up = all.filter((n) => n.tone === "up").length, down = all.filter((n) => n.tone === "down").length;
  const flat = all.length - up - down, tot = all.length || 1;
  const pct = (n: number) => `${((n / tot) * 100).toFixed(1)}%`;

  // Most-mentioned: real ticker frequency across all parsed headlines.
  const trending = useMemo(() => {
    const counts: Record<string, { ticker: string; count: number; tone: NewsTone }> = {};
    all.forEach((n) => { if (!n.ticker) return; counts[n.ticker] = counts[n.ticker] || { ticker: n.ticker, count: 0, tone: n.tone }; counts[n.ticker].count++; });
    const arr = Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 6);
    const mx = Math.max(1, ...arr.map((t) => t.count));
    return arr.map((t) => ({ ...t, barW: ((t.count / mx) * 100).toFixed(0) + "%" }));
  }, [all]);

  const meta = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600, color: "var(--warn)" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warn)" }} />delayed · newswire, as of {formatAsOf(marketDate) || marketDate}
    </span>
  );

  return (
    <V2Shell active="news" title="News &amp; Catalysts" meta={meta}>
      <main style={{ flex: 1, minWidth: 0, padding: "22px 30px 64px" }}>
        {/* search */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 11px", minWidth: 180, maxWidth: 280 }}>
            <span style={{ color: "var(--faint)", fontSize: 13 }}>⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search news, ticker, sector…" style={{ border: "none", outline: "none", background: "transparent", fontSize: 12.5, color: "var(--text)", width: "100%" }} />
          </div>
        </div>
        {/* category (sentiment — real) */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {CATS.map(([k, label]) => {
            const on = cat === k;
            return <button key={k} type="button" onClick={() => setCat(k)} style={{ fontSize: 11, fontWeight: 700, padding: "6px 13px", borderRadius: 9, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--muted)", cursor: "pointer" }}>{label} <span style={{ fontFamily: MONO, opacity: 0.7 }}>{catCount(k)}</span></button>;
          })}
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>{items.length} of {totalInRange} stories</span>
        </div>
        {/* time range */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)", marginRight: 2 }}>TIME RANGE</span>
          {RANGES.map(([k, label]) => {
            const on = range === k;
            return <button key={k} type="button" onClick={() => setRange(k)} style={{ fontSize: 11, fontWeight: 700, padding: "6px 12px", borderRadius: 9, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--muted)", cursor: "pointer" }}>{label}</button>;
          })}
          <span style={{ fontSize: 10, color: "var(--faint)" }}>· newest 10 shown</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 16, alignItems: "start" }}>
          {/* feed */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {items.map((n, i) => {
              const t = tierOf(n.source);
              return (
                <div key={`${n.ticker}-${i}`} style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 13, boxShadow: "var(--sh)", padding: "15px 17px", borderLeft: `3px solid ${toneColor(n.tone)}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7, flexWrap: "wrap" }}>
                    {n.ticker ? <button type="button" onClick={() => openTicker(n.ticker)} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 6, padding: "3px 8px", border: "none", cursor: "pointer" }}>{n.ticker}</button> : null}
                    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: toneColor(n.tone), background: toneBg(n.tone), borderRadius: 6, padding: "3px 8px" }}>{toneWord(n.tone)}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--faint)" }}>{ageLabel(n.ageDays, n.when)}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>{n.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 9, fontSize: 10.5, color: "var(--faint)", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, color: "var(--muted)" }}>{n.source}</span>
                    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".04em", color: t.tier === 1 ? "var(--up)" : "var(--muted)", background: "var(--soft)", borderRadius: 4, padding: "1px 5px" }}>{t.wire} · {tierWord(t.tier)}</span>
                    {n.sector && n.sector !== "—" ? <><span>·</span><span>{n.sector}</span></> : null}
                    <div style={{ flex: 1 }} />
                    <span style={{ fontFamily: MONO, color: "var(--faint)" }} title="Intraday move-since-headline not in the feed">move: no data</span>
                    <span style={{ fontFamily: MONO, color: "var(--faint)" }} title="Intraday RVOL not in the feed">RVOL: no data</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, color: toneColor(n.tone) }}>{toneGlyph(n.tone)} {toneWord(n.tone)}<span style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 4px" }}>MODELLED</span></span>
                  </div>
                </div>
              );
            })}
            {bundle && !items.length ? <div style={{ padding: "40px 0", textAlign: "center", color: "var(--faint)", fontSize: 12 }}>No stories match this filter.</div> : null}
            {!bundle ? <div style={{ padding: "40px 0", textAlign: "center", color: "var(--faint)", fontSize: 12 }}>Loading the newswire…</div> : null}
          </div>

          {/* right rail */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh)", padding: "16px 18px" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)", marginBottom: 12 }}>MOST-MENTIONED TICKERS</div>
              {trending.length ? trending.map((t, i) => (
                <button key={t.ticker} type="button" onClick={() => openTicker(t.ticker)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--hair)" : "none", background: "transparent", border: "none", width: "100%", textAlign: "left", cursor: "pointer", color: "var(--text)" }}>
                  <span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, width: 52 }}>{t.ticker}</span>
                  <span style={{ flex: 1, height: 6, background: "var(--soft)", borderRadius: 4, overflow: "hidden" }}><span style={{ display: "block", width: t.barW, height: "100%", background: toneColor(t.tone), borderRadius: 4 }} /></span>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "var(--muted)", width: 20, textAlign: "right" }}>{t.count}</span>
                </button>
              )) : <div style={{ fontSize: 11.5, color: "var(--faint)" }}>No ticker-tagged headlines.</div>}
            </div>

            <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh)", padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}><span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>EVENTS · CORPORATE ACTIONS</span><span style={{ fontSize: 8, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 5px" }}>REAL</span></div>
              {disclosures.length ? disclosures.slice(0, 6).map((d, i) => (
                <button key={`${d.ticker}-${i}`} type="button" onClick={() => openTicker(d.ticker)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: i ? "1px solid var(--hair)" : "none", background: "transparent", border: "none", width: "100%", textAlign: "left", cursor: "pointer", color: "var(--text)" }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: "var(--accent)", width: 52, flex: "none" }}>{d.ticker}</span>
                  <span style={{ fontSize: 11.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                  <span style={{ fontSize: 8.5, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 5, padding: "2px 6px", flex: "none" }}>{d.category}</span>
                </button>
              )) : <div style={{ fontSize: 11.5, color: "var(--faint)", lineHeight: 1.5 }}>No corporate actions flagged in this snapshot. A forward-dated calendar is not fabricated.</div>}
            </div>

            <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh)", padding: "16px 18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>TAPE SENTIMENT · TODAY</span><span style={{ fontSize: 8.5, fontWeight: 800, color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px" }}>MODELLED</span></div>
              <div style={{ display: "flex", gap: 2, height: 14, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ width: pct(up), background: "var(--up)" }} /><div style={{ width: pct(flat), background: "var(--flat)", opacity: 0.4 }} /><div style={{ width: pct(down), background: "var(--down)" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--up)", fontWeight: 700 }}>▲ Positive</span><span style={{ fontFamily: MONO }}>{up}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--muted)", fontWeight: 700 }}>• Neutral</span><span style={{ fontFamily: MONO }}>{flat}</span></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--down)", fontWeight: 700 }}>▼ Negative</span><span style={{ fontFamily: MONO }}>{down}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 18, borderTop: "1px solid var(--hair)", paddingTop: 12, fontSize: 10, color: "var(--faint)", lineHeight: 1.55, maxWidth: 900 }}>
          <strong style={{ color: "var(--muted)" }}>Data &amp; provenance.</strong> Headlines, sources, sentiment and recency are the <strong>real</strong> workbook news feed ({all.length} parsed). The sentiment tag is <strong>MODELLED</strong> (NLP, not a fact). Move-since-headline, intraday RVOL, source tier and an Earnings/Flow taxonomy are not in the feed → shown as “no data” / heuristic, never fabricated. Delayed data — not investment advice.
        </div>
      </main>
    </V2Shell>
  );
}
