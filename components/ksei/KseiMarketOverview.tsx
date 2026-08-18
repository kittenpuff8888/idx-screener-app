"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { formatAsOf, formatNumber } from "@/lib/format/number";
import { loadKseiTrend, type KseiTrend } from "@/lib/data/ksei";
import type { KseiPayload, InvestorEntry } from "@/lib/domain/types";

const MONO = "var(--mono, var(--font-mono))";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))", padding: "18px 20px" };
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };
const LOCAL = "var(--cat-1)", FOREIGN = "var(--cat-5)";

// KSEI investor categories in a fixed order (largest → smallest, stable colours).
const TYPE_ORDER = ["Corporate", "Individual", "Other", "Bank", "Securities", "Insurance", "Mutual Fund", "Pension Fund"] as const;
const TYPE_COLOR: Record<string, string> = {
  Corporate: "var(--cat-1)", Individual: "var(--cat-2)", Other: "var(--cat-8)", Bank: "var(--cat-3)",
  Securities: "var(--cat-4)", Insurance: "var(--cat-5)", "Mutual Fund": "var(--cat-6)", "Pension Fund": "var(--cat-7)",
};
const TYPE_CODE: Record<string, string> = {
  Corporate: "CO", Individual: "ID", Other: "OT", Bank: "BK", Securities: "SC", Insurance: "IS", "Mutual Fund": "MF", "Pension Fund": "PF",
};
const KNOWN = new Set<string>(TYPE_ORDER);
function normType(raw: string): string {
  const s = String(raw || "").trim();
  if (KNOWN.has(s)) return s;
  for (const t of TYPE_ORDER) if (s.endsWith(`- ${t}`) || s.endsWith(`-${t}`)) return t;
  return "Other";
}
// Proxy only — KSEI carries no broker nationality field.
function isForeignProxy(name: string): boolean {
  return /Limited|LTD\b|PTE|LLC|N\.V\.|S\.A\.|GmbH|PLC\b|FUND|GLOBAL|EMERGING|ROBUR|MAYBANK|NOMURA|JPMORGAN|MORGAN|CITI|HSBC|UBS|BNP|DEUTSCHE|VANGUARD|BLACKROCK|FIDELITY|ABU DHABI|GIC\b|TEMASEK|NORGES/i.test(name)
    && !/\bPT\.?\s|TBK|PERSERO|INDONESIA|NEGARA|DAERAH/i.test(name);
}

/** 2-segment ownership donut (design/4 · Market Ownership Hero). */
function Donut({ localPct, foreignPct, size = 120 }: { localPct: number; foreignPct: number; size?: number }) {
  const r = size / 2 - 10, c = 2 * Math.PI * r;
  const total = localPct + foreignPct || 1;
  const foreignLen = (foreignPct / total) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, transform: "rotate(-90deg)" }} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={LOCAL} strokeWidth={20} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={FOREIGN} strokeWidth={20} strokeDasharray={`${foreignLen} ${c - foreignLen}`} strokeDashoffset={0} />
    </svg>
  );
}

const shortDate = (asOf: string) => (formatAsOf(asOf) || asOf || "").replace(/\s*\d{4}$/, "");

