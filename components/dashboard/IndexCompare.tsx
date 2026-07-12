"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Modal } from "@/components/shared/Modal";
import { Provenance } from "@/components/shared/Metric";
import type { IndexGroup, JsonRecord } from "@/lib/domain/types";
import { asNumber, formatPercent, formatPrice } from "@/lib/format/number";

const MONO = "var(--mono, var(--font-mono))";
const KICKER: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: "var(--faint)" };
const CAT = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => `var(--cat-${i})`);

type Range = { key: string; steps: number };
const RANGES: Range[] = [
  { key: "1D", steps: 1 },
  { key: "1W", steps: 5 },
  { key: "1M", steps: 21 },
  { key: "1Y", steps: 251 },
];

type Pt = { date: string; value: number };
export type CompareEntry = { id: string; label: string; series: Pt[]; group?: IndexGroup };

/** % -return series over the last `steps` sessions, normalized to the range start. */
function windowPct(series: Pt[], steps: number): number[] | null {
  const pts = series.map((p) => p.value).filter(Number.isFinite);
  if (pts.length < steps + 1) return null;
  const win = pts.slice(-(steps + 1));
  const base = win[0];
  if (!base) return null;
  return win.map((v) => (v / base - 1) * 100);
}

function linePath(vals: number[], min: number, spread: number, w = 100, h = 40): string {
  return vals
    .map((v, i) => `${i === 0 ? "M" : "L"} ${((i / (vals.length - 1)) * w).toFixed(2)} ${(h - 2 - ((v - min) / spread) * (h - 4)).toFixed(2)}`)
    .join(" ");
}

