/* 中文注释：Harness barrel，集中导出 orchestrator/solo/eval/gate 等被外部域消费的能力。 */
export {
  buildDispatchPolicy,
  buildEffectiveDispatchPolicy,
  buildExecutorCapabilityManifest,
  buildLocalDispatchPlan,
  buildOrchestrationPlan,
  normalizeOrchestratorBlueprint,
  normalizeOrchestratorFormat,
  renderOrchestrationReport,
} from './orchestrator.mjs';

export {
  createDispatchRuntimeRegistry,
  normalizeDispatchRuntimeResult,
  resolveDispatchRuntime,
} from './orchestrator-runtimes.mjs';

export { compactRlDecisionEvidence, persistDispatchEvidence } from './orchestrator-evidence.mjs';
export {
  evaluateClarityGate,
  persistClarityGateDecision,
} from './clarity-gate.mjs';
export { buildDispatchInsights } from './dispatch-insights.mjs';
export { buildHindsightEval } from './hindsight-eval.mjs';
export { persistQualityGateEvidence } from './verification-evidence.mjs';
export { buildWorkItemTelemetry } from './work-item-telemetry.mjs';
export { buildLearnEvalReport, renderLearnEvalReport } from './learn-eval.mjs';
export { persistLearnEvalHindsightEvidence } from './learn-eval-evidence.mjs';

export {
  HARNESS_PROFILE_NAMES,
  getDisabledGateIds,
  isHarnessGateEnabled,
  normalizeHarnessProfile,
} from './profile.mjs';

export {
  checkSoloHarnessProfileReadiness,
  buildSoloHarnessCommand,
  resolveSoloHarnessProfile,
} from './solo-profiles.mjs';
export {
  classifySoloFailure,
  normalizeSoloIterationOutcome,
  runSoloHarnessLoop,
} from './solo-runtime.mjs';
export {
  clearSoloHarnessStop,
  initSoloRunJournal,
  readSoloControl,
  readSoloRunStatus,
  readSoloRunSummary,
  requestSoloHarnessStop,
  writeSoloRunSummary,
} from './solo-journal.mjs';
export { finalizeSoloWorktree, prepareSoloWorktree } from './solo-worktree.mjs';
export { getHarnessTarget } from './targets.mjs';
