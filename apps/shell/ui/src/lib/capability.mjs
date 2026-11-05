// The only way a page gets facts: run the capability process and read its JSON.
//
// ADR 0007 decision 3 — the view fetches, the capability process executes. Importing
// the assembly code instead would drag `scripts/lib/**` into the bundling graph (measured
// earlier: Turbopack then demands a whole-repository trace), so every loader here spawns
// `scripts/aios.mjs` and parses stdout.
//
// A failure is returned, never swallowed: an empty section reads as "nothing here",
// which is a different claim from "the command failed".
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

import { withSnapshotAsync } from './snapshot-cache.mjs';

const execFileAsync = promisify(execFile);

export const CAPABILITY_TIMEOUT_MS = 60_000;

function repoRoot() {
  return process.env.AIOS_PROJECT_ROOT ?? path.resolve(process.cwd(), '..', '..', '..');
}

/**
 * Run `aios <args>` and parse stdout as JSON.
 * @param {string[]} args
 * @param {{ rootDir?: string, timeoutMs?: number, spawnImpl?: typeof spawnSync }} [options]
 * @returns {{ ok: true, data: unknown } | { ok: false, error: string }}
 */
export async function runCapabilityJson(args, options = {}) {
  const rootDir = options.rootDir ?? repoRoot();
  const script = path.join(rootDir, 'scripts', 'aios.mjs');
  // Async on purpose: `spawnSync` blocks the Node event loop, so Next cannot flush the
  // shell or the loading skeleton while a 9-second command runs — the window would be
  // blank no matter how good the fallback is. Measured: sync spawn -> TTFB 7.8 s,
  // async spawn -> shell at ~0.2 s and data streamed in later.
  const run = options.runImpl ?? execFileAsync;
  let result;
  try {
    const { stdout, stderr } = await run(process.execPath, [script, ...args], {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: options.timeoutMs ?? CAPABILITY_TIMEOUT_MS,
      maxBuffer: 32 * 1024 * 1024,
      env: { ...process.env, AIOS_PROJECT_ROOT: rootDir },
    });
    result = { status: 0, stdout, stderr, error: null };
  } catch (error) {
    // `execFile` rejects on a non-zero exit, which is exactly the "blocked verdict" case
    // below; the payload still decides.
    result = {
      status: typeof error?.code === 'number' ? error.code : 1,
      stdout: String(error?.stdout ?? ''),
      stderr: String(error?.stderr ?? error?.message ?? ''),
      error: error?.code === undefined ? error : null,
    };
  }
  if (result.error) {
    return { ok: false, error: `cannot run aios ${args.join(' ')}: ${result.error.message}` };
  }
  // A non-zero exit code is not a failure here: `aios status --json` and
  // `aios workflow list --json` exit 1 when their own verdict is "blocked", which is a
  // perfectly good payload (measured: status=1, workflow=1, memory=0, tokens=0). So the
  // payload decides, and the exit code rides along for the page to show.
  const stdout = String(result.stdout ?? '');
  try {
    return { ok: true, data: JSON.parse(stdout), exitCode: result.status };
  } catch (error) {
    return {
      ok: false,
      exitCode: result.status,
      error: `aios ${args.join(' ')} exited ${result.status} and printed non-JSON: ${
        error instanceof Error ? error.message : String(error)
      } ${String(result.stderr ?? '').trim().slice(0, 200)}`,
    };
  }
}

/**
 * Cached run: `aios status --json` costs ~9.3 s, so a page that spawns it per request is
 * a blank window per request. The snapshot TTL makes a revisit instant, and the returned
 * `cached`/`ageMs` let the page say how old the numbers are instead of implying they are
 * live.
 */
export async function runCapabilityJsonCached(args, options = {}) {
  const snapshot = await withSnapshotAsync(
    `cli:${args.join(' ')}:${options.rootDir ?? repoRoot()}`,
    () => runCapabilityJson(args, options),
  );
  // Same shape as the uncached call, plus how old the answer is. Callers that spread it
  // keep working, and a page can print the age instead of implying the numbers are live.
  return { ...snapshot.payload, cached: snapshot.cached, ageMs: snapshot.ageMs };
}

export const loadStatus = (options) => runCapabilityJsonCached(['status', '--json'], options);
export const loadMemory = (options) => runCapabilityJsonCached(['memory', 'report', '--json'], options);
export const loadUsage = (options) => runCapabilityJsonCached(['tokens', 'report', '--json'], options);
export const loadIntegrations = (options) => runCapabilityJsonCached(['integration', 'list', '--json'], options);
export const loadAgents = (options) => runCapabilityJsonCached(['agents', 'list', '--json'], options);
export const loadWorkflows = (options) => runCapabilityJsonCached(['workflow', 'list', '--json'], options);
export const loadSkillHealth = (options) => runCapabilityJsonCached(['skill', 'health', '--json'], options);

/** Bytes → a short human string. Formatting only; the numbers stay the facts. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
