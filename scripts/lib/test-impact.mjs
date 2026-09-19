/* 中文注释：测试影响选择 —— 从"改了哪些源文件"反查"需要跑哪些测试文件"。
 *
 * 为什么要这个模块：全量 regression 有 114 个测试文件、约 476 秒，而大部分改动是叶子改动
 * （文档、单个 skill、单个客户端 overlay），只跑关联测试能把内层循环降到秒级。
 *
 * 为什么允许它"漏"：affected 只是本地加速器，不是准入闸门 —— CI 仍然跑全量
 * （.github/workflows/ci-main.yml 调 npm run test:scripts），所以一条没被静态扫到的边
 * 不可能靠这里漏进 main。剩下唯一不可接受的失败是"看起来跑了其实没跑"，因此这里用的是
 * 保守规则：拿不准就退回全量，并把退回原因打印出来。
 */
import fs from 'node:fs';
import path from 'node:path';

// 这些文件本身决定"跑什么"或"怎么跑"，改它们时影响面无法从 import 图推断，一律全量。
export const SUITE_TOOLING_FILES = Object.freeze([
  'package.json',
  'scripts/test-suites.json',
  'scripts/test-wiring-snapshot.json',
  'scripts/run-test-suite.mjs',
  'scripts/run-affected-tests.mjs',
  'scripts/lib/test-suite-runner.mjs',
  'scripts/lib/test-impact.mjs',
]);

// regression 图里没有这两个目录的边，它们有各自独立的 CI job，改动直接退回全量更诚实。
const OUT_OF_GRAPH_PREFIXES = Object.freeze(['rex-harness/', 'mcp-server/']);
const SOURCE_SUFFIXES = Object.freeze(['.mjs', '.cjs', '.js']);
const GRAPH_ROOT_PREFIXES = Object.freeze(['scripts/', 'config/']);

const toPosix = (target) => target.split(path.sep).join('/');

export function isTestFile(relativePath) {
  return toPosix(relativePath).endsWith('.test.mjs');
}

