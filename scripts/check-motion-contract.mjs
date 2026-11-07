/**
 * MOTION.md 声明级判据的**处置层**：文件发现、基线读写、四态裁决、CLI。
 *
 * 判定本体在 `lib/motion-contract/analyze.mjs`。本文件只回答「这条命中算不算放过」以及
 * 「怎么把结论交给调用方」——把这两件事分开，是为了让「什么算违规」只有一个 owner。
 *
 * 退出码：0 = 无违规或已 SKIP；1 = 有违规；2 = 用法错误。
 * SKIP 是真实结论（不是干净的伪装）：取不到 git tracked 列表时说明原因并退出 0，
 * 形状与 `aios standards check` 一致。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { analyzeSource, RULES } from './lib/motion-contract/analyze.mjs';
import { classifySurfaces } from './lib/design-contract/surfaces.mjs';

export { MAX_MOTION_MS, REDUCED_MOTION_QUERY, RULES, analyzeSource, parseDurationMs, stripReducedMotionBlocks } from './lib/motion-contract/analyze.mjs';

// 「什么算源码面」只有一个 owner：scripts/lib/design-contract/surfaces.mjs。
// 这里曾经有一份自己的前缀表，与设计契约的排除表各说各话（docs/reports/、
// docs-site/overrides/、video/ 在两边算出不同结果），于是同一个仓库对同一个
// 问题给出两个都显得权威的答案。
const SCANNED_EXTENSIONS = Object.freeze(['.css', '.html', '.htm']);

/** baseline 的键：`<path>::<code>`。 */
export function baselineKey(filePath, code) {
  return `${filePath}::${code}`;
}

export function toBaselineMap(entries = []) {
  const map = new Map();
  for (const entry of entries) map.set(baselineKey(entry.path, entry.code), Number(entry.count) || 0);
  return map;
}

/**
 * 处置：exempt（有书面理由且点名了 code）> baseline（存量）> violation。
 * 静默跳过不是处置——每条命中都必须落到四者之一（含 baseline-stale），否则就是「没结论」。
 */
export function resolveDispositions({ results, baseline = new Map() }) {
  const rows = [];
  const seen = new Set();
  for (const result of results) {
    const counts = new Map();
    for (const finding of result.findings) counts.set(finding.code, (counts.get(finding.code) || 0) + 1);
    for (const [code, count] of counts) {
      const key = baselineKey(result.filePath, code);
      seen.add(key);
      const allowed = baseline.get(key);
      const exemption = result.exemptions.find((entry) => entry.code === code);
      let disposition = 'violation';
      if (allowed !== undefined && count <= allowed) disposition = 'baseline';
      if (exemption) disposition = 'exempt';
      rows.push({
        path: result.filePath,
        code,
        count,
        allowed: allowed ?? 0,
        disposition,
        reason: exemption?.reason ?? RULES[code]?.message ?? code,
        source: RULES[code]?.source ?? '',
      });
    }
  }
  // stale 必须扫**全量 baseline**，不能只在「本次出现过的文件」里找：文件被删掉/改名后它的
  // 存量条目永远不会再被命中，只扫出现过的文件就永远报不收，基线只会长胖。
  for (const [key, allowed] of baseline) {
    if (seen.has(key)) continue;
    const [file, code] = key.split('::');
    rows.push({
      path: file,
      code,
      count: 0,
      allowed,
      disposition: 'baseline-stale',
      reason: 'baseline 条目已不再命中，请用 --update-baseline 收掉（基线只许收缩）',
      source: RULES[code]?.source ?? '',
    });
  }
  return rows;
}

export function summarize(rows) {
  const count = (name) => rows.filter((row) => row.disposition === name).length;
  return {
    measured: rows.length,
    exempt: count('exempt'),
    baseline: count('baseline'),
    baselineStale: count('baseline-stale'),
    blocking: count('violation'),
  };
}

