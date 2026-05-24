/* 中文注释：orchestrator-evidence facade 保持旧导入路径稳定；artifact、turn、cost、persist 已拆分。 */
export { buildDispatchArtifactPayload, writeArtifact } from './orchestrator-evidence/artifact.mjs';
export { ORCHESTRATION_DISPATCH_EVENT_KIND } from './orchestrator-evidence/constants.mjs';
export { formatDispatchCostForEvent, hasDispatchCost, normalizeDispatchCost } from './orchestrator-evidence/cost.mjs';
export { persistDispatchEvidence } from './orchestrator-evidence/persist.mjs';
export {
  buildArtifactPath,
  formatArtifactTimestamp,
  formatRefsCsv,
  normalizeDispatchMode,
  normalizeStringArray,
  normalizeText,
  uniqueStrings,
} from './orchestrator-evidence/shared.mjs';
export { buildCheckpointSummary, buildDispatchHeadline, buildEventText, buildNextActions } from './orchestrator-evidence/text.mjs';
export {
  buildJobWorkItemRefMap,
  buildTurnId,
  buildTurnRefs,
  enrichDispatchRunForArtifact,
  parseAttemptCount,
} from './orchestrator-evidence/turns.mjs';

export function compactRlDecisionEvidence(raw = {}) {
  return {
    context_state: raw.context_state || {},
    decision_type: String(raw.decision_type || '').trim(),
    decision_payload: raw.decision_payload || {},
    executor_selected: String(raw.executor_selected || 'unknown'),
    preflight_selected: raw.preflight_selected === true,
    verification_result: String(raw.verification_result || 'failed'),
    handoff_triggered: raw.handoff_triggered === true,
    terminal_outcome: String(raw.terminal_outcome || 'failed'),
  };
}
