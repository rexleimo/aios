// 中文注释：P2 请求级路由——把 (客户端,角色) 经矩阵解析到模型，再经供应商注册表挑上游端点/协议，
// 并判断是否需要协议翻译。任务级（角色→模型）与请求级（模型→可用通道）在此叠加，不互替。
// 关键：网关会翻译协议，所以这里**不套原生协议兼容契约**（那是直派路径用的）——claude 客户端经网关
// 可用 openai-chat 模型，正因网关 bridges 协议。own 模式客户端不接模型分配。纯函数、不联网。
import { resolveClientRoleModel } from '../routing/client-role-matrix.mjs';
import { getProviderForModel, resolveProviderEndpoint } from '../routing/providers.mjs';
import { normalizeModelProtocol } from '../routing/protocols.mjs';
import { getActiveModel } from '../entry/registry.mjs';
import { normalizeId } from '../entry/shared.mjs';
import { getClientModelRouting } from '../../../foundation/clients/registry.mjs';

// 纯函数：网关路径的模型解析——矩阵优先，回落 roleDefaults/routingRule/activeModel，不做原生协议过滤。
function resolveGatewayModelId(clientId, role, registry, env) {
  const hit = resolveClientRoleModel(clientId, role, registry, env);
  if (hit?.modelId) return { modelId: hit.modelId, reason: `client-role matrix (${hit.source}) role="${normalizeId(role)}"` };
  const roleDefault = registry?.roleDefaults?.[normalizeId(role)];
  const taskType = normalizeId(roleDefault?.taskType) || normalizeId(role);
  const rule = (registry?.routingRules || []).find((r) => normalizeId(r.taskType) === taskType);
  const modelId = roleDefault?.preferredModel || rule?.primary || getActiveModel(registry) || '';
  return { modelId, reason: `role default for role="${normalizeId(role)}"` };
}

// 纯函数：产出一条请求的路由决策。needsTranslation=true 时转发层须做 clientProtocol↔targetProtocol 互转。
export function resolveGatewayRoute({ clientId = '', role = '', registry, env = process.env, clientProtocol = 'claude', context = {} } = {}) {
  const from = normalizeModelProtocol(clientProtocol) || 'claude';
  // own 模式客户端（账号绑定）不接模型分配，用它自己的默认。
  if (clientId && getClientModelRouting(clientId) !== 'relay') {
    return { modelId: '', providerId: '', endpoint: '', clientProtocol: from, targetProtocol: from, needsTranslation: false, ownDefaultModel: true, explicit: false, reason: 'client uses own default model', decision: { modelId: '', ownDefaultModel: true } };
  }
  const { modelId, reason } = resolveGatewayModelId(clientId, role, registry, env);
  const { provider, protocol } = getProviderForModel(modelId, registry);
  const to = normalizeModelProtocol(protocol) || from;
  const decision = { modelId, providerId: provider.id, clientProtocol: from, targetProtocol: to, needsTranslation: from !== to, reason };
  return {
    modelId,
    providerId: provider.id,
    endpoint: resolveProviderEndpoint(provider, to),
    clientProtocol: from,
    targetProtocol: to,
    needsTranslation: from !== to,
    ownDefaultModel: false,
    explicit: false,
    reason,
    // 中文注释：决策记录可复核字段——不含密钥/请求正文，供实时路由图消费。
    decision,
  };
}