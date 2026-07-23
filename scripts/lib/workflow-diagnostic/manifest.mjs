import { createHash } from 'node:crypto';

const CODEX_MODEL = 'gpt-5.6-terra';
const TOOL_POLICY = 'no-browser-no-network-tools';
const COMMIT_POLICY_REF = /^[a-f0-9]{40}:AGENTS\.md$/u;

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertExactKeys(value, keys, label) {
  const expected = new Set(keys);
  const unexpected = Object.keys(value).find((key) => !expected.has(key));
  const missing = keys.find((key) => !(key in value));
  if (unexpected) {
    throw new Error(`${label} contains unknown key: ${unexpected}`);
  }
  if (missing) {
    throw new Error(`${label} is missing required key: ${missing}`);
  }
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
}

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
}

function assertPositiveNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function validatePolicySource(source, label) {
  assertObject(source, label);
  assertExactKeys(source, ['gitRef'], label);
  assertNonEmptyString(source.gitRef, `${label}.gitRef`);
  if (!COMMIT_POLICY_REF.test(source.gitRef)) {
    throw new Error(`${label}.gitRef must be a 40-character commit AGENTS.md reference`);
  }
}

function validateRun(run) {
  assertObject(run, 'workflow diagnostic run');
  assertExactKeys(run, [
    'client',
    'model',
    'timeoutSeconds',
    'retryPolicy',
    'concurrency',
    'toolPolicy',
    'maxSpendUsd',
  ], 'workflow diagnostic run');
  if (run.client !== 'codex') {
    throw new Error('workflow diagnostic run.client must equal codex');
  }
  if (run.model !== CODEX_MODEL) {
    throw new Error(`workflow diagnostic run.model must equal ${CODEX_MODEL}`);
  }
  assertPositiveInteger(run.timeoutSeconds, 'workflow diagnostic run.timeoutSeconds');
  if (run.retryPolicy !== 'none') {
    throw new Error('workflow diagnostic run.retryPolicy must equal none');
  }
  if (run.concurrency !== 1) {
    throw new Error('workflow diagnostic run.concurrency must equal 1');
  }
  if (run.toolPolicy !== TOOL_POLICY) {
    throw new Error(`workflow diagnostic run.toolPolicy must equal ${TOOL_POLICY}`);
  }
  assertPositiveNumber(run.maxSpendUsd, 'workflow diagnostic run.maxSpendUsd');
}

function parseTasks(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    throw new Error('workflow diagnostic task manifest must be valid JSON');
  }

  assertObject(document, 'workflow diagnostic task manifest');
  assertExactKeys(document, ['schemaVersion', 'tasks'], 'workflow diagnostic task manifest');
  if (document.schemaVersion !== 1 || !Array.isArray(document.tasks) || document.tasks.length === 0) {
    throw new Error('workflow diagnostic task manifest must contain schemaVersion 1 and non-empty tasks');
  }

  const taskIds = new Set();
  for (const [index, task] of document.tasks.entries()) {
    const label = `workflow diagnostic task ${index}`;
    assertObject(task, label);
    assertExactKeys(task, ['taskId', 'category', 'prompt', 'expected', 'normalization'], label);
    for (const field of ['taskId', 'category', 'prompt', 'expected', 'normalization']) {
      assertNonEmptyString(task[field], `${label}.${field}`);
    }
    if (taskIds.has(task.taskId)) {
      throw new Error(`duplicate workflow diagnostic taskId: ${task.taskId}`);
    }
    taskIds.add(task.taskId);
  }

  return document.tasks;
}

export function parseWorkflowDiagnosticManifest(text) {
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    throw new Error('workflow diagnostic manifest must be valid JSON');
  }

  assertObject(manifest, 'workflow diagnostic manifest');
  assertExactKeys(manifest, ['schemaVersion', 'taskManifest', 'policySources', 'run'], 'workflow diagnostic manifest');
  if (manifest.schemaVersion !== 1) {
    throw new Error('workflow diagnostic manifest.schemaVersion must equal 1');
  }

  assertObject(manifest.taskManifest, 'workflow diagnostic taskManifest');
  assertExactKeys(manifest.taskManifest, ['path', 'sha256', 'maxTasks'], 'workflow diagnostic taskManifest');
  assertNonEmptyString(manifest.taskManifest.path, 'workflow diagnostic taskManifest.path');
  if (!/^[a-f0-9]{64}$/u.test(manifest.taskManifest.sha256)) {
    throw new Error('workflow diagnostic taskManifest.sha256 must be a SHA-256 digest');
  }
  assertPositiveInteger(manifest.taskManifest.maxTasks, 'workflow diagnostic taskManifest.maxTasks');

  assertObject(manifest.policySources, 'workflow diagnostic policySources');
  assertExactKeys(manifest.policySources, ['baseline', 'optimized'], 'workflow diagnostic policySources');
  validatePolicySource(manifest.policySources.baseline, 'workflow diagnostic policySources.baseline');
  validatePolicySource(manifest.policySources.optimized, 'workflow diagnostic policySources.optimized');
  if (manifest.policySources.baseline.gitRef === manifest.policySources.optimized.gitRef) {
    throw new Error('workflow diagnostic policy sources must differ');
  }

  validateRun(manifest.run);
  return manifest;
}

export async function buildWorkflowDiagnosticDryRun(manifest, { readTaskManifest, readPolicySource }) {
  if (typeof readTaskManifest !== 'function' || typeof readPolicySource !== 'function') {
    throw new Error('workflow diagnostic dry run requires task and policy readers');
  }

  const taskText = await readTaskManifest(manifest.taskManifest.path);
  if (typeof taskText !== 'string') {
    throw new Error('workflow diagnostic task manifest reader must return text');
  }
  if (sha256(taskText) !== manifest.taskManifest.sha256.toLowerCase()) {
    throw new Error('workflow diagnostic task manifest SHA-256 digest mismatch');
  }
  const tasks = parseTasks(taskText).slice(0, manifest.taskManifest.maxTasks);

  const policies = {};
  for (const arm of ['baseline', 'optimized']) {
    const sourceRef = manifest.policySources[arm].gitRef;
    const policyText = await readPolicySource(sourceRef);
    if (typeof policyText !== 'string' || policyText.trim().length === 0) {
      throw new Error(`workflow diagnostic ${arm} policy source is unavailable`);
    }
    policies[arm] = Object.freeze({
      sourceRef: `git:${sourceRef}`,
      sha256: sha256(policyText),
    });
  }

  if (policies.baseline.sha256 === policies.optimized.sha256) {
    throw new Error('workflow diagnostic policy source digests must differ');
  }

  return Object.freeze({
    mode: 'dry-run',
    taskCount: tasks.length,
    policies: Object.freeze(policies),
    run: Object.freeze({ ...manifest.run }),
  });
}
