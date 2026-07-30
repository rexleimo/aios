/* 中文注释：groupchat adapter 负责把 role conversation 映射到 dispatch runtime result。 */
import { normalizeHandoffPayload } from '../handoff.mjs';
import { runGroupChat } from '../groupchat-runtime.mjs';
import { isModelRouterEnabled, normalizeModelRouting, recordModelDispatch } from '../../model-router.mjs';
import { runOneShot } from '../subagent-runtime.mjs';
import { extractHandoffJson } from './handoff-json.mjs';
import { redactExecutionContextText, redactExecutionContextValue } from '../runtime-context-redaction.mjs';

export function resolveGroupChatClientId(defaultClientId = '', modelRouting = null, env = process.env) {
  const route = normalizeModelRouting(modelRouting);
  if (isModelRouterEnabled(env) && route?.clientId) return route.clientId;
  return String(defaultClientId || '').trim();
}

export function recordGroupChatModelDispatch({ rootDir, role, modelRouting, success, elapsedMs, description }) {
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

export function buildGroupChatSpawnFn({ clientId, timeoutMs, env, rootDir, io, executionContext = null }) {
  return async ({ role, speaker, workItem, conversationPrompt, userPrompt, modelRouting = null }) => {
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
    const rawOutput = redactExecutionContextText(
      [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
      executionContext,
    );
    const handoffJson = redactExecutionContextValue(extractHandoffJson(rawOutput), executionContext);
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

export function mapGroupChatResultToDispatchResult(groupChatResult) {
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

  const executorDetails = [...new Set(history.map((entry) => entry.speaker))]
    .map((speaker) => ({ id: speaker, label: speaker }));

  return {
    mode: 'live',
    ok: groupChatResult.ok === true,
    executorRegistry: executorDetails.map((entry) => entry.id),
    executorDetails,
    jobRuns,
    finalOutputs: jobRuns
      .filter((jobRun) => jobRun.output?.outputType === 'handoff')
      .map((jobRun) => ({ jobId: jobRun.jobId, outputType: 'handoff' })),
  };
}

export async function executeGroupChatRuntime({ plan, dispatchPlan, io, env, rootDir } = {}) {
  const clientId = String(env?.AIOS_SUBAGENT_CLIENT || '').trim().toLowerCase();
  if (!clientId) {
    return {
      mode: 'live',
      ok: false,
      error: 'AIOS_SUBAGENT_CLIENT is required for groupchat-runtime live execution.',
      executorRegistry: [],
      executorDetails: [],
      jobRuns: [],
      finalOutputs: [],
    };
  }

  const concurrency = (() => {
    const value = Number.parseInt(String(env?.AIOS_SUBAGENT_CONCURRENCY || '').trim(), 10);
    return Number.isFinite(value) && value > 0 ? value : 3;
  })();
  const timeoutMs = (() => {
    const value = Number.parseInt(String(env?.AIOS_SUBAGENT_TIMEOUT_MS || '').trim(), 10);
    return Number.isFinite(value) && value > 0 ? value : 10 * 60 * 1000;
  })();

  const spawnFn = buildGroupChatSpawnFn({
    clientId,
    timeoutMs,
    env,
    rootDir,
    io,
    executionContext: plan?.executionContext || null,
  });
  const groupChatResult = await runGroupChat({
    taskTitle: String(plan?.taskTitle || '').trim() || 'Untitled task',
    contextSummary: String(plan?.contextSummary || '').trim(),
    executionContext: plan?.executionContext || null,
    workItems: Array.isArray(plan?.workItems) ? plan.workItems : null,
    blueprint: String(plan?.blueprint || 'feature').trim(),
    spawnFn,
    config: { maxRounds: 10, concurrency, timeoutMs },
    rootDir,
    env,
    io,
  });

  return mapGroupChatResultToDispatchResult(groupChatResult, plan, dispatchPlan);
}
