// apps/shell/ui/src/lib/config/model-routing.mjs — 模型路由配置（供应商注册表 + 客户端×角色矩阵）的编辑尺子。
//
// 单一配置源 = model-registry.json 的 providers / clientRoleMatrix 两段；CLI/网关/GUI 读写同一份。
// 自包含（不 import scripts/lib，避免 Turbopack 整仓 trace）；校验规则与 routing/providers.mjs 一致。
// 三条守卫同 host-capabilities：密钥只允许 env:VAR（明文拒）、写前备份、写后校验。
export class ConfigError extends Error {
  constructor(message, path = null) {
    super(message);
    this.name = 'ConfigError';
    this.path = path;
  }
}

const ENV_REF = /^env:([A-Za-z_][A-Za-z0-9_]*)$/u;
const HTTP_URL = /^https?:\/\/.+/u;
const PROTOCOLS = Object.freeze(['openai-chat', 'openai-response', 'claude', 'gemini']);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
// Keep protocol aliases in sync with routing/protocols.mjs without tracing scripts/lib into Next.
function normalizeProtocol(value) {
  const token = String(value || '').trim().toLowerCase().replace(/[._]/g, '-');
  if (token.includes('anthropic') || token === 'claude' || token === 'messages') return 'claude';
  if (token.includes('responses') || token === 'openai-response' || token === 'responses-api') return 'openai-response';
  if (token.includes('gemini') || token === 'google') return 'gemini';
  if (token.includes('completion') || ['openai-chat', 'openai', 'compatible'].includes(token)) return 'openai-chat';
  return PROTOCOLS.includes(token) ? token : '';
}

export function parseDocument(text) {
  let document;
  try {
    document = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`registry is not valid JSON: ${error.message}`);
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new ConfigError('registry must be a JSON object');
  }
  return document;
}

/** 投影成界面可编辑的形状：providers 列表 + matrix（default/clients）+ intentRouting。 */
export function toEditable(document) {
  const providers = Object.entries(document.providers || {}).map(([id, p]) => ({
    id,
    baseUrl: String(p?.baseUrl || ''),
    apiKeyEnv: String(p?.apiKeyEnv || ''),
    authMode: p?.authMode ?? 'required',
    endpointStyle: p?.endpointStyle ?? 'relay',
    ...(p?.enabled !== undefined ? { enabled: p.enabled } : {}),
    protocols: Array.isArray(p?.protocols) ? [...p.protocols] : [],
    models: Array.isArray(p?.models) ? [...p.models] : [],
    accounts: Array.isArray(p?.accounts) ? p.accounts.map((a, i) => ({ id: lower(a?.id) || `acct-${i}`, apiKeyEnv: String(a?.apiKeyEnv || '') })) : [],
  }));
  const matrix = document.clientRoleMatrix || {};
  const intent = document.intentRouting;
  return {
    providers,
    customModels: Object.entries(document.models || {})
      .filter(([, m]) => m?.source === 'custom')
      .map(([id, m]) => ({
        id,
        label: String(m?.label || id),
        protocols: Array.isArray(m?.protocols) ? [...m.protocols] : [],
        provider: String(m?.provider || ''),
        upstreamModel: String(m?.upstreamModel ?? id),
        ...(m?.enabled !== undefined ? { enabled: m.enabled } : {}),
      })),
    matrix: { default: { ...(matrix.default || {}) }, clients: Object.fromEntries(Object.entries(matrix.clients || {}).map(([id, roles]) => [id, { ...roles }])) },
    routingGroups: Object.entries(document.routingGroups || {}).map(([id, g]) => ({
      id,
      models: Array.isArray(g?.models) ? [...g.models] : [],
      routing: String(g?.routing || 'smart'),
    })),
    intentRouting: {
      enabled: Boolean(intent) && intent.enabled !== false,
      classifierModel: String(intent?.classifierModel || ''),
      intents: (Array.isArray(intent?.intents) ? intent.intents : []).map((item) => ({
        id: String(item?.id || ''),
        description: String(item?.description || ''),
        modelId: String(item?.modelId || ''),
      })),
    },
  };
}

