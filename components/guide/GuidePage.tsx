"use client";

import { useApp } from "@/components/providers/AppProvider";

/** Standalone Help & Guide (DESIGN_SPEC §3.8): eight sections, in-page anchors.
    Replaces the old /advanced?tab=guide panel, which redirects here. */

type Section = { id: string; title: string; body: React.ReactNode };

const CARD: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: "var(--r)",
  boxShadow: "var(--sh)",
  padding: "18px 20px",
};

const H3: React.CSSProperties = { fontSize: 15, fontWeight: 800, letterSpacing: "-.01em", marginBottom: 8 };
const P: React.CSSProperties = { fontSize: 13.5, lineHeight: 1.55, color: "var(--muted)", marginBottom: 10 };
const TERM: React.CSSProperties = { fontWeight: 700, color: "var(--text)" };

function Term({ word, children }: { word: string; children: React.ReactNode }) {
  return (
    <p style={P}>
      <span style={TERM}>{word}</span> — {children}
    </p>
  );
}

export function GuidePage() {
  const { marketDate, manifest } = useApp();
  const snapshot = manifest?.latestMarketDate || marketDate || "no data";

  const sections: Section[] = [
    {
      id: "what",
      title: "1 · What this app is",
      body: (
        <>
          <p style={P}>
            A research dashboard for Indonesian (IDX) listed equities. It is a screening and
            context tool — it reports what the data says, and does not give trade advice.
          </p>
          <p style={P}>
            There is no live backend. A Python pipeline fetches and computes market data once
            per session, writes it as versioned JSON, and commits it into the repository; these
            pages read only those committed files. That is why every figure carries a snapshot
            date rather than a live tick.
          </p>
          <p style={P}>
            Nothing here is fabricated. Where a field is missing, the page says{" "}
            <span style={TERM}>no data</span> instead of showing a placeholder number, and the
            gap is listed on Data Health.
          </p>
        </>
      ),
    },
    {
      id: "dashboard",
      title: "2 · How to read the dashboard",
      body: (
        <>
          <p style={P}>
            Read it top-down, widest context first: the macro strip (USD/IDR, US 10Y, DXY, BI
            rate, VIX), then breadth, then the index chart and market-risk panel, then sector
            rotation and the named lists.
          </p>
          <p style={P}>
            Breadth tiles count the whole scanned universe, not a sampled index. Market Risk is a
            0–100 composite where <span style={TERM}>higher is risk-on</span>; its eight
            sub-metrics are listed beneath the score with a one-line verdict each, so a reading
            can always be traced to its components rather than taken on trust.
          </p>
        </>
      ),
    },
    {
      id: "screener",
      title: "3 · The screener",
      body: (
        <>
          <p style={P}>
            Setup cards are predicates over the session snapshot. Selecting more than one
            combines them with AND by default, so counts fall as you stack conditions; switch to
            OR to widen. Each card shows its own live match count, so you can see which
            condition is doing the filtering.
          </p>
          <p style={P}>
            The three context selects (sector · liquidity · conglomerate group) narrow the
            universe before the setups run. Active filters appear as removable chips. Results
            export to CSV exactly as displayed.
          </p>
          <p style={P}>
            Every ticker cell links to that symbol&apos;s research page. The footer link opens
            Past Setups · Forward Outcomes, which tracks what previously published setups
            actually did.
          </p>
        </>
      ),
    },
    {
      id: "setups",
      title: "4 · Setups vocabulary — EXACT vs INFERRED",
      body: (
        <>
          <p style={P}>
            Every setup card and every trade-plan row is labelled with the strength of its
            evidence. This is the single most important distinction in the app.
          </p>
          <Term word="EXACT">
            the predicate reads a real column in the data directly. The label means what it says.
          </Term>
          <Term word="INFERRED">
            there is no such column, so the condition is reconstructed from other fields as a
            documented proxy. Example: <em>BOS Swing + Internal</em> has no break-of-structure
            column — it is approximated from a reclaim signal plus the EMA stack. Treat these as
            suggestive, not definitive.
          </Term>
          <p style={P}>
            Swing setups are 2–5 day long-reversal candidates requiring location (POI or 20-day
            low band), structure (bullish CHoCH, or a swept-and-reclaimed low), and orderflow
            confirmation. Scores are 0–100, weighted location 25 / structure 25 / orderflow 25 /
            ownership 15 / liquidity 10.
          </p>
          <Term word="CVD (approx.)">
            estimated from daily candles — per-bar delta = volume × (2·(close−low)/(high−low) −
            1) — because true tick and footprint data is not available for IDX retail. It is an
            approximation and is never footprint data.
          </Term>
        </>
      ),
    },
    {
      id: "ksei",
      title: "5 · KSEI ownership — proxy caveats",
      body: (
        <>
          <p style={P}>
            KSEI publishes ownership snapshots <span style={TERM}>monthly</span>. They are
            registry data, not broker flow, and they lag the market by design.
          </p>
          <p style={P}>
            Anything this app labels as flow is a <span style={TERM}>labelled proxy</span>{" "}
            derived from the change between two monthly snapshots. It is never presented as
            broker data and must not be read as one. Use ownership accumulation as a conviction
            bonus and as context — never as a timing trigger.
          </p>
          <p style={P}>
            The snapshot date appears wherever ownership data is shown, so you can always see how
            stale the reading is.
          </p>
        </>
      ),
    },
    {
      id: "watchlist",
      title: "6 · Watchlist",
      body: (
        <>
          <p style={P}>
            The watchlist starts empty — nothing is seeded. Create a group, then add tickers to
            it. Groups and rows persist in your browser&apos;s local storage; they are not
            synced to a server and do not follow you to another device or browser.
          </p>
          <p style={P}>
            Close and 1D% are real end-of-day values. The longer-period returns, ATH and
            since-added columns are modelled — the table footnote states which is which, and Data
            Health lists this as a known gap.
          </p>
        </>
      ),
    },
    {
      id: "freshness",
      title: "7 · Data freshness",
      body: (
        <>
          <p style={P}>
            Current snapshot: <span style={{ ...TERM, fontFamily: "var(--font-mono)" }}>{snapshot}</span>.
            One date is printed across every page; if two pages ever disagree, that is a bug.
          </p>
          <p style={P}>
            The pipeline runs after the IDX close (Asia/Jakarta). Prices are split-adjusted and
            dividend-unadjusted. Charts are always daily bars.
          </p>
          <p style={P}>
            A staleness banner appears when the snapshot is more than one trading day behind. It
            is weekend-aware but does not model IDX public holidays, so expect it after a long
            holiday until the next run publishes.
          </p>
          <p style={P}>
            Tickers that fail the dual-source parity check are flagged PARITY_FAIL and excluded
            from setups for that run. Recent IPOs with fewer than 90 bars are flagged; under 30
            bars they are excluded rather than computed on a partial window.
          </p>
        </>
      ),
    },
    {
      id: "glossary",
      title: "8 · Glossary",
      body: (
        <>
          <Term word="Breadth">
            how many names participate in a move — advancers vs decliners, new highs vs lows, up
            vs down volume. Narrow breadth on a rising index means few names are carrying it.
          </Term>
          <Term word="CHoCH">
            change of character — the first structural break against the prevailing swing
            direction, used here as an early reversal cue.
          </Term>
          <Term word="POI">
            point of interest — a price zone where the prior move originated and where reaction
            is more likely on a revisit.
          </Term>
          <Term word="Free float">
            the share of a company&apos;s stock available to trade, excluding locked-in
            strategic holdings. Low float amplifies both directions.
          </Term>
          <Term word="CCS">
            the count of distinct controlling shareholders recorded against an issuer in the KSEI
            snapshot.
          </Term>
          <Term word="R:R">
            reward-to-risk — distance to target divided by distance to invalidation, measured
            from the stated entry.
          </Term>
          <Term word="VWAP">
            volume-weighted average price. Used here as a session-anchored reference for whether
            price is trading rich or cheap against the day&apos;s traded volume.
          </Term>
          <Term word="Parity">
            agreement between two independent sources mirroring the IDX feed. A literal
            TradingView feed requires a paid subscription, so parity is approximated this way.
          </Term>
        </>
      ),
    },
  ];

  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em" }}>Help &amp; Guide</h1>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: ".1em",
            color: "var(--muted)",
            background: "var(--soft)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "3px 9px",
          }}
        >
          HOW EVERYTHING WORKS
        </span>
      </div>
      <p style={{ ...P, marginBottom: 14 }}>
        What the numbers mean, where they come from, and where they stop being reliable.
      </p>

      {/* Anchor nav */}
      <nav style={{ ...CARD, display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--muted)",
              textDecoration: "none",
              background: "var(--soft)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "5px 11px",
            }}
          >
            {s.title}
          </a>
        ))}
      </nav>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {sections.map((s) => (
          <article key={s.id} id={s.id} style={{ ...CARD, scrollMarginTop: 70 }}>
            <h2 style={H3}>{s.title}</h2>
            {s.body}
          </article>
        ))}
      </div>
    </section>
  );
}
