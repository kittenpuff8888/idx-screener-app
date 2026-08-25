// Login-page gate for the whole site — runs on every request before any
// static asset is served. A single access code (Cloudflare Pages secret
// SITE_AUTH_CODE) gets you a signed, HttpOnly session cookie valid for
// SESSION_DAYS; after that you're not asked again until it expires. The
// cookie is `<expiryMs>.<hmac>`, signed with SITE_AUTH_SECRET (also a
// Pages secret) so it can't be forged — no session store needed, the
// signature itself is the proof.

// Minimal local shape for what this function uses, rather than pulling in
// @cloudflare/workers-types (its global Request/Response typings collide
// with the DOM lib the rest of this Next.js project relies on).
type PagesContext = {
  request: Request;
  next: () => Promise<Response>;
  env: { SITE_AUTH_CODE: string; SITE_AUTH_SECRET: string };
};

const COOKIE_NAME = "idxr_session";
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;

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

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

async function hasValidSession(request: Request, env: PagesContext["env"]): Promise<boolean> {
  const cookie = readCookie(request, COOKIE_NAME);
  if (!cookie) return false;
  const dot = cookie.indexOf(".");
  if (dot === -1) return false;
  const expiryStr = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return false;
  const expected = await hmac(env.SITE_AUTH_SECRET, expiryStr);
  return await timingSafeEqualAsync(sig, expected);
}

function loginPage(error: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>IDX Research — Sign in</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0b0e14; color: #e6e9ef; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .card { width: 320px; max-width: calc(100vw - 48px); background: #141922; border: 1px solid rgba(148,163,184,.18);
    border-radius: 14px; padding: 28px 26px; box-shadow: 0 20px 50px rgba(0,0,0,.4); }
  .brand { font-size: 13px; font-weight: 800; letter-spacing: .14em; color: #94a3b8; margin-bottom: 4px; }
  h1 { font-size: 19px; font-weight: 800; margin: 0 0 20px; letter-spacing: -.01em; }
  label { display: block; font-size: 11px; font-weight: 700; letter-spacing: .06em; color: #94a3b8; margin-bottom: 6px; }
  input { width: 100%; font-size: 15px; padding: 11px 12px; border-radius: 9px; border: 1px solid rgba(148,163,184,.28);
    background: #0b0e14; color: #e6e9ef; outline: none; font-family: inherit; }
  input:focus { border-color: #2962FF; }
  button { width: 100%; margin-top: 16px; font-size: 14px; font-weight: 700; padding: 11px 12px; border-radius: 9px;
    border: none; background: #2962FF; color: #fff; cursor: pointer; }
  button:hover { background: #1e4fd6; }
  .err { color: #F23645; font-size: 12.5px; margin-top: 10px; }
</style>
</head>
<body>
  <form class="card" method="POST">
    <div class="brand">IDX RESEARCH</div>
    <h1>Enter access code</h1>
    <label for="code">Access code</label>
    <input id="code" name="code" type="password" autocomplete="current-password" autofocus />
    <button type="submit">Enter</button>
    ${error ? '<div class="err">Incorrect code — try again.</div>' : ""}
  </form>
</body>
</html>`;
}

const html = (body: string, status: number) =>
  new Response(body, { status, headers: { "Content-Type": "text/html;charset=UTF-8", "Cache-Control": "no-store" } });

export async function onRequest({ request, next, env }: PagesContext): Promise<Response> {
  if (request.method === "POST") {
    const form = await request.formData();
    const code = String(form.get("code") ?? "");
    const ok = await timingSafeEqualAsync(code, env.SITE_AUTH_CODE);
    if (!ok) return html(loginPage(true), 401);

    const expiry = Date.now() + SESSION_MS;
    const sig = await hmac(env.SITE_AUTH_SECRET, String(expiry));
    const url = new URL(request.url);
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.pathname + url.search,
        "Set-Cookie": `${COOKIE_NAME}=${expiry}.${sig}; Path=/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (await hasValidSession(request, env)) return next();

  return html(loginPage(false), 401);
}
