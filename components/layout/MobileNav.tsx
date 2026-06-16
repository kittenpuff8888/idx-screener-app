"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/classNames";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/explorer", label: "Explorer" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/ksei", label: "More" },
];

export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-white/10 bg-surface/95 p-2 backdrop-blur lg:hidden" aria-label="Mobile navigation">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-md px-2 py-2 text-center text-xs font-semibold text-muted",
            (pathname === item.href || (pathname === "/" && item.href === "/dashboard")) && "bg-accent/10 text-accent",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
