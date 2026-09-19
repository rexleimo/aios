/* 测试范围契约 — test-impact 选择器
 *
 * User goal: affected 选择只能"少跑文件"，绝不能"把该跑的判成不用跑"，所以每条退回全量的
 * 规则都要能被单独触发验证。
 *
 * Explicit non-goals:
 *   - 不测 run-affected-tests.mjs 的子进程调度（那是 --dry-run 能人肉验证的胶水）；
 *   - 不测 node --test 本身。
 *
 * In-scope behavior:
 *   I1 传递闭包：改动被测试间接 import 的源文件，必须选中该测试。
 *   I2 字符串起子进程的路径（`const CLI = 'scripts/aios.mjs'`）也算边。
 *   I3 改动的测试文件即使不在清单里也必须被选中。
 *   I4 套件入口/清单、rex-harness 与 mcp-server、含动态 import 的文件、
 *      归属不到任何测试的 scripts/ 源文件 → 退回全量。
 *   I5 关联占比超过阈值 → 退回全量。
 *   I6 纯文档改动 → 选中 0 个文件（这是加速的来源）。
 *   I7 选中集合永远是 清单 ∪ 改动的测试文件，不会凭空造文件。
 *   I8 真仓库自检：图必须仍然能从磁盘把已知枢纽模块反查出大量 dependents，
 *      否则说明扫描正则被重构改坏了 —— 那会让选择器静默漏测。
 *   I9 JSON 是叶子：清单类 .json 里的路径字符串是数据，不能变成 import 边。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildImpactIndex,
  isTestFile,
  listRepoTestFiles,
  selectAffectedTests,
  SUITE_TOOLING_FILES,
} from '../lib/test-impact.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function fixtureIndex({ files, testFiles }) {
  return buildImpactIndex({
    rootDir: ROOT,
    testFiles,
    readFile: (target) => {
      if (!(target in files)) throw new Error(`missing fixture: ${target}`);
      return files[target];
    },
    exists: (target) => target in files,
  });
}

test('I1 selects tests that import a changed module transitively', () => {
  const index = fixtureIndex({
    files: {
      'scripts/tests/a.test.mjs': "import { x } from '../lib/x.mjs';\n",
      'scripts/lib/x.mjs': "import { y } from './y.mjs';\n",
      'scripts/lib/y.mjs': 'export const y = 1;\n',
    },
    testFiles: ['scripts/tests/a.test.mjs'],
  });
  // thresholdRatio: 1 —— 这几例只验"边"是否被扫到，不验阈值。
  assert.deepEqual(selectAffectedTests({ changedFiles: ['scripts/lib/y.mjs'], index, thresholdRatio: 1 }).files, [
    'scripts/tests/a.test.mjs',
  ]);
});

test('I2 treats a literal CLI path used to spawn a subprocess as a dependency edge', () => {
  const index = fixtureIndex({
    files: {
      'scripts/tests/cli.test.mjs': "const CLI = 'scripts/aios.mjs';\n",
      'scripts/aios.mjs': "import { run } from './lib/run.mjs';\n",
      'scripts/lib/run.mjs': 'export const run = 1;\n',
    },
    testFiles: ['scripts/tests/cli.test.mjs'],
  });
  const decision = selectAffectedTests({ changedFiles: ['scripts/lib/run.mjs'], index, thresholdRatio: 1 });
  assert.deepEqual(decision.files, ['scripts/tests/cli.test.mjs']);
});

test('I3 keeps a changed test file even when it is outside the pool', () => {
  const index = fixtureIndex({
    files: {
      'scripts/tests/a.test.mjs': '\n',
      'scripts/tests/b.test.mjs': '\n',
      'scripts/tests/new.test.mjs': '\n',
    },
    testFiles: ['scripts/tests/a.test.mjs', 'scripts/tests/b.test.mjs'],
  });
  const decision = selectAffectedTests({ changedFiles: ['scripts/tests/new.test.mjs'], index });
  assert.deepEqual(decision.files, ['scripts/tests/new.test.mjs']);
  assert.match(decision.reasons.join('\n'), /不在 regression 清单内/);
});

test('I4 bails to the full suite whenever impact cannot be proven', () => {
  const index = fixtureIndex({
    files: {
      'scripts/tests/a.test.mjs': "import { x } from '../lib/x.mjs';\nimport { load } from '../lib/dynamic.mjs';\n",
      'scripts/lib/x.mjs': 'export const x = 1;\n',
      'scripts/lib/dead.mjs': 'export const dead = 1;\n',
      'scripts/lib/dynamic.mjs': 'export const load = (p) => import(p);\n',
    },
    testFiles: ['scripts/tests/a.test.mjs'],
  });
  assert.deepEqual(index.imprecise, ['scripts/lib/dynamic.mjs']);
  for (const file of SUITE_TOOLING_FILES) {
    assert.equal(selectAffectedTests({ changedFiles: [file], index }).mode, 'full', file);
  }
  assert.equal(selectAffectedTests({ changedFiles: ['rex-harness/src/agent.mjs'], index }).mode, 'full');
  assert.equal(selectAffectedTests({ changedFiles: ['mcp-server/src/index.ts'], index }).mode, 'full');
  // 归属不到任何测试的 scripts/ 源文件：宁可全量，也不假设它没被用。
  assert.equal(selectAffectedTests({ changedFiles: ['scripts/lib/dead.mjs'], index }).mode, 'full');
  // 自身含不可枚举动态 import 的文件被改动：影响面未知。
  assert.equal(selectAffectedTests({ changedFiles: ['scripts/lib/dynamic.mjs'], index }).mode, 'full');
});

test('I5 falls back to full when the selection is close to the whole pool', () => {
  const index = fixtureIndex({
    files: {
      'scripts/tests/a.test.mjs': "import { x } from '../lib/x.mjs';\n",
      'scripts/tests/b.test.mjs': '\n',
      'scripts/lib/x.mjs': 'export const x = 1;\n',
    },
    testFiles: ['scripts/tests/a.test.mjs', 'scripts/tests/b.test.mjs'],
  });
  const subset = selectAffectedTests({ changedFiles: ['scripts/lib/x.mjs'], index, thresholdRatio: 0.9 });
  assert.equal(subset.mode, 'subset');
  // 阈值语义是"严格大于才退回"，正好等于阈值仍按子集跑。
  const boundary = selectAffectedTests({ changedFiles: ['scripts/lib/x.mjs'], index, thresholdRatio: 0.5 });
  assert.equal(boundary.mode, 'subset');
  const bailed = selectAffectedTests({ changedFiles: ['scripts/lib/x.mjs'], index, thresholdRatio: 0.4 });
  assert.equal(bailed.mode, 'full');
  assert.match(bailed.reasons.join('\n'), /退回全量/);
});

test('I6 a docs-only change selects nothing', () => {
  const index = fixtureIndex({
    files: { 'scripts/tests/a.test.mjs': "import { x } from '../lib/x.mjs';\n", 'scripts/lib/x.mjs': '\n' },
    testFiles: ['scripts/tests/a.test.mjs'],
  });
  const decision = selectAffectedTests({ changedFiles: ['AGENTS.md', 'blog-site/post.md'], index });
  assert.equal(decision.mode, 'subset');
  assert.deepEqual(decision.files, []);
});

test('I7 the selector never invents files outside pool plus changed tests', () => {
  const suite = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'test-suites.json'), 'utf8')).regression.files;
  const index = buildImpactIndex({ rootDir: ROOT, testFiles: suite });
  const changed = listRepoTestFiles({ rootDir: ROOT }).slice(0, 3).concat(['scripts/lib/platform/paths.mjs']);
  const allowed = new Set([...index.testFiles, ...changed.filter(isTestFile)]);
  for (const file of selectAffectedTests({ changedFiles: changed, index }).files) {
    assert.equal(allowed.has(file), true, `unexpected file ${file}`);
  }
});

test('I9 JSON files are dependency leaves, never edge carriers', () => {
  const index = fixtureIndex({
    files: {
      'scripts/tests/a.test.mjs': "import manifest from '../lib/listing.json' with { type: 'json' };\n",
      'scripts/lib/listing.json': '{"files":["scripts/tests/b.test.mjs","scripts/lib/z.mjs"]}\n',
      'scripts/tests/b.test.mjs': '\n',
      'scripts/lib/z.mjs': '\n',
    },
    testFiles: ['scripts/tests/a.test.mjs', 'scripts/tests/b.test.mjs'],
  });
  // 清单里的字符串是数据：不能让改一个 .json 就把整仓牵动一遍。
  const decision = selectAffectedTests({ changedFiles: ['scripts/lib/listing.json'], index, thresholdRatio: 1 });
  assert.deepEqual(decision.files, ['scripts/tests/a.test.mjs']);
  assert.deepEqual(index.dependents.get('scripts/lib/z.mjs') || [], []);
});

test('I8 the on-disk scanner still resolves hub modules and the real test universe', () => {
  const universe = listRepoTestFiles({ rootDir: ROOT });
  assert.equal(universe.length >= 200, true, `expected the recursive test scan to find the suite, got ${universe.length}`);
  assert.equal(universe.includes('scripts/tests/test-impact.test.mjs'), true);
  const index = buildImpactIndex({ rootDir: ROOT, testFiles: universe });
  assert.deepEqual(index.unreadable, [], 'every scanned file must be readable');
  // 客户端注册表是全仓枢纽：扫描器一旦改坏，这里会立刻掉到 0，而不是静默漏测。
  assert.equal(index.dependents.get('scripts/lib/clients/core/definitions.mjs').length > 80, true);
  assert.equal(index.dependents.get('scripts/lib/platform/paths.mjs').length > 30, true);
});
