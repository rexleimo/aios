import { buildCLICommand, providerToClientId } from './client-cli.mjs';
import { defaultModelRegistry } from './registry.mjs';
import {
  getFallbackChain,
  getModelConfig,
  resolveModelForRole,
  resolveModelForTask,
} from './selection.mjs';
import { classifyTaskIntent, matchTaskTypeFromDescription, scoreTaskSignals } from './signals.mjs';
import { normalizeModelRouterProfile } from './profile.mjs';
import { clonePlain, normalizeId } from './shared.mjs';

// 纯函数：收敛路由对象的字段形态，避免调用链每一层都重复处理空值和别名。
export function normalizeModelRouting(raw = null) {
  if (!raw || typeof raw !== 'object') return null;
  const modelId = normalizeId(raw.modelId);
  const role = normalizeId(raw.role);
  const taskType = normalizeId(raw.taskType || raw.resolvedType);
  if (!modelId || !taskType) return null;
  const provider = normalizeId(raw.provider);
  return {
    role,
    taskType,
    modelId,
    modelLabel: String(raw.modelLabel || raw.model || '').trim(),
    provider,
    clientId: String(raw.clientId || providerToClientId(provider)).trim(),
    reason: String(raw.reason || '').trim(),
    cost: normalizeId(raw.cost) || 'unknown',
    speed: normalizeId(raw.speed) || 'unknown',
    contextWindow: String(raw.contextWindow || '').trim(),
    cliCommand: String(raw.cliCommand || '').trim(),
    fallback: Array.isArray(raw.fallback) ? raw.fallback.map((item) => normalizeId(item)).filter(Boolean) : [],
    profile: normalizeId(raw.profile),
    confidence: Number.isFinite(raw.confidence) ? raw.confidence : null,
    matchedSignals: Array.isArray(raw.matchedSignals) ? raw.matchedSignals.map(clonePlain).filter(Boolean) : [],
    why: Array.isArray(raw.why) ? raw.why.map((item) => String(item || '').trim()).filter(Boolean) : [],
    recommendedPhases: Array.isArray(raw.recommendedPhases) ? raw.recommendedPhases.map(clonePlain).filter(Boolean) : [],
    intentGate: raw.intentGate && typeof raw.intentGate === 'object'
      ? {
          intent: String(raw.intentGate.intent || ''),
          confidence: raw.intentGate.confidence,
          preferredTaskType: String(raw.intentGate.preferredTaskType || ''),
          reason: String(raw.intentGate.reason || ''),
        }
      : null,
  };
}

export function resolveModelRoutingForRole({
  role = '',
  taskDescription = '',
  registry = defaultModelRegistry(),
  env = process.env,
} = {}) {
  const roleKey = normalizeId(role);
  const roleDefault = registry?.roleDefaults?.[roleKey];
  const taskType = normalizeId(roleDefault?.taskType)
    || matchTaskTypeFromDescription(taskDescription, registry)
    || 'general';
  const decision = roleKey
    ? resolveModelForRole(roleKey, registry, env)
    : resolveModelForTask(taskType, registry, env);
  const resolvedType = normalizeId(decision.taskType || taskType);
  const fallback = getFallbackChain(resolvedType, registry).map((model) => normalizeId(model?.id || model?.modelId || ''));
  const model = decision.model || getModelConfig(decision.modelId, registry) || null;
  const provider = normalizeId(model?.provider);
  return normalizeModelRouting({
    role: roleKey,
    taskType: resolvedType,
    modelId: decision.modelId,
    modelLabel: model?.label || decision.modelId,
    provider,
    clientId: providerToClientId(provider),
    reason: decision.reason,
    cost: model?.cost || 'unknown',
    speed: model?.speed || 'unknown',
    contextWindow: model?.contextWindow || '',
    cliCommand: buildCLICommand(model, resolvedType, taskDescription || roleKey || resolvedType),
    fallback,
  });
}

function explicitTaskScoring(taskType, registry, env, profile) {
  return {
    profile: normalizeModelRouterProfile(profile, registry, env),
    primaryType: normalizeId(taskType),
    confidence: 1,
    matchedSignals: [],
    why: [`Explicit task type selected: ${normalizeId(taskType)}`],
    recommendedPhases: [],
  };
}

// 纯函数：只在关键词信号很弱时让 IntentGate 兜底，强信号仍由 signal scoring 决定。
function applyIntentGate(scoring, intentGate) {
  if (intentGate.confidence < 0.7 || scoring.confidence >= 0.6) return scoring;
  const intentTaskType = intentGate.preferredTaskType;
  if (!intentTaskType || intentTaskType === scoring.primaryType) return scoring;
  const existingWhy = scoring.why || [];
  return {
    ...scoring,
    primaryType: intentTaskType,
    why: [...existingWhy, `IntentGate override: intent=${intentGate.intent} (${intentGate.reason}, confidence=${intentGate.confidence})`],
  };
}

export function resolveModelRoutingForTask({
  taskType = '',
  taskDescription = '',
  registry = defaultModelRegistry(),
  env = process.env,
  profile = '',
} = {}) {
  const intentGate = classifyTaskIntent(taskDescription);
  const explicitTaskType = normalizeId(taskType);
  const rawScoring = explicitTaskType
    ? explicitTaskScoring(taskType, registry, env, profile)
    : scoreTaskSignals(taskDescription, registry, { profile, env });
  const scoring = explicitTaskType ? rawScoring : applyIntentGate(rawScoring, intentGate);
  const resolvedType = explicitTaskType
    || scoring.primaryType
    || matchTaskTypeFromDescription(taskDescription, registry)
    || 'general';
  const decision = resolveModelForTask(resolvedType, registry, env);
  const model = decision.model || getModelConfig(decision.modelId, registry) || null;
  const provider = normalizeId(model?.provider);
  return normalizeModelRouting({
    role: '',
    taskType: resolvedType,
    modelId: decision.modelId,
    modelLabel: model?.label || decision.modelId,
    provider,
    clientId: providerToClientId(provider),
    reason: decision.reason,
    cost: model?.cost || 'unknown',
    speed: model?.speed || 'unknown',
    contextWindow: model?.contextWindow || '',
    cliCommand: buildCLICommand(model, resolvedType, taskDescription || resolvedType),
    fallback: getFallbackChain(resolvedType, registry).map((item) => normalizeId(item?.id || item?.modelId || '')),
    profile: scoring.profile,
    confidence: scoring.confidence,
    matchedSignals: scoring.matchedSignals,
    why: scoring.why,
    recommendedPhases: scoring.recommendedPhases,
    intentGate: {
      intent: intentGate.intent,
      confidence: intentGate.confidence,
      preferredTaskType: intentGate.preferredTaskType,
      reason: intentGate.reason,
    },
  });
}

export function buildModelRouterPromptSection(modelRouting = null) {
  const route = normalizeModelRouting(modelRouting);
  if (!route) return '';
  return [
    '## Model Router',
    `- role=${route.role || 'unknown'}`,
    `- taskType=${route.taskType}`,
    `- modelId=${route.modelId}`,
    `- provider=${route.provider || 'unknown'}`,
    `- clientId=${route.clientId || 'unknown'}`,
    route.reason ? `- reason=${route.reason}` : '',
    route.cliCommand ? `- cliCommand=${route.cliCommand}` : '',
  ].filter(Boolean).join('\n');
}
