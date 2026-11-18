// 中文注释：P2 请求级路由——把 (客户端,角色) 经矩阵解析到模型，再经供应商注册表挑上游端点/协议，
// 并判断是否需要协议翻译。任务级（角色→模型）与请求级（模型→可用通道）在此叠加，不互替。
// 关键：网关会翻译协议，所以这里**不套原生协议兼容契约**（那是直派路径用的）——claude 客户端经网关
// 可用 openai-chat 模型，正因网关 bridges 协议。own 模式客户端不接模型分配。纯函数、不联网。
import { getProviderForModel, resolveProviderEndpoint, listGatewayModels } from '../providers/registry.mjs';
import { normalizeModelProtocol, modelProtocolSet } from '../providers/protocols.mjs';
import { availabilityForModel } from '../routing/availability.mjs';
import { normalizeId, normalizeEnvKey } from '../entry/shared.mjs';
import { getClientModelRouting } from '../../../foundation/clients/registry.mjs';
import { orderedGroupMembers } from '../routing/groups.mjs';
import { parseTargetRef, resolveWireTarget } from '../routing/targets.mjs';

export class GatewayRouteError extends Error {
  constructor(message, code = 'NO_ROUTE_CONFIGURED', status = 503) {
    super(message);
    this.name = 'GatewayRouteError';
    this.code = code;
    this.status = status;
  }
}

function geminiModelPath(model) {
  const segments = model.replace(/^models\//u, '').split('/');
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new GatewayRouteError('Invalid Gemini model path', 'INVALID_UPSTREAM_MODEL');
  }
  // Relays route namespaced IDs by slash; only individual segments are escaped.
  try { return segments.map(segment => encodeURIComponent(segment)).join('/'); }
  catch { throw new GatewayRouteError('Invalid Gemini model path', 'INVALID_UPSTREAM_MODEL'); }
}

// 纯函数：网关路径的候选链 = 矩阵模型 + 角色规则 fallback + activeModel（不做原生协议过滤，网关翻译）。
function gatewayCandidateChain(clientId, role, registry, env) {
  const lookup = (map, key) => Object.entries(map || {}).find(([id]) => normalizeId(id) === normalizeId(key))?.[1];
  const roleKey = normalizeId(role);
  const matrix = registry?.clientRoleMatrix;
  const envModel = roleKey ? env?.[`AIOS_MODEL_${normalizeEnvKey(roleKey)}`] : '';
  const clientModel = roleKey ? lookup(lookup(matrix?.clients, clientId), roleKey) : '';
  const defaultModel = roleKey ? lookup(matrix?.default, roleKey) : '';
  // Do not normalize assignment values: case and encoded ID bytes are significant.
  const hit = envModel ? { modelId: envModel, source: 'env' } : clientModel ? { modelId: clientModel, source: 'client' } : defaultModel ? { modelId: defaultModel, source: 'default' } : null;
  const roleDefault = registry?.roleDefaults?.[normalizeId(role)];
  const taskType = normalizeId(roleDefault?.taskType) || normalizeId(role);
  const rule = (registry?.routingRules || []).find((r) => normalizeId(r.taskType) === taskType);
  const primary = hit?.modelId || roleDefault?.preferredModel || rule?.primary || '';
  // 中文注释：交互会话无角色声明时，用显式的每客户端默认模型（registry.clientDefaults，由 connect/GUI 写入），
  // Fall back to the explicit global activeModel; client identity does not constrain wire translation.
  const clientDefault = roleKey ? '' : lookup(registry?.clientDefaults, clientId);
  const reason = hit
    ? `client-role matrix (${hit.source}) role="${normalizeId(role)}"`
    : clientDefault
      ? `client default for client="${normalizeId(clientId)}"`
      : `role default for role="${normalizeId(role)}"`;
  const values = [primary, clientDefault, ...(rule?.fallback || []), registry?.activeModel];
  const targets = values.map((value) => parseTargetRef(value, registry)).filter((target) => target && target.kind !== 'auto');
  return { chain: [...new Map(targets.map((target) => [target.ref, target])).values()], reason };
}

// 纯函数：按通道可用性挑首个非 down 的候选（配额/故障感知）；无可用性证据时取首个。
// context.intentModelId（分类器报出的意图模型）置顶候选链——显式 hint 优先，但仍过可用性，down 则回落。
export function parseRequestedTarget(value, registry, selectors = {}) {
  const target = resolveWireTarget({ model: value, ...selectors });
  if (!target || target.kind === 'auto') return target;
  const catalog = target.kind === 'group' ? registry?.routingGroups : registry?.models;
  if (!Object.hasOwn(catalog || {}, target.id)) throw new GatewayRouteError('The requested target is not registered', 'UNKNOWN_TARGET', 400);
  return target;
}

