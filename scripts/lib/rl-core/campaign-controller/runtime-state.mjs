import { buildEpoch } from './epoch-state.mjs';

export function createCampaignRuntime({ controlState, initialCheckpointId, batchSize }) {
  return {
    epochNumber: 1,
    batchNumber: 1,
    batchSize,
    updatesCompleted: 0,
    updatesFailed: 0,
    replayOnlyEpochs: 0,
    rollbacksCompleted: 0,
    comparisonFailedCount: 0,
    betterCount: 0,
    sameCount: 0,
    worseCount: 0,
    duplicateEventApplications: 0,
    updatesAfterFreeze: 0,
    collectionEpisodes: [],
    monitoringResults: [],
    idlePolls: 0,
    currentEpoch: buildEpoch({
      epochNumber: 1,
      phase: controlState.mode === 'monitoring' ? 'monitoring' : 'collection',
      controlState,
      initialCheckpointId,
    }),
  };
}

export function buildCampaignResult({ status = 'ok', runtime, controlState, activeEnvironments }) {
  return {
    status,
    ...(status === 'no_work_available' ? { idlePolls: runtime.idlePolls, activeEnvironments } : {}),
    updatesCompleted: runtime.updatesCompleted,
    updatesFailed: runtime.updatesFailed,
    replayOnlyEpochs: runtime.replayOnlyEpochs,
    rollbacksCompleted: runtime.rollbacksCompleted,
    betterCount: runtime.betterCount,
    sameCount: runtime.sameCount,
    worseCount: runtime.worseCount,
    comparisonFailedCount: runtime.comparisonFailedCount,
    duplicateEventApplications: runtime.duplicateEventApplications,
    updatesAfterFreeze: runtime.updatesAfterFreeze,
    currentEpoch: runtime.currentEpoch,
    activeCheckpointId: controlState.active_checkpoint_id,
    preUpdateRefCheckpointId: controlState.pre_update_ref_checkpoint_id,
    lastStableCheckpointId: controlState.last_stable_checkpoint_id,
    controlState,
  };
}
