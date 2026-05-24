import { compactRlDecisionEvidence } from '../../harness/orchestrator-evidence.mjs';
import { validateOrchestratorEvidence, validateOrchestratorTask } from '../schema.mjs';
import {
  computeHash,
  normalizeExecutionMode,
  normalizeText,
  resolveExecutorSelected,
  resolveRequestedExecutor,
  summarizeDispatchRun,
  toUniqueStrings,
} from './shared.mjs';

export function buildRealEvidence({
  task,
  checkpointId,
  attempt,
  mode,
  selectedExecutor = null,
  report = {},
  execution = {},
  policyRelease = {},
}) {
  const requestedExecutionMode = normalizeExecutionMode(execution.requestedExecutionMode || 'dry-run');
  const effectiveExecutionMode = normalizeExecutionMode(execution.effectiveExecutionMode || requestedExecutionMode);
  const attemptedExecutionModes = toUniqueStrings(
    Array.isArray(execution.attemptedExecutionModes) ? execution.attemptedExecutionModes : [effectiveExecutionMode]
  );
  const fallbackReason = typeof execution.fallbackReason === 'string' && execution.fallbackReason.trim().length > 0
    ? execution.fallbackReason.trim()
    : null;
  const dispatchRun = report?.dispatchRun && typeof report.dispatchRun === 'object'
    ? report.dispatchRun
    : {};
  const summary = summarizeDispatchRun(dispatchRun);
  const clarityNeedsHuman = report?.clarityGate?.needsHuman === true;
  let terminalOutcome = dispatchRun.ok === true
    ? 'success'
    : summary.completedCount > 0
      ? 'partial'
      : 'failed';
  if (clarityNeedsHuman && terminalOutcome === 'success') {
    terminalOutcome = 'partial';
  }
  const blockedLike = summary.blockedCount > 0 || clarityNeedsHuman;
  const verificationResult = terminalOutcome === 'success'
    ? 'passed'
    : terminalOutcome === 'partial'
      ? (blockedLike ? 'blocked' : 'partial')
      : (blockedLike ? 'blocked' : 'failed');
  const preflightStatuses = Array.isArray(report?.dispatchPreflight?.results)
    ? report.dispatchPreflight.results.map((item) => String(item?.status || 'unknown'))
    : [];
  const preflightSelected = task.decision_type === 'preflight'
    ? preflightStatuses.length > 0 || report?.dispatchPreflight != null
    : preflightStatuses.some((status) => String(status || '').trim().toLowerCase() !== 'skipped');
  const handoffTriggered = task.decision_type === 'handoff'
    ? (dispatchRun.ok !== true || blockedLike)
    : false;
  const requestedExecutor = resolveRequestedExecutor({ task, selectedExecutor });
  const dispatchPhaseSelection = report?.dispatchPlan?.phaseExecutor && typeof report.dispatchPlan.phaseExecutor === 'object'
    ? report.dispatchPlan.phaseExecutor
    : null;
  const policyAppliedExecutor = normalizeText(policyRelease.applied_executor) || null;
  const policyReleaseEffectiveApplied = policyRelease.apply_policy_executor === true
    && (
      !policyAppliedExecutor
      || !dispatchPhaseSelection?.applied_executor
      || normalizeText(dispatchPhaseSelection.applied_executor) === policyAppliedExecutor
    );
  const policyReleaseExecutorFallback = policyRelease.apply_policy_executor === true
    && !policyReleaseEffectiveApplied;
  const executorSelected = resolveExecutorSelected({
    task,
    selectedExecutor,
    report,
    dispatchRun,
  });

  return validateOrchestratorEvidence(compactRlDecisionEvidence({
    context_state: {
      ...task.context_state,
      checkpoint_id: checkpointId,
      execution_mode_requested: requestedExecutionMode,
      execution_mode_effective: effectiveExecutionMode,
      execution_modes_attempted: attemptedExecutionModes,
      dispatch_ok: dispatchRun.ok === true,
      dispatch_job_count: summary.jobCount,
      dispatch_blocked_count: summary.blockedCount,
      dispatch_completed_count: summary.completedCount,
      dispatch_job_statuses: summary.jobStatuses,
      clearance_needs_human: clarityNeedsHuman,
      policy_release_mode: policyRelease.effective_mode || null,
      policy_release_applied: policyRelease.apply_policy_executor === true,
      policy_candidate_executor: policyRelease.candidate_executor || null,
      policy_applied_executor: policyRelease.applied_executor || null,
      policy_release_reason: policyRelease.reason || null,
      policy_release_rollout_rate: Number(policyRelease.rollout_rate || 0),
      policy_release_effective_applied: policyReleaseEffectiveApplied,
      policy_release_executor_fallback: policyReleaseExecutorFallback,
      policy_release_promoted: false,
      policy_release_promotion_reason: null,
      policy_release_downgraded: false,
      policy_release_downgrade_reason: null,
      fallback_used: false,
      real_harness_error: null,
    },
    decision_type: task.decision_type,
    decision_payload: {
      harness_mode: 'real',
      task_id: task.task_id,
      checkpoint_id: checkpointId,
      attempt,
      mode,
      requested_execution_mode: requestedExecutionMode,
      effective_execution_mode: effectiveExecutionMode,
      attempted_execution_modes: attemptedExecutionModes,
      fallback_reason: fallbackReason,
      fallback_used: false,
      fallback_error: null,
      dispatch_ok: dispatchRun.ok === true,
      runtime_id: normalizeText(dispatchRun.runtime?.id) || '',
      dispatch_phase_executor_requested: normalizeText(dispatchPhaseSelection?.requested_executor) || null,
      dispatch_phase_executor_applied: normalizeText(dispatchPhaseSelection?.applied_executor) || null,
      executor_selected: executorSelected,
      requested_executor: requestedExecutor,
      verification_result: verificationResult,
      terminal_outcome: terminalOutcome,
      handoff_triggered: handoffTriggered,
      preflight_selected: preflightSelected,
      policy_release_mode: policyRelease.effective_mode || null,
      policy_release_applied: policyRelease.apply_policy_executor === true,
      policy_candidate_executor: policyRelease.candidate_executor || null,
      policy_applied_executor: policyRelease.applied_executor || null,
      policy_release_reason: policyRelease.reason || null,
      policy_release_rollout_rate: Number(policyRelease.rollout_rate || 0),
      policy_release_effective_applied: policyReleaseEffectiveApplied,
      policy_release_executor_fallback: policyReleaseExecutorFallback,
      policy_release_promoted: false,
      policy_release_promotion_reason: null,
      policy_release_downgraded: false,
      policy_release_downgrade_reason: null,
      policy_release_state_path: policyRelease.state_path || null,
    },
    executor_selected: executorSelected,
    preflight_selected: preflightSelected,
    verification_result: verificationResult,
    handoff_triggered: handoffTriggered,
    terminal_outcome: terminalOutcome,
  }));
}

