import fs from "node:fs";
import path from "node:path";
import { V2TickerClient } from "@/components/v2/V2TickerClient";

// Ticker (/ticker/[code]) — faithful real-data realization of "0. Ticker
// Page.dc.html". Static export requires generateStaticParams: we prebuild one
// page per real ticker (union of the latest technical universe + KSEI issuers).
export function generateStaticParams(): Array<{ code: string }> {
  const root = process.cwd();
  const codes = new Set<string>();
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "docs/data/manifest.json"), "utf8")) as { latestMarketDate?: string };
    const date = manifest.latestMarketDate;
    if (date) {
      const tech = JSON.parse(fs.readFileSync(path.join(root, `docs/data/dates/${date}/technical.json`), "utf8")) as { records?: Record<string, unknown> };
      Object.keys(tech.records || {}).forEach((c) => codes.add(c.toUpperCase()));
    }
  } catch {
    /* fall through to KSEI-only set */
  }
  try {
    const ksei = JSON.parse(fs.readFileSync(path.join(root, "docs/data/ksei/latest.json"), "utf8")) as { records?: Array<{ ticker?: string }> };
    (ksei.records || []).forEach((r) => r.ticker && codes.add(r.ticker.toUpperCase()));
  } catch {
    /* ignore */
  }
  return [...codes].map((code) => ({ code }));
}

export default async function V2TickerPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <V2TickerClient symbol={decodeURIComponent(code || "").toUpperCase()} />;
}
