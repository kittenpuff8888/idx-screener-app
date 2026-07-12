"use client";

import { useApp } from "@/components/providers/AppProvider";
import { ErrorState } from "@/components/shared/ErrorState";
import { TickerDrawer } from "@/components/ticker/TickerDrawer";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

// Frame ports the prototype shell (IDX Research.dc.html): an outer padded frame
// wrapping a single rounded "app card" that holds the sidebar + main column.
export function AppShell({ children }: { children: React.ReactNode }) {
  const { error } = useApp();
  return (
    <div
      style={{
        fontFamily: "var(--sans, var(--font-body))",
        background: "var(--frame)",
        color: "var(--text)",
        minHeight: "100vh",
        WebkitFontSmoothing: "antialiased",
        padding: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          maxWidth: 1560,
          margin: "0 auto",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "var(--shellR)",
          boxShadow: "0 4px 24px rgba(11,14,20,.06)",
        }}
      >
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <TopBar />
          <main style={{ flex: 1, minWidth: 0, padding: "26px 30px 60px" }}>
            {error ? (
              <div className="error-banner" style={{ marginBottom: 16 }}>
                <ErrorState message={error} />
              </div>
            ) : null}
            {children}
          </main>
        </div>
      </div>
      <TickerDrawer />
    </div>
  );
}
