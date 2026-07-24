# IDX Screener — Project Instructions

## 1. Project overview

IDX Screener ("IDX RESEARCH") is a static, no-backend research dashboard for
Indonesian (IDX) stocks. A Python backend fetches and computes market data
(OHLCV, fundamentals, technicals, KSEI ownership, news) and writes it as
versioned, schema'd JSON committed directly into the repo; a Next.js frontend
reads only those committed files. There is no production application server
or live database, and no fabricated/synthetic values — data gaps render as an
explicit "no data" state.

- **Frontend:** Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS 3,
  pnpm — statically exported to GitHub Pages (`docs/`).
- **Data pipeline:** Python (pandas, numpy, yfinance, openpyxl, matplotlib,
  requests, beautifulsoup4) in `rebuild_backend/` and `scripts/`.
- **Structure:** `app/` + `components/` (frontend pages/UI), `rebuild_backend/`
  (data engine), `scripts/` (export/backfill/daily-update/validation),
  `docs/data/dates/YYYY-MM-DD/` (schema V5 JSON archive), `tests/` (Python
  unittest), `.github/workflows/daily-idx-data-update.yml` (daily automation).

Full feature list and current state live in the connected knowledge base, not
duplicated here — see below.

## 2. Start of session

Read `../../Claude Knowledge/raw/idx-screener.md` first. It holds full project
context — current features, tech stack, and the running session log — and
replaces needing to re-read the whole codebase from scratch.

## 3. Reference material

`../../Claude Knowledge/wiki/` holds patterns, concepts, and knowledge that may
apply here (e.g. `wiki/concepts/technical-indicators.md`,
`wiki/concepts/market-data.md`, `wiki/entities/yfinance.md`,
`wiki/entities/pandas.md`). Check it when a task touches data sourcing,
indicators, or the broader quant-research domain.

## 4. End of session

Update `../../Claude Knowledge/raw/idx-screener.md`:
- Append a session-log entry: what changed this session.
- Refresh the "Current features" section if feature state moved.
- Note any new decisions or patterns adopted.
- Update the "Last updated" date (and the `updated` frontmatter field) to
  today.

## 5. Ponytail principle

Keep changes minimal and purposeful. Before writing code: does this need to
exist, is it already in the codebase, does stdlib/an installed dependency
already do it — only build the minimum that works. Never skip trust-boundary
validation, data-loss handling, security, or the "no fabricated data" rule
above for the sake of minimalism.
