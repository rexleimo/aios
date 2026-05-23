import { clone, computeHash } from './shared.mjs';
import { computeOrchestratorBanditReward } from './reward.mjs';

// 纯函数：把环境 episode 转成训练轨迹，隔离 shell/browser 与 orchestrator 差异。
export function buildTrajectoryFromEpisode(episode, rewardContext = {}) {
  if (episode.environment === 'orchestrator' && episode.bandit_trace) {
    const rewardDetails = computeOrchestratorBanditReward({
      episode,
      batchOrchestratorEpisodes: rewardContext.batchOrchestratorEpisodes,
      historical: rewardContext.historical,
      rewardWeights: rewardContext.rewardWeights,
    });
    return {
      updateType: 'contextual_bandit',
      contextKey: episode.bandit_trace.context_key,
      actions: episode.bandit_trace.action_space,
      selectedAction: episode.bandit_trace.selected_action,
      reward: rewardDetails.reward,
      loggingActionProbability: Number(episode.bandit_trace.action_probability || 0),
      loggingActionProbabilities: clone(episode.bandit_trace.action_probabilities || {}),
      selectionMode: episode.bandit_trace.selection_mode,
      rewardSignals: rewardDetails.signals,
      rewardComponents: rewardDetails.components,
    };
  }
  return {
    featureKey: `${episode.environment}:${episode.task_family}`,
    tokenIds: [computeHash(`${episode.task_id}:${episode.environment}`) % 7],
    rewards: [Number(episode.terminal_reward || 0)],
    fusedReward: Number(episode.terminal_reward || 0),
    distillationStatus: 'skipped',
    teacherTokenIds: [],
  };
}

// 纯函数：把比较结果规整成监控 episode，供退化检测和报告复用。
export function buildMonitoringEpisode({ task, comparison, environment, batchIndex, compareIndex }) {
  return {
    episode_id: `${environment}-monitor-${batchIndex}-${compareIndex}`,
    task_id: task.task_id,
    environment,
    task_family: task.flow_id || task.decision_type || task.task_family || environment,
    admission_status: 'admitted',
    comparison_status: comparison.comparison_status,
    relative_outcome: comparison.relative_outcome,
    replay_route: comparison.replay_route,
    replay_eligible: comparison.replay_route !== 'diagnostic_only',
    task_source: environment === 'shell' ? 'synthetic' : 'real_shadow',
  };
}
