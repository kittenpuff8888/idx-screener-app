"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { V2Shell } from "@/components/v2/V2Shell";
import { useApp } from "@/components/providers/AppProvider";
import { fetchJson } from "@/lib/data/client";
import { formatPrice } from "@/lib/format/number";

// Faithful port of "3. Watchlist.dc.html". The prototype's 6 hardcoded rows are
// replaced with real feeds: price/change from the EOD technical bundle, and the
// setup score + R/R from the setup engine (setups.json). σ-to-value targets stay
// modelled (labelled), exactly as the prototype disclosed.

type SetupRecord = {
  ticker: string;
  score: number;
  entryZone?: number | null;
  target?: number | null;
  invalidation?: number | null;
};

/** Engine R/R = reward / risk = (target - entry) / (entry - invalidation). */
function riskReward(s: SetupRecord | undefined): number | null {
  if (!s || s.entryZone == null || s.target == null || s.invalidation == null) return null;
  const reward = s.target - s.entryZone;
  const risk = s.entryZone - s.invalidation;
  if (!(risk > 0) || !(reward > 0)) return null;
  return reward / risk;
}

const glyph = (c: number | undefined) => (c == null ? "•" : c > 0 ? "▲" : c < 0 ? "▼" : "•");
const polColor = (c: number | undefined) => (c == null ? "var(--flat)" : c > 0 ? "var(--up)" : c < 0 ? "var(--down)" : "var(--flat)");

function TradingViewChart({ symbol }: { symbol: string }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const noteRef = useRef<HTMLDivElement | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  // Track the app theme so the chart re-mounts to match (any shell can toggle it).
  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const dark = theme === "dark";
    mount.innerHTML = "";
    const container = document.createElement("div");
    container.className = "tradingview-widget-container";
    container.style.cssText = "height:100%;width:100%;";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.cssText = "height:100%;width:100%;";
    container.appendChild(widget);
    const s = document.createElement("script");
    s.type = "text/javascript";
    s.async = true;
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    s.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `IDX:${symbol}`,
      interval: "D", // brief mandate: every TradingView embed fixed to 1-day candles
      range: "3M",
      timezone: "Asia/Jakarta",
      theme: dark ? "dark" : "light",
      style: "1",
      locale: "en",
      withdateranges: true,
      hide_side_toolbar: false,
      backgroundColor: dark ? "#11151b" : "#ffffff",
      gridColor: dark ? "rgba(255,255,255,0.06)" : "rgba(11,14,20,0.06)",
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(s);
    mount.appendChild(container);
    const t = setTimeout(() => {
      if (!mount.querySelector("iframe") && noteRef.current) {
        noteRef.current.innerHTML =
          '<span style="width:6px;height:6px;border-radius:50%;background:var(--faint);display:inline-block;"></span>Snapshot · TradingView unavailable offline';
      }
    }, 3500);
    return () => clearTimeout(t);
  }, [symbol, theme]);

  return (
    <div id="tv-watch-host" style={{ position: "relative", height: 520, borderRadius: 12, overflow: "hidden", background: "var(--panel)", border: "1px solid var(--border)" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 16px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)" }}>{symbol} · IDX:{symbol}</div>
        <div ref={noteRef} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, fontSize: 10.5, color: "var(--faint)" }}>
          <span style={{ width: 11, height: 11, border: "2px solid var(--faint)", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "v2-spin 1s linear infinite" }} />
          Loading TradingView (1-day)…
        </div>
      </div>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}

const chip = (color: string) => ({ color });

