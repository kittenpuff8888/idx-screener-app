"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { fetchJson } from "@/lib/data/client";
import { formatNumber, formatPercent } from "@/lib/format/number";
import {
  buildSetupRows, SETUPS, CONTEXT_GROUPS, CONTEXT_BY_KEY, SECTOR_OPTIONS, LIQUIDITY_OPTIONS,
  passLiquidity, type SetupRow, type Cell,
} from "@/lib/data/screenerSetups";

const MONO = "var(--font-mono)";
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const toneColor = (t?: string) => (t === "up" ? "var(--up)" : t === "down" ? "var(--down)" : "var(--muted)");
const chgColor = (v: number) => (v > 0 ? "var(--up)" : v < 0 ? "var(--down)" : "var(--muted)");

type EngineSetupsDoc = { setups?: Array<{ ticker: string; score?: number; isRecentIpo?: boolean; medianValueTraded20?: number; kseiFootprint?: { available?: boolean; netDeltaPP?: number; accumulation?: boolean } }> };

/** One interpreted signal cell — plain-language label + value, or an explicit "no data". */
function SignalCell({ cell }: { cell: Cell }) {
  if (!cell.available) return <span style={{ fontSize: 11, color: "var(--faint)" }}>— no data</span>;
  return (
    <span title={cell.raw} style={{ display: "inline-flex", flexDirection: "column", lineHeight: 1.25 }}>
      <span style={{ fontSize: 11.5, fontWeight: 600, color: toneColor(cell.tone) }}>{cell.label}{cell.proxy ? <span style={{ fontSize: 8.5, fontWeight: 700, color: "var(--faint)", marginLeft: 4 }}>PROXY</span> : null}</span>
      <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--faint)" }}>{cell.val}</span>
    </span>
  );
}

const selStyle: CSSProperties = { fontSize: 11.5, fontWeight: 600, padding: "6px 10px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--soft)", color: "var(--text)", cursor: "pointer" };

