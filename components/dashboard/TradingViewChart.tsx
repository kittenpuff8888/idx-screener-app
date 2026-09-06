"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadStudies, saveStudies, subscribeStudies, STUDIES, MAX_STUDIES,
  loadStudyLengths, saveStudyLength, subscribeStudyLengths, buildStudyOverrides,
} from "@/lib/data/chartStudies";
import { loadOverlays, saveOverlays, subscribeOverlays, OVERLAYS } from "@/lib/data/chartOverlays";

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

/** ƒx indicator picker — edits the site-wide saved study set. When overlay props
    are supplied it also lists CUSTOM overlays (our re-implemented Pine studies),
    which render on a companion candle chart beneath the embed. */
function IndicatorPicker({ selected, onToggle, lengths, onLengthChange, overlaySelected, onOverlayToggle }: {
  selected: string[];
  onToggle: (id: string) => void;
  lengths?: Record<string, number>;
  onLengthChange?: (id: string, length: number) => void;
  overlaySelected?: string[];
  onOverlayToggle?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const groups = [["overlay", "Overlays"], ["oscillator", "Oscillators"], ["volume", "Volume"], ["technical-other", "Technical Others"]] as const;
  const custom = overlaySelected ?? [];
  const count = selected.length + custom.length;
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "4px 9px", cursor: "pointer" }}>
        <span style={{ fontStyle: "italic" }}>ƒx</span> Indicators {count ? `· ${count}` : ""}
      </button>
      {open ? (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 30, width: 232, maxHeight: 340, overflowY: "auto", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 12px 30px rgba(11,14,20,.22)", padding: "8px 6px" }}>
          {groups.map(([g, label]) => (
            <div key={g} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--faint)", padding: "4px 8px 2px" }}>{label.toUpperCase()}</div>
              {STUDIES.filter((s) => s.group === g).map((s) => {
                const on = selected.includes(s.id);
                const atCap = !on && selected.length >= MAX_STUDIES;
                const len = lengths?.[s.id] ?? s.defaultLength;
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button type="button" disabled={atCap} onClick={() => onToggle(s.id)}
                      title={atCap ? `Max ${MAX_STUDIES} at once — this embed breaks entirely past that. Remove one first.` : undefined}
                      style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, textAlign: "left", padding: "6px 8px", border: "none", background: on ? "var(--soft)" : "transparent", borderRadius: 7, cursor: atCap ? "not-allowed" : "pointer", opacity: atCap ? 0.45 : 1, fontSize: 12, color: "var(--text)" }}>
                      <span style={{ width: 13, height: 13, borderRadius: 4, border: `1.5px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", color: "#fff", fontSize: 10, lineHeight: "11px", textAlign: "center", flexShrink: 0 }}>{on ? "✓" : ""}</span>
                      {s.label}
                    </button>
                    {s.lengthOverrideKey && on && onLengthChange ? (
                      <input
                        type="number"
                        min={1}
                        value={len ?? ""}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10);
                          if (Number.isFinite(n) && n > 0) onLengthChange(s.id, n);
                        }}
                        title={`${s.label} length — saved for every chart`}
                        style={{ width: 40, fontSize: 11, padding: "3px 4px", borderRadius: 5, border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", flexShrink: 0 }}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ))}
          {onOverlayToggle ? (
            <div style={{ marginBottom: 4, borderTop: "1px solid var(--hair)", paddingTop: 4 }}>
              <div style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".08em", color: "#D6A100", padding: "4px 8px 2px" }}>CUSTOM · COMPANION CHART</div>
              {OVERLAYS.map((o) => {
                const on = custom.includes(o.id);
                return (
                  <button key={o.id} type="button" onClick={() => onOverlayToggle(o.id)} title={o.note}
                    style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "6px 8px", border: "none", background: on ? "var(--soft)" : "transparent", borderRadius: 7, cursor: "pointer", fontSize: 12, color: "var(--text)" }}>
                    <span style={{ width: 13, height: 13, borderRadius: 4, border: `1.5px solid ${on ? "#D6A100" : "var(--border)"}`, background: on ? "#D6A100" : "transparent", color: "#fff", fontSize: 10, lineHeight: "11px", textAlign: "center", flexShrink: 0 }}>{on ? "✓" : ""}</span>
                    {o.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div style={{ fontSize: 8.5, color: "var(--faint)", padding: "4px 8px 2px", lineHeight: 1.4, borderTop: "1px solid var(--hair)", marginTop: 2 }}>Saved for every chart on the site. TradingView built-ins run in the embed; CUSTOM overlays draw on a companion chart below it (Pine can’t run in an embed). Max {MAX_STUDIES} built-ins at once — this embed breaks entirely past that.</div>
        </div>
      ) : null}
    </div>
  );
}

/** Standalone ƒx indicator picker wired to the site-wide saved study set — for
    placing inline in a page header (next to the range tabs / TradingView link)
    instead of above the chart. Stays in sync with every chart via chartStudies. */
export function ChartIndicatorPicker() {
  const [studies, setStudies] = useState<string[]>([]);
  const [lengths, setLengths] = useState<Record<string, number>>({});
  const [overlays, setOverlays] = useState<string[]>([]);
  useEffect(() => {
    setStudies(loadStudies());
    return subscribeStudies(setStudies);
  }, []);
  useEffect(() => {
    setLengths(loadStudyLengths());
    return subscribeStudyLengths(setLengths);
  }, []);
  useEffect(() => {
    setOverlays(loadOverlays());
    return subscribeOverlays(setOverlays);
  }, []);
  function toggle(id: string) {
    const next = studies.includes(id) ? studies.filter((x) => x !== id) : [...studies, id];
    setStudies(next);
    saveStudies(next);
  }
  function changeLength(id: string, length: number) {
    setLengths((prev) => ({ ...prev, [id]: length }));
    saveStudyLength(id, length);
  }
  function toggleOverlay(id: string) {
    const next = overlays.includes(id) ? overlays.filter((x) => x !== id) : [...overlays, id];
    setOverlays(next);
    saveOverlays(next);
  }
  return <IndicatorPicker selected={studies} onToggle={toggle} lengths={lengths} onLengthChange={changeLength} overlaySelected={overlays} onOverlayToggle={toggleOverlay} />;
}

/** TradingView advanced-chart embed. Interval is forced to 1D (like the IHSG
    hero chart). The study set is site-wide, saved to localStorage, and applied
    to every chart; the optional picker edits it and all charts re-mount. */
export function TradingViewChart({ symbol = "IDX:COMPOSITE", interval = "1D", minHeight = 520, showIndicatorPicker = false }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [studies, setStudies] = useState<string[]>([]);
  const [lengths, setLengths] = useState<Record<string, number>>({});

  // Hydrate + subscribe to site-wide study changes.
  useEffect(() => {
    setStudies(loadStudies());
    return subscribeStudies(setStudies);
  }, []);
  useEffect(() => {
    setLengths(loadStudyLengths());
    return subscribeStudyLengths(setLengths);
  }, []);

  function toggle(id: string) {
    const next = studies.includes(id) ? studies.filter((x) => x !== id) : [...studies, id];
    setStudies(next);
    saveStudies(next); // broadcasts to every chart
  }
  function changeLength(id: string, length: number) {
    setLengths((prev) => ({ ...prev, [id]: length }));
    saveStudyLength(id, length); // broadcasts to every chart
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
      // NB: do NOT send `range`. IDX equities have EOD-only free data (no
      // intraday), and the `range` shortcut makes TradingView auto-pick an
      // intraday resolution for short spans (e.g. "3M" → 1h) that overrides
      // `interval`, tripping "Only D, W, M intervals are available". Verified in
      // the live embed: interval "D" with no range renders daily correctly.
      s.innerHTML = JSON.stringify({
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
        // this embed's IDX symbols breaks the whole chart (all-zero OHLC) --
        // confirmed by isolating it from studies_overrides below, which is
        // safe on its own. Documented behavior isn't always the real behavior
        // for this symbol set; verify live before trusting the docs again.
        studies,
        studies_overrides: buildStudyOverrides(lengths),
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
  }, [symbol, interval, studies.join(","), JSON.stringify(lengths)]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: "1 1 auto", minHeight }}>
      {showIndicatorPicker ? (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <IndicatorPicker selected={studies} onToggle={toggle} lengths={lengths} onLengthChange={changeLength} />
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
