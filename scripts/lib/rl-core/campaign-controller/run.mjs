import { createControlStateStore, applyControlEvent, readControlSnapshot, writeControlSnapshot } from '../control-state-store.mjs';
import { runOnlineUpdateBatch } from '../trainer.mjs';
import { processCollectionEpisode } from './collection.mjs';
import { createInitialSnapshot } from './epoch-state.mjs';
import { pullAdmittedEpisode } from './episode-source.mjs';
import { finalizeMonitoringEpoch, processMonitoringEpisode } from './monitoring.mjs';
import { buildCampaignResult, createCampaignRuntime } from './runtime-state.mjs';

export async function runOnlineCampaign({ config, deps = {} }) {
  const rootDir = config.rootDir || process.cwd();
  const namespace = config.namespace || 'rl-core';
  const maxTasks = Number(config.maxTasks || 0);
  const batchSize = Number(config.onlineBatchSize || 4);
  const rollbackThreshold = Number(config.rollbackThreshold || 3);
  const idleBackoffBudget = Number(config.idleBackoffBudget || 0);
  const activeEnvironments = Array.isArray(config.activeEnvironments) && config.activeEnvironments.length > 0
    ? [...config.activeEnvironments]
    : ['shell'];
  const initialCheckpointId = config.initialCheckpointId || 'ckpt-initial';
  const onlineUpdater = deps.runOnlineUpdateBatch || runOnlineUpdateBatch;

  if (typeof deps.nextEpisode !== 'function' && typeof deps.sampleTask !== 'function') {
    throw new Error('deps.nextEpisode is required');
  }

  const controlStore = deps.controlStore || await createControlStateStore({ rootDir, namespace });
  let controlState = config.resume
    ? await readControlSnapshot(controlStore)
    : await writeControlSnapshot(controlStore, createInitialSnapshot(initialCheckpointId));

  if (!controlState.active_checkpoint_id) {
    controlState = await writeControlSnapshot(controlStore, {
      ...controlState,
      ...createInitialSnapshot(initialCheckpointId),
      mode: controlState.mode || 'collection',
      applied_event_ids: Array.isArray(controlState.applied_event_ids) ? controlState.applied_event_ids : [],
      last_event_id: controlState.last_event_id ?? null,
    });
  }

  const runtime = createCampaignRuntime({ controlState, initialCheckpointId, batchSize });
  const applyTrackedEvent = async (event) => {
    const result = await applyControlEvent(controlStore, event);
    if (!result.applied) {
      runtime.duplicateEventApplications += 1;
    }
    return result;
  };

  for (let taskIndex = 0; taskIndex < maxTasks; taskIndex += 1) {
    if (controlState.mode === 'frozen_failure') {
      break;
    }

    const pulled = await pullAdmittedEpisode({
      deps,
      taskIndex,
      runtime,
      controlState,
    });

    if (pulled.kind === 'idle') {
      if (idleBackoffBudget > 0 && runtime.idlePolls >= idleBackoffBudget) {
        return buildCampaignResult({
          status: 'no_work_available',
          runtime,
          controlState,
          activeEnvironments,
        });
      }
      continue;
    }
    if (pulled.kind !== 'episode') {
      continue;
    }

    if (runtime.currentEpoch.phase === 'collection') {
      controlState = await processCollectionEpisode({
        episode: pulled.episode,
        runtime,
        controlState,
        initialCheckpointId,
        onlineUpdater,
        applyTrackedEvent,
      });
      continue;
    }

    const monitoring = await processMonitoringEpisode({
      episode: pulled.episode,
      runtime,
      controlState,
      initialCheckpointId,
      rollbackThreshold,
      performRollback: deps.performRollback,
      applyTrackedEvent,
    });
    controlState = monitoring.controlState;
    if (monitoring.shouldBreak) {
      break;
    }
  }

  controlState = await finalizeMonitoringEpoch({
    runtime,
    controlState,
    initialCheckpointId,
    activeEnvironments,
    config,
    holdoutValidator: deps.holdoutValidator,
    coverageResolver: deps.coverageResolver,
    shellSafetyEvaluator: deps.shellSafetyEvaluator,
    rollbackThreshold,
    applyTrackedEvent,
  });

  if (controlState.mode === 'frozen_failure') {
    runtime.updatesAfterFreeze = 0;
  }

  return buildCampaignResult({
    runtime,
    controlState,
    activeEnvironments,
  });
}
