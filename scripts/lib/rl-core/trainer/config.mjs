// 纯函数：集中生成训练默认配置，避免 PPO、bandit、online batch 各自散落默认值。
export function createTrainerConfig(overrides = {}) {
  return {
    ppo_clip_epsilon: 0.2,
    distill_loss_weight: 0.2,
    kl_loss_weight: 0.01,
    gamma: 1.0,
    lambda: 1.0,
    learning_rate: 0.05,
    reference_refresh_interval: 100,
    contextual_bandit_exploration_rate: 0.15,
    contextual_bandit_temperature: 1.0,
    ...overrides,
  };
}
