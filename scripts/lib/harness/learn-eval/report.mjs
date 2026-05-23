import { RECOMMENDATION_KIND_ORDER, RECOMMENDATION_SECTION_LABELS } from './recommendations.mjs';

function formatNumber(value, digits = 1) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

// 纯函数：把成本对象渲染为稳定文本，避免 CLI 报告和评估逻辑互相耦合。
function formatCost(cost) {
  const parts = [];
  if (cost.inputTokens > 0) parts.push(`inputTokens=${cost.inputTokens}`);
  if (cost.outputTokens > 0) parts.push(`outputTokens=${cost.outputTokens}`);
  if (cost.totalTokens > 0) parts.push(`totalTokens=${cost.totalTokens}`);
  if (cost.usd > 0) parts.push(`usd=${formatNumber(cost.usd, 3)}`);
  return parts.length > 0 ? parts.join(' ') : '(none)';
}


// 纯函数：把推荐列表渲染为 CLI 文本段，主流程只负责提供结构化 report。
function formatRecommendations(items) {
  return items.length > 0
    ? items.map((item) => {
      const nextSteps = [];
      if (item.nextCommand) nextSteps.push(`Next: ${item.nextCommand}`);
      if (item.nextArtifact) nextSteps.push(`Artifact: ${item.nextArtifact}`);
      const suffix = nextSteps.length > 0 ? ` ${nextSteps.join(' ')}` : '';
      return `- [${item.targetId}] ${item.title}: ${item.reason} (${item.evidence})${suffix}`;
    }).join('\n')
    : '- (none)';
}


