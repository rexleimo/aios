import { computeHash } from './core.mjs';

// 纯函数：规范化候选动作列表，保证去重和空值过滤逻辑只有一处。
export function normalizeActionSpace(actions = []) {
  const unique = [];
  const seen = new Set();
  for (const action of actions) {
    const normalized = typeof action === 'string' ? action.trim() : '';
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    unique.push(normalized);
  }
  return unique;
}

export function ensureContextualBanditState(policy) {
  if (!policy.contextualBandit || typeof policy.contextualBandit !== 'object' || Array.isArray(policy.contextualBandit)) {
    policy.contextualBandit = {};
  }
  const bandit = policy.contextualBandit;
  if (!bandit.contexts || typeof bandit.contexts !== 'object' || Array.isArray(bandit.contexts)) {
    bandit.contexts = {};
  }
  if (!Number.isInteger(bandit.updateCount) || bandit.updateCount < 0) {
    bandit.updateCount = 0;
  }
  if (!Number.isInteger(bandit.rngState)) {
    bandit.rngState = computeHash(`bandit:${policy.seed || 0}`);
  }
  return bandit;
}

export function ensureBanditContext({ banditState, contextKey, actionSpace }) {
  const normalizedContextKey = typeof contextKey === 'string' && contextKey.trim().length > 0
    ? contextKey.trim()
    : 'default';
  const normalizedActions = normalizeActionSpace(actionSpace);
  if (!banditState.contexts[normalizedContextKey] || typeof banditState.contexts[normalizedContextKey] !== 'object') {
    banditState.contexts[normalizedContextKey] = {
      pull_count: 0,
      reward_sum: 0,
      average_reward: 0,
      actions: {},
    };
  }
  const contextState = banditState.contexts[normalizedContextKey];
  if (!contextState.actions || typeof contextState.actions !== 'object' || Array.isArray(contextState.actions)) {
    contextState.actions = {};
  }
  if (!Number.isInteger(contextState.pull_count) || contextState.pull_count < 0) {
    contextState.pull_count = 0;
  }
  if (!Number.isFinite(contextState.reward_sum)) {
    contextState.reward_sum = 0;
  }
  if (!Number.isFinite(contextState.average_reward)) {
    contextState.average_reward = 0;
  }

  for (const action of normalizedActions) {
    if (!contextState.actions[action] || typeof contextState.actions[action] !== 'object') {
      contextState.actions[action] = {
        preference: 0,
        pull_count: 0,
        reward_sum: 0,
      };
      continue;
    }
    if (!Number.isFinite(contextState.actions[action].preference)) {
      contextState.actions[action].preference = 0;
    }
    if (!Number.isInteger(contextState.actions[action].pull_count) || contextState.actions[action].pull_count < 0) {
      contextState.actions[action].pull_count = 0;
    }
    if (!Number.isFinite(contextState.actions[action].reward_sum)) {
      contextState.actions[action].reward_sum = 0;
    }
  }

  return {
    contextKey: normalizedContextKey,
    actionSpace: normalizedActions,
    contextState,
  };
}

// 纯函数：将偏好分数转换为可采样概率，温度非法时回退到 1。
export function computeSoftmaxProbabilities(scores, temperature) {
  if (!Array.isArray(scores) || scores.length === 0) {
    return [];
  }
  const normalizedTemperature = Number.isFinite(Number(temperature)) && Number(temperature) > 0
    ? Number(temperature)
    : 1;
  const maxScore = Math.max(...scores);
  const exps = scores.map((score) => Math.exp((Number(score || 0) - maxScore) / normalizedTemperature));
  const total = exps.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(total) || total <= 0) {
    return new Array(scores.length).fill(1 / scores.length);
  }
  return exps.map((value) => value / total);
}

// 纯函数：按概率累积分布选择索引，供随机数来源与采样逻辑解耦。
export function sampleIndexFromProbabilities(probabilities, rngValue) {
  let cumulative = 0;
  for (let index = 0; index < probabilities.length; index += 1) {
    cumulative += Number(probabilities[index] || 0);
    if (rngValue <= cumulative || index === probabilities.length - 1) {
      return index;
    }
  }
  return 0;
}