function runGit(args, cwd) {
  try {
    return {
      ok: true,
      stdout: execFileSync('git', args, {
        windowsHide: true,
        cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (error) {
    return { ok: false, stdout: '', stderr: String(error?.stderr ?? error?.message ?? error) };
  }
}

export function listScannedFiles({ rootDir, gitImpl = runGit }) {
  const inside = gitImpl(['rev-parse', '--is-inside-work-tree'], rootDir);
  if (!inside.ok || inside.stdout.trim() !== 'true') return { ok: false, reason: `not a git work tree: ${rootDir}` };
  const listed = gitImpl(['ls-files', '-z'], rootDir);
  if (!listed.ok) return { ok: false, reason: `git ls-files failed in ${rootDir}` };
  const candidates = listed.stdout
    .split(String.fromCharCode(0))
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((file) => SCANNED_EXTENSIONS.some((ext) => file.toLowerCase().endsWith(ext)));
  // The same classifier the design contract uses. Two lists is how the same
  // repository ends up with two authoritative answers about its own surface set.
  const classified = classifySurfaces(candidates, { rootDir });
  return { ok: true, files: [...classified.surfaces].sort(), excluded: classified.excluded, exclusionError: classified.error };

}

const DEFAULT_BASELINE_PATH = 'config/motion-contract-baseline.json';

export function readBaseline({ rootDir, baselinePath = DEFAULT_BASELINE_PATH, readImpl = (file) => fs.readFileSync(file, 'utf8') }) {
  try {
    const parsed = JSON.parse(readImpl(path.join(rootDir, baselinePath)));
    return { ok: true, entries: Array.isArray(parsed.entries) ? parsed.entries : [], baselinePath };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: true, entries: [], baselinePath, found: false };
    return { ok: false, reason: `invalid baseline: ${error.message}`, baselinePath };
  }
}

export function writeBaseline({ rootDir, rows, baselinePath = DEFAULT_BASELINE_PATH }) {
  const entries = rows
    .filter((row) => row.disposition === 'violation')
    .map((row) => ({ path: row.path, code: row.code, count: row.count }))
    .sort((a, b) => (a.path === b.path ? a.code.localeCompare(b.code) : a.path.localeCompare(b.path)));
  const payload = {
    schemaVersion: 1,
    note: 'MOTION.md 声明级判据的存量基线。只许收缩：新增违规即红灯，不是往这里追加一行。',
    entries,
  };
  const target = path.join(rootDir, baselinePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
  return { ok: true, count: entries.length, baselinePath };
}

/**
 * 编排：发现文件 → 逐文件量 → 处置 → 汇总。
 * `files` 可注入（测试用），否则取 git tracked 列表。
 */
export function runCheck({
  rootDir,
  baselinePath = DEFAULT_BASELINE_PATH,
  files = null,
  readImpl = (file) => fs.readFileSync(file, 'utf8'),
  baselineEntries = null,
}) {
  const listing = files ? { ok: true, files } : listScannedFiles({ rootDir });
  if (!listing.ok) return { ok: true, skip: true, reason: listing.reason };

  const baselineRead = baselineEntries
    ? { ok: true, entries: baselineEntries }
    : readBaseline({ rootDir, baselinePath });
  if (!baselineRead.ok) return { ok: false, usage: true, reason: baselineRead.reason };

  const results = [];
  for (const filePath of listing.files) {
    let content;
    try {
      content = readImpl(path.join(rootDir, filePath));
    } catch (error) {
      // 只有「tracked 但工作树里已删」可以跳过；其余错误必须往上抛，
      // 静默 continue 会把坏掉的度量器报成干净。
      if (error?.code === 'ENOENT') continue;
      throw error;
    }
    results.push({ filePath, ...analyzeSource({ filePath, content }) });
  }

  const rows = resolveDispositions({ results, baseline: toBaselineMap(baselineRead.entries) });
  return { ok: true, skip: false, rows, summary: summarize(rows), scanned: results.length };
}

function parseArgs(argv) {
  const args = { rootDir: process.cwd(), json: false, updateBaseline: false, baselinePath: DEFAULT_BASELINE_PATH };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--root') args.rootDir = path.resolve(argv[++i] ?? '');
    else if (token === '--json') args.json = true;
    else if (token === '--update-baseline') args.updateBaseline = true;
    else if (token === '--baseline') args.baselinePath = argv[++i] ?? DEFAULT_BASELINE_PATH;
    else if (token === '--help' || token === '-h') args.help = true;
    else return { error: `unknown argument: ${token}` };
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/check-motion-contract.mjs [--root <dir>] [--json] [--baseline <rel>] [--update-baseline]

MOTION.md「可机器判定」那一半。只判声明级事实，不判动效好坏。
退出码：0 无违规或 SKIP；1 有违规；2 用法错误。`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`[motion] ${args.error}`);
    return 2;
  }
  if (args.help) {
    printHelp();
    return 0;
  }
  const result = runCheck({ rootDir: args.rootDir, baselinePath: args.baselinePath });
  if (!result.ok) {
    console.error(`[motion] ${result.reason}`);
    return 2;
  }
  if (result.skip) {
    console.log(`[motion] SKIP: ${result.reason}`);
    return 0;
  }
  if (args.updateBaseline) {
    const written = writeBaseline({ rootDir: args.rootDir, rows: result.rows, baselinePath: args.baselinePath });
    console.log(`[motion] baseline written: ${written.count} entries -> ${written.baselinePath}`);
    return 0;
  }
  if (args.json) {
    console.log(JSON.stringify({ summary: result.summary, rows: result.rows }, null, 2));
  } else {
    const summary = result.summary;
    console.log(`[motion] scanned=${result.scanned} measured=${summary.measured} exempt=${summary.exempt} baseline=${summary.baseline} stale=${summary.baselineStale} blocking=${summary.blocking} root=${args.rootDir}`);
    for (const row of result.rows.filter((r) => r.disposition === 'violation')) {
      console.log(`  VIOLATION ${row.path} [${row.code}] x${row.count} — ${row.reason}`);
    }
    for (const row of result.rows.filter((r) => r.disposition === 'baseline-stale')) {
      console.log(`  STALE ${row.path} [${row.code}] allowed=${row.allowed} — ${row.reason}`);
    }
  }
  return result.summary.blocking > 0 ? 1 : 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exit(main());
