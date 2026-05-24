// 纯函数：对可 JSON 序列化的策略快照做深拷贝，避免训练更新污染参考策略。
export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// 纯函数：生成稳定的 32 位哈希，用于跨平台可复现的伪随机种子。
export function computeHash(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function nextRandom(state) {
  let seed = Number(state.rngState || 0) >>> 0;
  if (seed === 0) {
    seed = computeHash('rl-bandit-seed');
  }
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  state.rngState = seed >>> 0;
  return (state.rngState >>> 0) / 0x100000000;
}

// 纯函数：把任意输入收敛到数值区间，防止训练配置传入 NaN/Infinity。
export function clampNumber(value, min, max) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return min;
  }
  return Math.min(max, Math.max(min, normalized));
}

// 纯函数：提供最小可训练策略结构，让调用方无需重复维护默认字段。
export function createEmptyPolicy() {
  return {
    seed: 0,
    vocabulary: [],
    vocabularyIndex: {},
    weights: {},
    updateCount: 0,
    onlineUpdateCount: 0,
  };
}

export function ensureWeightVector(policy, featureKey) {
  if (!policy.weights) {
    policy.weights = {};
  }
  if (!Array.isArray(policy.vocabulary)) {
    policy.vocabulary = [];
  }
  if (!policy.vocabularyIndex || typeof policy.vocabularyIndex !== 'object') {
    policy.vocabularyIndex = Object.fromEntries(policy.vocabulary.map((token, index) => [token, index]));
  }
  if (!Array.isArray(policy.weights[featureKey])) {
    policy.weights[featureKey] = new Array(policy.vocabulary.length).fill(0);
  }
  return policy.weights[featureKey];
}
