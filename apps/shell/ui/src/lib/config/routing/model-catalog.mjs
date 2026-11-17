// Binding-qualified concrete model and assignment-target catalogs.
import { ConfigError, isRecord, lower } from './common.mjs';
import { declaredModelProtocols, normalizeProtocol, validateProviderConnection } from './provider-schema.mjs';
import { serializeTargetRef } from './target-refs.mjs';

function bindingProviders(id, model, providers, models) {
  const binding = ['custom', 'discovered'].includes(model.source) ? lower(model.provider) : '';
  return binding ? providers.filter((provider) => provider.id === binding)
    : providers.filter((provider) => Array.isArray(provider.models) && provider.models.some((member) => (Object.hasOwn(models, member) ? member : lower(member)) === id));
}

function projectModel(id, model) {
  const protocols = declaredModelProtocols(model);
  return {
    id,
    label: String(model.label || id),
    protocols: Array.isArray(protocols) ? [...protocols] : [],
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
    const matches = bindingProviders(id, model, providers, document.models || {});
    if (!(['custom', 'discovered'].includes(model.source) && lower(model.provider)) && !matches.length) return [];
    return [{
      ...projectModel(id, model),
      provider: matches.length === 1 ? matches[0].id : String(model.provider || ''),
      declaredProvider: ['custom', 'discovered'].includes(model.source) ? lower(model.provider) : '',
    }];
  });
}

/** Candidates require enabled bindings; validation can also inspect explicitly paused bindings. */
export function toModelCatalog(document, { includeDisabled = false } = {}) {
  const providers = Object.entries(document.providers || {}).map(([id, provider]) => ({ ...provider, id: lower(id) }));
  return Object.entries(document.models || {}).flatMap(([id, model]) => {
    if (!isRecord(model) || (!includeDisabled && model.enabled === false)) return [];
    if (model.enabled !== undefined && typeof model.enabled !== 'boolean') return [];
    if (model.upstreamModel !== undefined && (typeof model.upstreamModel !== 'string' || !model.upstreamModel.trim())) return [];
    if (['custom', 'discovered'].includes(model.source) && model.provider !== undefined && typeof model.provider !== 'string') return [];
    const rawProtocols = declaredModelProtocols(model);
    if (!Array.isArray(rawProtocols) || rawProtocols.some((protocol) => !normalizeProtocol(protocol))) return [];
    const matches = bindingProviders(id, model, providers, document.models || {});
    if (matches.length !== 1) return [];
    const provider = matches[0];
    if (!includeDisabled && provider.enabled === false) return [];
    if (provider.enabled !== undefined && typeof provider.enabled !== 'boolean') return [];
    if (provider.authMode !== undefined && !['required', 'none'].includes(provider.authMode)) return [];
    if (provider.endpointStyle !== undefined && !['standard', 'relay'].includes(provider.endpointStyle)) return [];
    if (!Array.isArray(provider.protocols) || provider.protocols.some((protocol) => !normalizeProtocol(protocol))) return [];
    try {
      validateProviderConnection(provider, `providers.${provider.id}`);
    } catch (error) {
      if (error instanceof ConfigError) return [];
      throw error;
    }
    const declared = rawProtocols.map(normalizeProtocol);
    const protocols = [...new Set(provider.protocols.map(normalizeProtocol).filter((protocol) => declared.includes(protocol)))];
    if (!protocols.length) return [];
    return [{ ...projectModel(id, model), protocols, provider: provider.id }];
  });
}

/** Supported ordered groups contain raw concrete model IDs, not assignment references. */
export function orderedGroupMembers(document, id) {
  const group = Object.hasOwn(document.routingGroups || {}, id) ? document.routingGroups[id] : null;
  if (!isRecord(group) || group.enabled === false) throw new ConfigError(`unknown group or disabled group "${id}"`);
  if (![undefined, 'smart', 'ordered'].includes(group.routing)) throw new ConfigError(`group "${id}": unsupported routing mode; only ordered (legacy smart) is supported`);
  if (!Array.isArray(group.models) || !group.models.length) throw new ConfigError(`group "${id}": at least one concrete model member required`);
  for (const modelId of group.models) if (typeof modelId !== 'string' || !modelId || !Object.hasOwn(document.models || {}, modelId)) throw new ConfigError(`group "${id}": unknown model or non-concrete member`);
  return [...new Set(group.models)];
}

/** Assignment targets are canonical refs; classifiers continue using toModelCatalog raw IDs. */
export function toRoutingTargets(document) {
  const catalog = toModelCatalog(document);
  const eligible = new Set(catalog.map((model) => model.id));
  const groups = Object.keys(document.routingGroups || {}).flatMap((id) => {
    let members;
    try { members = orderedGroupMembers(document, id).filter((modelId) => eligible.has(modelId)); }
    catch (error) { if (error instanceof ConfigError) return []; throw error; }
    return members.length ? [{ id: serializeTargetRef({ kind: 'group', id }), label: id, provider: '模型组', protocols: [], cost: 'unknown', source: 'group', models: members }] : [];
  });
  return [...catalog.map((model) => ({ ...model, id: serializeTargetRef({ kind: 'model', id: model.id }) })), ...groups];
}

/** A local routing key is not the real, case-sensitive upstream model id. */
export function modelBindingId(provider, upstreamModel, existingIds = []) {
  const base = `${lower(provider)}/${lower(upstreamModel)}`;
  const existing = new Set(existingIds.map(lower));
  let id = base;
  for (let suffix = 2; existing.has(id); suffix++) id = `${base}-${suffix}`;
  return id;
}
