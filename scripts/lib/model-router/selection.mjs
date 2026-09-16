import { defaultModelRegistry, getActiveModel } from './registry.mjs';
import { COST_ORDER, normalizeEnvKey, normalizeId, uniq } from './shared.mjs';
import { scoreTaskSignals } from './signals.mjs';
import { modelProtocolSet } from './protocols.mjs';
import { availabilityForModel } from './availability.mjs';
import { clientSupportsModelProtocol, getClientModelRouting } from '../clients/registry.mjs';

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

/* ===================== 客户端契约 + 通道可用性过滤 =====================
   中文注释：provider 字段历史上同时表示“上游厂商”和“可启动的客户端”，于是
   resolveModelFor*() 会把 glm-5.1（provider=claude）派给 pi worker，pi 拿到一个
   自己端点上不存在的模型 -> 401。这里补上缺失的那一层判断：一个模型只有在
   “worker 客户端能 speak 它的协议”且“该通道没被判死”时才是可派发的。
   纯函数、不联网；可用性证据由调用方以 context.availability 注入。 */

// 纯函数：worker 客户端能否承载某模型。ownDefault=true 表示该客户端不接模型参数（用它自己的默认）。
export function clientModelCompatibility(clientId = '', modelId = '', registry = defaultModelRegistry()) {
  const client = normalizeId(clientId);
  if (!client) return { compatible: true, ownDefault: false, reason: '' };
  if (getClientModelRouting(client) !== 'relay') {
    return { compatible: true, ownDefault: true, reason: 'client-uses-own-default-model' };
  }
  const config = getModelConfig(modelId, registry) || {};
  const protocols = modelProtocolSet(config);
  if (!protocols.length) return { compatible: true, ownDefault: false, reason: '' };
  const supported = protocols.some((protocol) => clientSupportsModelProtocol(client, protocol));
  return supported
    ? { compatible: true, ownDefault: false, reason: '' }
    : { compatible: false, ownDefault: false, reason: `client-protocol-mismatch:${protocols.join('|')}` };
}

// 纯函数：按“协议兼容 -> 通道可用”顺序走候选链，返回首个可派发项与逐项跳过理由。
export function evaluateModelChain(candidates = [], clientId = '', registry = defaultModelRegistry(), context = {}) {
  const skipped = [];
  const availability = context.availability || null;
  for (const modelId of uniq(candidates.filter(Boolean))) {
    const compat = clientModelCompatibility(clientId, modelId, registry);
    if (compat.ownDefault) return { modelId, ownDefault: true, skipped };
    if (!compat.compatible) {
      skipped.push({ modelId, clientId: normalizeId(clientId), reason: compat.reason });
      continue;
    }
    if (availability) {
      const protocols = modelProtocolSet(getModelConfig(modelId, registry) || {});
      const probe = availabilityForModel(modelId, protocols[0] || '', {
        availability,
        now: context.now,
        limits: context.availabilityLimits,
      });
      if (probe.state === 'down') {
        skipped.push({ modelId, clientId: normalizeId(clientId), reason: `channel-unavailable:${probe.reason || 'down'}` });
        continue;
      }
      if (probe.state === 'degraded') {
        return { modelId, degraded: true, availabilityReason: probe.reason || 'degraded', skipped };
      }
    }
    return { modelId, skipped };
  }
  return { modelId: '', exhausted: true, skipped };
}

// 纯函数：候选链 = 当前模型 + 该任务降级链（decision.rule 或已归一化路由的 decision.fallback）+ activeModel。
function candidateChainFor(decision, registry) {
  const fallback = Array.isArray(decision?.rule?.fallback)
    ? decision.rule.fallback
    : (Array.isArray(decision?.fallback) ? decision.fallback : []);
  // 没有规则可用的角色（未知 role / activeModel 兜底）也要有可退的链，
  // 否则客户端一不匹配就直接 incompatible，worker 连模型都拿不到。
  const generalRule = (decision?.rule?.fallback || decision?.fallback)
    ? null : getRoutingRule('general', registry);
  const generalFallback = generalRule
    ? [generalRule.primary, ...(generalRule.fallback || [])] : [];
  return uniq([decision?.modelId, ...fallback, ...generalFallback, getActiveModel(registry)].filter(Boolean));
}

