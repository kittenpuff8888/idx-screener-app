"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useApp } from "@/components/providers/AppProvider";
import { TradingViewChart } from "@/components/dashboard/TradingViewChart";
import { loadOhlcv } from "@/lib/data/ticker";
import {
  computeMetrics,
  loadWatchlist,
  newGroupId,
  saveWatchlist,
  type WatchlistMetrics,
  type WatchlistState,
} from "@/lib/data/watchlistStore";

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

const COLS = "120px 100px 84px 84px 84px 84px 84px 110px 100px 120px 46px";

const HEADERS = ["SYMBOL", "CLOSE", "1D%", "1W%", "1M%", "3M%", "YTD%", "HIGH", "FROM HIGH%", "SINCE ADDED", ""];

function pct(v: number | null): { text: string; color: string } {
  if (v === null || !Number.isFinite(v)) return { text: "no data", color: "var(--faint)" };
  const glyph = v > 0 ? "▲" : v < 0 ? "▼" : "•";
  const color = v > 0 ? "var(--up)" : v < 0 ? "var(--down)" : "var(--flat)";
  return { text: `${glyph} ${v > 0 ? "+" : ""}${v.toFixed(2)}%`, color };
}

function num(v: number | null): string {
  return v === null || !Number.isFinite(v) ? "no data" : v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function WatchlistPage() {
  const { marketDate, openTicker, bundle } = useApp();
  const [state, setState] = useState<WatchlistState>({ groups: [], activeGroupId: null, selectedSymbol: null });
  const [hydrated, setHydrated] = useState(false);
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<null | "ticker" | "group">(null);
  const [metrics, setMetrics] = useState<Record<string, WatchlistMetrics>>({});

  useEffect(() => {
    setState(loadWatchlist());
    setHydrated(true);
  }, []);

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

  // Load bars for every symbol on the board, once per symbol per market date.
  useEffect(() => {
    if (!marketDate || !activeGroup) return;
    let cancelled = false;
    const wanted = activeGroup.rows.map((r) => r.symbol).filter((s) => !(s in metrics));
    if (!wanted.length) return;
    Promise.all(
      wanted.map(async (symbol) => {
        const payload = await loadOhlcv(marketDate, symbol);
        return [symbol, computeMetrics(payload?.rows || [])] as const;
      }),
    ).then((pairs) => {
      if (!cancelled) setMetrics((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    });
    return () => { cancelled = true; };
  }, [marketDate, activeGroup, metrics]);

  const total = state.groups.reduce((n, g) => n + g.rows.length, 0);
  const selected = state.selectedSymbol || visibleRows[0]?.symbol || null;

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

  function addTicker(symbolRaw: string, groupId: string) {
    const symbol = symbolRaw.trim().toUpperCase();
    if (!symbol) return;
    const close = bundle?.technical.get(symbol)?.lastPrice ?? null;
    const groups = state.groups.map((g) =>
      g.id !== groupId || g.rows.some((r) => r.symbol === symbol)
        ? g
        : { ...g, rows: [...g.rows, { symbol, addedAt: marketDate || new Date().toISOString().slice(0, 10), addedClose: typeof close === "number" ? close : null }] },
    );
    persist({ ...state, groups, activeGroupId: groupId, selectedSymbol: symbol });
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
              addTicker(payload.symbol, gid);
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
        <>
          <div style={{ ...CARD, padding: 0, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>
                STARRED NAMES · {activeGroup.name.toUpperCase()}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em", color: "var(--up)", background: "var(--upSoft)", borderRadius: 5, padding: "2px 7px" }}>
                real · EOD close
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 960 }}>
                <div style={{ position: "sticky", top: 0, zIndex: 2, display: "grid", gridTemplateColumns: COLS, background: "var(--soft)", borderBottom: "1px solid var(--border)" }}>
                  {HEADERS.map((h, i) => (
                    <div key={h || i} style={{ padding: "9px 12px", fontSize: 9, fontWeight: 700, letterSpacing: ".06em", color: "var(--faint)", textAlign: i === 0 || i === HEADERS.length - 1 ? "left" : "right" }}>
                      {h}
                    </div>
                  ))}
                </div>

                {!visibleRows.length ? (
                  <div style={{ padding: 40, textAlign: "center", color: "var(--faint)", fontSize: 13 }}>
                    {activeGroup.rows.length ? "No symbol in this group matches your search." : "This group is empty — add a ticker to start tracking it."}
                  </div>
                ) : (
                  visibleRows.map((row) => {
                    const m = metrics[row.symbol];
                    const since = m?.close != null && row.addedClose ? ((m.close - row.addedClose) / row.addedClose) * 100 : null;
                    const fromHigh = m?.close != null && m?.high != null && m.high > 0 ? ((m.close - m.high) / m.high) * 100 : null;
                    const cells: Array<{ text: string; color: string; mono?: boolean }> = [
                      { text: num(m?.close ?? null), color: "var(--text)", mono: true },
                      pct(m?.d1 ?? null),
                      pct(m?.w1 ?? null),
                      pct(m?.m1 ?? null),
                      pct(m?.m3 ?? null),
                      pct(m?.ytd ?? null),
                      { text: num(m?.high ?? null), color: "var(--muted)", mono: true },
                      pct(fromHigh),
                      pct(since),
                    ];
                    const on = selected === row.symbol;
                    return (
                      <div
                        key={row.symbol}
                        style={{ display: "grid", gridTemplateColumns: COLS, borderBottom: "1px solid var(--hair)", background: on ? "var(--soft)" : "transparent" }}
                      >
                        <button
                          type="button"
                          onClick={() => persist({ ...state, selectedSymbol: row.symbol })}
                          title={`Show ${row.symbol} chart`}
                          style={{ textAlign: "left", padding: "9px 12px", border: "none", background: "transparent", cursor: "pointer", fontFamily: MONO, fontSize: 12.5, fontWeight: 700, color: "var(--text)" }}
                        >
                          {row.symbol}
                        </button>
                        {cells.map((c, i) => (
                          <div key={i} style={{ padding: "9px 12px", textAlign: "right", fontFamily: c.mono === false ? undefined : MONO, fontSize: 12.5, color: c.color }}>
                            {c.text}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => removeRow(row.symbol)}
                          aria-label={`Remove ${row.symbol}`}
                          style={{ border: "none", background: "transparent", color: "var(--faint)", cursor: "pointer", fontSize: 14 }}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div style={{ padding: "10px 18px", fontSize: 10.5, color: "var(--faint)", lineHeight: 1.5, borderTop: "1px solid var(--hair)" }}>
              CLOSE, 1D%, 1W%, 1M%, 3M% and HIGH are measured from the published daily bars. SINCE ADDED is
              measured against the close recorded when you added the row. HIGH is the highest high in
              published coverage{metrics[visibleRows[0]?.symbol || ""]?.highSince ? ` (from ${metrics[visibleRows[0]!.symbol].highSince})` : ""}, not an
              all-time high, and FROM HIGH% is the pullback from it. YTD% uses the prior year&apos;s final close where coverage holds it, otherwise the
              first bar of the year. Cells read <strong>no data</strong> when coverage does not reach back far
              enough — never an estimate.
            </div>
          </div>

          {selected ? (
            <div style={{ ...CARD, padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", borderBottom: "1px solid var(--border)" }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)" }}>{selected} · DAILY</span>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => openTicker(selected)}
                  style={{ fontSize: 11, fontWeight: 700, color: "var(--accent)", background: "var(--accentSoft)", border: "1px solid var(--accent-border)", borderRadius: 8, padding: "5px 11px", cursor: "pointer" }}
                >
                  Detail →
                </button>
              </div>
              <TradingViewChart symbol={`IDX:${selected}`} interval="1D" range="3M" minHeight={420} />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/* ── Add dialog ──────────────────────────────────────────────────────────── */

type DialogPayload =
  | { kind: "group"; groupName: string }
  | { kind: "ticker"; symbol: string; groupId: string | null; groupName?: string };

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
  const noGroups = groups.length === 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "group") {
      if (groupName.trim()) onSubmit({ kind: "group", groupName: groupName.trim() });
      return;
    }
    if (!symbol.trim()) return;
    onSubmit({ kind: "ticker", symbol, groupId: noGroups ? null : groupId, groupName: groupName.trim() || undefined });
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

      <button type="submit" style={{ fontSize: 12, fontWeight: 700, color: "#fff", background: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 9, padding: "8px 15px", cursor: "pointer" }}>
        {mode === "group" ? "Create group" : "Add"}
      </button>
      <button type="button" onClick={onCancel} style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", background: "transparent", border: "1px solid var(--border)", borderRadius: 9, padding: "8px 13px", cursor: "pointer" }}>
        Cancel
      </button>
    </form>
  );
}
