const REQUIRED_CLIENTS = ['codex', 'claude', 'hermes'];
const CONTROL_FIELDS = [
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
  const unexpected = Object.keys(value).filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !(key in value));

  if (unexpected.length > 0) {
    throw new Error(`${label} contains unknown key: ${unexpected[0]}`);
  }
  if (missing.length > 0) {
    throw new Error(`${label} is missing required key: ${missing[0]}`);
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

function validateControls(value, label) {
  assertObject(value, label);
  assertExactKeys(value, CONTROL_FIELDS, label);
  assertNonEmptyString(value.taskSet, `${label}.taskSet`);
  assertNonEmptyString(value.toolProfile, `${label}.toolProfile`);
  assertNonEmptyString(value.browserProfile, `${label}.browserProfile`);
  assertPositiveInteger(value.timeoutSeconds, `${label}.timeoutSeconds`);
  assertNonEmptyString(value.retryPolicy, `${label}.retryPolicy`);
  assertPositiveInteger(value.concurrency, `${label}.concurrency`);
}

function validateRun(run) {
  assertObject(run, 'run');
  assertExactKeys(run, ['client', 'model', 'arms'], 'run');
  assertNonEmptyString(run.client, 'run.client');
  assertNonEmptyString(run.model, `run ${run.client}.model`);
  assertObject(run.arms, `run ${run.client}.arms`);
  assertExactKeys(run.arms, ['baseline', 'optimized'], `run ${run.client}.arms`);
  validateControls(run.arms.baseline, `run ${run.client}.arms.baseline`);
  validateControls(run.arms.optimized, `run ${run.client}.arms.optimized`);

  if (run.client === 'hermes' && run.model !== 'deepseek-v4-pro') {
    throw new Error('hermes model must equal deepseek-v4-pro');
  }

  for (const field of CONTROL_FIELDS) {
    if (run.arms.baseline[field] !== run.arms.optimized[field]) {
      throw new Error(`${run.client} A/B controls must match: ${field}`);
    }
  }
}

export function validateGaiaAbManifest(raw) {
  assertObject(raw, 'GAIA A/B manifest');
  assertExactKeys(raw, ['schemaVersion', 'report', 'runs'], 'GAIA A/B manifest');

  if (raw.schemaVersion !== 1) {
    throw new Error('GAIA A/B manifest.schemaVersion must equal 1');
  }

  assertObject(raw.report, 'GAIA A/B manifest.report');
  assertExactKeys(raw.report, ['aggregateAcrossModels'], 'GAIA A/B manifest.report');
  if (raw.report.aggregateAcrossModels !== false) {
    throw new Error('GAIA A/B manifest.report.aggregateAcrossModels must be false');
  }

  if (!Array.isArray(raw.runs)) {
    throw new Error('GAIA A/B manifest.runs must be an array');
  }
  if (raw.runs.length !== REQUIRED_CLIENTS.length) {
    throw new Error('GAIA A/B manifest.runs must contain Codex, Claude, and Hermes exactly once');
  }

  const runsByClient = new Map();
  for (const run of raw.runs) {
    validateRun(run);
    if (!REQUIRED_CLIENTS.includes(run.client)) {
      throw new Error(`GAIA A/B manifest contains unsupported client: ${run.client}`);
    }
    if (runsByClient.has(run.client)) {
      throw new Error(`GAIA A/B manifest contains duplicate client: ${run.client}`);
    }
    runsByClient.set(run.client, run);
  }

  for (const client of REQUIRED_CLIENTS) {
    if (!runsByClient.has(client)) {
      throw new Error(`GAIA A/B manifest is missing required client: ${client}`);
    }
  }

  return raw;
}

export function parseGaiaAbManifest(text) {
  try {
    return validateGaiaAbManifest(JSON.parse(text));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('GAIA A/B manifest must be valid JSON');
    }
    throw error;
  }
}

export function buildGaiaAbDryRunSummary(manifest) {
  return {
    mode: 'dry-run',
    clients: manifest.runs.map(({ client, model }) => ({
      client,
      model,
      arms: ['baseline', 'optimized'],
    })),
  };
}
