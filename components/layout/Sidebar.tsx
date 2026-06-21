"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/components/providers/AppProvider";
import { BASE_PATH } from "@/lib/data/client";
import { cn } from "@/lib/utils/classNames";

const navItems = [
  { href: "/dashboard", label: "Research Dashboard" },
  { href: "/explorer", label: "Screener" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/ksei", label: "KSEI Ownership" },
  { href: "/news", label: "IDX Ticker News" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { loading, marketDate } = useApp();
  return (
    <aside className="sidebar" id="sidebar">
      <Link href="/dashboard" className="brand" aria-label="IDX RESEARCH home">
        <span className="brand-mark">
          <img src={`${BASE_PATH}/assets/idx-research-character.png`} alt="" />
        </span>
        <strong>IDX RESEARCH</strong>
      </Link>
      <nav aria-label="Primary navigation" className="primary-nav">
        {navItems.map((item) => {
          const active = pathname === item.href || (pathname === "/" && item.href === "/dashboard");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("nav-item", active && "active")}
            >
              {item.label}
            </Link>
          );
        })}
        <div className="advanced-nav-shell">
          <Link className={cn("nav-item", pathname === "/advanced" && "active")} href="/advanced">
            Advanced
          </Link>
          <div className="advanced-nav-menu" role="menu">
            <Link role="menuitem" href="/advanced?tab=quality">Data Quality</Link>
            <Link role="menuitem" href="/advanced?tab=explorer">Workbook Explorer</Link>
            <Link role="menuitem" href="/advanced?tab=guide">Guide &amp; Methodology</Link>
          </div>
        </div>
      </nav>
      <div className="sidebar-foot">
        <div className="system-state">
          <span className="status-dot" />
          <div>
            <strong>{loading ? "Preparing research view" : "Research view ready"}</strong>
            <small>{marketDate || "Market session loading"}</small>
          </div>
        </div>
      </div>
    </aside>
  );
}