/** Detail modal: range area chart + top constituents joined against fundamentals. */
function DetailModal({ entry, steps, marketDate, onClose }: { entry: CompareEntry; steps: number; marketDate: string; onClose: () => void }) {
  const { bundle, openTicker } = useApp();
  const pct = windowPct(entry.series, steps);
  const chg = pct ? pct[pct.length - 1] / 100 : null;

  const constituents = useMemo(() => {
    const rows = (entry.group?.constituents || []).map((c) => {
      const raw = bundle?.fundamentals.get(c.ticker.toUpperCase()) as JsonRecord | undefined;
      return {
        ticker: c.ticker.toUpperCase(),
        mcap: asNumber(raw?.["Market Cap"]) ?? 0,
        price: asNumber(raw?.["Price"]),
        chg: asNumber(raw?.["Price Change %"]),
      };
    }).filter((r) => r.mcap > 0);
    rows.sort((a, b) => b.mcap - a.mcap);
    return rows.slice(0, 10);
  }, [entry, bundle]);
  const mcapMax = Math.max(1, ...constituents.map((c) => c.mcap));

  let area: React.ReactNode = <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No data for this range.</div>;
  if (pct) {
    const min = Math.min(...pct);
    const spread = Math.max(...pct) - min || 1;
    const d = linePath(pct, min, spread);
    area = (
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: "100%", height: 120 }} aria-label={`${entry.label} % return, last ${steps} sessions`}>
        <path d={`${d} L 100 40 L 0 40 Z`} fill={(chg ?? 0) >= 0 ? "var(--upSoft)" : "var(--downSoft)"} />
        <path d={d} fill="none" stroke={(chg ?? 0) >= 0 ? "var(--up)" : "var(--down)"} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }

  return (
    <Modal title={entry.label} kicker="INDEX DETAIL" onClose={onClose} maxWidth={680}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, color: chg === null ? "var(--muted)" : chg >= 0 ? "var(--up)" : "var(--down)" }}>
          {chg === null ? "—" : formatPercent(chg)}
        </span>
        <span style={{ fontSize: 11.5, color: "var(--faint)" }}>% return over the selected range</span>
      </div>
      {area}
      {constituents.length ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ ...KICKER, marginBottom: 9 }}>TOP CONSTITUENTS · BY MARKET CAP</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {constituents.map((c) => (
              <button
                key={c.ticker}
                type="button"
                onClick={() => { onClose(); openTicker(c.ticker); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", background: "transparent", border: "none", borderTop: "1px solid var(--hair)", cursor: "pointer", color: "var(--text)", textAlign: "left" }}
              >
                <span style={{ fontFamily: MONO, fontWeight: 700, fontSize: 12.5, width: 52 }}>{c.ticker}</span>
                <div style={{ flex: 1, height: 6, background: "var(--soft)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${(c.mcap / mcapMax) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 4 }} />
                </div>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", width: 58, textAlign: "right" }}>{c.price === null ? "—" : formatPrice(c.price)}</span>
                <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 600, width: 60, textAlign: "right", color: c.chg === null ? "var(--muted)" : c.chg >= 0 ? "var(--up)" : "var(--down)" }}>
                  {c.chg === null ? "—" : formatPercent(c.chg)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div style={{ marginTop: 12 }}>
        <Provenance source="Local research index · fundamentals" asOf={marketDate} />
      </div>
    </Modal>
  );
}

export function IndexCompareSection({ title, badge, hint, entries, ihsg, defaultRange = "1M" }: {
  title: string;
  badge: string;
  hint: string;
  entries: CompareEntry[];
  ihsg: Pt[];
  defaultRange?: string;
}) {
  const { marketDate } = useApp();
  const [rangeKey, setRangeKey] = useState(defaultRange);
  const [detail, setDetail] = useState<CompareEntry | null>(null);
  const range = RANGES.find((r) => r.key === rangeKey) || RANGES[2];

  const lines = useMemo(() => {
    const out: Array<{ entry: CompareEntry; color: string; pct: number[]; isIhsg: boolean }> = [];
    const ihsgPct = windowPct(ihsg, range.steps);
    if (ihsgPct) out.push({ entry: { id: "IHSG", label: "IHSG", series: ihsg }, color: "var(--text)", pct: ihsgPct, isIhsg: true });
    entries.forEach((entry, i) => {
      const pct = windowPct(entry.series, range.steps);
      if (pct) out.push({ entry, color: CAT[i % CAT.length], pct, isIhsg: false });
    });
    return out;
  }, [entries, ihsg, range]);

  if (!entries.length) return null;

  const all = lines.flatMap((l) => l.pct);
  const min = all.length ? Math.min(...all) : 0;
  const spread = all.length ? Math.max(...all) - min || 1 : 1;

  return (
    <div style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "16px 18px", boxShadow: "var(--shadow)", marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 13, flexWrap: "wrap" }}>
        <span style={KICKER}>{title}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", background: "var(--soft)", borderRadius: 6, padding: "2px 7px" }}>{badge}</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10.5, color: "var(--faint)" }}>{hint}</span>
        <div style={{ display: "flex", gap: 3 }}>
          {RANGES.map((r) => {
            const enabled = windowPct(ihsg, r.steps) !== null || entries.some((e) => windowPct(e.series, r.steps) !== null);
            const active = r.key === rangeKey;
            return (
              <button
                key={r.key}
                type="button"
                disabled={!enabled}
                onClick={() => setRangeKey(r.key)}
                style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 600, padding: "4px 9px", borderRadius: 7, border: "none", cursor: enabled ? "pointer" : "default", opacity: enabled ? 1 : 0.4, background: active ? "var(--accentSoft)" : "var(--soft)", color: active ? "var(--accent)" : "var(--muted)" }}
              >
                {r.key}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: 18, alignItems: "stretch", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 460px", minWidth: 300 }}>
          {lines.length ? (
            <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: "100%", height: "100%", minHeight: 240 }} aria-label={`${title}: % return comparison`}>
              {lines.filter((l) => !l.isIhsg).map((l) => (
                <path key={l.entry.id} d={linePath(l.pct, min, spread)} fill="none" stroke={l.color} strokeWidth={1.3} vectorEffect="non-scaling-stroke" opacity={0.85} />
              ))}
              {lines.filter((l) => l.isIhsg).map((l) => (
                <path key="IHSG" d={linePath(l.pct, min, spread)} fill="none" stroke={l.color} strokeWidth={2.2} vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "40px 0", textAlign: "center" }}>No series available for this range.</div>
          )}
        </div>

        <div style={{ flex: "0 0 240px", display: "flex", flexDirection: "column", gap: 2 }}>
          {lines.map((l) => {
            const chg = l.pct[l.pct.length - 1] / 100;
            const row = (
              <>
                <span style={{ width: 14, height: 2.5, borderRadius: 2, background: l.color, flexShrink: 0 }} />
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: l.isIhsg ? 700 : 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>{l.entry.label}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: chg >= 0 ? "var(--up)" : "var(--down)" }}>{formatPercent(chg)}</span>
                {!l.isIhsg ? <span style={{ color: "var(--faint)", fontSize: 10 }}>›</span> : null}
              </>
            );
            return l.isIhsg ? (
              <div key="IHSG" style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 7px", borderBottom: "1px solid var(--hair)", marginBottom: 3 }}>{row}</div>
            ) : (
              <button
                key={l.entry.id}
                type="button"
                onClick={() => setDetail(l.entry)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "4.5px 7px", borderRadius: 7, border: "none", background: "transparent", cursor: "pointer", color: "var(--text)" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--soft)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {row}
              </button>
            );
          })}
        </div>
      </div>

      {detail ? <DetailModal entry={detail} steps={range.steps} marketDate={marketDate} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}
