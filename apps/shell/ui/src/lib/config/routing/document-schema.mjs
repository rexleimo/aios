// Validate registry structure and assignment changes against explicit configured bindings.
import { ConfigError, isRecord, lower } from './common.mjs';
import { ENV_REF, declaredModelProtocols, normalizeProtocol, validateInlineCredential, validateProviderConnection } from './provider-schema.mjs';
import { assignmentReferences, hasRoutingTarget, parseTargetRef, routingTargetReferences, serializeTargetRef } from './target-refs.mjs';
import { orderedGroupMembers, toModelBindings, toModelCatalog } from './model-catalog.mjs';

export function validateDocument(document, { previousDocument } = {}) {
  parseTargetRef(null, document);
  validateScalarDefaults(document);
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
    validateInlineCredential(p?.apiKey, `providers.${id}.apiKey`);
    if (p?.apiKeyEnv && !ENV_REF.test(String(p.apiKeyEnv).trim())) throw new ConfigError(`provider "${id}": apiKeyEnv must be env:VAR`, `providers.${id}.apiKeyEnv`);
    if (p.accounts !== undefined && !Array.isArray(p.accounts)) throw new ConfigError(`provider "${id}": accounts must be an array`, `providers.${id}.accounts`);
    const accountIds = new Set();
    for (const [i, a] of (p.accounts || []).entries()) {
      const at = `providers.${id}.accounts`;
      if (!isRecord(a)) throw new ConfigError(`provider "${id}": account must be an object`, at);
      const accountId = lower(a.id) || `acct-${i}`;
      if (accountIds.has(accountId)) throw new ConfigError(`provider "${id}": duplicate account id "${accountId}"`, at);
      accountIds.add(accountId);
      validateInlineCredential(a.apiKey, at);
      if (a.apiKeyEnv && !ENV_REF.test(String(a.apiKeyEnv).trim())) throw new ConfigError(`provider "${id}" account "${accountId}": apiKeyEnv must be env:VAR`, at);
    }
    if (p.protocols !== undefined && !Array.isArray(p.protocols)) throw new ConfigError(`provider "${id}": protocols must be an array`, `providers.${id}.protocols`);
    if (p.models !== undefined && !Array.isArray(p.models)) throw new ConfigError(`provider "${id}": models must be an array`, `providers.${id}.models`);
    for (const proto of p?.protocols || []) {
      if (!normalizeProtocol(proto)) throw new ConfigError(`provider "${id}": unknown protocol "${proto}"`, `providers.${id}.protocols`);
    }
    validateProviderConnection(p, `providers.${id}`);
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
    const protocols = declaredModelProtocols(m).map(normalizeProtocol).filter(Boolean);
    if (!provider.protocols.some((proto) => protocols.includes(proto))) {
      throw new ConfigError(`model "${id}": provider "${provider.id}" has no compatible protocol`, `models.${id}.provider`);
    }
  }
  validateClientRoleMatrix(document.clientRoleMatrix, document);
  validateRoutingGroups(document);
  validateIntentRouting(document);
  validateRoutingChanges(previousDocument || document, document);
}

export function validateScalarDefaults(document) {
  if (document.activeModel !== undefined && typeof document.activeModel !== 'string') throw new ConfigError('activeModel must be a model id string (empty means inherit)', 'activeModel');
  if (document.clientDefaults === undefined) return;
  if (!isRecord(document.clientDefaults)) throw new ConfigError('clientDefaults must be an object', 'clientDefaults');
  const seen = new Set();
  for (const [client, modelId] of Object.entries(document.clientDefaults)) {
    const at = `clientDefaults.${client}`;
    if (!lower(client) || seen.has(lower(client)) || typeof modelId !== 'string') throw new ConfigError(`${at} must have a unique client id and a model id string (empty means inherit)`, at);
    seen.add(lower(client));
  }
}

