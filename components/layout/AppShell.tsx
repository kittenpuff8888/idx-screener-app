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
        // The shell itself never scrolls — only <main> does (DESIGN_SPEC §2).
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        alignItems: "stretch",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, height: "100vh", overflow: "auto" }}>
        <TopBar />
        <div style={{ padding: "22px 22px 60px" }}>
          {behind > 1 ? (
            <div style={{ marginBottom: 14, padding: "9px 14px", borderRadius: 10, background: "var(--warnSoft)", color: "var(--warning)", fontSize: 12, fontWeight: 600 }}>
              ⚠ Data is {behind} trading days old (latest snapshot {latest}). Treat signals as stale until the daily pipeline publishes a new session.
            </div>
          ) : null}
          {error ? (
            <div className="error-banner" style={{ marginBottom: 14 }}>
              <ErrorState message={error} />
            </div>
          ) : null}
          {children}
        </div>
      </main>
    </div>
  );
}
