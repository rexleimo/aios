import path from 'node:path';

import agentSpec from '../specs/orchestrator-agents.json' with { type: 'json' };
import { normalizeOrchestratorAgentSpec } from './orchestrator-agents.mjs';
import {
  SUBAGENT_CLIENT_ENV,
  SUBAGENT_CONCURRENCY_ENV,
  SUBAGENT_PRE_MUTATION_SNAPSHOT_ENV,
  SUBAGENT_TIMEOUT_MS_ENV,
  SUPPORTED_CLIENT_IDS,
  SUPPORTED_CLIENTS,
} from './subagent-runtime/constants.mjs';
import {
  cleanupClientStructuredOutputTempDir,
  createClientStructuredOutputTempDir,
} from './subagent-clients/structured-output.mjs';
import {
  detectSessionIdFromPlan,
} from './subagent-runtime/context-packet.mjs';
import { runDispatchJobs } from './subagent-runtime/dispatch-executor.mjs';
import { resolveRepoRoot } from './subagent-runtime/paths.mjs';
import {
  hasCostTelemetry,
  mergeCostTelemetry,
  normalizeCostTelemetry,
} from './subagent-runtime/telemetry.mjs';
import {
  normalizeText,
  parseBooleanEnv,
  parsePositiveInt,
} from './subagent-runtime/text.mjs';

export {
  SUBAGENT_CLAUDE_UNATTENDED_ENV,
  SUBAGENT_CLIENT_ENV,
  SUBAGENT_CONCURRENCY_ENV,
  SUBAGENT_CODEX_DISABLE_MCP_ENV,
  SUBAGENT_CODEX_UNATTENDED_ENV,
  SUBAGENT_GEMINI_UNATTENDED_ENV,
  SUBAGENT_PRE_MUTATION_SNAPSHOT_ENV,
  SUBAGENT_TIMEOUT_MS_ENV,
  SUBAGENT_UPSTREAM_BACKOFF_MS_ENV,
  SUBAGENT_UPSTREAM_MAX_ATTEMPTS_ENV,
} from './subagent-runtime/constants.mjs';

export { runOneShot } from './subagent-runtime/one-shot-runner.mjs';

function buildUnsupportedClientResult({ clientId, dispatchPlan }) {
  const supportedHint = `Set ${SUBAGENT_CLIENT_ENV} to one of: ${SUPPORTED_CLIENT_IDS.join(', ')}.`;
  return {
    mode: 'live',
    ok: false,
    error: clientId
      ? `Unsupported ${SUBAGENT_CLIENT_ENV}: ${clientId}. ${supportedHint}`
      : `Missing ${SUBAGENT_CLIENT_ENV}. ${supportedHint}`,
    executorRegistry: Array.isArray(dispatchPlan?.executorRegistry) ? [...dispatchPlan.executorRegistry] : [],
    executorDetails: Array.isArray(dispatchPlan?.executorDetails) ? dispatchPlan.executorDetails.map((item) => ({ ...item })) : [],
    jobRuns: [],
    finalOutputs: [],
  };
}

function resolveExecutorMetadata(dispatchPlan) {
  const executorDetails = Array.isArray(dispatchPlan?.executorDetails)
    ? dispatchPlan.executorDetails.map((item) => ({ ...item }))
    : [];
  const executorRegistry = Array.isArray(dispatchPlan?.executorRegistry)
    ? [...dispatchPlan.executorRegistry]
    : executorDetails.map((item) => item.id);
  const executorLabels = new Map(
    executorDetails
      .map((item) => [String(item?.id || '').trim(), String(item?.label || '').trim()])
      .filter(([id]) => id)
  );
  return { executorDetails, executorRegistry, executorLabels };
}

// 纯函数：把底层 jobRun 列表收敛为对外稳定的 dispatch 返回结构。
function buildDispatchResult({ executorRegistry, executorDetails, jobRuns }) {
  const totalCost = jobRuns.reduce(
    (acc, jobRun) => mergeCostTelemetry(acc, jobRun?.cost || null),
    normalizeCostTelemetry()
  );

  return {
    mode: 'live',
    ok: jobRuns.every((jobRun) => jobRun.status !== 'blocked'),
    executorRegistry,
    executorDetails,
    jobRuns,
    ...(hasCostTelemetry(totalCost) ? { cost: totalCost } : {}),
    finalOutputs: jobRuns
      .filter((jobRun) => jobRun.output?.outputType === 'merged-handoff' || jobRun.jobType === 'phase')
      .map((jobRun) => ({ jobId: jobRun.jobId, outputType: jobRun.output?.outputType || 'unknown' })),
  };
}

export async function executeSubagentDispatchPlan(
  plan,
  dispatchPlan,
  { dispatchPolicy = null, io = console, env = process.env, rootDir: runtimeRootDir = null } = {}
) {
  const normalizedClient = normalizeText(env?.[SUBAGENT_CLIENT_ENV]).toLowerCase();
  const clientId = normalizedClient || '';
  if (!SUPPORTED_CLIENTS.has(clientId)) {
    return buildUnsupportedClientResult({ clientId, dispatchPlan });
  }

  const rootDir = normalizeText(runtimeRootDir) ? path.resolve(String(runtimeRootDir)) : resolveRepoRoot();
  const sessionId = detectSessionIdFromPlan(plan);

  const concurrency = parsePositiveInt(env?.[SUBAGENT_CONCURRENCY_ENV], 3);
  const timeoutMs = parsePositiveInt(env?.[SUBAGENT_TIMEOUT_MS_ENV], 10 * 60 * 1000);
  const preMutationSnapshotEnabled = parseBooleanEnv(env?.[SUBAGENT_PRE_MUTATION_SNAPSHOT_ENV], false);
  const { executorDetails, executorRegistry, executorLabels } = resolveExecutorMetadata(dispatchPlan);
  const agentSpecNormalized = normalizeOrchestratorAgentSpec(agentSpec);
  const structuredOutputTempDir = await createClientStructuredOutputTempDir(clientId);

  try {
    const jobRuns = await runDispatchJobs({
      plan,
      dispatchPlan,
      clientId,
      concurrency,
      timeoutMs,
      env,
      io,
      agentSpecNormalized,
      executorLabels,
      dispatchPolicy,
      rootDir,
      sessionId,
      structuredOutputTempDir,
      preMutationSnapshotEnabled,
    });
    return buildDispatchResult({ executorRegistry, executorDetails, jobRuns });
  } finally {
    await cleanupClientStructuredOutputTempDir(structuredOutputTempDir);
  }
}
