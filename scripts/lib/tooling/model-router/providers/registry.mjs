// 中文注释：供应商注册表——用户可配的上游 provider（endpoint / 密钥 / 协议 / 供应模型）。
// 单一配置源 = registry.providers（memory/specs/model-registry.json）。密钥可直接内联填写（apiKey，
// 落本地配置、UI 打码、绝不写日志），也兼容 env:VAR 引用（apiKeyEnv）；两者都不在决策记录里出现。
// 非法配置 fail-closed 抛错，不静默跑默认。纯函数、不联网。
import { normalizeId, uniq } from '../entry/shared.mjs';
import { MODEL_PROTOCOLS, modelProtocolSet, normalizeModelProtocol, protocolEndpoint, protocolModelsEndpoint, RELAY_BASE_URL } from './protocols.mjs';
import {
  PROVIDER_ENV_REF as ENV_REF, normalizeProviderUrl, normalizeProtocolBaseUrls, protocolBaseEndpoint,
  normalizeProviderHeaders, resolveCustomProviderHeaders, validateProviderAuthHeader, validateProviderCredential,
} from './connections.mjs';

export class ProviderConfigError extends Error {
  constructor(errors, code = 'NO_ROUTE_CONFIGURED') {
    super(`invalid provider config: ${errors.join('; ')}`);
    this.name = 'ProviderConfigError';
    this.errors = errors;
    this.code = code;
  }
}

// Opt-in template only: callers must configure the provider and bind its models explicitly.
export function defaultRelayProvider() {
  return {
    id: 'relay',
    baseUrl: RELAY_BASE_URL,
    apiKeyEnv: 'env:REXAI_API_KEY',
    endpointStyle: 'relay',
    authMode: 'required',
    enabled: true,
    protocols: [...MODEL_PROTOCOLS],
    models: [],
    accounts: [{ id: 'default', apiKeyEnv: 'env:REXAI_API_KEY' }],
  };
}

// 内联密钥的合法形状：非空字符串且不含控制字符（会作为 HTTP 头值发送）。
function inlineCredentialErrors(value, label, errors) {
  if (value === undefined || value === null || value === '') return;
  if (typeof value !== 'string' || !value.trim()) { errors.push(`${label} must be a nonempty string`); return; }
  try { validateProviderCredential(value.trim()); }
  catch (error) { errors.push(`${label}: ${error.message}`); }
}

