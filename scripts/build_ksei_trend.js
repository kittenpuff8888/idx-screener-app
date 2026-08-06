#!/usr/bin/env node
/**
 * Build a small KSEI ownership-trend artifact from the full dated snapshots.
 *
 * Each `docs/data/ksei/dates/<date>/ownership.json` is ~3.7 MB, so the frontend
 * must not fetch all of them just to draw a trend line. This precomputes, per
 * snapshot, only the small aggregates the KSEI page needs:
 *   - real summary metrics (avg free-float, avg HHI, concentration counts)
 *   - market-average float composition by KSEI investor type (real)
 *   - a labelled proxy foreign/local split (name heuristic — never authoritative)
 *
 * Output: docs/data/ksei/trend.json  (a few KB). No values are invented; every
 * number is derived from the committed snapshots. Re-run after new KSEI exports.
 */
const fs = require("fs");
const path = require("path");

const KSEI_DIR = path.join(__dirname, "..", "docs", "data", "ksei", "dates");
const OUT = path.join(__dirname, "..", "docs", "data", "ksei", "trend.json");

const KNOWN_TYPES = ["Individual", "Corporate", "Bank", "Insurance", "Securities", "Mutual Fund", "Pension Fund", "Other"];
function normType(raw) {
  const s = String(raw || "").trim();
  for (const t of KNOWN_TYPES) if (s === t || s.endsWith(" - " + t) || s.endsWith("- " + t)) return t;
  if (/Registrar/i.test(s)) return "Other";
  return "Other";
}
// Proxy only — KSEI carries no broker nationality field. Labelled as such in the UI.
function isForeignProxy(name) {
  const n = String(name || "");
  return /Limited|LTD\b|PTE|LLC|N\.V\.|S\.A\.|GmbH|PLC\b|FUND|GLOBAL|EMERGING|ROBUR|MAYBANK|NOMURA|JPMORGAN|MORGAN|CITI|HSBC|UBS|BNP|DEUTSCHE|VANGUARD|BLACKROCK|FIDELITY|ABU DHABI|GIC\b|TEMASEK|NORGES/i.test(n)
    && !/\bPT\.?\s|TBK|PERSERO|INDONESIA|NEGARA|DAERAH/i.test(n);
}

function aggregate(doc) {
  const recs = doc.records || [];
  const typeSum = {}; KNOWN_TYPES.forEach((t) => (typeSum[t] = 0));
  let typeIssuers = 0, foreignSum = 0, localSum = 0, ffProxyIssuers = 0;
  for (const r of recs) {
    const inv = r.investors || [];
    if (!inv.length) continue;
    typeIssuers++;
    for (const h of inv) {
      const pct = Number(h.percentage) || 0;
      typeSum[normType(h.type)] += pct;
      if (isForeignProxy(h.name)) foreignSum += pct; else localSum += pct;
    }
    ffProxyIssuers++;
  }
  // market-average float composition (%) by type, normalised to what is disclosed
  const totalType = Object.values(typeSum).reduce((a, b) => a + b, 0) || 1;
  const typeShare = {};
  for (const t of KNOWN_TYPES) typeShare[t] = +((typeSum[t] / totalType) * 100).toFixed(2);
  const totalFL = foreignSum + localSum || 1;
  const s = doc.summary || {};
  return {
    asOf: doc.asOf,
    totalIssuers: s.totalIssuers ?? recs.length,
    avgFreeFloat: s.averageFreeFloat ?? null,
    avgHHI: s.averageHHI ?? null,
    highConcentrationIssuers: s.highConcentrationIssuers ?? null,
    ownershipTypes: s.ownershipTypes ?? null,
    investorTypeShare: typeShare,
    proxyForeignPct: +((foreignSum / totalFL) * 100).toFixed(2),
    proxyLocalPct: +((localSum / totalFL) * 100).toFixed(2),
    coverageIssuers: typeIssuers,
  };
}

function main() {
  if (!fs.existsSync(KSEI_DIR)) { console.error("no ksei dates dir:", KSEI_DIR); process.exit(1); }
  const dates = fs.readdirSync(KSEI_DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const snapshots = [];
  for (const d of dates) {
    const f = path.join(KSEI_DIR, d, "ownership.json");
    if (!fs.existsSync(f)) continue;
    try {
      const doc = JSON.parse(fs.readFileSync(f, "utf8"));
      snapshots.push(aggregate(doc));
      console.log("aggregated", d);
    } catch (e) { console.error("skip", d, e.message); }
  }
  const out = { generatedFrom: "docs/data/ksei/dates/*/ownership.json", generatedAt: new Date().toISOString(), note: "Investor-type composition is real (KSEI category); foreign/local is a labelled name-proxy, not authoritative.", snapshots };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log("wrote", OUT, "-", snapshots.length, "snapshots,", fs.statSync(OUT).size, "bytes");
}
main();
