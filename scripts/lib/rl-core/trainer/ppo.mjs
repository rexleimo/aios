import { ensureWeightVector } from './core.mjs';
import { createTrainerConfig } from './config.mjs';
import { averageAbsoluteDifference, computeAdvantages, computeLosses } from './losses.mjs';

export function applyPpoUpdate({ policy, referencePolicy, trajectory, config = createTrainerConfig() }) {
  const featureKey = trajectory.featureKey || 'default';
  const rewardSequence = Array.isArray(trajectory.rewards) && trajectory.rewards.length > 0
    ? trajectory.rewards.map((value) => Number(value || 0))
    : [Number(trajectory.fusedReward ?? trajectory.reward ?? 0)];
  const { advantages, returns } = computeAdvantages({ rewards: rewardSequence, config });
  const stepFeatureKeys = Array.isArray(trajectory.stepFeatureKeys) && trajectory.stepFeatureKeys.length > 0
    ? trajectory.stepFeatureKeys
    : rewardSequence.map(() => featureKey);
  const stepTokenIds = Array.isArray(trajectory.stepTokenIds) && trajectory.stepTokenIds.length > 0
    ? trajectory.stepTokenIds
    : [Array.isArray(trajectory.tokenIds) ? trajectory.tokenIds : []];
  const tokenIds = Array.isArray(trajectory.tokenIds)
    ? trajectory.tokenIds
    : stepTokenIds.flatMap((tokens) => (Array.isArray(tokens) ? tokens : []));
  const teacherTokenIds = Array.isArray(trajectory.teacherTokenIds) ? trajectory.teacherTokenIds : [];
  const advantage = Number(trajectory.advantage ?? returns[0] ?? rewardSequence[0] ?? 0);

  for (let stepIndex = 0; stepIndex < stepTokenIds.length; stepIndex += 1) {
    const currentFeatureKey = stepFeatureKeys[stepIndex] || featureKey;
    const policyVector = ensureWeightVector(policy, currentFeatureKey);
    const stepAdvantage = Number(advantages[Math.min(stepIndex, advantages.length - 1)] ?? advantage);
    for (const tokenId of stepTokenIds[stepIndex] || []) {
      if (Number.isInteger(tokenId) && tokenId >= 0 && tokenId < policyVector.length) {
        policyVector[tokenId] += config.learning_rate * stepAdvantage;
      }
    }
  }

  if (trajectory.distillationStatus === 'applied') {
    const distillFeatureKey = stepFeatureKeys[stepFeatureKeys.length - 1] || featureKey;
    const policyVector = ensureWeightVector(policy, distillFeatureKey);
    for (const tokenId of teacherTokenIds) {
      if (Number.isInteger(tokenId) && tokenId >= 0 && tokenId < policyVector.length) {
        policyVector[tokenId] += config.learning_rate * config.distill_loss_weight;
      }
    }
  }

  const mismatchCount = teacherTokenIds.length === 0
    ? 0
    : teacherTokenIds.reduce((count, tokenId, index) => count + (tokenIds[index] === tokenId ? 0 : 1), 0);

  const rlLoss = Math.max(0, -advantage);
  const distillLoss = teacherTokenIds.length === 0 ? 0 : mismatchCount / teacherTokenIds.length;
  const referenceVector = ensureWeightVector(referencePolicy, stepFeatureKeys[stepFeatureKeys.length - 1] || featureKey);
  const policyVector = ensureWeightVector(policy, stepFeatureKeys[stepFeatureKeys.length - 1] || featureKey);
  const klLoss = averageAbsoluteDifference(policyVector, referenceVector);
  const losses = computeLosses({
    rlLoss,
    distillLoss,
    klLoss,
    distillationStatus: trajectory.distillationStatus || 'skipped',
    config,
  });

  policy.updateCount = Number(policy.updateCount || 0) + 1;

  return {
    policy,
    metrics: {
      policy_loss: rlLoss,
      distill_loss: distillLoss,
      kl_loss: klLoss,
      total_loss: losses.totalLoss,
      distill_loss_weight: losses.distillLossWeight,
      advantage,
      return: returns[0] ?? advantage,
      step_count: stepTokenIds.length,
      step_advantages: advantages,
    },
  };
}
