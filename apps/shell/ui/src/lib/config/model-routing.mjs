// Public UI adapter: editable projections, metadata-preserving patches and legacy auto preview.
// Pure routing domains stay local so Next does not trace the scripts/lib runtime.
import { ConfigError, isRecord, lower } from './routing/common.mjs';
import { CONNECTION_FIELDS, declaredModelProtocols } from './routing/provider-schema.mjs';
import { canonicalTarget, migrateEditableTargets, migrateTargetRefs, parseTargetRef } from './routing/target-refs.mjs';
import { orderedGroupMembers, toModelCatalog } from './routing/model-catalog.mjs';
import { validateClientRoleMatrix, validateRoutingChanges, validateScalarDefaults } from './routing/document-schema.mjs';

export { ConfigError } from './routing/common.mjs';
export { normalizeProtocol } from './routing/provider-schema.mjs';
export { assignmentReferences, migrateEditableTargets, migrateTargetRefs, parseTargetRef, routingTargetReferences, serializeTargetRef } from './routing/target-refs.mjs';
export { modelBindingId, orderedGroupMembers, toModelBindings, toModelCatalog, toRoutingTargets } from './routing/model-catalog.mjs';
export { validateDocument } from './routing/document-schema.mjs';

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
    ...(p?.apiKey ? { apiKey: String(p.apiKey) } : {}),
    authMode: p?.authMode ?? 'required',
    endpointStyle: p?.endpointStyle ?? 'relay',
    ...(p?.enabled !== undefined ? { enabled: p.enabled } : {}),
    ...Object.fromEntries(CONNECTION_FIELDS.filter((field) => p?.[field] !== undefined).map((field) => [field,
      isRecord(p[field]) ? { ...p[field] } : Array.isArray(p[field]) ? [...p[field]] : p[field],
    ])),
    protocols: Array.isArray(p?.protocols) ? [...p.protocols] : [],
    models: Array.isArray(p?.models) ? [...p.models] : [],
    accounts: Array.isArray(p?.accounts) ? p.accounts.map((a, i) => ({ id: lower(a?.id) || `acct-${i}`, apiKeyEnv: String(a?.apiKeyEnv || ''), ...(a?.apiKey ? { apiKey: String(a.apiKey) } : {}) })) : [],
  }));
  const matrix = document.clientRoleMatrix || {};
  const intent = document.intentRouting;
  return {
    targetRefVersion: document.targetRefVersion,
    activeModel: document.activeModel ?? '',
    clientDefaults: { ...document.clientDefaults },
    providers,
    customModels: Object.entries(document.models || {})
      .filter(([, m]) => m?.source === 'custom')
      .map(([id, m]) => {
        const protocols = declaredModelProtocols(m);
        return {
          id,
          label: String(m?.label || id),
          protocols: Array.isArray(protocols) ? [...protocols] : [],
          provider: String(m?.provider || ''),
          upstreamModel: String(m?.upstreamModel ?? id),
          ...(m?.enabled !== undefined ? { enabled: m.enabled } : {}),
        };
      }),
    matrix: { default: { ...(matrix.default || {}) }, clients: Object.fromEntries(Object.entries(matrix.clients || {}).map(([id, roles]) => [id, { ...roles }])) },
    routingGroups: Object.entries(document.routingGroups || {}).map(([id, g]) => ({
      id,
      models: Array.isArray(g?.models) ? [...g.models] : [],
      routing: String(g?.routing || 'smart'),
      ...(g?.enabled !== undefined ? { enabled: g.enabled } : {}),
    })),
    intentRouting: {
      enabled: Boolean(intent) && intent.enabled !== false,
      classifierModel: String(intent?.classifierModel || ''),
      ...(typeof intent?.confidenceThreshold === 'number' ? { confidenceThreshold: intent.confidenceThreshold } : {}),
      intents: (Array.isArray(intent?.intents) ? intent.intents : []).map((item) => ({
        id: String(item?.id || ''),
        description: String(item?.description || ''),
        modelId: String(item?.modelId || ''),
        ...(Array.isArray(item?.fallback) ? { fallback: [...item.fallback] } : {}),
      })),
    },
  };
}

