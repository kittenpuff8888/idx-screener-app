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
      id: "news",
      title: "7 · News & Catalysts",
      body: (
        <>
          <p style={P}>
            The event stream behind the price moves — disclosures, earnings, flow and macro
            items, tagged by ticker and sector. The rail ranks the{" "}
            <span style={TERM}>most-mentioned tickers</span> over the window and lists the
            economic &amp; events calendar alongside.
          </p>
          <p style={P}>
            Category chips filter to earnings, flow, company, sector or macro; the time range runs
            from the last week to the last three months. Tape sentiment is labelled{" "}
            <span style={TERM}>Positive / Neutral / Negative</span> and marked a proxy — it is
            derived from headline text, not reported, so read it as direction, not fact.
          </p>
        </>
      ),
    },
    {
      id: "ticker",
      title: "8 · Ticker page",
      body: (
        <>
          <p style={P}>
            Everything known about one name on a single page: identity and price, the 52-week
            range, the published setup and its trade-plan ladder, the chart with level markers,
            valuation and quality, ownership, returns vs IHSG, dividends, peers, filings and news.
          </p>
          <p style={P}>
            Rows in the Screener and Watchlist open this page. Any section whose source has no
            value for that ticker states so explicitly — <span style={TERM}>no data</span> —
            rather than showing a number.
          </p>
        </>
      ),
    },
    {
      id: "freshness",
      title: "9 · Data freshness",
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
      id: "health",
      title: "10 · Data Health",
      body: (
        <>
          <p style={P}>
            The honest status of every source behind the app — what loaded, how fresh it is, what
            it covers, and what is missing. Read it before trusting anything that looks
            surprising.
          </p>
          <p style={P}>
            The SOURCE STATUS table lists each shipped data file with its as-of date, coverage and
            a status pill; KNOWN GAPS explains every place the app renders{" "}
            <span style={TERM}>no data</span> or labels a figure a proxy; and the label legend
            defines <span style={TERM}>REAL / PROXY / NO DATA</span>. Nothing is estimated to fill
            a gap.
          </p>
        </>
      ),
    },
    {
      id: "glossary",
      title: "11 · Glossary",
      body: (
        <>
          <Term word="Breadth">
            how many names participate in a move — advancers vs decliners, new highs vs lows, up
            vs down volume. Narrow breadth on a rising index means few names are carrying it.
          </Term>
          <Term word="RVOL">
            relative volume — today&apos;s volume against its own recent average. Above 1 means
            unusual participation.
          </Term>
          <Term word="ADR %">
            average daily range as a percentage of price — how much room the stock typically
            travels in a session.
          </Term>
          <Term word="VWAP">
            volume-weighted average price. Used here as a session-anchored reference for whether
            price is trading rich or cheap against the day&apos;s traded volume. The σ bands
            express where price sits versus the quarter/year VWAP in standard deviations —
            location, not direction.
          </Term>
          <Term word="EMA25 / EMA50">
            exponential moving averages. The EMA Trend filter asks for close above EMA25 and
            EMA25 above EMA50.
          </Term>
          <Term word="RSI">
            momentum oscillator. Above 50 is treated as confirming positive momentum.
          </Term>
          <Term word="POI">
            point of interest — a price zone where the prior move originated and where reaction
            is more likely on a revisit.
          </Term>
          <Term word="R:R">
            reward-to-risk — distance to target divided by distance to invalidation, measured
            from the stated entry.
          </Term>
          <Term word="CHoCH / BOS">
            change of character and break of structure — market-structure events used by the
            setup engine; CHoCH is the first break against the prevailing swing, BOS a
            continuation break.
          </Term>
          <Term word="CVD (approx.)">
            cumulative volume delta, approximated from candle structure and volume rather than
            tick data — always labelled approx.
          </Term>
          <Term word="Free float">
            the share of a company&apos;s stock available to trade, excluding locked-in
            strategic holdings. Low float amplifies both directions.
          </Term>
          <Term word="CCS">
            concentration score — how tightly the register is held by its largest holders.
          </Term>
          <Term word="Local / Foreign">
            KSEI&apos;s classification of the shareholder&apos;s domicile, not the currency of the
            trade. In this app it is a labelled name-heuristic proxy.
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

      {/* Content column + sticky "ON THIS PAGE" rail (design/7). */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 210px", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          {sections.map((s, i) => {
            const parts = s.title.split(" · ");
            const num = String(i + 1).padStart(2, "0");
            const heading = parts.length > 1 ? parts.slice(1).join(" · ") : s.title;
            return (
              <article key={s.id} id={s.id} style={{ ...CARD, scrollMarginTop: 70 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 800, color: "var(--accent)", background: "var(--accentSoft)", borderRadius: 6, padding: "3px 7px" }}>{num}</span>
                  <h2 style={{ ...H3, marginBottom: 0 }}>{heading}</h2>
                </div>
                {s.body}
              </article>
            );
          })}
        </div>
        <nav style={{ position: "sticky", top: 16, alignSelf: "start", display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".12em", color: "var(--faint)", marginBottom: 8 }}>ON THIS PAGE</div>
          {sections.map((s, i) => {
            const parts = s.title.split(" · ");
            const heading = parts.length > 1 ? parts.slice(1).join(" · ") : s.title;
            return (
              <a key={s.id} href={`#${s.id}`} style={{ fontSize: 12, color: "var(--muted)", textDecoration: "none", padding: "5px 8px", borderRadius: 7, display: "flex", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--faint)" }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{heading}</span>
              </a>
            );
          })}
        </nav>
      </div>
    </section>
  );
}
