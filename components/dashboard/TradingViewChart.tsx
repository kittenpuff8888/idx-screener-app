"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  symbol?: string;
  /** One of the TradingView range presets. */
  range?: "1D" | "5D" | "1M" | "3M" | "YTD" | "12M" | "60M" | "ALL";
  interval?: string;
  minHeight?: number;
};

const CURRENT_THEME = (): "light" | "dark" =>
  (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark") ? "dark" : "light";

/**
 * Real TradingView Advanced-Chart embed for an IDX symbol. The widget is mounted
 * imperatively (its script rewrites its own container), re-mounted on theme change,
 * and falls back to a static "snapshot" note if the external script is blocked.
 * No fabricated data — this is the live vendor chart or an honest unavailable state.
 */
export function TradingViewChart({ symbol = "IDX:COMPOSITE", range = "YTD", interval = "D", minHeight = 520 }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    function build() {
      const el = mountRef.current;
      if (!el) return;
      setUnavailable(false);
      el.innerHTML = "";
      const dark = CURRENT_THEME() === "dark";
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
        symbol,
        interval,
        range,
        timezone: "Asia/Jakarta",
        theme: dark ? "dark" : "light",
        style: "1",
        locale: "en",
        allow_symbol_change: true,
        withdateranges: true,
        hide_side_toolbar: false,
        hide_volume: true,
        details: false,
        studies: ["MAExp@tv-basicstudies"],
        backgroundColor: dark ? "#11151b" : "#ffffff",
        gridColor: dark ? "rgba(255,255,255,0.06)" : "rgba(11,14,20,0.06)",
        support_host: "https://www.tradingview.com",
      });
      container.appendChild(s);
      el.appendChild(container);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (el && !el.querySelector("iframe")) setUnavailable(true);
      }, 3800);
    }

    build();

    // Re-mount on theme change (the widget can't re-theme itself in place).
    const obs = new MutationObserver(() => build());
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      obs.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [symbol, range, interval]);

  return (
    <div style={{ position: "relative", flex: "1 1 auto", minHeight, borderRadius: 12, overflow: "hidden", background: "var(--panel)", border: "1px solid var(--border)" }}>
      {/* Fallback / loading layer sits behind the mounted widget. */}
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 16px", pointerEvents: "none" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, letterSpacing: "-.01em" }}>{symbol}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, fontSize: 10.5, color: "var(--faint)" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: unavailable ? "var(--faint)" : "var(--good, #0ca30c)", boxShadow: unavailable ? "none" : "0 0 8px rgba(12,163,12,.55)" }} />
          {unavailable ? "TradingView unavailable — open the chart via the link above" : "Live interactive chart · add indicators from the ƒx menu"}
        </div>
      </div>
      <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}
