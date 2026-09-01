import { defaultModelRegistry } from './registry.mjs';
import { normalizeModelRouterProfile } from './profile.mjs';
import { normalizeId } from './shared.mjs';

/* 北极星原则：程序只提供确定性路由，绝不用关键词表/正则从自由文本替模型判断
 * "这个任务是什么类型 / 用户想要什么"。
 *
 * 本模块不再维护 DEFAULT_SIGNAL_RULES / INTENT_RULES 这类手写停用词表，也不从
 * taskDescription 猜 taskType / intent。任务类型与意图由调用方显式声明（模型或
 * 上层传入 taskType / intent）；本模块只做两件确定性的事：
 *  1) 收敛/规整显式声明的 taskType；
 *  2) 在没有显式声明时返回确定性默认（general），并明确说明"程序没有猜"，
 *     由模型/调用方后续显式声明来驱动精准路由。
 */

// 纯函数：中英文关键词匹配；英文按词边界，中文按子串。
// 保留为导出 API（外部可能仍依赖），但本模块内部不再用它做路由决策。
export function keywordMatches(text, keyword) {
  const kw = String(keyword || '').trim().toLowerCase();
  if (!kw) return false;
  if (/[a-z0-9]/i.test(kw)) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\ /g, '\\s+');
    return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'iu').test(text);
  }
  return text.includes(kw);
}

const DEFAULT_IMPLEMENT_INTENT = Object.freeze({
  intent: 'implement',
  confidence: 0,
  matchedKeywords: [],
  preferredTaskType: 'implementation',
  reason: 'no explicit intent declared; program does not guess task intent',
});

/**
 * Resolve a routing intent without guessing it from free-form task text.
 *
 * 北极星原则：意图（plan/implement/review/explore）是语义判断，只能由调用方
 * 显式声明。这里接受可选的显式 intent；未提供时返回确定性默认（confidence 0，
 * 使上层 IntentGate 不会用"猜到的意图"覆盖真实打分）。
 */
export function classifyTaskIntent(taskDescription, explicitIntent = '') {
  void taskDescription;
  const intent = normalizeId(explicitIntent);
  if (!intent) return { ...DEFAULT_IMPLEMENT_INTENT };
  const preferred = {
    plan: 'planning',
    implement: 'implementation',
    review: 'code-review',
    explore: 'research',
  }[intent] || 'general';
  return {
    intent,
    confidence: 1,
    matchedKeywords: [],
    preferredTaskType: preferred,
    reason: `explicit intent declared: ${intent}`,
  };
}

function buildWhy({ profile, primaryType }) {
  return [
    `Routed by explicit declaration or deterministic default: ${primaryType} (no keyword guessing)`,
    `${profile} profile selected ${primaryType}`,
  ];
}

/**
 * Resolve a primary task type from an explicit declaration, or a deterministic
 * default when none is given. 程序不猜任务类型：无显式 taskType 时返回 'general'。
 */
export function scoreTaskSignals(taskDescription, registry = defaultModelRegistry(), { profile, env = process.env, taskType = '' } = {}) {
  void taskDescription;
  const activeProfile = normalizeModelRouterProfile(profile, registry, env);
  const explicit = normalizeId(taskType);
  const primaryType = explicit || 'general';
  return {
    profile: activeProfile,
    primaryType,
    confidence: explicit ? 1 : 0,
    matchedSignals: [],
    why: buildWhy({ profile: activeProfile, primaryType }),
    recommendedPhases: [],
  };
}

export function matchTaskTypeFromDescription(taskDescription, registry) {
  return scoreTaskSignals(taskDescription, registry).primaryType || 'general';
}
