"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { Provenance } from "@/components/shared/Metric";
import { fetchJson } from "@/lib/data/client";
import { formatNumber, formatPrice } from "@/lib/format/number";

const MONO = "var(--mono, var(--font-mono))";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", padding: "16px 18px", boxShadow: "var(--sh, var(--shadow))" };
const KICKER: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: "var(--faint)" };

type Setup = {
  ticker: string; name?: string | null; sector?: string | null; close: number; score: number;
  components: Record<string, number>; entryZone: number; invalidation: number; target: number;
  medianValueTraded20: number; isRecentIpo: boolean; why: string; tradingView: string;
  cvdSpark: number[] | null; kseiFootprint: { netDeltaPP: number; asOf?: string } | null; dataSource: string;
};
type SetupsPayload = { marketDate: string; generatedAt: string; count: number; scanned: number; methodology: string; setups: Setup[] };

const COMPONENT_COLORS: Record<string, string> = {
  location: "var(--accent)", structure: "var(--cat-3)", orderflow: "var(--cat-4)",
  ownership: "var(--cat-6)", liquidity: "var(--faint)",
};

function CvdSpark({ values }: { values: number[] | null }) {
  if (!values || values.length < 2) return <span style={{ fontSize: 10, color: "var(--faint)" }}>CVD n/a</span>;
  const min = Math.min(...values); const spread = Math.max(...values) - min || 1;
  const up = values[values.length - 1] >= values[0];
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"} ${((i / (values.length - 1)) * 100).toFixed(1)} ${(30 - ((v - min) / spread) * 26).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" style={{ width: "100%", height: 30 }} aria-label="CVD approx sparkline">
      <path d={d} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type HistoryEntry = { date: string; ticker: string; score: number; outcome: string; barsObserved: number };
type HistoryPayload = { asOf: string; entries: HistoryEntry[]; summary: { total: number; decided: number; targetFirst: number; hitRate: number | null }; note: string };

const OUTCOME_STYLE: Record<string, { color: string; label: string }> = {
  target: { color: "var(--up)", label: "TARGET" },
  invalidated: { color: "var(--down)", label: "INVALIDATED" },
  undecided: { color: "var(--muted)", label: "UNDECIDED (5 bars)" },
  open: { color: "var(--warning)", label: "OPEN" },
};

function HistorySection() {
  const [hist, setHist] = useState<HistoryPayload | null>(null);
  useEffect(() => {
    fetchJson<HistoryPayload>("/data/setups-history.json").then(setHist).catch(() => setHist(null));
  }, []);
  if (!hist) return null;
  return (
    <div style={{ ...CARD, marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={KICKER}>PAST SETUPS · FORWARD OUTCOMES</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)" }}>
          {hist.summary.total} published · {hist.summary.decided} decided · hit-rate {hist.summary.hitRate === null ? "—" : `${Math.round(hist.summary.hitRate * 100)}%`}
        </span>
      </div>
      {!hist.entries.length ? (
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No archived setups yet — outcomes accumulate as the daily pipeline publishes new sessions.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {hist.entries.slice().reverse().slice(0, 30).map((e, i) => {
            const st = OUTCOME_STYLE[e.outcome] || OUTCOME_STYLE.open;
            return (
              <div key={`${e.date}-${e.ticker}`} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "6px 0", borderTop: i ? "1px solid var(--hair)" : "none", fontSize: 12 }}>
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--faint)", width: 82 }}>{e.date}</span>
                <span style={{ fontFamily: MONO, fontWeight: 700, width: 52 }}>{e.ticker}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)", width: 34 }}>{e.score}</span>
                <span style={{ fontFamily: MONO, fontSize: 10.5, fontWeight: 700, color: st.color }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      )}
      <p style={{ margin: "10px 0 0", fontSize: 10, color: "var(--faint)" }}>{hist.note}</p>
    </div>
  );
}

export function SetupsPage() {
  const { marketDate, openTicker } = useApp();
  const [payload, setPayload] = useState<SetupsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(0);
  const [hideIpo, setHideIpo] = useState(false);
  const [kseiOnly, setKseiOnly] = useState(false);

  useEffect(() => {
    if (!marketDate) return;
    setPayload(null); setError(null);
    fetchJson<SetupsPayload>(`/data/dates/${marketDate}/setups.json`)
      .then(setPayload)
      .catch(() => setError(`No setups file for ${marketDate} — the engine runs on the daily pipeline; older dates may not have one.`));
  }, [marketDate]);

  const rows = useMemo(() => (payload?.setups || [])
    .filter((s) => s.score >= minScore)
    .filter((s) => !hideIpo || !s.isRecentIpo)
    .filter((s) => !kseiOnly || Boolean(s.kseiFootprint)), [payload, minScore, hideIpo, kseiOnly]);

  return (
    <section>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Swing Setups</h1>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13.5, maxWidth: 720, lineHeight: 1.5 }}>
          Ranked long-reversal candidates for 2–5 day holds — location + structure + CVD (approx.) confirmation.
          Screening analytics, not trade advice. {payload ? `${payload.count} of ${formatNumber(payload.scanned, 0)} scanned.` : ""}
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <label style={{ fontSize: 11.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
          Min score
          <input type="number" value={minScore} min={0} max={100} onChange={(e) => setMinScore(Number(e.target.value) || 0)}
            style={{ width: 58, fontFamily: MONO, fontSize: 12, padding: "5px 7px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--soft)", color: "var(--text)" }} />
        </label>
        {[["Exclude recent IPOs", hideIpo, setHideIpo], ["KSEI footprint only", kseiOnly, setKseiOnly]].map(([label, val, set]) => (
          <button key={String(label)} type="button" onClick={() => (set as (v: boolean) => void)(!(val as boolean))}
            style={{ fontSize: 11.5, fontWeight: 600, padding: "6px 11px", borderRadius: 9, cursor: "pointer", border: "1px solid var(--border)", background: (val as boolean) ? "var(--accentSoft)" : "transparent", color: (val as boolean) ? "var(--accent)" : "var(--muted)" }}>
            {String(label)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {payload ? <Provenance source="Swing engine · daily pipeline" asOf={payload.marketDate} /> : null}
      </div>

      {error ? <div style={{ ...CARD, color: "var(--muted)", fontSize: 13 }}>{error}</div> : null}
      {payload && !rows.length && !error ? (
        <div style={{ ...CARD, color: "var(--muted)", fontSize: 13.5 }}>
          0 setups {payload.count ? "match the filters" : "today"} — that is a valid, expected output. The engine only surfaces tickers with structure + orderflow confirmation.
        </div>
      ) : null}

      {payload?.methodology ? (
        <p style={{ margin: "0 0 14px", fontSize: 10.5, color: "var(--faint)", lineHeight: 1.5 }}>{payload.methodology}</p>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(360px,1fr))", gap: 14 }}>
        {rows.map((s) => (
          <div key={s.ticker} style={CARD}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
              <button type="button" onClick={() => openTicker(s.ticker)} style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, background: "transparent", border: "none", color: "var(--text)", cursor: "pointer", padding: 0 }}>{s.ticker}</button>
              <span style={{ fontSize: 10.5, color: "var(--faint)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{s.name || s.sector}</span>
              {s.isRecentIpo ? <span style={{ fontSize: 9, fontWeight: 700, color: "var(--warning)", background: "var(--warnSoft)", padding: "2px 6px", borderRadius: 5 }}>RECENT IPO</span> : null}
              <span style={{ fontFamily: MONO, fontSize: 17, fontWeight: 700, color: s.score >= 75 ? "var(--up)" : "var(--text)" }}>{s.score}</span>
            </div>

            <div style={{ display: "flex", height: 7, borderRadius: 5, overflow: "hidden", gap: 1, marginBottom: 9 }}>
              {Object.entries(s.components).map(([k, v]) => (v > 0 ? <div key={k} title={`${k}: ${v}`} style={{ width: `${v}%`, background: COMPONENT_COLORS[k] || "var(--soft)" }} /> : null))}
              <div style={{ flex: 1, background: "var(--soft)" }} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {Object.entries(s.components).map(([k, v]) => (
                <span key={k} style={{ fontSize: 9.5, color: "var(--muted)" }}><span style={{ display: "inline-block", width: 7, height: 7, borderRadius: 2, background: COMPONENT_COLORS[k], marginRight: 4, verticalAlign: "middle" }} />{k} <b style={{ fontFamily: MONO }}>{v}</b></span>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7, marginBottom: 10 }}>
              {([["CLOSE", s.close], ["ENTRY", s.entryZone], ["INVALID.", s.invalidation], ["TARGET", s.target]] as const).map(([label, v]) => (
                <div key={label} style={{ background: "var(--soft)", borderRadius: 9, padding: "7px 8px", textAlign: "center" }}>
                  <div style={{ fontSize: 8.5, color: "var(--faint)", letterSpacing: ".06em", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600 }}>{formatPrice(v)}</div>
                </div>
              ))}
            </div>

            <div style={{ marginBottom: 8 }}><CvdSpark values={s.cvdSpark} /><div style={{ fontSize: 9, color: "var(--faint)" }}>CVD (approx.) · last 30 sessions</div></div>

            <p style={{ margin: "0 0 10px", fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{s.why}</p>

            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "var(--faint)", flexWrap: "wrap" }}>
              <span>ADTV20 <b style={{ fontFamily: MONO }}>{formatNumber(s.medianValueTraded20 / 1e9, 1)}B</b></span>
              {s.kseiFootprint ? <span style={{ color: "var(--accent)", fontWeight: 600 }}>KSEI +{s.kseiFootprint.netDeltaPP}pp</span> : null}
              <span>src: {s.dataSource}</span>
              <div style={{ flex: 1 }} />
              <a href={s.tradingView} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>Verify on TradingView ↗</a>
            </div>
          </div>
        ))}
      </div>

      <HistorySection />
    </section>
  );
}
