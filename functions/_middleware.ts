// HTTP Basic Auth gate for the whole site — runs on every request before any
// static asset is served. Credentials live in Cloudflare Pages secrets
// (SITE_AUTH_USER / SITE_AUTH_PASS, set via `wrangler pages secret put`),
// never in the repo. Constant-time comparison to avoid a timing side-channel
// on the password check.

// Minimal local shape for what this function uses, rather than pulling in
// @cloudflare/workers-types (its global Request/Response typings collide
// with the DOM lib the rest of this Next.js project relies on).
type PagesContext = {
  request: Request;
  next: () => Promise<Response>;
  env: { SITE_AUTH_USER: string; SITE_AUTH_PASS: string };
};

// Hashes both values first so differing lengths don't themselves leak
// length info, then compares the fixed-length digests byte-by-byte without
// short-circuiting.
async function timingSafeEqualAsync(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [aHash, bHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const av = new Uint8Array(aHash);
  const bv = new Uint8Array(bHash);
  let diff = 0;
  for (let i = 0; i < av.length; i++) diff |= av[i] ^ bv[i];
  return diff === 0 && a.length === b.length;
}

const unauthorized = () =>
  new Response("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="IDX Research", charset="UTF-8"' },
  });

export async function onRequest({ request, next, env }: PagesContext): Promise<Response> {
  const header = request.headers.get("Authorization");
  if (!header || !header.startsWith("Basic ")) return unauthorized();

  let user = "", pass = "";
  try {
    const decoded = atob(header.slice(6));
    const sep = decoded.indexOf(":");
    if (sep === -1) return unauthorized();
    user = decoded.slice(0, sep);
    pass = decoded.slice(sep + 1);
  } catch {
    return unauthorized();
  }

  const okUser = await timingSafeEqualAsync(user, env.SITE_AUTH_USER);
  const okPass = await timingSafeEqualAsync(pass, env.SITE_AUTH_PASS);
  if (!okUser || !okPass) return unauthorized();

  return next();
}
