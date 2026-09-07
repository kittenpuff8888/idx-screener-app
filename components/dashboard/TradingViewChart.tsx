"use client";

import { useEffect, useRef, useState } from "react";
import { loadOverlays, saveOverlays, subscribeOverlays, OVERLAYS } from "@/lib/data/chartOverlays";

type Props = {
  symbol?: string;
  range?: "1D" | "5D" | "1M" | "3M" | "6M" | "YTD" | "12M" | "60M" | "ALL";
  interval?: string;
  minHeight?: number;
};

// TradingView built-in studies used to be user-toggleable (with a per-study
// length override) via a site-wide picker here. Changing a study's length
// reliably broke the embed -- toolbar and indicators both vanished -- because
// it's just another prop change forcing TradingViewChart's build effect to
// tear down and recreate the iframe, and a user typing into the length input
// fires that rebuild on every keystroke; rapid rebuilds race the same
// container-teardown failure mode documented below. Rolled back to a fixed
// study set (matching the pre-picker baseline) rather than debounce typing
// into the fix -- built-in TV indicators get reintroduced properly later.
const FIXED_STUDIES = ["MAExp@tv-basicstudies"];

const CURRENT_THEME = (): "light" | "dark" =>
  (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark") ? "dark" : "light";

/** ƒx picker for CUSTOM overlays only (our re-implemented Pine studies, which
    render on a companion candle chart beneath the embed -- Pine can't run
    inside the embed itself). Site-wide saved selection, synced across tabs. */
export function ChartIndicatorPicker() {
  const [overlays, setOverlays] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setOverlays(loadOverlays());
    return subscribeOverlays(setOverlays);
  }, []);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  function toggleOverlay(id: string) {
    const next = overlays.includes(id) ? overlays.filter((x) => x !== id) : [...overlays, id];
    setOverlays(next);
    saveOverlays(next);
  }
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "4px 9px", cursor: "pointer" }}>
        <span style={{ fontStyle: "italic" }}>ƒx</span> Overlays {overlays.length ? `· ${overlays.length}` : ""}
      </button>
      {open ? (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30, width: 232, maxHeight: 340, overflowY: "auto", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 12px 30px rgba(11,14,20,.22)", padding: "8px 6px" }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--faint)", padding: "4px 8px 2px" }}>CUSTOM · COMPANION CHART</div>
          {OVERLAYS.map((o) => {
            const on = overlays.includes(o.id);
            return (
              <button key={o.id} type="button" onClick={() => toggleOverlay(o.id)} title={o.note}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "6px 8px", border: "none", background: on ? "var(--soft)" : "transparent", borderRadius: 7, cursor: "pointer", fontSize: 12, color: "var(--text)" }}>
                <span style={{ width: 13, height: 13, borderRadius: 4, border: `1.5px solid ${on ? "#D6A100" : "var(--border)"}`, background: on ? "#D6A100" : "transparent", color: "#fff", fontSize: 10, lineHeight: "11px", textAlign: "center", flexShrink: 0 }}>{on ? "✓" : ""}</span>
                {o.label}
              </button>
            );
          })}
          <div style={{ fontSize: 8.5, color: "var(--faint)", padding: "4px 8px 2px", lineHeight: 1.4, borderTop: "1px solid var(--hair)", marginTop: 2 }}>Saved for every chart on the site. Draws on a companion chart below the embed (Pine can’t run in an embed).</div>
        </div>
      ) : null}
    </div>
  );
}

/** TradingView advanced-chart embed. Interval is forced to 1D (like the IHSG
    hero chart). Study set is fixed (see FIXED_STUDIES above). */