export function validateDocument(document, { previousDocument } = {}) {
  if (document.providers !== undefined && !isRecord(document.providers)) throw new ConfigError('providers must be an object', 'providers');
  const providers = new Map();
  const seen = new Set();
  for (const [id, p] of Object.entries(document.providers || {})) {
    if (!lower(id) || seen.has(lower(id))) throw new ConfigError(`duplicate or empty provider id "${id}"`, `providers.${id}`);
    seen.add(lower(id));
    if (!isRecord(p)) throw new ConfigError(`provider "${id}" must be an object`, `providers.${id}`);
    if (p.authMode !== undefined && !['required', 'none'].includes(p.authMode)) throw new ConfigError(`provider "${id}": authMode must be required or none`, `providers.${id}.authMode`);
    if (p.endpointStyle !== undefined && !['standard', 'relay'].includes(p.endpointStyle)) throw new ConfigError(`provider "${id}": endpointStyle must be standard or relay`, `providers.${id}.endpointStyle`);
    if (p.enabled !== undefined && typeof p.enabled !== 'boolean') throw new ConfigError(`provider "${id}": enabled must be a boolean`, `providers.${id}.enabled`);
    if (p?.apiKey) throw new ConfigError(`provider "${id}": plaintext apiKey forbidden; use apiKeyEnv="env:VAR"`, `providers.${id}.apiKey`);
    if (!HTTP_URL.test(String(p?.baseUrl || '').trim())) throw new ConfigError(`provider "${id}": baseUrl must be http(s)`, `providers.${id}.baseUrl`);
    if (p?.apiKeyEnv && !ENV_REF.test(String(p.apiKeyEnv).trim())) throw new ConfigError(`provider "${id}": apiKeyEnv must be env:VAR`, `providers.${id}.apiKeyEnv`);
    if (p.accounts !== undefined && !Array.isArray(p.accounts)) throw new ConfigError(`provider "${id}": accounts must be an array`, `providers.${id}.accounts`);
    const accountIds = new Set();
    for (const [i, a] of (p.accounts || []).entries()) {
      const at = `providers.${id}.accounts`;
      if (!isRecord(a)) throw new ConfigError(`provider "${id}": account must be an object`, at);
      const accountId = lower(a.id) || `acct-${i}`;
      if (accountIds.has(accountId)) throw new ConfigError(`provider "${id}": duplicate account id "${accountId}"`, at);
      accountIds.add(accountId);
      if (a.apiKey) throw new ConfigError(`provider "${id}" account "${accountId}": plaintext apiKey forbidden`, at);
      if (a.apiKeyEnv && !ENV_REF.test(String(a.apiKeyEnv).trim())) throw new ConfigError(`provider "${id}" account "${accountId}": apiKeyEnv must be env:VAR`, at);
    }
    if (p.protocols !== undefined && !Array.isArray(p.protocols)) throw new ConfigError(`provider "${id}": protocols must be an array`, `providers.${id}.protocols`);
    if (p.models !== undefined && !Array.isArray(p.models)) throw new ConfigError(`provider "${id}": models must be an array`, `providers.${id}.models`);
    for (const proto of p?.protocols || []) {
      if (!normalizeProtocol(proto)) throw new ConfigError(`provider "${id}": unknown protocol "${proto}"`, `providers.${id}.protocols`);
    }
    providers.set(lower(id), { id: lower(id), protocols: (p.protocols || []).map(normalizeProtocol), models: (p.models || []).map(lower) });
  }
  for (const [id, m] of Object.entries(document.models || {})) {
    if (m?.enabled !== undefined && typeof m.enabled !== 'boolean') throw new ConfigError(`model "${id}": enabled must be a boolean`, `models.${id}.enabled`);
    if (m?.source === 'custom' || m?.source === 'discovered') {
      if (m.upstreamModel !== undefined && (typeof m.upstreamModel !== 'string' || !m.upstreamModel.trim())) throw new ConfigError(`model "${id}": upstreamModel must be a nonempty string`, `models.${id}.upstreamModel`);
      if (m.protocols !== undefined && !Array.isArray(m.protocols)) throw new ConfigError(`custom model "${id}": protocols must be an array`, `models.${id}.protocols`);
      for (const proto of m?.protocols || []) {
        if (!normalizeProtocol(proto)) throw new ConfigError(`custom model "${id}": unknown protocol "${proto}"`, `models.${id}.protocols`);
      }
    }
    // Curated provider fields identify native launchers; only these sources bind upstreams.
    const boundModel = m?.source === 'custom' || m?.source === 'discovered';
    if (boundModel && m?.provider !== undefined && typeof m.provider !== 'string') throw new ConfigError(`model "${id}": provider must be a string`, `models.${id}.provider`);
    const providerId = boundModel ? lower(m?.provider) : '';
    const matches = [...providers.values()].filter((p) => p.models.includes(lower(id)));
    const provider = providerId ? providers.get(providerId) : matches.length === 1 ? matches[0] : null;
    if (!boundModel || (!providerId && !provider)) continue;
    if (!provider) throw new ConfigError(`model "${id}": unknown provider "${m.provider}"`, `models.${id}.provider`);
    const protocols = (Array.isArray(m.protocols) ? m.protocols : [m.protocol]).map(normalizeProtocol).filter(Boolean);
    if (!provider.protocols.some((proto) => protocols.includes(proto))) {
      throw new ConfigError(`model "${id}": provider "${provider.id}" has no compatible protocol`, `models.${id}.provider`);
    }
  }
  validateClientRoleMatrix(document.clientRoleMatrix, document.models || {}, previousDocument?.clientRoleMatrix);
  validateRoutingGroups(document, previousDocument);
  validateIntentRouting(document, previousDocument);
  if (previousDocument) validateRoutingChanges(previousDocument, document);
}

