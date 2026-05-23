import {
  buildExecutorCapabilityManifest,
  buildDispatchPolicy,
  buildEffectiveDispatchPolicy,
  buildLocalDispatchPlan,
  buildOrchestrationPlan,
  renderOrchestrationReport,
} from '../harness/orchestrator.mjs';
import {
  createDispatchRuntimeRegistry,
  normalizeDispatchRuntimeResult,
  resolveDispatchRuntime,
} from '../harness/orchestrator-runtimes.mjs';
import { buildLearnEvalReport } from '../harness/learn-eval.mjs';
import {
  buildRetryBlockedRecoveryCommands,
  extractDispatchHindsightSummary,
  isRetryBlockedDispatchUnstable,
} from './orchestrate/retry-blocked.mjs';
import {
  buildLearnEvalOverlay,
  buildOverlayContext,
  extractBlueprintFromTargetId,
} from './orchestrate/overlay.mjs';
import {
  applyRetryBlockedDispatchPlan,
  loadLatestBlockedDispatchReplay,
} from './orchestrate/retry-replay.mjs';
import { planOrchestrate } from './orchestrate/plan.mjs';
export { normalizeOrchestrateOptions, planOrchestrate } from './orchestrate/plan.mjs';
import { executeDispatchPreflight } from './orchestrate/preflight.mjs';
import { handleUnknownCapabilityGuard } from './orchestrate/runtime-capability-guard.mjs';
import { buildPostDispatchReport } from './orchestrate/post-dispatch-report.mjs';
import {
  applyReleaseGuardBlock,
  buildReleaseGuardAction,
} from './orchestrate/release-guard.mjs';
import { writeWarning } from './orchestrate/shared.mjs';
import { runDoctor } from './doctor.mjs';
import { runQualityGate } from './quality-gate.mjs';
import { runReleaseStatus } from './release-status.mjs';
import { evaluateOwnershipEvidence, evaluatePlanEvidence, mergeReadinessVerdicts } from './preflight-contracts.mjs';
const DEFAULT_PREFLIGHT_ADAPTERS = {
  qualityGate: runQualityGate,
  releaseStatus: runReleaseStatus,
  doctor: runDoctor,
  orchestrate: runOrchestrate,
};

