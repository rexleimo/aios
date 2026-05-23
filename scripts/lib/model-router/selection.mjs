import { defaultModelRegistry, getActiveModel } from './registry.mjs';
import { COST_ORDER, normalizeEnvKey, normalizeId } from './shared.mjs';
import { scoreTaskSignals } from './signals.mjs';

export function getModelConfig(modelId, registry) {
  const id = normalizeId(modelId);
  if (!id || !registry?.models) return null;
  const model = registry.models[id];
  return model ? { id, ...model } : null;
}

export function getRoutingRule(taskType, registry) {
  const type = normalizeId(taskType);
  if (!type || !registry?.routingRules) return null;
  return registry.routingRules.find((rule) => normalizeId(rule.taskType) === type) || null;
}

export function resolveModelForRole(role, registry = defaultModelRegistry(), env = process.env) {
  const roleKey = normalizeId(role);
  const roleDefault = registry?.roleDefaults?.[roleKey];
  const taskType = normalizeId(roleDefault?.taskType) || roleKey || 'general';
  const roleOverride = env?.[`AIOS_MODEL_${normalizeEnvKey(roleKey)}`];
  if (roleOverride) {
    const modelId = normalizeId(roleOverride);
    const model = getModelConfig(modelId, registry);
    if (model) {
      return {
        modelId,
        model,
        rule: getRoutingRule(taskType, registry),
        taskType,
        reason: `env override AIOS_MODEL_${normalizeEnvKey(roleKey)} for role="${roleKey}"`,
      };
    }
  }

  const preferredModel = roleDefault?.preferredModel;
  if (preferredModel) {
    const model = getModelConfig(preferredModel, registry);
    if (model) {
      return {
        modelId: preferredModel,
        model,
        rule: getRoutingRule(taskType, registry),
        taskType,
        reason: `discipline agent preferred model for role="${roleKey}"`,
      };
    }
  }
  if (roleDefault) {
    const decision = resolveModelForTask(taskType, registry, env);
    return { ...decision, taskType };
  }
  return {
    modelId: getActiveModel(registry) || 'claude-sonnet',
    model: getModelConfig(getActiveModel(registry) || 'claude-sonnet', registry),
    rule: null,
    taskType: 'general',
    reason: 'no role default, using active model',
  };
}

export function resolveModelForTask(taskType, registry, env = process.env) {
  const rule = getRoutingRule(taskType, registry);
  if (!rule) {
    const fallback = getActiveModel(registry) || 'claude-sonnet';
    return {
      modelId: fallback,
      model: getModelConfig(fallback, registry),
      rule: null,
      reason: `no routing rule for taskType="${taskType}", using active model`,
    };
  }

  const envOverride = env?.[`AIOS_MODEL_${String(taskType).toUpperCase().replace(/-/g, '_')}`];
  const modelId = (envOverride ? normalizeId(envOverride) : '') || rule.primary;

  const model = getModelConfig(modelId, registry);
  if (model) {
    return {
      modelId,
      model,
      rule,
      reason: envOverride
        ? `env override AIOS_MODEL_* for taskType="${taskType}"`
        : `primary match for taskType="${taskType}"`,
    };
  }

  return resolveFallback(taskType, registry);
}

function resolveFallback(taskType, registry) {
  const rule = getRoutingRule(taskType, registry);
  if (!rule?.fallback || !Array.isArray(rule.fallback)) {
    return {
      modelId: getActiveModel(registry) || 'claude-sonnet',
      model: getModelConfig(getActiveModel(registry) || 'claude-sonnet', registry),
      rule,
      reason: 'no fallback available, using active model',
    };
  }

  for (const fbId of rule.fallback) {
    const model = getModelConfig(fbId, registry);
    if (model) {
      return {
        modelId: fbId,
        model,
        rule,
        reason: `fallback for taskType="${taskType}" (primary unavailable)`,
      };
    }
  }

  return {
    modelId: getActiveModel(registry) || 'claude-sonnet',
    model: getModelConfig(getActiveModel(registry) || 'claude-sonnet', registry),
    rule,
    reason: 'all fallbacks unavailable, using active model',
  };
}

export function getFallbackChain(taskType, registry) {
  const rule = getRoutingRule(taskType, registry);
  if (!rule?.fallback || !Array.isArray(rule.fallback)) {
    return [];
  }
  return rule.fallback
    .map((id) => getModelConfig(id, registry))
    .filter(Boolean)
    .sort((a, b) => COST_ORDER.indexOf(a.cost) - COST_ORDER.indexOf(b.cost));
}

export function resolveModelForTaskDescription(taskDescription, registry, env = process.env) {
  const scoring = scoreTaskSignals(taskDescription, registry, { env });
  const matchedType = scoring.primaryType || 'general';
  return {
    ...resolveModelForTask(matchedType, registry, env),
    taskType: matchedType,
    profile: scoring.profile,
    confidence: scoring.confidence,
    matchedSignals: scoring.matchedSignals,
    why: scoring.why,
    recommendedPhases: scoring.recommendedPhases,
  };
}
