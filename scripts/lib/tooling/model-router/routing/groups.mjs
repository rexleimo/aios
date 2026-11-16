// 中文注释：路由组（magpie 式）——多个模型/账号 behind 一个 name（group/<id>）。
// 存储在 registry.routingGroups。纯函数，不联网。
import { normalizeId } from '../entry/shared.mjs';

export function loadGroups(registry) {
  return registry?.routingGroups || {};
}

export function addGroup(registry, id, { models = [], routing = 'smart' } = {}) {
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