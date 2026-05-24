/* 中文注释：clarity-gate facade 保持旧导入路径稳定；信号提取、评估、持久化已拆分。 */
export {
  BOUNDARY_PATTERNS,
  CLARITY_GATE_EVENT_KIND,
  CLARITY_NEEDS_INPUT_FAILURE_CATEGORY,
  MAX_SIGNAL_SAMPLES,
  SENSITIVE_COMMAND_PATTERNS,
} from './clarity-gate/constants.mjs';
export { buildNextActions, evaluateClarityGate } from './clarity-gate/evaluate.mjs';
export { buildClaritySummary, buildEvidenceText, persistClarityGateDecision } from './clarity-gate/persist.mjs';
export {
  collectBoundarySnippets,
  collectDispatchTurnIds,
  collectDispatchWorkItemRefs,
  collectExternalWriteSignals,
  collectFilesTouched,
  collectPatternSignals,
  collectPayloadSnippets,
  collectRiskSignals,
  getFailureCategoryCount,
  isLikelyExternalWritePath,
  resolveBlockedCheckpointMetrics,
} from './clarity-gate/signals.mjs';
export { formatTurnStamp, normalizePositiveInteger, normalizeStringArray, normalizeText } from './clarity-gate/shared.mjs';
