// 中文注释：客户端 × 角色 → 模型矩阵。全局默认 + 每客户端覆盖，所有角色（含 implementer）可配。
// 解析优先级：env AIOS_MODEL_<ROLE>（显式指令）> 每客户端覆盖 > 全局默认 > 既有 roleDefaults。
// 单一配置源 = registry.clientRoleMatrix。北极星：角色显式声明，无声明不猜，回落既有解析。
import { normalizeEnvKey, normalizeId } from '../entry/shared.mjs';
import { getNativeModelId } from '../entry/registry.mjs';
import { applyClientContract, getModelConfig, resolveModelForRole } from './selection.mjs';

// 纯函数：取出并归一矩阵 {default:{role→model}, clients:{client:{role→model}}}。
export function getClientRoleMatrix(registry) {
  const raw = registry?.clientRoleMatrix || {};
  const normalizeMap = (map) => {
    const out = {};
    for (const [role, modelId] of Object.entries(map || {})) {
      const key = normalizeId(role);
      const model = registry?.targetRefVersion === 1 ? String(modelId ?? '').trim() : normalizeId(modelId);
      if (key && model) out[key] = model;
    }
    return out;
  };
  const clients = {};
  for (const [clientId, map] of Object.entries(raw.clients || {})) {
    const key = normalizeId(clientId);
    if (key) clients[key] = normalizeMap(map);
  }
  return { default: normalizeMap(raw.default), clients };
}

// 纯函数：按优先级解析 (客户端,角色) 的模型来源；未命中矩阵返回 null（调用方回落 roleDefaults）。
export function resolveClientRoleModel(clientId, role, registry, env = process.env) {
  const roleKey = normalizeId(role);
  if (!roleKey) return null;
  const envOverride = env?.[`AIOS_MODEL_${normalizeEnvKey(roleKey)}`];
  if (envOverride && normalizeId(envOverride)) {
    return { modelId: normalizeId(envOverride), source: 'env' };
  }
  const matrix = getClientRoleMatrix(registry);
  const clientKey = normalizeId(clientId);
  const clientModel = clientKey ? matrix.clients[clientKey]?.[roleKey] : '';
  if (clientModel) return { modelId: clientModel, source: 'client' };
  const defaultModel = matrix.default[roleKey];
  if (defaultModel) return { modelId: defaultModel, source: 'default' };
  return null;
}

// 组合解析：矩阵命中 → 构造决策并过客户端契约；未命中 → 回落既有 resolveModelForRole。
// env 来源视为显式指令（客户端契约只能换客户端不能换模型）；矩阵来源允许契约按协议/可用性重定向。
export function resolveModelForClientRole(clientId, role, registry, env = process.env, context = {}) {
  const hit = resolveClientRoleModel(clientId, role, registry, env);
  if (!hit) {
    return resolveModelForRole(role, registry, env, context);
  }
  // The shared matrix resolver also feeds the gateway, which needs the original
  // reference. Decode only at this native-dispatch boundary; env IDs stay raw.
  const modelId = hit.source === 'env' ? hit.modelId : getNativeModelId(hit.modelId, registry);
  const model = getModelConfig(modelId, registry);
  const decision = {
    modelId,
    model,
    rule: null,
    taskType: normalizeId(role),
    explicit: hit.source === 'env',
    reason: `client-role matrix (${hit.source}) role="${normalizeId(role)}" client="${normalizeId(clientId)}"`,
  };
  return applyClientContract(decision, registry, { ...context, clientId });
}
