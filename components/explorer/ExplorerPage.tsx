"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { SkeletonCard } from "@/components/shared/SkeletonCard";
import { Provenance } from "@/components/shared/Metric";
import { ScreenerTable } from "./ScreenerTable";
import type { ScreenerRow } from "@/lib/domain/types";

const MONO = "var(--mono, var(--font-mono))";
const SEL: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: "9px 11px", fontFamily: "var(--sans, var(--font-body))", fontSize: 12.5, color: "var(--text)", outline: "none", cursor: "pointer", boxShadow: "var(--sh, var(--shadow))" };

type Chip = { id: string; label: string; test: (r: ScreenerRow) => boolean };
const CHIPS: Chip[] = [
  { id: "all", label: "All", test: () => true },
  { id: "belowvwap", label: "Below VWAP", test: (r) => /below/i.test(r.vwapZone) },
  { id: "abovevwap", label: "Above VWAP", test: (r) => /above/i.test(r.vwapZone) },
  { id: "accum", label: "Accumulating", test: (r) => /accumul/i.test(`${r.summary} ${r.smc}`) },
  { id: "distrib", label: "Distributing", test: (r) => /distribut/i.test(`${r.summary} ${r.smc}`) },
  { id: "rvol", label: "RVOL ≥ 1.2×", test: (r) => (r.rvol ?? 0) >= 1.2 },
];

export function ExplorerPage() {
  const { bundle, indexes, marketDate, loading } = useApp();
  const rows = bundle?.screener || [];
  const [search, setSearch] = useState("");
  const [sector, setSector] = useState("all");
  const [konglo, setKonglo] = useState("all");
  const [liquidity, setLiquidity] = useState("all");
  const [chip, setChip] = useState("all");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t) setChip("all");
  }, []);

  const sectorOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.idxSectorRaw, r.sector);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);
  const kongloOptions = (indexes?.groups || []).filter((g) => g.section === "KONGLO INDEX").map((g) => g.label);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const chipDef = CHIPS.find((c) => c.id === chip) || CHIPS[0];
    return rows.filter((r) => {
      if (q && !`${r.ticker} ${r.companyName}`.toLowerCase().includes(q)) return false;
      if (sector !== "all" && r.idxSectorRaw !== sector) return false;
      if (konglo !== "all" && !r.kongloGroups.includes(konglo)) return false;
      if (liquidity !== "all" && !r.liquidityCategory.toLowerCase().includes(liquidity.toLowerCase())) return false;
      if (!chipDef.test(r)) return false;
      return true;
    });
  }, [rows, search, sector, konglo, liquidity, chip]);

  const dirty = Boolean(search) || sector !== "all" || konglo !== "all" || liquidity !== "all" || chip !== "all";
  function reset() { setSearch(""); setSector("all"); setKonglo("all"); setLiquidity("all"); setChip("all"); }

  if (loading && !bundle) return <SkeletonCard />;

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 700, letterSpacing: "-.01em" }}>Screener</h1>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
            <span style={{ fontFamily: MONO, fontWeight: 600, color: "var(--text)" }}>{filtered.length}</span> of {rows.length} tickers pass · sorted by change % ↓
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: "var(--softer)", border: "1px solid var(--border)", color: "var(--muted)", padding: "8px 13px", borderRadius: 10, fontSize: 11 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--accent)", fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)" }} />Filter gates
          </span>
          <span style={{ fontFamily: MONO }}>ADTV 20D ≥ Rp5B <span style={{ color: "var(--faint)" }}>or</span> ≥ 5M shares <span style={{ color: "var(--faint)" }}>and</span> RSI ≥ 50</span>
        </div>
      </div>

      {/* toolbar */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 11px", boxShadow: "var(--sh, var(--shadow))" }}>
          <span style={{ color: "var(--faint)", fontSize: 13 }}>⌕</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Ticker…" style={{ border: "none", background: "transparent", outline: "none", color: "var(--text)", fontFamily: MONO, fontSize: 12.5, width: 84 }} />
        </div>
        <select value={sector} onChange={(e) => setSector(e.target.value)} style={SEL}>
          <option value="all">All sectors</option>
          {sectorOptions.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        <select value={konglo} onChange={(e) => setKonglo(e.target.value)} style={SEL}>
          <option value="all">All konglo groups</option>
          {kongloOptions.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <select value={liquidity} onChange={(e) => setLiquidity(e.target.value)} style={SEL}>
          <option value="all">All liquidity</option>
          <option value="High">High liquidity</option>
          <option value="Medium">Medium liquidity</option>
          <option value="Low">Low liquidity</option>
          <option value="Very Low">Very low liquidity</option>
        </select>
        <div style={{ flex: 1 }} />
        {dirty ? <button type="button" onClick={reset} style={{ fontSize: 12, color: "var(--muted)", cursor: "pointer", padding: "8px 10px", borderRadius: 9, border: "1px solid var(--border)", background: "transparent" }}>Reset</button> : null}
      </div>

      {/* quick chips */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 14 }}>
        {CHIPS.map((c) => {
          const active = chip === c.id;
          return (
            <button key={c.id} type="button" onClick={() => setChip(c.id)}
              style={{ fontSize: 12, fontWeight: 600, padding: "7px 13px", borderRadius: 999, cursor: "pointer",
                border: `1px solid ${active ? "var(--accentLine)" : "var(--border)"}`, background: active ? "var(--accentSoft)" : "var(--panel)", color: active ? "var(--accent)" : "var(--muted)" }}>
              {c.label}
            </button>
          );
        })}
      </div>

      <ScreenerTable rows={filtered} />
      <div style={{ marginTop: 10 }}><Provenance source="IDX Screener" asOf={marketDate} /></div>
    </section>
  );
}
