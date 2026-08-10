"use client";

import { useApp } from "@/components/providers/AppProvider";
import { ErrorState } from "@/components/shared/ErrorState";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/** Count weekdays between the data date and now (WIB); >1 means stale (§0.3).
    Weekend-aware approximation; IDX holidays are not modeled — noted in Guide. */
function tradingDaysBehind(marketDate: string): number {
  if (!marketDate) return 0;
  const from = new Date(`${marketDate}T17:00:00+07:00`);
  const now = new Date();
  let days = 0;
  const cursor = new Date(from);
  while (cursor < now) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) days += 1;
  }
  return Math.max(0, days - 1);
}

// Full-page layout: sidebar + main column filling the whole viewport, no outer
// frame or centered "app card" (was the prototype shell, maxWidth 1560).
export function AppShell({ children }: { children: React.ReactNode }) {
  const { error, marketDate, manifest } = useApp();
  const latest = manifest?.latestMarketDate || marketDate;
  const behind = tradingDaysBehind(latest || "");
  return (
    <div
      style={{
        fontFamily: "var(--sans, var(--font-body))",
        background: "var(--panel)",
        color: "var(--text)",
        minHeight: "100vh",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          minHeight: "100vh",
          background: "var(--panel)",
        }}
      >
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <TopBar />
          {behind > 1 ? (
            <div style={{ margin: "12px 30px 0", padding: "9px 14px", borderRadius: 10, background: "var(--warnSoft)", color: "var(--warning)", fontSize: 12, fontWeight: 600 }}>
              ⚠ Data is {behind} trading days old (latest snapshot {latest}). Treat signals as stale until the daily pipeline publishes a new session.
            </div>
          ) : null}
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
    </div>
  );
}