function validateClientRoleMatrix(matrix, models, previous) {
  if (matrix === undefined) return;
  const objectAt = (value, at) => {
    if (!isRecord(value)) throw new ConfigError(`${at} must be an object`, at);
  };
  const rolesAt = (roles, at, oldRoles) => {
    objectAt(roles, at);
    for (const [role, modelId] of Object.entries(roles)) {
      const path = `${at}.${role}`;
      if (!role.trim() || typeof modelId !== 'string') throw new ConfigError(`${path} must be a model id string (empty means inherit)`, path);
      if (models && lower(modelId) && lower(oldRoles?.[role]) !== lower(modelId) && !Object.hasOwn(models, lower(modelId))) throw new ConfigError(`${path}: unknown model "${modelId}"`, path);
    }
  };
  objectAt(matrix, 'clientRoleMatrix');
  if (matrix.default !== undefined) rolesAt(matrix.default, 'clientRoleMatrix.default', previous?.default);
  if (matrix.clients !== undefined) {
    objectAt(matrix.clients, 'clientRoleMatrix.clients');
    for (const [client, roles] of Object.entries(matrix.clients)) {
      if (!client.trim()) throw new ConfigError('clientRoleMatrix.clients: client id required', 'clientRoleMatrix.clients');
      rolesAt(roles, `clientRoleMatrix.clients.${client}`, previous?.clients?.[client]);
    }
  }
}

function validateRoutingGroups(document, previous) {
  const groups = document.routingGroups;
  if (groups === undefined) return;
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) throw new ConfigError('routingGroups must be an object', 'routingGroups');
  for (const [id, group] of Object.entries(groups)) {
    const at = `routingGroups.${id}`;
    if (!id.trim() || !group || typeof group !== 'object' || Array.isArray(group)) throw new ConfigError(`${at}: group must be an object with an id`, at);
    if (group.models !== undefined && !Array.isArray(group.models)) throw new ConfigError(`${at}.models must be an array`, `${at}.models`);
    for (const modelId of group.models || []) {
      if (typeof modelId !== 'string' || !modelId.trim() || (!previous?.routingGroups?.[id]?.models?.includes(modelId) && !Object.hasOwn(document.models || {}, modelId))) {
        throw new ConfigError(`${at}: unknown or empty model "${modelId}"`, `${at}.models`);
      }
    }
    // Stored mode names are opaque metadata, not implemented gateway strategies.
    // groups.mjs permits empty groups and declares no mode enum.
    if (group.routing !== undefined && (typeof group.routing !== 'string' || !group.routing.trim())) {
      throw new ConfigError(`${at}.routing must be a nonempty string`, `${at}.routing`);
    }
  }
}