function keyedRows(rows, path, normalize = (value) => String(value || '').trim(), collisionKey = lower) {
  if (!Array.isArray(rows)) throw new ConfigError(`${path} must be an array`, path);
  const seen = new Set();
  return rows.map((row) => {
    const id = normalize(row?.id);
    if (!id) throw new ConfigError(`${path}: id required`, path);
    const key = collisionKey(id);
    if (seen.has(key)) throw new ConfigError(`${path}: duplicate id "${id}"`, path);
    seen.add(key);
    return [id, row];
  });
}

/** Apply projected fields over existing metadata; omitted optional sections remain untouched. */
export function applyEdits(document, editable) {
  const original = document;
  document = migrateTargetRefs(document);
  editable = migrateEditableTargets(editable || {});
  const next = { ...document };
  validateScalarDefaults(editable || {});
  const before = toEditable(document);
  if (editable?.activeModel !== undefined && editable.activeModel !== before.activeModel) {
    if (editable.activeModel) next.activeModel = canonicalTarget(editable.activeModel, editable);
    else delete next.activeModel;
  }
  // Preserve valid untouched client/role keys and spelling; normalize edited entries.
  const pruneMap = (map, previous = {}) => Object.fromEntries(Object.entries(map || {}).filter(([, value]) => lower(value)).map(([key, value]) => (
    Object.hasOwn(previous, key) && previous[key] === value ? [key, previous[key]] : [lower(key), canonicalTarget(value, editable)]
  )));
  if (editable?.clientDefaults !== undefined && JSON.stringify(editable.clientDefaults) !== JSON.stringify(before.clientDefaults)) {
    const defaults = pruneMap(editable.clientDefaults, document.clientDefaults);
    if (Object.keys(defaults).length) next.clientDefaults = defaults;
    else delete next.clientDefaults;
  }
  const providers = editable?.providers === undefined ? document.providers : Object.fromEntries(keyedRows(editable.providers, 'providers', lower).map(([id, p]) => {
    const previous = Object.entries(document.providers || {}).find(([key]) => lower(key) === id)?.[1] || {};
    const projected = before.providers.find((provider) => lower(provider.id) === id);
    const changed = (field) => !projected || JSON.stringify(p[field]) !== JSON.stringify(projected[field]);
    const provider = { ...previous };
    if (p.baseUrl !== undefined && changed('baseUrl')) provider.baseUrl = p.baseUrl;
    for (const field of ['protocols', 'models']) {
      if (p[field] !== undefined && changed(field)) provider[field] = Array.isArray(p[field]) ? [...p[field]] : p[field];
    }
    // Optional connection fields are patch-like: omission preserves, explicit null clears.
    for (const field of CONNECTION_FIELDS) {
      if (p[field] === undefined || !changed(field)) continue;
      if (p[field] === null || (!['protocolBaseUrls', 'headers'].includes(field) && p[field] === '')) delete provider[field];
      else provider[field] = isRecord(p[field]) ? { ...p[field] } : p[field];
    }
    if (p.authMode !== undefined && (p.authMode !== 'required' || previous.authMode !== undefined)) provider.authMode = p.authMode;
    if (p.endpointStyle !== undefined && (p.endpointStyle !== 'relay' || previous.endpointStyle !== undefined)) provider.endpointStyle = p.endpointStyle;
    if (p.enabled !== undefined) provider.enabled = p.enabled;
    if (p.apiKeyEnv !== undefined && changed('apiKeyEnv')) {
      if (String(p.apiKeyEnv || '').trim()) provider.apiKeyEnv = String(p.apiKeyEnv).trim();
      else delete provider.apiKeyEnv;
    }
    // Inline keys are patch-like: an explicit nonempty value saves, clearing removes the field.
    if (p.apiKey !== undefined && changed('apiKey')) {
      if (String(p.apiKey || '').trim()) provider.apiKey = String(p.apiKey).trim();
      else delete provider.apiKey;
    }
    // Account IDs and refs retain their established normalization on unchanged projections too.
    if (p.accounts !== undefined && (changed('accounts') || (Array.isArray(p.accounts) && p.accounts.length > 0))) {
      if (!Array.isArray(p.accounts)) throw new ConfigError(`provider "${id}": accounts must be an array`, `providers.${id}.accounts`);
      provider.accounts = p.accounts.map((account, i) => {
        if (!isRecord(account)) throw new ConfigError(`provider "${id}": account must be an object`, `providers.${id}.accounts`);
        const inline = String(account?.apiKey || '').trim();
        const nextAccount = {
          ...(previous.accounts || []).find((old, index) => (lower(old?.id) || `acct-${index}`) === (lower(account?.id) || `acct-${i}`)),
          id: lower(account?.id) || `acct-${i}`,
          apiKeyEnv: String(account?.apiKeyEnv || '').trim(),
        };
        if (inline) nextAccount.apiKey = inline;
        else delete nextAccount.apiKey;
        return nextAccount;
      });
      if (!provider.accounts.length) delete provider.accounts;
    }
    return [id, provider];
  }));
  if (editable?.providers !== undefined) next.providers = providers;
  validateClientRoleMatrix(editable?.matrix);
  // 中文注释：清空的角色覆盖（空串）落盘前剪掉，避免 {implementer:''} 这类残留；空客户端整段移除。
  const clients = {};
  for (const [clientId, roles] of Object.entries(editable?.matrix?.clients || {})) {
    const previous = document.clientRoleMatrix?.clients || {};
    const pruned = pruneMap(roles, previous[clientId]);
    if (Object.keys(pruned).length) clients[Object.hasOwn(previous, clientId) ? clientId : lower(clientId)] = pruned;
  }
  if (editable?.routingGroups !== undefined && JSON.stringify(editable.routingGroups) !== JSON.stringify(toEditable(document).routingGroups)) {
    next.routingGroups = Object.fromEntries(keyedRows(editable.routingGroups, 'routingGroups', lower).map(([id, group]) => {
      const previousEntry = Object.entries(document.routingGroups || {}).find(([key]) => lower(key) === id);
      const previous = previousEntry?.[1];
      const projected = before.routingGroups.find((row) => lower(row.id) === id);
      const changed = (field) => !projected || JSON.stringify(group[field]) !== JSON.stringify(projected[field]);
      const row = { ...previous };
      if (changed('models')) row.models = Array.isArray(group.models) ? [...group.models] : (group.models === undefined ? [] : group.models);
      if (changed('routing')) row.routing = group.routing === undefined ? 'ordered' : group.routing;
      if (group.enabled !== undefined && changed('enabled')) row.enabled = group.enabled;
      return [previousEntry?.[0] === group.id ? group.id : id, row];
    }));
  }

  if (editable?.matrix !== undefined && JSON.stringify(editable.matrix) !== JSON.stringify(toEditable(document).matrix)) next.clientRoleMatrix = {
    ...document.clientRoleMatrix,
    default: editable.matrix.default === undefined ? document.clientRoleMatrix?.default : pruneMap(editable.matrix.default, document.clientRoleMatrix?.default),
    clients: editable.matrix.clients === undefined ? document.clientRoleMatrix?.clients : clients,
  };
  // Intent IDs normalize; model IDs and canonical target bytes remain literal.
  // editable 没带这段（旧客户端）则保留文档原样，不静默删配置。
  const intent = editable?.intentRouting;
  if (intent !== undefined && JSON.stringify(intent) !== JSON.stringify(toEditable(document).intentRouting)) {
    next.intentRouting = {
      ...document.intentRouting,
      enabled: intent.enabled !== false,
      classifierModel: intent.classifierModel ?? '',
      ...(typeof intent.confidenceThreshold === 'number' && Number.isFinite(intent.confidenceThreshold)
        && intent.confidenceThreshold >= 0 && intent.confidenceThreshold <= 1
        ? { confidenceThreshold: intent.confidenceThreshold } : {}),
      intents: (Array.isArray(intent.intents) ? intent.intents : [])
        .map((item) => ({
          ...(document.intentRouting?.intents || []).find((old) => lower(old?.id) === lower(item?.id)),
          id: lower(item?.id), description: String(item?.description || '').trim(), modelId: canonicalTarget(item?.modelId, editable),
          ...(Array.isArray(item?.fallback) ? { fallback: item.fallback.map((value) => canonicalTarget(value, editable)) } : {}),
        }))
        .filter((item) => item.id || item.description || item.modelId),
    };
  }
  // 中文注释：自定义模型——只重建 source==='custom' 的条目，curated/discovered 一律保留（含能力画像）。
  // editable 没带这段（旧客户端）则保留文档原样，不静默删配置。
  if (editable?.customModels !== undefined) {
    const preserved = Object.entries(document.models || {}).filter(([, model]) => model?.source !== 'custom');
    const protectedIds = new Set(preserved.map(([id]) => id));
    const projectedModels = new Map(before.customModels.map((model) => [model.id, model]));
    // Existing catalog keys are literal; normalize only newly entered local keys.
    const customId = (id) => projectedModels.has(id) ? id : lower(id);
    const custom = keyedRows(editable.customModels, 'customModels', customId, (id) => id).map(([id, cm]) => {
      if (protectedIds.has(id)) throw new ConfigError(`custom model "${id}": cannot overwrite a curated or discovered model`, `models.${id}`);
      const previous = document.models?.[id];
      const projected = projectedModels.get(id);
      const protocols = Array.isArray(cm.protocols) ? [...cm.protocols] : (cm.protocols === undefined ? [] : cm.protocols);
      const provider = lower(cm.provider);
      const label = String(cm.label || id);
      const upstreamModel = String(cm.upstreamModel ?? previous?.upstreamModel ?? cm.id).trim();
      const protocolsChanged = !previous || JSON.stringify(protocols) !== JSON.stringify(projected.protocols);
      const providerChanged = !previous || provider !== lower(projected.provider);
      const upstreamChanged = !previous || upstreamModel !== projected.upstreamModel.trim();
      // Only materialize edited fields; untouched projections retain raw declarations and absent defaults.
      const model = previous ? { ...previous } : { cost: 'unknown', speed: 'unknown', contextWindow: 'unknown', source: 'custom' };
      if (protocolsChanged) model.protocols = protocols;
      if (providerChanged) {
        if (provider) model.provider = provider;
        else delete model.provider;
      }
      if (!previous || label !== projected.label) model.label = label;
      if (cm.upstreamModel !== undefined || !previous) {
        if (!upstreamModel) throw new ConfigError(`model "${id}": upstreamModel required`, `models.${id}.upstreamModel`);
        if (upstreamChanged) model.upstreamModel = upstreamModel;
      }
      if (cm.enabled !== undefined) model.enabled = cm.enabled;
      const bindingChanged = !previous || providerChanged || protocolsChanged || upstreamChanged || (previous.enabled === false && model.enabled !== false);
      if (bindingChanged && !lower(model.provider)) throw new ConfigError(`model "${id}": select an explicitly configured provider`, `models.${id}.provider`);
      return [id, model];
    });
    next.models = Object.fromEntries([...preserved, ...custom]);
  }
  validateRoutingChanges(original, next);
  return next;
}

