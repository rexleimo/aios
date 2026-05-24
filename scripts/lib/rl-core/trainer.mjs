export { createTrainerConfig } from './trainer/config.mjs';
export { computeAdvantages, computeLosses } from './trainer/losses.mjs';
export { applyContextualBanditUpdate, selectContextualBanditAction } from './trainer/bandit.mjs';
export { applyPpoUpdate } from './trainer/ppo.mjs';
export {
  applyTrajectoryUpdate,
  buildMixedReplayBatch,
  createReferencePolicyFrom,
  maybeRefreshReferencePolicy,
  runOnlineUpdateBatch,
} from './trainer/update.mjs';
