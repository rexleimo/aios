import {
  normalizeCounter,
  normalizeQualityOutcome,
  normalizeText,
} from './shared.mjs';

// 纯函数：把历史记录汇总成可展示的统计摘要，避免 history 命令在主流程里手写大量聚合逻辑。
export function summarizeHistory(records = []) {
  const total = Array.isArray(records) ? records.length : 0;
  let dispatchBlocked = 0;
  let hindsightUnstable = 0;
  const topFailureCounts = new Map();
  const topQualityFailureCounts = new Map();
  const fixHintCounts = new Map();
  const topJobCounts = new Map();
  const topSkillCandidateCounts = new Map();
  const topInsightSignalCounts = new Map();

  for (const record of Array.isArray(records) ? records : []) {
    const dispatch = record?.dispatch && typeof record.dispatch === 'object' ? record.dispatch : null;
    if (dispatch && dispatch.ok === false) {
      dispatchBlocked += 1;
    }

    const hindsight = record?.dispatchHindsight && typeof record.dispatchHindsight === 'object'
      ? record.dispatchHindsight
      : null;
    const pairs = normalizeCounter(hindsight?.pairsAnalyzed);
    const repeatBlocked = normalizeCounter(hindsight?.repeatedBlockedTurns);
    const regressions = normalizeCounter(hindsight?.regressions);
    if (pairs > 0 && (repeatBlocked > 0 || regressions > 0)) {
      hindsightUnstable += 1;
    }

    const topFailure = normalizeText(hindsight?.topFailureClass);
    if (topFailure) {
      topFailureCounts.set(topFailure, (topFailureCounts.get(topFailure) || 0) + 1);
    }

    const topJob = normalizeText(hindsight?.topRepeatedJobId);
    if (topJob) {
      topJobCounts.set(topJob, (topJobCounts.get(topJob) || 0) + 1);
    }

    const fixHint = record?.dispatchFixHint && typeof record.dispatchFixHint === 'object'
      ? record.dispatchFixHint
      : null;
    const fixHintId = normalizeText(fixHint?.targetId);
    if (fixHintId) {
      fixHintCounts.set(fixHintId, (fixHintCounts.get(fixHintId) || 0) + 1);
    }

    const skillCandidate = record?.skillCandidate && typeof record.skillCandidate === 'object'
      ? record.skillCandidate
      : null;
    const skillId = normalizeText(skillCandidate?.skillId);
    if (skillId) {
      const failureClass = normalizeText(skillCandidate?.failureClass);
      const scope = normalizeText(skillCandidate?.scope);
      const key = `${skillId}::${failureClass || scope || ''}`;
      const existing = topSkillCandidateCounts.get(key) || {
        skillId,
        failureClass: failureClass || null,
        scope: scope || null,
        count: 0,
      };
      existing.count += 1;
      topSkillCandidateCounts.set(key, existing);
    }

    const dispatchInsights = record?.dispatchInsights && typeof record.dispatchInsights === 'object'
      ? record.dispatchInsights
      : null;
    const topInsightSignalId = normalizeText(dispatchInsights?.topSignalId);
    if (topInsightSignalId) {
      topInsightSignalCounts.set(topInsightSignalId, (topInsightSignalCounts.get(topInsightSignalId) || 0) + 1);
    }

    const qualityGate = record?.qualityGate && typeof record.qualityGate === 'object'
      ? record.qualityGate
      : null;
    const qualityOutcome = normalizeQualityOutcome(qualityGate?.outcome);
    const qualityCategory = normalizeText(qualityGate?.failureCategory);
    if (qualityOutcome === 'failed' && qualityCategory) {
      topQualityFailureCounts.set(qualityCategory, (topQualityFailureCounts.get(qualityCategory) || 0) + 1);
    }
  }

  const topFailures = Array.from(topFailureCounts.entries())
    .map(([failureClass, count]) => ({ failureClass, count }))
    .sort((left, right) => right.count - left.count || left.failureClass.localeCompare(right.failureClass))
    .slice(0, 5);
  const topFixHints = Array.from(fixHintCounts.entries())
    .map(([targetId, count]) => ({ targetId, count }))
    .sort((left, right) => right.count - left.count || left.targetId.localeCompare(right.targetId))
    .slice(0, 5);
  const topJobs = Array.from(topJobCounts.entries())
    .map(([jobId, count]) => ({ jobId, count }))
    .sort((left, right) => right.count - left.count || left.jobId.localeCompare(right.jobId))
    .slice(0, 5);
  const topQualityFailures = Array.from(topQualityFailureCounts.entries())
    .map(([failureCategory, count]) => ({ failureCategory, count }))
    .sort((left, right) => right.count - left.count || left.failureCategory.localeCompare(right.failureCategory))
    .slice(0, 5);
  const topSkillCandidates = Array.from(topSkillCandidateCounts.values())
    .sort((left, right) => right.count - left.count
      || left.skillId.localeCompare(right.skillId)
      || String(left.failureClass || left.scope || '').localeCompare(String(right.failureClass || right.scope || '')))
    .slice(0, 5);
  const topInsightSignals = Array.from(topInsightSignalCounts.entries())
    .map(([signalId, count]) => ({ signalId, count }))
    .sort((left, right) => right.count - left.count || left.signalId.localeCompare(right.signalId))
    .slice(0, 5);

  return {
    total,
    dispatchBlocked,
    hindsightUnstable,
    topFailures,
    topQualityFailures,
    topFixHints,
    topJobs,
    topSkillCandidates,
    topInsightSignals,
  };
}
