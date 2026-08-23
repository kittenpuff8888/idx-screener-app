"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { formatAsOf, formatNumber, formatPlainPercent, formatPrice } from "@/lib/format/number";
import { IDX_SECTOR_MAP, normalizeSector } from "@/lib/domain/sectors";
import type { InvestorEntry, KseiIssuer, KseiPayload } from "@/lib/domain/types";
import { KseiMarketOverview } from "./KseiMarketOverview";
import { KseiNetwork } from "./KseiNetwork";
import { PageHeader } from "@/components/shared/PageHeader";

const MONO = "var(--mono, var(--font-mono))";
const CARD: CSSProperties = { background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "var(--r)", boxShadow: "var(--sh, var(--shadow))" };
const KICKER: CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" };

type Tab = "ringkasan" | "investor" | "konglo" | "metrik" | "changelog";
const TABS: Array<[Tab, string]> = [
  ["ringkasan", "Stock Summary"],
  ["investor", "By Investor"],
  ["konglo", "Shared-Holder Groups"],
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
function isForeignProxy(name: string): boolean {
  return /Limited|LTD\b|PTE|LLC|N\.V\.|S\.A\.|GmbH|PLC\b|FUND|GLOBAL|EMERGING|ROBUR|MAYBANK|NOMURA|JPMORGAN|MORGAN|CITI|HSBC|UBS|BNP|DEUTSCHE|VANGUARD|BLACKROCK|FIDELITY|ABU DHABI|GIC\b|TEMASEK|NORGES|SCHRODER|DBS|STATE STREET/i.test(name)
    && !/\bPT\.?\s|TBK|PERSERO|INDONESIA|NEGARA|DAERAH/i.test(name);
}
function holderStatus(name: string): "Foreign" | "Local" {
  return isForeignProxy(name) ? "Foreign" : "Local";
}
// KSEI investor-type buckets (for the By-Investor type filter pills).
const INV_TYPES = ["Corporate", "Individual", "Bank", "Mutual Fund", "Securities", "Insurance", "Pension Fund", "Custodian", "Other"] as const;
const INV_TYPE_COLOR: Record<string, string> = {
  Corporate: "var(--cat-1)", Individual: "var(--cat-2)", Bank: "var(--cat-3)", "Mutual Fund": "var(--cat-6)",
  Securities: "var(--cat-4)", Insurance: "var(--cat-5)", "Pension Fund": "var(--cat-7)", Custodian: "var(--cat-8)", Other: "var(--muted)",
};
function normType(raw: string): string {
  const s = String(raw || "").trim();
  for (const t of INV_TYPES) if (s === t || s.endsWith(`- ${t}`) || s.endsWith(`-${t}`) || new RegExp(t.replace(" ", "\\s*"), "i").test(s)) return t;
  return "Other";
}
// Compact Rp value for portfolio totals: bn → "X.X T" / "X B".
function fmtValue(bn: number): string {
  if (!Number.isFinite(bn) || bn <= 0) return "—";
  return bn >= 1000 ? `${(bn / 1000).toFixed(bn >= 100000 ? 0 : 2)} T` : `${Math.round(bn)} B`;
}

export function KseiPage() {
  const { ksei, openTicker, bundle } = useApp();
  const [tab, setTab] = useState<Tab>("ringkasan");
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [floatMin, setFloatMin] = useState(0);
  const [sort, setSort] = useState<"ticker" | "float" | "ccs">("ticker");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [focus, setFocus] = useState<string | null>(null);
  const [invQ, setInvQ] = useState("");
  const [invType, setInvType] = useState<string | null>(null);
  const [selectedInv, setSelectedInv] = useState<string | null>(null);
  const [kongloQ, setKongloQ] = useState("");

  const records = ksei?.records ?? [];

  // ticker → market cap (Rp bn) for portfolio-value totals.
  const mcapOf = useMemo(() => {
    const m = new Map<string, number>();
    records.forEach((t) => {
      const raw = bundle?.fundamentals.get(t.ticker)?.["Market Cap"];
      const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, ""));
      if (Number.isFinite(n) && n > 0) m.set(t.ticker, n);
    });
    return m;
  }, [records, bundle]);

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

  // Enrich each investor with a normalised type, foreign proxy, and portfolio
  // value (Σ stake% × market cap). Value is partial where a holding's mcap is
  // still filling from the fundamentals fetch.
  const investorMeta = useMemo(() => investors.map((inv) => ({
    ...inv,
    ntype: normType(inv.type),
    foreign: isForeignProxy(inv.name),
    value: inv.holdings.reduce((s, h) => { const mc = mcapOf.get(h.code); return mc ? s + (h.pct / 100) * mc : s; }, 0),
  })), [investors, mcapOf]);
  const byInvestorList = useMemo(() => {
    const needle = invQ.trim().toLowerCase();
    return investorMeta.filter((i) =>
      (!invType || i.ntype === invType) &&
      (!needle || i.name.toLowerCase().includes(needle) || i.holdings.some((h) => h.code.toLowerCase().includes(needle))),
    ).slice(0, 250);
  }, [investorMeta, invQ, invType]);
  const selectedInvestor = selectedInv ? investorMeta.find((i) => i.name === selectedInv) || null : null;

  const sectorOpts = [{ v: "", label: "All Sectors" }, ...Object.entries(IDX_SECTOR_MAP).map(([v, label]) => ({ v, label }))];

  const ringkasanRows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = records.filter((t) => {
      if (sector && t.idxSectorRaw !== sector) return false;
      if (floatMin > 0 && (t.freeFloat == null || t.freeFloat < floatMin)) return false;
      if (needle && !(t.ticker.toLowerCase().includes(needle) || t.companyName.toLowerCase().includes(needle) || t.investors.some((h) => h.name.toLowerCase().includes(needle)))) return false;
      return true;
    });
    list = list.slice().sort((a, b) =>
      sort === "float" ? (b.freeFloat || 0) - (a.freeFloat || 0) : sort === "ccs" ? (b.ccs || 0) - (a.ccs || 0) : a.ticker.localeCompare(b.ticker),
    );
    return list;
  }, [records, q, sector, sort, floatMin]);

  const kongloAll = useMemo(() => investorMeta.filter((r) => r.holdings.length >= 3), [investorMeta]);
  const kongloList = useMemo(() => {
    const needle = kongloQ.trim().toLowerCase();
    return kongloAll.filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.holdings.some((h) => h.code.toLowerCase().includes(needle))).slice(0, 200);
  }, [kongloAll, kongloQ]);
  const changes = ksei?.investorChanges ?? [];

  // ── Changelog (design/4): snapshot diff — new/delisted stocks + per-ticker
  //    shareholder changes. Near-static snapshots read mostly zero, honestly. ──
  const recordByTicker = useMemo(() => { const m = new Map<string, KseiIssuer>(); records.forEach((r) => m.set(r.ticker, r)); return m; }, [records]);
  const changelog = useMemo(() => {
    const cmp = ksei?.comparison;
    const counts = new Map<string, { added: number; exited: number }>();
    changes.forEach((c) => {
      const e = counts.get(c.ticker) || { added: 0, exited: 0 };
      const isNew = /add|new|masuk|baru/i.test(c.changeType) || (c.oldPercentage == null && c.newPercentage != null);
      const isExit = /remov|exit|keluar|hilang/i.test(c.changeType) || (c.newPercentage == null && c.oldPercentage != null);
      if (isExit) e.exited++; else if (isNew) e.added++; else e.added++;
      counts.set(c.ticker, e);
    });
    const newStocks = (cmp?.newTickers ?? []).map((tk) => ({ code: tk, name: recordByTicker.get(tk)?.companyName ?? tk, investors: recordByTicker.get(tk)?.holderCount ?? recordByTicker.get(tk)?.investors.length ?? 0 }));
    const changedTk = cmp?.changedTickers?.length ? cmp.changedTickers : [...counts.keys()];
    const shareholderChanges = changedTk.map((tk) => ({ code: tk, name: recordByTicker.get(tk)?.companyName ?? tk, ...(counts.get(tk) || { added: 0, exited: 0 }) }));
    return {
      previousAsOf: cmp?.previousAsOf ?? "",
      newStocks, delisted: cmp?.removedTickers ?? [], shareholderChanges,
      newInvestors: cmp?.newInvestors ?? 0, exitedInvestors: cmp?.exitedInvestors ?? 0,
    };
  }, [ksei, changes, records, recordByTicker]);

  return (
    <section>
      <PageHeader title="KSEI Ownership" pill="WHO OWNS WHAT">
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: "var(--faint)" }}>Source: KSEI · as of {formatAsOf(ksei?.asOf) || ksei?.asOf || "—"}</span>
      </PageHeader>

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
            <div style={{ display: "flex", alignItems: "center", gap: 8, ...CARD, borderRadius: 10, padding: "6px 12px" }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".06em", color: "var(--faint)", flex: "none" }}>FREE FLOAT</span>
              <input type="range" min={0} max={100} step={5} value={floatMin} onChange={(e) => setFloatMin(Number(e.target.value))} aria-label="Minimum free float" style={{ width: 90, accentColor: "var(--accent)", cursor: "pointer" }} />
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: floatMin > 0 ? "var(--accent)" : "var(--muted)", width: 46 }}>{floatMin === 0 ? "0–100%" : `≥ ${floatMin}%`}</span>
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
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{formatNumber(ringkasanRows.length, 0)} companies</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ringkasanRows.slice(0, 80).map((t) => (
              <IssuerRow key={t.ticker} t={t} price={typeof bundle?.technical.get(t.ticker)?.lastPrice === "number" ? (bundle!.technical.get(t.ticker)!.lastPrice as number) : null} mcapRaw={bundle?.fundamentals.get(t.ticker)?.["Market Cap"]} expanded={!!expanded[t.ticker]} onToggle={() => setExpanded((m) => ({ ...m, [t.ticker]: !m[t.ticker] }))} onDetail={() => openTicker(t.ticker)} onFocus={setFocus} />
            ))}
            {!ringkasanRows.length ? <div style={{ padding: "40px 0", textAlign: "center", color: "var(--faint)", fontSize: 12 }}>No issuers match this filter.</div> : null}
          </div>
        </>
      ) : null}

      {/* ── BY INVESTOR ── */}
      {ksei && tab === "investor" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,1fr) minmax(360px,1.6fr)", gap: 16, alignItems: "start" }}>
          {/* LEFT: investor list — search, type pills, cards */}
          <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: 10, borderBottom: "1px solid var(--hair)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px", marginBottom: 8 }}>
                <span style={{ color: "var(--faint)", fontSize: 12 }}>⌕</span>
                <input value={invQ} onChange={(e) => setInvQ(e.target.value)} placeholder="Search investor…" aria-label="Search investor" style={{ border: "none", outline: "none", background: "transparent", fontSize: 12.5, color: "var(--text)", width: "100%" }} />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {INV_TYPES.map((ty) => {
                  const on = invType === ty;
                  return <button key={ty} type="button" onClick={() => setInvType(on ? null : ty)} style={{ fontSize: 10.5, fontWeight: 700, padding: "4px 9px", borderRadius: 999, border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`, background: on ? "var(--accent)" : "transparent", color: on ? "#fff" : "var(--muted)", cursor: "pointer" }}>{ty}</button>;
                })}
              </div>
            </div>
            <div style={{ maxHeight: 560, overflowY: "auto" }}>
              {byInvestorList.map((r) => {
                const on = selectedInv === r.name;
                return (
                  <button key={r.name} type="button" onClick={() => setSelectedInv(r.name)} style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", border: "none", borderBottom: "1px solid var(--hair)", background: on ? "var(--accentSoft)" : "transparent", cursor: "pointer", color: "var(--text)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{r.name}</span>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: r.foreign ? "var(--cat-5)" : "var(--cat-1)" }}>{r.foreign ? "Foreign" : "Local"}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 5, padding: "2px 7px" }}>{r.ntype}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--muted)" }}>{r.holdings.length} companies</span>
                      <div style={{ flex: 1 }} />
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: "var(--accent)" }}>{fmtValue(r.value)}</span>
                    </div>
                  </button>
                );
              })}
              {!byInvestorList.length ? <div style={{ padding: 24, textAlign: "center", color: "var(--faint)", fontSize: 12 }}>No investor matches this filter.</div> : null}
            </div>
            <div style={{ padding: "9px 14px", fontSize: 9.5, color: "var(--faint)", lineHeight: 1.4 }}>{byInvestorList.length} of {investorMeta.length} investors · value = Σ stake% × market cap (partial where mcap is still filling). Foreign is a labelled name proxy.</div>
          </div>
          {/* RIGHT: selected investor — portfolio + connection network */}
          <div style={{ ...CARD, minHeight: 320 }}>
            {selectedInvestor ? (
              <>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedInvestor.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{selectedInvestor.ntype} · {selectedInvestor.foreign ? "Foreign" : "Local"} · {selectedInvestor.holdings.length} companies · {fmtValue(selectedInvestor.value)}</div>
                </div>
                <KseiNetwork ksei={ksei} anchor={{ type: "inv", id: selectedInvestor.name }} />
                <div style={{ ...KICKER, margin: "14px 0 6px" }}>PORTFOLIO · HOLDINGS</div>
                <div style={{ maxHeight: 300, overflowY: "auto" }}>
                  {[...selectedInvestor.holdings].sort((a, b) => b.pct - a.pct).map((h, i) => (
                    <button key={h.code + i} type="button" onClick={() => openTicker(h.code)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "7px 0", border: "none", borderTop: i ? "1px solid var(--hair)" : "none", background: "transparent", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: "var(--accent)", width: 56, flex: "none" }}>{h.code}</span>
                      <span style={{ fontSize: 11, color: "var(--muted)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700 }}>{h.pct.toFixed(2)}%</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 280, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>Select an investor</div>
                <div style={{ fontSize: 12, marginTop: 4, color: "var(--faint)" }}>See each investor&apos;s portfolio, holdings, and connection network.</div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ── CONGLOMERATES (design/4: card grid → click opens the network) ── */}
      {ksei && tab === "konglo" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(320px,1fr) minmax(360px,1.6fr)", gap: 16, alignItems: "start" }}>
          {/* LEFT: group list (≥3-stock holders as conglomerate-scale footprints) */}
          <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: 10, borderBottom: "1px solid var(--hair)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 8, padding: "7px 10px" }}>
                <span style={{ color: "var(--faint)", fontSize: 12 }}>⌕</span>
                <input value={kongloQ} onChange={(e) => setKongloQ(e.target.value)} placeholder="Search conglomerate group or ticker…" aria-label="Search groups" style={{ border: "none", outline: "none", background: "transparent", fontSize: 12.5, color: "var(--text)", width: "100%" }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", borderBottom: "1px solid var(--hair)" }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".08em", color: "var(--faint)" }}>GROUPS</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{kongloAll.length}</span>
            </div>
            <div style={{ maxHeight: 560, overflowY: "auto" }}>
              {kongloList.map((r) => {
                const on = selectedInv === r.name;
                return (
                  <button key={r.name} type="button" onClick={() => setSelectedInv(r.name)} style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 14px", border: "none", borderBottom: "1px solid var(--hair)", background: on ? "var(--accentSoft)" : "transparent", cursor: "pointer", color: "var(--text)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{r.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: "var(--accent)" }}>{r.holdings.length}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 5, padding: "2px 7px" }}>{r.ntype}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--muted)" }}>{r.holdings.length} stocks</span>
                      <div style={{ flex: 1 }} />
                      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 800, color: "var(--accent)" }}>{fmtValue(r.value)}</span>
                    </div>
                  </button>
                );
              })}
              {!kongloList.length ? <div style={{ padding: 24, textAlign: "center", color: "var(--faint)", fontSize: 12 }}>No group spans ≥3 issuers in this snapshot.</div> : null}
            </div>
            <div style={{ padding: "9px 14px", fontSize: 9.5, color: "var(--faint)", lineHeight: 1.4 }}>Proxy for conglomerate footprints: the same investor name across ≥3 stocks (real KSEI holder lists) — grouped by registered holder name, not by named business-family membership. This is a different, narrower method from the curated Konglo Index groups shown on the Dashboard (Sector Rotation, Konglo vs IHSG) and won&apos;t match them ticker-for-ticker.</div>
          </div>
          {/* RIGHT: selected group — stocks + connection network */}
          <div style={{ ...CARD, minHeight: 320 }}>
            {selectedInvestor && selectedInvestor.holdings.length >= 3 ? (
              <>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedInvestor.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{selectedInvestor.ntype} · {selectedInvestor.foreign ? "Foreign" : "Local"} · {selectedInvestor.holdings.length} stocks · {fmtValue(selectedInvestor.value)}</div>
                </div>
                <KseiNetwork ksei={ksei} anchor={{ type: "inv", id: selectedInvestor.name }} />
                <div style={{ ...KICKER, margin: "14px 0 6px" }}>STOCKS · CONTROLLING STAKES</div>
                <div style={{ maxHeight: 300, overflowY: "auto" }}>
                  {[...selectedInvestor.holdings].sort((a, b) => b.pct - a.pct).map((h, i) => (
                    <button key={h.code + i} type="button" onClick={() => openTicker(h.code)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "7px 0", border: "none", borderTop: i ? "1px solid var(--hair)" : "none", background: "transparent", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: "var(--accent)", width: 56, flex: "none" }}>{h.code}</span>
                      <span style={{ fontSize: 11, color: "var(--muted)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 11.5, fontWeight: 700 }}>{h.pct.toFixed(2)}%</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 280, textAlign: "center" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>Select a group</div>
                <div style={{ fontSize: 12, marginTop: 4, color: "var(--faint)" }}>See each conglomerate&apos;s stocks, controlling shareholders, and connection network.</div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* ── METRICS (design/4: ownership hero · type composition · snapshot log) ── */}
      {ksei && tab === "metrik" ? <KseiMarketOverview ksei={ksei} /> : null}

      {/* ── CHANGELOG ── */}
      {ksei && tab === "changelog" ? (
        <>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 14px", maxWidth: 720, lineHeight: 1.5 }}>Comparison of the previous KSEI period{changelog.previousAsOf ? ` (${formatAsOf(changelog.previousAsOf) || changelog.previousAsOf})` : ""} against the current one. Shows new stocks, delisted stocks, and shareholder changes for each company.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 16 }}>
            {([["New Stocks", String(changelog.newStocks.length), "var(--text)"], ["Delisted", String(changelog.delisted.length), "var(--text)"], ["Changed", String(changelog.shareholderChanges.length), "var(--text)"], ["New Investors", `+${changelog.newInvestors}`, "var(--up)"], ["Investors Exited", `−${changelog.exitedInvestors}`, "var(--down)"]] as const).map(([label, val, color]) => (
              <div key={label} style={{ ...CARD, padding: "15px 18px" }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)" }}>{label.toUpperCase()}</div>
                <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color, marginTop: 4 }}>{val}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 14, alignItems: "start" }}>
            {/* New Stocks */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><span style={KICKER}>NEW STOCKS</span><span style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 6, padding: "2px 8px" }}>{changelog.newStocks.length}</span></div>
              {changelog.newStocks.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {changelog.newStocks.map((t) => (
                    <button key={t.code} type="button" onClick={() => openTicker(t.code)} style={{ display: "flex", alignItems: "center", gap: 12, ...CARD, borderRadius: 12, padding: "12px 16px", textAlign: "left", color: "var(--text)", cursor: "pointer" }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 7, padding: "4px 9px" }}>{t.code}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                      <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--faint)" }}>{t.investors} investor{t.investors === 1 ? "" : "s"}</span>
                    </button>
                  ))}
                </div>
              ) : <div style={{ ...CARD, padding: "18px", fontSize: 12, color: "var(--faint)" }}>No new stocks entered the registry this snapshot.</div>}
            </div>
            {/* Shareholder Changes */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><span style={KICKER}>SHAREHOLDER CHANGES</span><span style={{ fontSize: 10, fontWeight: 800, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 6, padding: "2px 8px" }}>{changelog.shareholderChanges.length}</span></div>
              {changelog.shareholderChanges.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {changelog.shareholderChanges.map((t) => (
                    <button key={t.code} type="button" onClick={() => openTicker(t.code)} style={{ display: "flex", alignItems: "center", gap: 12, ...CARD, borderRadius: 12, padding: "12px 16px", textAlign: "left", color: "var(--text)", cursor: "pointer" }}>
                      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 7, padding: "4px 9px" }}>{t.code}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                      {t.added ? <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--up)", background: "var(--upSoft)", borderRadius: 6, padding: "3px 8px" }}>+{t.added} new</span> : null}
                      {t.exited ? <span style={{ fontSize: 9.5, fontWeight: 700, color: "var(--down)", background: "var(--downSoft)", borderRadius: 6, padding: "3px 8px" }}>−{t.exited} exited</span> : null}
                      <span style={{ color: "var(--faint)", fontSize: 14 }}>›</span>
                    </button>
                  ))}
                </div>
              ) : <div style={{ ...CARD, padding: "18px", fontSize: 12, color: "var(--faint)" }}>No shareholder changes flagged — the KSEI diff is near-static for {formatAsOf(ksei.asOf)}. Changes accrue as new monthly snapshots land.</div>}
            </div>
          </div>
        </>
      ) : null}

      {/* connection network modal */}
      {focusInvestor ? <NetworkModal investor={focusInvestor} ksei={ksei} onClose={() => setFocus(null)} onTicker={(t) => { setFocus(null); openTicker(t); }} /> : null}
    </section>
  );
}

function fmtMcap(raw: unknown): string {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)} T` : `${Math.round(n)} B`;
}
function IssuerRow({ t, price, mcapRaw, expanded, onToggle, onDetail, onFocus }: { t: KseiIssuer; price: number | null; mcapRaw?: unknown; expanded: boolean; onToggle: () => void; onDetail: () => void; onFocus: (name: string) => void }) {
  const sectorLabel = normalizeSector(t.idxSectorRaw);
  return (
    <div style={{ ...CARD, borderRadius: 12, overflow: "hidden" }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", flexWrap: "wrap" }}>
        <button type="button" onClick={(e) => { e.stopPropagation(); onDetail(); }} title="Open ticker detail" style={{ fontFamily: MONO, fontSize: 12, fontWeight: 800, color: "var(--accent)", background: "var(--accentSoft)", border: "none", borderRadius: 7, padding: "4px 9px", cursor: "pointer" }}>{t.ticker}</button>
        <span style={{ fontSize: 13, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{t.companyName}</span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--muted)", whiteSpace: "nowrap" }}>Rp {price == null ? "—" : formatPrice(price)}</span>
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--muted)", whiteSpace: "nowrap" }}>MCap {fmtMcap(mcapRaw)}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 6, padding: "3px 8px" }}>{sectorLabel}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", background: "var(--soft)", borderRadius: 6, padding: "3px 8px" }}>{t.ccs == null ? "CCS —" : `CCS ${t.ccs}`}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--faint)", whiteSpace: "nowrap" }}>{t.holderCount ?? t.investors.length} holders</span>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", flex: "none", minWidth: 62 }} title="controlled = disclosed / non-float ownership · float = public free float">
          <span style={{ fontFamily: MONO, fontSize: 15, fontWeight: 800, color: "var(--text)", lineHeight: 1.05 }}>{t.freeFloat == null ? "—" : `${(100 - t.freeFloat).toFixed(2)}%`}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: "var(--cat-5)" }}>Float {t.freeFloat == null ? "—" : formatPlainPercent(t.freeFloat)}</span>
        </div>
        <span style={{ color: "var(--faint)", fontSize: 15, flex: "none", transform: expanded ? "rotate(90deg)" : "none", transition: "transform .15s" }}>›</span>
      </div>
      {expanded ? (
        <div style={{ borderTop: "1px solid var(--hair)", padding: "2px 16px 10px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 120px 80px 96px", gap: 8, padding: "8px 0 6px", borderBottom: "1px solid var(--hair)", fontSize: 9, fontWeight: 700, letterSpacing: ".05em", color: "var(--faint)" }}>
            <span>#</span><span>SHAREHOLDER</span><span>INVESTOR TYPE</span><span>DOMICILE <span style={{ color: "var(--warning, var(--warn))" }}>·MODELLED</span></span><span style={{ textAlign: "right" }}>% OWNERSHIP</span>
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

function NetworkModal({ investor, ksei, onClose, onTicker }: { investor: Investor; ksei: KseiPayload | null; onClose: () => void; onTicker: (t: string) => void }) {
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
            <KseiNetwork ksei={ksei} anchor={{ type: "inv", id: investor.name }} />
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