// 纯函数：把路由结论收敛到“这个 worker 客户端真正能用”的模型；不可用时保留原意图并标注原因。
export function applyClientContract(decision, registry = defaultModelRegistry(), context = {}) {
  const clientId = normalizeId(context.clientId);
  if (!decision || typeof decision !== 'object') return decision;
  // 中文注释：显式声明（-m / AIOS_MODEL_* / role taskModel）是用户指令，不是路由结果。
  // 尊重它的方式是"让能跑这个模型的客户端去跑"，而不是背着他换一个模型。
  if (decision.explicit === true) {
    return { ...decision, contractMode: 'explicit', requestedModelId: decision.modelId };
  }
  if (!clientId) return decision;
  const verdict = evaluateModelChain(candidateChainFor(decision, registry), clientId, registry, context);
  const skipped = verdict.skipped || [];
  if (verdict.ownDefault) {
    return { ...decision, ownDefaultModel: true, skipped, reason: `${decision.reason || ''} [client=${clientId} uses own default model]`.trim() };
  }
  if (verdict.exhausted || !verdict.modelId) {
    const first = skipped[0] || null;
    return {
      ...decision,
      skipped,
      ...(first && String(first.reason).startsWith('client-protocol-mismatch') ? { incompatible: first } : {}),
      ...(skipped.some((item) => String(item.reason).startsWith('channel-unavailable')) ? { channelDown: true } : {}),
      reason: `${decision.reason || ''} [no client-compatible channel for ${clientId}: ${skipped.map((item) => `${item.modelId}=${item.reason}`).join(',') || 'unknown'}]`.trim(),
    };
  }
  if (verdict.modelId === decision.modelId) {
    return {
      ...decision,
      skipped,
      ...(verdict.degraded ? { degradedChannel: true, availabilityReason: verdict.availabilityReason } : {}),
      ...(verdict.degraded ? { reason: `${decision.reason || ''} [channel degraded: ${verdict.availabilityReason}]`.trim() } : {}),
    };
  }
  const model = getModelConfig(verdict.modelId, registry);
  return {
    ...decision,
    modelId: verdict.modelId,
    model,
    requestedModelId: decision.modelId,
    skipped,
    ...(verdict.degraded ? { degradedChannel: true, availabilityReason: verdict.availabilityReason } : {}),
    reason: `${decision.reason || ''} [retarget ${decision.modelId}->${verdict.modelId} for client=${clientId}]`.trim(),
  };
}

function resolveModelForRoleBase(role, registry = defaultModelRegistry(), env = process.env) {
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
        // 中文注释：来自环境变量的角色模型是用户显式指令，客户端契约只能换客户端，不能换模型。
        explicit: true,
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

function resolveModelForTaskBase(taskType, registry, env = process.env) {
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

export function resolveModelForRole(role, registry = defaultModelRegistry(), env = process.env, context = {}) {
  return applyClientContract(resolveModelForRoleBase(role, registry, env), registry, context);
}

export function resolveModelForTask(taskType, registry, env = process.env, context = {}) {
  return applyClientContract(resolveModelForTaskBase(taskType, registry, env), registry, context);
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

export function resolveModelForTaskDescription(taskDescription, registry, env = process.env, context = {}) {
  const scoring = scoreTaskSignals(taskDescription, registry, { env });
  const matchedType = scoring.primaryType || 'general';
  return {
    ...resolveModelForTask(matchedType, registry, env, context),
    taskType: matchedType,
    profile: scoring.profile,
    confidence: scoring.confidence,
    matchedSignals: scoring.matchedSignals,
    why: scoring.why,
    recommendedPhases: scoring.recommendedPhases,
  };
}