export function WatchlistFaithful() {
  const { watchlist, bundle, marketDate, openTicker } = useApp();
  const [setups, setSetups] = useState<Record<string, SetupRecord>>({});
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (!marketDate) return;
    let cancelled = false;
    fetchJson<{ setups: SetupRecord[] }>(`/data/dates/${marketDate}/setups.json`)
      .then((p) => {
        if (cancelled) return;
        setSetups(Object.fromEntries((p.setups || []).map((s) => [s.ticker.toUpperCase(), s])));
      })
      .catch(() => !cancelled && setSetups({}));
    return () => {
      cancelled = true;
    };
  }, [marketDate]);

  const rows = useMemo(
    () =>
      watchlist.map((ticker) => {
        const stock = bundle?.technical.get(ticker);
        const setup = setups[ticker];
        const rr = riskReward(setup);
        return {
          ticker,
          name: stock?.companyName || ticker,
          price: stock?.lastPrice,
          chg: stock?.changePercent,
          score: setup?.score ?? null,
          rr,
        };
      }),
    [watchlist, bundle, setups],
  );

  // Default selection: first watched name.
  const sel = selected && watchlist.includes(selected) ? selected : watchlist[0] || null;
  const selRow = rows.find((r) => r.ticker === sel);

  const meta = (
    <>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
        <strong style={{ color: "var(--text)" }}>{rows.length}</strong> starred · EOD as of {marketDate || "—"} WIB
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontWeight: 700, color: "var(--warning)", background: "var(--warnSoft)", borderRadius: 6, padding: "3px 8px" }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--warning)" }} />
        EOD-DELAYED
      </span>
    </>
  );

  return (
    <V2Shell active="watchlist" title="Watchlist" meta={meta}>
      {rows.length === 0 ? (
        <main style={{ flex: 1, padding: "22px 24px 48px" }}>
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "40px 24px", textAlign: "center", color: "var(--muted)" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>No tickers saved yet</div>
            <div style={{ fontSize: 12 }}>Star a ticker from the Screener or a ticker page to build your research board.</div>
          </div>
        </main>
      ) : (
        <main style={{ flex: 1, minWidth: 0, padding: "22px 24px 48px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          {/* Starred table */}
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 12px" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>STARRED NAMES</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: "var(--up)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px" }}>real · EOD close</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "26px 92px 1fr 78px 70px 70px", background: "var(--soft)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", fontSize: 9, fontWeight: 700, letterSpacing: ".05em", color: "var(--faint)" }}>
              <span style={{ padding: "9px 6px 9px 12px" }}>★</span>
              <span style={{ padding: "9px 6px" }}>TICKER</span>
              <span style={{ padding: "9px 6px" }}>SETUP</span>
              <span style={{ padding: "9px 6px", textAlign: "right" }}>PRICE</span>
              <span style={{ padding: "9px 6px", textAlign: "right" }}>CHG</span>
              <span style={{ padding: "9px 12px 9px 6px", textAlign: "right" }}>R/R</span>
            </div>
            {rows.map((r) => (
              <div
                key={r.ticker}
                onClick={() => setSelected(r.ticker)}
                style={{ display: "grid", gridTemplateColumns: "26px 92px 1fr 78px 70px 70px", alignItems: "center", borderBottom: "1px solid var(--hair)", cursor: "pointer", background: r.ticker === sel ? "var(--accentSoft)" : "transparent" }}
              >
                <span style={{ padding: "10px 6px 10px 12px", color: "var(--warning)", fontSize: 13 }}>★</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openTicker(r.ticker);
                  }}
                  style={{ padding: "10px 6px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 800, color: "var(--text)", background: "transparent", border: 0, textAlign: "left", cursor: "pointer" }}
                >
                  {r.ticker}
                </button>
                <span style={{ padding: "10px 6px" }}>
                  {r.score != null ? (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 5, padding: "2px 7px" }}>SETUP {r.score}</span>
                  ) : (
                    <span style={{ fontSize: 9.5, color: "var(--faint)" }}>no setup</span>
                  )}
                </span>
                <span style={{ padding: "10px 6px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{r.price != null ? formatPrice(r.price) : "—"}</span>
                <span style={{ padding: "10px 6px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 700, ...chip(polColor(r.chg)) }}>
                  {glyph(r.chg)} {r.chg != null ? `${Math.abs(r.chg).toFixed(2)}%` : "—"}
                </span>
                <span style={{ padding: "10px 12px 10px 6px", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, ...chip(r.rr == null ? "var(--faint)" : r.rr >= 2 ? "var(--up)" : "var(--warning)") }}>
                  {r.rr == null ? "—" : `${r.rr.toFixed(1)}×`}
                </span>
              </div>
            ))}
            <div style={{ padding: "11px 16px", fontSize: 10, color: "var(--faint)", lineHeight: 1.5 }}>
              Price &amp; change = real EOD close (<span style={{ color: "var(--up)" }}>real</span>). Setup score &amp; R/R from the setup engine (<span style={{ color: "var(--up)" }}>real</span>) · σ-to-value &amp; targets are <span style={{ color: "var(--warning)" }}>modelled · approx</span>. Rows open the ticker detail.
            </div>
          </div>

          {/* Selected chart */}
          <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh)", padding: "14px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 800 }}>{sel || "—"}</span>
              <span style={{ fontSize: 11, color: "var(--muted)" }}>{selRow?.name || ""}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--warning)", background: "var(--warnSoft)", borderRadius: 6, padding: "3px 8px" }}>1-day candles · EOD</span>
              {sel ? (
                <button type="button" onClick={() => openTicker(sel)} style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "5px 10px", cursor: "pointer" }}>
                  Detail →
                </button>
              ) : null}
            </div>
            {sel ? <TradingViewChart symbol={sel} /> : null}
            <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 9 }}>
              Chart interval fixed to <strong style={{ color: "var(--text)" }}>1 day</strong>. TradingView is live when connected; the fallback shows the archived symbol otherwise.
            </div>
          </div>
        </main>
      )}
    </V2Shell>
  );
}
