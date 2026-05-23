import { buildHindsightEval } from './hindsight-eval.mjs';
import { buildRecommendations } from './learn-eval/recommendations.mjs';
import {
  SESSION_STATUS_NAMES,
  VERIFICATION_RESULT_NAMES,
  collectDispatchEvidence,
  createCountRecord,
  findLatestSessionMeta,
  formatNumber,
  getSessionsRoot,
  loadSessionArtifacts,
  normalizeFailureCategory,
  normalizeWorkItemStatus,
  safeAverage,
} from './learn-eval/io.mjs';
export { renderLearnEvalReport } from './learn-eval/report.mjs';

export async function buildLearnEvalReport(rawOptions = {}, { rootDir } = {}) {
  const sessionMeta = rawOptions.sessionId
    ? { sessionId: rawOptions.sessionId }
    : await findLatestSessionMeta(rootDir);

  if (!sessionMeta?.sessionId) {
    throw new Error(`No ContextDB sessions found under ${getSessionsRoot(rootDir)}`);
  }

  const { meta, checkpoints, events } = await loadSessionArtifacts(rootDir, sessionMeta.sessionId);
  const limit = Number.isFinite(rawOptions.limit) ? Math.max(1, Math.floor(rawOptions.limit)) : 10;
  const selected = checkpoints.slice(Math.max(0, checkpoints.length - limit));
  const dispatchEvidenceResult = await collectDispatchEvidence(rootDir, sessionMeta.sessionId, selected, events);
  const dispatchEvidence = Array.isArray(dispatchEvidenceResult?.records) ? dispatchEvidenceResult.records : [];
  const dispatchHindsight = await buildHindsightEval({
    rootDir,
    meta,
    dispatchEvidence,
    artifactCache: dispatchEvidenceResult?.artifactCache,
  });

  const statusCounts = createCountRecord(SESSION_STATUS_NAMES);
  const verificationCounts = createCountRecord(VERIFICATION_RESULT_NAMES);
  const failureCounts = new Map();
  const cost = {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    usd: 0,
  };

  let telemetryCheckpoints = 0;
  let knownVerificationCount = 0;
  let retryTotal = 0;
  let retryMax = 0;
  let elapsedTotal = 0;
  let elapsedCount = 0;
  let elapsedMax = 0;

  for (const checkpoint of selected) {
    const status = SESSION_STATUS_NAMES.includes(checkpoint.status) ? checkpoint.status : 'running';
    statusCounts[status] += 1;

    const telemetry = checkpoint.telemetry;
    const verificationResult = VERIFICATION_RESULT_NAMES.includes(telemetry?.verification?.result)
      ? telemetry.verification.result
      : 'unknown';
    verificationCounts[verificationResult] += 1;

    if (!telemetry) {
      continue;
    }

    telemetryCheckpoints += 1;
    if (verificationResult !== 'unknown') {
      knownVerificationCount += 1;
    }

    const retryCount = Number.isFinite(telemetry.retryCount) ? Math.max(0, Math.floor(telemetry.retryCount)) : 0;
    retryTotal += retryCount;
    retryMax = Math.max(retryMax, retryCount);

    if (Number.isFinite(telemetry.elapsedMs) && telemetry.elapsedMs >= 0) {
      const elapsedMs = Math.floor(telemetry.elapsedMs);
      elapsedTotal += elapsedMs;
      elapsedCount += 1;
      elapsedMax = Math.max(elapsedMax, elapsedMs);
    }

    const failureCategory = normalizeFailureCategory(telemetry.failureCategory);
    if (failureCategory) {
      failureCounts.set(failureCategory, (failureCounts.get(failureCategory) ?? 0) + 1);
    }

    if (Number.isFinite(telemetry.cost?.inputTokens)) cost.inputTokens += Math.max(0, Math.floor(telemetry.cost.inputTokens));
    if (Number.isFinite(telemetry.cost?.outputTokens)) cost.outputTokens += Math.max(0, Math.floor(telemetry.cost.outputTokens));
    if (Number.isFinite(telemetry.cost?.totalTokens)) cost.totalTokens += Math.max(0, Math.floor(telemetry.cost.totalTokens));
    if (Number.isFinite(telemetry.cost?.usd)) cost.usd += Math.max(0, Number(telemetry.cost.usd));
  }

  if (cost.totalTokens === 0 && (cost.inputTokens > 0 || cost.outputTokens > 0)) {
    cost.totalTokens = cost.inputTokens + cost.outputTokens;
  }

  const failureTop = Array.from(failureCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));

  const verificationKnownDenominator = Math.max(knownVerificationCount, 1);
  const verificationSampleDenominator = Math.max(selected.length, 1);
  const dispatchExecutorCounts = new Map();
  const dispatchWorkItemTypeCounts = new Map();
  const dispatchWorkItemFailureCounts = new Map();
  const dispatchWorkItemRetryCounts = new Map();
  let dispatchBlockedJobs = 0;
  let dispatchWorkItemTotal = 0;
  let dispatchWorkItemBlocked = 0;
  let dispatchWorkItemDone = 0;

  for (const item of dispatchEvidence) {
    dispatchBlockedJobs += item.blockedJobs;
    for (const executor of item.executors) {
      dispatchExecutorCounts.set(executor, (dispatchExecutorCounts.get(executor) ?? 0) + 1);
    }

    const workItems = item.workItems && typeof item.workItems === 'object' ? item.workItems : {};
    dispatchWorkItemTotal += Number.isFinite(workItems.total) ? Math.max(0, Math.floor(workItems.total)) : 0;
    dispatchWorkItemBlocked += Number.isFinite(workItems.blocked) ? Math.max(0, Math.floor(workItems.blocked)) : 0;
    dispatchWorkItemDone += Number.isFinite(workItems.done) ? Math.max(0, Math.floor(workItems.done)) : 0;

    for (const typeRecord of Array.isArray(workItems.byType) ? workItems.byType : []) {
      const itemType = String(typeRecord?.itemType || '').trim();
      if (!itemType) continue;
      const existing = dispatchWorkItemTypeCounts.get(itemType) || { total: 0, blocked: 0 };
      existing.total += Number.isFinite(typeRecord?.total) ? Math.max(0, Math.floor(typeRecord.total)) : 0;
      existing.blocked += Number.isFinite(typeRecord?.blocked) ? Math.max(0, Math.floor(typeRecord.blocked)) : 0;
      dispatchWorkItemTypeCounts.set(itemType, existing);
    }

    for (const failureRecord of Array.isArray(workItems.failureCounts) ? workItems.failureCounts : []) {
      const failureClass = String(failureRecord?.failureClass || '').trim();
      if (!failureClass) continue;
      const count = Number.isFinite(failureRecord?.count) ? Math.max(0, Math.floor(failureRecord.count)) : 0;
      dispatchWorkItemFailureCounts.set(failureClass, (dispatchWorkItemFailureCounts.get(failureClass) || 0) + count);
    }

    for (const retryRecord of Array.isArray(workItems.retryCounts) ? workItems.retryCounts : []) {
      const retryClass = String(retryRecord?.retryClass || '').trim();
      if (!retryClass) continue;
      const count = Number.isFinite(retryRecord?.count) ? Math.max(0, Math.floor(retryRecord.count)) : 0;
      dispatchWorkItemRetryCounts.set(retryClass, (dispatchWorkItemRetryCounts.get(retryClass) || 0) + count);
    }
  }

  const dispatchWorkItemsByType = Array.from(dispatchWorkItemTypeCounts.entries())
    .map(([itemType, counts]) => ({
      itemType,
      total: counts.total,
      blocked: counts.blocked,
      blockedRate: formatNumber(counts.total > 0 ? counts.blocked / counts.total : 0, 2),
    }))
    .sort((left, right) => right.blockedRate - left.blockedRate || right.blocked - left.blocked || left.itemType.localeCompare(right.itemType));
  const dispatchWorkItemFailureTop = Array.from(dispatchWorkItemFailureCounts.entries())
    .map(([failureClass, count]) => ({ failureClass, count }))
    .sort((left, right) => right.count - left.count || left.failureClass.localeCompare(right.failureClass));
  const dispatchWorkItemRetrySummary = Array.from(dispatchWorkItemRetryCounts.entries())
    .map(([retryClass, count]) => ({ retryClass, count }))
    .sort((left, right) => right.count - left.count || left.retryClass.localeCompare(right.retryClass));

  const summary = {
    session: {
      sessionId: meta.sessionId,
      agent: meta.agent,
      project: meta.project,
      goal: meta.goal,
      updatedAt: meta.updatedAt,
    },
    sample: {
      totalCheckpoints: checkpoints.length,
      analyzedCheckpoints: selected.length,
      telemetryCheckpoints,
      limit,
    },
    status: {
      counts: statusCounts,
    },
    signals: {
      verification: {
        counts: verificationCounts,
        knownCount: knownVerificationCount,
        passRate: formatNumber(verificationCounts.passed / verificationKnownDenominator, 2),
        unknownRate: formatNumber(verificationCounts.unknown / verificationSampleDenominator, 2),
      },
      retry: {
        total: retryTotal,
        average: formatNumber(safeAverage(retryTotal, telemetryCheckpoints), 2),
        max: retryMax,
      },
      elapsed: {
        average: formatNumber(safeAverage(elapsedTotal, elapsedCount), 0),
        max: elapsedMax,
      },
      failures: {
        top: failureTop,
      },
      cost: {
        inputTokens: cost.inputTokens,
        outputTokens: cost.outputTokens,
        totalTokens: cost.totalTokens,
        usd: formatNumber(cost.usd, 4),
      },
      dispatch: {
        runs: dispatchEvidence.length,
        successfulRuns: dispatchEvidence.filter((item) => item.ok).length,
        blockedRuns: dispatchEvidence.filter((item) => item.ok === false).length,
        blockedJobs: dispatchBlockedJobs,
        hindsight: dispatchHindsight,
        executorUsage: Array.from(dispatchExecutorCounts.entries())
          .map(([executor, count]) => ({ executor, count }))
          .sort((left, right) => right.count - left.count || left.executor.localeCompare(right.executor)),
        workItems: {
          total: dispatchWorkItemTotal,
          blocked: dispatchWorkItemBlocked,
          done: dispatchWorkItemDone,
          blockedRate: formatNumber(dispatchWorkItemTotal > 0 ? dispatchWorkItemBlocked / dispatchWorkItemTotal : 0, 2),
          byType: dispatchWorkItemsByType,
          failureClasses: dispatchWorkItemFailureTop,
          retryClasses: dispatchWorkItemRetrySummary,
        },
        latestArtifactPath: dispatchEvidence[0]?.artifactPath || null,
        latestEventId: dispatchEvidence[0]?.eventId || null,
      },
    },
  };

  return {
    ...summary,
    recommendations: buildRecommendations(summary),
  };
}
