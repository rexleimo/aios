import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { collectFailingTests } from './temp-runner/command.mjs';
import { validateTaskManifest } from './schema.mjs';

function createDeterministicOrder(items, seed) {
  return [...items]
    .map((item, index) => ({ item, score: computeHash(`${seed}:${index}:${item.seed_id}:${item.variant_id}`) }))
    .sort((left, right) => left.score - right.score || left.item.task_id.localeCompare(right.item.task_id))
    .map((entry) => entry.item);
}

function computeHash(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function listSeedIds(rootDir, config) {
  if (Array.isArray(config.seeds) && config.seeds.length > 0) {
    return config.seeds;
  }
  const seedRoot = path.join(rootDir, '.aios', 'experiments', 'rl-shell-v1', 'seeds');
  return await readdir(seedRoot);
}

function buildTaskId({ seedId, variantId, seed }) {
  return `${seedId}-v${String(variantId).padStart(2, '0')}-s${String(seed)}`;
}

function resolveGeneratedDir(rootDir, config) {
  return path.join(rootDir, config.generated_dir || '.aios/experiments/rl-shell-v1/tasks/generated');
}

async function runVerificationCommand({ cwd, command }) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(command, {
    cwd,
    shell: true,
    encoding: 'utf8',
    env,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

export function buildTaskManifest({ seedDir, seedId, variantId, split, seed, repoSnapshotId, verificationCommand, constraints, promptTemplate, generatedDir }) {
  const task_id = buildTaskId({ seedId, variantId, seed });
  const repo_source_path = path.join(generatedDir, task_id, 'repo');
  return validateTaskManifest({
    schema_version: 1,
    task_id,
    repo_snapshot_id: repoSnapshotId,
    repo_source_path,
    split,
    task_prompt: promptTemplate.replace('{{variant_id}}', String(variantId)),
    verification_command: verificationCommand,
    baseline_failing_tests: [],
    constraints,
  });
}

export async function generateBenchmark({ rootDir, seed = 0, configPath = '.aios/experiments/rl-shell-v1/configs/benchmark-v1.json' }) {
  const config = await readJson(path.join(rootDir, configPath));
  const generatedDir = resolveGeneratedDir(rootDir, config);
  await rm(generatedDir, { recursive: true, force: true });
  await mkdir(generatedDir, { recursive: true });

  const seedIds = await listSeedIds(rootDir, config);
  const generatedTasks = [];

  for (const seedId of seedIds) {
    const seedDir = path.join(rootDir, '.aios', 'experiments', 'rl-shell-v1', 'seeds', seedId);
    const manifestTemplate = await readJson(path.join(seedDir, 'manifest.template.json'));
    const variantCount = Number(manifestTemplate.variant_count || 0);
    for (let variantId = 1; variantId <= variantCount; variantId += 1) {
      const task_id = buildTaskId({ seedId, variantId, seed });
      const taskDir = path.join(generatedDir, task_id);
      await mkdir(taskDir, { recursive: true });
      await cp(path.join(seedDir, 'repo'), path.join(taskDir, 'repo'), { recursive: true });
      generatedTasks.push({
        task_id,
        seed_id: seedId,
        variant_id: variantId,
        seed,
        seedDir,
        repoDir: path.join(taskDir, 'repo'),
        manifestPath: path.join(taskDir, 'manifest.json'),
        repoSnapshotId: `${seedId}@v${variantId}`,
        verificationCommand: manifestTemplate.verification_command,
        constraints: manifestTemplate.constraints || [],
        promptTemplate: manifestTemplate.task_prompt_template,
      });
    }
  }

  const ordered = createDeterministicOrder(generatedTasks, seed);
  const minimumHeldOut = Number(config.minimum_held_out_tasks || 16);
  const trainTasks = ordered.slice(0, Math.max(0, ordered.length - minimumHeldOut)).map((item) => item.task_id);
  const heldOutTasks = ordered.slice(Math.max(0, ordered.length - minimumHeldOut)).map((item) => item.task_id);

  for (const task of generatedTasks) {
    const split = heldOutTasks.includes(task.task_id) ? 'held_out' : 'train';
    const manifest = buildTaskManifest({
      seedDir: task.seedDir,
      seedId: task.seed_id,
      variantId: task.variant_id,
      split,
      seed,
      repoSnapshotId: task.repoSnapshotId,
      verificationCommand: task.verificationCommand,
      constraints: task.constraints,
      promptTemplate: task.promptTemplate,
      generatedDir: config.generated_dir || '.aios/experiments/rl-shell-v1/tasks/generated',
    });
    await writeJson(task.manifestPath, manifest);
  }

  const nextConfig = {
    ...config,
    schema_version: 1,
    generated_seed: seed,
    generated_count: generatedTasks.length,
    train_tasks: trainTasks,
    held_out_tasks: heldOutTasks,
  };
  await writeJson(path.join(rootDir, configPath), nextConfig);

  return {
    generatedTasks: generatedTasks.map((item) => ({ task_id: item.task_id })),
    trainTasks,
    heldOutTasks,
  };
}

async function ensureGeneratedBenchmark({ rootDir, configPath }) {
  const config = await readJson(path.join(rootDir, configPath));
  const generatedDir = resolveGeneratedDir(rootDir, config);
  const entries = await readdir(generatedDir, { withFileTypes: true }).catch(() => []);
  if (entries.length === 0) {
    await generateBenchmark({ rootDir, seed: 0, configPath });
  }
}

async function validateGeneratedTasks({ rootDir, configPath }) {
  const config = await readJson(path.join(rootDir, configPath));
  const generatedDir = resolveGeneratedDir(rootDir, config);
  const entries = (await readdir(generatedDir, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  const trainTasks = [];
  const heldOutTasks = [];
  const invalidTasks = [];

  for (const entry of entries) {
    const taskDir = path.join(generatedDir, entry.name);
    const manifest = validateTaskManifest(await readJson(path.join(taskDir, 'manifest.json')));
    const repoDir = path.join(rootDir, manifest.repo_source_path);
    const baselineResult = await runVerificationCommand({ cwd: repoDir, command: manifest.verification_command });
    const baselineFailures = collectFailingTests(`${baselineResult.stdout}\n${baselineResult.stderr}`);
    if (baselineResult.status === 0 || baselineFailures.length === 0) {
      invalidTasks.push({
        task_id: manifest.task_id,
        split: manifest.split,
        invalid_reason: 'baseline_not_reproduced',
      });
      continue;
    }

    const nextManifest = {
      ...manifest,
      baseline_failing_tests: baselineFailures,
    };
    await writeJson(path.join(taskDir, 'manifest.json'), nextManifest);
    if (manifest.split === 'train') {
      trainTasks.push(nextManifest);
    } else {
      heldOutTasks.push(nextManifest);
    }
  }

  const exclusionReportPath = path.join(rootDir, '.aios', 'experiments', 'rl-shell-v1', 'configs', 'benchmark-v1.invalid-tasks.json');
  await writeJson(exclusionReportPath, {
    generated_at: new Date().toISOString(),
    invalid_reason_counts: invalidTasks.reduce((counts, item) => {
      counts[item.invalid_reason] = (counts[item.invalid_reason] || 0) + 1;
      return counts;
    }, {}),
    invalid_tasks: invalidTasks,
  });

  return {
    config,
    trainTasks,
    heldOutTasks,
    invalidTasks,
    exclusionReportPath,
  };
}

export async function loadTaskRegistry({ rootDir, configPath = '.aios/experiments/rl-shell-v1/configs/benchmark-v1.json' }) {
  await ensureGeneratedBenchmark({ rootDir, configPath });
  const validated = await validateGeneratedTasks({ rootDir, configPath });
  const minimumTrain = Number(validated.config.minimum_train_tasks || 32);
  const minimumHeldOut = Number(validated.config.minimum_held_out_tasks || 16);
  if (validated.trainTasks.length < minimumTrain || validated.heldOutTasks.length < minimumHeldOut) {
    throw new Error('insufficient-valid-tasks');
  }
  return {
    ...validated,
  };
}

export function sampleTrainingTask(registry, { seed, attempt }) {
  const tasks = registry.trainTasks;
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('no-train-tasks');
  }
  const index = computeHash(`${seed}:${attempt}:train`) % tasks.length;
  return tasks[index];
}
