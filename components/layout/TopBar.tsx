"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/AppProvider";
import { DatePicker } from "./DatePicker";

const pageTitles: Record<string, [string, string]> = {
  "/dashboard": ["DASHBOARD", "Research Dashboard"],
  "/explorer": ["SIGNAL DISCOVERY", "Research Screener"],
  "/watchlist": ["WATCHLIST", "Local Watchlist"],
  "/ksei": ["KSEI OWNERSHIP", "Ownership Dashboard"],
  "/news": ["IDX TICKER NEWS", "IDX Ticker News"],
  "/advanced": ["ADVANCED", "Research Methods & Data"],
  "/": ["DASHBOARD", "Research Dashboard"],
};

const THEME_KEY = "idx-research-theme";
type Theme = "dark" | "light";

export function TopBar() {
  const pathname = usePathname();
  const { tickerOptions, openTicker, reload, loading } = useApp();
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [eyebrow, title] = pageTitles[pathname] || pageTitles["/dashboard"];

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return tickerOptions
      .filter((item) => item.ticker.toLowerCase().includes(needle) || item.label.toLowerCase().includes(needle))
      .slice(0, 8);
  }, [query, tickerOptions]);

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    // Spec §2: light is the default.
    const initial: Theme = stored === "light" || stored === "dark"
      ? stored
      : window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  function submitTicker(ticker: string) {
    openTicker(ticker);
    setQuery("");
  }

  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(THEME_KEY, next);
  }

  return (
    <header className="topbar">
      <button
        className="icon-button menu-button"
        type="button"
        aria-label="Toggle navigation"
        aria-expanded={navOpen}
        onClick={() => {
          const next = !navOpen;
          setNavOpen(next);
          document.body.classList.toggle("nav-open", next);
        }}
      >
        <span></span><span></span><span></span>
      </button>
      <div className="topbar-title">
        <span>{eyebrow}</span>
        <h1>{title}</h1>
      </div>
      <div className="topbar-actions">
        <div className="ticker-search-shell">
          <label className="ticker-command">
            <span className="command-prefix">IDX</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && matches[0]) submitTicker(matches[0].ticker);
              }}
              placeholder="Search ticker"
              aria-label="Search ticker"
              aria-controls="tickerSuggestions"
              aria-expanded={matches.length > 0}
            />
          </label>
          {matches.length ? (
            <div id="tickerSuggestions" className="ticker-suggestions" role="listbox">
              {matches.map((item) => (
                <button
                  key={item.ticker}
                  type="button"
                  onClick={() => submitTicker(item.ticker)}
                  className="ticker-suggestion"
                >
                  <strong>{item.ticker}</strong>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <DatePicker />
        <button className="icon-button header-icon-button" type="button" onClick={reload} disabled={loading} aria-label="Reload dataset" title="Reload dataset">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5M6.1 8.2A7 7 0 0 1 18.8 10M17.9 15.8A7 7 0 0 1 5.2 14" /></svg>
        </button>
        <button
          className="theme-switch"
          type="button"
          role="switch"
          aria-checked={theme === "light"}
          aria-label={theme === "light" ? "Use dark theme" : "Use light theme"}
          title={theme === "light" ? "Use dark theme" : "Use light theme"}
          onClick={toggleTheme}
        >
          <span className="theme-switch-icon" aria-hidden="true">{theme === "light" ? "Light" : "Dark"}</span>
          <span className="theme-switch-track"><span className="theme-switch-thumb"></span></span>
        </button>
      </div>
    </header>
  );
}