export function validateClientRoleMatrix(matrix, document) {
  if (matrix === undefined) return;
  const objectAt = (value, at) => {
    if (!isRecord(value)) throw new ConfigError(`${at} must be an object`, at);
  };
  const rolesAt = (roles, at) => {
    objectAt(roles, at);
    for (const [role, modelId] of Object.entries(roles)) {
      const path = `${at}.${role}`;
      if (!role.trim() || typeof modelId !== 'string') throw new ConfigError(`${path} must be a model id string (empty means inherit)`, path);
      if (document && lower(modelId) && !hasRoutingTarget(document, modelId)) throw new ConfigError(`${path}: unknown model or unknown group "${modelId}"`, path);
    }
  };
  objectAt(matrix, 'clientRoleMatrix');
  if (matrix.default !== undefined) rolesAt(matrix.default, 'clientRoleMatrix.default');
  if (matrix.clients !== undefined) {
    objectAt(matrix.clients, 'clientRoleMatrix.clients');
    for (const [client, roles] of Object.entries(matrix.clients)) {
      if (!client.trim()) throw new ConfigError('clientRoleMatrix.clients: client id required', 'clientRoleMatrix.clients');
      rolesAt(roles, `clientRoleMatrix.clients.${client}`);
    }
  }
}

function validateRoutingGroups(document) {
  const groups = document.routingGroups;
  if (groups === undefined) return;
  if (!groups || typeof groups !== 'object' || Array.isArray(groups)) throw new ConfigError('routingGroups must be an object', 'routingGroups');
  const seen = new Set();
  for (const [id, group] of Object.entries(groups)) {
    const at = `routingGroups.${id}`;
    if (!lower(id) || seen.has(lower(id))) throw new ConfigError(`${at}: duplicate or empty group id`, at);
    seen.add(lower(id));
    if (!id.trim() || !group || typeof group !== 'object' || Array.isArray(group)) throw new ConfigError(`${at}: group must be an object with an id`, at);
    if (group.models !== undefined && !Array.isArray(group.models)) throw new ConfigError(`${at}.models must be an array`, `${at}.models`);
    if (group.enabled !== undefined && typeof group.enabled !== 'boolean') throw new ConfigError(`${at}.enabled must be a boolean`, `${at}.enabled`);
    for (const modelId of group.models || []) {
      if (typeof modelId === 'string' && !Object.hasOwn(document.models || {}, modelId) && modelId.startsWith('group:')) throw new ConfigError(`${at}: members must be concrete model IDs, not nested groups`, `${at}.models`);
      if (typeof modelId !== 'string' || !modelId || !Object.hasOwn(document.models || {}, modelId)) {
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

// Classifier requests support only openai-chat / claude, matching runtime intent routing.
const CLASSIFIER_PROTOCOLS = Object.freeze(['openai-chat', 'claude']);

function validateIntentRouting(document) {
  const intent = document.intentRouting;
  if (intent === undefined) return;
  if (!intent || typeof intent !== 'object' || Array.isArray(intent)) throw new ConfigError('intentRouting must be an object', 'intentRouting');
  if (intent.enabled !== undefined && typeof intent.enabled !== 'boolean') throw new ConfigError('intentRouting.enabled must be a boolean', 'intentRouting.enabled');
  const models = document.models || {};
  const intents = Array.isArray(intent.intents) ? intent.intents : [];
  if (intent.enabled !== false) {
    const classifierModel = String(intent.classifierModel || '');
    if (!classifierModel) throw new ConfigError('intentRouting.classifierModel required when enabled', 'intentRouting.classifierModel');
    if (!Object.hasOwn(models, classifierModel)) throw new ConfigError(`intentRouting.classifierModel: unknown concrete model "${classifierModel}"`, 'intentRouting.classifierModel');
    // validateRoutingChanges checks classifier protocols through the binding-qualified catalog.
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
    const modelId = String(item?.modelId || '');
    if (!modelId) throw new ConfigError(`${at}: modelId required`, at);
    if (!hasRoutingTarget(document, modelId)) throw new ConfigError(`${at}: unknown model or unknown group "${modelId}"`, at);
  }
}

// Paused explicit bindings retain assignments; missing or ambiguous bindings never do.
export function validateRoutingChanges(before, after) {
  const catalog = new Map(toModelCatalog(after).map((model) => [model.id, model]));
  const configured = new Map(toModelCatalog(after, { includeDisabled: true }).map((model) => [model.id, model]));
  const beforeBindings = new Map(toModelBindings(before).map((model) => [model.id, lower(model.provider)]));
  const afterBindings = new Map(toModelBindings(after).map((model) => [model.id, lower(model.provider)]));
  const providerIds = new Set(Object.keys(after.providers || {}).map(lower));
  const removedProviders = new Set(Object.keys(before.providers || {}).map(lower).filter((id) => !providerIds.has(id)));
  const retained = new Set(Object.keys(after.models || {}));
  const removed = new Set(Object.keys(before.models || {}).filter((id) => !retained.has(id)));
  const groupIds = new Set(Object.keys(after.routingGroups || {}));
  for (const [kind, ids] of [['model', removed], ['group', Object.keys(before.routingGroups || {}).filter((id) => !groupIds.has(id))]]) {
    for (const id of ids) {
      const paths = routingTargetReferences(after, serializeTargetRef({ kind, id }));
      if (paths.length) throw new ConfigError(`${paths[0]}: unknown ${kind} "${id}" removed from this draft; clear its references before deleting`, paths[0]);
    }
  }
  const checkModel = (id, previous, at, classifier = false) => {
    if (!id) return;
    if (removed.has(id)) throw new ConfigError(`${at}: unknown model "${id}" removed from this draft`, at);
    const previousProvider = beforeBindings.get(id);
    if (removedProviders.has(previousProvider) && !providerIds.has(afterBindings.get(id))) throw new ConfigError(`${at}: model "${id}" provider removed from this draft`, at);
    const model = catalog.get(id) || (id === previous ? configured.get(id) : null);
    if (!model) throw new ConfigError(`${at}: ${classifier ? 'classifier must be a concrete model; ' : ''}model "${id}" has no enabled explicit provider binding with compatible protocols`, at);
    if (classifier && !model.protocols.some((proto) => CLASSIFIER_PROTOCOLS.includes(proto))) throw new ConfigError(`${at}: classifier must support openai-chat or claude`, at);
  };
  const check = (value, previous, at) => {
    let target;
    let old;
    try { target = parseTargetRef(value, after); old = parseTargetRef(previous, before); }
    catch (error) { throw new ConfigError(`${at}: ${error.message}`, at); }
    if (!target || target.kind === 'auto') return;
    const unchanged = old?.ref === target.ref;
    if (target.kind === 'model') return checkModel(target.id, unchanged ? target.id : '', at);
    let members;
    try { members = orderedGroupMembers(after, target.id); }
    catch (error) { throw new ConfigError(`${at}: ${error.message}`, at); }
    if (!members.some((id) => catalog.has(id) || unchanged && configured.has(id))) {
      throw new ConfigError(`${at}: group "${target.id}" requires a member with an enabled explicit provider binding`, at);
    }
  };
  const roles = (map, old, at) => {
    for (const [role, id] of Object.entries(map || {})) check(id, old?.[role], `${at}.${role}`);
  };
  check(after.activeModel, before.activeModel, 'activeModel');
  roles(after.clientDefaults, before.clientDefaults, 'clientDefaults');
  roles(after.clientRoleMatrix?.default, before.clientRoleMatrix?.default, 'clientRoleMatrix.default');
  for (const [client, map] of Object.entries(after.clientRoleMatrix?.clients || {})) roles(map, before.clientRoleMatrix?.clients?.[client], `clientRoleMatrix.clients.${client}`);
  for (const { value, path } of assignmentReferences(after).filter(({ path }) => path.startsWith('roleDefaults.') || path.startsWith('routingRules['))) {
    if (parseTargetRef(value, after)?.kind === 'group') check(value, assignmentReferences(before).find((entry) => entry.path === path)?.value, path);
  }
  const intent = after.intentRouting;
  const previous = before.intentRouting;
  if (intent) {
    const enabling = intent.enabled !== false && (!previous || previous.enabled === false);
    checkModel(intent.classifierModel, enabling ? '' : previous?.classifierModel, 'intentRouting.classifierModel', true);
    for (const [index, item] of (intent.intents || []).entries()) {
      check(item.modelId, enabling ? '' : previous?.intents?.find((old) => lower(old.id) === lower(item.id))?.modelId, `intentRouting.intents[${index}].modelId`);
    }
  }
  for (const [id, group] of Object.entries(after.routingGroups || {})) {
    for (const modelId of Array.isArray(group.models) ? group.models : []) checkModel(modelId, before.routingGroups?.[id]?.models?.includes(modelId) ? modelId : '', `routingGroups.${id}.models`);
  }
}
