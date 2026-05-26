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
  if (gate?.decision === 'approval-required') {
    return [
      'Review the gate question and confirm whether the sensitive next action is allowed',
      `Rerun: ${gate?.resumeCommand || 'node scripts/aios.mjs orchestrate --dispatch local --execute live --format json'}`,
      'If not approved, revise the plan to avoid the sensitive action',
    ];
  }
  return [
    'Answer the clarity-gate question or resolve the unclear signal',
    `Rerun: ${gate?.resumeCommand || 'node scripts/aios.mjs orchestrate --dispatch local --execute live --format json'}`,
    'Checkpoint the decision before retrying automation',
  ];
}

function buildDecision({ sensitiveCommandSignals, externalWriteSignals, boundaryCrossingSignals, reasons }) {
  if (reasons.length === 0) return 'allow';
  if (
    sensitiveCommandSignals.length > 0
    || externalWriteSignals.length > 0
    || boundaryCrossingSignals.length > 0
  ) {
    return 'approval-required';
  }
  return 'clarify';
}

function buildQuestion({ decision, reasons }) {
  if (reasons.length === 0) return '';
  if (decision === 'approval-required') {
    return `Please confirm before automation continues: may the harness proceed past this sensitive gate? Reason: ${reasons[0]}`;
  }
  return `Please clarify before automation continues: how should the harness resolve this gate? Reason: ${reasons[0]}`;
}

function buildResumeCommand(sessionId) {
  const normalizedSessionId = normalizeText(sessionId);
  if (!normalizedSessionId) {
    return 'node scripts/aios.mjs orchestrate --dispatch local --execute live --format json';
  }
  return `node scripts/aios.mjs orchestrate --session ${normalizedSessionId} --dispatch local --execute live --format json`;
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
  const decision = buildDecision({
    sensitiveCommandSignals,
    externalWriteSignals,
    boundaryCrossingSignals,
    reasons,
  });
  const resumeCommand = needsHuman ? buildResumeCommand(sessionId) : '';
  const gateCore = {
    needsHuman,
    decision,
    resumeCommand,
  };
  return {
    sessionId: normalizeText(sessionId),
    needsHuman,
    decision,
    status: needsHuman ? 'needs-input' : 'clear',
    reasons,
    warnings: [],
    question: buildQuestion({ decision, reasons }),
    recommendedAction: needsHuman
      ? 'Pause automation until the operator answers the gate question.'
      : 'Continue automation.',
    resumeCommand,
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
    nextActions: buildNextActions(gateCore),
  };
}
