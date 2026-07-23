import { validateGaiaAbManifest } from './manifest.mjs';

const REQUIRED_MODELS = new Map([
  ['codex', 'gpt-5.6-terra'],
  ['claude', 'claude-sonnet-5'],
  ['hermes', 'deepseek-v4-pro'],
]);
const COMMON_CONTROL_FIELDS = [
  'taskSet',
  'toolProfile',
  'browserProfile',
  'timeoutSeconds',
  'retryPolicy',
  'concurrency',
];

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertExactKeys(value, keys, label) {
  const expected = new Set(keys);
  const unexpected = Object.keys(value).find((key) => !expected.has(key));
  const missing = keys.find((key) => !(key in value));
  if (unexpected) throw new Error(`${label} contains unknown key: ${unexpected}`);
  if (missing) throw new Error(`${label} is missing required key: ${missing}`);
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

function validateExecution(execution) {
  assertObject(execution, 'GAIA live manifest.execution');
  assertExactKeys(
    execution,
    ['taskManifest', 'maxSpendUsd', 'artifactDir', 'policies'],
    'GAIA live manifest.execution',
  );
  assertObject(execution.taskManifest, 'GAIA live manifest.execution.taskManifest');
  assertExactKeys(
    execution.taskManifest,
    ['path', 'sha256', 'maxTasks'],
    'GAIA live manifest.execution.taskManifest',
  );
  assertNonEmptyString(execution.taskManifest.path, 'GAIA live manifest.execution.taskManifest.path');
  if (!/^[a-f0-9]{64}$/iu.test(execution.taskManifest.sha256)) {
    throw new Error('GAIA live manifest.execution.taskManifest.sha256 must be a SHA-256 digest');
  }
  assertPositiveInteger(execution.taskManifest.maxTasks, 'GAIA live manifest.execution.taskManifest.maxTasks');
  assertPositiveNumber(execution.maxSpendUsd, 'GAIA live manifest.execution.maxSpendUsd');
  assertNonEmptyString(execution.artifactDir, 'GAIA live manifest.execution.artifactDir');

  assertObject(execution.policies, 'GAIA live manifest.execution.policies');
  assertExactKeys(execution.policies, ['baseline', 'optimized'], 'GAIA live manifest.execution.policies');
  assertNonEmptyString(execution.policies.baseline, 'GAIA live manifest.execution.policies.baseline');
  assertNonEmptyString(execution.policies.optimized, 'GAIA live manifest.execution.policies.optimized');
  if (execution.policies.baseline === execution.policies.optimized) {
    throw new Error('GAIA live manifest execution policies must differ between A/B arms');
  }
}

function validatePinnedModels(manifest) {
  for (const [client, model] of REQUIRED_MODELS) {
    const run = manifest.runs.find((candidate) => candidate.client === client);
    if (run.model !== model) {
      throw new Error(`${client} model must equal ${model}`);
    }
  }
}

function validateCommonControls(manifest) {
  const expected = manifest.runs[0].arms.baseline;
  for (const run of manifest.runs) {
    for (const field of COMMON_CONTROL_FIELDS) {
      if (run.arms.baseline[field] !== expected[field]) {
        throw new Error(`all GAIA live runs must share ${field}`);
      }
    }
  }
}

export function validateGaiaLiveManifest(raw) {
  assertObject(raw, 'GAIA live manifest');
  assertExactKeys(raw, ['schemaVersion', 'abManifest', 'execution'], 'GAIA live manifest');
  if (raw.schemaVersion !== 1) {
    throw new Error('GAIA live manifest.schemaVersion must equal 1');
  }

  validateGaiaAbManifest(raw.abManifest);
  validateExecution(raw.execution);
  validatePinnedModels(raw.abManifest);
  validateCommonControls(raw.abManifest);
  return raw;
}

export function parseGaiaLiveManifest(text) {
  try {
    return validateGaiaLiveManifest(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('GAIA live manifest must be valid JSON');
    }
    throw error;
  }
}