// 分类器只会说 openai-chat / claude（与 routing/intent.mjs 的 classifierRequestBody 对齐）。
const CLASSIFIER_PROTOCOLS = Object.freeze(['openai-chat', 'claude']);

function validateIntentRouting(document, previous) {
  const intent = document.intentRouting;
  if (intent === undefined) return;
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw new ConfigError('intentRouting must be an object', 'intentRouting');
  if (intent.enabled !== undefined && typeof intent.enabled !== 'boolean') throw new ConfigError('intentRouting.enabled must be a boolean', 'intentRouting.enabled');
  const models = document.models || {};
  const intents = Array.isArray(intent.intents) ? intent.intents : [];
  const unchanged = previous && JSON.stringify(toEditable(previous).intentRouting) === JSON.stringify(toEditable(document).intentRouting);
  if (unchanged) return;
  const enabling = intent.enabled !== false && (!previous?.intentRouting || previous.intentRouting.enabled === false);
  if (intent.enabled !== false) {
    const classifierModel = String(intent.classifierModel || '').trim();
    if (!classifierModel) throw new ConfigError('intentRouting.classifierModel required when enabled', 'intentRouting.classifierModel');
    if (enabling || lower(classifierModel) !== lower(previous?.intentRouting?.classifierModel)) {
      if (!Object.hasOwn(models, classifierModel)) throw new ConfigError(`intentRouting.classifierModel: unknown model "${classifierModel}"`, 'intentRouting.classifierModel');
      const protocols = (Array.isArray(models[classifierModel].protocols) ? models[classifierModel].protocols : []).map(normalizeProtocol);
      if (!protocols.some((proto) => CLASSIFIER_PROTOCOLS.includes(proto))) {
        throw new ConfigError(`classifier model "${classifierModel}" must support openai-chat or claude`, 'intentRouting.classifierModel');
      }
    }
    if (intents.length === 0) throw new ConfigError('intentRouting.intents must list at least one intent when enabled', 'intentRouting.intents');
  }
  const seen = new Set();
  for (const [index, item] of intents.entries()) {
    const at = `intentRouting.intents[${index}]`;
    const id = String(item?.id || '').trim();
    if (!id) throw new ConfigError(`${at}: id required`, at);
    if (seen.has(id)) throw new ConfigError(`${at}: duplicate intent id "${id}"`, at);
    seen.add(id);
    if (!String(item?.description || '').trim()) throw new ConfigError(`${at}: description required (the classifier reads it)`, at);
    const modelId = String(item?.modelId || '').trim();
    if (!modelId) throw new ConfigError(`${at}: modelId required`, at);
    const oldModelId = previous?.intentRouting?.intents?.find((old) => lower(old?.id) === lower(id))?.modelId;
    if ((enabling || lower(oldModelId) !== lower(modelId)) && !Object.hasOwn(models, modelId)) throw new ConfigError(`${at}: unknown model "${modelId}"`, at);
  }
}

function keyedRows(rows, path, normalize = (value) => String(value || '').trim()) {
  if (!Array.isArray(rows)) throw new ConfigError(`${path} must be an array`, path);
  const seen = new Set();
  return rows.map((row) => {
    const id = normalize(row?.id);
    if (!id) throw new ConfigError(`${path}: id required`, path);
    const key = lower(id);
    if (seen.has(key)) throw new ConfigError(`${path}: duplicate id "${id}"`, path);
    seen.add(key);
    return [id, row];
  });
}

