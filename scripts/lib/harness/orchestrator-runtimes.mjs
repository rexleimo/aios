import runtimeSpec from '../specs/orchestrator-runtimes.json' with { type: 'json' };
import { normalizeHandoffPayload, validateHandoffPayload } from './handoff.mjs';
import { createHandoffFromPhase, executeLocalDispatchPlan, mergeParallelHandoffs } from './orchestrator.mjs';
import { executeSubagentDispatchPlan, runOneShot } from './subagent-runtime.mjs';
import { runGroupChat } from './groupchat-runtime.mjs';
import { isModelRouterEnabled, normalizeModelRouting, recordModelDispatch } from '../model-router.mjs';

export const LOCAL_DRY_RUN_RUNTIME = 'local-dry-run';
export const SUBAGENT_RUNTIME = 'subagent-runtime';
export const GROUPCHAT_RUNTIME = 'groupchat-runtime';
export const LIVE_EXECUTION_ENV = 'AIOS_EXECUTE_LIVE';
export const SUBAGENT_SIMULATE_ENV = 'AIOS_SUBAGENT_SIMULATE';

const DISPATCH_RUNTIME_CATALOG = Object.freeze(
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

function cloneDispatchRuntime(definition) {
  return {
    ...definition,
    executionModes: [...definition.executionModes],
  };
}

function isLiveExecutionEnabled(env = process.env) {
  const raw = String(env?.[LIVE_EXECUTION_ENV] || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function isSubagentSimulationEnabled(env = process.env) {
  const raw = String(env?.[SUBAGENT_SIMULATE_ENV] || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function getPhaseForJob(plan, job) {
  const phaseId = String(job?.phaseId || '').trim();
  if (!phaseId) return null;
  const phases = Array.isArray(plan?.phases) ? plan.phases : [];
  return phases.find((phase) => String(phase?.id || '').trim() === phaseId) || null;
}

function mapExecutorLabels(dispatchPlan) {
  const entries = Array.isArray(dispatchPlan?.executorDetails) ? dispatchPlan.executorDetails : [];
  return new Map(entries.map((item) => [String(item?.id || '').trim(), String(item?.label || '').trim()]).filter(([id]) => id));
}

function simulateSubagentDispatchRun(plan, dispatchPlan, { io } = {}) {
  const jobs = Array.isArray(dispatchPlan?.jobs) ? dispatchPlan.jobs : [];
  const executorLabels = mapExecutorLabels(dispatchPlan);
  const jobRuns = [];
  const jobRunMap = new Map();

  for (const job of jobs) {
    const dependencyRuns = Array.isArray(job.dependsOn)
      ? job.dependsOn.map((jobId) => jobRunMap.get(jobId)).filter(Boolean)
      : [];

    const executorId = String(job?.launchSpec?.executor || '').trim() || 'unknown';
    const executorLabel = executorLabels.get(executorId) || executorId;

    if (job.jobType === 'phase') {
      const phase = getPhaseForJob(plan, job);
      if (!phase) {
        jobRuns.push({
          jobId: job.jobId,
          jobType: job.jobType,
          role: job.role,
          executor: executorId,
          executorLabel,
          dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
          status: 'blocked',
          inputSummary: {
            dependencyCount: dependencyRuns.length,
            inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
          },
          output: {
            outputType: job.launchSpec?.outputType || 'handoff',
            error: `Unknown orchestration phase for job: ${job.jobId}`,
          },
        });
        continue;
      }

      const payload = createHandoffFromPhase(plan, phase, {
        toRole: job.launchSpec?.handoffTarget || 'next-phase',
        status: 'completed',
        contextSummary: `Subagent runtime simulated output for ${job.jobId}. ${phase.responsibility}`,
        findings: [`Simulated subagent output for ${job.jobId}.`],
        recommendations: [`Runtime path validated for ${job.role}.`],
      });

      const jobRun = {
        jobId: job.jobId,
        jobType: job.jobType,
        role: job.role,
        executor: executorId,
        executorLabel,
        dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
        status: 'simulated',
        inputSummary: {
          dependencyCount: dependencyRuns.length,
          inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
        },
        output: {
          outputType: job.launchSpec?.outputType || 'handoff',
          payload,
        },
      };

      jobRuns.push(jobRun);
      jobRunMap.set(job.jobId, jobRun);
      continue;
    }

    if (job.jobType === 'merge-gate') {
      const handoffs = dependencyRuns.map((run) => run?.output?.payload).filter(Boolean);
      const mergeResult = mergeParallelHandoffs(handoffs);
      const payload = normalizeHandoffPayload({
        status: mergeResult.ok ? 'completed' : 'blocked',
        fromRole: 'merge-gate',
        toRole: 'complete',
        taskTitle: plan?.taskTitle || 'Untitled task',
        contextSummary: mergeResult.ok
          ? `Subagent merge gate passed for ${job.group}.`
          : `Subagent merge gate blocked for ${job.group}.`,
        findings: mergeResult.mergedFindings,
        filesTouched: mergeResult.touchedFiles,
        recommendations: mergeResult.mergedRecommendations,
      });

      const jobRun = {
        jobId: job.jobId,
        jobType: job.jobType,
        role: job.role,
        executor: executorId,
        executorLabel,
        dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
        status: mergeResult.ok ? 'simulated' : 'blocked',
        inputSummary: {
          dependencyCount: dependencyRuns.length,
          inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
        },
        output: {
          outputType: job.launchSpec?.outputType || 'merged-handoff',
          payload,
          mergeResult: {
            ok: mergeResult.ok,
            blockedCount: mergeResult.blocked.length,
            conflictCount: mergeResult.conflicts.length,
            touchedFiles: mergeResult.touchedFiles,
          },
        },
      };

      jobRuns.push(jobRun);
      jobRunMap.set(job.jobId, jobRun);
      continue;
    }

    const jobRun = {
      jobId: job.jobId,
      jobType: job.jobType,
      role: job.role,
      executor: executorId,
      executorLabel,
      dependsOn: Array.isArray(job.dependsOn) ? [...job.dependsOn] : [],
      status: 'blocked',
      inputSummary: {
        dependencyCount: dependencyRuns.length,
        inputTypes: Array.isArray(job.launchSpec?.inputs) ? [...job.launchSpec.inputs] : [],
      },
      output: {
        outputType: job.launchSpec?.outputType || 'unknown',
        error: `Unsupported job type in subagent runtime simulation: ${job.jobType}`,
      },
    };
    jobRuns.push(jobRun);
    jobRunMap.set(job.jobId, jobRun);
  }

  const executorDetails = Array.isArray(dispatchPlan?.executorDetails)
    ? dispatchPlan.executorDetails.map((item) => ({ ...item }))
    : [];
  const executorRegistry = Array.isArray(dispatchPlan?.executorRegistry)
    ? [...dispatchPlan.executorRegistry]
    : executorDetails.map((item) => item.id);

  io?.log?.(`[subagent-runtime] simulated jobs=${jobRuns.length}`);

  return {
    mode: 'live',
    ok: jobRuns.every((jobRun) => jobRun.status !== 'blocked'),
    executorRegistry,
    executorDetails,
    jobRuns,
    finalOutputs: jobRuns
      .filter((jobRun) => jobRun.output?.outputType === 'merged-handoff' || jobRun.jobType === 'phase')
      .map((jobRun) => ({ jobId: jobRun.jobId, outputType: jobRun.output?.outputType || 'unknown' })),
  };
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

function extractHandoffJson(rawOutput) {
  const text = String(rawOutput || '').trim();
  if (!text) return null;

  // Try extracting from markdown code fence: ```json ... ```
  const fenceMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?```/i.exec(text);
  const candidate = fenceMatch ? fenceMatch[1].trim() : text;

  // Find the outermost JSON object
  const firstBrace = candidate.indexOf('{');
  if (firstBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;

  for (let i = firstBrace; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') { depth += 1; continue; }
    if (ch === '}') { depth -= 1; if (depth === 0) { end = i + 1; break; } }
  }

  if (end === -1) return null;

  try {
    return JSON.parse(candidate.slice(firstBrace, end));
  } catch {
    return null;
  }
}

function resolveGroupChatClientId(defaultClientId = '', modelRouting = null, env = process.env) {
  const route = normalizeModelRouting(modelRouting);
  if (isModelRouterEnabled(env) && route?.clientId) return route.clientId;
  return String(defaultClientId || '').trim();
}

function recordGroupChatModelDispatch({ rootDir, role, modelRouting, success, elapsedMs, description }) {
  const route = normalizeModelRouting(modelRouting);
  if (!route?.modelId || !rootDir) return;
  recordModelDispatch({
    workspaceRoot: rootDir,
    modelId: route.modelId,
    taskType: route.taskType,
    role: route.role || role,
    success,
    latencyMs: elapsedMs,
    costEstimate: route.cost,
    description,
  });
}

function buildGroupChatSpawnFn({ clientId, timeoutMs, env, rootDir, io }) {
  return async ({ role, speaker, workItem, conversationHistory, systemPrompt, conversationPrompt, userPrompt, modelRouting = null }) => {
    const promptText = String(userPrompt || conversationPrompt || '').trim();
    if (!promptText) {
      return { exitCode: 1, error: 'Empty prompt for groupchat speaker', handoff: null, rawOutput: '', elapsedMs: 0 };
    }

    const route = normalizeModelRouting(modelRouting);
    const executionClientId = resolveGroupChatClientId(clientId, route, env);
    const startedAt = Date.now();
    let result;
    try {
      result = await runOneShot(executionClientId, {
        systemPrompt: '',
        userPrompt: promptText,
        timeoutMs,
        env,
        io,
        cwd: rootDir || undefined,
        modelRouting: route,
      });
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      recordGroupChatModelDispatch({ rootDir, role, modelRouting: route, success: false, elapsedMs, description: error instanceof Error ? error.message : String(error) });
      return {
        exitCode: 1,
        error: error instanceof Error ? error.message : String(error),
        handoff: null,
        rawOutput: '',
        elapsedMs,
        modelRouting: route,
      };
    }

    const elapsedMs = Date.now() - startedAt;
    const rawOutput = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    const handoffJson = extractHandoffJson(rawOutput);
    const handoff = handoffJson
      ? normalizeHandoffPayload(handoffJson)
      : normalizeHandoffPayload({
          status: result.exitCode === 0 ? 'completed' : 'blocked',
          fromRole: role,
          toRole: 'planner',
          taskTitle: workItem?.title || 'GroupChat task',
          contextSummary: rawOutput.slice(0, 500),
          findings: [],
          recommendations: result.exitCode === 0 ? ['Task completed'] : ['Re-plan needed'],
        });

    recordGroupChatModelDispatch({
      rootDir,
      role,
      modelRouting: route,
      success: result.exitCode === 0 && handoff?.status !== 'blocked',
      elapsedMs,
      description: `groupchat ${speaker} ${handoff?.status || 'unknown'}`,
    });

    return {
      exitCode: result.exitCode,
      handoff,
      rawOutput,
      elapsedMs,
      error: result.error || null,
      modelRouting: route,
      ...(executionClientId !== clientId ? { routedClientId: executionClientId } : {}),
    };
  };
}

function mapGroupChatResultToDispatchResult(groupChatResult, plan, dispatchPlan) {
  const jobRuns = [];
  const history = Array.isArray(groupChatResult.conversationHistory)
    ? groupChatResult.conversationHistory
    : [];

  for (const entry of history) {
    jobRuns.push({
      jobId: `gc-${entry.turnNumber}`,
      jobType: 'phase',
      role: entry.role,
      executor: entry.speaker,
      executorLabel: entry.speaker,
      dependsOn: [],
      status: entry.handoff?.status === 'blocked' ? 'blocked' : 'completed',
      ...(entry.modelRouting ? { modelRouting: { ...entry.modelRouting } } : {}),
      inputSummary: { dependencyCount: 0, inputTypes: [] },
      output: {
        outputType: 'handoff',
        payload: entry.handoff || null,
      },
    });
  }

  const executorDetails = [...new Set(history.map(e => e.speaker))]
    .map(speaker => ({ id: speaker, label: speaker }));

  return {
    mode: 'live',
    ok: groupChatResult.ok === true,
    executorRegistry: executorDetails.map(e => e.id),
    executorDetails,
    jobRuns,
    finalOutputs: jobRuns
      .filter(jr => jr.output?.outputType === 'handoff')
      .map(jr => ({ jobId: jr.jobId, outputType: 'handoff' })),
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
            return normalizeDispatchRuntimeResult({
              mode,
              ok: false,
              error: `Live execution is disabled by default. Set ${LIVE_EXECUTION_ENV}=1 to opt in.`,
              executorRegistry: Array.isArray(dispatchPlan?.executorRegistry) ? [...dispatchPlan.executorRegistry] : [],
              executorDetails: Array.isArray(dispatchPlan?.executorDetails)
                ? dispatchPlan.executorDetails.map((item) => ({ ...item }))
                : [],
              jobRuns: [],
              finalOutputs: [],
            }, runtime, mode);
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
        async execute({ plan, dispatchPlan, dispatchPolicy, io, env, rootDir } = {}) {
          const mode = runtime.executionModes[0] || 'live';
          const gated = !isLiveExecutionEnabled(env);

          if (gated) {
            return normalizeDispatchRuntimeResult({
              mode,
              ok: false,
              error: `Live execution is disabled by default. Set ${LIVE_EXECUTION_ENV}=1 to opt in.`,
              executorRegistry: Array.isArray(dispatchPlan?.executorRegistry) ? [...dispatchPlan.executorRegistry] : [],
              executorDetails: Array.isArray(dispatchPlan?.executorDetails)
                ? dispatchPlan.executorDetails.map((item) => ({ ...item }))
                : [],
              jobRuns: [],
              finalOutputs: [],
            }, runtime, mode);
          }

          const clientId = String(env?.AIOS_SUBAGENT_CLIENT || '').trim().toLowerCase();
          if (!clientId) {
            return normalizeDispatchRuntimeResult({
              mode,
              ok: false,
              error: 'AIOS_SUBAGENT_CLIENT is required for groupchat-runtime live execution.',
              executorRegistry: [],
              executorDetails: [],
              jobRuns: [],
              finalOutputs: [],
            }, runtime, mode);
          }

          const concurrency = (() => {
            const v = Number.parseInt(String(env?.AIOS_SUBAGENT_CONCURRENCY || '').trim(), 10);
            return Number.isFinite(v) && v > 0 ? v : 3;
          })();
          const timeoutMs = (() => {
            const v = Number.parseInt(String(env?.AIOS_SUBAGENT_TIMEOUT_MS || '').trim(), 10);
            return Number.isFinite(v) && v > 0 ? v : 10 * 60 * 1000;
          })();

          const spawnFn = buildGroupChatSpawnFn({ clientId, timeoutMs, env, rootDir, io });

          const groupChatResult = await runGroupChat({
            taskTitle: String(plan?.taskTitle || '').trim() || 'Untitled task',
            contextSummary: String(plan?.contextSummary || '').trim(),
            workItems: Array.isArray(plan?.workItems) ? plan.workItems : null,
            blueprint: String(plan?.blueprint || 'feature').trim(),
            spawnFn,
            config: { maxRounds: 10, concurrency, timeoutMs },
            rootDir,
            env,
            io,
          });

          const dispatchResult = mapGroupChatResultToDispatchResult(groupChatResult, plan, dispatchPlan);
          return normalizeDispatchRuntimeResult(dispatchResult, runtime, mode);
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
