"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { formatAsOf, formatNumber, formatPlainPercent } from "@/lib/format/number";
import { IDX_SECTOR_MAP, normalizeSector } from "@/lib/domain/sectors";
import type { InvestorEntry, KseiIssuer } from "@/lib/domain/types";

const MONO = "var(--mono, var(--font-mono))";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))" };
const KICKER: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };

type Tab = "ringkasan" | "investor" | "konglo" | "metrik" | "changelog";
const TABS: Array<[Tab, string]> = [
  ["ringkasan", "Stock Summary"],
  ["investor", "By Investor"],
  ["konglo", "Conglomerates"],
  ["metrik", "Metrics"],
  ["changelog", "Changelog"],
];

type Investor = { name: string; type: string; holdings: Array<{ code: string; name: string; pct: number }> };

function typeColor(ty: string): string {
  if (/Individual/i.test(ty)) return "var(--cat-4)";
  if (/Bank/i.test(ty)) return "var(--cat-9)";
  if (/Corporate/i.test(ty)) return "var(--cat-3)";
  return "var(--muted)";
}
// Foreign vs local is a labelled heuristic on the holder name — KSEI carries no
// broker-level nationality field, so this is a proxy, never authoritative.
function holderStatus(name: string): "Foreign" | "Local" {
  return /Bank|Limited|LTD|PTE|LLC|GROUP|INVESTMENT/i.test(name) && !/PT\.?\s|TBK|PERSERO/i.test(name) ? "Foreign" : "Local";
}

