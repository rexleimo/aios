import path from 'node:path';
import { normalizeModelRouting } from '../../model-router.mjs';
import { validateHandoffPayload } from '../handoff.mjs';
import { buildClientStructuredOutputOptions, shouldUseClientStructuredOutput } from '../subagent-clients/structured-output.mjs';
import { CODEX_OUTPUT_SCHEMA_REL, AGENT_ID_ENV } from './constants.mjs';
import { recordPhaseModelDispatch, resolveExecutionClientId } from './client-args.mjs';
import { evaluatePhaseFilePolicy, summarizeFilePolicyViolation } from './file-policy.mjs';
import { extractJsonCandidate } from './handoff-output.mjs';
import { buildFailureReason } from './job-runs.mjs';
import { runOneShot } from './one-shot-runner.mjs';
import { buildBlockedPhaseJobRun } from './phase-blocks.mjs';
import { buildCompletedPhaseJobRun, normalizePhaseHandoffPayload, readSubagentOutputText, resolvePhaseJobStatus } from './phase-output.mjs';
import { resolveRepoRoot } from './paths.mjs';
import { buildSystemPrompt, buildUserPrompt } from './prompts.mjs';
import { appendJobFindingsToRoleMemory } from './role-memory.mjs';
import { collectCostTelemetry, hasCostTelemetry } from './telemetry.mjs';
import { normalizeText, safeFileSlug } from './text.mjs';
import { compactSubagentTurnOutput, prepareSubagentTurnPrompts } from './turn-compression.mjs';

function resolveAgentForJob(job, spec) {
  const agentId = normalizeText(job?.launchSpec?.agentRefId);
  if (!agentId) return null;
  return spec.agents[agentId] || null;
}

/* 中文注释：把当前 job 的 agent id 注入子进程环境变量，让 memo CLI 默认使用该 agent 命名空间。显式 --agent 仍然优先生效。 */
function injectAgentIdEnv(env, agentId) {
  const normalized = normalizeText(agentId);
  if (!normalized) return env;
  if (env && typeof env === 'object' && env[AGENT_ID_ENV] === normalized) return env;
  return { ...(env || {}), [AGENT_ID_ENV]: normalized };
}

function normalizeResultAttempts(result, fallback = 0) {
  if (!Number.isFinite(result?.attempts)) return fallback;
  return Math.max(1, Math.floor(result.attempts));
}

/**
 * A3 — record worker_died death notice on phase failure (best-effort, never throws).
 */
