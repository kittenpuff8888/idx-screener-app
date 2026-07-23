// Live IDX quote overlay.
//
// The browser cannot call Yahoo directly (no CORS headers on their endpoints),
// so this function fetches server-side and re-serves with CORS. It is also the
// rate-limit shield: the response is edge-cached, so Yahoo sees at most one
// refresh per cache window no matter how many visitors are on the site.
//
// Yahoo's v7/quote endpoint now returns 401 without a crumb; v7/finance/spark
// still works unauthenticated and accepts up to 20 symbols per request.
// 956 tickers = 48 requests, ~2.3s wall clock at concurrency 6.
//
// This is an OVERLAY on the committed archive, never a replacement. The dated
// JSON snapshots remain the point-in-time record; this only supplies "what is
// the price right now".

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Read rather than `import ... with { type: "json" }`: import attributes are
// not supported uniformly across the Node versions Vercel may run, and a
// deploy-time syntax error here would take the whole function down.
const universe = JSON.parse(
  readFileSync(fileURLToPath(new URL("./_universe.json", import.meta.url)), "utf8")
);

const BATCH = 20;
const CONCURRENCY = 6;
const CACHE_SECONDS = 60;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function fetchBatch(symbols) {
  const url =
    "https://query1.finance.yahoo.com/v7/finance/spark?symbols=" +
    symbols.map((s) => `${s}.JK`).join(",") +
    "&range=1d&interval=1d";
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    const body = await res.json();
    return body?.spark?.result ?? [];
  } catch {
    return []; // a failed batch degrades to "no live data for these", never a fabricated price
  }
}

// Bounded-concurrency map. Keeps us well under Yahoo's tolerance and inside
// the function's execution budget.
async function mapLimit(items, limit, fn) {
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const started = Date.now();
  const batches = chunk(universe, BATCH);
  const groups = await mapLimit(batches, CONCURRENCY, fetchBatch);

  const quotes = {};
  let covered = 0;
  for (const group of groups) {
    for (const entry of group) {
      const meta = entry?.response?.[0]?.meta;
      const price = meta?.regularMarketPrice;
      if (price == null) continue; // no fabricated values
      const ticker = String(entry.symbol).replace(/\.JK$/, "");
      const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
      quotes[ticker] = {
        p: price,
        c: prev ? Number((((price - prev) / prev) * 100).toFixed(2)) : null,
        v: meta.regularMarketVolume ?? null,
        t: meta.regularMarketTime ?? null,
      };
      covered++;
    }
  }

  // Stale-while-revalidate: visitors always get an instant response, and the
  // edge refreshes in the background rather than making anyone wait.
  res.setHeader(
    "Cache-Control",
    `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 5}`
  );
  res.status(200).json({
    source: "Yahoo Finance via spark",
    disclaimer: "Live overlay. Research only. Not financial advice.",
    fetchedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    requested: universe.length,
    covered,
    quotes,
  });
}
