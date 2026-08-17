"use client";

import { useEffect, useRef, useState } from "react";
import { loadStudies, saveStudies, subscribeStudies, STUDIES } from "@/lib/data/chartStudies";

type Props = {
  symbol?: string;
  range?: "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "12M" | "60M" | "ALL";
  interval?: string;
  minHeight?: number;
  /** Show the ƒx indicator picker overlay (site-wide, saved selection). */
  showIndicatorPicker?: boolean;
};

const CURRENT_THEME = (): "light" | "dark" =>
  (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark") ? "dark" : "light";

/** ƒx indicator picker — edits the site-wide saved study set. */
function IndicatorPicker({ selected, onToggle }: { selected: string[]; onToggle: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const groups = [["overlay", "Overlays"], ["oscillator", "Oscillators"], ["volume", "Volume"]] as const;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "4px 9px", cursor: "pointer" }}>
        <span style={{ fontStyle: "italic" }}>ƒx</span> Indicators {selected.length ? `· ${selected.length}` : ""}
      </button>
      {open ? (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30, width: 210, maxHeight: 320, overflowY: "auto", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 12px 30px rgba(11,14,20,.22)", padding: "8px 6px" }}>
          {groups.map(([g, label]) => (
            <div key={g} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--faint)", padding: "4px 8px 2px" }}>{label.toUpperCase()}</div>
              {STUDIES.filter((s) => s.group === g).map((s) => {
                const on = selected.includes(s.id);
                return (
                  <button key={s.id} type="button" onClick={() => onToggle(s.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "6px 8px", border: "none", background: on ? "var(--soft)" : "transparent", borderRadius: 7, cursor: "pointer", fontSize: 12, color: "var(--text)" }}>
                    <span style={{ width: 13, height: 13, borderRadius: 4, border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", color: "#fff", fontSize: 10, lineHeight: "11px", textAlign: "center", flexShrink: 0 }}>{on ? "✓" : ""}</span>
                    {s.label}
                  </button>
                );
              })}
            </div>
          ))}
          <div style={{ fontSize: 8.5, color: "var(--faint)", padding: "4px 8px 2px", lineHeight: 1.4, borderTop: "1px solid var(--hair)", marginTop: 2 }}>Saved for every chart on the site. TradingView built-ins (Pine Script can’t run in an embed).</div>
        </div>
      ) : null}
    </div>
  );
}

/** TradingView advanced-chart embed. Interval is forced to 1D (like the IHSG
    hero chart). The study set is site-wide, saved to localStorage, and applied
    to every chart; the optional picker edits it and all charts re-mount. */
export function TradingViewChart({ symbol = "IDX:COMPOSITE", range = "YTD", interval = "1D", minHeight = 520, showIndicatorPicker = false }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [studies, setStudies] = useState<string[]>([]);

  // Hydrate + subscribe to site-wide study changes.
  useEffect(() => {
    setStudies(loadStudies());
    return subscribeStudies(setStudies);
  }, []);

  function toggle(id: string) {
    const next = studies.includes(id) ? studies.filter((x) => x !== id) : [...studies, id];
    setStudies(next);
    saveStudies(next); // broadcasts to every chart
  }

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
      // TradingView's daily code is "D" — "1D" is NOT valid and makes the widget
      // fall back to the session's intraday interval (e.g. 1h), which IDX
      // small-caps don't offer ("Only D, W, M intervals are available"). Normalise.
      const tvInterval = /^1?d$/i.test(interval) ? "D" : /^1?w$/i.test(interval) ? "W" : /^1?m(o|onth)?$/i.test(interval) ? "M" : interval;
      s.innerHTML = JSON.stringify({
        autosize: true,
        symbol,
        interval: tvInterval,
        range,
        timezone: "Asia/Jakarta",
        theme: dark ? "dark" : "light",
        style: "1",
        locale: "en",
        allow_symbol_change: false,
        hide_top_toolbar: true,
        withdateranges: true,
        hide_side_toolbar: false,
        hide_volume: true,
        details: false,
        studies,
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
    const obs = new MutationObserver(() => build());
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      obs.disconnect();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key on contents, not identity
  }, [symbol, range, interval, studies.join(",")]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight }}>
      {showIndicatorPicker ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <IndicatorPicker selected={studies} onToggle={toggle} />
        </div>
      ) : null}
      <div style={{ position: "relative", flex: "1 1 auto", minHeight: showIndicatorPicker ? minHeight - 34 : minHeight, borderRadius: 12, overflow: "hidden", background: "var(--panel)", border: "1px solid var(--border)" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 16px", pointerEvents: "none" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, letterSpacing: "-.01em" }}>{symbol}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 12, fontSize: 10.5, color: "var(--faint)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: unavailable ? "var(--faint)" : "var(--good, #0ca30c)", boxShadow: unavailable ? "none" : "0 0 8px rgba(12,163,12,.55)" }} />
            {unavailable ? "TradingView unavailable — open the chart via the link above" : "Live interactive chart · 1-day bars"}
          </div>
        </div>
        <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />
      </div>
    </div>
  );
}