export function KseiMarketOverview({ ksei }: { ksei: KseiPayload | null }) {
  const [trend, setTrend] = useState<KseiTrend | null>(null);
  useEffect(() => { loadKseiTrend().then(setTrend); }, []);

  const records = ksei?.records ?? [];

  // Aggregate disclosed-float share by KSEI type, split by the local/foreign name
  // proxy — real per-holder data, no price join. Powers the type-composition panels.
  const model = useMemo(() => {
    const typeLocal: Record<string, number> = {}, typeFgn: Record<string, number> = {};
    TYPE_ORDER.forEach((t) => { typeLocal[t] = 0; typeFgn[t] = 0; });
    let foreign = 0, local = 0, covered = 0;
    for (const t of records) {
      const holders = (t.investors || []) as InvestorEntry[];
      if (!holders.length) continue;
      covered++;
      for (const h of holders) {
        const pct = Number(h.percentage) || 0;
        const ty = normType(h.type);
        if (isForeignProxy(h.name)) { foreign += pct; typeFgn[ty] += pct; }
        else { local += pct; typeLocal[ty] += pct; }
      }
    }
    const totalFL = foreign + local || 1;
    return { foreignPct: (foreign / totalFL) * 100, localPct: (local / totalFL) * 100, covered, typeLocal, typeFgn, localSum: local, foreignSum: foreign };
  }, [records]);

  if (!ksei) return null;

  const snaps = trend?.snapshots ?? [];
  const latest = snaps.at(-1);
  const first = snaps[0];
  // Prefer the precomputed snapshot split (consistent with the trend line);
  // fall back to the live records aggregate when the trend feed is absent.
  const foreignPct = latest?.proxyForeignPct ?? model.foreignPct;
  const localPct = latest?.proxyLocalPct ?? model.localPct;
  const flowDelta = latest && first ? latest.proxyForeignPct - first.proxyForeignPct : 0;
  const trendStart = first ? shortDate(first.asOf) : "—";
  const flowUp = flowDelta > 0.05, flowDown = flowDelta < -0.05;
  const flowColor = flowUp ? FOREIGN : flowDown ? "var(--down)" : "var(--flat)";
  const flowWord = flowUp ? "foreign accumulating" : flowDown ? "steady local absorption" : "broadly flat";

  // Trend geometry (foreign proxy % across snapshots).
  const trendChart = (() => {
    const vals = snaps.map((s) => s.proxyForeignPct);
    if (vals.length < 2) return null;
    const min = Math.min(...vals), max = Math.max(...vals);
    const pad = Math.max(0.4, (max - min) * 0.35);
    const lo = min - pad, hi = max + pad, span = hi - lo || 1;
    const x = (i: number) => (i / (vals.length - 1)) * 100;
    const y = (v: number) => 4 + ((hi - v) / span) * 52;
    const pts = vals.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`);
    const lineD = `M ${pts.join(" L ")}`;
    const areaD = `${lineD} L ${x(vals.length - 1).toFixed(2)},60 L 0,60 Z`;
    const yTicks = [hi - pad * 0.5, (hi + lo) / 2, lo + pad * 0.5].map((v) => ({ label: `${v.toFixed(1)}%`, top: `${(((hi - v) / span) * 52 + 4) / 60 * 100}%` }));
    const xTicks = snaps.map((s, i) => ({ left: `${x(i)}%`, label: shortDate(s.asOf) }));
    return { lineD, areaD, pts: vals.map((v, i) => ({ x: x(i), y: y(v) })), yTicks, xTicks };
  })();

  const panels = [
    { label: "Local", color: LOCAL, total: localPct, sums: model.typeLocal, groupTotal: model.localSum },
    { label: "Foreign", color: FOREIGN, total: foreignPct, sums: model.typeFgn, groupTotal: model.foreignSum },
  ].map((p) => {
    const rows = TYPE_ORDER.map((t) => ({ type: t, pct: p.groupTotal > 0 ? (p.sums[t] / p.groupTotal) * 100 : 0 })).filter((r) => r.pct >= 0.05).sort((a, b) => b.pct - a.pct);
    return { ...p, rows };
  });

  return (
    <div style={{ marginBottom: 20 }}>
      {/* ═══ 1 · MARKET OWNERSHIP HERO ═══ */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(300px,1fr) minmax(360px,1.5fr)", gap: 14, marginBottom: 14 }}>
        {/* local vs foreign split */}
        <div style={{ ...CARD, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={KICKER}>LOCAL vs FOREIGN</span>
            <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".08em", color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px" }}>PROXY</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Donut localPct={localPct} foreignPct={foreignPct} />
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: LOCAL, flexShrink: 0 }} />
                <div><div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: LOCAL }}>{localPct.toFixed(1)}%</div><div style={{ fontSize: 10.5, color: "var(--muted)" }}>Local investors</div></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: FOREIGN, flexShrink: 0 }} />
                <div><div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 800, color: FOREIGN }}>{foreignPct.toFixed(1)}%</div><div style={{ fontSize: 10.5, color: "var(--muted)" }}>Foreign investors</div></div>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--hair)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8, background: "var(--soft)", color: flowColor }}>{flowUp ? "▲" : flowDown ? "▼" : "•"}</span>
            <div><div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: flowColor }}>{flowDelta > 0 ? "+" : ""}{flowDelta.toFixed(1)}pp foreign</div><div style={{ fontSize: 10.5, color: "var(--muted)" }}>since {trendStart} — {flowWord}</div></div>
          </div>
          <div style={{ fontSize: 9.5, color: "var(--faint)", marginTop: 10 }}>Foreign/local is a labelled name heuristic (KSEI carries no nationality field); snapshot cadence &amp; counts are real.</div>
        </div>

        {/* foreign ownership trend */}
        <div style={CARD}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
            <span style={KICKER}>FOREIGN OWNERSHIP · TREND</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: 10, color: "var(--faint)" }}>{snaps.length} KSEI snapshots{first && latest ? ` · ${trendStart} → ${shortDate(latest.asOf)}` : ""}</span>
          </div>
          {trendChart ? (
            <>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ position: "relative", width: 34, flex: "none", height: 170 }}>
                  {trendChart.yTicks.map((t, i) => (<div key={i} style={{ position: "absolute", right: 0, top: t.top, transform: "translateY(-50%)", fontFamily: MONO, fontSize: 9, color: "var(--faint)" }}>{t.label}</div>))}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ position: "relative", height: 170 }}>
                    {trendChart.yTicks.map((t, i) => (<div key={i} style={{ position: "absolute", left: 0, right: 0, top: t.top, borderTop: "1px solid var(--hair)" }} />))}
                    <svg viewBox="0 0 100 60" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
                      <path d={trendChart.areaD} fill={FOREIGN} fillOpacity={0.12} />
                      <path d={trendChart.lineD} fill="none" stroke={FOREIGN} strokeWidth={2.4} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                      {trendChart.pts.map((p, i) => (<circle key={i} cx={p.x} cy={p.y} r={3} fill="var(--panel)" stroke={FOREIGN} strokeWidth={2} vectorEffect="non-scaling-stroke" />))}
                    </svg>
                  </div>
                  <div style={{ position: "relative", height: 14, marginTop: 5 }}>
                    {trendChart.xTicks.map((t, i) => (<div key={i} style={{ position: "absolute", left: t.left, transform: "translateX(-50%)", fontFamily: MONO, fontSize: 8.5, color: "var(--faint)", whiteSpace: "nowrap" }}>{t.label}</div>))}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
                Foreign ownership has drifted <strong style={{ color: flowDown ? "var(--down)" : flowUp ? FOREIGN : "var(--muted)" }}>{flowDown ? "down" : flowUp ? "up" : "flat"} {Math.abs(flowDelta).toFixed(1)}pp</strong> across the window — {flowWord}.
              </div>
            </>
          ) : (
            <div style={{ fontSize: 11.5, color: "var(--faint)", padding: "30px 0" }}>A trend needs ≥2 committed KSEI snapshots — it accrues as monthly snapshots are ingested. Composition (left) is the latest snapshot.</div>
          )}
        </div>
      </div>

      {/* ═══ 2 · INVESTOR-TYPE COMPOSITION ═══ */}
      <div style={{ ...KICKER, margin: "18px 0 10px" }}>OWNERSHIP BY INVESTOR TYPE · KSEI CATEGORIES</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14, marginBottom: 14 }}>
        {panels.map((pn) => (
          <div key={pn.label} style={{ ...CARD, padding: "16px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: pn.color }} />
              <span style={{ fontSize: 12, fontWeight: 800 }}>{pn.label}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: pn.color }}>{pn.total.toFixed(1)}%</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 10, color: "var(--faint)" }}>of disclosed float</span>
            </div>
            {pn.rows.length ? (
              <>
                <div style={{ display: "flex", height: 16, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
                  {pn.rows.map((r) => (<div key={r.type} style={{ width: `${r.pct}%`, background: TYPE_COLOR[r.type] }} title={`${r.type} ${r.pct.toFixed(1)}%`} />))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  {pn.rows.map((r) => (
                    <div key={r.type} style={{ display: "flex", alignItems: "center", gap: 9, padding: "4px 0", borderTop: "1px solid var(--hair)" }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: TYPE_COLOR[r.type], flexShrink: 0 }} />
                      <span style={{ fontSize: 11.5, fontWeight: 600, flex: 1 }}>{r.type} <span style={{ fontFamily: MONO, fontSize: 9, color: "var(--faint)" }}>{TYPE_CODE[r.type]}</span></span>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700 }}>{r.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11.5, color: "var(--faint)", padding: "8px 0" }}>No {pn.label.toLowerCase()}-proxy holders classified in this snapshot.</div>
            )}
          </div>
        ))}
      </div>

      {/* ═══ 4 · SNAPSHOT LOG · DATA HEALTH ═══ */}
      <div style={{ ...KICKER, margin: "18px 0 10px" }}>KSEI SNAPSHOTS · DATA HEALTH</div>
      <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", background: "var(--soft)", borderBottom: "1px solid var(--border)", fontSize: 9, fontWeight: 700, letterSpacing: ".06em", color: "var(--faint)" }}>
          <span style={{ padding: "10px 14px" }}>AS OF</span>
          <span style={{ padding: "10px 12px", textAlign: "right" }}>TICKERS</span>
          <span style={{ padding: "10px 12px", textAlign: "right" }}>WITH HOLDERS</span>
          <span style={{ padding: "10px 12px", textAlign: "right" }}>FOREIGN PROXY</span>
          <span style={{ padding: "10px 12px" }}>STATUS</span>
        </div>
        {snaps.length ? (
          snaps.map((s, i) => {
            const current = i === snaps.length - 1;
            return (
              <div key={s.asOf} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", borderTop: "1px solid var(--hair)", alignItems: "center", background: current ? "var(--accentSoft)" : "transparent" }}>
                <span style={{ padding: "9px 14px", fontFamily: MONO, fontSize: 12, fontWeight: 700 }}>{formatAsOf(s.asOf) || s.asOf}</span>
                <span style={{ padding: "9px 12px", textAlign: "right", fontFamily: MONO, fontSize: 11.5 }}>{formatNumber(s.totalIssuers, 0)}</span>
                <span style={{ padding: "9px 12px", textAlign: "right", fontFamily: MONO, fontSize: 11.5 }}>{formatNumber(s.coverageIssuers, 0)}</span>
                <span style={{ padding: "9px 12px", textAlign: "right", fontFamily: MONO, fontSize: 11.5, color: FOREIGN }}>{s.proxyForeignPct.toFixed(1)}%</span>
                <span style={{ padding: "9px 12px" }}><span style={{ fontSize: 9.5, fontWeight: 700, color: current ? "var(--up)" : "var(--muted)", background: current ? "var(--upSoft)" : "var(--soft)", borderRadius: 6, padding: "2px 8px" }}>{current ? "current" : "archived"}</span></span>
              </div>
            );
          })
        ) : (
          <div style={{ padding: "20px", fontSize: 11.5, color: "var(--faint)" }}>Loading snapshot history…</div>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.5, maxWidth: 900, marginTop: 12 }}>
        Snapshot dates, ticker and coverage counts are the real KSEI manifest ({model.covered} issuers with holder lists in the latest). Market composition and the foreign-ownership trend use the labelled foreign/local <strong>name proxy</strong> — KSEI carries no broker-level nationality or buy/sell, so no drift is fabricated where the source shows none. Domicile is modelled from the investor name pending the real KSEI field.
      </div>
    </div>
  );
}
