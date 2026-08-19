import type { JsonRecord, ResearchBundle } from "@/lib/domain/types";
import { normalizeSector } from "@/lib/domain/sectors";
import { tradingViewUrl } from "./client";

export type NewsTone = "up" | "down" | "flat";

// The design filters news by TOPIC (Earnings/Flow/Company/Sector/Macro), not by
// sentiment. The real feed has no topic field, so we DERIVE it from the headline
// text (keyword heuristic) and label it as derived (Data Health + the News
// footnote). Sentiment stays in the tape-sentiment rail, where it is a labelled
// model read — filtering the feed by it would invite reading it as a signal.
export type NewsTopic = "earnings" | "flow" | "company" | "sector" | "macro";

/** Derive a topic tag from the headline (no such field in the feed — labelled). */
export function deriveTopic(title: string, ticker: string, sector: string): NewsTopic {
  const t = `${title} ${sector}`.toLowerCase();
  if (!ticker || /bank indonesia|\bbi\b|inflation|inflasi|\bcpi\b|rupiah|\bidr\b|\bgdp\b|\bfed\b|yield|suku bunga|rate (cut|hike|hold)|central bank|makro|kurs/.test(t)) return "macro";
  if (/earnings|revenue|profit|laba|net income|kuartal|quarter|\bq[1-4]\b|yoy|guidance|\beps\b|dividend|dividen|kinerja|pendapatan|margin/.test(t)) return "earnings";
  if (/foreign|inflow|outflow|net (buy|sell)|asing|dana asing|\bflow\b|fund|akumulas|distribus|capital/.test(t)) return "flow";
  if (/sector|sektor|complex|industry|industri|miners|coal|batu ?bara|metals|logam|commodit|komoditas|banks sector/.test(t)) return "sector";
  return "company";
}

/** A single parsed story from the real workbook "Sentiment News" feed. */
export type NewsStory = {
  ticker: string;
  company: string;
  sector: string;
  tone: NewsTone;
  toneWord: string;
  topic: NewsTopic;
  title: string;
  source: string;
  when: string;
  ageDays: number | null;
};

/** A real corporate-action disclosure flagged in the workbook. */
export type NewsDisclosure = {
  ticker: string;
  company: string;
  category: string;
  title: string;
  when: string;
  ageDays: number | null;
};

/** Convert the workbook age token ("today", "3d", "1w", "2mo") to a day count. */
function ageToDays(when: string): number | null {
  const w = when.trim().toLowerCase();
  if (!w) return null;
  if (w === "today" || w === "now") return 0;
  const m = w.match(/^(\d+)\s*(d|w|mo|m|y)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]) {
    case "w": return n * 7;
    case "mo": case "m": return n * 30;
    case "y": return n * 365;
    default: return n; // "d" or bare number = days
  }
}

function toneFrom(sentiment: string): NewsTone {
  const s = sentiment.toLowerCase();
  if (s.includes("bull")) return "up";
  if (s.includes("bear")) return "down";
  return "flat";
}

// "→ Neutral  ·  {title} - {source}  [when]" → typed parts. The workbook emits
// this as one string; parsing happens here, not in the UI.
function parseSentimentNews(raw: string): { title: string; source: string; when: string } | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "-") return null;
  const whenMatch = trimmed.match(/\[([^\]]+)\]\s*$/);
  const when = whenMatch ? whenMatch[1] : "";
  let body = trimmed.replace(/\s*\[[^\]]+\]\s*$/, "");
  const dot = body.indexOf("·");
  if (dot >= 0) body = body.slice(dot + 1);
  body = body.trim();
  let title = body;
  let source = "IDX Newswire";
  const sep = body.lastIndexOf(" - ");
  if (sep > 0) {
    title = body.slice(0, sep).trim();
    const s = body.slice(sep + 3).replace(/…\s*$/, "").trim();
    if (s) source = s;
  }
  if (!title) return null;
  return { title, source, when };
}

export function newsStories(bundle: ResearchBundle | null, sectorOf?: Map<string, string>): NewsStory[] {
  if (!bundle) return [];
  const out: NewsStory[] = [];
  bundle.news.forEach((row: JsonRecord, ticker: string) => {
    const parsed = parseSentimentNews(String(row["Sentiment News"] ?? ""));
    if (!parsed) return;
    const stock = bundle.technical.get(ticker);
    // The workbook ships "IDX Sector" as "-" on fundamentals/technical, so those
    // fall through to "Others". The KSEI registry carries the real sector name —
    // the caller passes it in (same source the dashboard's sector breadth uses).
    const fromKsei = sectorOf?.get(ticker);
    const rawFallback = row.Sector || stock?.sector;
    const sector = fromKsei || (rawFallback ? normalizeSector(String(rawFallback)) : "—");
    out.push({
      ticker,
      company: String(row.Company || stock?.companyName || ticker),
      sector,
      tone: toneFrom(String(row.Sentiment ?? "")),
      toneWord: String(row.Sentiment || "Neutral"),
      topic: deriveTopic(parsed.title, ticker, sector),
      title: parsed.title,
      source: parsed.source,
      when: parsed.when,
      ageDays: ageToDays(parsed.when),
    });
  });
  return out;
}

/** Real corporate-action disclosures from the workbook "Corp. Action" column. */
export function newsDisclosures(bundle: ResearchBundle | null): NewsDisclosure[] {
  if (!bundle) return [];
  const out: NewsDisclosure[] = [];
  bundle.news.forEach((row: JsonRecord, ticker: string) => {
    const raw = String(row["Corp. Action"] ?? "").trim();
    if (!raw || raw === "-") return;
    // "[Category]  {title} …  [when]" → strip the leading tag + trailing age.
    const whenMatch = raw.match(/\[([^\]]+)\]\s*$/);
    const when = whenMatch ? whenMatch[1] : "";
    let body = raw.replace(/\s*\[[^\]]+\]\s*$/, "").trim();
    body = body.replace(/^\[[^\]]+\]\s*/, "").trim(); // drop leading [Category]
    body = body.replace(/\s*-\s*…?\s*$/, "").replace(/…\s*$/, "").trim();
    const stock = bundle.technical.get(ticker);
    out.push({
      ticker,
      company: String(row.Company || stock?.companyName || ticker),
      category: String(row["Corp. Category"] || "Corporate action"),
      title: body || raw,
      when,
      ageDays: ageToDays(when),
    });
  });
  return out.sort((a, b) => (a.ageDays ?? 999) - (b.ageDays ?? 999));
}

export type NewsItem = {
  ticker: string;
  companyName: string;
  headline: string;
  sentiment: string;
  corporateAction: string;
  url: string;
};

function text(value: unknown, fallback = "Unavailable"): string {
  if (value === null || value === undefined) return fallback;
  const out = String(value).trim();
  return out && out !== "-" ? out : fallback;
}

export function newsItems(bundle: ResearchBundle | null): NewsItem[] {
  if (!bundle) return [];
  return [...bundle.news.entries()].map(([ticker, row]: [string, JsonRecord]) => ({
    ticker,
    companyName: text(row.Company || bundle.technical.get(ticker)?.companyName, ticker),
    headline: text(row["Sentiment News"], "No internal note available"),
    sentiment: text(row.Sentiment, "Neutral"),
    corporateAction: text(row["Corp. Action"], "No corporate action flagged"),
    url: tradingViewUrl(ticker),
  }));
}
