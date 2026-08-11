"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { formatPrice } from "@/lib/format/number";
import { loadHistory, type HistoryDoc, type HistoryEntry } from "@/lib/data/screenerUniverse";

const MONO = "var(--mono, var(--font-mono))";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))" };
const GRID = "118px 128px 66px 92px 92px 92px 64px 1fr";

type Filter = "all" | "target" | "invalidated" | "undecided";

function outMeta(o: string): { label: string; color: string; note: string } {
  if (o === "target") return { label: "TARGET", color: "var(--up)", note: "hit target" };
  if (o === "invalidated") return { label: "INVALIDATED", color: "var(--down)", note: "" };
  return { label: "UNDECIDED", color: "var(--flat)", note: "(5 bars)" };
}

function rrOf(e: HistoryEntry): number {
  return (e.target - e.close) / Math.max(1e-6, e.close - e.invalidation);
}

export function PastSetupsPage() {
  const { openTicker } = useApp();
  const [doc, setDoc] = useState<HistoryDoc | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortCol, setSortCol] = useState("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    loadHistory().then(setDoc).catch(() => setDoc(null));
  }, []);

  const entries = doc?.entries ?? [];
  const sm = doc?.summary;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: entries.length, target: 0, invalidated: 0, undecided: 0 };
    entries.forEach((e) => (c[e.outcome] = (c[e.outcome] || 0) + 1));
    return c;
  }, [entries]);

  const rows = useMemo(() => {
    let list = entries.slice();
    if (filter !== "all") list = list.filter((e) => e.outcome === filter);
    const dir = sortDir === "asc" ? 1 : -1;
    const key = (e: HistoryEntry): number | string => {
      switch (sortCol) {
        case "ticker": return e.ticker;
        case "outcome": return e.outcome;
        case "score": return e.score;
        case "close": return e.close;
        case "invalidation": return e.invalidation;
        case "target": return e.target;
        case "rr": return rrOf(e);
        default: return e.date;
      }
    };
    return list.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (typeof ka === "string") return ka.localeCompare(kb as string) * dir;
      return ((ka as number) - (kb as number)) * dir;
    });
  }, [entries, filter, sortCol, sortDir]);

  const setSort = (c: string) => {
    if (sortCol === c && sortDir === "desc") setSortDir("asc");
    else {
      setSortCol(c);
      setSortDir("desc");
    }
  };

  const hitRate = sm?.hitRate ?? 0;
  const stats = [
    { label: "PUBLISHED", value: String(sm?.total ?? entries.length), color: "var(--text)", note: "setups logged" },
    { label: "DECIDED", value: String(sm?.decided ?? 0), color: "var(--text)", note: "target or invalidated" },
    { label: "HIT-RATE", value: `${(hitRate * 100).toFixed(0)}%`, color: hitRate >= 0.5 ? "var(--up)" : hitRate >= 0.4 ? "var(--flat)" : "var(--down)", note: "reached target first" },
    { label: "TARGET-FIRST", value: String(sm?.targetFirst ?? 0), color: "var(--up)", note: "of the decided" },
  ];

  const filters: Array<[Filter, string]> = [["all", "All"], ["target", "Target"], ["invalidated", "Invalidated"], ["undecided", "Open"]];
  const headers: Array<[string, string, CSSProperties["justifyContent"]]> = [
    ["date", "DATE", "flex-start"], ["ticker", "TICKER", "flex-start"], ["score", "SCORE", "flex-end"],
    ["close", "CLOSE", "flex-end"], ["invalidation", "INVALID.", "flex-end"], ["target", "TARGET", "flex-end"],
    ["rr", "R:R", "flex-end"], ["outcome", "OUTCOME", "flex-start"],
  ];

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <Link href="/screener" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "1px solid var(--border)", borderRadius: 10, color: "var(--muted)", fontSize: 12, fontWeight: 700, textDecoration: "none" }}>‹ Screener</Link>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Past Setups</h1>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 9px" }}>FORWARD OUTCOMES</span>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ flex: 1, minWidth: 150, ...CARD, padding: "15px 18px" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)" }}>{s.label}</div>
            <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: s.color, marginTop: 4 }}>{s.value}</div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{s.note}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>PUBLISHED SETUPS</span>
        <div style={{ flex: 1 }} />
        {filters.map(([k, label]) => {
          const on = filter === k;
          return (
            <button key={k} type="button" onClick={() => setFilter(k)} style={{ fontSize: 10.5, fontWeight: 700, padding: "5px 11px", borderRadius: 8, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--muted)", cursor: "pointer" }}>{label} {counts[k] || 0}</button>
          );
        })}
      </div>

      <div style={{ ...CARD, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 920 }}>
            <div style={{ position: "sticky", top: 0, zIndex: 10, display: "grid", gridTemplateColumns: GRID, background: "var(--soft)", borderBottom: "1px solid var(--border)" }}>
              {headers.map(([col, label, justify]) => (
                <button key={col} type="button" onClick={() => setSort(col)} style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: justify, padding: "11px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 9, fontWeight: 700, letterSpacing: ".06em", color: sortCol === col ? "var(--text)" : "var(--faint)" }}>
                  {label}<span style={{ color: "var(--accent)" }}>{sortCol === col ? (sortDir === "desc" ? "▼" : "▲") : ""}</span>
                </button>
              ))}
            </div>
            {doc && !rows.length ? (
              <div style={{ padding: 44, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>No archived setups {filter === "all" ? "yet — outcomes accumulate as the daily pipeline publishes new sessions" : `with outcome "${filter}"`}.</div>
            ) : null}
            {rows.map((e) => {
              const m = outMeta(e.outcome);
              const scoreColor = e.score >= 70 ? "var(--up)" : e.score >= 55 ? "var(--flat)" : "var(--down)";
              return (
                <div key={`${e.date}-${e.ticker}`} role="button" tabIndex={0} onClick={() => openTicker(e.ticker)} onKeyDown={(ev) => { if (ev.key === "Enter") openTicker(e.ticker); }} style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", borderBottom: "1px solid var(--hair)", color: "var(--text)", cursor: "pointer" }}>
                  <div style={{ padding: "10px 12px", fontFamily: MONO, fontSize: 11, color: "var(--muted)" }}>{e.date}</div>
                  <div style={{ padding: "10px 12px", fontFamily: MONO, fontSize: 13, fontWeight: 800 }}>{e.ticker}</div>
                  <div style={{ padding: "10px 12px", textAlign: "right" }}><span style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: 800, color: scoreColor }}>{e.score}</span></div>
                  <div style={{ padding: "10px 12px", textAlign: "right", fontFamily: MONO, fontSize: 11 }}>{formatPrice(e.close)}</div>
                  <div style={{ padding: "10px 12px", textAlign: "right", fontFamily: MONO, fontSize: 11, color: "var(--down)" }}>{formatPrice(e.invalidation)}</div>
                  <div style={{ padding: "10px 12px", textAlign: "right", fontFamily: MONO, fontSize: 11, color: "var(--up)" }}>{formatPrice(e.target)}</div>
                  <div style={{ padding: "10px 12px", textAlign: "right", fontFamily: MONO, fontSize: 11.5, fontWeight: 800, color: "var(--accent)" }}>{rrOf(e).toFixed(1)}×</div>
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
      <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.5, maxWidth: 820, marginTop: 14 }}>
        {doc?.note ? `${doc.note} ` : ""}Real published-setup log (setups-history.json). Blue = reached target, red = invalidated, gray = still open. Small samples early on — analytics, not advice.
      </div>
    </section>
  );
}