export function TradingViewChart({ symbol = "IDX:COMPOSITE", interval = "1D", minHeight = 520 }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    // Guards against a real failure mode: TradingView's embed script attaches
    // its iframe asynchronously, then wires up postMessage-based resize
    // listeners against it. If this effect re-runs (theme flips, or React
    // re-mounting the component) before that finishes, and the old container
    // gets torn down mid-load, the script's callback fires against an
    // already-detached iframe — "Cannot listen to the event from the
    // provided iframe, contentWindow is not available" — leaving the chart
    // blank with no toolbar and no indicators. `disposed` stops a build in
    // flight from touching a container this effect has already walked away
    // from, and the cleanup below always leaves a clean, empty mount point
    // rather than a half-initialized one for the next build to race.
    let disposed = false;

    function build() {
      const el = mountRef.current;
      if (!el || disposed) return;
      setUnavailable(false);
      el.innerHTML = "";
      const dark = CURRENT_THEME() === "dark";
      // TradingView's daily code is "D" — "1D" is NOT valid and makes the widget
      // fall back to the session's intraday interval (e.g. 1h), which IDX
      // small-caps don't offer ("Only D, W, M intervals are available"). Normalise.
      const tvInterval = /^1?d$/i.test(interval) ? "D" : /^1?w$/i.test(interval) ? "W" : /^1?m(o|onth)?$/i.test(interval) ? "M" : interval;
      // NB: do NOT send `range`. IDX equities have EOD-only free data (no
      // intraday), and the `range` shortcut makes TradingView auto-pick an
      // intraday resolution for short spans (e.g. "3M" → 1h) that overrides
      // `interval`, tripping "Only D, W, M intervals are available". Verified in
      // the live embed: interval "D" with no range renders daily correctly.
      const config = {
        autosize: true,
        symbol,
        interval: tvInterval,
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
        // NB: do NOT add `calendar: true`. TradingView documents it as an
        // earnings/dividends/splits-marker toggle, but live-testing against
        // this embed's IDX symbols breaks the whole chart (all-zero OHLC).
        // Documented behavior isn't always the real behavior for this symbol
        // set; verify live before trusting the docs again.
        studies: FIXED_STUDIES,
        backgroundColor: dark ? "#11151b" : "#ffffff",
        gridColor: dark ? "rgba(255,255,255,0.06)" : "rgba(11,14,20,0.06)",
        support_host: "https://www.tradingview.com",
        width: "100%",
        height: "100%",
        utm_source: typeof location !== "undefined" ? location.hostname : "",
        utm_medium: "widget",
        utm_campaign: "advanced-chart",
      };
      // Build the iframe directly instead of injecting TradingView's
      // embed-widget-advanced-chart.js loader script. The loader creates this
      // EXACT same iframe (confirmed by inspecting its output live), then
      // separately tries to attach a postMessage listener to it for parent-side
      // auto-resize -- a handshake that reproducibly fails to complete on some
      // fraction of loads ("Cannot listen to the event from the provided
      // iframe, contentWindow is not available"), leaving the chart's own
      // chrome (toolbar, axes) rendered but its data feed never subscribed
      // (frozen at all-zero OHLC). We don't need that handshake: `autosize`
      // makes the widget fill its OWN iframe, and the iframe itself already
      // fills our fixed-size container via CSS -- nothing needs to report a
      // size back up to us. A direct iframe to the same URL the loader script
      // ultimately builds sidesteps the flaky handshake entirely; verified
      // live to load real data reliably where the loader script did not.
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=en#${encodeURIComponent(JSON.stringify(config))}`;
      iframe.style.cssText = "width:100%;height:100%;border:0;";
      iframe.setAttribute("scrolling", "no");
      iframe.setAttribute("allowtransparency", "true");
      iframe.title = `TradingView chart for ${symbol}`;
      el.appendChild(iframe);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!disposed && el && !el.querySelector("iframe")) setUnavailable(true);
      }, 3800);
    }

    // Debounced, not called directly: the header restores the user's saved
    // theme in its own effect right after mount (default is "light" until
    // that runs), so a real light→dark flip lands here within milliseconds
    // of this effect's own first build — two builds racing the same
    // container, the exact scenario `disposed`/cleanup above guard against.
    // Collapsing both into one build of the FINAL settled theme avoids the
    // race outright instead of just cleaning up after it.
    let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
    function scheduleBuild() {
      if (scheduleTimer) clearTimeout(scheduleTimer);
      scheduleTimer = setTimeout(build, 50);
    }

    scheduleBuild();
    // Only rebuild on a theme change that actually flips light/dark — a
    // MutationObserver fires on any attribute write, including ones that set
    // the same value (e.g. an unrelated re-render touching data-theme), and
    // every extra rebuild is another chance to race the teardown above.
    let lastTheme = CURRENT_THEME();
    const obs = new MutationObserver(() => {
      const next = CURRENT_THEME();
      if (next === lastTheme) return;
      lastTheme = next;
      scheduleBuild();
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      disposed = true;
      obs.disconnect();
      if (scheduleTimer) clearTimeout(scheduleTimer);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (mount) mount.innerHTML = "";
    };
  }, [symbol, interval]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight }}>
      <div style={{ position: "relative", flex: "1 1 auto", minHeight, borderRadius: 12, overflow: "hidden", background: "var(--panel)", border: "1px solid var(--border)" }}>
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
