"use client";

import { useApp } from "@/components/providers/AppProvider";
import { ErrorState } from "@/components/shared/ErrorState";
import { TickerDrawer } from "@/components/ticker/TickerDrawer";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { error, loading, marketDate, manifest, notice } = useApp();
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="workspace">
        <TopBar />
        {error ? <div className="error-banner"><ErrorState message={error} /></div> : null}
        <section className="dataset-strip" aria-live="polite">
          <span className={`status-badge ${error ? "error" : loading ? "partial" : "info"}`}>
            {error ? "Dataset issue" : loading ? "Market session" : "Dataset loaded"}
          </span>
          <p className="dataset-line">
            {loading && !marketDate
              ? "Preparing the latest available research session."
              : `Selected IDX session ${marketDate || "preparing"}${manifest?.latestMarketDate ? ` / latest ${manifest.latestMarketDate}` : ""}.`}
            {notice ? <span className="dataset-note"> {notice}</span> : null}
          </p>
        </section>
        {children}
      </main>
      <TickerDrawer />
    </div>
  );
}
