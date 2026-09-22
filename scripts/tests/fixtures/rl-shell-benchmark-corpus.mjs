import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Hermetic `rl-shell-v1` benchmark corpus.
 *
 * The library resolves seeds, configs, generated tasks, and the invalid-task report
 * under `<rootDir>/.aios/experiments/rl-shell-v1/**` (see `lib/rl-shell-v1/task-registry.mjs`).
 * Tests therefore have to seed that exact tree. This used to be duplicated inline in
 * each test file and drifted: the copy wrote to `<rootDir>/experiments/**`, so the
 * fixtures landed where nothing read them and the suites failed with ENOENT the first
 * time they were actually executed (2026-09-21). Keeping one builder with the path
 * constants beside it is what stops that from recurring.
 *
 * Every seed's test genuinely fails against the shipped source. That is what makes a
 * task valid: `validateGeneratedTasks` marks a task `baseline_not_reproduced` when the
 * baseline verification *passes*, and enough invalid tasks turn into
 * `insufficient-valid-tasks`. Three seeds x 16 variants keeps the split at exactly
 * 32 train / 16 held-out, which satisfies both configured minimums.
 */

export const EXPERIMENT_DIR = path.join('.aios', 'experiments', 'rl-shell-v1');
export const BENCHMARK_CONFIG_PATH = path.join(EXPERIMENT_DIR, 'configs', 'benchmark-v1.json');
export const BENCHMARK_GENERATED_DIR = '.aios/experiments/rl-shell-v1/tasks/generated';
export const BENCHMARK_MIN_TRAIN = 32;
export const BENCHMARK_MIN_HELD_OUT = 16;
export const SEED_VARIANT_COUNT = 16;

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, 'utf8');
}

/** A test that must fail against the buggy source: `actual` is not `expected`. */
function failingTest(importPath, exportName, actual, expected) {
  return [
    "import test from 'node:test';",
    "import assert from 'node:assert/strict';",
    `import { ${exportName} } from '${importPath}';`,
    '',
    `test('${exportName} ${expected}', () => {`,
    `  assert.equal(${actual}, ${expected});`,
    '});',
    '',
  ].join('\n');
}

export const BENCHMARK_SEEDS = Object.freeze([
  Object.freeze({
    seedId: 'arithmetic-add',
    srcFile: 'math.mjs',
    srcCode: 'export function add(a, b) {\n  return a - b;\n}\n',
    testFile: 'math.test.mjs',
    testCode: failingTest('../src/math.mjs', 'add', 'add(2, 3)', '5'),
    promptTemplate: 'Fix the failing addition behavior for variant {{variant_id}}.',
  }),
  Object.freeze({
    seedId: 'string-trim',
    srcFile: 'normalize.mjs',
    srcCode: 'export function normalizeName(value) {\n  return value.toLowerCase();\n}\n',
    testFile: 'normalize.test.mjs',
    testCode: failingTest('../src/normalize.mjs', 'normalizeName', "normalizeName('  Alice  ')", "'alice'"),
    promptTemplate: 'Fix the trimming behavior for variant {{variant_id}}.',
  }),
  Object.freeze({
    seedId: 'list-filter',
    srcFile: 'filter.mjs',
    srcCode: 'export function filterActive(items) {\n  return items;\n}\n',
    testFile: 'filter.test.mjs',
    testCode: failingTest(
      '../src/filter.mjs',
      'filterActive',
      'filterActive([{ id: 1, active: true }, { id: 2, active: false }]).length',
      '1',
    ),
    promptTemplate: 'Fix the list filtering behavior for variant {{variant_id}}.',
  }),
]);

/** Write one seed into the namespace root, in the shape `generateBenchmark` reads. */
export async function writeSeed(rootDir, seed, { variantCount = SEED_VARIANT_COUNT } = {}) {
  const base = path.join(rootDir, EXPERIMENT_DIR, 'seeds', seed.seedId);
  await writeJson(path.join(base, 'manifest.template.json'), {
    schema_version: 1,
    seed_id: seed.seedId,
    verification_command: 'node --test',
    variant_count: variantCount,
    task_prompt_template: seed.promptTemplate,
    constraints: ['Do not edit tests', 'Use only local files'],
  });
  await writeJson(path.join(base, 'repo', 'package.json'), {
    name: seed.seedId,
    private: true,
    type: 'module',
  });
  await writeText(path.join(base, 'repo', 'src', seed.srcFile), seed.srcCode);
  await writeText(path.join(base, 'repo', 'tests', seed.testFile), seed.testCode);
}

/** Write the benchmark config that points at those seeds. */
export async function writeBenchmarkConfig(rootDir, {
  seeds = BENCHMARK_SEEDS,
  minTrain = BENCHMARK_MIN_TRAIN,
  minHeldOut = BENCHMARK_MIN_HELD_OUT,
} = {}) {
  await writeJson(path.join(rootDir, BENCHMARK_CONFIG_PATH), {
    schema_version: 1,
    generated_dir: BENCHMARK_GENERATED_DIR,
    minimum_train_tasks: minTrain,
    minimum_held_out_tasks: minHeldOut,
    seeds: seeds.map((seed) => seed.seedId),
  });
}

/**
 * Seed a complete, valid benchmark corpus: every seed plus the config.
 * Returns the rootDir so callers can run a CLI with it as `cwd`.
 */
export async function writeShellBenchmarkCorpus(rootDir, options = {}) {
  const seeds = options.seeds || BENCHMARK_SEEDS;
  for (const seed of seeds) {
    await writeSeed(rootDir, seed, options);
  }
  await writeBenchmarkConfig(rootDir, { ...options, seeds });
  return rootDir;
}
