/* 中文注释：runtime catalog 只负责读取 manifest 和选择 runtime，不执行任何任务。 */
import runtimeSpec from '../../specs/orchestrator-runtimes.json' with { type: 'json' };
import { LOCAL_DRY_RUN_RUNTIME, SUBAGENT_RUNTIME } from './constants.mjs';

export const DISPATCH_RUNTIME_CATALOG = Object.freeze(
  Object.fromEntries(
    Object.entries(runtimeSpec.runtimes || {}).map(([id, definition]) => [
      id,
      Object.freeze({
        id,
        manifestVersion: runtimeSpec.schemaVersion || 1,
        label: String(definition.label || id),
        description: String(definition.description || ''),
        requiresModel: definition.requiresModel === true,
        executionModes: Object.freeze(Array.isArray(definition.executionModes) ? [...definition.executionModes] : []),
      }),
    ])
  )
);

export function cloneDispatchRuntime(definition) {
  return {
    ...definition,
    executionModes: [...definition.executionModes],
  };
}

export function listDispatchRuntimes() {
  return Object.values(DISPATCH_RUNTIME_CATALOG).map((definition) => cloneDispatchRuntime(definition));
}

export function getDispatchRuntime(runtimeId = LOCAL_DRY_RUN_RUNTIME) {
  const key = String(runtimeId || '').trim();
  const definition = DISPATCH_RUNTIME_CATALOG[key];
  if (!definition) {
    throw new Error(`Unknown dispatch runtime: ${runtimeId}`);
  }
  return cloneDispatchRuntime(definition);
}

export function selectDispatchRuntime({ executionMode = 'none', runtimeId = '' } = {}) {
  const explicitId = String(runtimeId || '').trim();
  if (explicitId) return explicitId;
  const mode = String(executionMode || 'none').trim();
  if (mode === 'dry-run') {
    return LOCAL_DRY_RUN_RUNTIME;
  }
  if (mode === 'live') {
    return SUBAGENT_RUNTIME;
  }
  throw new Error(`No dispatch runtime available for execution mode: ${mode}`);
}

export function normalizeDispatchRuntimeResult(result, runtime, executionMode) {
  if (!result || typeof result !== 'object') {
    throw new Error(`Dispatch runtime ${runtime.id} returned an invalid result`);
  }
  if (!Array.isArray(result.jobRuns)) {
    throw new Error(`Dispatch runtime ${runtime.id} returned invalid jobRuns`);
  }

  const mode = String(result.mode || executionMode || '').trim();
  if (mode !== executionMode) {
    throw new Error(`Dispatch runtime ${runtime.id} returned incompatible mode: ${mode || '(missing)'}`);
  }

  return {
    ...result,
    runtime: {
      id: runtime.id,
      manifestVersion: runtime.manifestVersion,
      label: runtime.label,
      description: runtime.description,
      requiresModel: runtime.requiresModel,
      executionMode,
    },
  };
}
