/* 中文注释：evaluate 模块只根据已提取信号生成 gate 结果，不写 ContextDB。 */
import { normalizePositiveInteger, normalizeText } from './shared.mjs';
import {
  collectDispatchTurnIds,
  collectDispatchWorkItemRefs,
  collectFilesTouched,
  collectRiskSignals,
  resolveBlockedCheckpointMetrics,
} from './signals.mjs';

export function buildNextActions(gate) {
  if (!gate?.needsHuman) {
    return ['Continue automation'];
  }
  return [
    'Review clarity-gate reasons and decide whether to continue automation',
    'If safe, rerun orchestrate live after resolving unclear signals',
    'If risky, perform manual triage and checkpoint findings',
  ];
}

export function evaluateClarityGate(
  {
    sessionId = '',
    learnEvalReport = null,
    dispatchRun = null,
  } = {},
  {
    blockedCheckpointThreshold = 2,
    maxFilesTouched = 25,
  } = {}
) {
  const blockedThreshold = normalizePositiveInteger(blockedCheckpointThreshold, 2);
  const fileThreshold = normalizePositiveInteger(maxFilesTouched, 25);
  const blockedCheckpointMetrics = resolveBlockedCheckpointMetrics(learnEvalReport);
  const blockedCheckpoints = blockedCheckpointMetrics.blockedCheckpoints;
  const fixRecommendations = Array.isArray(learnEvalReport?.recommendations?.fix) ? learnEvalReport.recommendations.fix.length : 0;
  const promoteRecommendations = Array.isArray(learnEvalReport?.recommendations?.promote) ? learnEvalReport.recommendations.promote.length : 0;
  const conflictingRecommendations = fixRecommendations > 0 && promoteRecommendations > 0;
  const filesTouchedList = collectFilesTouched(dispatchRun);
  const filesTouched = filesTouchedList.length;
  const {
    payloadSnippets,
    boundarySnippets,
    sensitiveCommandSignals,
    externalWriteSignals,
    boundaryCrossingSignals,
  } = collectRiskSignals({ dispatchRun, filesTouchedList });
  const dispatchTurnIds = collectDispatchTurnIds(dispatchRun);
  const dispatchWorkItemRefs = collectDispatchWorkItemRefs(dispatchRun);
  const reasons = [];

  if (blockedCheckpoints >= blockedThreshold) {
    const blockedReasonSuffix = blockedCheckpointMetrics.blockedCheckpointsExcluded > 0
      ? ` after excluding clarity checkpoints (${blockedCheckpointMetrics.blockedCheckpointsExcluded})`
      : '';
    reasons.push(`blocked checkpoints (${blockedCheckpoints}) reached threshold (${blockedThreshold})${blockedReasonSuffix}`);
  }
  if (conflictingRecommendations) {
    reasons.push(`learn-eval has conflicting fix (${fixRecommendations}) and promote (${promoteRecommendations}) recommendations`);
  }
  if (filesTouched > fileThreshold) {
    reasons.push(`files touched (${filesTouched}) exceed safety threshold (${fileThreshold})`);
  }
  if (sensitiveCommandSignals.length > 0) {
    reasons.push(`sensitive command signals detected (${sensitiveCommandSignals.length})`);
  }
  if (externalWriteSignals.length > 0) {
    reasons.push(`external write signals detected (${externalWriteSignals.length})`);
  }
  if (boundaryCrossingSignals.length > 0) {
    reasons.push(`auth/payment/policy boundary signals detected (${boundaryCrossingSignals.length})`);
  }

  const needsHuman = reasons.length > 0;
  return {
    sessionId: normalizeText(sessionId),
    needsHuman,
    status: needsHuman ? 'needs-input' : 'clear',
    reasons,
    metrics: {
      blockedCheckpoints,
      blockedCheckpointsTotal: blockedCheckpointMetrics.blockedCheckpointsTotal,
      blockedCheckpointsExcluded: blockedCheckpointMetrics.blockedCheckpointsExcluded,
      conflictingRecommendations,
      fixRecommendations,
      promoteRecommendations,
      filesTouched,
      filesTouchedList,
      blockedCheckpointThreshold: blockedThreshold,
      maxFilesTouched: fileThreshold,
      payloadSnippetCount: payloadSnippets.length,
      boundarySnippetCount: boundarySnippets.length,
      sensitiveCommandSignals,
      externalWriteSignals,
      boundaryCrossingSignals,
      riskSignalCount: sensitiveCommandSignals.length + externalWriteSignals.length + boundaryCrossingSignals.length,
      dispatchTurnIds,
      dispatchWorkItemRefs,
    },
    nextActions: buildNextActions({ needsHuman }),
  };
}
