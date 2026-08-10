"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { V2Shell } from "@/components/v2/V2Shell";
import {
  betaOf, CONTEXT_BY_KEY, CONTEXT_GROUPS, fmt, LIQUIDITY_OPTIONS, KONGLO_OPTIONS,
  loadUniverse, passLiquidity, SECTOR_OPTIONS, SETUPS, type Cell, type Row, type Universe,
} from "@/lib/v2/screenerData";

// Faithful port of "2. Screener.dc.html" — same markup/logic, wired to real data
// via lib/v2/screenerData (same JSON shapes as the prototype).

const toneColor = (t?: string) => (t === "up" ? "var(--up)" : t === "down" ? "var(--down)" : "var(--flat)");

type Mode = "preset" | "custom";
type Dir = "bull" | "bear";

const GRID = "132px 156px 1fr 1fr 1fr 1fr 78px 78px 78px 58px 56px 62px";

export function ScreenerFaithful() {
  const { marketDate, watchlist, toggleWatchlist, openTicker } = useApp();
  const [u, setU] = useState<Universe | null>(null);
  const [mode, setMode] = useState<Mode>("preset");
  const [selectedSetups, setSelectedSetups] = useState<string[]>(["ema_trend"]);
  const [setupDir, setSetupDir] = useState<Record<string, Dir>>({});
  const [conf, setConf] = useState<"AND" | "OR">("AND");
  const [contextConds, setContextConds] = useState<string[]>([]);
  const [contextJoin, setContextJoin] = useState<"AND" | "OR">("AND");
  const [fTicker, setFTicker] = useState("");
  const [fSector, setFSector] = useState("");
  const [fLiq, setFLiq] = useState("");
  const [sortCol, setSortCol] = useState("fresh");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showN, setShowN] = useState(25);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!marketDate) return;
    let cancelled = false;
    loadUniverse(marketDate).then((data) => { if (!cancelled) setU(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [marketDate]);

  const setupByKey = useMemo(() => Object.fromEntries(SETUPS.map((s) => [s.key, s])), []);
  const solo = useMemo(() => {
    const out: Record<string, { bull: number; bear: number }> = {};
    if (!u) return out;
    SETUPS.forEach((s) => {
      out[s.key] = {
        bull: u.rows.reduce((n, r) => n + (r.setupsMatched.includes(s.key) ? 1 : 0), 0),
        bear: u.rows.reduce((n, r) => n + (r.setupsBear.includes(s.key) ? 1 : 0), 0),
      };
    });
    return out;
  }, [u]);

  const passGeneral = (r: Row) => {
    if (fTicker && !r.ticker.toLowerCase().includes(fTicker.toLowerCase())) return false;
    if (fSector && r.sector !== fSector) return false;
    if (!passLiquidity(r, fLiq)) return false;
    return true;
  };
  const matchSetup = (r: Row, key: string, dir: Dir) => {
    const s = setupByKey[key]; if (!s) return false;
    return dir === "bear" && s.hasBear ? r.setupsBear.includes(key) : r.setupsMatched.includes(key);
  };

  const sortedRows = useMemo(() => {
    if (!u) return [];
    let rows = u.rows.filter(passGeneral);
    if (mode === "preset") {
      if (selectedSetups.length) rows = rows.filter((r) => {
        const tests = selectedSetups.map((k) => matchSetup(r, k, setupDir[k] || "bull"));
        return conf === "AND" ? tests.every(Boolean) : tests.some(Boolean);
      });
    } else {
      const conds = contextConds.map((k) => CONTEXT_BY_KEY[k]).filter(Boolean);
      if (conds.length) rows = rows.filter((r) => {
        const tests = conds.map((c) => { try { return c.test(r); } catch { return false; } });
        return contextJoin === "AND" ? tests.every(Boolean) : tests.some(Boolean);
      });
    }
    const dir = sortDir === "asc" ? 1 : -1;
    const key = (r: Row): number | string => {
      switch (sortCol) {
        case "ticker": return r.ticker;
        case "setup": return r.setupsMatched.length;
        case "trend": return r.cellTrend.sort || 0;
        case "structure": return r.cellStructure.sort || 0;
        case "vwap": return r.cellVwap.sort || 0;
        case "liquidity": return r.cellLiquidity.sort || 0;
        case "entry": return r.entry || 0;
        case "invalid": return r.invalidation || 0;
        case "target": return r.target || 0;
        case "rr": return r.rr || 0;
        case "beta": return betaOf(r.ticker);
        case "chg": return r.chg;
        default: return r.freshRank;
      }
    };
    return rows.slice().sort((a, b) => {
      const ka = key(a), kb = key(b);
      if (typeof ka === "string") return (ka as string).localeCompare(kb as string) * dir;
      return ((ka as number) - (kb as number)) * dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [u, mode, selectedSetups, setupDir, conf, contextConds, contextJoin, fTicker, fSector, fLiq, sortCol, sortDir]);

  const setSort = (col: string) => {
    if (sortCol === col && sortDir === "desc") setSortDir("asc");
    else { setSortCol(col); setSortDir("desc"); }
  };
  const toggleSetup = (k: string) => { setSelectedSetups((s) => s.includes(k) ? s.filter((x) => x !== k) : [...s, k]); setPage(0); };
  const setDir = (k: string, d: Dir) => { setSetupDir((m) => ({ ...m, [k]: d })); setSelectedSetups((s) => s.includes(k) ? s : [...s, k]); setPage(0); };
  const addContext = (k: string) => { if (!k) return; setContextConds((c) => c.includes(k) ? c : [...c, k]); setPage(0); };
  const removeContext = (k: string) => { setContextConds((c) => c.filter((x) => x !== k)); setPage(0); };

  function csv() {
    const head = ["Ticker", "Sector", "Setups", "Trend", "Structure", "VWAP", "Liquidity", "Entry", "Invalid", "Target", "RR", "Chg%"];
    const esc = (s: unknown) => '"' + String(s == null ? "" : s).replace(/"/g, '""') + '"';
    const cell = (c: Cell) => (c && c.available ? c.label + " (" + (c.val || "") + ")" : "no data");
    const lines = sortedRows.map((r) => [r.ticker, r.sectorLabel, r.setupsMatched.join("|") || "-", cell(r.cellTrend), cell(r.cellStructure), cell(r.cellVwap), cell(r.cellLiquidity), r.entry ?? "", r.invalidation ?? "", r.target ?? "", r.rr ?? "", (r.chg * 100).toFixed(2)].map(esc).join(","));
    const blob = new Blob([head.map(esc).join(",") + "\n" + lines.join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "idx-setups-" + (u?.marketDate || "") + ".csv"; a.click();
  }

  const matchCount = sortedRows.length;
  const pages = Math.max(1, Math.ceil(matchCount / showN));
  const start = page * showN;
  const pageRows = sortedRows.slice(start, start + showN);

  const meta = (
    <>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 9px" }}>CONFLUENCE</span>
      <span style={{ fontSize: 11.5, color: "var(--faint)" }}>
        Matching <strong style={{ color: "var(--text)", fontFamily: "var(--font-mono)" }}>{matchCount}</strong> of {u?.totalUniverse ?? 0} · scanned {u?.scanned ?? 0} · EOD {u?.marketDate || marketDate}
      </span>
    </>
  );

  const btnTab = (active: boolean): CSSProperties => ({ fontSize: 12.5, fontWeight: 700, padding: "7px 15px", borderRadius: 8, border: "none", cursor: "pointer", background: active ? "var(--accent)" : "transparent", color: active ? "#fff" : "var(--muted)", display: "flex", alignItems: "center", gap: 7 });
  const miniTab = (active: boolean): CSSProperties => ({ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 700, padding: "4px 11px", borderRadius: 6, border: "none", cursor: "pointer", background: active ? "var(--accent)" : "transparent", color: active ? "#fff" : "var(--muted)" });
  const selCtl: CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--text)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 11px", cursor: "pointer", boxShadow: "var(--sh)" };

  if (!u) {
    return <V2Shell active="screener" title="Setups Screener" meta={meta}><main style={{ flex: 1, padding: "40px 26px", color: "var(--muted)" }}>Loading real screener universe…</main></V2Shell>;
  }

  const pills: Array<{ label: string; color: string; bg: string; border: string; onRemove: () => void }> = [];
  if (mode === "preset") selectedSetups.forEach((k) => { const s = setupByKey[k]; if (!s) return; const bear = s.hasBear && (setupDir[k] || "bull") === "bear"; pills.push({ label: s.label + (s.hasBear ? " · " + (bear ? "bear" : "bull") : ""), color: bear ? "var(--down)" : "var(--up)", bg: bear ? "var(--downSoft)" : "var(--upSoft)", border: "transparent", onRemove: () => toggleSetup(k) }); });
  else contextConds.forEach((k) => { const c = CONTEXT_BY_KEY[k]; pills.push({ label: c.label, color: "var(--accent)", bg: "var(--accentSoft)", border: "var(--accent-border)", onRemove: () => removeContext(k) }); });
  if (fSector) { const so = SECTOR_OPTIONS.find((x) => x.v === fSector); pills.push({ label: "Sector: " + (so ? so.label : fSector), color: "var(--muted)", bg: "var(--soft)", border: "var(--border)", onRemove: () => { setFSector(""); setPage(0); } }); }
  if (fLiq) { const lo = LIQUIDITY_OPTIONS.find((x) => x.v === fLiq); pills.push({ label: lo ? lo.label : fLiq, color: "var(--muted)", bg: "var(--soft)", border: "var(--border)", onRemove: () => { setFLiq(""); setPage(0); } }); }
  if (fTicker) pills.push({ label: `Ticker: “${fTicker}”`, color: "var(--muted)", bg: "var(--soft)", border: "var(--border)", onRemove: () => { setFTicker(""); setPage(0); } });

  const hcols: Array<[string, string, string, boolean]> = [
    ["ticker", "TICKER", "flex-start", true], ["setup", "SETUP", "flex-start", false], ["trend", "TREND", "flex-start", false],
    ["structure", "STRUCTURE", "flex-start", false], ["vwap", "VWAP", "flex-start", false], ["liquidity", "LIQUIDITY", "flex-start", false],
    ["entry", "ENTRY", "flex-end", false], ["invalid", "INVALID.", "flex-end", false], ["target", "TARGET", "flex-end", false],
    ["rr", "R:R", "flex-end", false], ["beta", "β IHSG", "flex-end", false], ["chg", "CHG", "flex-end", false],
  ];

  const sig = (c: Cell) => c.available
    ? { available: true, label: c.label, val: c.val, color: toneColor(c.tone), raw: c.raw || (c.proxy ? "KSEI proxy" : "") }
    : { available: false, raw: "no data" };

  return (
    <V2Shell active="screener" title="Setups Screener" meta={meta}>
      <main style={{ flex: 1, minWidth: 0, padding: "20px 26px 60px" }}>
        {/* mode tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 4, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 11, padding: 4, boxShadow: "var(--sh)" }}>
            {(["preset", "custom"] as Mode[]).map((m) => (
              <button key={m} type="button" onClick={() => { setMode(m); setPage(0); }} style={btnTab(mode === m)}>
                {m === "preset" ? "◰ Preset Setups" : "⚙ Custom Builder"}
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={csv} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 9, padding: "7px 13px", cursor: "pointer" }}>⭳ CSV</button>
        </div>

        {/* general filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 11px", boxShadow: "var(--sh)" }}>
            <span style={{ color: "var(--faint)", fontSize: 13 }}>⌕</span>
            <input value={fTicker} onChange={(e) => { setFTicker(e.target.value); setPage(0); }} placeholder="Ticker…" style={{ border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text)", width: 120 }} />
          </div>
          <select value={fSector} onChange={(e) => { setFSector(e.target.value); setPage(0); }} style={selCtl}>
            {SECTOR_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <select disabled title="No konglomerate-group column in the data" style={{ ...selCtl, color: "var(--faint)", background: "var(--soft)", cursor: "not-allowed" }}>
            {KONGLO_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <select value={fLiq} onChange={(e) => { setFLiq(e.target.value); setPage(0); }} style={selCtl}>
            {LIQUIDITY_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 10, color: "var(--faint)" }}>Sector &amp; liquidity are real; konglo groups are not in the data.</span>
        </div>

        {/* Past Setups link */}
        <a href="/screener/history" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh)", padding: "14px 18px", marginBottom: 16, textDecoration: "none", color: "var(--text)" }}>
          <span style={{ width: 34, height: 34, flex: "none", borderRadius: 9, background: "var(--accentSoft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>
          </span>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 800 }}>Past Setups · Forward Outcomes</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
              <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{u.historyDoc.summary?.total ?? u.historyDoc.entries.length}</strong> published · hit-rate{" "}
              <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{u.historyDoc.summary?.hitRate != null ? (u.historyDoc.summary.hitRate * 100).toFixed(0) + "%" : "—"}</strong>
            </div>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "6px 12px" }}>Open full history →</span>
        </a>

        {/* (A) PRESET LIBRARY */}
        {mode === "preset" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>ENTRY SETUPS · MULTI-SELECT</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>pick the setups you trade — they combine into a confluence screen</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--faint)" }}>Combine</span>
              <div style={{ display: "flex", gap: 3, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 8, padding: 3 }}>
                {(["AND", "OR"] as const).map((c) => <button key={c} type="button" onClick={() => { setConf(c); setPage(0); }} title={c === "AND" ? "All selected setups must match" : "Any selected setup matches"} style={miniTab(conf === c)}>{c}</button>)}
              </div>
              {selectedSetups.length > 0 && <button type="button" onClick={() => { setSelectedSetups([]); setPage(0); }} style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>Clear</button>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(232px,1fr))", gap: 11, marginBottom: 16 }}>
              {SETUPS.map((s) => {
                const on = selectedSetups.includes(s.key), dir = setupDir[s.key] || "bull";
                const cnt = solo[s.key] ? (dir === "bear" ? solo[s.key].bear : solo[s.key].bull) : 0;
                return (
                  <div key={s.key} onClick={() => toggleSetup(s.key)} style={{ border: `1.5px solid ${on ? "var(--accent-border)" : "var(--border)"}`, background: on ? "var(--accentSoft)" : "var(--panel)", borderRadius: 13, padding: "13px 14px", boxShadow: "var(--sh)", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                      <span style={{ width: 30, height: 30, flex: "none", borderRadius: 9, background: on ? "var(--accent)" : "var(--soft)", color: on ? "#fff" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{s.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-.01em" }}>{s.label}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: cnt ? "var(--accent)" : "var(--faint)", fontWeight: 700 }}>{cnt}{cnt === 1 ? " ticker" : " tickers"} today</div>
                      </div>
                      <span style={{ width: 20, height: 20, flex: "none", borderRadius: 6, border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12 }}>{on ? "✓" : ""}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, minHeight: 29 }}>
                      <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.4, flex: 1 }}>{s.req}</div>
                      <span title={s.basis} style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".04em", color: s.exact === false ? "var(--warn)" : "var(--up)", background: s.exact === false ? "var(--warnSoft)" : "var(--upSoft)", borderRadius: 4, padding: "2px 5px", flex: "none" }}>{s.exact === false ? "INFERRED" : "EXACT"}</span>
                    </div>
                    {s.hasBear && (
                      <div style={{ display: "flex", gap: 3, marginTop: 9 }} onClick={(e) => e.stopPropagation()}>
                        {(["bull", "bear"] as Dir[]).map((d) => (
                          <button key={d} type="button" onClick={(e) => { e.stopPropagation(); setDir(s.key, d); }} style={{ flex: 1, fontSize: 9.5, fontWeight: 700, padding: "4px 6px", borderRadius: 6, border: `1px solid ${dir === d ? "transparent" : "var(--border)"}`, background: dir === d ? (d === "bull" ? "var(--upSoft)" : "var(--downSoft)") : "transparent", color: dir === d ? (d === "bull" ? "var(--up)" : "var(--down)") : "var(--muted)", cursor: "pointer" }}>{d === "bull" ? "Bullish" : "Bearish"}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* (B) CUSTOM BUILDER */}
        {mode === "custom" && (
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh)", padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>CUSTOM SETUP · PICK CONTEXT STATES</span>
              <span style={{ fontSize: 10.5, color: "var(--muted)" }}>choose plain-language conditions — they combine into your screen</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--faint)" }}>Join</span>
              <div style={{ display: "flex", gap: 3, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 8, padding: 3 }}>
                {(["AND", "OR"] as const).map((c) => <button key={c} type="button" onClick={() => { setContextJoin(c); setPage(0); }} style={miniTab(contextJoin === c)}>{c}</button>)}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <select value="" onChange={(e) => addContext(e.target.value)} style={{ fontSize: 12, fontWeight: 600, background: "var(--panel)", border: "1px solid var(--accent-border)", borderRadius: 9, padding: "8px 11px", minWidth: 250, color: "var(--accent)", cursor: "pointer" }}>
                <option value="">＋ Add a condition…</option>
                {CONTEXT_GROUPS.map((g) => (
                  <optgroup key={g.family} label={g.family}>
                    {g.conds.filter((c) => !contextConds.includes(c.key)).map((c) => (
                      <option key={c.key} value={c.key}>{c.label + (c.real === false ? " · no data" : c.real === "sparse" ? " · engine only" : "")}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {contextConds.length > 0
                ? <span style={{ fontSize: 11, color: "var(--muted)" }}>matches <strong style={{ fontFamily: "var(--font-mono)", color: "var(--text)" }}>{matchCount}</strong> tickers</span>
                : <span style={{ fontSize: 11, color: "var(--faint)" }}>No conditions yet — showing the full scanned universe.</span>}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
              {contextConds.map((k) => { const c = CONTEXT_BY_KEY[k]; const nd = c.real === false; return (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, color: nd ? "var(--flat)" : "var(--accent)", background: nd ? "var(--flatSoft)" : "var(--accentSoft)", border: `1px solid ${nd ? "var(--border)" : "var(--accent-border)"}`, borderRadius: 999, padding: "5px 7px 5px 12px" }}>
                  {c.family + " · " + c.label}{nd && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--flat)" }}>no data</span>}
                  <button type="button" onClick={() => removeContext(k)} style={{ width: 17, height: 17, borderRadius: "50%", border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>
                </span>
              ); })}
            </div>
            <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 11 }}>Fundamental states are detail-page only → tagged “no data” and never match at screen scope. Ownership is a labelled KSEI proxy.</div>
          </div>
        )}

        {/* pills + toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 12 }}>
          {pills.length > 0
            ? pills.map((p, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: p.color, background: p.bg, border: `1px solid ${p.border}`, borderRadius: 999, padding: "4px 6px 4px 11px" }}>
                {p.label}<button type="button" onClick={p.onRemove} style={{ width: 16, height: 16, borderRadius: "50%", border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>
              </span>
            ))
            : <span style={{ fontSize: 11, color: "var(--faint)" }}>No filters — showing the full scanned universe, freshest signals first.</span>}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: "var(--muted)", fontFamily: "var(--font-mono)" }}><strong style={{ color: "var(--text)" }}>{matchCount}</strong> of {u.totalUniverse}</span>
          <select value={showN} onChange={(e) => { setShowN(+e.target.value); setPage(0); }} style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 9px", cursor: "pointer" }}>
            {[25, 50, 100, 250].map((n) => <option key={n} value={n}>Show {n}</option>)}
          </select>
          <button type="button" onClick={csv} style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>⭳ CSV</button>
        </div>

        {/* results table */}
        <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh)", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 1296 }}>
              <div style={{ position: "sticky", top: 0, zIndex: 20, display: "grid", gridTemplateColumns: GRID, background: "var(--soft)", borderBottom: "1px solid var(--border)" }}>
                {hcols.map(([col, label, justify, sticky]) => (
                  <button key={col} type="button" onClick={() => setSort(col)} style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: justify, padding: "10px 12px", border: "none", background: sticky ? "var(--soft)" : "transparent", cursor: "pointer", fontSize: 9, fontWeight: 700, letterSpacing: ".06em", color: sortCol === col ? "var(--text)" : "var(--faint)", textAlign: "left", ...(sticky ? { position: "sticky" as const, left: 0, zIndex: 6 } : {}) }}>
                    {label}<span style={{ color: "var(--accent)" }}>{sortCol === col ? (sortDir === "desc" ? "▼" : "▲") : ""}</span>
                  </button>
                ))}
              </div>
              {pageRows.length > 0 ? pageRows.map((r) => {
                const rowBg = r.hasEngineSetup ? "var(--accentSoft)" : "var(--panel)";
                const starred = watchlist.includes(r.ticker);
                const signals = [sig(r.cellTrend), sig(r.cellStructure), sig(r.cellVwap), sig(r.cellLiquidity)];
                const beta = betaOf(r.ticker);
                return (
                  <div key={r.ticker} onClick={() => openTicker(r.ticker)} style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: "1px solid var(--hair)", cursor: "pointer", color: "var(--text)", background: rowBg }}>
                    <div style={{ position: "sticky", left: 0, zIndex: 5, background: rowBg, padding: "9px 12px", borderRight: "1px solid var(--hair)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggleWatchlist(r.ticker); }} title="Toggle watchlist" style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 14, lineHeight: 1, color: starred ? "var(--warn)" : "var(--faint)", padding: 0 }}>{starred ? "★" : "☆"}</button>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800 }}>{r.ticker}</div>
                      </div>
                      <div style={{ fontSize: 9, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sectorLabel}</div>
                    </div>
                    <div style={{ padding: "9px 12px", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                      {r.setupsMatched.slice(0, 3).map((k) => { const s = setupByKey[k]; return <span key={k} title={s?.label} style={{ fontSize: 9, fontWeight: 700, color: "var(--up)", background: "var(--upSoft)", borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap" }}>{s?.label.split(" ")[0]}</span>; })}
                      {r.setupsMatched.length === 0 && <span style={{ fontSize: 9.5, color: "var(--faint)" }}>—</span>}
                    </div>
                    {signals.map((c, i) => (
                      <div key={i} title={c.raw} style={{ padding: "9px 12px" }}>
                        {c.available ? (
                          <>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: c.color, flex: "none" }} /><span style={{ fontSize: 11, fontWeight: 600, color: c.color, lineHeight: 1.25 }}>{c.label}</span></div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--faint)", marginTop: 1 }}>{c.val}</div>
                          </>
                        ) : <span style={{ fontSize: 10, color: "var(--faint)", fontStyle: "italic" }}>no data</span>}
                      </div>
                    ))}
                    <div style={{ padding: "9px 8px", textAlign: "right" }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: r.entry == null ? "var(--faint)" : "var(--muted)" }}>{r.entry == null ? "—" : fmt.price(r.entry)}</span></div>
                    <div style={{ padding: "9px 8px", textAlign: "right" }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: r.invalidation == null ? "var(--faint)" : "var(--down)" }}>{r.invalidation == null ? "—" : fmt.price(r.invalidation)}</span></div>
                    <div style={{ padding: "9px 8px", textAlign: "right" }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: r.target == null ? "var(--faint)" : "var(--up)" }}>{r.target == null ? "—" : fmt.price(r.target)}</span></div>
                    <div style={{ padding: "9px 8px", textAlign: "right" }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: (r.rr || 0) >= 2 ? "var(--up)" : "var(--muted)" }}>{r.rr == null ? "—" : r.rr.toFixed(1) + "×"}</span></div>
                    <div style={{ padding: "9px 8px", textAlign: "right" }} title="Beta vs IHSG · modelled (1y daily)"><span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: beta >= 1.2 ? "var(--warn)" : "var(--muted)" }}>{beta.toFixed(2)}</span></div>
                    <div style={{ padding: "9px 8px", textAlign: "right" }}><span style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 700, color: r.chg > 0 ? "var(--up)" : r.chg < 0 ? "var(--down)" : "var(--flat)" }}>{fmt.pct(r.chg)}</span></div>
                  </div>
                );
              }) : <div style={{ padding: 44, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>No tickers matched this filter on {u.marketDate}. Loosen a condition or switch AND → OR.</div>}
            </div>
          </div>
          {matchCount > showN && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{matchCount ? `${start + 1}–${Math.min(start + showN, matchCount)} of ${matchCount}` : "0"}</span>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} style={{ fontSize: 11, fontWeight: 700, color: page > 0 ? "var(--text)" : "var(--faint)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>‹ Prev</button>
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--muted)" }}>{page + 1} / {pages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} style={{ fontSize: 11, fontWeight: 700, color: page < pages - 1 ? "var(--text)" : "var(--faint)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Next ›</button>
            </div>
          )}
        </div>

        <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.5, maxWidth: 900, marginTop: 14 }}>
          Real IDX workbook · {u.marketDate}. Every cell is an interpreted judgment from real fields — hover for the raw value. Blue = bullish/good, red = bearish/bad, gray = neutral. <strong>Who&apos;s trading</strong> uses KSEI foreign/local flow as a labelled proxy — broker-level buy/sell does not exist in the data and is never invented. Setup predicates are tagged <strong style={{ color: "var(--up)" }}>EXACT</strong> or <strong style={{ color: "var(--warn)" }}>INFERRED</strong>. β vs IHSG is <strong style={{ color: "var(--warn)" }}>modelled</strong> (1y daily). Delayed EOD data — not investment advice.
        </div>
      </main>
    </V2Shell>
  );
}
