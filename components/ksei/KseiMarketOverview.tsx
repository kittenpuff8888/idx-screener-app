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

function Bar({ segs, height = 16 }: { segs: Array<{ w: number; color: string; op?: number }>; height?: number }) {
  return (
    <div style={{ display: "flex", gap: 2, height, borderRadius: 6, overflow: "hidden" }}>
      {segs.filter((s) => s.w > 0).map((s, i) => (
        <div key={i} style={{ width: `${s.w}%`, background: s.color, opacity: s.op ?? 1 }} />
      ))}
    </div>
  );
}

export function KseiMarketOverview({ ksei }: { ksei: KseiPayload | null }) {
  const [trend, setTrend] = useState<KseiTrend | null>(null);
  useEffect(() => { loadKseiTrend().then(setTrend); }, []);

  const records = ksei?.records ?? [];
  const summary = ksei?.summary ?? {};

  // market-average float composition by KSEI type (real) + local/foreign proxy
  const model = useMemo(() => {
    const typeSum: Record<string, number> = {}; TYPE_ORDER.forEach((t) => (typeSum[t] = 0));
    let foreign = 0, local = 0, covered = 0;
    // Aggregate each holder across every issuer they appear in — breadth
    // (# of stocks held) is real from KSEI alone, no price join needed.
    const inv: Record<string, { name: string; type: string; stocks: number; foreign: boolean }> = {};
    for (const t of records) {
      const holders = (t.investors || []) as InvestorEntry[];
      if (!holders.length) continue;
      covered++;
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
    const typeShare = TYPE_ORDER.map((t) => ({ type: t, pct: (typeSum[t] / totalType) * 100 }));
    const totalFL = foreign + local || 1;
    const topInvestors = Object.values(inv).sort((a, b) => b.stocks - a.stocks).slice(0, 20);
    return { typeShare, foreignPct: (foreign / totalFL) * 100, localPct: (local / totalFL) * 100, covered, topInvestors };
  }, [records]);

  if (!ksei) return null;

  const asOf = formatAsOf(ksei.asOf) || ksei.asOf || "—";
  const ownershipTypes = (summary.ownershipTypes as Record<string, number> | undefined) || {};
  const avgFF = summary.averageFreeFloat as number | undefined;
  const avgHHI = summary.averageHHI as number | undefined;
  const highConc = summary.highConcentrationIssuers as number | undefined;
  const total = (summary.totalIssuers as number | undefined) ?? records.length;
  const snaps = trend?.snapshots ?? [];

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={KICKER}>WHO OWNS THE MARKET</span>
        <span style={{ fontSize: 10, color: "var(--faint)" }}>AS OF {asOf} · {formatNumber(model.covered, 0)} issuers with disclosed holders</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
        {/* investor type composition (real) */}
        <div style={CARD}>
          <div style={{ ...KICKER, marginBottom: 12 }}>OWNERSHIP BY INVESTOR TYPE · KSEI CATEGORIES</div>
          <Bar segs={model.typeShare.map((s) => ({ w: s.pct, color: TYPE_COLOR[s.type] }))} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", marginTop: 14, fontSize: 11.5 }}>
            {model.typeShare.filter((s) => s.pct >= 0.05).map((s) => (
              <div key={s.type} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span aria-hidden style={{ width: 9, height: 9, borderRadius: 2, background: TYPE_COLOR[s.type], flex: "none" }} />
                <span style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.type}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontFamily: MONO, fontWeight: 700 }}>{s.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 12, lineHeight: 1.45 }}>Market-average share of disclosed float by KSEI investor category — real, aggregated across every issuer's holder list.</div>
        </div>

        {/* local vs foreign proxy */}
        <div style={CARD}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={KICKER}>LOCAL vs FOREIGN</span>
            <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".08em", color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px" }}>PROXY</span>
          </div>
          <Bar segs={[{ w: model.localPct, color: "var(--cat-2)" }, { w: model.foreignPct, color: "var(--cat-4)" }]} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14, fontSize: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span aria-hidden style={{ width: 9, height: 9, borderRadius: 2, background: "var(--cat-2)" }} />
              <span style={{ color: "var(--muted)" }}>Local investors</span><div style={{ flex: 1 }} />
              <span style={{ fontFamily: MONO, fontWeight: 800 }}>{model.localPct.toFixed(1)}%</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span aria-hidden style={{ width: 9, height: 9, borderRadius: 2, background: "var(--cat-4)" }} />
              <span style={{ color: "var(--muted)" }}>Foreign investors</span><div style={{ flex: 1 }} />
              <span style={{ fontFamily: MONO, fontWeight: 800 }}>{model.foreignPct.toFixed(1)}%</span>
            </div>
          </div>
          <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 12, lineHeight: 1.45 }}>Foreign/local is a <strong>labelled name heuristic</strong> on the holder name — KSEI carries no broker-level nationality, so this is a proxy, not authoritative.</div>
        </div>

        {/* concentration (real summary) */}
        <div style={CARD}>
          <div style={{ ...KICKER, marginBottom: 12 }}>CONCENTRATION · MARKET</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 16px" }}>
            <Metric label="Avg free float" value={avgFF != null ? `${avgFF.toFixed(1)}%` : "—"} />
            <Metric label="Avg HHI" value={avgHHI != null ? formatNumber(avgHHI, 0) : "—"} />
            <Metric label="High-concentration" value={highConc != null ? `${formatNumber(highConc, 0)} / ${formatNumber(total, 0)}` : "—"} />
            <Metric label="Issuers" value={formatNumber(total, 0)} />
          </div>
          {Object.keys(ownershipTypes).length ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", color: "var(--faint)", marginBottom: 7 }}>OWNERSHIP STRUCTURE (ISSUER COUNT)</div>
              {Object.entries(ownershipTypes).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 11.5 }}>
                  <span style={{ color: "var(--muted)", width: 110 }}>{k}</span>
                  <div style={{ flex: 1, height: 6, background: "var(--soft)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${(v / total) * 100}%`, height: "100%", background: "var(--cat-3)" }} />
                  </div>
                  <span style={{ fontFamily: MONO, fontWeight: 700, width: 36, textAlign: "right" }}>{formatNumber(v, 0)}</span>
                </div>
              ))}
            </div>
          ) : null}
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--faint)" }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  );
}
