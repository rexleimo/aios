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
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { withSnapshotStale } from './snapshot-cache.mjs';

const execFileAsync = promisify(execFile);

export const CAPABILITY_TIMEOUT_MS = 60_000;

/**
 * 找到服务自己跑在哪份 AIOS 代码上。
 *
 * 旧实现是 `path.resolve(process.cwd(), '..','..','..')`——它假定 cwd 一定是 `<仓>/apps/shell/ui`。
 * 这个假定在两处会碎：从仓根直接跑脚本时算出盘符根；而桌面壳的 sidecar 实测可以把工作目录
 * 放在易变目录（`resolve_work_dir` 在工程位于安装树内时故意这么干），那时 `../../..` 指向一个
 * 与 AIOS 无关的目录，采集就会读错仓——这是「整套东西都没对上」的底层原因，不是显示问题。
 * 现在按客观标记向上找 `scripts/aios.mjs`：找到才算，找不到就明说，不猜。
 */
export function locateProjectRoot(fromDir = process.cwd()) {
  let current = path.resolve(fromDir);
  for (let depth = 0; depth < 12; depth += 1) {
    if (fs.existsSync(path.join(current, 'scripts', 'aios.mjs'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export function repoRoot() {
  const declared = String(process.env.AIOS_PROJECT_ROOT ?? '').trim();
  if (declared) return path.resolve(declared);
  const found = locateProjectRoot(process.cwd());
  if (found) return found;
  // 找不到源码仓时不编一个路径：交给 resolveCapabilityCli 去找已安装运行时，
  // 而工作区清单总是从**它自己所在的根**发现，所以这里宁可给出 cwd。
  return path.resolve(process.cwd());
}

/**
 * 找到能代表 `rootDir` 跑命令的那份 CLI。
 *
 * 为什么不能只拼 `<rootDir>/scripts/aios.mjs`：那条路径只在 AIOS **源码仓** 里存在。界面切到
 * 另一个工作区（本机实测 18 个中的 `rex-ai-tools` 等）时，那里没有源码树，拼出来的脚本不存在，
 * 采集会成一个看不懂的「读不到」。顺序是：工程自带的源码入口 → 显式 `AIOS_CLI` → 已安装运行时。
 * 全部没有时把试过的路径都说出来，不假称「本机没有工作区」。
 *
 * @returns {{ ok: true, script: string, kind: 'project-source'|'env'|'installed', tried: string[] }
 *          | { ok: false, error: string, tried: string[] }}
 */
export function resolveCapabilityCli(rootDir = repoRoot(), env = process.env, exists = require_exists) {
  const tried = [];
  const source = path.join(rootDir, 'scripts', 'aios.mjs');
  tried.push(`${source} (工程自带的源码入口)`);
  if (exists(source)) return { ok: true, script: source, kind: 'project-source', tried };

  const declared = String(env.AIOS_CLI ?? '').trim();
  if (declared) {
    tried.push(`${declared} (AIOS_CLI 指定)`);
    if (exists(declared)) return { ok: true, script: declared, kind: 'env', tried };
  }

  const home = env.USERPROFILE || env.HOME || require_os_homedir();
  // 中文注释：安装根的规则**与原生 shim 一字不差**（`~/.aios/bin/aios.cmd` 自己写的）：
  // 先 `AIOS_ROOT_DIR`，不存在则退 `~/.rexcil/aios`。不能把那个 `.cmd` 直接交给 node 跑：
  // 实测它把 `@echo off` 当 JS 解析，报 SyntaxError 后被包成「读不到」——伪造成用户空仓。
  const installedRoots = [String(env.AIOS_ROOT_DIR ?? '').trim(), path.join(home, '.rexcil', 'aios')].filter(Boolean);
  for (const root of installedRoots) {
    const entry = path.join(root, 'scripts', 'aios.mjs');
    tried.push(`${entry} (已安装运行时)`);
    if (exists(entry)) return { ok: true, script: entry, kind: 'installed', tried };
  }

  return { ok: false, error: `找不到可执行的 AIOS CLI，试过：${tried.join('；')}`, tried };
}

// 写成可注入的小包装：测试要能在没有真实安装面的机器上跑完三种分支。
function require_exists(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}
function require_os_homedir() {
  return os.homedir();
}

/**
 * Run `aios <args>` and parse stdout as JSON.
 * @param {string[]} args
 * @param {{ rootDir?: string, timeoutMs?: number, spawnImpl?: typeof spawnSync }} [options]
 * @returns {{ ok: true, data: unknown } | { ok: false, error: string }}
 */
export async function runCapabilityJson(args, options = {}) {
  const rootDir = options.rootDir ?? repoRoot();
  const located = options.cliImpl ? { ok: true, script: options.cliImpl, kind: 'project-source', tried: [] } : resolveCapabilityCli(rootDir);
  if (!located.ok) return { ok: false, error: located.error };
  const script = located.script;
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
 * Cached run: `aios status --json` costs seconds (2.7 s measured 2026-11-07; 9.3 s before
 * the catalogue de-duplication), so a page that spawns it per request is
 * a blank window per request. The snapshot TTL makes a revisit instant, and the returned
 * `cached`/`ageMs` let the page say how old the numbers are instead of implying they are
 * live.
 */
export async function runCapabilityJsonCached(args, options = {}) {
  const snapshot = withSnapshotStale(`cli:${args.join(' ')}:${options.rootDir ?? repoRoot()}`, () =>
    runCapabilityJson(args, options),
  );
  // Nothing to show: this is the only case that is allowed to block the page.
  if (!snapshot.payload) {
    const payload = await snapshot.refresh();
    return { ...payload, cached: false, ageMs: 0, stale: false };
  }
  // Something to show: paint immediately and refresh behind the response.
  if (snapshot.stale) void snapshot.refresh();
  const payload = snapshot.payload;
  return {
    ...payload,
    cached: snapshot.cached,
    ageMs: snapshot.ageMs,
    stale: snapshot.stale,
  };
}

/** 文本型命令（memo/pin 这类）：原样返回 stdout，不假设它是 JSON。 */
export async function runCapabilityText(args, options = {}) {
  const rootDir = options.rootDir ?? repoRoot();
  const script = path.join(rootDir, 'scripts', 'aios.mjs');
  try {
    const { stdout } = await execFileAsync(process.execPath, [script, ...args], {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: options.timeoutMs ?? CAPABILITY_TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, AIOS_PROJECT_ROOT: rootDir },
    });
    return { ok: true, text: String(stdout).trim(), error: null };
  } catch (error) {
    return {
      ok: false,
      text: String(error?.stdout ?? '').trim(),
      error: String(error?.stderr ?? error?.message ?? '').trim().slice(0, 300),
    };
  }
}

export const loadMemoPinned = (options) => runCapabilityText(['memo', 'pin', 'show'], options);

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