/** Apply projected fields over existing metadata; omitted optional sections remain untouched. */
export function applyEdits(document, editable) {
  const next = { ...document };
  const providers = Object.fromEntries(keyedRows(editable?.providers ?? [], 'providers', lower).map(([id, p]) => {
    const previous = Object.entries(document.providers || {}).find(([key]) => lower(key) === id)?.[1] || {};
    if (p.apiKey) throw new ConfigError(`provider "${id}": plaintext apiKey forbidden`, `providers.${id}.apiKey`);
    const provider = {
      ...previous,
      baseUrl: String(p.baseUrl || ''),
      protocols: Array.isArray(p.protocols) ? [...p.protocols] : (p.protocols === undefined ? [] : p.protocols),
      models: Array.isArray(p.models) ? [...p.models] : (p.models === undefined ? [] : p.models),
    };
    if (p.authMode !== undefined && (p.authMode !== 'required' || previous.authMode !== undefined)) provider.authMode = p.authMode;
    if (p.endpointStyle !== undefined && (p.endpointStyle !== 'relay' || previous.endpointStyle !== undefined)) provider.endpointStyle = p.endpointStyle;
    if (p.enabled !== undefined) provider.enabled = p.enabled;
    if (String(p.apiKeyEnv || '').trim()) provider.apiKeyEnv = String(p.apiKeyEnv).trim();
    else delete provider.apiKeyEnv;
    if (p.accounts !== undefined) {
      if (!Array.isArray(p.accounts)) throw new ConfigError(`provider "${id}": accounts must be an array`, `providers.${id}.accounts`);
      provider.accounts = p.accounts.map((account, i) => {
        if (!isRecord(account) || account.apiKey) throw new ConfigError(`provider "${id}": account must be an object without plaintext apiKey`, `providers.${id}.accounts`);
        return {
          ...(previous.accounts || []).find((old, index) => (lower(old?.id) || `acct-${index}`) === (lower(account?.id) || `acct-${i}`)),
          id: lower(account?.id) || `acct-${i}`,
          apiKeyEnv: String(account?.apiKeyEnv || '').trim(),
        };
      });
      if (!provider.accounts.length) delete provider.accounts;
    }
    return [id, provider];
  }));
  next.providers = providers;
  validateClientRoleMatrix(editable?.matrix);
  // 中文注释：清空的角色覆盖（空串）落盘前剪掉，避免 {implementer:''} 这类残留；空客户端整段移除。
  const pruneMap = (map) => Object.fromEntries(Object.entries(map || {}).filter(([, v]) => String(v || '').trim()));
  const clients = {};
  for (const [clientId, roles] of Object.entries(editable?.matrix?.clients || {})) {
    const pruned = pruneMap(roles);
    if (Object.keys(pruned).length) clients[clientId] = pruned;
  }
  if (editable?.routingGroups !== undefined && JSON.stringify(editable.routingGroups) !== JSON.stringify(toEditable(document).routingGroups)) {
    next.routingGroups = Object.fromEntries(keyedRows(editable.routingGroups, 'routingGroups').map(([id, group]) => [id, {
      ...document.routingGroups?.[id],
      models: Array.isArray(group.models) ? [...group.models] : (group.models === undefined ? [] : group.models),
      routing: group.routing === undefined ? 'smart' : group.routing,
    }]));
  }

  if (editable?.matrix !== undefined && JSON.stringify(editable.matrix) !== JSON.stringify(toEditable(document).matrix)) next.clientRoleMatrix = {
    ...document.clientRoleMatrix,
    default: pruneMap(editable?.matrix?.default),
    clients,
  };
  // 中文注释：意图段——id/模型归一小写（与运行时 normalizeId 一致），全空行剪掉；
  // editable 没带这段（旧客户端）则保留文档原样，不静默删配置。
  const intent = editable?.intentRouting;
  if (intent !== undefined && JSON.stringify(intent) !== JSON.stringify(toEditable(document).intentRouting)) {
    next.intentRouting = {
      ...document.intentRouting,
      enabled: intent.enabled !== false,
      classifierModel: lower(intent.classifierModel),
      intents: (Array.isArray(intent.intents) ? intent.intents : [])
        .map((item) => ({
          ...(document.intentRouting?.intents || []).find((old) => lower(old?.id) === lower(item?.id)),
          id: lower(item?.id), description: String(item?.description || '').trim(), modelId: lower(item?.modelId),
        }))
        .filter((item) => item.id || item.description || item.modelId),
    };
  }
  // 中文注释：自定义模型——只重建 source==='custom' 的条目，curated/discovered 一律保留（含能力画像）。
  // editable 没带这段（旧客户端）则保留文档原样，不静默删配置。
  if (editable?.customModels !== undefined) {
    const preserved = Object.entries(document.models || {}).filter(([, model]) => model?.source !== 'custom');
    const protectedIds = new Set(preserved.map(([id]) => lower(id)));
    const custom = keyedRows(editable.customModels, 'customModels', lower).map(([id, cm]) => {
      if (protectedIds.has(id)) throw new ConfigError(`custom model "${id}": cannot overwrite a curated or discovered model`, `models.${id}`);
      const model = {
        cost: 'unknown',
        speed: 'unknown',
        contextWindow: 'unknown',
        ...document.models?.[id],
        protocols: Array.isArray(cm.protocols) ? [...cm.protocols] : (cm.protocols === undefined ? [] : cm.protocols),
        ...(lower(cm?.provider) ? { provider: lower(cm.provider) } : {}),
        label: String(cm?.label || id),
        source: 'custom',
      };
      if (!lower(cm?.provider)) delete model.provider;
      const previous = document.models?.[id];
      const upstreamModel = String(cm.upstreamModel ?? previous?.upstreamModel ?? cm.id).trim();
      if (cm.upstreamModel !== undefined || !previous) {
        if (!upstreamModel) throw new ConfigError(`model "${id}": upstreamModel required`, `models.${id}.upstreamModel`);
        if (!previous || previous.upstreamModel !== undefined || upstreamModel !== id) model.upstreamModel = upstreamModel;
      }
      if (cm.enabled !== undefined) model.enabled = cm.enabled;
      const bindingChanged = !previous || lower(previous.provider) !== lower(model.provider)
        || JSON.stringify(previous.protocols || []) !== JSON.stringify(model.protocols)
        || String(previous.upstreamModel ?? id) !== upstreamModel || (previous.enabled === false && model.enabled !== false);
      if (bindingChanged && !lower(model.provider)) throw new ConfigError(`model "${id}": select an explicitly configured provider`, `models.${id}.provider`);
      return [id, model];
    });
    next.models = Object.fromEntries([...preserved, ...custom]);
  }
  validateRoutingChanges(document, next);
  return next;
}

