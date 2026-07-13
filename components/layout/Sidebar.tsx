"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

type NavItem = { href: string; label: string; icon: ReactNode; match: (p: string) => boolean };

const ICON = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Research", match: (p) => p === "/" || p.startsWith("/dashboard"),
    icon: <svg {...ICON}><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg> },
  { href: "/explorer", label: "Screener", match: (p) => p.startsWith("/explorer"),
    icon: <svg {...ICON}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg> },
  { href: "/setups", label: "Setups", match: (p) => p.startsWith("/setups"),
    icon: <svg {...ICON}><path d="M3 17l6-6 4 4 7-8" /><path d="M21 7h-4" /><path d="M21 7v4" /></svg> },
  { href: "/ksei", label: "KSEI", match: (p) => p.startsWith("/ksei"),
    icon: <svg {...ICON}><path d="M3 21h18" /><path d="M5 21V8l7-4 7 4v13" /><path d="M9 21v-6h6v6" /></svg> },
  { href: "/watchlist", label: "Watchlist", match: (p) => p.startsWith("/watchlist"),
    icon: <svg {...ICON}><path d="M12 3l2.7 5.4 6 .9-4.3 4.2 1 6L12 17l-5.4 2.8 1-6L3.3 9.3l6-.9z" /></svg> },
  { href: "/news", label: "News", match: (p) => p.startsWith("/news"),
    icon: <svg {...ICON}><path d="M4 4h12v16H4z" /><path d="M16 8h4v10a2 2 0 0 1-2 2h-2" /><path d="M7 8h6M7 12h6M7 16h4" /></svg> },
];

export function Sidebar() {
  const pathname = usePathname() || "/";
  const guideActive = pathname.startsWith("/advanced");

  function itemStyle(active: boolean): CSSProperties {
    return {
      display: "flex",
      alignItems: "center",
      gap: 11,
      padding: "9px 11px",
      borderRadius: 11,
      cursor: "pointer",
      textDecoration: "none",
      // v2 (moneytracker) active state: neutral soft fill, not accent tint.
      color: active ? "var(--text)" : "var(--muted)",
      background: active ? "var(--soft)" : "transparent",
    };
  }
  const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 600, letterSpacing: ".005em" };
  const sectionStyle: CSSProperties = { fontSize: 9.5, fontWeight: 600, letterSpacing: ".13em", color: "var(--faint)", padding: "6px 8px 8px" };

  return (
    <nav
      className="app-sidebar"
      style={{
        position: "sticky",
        top: 14,
        alignSelf: "flex-start",
        height: "calc(100vh - 28px)",
        width: 218,
        flex: "0 0 218px",
        borderRight: "1px solid var(--hair)",
        display: "flex",
        flexDirection: "column",
        padding: "20px 14px",
      }}
    >
      <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 11, padding: "2px 6px 20px", textDecoration: "none", color: "var(--text)" }}>
        {/* v2 brand mark: solid ink square with mono "88" */}
        <div style={{ width: 36, height: 36, borderRadius: 11, background: "var(--ink)", display: "grid", placeItems: "center" }}>
          <span style={{ fontFamily: "var(--mono, var(--font-mono))", fontSize: 13, fontWeight: 700, letterSpacing: ".02em", color: "var(--panel)" }}>88</span>
        </div>
        <div className="sb-label" style={{ lineHeight: 1.1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-.01em" }}>8888 Screener</div>
          <div style={{ fontSize: 9, color: "var(--faint)", letterSpacing: ".01em", marginTop: 2 }}>Wealth doesn&apos;t wander. It lands.</div>
        </div>
      </Link>

      <div className="sb-label" style={sectionStyle}>MENU</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {NAV.map((n) => {
          const active = n.match(pathname);
          return (
            <Link key={n.href} href={n.href} style={itemStyle(active)}>
              {n.icon}
              <span className="sb-label" style={labelStyle}>{n.label}</span>
            </Link>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      <div className="sb-label" style={sectionStyle}>SUPPORT</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <Link href="/health" style={itemStyle(pathname.startsWith("/health"))}>
          <svg {...ICON}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
          <span className="sb-label" style={labelStyle}>Data Health</span>
        </Link>
        <Link href="/advanced?tab=guide" style={itemStyle(guideActive)}>
          <svg {...ICON}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3" /><path d="M12 17h.01" /></svg>
          <span className="sb-label" style={labelStyle}>Help &amp; Guide</span>
        </Link>
      </div>
    </nav>
  );
}
