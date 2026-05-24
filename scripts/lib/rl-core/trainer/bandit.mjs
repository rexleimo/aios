import { clampNumber, createEmptyPolicy, nextRandom } from './core.mjs';
import { createTrainerConfig } from './config.mjs';
import { averageAbsoluteDifference, computeLosses } from './losses.mjs';
import {
  computeSoftmaxProbabilities,
  ensureBanditContext,
  ensureContextualBanditState,
  normalizeActionSpace,
  sampleIndexFromProbabilities,
} from './bandit-state.mjs';

export function selectContextualBanditAction({
  policy,
  contextKey,
  actions = [],
  config = createTrainerConfig(),
  evaluationMode = false,
}) {
  const activePolicy = policy && typeof policy === 'object' ? policy : createEmptyPolicy();
  const banditState = ensureContextualBanditState(activePolicy);
  const ensured = ensureBanditContext({
    banditState,
    contextKey,
    actionSpace: actions,
  });
  if (ensured.actionSpace.length === 0) {
    throw new Error('contextual bandit requires at least one action');
  }
  const scores = ensured.actionSpace.map((action) => Number(ensured.contextState.actions[action]?.preference || 0));
  const probabilities = computeSoftmaxProbabilities(scores, config.contextual_bandit_temperature);

  let selectionMode = 'exploit';
  let selectedIndex = 0;
  if (evaluationMode) {
    selectionMode = 'evaluation';
    selectedIndex = scores.reduce((bestIndex, score, index) => (score > scores[bestIndex] ? index : bestIndex), 0);
  } else {
    const explorationRate = clampNumber(config.contextual_bandit_exploration_rate, 0, 1);
    const explorationRoll = nextRandom(banditState);
    if (explorationRoll < explorationRate) {
      selectionMode = 'explore';
      selectedIndex = Math.min(
        ensured.actionSpace.length - 1,
        Math.floor(nextRandom(banditState) * ensured.actionSpace.length)
      );
    } else {
      selectedIndex = sampleIndexFromProbabilities(probabilities, nextRandom(banditState));
    }
  }

  const actionProbability = Number(probabilities[selectedIndex] || (1 / ensured.actionSpace.length));
  return {
    contextKey: ensured.contextKey,
    actionSpace: ensured.actionSpace,
    selectedAction: ensured.actionSpace[selectedIndex],
    selectedIndex,
    actionProbability,
    actionProbabilities: Object.fromEntries(
      ensured.actionSpace.map((action, index) => [action, Number(probabilities[index] || 0)])
    ),
    selectionMode,
  };
}

export function applyContextualBanditUpdate({ policy, referencePolicy, trajectory, config = createTrainerConfig() }) {
  const activePolicy = policy && typeof policy === 'object' ? policy : createEmptyPolicy();
  const banditState = ensureContextualBanditState(activePolicy);
  const selectedAction = typeof trajectory?.selectedAction === 'string' && trajectory.selectedAction.trim().length > 0
    ? trajectory.selectedAction.trim()
    : '';
  const candidateActions = normalizeActionSpace([
    ...(Array.isArray(trajectory?.actions) ? trajectory.actions : []),
    ...(selectedAction ? [selectedAction] : []),
  ]);
  const ensured = ensureBanditContext({
    banditState,
    contextKey: trajectory?.contextKey || trajectory?.featureKey || 'default',
    actionSpace: candidateActions,
  });
  if (ensured.actionSpace.length === 0) {
    throw new Error('contextual bandit update requires non-empty actions');
  }

  const resolvedSelectedAction = ensured.actionSpace.includes(selectedAction)
    ? selectedAction
    : ensured.actionSpace[0];
  const selectedIndex = ensured.actionSpace.indexOf(resolvedSelectedAction);
  const preferenceVectorBefore = ensured.actionSpace.map((action) =>
    Number(ensured.contextState.actions[action]?.preference || 0)
  );
  const probabilities = computeSoftmaxProbabilities(preferenceVectorBefore, config.contextual_bandit_temperature);
  const selectedProbability = Number(
    probabilities[selectedIndex >= 0 ? selectedIndex : 0] || (1 / ensured.actionSpace.length)
  );
  const reward = Number(trajectory?.reward ?? trajectory?.fusedReward ?? trajectory?.terminalReward ?? 0);
  const baseline = Number(ensured.contextState.average_reward || 0);
  const advantage = reward - baseline;
  const learningRate = Number(config.learning_rate || 0);

  for (let index = 0; index < ensured.actionSpace.length; index += 1) {
    const action = ensured.actionSpace[index];
    const actionState = ensured.contextState.actions[action];
    const probability = Number(probabilities[index] || 0);
    const gradient = index === selectedIndex ? (1 - probability) : -probability;
    actionState.preference = Number(actionState.preference || 0) + (learningRate * advantage * gradient);
  }

  const selectedState = ensured.contextState.actions[resolvedSelectedAction];
  selectedState.pull_count = Number(selectedState.pull_count || 0) + 1;
  selectedState.reward_sum = Number(selectedState.reward_sum || 0) + reward;

  ensured.contextState.pull_count = Number(ensured.contextState.pull_count || 0) + 1;
  ensured.contextState.reward_sum = Number(ensured.contextState.reward_sum || 0) + reward;
  ensured.contextState.average_reward = ensured.contextState.pull_count === 0
    ? 0
    : ensured.contextState.reward_sum / ensured.contextState.pull_count;

  banditState.updateCount = Number(banditState.updateCount || 0) + 1;
  activePolicy.updateCount = Number(activePolicy.updateCount || 0) + 1;

  const policyVector = ensured.actionSpace.map((action) => Number(ensured.contextState.actions[action]?.preference || 0));
  const referenceVector = ensured.actionSpace.map((action) =>
    Number(referencePolicy?.contextualBandit?.contexts?.[ensured.contextKey]?.actions?.[action]?.preference || 0)
  );
  const klLoss = averageAbsoluteDifference(policyVector, referenceVector);
  const rlLoss = Math.max(0, -advantage);
  const losses = computeLosses({
    rlLoss,
    distillLoss: 0,
    klLoss,
    distillationStatus: 'skipped',
    config,
  });

  return {
    policy: activePolicy,
    metrics: {
      policy_loss: rlLoss,
      distill_loss: 0,
      kl_loss: klLoss,
      total_loss: losses.totalLoss,
      distill_loss_weight: 0,
      advantage,
      return: reward,
      step_count: 1,
      step_advantages: [advantage],
      bandit_context_key: ensured.contextKey,
      bandit_action: resolvedSelectedAction,
      bandit_reward: reward,
      bandit_baseline: baseline,
      bandit_action_probability: selectedProbability,
      bandit_selection_mode: trajectory?.selectionMode || 'unknown',
    },
  };
}
