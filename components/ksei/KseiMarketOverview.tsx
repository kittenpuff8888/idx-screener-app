"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { formatAsOf, formatNumber } from "@/lib/format/number";
import { loadKseiTrend, type KseiTrend } from "@/lib/data/ksei";
import type { KseiPayload, InvestorEntry } from "@/lib/domain/types";

const MONO = "var(--mono, var(--font-mono))";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))", padding: "16px 18px" };
const KICKER: CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };

// KSEI investor categories in a fixed order (largest → smallest, stable colours).
const TYPE_ORDER = ["Corporate", "Individual", "Other", "Bank", "Securities", "Insurance", "Mutual Fund", "Pension Fund"] as const;
const TYPE_COLOR: Record<string, string> = {
  Corporate: "var(--cat-1)", Individual: "var(--cat-2)", Other: "var(--cat-8)", Bank: "var(--cat-3)",
  Securities: "var(--cat-4)", Insurance: "var(--cat-5)", "Mutual Fund": "var(--cat-6)", "Pension Fund": "var(--cat-7)",
};
const KNOWN = new Set<string>(TYPE_ORDER);
function normType(raw: string): string {
  const s = String(raw || "").trim();
  if (KNOWN.has(s)) return s;
  for (const t of TYPE_ORDER) if (s.endsWith(`- ${t}`) || s.endsWith(`-${t}`)) return t;
  if (/Registrar/i.test(s)) return "Other";
  return "Other";
}
// Proxy only — KSEI carries no broker nationality field.
function isForeignProxy(name: string): boolean {
  return /Limited|LTD\b|PTE|LLC|N\.V\.|S\.A\.|GmbH|PLC\b|FUND|GLOBAL|EMERGING|ROBUR|MAYBANK|NOMURA|JPMORGAN|MORGAN|CITI|HSBC|UBS|BNP|DEUTSCHE|VANGUARD|BLACKROCK|FIDELITY|ABU DHABI|GIC\b|TEMASEK|NORGES/i.test(name)
    && !/\bPT\.?\s|TBK|PERSERO|INDONESIA|NEGARA|DAERAH/i.test(name);
}


function Donut({ segs, size = 120 }: { segs: Array<{ v: number; color: string }>; size?: number }) {
  const total = segs.reduce((s, x) => s + x.v, 0) || 1;
  const r = size / 2 - 9, c = 2 * Math.PI * r; let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--soft)" strokeWidth={9} />
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segs.filter((s) => s.v > 0).map((s, i) => { const len = (s.v / total) * c; const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={9} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} strokeLinecap="butt" />; off += len; return el; })}
      </g>
    </svg>
  );
}

