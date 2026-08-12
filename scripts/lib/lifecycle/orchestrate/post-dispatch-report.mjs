import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  buildDispatchPolicy,
  buildEffectiveDispatchPolicy,
  buildOrchestrationPlan,
} from '../../harness/orchestrator.mjs';
import { persistDispatchEvidence } from '../../harness/orchestrator-evidence.mjs';
import { buildDispatchInsights } from '../../harness/dispatch-insights.mjs';
import { buildWorkItemTelemetry } from '../../harness/work-item-telemetry.mjs';
import { evaluateClarityGate, persistClarityGateDecision } from '../../harness/clarity-gate.mjs';
import { executeEntropyGc } from '../entropy-gc.mjs';
import { applyReleaseGuardBlock } from './release-guard.mjs';
import { normalizePositiveInteger, parseBooleanEnv } from './shared.mjs';

function buildClarityAdjustedPolicy(releaseGuardedFinalDispatchPolicy, resolvedClarityGate, sessionId) {
  if (!resolvedClarityGate?.needsHuman) {
    return releaseGuardedFinalDispatchPolicy;
  }

  return {
    ...releaseGuardedFinalDispatchPolicy,
    status: 'blocked',
    parallelism: 'serial-only',
    blockerIds: [...new Set([...(releaseGuardedFinalDispatchPolicy?.blockerIds || []), 'gate.clarity-human'])],
    requiredActions: [
      ...(Array.isArray(releaseGuardedFinalDispatchPolicy?.requiredActions) ? releaseGuardedFinalDispatchPolicy.requiredActions : []),
      {
        type: 'command',
        action: `node scripts/aios.mjs entropy-gc dry-run --session ${sessionId} --format json`,
        sourceId: 'gate.clarity-human',
      },
      {
        type: 'command',
        action: `node scripts/aios.mjs orchestrate --session ${sessionId} --dispatch local --execute live --format json`,
        sourceId: 'gate.clarity-human',
      },
    ],
    notes: [
      ...(Array.isArray(releaseGuardedFinalDispatchPolicy?.notes) ? releaseGuardedFinalDispatchPolicy.notes : []),
      'Clarity gate required human input before continuing automation.',
    ],
  };
}

