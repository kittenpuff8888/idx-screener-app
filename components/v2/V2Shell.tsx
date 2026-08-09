"use client";

import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useApp } from "@/components/providers/AppProvider";

// Faithful port of the prototype shell (sidebar 218px + sticky header) from
// "IDX Screener - All Pages.html". Tokens come from globals.css. Theme uses the
// repo's existing convention (key "idx-research-theme", dataset.theme "light"|
// "dark") so the flag'd v2 chrome and the legacy chrome stay in sync during the
// parity window; the brief's "idxr:theme" rename is a later unify step.

const THEME_KEY = "idx-research-theme";
type Theme = "light" | "dark";

type NavKey = "research" | "screener" | "ksei" | "watchlist" | "news";
type ActiveKey = NavKey | "none";

const NAV: Array<{ key: NavKey; label: string; href: string; icon: ReactNode }> = [
  {
    key: "research",
    label: "Research",
    href: "/v2",
    icon: (
      <>
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </>
    ),
  },
  {
    key: "screener",
    label: "Screener",
    href: "/v2/screener",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </>
    ),
  },
  {
    key: "ksei",
    label: "KSEI",
    href: "/v2/ksei",
    icon: (
      <>
        <path d="M3 21h18" />
        <path d="M5 21V8l7-4 7 4v13" />
        <path d="M9 21v-6h6v6" />
      </>
    ),
  },
  {
    key: "watchlist",
    label: "Watchlist",
    href: "/v2/watchlist",
    icon: <path d="M12 3l2.7 5.4 6 .9-4.3 4.2 1 6L12 17l-5.4 2.8 1-6L3.3 9.3l6-.9z" />,
  },
  {
    key: "news",
    label: "News",
    href: "/v2/news",
    icon: (
      <>
        <path d="M4 4h12v16H4z" />
        <path d="M16 8h4v10a2 2 0 0 1-2 2h-2" />
        <path d="M7 8h6M7 12h6M7 16h4" />
      </>
    ),
  },
];

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    let initial: Theme = "light";
    try {
      initial = (localStorage.getItem(THEME_KEY) as Theme) || "light";
    } catch {
      /* ignore */
    }
    document.documentElement.dataset.theme = initial;
    setTheme(initial);
  }, []);
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  return [theme, toggle];
}

/** Weekday-aware staleness of the latest snapshot (mirrors AppShell). */
function tradingDaysBehind(marketDate: string): number {
  if (!marketDate) return 0;
  const from = new Date(`${marketDate}T17:00:00+07:00`);
  const now = new Date();
  const cursor = new Date(from);
  let days = 0;
  while (cursor < now) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) days += 1;
  }
  return Math.max(0, days - 1);
}

function formatWib(dateIso: string): string {
  if (!dateIso) return "—";
  const d = new Date(`${dateIso}T00:00:00+07:00`);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

const linkBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  padding: "9px 11px",
  borderRadius: 11,
  textDecoration: "none",
};

export function V2Shell({
  active,
  title,
  meta,
  children,
}: {
  active: ActiveKey;
  title: string;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const { marketDate, manifest } = useApp();
  const [theme, toggleTheme] = useTheme();
  const latest = manifest?.latestMarketDate || marketDate;
  const behind = tradingDaysBehind(latest || "");

  return (
    <div className="v2-root">
      <div style={{ display: "flex", alignItems: "stretch", minHeight: "100vh" }}>
        {/* Sidebar */}
        <nav
          style={{
            position: "sticky",
            top: 14,
            alignSelf: "flex-start",
            height: "calc(100vh - 28px)",
            width: 218,
            flex: "0 0 218px",
            borderRight: "1px solid var(--border)",
            background: "var(--panel)",
            display: "flex",
            flexDirection: "column",
            padding: "20px 14px",
          }}
        >
          <Link href="/v2" style={{ display: "flex", alignItems: "center", gap: 11, padding: "2px 6px 20px", textDecoration: "none", color: "var(--text)" }}>
            <div style={{ width: 36, height: 36, borderRadius: 11, background: "var(--text)", display: "grid", placeItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--bg)" }}>88</span>
            </div>
            <div style={{ lineHeight: 1.1 }}>
              <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-.01em" }}>8888 Screener</div>
              <div style={{ fontSize: 9, color: "var(--faint)", marginTop: 2 }}>Wealth doesn&apos;t wander. It lands.</div>
            </div>
          </Link>
          <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".13em", color: "var(--faint)", padding: "6px 8px 8px" }}>MENU</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {NAV.map((item) => {
              const isActive = item.key === active;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  style={{
                    ...linkBase,
                    color: isActive ? "var(--text)" : "var(--muted)",
                    background: isActive ? "var(--soft)" : "transparent",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {item.icon}
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{item.label}</span>
                </Link>
              );
            })}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--soft)", padding: "11px 12px", display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: behind > 1 ? "var(--warning)" : "var(--up)" }} />
            <div style={{ lineHeight: 1.25 }}>
              <strong style={{ fontSize: 12, display: "block" }}>EOD · {behind > 1 ? "delayed" : "current"}</strong>
              <small style={{ color: "var(--muted)", fontSize: 11 }}>snapshot {formatWib(latest || "")} WIB</small>
            </div>
          </div>
        </nav>

        {/* Main column */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <header style={{ position: "sticky", top: 0, zIndex: 40, background: "var(--panel)", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 24px", minHeight: 44 }}>
              <h1 style={{ margin: 0, fontSize: 16, fontWeight: 800, letterSpacing: "-.01em" }}>{title}</h1>
              {meta}
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={toggleTheme}
                title="Toggle theme"
                aria-label="Toggle theme"
                style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer" }}
              >
                {theme === "light" ? "◑" : "◐"}
              </button>
            </div>
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}
