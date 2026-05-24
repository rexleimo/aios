import { applyPointerTransition } from '../checkpoint-registry.mjs';
import {
  normalizeEpisodeComparison,
  reduceDegradationStreak as reduceDegradationStreakFromResults,
  summarizeComparisonResults,
} from '../comparison-engine.mjs';
import { recordComparisonResults, reopenEpoch } from '../epoch-ledger.mjs';
import { buildEpoch, buildPointerState } from './epoch-state.mjs';
import { computeEpochOutcome } from './outcome.mjs';
import { formatSequenceId } from './ids.mjs';

export async function processMonitoringEpisode({
  episode,
  runtime,
  controlState,
  initialCheckpointId,
  rollbackThreshold,
  performRollback,
  applyTrackedEvent,
}) {
  const normalized = normalizeEpisodeComparison(episode);
  runtime.monitoringResults.push(normalized);
  if (normalized.comparison_status === 'comparison_failed') {
    runtime.comparisonFailedCount += 1;
  } else if (normalized.relative_outcome === 'better') {
    runtime.betterCount += 1;
  } else if (normalized.relative_outcome === 'same') {
    runtime.sameCount += 1;
  } else if (normalized.relative_outcome === 'worse') {
    runtime.worseCount += 1;
  }
  runtime.currentEpoch.comparison_results = [...runtime.monitoringResults];
  const degradation = reduceDegradationStreakFromResults(runtime.monitoringResults, { rollbackThreshold });
  runtime.currentEpoch.degradation_streak = degradation.degradationStreak;

  if (!degradation.shouldRollback) {
    return { controlState, shouldBreak: false };
  }

  runtime.rollbacksCompleted += 1;
  const restoredCheckpointId = controlState.pre_update_ref_checkpoint_id || controlState.last_stable_checkpoint_id;
  try {
    if (typeof performRollback === 'function') {
      await performRollback({
        restoredCheckpointId,
        controlState,
        currentEpoch: runtime.currentEpoch,
      });
    }
  } catch {
    const rollbackFailureEvent = await applyTrackedEvent({
      event_id: `rollback-failed-${runtime.rollbacksCompleted}`,
      snapshot_patch: {
        mode: 'frozen_failure',
      },
    });
    return { controlState: rollbackFailureEvent.snapshot, shouldBreak: true };
  }

  const rollbackPatch = applyPointerTransition(
    buildPointerState(controlState, initialCheckpointId),
    {
      type: 'rollback.completed',
      restored_checkpoint_id: restoredCheckpointId,
    }
  );
  const rollbackEvent = await applyTrackedEvent({
    event_id: `rollback-completed-${runtime.rollbacksCompleted}`,
    snapshot_patch: {
      ...rollbackPatch,
      mode: 'collection',
    },
  });
  const nextControlState = rollbackEvent.snapshot;
  runtime.epochNumber += 1;
  runtime.currentEpoch = buildEpoch({
    epochNumber: runtime.epochNumber,
    phase: 'collection',
    controlState: nextControlState,
    initialCheckpointId,
  });
  runtime.monitoringResults = [];
  return { controlState: nextControlState, shouldBreak: false };
}

export async function finalizeMonitoringEpoch({
  runtime,
  controlState,
  initialCheckpointId,
  activeEnvironments,
  config,
  holdoutValidator,
  coverageResolver,
  shellSafetyEvaluator,
  rollbackThreshold,
  applyTrackedEvent,
}) {
  if (controlState.mode === 'frozen_failure' || runtime.currentEpoch.phase !== 'monitoring' || runtime.monitoringResults.length === 0) {
    return controlState;
  }

  runtime.currentEpoch = recordComparisonResults(runtime.currentEpoch, runtime.monitoringResults);
  const degradation = reduceDegradationStreakFromResults(runtime.monitoringResults, { rollbackThreshold });
  runtime.currentEpoch.degradation_streak = degradation.degradationStreak;
  const summary = summarizeComparisonResults(runtime.monitoringResults);
  const holdoutResult = typeof holdoutValidator === 'function'
    ? await holdoutValidator({
      candidateCheckpointId: controlState.active_checkpoint_id,
      baselineCheckpointId: controlState.last_stable_checkpoint_id,
      currentEpoch: runtime.currentEpoch,
    })
    : null;
  const coverageSatisfied = typeof coverageResolver === 'function'
    ? await coverageResolver({
      currentEpoch: runtime.currentEpoch,
      monitoringResults: runtime.monitoringResults,
      activeEnvironments,
      controlState,
      holdoutResult,
    })
    : config.coverageSatisfied ?? true;
  const shellSafetyGatePassed = typeof shellSafetyEvaluator === 'function'
    ? await shellSafetyEvaluator({
      currentEpoch: runtime.currentEpoch,
      monitoringResults: runtime.monitoringResults,
      activeEnvironments,
      controlState,
      holdoutResult,
    })
    : holdoutResult?.status !== 'failed';
  const epochOutcome = computeEpochOutcome({
    activeEnvironments,
    betterCount: summary.betterCount,
    worseCount: summary.worseCount,
    comparisonFailedCount: summary.comparisonFailedCount,
    coverageSatisfied,
    shellSafetyGatePassed,
    degradationStreak: runtime.currentEpoch.degradation_streak,
  });

  if (epochOutcome.outcome === 'replay_only') {
    runtime.replayOnlyEpochs += 1;
    const replayEvent = await applyTrackedEvent({
      event_id: `epoch-replay-only-${runtime.replayOnlyEpochs}`,
      snapshot_patch: {
        mode: 'monitoring',
      },
    });
    const nextControlState = replayEvent.snapshot;
    runtime.currentEpoch = reopenEpoch(runtime.currentEpoch, 'replay_only');
    runtime.currentEpoch = {
      ...runtime.currentEpoch,
      update_epoch_id: formatSequenceId('epoch', runtime.epochNumber),
      active_checkpoint_id: nextControlState.active_checkpoint_id,
      pre_update_ref_checkpoint_id: nextControlState.pre_update_ref_checkpoint_id,
    };
    return nextControlState;
  }

  if (epochOutcome.outcome === 'promotion_eligible' && runtime.currentEpoch.promotion_eligible) {
    const stablePatch = applyPointerTransition(
      buildPointerState(controlState, initialCheckpointId),
      {
        type: 'epoch.closed',
        promotion_eligible: true,
      }
    );
    const stableEvent = await applyTrackedEvent({
      event_id: `epoch-closed-${runtime.epochNumber}`,
      snapshot_patch: {
        ...stablePatch,
        mode: 'collection',
      },
    });
    const nextControlState = stableEvent.snapshot;
    runtime.epochNumber += 1;
    runtime.currentEpoch = buildEpoch({
      epochNumber: runtime.epochNumber,
      phase: 'collection',
      controlState: nextControlState,
      initialCheckpointId,
    });
    return nextControlState;
  }

  return controlState;
}
