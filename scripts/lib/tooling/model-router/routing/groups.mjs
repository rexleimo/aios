// 中文注释：路由组（magpie 式）——多个模型/账号 behind 一个 name（group/<id>）。
// 存储在 registry.routingGroups。纯函数，不联网。
import { normalizeId } from '../entry/shared.mjs';

export function loadGroups(registry) {
  return registry?.routingGroups || {};
}

export function addGroup(registry, id, { models = [], routing = 'ordered' } = {}) {
  const gid = normalizeId(id);
  if (!gid) throw new Error('group id required');
  const next = { ...(registry.routingGroups || {}) };
  next[gid] = { id: gid, models: [...models], routing };
  return { ...registry, routingGroups: next };
}

export function removeGroup(registry, id) {
  const gid = normalizeId(id);
  const next = { ...(registry.routingGroups || {}) };
  delete next[gid];
  return { ...registry, routingGroups: next };
}

export function resolveGroupFirstModel(group) {
  const g = group || {};
  const models = Array.isArray(g.models) ? g.models : [];
  return models.length ? models[0] : null;
}

export class GroupConfigError extends Error {
  constructor(message, code = 'INVALID_ROUTING_GROUP') {
    super(message);
    this.name = 'GroupConfigError';
    this.code = code;
  }
}

// Groups contain concrete registry IDs, never other groups or advertised API IDs.
// Legacy "smart" never implemented weights; its compatible meaning is ordered.
export function orderedGroupMembers(registry, id) {
  const groups = loadGroups(registry);
  const group = Object.hasOwn(groups, id) ? groups[id] : null;
  if (!group || typeof group !== 'object' || Array.isArray(group) || group.enabled === false) {
    throw new GroupConfigError(`Routing group "${id}" is missing or disabled`);
  }
  if (![undefined, 'smart', 'ordered'].includes(group.routing)) {
    throw new GroupConfigError(`Routing group "${id}" uses unsupported routing mode "${group.routing}"; expected ordered`, 'UNSUPPORTED_GROUP_ROUTING');
  }
  if (!Array.isArray(group.models) || !group.models.length) throw new GroupConfigError(`Routing group "${id}" requires concrete model members`);
  for (const modelId of group.models) {
    if (typeof modelId !== 'string' || !modelId || !Object.hasOwn(registry?.models || {}, modelId)) {
      throw new GroupConfigError(`Routing group "${id}" contains an unknown or non-concrete model member`);
    }
  }
  return [...new Set(group.models)];
}