export function KseiPage() {
  const { ksei, openTicker } = useApp();
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [sort, setSort] = useState<"ticker" | "float" | "ccs">("ticker");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [focus, setFocus] = useState<string | null>(null);

  const records = ksei?.records ?? [];

  // ── aggregate every investor across issuers (real holder lists) ──
  const investors = useMemo<Investor[]>(() => {
    const agg = new Map<string, Investor>();
    records.forEach((t) =>
      t.investors.forEach((h: InvestorEntry) => {
        const key = h.name.toUpperCase();
        let e = agg.get(key);
        if (!e) {
          e = { name: h.name, type: h.type, holdings: [] };
          agg.set(key, e);
        }
        e.holdings.push({ code: t.ticker, name: t.companyName, pct: h.percentage });
      }),
    );
    return [...agg.values()].sort((a, b) => b.holdings.length - a.holdings.length);
  }, [records]);

  const focusInvestor = focus ? investors.find((i) => i.name === focus) || null : null;

  const sectorOpts = [{ v: "", label: "All Sectors" }, ...Object.entries(IDX_SECTOR_MAP).map(([v, label]) => ({ v, label }))];

  const ringkasanRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = records.filter((t) => {
      if (sector && t.idxSectorRaw !== sector) return false;
      if (needle && !(t.ticker.toLowerCase().includes(needle) || t.companyName.toLowerCase().includes(needle) || t.investors.some((h) => h.name.toLowerCase().includes(needle)))) return false;
      return true;
    });
    list = list.slice().sort((a, b) =>
      sort === "float" ? (b.freeFloat || 0) - (a.freeFloat || 0) : sort === "ccs" ? (b.ccs || 0) - (a.ccs || 0) : a.ticker.localeCompare(b.ticker),
    );
    return list;
  }, [records, q, sector, sort]);

  const perInvestor = investors.slice(0, 25);
  const konglo = investors.filter((r) => r.holdings.length >= 3).slice(0, 40);
  const changes = ksei?.investorChanges ?? [];

  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: "-.01em" }}>KSEI Ownership</h1>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 9px" }}>WHO OWNS WHAT</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: "var(--faint)" }}>Source: KSEI · as of {formatAsOf(ksei?.asOf) || ksei?.asOf || "—"}</span>
      </div>

      {/* tab bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map(([key, label]) => {
          const on = tab === key;
          return (
            <button key={key} type="button" onClick={() => setTab(key)} style={{ fontSize: 12.5, fontWeight: 700, padding: "9px 14px", border: "none", background: "transparent", color: on ? "var(--accent)" : "var(--muted)", cursor: "pointer", borderBottom: `2px solid ${on ? "var(--accent)" : "transparent"}`, marginBottom: -1 }}>
              {label}
            </button>
          );
        })}
      </div>

      {!ksei ? <div style={{ padding: "40px 0", textAlign: "center", color: "var(--faint)", fontSize: 12 }}>Loading the KSEI ownership snapshot…</div> : null}

      {/* ── STOCK SUMMARY ── */}
      {ksei && tab === "ringkasan" ? (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, ...CARD, borderRadius: 10, padding: "8px 12px", flex: 1, minWidth: 220, maxWidth: 360 }}>
              <span style={{ color: "var(--faint)", fontSize: 13 }}>⌕</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, company, or shareholder…" aria-label="Search issuers" style={{ border: "none", outline: "none", background: "transparent", fontSize: 12.5, color: "var(--text)", width: "100%" }} />
            </div>
            <select value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Filter by sector" style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", ...CARD, borderRadius: 10, padding: "8px 11px", cursor: "pointer" }}>
              {sectorOpts.map((o) => (<option key={o.v} value={o.v}>{o.label}</option>))}
            </select>
            <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--faint)" }}>Sort</span>
            <div style={{ display: "flex", gap: 3, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 9, padding: 3 }}>
              {([["ticker", "Ticker"], ["float", "Free Float"], ["ccs", "CCS"]] as const).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setSort(key)} style={{ fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 6, border: "none", cursor: "pointer", background: sort === key ? "var(--accent)" : "transparent", color: sort === key ? "#fff" : "var(--muted)" }}>{label}</button>
              ))}
            </div>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{formatNumber(ringkasanRows.length, 0)} stocks</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ringkasanRows.slice(0, 80).map((t) => (
              <IssuerRow key={t.ticker} t={t} expanded={!!expanded[t.ticker]} onToggle={() => setExpanded((m) => ({ ...m, [t.ticker]: !m[t.ticker] }))} onDetail={() => openTicker(t.ticker)} onFocus={setFocus} />
            ))}
            {!ringkasanRows.length ? <div style={{ padding: "40px 0", textAlign: "center", color: "var(--faint)", fontSize: 12 }}>No issuers match this filter.</div> : null}
          </div>
        </>
      ) : null}

      {/* ── BY INVESTOR ── */}
      {ksei && tab === "investor" ? (
        <>
          <div style={{ ...KICKER, marginBottom: 10 }}>TOP INVESTORS · ACROSS STOCKS — click a name to see its network</div>
          <div style={{ ...CARD, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 90px 2fr", background: "var(--soft)", borderBottom: "1px solid var(--border)", fontSize: 9, fontWeight: 700, letterSpacing: ".05em", color: "var(--faint)" }}>
              <span style={{ padding: "10px 14px" }}>INVESTOR</span><span style={{ padding: "10px 12px" }}>TYPE</span><span style={{ padding: "10px 12px", textAlign: "right" }}>HOLDINGS</span><span style={{ padding: "10px 12px" }}>STOCKS</span>
            </div>
            {perInvestor.map((r) => (
              <button key={r.name} type="button" onClick={() => setFocus(r.name)} style={{ display: "grid", gridTemplateColumns: "1fr 130px 90px 2fr", borderTop: "1px solid var(--hair)", alignItems: "center", cursor: "pointer", background: "transparent", width: "100%", textAlign: "left" }}>
                <span style={{ padding: "9px 14px", fontSize: 12, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--accent)" }}>{r.name}</span>
                <span style={{ padding: "9px 12px" }}><span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 5, padding: "2px 7px" }}>{r.type}</span></span>
                <span style={{ padding: "9px 12px", textAlign: "right", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>{r.holdings.length} {r.holdings.length === 1 ? "stock" : "stocks"}</span>
                <span style={{ padding: "9px 12px", fontFamily: MONO, fontSize: 10.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.holdings.slice(0, 12).map((h) => h.code).join(" · ")}{r.holdings.length > 12 ? " …" : ""}</span>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 10 }}>Aggregated from the real KSEI holder lists ({formatAsOf(ksei.asOf)}) — how many stocks each investor name appears in.</div>
        </>
      ) : null}

      {/* ── CONGLOMERATES ── */}
      {ksei && tab === "konglo" ? (
        <>
          <div style={{ ...KICKER, marginBottom: 10 }}>CONGLOMERATES · INVESTORS SPANNING ≥3 STOCKS — click for the network</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 12 }}>
            {konglo.map((r) => (
              <button key={r.name} type="button" onClick={() => setFocus(r.name)} style={{ ...CARD, borderRadius: 12, padding: "14px 16px", cursor: "pointer", textAlign: "left", color: "var(--text)" }}>
                <div style={{ fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 6 }}>{r.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 5, padding: "2px 7px" }}>{r.type}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>{r.holdings.length} stocks</span>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--muted)", lineHeight: 1.5 }}>{r.holdings.slice(0, 14).map((h) => h.code).join(" · ")}{r.holdings.length > 14 ? " …" : ""}</div>
              </button>
            ))}
            {!konglo.length ? <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No investor spans ≥3 issuers in this snapshot.</div> : null}
          </div>
          <div style={{ fontSize: 10, color: "var(--faint)", marginTop: 10 }}>Proxy for conglomerate footprints: the same investor name holding stakes across multiple stocks (real KSEI holder lists).</div>
        </>
      ) : null}

      {/* ── METRICS (real summary distributions) ── */}
      {ksei && tab === "metrik" ? <MetricsTab summary={ksei.summary} /> : null}

      {/* ── CHANGELOG ── */}
      {ksei && tab === "changelog" ? (
        <>
          <div style={{ ...KICKER, marginBottom: 10 }}>INVESTOR CHANGES · SINCE PRIOR SNAPSHOT (real)</div>
          {changes.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {changes.map((c, i) => {
                const dir = (c.newPercentage ?? 0) >= (c.oldPercentage ?? 0) ? "var(--up)" : "var(--down)";
                return (
                  <button key={i} type="button" onClick={() => openTicker(c.ticker)} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", ...CARD, borderRadius: 12, padding: "12px 16px", textAlign: "left", color: "var(--text)", cursor: "pointer" }}>
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 7, padding: "4px 9px" }}>{c.ticker}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{c.companyName}</span>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 6, padding: "3px 8px" }}>{c.changeType}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, flex: 1, minWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.investor}</span>
                    <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--muted)" }}>{c.oldPercentage != null ? `${c.oldPercentage}%` : "—"} → <strong style={{ color: dir }}>{c.newPercentage != null ? `${c.newPercentage}%` : "—"}</strong></span>
                    {c.notes ? <span style={{ fontSize: 10, color: "var(--faint)" }}>{c.notes}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div style={{ ...CARD, padding: "24px 18px", color: "var(--muted)", fontSize: 13 }}>No investor changes reported in this snapshot — the KSEI diff is empty for {formatAsOf(ksei.asOf)}. Changes accumulate as new monthly snapshots are ingested.</div>
          )}
        </>
      ) : null}

      {/* connection network modal */}
      {focusInvestor ? <NetworkModal investor={focusInvestor} onClose={() => setFocus(null)} onTicker={(t) => { setFocus(null); openTicker(t); }} /> : null}
    </section>
  );
}