// Unchanged legacy references are inert metadata; new selections must be explicitly bound.
function validateRoutingChanges(before, after) {
  const catalog = new Map(toModelCatalog(after).map((model) => [lower(model.id), model]));
  const retained = new Set(Object.keys(after.models || {}).map(lower));
  const removed = new Set(Object.keys(before.models || {}).map(lower).filter((id) => !retained.has(id)));
  const check = (id, previous, at, classifier = false) => {
    if (!lower(id)) return;
    if (removed.has(lower(id))) throw new ConfigError(`${at}: unknown model "${id}" removed from this draft`, at);
    if (lower(id) === lower(previous)) return;
    const model = catalog.get(lower(id));
    if (!model) throw new ConfigError(`${at}: model "${id}" has no enabled explicit provider binding with compatible protocols`, at);
    if (classifier && !model.protocols.some((proto) => CLASSIFIER_PROTOCOLS.includes(proto))) throw new ConfigError(`${at}: classifier must support openai-chat or claude`, at);
  };
  const roles = (map, old, at) => {
    for (const [role, id] of Object.entries(map || {})) check(id, old?.[role], `${at}.${role}`);
  };
  roles(after.clientRoleMatrix?.default, before.clientRoleMatrix?.default, 'clientRoleMatrix.default');
  for (const [client, map] of Object.entries(after.clientRoleMatrix?.clients || {})) roles(map, before.clientRoleMatrix?.clients?.[client], `clientRoleMatrix.clients.${client}`);
  for (const [id, group] of Object.entries(after.routingGroups || {})) {
    for (const modelId of Array.isArray(group.models) ? group.models : []) check(modelId, before.routingGroups?.[id]?.models?.includes(modelId) ? modelId : '', `routingGroups.${id}.models`);
  }
  const intent = after.intentRouting;
  const previous = before.intentRouting;
  if (!intent) return;
  const enabling = intent.enabled !== false && (!previous || previous.enabled === false);
  check(intent.classifierModel, enabling ? '' : previous?.classifierModel, 'intentRouting.classifierModel', true);
  for (const [index, item] of (intent.intents || []).entries()) {
    check(item.modelId, enabling ? '' : previous?.intents?.find((old) => lower(old.id) === lower(item.id))?.modelId, `intentRouting.intents[${index}].modelId`);
  }
}

