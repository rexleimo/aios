import { normalizeDispatchPlan, normalizeDispatchPolicy, normalizeDispatchPreflight } from './normalizers.mjs';

export function buildRequiredActions(recommendations = []) {
  const seen = new Set();
  const actions = [];

  for (const item of recommendations) {
    if (item?.nextCommand) {
      const key = `command:${item.nextCommand}`;
      if (!seen.has(key)) {
        seen.add(key);
        actions.push({ type: 'command', action: item.nextCommand, sourceId: item.targetId || null });
      }
    }

    if (item?.nextArtifact) {
      const key = `artifact:${item.nextArtifact}`;
      if (!seen.has(key)) {
        seen.add(key);
        actions.push({ type: 'artifact', action: item.nextArtifact, sourceId: item.targetId || null });
      }
    }
  }

  return actions;
}

export function buildExecutorPreferences(dispatchPlan, dispatchSignals = {}, dispatchRun = null) {
  const normalizedPlan = normalizeDispatchPlan(dispatchPlan);
  if (!normalizedPlan) {
    return [];
  }

  const counts = new Map(
    (Array.isArray(dispatchSignals.executorUsage) ? dispatchSignals.executorUsage : [])
      .map((item) => [String(item.executor || '').trim(), Number(item.count) || 0])
      .filter(([executor]) => executor)
  );

  for (const jobRun of Array.isArray(dispatchRun?.jobRuns) ? dispatchRun.jobRuns : []) {
    const executor = String(jobRun?.executor || '').trim();
    if (!executor) continue;
    counts.set(executor, (counts.get(executor) || 0) + 1);
  }

  const executorIds = normalizedPlan.executorDetails.length > 0
    ? normalizedPlan.executorDetails.map((item) => item.id)
    : normalizedPlan.executorRegistry;

  return executorIds
    .map((executor) => {
      const observedCount = counts.get(executor) || 0;
      return {
        executor,
        confidence: observedCount > 0 ? 'observed' : 'planned',
        observedCount,
        source: observedCount > 0 ? 'dispatch-evidence' : 'dispatch-plan',
      };
    })
    .sort((left, right) => right.observedCount - left.observedCount || left.executor.localeCompare(right.executor));
}

export function buildEffectiveDispatchPolicy({ dispatchPolicy = null, dispatchPreflight = null, learnEvalReport = null } = {}) {
  const rawPolicy = normalizeDispatchPolicy(dispatchPolicy);
  if (!rawPolicy) {
    return null;
  }

  const preflight = normalizeDispatchPreflight(dispatchPreflight);
  if (!preflight || preflight.results.length === 0) {
    return rawPolicy;
  }

  const passedIds = new Set(
    preflight.results
      .filter((item) => item.status === 'passed' && item.sourceId)
      .map((item) => item.sourceId)
  );
  const failedIds = new Set(
    preflight.results
      .filter((item) => item.status === 'failed' && item.sourceId)
      .map((item) => item.sourceId)
  );
  const skippedIds = new Set(
    preflight.results
      .filter((item) => item.status === 'skipped' && item.sourceId)
      .map((item) => item.sourceId)
  );
  const unresolvedBlockers = rawPolicy.blockerIds.filter((item) => !passedIds.has(item));
  const resolvedBlockers = rawPolicy.blockerIds.filter((item) => passedIds.has(item));
  const unresolvedActions = rawPolicy.requiredActions.filter((item) => !item.sourceId || unresolvedBlockers.includes(item.sourceId));

  let status = 'caution';
  if (unresolvedBlockers.length > 0) {
    status = 'blocked';
  } else if ((Number(learnEvalReport?.signals?.dispatch?.runs) || 0) > 0) {
    status = 'ready';
  }

  const notes = [...rawPolicy.notes];
  if (resolvedBlockers.length > 0) {
    notes.push(`Preflight resolved blockers: ${resolvedBlockers.join(', ')}.`);
  }
  if (failedIds.size > 0) {
    notes.push(`Preflight still failing: ${[...failedIds].join(', ')}.`);
  }
  if (skippedIds.size > 0) {
    notes.push(`Preflight skipped: ${[...skippedIds].join(', ')}.`);
  }

  return normalizeDispatchPolicy({
    ...rawPolicy,
    status,
    parallelism: unresolvedBlockers.includes('runbook.dispatch-merge-triage') ? 'serial-only' : 'parallel-with-merge-gate',
    blockerIds: unresolvedBlockers,
    requiredActions: unresolvedActions,
    notes,
  });
}