function resolveGatewayTarget(clientId, role, registry, env, context = {}, requested = null) {
  const eligible = listGatewayModels(registry, { env, requireCredentials: false });
  const { chain, reason } = requested ? { chain: [], reason: 'explicit request target' } : gatewayCandidateChain(clientId, role, registry, env);
  const intentTarget = requested ? null : parseTargetRef(context.intentModelId, registry);
  const intentModelId = intentTarget?.kind === 'auto' ? null : intentTarget;
  // A configured group must not silently collapse into the old single-model shortcut.
  const configuredGroup = [intentModelId, ...chain].some((target) => target?.kind === 'group');
  const ordered = requested ? [requested] : intentModelId ? [intentModelId, ...chain] : eligible.length === 1 && !configuredGroup ? [{ kind: 'model', id: eligible[0], ref: `model:${encodeURIComponent(eligible[0])}` }] : chain;
  const availability = context.availability || null;
  for (const target of ordered) {
    const groupId = target.kind === 'group' ? target.id : null;
    const members = groupId !== null ? orderedGroupMembers(registry, groupId) : [target.id];
    const modelIds = members.filter((modelId) => {
      if (!eligible.includes(modelId)) return false;
      if (!availability) return true;
      const protocols = modelProtocolSet(registry?.models?.[modelId] || {});
      const probe = availabilityForModel(modelId, protocols[0] || '', { availability, now: context.now, limits: context.availabilityLimits });
      return probe.state !== 'down';
    });
    if (modelIds.length) return { modelIds, groupId, routing: groupId !== null ? (registry.routingGroups[groupId]?.routing || 'ordered') : undefined, targetRef: target.ref, explicit: Boolean(requested), reason: requested ? 'explicit request target' : chain.length || intentModelId ? reason : 'single explicitly configured model' };
    if (groupId !== null || requested) throw new GatewayRouteError('The selected target has no eligible model members');
  }
  throw new GatewayRouteError('No eligible model is selected by the configured route');
}

// 纯函数：产出一条请求的路由决策。needsTranslation=true 时转发层须做 clientProtocol↔targetProtocol 互转。
// intent（可选）是分类器模型报出的意图 {intentId,modelId,description,classifierModel}——self-report 而非猜文本。
export function resolveGatewayRoutes({ clientId = '', role = '', registry, env = process.env, clientProtocol = 'claude', context = {}, intent = null, requestedModel, headerTargets = [], pathModel } = {}) {
  const from = normalizeModelProtocol(clientProtocol) || 'claude';
  // own 模式客户端（账号绑定）不接模型分配，用它自己的默认。
  if (clientId && getClientModelRouting(clientId) !== 'relay') {
    throw new GatewayRouteError('This client uses its native model, not a gateway route');
  }
  const wireTarget = parseRequestedTarget(requestedModel, registry, { headerTargets, pathModel });
  const requested = wireTarget?.kind === 'auto' ? null : wireTarget;
  const intentModelId = intent?.modelId || '';
  const target = resolveGatewayTarget(clientId, role, registry, env, { ...context, intentModelId }, requested);
  return target.modelIds.map((modelId) => {
  const { provider, protocol, upstreamModel } = getProviderForModel(modelId, registry);
  // Prefer native wire compatibility when the same bound model/provider offers it.
  const nativeAvailable = provider.protocols.includes(from) && modelProtocolSet(registry?.models?.[modelId] || {}).includes(from);
  const to = nativeAvailable ? from : normalizeModelProtocol(protocol) || from;
  // 中文注释：意图模型被可用性选中才算意图路由生效（down 回落到其它候选时不冒充意图）。
  const intentRouted = !requested && Boolean(intentModelId) && target.targetRef === parseTargetRef(intentModelId, registry)?.ref;
  // 中文注释：意图模型已报出但未被选中（不在候选/已下线）→ 显式记录回落，绝不静默切到默认路由。
  // 凭据缺失导致的 qualify 失败在 proxy 的转发层捕获并补记；这里覆盖「目标不可路由」这一支。
  const intentFallback = !requested && intentModelId && !intentRouted ? {
    stage: 'qualify',
    reason: `Intent model ${intent.modelId} is not available for routing; fell back to ${modelId}`,
    originalIntentId: intent.intentId,
    originalModelId: intent.modelId,
    fallbackModelId: modelId,
  } : null;
  const finalReason = intentRouted
    ? `intent "${intent.intentId}" classified by ${normalizeId(intent.classifierModel) || 'classifier'} → ${modelId}`
    : target.reason;
  const decision = {
    modelId, upstreamModel, providerId: provider.id, clientProtocol: from, targetProtocol: to, needsTranslation: from !== to, reason: finalReason,
    targetRef: target.targetRef, targetKind: target.groupId !== null ? 'group' : 'model', explicit: target.explicit,
    ...(target.groupId !== null ? { groupId: target.groupId, routing: target.routing || 'ordered' } : {}),
    ...(intentRouted ? { intent: intent.intentId, classifierModel: normalizeId(intent.classifierModel), intentDescription: intent.description || '', ...(typeof intent.confidence === 'number' ? { confidence: intent.confidence } : {}) } : {}),
    ...(intentFallback ? { intentFallback } : {}),
  };
  return {
    modelId,
    upstreamModel,
    providerId: provider.id,
    endpoint: to === 'gemini' && (Object.hasOwn(provider, 'protocolBaseUrls') || provider.endpointStyle === 'standard')
      ? `${resolveProviderEndpoint(provider, to)}/${geminiModelPath(upstreamModel)}:${context.stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`
      : resolveProviderEndpoint(provider, to),
    clientProtocol: from,
    targetProtocol: to,
    needsTranslation: from !== to,
    ownDefaultModel: false,
    explicit: target.explicit,
    targetRef: target.targetRef,
    groupId: target.groupId,
    routing: target.groupId !== null ? (target.routing || 'ordered') : undefined,
    reason: finalReason,
    // 中文注释：决策记录可复核字段——不含密钥/请求正文，供实时路由图消费。
    decision,
  };
  });
}

export function resolveGatewayRoute(options = {}) {
  return resolveGatewayRoutes(options)[0];
}
