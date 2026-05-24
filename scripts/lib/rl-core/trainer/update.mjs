import { clone, createEmptyPolicy } from './core.mjs';
import { createTrainerConfig } from './config.mjs';
import { applyContextualBanditUpdate } from './bandit.mjs';
import { applyPpoUpdate } from './ppo.mjs';

export function applyTrajectoryUpdate({ policy, referencePolicy, trajectory, config = createTrainerConfig() }) {
  if (trajectory?.updateType === 'contextual_bandit') {
    return applyContextualBanditUpdate({
      policy,
      referencePolicy,
      trajectory,
      config,
    });
  }
  return applyPpoUpdate({
    policy,
    referencePolicy,
    trajectory,
    config,
  });
}

export function maybeRefreshReferencePolicy({ policy, referencePolicy, updateCount, config = createTrainerConfig() }) {
  if (updateCount > 0 && updateCount % config.reference_refresh_interval === 0) {
    return clone(policy);
  }
  return referencePolicy;
}

export function buildMixedReplayBatch({
  pool,
  batchSize = 5,
  targetRealRatio = 0.6,
  duplicationBackoffThreshold = 0.5,
}) {
  const realEpisodes = Array.isArray(pool?.realShadow?.episodes) ? pool.realShadow.episodes : [];
  const syntheticEpisodes = Array.isArray(pool?.synthetic?.episodes) ? pool.synthetic.episodes : [];
  const desiredReal = Math.min(realEpisodes.length, Math.round(batchSize * targetRealRatio));
  const realUniqueRatio = realEpisodes.length === 0
    ? 1
    : new Set(realEpisodes.map((episode) => episode.episode_id)).size / realEpisodes.length;
  const dedupeReal = realUniqueRatio < duplicationBackoffThreshold;
  const realShadow = [];
  const seenReal = new Set();

  for (const episode of realEpisodes) {
    if (realShadow.length >= desiredReal) {
      break;
    }
    if (dedupeReal && seenReal.has(episode.episode_id)) {
      continue;
    }
    realShadow.push(episode);
    seenReal.add(episode.episode_id);
  }

  const synthetic = syntheticEpisodes.slice(0, Math.max(0, batchSize - realShadow.length));
  return {
    realShadow,
    synthetic,
    effectiveRealRatio: batchSize === 0 ? 0 : realShadow.length / batchSize,
  };
}

export function createReferencePolicyFrom(policy) {
  return clone(policy);
}

function summarizeBatchMetrics(metricsRows) {
  if (!Array.isArray(metricsRows) || metricsRows.length === 0) {
    return {
      policy_loss: 0,
      distill_loss: 0,
      kl_loss: 0,
      total_loss: 0,
      trajectory_count: 0,
    };
  }

  const totals = metricsRows.reduce((acc, row) => ({
    policy_loss: acc.policy_loss + Number(row.policy_loss || 0),
    distill_loss: acc.distill_loss + Number(row.distill_loss || 0),
    kl_loss: acc.kl_loss + Number(row.kl_loss || 0),
    total_loss: acc.total_loss + Number(row.total_loss || 0),
  }), {
    policy_loss: 0,
    distill_loss: 0,
    kl_loss: 0,
    total_loss: 0,
  });

  return {
    policy_loss: totals.policy_loss / metricsRows.length,
    distill_loss: totals.distill_loss / metricsRows.length,
    kl_loss: totals.kl_loss / metricsRows.length,
    total_loss: totals.total_loss / metricsRows.length,
    trajectory_count: metricsRows.length,
  };
}

export function runOnlineUpdateBatch({
  batchId,
  checkpointId,
  policy,
  referencePolicy,
  trajectories = [],
  applyUpdate = applyPpoUpdate,
  config = createTrainerConfig(),
}) {
  if (typeof batchId !== 'string' || batchId.trim().length === 0) {
    throw new Error('batchId is required');
  }
  if (typeof checkpointId !== 'string' || checkpointId.trim().length === 0) {
    throw new Error('checkpointId is required');
  }
  const activePolicy = policy && typeof policy === 'object' ? policy : createEmptyPolicy();

  let nextReferencePolicy = referencePolicy || createReferencePolicyFrom(activePolicy);
  const metricsRows = [];
  const injectFallbackTrajectory = applyUpdate !== applyPpoUpdate && applyUpdate !== applyTrajectoryUpdate;
  const trajectoriesToApply = Array.isArray(trajectories) && trajectories.length > 0
    ? trajectories
    : injectFallbackTrajectory
      ? [{}]
      : [];

  try {
    for (const trajectory of trajectoriesToApply) {
      const result = applyUpdate({
        policy: activePolicy,
        referencePolicy: nextReferencePolicy,
        trajectory,
        config,
      });
      metricsRows.push(result.metrics || {});
      nextReferencePolicy = maybeRefreshReferencePolicy({
        policy: activePolicy,
        referencePolicy: nextReferencePolicy,
        updateCount: Number(activePolicy.updateCount || 0),
        config,
      });
    }

    const updateNumber = Number(activePolicy.onlineUpdateCount || 0) + 1;
    activePolicy.onlineUpdateCount = updateNumber;

    return {
      status: 'ok',
      batchId,
      checkpointId,
      nextCheckpointId: `${checkpointId}-u${updateNumber}`,
      policy: activePolicy,
      referencePolicy: nextReferencePolicy,
      metrics: summarizeBatchMetrics(metricsRows),
    };
  } catch (error) {
    return {
      status: 'update_failed',
      batchId,
      checkpointId,
      error: error.message,
    };
  }
}
