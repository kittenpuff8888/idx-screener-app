"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { V2Shell } from "@/components/v2/V2Shell";
import { fmt, loadHistory, type HistoryDoc } from "@/lib/v2/screenerData";

// Faithful port of "2.2 Past Setups.dc.html" — expectancy (hit-rate + Wilson CI,
// avg R, equity curve), per-outcome breakdown, sortable published-setup log.
// Wired to the real docs/data/setups-history.json.

type Entry = HistoryDoc["entries"][number] & { rrNum: number };
const outMeta = (o: string) =>
  o === "target" ? { label: "TARGET", color: "var(--up)", note: "hit target" }
  : o === "invalidated" ? { label: "INVALIDATED", color: "var(--down)", note: "" }
  : { label: "UNDECIDED", color: "var(--flat)", note: "(5 bars)" };

export function PastSetupsFaithful() {
  const { openTicker } = useApp();
  const [doc, setDoc] = useState<HistoryDoc | null>(null);
  const [sortCol, setSortCol] = useState("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    loadHistory().then((d) => { if (!cancelled) setDoc(d); });
    return () => { cancelled = true; };
  }, []);

  const setSort = (c: string) => { if (sortCol === c && sortDir === "desc") setSortDir("asc"); else { setSortCol(c); setSortDir("desc"); } };

  const model = useMemo(() => {
    if (!doc) return null;
    const entries = doc.entries || [], sm = doc.summary || {};
    const counts: Record<string, number> = { all: entries.length, target: 0, invalidated: 0, undecided: 0 };
    entries.forEach((e) => { counts[e.outcome] = (counts[e.outcome] || 0) + 1; });

    const decided = entries.map((e) => ({ ...e, rrNum: (e.target - e.close) / Math.max(1e-6, e.close - e.invalidation) }))
      .filter((e) => e.outcome === "target" || e.outcome === "invalidated")
      .sort((a, b) => a.date.localeCompare(b.date));
    const nDec = decided.length, wins = decided.filter((e) => e.outcome === "target").length;
    const p = nDec ? wins / nDec : 0;
    const z = 1.96, den = 1 + (z * z) / (nDec || 1);
    const centre = (p + (z * z) / (2 * (nDec || 1))) / den;
    const half = nDec ? (z * Math.sqrt((p * (1 - p)) / nDec + (z * z) / (4 * nDec * nDec)) / den) : 0;
    const ciLo = Math.max(0, centre - half), ciHi = Math.min(1, centre + half);
    let cum = 0; const eq = decided.map((e) => { cum += e.outcome === "target" ? e.rrNum : -1; return cum; });
    const avgR = nDec ? cum / nDec : 0;
    const eqMin = Math.min(0, ...eq), eqMax = Math.max(0, ...eq), eqRange = (eqMax - eqMin) || 1;
    const H = 60, pad = 5;
    const eqPts = eq.map((v, i) => `${((i / Math.max(1, eq.length - 1)) * 100).toFixed(2)},${(H - pad - ((v - eqMin) / eqRange) * (H - pad * 2)).toFixed(2)}`).join(" ");
    const zeroY = (H - pad - ((0 - eqMin) / eqRange) * (H - pad * 2)).toFixed(2);

    const stats = [
      { label: "PUBLISHED", value: String(sm.total ?? entries.length), color: "var(--text)", note: "setups logged" },
      { label: "DECIDED", value: String(sm.decided ?? nDec), color: "var(--text)", note: "target or invalidated" },
      { label: "HIT-RATE", value: ((sm.hitRate ?? p) * 100).toFixed(0) + "%", color: (sm.hitRate ?? p) >= 0.5 ? "var(--up)" : (sm.hitRate ?? p) >= 0.4 ? "var(--flat)" : "var(--down)", note: "reached target first" },
      { label: "TARGET-FIRST", value: String(sm.targetFirst ?? wins), color: "var(--up)", note: "of the decided" },
    ];
    const expectancy = {
      nDec, small: nDec < 20,
      hitRate: (p * 100).toFixed(0) + "%", ci: (ciLo * 100).toFixed(0) + "–" + (ciHi * 100).toFixed(0) + "%",
      avgR: (avgR >= 0 ? "+" : "−") + Math.abs(avgR).toFixed(2) + "R", avgRColor: avgR >= 0 ? "var(--up)" : "var(--down)",
      totalR: (cum >= 0 ? "+" : "−") + Math.abs(cum).toFixed(1) + "R", totalRColor: cum >= 0 ? "var(--up)" : "var(--down)",
      eqPts, zeroY, eqColor: cum >= 0 ? "var(--up)" : "var(--down)",
    };
    const breakdown = [
      { label: "Target-first", n: counts.target, color: "var(--up)" },
      { label: "Invalidated", n: counts.invalidated, color: "var(--down)" },
      { label: "Still open", n: counts.undecided, color: "var(--flat)" },
    ].map((b) => ({ ...b, w: ((b.n / Math.max(1, entries.length)) * 100).toFixed(1) + "%" }));

    let list: Entry[] = entries.map((e) => ({ ...e, rrNum: (e.target - e.close) / Math.max(1e-6, e.close - e.invalidation) }));
    if (filter !== "all") list = list.filter((e) => e.outcome === filter);
    const dir = sortDir === "asc" ? 1 : -1;
    const key = (e: Entry): string | number => {
      switch (sortCol) {
        case "ticker": return e.ticker; case "outcome": return e.outcome; case "score": return e.score;
        case "close": return e.close; case "invalidation": return e.invalidation; case "target": return e.target;
        case "rr": return e.rrNum; default: return e.date;
      }
    };
    list = list.slice().sort((a, b) => { const ka = key(a), kb = key(b); if (typeof ka === "string") return (ka as string).localeCompare(kb as string) * dir; return ((ka as number) - (kb as number)) * dir; });

    return { stats, expectancy, breakdown, counts, rows: list, asOf: (doc.asOf || "") + " · EOD", note: doc.note || "" };
  }, [doc, filter, sortCol, sortDir]);

  const meta = (
    <>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 9px" }}>FORWARD OUTCOMES</span>
      <a href="/v2/screener" style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>‹ Screener</a>
    </>
  );

  if (!model) return <V2Shell active="screener" title="Past Setups" meta={meta}><main style={{ flex: 1, padding: "40px 30px", color: "var(--muted)" }}>Loading published-setup history…</main></V2Shell>;

  const hcols: Array<[string, string, string]> = [["date", "DATE", "flex-start"], ["ticker", "TICKER", "flex-start"], ["score", "SCORE", "flex-end"], ["close", "CLOSE", "flex-end"], ["invalidation", "INVALID.", "flex-end"], ["target", "TARGET", "flex-end"], ["rr", "R:R", "flex-end"], ["outcome", "OUTCOME", "flex-start"]];
  const filters: Array<[string, string]> = [["all", "All"], ["target", "Target"], ["invalidated", "Invalidated"], ["undecided", "Open"]];
  const GRID = "118px 128px 66px 92px 92px 92px 64px 1fr";

  return (
    <V2Shell active="screener" title="Past Setups" meta={meta}>
      <main style={{ flex: 1, minWidth: 0, padding: "22px 30px 64px" }}>
        {/* stat tiles */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
          {model.stats.map((s) => (
            <div key={s.label} style={{ flex: 1, minWidth: 150, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh)", padding: "15px 18px" }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)" }}>{s.label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{s.note}</div>
            </div>
          ))}
        </div>

        {/* expectancy + equity curve */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px,1fr) minmax(320px,1.4fr)", gap: 12, marginBottom: 18 }}>
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh)", padding: "15px 18px" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)", marginBottom: 12 }}>EXPECTANCY · DECIDED SETUPS</div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div><div style={{ fontSize: 9, color: "var(--faint)", letterSpacing: ".06em" }}>HIT-RATE (95% CI)</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800 }}>{model.expectancy.hitRate}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)" }}>CI {model.expectancy.ci}</div></div>
              <div><div style={{ fontSize: 9, color: "var(--faint)", letterSpacing: ".06em" }}>AVG R / TRADE</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, color: model.expectancy.avgRColor }}>{model.expectancy.avgR}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)" }}>n = {model.expectancy.nDec}</div></div>
              <div><div style={{ fontSize: 9, color: "var(--faint)", letterSpacing: ".06em" }}>CUMULATIVE</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 800, color: model.expectancy.totalRColor }}>{model.expectancy.totalR}</div><div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)" }}>win +planned R · loss −1R</div></div>
            </div>
            {model.expectancy.small && <div style={{ marginTop: 12, fontSize: 10, color: "var(--warn)", background: "var(--warnSoft)", borderRadius: 8, padding: "7px 10px", lineHeight: 1.4 }}>⚠ Small sample (n &lt; 20) — wide CI; treat as indicative. Log may carry survivorship/look-ahead bias until an audited forward record accrues.</div>}
          </div>
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh)", padding: "15px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>EQUITY CURVE · R MULTIPLES</span><div style={{ flex: 1 }} /><span style={{ fontSize: 9, color: "var(--faint)" }}>flat line = breakeven</span></div>
            <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={{ width: "100%", height: 96, display: "block" }}>
              <line x1="0" y1={model.expectancy.zeroY} x2="100" y2={model.expectancy.zeroY} stroke="var(--border)" strokeWidth="1" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
              <polyline points={model.expectancy.eqPts} fill="none" stroke={model.expectancy.eqColor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <div style={{ display: "flex", gap: 2, height: 12, borderRadius: 5, overflow: "hidden", marginTop: 12 }}>
              {model.breakdown.map((b) => <div key={b.label} style={{ width: b.w, background: b.color }} />)}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
              {model.breakdown.map((b) => <span key={b.label} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: b.color }} /><span style={{ color: "var(--muted)" }}>{b.label}</span><span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{b.n}</span></span>)}
            </div>
          </div>
        </div>

        {/* filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>PUBLISHED SETUPS</span>
          <span style={{ fontSize: 9.5, color: "var(--faint)" }}>vs IHSG benchmark over the same window</span>
          <div style={{ flex: 1 }} />
          {filters.map(([k, label]) => {
            const on = filter === k;
            return <button key={k} type="button" onClick={() => setFilter(k)} style={{ fontSize: 10.5, fontWeight: 700, padding: "5px 11px", borderRadius: 8, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--muted)", cursor: "pointer" }}>{label} {model.counts[k] || 0}</button>;
          })}
        </div>

        {/* table */}
        <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh)", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 920 }}>
              <div style={{ position: "sticky", top: 0, zIndex: 10, display: "grid", gridTemplateColumns: GRID, background: "var(--soft)", borderBottom: "1px solid var(--border)" }}>
                {hcols.map(([col, label, justify]) => (
                  <button key={col} type="button" onClick={() => setSort(col)} style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: justify, padding: "11px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 9, fontWeight: 700, letterSpacing: ".06em", color: sortCol === col ? "var(--text)" : "var(--faint)" }}>
                    {label}<span style={{ color: "var(--accent)" }}>{sortCol === col ? (sortDir === "desc" ? "▼" : "▲") : ""}</span>
                  </button>
                ))}
              </div>
              {model.rows.map((e, i) => {
                const m = outMeta(e.outcome);
                return (
                  <div key={e.ticker + e.date + i} onClick={() => openTicker(e.ticker)} style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", borderBottom: "1px solid var(--hair)", cursor: "pointer", color: "var(--text)" }}>
                    <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>{e.date}</div>
                    <div style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800 }}>{e.ticker}</div>
                    <div style={{ padding: "10px 12px", textAlign: "right" }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 800, color: e.score >= 70 ? "var(--up)" : e.score >= 55 ? "var(--flat)" : "var(--down)" }}>{e.score}</span></div>
                    <div style={{ padding: "10px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11 }}>{fmt.price(e.close)}</div>
                    <div style={{ padding: "10px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--down)" }}>{fmt.price(e.invalidation)}</div>
                    <div style={{ padding: "10px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--up)" }}>{fmt.price(e.target)}</div>
                    <div style={{ padding: "10px 12px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 800, color: "var(--accent)" }}>{e.rrNum.toFixed(1)}×</div>
                    <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".03em", color: m.color }}>{m.label}</span>
                      <span style={{ fontSize: 9.5, color: "var(--faint)" }}>{m.note}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.5, maxWidth: 820, marginTop: 14 }}>{model.note} Real published-setup log (setups-history.json). Blue = reached target, red = invalidated, gray = still open. Small samples early on — analytics, not advice.</div>
      </main>
    </V2Shell>
  );
}
