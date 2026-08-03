"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { formatPercent, formatPrice } from "@/lib/format/number";
import {
  CONTEXT_BY_KEY,
  CONTEXT_GROUPS,
  KONGLO_OPTIONS,
  LIQUIDITY_OPTIONS,
  SECTOR_OPTIONS,
  SETUPS,
  loadHistory,
  loadUniverse,
  passLiquidity,
  setupByKey,
  soloCounts,
  type Cell,
  type HistoryDoc,
  type Tone,
  type Universe,
  type UniverseRow,
} from "@/lib/data/screenerUniverse";

const MONO = "var(--mono, var(--font-mono))";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))" };

const PRESETS_KEY = "idxr:screenerPresets";
const GRID = "132px 156px 1fr 1fr 1fr 1fr 78px 78px 78px 58px 62px";

type Mode = "preset" | "custom";
type Conf = "AND" | "OR";
type Dir = "bull" | "bear";
type SavedPreset = {
  id: string;
  name: string;
  mode: Mode;
  selectedSetups: string[];
  setupDir: Record<string, Dir>;
  conf: Conf;
  contextConds: string[];
  contextJoin: Conf;
};

function toneColor(t: Tone): string {
  return t === "up" ? "var(--up)" : t === "down" ? "var(--down)" : "var(--flat)";
}

function readPresets(): SavedPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRESETS_KEY) || "[]");
    return Array.isArray(parsed) ? (parsed as SavedPreset[]) : [];
  } catch {
    return [];
  }
}

