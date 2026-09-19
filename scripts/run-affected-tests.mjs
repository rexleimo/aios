/* 中文注释：只跑"和本次改动关联"的测试；拿不准就自动退回全量 regression。
 *
 * 用法：
 *   node scripts/run-affected-tests.mjs                 # 工作区 + 未跟踪文件
 *   node scripts/run-affected-tests.mjs --base origin/main
 *   node scripts/run-affected-tests.mjs --list          # 只打印选中的文件
 *   node scripts/run-affected-tests.mjs --dry-run       # 打印决策，不起测试进程
 *
 * 这里刻意不 import 产品代码（scripts/lib/platform 等会拉起客户端注册表）：测试入口必须
 * 在产品代码坏掉的时候仍然能跑，否则最需要它的场景恰恰用不了。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildImpactIndex, selectAffectedTests } from './lib/test-impact.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = path.join(ROOT, 'scripts', 'test-suites.json');

const USAGE = `用法: node scripts/run-affected-tests.mjs [选项]

  --base <ref>        额外把 <ref>...HEAD 的提交差异算进改动集（默认只取工作区）
  --changed <path>    用给定的改动集替代 git 探测（可重复），用于核对某组改动会跑哪些测试
  --pool <suite>      选择测试范围来自哪个套件（默认 regression）
  --threshold <0-1>   关联占比超过该值就退回全量（默认 0.6）
  --concurrency <n>   传给 node --test-concurrency（默认沿用套件配置）
  --list              只把选中的测试文件写到 stdout，不执行
  --json              以 JSON 输出决策（mode/files/reasons/pool）
  --dry-run           打印决策但不启动测试
  -h, --help          显示本帮助
`;

function parseArgs(argv) {
  const options = { base: '', changed: [], pool: 'regression', threshold: 0.6, concurrency: 0, list: false, json: false, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--base') options.base = argv[++i] || '';
    else if (arg === '--changed') options.changed.push(argv[++i] || '');
    else if (arg === '--pool') options.pool = argv[++i] || 'regression';
    else if (arg === '--threshold') options.threshold = Number(argv[++i]);
    else if (arg === '--concurrency') options.concurrency = Number(argv[++i]);
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isFinite(options.threshold) || options.threshold <= 0 || options.threshold > 1) {
    throw new Error(`--threshold 需要在 (0, 1] 之间：${argv.join(' ')}`);
  }
  return options;
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} 失败：${result.stderr.trim()}`);
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function changedFiles({ base, changed }) {
  if (changed.length > 0) return changed;
  const paths = new Set([
    ...git(['diff', '--name-only', 'HEAD']),
    ...git(['ls-files', '--others', '--exclude-standard']),
  ]);
  if (base) for (const p of git(['diff', '--name-only', `${base}...HEAD`])) paths.add(p);
  return [...paths];
}

function suiteFiles(pool) {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const suite = manifest[pool];
  if (!suite || !Array.isArray(suite.files)) throw new Error(`未知测试套件: ${pool}`);
  return { files: [...new Set(suite.files)], concurrency: Number(suite.concurrency) || 4 };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  const suite = suiteFiles(options.pool);
  const index = buildImpactIndex({ rootDir: ROOT, testFiles: suite.files });
  const changed = changedFiles({ base: options.base, changed: options.changed });
  const decision = selectAffectedTests({
    changedFiles: changed.map((file) => file.split(path.sep).join('/')),
    index,
    thresholdRatio: options.threshold,
  });
  const targetFiles = decision.mode === 'full' ? suite.files : decision.files;
  // 子集不需要满并发：选中 3 个文件时开 4 路只是白起进程。
  const concurrency = options.concurrency > 0
    ? options.concurrency
    : (decision.mode === 'full' ? suite.concurrency : Math.min(suite.concurrency, Math.max(1, targetFiles.length)));

  const summary = {
    mode: decision.mode,
    pool: options.pool,
    poolSize: suite.files.length,
    changed: changed.length,
    selected: targetFiles.length,
    reasons: decision.reasons,
  };

  if (options.list) {
    process.stdout.write(`${targetFiles.join('\n')}${targetFiles.length ? '\n' : ''}`);
    return 0;
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify({ ...summary, files: targetFiles }, null, 2)}\n`);
  } else {
    process.stderr.write(`[affected] mode=${summary.mode} 选中 ${summary.selected}/${summary.poolSize}（改动 ${summary.changed} 个文件，并发 ${concurrency}）\n`);
    for (const reason of summary.reasons) process.stderr.write(`[affected] ${reason}\n`);
  }
  if (options.dryRun) return 0;
  if (targetFiles.length === 0) {
    process.stderr.write('[affected] 没有关联测试需要跑；发布前仍需 npm run test:scripts 全量。\n');
    return 0;
  }

  const result = spawnSync(
    process.execPath,
    ['--test', `--test-concurrency=${concurrency}`, ...targetFiles],
    { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] }
  );
  return result.status ?? 1;
}

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(`[affected] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
