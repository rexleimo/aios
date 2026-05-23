import { DISPATCH_HINDSIGHT_FAILURE_ACTIONS, FAILURE_CATEGORY_ACTIONS } from './actions.mjs';
import { createRecommendation, finalizeRecommendations } from './factories.mjs';
import { buildHindsightDraftRecommendations } from './hindsight-drafts.mjs';
import {
  buildOrchestrateCommand,
  buildPromotionContext,
  getDispatchReplayCommand,
  getDoctorCommand,
  getQualityGateFixCommand,
  getQualityGatePromoteCommand,
  getVerificationCommand,
  inferPromotionBlueprint,
} from './shared.mjs';

export function buildRecommendations(summary) {
  const recommendations = [];

  if (summary.sample.analyzedCheckpoints === 0) {
    recommendations.push(createRecommendation({
      kind: 'observe',
      targetType: 'sample',
      targetId: 'sample.no-checkpoints',
      title: 'no checkpoints yet',
      reason: 'There are no checkpoints to evaluate for this session.',
      evidence: 'analyzed=0',
      priority: 50,
    }));
    return finalizeRecommendations(recommendations);
  }

  if (summary.sample.telemetryCheckpoints === 0) {
    recommendations.push(createRecommendation({
      kind: 'observe',
      targetType: 'sample',
      targetId: 'sample.telemetry-missing',
      title: 'telemetry missing',
      reason: 'Recent checkpoints have no structured telemetry yet.',
      evidence: `checkpoints=${summary.sample.analyzedCheckpoints} telemetry=0`,
      priority: 40,
    }));
    return finalizeRecommendations(recommendations);
  }

  if (summary.sample.telemetryCheckpoints < 3) {
    recommendations.push(createRecommendation({
      kind: 'observe',
      targetType: 'sample',
      targetId: 'sample.insufficient-sample',
      title: 'insufficient sample',
      reason: 'Keep collecting telemetry before promoting this workflow.',
      evidence: `telemetry=${summary.sample.telemetryCheckpoints}`,
      priority: 30,
    }));
  }

  if (summary.signals.verification.knownCount === 0 || summary.signals.verification.unknownRate >= 0.5) {
    recommendations.push(createRecommendation({
      kind: 'fix',
      targetType: 'gate',
      targetId: 'gate.verification-results',
      title: 'wire real verification results',
      reason: 'Most checkpoints are still unknown, so learn-eval cannot trust the outcome signal yet.',
      evidence: `unknown=${summary.signals.verification.counts.unknown}/${summary.sample.analyzedCheckpoints}`,
      nextCommand: getVerificationCommand(),
      priority: 50,
    }));
  }

  const dominantFailure = summary.signals.failures.top[0];
  if (dominantFailure && (summary.signals.verification.counts.failed > 0 || summary.status.counts.blocked > 0)) {
    if (dominantFailure.category === 'merge-gate-blocked') {
      recommendations.push(createRecommendation({
        kind: 'fix',
        targetType: 'runbook',
        targetId: 'runbook.dispatch-merge-triage',
        title: 'dispatch merge triage runbook',
        reason: 'Dry-run orchestration is blocking at the merge gate; resolve ownership or blocked handoff issues before enabling a real runtime.',
        evidence: `${dominantFailure.category}=${dominantFailure.count} blockedRuns=${summary.signals.dispatch.blockedRuns} blockedJobs=${summary.signals.dispatch.blockedJobs}`,
        nextCommand: getDispatchReplayCommand(summary.session.sessionId),
        nextArtifact: summary.signals.dispatch.latestArtifactPath || undefined,
        priority: 45,
      }));
    } else {
      const action = FAILURE_CATEGORY_ACTIONS[dominantFailure.category] ?? FAILURE_CATEGORY_ACTIONS.default;
      recommendations.push(createRecommendation({
        kind: 'fix',
        targetType: action.targetType,
        targetId: action.targetId,
        title: action.title,
        reason: action.reason,
        evidence: `${dominantFailure.category}=${dominantFailure.count}`,
        nextCommand: action.nextCommand,
        priority: action.priority,
      }));
    }
  } else if (summary.status.counts.blocked > 0) {
    recommendations.push(createRecommendation({
      kind: 'fix',
      targetType: 'gate',
      targetId: 'gate.blocked-triage',
      title: 'blocked-path triage gate',
      reason: 'Blocked checkpoints exist without a clear dominant failure category; add a preflight gate or runbook.',
      evidence: `blocked=${summary.status.counts.blocked}`,
      nextCommand: getQualityGateFixCommand(),
      priority: 30,
    }));
  }

  if (summary.signals.retry.average >= 2 || summary.signals.retry.max >= 3) {
    recommendations.push(createRecommendation({
      kind: 'fix',
      targetType: 'runbook',
      targetId: 'runbook.retry-budget-policy',
      title: 'retry budget policy',
      reason: 'Retries are trending high; add retry limits and a standard escalation path.',
      evidence: `avg=${summary.signals.retry.average} max=${summary.signals.retry.max}`,
      nextCommand: getDoctorCommand(),
      priority: 20,
    }));
  }

  const dispatchHindsight = summary.signals.dispatch.hindsight && typeof summary.signals.dispatch.hindsight === 'object'
    ? summary.signals.dispatch.hindsight
    : null;
  const dispatchHindsightPairs = Number.isFinite(dispatchHindsight?.pairsAnalyzed)
    ? Math.max(0, Math.floor(dispatchHindsight.pairsAnalyzed))
    : 0;
  const dispatchHindsightRegressions = Number.isFinite(dispatchHindsight?.regressions)
    ? Math.max(0, Math.floor(dispatchHindsight.regressions))
    : 0;
  const dispatchHindsightRepeatBlocked = Number.isFinite(dispatchHindsight?.repeatedBlockedTurns)
    ? Math.max(0, Math.floor(dispatchHindsight.repeatedBlockedTurns))
    : 0;

  if (dispatchHindsightPairs > 0 && (dispatchHindsightRegressions > 0 || dispatchHindsightRepeatBlocked > 0)) {
    const topRepeatedFailure = Array.isArray(dispatchHindsight?.topRepeatedFailureClasses)
      ? dispatchHindsight.topRepeatedFailureClasses[0]
      : null;
    const topFailureClass = String(topRepeatedFailure?.failureClass || '').trim() || '';
    const action = (dispatchHindsightRepeatBlocked > 0 && topFailureClass && DISPATCH_HINDSIGHT_FAILURE_ACTIONS[topFailureClass])
      ? DISPATCH_HINDSIGHT_FAILURE_ACTIONS[topFailureClass]
      : DISPATCH_HINDSIGHT_FAILURE_ACTIONS.default;
    const alreadyRecommended = recommendations.some((item) => item.kind === 'fix' && item.targetId === action.targetId);
    if (!alreadyRecommended) {
      const evidenceParts = [];
      evidenceParts.push(`pairs=${dispatchHindsightPairs}`);
      if (dispatchHindsightRepeatBlocked > 0) evidenceParts.push(`repeatBlocked=${dispatchHindsightRepeatBlocked}`);
      if (dispatchHindsightRegressions > 0) evidenceParts.push(`regressions=${dispatchHindsightRegressions}`);
      if (topFailureClass) evidenceParts.push(`topFailure=${topFailureClass}`);

      recommendations.push(createRecommendation({
        kind: 'fix',
        targetType: action.targetType,
        targetId: action.targetId,
        reason: action.reason,
        evidence: evidenceParts.join(' '),
        ...(action.targetType === 'runbook'
          ? { nextCommand: getDispatchReplayCommand(summary.session.sessionId) }
          : {}),
        nextArtifact: summary.signals.dispatch.latestArtifactPath || undefined,
        priority: action.priority,
      }));
    }
  }

  recommendations.push(...buildHindsightDraftRecommendations(summary, recommendations));

  if (
    summary.sample.telemetryCheckpoints >= 3
    && summary.signals.verification.knownCount >= 3
    && summary.signals.verification.passRate >= 0.8
    && summary.signals.verification.counts.failed === 0
    && summary.signals.verification.counts.partial === 0
    && summary.status.counts.blocked === 0
    && summary.signals.dispatch.blockedRuns === 0
    && summary.signals.retry.average <= 1
    && dispatchHindsightRegressions === 0
    && dispatchHindsightRepeatBlocked === 0
  ) {
    const blueprint = inferPromotionBlueprint(summary);
    recommendations.push(createRecommendation({
      kind: 'promote',
      targetType: 'blueprint',
      targetId: `blueprint.${blueprint}`,
      title: 'promote workflow blueprint',
      reason: 'This flow is stable enough to capture as a reusable subagent blueprint.',
      evidence: `passRate=${summary.signals.verification.passRate} retries=${summary.signals.retry.average}`,
      nextCommand: buildOrchestrateCommand(blueprint, summary.session.goal, buildPromotionContext(summary, blueprint)),
      priority: 20,
    }));
    recommendations.push(createRecommendation({
      kind: 'promote',
      targetType: 'checklist',
      targetId: 'checklist.verification-standard',
      title: 'promote verification checklist',
      reason: 'Verification is consistent enough to standardize into a reusable quality gate checklist.',
      evidence: `known=${summary.signals.verification.knownCount} passed=${summary.signals.verification.counts.passed}`,
      nextCommand: getQualityGatePromoteCommand(),
      priority: 10,
    }));
  }

  if (summary.signals.dispatch.runs > 0 && summary.signals.dispatch.blockedRuns === 0) {
    recommendations.push(createRecommendation({
      kind: 'observe',
      targetType: 'sample',
      targetId: 'sample.dispatch-evidence-present',
      title: 'dispatch evidence present',
      reason: 'Dry-run orchestration evidence is flowing into ContextDB; keep collecting runs before enabling a real runtime.',
      evidence: `runs=${summary.signals.dispatch.runs} executors=${summary.signals.dispatch.executorUsage.map((item) => `${item.executor}=${item.count}`).join(',') || 'none'}`,
      nextArtifact: summary.signals.dispatch.latestArtifactPath || undefined,
      priority: 15,
    }));
  }

  if (summary.signals.elapsed.average >= 120000 && summary.sample.telemetryCheckpoints >= 3) {
    recommendations.push(createRecommendation({
      kind: 'observe',
      targetType: 'sample',
      targetId: 'sample.latency-watch',
      title: 'slow-path watch',
      reason: 'The workflow is succeeding but remains slow; keep tracking elapsed time before tightening budgets.',
      evidence: `avgElapsedMs=${summary.signals.elapsed.average}`,
      priority: 20,
    }));
  }

  if (recommendations.length === 0) {
    recommendations.push(createRecommendation({
      kind: 'observe',
      targetType: 'sample',
      targetId: 'sample.no-strong-signal',
      title: 'no strong signal yet',
      reason: 'Current telemetry does not yet justify promotion or corrective action.',
      evidence: `telemetry=${summary.sample.telemetryCheckpoints}`,
      priority: 10,
    }));
  }

  return finalizeRecommendations(recommendations);
}
