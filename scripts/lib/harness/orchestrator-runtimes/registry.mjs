/* 中文注释：registry 只组装 runtime 执行器，不承载具体 runtime 的大段实现。 */
import { executeLocalDispatchPlan } from '../orchestrator.mjs';
import { executeSubagentDispatchPlan } from '../subagent-runtime.mjs';
import { listDispatchRuntimes, normalizeDispatchRuntimeResult, selectDispatchRuntime } from './catalog.mjs';
import {
  GROUPCHAT_RUNTIME,
  LIVE_EXECUTION_ENV,
  LOCAL_DRY_RUN_RUNTIME,
  SUBAGENT_RUNTIME,
} from './constants.mjs';
import { isLiveExecutionEnabled, isSubagentSimulationEnabled } from './env.mjs';
import { executeGroupChatRuntime } from './groupchat-adapter.mjs';
import { simulateSubagentDispatchRun } from './simulation.mjs';

function buildGatedResult({ mode, dispatchPlan }) {
  return {
    mode,
    ok: false,
    error: `Live execution is disabled by default. Set ${LIVE_EXECUTION_ENV}=1 to opt in.`,
    executorRegistry: Array.isArray(dispatchPlan?.executorRegistry) ? [...dispatchPlan.executorRegistry] : [],
    executorDetails: Array.isArray(dispatchPlan?.executorDetails)
      ? dispatchPlan.executorDetails.map((item) => ({ ...item }))
      : [],
    jobRuns: [],
    finalOutputs: [],
  };
}

export function createDispatchRuntimeRegistry({ executeDryRunPlan = executeLocalDispatchPlan } = {}) {
  if (typeof executeDryRunPlan !== 'function') {
    throw new Error('createDispatchRuntimeRegistry requires executeDryRunPlan');
  }

  const registry = {};

  for (const runtime of listDispatchRuntimes()) {
    if (runtime.id === LOCAL_DRY_RUN_RUNTIME) {
      registry[LOCAL_DRY_RUN_RUNTIME] = {
        ...runtime,
        async execute({ plan, dispatchPlan, dispatchPolicy, io, env } = {}) {
          const result = executeDryRunPlan(plan, dispatchPlan, { dispatchPolicy, io, env });
          return normalizeDispatchRuntimeResult(result, runtime, 'dry-run');
        },
      };
      continue;
    }

    if (runtime.id === SUBAGENT_RUNTIME) {
      registry[SUBAGENT_RUNTIME] = {
        ...runtime,
        async execute({ plan, dispatchPlan, dispatchPolicy, io, env, rootDir } = {}) {
          const mode = runtime.executionModes[0] || 'live';
          const gated = !isLiveExecutionEnabled(env);
          const simulate = isSubagentSimulationEnabled(env);

          if (gated) {
            return normalizeDispatchRuntimeResult(buildGatedResult({ mode, dispatchPlan }), runtime, mode);
          }

          if (simulate) {
            return normalizeDispatchRuntimeResult(
              simulateSubagentDispatchRun(plan, dispatchPlan, { dispatchPolicy, io, env }),
              runtime,
              mode
            );
          }

          const result = await executeSubagentDispatchPlan(plan, dispatchPlan, { dispatchPolicy, io, env, rootDir });
          return normalizeDispatchRuntimeResult(result, runtime, mode);
        },
      };
      continue;
    }

    if (runtime.id === GROUPCHAT_RUNTIME) {
      registry[GROUPCHAT_RUNTIME] = {
        ...runtime,
        async execute({ plan, dispatchPlan, io, env, rootDir } = {}) {
          const mode = runtime.executionModes[0] || 'live';
          if (!isLiveExecutionEnabled(env)) {
            return normalizeDispatchRuntimeResult(buildGatedResult({ mode, dispatchPlan }), runtime, mode);
          }
          const result = await executeGroupChatRuntime({ plan, dispatchPlan, io, env, rootDir });
          return normalizeDispatchRuntimeResult(result, runtime, mode);
        },
      };
      continue;
    }

    registry[runtime.id] = {
      ...runtime,
      async execute() {
        const mode = runtime.executionModes[0] || 'live';
        return normalizeDispatchRuntimeResult({
          mode,
          ok: false,
          error: `Dispatch runtime ${runtime.id} is not implemented yet.`,
          executorRegistry: [],
          executorDetails: [],
          jobRuns: [],
          finalOutputs: [],
        }, runtime, mode);
      },
    };
  }

  if (!registry[LOCAL_DRY_RUN_RUNTIME]) {
    throw new Error(`Runtime manifest missing required runtime: ${LOCAL_DRY_RUN_RUNTIME}`);
  }

  return registry;
}

export function resolveDispatchRuntime({ runtimeId = '', executionMode = 'none' } = {}, registry = {}) {
  const selectedRuntimeId = String(runtimeId || '').trim() || selectDispatchRuntime({ executionMode });
  const runtime = registry[selectedRuntimeId];

  if (!runtime) {
    throw new Error(`Unknown dispatch runtime: ${selectedRuntimeId}`);
  }

  if (!Array.isArray(runtime.executionModes) || !runtime.executionModes.includes(executionMode)) {
    throw new Error(`Dispatch runtime ${selectedRuntimeId} does not support execution mode: ${executionMode}`);
  }

  return runtime;
}