export function diffEditable(before, after) {
  const changes = [];
  if (before.targetRefVersion !== after.targetRefVersion) changes.push('targetRefVersion');
  if (before.activeModel !== after.activeModel) changes.push('activeModel');
  if (JSON.stringify(before.clientDefaults) !== JSON.stringify(after.clientDefaults)) changes.push('clientDefaults');
  if (JSON.stringify(before.providers) !== JSON.stringify(after.providers)) changes.push('providers');
  if (JSON.stringify(before.customModels) !== JSON.stringify(after.customModels)) changes.push('models');
  if (JSON.stringify(before.matrix) !== JSON.stringify(after.matrix)) changes.push('clientRoleMatrix');
  if (JSON.stringify(before.routingGroups) !== JSON.stringify(after.routingGroups)) changes.push('routingGroups');
  if (JSON.stringify(before.intentRouting) !== JSON.stringify(after.intentRouting)) changes.push('intentRouting');
  return changes;
}

// 自动路由的角色清单（与网关 roleDefaults 对齐）；界面与预览共用这一份，避免两处各写各的。
export const AUTO_ROLES = Object.freeze(['planner', 'implementer', 'reviewer', 'security-reviewer', 'team-lead', 'team-member']);

// 投影出「自动路由」预览：每个角色网关默认会选哪个模型、矩阵覆盖后实际选哪个、成本/速度。
// 确定性读 registry（roleDefaults→routingRules），不猜意图：autoModelId 来自内置规则，
// effectiveModelId = 矩阵覆盖 ?? autoModelId。与 gateway/router.mjs 的候选链首选保持一致。
export function toAutoPreview(document) {
  const models = document.models || {};
  const roleDefaults = document.roleDefaults || {};
  const rules = Array.isArray(document.routingRules) ? document.routingRules : [];
  const matrixDefault = (document.clientRoleMatrix || {}).default || {};
  const catalog = toModelCatalog(document);
  const available = new Set(catalog.map((model) => model.id));
  const target = (value) => { try { return parseTargetRef(value, document); } catch { return null; } };
  const members = (entry) => {
    if (!entry || entry.kind === 'auto') return [];
    if (entry.kind === 'model') return available.has(entry.id) ? [entry.id] : [];
    try { return orderedGroupMembers(document, entry.id).filter((id) => available.has(id)); } catch { return []; }
  };
  const pick = (primary, fallback) => {
    let chain;
    try { chain = [primary, ...fallback, document.activeModel].map((value) => parseTargetRef(value, document)).filter((entry) => entry && entry.kind !== 'auto'); } catch { return ''; }
    if (catalog.length === 1 && !chain.some((entry) => entry.kind === 'group')) return catalog[0].id;
    for (const entry of chain) {
      const id = members(entry)[0];
      if (id) return id;
      if (entry.kind === 'group') return '';
    }
    return '';
  };
  const ruleFor = (taskType) => rules.find((rule) => lower(rule.taskType) === lower(taskType)) || null;
  return AUTO_ROLES.map((role) => {
    const roleDefault = roleDefaults[role] || {};
    const taskType = lower(roleDefault.taskType) || role;
    const rule = ruleFor(taskType);
    const primary = roleDefault.preferredModel || rule?.primary;
    const fallback = Array.isArray(rule?.fallback) ? rule.fallback : [];
    const autoModelId = pick(primary, fallback);
    const override = Object.entries(matrixDefault).find(([key]) => lower(key) === role)?.[1];
    const effectiveModelId = pick(override || primary, fallback);
    const model = models[effectiveModelId] || {};
    return {
      role,
      taskType,
      autoModelId,
      effectiveModelId,
      available: Boolean(effectiveModelId),
      unavailableModelId: override && target(override)?.kind !== 'auto' && !members(target(override)).length ? override : '',
      overridden: Boolean(override) && effectiveModelId !== autoModelId,
      label: String(model.label || effectiveModelId || ''),
      cost: String(model.cost || 'unknown'),
      speed: String(model.speed || 'unknown'),
      ruleDescription: String(rule?.description || ''),
    };
  });
}