// 纯函数：校验并归一一个 provider。返回 {ok, errors, provider}；非法 key/env 引用一律拒。
export function validateProvider(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) errors.push('provider must be an object');
  const id = normalizeId(input?.id);
  if (!id) errors.push('id required');
  let baseUrl = '';
  try { baseUrl = normalizeProviderUrl(input?.baseUrl); }
  catch (error) { errors.push(`baseUrl: ${error.message}`); }
  inlineCredentialErrors(input?.apiKey, 'apiKey', errors);
  const apiKey = typeof input?.apiKey === 'string' ? input.apiKey.trim() : input?.apiKey;
  const apiKeyEnv = String(input?.apiKeyEnv || '').trim();
  if (apiKeyEnv && !ENV_REF.test(apiKeyEnv)) errors.push(`apiKeyEnv must be env:VAR: ${apiKeyEnv}`);
  const authMode = input?.authMode === undefined ? 'required' : input.authMode;
  if (authMode !== 'required' && authMode !== 'none') errors.push('authMode must be required or none');
  const enabled = input?.enabled === undefined ? true : input.enabled;
  if (typeof enabled !== 'boolean') errors.push('enabled must be a boolean');
  const endpointStyle = input?.endpointStyle === undefined ? 'relay' : input.endpointStyle;
  if (endpointStyle !== 'relay' && endpointStyle !== 'standard') errors.push('endpointStyle must be relay or standard');
  const rawProtocols = input?.protocols;
  if (rawProtocols !== undefined && !Array.isArray(rawProtocols)) errors.push('protocols must be an array');
  const protocols = uniq((Array.isArray(rawProtocols) ? rawProtocols : []).map(normalizeModelProtocol));
  if (Array.isArray(rawProtocols) && rawProtocols.some((value) => !normalizeModelProtocol(value))) errors.push('unknown protocol');
  if (input && Object.hasOwn(input, 'baseProtocol') && (typeof input.baseProtocol !== 'string' || !normalizeModelProtocol(input.baseProtocol))) {
    errors.push('baseProtocol must be a supported protocol');
  }
  const connection = {};
  for (const [field, normalize] of [
    ['protocolBaseUrls', (value) => normalizeProtocolBaseUrls(value, protocols)],
    ['headers', (value) => normalizeProviderHeaders(value, authMode)],
    ['authHeader', validateProviderAuthHeader],
  ]) {
    if (!input || !Object.hasOwn(input, field)) continue;
    try { connection[field] = normalize(input[field]); }
    catch (error) { errors.push(error.message); }
  }
  if (input?.models !== undefined && !Array.isArray(input.models)) errors.push('models must be an array');
  const models = uniq((Array.isArray(input?.models) ? input.models : []).map(normalizeId));
  if (input?.accounts !== undefined && !Array.isArray(input.accounts)) errors.push('accounts must be an array');
  const accountIds = new Set();
  const accounts = Array.isArray(input?.accounts)
    ? input.accounts.map((a, i) => {
      const accountId = normalizeId(a?.id) || `acct-${i}`;
      if (!a || typeof a !== 'object' || Array.isArray(a)) errors.push(`account ${i}: must be an object`);
      inlineCredentialErrors(a?.apiKey, `account ${accountId} apiKey`, errors);
      if (accountIds.has(accountId)) errors.push(`duplicate account id: ${accountId}`);
      accountIds.add(accountId);
      const inline = typeof a?.apiKey === 'string' ? a.apiKey.trim() : a?.apiKey;
      return { ...a, ...(inline !== undefined ? { apiKey: inline } : {}), id: accountId, apiKeyEnv: String(a?.apiKeyEnv || '').trim() };
    })
    : [];
  for (const a of accounts) {
    if (a.apiKeyEnv && !ENV_REF.test(a.apiKeyEnv)) errors.push(`account ${a.id}: apiKeyEnv must be env:VAR`);
  }
  const normalizedAccounts = accounts.length
    ? accounts
    : (apiKeyEnv ? [{ id: 'default', apiKeyEnv }] : []);
  return {
    ok: errors.length === 0,
    errors,
    provider: { ...input, ...connection, ...(apiKey !== undefined ? { apiKey } : {}), id, baseUrl, apiKeyEnv, authMode, enabled, endpointStyle, protocols, models, accounts: normalizedAccounts },
  };
}

// Validate the entire configured catalog, including disabled providers. Never inject a default.
export function loadProviders(registry) {
  const configured = registry?.providers === undefined ? {} : registry.providers;
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)) {
    throw new ProviderConfigError(['providers must be an object'], 'INVALID_PROVIDER_CONFIG');
  }
  const entries = [];
  const ids = new Set();
  for (const [key, value] of Object.entries(configured)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ProviderConfigError([`[${key}] provider must be an object`], 'INVALID_PROVIDER_CONFIG');
    }
    const result = validateProvider({ ...value, id: key });
    if (!result.ok) throw new ProviderConfigError(result.errors.map((e) => `[${key}] ${e}`), 'INVALID_PROVIDER_CONFIG');
    // Validation keeps legacy normalization; catalog binding preserves registered identities.
    result.provider.models = uniq((value.models || []).map((modelId) =>
      typeof modelId === 'string' && Object.hasOwn(registry?.models || {}, modelId) ? modelId : normalizeId(modelId)));
    if (ids.has(result.provider.id)) throw new ProviderConfigError([`duplicate provider id: ${result.provider.id}`], 'INVALID_PROVIDER_CONFIG');
    ids.add(result.provider.id);
    entries.push([result.provider.id, result.provider]);
  }
  return Object.fromEntries(entries);
}