export function diffEditable(before, after) {
  const changes = [];
  if (JSON.stringify(before.providers) !== JSON.stringify(after.providers)) changes.push('providers');
  if (JSON.stringify(before.customModels) !== JSON.stringify(after.customModels)) changes.push('models');
  if (JSON.stringify(before.matrix) !== JSON.stringify(after.matrix)) changes.push('clientRoleMatrix');
  if (JSON.stringify(before.routingGroups) !== JSON.stringify(after.routingGroups)) changes.push('routingGroups');
  if (JSON.stringify(before.intentRouting) !== JSON.stringify(after.intentRouting)) changes.push('intentRouting');
  return changes;
}

function bindingProviders(id, model, providers) {
  const binding = ['custom', 'discovered'].includes(model.source) ? lower(model.provider) : '';
  return binding ? providers.filter((provider) => provider.id === binding)
    : providers.filter((provider) => Array.isArray(provider.models) && provider.models.some((modelId) => lower(modelId) === lower(id)));
}

function projectModel(id, model) {
  return {
    id,
    label: String(model.label || id),
    protocols: Array.isArray(model.protocols) ? [...model.protocols] : model.protocol ? [model.protocol] : [],
    cost: String(model.cost || 'unknown'),
    source: String(model.source || 'curated'),
    provider: String(model.provider || ''),
    upstreamModel: String(model.upstreamModel ?? id),
    ...(model.enabled !== undefined ? { enabled: model.enabled } : {}),
    generationVerified: false,
  };
}

// Keep inactive explicit bindings available to recompute a shared draft; never include unbound templates.
export function toModelBindings(document) {
  const providers = Object.entries(document.providers || {}).map(([id, provider]) => ({ ...provider, id: lower(id) }));
  return Object.entries(document.models || {}).flatMap(([id, model]) => {
    if (!isRecord(model)) return [];
    const matches = bindingProviders(id, model, providers);
    if (!(['custom', 'discovered'].includes(model.source) && lower(model.provider)) && !matches.length) return [];
    return [{ ...projectModel(id, model), provider: matches.length === 1 ? matches[0].id : String(model.provider || '') }];
  });
}

