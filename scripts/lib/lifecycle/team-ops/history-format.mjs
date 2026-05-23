import {
  normalizeCounter,
  normalizeQualityOutcome,
  normalizeText,
} from './shared.mjs';

// 纯函数：把 history 记录格式化成单行，避免历史输出把展示、统计和映射逻辑揉在一起。
export function formatHistoryLine(record) {
  const updatedAt = normalizeText(record.updatedAt);
  const status = normalizeText(record.status);
  const sessionId = normalizeText(record.sessionId);
  const goal = normalizeText(record.goal);
  const dispatch = record.dispatch;
  const dispatchLabel = dispatch
    ? dispatch.ok === true
      ? `dispatch=ok jobs=${dispatch.jobCount}`
      : `dispatch=blocked blocked=${dispatch.blockedJobs} jobs=${dispatch.jobCount}`
    : 'dispatch=none';
  const qualityGate = record.qualityGate && typeof record.qualityGate === 'object'
    ? record.qualityGate
    : null;
  const qualityOutcome = normalizeQualityOutcome(qualityGate?.outcome);
  const qualityCategory = normalizeText(qualityGate?.failureCategory) || normalizeText(qualityGate?.categoryRef);
  const qualityLabel = qualityOutcome
    ? (qualityCategory ? `quality=${qualityOutcome}(${qualityCategory})` : `quality=${qualityOutcome}`)
    : '';
  const hindsight = record.dispatchHindsight && typeof record.dispatchHindsight === 'object'
    ? record.dispatchHindsight
    : null;
  const hindsightPairs = normalizeCounter(hindsight?.pairsAnalyzed);
  const hindsightRepeatBlocked = normalizeCounter(hindsight?.repeatedBlockedTurns);
  const hindsightRegressions = normalizeCounter(hindsight?.regressions);
  const hindsightTopFailure = normalizeText(hindsight?.topFailureClass);
  const hindsightTopJob = normalizeText(hindsight?.topRepeatedJobId);
  const hindsightLabel = hindsightPairs > 0
    ? [
      `hindsight pairs=${hindsightPairs}`,
      hindsightRepeatBlocked > 0 ? `repeatBlocked=${hindsightRepeatBlocked}` : '',
      hindsightRegressions > 0 ? `regressions=${hindsightRegressions}` : '',
      hindsightTopFailure ? `topFailure=${hindsightTopFailure}` : '',
      hindsightTopJob ? `topJob=${hindsightTopJob}` : '',
    ].filter(Boolean).join(' ')
    : '';
  const fixHint = record.dispatchFixHint && typeof record.dispatchFixHint === 'object'
    ? record.dispatchFixHint
    : null;
  const fixHintLabel = normalizeText(fixHint?.targetId) ? `fixHint=${normalizeText(fixHint.targetId)}` : '';
  const skillCandidate = record.skillCandidate && typeof record.skillCandidate === 'object'
    ? record.skillCandidate
    : null;
  const skillId = normalizeText(skillCandidate?.skillId);
  const skillFailure = normalizeText(skillCandidate?.failureClass) || normalizeText(skillCandidate?.scope);
  const skillLessons = normalizeCounter(skillCandidate?.lessonCount);
  const skillCandidateLabel = skillId
    ? `skillCandidate=${skillId}${skillFailure ? `/${skillFailure}` : ''}${skillLessons > 0 ? `#${skillLessons}` : ''}`
    : '';
  const dispatchInsights = record.dispatchInsights && typeof record.dispatchInsights === 'object'
    ? record.dispatchInsights
    : null;
  const dispatchInsightsStatus = normalizeText(dispatchInsights?.status);
  const dispatchInsightsScore = normalizeCounter(dispatchInsights?.score);
  const dispatchInsightsTopSignalId = normalizeText(dispatchInsights?.topSignalId);
  const dispatchInsightsTopSignalSeverity = normalizeText(dispatchInsights?.topSignalSeverity);
  const dispatchInsightsTopActionId = normalizeText(dispatchInsights?.topActionId);
  const dispatchInsightsLabel = dispatchInsightsStatus
    ? (dispatchInsightsStatus === 'clear'
      ? `insights=clear(${dispatchInsightsScore})`
      : `insights=${dispatchInsightsStatus}(${dispatchInsightsScore})${dispatchInsightsTopSignalId ? ` signal=${dispatchInsightsTopSignalId}/${dispatchInsightsTopSignalSeverity || 'info'}` : ''}${dispatchInsightsTopActionId ? ` action=${dispatchInsightsTopActionId}` : ''}`)
    : '';

  const bits = [
    updatedAt ? `[${updatedAt}]` : '',
    sessionId ? `session=${sessionId}` : '',
    status ? `status=${status}` : '',
    dispatchLabel,
    dispatchInsightsLabel,
    qualityLabel,
    hindsightLabel,
    fixHintLabel,
    skillCandidateLabel,
    goal ? `goal="${goal.length > 80 ? `${goal.slice(0, 79)}...` : goal}"` : '',
  ].filter(Boolean);
  return `- ${bits.join(' | ')}`;
}

// 纯函数：把 dispatch insights 规整成历史摘要使用的轻量结构，避免 runTeamHistory 里塞满 if/else。
export function mapDispatchInsightsRecord(dispatchInsights = null) {
  if (!dispatchInsights || typeof dispatchInsights !== 'object') {
    return null;
  }

  const signals = Array.isArray(dispatchInsights.signals) ? dispatchInsights.signals : [];
  const suggestedActions = Array.isArray(dispatchInsights.suggestedActions) ? dispatchInsights.suggestedActions : [];
  const topSignal = signals.length > 0 ? signals[0] : null;
  const topAction = suggestedActions.length > 0 ? suggestedActions[0] : null;

  return {
    status: normalizeText(dispatchInsights.status) || null,
    score: normalizeCounter(dispatchInsights.score),
    topSignalId: normalizeText(topSignal?.id) || null,
    topSignalSeverity: normalizeText(topSignal?.severity) || null,
    signalCount: signals.length,
    topActionId: normalizeText(topAction?.id) || null,
  };
}
