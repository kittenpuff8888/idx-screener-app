// Serves everything under /data/* from the R2 bucket (idx-screener-data)
// instead of bundling it as static Pages assets — a Cloudflare Pages
// deployment caps out at 20,000 files, and this archive alone
// (data/ohlcv/**) is 30,000+. R2 has no such limit. Kept behind the same
// login gate as everything else since _middleware.ts runs first.
//
// Populated by scripts/sync_data_to_r2.mjs, which mirrors out/data/** into
// this bucket under the same relative keys (e.g. out/data/ohlcv/2026-08-24/
// BBCA.json -> R2 key data/ohlcv/2026-08-24/BBCA.json).

type R2ObjectBody = {
  body: ReadableStream;
  httpEtag: string;
  uploaded: Date;
};
type R2Bucket = {
  get(key: string): Promise<R2ObjectBody | null>;
};

type PagesContext = {
  request: Request;
  params: { path?: string | string[] };
  env: { DATA_BUCKET: R2Bucket };
};

const EXT_TYPES: Record<string, string> = {
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};

export async function onRequest({ request, params, env }: PagesContext): Promise<Response> {
  const segments = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  if (segments.length === 0) return new Response("Not found", { status: 404 });

  const key = `data/${segments.join("/")}`;
  const object = await env.DATA_BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const ext = key.slice(key.lastIndexOf(".") + 1).toLowerCase();
  const headers = new Headers();
  headers.set("Content-Type", EXT_TYPES[ext] ?? "application/octet-stream");
  headers.set("ETag", object.httpEtag);
  // Data changes at most once a day (the pipeline runs once after market
  // close); a short edge cache cuts R2 reads without ever serving stale
  // data for more than a few minutes.
  headers.set("Cache-Control", "public, max-age=300");

  if (request.headers.get("If-None-Match") === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(object.body, { headers });
}