export function buildDispatchPolicy({ learnEvalReport = null, learnEvalOverlay = null, dispatchPlan = null, dispatchRun = null } = {}) {
  if (!learnEvalReport && !learnEvalOverlay && !dispatchPlan && !dispatchRun) {
    return null;
  }

  const recommendations = Array.isArray(learnEvalOverlay?.appliedRecommendations)
    ? learnEvalOverlay.appliedRecommendations
    : Array.isArray(learnEvalReport?.recommendations?.all)
      ? learnEvalReport.recommendations.all
      : [];
  const fixRecommendations = recommendations.filter((item) => item?.kind === 'fix');
  const observeRecommendations = recommendations.filter((item) => item?.kind === 'observe');
  const dispatchSignals = learnEvalReport?.signals?.dispatch || {};
  const currentBlockedJobs = Array.isArray(dispatchRun?.jobRuns)
    ? dispatchRun.jobRuns.filter((item) => item?.status === 'blocked').length
    : 0;
  const blockedMergePath = fixRecommendations.some((item) => item?.targetId === 'runbook.dispatch-merge-triage')
    || (Number(dispatchSignals.blockedRuns) || 0) > 0
    || (Number(dispatchSignals.blockedJobs) || 0) > 0
    || currentBlockedJobs > 0;
  const sessionId = String(learnEvalReport?.session?.sessionId || learnEvalOverlay?.sourceSessionId || '').trim();
  const policyFixRecommendations = [...fixRecommendations];
  const dispatchRuntimeUnavailable = dispatchRun?.ok === false && !blockedMergePath;

  if (blockedMergePath && !policyFixRecommendations.some((item) => item?.targetId === 'runbook.dispatch-merge-triage')) {
    policyFixRecommendations.push({
      kind: 'fix',
      targetId: 'runbook.dispatch-merge-triage',
      nextCommand: sessionId
        ? `node scripts/aios.mjs orchestrate --session ${sessionId} --dispatch local --execute dry-run --format json`
        : 'node scripts/aios.mjs doctor',
      nextArtifact: dispatchSignals.latestArtifactPath || undefined,
    });
  }

  if (dispatchRuntimeUnavailable && !policyFixRecommendations.some((item) => item?.targetId === 'runbook.dispatch-runtime-unavailable')) {
    policyFixRecommendations.push({
      kind: 'fix',
      targetId: 'runbook.dispatch-runtime-unavailable',
      nextCommand: sessionId
        ? `node scripts/aios.mjs orchestrate --session ${sessionId} --dispatch local --execute dry-run --format json`
        : 'node scripts/aios.mjs orchestrate --dispatch local --execute dry-run --format json',
    });
  }

  let status = 'caution';
  if (policyFixRecommendations.length > 0) {
    status = 'blocked';
  } else if ((Number(dispatchSignals.runs) || 0) > 0 || Array.isArray(dispatchRun?.jobRuns)) {
    status = 'ready';
  }

  const notes = [];
  if (policyFixRecommendations.length > 0) {
    notes.push(`Blocked by ${policyFixRecommendations.length} fix recommendation${policyFixRecommendations.length === 1 ? '' : 's'}.`);
  } else if ((Number(dispatchSignals.runs) || 0) > 0 || Array.isArray(dispatchRun?.jobRuns)) {
    notes.push('Observed dispatch evidence is available for the current executor path.');
  } else {
    notes.push('No observed dispatch evidence yet; keep dispatch in caution mode.');
  }

  if (blockedMergePath) {
    notes.push('Observed merge-gate blockage suggests serial triage before parallel execution.');
  }
  if (dispatchRuntimeUnavailable) {
    notes.push(`Dispatch runtime execution is blocked: ${String(dispatchRun?.error || '').trim() || 'runtime returned ok=false'}.`);
  }

  return normalizeDispatchPolicy({
    status,
    parallelism: blockedMergePath ? 'serial-only' : 'parallel-with-merge-gate',
    blockerIds: policyFixRecommendations.map((item) => item.targetId),
    advisoryIds: observeRecommendations.map((item) => item.targetId),
    requiredActions: buildRequiredActions([...policyFixRecommendations, ...recommendations.filter((item) => item?.kind !== 'fix')]),
    executorPreferences: buildExecutorPreferences(dispatchPlan, dispatchSignals, dispatchRun),
    notes,
  });
}