// 纯函数：按协议拼出该 provider 的上游端点（base 可配，不再硬编码 relay）。
function providerEndpoint(provider, protocol, models = false) {
  if (!provider || provider.enabled === false) {
    throw new ProviderConfigError(['enabled provider with an explicit http(s) baseUrl required']);
  }
  let baseUrl;
  try { baseUrl = normalizeProviderUrl(provider.baseUrl); }
  catch (error) { throw new ProviderConfigError([`baseUrl: ${error.message}`]); }
  const normalized = normalizeModelProtocol(protocol);
  if (!normalized) throw new ProviderConfigError([`unknown protocol: ${protocol}`]);
  if (Object.hasOwn(provider, 'protocolBaseUrls')) {
    try {
      const bases = normalizeProtocolBaseUrls(provider.protocolBaseUrls, provider.protocols);
      if (!Object.hasOwn(bases, normalized)) throw new Error(`protocolBaseUrls.${normalized} required; no baseUrl fallback`);
      return protocolBaseEndpoint(bases[normalized], normalized, models);
    } catch (error) { throw new ProviderConfigError([error.message], 'INVALID_PROVIDER_CONFIG'); }
  }
  const style = provider.endpointStyle === undefined ? 'relay' : provider.endpointStyle;
  if (style === 'standard') {
    if (normalized === 'gemini') {
      const root = baseUrl.endsWith('/v1beta') ? baseUrl : `${baseUrl.replace(/\/v1$/u, '')}/v1beta`;
      return `${root}/models`;
    }
    const root = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
    if (models) return `${root}/models`;
    if (normalized === 'claude') return `${root}/messages`;
    return `${root}/${normalized === 'openai-chat' ? 'chat/completions' : 'responses'}`;
  }
  if (style !== 'relay') throw new ProviderConfigError(['endpointStyle must be relay or standard']);
  const endpoint = models ? protocolModelsEndpoint(normalized, baseUrl) : protocolEndpoint(normalized, baseUrl);
  if (!endpoint) throw new ProviderConfigError([`unknown protocol: ${protocol}`]);
  return endpoint;
}

export function resolveProviderEndpoint(provider, protocol) {
  return providerEndpoint(provider, protocol);
}

export function resolveProviderModelsEndpoint(provider, protocol) {
  return providerEndpoint(provider, protocol, true);
}

// 纯函数：把 env:VAR 引用解析为密钥值；非引用返回空串。
function resolveEnvRef(ref, env) {
  const match = ENV_REF.exec(String(ref || '').trim());
  return match ? String(env?.[match[1]] || '') : '';
}

// 纯函数：解析账号的有效密钥（只返回给转发层，绝不写日志/决策记录）。
// 优先级：账号内联 apiKey > 账号 apiKeyEnv（账号引用一旦填写即权威，不回退）>
// 供应商内联 apiKey > 供应商 apiKeyEnv。内联 key 直接落本地配置，不经过环境变量。
export function resolveProviderApiKey(provider, env = process.env, accountId = null) {
  if (!provider || provider.enabled === false || provider.authMode === 'none') return '';
  const accounts = provider.accounts || [];
  const explicitAccount = accountId !== null && accountId !== undefined;
  const account = explicitAccount ? accounts.find((a) => a.id === accountId) : accounts[0];
  if (explicitAccount && !account && !(accountId === 'default' && accounts.length === 0)) return '';
  const accountInline = String(account?.apiKey || '').trim();
  if (accountInline) return accountInline;
  if (account?.apiKeyEnv) return resolveEnvRef(account.apiKeyEnv, env);
  const providerInline = String(provider?.apiKey || '').trim();
  if (providerInline) return providerInline;
  return resolveEnvRef(provider?.apiKeyEnv, env);
}

// 纯函数：列出 provider 的账号 id。
export function providerAccountIds(provider) {
  const accounts = provider?.accounts || [];
  return accounts.length ? accounts.map((a) => a.id) : ['default'];
}

// Missing credentials are not permission to make an unauthenticated request.
export function readyProviderAccounts(provider, env = process.env) {
  if (!provider || provider.enabled === false) return [];
  if (provider.authMode === 'none') return ['default'];
  return providerAccountIds(provider).filter((id) => resolveProviderApiKey(provider, env, id).trim());
}

