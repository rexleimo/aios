// A short-lived on-disk cache for capability output.
//
// The measured problem: `aios status --json` takes ~9.3 s and the matrix loader (which
// runs the same collection) ~9.9 s. With a dynamic page that spawns on every request, a
// window that opens in one second then sits blank for ten — and navigating between pages
// pays it again.
//
// Three answers, this file is the second: (1) render a frame immediately (`loading.tsx`),
// (2) do not re-spawn for a fact that cannot change inside the TTL, (3) make the staleness
// visible instead of pretending freshness. So the snapshot carries its age and the pages
// print it.
//
// The cache is deliberately dumb: one JSON file per key in the OS temp directory, keyed by
// a hash of the command. A "refresh" action deletes the files rather than reaching into a
// process — the same mechanism works whether or not the page and the action share a
// process.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Long enough to make navigation instant, short enough that a stale view is obvious. */
export const DEFAULT_TTL_MS = 30_000;

export function cacheDir() {
  return path.join(os.tmpdir(), 'aios-shell-cache');
}

export function cacheFile(key) {
  const digest = createHash('sha256').update(key).digest('hex').slice(0, 32);
  return path.join(cacheDir(), `${digest}.json`);
}

/** @returns {{ payload: unknown, ageMs: number } | null} */
export function readSnapshot(key, { ttlMs = DEFAULT_TTL_MS, now = Date.now() } = {}) {
  try {
    const raw = fs.readFileSync(cacheFile(key), 'utf8');
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.at !== 'number') return null;
    const ageMs = now - entry.at;
    if (ageMs < 0 || ageMs > ttlMs) return null;
    return { payload: entry.payload, ageMs };
  } catch {
    return null;
  }
}

export function writeSnapshot(key, payload, { now = Date.now() } = {}) {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(cacheFile(key), JSON.stringify({ at: now, payload }));
    return true;
  } catch {
    // A cache that cannot be written is not an error; the next call simply pays again.
    return false;
  }
}

/** Drop every snapshot — what a "refresh" action means. */
export function clearSnapshots() {
  try {
    const dir = cacheDir();
    for (const name of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      fs.rmSync(path.join(dir, name), { force: true });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Read through the cache, and report which answer was served.
 * `load()` is only called on a miss, so a slow command runs once per TTL at most.
 */
export async function withSnapshotAsync(key, load, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const hit = readSnapshot(key, { ttlMs });
  if (hit) return { payload: hit.payload, cached: true, ageMs: hit.ageMs };
  const payload = await load();
  writeSnapshot(key, payload);
  return { payload, cached: false, ageMs: 0 };
}