export function ScreenerPage() {
  const { marketDate, openTicker } = useApp();
  const [universe, setUniverse] = useState<Universe | null>(null);
  const [history, setHistory] = useState<HistoryDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("preset");
  const [selectedSetups, setSelectedSetups] = useState<string[]>(["ema_trend"]);
  const [setupDir, setSetupDir] = useState<Record<string, Dir>>({});
  const [conf, setConf] = useState<Conf>("AND");
  const [contextConds, setContextConds] = useState<string[]>([]);
  const [contextJoin, setContextJoin] = useState<Conf>("AND");
  const [fTicker, setFTicker] = useState("");
  const [fSector, setFSector] = useState("");
  const [fLiq, setFLiq] = useState("");
  const [sortCol, setSortCol] = useState("fresh");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showN, setShowN] = useState(25);
  const [page, setPage] = useState(0);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);

  useEffect(() => setSavedPresets(readPresets()), []);

  useEffect(() => {
    if (!marketDate) return;
    let cancelled = false;
    setUniverse(null);
    setError(null);
    loadUniverse(marketDate)
      .then((u) => !cancelled && setUniverse(u))
      .catch(() => !cancelled && setError(`No screener universe for ${marketDate} — the workbook is published on the daily pipeline; older dates may not have one.`));
    return () => {
      cancelled = true;
    };
  }, [marketDate]);

  useEffect(() => {
    loadHistory().then(setHistory).catch(() => setHistory(null));
  }, []);

  const rows = universe?.rows ?? [];
  const solo = useMemo(() => soloCounts(rows), [rows]);

  // ── matching ──
  const passGeneral = useCallback(
    (r: UniverseRow) => {
      if (fTicker && !r.ticker.toLowerCase().includes(fTicker.toLowerCase())) return false;
      if (fSector && r.sectorCode !== fSector) return false;
      if (!passLiquidity(r, fLiq)) return false;
      return true;
    },
    [fTicker, fSector, fLiq],
  );

  const filtered = useMemo(() => {
    let out = rows.filter(passGeneral);
    if (mode === "preset") {
      if (selectedSetups.length) {
        out = out.filter((r) => {
          const tests = selectedSetups.map((k) => {
            const dir = setupDir[k] || "bull";
            const s = setupByKey(k);
            if (!s) return false;
            return dir === "bear" && s.hasBear ? r.setupsBear.includes(k) : r.setupsMatched.includes(k);
          });
          return conf === "AND" ? tests.every(Boolean) : tests.some(Boolean);
        });
      }
    } else {
      const conds = contextConds.map((k) => CONTEXT_BY_KEY[k]).filter(Boolean);
      if (conds.length) {
        out = out.filter((r) => {
          const tests = conds.map((c) => {
            try {
              return c.test(r);
            } catch {
              return false;
            }
          });
          return contextJoin === "AND" ? tests.every(Boolean) : tests.some(Boolean);
        });
      }
    }
    return out;
  }, [rows, passGeneral, mode, selectedSetups, setupDir, conf, contextConds, contextJoin]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const cellSort = (c: Cell) => (c.available ? c.sort : 0);
    const key = (r: UniverseRow): number | string => {
      switch (sortCol) {
        case "ticker": return r.ticker;
        case "setup": return r.setupsMatched.length;
        case "trend": return cellSort(r.cellTrend);
        case "structure": return cellSort(r.cellStructure);
        case "vwap": return cellSort(r.cellVwap);
        case "liquidity": return cellSort(r.cellLiquidity);
        case "entry": return r.entry || 0;
        case "invalid": return r.invalidation || 0;
        case "target": return r.target || 0;
        case "rr": return r.rr || 0;
        case "chg": return r.chg;
        default: return r.freshRank;
      }
    };
    return filtered.slice().sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (typeof ka === "string") return ka.localeCompare(kb as string) * dir;
      return ((ka as number) - (kb as number)) * dir;
    });
  }, [filtered, sortCol, sortDir]);

  const matchCount = sorted.length;
  const pages = Math.max(1, Math.ceil(matchCount / showN));
  const start = page * showN;
  const pageRows = sorted.slice(start, start + showN);

  // reset to first page when the result set changes size out from under us
  useEffect(() => {
    setPage(0);
  }, [mode, selectedSetups, setupDir, conf, contextConds, contextJoin, fTicker, fSector, fLiq, showN]);

  // ── handlers ──
  const toggleSetup = (k: string) =>
    setSelectedSetups((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const setDir = (k: string, d: Dir) => {
    setSetupDir((m) => ({ ...m, [k]: d }));
    setSelectedSetups((s) => (s.includes(k) ? s : [...s, k]));
  };
  const setSort = (col: string) => {
    if (sortCol === col && sortDir === "desc") setSortDir("asc");
    else {
      setSortCol(col);
      setSortDir("desc");
    }
  };
  const addContext = (key: string) => key && setContextConds((c) => (c.includes(key) ? c : [...c, key]));
  const removeContext = (key: string) => setContextConds((c) => c.filter((x) => x !== key));

  const savePreset = () => {
    const name = typeof window !== "undefined" ? window.prompt("Preset name:", mode === "preset" ? "My confluence" : "My custom setup") : null;
    if (!name) return;
    const p: SavedPreset = { id: `p${Date.now()}`, name, mode, selectedSetups, setupDir, conf, contextConds, contextJoin };
    const next = [...savedPresets.filter((x) => x.name !== name), p];
    try {
      window.localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    } catch {
      /* localStorage unavailable — preset is session-only */
    }
    setSavedPresets(next);
  };
  const loadPreset = (id: string) => {
    const p = savedPresets.find((x) => x.id === id);
    if (!p) return;
    setMode(p.mode);
    setSelectedSetups(p.selectedSetups || []);
    setSetupDir(p.setupDir || {});
    setConf(p.conf || "AND");
    setContextConds(p.contextConds || []);
    setContextJoin(p.contextJoin || "AND");
  };

  const csv = () => {
    const head = ["Ticker", "Sector", "Setups", "Trend", "Structure", "VWAP", "Liquidity", "Entry", "Invalid", "Target", "RR", "Chg%"];
    const esc = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const cell = (c: Cell) => (c.available ? `${c.label} (${c.val})` : "no data");
    const lines = sorted.map((r) =>
      [
        r.ticker, r.sectorLabel, r.setupsMatched.join("|") || "-",
        cell(r.cellTrend), cell(r.cellStructure), cell(r.cellVwap), cell(r.cellLiquidity),
        r.entry ?? "", r.invalidation ?? "", r.target ?? "", r.rr ?? "", (r.chg * 100).toFixed(2),
      ].map(esc).join(","),
    );
    const blob = new Blob([`${head.map(esc).join(",")}\n${lines.join("\n")}`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `idx-setups-${universe?.marketDate || marketDate}.csv`;
    a.click();
  };

  // ── derived view data ──
  const wHit = history?.summary.hitRate ?? null;
  const hist = {
    published: history?.summary.total ?? 0,
    decided: history?.summary.decided ?? 0,
    hitRate: wHit == null ? "—" : `${Math.round(wHit * 100)}%`,
    hitColor: wHit == null ? "var(--faint)" : wHit >= 0.5 ? "var(--up)" : wHit >= 0.4 ? "var(--flat)" : "var(--down)",
  };

  const pills: Array<{ label: string; color: string; bg: string; border: string; onRemove: () => void }> = [];
  if (mode === "preset") {
    selectedSetups.forEach((k) => {
      const s = setupByKey(k);
      if (!s) return;
      const bear = s.hasBear && (setupDir[k] || "bull") === "bear";
      pills.push({ label: s.label + (s.hasBear ? ` · ${bear ? "bear" : "bull"}` : ""), color: bear ? "var(--down)" : "var(--up)", bg: bear ? "var(--downSoft)" : "var(--upSoft)", border: "transparent", onRemove: () => toggleSetup(k) });
    });
  } else {
    contextConds.forEach((k) => {
      const c = CONTEXT_BY_KEY[k];
      if (c) pills.push({ label: c.label, color: "var(--accent)", bg: "var(--accentSoft)", border: "var(--accent-border)", onRemove: () => removeContext(k) });
    });
  }
  if (fSector) {
    const so = SECTOR_OPTIONS.find((x) => x.v === fSector);
    pills.push({ label: `Sector: ${so ? so.label : fSector}`, color: "var(--muted)", bg: "var(--soft)", border: "var(--border)", onRemove: () => setFSector("") });
  }
  if (fLiq) {
    const lo = LIQUIDITY_OPTIONS.find((x) => x.v === fLiq);
    pills.push({ label: lo ? lo.label : fLiq, color: "var(--muted)", bg: "var(--soft)", border: "var(--border)", onRemove: () => setFLiq("") });
  }
  if (fTicker) pills.push({ label: `Ticker: "${fTicker}"`, color: "var(--muted)", bg: "var(--soft)", border: "var(--border)", onRemove: () => setFTicker("") });

  const headers: Array<[string, string, CSSProperties["justifyContent"], boolean]> = [
    ["ticker", "TICKER", "flex-start", true],
    ["setup", "SETUP", "flex-start", false],
    ["trend", "TREND", "flex-start", false],
    ["structure", "STRUCTURE", "flex-start", false],
    ["vwap", "VWAP", "flex-start", false],
    ["liquidity", "LIQUIDITY", "flex-start", false],
    ["entry", "ENTRY", "flex-end", false],
    ["invalid", "INVALID.", "flex-end", false],
    ["target", "TARGET", "flex-end", false],
    ["rr", "R:R", "flex-end", false],
    ["chg", "CHG", "flex-end", false],
  ];

  const addOptions = CONTEXT_GROUPS.map((g) => ({
    family: g.family,
    opts: g.conds.filter((c) => !contextConds.includes(c.key)).map((c) => ({ key: c.key, label: c.label + (c.real === false ? " · no data" : c.real === "sparse" ? " · engine only" : "") })),
  })).filter((g) => g.opts.length);

  const total = universe?.totalUniverse ?? 0;

  return (
    <section>
      {/* title */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-.01em" }}>Setups Screener</h1>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 9px" }}>CONFLUENCE</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 11.5, color: "var(--faint)" }}>
            Matching <strong style={{ color: "var(--text)", fontFamily: MONO }}>{matchCount}</strong> of {total} · scanned {universe?.scanned ?? 0} · {universe?.marketDate || marketDate}
          </span>
        </div>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13.5, maxWidth: 760, lineHeight: 1.5 }}>
          Pick the setups you trade or build a custom context — they combine into a confluence screen over the real workbook. Every cell is an interpreted judgment from a real field; hover for the raw value.
        </p>
      </div>

      {error ? <div style={{ ...CARD, padding: "16px 18px", color: "var(--muted)", fontSize: 13 }}>{error}</div> : null}

      {/* mode tabs + presets */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 4, ...CARD, borderRadius: 11, padding: 4 }}>
          {([["preset", "Preset Setups", "◰"], ["custom", "Custom Builder", "⚙"]] as const).map(([k, label, icon]) => {
            const on = mode === k;
            return (
              <button key={k} type="button" onClick={() => setMode(k)} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, fontWeight: 700, padding: "7px 15px", borderRadius: 8, border: "none", cursor: "pointer", background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--muted)" }}>
                {icon} {label}
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1 }} />
        {savedPresets.length ? (
          <select onChange={(e) => e.target.value && loadPreset(e.target.value)} defaultValue="" style={{ fontSize: 11.5, fontWeight: 600, color: "var(--muted)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 9, padding: "7px 10px", cursor: "pointer" }}>
            <option value="">Saved presets…</option>
            {savedPresets.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        ) : null}
        <button type="button" onClick={savePreset} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 9, padding: "7px 13px", cursor: "pointer" }}>＋ Save preset</button>
      </div>

      {/* general filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, ...CARD, borderRadius: 10, padding: "7px 11px" }}>
          <span style={{ color: "var(--faint)", fontSize: 13 }}>⌕</span>
          <input value={fTicker} onChange={(e) => setFTicker(e.target.value)} placeholder="Ticker…" aria-label="Filter by ticker" style={{ border: "none", outline: "none", background: "transparent", fontFamily: MONO, fontSize: 12, color: "var(--text)", width: 120 }} />
        </div>
        <select value={fSector} onChange={(e) => setFSector(e.target.value)} aria-label="Filter by sector" style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 11px", cursor: "pointer" }}>
          {SECTOR_OPTIONS.map((o) => (<option key={o.v} value={o.v}>{o.label}</option>))}
        </select>
        <select disabled title="No konglomerate-group column in the data" aria-label="Konglomerate group (no data)" style={{ fontSize: 12, fontWeight: 600, color: "var(--faint)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 11px", cursor: "not-allowed" }}>
          {KONGLO_OPTIONS.map((o) => (<option key={o.v} value={o.v}>{o.label}</option>))}
        </select>
        <select value={fLiq} onChange={(e) => setFLiq(e.target.value)} aria-label="Filter by liquidity" style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 11px", cursor: "pointer" }}>
          {LIQUIDITY_OPTIONS.map((o) => (<option key={o.v} value={o.v}>{o.label}</option>))}
        </select>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: "var(--faint)" }}>Sector &amp; liquidity are real; konglo groups are not in the data.</span>
      </div>

      {/* Past Setups card → dedicated page */}
      <a href="/screener/history" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", ...CARD, padding: "14px 18px", marginBottom: 16, textDecoration: "none", color: "var(--text)" }}>
        <span style={{ width: 34, height: 34, flex: "none", borderRadius: 9, background: "var(--accentSoft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>
        </span>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 800 }}>Past Setups · Forward Outcomes</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
            <strong style={{ fontFamily: MONO, color: "var(--text)" }}>{hist.published}</strong> published · <strong style={{ fontFamily: MONO, color: "var(--text)" }}>{hist.decided}</strong> decided · hit-rate <strong style={{ fontFamily: MONO, color: hist.hitColor }}>{hist.hitRate}</strong>
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "6px 12px" }}>Open full history →</span>
      </a>

      {/* (A) preset library */}
      {mode === "preset" ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>ENTRY SETUPS · MULTI-SELECT</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>pick the setups you trade — they combine into a confluence screen</span>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--faint)" }}>Combine</span>
              <div style={{ display: "flex", gap: 3, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 8, padding: 3 }}>
                {(["AND", "OR"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setConf(c)} title={c === "AND" ? "All selected setups must match" : "Any selected setup matches"} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "4px 11px", borderRadius: 6, border: "none", cursor: "pointer", background: conf === c ? "var(--accent)" : "transparent", color: conf === c ? "#fff" : "var(--muted)" }}>{c}</button>
                ))}
              </div>
              {selectedSetups.length ? (
                <button type="button" onClick={() => setSelectedSetups([])} style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted)", background: "transparent", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>Clear</button>
              ) : null}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(232px,1fr))", gap: 11, marginBottom: 16 }}>
            {SETUPS.map((s) => {
              const on = selectedSetups.includes(s.key);
              const dir = setupDir[s.key] || "bull";
              const cnt = solo[s.key] ? (dir === "bear" ? solo[s.key].bear : solo[s.key].bull) : 0;
              return (
                <div key={s.key} role="button" tabIndex={0} aria-pressed={on} onClick={() => toggleSetup(s.key)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSetup(s.key); } }} style={{ border: `1.5px solid ${on ? "var(--accent-border)" : "var(--border)"}`, background: on ? "var(--accentSoft)" : "var(--panel)", borderRadius: 13, padding: "13px 14px", boxShadow: "var(--sh, var(--shadow))", cursor: "pointer" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
                    <span style={{ width: 30, height: 30, flex: "none", borderRadius: 9, background: on ? "var(--accent)" : "var(--soft)", color: on ? "#fff" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }} aria-hidden>{s.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-.01em" }}>{s.label}{s.inferred ? <span title="Inferred — no dedicated workbook column" style={{ marginLeft: 5, fontSize: 8.5, fontWeight: 700, color: "var(--faint)" }}>≈</span> : null}</div>
                      <div style={{ fontFamily: MONO, fontSize: 10, color: cnt ? "var(--accent)" : "var(--faint)", fontWeight: 700 }}>{cnt} {cnt === 1 ? "ticker" : "tickers"} today</div>
                    </div>
                    <span style={{ width: 20, height: 20, flex: "none", borderRadius: 6, border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12 }} aria-hidden>{on ? "✓" : ""}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)", lineHeight: 1.4, minHeight: 29 }}>{s.req}</div>
                  {s.hasBear ? (
                    <div style={{ display: "flex", gap: 3, marginTop: 9 }} onClick={(e) => e.stopPropagation()}>
                      {(["bull", "bear"] as const).map((d) => (
                        <button key={d} type="button" onClick={() => setDir(s.key, d)} style={{ flex: 1, fontSize: 9.5, fontWeight: 700, padding: "4px 6px", borderRadius: 6, border: `1px solid ${dir === d ? "transparent" : "var(--border)"}`, background: dir === d ? (d === "bull" ? "var(--upSoft)" : "var(--downSoft)") : "transparent", color: dir === d ? (d === "bull" ? "var(--up)" : "var(--down)") : "var(--muted)", cursor: "pointer" }}>{d === "bull" ? "Bullish" : "Bearish"}</button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {/* (B) custom builder */}
      {mode === "custom" ? (
        <div style={{ ...CARD, padding: "16px 18px", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>CUSTOM SETUP · PICK CONTEXT STATES</span>
            <span style={{ fontSize: 10.5, color: "var(--muted)" }}>choose plain-language conditions — they combine into your screen</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--faint)" }}>Join</span>
            <div style={{ display: "flex", gap: 3, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 8, padding: 3 }}>
              {(["AND", "OR"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setContextJoin(c)} style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, padding: "4px 11px", borderRadius: 6, border: "none", cursor: "pointer", background: contextJoin === c ? "var(--accent)" : "transparent", color: contextJoin === c ? "#fff" : "var(--muted)" }}>{c}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <select value="" onChange={(e) => addContext(e.target.value)} aria-label="Add a condition" style={{ fontSize: 12, fontWeight: 600, background: "var(--panel)", border: "1px solid var(--accent-border)", borderRadius: 9, padding: "8px 11px", minWidth: 250, color: "var(--accent)", cursor: "pointer" }}>
              <option value="">＋ Add a condition…</option>
              {addOptions.map((g) => (
                <optgroup key={g.family} label={g.family}>
                  {g.opts.map((o) => (<option key={o.key} value={o.key}>{o.label}</option>))}
                </optgroup>
              ))}
            </select>
            {contextConds.length ? (
              <span style={{ fontSize: 11, color: "var(--muted)" }}>matches <strong style={{ fontFamily: MONO, color: "var(--text)" }}>{matchCount}</strong> tickers</span>
            ) : (
              <span style={{ fontSize: 11, color: "var(--faint)" }}>No conditions yet — showing the full scanned universe.</span>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
            {contextConds.map((k) => {
              const c = CONTEXT_BY_KEY[k];
              if (!c) return null;
              const nd = c.real === false;
              return (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, color: nd ? "var(--flat)" : "var(--accent)", background: nd ? "var(--flatSoft, var(--soft))" : "var(--accentSoft)", border: `1px solid ${nd ? "var(--border)" : "var(--accent-border)"}`, borderRadius: 999, padding: "5px 7px 5px 12px" }}>
                  {c.family} · {c.label}
                  {nd ? <span style={{ fontSize: 9, fontWeight: 700, color: "var(--flat)" }}>no data</span> : null}
                  <button type="button" onClick={() => removeContext(k)} aria-label={`Remove ${c.label}`} style={{ width: 17, height: 17, borderRadius: "50%", border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>
                </span>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 11 }}>Fundamental states are detail-page only → tagged &ldquo;no data&rdquo; and never match at screen scope. Ownership is a labelled KSEI proxy.</div>
        </div>
      ) : null}

      {/* pills + toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 12 }}>
        {pills.length ? (
          pills.map((p, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: p.color, background: p.bg, border: `1px solid ${p.border}`, borderRadius: 999, padding: "4px 6px 4px 11px" }}>
              {p.label}
              <button type="button" onClick={p.onRemove} aria-label={`Remove ${p.label}`} style={{ width: 16, height: 16, borderRadius: "50%", border: "none", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 12, lineHeight: 1 }}>×</button>
            </span>
          ))
        ) : (
          <span style={{ fontSize: 11, color: "var(--faint)" }}>No filters — showing the full scanned universe, freshest signals first.</span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: "var(--muted)", fontFamily: MONO }}><strong style={{ color: "var(--text)" }}>{matchCount}</strong> of {total}</span>
        <select value={showN} onChange={(e) => setShowN(Number(e.target.value))} aria-label="Rows per page" style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 9px", cursor: "pointer" }}>
          {[25, 50, 100, 250].map((n) => (<option key={n} value={n}>Show {n}</option>))}
        </select>
        <button type="button" onClick={csv} style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>⭳ CSV</button>
      </div>

      {/* results table */}
      <div style={{ ...CARD, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 1240 }}>
            <div style={{ position: "sticky", top: 0, zIndex: 20, display: "grid", gridTemplateColumns: GRID, background: "var(--soft)", borderBottom: "1px solid var(--border)" }}>
              {headers.map(([col, label, justify, sticky]) => (
                <button key={col} type="button" onClick={() => setSort(col)} style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: justify, padding: "10px 12px", border: "none", background: sticky ? "var(--soft)" : "transparent", cursor: "pointer", fontSize: 9, fontWeight: 700, letterSpacing: ".06em", color: sortCol === col ? "var(--text)" : "var(--faint)", textAlign: "left", ...(sticky ? { position: "sticky", left: 0, zIndex: 6 } : {}) }}>
                  {label}<span style={{ color: "var(--accent)" }}>{sortCol === col ? (sortDir === "desc" ? "▼" : "▲") : ""}</span>
                </button>
              ))}
            </div>
            {universe && !pageRows.length ? (
              <div style={{ padding: 44, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>No tickers matched this filter on the market date ({universe.marketDate}). Loosen a condition or switch AND → OR.</div>
            ) : null}
            {!universe && !error ? (
              <div style={{ padding: 44, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>Loading the workbook universe…</div>
            ) : null}
            {pageRows.map((r) => {
              const rowBg = r.hasEngineSetup ? "var(--accentSoft)" : "var(--panel)";
              const signals = [r.cellTrend, r.cellStructure, r.cellVwap, r.cellLiquidity];
              return (
                <div key={r.ticker} role="button" tabIndex={0} onClick={() => openTicker(r.ticker)} onKeyDown={(e) => { if (e.key === "Enter") openTicker(r.ticker); }} style={{ display: "grid", gridTemplateColumns: GRID, borderBottom: "1px solid var(--hair)", color: "var(--text)", background: rowBg, cursor: "pointer" }}>
                  <div style={{ position: "sticky", left: 0, zIndex: 5, background: rowBg, padding: "9px 12px", borderRight: "1px solid var(--hair)" }}>
                    <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800 }}>{r.ticker}</div>
                    <div style={{ fontSize: 9, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sectorLabel}</div>
                  </div>
                  <div style={{ padding: "9px 12px", display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                    {r.setupsMatched.slice(0, 3).map((k) => {
                      const s = setupByKey(k);
                      return <span key={k} title={s?.label} style={{ fontSize: 9, fontWeight: 700, color: "var(--up)", background: "var(--upSoft)", borderRadius: 5, padding: "2px 6px", whiteSpace: "nowrap" }}>{s ? s.label.split(" ")[0] : k}</span>;
                    })}
                    {!r.setupsMatched.length ? <span style={{ fontSize: 9.5, color: "var(--faint)" }}>—</span> : null}
                  </div>
                  {signals.map((c, i) => (
                    <div key={i} title={c.available ? c.raw : "no data"} style={{ padding: "9px 12px" }}>
                      {c.available ? (
                        <>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: toneColor(c.tone), flex: "none" }} />
                            <span style={{ fontSize: 11, fontWeight: 600, color: toneColor(c.tone), lineHeight: 1.25 }}>{c.tone === "up" ? "▲ " : c.tone === "down" ? "▼ " : ""}{c.label}</span>
                          </div>
                          <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--faint)", marginTop: 1 }}>{c.val}{c.proxy ? " · proxy" : ""}</div>
                        </>
                      ) : (
                        <span style={{ fontSize: 10, color: "var(--faint)", fontStyle: "italic" }}>no data</span>
                      )}
                    </div>
                  ))}
                  <div style={{ padding: "9px 8px", textAlign: "right" }}><span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: r.entry == null ? "var(--faint)" : "var(--muted)" }}>{r.entry == null ? "—" : formatPrice(r.entry)}</span></div>
                  <div style={{ padding: "9px 8px", textAlign: "right" }}><span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: r.invalidation == null ? "var(--faint)" : "var(--down)" }}>{r.invalidation == null ? "—" : formatPrice(r.invalidation)}</span></div>
                  <div style={{ padding: "9px 8px", textAlign: "right" }}><span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: r.target == null ? "var(--faint)" : "var(--up)" }}>{r.target == null ? "—" : formatPrice(r.target)}</span></div>
                  <div style={{ padding: "9px 8px", textAlign: "right" }}><span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: (r.rr || 0) >= 2 ? "var(--up)" : "var(--muted)" }}>{r.rr == null ? "—" : `${r.rr.toFixed(1)}×`}</span></div>
                  <div style={{ padding: "9px 8px", textAlign: "right" }}><span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: r.chg > 0 ? "var(--up)" : r.chg < 0 ? "var(--down)" : "var(--flat)" }}>{r.chg > 0 ? "▲ " : r.chg < 0 ? "▼ " : ""}{formatPercent(r.chg)}</span></div>
                </div>
              );
            })}
          </div>
        </div>
        {matchCount > showN ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderTop: "1px solid var(--border)" }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{matchCount ? `${start + 1}–${Math.min(start + showN, matchCount)} of ${matchCount}` : "0"}</span>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={() => setPage((p) => Math.max(0, p - 1))} style={{ fontSize: 11, fontWeight: 700, color: page > 0 ? "var(--text)" : "var(--faint)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>‹ Prev</button>
            <span style={{ fontSize: 11, fontFamily: MONO, color: "var(--muted)" }}>{page + 1} / {pages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} style={{ fontSize: 11, fontWeight: 700, color: page < pages - 1 ? "var(--text)" : "var(--faint)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Next ›</button>
          </div>
        ) : null}
      </div>

      <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.5, maxWidth: 900, marginTop: 14 }}>
        Real IDX workbook · {universe?.marketDate || marketDate}. Every cell is an interpreted judgment from real fields — hover for the raw value. Blue = bullish/good, red = bearish/bad, gray = neutral. Ownership/flow uses KSEI foreign/local as a labelled proxy — broker-level buy/sell concentration does not exist in the data and is never invented. Missing fields render an explicit &ldquo;no data&rdquo;.
      </div>
    </section>
  );
}