async function captureCodemapAnalysis(rootDir) {
  try {
    const codemapStatePath = path.join(rootDir, '.aios', 'codemap.json');
    if (existsSync(codemapStatePath)) {
      const { captureCrgCommand } = await import('../../components/codemap.mjs');
      const result = captureCrgCommand(['detect-changes', '--brief'], { cwd: rootDir });
      if (result && result.status === 0 && result.stdout) {
        return result.stdout.trim();
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function buildPostDispatchReport({
  rootDir,
  env,
  options,
  blueprint,
  taskTitle,
  contextSummary,
  learnEvalOverlay,
  rawDispatchPolicy,
  preflightDispatchPolicy,
  effectiveDispatchPolicy,
  dispatchPreflight,
  effectiveLearnEvalReport,
  dispatchPlan,
  dispatchRun,
  executorCapabilityManifest,
  readiness,
  retryReplay,
  contextLifecycle,
  dispatchRunStartedAt,
  planTasks,
} = {}) {
  const postDispatchPolicy = buildDispatchPolicy({
    learnEvalReport: effectiveLearnEvalReport,
    learnEvalOverlay,
    dispatchPlan,
    dispatchRun,
  }) || preflightDispatchPolicy || rawDispatchPolicy;
  const finalEffectiveDispatchPolicy = buildEffectiveDispatchPolicy({
    dispatchPolicy: postDispatchPolicy,
    dispatchPreflight,
    learnEvalReport: effectiveLearnEvalReport,
  }) || effectiveDispatchPolicy || postDispatchPolicy;
  const releaseGuardedFinalDispatchPolicy = applyReleaseGuardBlock(finalEffectiveDispatchPolicy, dispatchPreflight);
  const clarityGate = options.executionMode === 'live' && dispatchRun
    ? evaluateClarityGate(
      {
        sessionId: options.sessionId,
        learnEvalReport: effectiveLearnEvalReport,
        dispatchRun,
      },
      {
        blockedCheckpointThreshold: normalizePositiveInteger(env?.AIOS_HUMAN_GATE_BLOCKED_THRESHOLD, 2),
        maxFilesTouched: normalizePositiveInteger(env?.AIOS_HUMAN_GATE_MAX_FILES, 25),
      }
    )
    : null;
  const clarityGateEvidence = clarityGate?.needsHuman
    ? persistClarityGateDecision({
      rootDir,
      sessionId: options.sessionId,
      gate: clarityGate,
    })
    : null;
  const resolvedClarityGate = clarityGate
    ? {
      ...clarityGate,
      ...(clarityGateEvidence ? { evidence: clarityGateEvidence } : {}),
    }
    : null;
  const clarityAdjustedPolicy = buildClarityAdjustedPolicy(
    releaseGuardedFinalDispatchPolicy,
    resolvedClarityGate,
    options.sessionId
  );
  const entropyGc = options.executionMode === 'live'
    && dispatchRun
    && dispatchRun.ok === true
    && options.sessionId
    && parseBooleanEnv(env?.AIOS_ENTROPY_AUTO, true)
    ? await executeEntropyGc(
      {
        sessionId: options.sessionId,
        mode: resolvedClarityGate?.needsHuman ? 'off' : 'auto',
        retain: normalizePositiveInteger(env?.AIOS_ENTROPY_RETAIN, 5),
        minAgeHours: normalizePositiveInteger(env?.AIOS_ENTROPY_MIN_AGE_HOURS, 24),
        format: 'json',
      },
      {
        rootDir,
        persistEvidence: true,
      }
    )
    : null;
  const dispatchPolicy = rawDispatchPolicy;
  const workItemTelemetry = buildWorkItemTelemetry({
    dispatchPlan,
    dispatchRun,
  });
  const dispatchInsights = buildDispatchInsights({
    dispatchPlan,
    dispatchRun,
    workItemTelemetry,
    executorCapabilityManifest,
    clarityGate: resolvedClarityGate,
  });
  const codemapAnalysis = await captureCodemapAnalysis(rootDir);

  const reportBasePlan = buildOrchestrationPlan({
    blueprint,
    taskTitle,
    contextSummary,
    planTasks,
    learnEvalOverlay,
    dispatchPolicy,
    dispatchPreflight,
    effectiveDispatchPolicy: clarityAdjustedPolicy,
    executorCapabilityManifest,
    readiness,
  });
  const dispatchEvidence = dispatchRun
    ? await persistDispatchEvidence({
      rootDir,
      sessionId: options.sessionId,
      report: {
        ...reportBasePlan,
        ...(dispatchPlan ? { dispatchPlan } : {}),
        ...(dispatchRun ? { dispatchRun } : {}),
        ...(dispatchPolicy ? { dispatchPolicy } : {}),
        ...(dispatchPreflight ? { dispatchPreflight } : {}),
        ...(clarityAdjustedPolicy ? { effectiveDispatchPolicy: clarityAdjustedPolicy } : {}),
        ...(resolvedClarityGate ? { clarityGate: resolvedClarityGate } : {}),
        ...(entropyGc ? { entropyGc } : {}),
        ...(workItemTelemetry ? { workItemTelemetry } : {}),
        ...(dispatchInsights ? { dispatchInsights } : {}),
        ...(codemapAnalysis ? { codemapAnalysis } : {}),
        ...(retryReplay ? { retryReplay } : {}),
        ...(contextLifecycle ? { contextLifecycle } : {}),
        ...(readiness ? { readiness } : {}),
      },
      elapsedMs: Date.now() - dispatchRunStartedAt,
    })
    : null;

  return {
    ...reportBasePlan,
    ...(dispatchPlan ? { dispatchPlan } : {}),
    ...(dispatchRun ? { dispatchRun } : {}),
    ...(dispatchPolicy ? { dispatchPolicy } : {}),
    ...(dispatchPreflight ? { dispatchPreflight } : {}),
    ...(clarityAdjustedPolicy ? { effectiveDispatchPolicy: clarityAdjustedPolicy } : {}),
    ...(resolvedClarityGate ? { clarityGate: resolvedClarityGate } : {}),
    ...(entropyGc ? { entropyGc } : {}),
    ...(workItemTelemetry ? { workItemTelemetry } : {}),
    ...(dispatchInsights ? { dispatchInsights } : {}),
    ...(retryReplay ? { retryReplay } : {}),
    ...(contextLifecycle ? { contextLifecycle } : {}),
    ...(readiness ? { readiness } : {}),
    ...(dispatchEvidence ? { dispatchEvidence } : {}),
  };
}
