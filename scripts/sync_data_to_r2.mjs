#!/usr/bin/env node
// Uploads out/data/** to the Cloudflare R2 bucket backing the Cloudflare
// Pages deploy's /data/* proxy (functions/data/[[path]].ts) — R2 has no
// per-bucket file-count limit, unlike a Pages deployment's static assets
// (capped at 20,000 files; this archive alone is 30,000+).
//
// Incremental by design: compares each local file's sha256 against
// data-manifest.json (committed to the repo) and only PUTs files that are
// new or changed, so a daily run costs roughly one day's worth of new
// files, not a full 30k-object re-upload. Deletions are NOT synced (a
// stale object in R2 with no matching local file is simply never linked
// to from the app — orphaned but harmless).
//
// Required env vars: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID.

import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_DIR = path.join(REPO_ROOT, "out", "data");
const MANIFEST_PATH = path.join(REPO_ROOT, "data-manifest.json");
const BUCKET = "idx-screener-data";
const CONCURRENCY = 6;
const MAX_RETRIES = 6;
const CHECKPOINT_EVERY = 200; // flush the manifest to disk periodically so a killed/crashed run doesn't lose progress

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!TOKEN || !ACCOUNT_ID) {
  console.error("Missing CLOUDFLARE_API_TOKEN or CLOUDFLARE_ACCOUNT_ID");
  process.exit(1);
}

async function sha256File(absPath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(absPath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function putObject(key, absPath) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${encodeURI(key)}`;
  const body = await readFile(absPath);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body,
    });
    if (res.ok) return;
    const retryable = res.status === 429 || res.status >= 500;
    const text = await res.text().catch(() => "");
    if (!retryable || attempt === MAX_RETRIES) throw new Error(`PUT ${key} failed: ${res.status} ${text}`);
    // Exponential backoff with jitter — Cloudflare's R2 API rate-limits
    // aggressively under sustained concurrent writes (HTTP 429, code 971).
    const backoff = Math.min(30000, 500 * 2 ** attempt) + Math.random() * 300;
    await sleep(backoff);
  }
}

async function runPool(items, worker, concurrency) {
  let i = 0, failures = 0;
  async function next() {
    while (i < items.length) {
      const idx = i++;
      try {
        await worker(items[idx]);
      } catch (err) {
        failures++;
        console.error(err.message);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return failures;
}

async function loadManifest() {
  try {
    return JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function listFilesRecursive(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath ?? e.path, e.name)));
}

async function main() {
  const manifest = await loadManifest();
  const files = await listFilesRecursive(DATA_DIR);
  console.log(`Found ${files.length} local files under out/data/`);

  const toUpload = [];
  for (const rel of files) {
    const key = `data/${rel.split(path.sep).join("/")}`;
    const abs = path.join(DATA_DIR, rel);
    const hash = await sha256File(abs);
    if (manifest[key] !== hash) toUpload.push({ key, abs, hash });
  }
  console.log(`${toUpload.length} file(s) changed or new — uploading (skipping ${files.length - toUpload.length} unchanged)`);

  if (toUpload.length === 0) {
    console.log("Nothing to sync.");
    return;
  }

  let done = 0;
  const failures = await runPool(
    toUpload,
    async (item) => {
      await putObject(item.key, item.abs);
      manifest[item.key] = item.hash;
      done++;
      if (done % CHECKPOINT_EVERY === 0) {
        await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 0));
        console.log(`  ...${done}/${toUpload.length} uploaded`);
      }
    },
    CONCURRENCY
  );

  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 0));
  console.log(`Synced ${toUpload.length - failures}/${toUpload.length} file(s). Manifest updated.`);
  if (failures > 0) {
    console.error(`${failures} file(s) failed to upload.`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
