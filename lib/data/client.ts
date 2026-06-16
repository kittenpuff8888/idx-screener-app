export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export async function fetchJson<T>(path: string): Promise<T> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${BASE_PATH}${normalized}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Unable to load ${normalized}: ${response.status}`);
  }
  return (await response.json()) as T;
}

export function tradingViewSymbol(ticker: string): string {
  const clean = ticker.trim().toUpperCase().replace(".JK", "");
  return `IDX:${clean}`;
}

export function tradingViewUrl(ticker: string): string {
  return `https://www.tradingview.com/symbols/${encodeURIComponent(tradingViewSymbol(ticker).replace(":", "-"))}/news/`;
}