export function buildEvidence({ task, score, selectedExecutor = null }) {
  const requestedExecutor = resolveRequestedExecutor({ task, selectedExecutor });
  const adjustedScore = requestedExecutor
    ? Math.max(0, Math.min(99, score + (requestedExecutor === task.expected_executor ? 10 : -10)))
    : score;
  const success = adjustedScore >= 60;
  const partial = !success && adjustedScore >= 40;
  const handoffTriggered = task.decision_type === 'handoff' ? adjustedScore >= 50 : false;
  const fallbackExecutor = success ? task.expected_executor : task.available_executors[0] || task.expected_executor;
  const executorSelected = requestedExecutor || fallbackExecutor;
  return validateOrchestratorEvidence(compactRlDecisionEvidence({
    context_state: {
      ...task.context_state,
      score: adjustedScore,
    },
    decision_type: task.decision_type,
    decision_payload: {
      expected_executor: task.expected_executor,
      score: adjustedScore,
      requested_executor: requestedExecutor,
    },
    executor_selected: executorSelected,
    preflight_selected: task.decision_type === 'preflight' ? adjustedScore >= 50 : adjustedScore % 2 === 0,
    verification_result: success ? 'passed' : partial ? 'partial' : 'failed',
    handoff_triggered: handoffTriggered,
    terminal_outcome: success ? 'success' : partial ? 'partial' : 'failed',
  }));
}

// 纯函数：把普通构造器包装成可复用的 CI 夹具实例。
export function createCiFixtureOrchestratorHarness(overrides = {}) {
  const harness = {
    calls: [],
    async executeDecision({ task, checkpointId, attempt = 0, mode = 'episode', selectedExecutor = null }) {
      const normalizedTask = validateOrchestratorTask(task);
      const requestedExecutor = resolveRequestedExecutor({
        task: normalizedTask,
        selectedExecutor,
      });
      harness.calls.push({
        task_id: normalizedTask.task_id,
        checkpointId,
        attempt,
        mode,
        requested_executor: requestedExecutor,
      });
      const score = computeHash(`${checkpointId}:${normalizedTask.task_id}:${attempt}:${mode}:${requestedExecutor || ''}`) % 100;
      return buildEvidence({
        task: normalizedTask,
        score,
        selectedExecutor: requestedExecutor,
      });
    },
    ...overrides,
  };
  return harness;
}
