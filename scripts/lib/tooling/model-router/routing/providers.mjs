// 中文注释：供应商注册表——用户可配的上游 provider（endpoint / 密钥 env 引用 / 协议 / 供应模型）。
// 单一配置源 = registry.providers（memory/specs/model-registry.json）。密钥只允许 env:VAR 引用，
// 绝不接受明文 key；非法配置 fail-closed 抛错，不静默跑默认。纯函数、不联网。
import { normalizeId, uniq } from '../entry/shared.mjs';
import { MODEL_PROTOCOLS, normalizeModelProtocol, protocolEndpoint, RELAY_BASE_URL } from './protocols.mjs';

const ENV_REF = /^env:([A-Za-z_][A-Za-z0-9_]*)$/u;
const HTTP_URL = /^https?:\/\/.+/u;

export class ProviderConfigError extends Error {
  constructor(errors) {
    super(`invalid provider config: ${errors.join('; ')}`);
    this.name = 'ProviderConfigError';
    this.errors = errors;
  }
}

// 纯函数：内置 relay provider（默认上游）。models 留空 = 按协议供应 registry 里的模型。
export function defaultRelayProvider() {
  return {
    id: 'relay',
    baseUrl: RELAY_BASE_URL,
    apiKeyEnv: 'env:REXAI_API_KEY',
    protocols: [...MODEL_PROTOCOLS],
    models: [],
  };
}

// 纯函数：校验并归一一个 provider。返回 {ok, errors, provider}；明文 key/非法 env 引用一律拒。
export function validateProvider(input) {
  const errors = [];
  const id = normalizeId(input?.id);
  if (!id) errors.push('id required');
  const baseUrl = String(input?.baseUrl || '').trim().replace(/\/+$/u, '');
  if (!HTTP_URL.test(baseUrl)) errors.push(`baseUrl must be http(s): ${input?.baseUrl || '(empty)'}`);
  if (input?.apiKey) errors.push('plaintext apiKey forbidden; use apiKeyEnv="env:VAR"');
  const apiKeyEnv = String(input?.apiKeyEnv || '').trim();
  if (apiKeyEnv && !ENV_REF.test(apiKeyEnv)) errors.push(`apiKeyEnv must be env:VAR: ${apiKeyEnv}`);
  const protocols = uniq((Array.isArray(input?.protocols) ? input.protocols : []).map(normalizeModelProtocol));
  if (input?.protocols && !protocols.length) errors.push('protocols listed but none valid');
  const models = uniq((Array.isArray(input?.models) ? input.models : []).map(normalizeId));
  return {
    ok: errors.length === 0,
    errors,
    provider: { id, baseUrl, apiKeyEnv, protocols, models },
  };
}

// 副作用-free：合并内置 relay + registry.providers，逐个校验；任一非法即 fail-closed 抛错。
export function loadProviders(registry) {
  const merged = { relay: defaultRelayProvider() };
  const configured = registry?.providers || {};
  for (const [key, value] of Object.entries(configured)) {
    const result = validateProvider({ id: key, ...value });
    if (!result.ok) throw new ProviderConfigError(result.errors.map((e) => `[${key}] ${e}`));
    merged[result.provider.id] = result.provider;
  }
  return merged;
}

// 纯函数：按协议拼出该 provider 的上游端点（base 可配，不再硬编码 relay）。
export function resolveProviderEndpoint(provider, protocol) {
  return protocolEndpoint(protocol, provider?.baseUrl || RELAY_BASE_URL);
}

// 纯函数：解析 env:VAR 引用为密钥值（只返回给转发层，绝不写日志/决策记录）。
export function resolveProviderApiKey(provider, env = process.env) {
  const match = ENV_REF.exec(String(provider?.apiKeyEnv || '').trim());
  return match ? String(env?.[match[1]] || '') : '';
}

// 纯函数：为一个模型挑供应商与协议。优先显式 models 命中，其次协议交集，最后回落 relay。
export function getProviderForModel(modelId, registry) {
  const id = normalizeId(modelId);
  const providers = loadProviders(registry);
  const modelProtocols = uniq((registry?.models?.[id]?.protocols || []).map(normalizeModelProtocol));
  const list = Object.values(providers);
  const explicit = list.find((p) => p.models.includes(id));
  if (explicit) {
    const protocol = explicit.protocols.find((proto) => modelProtocols.includes(proto)) || explicit.protocols[0] || modelProtocols[0] || '';
    return { provider: explicit, protocol };
  }
  const byProtocol = list.find((p) => p.protocols.some((proto) => modelProtocols.includes(proto)));
  if (byProtocol) {
    const protocol = byProtocol.protocols.find((proto) => modelProtocols.includes(proto)) || modelProtocols[0] || '';
    return { provider: byProtocol, protocol };
  }
  const relay = providers.relay;
  return { provider: relay, protocol: modelProtocols[0] || relay.protocols[0] || '' };
}