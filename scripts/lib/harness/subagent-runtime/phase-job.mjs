import { normalizeModelRouting } from '../../model-router.mjs';
import { shouldUseClientStructuredOutput } from '../subagent-clients/structured-output.mjs';
import { resolveExecutionClientId } from './client-args.mjs';
import { runOneShot } from './one-shot-runner.mjs';
import {
  buildStructuredOutput,
  injectAgentIdEnv,
  resolveAgentForJob,
} from './phase-job-helpers.mjs';
import { buildBlockedPhaseJobRun } from './phase-blocks.mjs';
import { readSubagentOutputText } from './phase-output.mjs';
import { finalizePhaseJobRun } from './phase-job-finalize.mjs';
import { buildSystemPrompt, buildUserPrompt } from './prompts.mjs';
import { appendJobFindingsToRoleMemory } from './role-memory.mjs';
import { collectCostTelemetry } from './telemetry.mjs';
import { normalizeText } from './text.mjs';
import { compactSubagentTurnOutput, prepareSubagentTurnPrompts } from './turn-compression.mjs';
import { extractJsonCandidate } from './handoff-output.mjs';
import { redactExecutionContextText, redactExecutionContextValue } from '../runtime-context-redaction.mjs';
import { bindPhaseJobRexActivation, evaluatePhaseJobRexLaunchGate } from './phase-rex.mjs';

export { bindPhaseJobRexActivation };

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
  bindRexActivationImpl = bindPhaseJobRexActivation,
}) {
  const agent = resolveAgentForJob(job, agentSpecNormalized);
  const launchGate = evaluatePhaseJobRexLaunchGate({
    plan,
    job,
    phase,
    rootDir,
    bindRexActivationImpl,
  });
  if (!launchGate.ok) {
    return buildBlockedPhaseJobRun({
      plan,
      job,
      dependencyRuns,
      executorLabel,
      reason: launchGate.reason,
      elapsedMs: 0,
      rootDir,
      io,
    });
  }
  const rexBinding = launchGate.rexBinding;
  const systemPrompt = buildSystemPrompt({ agent, plan, job, phase, rexBinding });
  const userPrompt = buildUserPrompt({ plan, job, phase, dependencyRuns, rexBinding });
  const structuredOutput = buildStructuredOutput({ clientId, structuredOutputTempDir, rootDir, job });
  const modelRouting = normalizeModelRouting(job?.launchSpec?.modelRouting);
  const executionClientId = resolveExecutionClientId(clientId, modelRouting, env);
  const agentId = normalizeText(job?.launchSpec?.agentRefId);
  const outbound = await prepareSubagentTurnPrompts({
    rootDir,
    job,
    executionClientId,
    agentId,
    systemPrompt,
    userPrompt,
    executionContext: plan?.executionContext || null,
    io,
  });
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
  const outputText = redactExecutionContextText(
    await readSubagentOutputText({ structuredOutput, rawCommandOutput }),
    plan?.executionContext,
  );
  const redactedRawCommandOutput = redactExecutionContextText(rawCommandOutput, plan?.executionContext);
  const compacted = await compactSubagentTurnOutput({
    rootDir,
    sessionId: outbound.sessionId,
    executionClientId,
    agentId,
    outputText,
    rawCommandOutput: redactedRawCommandOutput,
    io,
  });
  const rawJson = redactExecutionContextValue(extractJsonCandidate(outputText), plan?.executionContext);
  return finalizePhaseJobRun({
    plan,
    job,
    phase,
    dependencyRuns,
    executorLabel,
    rootDir,
    io,
    modelRouting,
    executionClientId,
    clientId,
    result,
    elapsedMs,
    outputText,
    rawJson,
    redactedRawCommandOutput,
    compactOutputText: compacted.outputText,
    compactRawCommandOutput: compacted.rawCommandOutput,
    costTelemetry: collectCostTelemetry({ rawText: redactedRawCommandOutput, rawJson }),
    appendJobFindingsToRoleMemoryImpl,
  });
}
