import path from 'node:path';

import { normalizeModelRouting } from '../../model-router.mjs';
import { validateHandoffPayload } from '../handoff.mjs';
import { buildClientStructuredOutputOptions, shouldUseClientStructuredOutput } from '../subagent-clients/structured-output.mjs';
import { CODEX_OUTPUT_SCHEMA_REL } from './constants.mjs';
import { recordPhaseModelDispatch, resolveExecutionClientId } from './client-args.mjs';
import { evaluatePhaseFilePolicy, summarizeFilePolicyViolation } from './file-policy.mjs';
import { extractJsonCandidate } from './handoff-output.mjs';
import { buildFailureReason } from './job-runs.mjs';
import { runOneShot } from './one-shot-runner.mjs';
import { buildBlockedPhaseJobRun } from './phase-blocks.mjs';
import { buildCompletedPhaseJobRun, normalizePhaseHandoffPayload, readSubagentOutputText, resolvePhaseJobStatus } from './phase-output.mjs';
import { resolveRepoRoot } from './paths.mjs';
import { buildSystemPrompt, buildUserPrompt } from './prompts.mjs';
import { appendJobFindingsToRoleMemory, loadRolePinnedMemory } from './role-memory.mjs';
import { collectCostTelemetry, hasCostTelemetry } from './telemetry.mjs';
import { normalizeText, safeFileSlug } from './text.mjs';
import { compactSubagentTurnOutput, prepareSubagentTurnPrompts } from './turn-compression.mjs';

function resolveAgentForJob(job, spec) {
  const agentId = normalizeText(job?.launchSpec?.agentRefId);
  if (!agentId) return null;
  return spec.agents[agentId] || null;
}

function normalizeResultAttempts(result, fallback = 0) {
  if (!Number.isFinite(result?.attempts)) return fallback;
  return Math.max(1, Math.floor(result.attempts));
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
  contextText,
  timeoutMs,
  env,
  io,
  agentSpecNormalized,
  executorLabel,
  rootDir,
  structuredOutputTempDir,
  runOneShotImpl = runOneShot,
}) {
  const agent = resolveAgentForJob(job, agentSpecNormalized);
  const role = normalizeText(job?.role);
  const rolePinnedMemory = await loadRolePinnedMemory(role, rootDir);
  const systemPrompt = buildSystemPrompt({ agent, contextText, plan, job, phase, rootDir, env, rolePinnedMemory });
  const userPrompt = buildUserPrompt({ plan, job, phase, dependencyRuns });
  const structuredOutput = buildStructuredOutput({ clientId, structuredOutputTempDir, rootDir, job });
  const modelRouting = normalizeModelRouting(job?.launchSpec?.modelRouting);
  const executionClientId = resolveExecutionClientId(clientId, modelRouting, env);
  const outbound = await prepareSubagentTurnPrompts({ rootDir, job, executionClientId, systemPrompt, userPrompt });

  const startedAt = Date.now();
  const result = await runOneShotImpl(executionClientId, {
    systemPrompt: outbound.systemPrompt,
    userPrompt: outbound.userPrompt,
    timeoutMs,
    env,
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
    outputText,
    rawCommandOutput,
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
    appendJobFindingsToRoleMemory({
      role: job.role,
      rootDir,
      jobId: job.jobId,
      taskTitle: plan.taskTitle,
      findings: validation.value.findings,
      contextSummary: validation.value.contextSummary,
    }).catch(() => { /* background best-effort */ });
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