// 纯函数：按上游协议挂鉴权头。密钥值只在此处使用，调用方不得记录。转发层与意图分类器共用，避免两处各写一份。
export function providerAuthHeaders(protocol, apiKey) {
  if (!apiKey) return {};
  if (protocol === 'claude') return { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  if (protocol === 'gemini') return { 'x-goog-api-key': apiKey };
  return { authorization: `Bearer ${apiKey}` };
}

// One policy for discovery, classification and forwarding; resolved secrets never leave requests.
export function resolveProviderRequestHeaders(provider, protocol, apiKey, env = process.env) {
  const normalized = normalizeModelProtocol(protocol);
  if (!provider || !normalized) throw new ProviderConfigError(['provider and known protocol required'], 'INVALID_PROVIDER_CONFIG');
  try {
    const choice = Object.hasOwn(provider, 'authHeader') ? validateProviderAuthHeader(provider.authHeader) : 'x-api-key';
    let headers = {};
    if (provider.authMode !== 'none') {
      validateProviderCredential(apiKey);
      headers = providerAuthHeaders(normalized, apiKey);
      if (normalized === 'claude' && choice !== 'x-api-key') {
        if (choice === 'bearer') delete headers['x-api-key'];
        headers.authorization = `Bearer ${apiKey}`;
      }
    }
    return { ...headers, ...resolveCustomProviderHeaders(provider, normalized, env) };
  } catch (error) { throw new ProviderConfigError([error.message], 'INVALID_PROVIDER_CONFIG'); }
}

// Explicit model bindings and provider model lists must never escape to another upstream.
function routeForModel(modelId, registry, providers) {
  const rawId = typeof modelId === 'string' ? modelId : '';
  const id = Object.hasOwn(registry?.models || {}, rawId) ? rawId : normalizeId(modelId);
  const model = Object.hasOwn(registry?.models || {}, id) ? registry.models[id] : null;
  if (!model || typeof model !== 'object' || Array.isArray(model)) {
    throw new ProviderConfigError([`model "${id}": not configured`]);
  }
  if (model.enabled === false) throw new ProviderConfigError([`model "${id}": disabled`]);
  if ((model.protocols !== undefined && (!Array.isArray(model.protocols) || model.protocols.some((proto) => !normalizeModelProtocol(proto))))
    || (model.protocols === undefined && model.protocol !== undefined && !normalizeModelProtocol(model.protocol))) {
    throw new ProviderConfigError([`model "${id}": protocols must be an array of known protocols`]);
  }
  const modelProtocols = modelProtocolSet(model);
  if (!modelProtocols.length) throw new ProviderConfigError([`model "${id}": explicit model protocols required`]);
  const upstreamModel = model.upstreamModel || id;
  if (typeof upstreamModel !== 'string' || !upstreamModel.trim()) {
    throw new ProviderConfigError([`model "${id}": upstreamModel must be a nonempty string`]);
  }
  const selectExplicit = (provider) => {
    if (provider.enabled === false) throw new ProviderConfigError([`model "${id}": provider "${provider.id}" disabled`]);
    const protocol = provider.protocols.find((proto) => modelProtocols.includes(proto));
    if (!protocol) throw new ProviderConfigError([`model "${id}": provider "${provider.id}" has no compatible protocol`]);
    return { provider, protocol, upstreamModel };
  };
  // Curated entries use provider as launcher/client metadata, not an upstream binding.
  const boundModel = model?.source === 'custom' || model?.source === 'discovered';
  if (boundModel && model?.provider !== undefined && typeof model.provider !== 'string') {
    throw new ProviderConfigError([`model "${id}": provider must be a string`]);
  }
  const providerId = boundModel ? normalizeId(model?.provider) : '';
  if (providerId) {
    if (!Object.hasOwn(providers, providerId)) throw new ProviderConfigError([`model "${id}": unknown provider "${providerId}"`]);
    return selectExplicit(providers[providerId]);
  }
  const explicit = Object.values(providers).filter((p) => p.models.includes(id));
  if (explicit.length > 1) {
    throw new ProviderConfigError([`model "${id}": ambiguous provider model lists (${explicit.map((p) => p.id).join(', ')})`]);
  }
  if (explicit.length === 1) return selectExplicit(explicit[0]);
  throw new ProviderConfigError([`model "${id}": no explicit gateway provider configured`]);
}

export function getProviderForModel(modelId, registry) {
  return routeForModel(modelId, registry, loadProviders(registry));
}

export function listGatewayModels(registry, { env = process.env, requireCredentials = true } = {}) {
  // Catalog errors must reject even if there are no models or every model is unroutable.
  const providers = loadProviders(registry);
  return Object.keys(registry?.models || {}).filter((id) => {
    try {
      const { provider } = routeForModel(id, registry, providers);
      return !requireCredentials || readyProviderAccounts(provider, env).length > 0;
    } catch (error) {
      if (error instanceof ProviderConfigError) return false;
      throw error;
    }
  });
}
