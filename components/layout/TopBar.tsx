"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { DatePicker } from "./DatePicker";

// DESIGN_SPEC §5: one key app-wide. LEGACY_THEME_KEY is the pre-redesign key —
// read once so an existing user's choice survives the rename, then drop it.
const THEME_KEY = "idxr:theme";
const LEGACY_THEME_KEY = "idx-research-theme";
type Theme = "dark" | "light";

const ICTRL: React.CSSProperties = {
  width: 34,
  height: 34,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  cursor: "pointer",
  color: "var(--muted)",
  border: "1px solid var(--border)",
  background: "transparent",
};

export function TopBar() {
  const { tickerOptions, openTicker, reload, loading } = useApp();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    let stored = window.localStorage.getItem(THEME_KEY);
    if (stored !== "light" && stored !== "dark") {
      const legacy = window.localStorage.getItem(LEGACY_THEME_KEY);
      if (legacy === "light" || legacy === "dark") {
        stored = legacy;
        window.localStorage.setItem(THEME_KEY, legacy);
      }
      window.localStorage.removeItem(LEGACY_THEME_KEY);
    }
    // Default light on first visit (DESIGN_SPEC §5).
    const initial: Theme = stored === "light" || stored === "dark" ? stored : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    // Rank by relevance so an exact/prefix TICKER match (e.g. "bumi" → BUMI) leads
    // the list instead of being buried alphabetically among name matches.
    const score = (item: { ticker: string; label: string }) => {
      const t = item.ticker.toLowerCase(), l = item.label.toLowerCase();
      if (t === needle) return 0;
      if (t.startsWith(needle)) return 1;
      if (t.includes(needle)) return 2;
      if (l.startsWith(needle)) return 3;
      return 4;
    };
    return tickerOptions
      .filter((item) => item.ticker.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle))
      .sort((a, b) => score(a) - score(b) || a.ticker.localeCompare(b.ticker))
      .slice(0, 8);
  }, [query, tickerOptions]);

  function submitTicker(ticker: string) {
    openTicker(ticker);
    setQuery("");
    setFocused(false);
  }

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(THEME_KEY, next);
  }

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "var(--panel)",
        borderBottom: "1px solid var(--hair)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 22px", minHeight: 42 }}>
        {/* search */}
        <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 380 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 10, padding: "7px 11px" }}>
            <span style={{ color: "var(--faint)", fontSize: 13 }}>⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setTimeout(() => setFocused(false), 120)}
              onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) submitTicker(matches[0].ticker); }}
              placeholder={`Search ${tickerOptions.length || ""} tickers…`}
              aria-label="Search ticker"
              style={{ border: "none", background: "transparent", outline: "none", color: "var(--text)", fontFamily: "var(--mono, var(--font-mono))", fontSize: 13, width: "100%" }}
            />
          </div>
          {focused && matches.length ? (
            <div style={{ position: "absolute", top: 42, left: 0, right: 0, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 12px 30px rgba(16,19,25,.12)", overflow: "hidden", zIndex: 50 }} role="listbox">
              {matches.map((m) => (
                <button
                  key={m.ticker}
                  type="button"
                  onMouseDown={() => submitTicker(m.ticker)}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 13px", cursor: "pointer", borderBottom: "1px solid var(--border)", width: "100%", background: "transparent", border: "none", textAlign: "left" }}
                >
                  <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <span style={{ fontFamily: "var(--mono, var(--font-mono))", fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{m.ticker}</span>
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>{m.label}</span>
                  </span>
                  <span style={{ fontSize: 11, color: "var(--faint)" }}>{m.sector}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div style={{ flex: 1 }} />

        {/* market date */}
        <DatePicker />

        {/* icon controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button type="button" title="Reload data" onClick={reload} disabled={loading} style={ICTRL} aria-label="Reload data">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={loading ? { animation: "spin 1s linear infinite" } : undefined}><path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>
          </button>
          <button type="button" title="Toggle theme" onClick={toggleTheme} style={ICTRL} aria-label="Toggle theme">
            {theme === "light" ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" /></svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
            )}
          </button>
          <div title="Profile" style={{ width: 34, height: 34, borderRadius: 999, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700 }}>88</div>
        </div>
      </div>
    </header>
  );
}
