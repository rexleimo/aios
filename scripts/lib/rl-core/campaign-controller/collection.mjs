import { applyPointerTransition } from '../checkpoint-registry.mjs';
import { reopenEpoch } from '../epoch-ledger.mjs';
import { buildEpoch, buildPointerState } from './epoch-state.mjs';
import { formatSequenceId } from './ids.mjs';

export async function processCollectionEpisode({
  episode,
  runtime,
  controlState,
  initialCheckpointId,
  onlineUpdater,
  applyTrackedEvent,
}) {
  runtime.collectionEpisodes.push(episode);
  runtime.currentEpoch.admitted_trajectory_ids = [
    ...runtime.currentEpoch.admitted_trajectory_ids,
    episode.episode_id,
  ];
  if (runtime.collectionEpisodes.length < runtime.batchSize) {
    return controlState;
  }

  const batchId = formatSequenceId('batch', runtime.batchNumber);
  const updateResult = await onlineUpdater({
    batchId,
    checkpointId: controlState.active_checkpoint_id,
    trajectories: runtime.collectionEpisodes,
  });

  if (updateResult.status !== 'ok') {
    runtime.updatesFailed += 1;
    const pointerPatch = applyPointerTransition(
      buildPointerState(controlState, initialCheckpointId),
      { type: 'update.failed' }
    );
    const failureEvent = await applyTrackedEvent({
      event_id: `update-failed-${runtime.batchNumber}`,
      snapshot_patch: {
        ...pointerPatch,
        mode: 'collection',
      },
    });
    const nextControlState = failureEvent.snapshot;
    runtime.currentEpoch = reopenEpoch(runtime.currentEpoch, 'update_failed');
    runtime.currentEpoch = {
      ...runtime.currentEpoch,
      update_epoch_id: formatSequenceId('epoch', runtime.epochNumber),
      active_checkpoint_id: nextControlState.active_checkpoint_id,
      pre_update_ref_checkpoint_id: nextControlState.pre_update_ref_checkpoint_id,
    };
    runtime.collectionEpisodes = [];
    runtime.monitoringResults = [];
    runtime.batchNumber += 1;
    return nextControlState;
  }

  runtime.updatesCompleted += 1;
  const pointerPatch = applyPointerTransition(
    buildPointerState(controlState, initialCheckpointId),
    {
      type: 'update.completed',
      previous_active_checkpoint_id: controlState.active_checkpoint_id,
      new_active_checkpoint_id: updateResult.nextCheckpointId,
    }
  );
  const updateEvent = await applyTrackedEvent({
    event_id: `update-completed-${runtime.batchNumber}`,
    snapshot_patch: {
      ...pointerPatch,
      mode: 'monitoring',
    },
  });
  const nextControlState = updateEvent.snapshot;
  runtime.epochNumber += 1;
  runtime.currentEpoch = buildEpoch({
    epochNumber: runtime.epochNumber,
    phase: 'monitoring',
    controlState: nextControlState,
    initialCheckpointId,
  });
  runtime.collectionEpisodes = [];
  runtime.monitoringResults = [];
  runtime.batchNumber += 1;
  return nextControlState;
}
