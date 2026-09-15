"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { IndicatorCompanion } from "@/components/dashboard/IndicatorCompanion";
import { loadOhlcv } from "@/lib/data/ticker";
import type { OhlcvPayload } from "@/lib/domain/types";
import { formatPrice } from "@/lib/format/number";
import { loadUniverse, setupByKey, type Universe, type UniverseRow } from "@/lib/data/screenerUniverse";
import {
  loadWatchlist,
  newGroupId,
  saveWatchlist,
  upsertWatchlistLevel,
  type WatchlistState,
} from "@/lib/data/watchlistStore";
import { loadPastSetups, savePastSetups, resolveWatchlistOutcomes, type PastSetupEntry } from "@/lib/data/pastSetupsStore";
import { WatchlistPastSetups } from "@/components/watchlist/WatchlistPastSetups";

/** Watchlist (DESIGN_SPEC §3.4). Groups are user-created and persisted locally;
    nothing is seeded. Every column is measured off published bars — where the
    series does not reach back far enough the cell reads `no data`. */

const MONO = "var(--font-mono)";

const CARD: CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r)",
  boxShadow: "var(--sh)",
  padding: "18px 20px",
};

// Design/3 columns: star · ticker · setup · price · chg · R:R · (remove)
const COLS = "26px 96px 1fr 80px 78px 66px 40px";

function chgColor(v: number | null): string {
  return v == null || !Number.isFinite(v) || v === 0 ? "var(--flat)" : v > 0 ? "var(--up)" : "var(--down)";
}

