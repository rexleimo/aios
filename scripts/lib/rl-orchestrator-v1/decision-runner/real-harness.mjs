import { runOrchestrate } from '../../lifecycle/orchestrate.mjs';
import { compactRlDecisionEvidence } from '../../harness/orchestrator-evidence.mjs';
import {
  decidePolicyReleaseRoute,
  loadPolicyReleaseState,
  normalizePolicyReleaseConfig,
  updatePolicyReleaseState,
  writePolicyReleaseState,
} from '../policy-release-gate.mjs';
import { validateOrchestratorEvidence, validateOrchestratorTask } from '../schema.mjs';
import {
  buildRealEvidence,
  createCiFixtureOrchestratorHarness,
} from './evidence.mjs';
import {
  buildRealOrchestrateOptions,
  createSilentIo,
  normalizeExecutionMode,
  resolveExecutionModePlan,
  resolveRequestedExecutor,
} from './shared.mjs';

export function createRealOrchestratorHarness({
  rootDir = process.cwd(),
  dispatchMode = 'local',
  executionMode = 'dry-run',
  fallbackExecutionMode = 'dry-run',
  fallbackOnMissingDispatchRun = true,
  policyRelease = null,
  sessionId = '',
  io = null,
  env = process.env,
  executeOrchestrate = runOrchestrate,
  fallbackHarness = createCiFixtureOrchestratorHarness(),
  fallbackOnError = true,
} = {}) {
  const resolvedIo = io || createSilentIo();
  const requestedExecutionMode = normalizeExecutionMode(executionMode);
  const releaseConfig = normalizePolicyReleaseConfig({
    policyRelease,
    rootDir,
    requestedExecutionMode,
    env,
  });
  const harness = {
    calls: [],
    async executeDecision({ task, checkpointId, attempt = 0, mode = 'episode', selectedExecutor = null }) {
      const normalizedTask = validateOrchestratorTask(task);
      const requestedExecutor = resolveRequestedExecutor({
        task: normalizedTask,
        selectedExecutor,
      });
      let releaseState = releaseConfig.enabled
        ? await loadPolicyReleaseState(releaseConfig)
        : null;
      const releaseDecision = await decidePolicyReleaseRoute({
        config: releaseConfig,
        state: releaseState,
        taskId: normalizedTask.task_id,
        checkpointId,
        attempt,
        selectedExecutor: requestedExecutor,
      });
      const routedExecutionMode = normalizeExecutionMode(releaseDecision.execution_mode || requestedExecutionMode);
      const appliedExecutor = releaseDecision.applied_executor || null;
      const callRecord = {
        task_id: normalizedTask.task_id,
        checkpointId,
        attempt,
        mode,
        requested_executor: requestedExecutor,
        routed_executor: appliedExecutor,
        policy_release_mode: releaseDecision.effective_mode,
        policy_release_applied: releaseDecision.apply_policy_executor === true,
        policy_release_reason: releaseDecision.reason || null,
        policy_release_rollout_rate: Number(releaseDecision.rollout_rate || 0),
        harness_mode: 'real',
        execution_mode_requested: requestedExecutionMode,
        execution_mode_routed: routedExecutionMode,
        execution_modes_attempted: [],
        execution_mode_effective: null,
        fallback_reason: null,
        fallback_used: false,
      };
      harness.calls.push(callRecord);
      const executionModePlan = resolveExecutionModePlan({
        executionMode: routedExecutionMode,
        fallbackExecutionMode,
        fallbackOnMissingDispatchRun,
      });
      let selectedMode = executionModePlan[0];
      let selectedResult = null;
      let lastError = null;
      let fallbackReason = null;

      for (const currentExecutionMode of executionModePlan) {
        callRecord.execution_modes_attempted.push(currentExecutionMode);
        const options = buildRealOrchestrateOptions({
          task: normalizedTask,
          checkpointId,
          attempt,
          mode,
          dispatchMode,
          executionMode: currentExecutionMode,
          phaseExecutor: appliedExecutor,
          sessionId,
        });

        try {
          const result = await executeOrchestrate(options, {
            rootDir,
            io: resolvedIo,
            env,
          });
          const hasDispatchRun = result?.report?.dispatchRun && typeof result.report.dispatchRun === 'object';
          selectedMode = currentExecutionMode;
          if (hasDispatchRun || currentExecutionMode === executionModePlan[executionModePlan.length - 1]) {
            selectedResult = result;
            break;
          }
          selectedResult = null;
          fallbackReason = `missing dispatchRun in ${currentExecutionMode}`;
        } catch (error) {
          lastError = error;
          if (currentExecutionMode !== executionModePlan[executionModePlan.length - 1]) {
            fallbackReason = `execute failed in ${currentExecutionMode}: ${error?.message || String(error)}`;
            continue;
          }
        }
      }

      try {
        if (!selectedResult && lastError) {
          throw lastError;
        }
        const evidence = buildRealEvidence({
          task: normalizedTask,
          checkpointId,
          attempt,
          mode,
          selectedExecutor: appliedExecutor,
          report: selectedResult?.report || {},
          execution: {
            requestedExecutionMode: callRecord.execution_mode_requested,
            effectiveExecutionMode: selectedMode,
            attemptedExecutionModes: callRecord.execution_modes_attempted,
            fallbackReason,
          },
          policyRelease: {
            ...releaseDecision,
            state_path: releaseConfig.enabled ? releaseConfig.state_path : null,
          },
        });
        let normalizedEvidence = evidence;
        if (releaseConfig.enabled) {
          const releaseUpdate = updatePolicyReleaseState({
            config: releaseConfig,
            state: releaseState,
            decision: releaseDecision,
            evidence,
          });
          releaseState = releaseUpdate.state;
          await writePolicyReleaseState(releaseConfig, releaseState);
          callRecord.policy_release_state_path = releaseConfig.state_path;
          callRecord.policy_release_next_mode = releaseState.effective_mode;
          callRecord.policy_release_next_rollout_rate = Number(releaseState.effective_rollout_rate || 0);
          callRecord.policy_release_downgraded = releaseUpdate.downgraded === true;
          callRecord.policy_release_downgrade_reason = releaseUpdate.downgrade_reason || null;
          callRecord.policy_release_promoted = releaseUpdate.promoted === true;
          callRecord.policy_release_promotion_reason = releaseUpdate.promotion_reason || null;

          normalizedEvidence = validateOrchestratorEvidence(compactRlDecisionEvidence({
            ...evidence,
            context_state: {
              ...evidence.context_state,
              policy_release_downgraded: releaseUpdate.downgraded === true,
              policy_release_downgrade_reason: releaseUpdate.downgrade_reason || null,
              policy_release_promoted: releaseUpdate.promoted === true,
              policy_release_promotion_reason: releaseUpdate.promotion_reason || null,
              policy_release_next_mode: releaseState.effective_mode,
              policy_release_next_rollout_rate: releaseState.effective_rollout_rate,
            },
            decision_payload: {
              ...evidence.decision_payload,
              policy_release_downgraded: releaseUpdate.downgraded === true,
              policy_release_downgrade_reason: releaseUpdate.downgrade_reason || null,
              policy_release_promoted: releaseUpdate.promoted === true,
              policy_release_promotion_reason: releaseUpdate.promotion_reason || null,
              policy_release_next_mode: releaseState.effective_mode,
              policy_release_next_rollout_rate: releaseState.effective_rollout_rate,
            },
          }));
        }
        callRecord.execution_mode_effective = selectedMode;
        callRecord.fallback_reason = fallbackReason;
        callRecord.dispatch_ok = normalizedEvidence.decision_payload?.dispatch_ok === true;
        callRecord.runtime_id = String(normalizedEvidence.decision_payload?.runtime_id || '');
        callRecord.dispatch_phase_executor = normalizedEvidence.decision_payload?.dispatch_phase_executor_applied || null;
        callRecord.policy_release_effective_applied = normalizedEvidence.decision_payload?.policy_release_effective_applied === true;
        callRecord.policy_release_executor_fallback = normalizedEvidence.decision_payload?.policy_release_executor_fallback === true;
        return normalizedEvidence;
      } catch (error) {
        callRecord.error = error?.message || String(error);
        if (!fallbackOnError || !fallbackHarness || typeof fallbackHarness.executeDecision !== 'function') {
          throw error;
        }
        callRecord.fallback_used = true;
        const fallbackEvidence = await fallbackHarness.executeDecision({
          task: normalizedTask,
          checkpointId,
          attempt,
          mode,
          selectedExecutor: appliedExecutor,
        });
        const normalizedFallback = validateOrchestratorEvidence(fallbackEvidence);
        return validateOrchestratorEvidence(compactRlDecisionEvidence({
          ...normalizedFallback,
          context_state: {
            ...normalizedFallback.context_state,
            fallback_used: true,
            real_harness_error: callRecord.error,
            policy_release_mode: releaseDecision.effective_mode,
            policy_release_applied: releaseDecision.apply_policy_executor === true,
            policy_candidate_executor: releaseDecision.candidate_executor || null,
            policy_applied_executor: releaseDecision.applied_executor || null,
            policy_release_reason: releaseDecision.reason || null,
            policy_release_rollout_rate: Number(releaseDecision.rollout_rate || 0),
            policy_release_effective_applied: releaseDecision.apply_policy_executor === true,
            policy_release_executor_fallback: false,
            policy_release_promoted: false,
            policy_release_promotion_reason: null,
          },
          decision_payload: {
            ...normalizedFallback.decision_payload,
            harness_mode: 'real',
            requested_execution_mode: callRecord.execution_mode_requested,
            effective_execution_mode: 'fixture',
            attempted_execution_modes: callRecord.execution_modes_attempted,
            fallback_reason: fallbackReason || callRecord.error,
            fallback_used: true,
            fallback_error: callRecord.error,
            policy_release_mode: releaseDecision.effective_mode,
            policy_release_applied: releaseDecision.apply_policy_executor === true,
            policy_candidate_executor: releaseDecision.candidate_executor || null,
            policy_applied_executor: releaseDecision.applied_executor || null,
            policy_release_reason: releaseDecision.reason || null,
            policy_release_rollout_rate: Number(releaseDecision.rollout_rate || 0),
            policy_release_effective_applied: releaseDecision.apply_policy_executor === true,
            policy_release_executor_fallback: false,
            policy_release_promoted: false,
            policy_release_promotion_reason: null,
            policy_release_state_path: releaseConfig.enabled ? releaseConfig.state_path : null,
          },
        }));
      }
    },
  };
  return harness;
}