function IssuerRow({ t, expanded, onToggle, onDetail, onFocus }: { t: KseiIssuer; expanded: boolean; onToggle: () => void; onDetail: () => void; onFocus: (name: string) => void }) {
  const sectorLabel = normalizeSector(t.idxSectorRaw);
  return (
    <div style={{ ...CARD, borderRadius: 12, overflow: "hidden" }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", flexWrap: "wrap" }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 7, padding: "4px 9px" }}>{t.ticker}</span>
        <span style={{ fontSize: 13, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{t.companyName}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 6, padding: "3px 8px" }}>{sectorLabel}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 6, padding: "3px 8px" }}>Float {t.freeFloat == null ? "—" : formatPlainPercent(t.freeFloat)}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 6, padding: "3px 8px" }}>{t.ccs == null ? "CCS —" : `CCS ${t.ccs}`}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 6, padding: "3px 8px" }}>{t.ownershipType}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--faint)" }}>{t.holderCount ?? t.investors.length} holders</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDetail(); }} style={{ fontSize: 10.5, fontWeight: 700, color: "var(--accent)", background: "transparent", border: "none", cursor: "pointer" }}>Detail →</button>
      </div>
      {expanded ? (
        <div style={{ borderTop: "1px solid var(--hair)", padding: "2px 16px 10px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 120px 80px 96px", gap: 8, padding: "8px 0 6px", borderBottom: "1px solid var(--hair)", fontSize: 9, fontWeight: 700, letterSpacing: ".05em", color: "var(--faint)" }}>
            <span>#</span><span>SHAREHOLDER</span><span>INVESTOR TYPE</span><span>STATUS</span><span style={{ textAlign: "right" }}>% OWNERSHIP</span>
          </div>
          {t.investors.map((h, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr 120px 80px 96px", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--hair)" }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--faint)" }}>{i + 1}</span>
              <span onClick={(e) => { e.stopPropagation(); onFocus(h.name); }} title="Show connections" style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer", color: "var(--accent)" }}>{h.name}</span>
              <span><span style={{ fontSize: 10, fontWeight: 700, color: typeColor(h.type), background: "var(--soft)", borderRadius: 5, padding: "2px 7px" }}>{h.type}</span></span>
              <span style={{ fontSize: 10.5, color: "var(--muted)" }}>{holderStatus(h.name)}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                <span style={{ height: 5, width: `${Math.min(60, h.percentage)}%`, maxWidth: 60, background: "var(--accent)", borderRadius: 3 }} />
                <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, width: 52, textAlign: "right" }}>{h.percentage.toFixed(2)}%</span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MetricsTab({ summary }: { summary: Record<string, unknown> }) {
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  const dist = (v: unknown): Array<[string, number]> => {
    if (!v || typeof v !== "object") return [];
    return Object.entries(v as Record<string, unknown>).map(([k, n]) => [k, Number(n) || 0] as [string, number]).sort((a, b) => b[1] - a[1]);
  };
  const ownershipTypes = dist(summary.ownershipTypes);
  const ccsCategories = dist(summary.ccsCategories);
  const sectors = dist(summary.sectors);
  const total = num(summary.totalIssuers) ?? ownershipTypes.reduce((s, [, n]) => s + n, 0);
  const palette = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--cat-5)", "var(--cat-6)", "var(--cat-7)", "var(--cat-8)"];

  const avgFloat = num(summary.averageFreeFloat);
  const avgHhi = num(summary.averageHHI);
  const tiles: Array<[string, string, string]> = [
    ["ISSUERS", formatNumber(total, 0), "in the snapshot"],
    ["AVG FREE FLOAT", avgFloat == null ? "—" : `${avgFloat.toFixed(1)}%`, "market average"],
    ["AVG HHI", avgHhi == null ? "—" : formatNumber(avgHhi, 0), "concentration index"],
    ["HIGH CONCENTRATION", formatNumber(num(summary.highConcentrationIssuers), 0), "issuers · HHI-heavy"],
  ];

  const Bars = ({ title, rows }: { title: string; rows: Array<[string, number]> }) => {
    const max = Math.max(1, ...rows.map(([, n]) => n));
    return (
      <div style={{ ...CARD, padding: "16px 18px" }}>
        <div style={{ ...KICKER, marginBottom: 12 }}>{title}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {rows.map(([label, n], i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, width: 140, flex: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
              <span style={{ flex: 1, height: 8, background: "var(--soft)", borderRadius: 4, overflow: "hidden" }}>
                <span style={{ display: "block", width: `${(n / max) * 100}%`, height: "100%", background: palette[i % palette.length], borderRadius: 4 }} />
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700, width: 44, textAlign: "right" }}>{formatNumber(n, 0)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 14 }}>
        {tiles.map(([label, value, note]) => (
          <div key={label} style={{ ...CARD, padding: "15px 18px" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)" }}>{label}</div>
            <div style={{ fontFamily: MONO, fontSize: 24, fontWeight: 800, marginTop: 4 }}>{value}</div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 2 }}>{note}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 14, marginBottom: 14 }}>
        <Bars title="OWNERSHIP TYPE · ISSUER COUNT" rows={ownershipTypes} />
        <Bars title="CONCENTRATION (CCS) · ISSUER COUNT" rows={ccsCategories} />
      </div>
      {sectors.length ? <div style={{ marginBottom: 14 }}><Bars title="ISSUERS BY SECTOR" rows={sectors.map(([k, n]) => [normalizeSector(k), n] as [string, number])} /></div> : null}
      <div style={{ fontSize: 10.5, color: "var(--faint)", lineHeight: 1.5, maxWidth: 900 }}>
        Real KSEI summary ({formatAsOf(String(summary.asOf ?? "")) || "latest snapshot"}). Market-level foreign/local composition and the foreign-ownership trend are <strong>not shown</strong> — those require the full 955×5,206 nationality snapshot, which is not in this feed, and are never fabricated. KSEI carries no broker-level buy/sell, so foreign vs local is only ever a labelled proxy.
      </div>
    </>
  );
}

function NetworkModal({ investor, onClose, onTicker }: { investor: Investor; onClose: () => void; onTicker: (t: string) => void }) {
  const hs = investor.holdings.slice(0, 16);
  const cx = 210;
  const cy = 150;
  const R = 118;
  const nodes = hs.map((h, i) => {
    const a = (i / hs.length) * Math.PI * 2 - Math.PI / 2;
    const r = 26 + Math.min(22, h.pct * 0.9);
    return { code: h.code, x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), r, fs: r > 34 ? 11 : 9 };
  });
  return (
    <div onClick={onClose} role="dialog" aria-modal aria-label={`${investor.name} holdings network`} style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(11,14,20,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...CARD, borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,.35)", width: "min(860px,96vw)", maxHeight: "90vh", overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--hair)", position: "sticky", top: 0, background: "var(--panel)", zIndex: 2 }}>
          <span style={{ width: 34, height: 34, flex: "none", borderRadius: 9, background: "var(--accentSoft)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }} aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M7.7 7.5L11 16M16.3 7.5L13 16" /></svg>
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{investor.name}</div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{investor.type} · holds {investor.holdings.length} stocks</div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,1.3fr) minmax(180px,1fr)" }}>
          <div style={{ padding: "14px 18px", borderRight: "1px solid var(--hair)" }}>
            <svg viewBox="0 0 420 300" style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="Holdings network">
              {nodes.map((d, i) => (<line key={`l${i}`} x1={cx} y1={cy} x2={d.x} y2={d.y} stroke="var(--border)" strokeWidth={1.5} />))}
              {nodes.map((d, i) => (
                <g key={`n${i}`}>
                  <circle cx={d.x} cy={d.y} r={d.r} fill="var(--accentSoft)" stroke="var(--accent)" strokeWidth={1.5} />
                  <text x={d.x} y={d.y} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize={d.fs} fontWeight={800} fill="var(--accent)">{d.code}</text>
                </g>
              ))}
              <circle cx={cx} cy={cy} r={30} fill="var(--accent)" />
              <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={10} fontWeight={800} fill="#fff">INVESTOR</text>
            </svg>
            <div style={{ fontSize: 10, color: "var(--faint)", textAlign: "center", marginTop: 6 }}>Node size = stake %. Lines link the investor to every stock it holds.</div>
          </div>
          <div style={{ padding: "10px 8px", overflow: "auto" }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--faint)", padding: "4px 10px" }}>LINKED STOCKS</div>
            {investor.holdings.map((h, i) => (
              <button key={i} type="button" onClick={() => onTicker(h.code)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderRadius: 8, color: "var(--text)", width: "100%", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: "var(--accent)", width: 52, flex: "none" }}>{h.code}</span>
                <span style={{ fontSize: 11, color: "var(--muted)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700 }}>{h.pct.toFixed(2)}%</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
