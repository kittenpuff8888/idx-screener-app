"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { formatAsOf } from "@/lib/format/number";

export function DatePicker() {
  const { manifest, marketDate, setMarketDate } = useApp();
  const [open, setOpen] = useState(false);
  const dates = manifest?.availableMarketDates || [];
  const latestDates = useMemo(() => dates.slice(-24).reverse(), [dates]);
  return (
    <div className="date-picker-shell">
      <button
        className="date-picker-button"
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>Data</span>
        <strong>{marketDate ? formatAsOf(marketDate) : "Preparing"}</strong>
      </button>
      {open ? (
        <div className="date-popover" role="dialog" aria-label="Select available IDX market date">
          <label>
            <span>Available sessions</span>
            <select
              value={marketDate}
              onChange={(event) => {
                setMarketDate(event.target.value);
                setOpen(false);
              }}
              aria-label="Select available IDX market date"
            >
              {dates.map((date) => (
                <option key={date} value={date}>
                  {date}
                </option>
              ))}
            </select>
          </label>
          <div className="date-shortcuts">
            {latestDates.slice(0, 8).map((date) => (
              <button
                key={date}
                type="button"
                className={date === marketDate ? "active" : ""}
                onClick={() => {
                  setMarketDate(date);
                  setOpen(false);
                }}
              >
                {date}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
