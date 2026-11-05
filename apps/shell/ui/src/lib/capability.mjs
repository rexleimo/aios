// The only way a page gets facts: run the capability process and read its JSON.
//
// ADR 0007 decision 3 — the view fetches, the capability process executes. Importing
// the assembly code instead would drag `scripts/lib/**` into the bundling graph (measured
// earlier: Turbopack then demands a whole-repository trace), so every loader here spawns
// `scripts/aios.mjs` and parses stdout.
//
// A failure is returned, never swallowed: an empty section reads as "nothing here",
// which is a different claim from "the command failed".
import { spawnSync } from 'node:child_process';
import path from 'node:path';

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
export function runCapabilityJson(args, options = {}) {
  const rootDir = options.rootDir ?? repoRoot();
  const script = path.join(rootDir, 'scripts', 'aios.mjs');
  const spawnImpl = options.spawnImpl ?? spawnSync;
  const result = spawnImpl(process.execPath, [script, ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: options.timeoutMs ?? CAPABILITY_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, AIOS_PROJECT_ROOT: rootDir },
  });
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

export const loadStatus = (options) => runCapabilityJson(['status', '--json'], options);
export const loadMemory = (options) => runCapabilityJson(['memory', 'report', '--json'], options);
export const loadUsage = (options) => runCapabilityJson(['tokens', 'report', '--json'], options);
export const loadIntegrations = (options) => runCapabilityJson(['integration', 'list', '--json'], options);
export const loadAgents = (options) => runCapabilityJson(['agents', 'list', '--json'], options);
export const loadWorkflows = (options) => runCapabilityJson(['workflow', 'list', '--json'], options);
export const loadSkillHealth = (options) => runCapabilityJson(['skill', 'health', '--json'], options);

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
