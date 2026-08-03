"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { formatAsOf } from "@/lib/format/number";
import { newsStories, type NewsStory, type NewsTone } from "@/lib/data/news";

const MONO = "var(--mono, var(--font-mono))";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))" };

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
  return t === "up" ? "Positive" : t === "down" ? "Negative" : "Neutral";
}

type Cat = "all" | "up" | "flat" | "down";
const CATS: Array<[Cat, string]> = [["all", "All"], ["up", "Bullish"], ["flat", "Neutral"], ["down", "Bearish"]];

export function NewsPage() {
  const { bundle, marketDate, openTicker } = useApp();
  const [cat, setCat] = useState<Cat>("all");
  const [q, setQ] = useState("");

  const all = useMemo(() => newsStories(bundle), [bundle]);

  const catCount = (k: Cat) => (k === "all" ? all.length : all.filter((n) => n.tone === k).length);

  const needle = q.trim().toLowerCase();
  const items = all.filter(
    (n) => (cat === "all" || n.tone === cat) && (!needle || `${n.title} ${n.ticker} ${n.company} ${n.sector}`.toLowerCase().includes(needle)),
  );

  const fresh = all.filter((n) => /today/i.test(n.when)).slice(0, 8);
  const up = all.filter((n) => n.tone === "up").length;
  const down = all.filter((n) => n.tone === "down").length;
  const flat = all.length - up - down;
  const tot = all.length || 1;
  const pct = (n: number) => `${((n / tot) * 100).toFixed(1)}%`;

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-.01em" }}>News &amp; Catalysts</h1>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 9px" }}>WHAT MOVED THE TAPE</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 11px", minWidth: 180, maxWidth: 280 }}>
          <span style={{ color: "var(--faint)", fontSize: 13 }}>⌕</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search news, ticker, sector…" aria-label="Search news" style={{ border: "none", outline: "none", background: "transparent", fontSize: 12.5, color: "var(--text)", width: "100%" }} />
        </div>
      </div>

      {/* category filter */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {CATS.map(([k, label]) => {
          const on = cat === k;
          return (
            <button key={k} type="button" onClick={() => setCat(k)} style={{ fontSize: 11, fontWeight: 700, padding: "6px 13px", borderRadius: 9, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--muted)", cursor: "pointer" }}>
              {label} <span style={{ fontFamily: MONO, opacity: 0.7 }}>{catCount(k)}</span>
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>{items.length} stories</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,1fr)", gap: 16 }}>
        {/* feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {items.map((n, i) => (
            <NewsCard key={`${n.ticker}-${i}`} n={n} onOpen={() => n.ticker && openTicker(n.ticker)} />
          ))}
          {bundle && !items.length ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--faint)", fontSize: 12 }}>No stories match this filter.</div>
          ) : null}
          {!bundle ? <div style={{ padding: "40px 0", textAlign: "center", color: "var(--faint)", fontSize: 12 }}>Loading the newswire…</div> : null}
        </div>

        {/* right rail */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ ...CARD, padding: "16px 18px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)", marginBottom: 12 }}>FRESH TODAY</div>
            {fresh.length ? (
              fresh.map((t, i) => (
                <button key={`${t.ticker}-${i}`} type="button" onClick={() => t.ticker && openTicker(t.ticker)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--hair)" : "none", background: "transparent", border: "none", width: "100%", textAlign: "left", cursor: "pointer", color: "var(--text)" }}>
                  <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: toneColor(t.tone), flex: "none" }} />
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, width: 52, flex: "none" }}>{t.ticker}</span>
                  <span style={{ fontSize: 11, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                </button>
              ))
            ) : (
              <div style={{ fontSize: 11.5, color: "var(--faint)" }}>No stories tagged today in this snapshot.</div>
            )}
          </div>

          <div style={{ ...CARD, padding: "16px 18px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)", marginBottom: 12 }}>TAPE SENTIMENT · {formatAsOf(marketDate) || marketDate}</div>
            <div style={{ display: "flex", gap: 2, height: 14, borderRadius: 6, overflow: "hidden", marginBottom: 12 }} role="img" aria-label={`Sentiment: ${up} positive, ${flat} neutral, ${down} negative`}>
              <div style={{ width: pct(up), background: "var(--up)" }} />
              <div style={{ width: pct(flat), background: "var(--flat)", opacity: 0.4 }} />
              <div style={{ width: pct(down), background: "var(--down)" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--up)", fontWeight: 700 }}>▲ Positive</span><span style={{ fontFamily: MONO }}>{up}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--muted)", fontWeight: 700 }}>• Neutral</span><span style={{ fontFamily: MONO }}>{flat}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "var(--down)", fontWeight: 700 }}>▼ Negative</span><span style={{ fontFamily: MONO }}>{down}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.5, maxWidth: 820, marginTop: 16 }}>
        Real workbook news feed · {marketDate}. Tone (▲/▼/•) is the labelled sentiment from the source; each story links to the ticker detail page. Records without a headline are omitted (never fabricated).
      </div>
    </section>
  );
}

function NewsCard({ n, onOpen }: { n: NewsStory; onOpen: () => void }) {
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }} style={{ ...CARD, borderRadius: 13, padding: "15px 17px", cursor: n.ticker ? "pointer" : "default", color: "var(--text)", borderLeft: `3px solid ${toneColor(n.tone)}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7, flexWrap: "wrap" }}>
        {n.ticker ? <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 800, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 6, padding: "3px 8px" }}>{n.ticker}</span> : null}
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".05em", color: toneColor(n.tone), background: toneBg(n.tone), borderRadius: 6, padding: "3px 8px" }}>{n.toneWord}</span>
        <div style={{ flex: 1 }} />
        {n.when ? <span style={{ fontSize: 10, color: "var(--faint)" }}>{n.when}</span> : null}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>{n.title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 9, fontSize: 10.5, color: "var(--faint)" }}>
        <span>{n.source}</span>
        {n.sector && n.sector !== "—" ? <><span>·</span><span>{n.sector}</span></> : null}
        <div style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontWeight: 700, color: toneColor(n.tone) }}>{toneGlyph(n.tone)} {toneLabel(n.tone)}</span>
      </div>
    </div>
  );
}
