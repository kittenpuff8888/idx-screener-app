"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { formatAsOf } from "@/lib/format/number";

const WD = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function DatePicker() {
  const { manifest, marketDate, setMarketDate } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const available = useMemo(() => new Set(manifest?.availableMarketDates || []), [manifest]);
  const dates = manifest?.availableMarketDates || [];

  // Calendar view starts on the selected date's month (or the latest session).
  const anchor = marketDate || dates[dates.length - 1] || ymd(new Date());
  const [view, setView] = useState(() => new Date(`${anchor}T00:00:00`));
  useEffect(() => { if (marketDate) setView(new Date(`${marketDate}T00:00:00`)); }, [marketDate]);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const y = view.getFullYear();
  const m = view.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(ymd(new Date(y, m, d)));

  // only allow navigating within the range that has sessions
  const minMonth = dates.length ? dates[0].slice(0, 7) : null;
  const maxMonth = dates.length ? dates[dates.length - 1].slice(0, 7) : null;
  const viewMonthKey = `${y}-${String(m + 1).padStart(2, "0")}`;
  const canPrev = !minMonth || viewMonthKey > minMonth;
  const canNext = !maxMonth || viewMonthKey < maxMonth;

  function jumpToLatest() {
    const last = dates[dates.length - 1];
    if (last) { setMarketDate(last); setOpen(false); }
  }

  return (
    <div className="date-picker-shell" ref={ref} style={{ position: "relative" }}>
      <button className="date-picker-button" type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>Data</span>
        <strong>{marketDate ? formatAsOf(marketDate) : "Preparing"}</strong>
      </button>
      {open ? (
        <div className="cal" role="dialog" aria-label="Select IDX market date">
          <div className="cal-head">
            <span className="cal-title">{MONTHS[m]} {y}</span>
            <div className="cal-nav">
              <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => setView(new Date(y, m - 1, 1))}>‹</button>
              <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => setView(new Date(y, m + 1, 1))}>›</button>
            </div>
          </div>
          <div className="cal-grid cal-wd">
            {WD.map((w) => <span key={w} className="cal-wdlabel">{w}</span>)}
          </div>
          <div className="cal-grid">
            {cells.map((iso, i) => {
              if (!iso) return <span key={`e${i}`} />;
              const day = Number(iso.slice(-2));
              const isAvail = available.has(iso);
              const isSel = iso === marketDate;
              return (
                <button
                  key={iso}
                  type="button"
                  className={`cal-day${isSel ? " sel" : ""}${isAvail ? " avail" : ""}`}
                  disabled={!isAvail}
                  title={isAvail ? iso : "No trading session"}
                  onClick={() => { setMarketDate(iso); setOpen(false); }}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <button type="button" className="cal-latest" onClick={jumpToLatest}>Jump to latest ({dates[dates.length - 1] || "—"})</button>
        </div>
      ) : null}
      <style jsx>{`
        .cal { position: absolute; right: 0; top: calc(100% + 8px); z-index: 50; width: 288px;
          background: var(--panel); border: 1px solid var(--border); border-radius: 14px;
          box-shadow: 0 12px 32px rgba(11,14,20,.14); padding: 14px; }
        .cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
        .cal-title { font-weight: 600; font-size: 14px; color: var(--text); }
        .cal-nav button { width: 28px; height: 28px; border: 1px solid var(--border); background: var(--panel);
          border-radius: 8px; cursor: pointer; color: var(--text); font-size: 15px; line-height: 1; }
        .cal-nav button:disabled { opacity: .35; cursor: default; }
        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
        .cal-wd { margin-bottom: 4px; }
        .cal-wdlabel { text-align: center; font-size: 11px; color: var(--faint, var(--muted)); padding: 4px 0; }
        .cal-day { aspect-ratio: 1; border: none; background: transparent; border-radius: 9px; cursor: default;
          font-size: 13px; color: var(--faint, var(--muted)); font-variant-numeric: tabular-nums; }
        .cal-day.avail { color: var(--text); cursor: pointer; }
        .cal-day.avail:hover { background: var(--accentSoft, rgba(80,90,220,.1)); color: var(--accent); }
        .cal-day.sel { background: var(--text); color: var(--panel); font-weight: 600; }
        .cal-latest { margin-top: 10px; width: 100%; padding: 7px; border: 1px solid var(--border);
          background: var(--softer, transparent); border-radius: 9px; font-size: 12px; color: var(--muted); cursor: pointer; }
        .cal-latest:hover { color: var(--accent); border-color: var(--accent); }
      `}</style>
    </div>
  );
}
