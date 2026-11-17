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

// Supported group routing modes. "ordered" (and legacy "smart") always start at
// the first member; "rotate" round-robins and "usage" picks the least-used first.
// State for the stateful modes is held at the gateway edge, not in this pure module.
export const GROUP_ROUTING_MODES = Object.freeze(new Set(['ordered', 'smart', 'rotate', 'usage']));

// Pure member selection for stateful modes. Given the current state it returns the
// chosen member and the next state; callers own and persist that state (bounded).
// "ordered"/"smart" ignore state and pick the first member.
export function selectGroupMember(members, mode, state = {}) {
  const list = Array.isArray(members) ? members : [];
  if (!list.length) return { member: null, state };
  if (mode === 'rotate') {
    const n = Number.isSafeInteger(state.n) && state.n >= 0 ? state.n : 0;
    return { member: list[n % list.length], state: { ...state, n: n + 1 } };
  }
  if (mode === 'usage') {
    const usage = state.usage && typeof state.usage === 'object' && !Array.isArray(state.usage) ? state.usage : {};
    let best = 0;
    for (let i = 1; i < list.length; i++) {
      const current = Number.isFinite(usage[list[i]]) ? usage[list[i]] : 0;
      const bestValue = Number.isFinite(usage[list[best]]) ? usage[list[best]] : 0;
      if (current < bestValue) best = i;
    }
    const nextUsage = { ...usage };
    nextUsage[list[best]] = (Number.isFinite(nextUsage[list[best]]) ? nextUsage[list[best]] : 0) + 1;
    return { member: list[best], state: { ...state, usage: nextUsage } };
  }
  return { member: list[0], state };
}

// Groups contain concrete registry IDs, never other groups or advertised API IDs.
// Legacy "smart" never implemented weights; its compatible meaning is ordered.
export function orderedGroupMembers(registry, id) {
  const groups = loadGroups(registry);
  const group = Object.hasOwn(groups, id) ? groups[id] : null;
  if (!group || typeof group !== 'object' || Array.isArray(group) || group.enabled === false) {
    throw new GroupConfigError(`Routing group "${id}" is missing or disabled`);
  }
  if (group.routing !== undefined && !GROUP_ROUTING_MODES.has(group.routing)) {
    throw new GroupConfigError(`Routing group "${id}" uses unsupported routing mode "${group.routing}"; expected one of ${[...GROUP_ROUTING_MODES].join(', ')}`, 'UNSUPPORTED_GROUP_ROUTING');
  }
  if (!Array.isArray(group.models) || !group.models.length) throw new GroupConfigError(`Routing group "${id}" requires concrete model members`);
  for (const modelId of group.models) {
    if (typeof modelId !== 'string' || !modelId || !Object.hasOwn(registry?.models || {}, modelId)) {
      throw new GroupConfigError(`Routing group "${id}" contains an unknown or non-concrete model member`);
    }
  }
  return [...new Set(group.models)];
}
