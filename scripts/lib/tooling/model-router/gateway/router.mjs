// 中文注释：P2 请求级路由——把 (客户端,角色) 经矩阵解析到模型，再经供应商注册表挑上游端点/协议，
// 并判断是否需要协议翻译。任务级（角色→模型）与请求级（模型→可用通道）在此叠加，不互替。
// 关键：网关会翻译协议，所以这里**不套原生协议兼容契约**（那是直派路径用的）——claude 客户端经网关
// 可用 openai-chat 模型，正因网关 bridges 协议。own 模式客户端不接模型分配。纯函数、不联网。
import { resolveClientRoleModel } from '../routing/client-role-matrix.mjs';
import { getProviderForModel, resolveProviderEndpoint, listGatewayModels } from '../routing/providers.mjs';
import { normalizeModelProtocol, modelProtocolSet } from '../routing/protocols.mjs';
import { availabilityForModel } from '../routing/availability.mjs';
import { getActiveModel } from '../entry/registry.mjs';
import { normalizeId, uniq } from '../entry/shared.mjs';
import { getClientModelRouting } from '../../../foundation/clients/registry.mjs';

export class GatewayRouteError extends Error {
  constructor(message, code = 'NO_ROUTE_CONFIGURED') {
    super(message);
    this.name = 'GatewayRouteError';
    this.code = code;
  }
}

// 纯函数：网关路径的候选链 = 矩阵模型 + 角色规则 fallback + activeModel（不做原生协议过滤，网关翻译）。
function gatewayCandidateChain(clientId, role, registry, env) {
  const hit = resolveClientRoleModel(clientId, role, registry, env);
  const roleDefault = registry?.roleDefaults?.[normalizeId(role)];
  const taskType = normalizeId(roleDefault?.taskType) || normalizeId(role);
  const rule = (registry?.routingRules || []).find((r) => normalizeId(r.taskType) === taskType);
  const primary = hit?.modelId || roleDefault?.preferredModel || rule?.primary || '';
  // 中文注释：交互会话无角色声明时，用显式的每客户端默认模型（registry.clientDefaults，由 connect/GUI 写入），
  // 再回落全局 activeModel。这是用户显式配置而非猜意图——让 codex 这类 openai-response 客户端默认拿到同协议模型。
  const clientDefault = normalizeId(role) ? '' : normalizeId(registry?.clientDefaults?.[normalizeId(clientId)]);
  const reason = hit
    ? `client-role matrix (${hit.source}) role="${normalizeId(role)}"`
    : clientDefault
      ? `client default for client="${normalizeId(clientId)}"`
      : `role default for role="${normalizeId(role)}"`;
  return { chain: uniq([primary, clientDefault, ...(rule?.fallback || []), getActiveModel(registry)]), reason };
}

// 纯函数：按通道可用性挑首个非 down 的候选（配额/故障感知）；无可用性证据时取首个。
// context.intentModelId（分类器报出的意图模型）置顶候选链——显式 hint 优先，但仍过可用性，down 则回落。
function resolveGatewayModelId(clientId, role, registry, env, context = {}) {
  const eligible = listGatewayModels(registry, { env, requireCredentials: false });
  if (!eligible.length) throw new GatewayRouteError('No explicitly bound gateway model is configured');
  const { chain, reason } = gatewayCandidateChain(clientId, role, registry, env);
  const intentModelId = normalizeId(context.intentModelId);
  const ordered = intentModelId ? uniq([intentModelId, ...chain]) : eligible.length === 1 ? eligible : chain;
  const availability = context.availability || null;
  for (const modelId of ordered) {
    if (!eligible.includes(modelId)) continue;
    if (availability) {
      const protocols = modelProtocolSet(registry?.models?.[modelId] || {});
      const probe = availabilityForModel(modelId, protocols[0] || '', { availability, now: context.now, limits: context.availabilityLimits });
      if (probe.state === 'down') continue;
    }
    return { modelId, reason: chain.length || intentModelId ? reason : 'single explicitly configured model' };
  }
  throw new GatewayRouteError('No eligible model is selected by the configured route');
}

// 纯函数：产出一条请求的路由决策。needsTranslation=true 时转发层须做 clientProtocol↔targetProtocol 互转。
// intent（可选）是分类器模型报出的意图 {intentId,modelId,description,classifierModel}——self-report 而非猜文本。
export function resolveGatewayRoute({ clientId = '', role = '', registry, env = process.env, clientProtocol = 'claude', context = {}, intent = null } = {}) {
  const from = normalizeModelProtocol(clientProtocol) || 'claude';
  // own 模式客户端（账号绑定）不接模型分配，用它自己的默认。
  if (clientId && getClientModelRouting(clientId) !== 'relay') {
    throw new GatewayRouteError('This client uses its native model, not a gateway route');
  }
  const intentModelId = normalizeId(intent?.modelId);
  const { modelId, reason } = resolveGatewayModelId(clientId, role, registry, env, { ...context, intentModelId });
  const { provider, protocol, upstreamModel } = getProviderForModel(modelId, registry);
  const to = normalizeModelProtocol(protocol) || from;
  // 中文注释：意图模型被可用性选中才算意图路由生效（down 回落到其它候选时不冒充意图）。
  const intentRouted = Boolean(intent) && Boolean(intentModelId) && modelId === intentModelId;
  const finalReason = intentRouted
    ? `intent "${intent.intentId}" classified by ${normalizeId(intent.classifierModel) || 'classifier'} → ${modelId}`
    : reason;
  const decision = {
    modelId, upstreamModel, providerId: provider.id, clientProtocol: from, targetProtocol: to, needsTranslation: from !== to, reason: finalReason,
    ...(intentRouted ? { intent: intent.intentId, classifierModel: normalizeId(intent.classifierModel), intentDescription: intent.description || '' } : {}),
  };
  return {
    modelId,
    upstreamModel,
    providerId: provider.id,
    endpoint: to === 'gemini' && provider.endpointStyle === 'standard'
      ? `${resolveProviderEndpoint(provider, to)}/${encodeURIComponent(upstreamModel.replace(/^models\//u, ''))}:generateContent`
      : resolveProviderEndpoint(provider, to),
    clientProtocol: from,
    targetProtocol: to,
    needsTranslation: from !== to,
    ownDefaultModel: false,
    explicit: false,
    reason: finalReason,
    // 中文注释：决策记录可复核字段——不含密钥/请求正文，供实时路由图消费。
    decision,
  };
}