export function KseiMarketOverview({ ksei }: { ksei: KseiPayload | null }) {
  const [trend, setTrend] = useState<KseiTrend | null>(null);
  useEffect(() => { loadKseiTrend().then(setTrend); }, []);

  const records = ksei?.records ?? [];

  // market-average float composition by KSEI type (real) + local/foreign proxy
  const model = useMemo(() => {
    const typeSum: Record<string, number> = {}; TYPE_ORDER.forEach((t) => (typeSum[t] = 0));
    let foreign = 0, local = 0, covered = 0;
    let totalShareholders = 0, foreignCo = 0, localCo = 0, unclassCo = 0;
    // Aggregate each holder across every issuer they appear in — breadth
    // (# of stocks held) is real from KSEI alone, no price join needed.
    const inv: Record<string, { name: string; type: string; stocks: number; foreign: boolean }> = {};
    for (const t of records) {
      const holders = (t.investors || []) as InvestorEntry[];
      if (!holders.length) { unclassCo++; continue; }
      covered++;
      totalShareholders += holders.length;
      // classify the company by its dominant (largest) holder's nationality proxy
      const top = holders.reduce((a, b) => (Number(b.percentage) || 0) > (Number(a.percentage) || 0) ? b : a, holders[0]);
      if (top) { if (isForeignProxy(top.name)) foreignCo++; else localCo++; } else unclassCo++;
      for (const h of holders) {
        const pct = Number(h.percentage) || 0;
        typeSum[normType(h.type)] = (typeSum[normType(h.type)] || 0) + pct;
        if (isForeignProxy(h.name)) foreign += pct; else local += pct;
        const key = String(h.name || "").trim().toUpperCase();
        if (!key) continue;
        (inv[key] ||= { name: String(h.name).trim(), type: normType(h.type), stocks: 0, foreign: isForeignProxy(h.name) }).stocks += 1;
      }
    }
    const totalType = Object.values(typeSum).reduce((a, b) => a + b, 0) || 1;
    const typeShare = TYPE_ORDER.map((t) => ({ type: t, pct: (typeSum[t] / totalType) * 100 })).filter((s) => s.pct >= 0.05);
    const totalFL = foreign + local || 1;
    const invList = Object.values(inv);
    const topInvestors = invList.slice().sort((a, b) => b.stocks - a.stocks).slice(0, 20);
    return {
      typeShare, foreignPct: (foreign / totalFL) * 100, localPct: (local / totalFL) * 100, covered, topInvestors,
      totalShareholders, uniqueInvestors: invList.length, multiStock: invList.filter((i) => i.stocks > 1).length,
      maxStocks: topInvestors[0]?.stocks ?? 0, foreignCo, localCo, unclassCo,
    };
  }, [records]);

  if (!ksei) return null;

  const asOf = formatAsOf(ksei.asOf) || ksei.asOf || "—";
  const snaps = trend?.snapshots ?? [];

  return (
    <div style={{ marginBottom: 20 }}>
      {/* 8 KPI tiles (design/4 Metrics) */}
      {(() => {
        const totalCo = model.foreignCo + model.localCo + model.unclassCo || 1;
        const tiles: Array<[string, string, string?]> = [
          ["Total Companies", formatNumber(model.covered, 0)],
          ["Total Shareholders", formatNumber(model.totalShareholders, 0)],
          ["Foreign", formatNumber(model.foreignCo, 0), `${((model.foreignCo / totalCo) * 100).toFixed(1)}%`],
          ["Local", formatNumber(model.localCo, 0), `${((model.localCo / totalCo) * 100).toFixed(1)}%`],
          ["Unclassified", formatNumber(model.unclassCo, 0), `${((model.unclassCo / totalCo) * 100).toFixed(1)}%`],
          ["Unique Investors", formatNumber(model.uniqueInvestors, 0)],
          ["Multi-Stock", formatNumber(model.multiStock, 0)],
          ["Max Stocks Held", formatNumber(model.maxStocks, 0)],
        ];
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 14 }}>
            {tiles.map(([k, v, sub]) => (
              <div key={k} style={CARD}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", color: "var(--faint)" }}>{k.toUpperCase()}</div>
                <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, marginTop: 4 }}>{v}</div>
                {sub ? <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{sub}</div> : null}
              </div>
            ))}
          </div>
        );
      })()}

      {/* LOCAL vs FOREIGN | INVESTOR TYPE donuts (design/4 Metrics) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14 }}>
        <div style={CARD}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><span style={KICKER}>LOCAL vs FOREIGN</span><span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".08em", color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px" }}>PROXY</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Donut segs={[{ v: model.localCo, color: "var(--cat-1)" }, { v: model.foreignCo, color: "var(--cat-5)" }, { v: model.unclassCo, color: "var(--cat-8)" }]} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9, fontSize: 12 }}>
              {([["Local", model.localCo, "var(--cat-1)"], ["Foreign", model.foreignCo, "var(--cat-5)"], ["Unclassified", model.unclassCo, "var(--cat-8)"]] as const).map(([l, v, c]) => {
                const totalCo = model.foreignCo + model.localCo + model.unclassCo || 1;
                return <div key={l} style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: c }} /><span style={{ color: "var(--muted)" }}>{l}</span><div style={{ flex: 1 }} /><b style={{ fontFamily: MONO }}>{((v / totalCo) * 100).toFixed(1)}%</b><span style={{ fontFamily: MONO, color: "var(--faint)", width: 32, textAlign: "right" }}>{v}</span></div>;
              })}
            </div>
          </div>
          <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 12, lineHeight: 1.45 }}>Each company classified by its dominant holder — a labelled name heuristic (KSEI carries no nationality field).</div>
        </div>
        <div style={CARD}>
          <div style={{ ...KICKER, marginBottom: 12 }}>INVESTOR TYPE</div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <Donut segs={model.typeShare.map((s) => ({ v: s.pct, color: TYPE_COLOR[s.type] }))} />
            <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px 14px", fontSize: 11 }}>
              {model.typeShare.map((s) => (
                <div key={s.type} style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: TYPE_COLOR[s.type], flexShrink: 0 }} /><span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.type}</span><div style={{ flex: 1 }} /><b style={{ fontFamily: MONO }}>{s.pct.toFixed(1)}%</b></div>
              ))}
            </div>
          </div>
          <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 12, lineHeight: 1.45 }}>Market-average share of disclosed float by KSEI investor category — real.</div>
        </div>
      </div>

      {/* TOP 20 investors by breadth (design/4 Metrics · "TOP 20 INVESTOR
          TERBANYAK"). Ranked by how many issuers each holder appears in —
          real from the registry, no price join. */}
      {model.topInvestors.length ? (
        <div style={{ ...CARD, marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <span style={KICKER}>TOP 20 INVESTORS · MOST POSITIONS</span>
            <span style={{ fontSize: 10, color: "var(--faint)" }}>by number of issuers held in the registry</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "2px 20px" }}>
            {model.topInvestors.map((v, i) => (
              <div key={v.name} style={{ display: "flex", alignItems: "center", gap: 9, padding: "6px 0", borderTop: i === 0 ? "none" : "1px solid var(--hair)", fontSize: 11.5 }}>
                <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--faint)", width: 20, textAlign: "right" }}>{i + 1}</span>
                <span style={{ color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }} title={v.name}>{v.name}</span>
                {v.foreign ? <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: ".06em", color: "var(--cat-4)", background: "var(--soft)", borderRadius: 4, padding: "1px 5px" }}>FGN</span> : null}
                <span style={{ fontSize: 10, color: "var(--muted)", width: 74, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.type}</span>
                <span style={{ fontFamily: MONO, fontWeight: 800, width: 52, textAlign: "right" }}>{formatNumber(v.stocks, 0)}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 12, lineHeight: 1.45 }}>Count of issuers each holder appears in across the latest KSEI snapshot — a breadth ranking, not by value (KSEI carries no market value). Foreign (FGN) is the same labelled-name proxy used above.</div>
        </div>
      ) : null}

      {/* data health — real snapshots */}
      <div style={{ ...CARD, marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <span style={KICKER}>KSEI SNAPSHOTS · DATA HEALTH</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 9.5, fontWeight: 700, color: "var(--up)" }}><span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--up)" }} /> KSEI live</span>
        </div>
        {snaps.length ? (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {snaps.map((s, i) => (
                <div key={s.asOf} style={{ border: `1px solid ${i === snaps.length - 1 ? "var(--accent)" : "var(--border)"}`, borderRadius: 10, padding: "10px 14px", minWidth: 150 }}>
                  <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800 }}>{formatAsOf(s.asOf) || s.asOf}</div>
                  <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3 }}>{formatNumber(s.totalIssuers, 0)} issuers · {formatNumber(s.coverageIssuers, 0)} with holders</div>
                  <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 2 }}>foreign proxy {s.proxyForeignPct.toFixed(1)}% · float {s.avgFreeFloat != null ? `${s.avgFreeFloat.toFixed(1)}%` : "—"}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 12, lineHeight: 1.5, maxWidth: 760 }}>
              {snaps.length} committed KSEI snapshots ({formatAsOf(snaps[0].asOf) || snaps[0].asOf} → {formatAsOf(snaps.at(-1)!.asOf) || snaps.at(-1)!.asOf}). Market-level ownership is
              near-static across them — aggregate composition and concentration barely move, and the latest comparison flags only removed/added issuers, not broad turnover. No drift is fabricated where the source shows none.
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11.5, color: "var(--faint)" }}>Loading snapshot history… (single-snapshot view if unavailable).</div>
        )}
      </div>
    </div>
  );
}

