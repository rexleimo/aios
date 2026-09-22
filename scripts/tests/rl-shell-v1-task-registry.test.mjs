import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { fileURLToPath } from 'node:url';

import { BENCHMARK_CONFIG_PATH, EXPERIMENT_DIR } from './fixtures/rl-shell-benchmark-corpus.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
// The library resolves seeds, configs, and generated tasks under
// `<rootDir>/.aios/experiments/rl-shell-v1/**` (see task-registry.mjs). This file
// used to write the same fixtures to `<rootDir>/experiments/**`, so they landed
// where nothing read them: four tests failed with ENOENT the moment the suite was
// actually executed. The path constants are shared with the other rl-shell-v1 test
// file through the fixture module so they cannot drift apart again.
const EXPERIMENT_CONFIG_PATH = BENCHMARK_CONFIG_PATH;

async function makeRootDir() {
  return await mkdtemp(path.join(os.tmpdir(), 'aios-rl-shell-v1-registry-'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, 'utf8');
}

async function writeSeed(rootDir, seedId, { srcFile, srcCode, testFile, testCode, promptTemplate }) {
  const base = path.join(rootDir, EXPERIMENT_DIR, 'seeds', seedId);
  await writeJson(path.join(base, 'manifest.template.json'), {
    schema_version: 1,
    seed_id: seedId,
    verification_command: 'node --test',
    variant_count: 16,
    task_prompt_template: promptTemplate,
    constraints: ['Do not edit tests', 'Use only local files'],
  });
  await writeJson(path.join(base, 'repo', 'package.json'), {
    name: seedId,
    private: true,
    type: 'module',
  });
  await writeText(path.join(base, 'repo', 'src', srcFile), srcCode);
  await writeText(path.join(base, 'repo', 'tests', testFile), testCode);
}

async function writeSeedCorpus(rootDir) {
  await writeSeed(rootDir, 'arithmetic-add', {
    srcFile: 'math.mjs',
    srcCode: 'export function add(a, b) {\n  return a - b;\n}\n',
    testFile: 'math.test.mjs',
    testCode: [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { add } from '../src/math.mjs';",
      '',
      "test('addition returns the sum', () => {",
      '  assert.equal(add(2, 3), 5);',
      '});',
      '',
    ].join('\n'),
    promptTemplate: 'Fix the failing addition behavior for variant {{variant_id}}.',
  });
  await writeSeed(rootDir, 'string-trim', {
    srcFile: 'normalize.mjs',
    srcCode: 'export function normalizeName(value) {\n  return value.toLowerCase();\n}\n',
    testFile: 'normalize.test.mjs',
    testCode: [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { normalizeName } from '../src/normalize.mjs';",
      '',
      "test('normalizeName trims outer whitespace', () => {",
      "  assert.equal(normalizeName('  Alice  '), 'alice');",
      '});',
      '',
    ].join('\n'),
    promptTemplate: 'Fix the normalization helper for trim variant {{variant_id}}.',
  });
  await writeSeed(rootDir, 'list-filter', {
    srcFile: 'filter.mjs',
    srcCode: 'export function filterActive(items) {\n  return items.filter((item) => item.active === false);\n}\n',
    testFile: 'filter.test.mjs',
    testCode: [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { filterActive } from '../src/filter.mjs';",
      '',
      "test('filterActive keeps only active items in original order', () => {",
      '  assert.deepEqual(',
      '    filterActive([{ id: 1, active: true }, { id: 2, active: false }, { id: 3, active: true }]),',
      '    [{ id: 1, active: true }, { id: 3, active: true }]',
      '  );',
      '});',
      '',
    ].join('\n'),
    promptTemplate: 'Fix the list filtering behavior for variant {{variant_id}}.',
  });
  await writeJson(path.join(rootDir, EXPERIMENT_DIR, 'configs', 'benchmark-v1.json'), {
    schema_version: 1,
    generated_dir: '.aios/experiments/rl-shell-v1/tasks/generated',
    minimum_train_tasks: 32,
    minimum_held_out_tasks: 16,
    seeds: ['arithmetic-add', 'string-trim', 'list-filter'],
  });
}

async function writeTinyBenchmark(rootDir) {
  await writeSeed(rootDir, 'too-small', {
    srcFile: 'tiny.mjs',
    srcCode: 'export function broken() {\n  return false;\n}\n',
    testFile: 'tiny.test.mjs',
    testCode: [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { broken } from '../src/tiny.mjs';",
      '',
      "test('broken returns true', () => {",
      '  assert.equal(broken(), true);',
      '});',
      '',
    ].join('\n'),
    promptTemplate: 'Fix the tiny benchmark variant {{variant_id}}.',
  });
  await writeJson(path.join(rootDir, EXPERIMENT_DIR, 'configs', 'benchmark-v1.json'), {
    schema_version: 1,
    generated_dir: '.aios/experiments/rl-shell-v1/tasks/generated',
    minimum_train_tasks: 32,
    minimum_held_out_tasks: 16,
    seeds: ['too-small'],
  });
}

test('generateBenchmark writes at least 48 tasks and fixed train/held-out splits', async () => {
  const rootDir = await makeRootDir();
  await writeSeedCorpus(rootDir);
  const mod = await import('../lib/rl-shell-v1/task-registry.mjs');
  const result = await mod.generateBenchmark({ rootDir, seed: 17 });

  assert.equal(result.generatedTasks.length >= 48, true);
  assert.equal(result.trainTasks.length >= 32, true);
  assert.equal(result.heldOutTasks.length >= 16, true);
});

test('loadTaskRegistry rejects benchmark configs with too few valid tasks', async () => {
  const rootDir = await makeRootDir();
  await writeTinyBenchmark(rootDir);
  const mod = await import('../lib/rl-shell-v1/task-registry.mjs');

  await assert.rejects(
    () => mod.loadTaskRegistry({ rootDir, configPath: EXPERIMENT_CONFIG_PATH }),
    /insufficient-valid-tasks/i
  );
});

test('generateBenchmark is deterministic for the same seed and sampleTrainingTask is deterministic for seed plus attempt', async () => {
  const rootDir = await makeRootDir();
  await writeSeedCorpus(rootDir);
  const mod = await import('../lib/rl-shell-v1/task-registry.mjs');

  const first = await mod.generateBenchmark({ rootDir, seed: 17 });
  const second = await mod.generateBenchmark({ rootDir, seed: 17 });

  assert.deepEqual(first.generatedTasks.map((item) => item.task_id), second.generatedTasks.map((item) => item.task_id));

  const registry = await mod.loadTaskRegistry({ rootDir, configPath: EXPERIMENT_CONFIG_PATH });
  assert.deepEqual(
    mod.sampleTrainingTask(registry, { seed: 17, attempt: 3 }),
    mod.sampleTrainingTask(registry, { seed: 17, attempt: 3 })
  );
});

test('sampleTrainingTask never returns held-out tasks and invalid-task exclusions are persisted', async () => {
  const rootDir = await makeRootDir();
  await writeSeedCorpus(rootDir);
  const mod = await import('../lib/rl-shell-v1/task-registry.mjs');

  await mod.generateBenchmark({ rootDir, seed: 17 });
  const registry = await mod.loadTaskRegistry({ rootDir, configPath: EXPERIMENT_CONFIG_PATH });

  const sampled = mod.sampleTrainingTask(registry, { seed: 17, attempt: 4 });
  assert.equal(sampled.split, 'train');

  const exclusionReport = await readFile(
    path.join(rootDir, EXPERIMENT_DIR, 'configs', 'benchmark-v1.invalid-tasks.json'),
    'utf8'
  );
  assert.match(exclusionReport, /invalid_reason|baseline/i);
});