async function maybeRecordWorkerDeathNotice({
  rootDir,
  plan,
  job,
  failureReason = '',
  exitCode = 1,
  io = null,
} = {}) {
  try {
    const sessionId = String(plan?.sessionId || plan?.session_id || plan?.id || '').trim();
    const agentId = String(job?.jobId || job?.role || job?.id || '').trim();
    if (!rootDir || !sessionId || !agentId) return null;

    const {
      buildDeathNotice,
      writeDeathNotice,
      readDeathNotices,
      hasDuplicateNotice,
    } = await import('../../lifecycle/death-notice.mjs');

    const reasonText = String(failureReason || '');
    const reason = /timed out/i.test(reasonText)
      ? 'timeout'
      : /zombie|stall/i.test(reasonText)
        ? 'zombie'
        : 'crash';

    const notice = buildDeathNotice({
      agentId,
      sessionId,
      reason,
      lastKnownState: {
        jobId: job?.jobId || null,
        role: job?.role || null,
        exitCode,
        failureReason: reasonText.slice(0, 500),
      },
    });

    const existing = await readDeathNotices(rootDir, sessionId);
    if (hasDuplicateNotice(existing, notice)) {
      io?.log?.(`[subagent-runtime] death-notice duplicate skipped for ${agentId}`);
      return null;
    }
    const filePath = await writeDeathNotice(rootDir, notice);
    io?.log?.(`[subagent-runtime] death-notice written ${agentId} reason=${reason} -> ${filePath}`);
    return filePath;
  } catch (error) {
    io?.log?.(`[subagent-runtime] death-notice skipped: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function buildStructuredOutput({ clientId, structuredOutputTempDir, rootDir, job }) {
  if (!structuredOutputTempDir || !rootDir) return null;
  return buildClientStructuredOutputOptions({
    clientId,
    tempDir: structuredOutputTempDir,
    schemaPath: path.join(resolveRepoRoot(), CODEX_OUTPUT_SCHEMA_REL),
    lastMessagePath: path.join(structuredOutputTempDir, `${safeFileSlug(job?.jobId)}.json`),
  });
}

export async function executePhaseJob(plan, job, phase, dependencyRuns, {
  clientId,
  timeoutMs,
  env,
  io,
  agentSpecNormalized,
  executorLabel,
  rootDir,
  structuredOutputTempDir,
  runOneShotImpl = runOneShot,
  appendJobFindingsToRoleMemoryImpl = appendJobFindingsToRoleMemory,
}) {
  const agent = resolveAgentForJob(job, agentSpecNormalized);
  const role = normalizeText(job?.role);
  const systemPrompt = buildSystemPrompt({ agent, plan, job, phase });
  const userPrompt = buildUserPrompt({ plan, job, phase, dependencyRuns });
  const structuredOutput = buildStructuredOutput({ clientId, structuredOutputTempDir, rootDir, job });
  const modelRouting = normalizeModelRouting(job?.launchSpec?.modelRouting);
  const executionClientId = resolveExecutionClientId(clientId, modelRouting, env);
  const agentId = normalizeText(job?.launchSpec?.agentRefId);
  const outbound = await prepareSubagentTurnPrompts({ rootDir, job, executionClientId, agentId, systemPrompt, userPrompt, io });

  const startedAt = Date.now();
  const result = await runOneShotImpl(executionClientId, {
    systemPrompt: outbound.systemPrompt,
    userPrompt: outbound.userPrompt,
    timeoutMs,
    env: injectAgentIdEnv(env, agentId),
    io,
    cwd: rootDir,
    codexOutput: shouldUseClientStructuredOutput(executionClientId) ? structuredOutput : null,
    modelRouting,
  });
  const elapsedMs = Date.now() - startedAt;
  const rawCommandOutput = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const outputText = await readSubagentOutputText({ structuredOutput, rawCommandOutput });
  const compacted = await compactSubagentTurnOutput({
    rootDir,
    sessionId: outbound.sessionId,
    executionClientId,
    agentId,
    outputText,
    rawCommandOutput,
    io,
  });
  const compactOutputText = compacted.outputText;
  const compactRawCommandOutput = compacted.rawCommandOutput;
  const rawJson = extractJsonCandidate(outputText);
  const costTelemetry = collectCostTelemetry({ rawText: rawCommandOutput, rawJson });
  const attempts = normalizeResultAttempts(result);
  const block = (reason, options = {}) => buildBlockedPhaseJobRun({
    plan,
    job,
    dependencyRuns,
    executorLabel,
    reason,
    elapsedMs,
    costTelemetry,
    rawOutput: options.rawOutput ?? compactRawCommandOutput,
    attempts: options.attempts ?? attempts,
    rootDir,
    modelRouting,
    io,
    dispatchDescription: options.dispatchDescription,
  });

  const allowTimedOutHandoff = result.exitCode !== 0
    && /timed out/i.test(String(result.error || ''))
    && Boolean(rawJson);

  if (result.exitCode !== 0 && !allowTimedOutHandoff) {
    const attemptCount = normalizeResultAttempts(result, 1);
    const failureReason = buildFailureReason({
      baseReason: result.error || `exit=${result.exitCode}${attemptCount > 1 ? ` after ${attemptCount} attempts` : ''}`,
      exitCode: result.exitCode,
      rawCommandOutput,
    });
    // A3: worker_died notice so team status/watchdog can surface dead workers
    await maybeRecordWorkerDeathNotice({
      rootDir,
      plan,
      job,
      failureReason,
      exitCode: result.exitCode,
      io,
    });
    return block(failureReason, { attempts: attemptCount, rawOutput: compactRawCommandOutput });
  }
  if (allowTimedOutHandoff) {
    io?.log?.(`[subagent-runtime] continuing ${job.jobId} with last-message payload after timeout`);
  }

  if (!rawJson) {
    return block('Failed to parse JSON handoff from subagent output', { rawOutput: compactRawCommandOutput });
  }

  const normalizedPayload = normalizePhaseHandoffPayload({ rawJson, plan, job, phase });
  const validation = validateHandoffPayload(normalizedPayload);
  if (!validation.ok) {
    return block(`Invalid handoff payload: ${validation.errors.join('; ')}`, {
      rawOutput: compactOutputText,
      dispatchDescription: 'Invalid handoff payload',
    });
  }

  const filePolicy = evaluatePhaseFilePolicy(validation.value, phase, job);
  if (!filePolicy.ok) {
    return block(summarizeFilePolicyViolation(filePolicy.violations), { rawOutput: compactOutputText });
  }

  const payloadStatus = validation.value.status;
  const jobStatus = resolvePhaseJobStatus(payloadStatus);
  const costNote = hasCostTelemetry(costTelemetry)
    ? ` tokens=${costTelemetry.totalTokens} usd=${costTelemetry.usd}`
    : '';
  io?.log?.(`[subagent-runtime] completed ${job.jobId} status=${payloadStatus} elapsedMs=${elapsedMs}${costNote}`);
  recordPhaseModelDispatch({
    rootDir,
    job,
    modelRouting,
    success: jobStatus === 'completed',
    elapsedMs,
    description: `${job.jobId} ${payloadStatus}`,
  });

  if (jobStatus === 'completed') {
    await appendJobFindingsToRoleMemoryImpl({
      role: job.role,
      rootDir,
      jobId: job.jobId,
      taskTitle: plan.taskTitle,
      findings: validation.value.findings,
      contextSummary: validation.value.contextSummary,
    }).catch(() => {});

    // L3: team/subagent success → plan task progress + evidence crumb
    try {
      const { syncPlanWithIterationOutcome } = await import('../../planning/plan-runtime.mjs');
      syncPlanWithIterationOutcome({
        rootDir,
        objective: plan.taskTitle || plan.objective || job.jobId,
        iteration: 1,
        outcome: {
          outcome: 'success',
          ok: true,
          summary: `subagent ${job.jobId} completed`,
          evidence: [
            `job=${job.jobId}`,
            `role=${job.role || ''}`,
            `status=${payloadStatus}`,
          ],
        },
        client: 'subagent-runtime',
        io,
      });
    } catch {
      // optional
    }
  }

  return buildCompletedPhaseJobRun({
    job,
    dependencyRuns,
    executorLabel,
    elapsedMs,
    costTelemetry,
    modelRouting,
    executionClientId,
    clientId,
    result,
    payload: validation.value,
    outputText: compactOutputText,
  });
}
