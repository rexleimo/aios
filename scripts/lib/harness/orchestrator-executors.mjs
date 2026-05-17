import executorSpec from '../specs/orchestrator-executors.json' with { type: 'json' };

export const LOCAL_PHASE_EXECUTOR = 'local-phase';
export const LOCAL_CONTROL_EXECUTOR = 'local-control';
export const LOCAL_MERGE_GATE_EXECUTOR = 'local-merge-gate';
export const LOCAL_DISPATCH_EXECUTORS = [
  LOCAL_PHASE_EXECUTOR,
  LOCAL_CONTROL_EXECUTOR,
  LOCAL_MERGE_GATE_EXECUTOR,
];

const LOCAL_DISPATCH_EXECUTOR_CATALOG = Object.freeze(
  Object.fromEntries(
    Object.entries(executorSpec.executors || {}).map(([id, definition]) => [
      id,
      Object.freeze({
        id,
        manifestVersion: executorSpec.schemaVersion || 1,
        label: String(definition.label || id),
        description: String(definition.description || ''),
        requiresModel: definition.requiresModel === true,
        executionModes: Object.freeze(Array.isArray(definition.executionModes) ? [...definition.executionModes] : []),
        jobTypes: Object.freeze(Array.isArray(definition.jobTypes) ? [...definition.jobTypes] : []),
        supportedRoles: Object.freeze(Array.isArray(definition.supportedRoles) ? [...definition.supportedRoles] : []),
        outputTypes: Object.freeze(Array.isArray(definition.outputTypes) ? [...definition.outputTypes] : []),
        concurrencyMode: String(definition.concurrencyMode || 'serial-only'),
        ownershipMode: String(definition.ownershipMode || 'handoff-only'),
      }),
    ])
  )
);

function cloneExecutorDefinition(definition) {
  return {
    ...definition,
    executionModes: [...definition.executionModes],
    jobTypes: [...definition.jobTypes],
    supportedRoles: [...definition.supportedRoles],
    outputTypes: [...definition.outputTypes],
  };
}

export function listLocalDispatchExecutors() {
  return LOCAL_DISPATCH_EXECUTORS
    .map((id) => LOCAL_DISPATCH_EXECUTOR_CATALOG[id])
    .filter(Boolean)
    .map((definition) => cloneExecutorDefinition(definition));
}

export function getLocalDispatchExecutor(executorId = LOCAL_PHASE_EXECUTOR) {
  const key = String(executorId || '').trim();
  const definition = LOCAL_DISPATCH_EXECUTOR_CATALOG[key];
  if (!definition) {
    throw new Error(`Unknown local dispatch executor: ${executorId}`);
  }
  return cloneExecutorDefinition(definition);
}

export function selectLocalDispatchExecutor({ jobType } = {}) {
  const normalizedJobType = String(jobType || '').trim();
  if (normalizedJobType === 'phase') {
    return LOCAL_PHASE_EXECUTOR;
  }
  if (normalizedJobType === 'merge-gate') {
    return LOCAL_MERGE_GATE_EXECUTOR;
  }

  const match = listLocalDispatchExecutors().find((definition) => definition.jobTypes.includes(normalizedJobType));
  if (!match) {
    throw new Error(`No local dispatch executor available for job type: ${jobType}`);
  }
  return match.id;
}

export function createLocalDispatchExecutorRegistry({ executePhaseJob, executeMergeGateJob } = {}) {
  if (typeof executePhaseJob !== 'function') {
    throw new Error('createLocalDispatchExecutorRegistry requires executePhaseJob');
  }
  if (typeof executeMergeGateJob !== 'function') {
    throw new Error('createLocalDispatchExecutorRegistry requires executeMergeGateJob');
  }

  return {
    [LOCAL_PHASE_EXECUTOR]: {
      ...getLocalDispatchExecutor(LOCAL_PHASE_EXECUTOR),
      execute({ plan, job, phase } = {}) {
        return executePhaseJob(plan, job, phase);
      },
    },
    [LOCAL_CONTROL_EXECUTOR]: {
      ...getLocalDispatchExecutor(LOCAL_CONTROL_EXECUTOR),
      execute({ plan, job, phase } = {}) {
        return executePhaseJob(plan, job, phase);
      },
    },
    [LOCAL_MERGE_GATE_EXECUTOR]: {
      ...getLocalDispatchExecutor(LOCAL_MERGE_GATE_EXECUTOR),
      execute({ plan, job, dependencyRuns = [] } = {}) {
        return executeMergeGateJob(plan, job, dependencyRuns);
      },
    },
  };
}

export function resolveLocalDispatchExecutor(job, registry = {}) {
  const executorId = String(job?.launchSpec?.executor || '').trim() || selectLocalDispatchExecutor({ jobType: job?.jobType });
  const executor = registry[executorId];

  if (!executor) {
    throw new Error(`Unknown local dispatch executor: ${executorId}`);
  }

  if (!Array.isArray(executor.jobTypes) || !executor.jobTypes.includes(job?.jobType)) {
    throw new Error(`Local dispatch executor ${executorId} does not support job type: ${job?.jobType}`);
  }

  if (Array.isArray(executor.supportedRoles) && executor.supportedRoles.length > 0 && !executor.supportedRoles.includes(job?.role)) {
    throw new Error(`Local dispatch executor ${executorId} does not support role: ${job?.role}`);
  }

  return executor;
}