export function renderLearnEvalReport(report) {
  const failureSummary = report.signals.failures.top.length > 0
    ? report.signals.failures.top.map((item) => `${item.category}=${item.count}`).join(', ')
    : '(none)';
  const dispatchExecutors = report.signals.dispatch.executorUsage.length > 0
    ? report.signals.dispatch.executorUsage.map((item) => `${item.executor}=${item.count}`).join(', ')
    : '(none)';
  const dispatchHindsight = report.signals.dispatch.hindsight && typeof report.signals.dispatch.hindsight === 'object'
    ? report.signals.dispatch.hindsight
    : null;
  const dispatchHindsightTopFailures = dispatchHindsight && Array.isArray(dispatchHindsight.topRepeatedFailureClasses) && dispatchHindsight.topRepeatedFailureClasses.length > 0
    ? dispatchHindsight.topRepeatedFailureClasses.map((item) => `${item.failureClass}=${item.count}`).join(', ')
    : '(none)';
  const dispatchHindsightLessons = dispatchHindsight && Array.isArray(dispatchHindsight.lessons)
    ? dispatchHindsight.lessons.slice(0, 3)
    : [];
  const dispatchHindsightLessonLines = dispatchHindsightLessons.map((lesson) => {
    const kind = String(lesson?.kind || '').trim() || 'unknown';
    const jobId = String(lesson?.jobId || '').trim() || 'unknown';
    const failureClass = String(lesson?.from?.failureClass || '').trim() || 'unknown';
    const workItems = Array.isArray(lesson?.workItemRefs) && lesson.workItemRefs.length > 0
      ? lesson.workItemRefs.join(',')
      : 'none';
    const hint = String(lesson?.hint || '').trim() || '(none)';
    return `- dispatch hindsight ${kind} jobId=${jobId} failure=${failureClass} wi=${workItems} hint=${hint}`;
  });
  const shouldRenderDispatchHindsight = dispatchHindsight
    && ((Number.isFinite(dispatchHindsight.pairsAnalyzed) ? dispatchHindsight.pairsAnalyzed : 0) > 0
      || dispatchHindsightLessonLines.length > 0);
  const dispatchWorkItems = report.signals.dispatch.workItems || {
    total: 0,
    blocked: 0,
    done: 0,
    blockedRate: 0,
    byType: [],
    failureClasses: [],
    retryClasses: [],
  };
  const dispatchWorkItemsByType = Array.isArray(dispatchWorkItems.byType) && dispatchWorkItems.byType.length > 0
    ? dispatchWorkItems.byType.map((item) => `${item.itemType}=${item.blocked}/${item.total}(${item.blockedRate})`).join(', ')
    : '(none)';
  const dispatchWorkItemFailures = Array.isArray(dispatchWorkItems.failureClasses) && dispatchWorkItems.failureClasses.length > 0
    ? dispatchWorkItems.failureClasses.map((item) => `${item.failureClass}=${item.count}`).join(', ')
    : '(none)';
  const dispatchWorkItemRetries = Array.isArray(dispatchWorkItems.retryClasses) && dispatchWorkItems.retryClasses.length > 0
    ? dispatchWorkItems.retryClasses.map((item) => `${item.retryClass}=${item.count}`).join(', ')
    : '(none)';

  const sections = RECOMMENDATION_KIND_ORDER.flatMap((kind) => [
    `${RECOMMENDATION_SECTION_LABELS[kind]}:`,
    formatRecommendations(report.recommendations[kind] || []),
    '',
  ]);

  return [
    'AIOS LEARN-EVAL',
    '---------------',
    `Session: ${report.session.sessionId}`,
    `Agent: ${report.session.agent}`,
    `Project: ${report.session.project}`,
    `Goal: ${report.session.goal}`,
    `Updated: ${report.session.updatedAt}`,
    '',
    'Sample:',
    `- analyzed=${report.sample.analyzedCheckpoints} total=${report.sample.totalCheckpoints} telemetry=${report.sample.telemetryCheckpoints} limit=${report.sample.limit}`,
    '',
    'Signals:',
    `- status running=${report.status.counts.running} blocked=${report.status.counts.blocked} done=${report.status.counts.done}`,
    `- verification passed=${report.signals.verification.counts.passed} failed=${report.signals.verification.counts.failed} partial=${report.signals.verification.counts.partial} unknown=${report.signals.verification.counts.unknown}`,
    `- passRate=${report.signals.verification.passRate} unknownRate=${report.signals.verification.unknownRate}`,
    `- retries avg=${report.signals.retry.average} total=${report.signals.retry.total} max=${report.signals.retry.max}`,
    `- elapsed avgMs=${report.signals.elapsed.average} maxMs=${report.signals.elapsed.max}`,
    `- failures ${failureSummary}`,
    `- cost ${formatCost(report.signals.cost)}`,
    `- dispatch runs=${report.signals.dispatch.runs} ok=${report.signals.dispatch.successfulRuns} blocked=${report.signals.dispatch.blockedRuns} blockedJobs=${report.signals.dispatch.blockedJobs} executors=${dispatchExecutors}`,
    `- dispatch workItems total=${dispatchWorkItems.total} blocked=${dispatchWorkItems.blocked} done=${dispatchWorkItems.done} blockedRate=${dispatchWorkItems.blockedRate} byType=${dispatchWorkItemsByType}`,
    `- dispatch workItemFailures ${dispatchWorkItemFailures}`,
    `- dispatch workItemRetries ${dispatchWorkItemRetries}`,
    ...(shouldRenderDispatchHindsight ? [
      `- dispatch hindsight pairs=${dispatchHindsight.pairsAnalyzed} comparedJobs=${dispatchHindsight.comparedJobs} resolved=${dispatchHindsight.resolvedBlockedTurns} repeatBlocked=${dispatchHindsight.repeatedBlockedTurns} regressions=${dispatchHindsight.regressions} lessons=${Array.isArray(dispatchHindsight.lessons) ? dispatchHindsight.lessons.length : 0}`,
      `- dispatch hindsight topRepeatedFailureClasses ${dispatchHindsightTopFailures}`,
      ...dispatchHindsightLessonLines,
    ] : []),
    ...(report.signals.dispatch.latestArtifactPath ? [`- dispatch latestArtifact=${report.signals.dispatch.latestArtifactPath}`] : []),
    '',
    ...sections,
  ].join('\n');
}