export function ExplorerPage() {
  const { bundle, marketDate, openTicker, toggleWatchlist, isWatched } = useApp();
  const [engine, setEngine] = useState<EngineSetupsDoc | null>(null);

  useEffect(() => {
    if (!marketDate) return;
    fetchJson<EngineSetupsDoc>(`/data/dates/${marketDate}/setups.json`).then(setEngine).catch(() => setEngine({ setups: [] }));
  }, [marketDate]);

  const rows = useMemo(() => buildSetupRows(bundle?.screener || [], engine?.setups || []), [bundle, engine]);

  const [dir, setDir] = useState<"bull" | "bear">("bull");
  const [presets, setPresets] = useState<Set<string>>(new Set());
  const [confluence, setConfluence] = useState<"and" | "or">("and");
  const [ctx, setCtx] = useState<Set<string>>(new Set());
  const [ctxCombine, setCtxCombine] = useState<"and" | "or">("and");
  const [sector, setSector] = useState("");
  const [liquidity, setLiquidity] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, k: string) => {
    const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); setter(n);
  };
  const matchedFor = (r: SetupRow) => (dir === "bull" ? r.setupsMatched : r.setupsBear);
  const presetCount = (key: string) => rows.filter((r) => matchedFor(r).includes(key)).length;

  const filtered = useMemo(() => {
    const out = rows.filter((r) => {
      if (presets.size) {
        const hits = [...presets].map((k) => matchedFor(r).includes(k));
        if (confluence === "and" ? !hits.every(Boolean) : !hits.some(Boolean)) return false;
      }
      if (ctx.size) {
        const hits = [...ctx].map((k) => { const c = CONTEXT_BY_KEY[k]; return c && c.real !== false ? c.test(r) : false; });
        if (ctxCombine === "and" ? !hits.every(Boolean) : !hits.some(Boolean)) return false;
      }
      if (sector && r.sector !== sector) return false;
      if (!passLiquidity(r, liquidity)) return false;
      return true;
    });
    return out.sort((a, b) => b.freshRank - a.freshRank);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, presets, confluence, ctx, ctxCombine, sector, liquidity, dir]);

  return (
    <section>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-.01em" }}>Setups Screener</h1>
          <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 6, padding: "3px 8px" }}>Real IDX workbook · as of {marketDate || "—"}</span>
        </div>
        <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13, maxWidth: 720, lineHeight: 1.5 }}>
          Screen by the setup you trade, then read every cell as an interpreted signal. Nothing fabricated — absent fields show &quot;no data&quot;; KSEI flow is a labelled proxy (no broker data exists).
        </p>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["bull", "bear"] as const).map((d) => (
          <button key={d} type="button" onClick={() => setDir(d)} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em", padding: "5px 12px", borderRadius: 9, border: `1px solid ${dir === d ? "var(--accent)" : "var(--border)"}`, background: dir === d ? "var(--accent)" : "transparent", color: dir === d ? "#fff" : "var(--muted)", cursor: "pointer" }}>{d === "bull" ? "BULLISH" : "BEARISH"}</button>
        ))}
      </div>

      <div style={{ ...KICKER, marginBottom: 8 }}>ENTRY SETUPS · MULTI-SELECT</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8, marginBottom: 12 }}>
        {SETUPS.filter((s) => dir === "bull" || s.hasBear).map((s) => {
          const on = presets.has(s.key); const n = presetCount(s.key);
          return (
            <button key={s.key} type="button" onClick={() => toggle(presets, setPresets, s.key)} title={s.req}
              style={{ textAlign: "left", background: on ? "var(--accentSoft)" : "var(--panel)", border: `1px solid ${on ? "var(--accent-border)" : "var(--border)"}`, borderRadius: 12, padding: "10px 12px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontSize: 14 }}>{s.icon}</span>
                <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1 }}>{s.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: on ? "var(--accent)" : "var(--muted)" }}>{n}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".06em", padding: "1px 6px", borderRadius: 5, background: s.exact ? "var(--upSoft)" : "var(--warnSoft)", color: s.exact ? "var(--up)" : "var(--warning)" }}>{s.exact ? "EXACT" : "INFERRED"}</span>
                <span style={{ fontSize: 9.5, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.req}</span>
              </div>
            </button>
          );
        })}
      </div>

      {presets.size >= 2 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={KICKER}>CONFLUENCE</span>
          {(["and", "or"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setConfluence(m)} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "3px 10px", borderRadius: 7, border: "none", cursor: "pointer", background: confluence === m ? "var(--accentSoft)" : "var(--soft)", color: confluence === m ? "var(--accent)" : "var(--muted)" }}>{m === "and" ? "ALL (AND)" : "ANY (OR)"}</button>
          ))}
        </div>
      ) : null}

      <div style={{ marginBottom: 14 }}>
        <button type="button" onClick={() => setShowCustom((v) => !v)} style={{ ...KICKER, background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 6 }}>
          CUSTOM SETUP · PICK CONTEXT STATES {ctx.size ? <span style={{ color: "var(--accent)" }}>· {ctx.size} selected</span> : null} <span style={{ color: "var(--faint)" }}>{showCustom ? "▾" : "▸"}</span>
        </button>
        {showCustom ? (
          <div style={{ marginTop: 10, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 10.5, color: "var(--muted)" }}>Combine</span>
              {(["and", "or"] as const).map((m) => (
                <button key={m} type="button" onClick={() => setCtxCombine(m)} style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 6, border: "none", cursor: "pointer", background: ctxCombine === m ? "var(--accentSoft)" : "var(--soft)", color: ctxCombine === m ? "var(--accent)" : "var(--muted)" }}>{m.toUpperCase()}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "10px 18px" }}>
              {CONTEXT_GROUPS.map((g) => (
                <div key={g.family}>
                  <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", color: "var(--faint)", marginBottom: 6 }}>{g.family.toUpperCase()}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {g.conds.map((c) => {
                      const disabled = c.real === false; const on = ctx.has(c.key);
                      return (
                        <button key={c.key} type="button" disabled={disabled} onClick={() => toggle(ctx, setCtx, c.key)} title={disabled ? "no data at screen scope" : ""}
                          style={{ fontSize: 10.5, fontWeight: 600, padding: "4px 9px", borderRadius: 999, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, border: `1px solid ${on ? "var(--accent-border)" : "var(--border)"}`, background: on ? "var(--accentSoft)" : "transparent", color: on ? "var(--accent)" : "var(--muted)" }}>
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <select value={sector} onChange={(e) => setSector(e.target.value)} style={selStyle}>{SECTOR_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</select>
        <select value={liquidity} onChange={(e) => setLiquidity(e.target.value)} style={selStyle}>{LIQUIDITY_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}</select>
        <select disabled title="no real konglo column in the workbook" style={{ ...selStyle, opacity: 0.5 }}><option>All konglo groups — no data</option></select>
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>Matching {filtered.length}</span>
        <span style={{ fontSize: 10.5, color: "var(--faint)" }}>of {rows.length} scanned</span>
      </div>

      <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
            <thead>
              <tr style={{ color: "var(--faint)", fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", borderBottom: "1px solid var(--border)" }}>
                {["", "TICKER", "PRICE", "%CHG", "SETUPS", "TREND", "STRUCTURE", "VWAP", "LIQUIDITY", "WHO (KSEI PROXY)", "R/R"].map((h, i) => (
                  <th key={i} style={{ padding: "10px 10px 9px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((r) => (
                <tr key={r.ticker} style={{ borderTop: "1px solid var(--hair)", cursor: "pointer" }} onClick={() => openTicker(r.ticker)}>
                  <td style={{ padding: "9px 6px 9px 12px" }} onClick={(e) => { e.stopPropagation(); toggleWatchlist(r.ticker); }}>
                    <span style={{ fontSize: 13, color: isWatched(r.ticker) ? "var(--warning)" : "var(--faint)" }}>{isWatched(r.ticker) ? "★" : "☆"}</span>
                  </td>
                  <td style={{ padding: "9px 10px" }}>
                    <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12.5 }}>{r.ticker}</div>
                    <div style={{ fontSize: 9.5, color: "var(--faint)" }}>{r.sectorLabel}</div>
                  </td>
                  <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 12 }}>{r.price == null ? "—" : formatNumber(r.price, 0)}</td>
                  <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 600, color: chgColor(r.chg) }}>{formatPercent(r.chg / 100)}</td>
                  <td style={{ padding: "9px 10px" }}>
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      {matchedFor(r).length ? matchedFor(r).map((k) => { const s = SETUPS.find((x) => x.key === k)!; return <span key={k} title={s.label} style={{ fontSize: 11 }}>{s.icon}</span>; }) : <span style={{ fontSize: 10.5, color: "var(--faint)" }}>—</span>}
                    </div>
                  </td>
                  <td style={{ padding: "9px 10px" }}><SignalCell cell={r.cellTrend} /></td>
                  <td style={{ padding: "9px 10px" }}><SignalCell cell={r.cellStructure} /></td>
                  <td style={{ padding: "9px 10px" }}><SignalCell cell={r.cellVwap} /></td>
                  <td style={{ padding: "9px 10px" }}><SignalCell cell={r.cellLiquidity} /></td>
                  <td style={{ padding: "9px 10px" }}><SignalCell cell={r.cellWho} /></td>
                  <td style={{ padding: "9px 10px", fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>{r.rr == null ? "—" : r.rr.toFixed(1) + "×"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length ? <div style={{ padding: "24px", textAlign: "center", fontSize: 13, color: "var(--muted)" }}>0 tickers match — a valid, expected result.</div> : null}
      </div>

      <p style={{ marginTop: 14, fontSize: 12 }}>
        <a href="/setups/history" style={{ color: "var(--accent)", textDecoration: "none" }}>Past Setups · Forward Outcomes →</a>
      </p>
    </section>
  );
}
