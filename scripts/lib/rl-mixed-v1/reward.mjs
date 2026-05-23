import { clamp, safeRatio } from './shared.mjs';
import { ORCHESTRATOR_BANDIT_REWARD_DEFAULT_WEIGHTS, normalizeRewardWeights } from './reward-config.mjs';

// 纯函数：把 orchestrator episode 和历史质量信号折算成 bandit 奖励。
export function computeOrchestratorBanditReward({
  episode,
  batchOrchestratorEpisodes = [],
  historical = {},
  rewardWeights = ORCHESTRATOR_BANDIT_REWARD_DEFAULT_WEIGHTS,
} = {}) {
  const weights = normalizeRewardWeights(ORCHESTRATOR_BANDIT_REWARD_DEFAULT_WEIGHTS, rewardWeights);
  const orchestratorRows = Array.isArray(batchOrchestratorEpisodes) && batchOrchestratorEpisodes.length > 0
    ? batchOrchestratorEpisodes
    : [episode];
  const successCount = orchestratorRows.filter((row) => row?.terminal_outcome === 'success').length;
  const handoffCount = orchestratorRows.filter((row) => row?.handoff_triggered === true).length;
  const successRate = safeRatio(successCount, orchestratorRows.length);
  const humanHandoffRate = safeRatio(handoffCount, orchestratorRows.length);
  const rollbackRate = safeRatio(historical.rollbacksCompleted, historical.updatesCompleted);
  const terminalReward = Number(episode?.terminal_reward || 0);
  const missedHandoff = episode?.decision_type === 'handoff' && episode?.handoff_triggered !== true;
  const verificationBlocked = episode?.verification_result === 'blocked';

  const components = {
    terminal: weights.terminal * terminalReward,
    success_rate: weights.successRate * ((2 * successRate) - 1),
    rollback_rate: weights.rollbackRate * rollbackRate,
    human_handoff_rate: weights.humanHandoffRate * humanHandoffRate,
    missed_handoff: missedHandoff ? weights.missedHandoff : 0,
    verification_blocked: verificationBlocked ? weights.verificationBlocked : 0,
  };
  const rawReward = Object.values(components).reduce((sum, value) => sum + Number(value || 0), 0);
  const reward = clamp(rawReward, -1.5, 1.5);
  return {
    reward,
    raw_reward: rawReward,
    signals: {
      terminal_reward: terminalReward,
      success_rate: successRate,
      rollback_rate: rollbackRate,
      human_handoff_rate: humanHandoffRate,
      missed_handoff: missedHandoff,
      verification_blocked: verificationBlocked,
    },
    components,
  };
}