/** Only enabled, explicitly bound models with an explicit protocol intersection are candidates. */
export function toModelCatalog(document) {
  const providers = Object.entries(document.providers || {}).map(([id, provider]) => ({ ...provider, id: lower(id) }));
  return Object.entries(document.models || {}).flatMap(([id, model]) => {
    if (!isRecord(model) || model.enabled === false) return [];
    if (model.enabled !== undefined && typeof model.enabled !== 'boolean') return [];
    if (model.upstreamModel !== undefined && (typeof model.upstreamModel !== 'string' || !model.upstreamModel.trim())) return [];
    if (['custom', 'discovered'].includes(model.source) && model.provider !== undefined && typeof model.provider !== 'string') return [];
    const rawProtocols = model.protocols === undefined ? (model.protocol === undefined ? [] : [model.protocol]) : model.protocols;
    if (!Array.isArray(rawProtocols) || rawProtocols.some((protocol) => !normalizeProtocol(protocol))) return [];
    const matches = bindingProviders(id, model, providers);
    if (matches.length !== 1) return [];
    const provider = matches[0];
    if (provider.enabled === false || !HTTP_URL.test(String(provider.baseUrl || '').trim())) return [];
    if (provider.enabled !== undefined && typeof provider.enabled !== 'boolean') return [];
    if (provider.authMode !== undefined && !['required', 'none'].includes(provider.authMode)) return [];
    if (provider.endpointStyle !== undefined && !['standard', 'relay'].includes(provider.endpointStyle)) return [];
    if (!Array.isArray(provider.protocols) || provider.protocols.some((protocol) => !normalizeProtocol(protocol))) return [];
    const declared = rawProtocols.map(normalizeProtocol);
    const protocols = [...new Set(provider.protocols.map(normalizeProtocol).filter((protocol) => declared.includes(protocol)))];
    if (!protocols.length) return [];
    return [{ ...projectModel(id, model), protocols, provider: provider.id }];
  });
}

// 自动路由的角色清单（与网关 roleDefaults 对齐）；界面与预览共用这一份，避免两处各写各的。
export const AUTO_ROLES = Object.freeze(['planner', 'implementer', 'reviewer', 'security-reviewer', 'team-lead', 'team-member']);

const lower = (value) => String(value || '').trim().toLowerCase();

/** A local routing key is not the real, case-sensitive upstream model id. */
export function modelBindingId(provider, upstreamModel, existingIds = []) {
  const base = `${lower(provider)}/${lower(upstreamModel)}`;
  const existing = new Set(existingIds.map(lower));
  let id = base;
  for (let suffix = 2; existing.has(id); suffix++) id = `${base}-${suffix}`;
  return id;
}

// 投影出「自动路由」预览：每个角色网关默认会选哪个模型、矩阵覆盖后实际选哪个、成本/速度。
// 确定性读 registry（roleDefaults→routingRules），不猜意图：autoModelId 来自内置规则，
// effectiveModelId = 矩阵覆盖 ?? autoModelId。与 gateway/router.mjs 的候选链首选保持一致。
export function toAutoPreview(document) {
  const models = document.models || {};
  const roleDefaults = document.roleDefaults || {};
  const rules = Array.isArray(document.routingRules) ? document.routingRules : [];
  const matrixDefault = (document.clientRoleMatrix || {}).default || {};
  const activeModel = lower(document.activeModel);
  const catalog = toModelCatalog(document);
  const available = new Set(catalog.map((model) => lower(model.id)));
  const ruleFor = (taskType) => rules.find((rule) => lower(rule.taskType) === lower(taskType)) || null;
  return AUTO_ROLES.map((role) => {
    const roleDefault = roleDefaults[role] || {};
    const taskType = lower(roleDefault.taskType) || role;
    const rule = ruleFor(taskType);
    const autoModelId = [roleDefault.preferredModel, rule?.primary, ...(Array.isArray(rule?.fallback) ? rule.fallback : []), activeModel, ...(catalog.length === 1 ? [catalog[0].id] : [])].map(lower).find((id) => available.has(id)) || '';
    const override = lower(matrixDefault[role]);
    const effectiveModelId = (available.has(override) ? override : '') || autoModelId;
    const model = models[effectiveModelId] || {};
    return {
      role,
      taskType,
      autoModelId,
      effectiveModelId,
      available: Boolean(effectiveModelId),
      unavailableModelId: override && !available.has(override) ? override : '',
      overridden: available.has(override) && override !== autoModelId,
      label: String(model.label || effectiveModelId || ''),
      cost: String(model.cost || 'unknown'),
      speed: String(model.speed || 'unknown'),
      ruleDescription: String(rule?.description || ''),
    };
  });
}