function isSourceFile(relativePath) {
  const normalized = toPosix(relativePath);
  return SOURCE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

// 静态可解析的引用：显式 import/export-from/require，以及字面量模块路径
// （测试里大量用 `const CLI = 'scripts/aios.mjs'` 这种字符串起子进程，只扫 from 会漏掉 31 个文件）。
const REFERENCE_PATTERNS = Object.freeze([
  /(?:^|\s)from\s+['"]([^'"]+)['"]/g,
  /(?:^|\s)import\(\s*['"]([^'"]+)['"]\s*\)/g,
  /(?:^|\s)require\(\s*['"]([^'"]+)['"]\s*\)/g,
  /['"`]((?:\.{1,2}\/|scripts\/|config\/)[A-Za-z0-9_@./-]+\.(?:mjs|cjs|js|json))['"`]/g,
]);
// 目标不是字面量的动态 import 无法枚举：命中的文件登记为 imprecise，改动它一律全量。
const IMPRECISE_PATTERN = /(?:^|\s)(?:import|require)\s*\(\s*(?!['"`])/;

function collectReferences(source) {
  const specs = new Set();
  for (const pattern of REFERENCE_PATTERNS) {
    for (const match of source.matchAll(pattern)) specs.add(match[1]);
  }
  return { specs, imprecise: IMPRECISE_PATTERN.test(source) };
}

function resolveSpec(fromFile, spec) {
  if (spec.startsWith('.')) {
    const joined = toPosix(path.normalize(path.join(path.dirname(fromFile), spec)));
    return joined.startsWith('..') ? '' : joined;
  }
  if (GRAPH_ROOT_PREFIXES.some((prefix) => spec.startsWith(prefix))) return spec;
  return '';
}

export function buildImpactIndex({ rootDir, testFiles, readFile, exists } = {}) {
  const read = readFile || ((target) => fs.readFileSync(path.join(rootDir, target), 'utf8'));
  const hasFile = exists || ((target) => fs.existsSync(path.join(rootDir, target)));
  const edges = new Map();
  const unreadable = new Set();
  const imprecise = new Set();

  const depsOf = (file) => {
    if (edges.has(file)) return edges.get(file);
    // JSON 只能作为被依赖的叶子：它内部那些 `scripts/tests/x.test.mjs` 字符串是数据不是引用，
    // 当成边会让一个清单文件牵动上千个节点，选择器就退化成全量。
    if (file.endsWith('.json')) {
      edges.set(file, []);
      return [];
    }
    let source = '';
    try {
      source = read(file);
    } catch {
      unreadable.add(file);
      edges.set(file, []);
      return edges.get(file);
    }
    const { specs, imprecise: opaque } = collectReferences(source);
    if (opaque) imprecise.add(file);
    const out = new Set();
    for (const spec of specs) {
      const resolved = resolveSpec(file, spec);
      if (!resolved || resolved === file) continue;
      // 只认真实存在的目标：注释和文档示例里的路径不该变成边。
      if (!hasFile(resolved)) continue;
      out.add(resolved);
    }
    const list = [...out].sort();
    edges.set(file, list);
    return list;
  };

  const dependents = new Map();
  const reach = new Map();
  for (const testFile of testFiles) {
    const normalized = toPosix(testFile);
    const seen = new Set();
    const queue = [normalized];
    while (queue.length > 0) {
      for (const dep of depsOf(queue.pop())) {
        if (seen.has(dep)) continue;
        seen.add(dep);
        queue.push(dep);
      }
    }
    seen.delete(normalized);
    reach.set(normalized, [...seen]);
    for (const source of seen) {
      if (!dependents.has(source)) dependents.set(source, new Set());
      dependents.get(source).add(normalized);
    }
  }

  return {
    testFiles: testFiles.map(toPosix).sort(),
    dependents: new Map([...dependents].map(([key, value]) => [key, [...value].sort()])),
    reach,
    unreadable: [...unreadable].sort(),
    imprecise: [...imprecise].sort(),
  };
}

export function selectAffectedTests({ changedFiles, index, thresholdRatio = 0.6 } = {}) {
  const pool = index.testFiles;
  const poolSet = new Set(pool);
  const imprecise = new Set(index.imprecise);
  // 动态 import 目标无法静态枚举：文件本身被改动时影响面未知，退回全量。
  const bail = (reasons) => ({ mode: 'full', files: [], reasons: [...new Set(reasons)] });

  const reasons = [];
  const selected = new Set();
  const changed = [...new Set(changedFiles.map(toPosix))];
  let sourceChanged = false;

  for (const file of changed) {
    if (SUITE_TOOLING_FILES.includes(file)) {
      return bail([`套件入口/清单被改动：${file}`]);
    }
    const outsidePrefix = OUT_OF_GRAPH_PREFIXES.find((prefix) => file.startsWith(prefix));
    if (outsidePrefix) {
      return bail([`${outsidePrefix} 不在 regression 影响图内（有独立 CI job）`]);
    }
    if (imprecise.has(file)) {
      return bail([`${file} 含无法静态枚举的动态 import`]);
    }
    if (isSourceFile(file) && !isTestFile(file)) sourceChanged = true;
    if (poolSet.has(file) || isTestFile(file)) {
      // 新写但尚未登记的测试文件即便不在 manifest 里也必须跑，否则等于漏测。
      if (!poolSet.has(file)) reasons.push(`测试文件不在 regression 清单内，仍单独执行：${file}`);
      selected.add(file);
      continue;
    }
    const dependents = index.dependents.get(file) || [];
    for (const testFile of dependents) selected.add(testFile);
    if (isSourceFile(file) && file.startsWith('scripts/') && dependents.length === 0) {
      reasons.push(`无法把源文件改动归属到任何测试：${file}`);
    }
  }

  if (reasons.some((reason) => reason.startsWith('无法把源文件改动归属'))) {
    return bail(reasons);
  }
  if (selected.size === 0) {
    return { mode: 'subset', files: [], reasons: ['改动未关联到任何 regression 测试'] };
  }
  if (sourceChanged) {
    // 这些测试自身的引用面不完整，只要动了源码就不能靠图推断它们是否受影响。
    for (const testFile of pool) if (imprecise.has(testFile)) selected.add(testFile);
  }
  if (selected.size / pool.length > thresholdRatio) {
    return bail([`关联测试 ${selected.size}/${pool.length} 已接近全量，退回全量更快更稳`]);
  }
  return {
    mode: 'subset',
    // 清单内的按清单顺序跑，清单外的（新写/未登记的测试文件）补在末尾。
    files: pool.filter((file) => selected.has(file)).concat(
      [...selected].filter((file) => !poolSet.has(file)).sort()
    ),
    reasons,
  };
}

export function listRepoTestFiles({ rootDir = process.cwd(), dir = 'scripts/tests' } = {}) {
  const base = path.join(rootDir, dir);
  const found = [];
  const walk = (current) => {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile() && entry.name.endsWith('.test.mjs')) found.push(toPosix(path.relative(rootDir, target)));
    }
  };
  walk(base);
  return found.sort();
}