export async function runOrchestrate(
  rawOptions = {},
  {
    rootDir,
    io = console,
    env = process.env,
    preflightAdapters = DEFAULT_PREFLIGHT_ADAPTERS,
    dispatchRuntimeRegistry = createDispatchRuntimeRegistry(),
    runtimeId = '',
  } = {}
) {
  const { options } = planOrchestrate(rawOptions);

  let blueprint = options.blueprint;
  let taskTitle = options.taskTitle;
  let contextSummary = options.contextSummary;
  let learnEvalOverlay = null;
  let learnEvalReport = null;
  let readiness = null;

  if (options.sessionId) {
    learnEvalReport = await buildLearnEvalReport(
      { sessionId: options.sessionId, limit: options.limit },
      { rootDir }
    );
    learnEvalOverlay = buildLearnEvalOverlay(learnEvalReport, options.recommendationId);

    if (!options.blueprintExplicit) {
      const recommendedBlueprint = extractBlueprintFromTargetId(learnEvalOverlay.selectedRecommendationId);
      if (recommendedBlueprint) {
        blueprint = recommendedBlueprint;
      }
    }

    if (!options.taskTitleExplicit && String(learnEvalReport.session.goal || '').trim()) {
      taskTitle = String(learnEvalReport.session.goal).trim();
    }

    const overlayContext = buildOverlayContext(learnEvalOverlay);
    contextSummary = [options.contextSummary, overlayContext].filter(Boolean).join(' | ');
  }

  const replaySessionId = options.resumeSessionId || options.sessionId;
  const dispatchHindsightSummary = extractDispatchHindsightSummary(learnEvalReport);
  const retryBlockedDispatchUnstable = options.retryBlocked && isRetryBlockedDispatchUnstable(dispatchHindsightSummary);

  if (retryBlockedDispatchUnstable && options.executionMode === 'live' && !options.force) {
    const message = `[guard] refusing live --retry-blocked for session ${replaySessionId}: dispatch hindsight pairs=${dispatchHindsightSummary.pairsAnalyzed} repeatBlocked=${dispatchHindsightSummary.repeatedBlockedTurns} regressions=${dispatchHindsightSummary.regressions}`;
    const recoveryCommands = buildRetryBlockedRecoveryCommands(replaySessionId, env);
    const suggestion = `Run: ${recoveryCommands[0] || `node scripts/aios.mjs learn-eval --session ${replaySessionId}`} (or retry with --dry-run / --force)`;

    if (options.format === 'json') {
      const report = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        kind: 'guardrail.retry-blocked',
        sessionId: replaySessionId,
        executionMode: options.executionMode,
        retryBlocked: true,
        force: false,
        dispatchHindsight: dispatchHindsightSummary,
        message: `${message}. ${suggestion}`,
        suggestedCommands: recoveryCommands,
      };
      io.log(JSON.stringify(report, null, 2));
      return { exitCode: 1, report };
    }

    writeWarning(io, `${message}\n${suggestion}\nSuggested:\n- ${recoveryCommands.slice(0, 4).join('\n- ')}`);
    return { exitCode: 1 };
  }

  if (retryBlockedDispatchUnstable) {
    if (options.force) {
      writeWarning(
        io,
        `[warn] live --retry-blocked override (--force): session ${replaySessionId} has unstable dispatch hindsight (pairs=${dispatchHindsightSummary.pairsAnalyzed} repeatBlocked=${dispatchHindsightSummary.repeatedBlockedTurns} regressions=${dispatchHindsightSummary.regressions})`
      );
    } else if (options.executionMode !== 'live') {
      writeWarning(
        io,
        `[warn] --retry-blocked: session ${replaySessionId} has unstable dispatch hindsight (pairs=${dispatchHindsightSummary.pairsAnalyzed} repeatBlocked=${dispatchHindsightSummary.repeatedBlockedTurns} regressions=${dispatchHindsightSummary.regressions})`
      );
    }
  }

  const rawDispatchPolicy = buildDispatchPolicy({
    learnEvalReport,
    learnEvalOverlay,
  });
  const preflightExtraActions = options.preflightMode === 'auto'
    ? [buildReleaseGuardAction()]
    : [];
  const dispatchPreflight = await executeDispatchPreflight(rawDispatchPolicy, {
    rootDir,
    env,
    sessionId: options.sessionId,
    preflightMode: options.preflightMode,
    preflightAdapters,
    extraActions: preflightExtraActions,
    fallbackOrchestrateRunner: runOrchestrate,
  });
  let effectiveLearnEvalReport = learnEvalReport;
  if (
    options.sessionId
    && dispatchPreflight?.results?.some((item) => (item.runner === 'quality-gate' || item.runner === 'orchestrate') && item.status !== 'skipped')
  ) {
    effectiveLearnEvalReport = await buildLearnEvalReport(
      { sessionId: options.sessionId, limit: options.limit },
      { rootDir }
    );
  }
  const preflightDispatchPolicy = buildDispatchPolicy({
    learnEvalReport: effectiveLearnEvalReport,
    learnEvalOverlay,
  }) || rawDispatchPolicy;
  const effectiveDispatchPolicy = buildEffectiveDispatchPolicy({
    dispatchPolicy: preflightDispatchPolicy,
    dispatchPreflight,
    learnEvalReport: effectiveLearnEvalReport,
  }) || preflightDispatchPolicy || rawDispatchPolicy;
  const releaseGuardedEffectiveDispatchPolicy = applyReleaseGuardBlock(effectiveDispatchPolicy, dispatchPreflight);

  const basePlan = buildOrchestrationPlan({
    blueprint,
    taskTitle,
    contextSummary,
    learnEvalOverlay,
    dispatchPolicy: rawDispatchPolicy,
    dispatchPreflight,
    effectiveDispatchPolicy: releaseGuardedEffectiveDispatchPolicy,
  });
  const dagPlan = {
    ...basePlan,
    dispatchPolicy: releaseGuardedEffectiveDispatchPolicy,
  };

  let dispatchPlan = options.dispatchMode === 'local'
    ? buildLocalDispatchPlan(dagPlan, { phaseExecutor: options.phaseExecutor, env })
    : null;
  let retryReplay = null;
  if (options.retryBlocked) {
    const replaySessionId = options.resumeSessionId || options.sessionId;
    const latestReplay = await loadLatestBlockedDispatchReplay(rootDir, replaySessionId);
    if (!latestReplay) {
      throw new Error(`No blocked dispatch artifact found for session: ${replaySessionId}`);
    }
    if (!dispatchPlan) {
      throw new Error('--retry-blocked requires --dispatch local');
    }
    const replayResult = applyRetryBlockedDispatchPlan(dispatchPlan, latestReplay);
    if (!replayResult.replay?.enabled) {
      throw new Error(
        `Cannot apply --retry-blocked for session ${replaySessionId}: ${replayResult.replay?.reason || 'unknown-reason'}`
      );
    }
    dispatchPlan = replayResult.dispatchPlan;
    retryReplay = {
      sessionId: replaySessionId,
      ...replayResult.replay,
    };
  }

  if (options.preflightMode === 'auto') {
    const planReadiness = await evaluatePlanEvidence({
      rootDir,
      planPath: options.planPath,
    });
    const ownershipReadiness = evaluateOwnershipEvidence({
      dispatchPlan,
      workItems: basePlan.workItems,
    });
    readiness = mergeReadinessVerdicts(planReadiness, ownershipReadiness);
  }

  if (options.executionMode === 'live' && readiness?.verdict === 'blocked' && !options.force) {
    const message = '[guard] refusing live execution: preflight readiness is blocked.';
    const suggestedCommands = readiness.nextActions || [];
    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      kind: 'guardrail.preflight-readiness',
      sessionId: options.sessionId || null,
      executionMode: 'live',
      message,
      ...basePlan,
      readiness,
      suggestedCommands,
      ...(dispatchPlan ? { dispatchPlan } : {}),
      ...(dispatchPreflight ? { dispatchPreflight } : {}),
      ...(releaseGuardedEffectiveDispatchPolicy ? { effectiveDispatchPolicy: releaseGuardedEffectiveDispatchPolicy } : {}),
    };
    if (options.format === 'json') {
      io.log(JSON.stringify(report, null, 2));
      return { exitCode: 1, report };
    }
    writeWarning(io, `${message} ${readiness.blockedReasons.join(', ') || 'unknown reason'}`);
    return { exitCode: 1, report };
  }

  if (options.executionMode === 'live' && readiness?.verdict === 'blocked' && options.force) {
    writeWarning(io, `[warn] live preflight readiness override (--force): ${readiness.blockedReasons.join(', ')}`);
  }

  const dispatchRunStartedAt = Date.now();
  const dispatchRuntime = options.executionMode !== 'none'
    ? resolveDispatchRuntime({ executionMode: options.executionMode, runtimeId }, dispatchRuntimeRegistry)
    : null;
  const executorCapabilityManifest = dispatchPlan
    ? buildExecutorCapabilityManifest({
      dispatchPlan,
      executionMode: options.executionMode,
      runtimeId: dispatchRuntime?.id || '',
    })
    : null;
  const capabilityGuardResult = handleUnknownCapabilityGuard({
    options,
    env,
    io,
    dispatchRuntime,
    executorCapabilityManifest,
    previewBuilder: (candidate) => planOrchestrate(candidate).preview,
    writeWarning,
  });
  if (capabilityGuardResult) return capabilityGuardResult;

  const rawDispatchRun = dispatchRuntime
    ? await dispatchRuntime.execute({
      plan: dagPlan,
      dispatchPlan,
      dispatchPolicy: effectiveDispatchPolicy,
      io,
      env,
      rootDir,
    })
    : null;
  const dispatchRun = dispatchRuntime && rawDispatchRun
    ? normalizeDispatchRuntimeResult(rawDispatchRun, dispatchRuntime, options.executionMode)
    : null;

  const report = await buildPostDispatchReport({
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
    dispatchRunStartedAt,
  });

  if (options.format === 'json') {
    io.log(JSON.stringify(report, null, 2));
    return { exitCode: 0, report };
  }

  io.log(renderOrchestrationReport(report));
  return { exitCode: 0, report };
}
