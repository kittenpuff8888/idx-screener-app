"use client";

import { useApp } from "@/components/providers/AppProvider";
import { ErrorState } from "@/components/shared/ErrorState";
import { TickerDrawer } from "@/components/ticker/TickerDrawer";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { error } = useApp();
  return (
    <div className="min-h-screen bg-bg text-text">
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="min-w-0 flex-1 pb-20 lg:pb-0">
          <TopBar />
          <main className="mx-auto max-w-[1680px] px-4 py-6 lg:px-8">
            {error ? <ErrorState message={error} /> : children}
          </main>
        </div>
      </div>
      <MobileNav />
      <TickerDrawer />
    </div>
  );
}