export function WatchlistPage() {
  const { marketDate, openTicker, bundle } = useApp();
  const [state, setState] = useState<WatchlistState>({ groups: [], activeGroupId: null, selectedSymbol: null });
  const [hydrated, setHydrated] = useState(false);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<null | "ticker" | "group">(null);
  const [universe, setUniverse] = useState<Universe | null>(null);
  const [selOhlcv, setSelOhlcv] = useState<OhlcvPayload | null>(null);

  useEffect(() => {
    setState(loadWatchlist());
    setHydrated(true);
  }, []);

  const [pastSetups, setPastSetups] = useState<PastSetupEntry[]>([]);
  useEffect(() => { setPastSetups(loadPastSetups()); }, []);

  // Client-side hit-detection: no server can see what's on any user's
  // watchlist (it lives only in this browser's localStorage), so this has to
  // run here — check every row with a locked-in target/invalidation against
  // real OHLCV since it was added, and graduate any hit into Past Setups.
  // Keyed on the set of checkable symbols (not the whole `state` object) so
  // unrelated interactions (selecting a row, searching) don't re-trigger a
  // fresh round of OHLCV fetches.
  const pendingSymbols = useMemo(
    () => state.groups.flatMap((g) => g.rows.filter((r) => r.target != null || r.invalidation != null).map((r) => r.symbol)).sort().join(","),
    [state],
  );
  useEffect(() => {
    if (!hydrated || !marketDate || !pendingSymbols) return;
    let cancelled = false;
    resolveWatchlistOutcomes(state, marketDate).then(({ nextState, resolved }) => {
      if (cancelled || !resolved.length) return;
      setState(nextState);
      saveWatchlist(nextState);
      const merged = [...loadPastSetups(), ...resolved];
      savePastSetups(merged);
      setPastSetups(merged);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally keyed on pendingSymbols, not the full `state` object (see comment above)
  }, [hydrated, marketDate, pendingSymbols]);

  // Screener universe → per-ticker setup / price / chg / R:R for the design columns.
  useEffect(() => {
    if (!marketDate) return;
    let cancelled = false;
    loadUniverse(marketDate).then((u) => !cancelled && setUniverse(u)).catch(() => {});
    return () => { cancelled = true; };
  }, [marketDate]);
  const uniMap = useMemo(() => {
    const m = new Map<string, UniverseRow>();
    (universe?.rows || []).forEach((r) => m.set(r.ticker, r));
    return m;
  }, [universe]);

  const persist = useCallback((next: WatchlistState) => {
    setState(next);
    saveWatchlist(next);
  }, []);

  const activeGroup = state.groups.find((g) => g.id === state.activeGroupId) || state.groups[0] || null;

  const visibleRows = useMemo(() => {
    if (!activeGroup) return [];
    const needle = search.trim().toUpperCase();
    return needle ? activeGroup.rows.filter((r) => r.symbol.includes(needle)) : activeGroup.rows;
  }, [activeGroup, search]);

  const total = state.groups.reduce((n, g) => n + g.rows.length, 0);
  const selected = state.selectedSymbol || visibleRows[0]?.symbol || null;

  // OHLCV for the selected symbol — feeds the ƒx custom-overlay companion chart.
  useEffect(() => {
    if (!marketDate || !selected) { setSelOhlcv(null); return; }
    let cancelled = false;
    setSelOhlcv(null);
    loadOhlcv(marketDate, selected).then((p) => !cancelled && setSelOhlcv(p)).catch(() => {});
    return () => { cancelled = true; };
  }, [marketDate, selected]);

  function createGroup(name: string): string {
    const id = newGroupId();
    const next: WatchlistState = {
      ...state,
      groups: [...state.groups, { id, name, rows: [] }],
      activeGroupId: id,
    };
    persist(next);
    return id;
  }

  // R:R is manual now (no auto-attach from the setup engine or Volume
  // Profile) — a Stop/Loss is mandatory at add time (see AddDialog), and the
  // Target/Stop can be refined later from a ticker page's Trade Plan, which
  // calls upsertWatchlistLevel directly (this page just re-reads on focus/
  // storage events like any other localStorage-backed page).
  function addTicker(symbolRaw: string, groupId: string, stopLoss: number) {
    const symbol = symbolRaw.trim().toUpperCase();
    if (!symbol || !Number.isFinite(stopLoss) || stopLoss <= 0) return;
    const close = bundle?.technical.get(symbol)?.lastPrice ?? null;
    const next = upsertWatchlistLevel({
      symbol,
      close: typeof close === "number" ? close : null,
      marketDate,
      source: "Watchlist Add dialog",
      stopLoss,
      groupId,
    });
    setState({ ...next, activeGroupId: groupId, selectedSymbol: symbol });
  }

  function removeRow(symbol: string) {
    if (!activeGroup) return;
    const groups = state.groups.map((g) => (g.id === activeGroup.id ? { ...g, rows: g.rows.filter((r) => r.symbol !== symbol) } : g));
    persist({ ...state, groups, selectedSymbol: state.selectedSymbol === symbol ? null : state.selectedSymbol });
  }

  // Avoid rendering the empty state before localStorage has been read, or a
  // returning user sees "No watchlist yet" flash over their own board.
  if (!hydrated) return null;

  return (
    <section>
      {/* header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Watchlist</h1>
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--muted)" }}>
          {total} starred · EOD as of {marketDate || "no data"} WIB
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--muted)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 9px" }}>
          EOD-DELAYED
        </span>
      </div>

      {/* toolbar — group/ticker actions first (DESIGN_SPEC §3.4) */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 14 }}>
        <button type="button" onClick={() => setDialog("group")} style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 9, padding: "7px 13px", cursor: "pointer" }}>
          ＋ New group
        </button>
        <button type="button" onClick={() => setDialog("ticker")} style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 9, padding: "7px 13px", cursor: "pointer" }}>
          ＋ Add ticker
        </button>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search this group…"
          aria-label="Search watchlist"
          style={{ fontSize: 12, color: "var(--text)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 9, padding: "7px 11px", outline: "none", minWidth: 190 }}
        />
        <div style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--muted)" }}>Total: {total}</span>
      </div>

      {dialog ? (
        <AddDialog
          mode={dialog}
          groups={state.groups.map((g) => ({ id: g.id, name: g.name }))}
          activeGroupId={activeGroup?.id || null}
          onCancel={() => setDialog(null)}
          onSubmit={(payload) => {
            if (payload.kind === "group") createGroup(payload.groupName);
            else {
              const gid = payload.groupId || createGroup(payload.groupName || "My watchlist");
              addTicker(payload.symbol, gid, payload.stopLoss);
            }
            setDialog(null);
          }}
        />
      ) : null}

      {/* group tabs — only once a group exists */}
      {state.groups.length ? (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
          {state.groups.map((g) => {
            const on = g.id === activeGroup?.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => persist({ ...state, activeGroupId: g.id, selectedSymbol: null })}
                style={{ fontSize: 12, fontWeight: 700, borderRadius: 8, padding: "6px 12px", cursor: "pointer", border: "1px solid " + (on ? "var(--accent-border)" : "var(--border)"), background: on ? "var(--accentSoft)" : "var(--panel)", color: on ? "var(--accent)" : "var(--muted)" }}
              >
                {g.name} <span style={{ fontFamily: MONO, opacity: 0.7 }}>{g.rows.length}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {!state.groups.length || !activeGroup ? (
        <div style={{ ...CARD, textAlign: "center", padding: "48px 20px" }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>No watchlist yet</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Create a group, then add the tickers you want to track.</div>
        </div>
      ) : (
        // Stacked: starred table on top (fixed height, scrolls past ~5 rows) + chart below.
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* starred table */}
          <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>STARRED NAMES · {activeGroup.name.toUpperCase()}</span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em", color: "var(--up)", background: "var(--upSoft)", borderRadius: 5, padding: "2px 7px" }}>real · EOD close</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: COLS, background: "var(--soft)", borderBottom: "1px solid var(--border)", fontSize: 9, fontWeight: 700, letterSpacing: ".05em", color: "var(--faint)" }}>
              <span style={{ padding: "9px 6px 9px 12px" }}>★</span>
              <span style={{ padding: "9px 6px" }}>TICKER</span>
              <span style={{ padding: "9px 6px" }}>SETUP</span>
              <span style={{ padding: "9px 6px", textAlign: "right" }}>PRICE</span>
              <span style={{ padding: "9px 6px", textAlign: "right" }}>CHG</span>
              <span style={{ padding: "9px 6px", textAlign: "right" }}>R/R</span>
              <span />
            </div>
            <div style={{ maxHeight: 232, overflowY: "auto" }}>
            {!visibleRows.length ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
                {activeGroup.rows.length ? "No symbol in this group matches your search." : "This group is empty — add a ticker to start tracking it."}
              </div>
            ) : (
              visibleRows.map((row) => {
                const uni = uniMap.get(row.symbol);
                const tech = bundle?.technical.get(row.symbol);
                const setupKey = uni?.setupsMatched?.[0];
                const setup = setupKey ? (setupByKey(setupKey)?.label.split(" ")[0] ?? setupKey) : null;
                // PRICE / CHG = real EOD close (always, from the technical bundle where the
                // scanned universe doesn't reach); SETUP / R:R = engine, from the universe.
                const price = uni?.price ?? (typeof tech?.lastPrice === "number" ? (tech.lastPrice as number) : null);
                const chgRatio = uni?.chg ?? (typeof tech?.changePercent === "number" ? (tech.changePercent as number) : null);
                const chg = chgRatio == null ? null : chgRatio * 100;
                const rr = uni?.rr ?? null;
                const on = selected === row.symbol;
                return (
                  <div key={row.symbol} style={{ display: "grid", gridTemplateColumns: COLS, alignItems: "center", borderBottom: "1px solid var(--hair)", background: on ? "var(--accentSoft)" : "transparent" }}>
                    <span style={{ padding: "10px 6px 10px 12px", color: "var(--warning, var(--warn))", fontSize: 13 }}>★</span>
                    <button type="button" onClick={() => persist({ ...state, selectedSymbol: row.symbol })} title={`Show ${row.symbol} chart`} style={{ padding: "10px 6px", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", fontFamily: MONO, fontSize: 13, fontWeight: 800, color: "var(--text)" }}>{row.symbol}</button>
                    <span style={{ padding: "10px 6px" }}>{setup ? <span style={{ fontFamily: MONO, fontSize: 9.5, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 5, padding: "2px 7px" }}>{setup}</span> : <span style={{ fontSize: 10, color: "var(--faint)" }}>—</span>}</span>
                    <span style={{ padding: "10px 6px", textAlign: "right", fontFamily: MONO, fontSize: 11.5 }}>{price == null ? "—" : formatPrice(price)}</span>
                    <span style={{ padding: "10px 6px", textAlign: "right", fontFamily: MONO, fontSize: 11.5, fontWeight: 700, color: chgColor(chg) }}>{chg == null ? "—" : `${chg > 0 ? "▲" : chg < 0 ? "▼" : "•"} ${chg > 0 ? "+" : ""}${chg.toFixed(2)}%`}</span>
                    <span style={{ padding: "10px 6px", textAlign: "right", fontFamily: MONO, fontSize: 12, fontWeight: 800, color: rr == null ? "var(--faint)" : rr >= 2 ? "var(--up)" : "var(--warning, var(--warn))" }}>{rr == null ? "—" : `${rr.toFixed(1)}×`}</span>
                    <button type="button" onClick={() => removeRow(row.symbol)} aria-label={`Remove ${row.symbol}`} style={{ border: "none", background: "transparent", color: "var(--faint)", cursor: "pointer", fontSize: 14 }}>×</button>
                  </div>
                );
              })
            )}
            </div>
            <div style={{ padding: "11px 16px", fontSize: 10, color: "var(--faint)", lineHeight: 1.5 }}>
              Price &amp; change = real EOD close. Setup &amp; R:R are from the setup engine over the same workbook (real) — a name with no active setup reads <strong>—</strong>, never invented. Rows open the chart; the star removes.
            </div>
          </div>

          {/* selected chart -- the app's own TradingView-style chart (own
              drawing tools, per-indicator settings); the TradingView embed
              this used to sit below is retired sitewide. */}
          {selected ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <button type="button" onClick={() => openTicker(selected)} style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "5px 11px", cursor: "pointer" }}>{selected} detail →</button>
              </div>
              <IndicatorCompanion ohlcv={selOhlcv} symbol={selected} />
            </>
          ) : null}
        </div>
      )}

      <div style={{ marginTop: 20 }}><WatchlistPastSetups entries={pastSetups} /></div>
    </section>
  );
}

/* ── Add dialog ──────────────────────────────────────────────────────────── */

type DialogPayload =
  | { kind: "group"; groupName: string }
  | { kind: "ticker"; symbol: string; groupId: string | null; groupName?: string; stopLoss: number };

function AddDialog({
  mode,
  groups,
  activeGroupId,
  onCancel,
  onSubmit,
}: {
  mode: "ticker" | "group";
  groups: Array<{ id: string; name: string }>;
  activeGroupId: string | null;
  onCancel: () => void;
  onSubmit: (p: DialogPayload) => void;
}) {
  const [symbol, setSymbol] = useState("");
  const [groupId, setGroupId] = useState(activeGroupId || groups[0]?.id || "");
  const [groupName, setGroupName] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const noGroups = groups.length === 0;
  const stopLossValue = Number(stopLoss);
  const stopLossValid = stopLoss.trim() !== "" && Number.isFinite(stopLossValue) && stopLossValue > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "group") {
      if (groupName.trim()) onSubmit({ kind: "group", groupName: groupName.trim() });
      return;
    }
    if (!symbol.trim() || !stopLossValid) return;
    onSubmit({ kind: "ticker", symbol, groupId: noGroups ? null : groupId, groupName: groupName.trim() || undefined, stopLoss: stopLossValue });
  }

  return (
    <form onSubmit={submit} style={{ ...CARD, marginBottom: 14, display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
      {mode === "ticker" ? (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)" }}>TICKER</span>
          <input
            autoFocus
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="e.g. BBRI"
            style={{ fontFamily: MONO, fontSize: 13, color: "var(--text)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 11px", outline: "none", width: 150 }}
          />
        </label>
      ) : null}

      {mode === "ticker" ? (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)" }}>STOP / LOSS *</span>
          <input
            type="number"
            min={0}
            step="any"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            placeholder="required"
            title="Mandatory — every watchlist row needs a Stop/Loss to compute Reward:Risk against."
            style={{ fontFamily: MONO, fontSize: 13, color: "var(--text)", background: "var(--soft)", border: `1px solid ${stopLoss && !stopLossValid ? "var(--down)" : "var(--border)"}`, borderRadius: 9, padding: "8px 11px", outline: "none", width: 110 }}
          />
        </label>
      ) : null}

      {mode === "group" || noGroups ? (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)" }}>
            {noGroups && mode === "ticker" ? "NO WATCHLIST YET — NAME ONE" : "GROUP NAME"}
          </span>
          <input
            autoFocus={mode === "group"}
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="e.g. Banks"
            style={{ fontSize: 13, color: "var(--text)", background: "var(--soft)", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 11px", outline: "none", width: 190 }}
          />
        </label>
      ) : mode === "ticker" ? (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".1em", color: "var(--faint)" }}>GROUP</span>
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            style={{ fontSize: 13, color: "var(--text)", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 11px", cursor: "pointer" }}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
      ) : null}

      <button type="submit" disabled={mode === "ticker" && (!symbol.trim() || !stopLossValid)}
        style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 9, padding: "8px 15px", cursor: mode === "ticker" && (!symbol.trim() || !stopLossValid) ? "not-allowed" : "pointer", opacity: mode === "ticker" && (!symbol.trim() || !stopLossValid) ? 0.5 : 1 }}>
        {mode === "group" ? "Create group" : "Add"}
      </button>
      <button type="button" onClick={onCancel} style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", background: "transparent", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 13px", cursor: "pointer" }}>
        Cancel
      </button>
    </form>
  );
}
