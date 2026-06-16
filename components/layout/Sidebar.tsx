"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BASE_PATH } from "@/lib/data/client";
import { cn } from "@/lib/utils/classNames";

const navItems = [
  { href: "/dashboard", label: "Research Dashboard" },
  { href: "/explorer", label: "Research Explorer" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/ksei", label: "KSEI Ownership" },
  { href: "/news", label: "IDX Ticker News" },
  { href: "/advanced", label: "Advanced" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden min-h-screen w-72 shrink-0 border-r border-white/10 bg-surface/90 p-5 lg:sticky lg:top-0 lg:block">
      <Link href="/dashboard" className="mb-8 flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        <img src={`${BASE_PATH}/assets/idx-research-character.png`} alt="" className="h-11 w-11 rounded-md bg-white object-contain p-1" />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-accent">IDX</p>
          <h1 className="text-lg font-semibold text-text">IDX RESEARCH</h1>
        </div>
      </Link>
      <nav aria-label="Primary navigation" className="space-y-2">
        {navItems.map((item) => {
          const active = pathname === item.href || (pathname === "/" && item.href === "/dashboard");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-md border border-transparent px-4 py-3 text-sm font-semibold text-muted transition hover:border-accent/30 hover:bg-accent/10 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                active && "border-accent/30 bg-accent/10 text-accent shadow-[inset_3px_0_0_var(--accent)]",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-8 rounded-lg border border-white/10 bg-bg/45 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">Research Flow</p>
        <p className="mt-2 text-sm leading-6 text-muted">
          Market story, discovery, company research, ownership intelligence, and audit tools stay separated.
        </p>
      </div>
    </aside>
  );
}
