// Assignment reference syntax, schema migration and deletion-reference discovery.
// This UI-safe runtime mirror must not trace scripts/lib into the browser build.
import { ConfigError, isRecord } from './common.mjs';

// UI-safe syntax mirror of routing/targets.mjs. IDs remain literal, including legacy prefixes.
function encodeTargetId(id) {
  if (typeof id !== 'string' || !id || id.length > 512 || /[\u0000-\u001f\u007f]/u.test(id)) throw new ConfigError('A nonempty target ID of at most 512 characters is required');
  try { return encodeURIComponent(id); }
  catch { throw new ConfigError('Invalid Unicode in target ID'); }
}

export function serializeTargetRef(target) {
  if (target?.kind === 'auto') return 'auto';
  if (!['model', 'group'].includes(target?.kind)) throw new ConfigError('Unknown target kind');
  return `${target.kind}:${encodeTargetId(target.id)}`;
}

export function parseTargetRef(value, { targetRefVersion } = {}) {
  if (targetRefVersion !== undefined && targetRefVersion !== 1) throw new ConfigError('Unsupported target reference version', 'targetRefVersion');
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new ConfigError('Target reference must be a string');
  let target = { kind: 'model', id: value };
  if (targetRefVersion === 1) {
    if (value === 'auto') target = { kind: 'auto' };
    const match = /^(model|group):(.*)$/u.exec(value);
    if (match) {
      try {
        const id = decodeURIComponent(match[2]);
        const encoded = encodeTargetId(id);
        if (match[2].replace(/%[0-9a-f]{2}/giu, (escape) => escape.toUpperCase()) !== encoded) throw new Error('Noncanonical encoding');
        target = { kind: match[1], id };
      } catch { throw new ConfigError('Target IDs must use encodeURIComponent encoding'); }
    }
  }
  return { ...target, ref: serializeTargetRef(target) };
}

export function canonicalTarget(value, options) {
  const target = parseTargetRef(value, options);
  return target?.ref || '';
}

/** Migrate runtime assignment fields, including stale IDs; concrete IDs and unknown metadata stay literal. */
export function migrateTargetRefs(document) {
  parseTargetRef(null, document);
  const next = { ...document, targetRefVersion: 1 };
  const ref = (value) => value === undefined || value === null || value === '' ? value : canonicalTarget(value, document);
  const map = (value) => typeof value === 'string' ? ref(value) : Array.isArray(value) ? value.map(map) : isRecord(value) ? Object.fromEntries(Object.entries(value).map(([key, id]) => [key, map(id)])) : value;
  const record = (value, fields) => {
    if (!isRecord(value)) return value;
    const row = { ...value };
    for (const field of fields) if (Object.hasOwn(row, field)) row[field] = ref(row[field]);
    if (Array.isArray(row.fallback)) row.fallback = row.fallback.map(ref);
    return row;
  };
  if (document.activeModel !== undefined) next.activeModel = ref(document.activeModel);
  for (const field of ['clientDefaults', 'envModels']) if (document[field] !== undefined) next[field] = map(document[field]);
  if (isRecord(document.clientRoleMatrix)) next.clientRoleMatrix = {
    ...document.clientRoleMatrix,
    ...(document.clientRoleMatrix.default !== undefined ? { default: map(document.clientRoleMatrix.default) } : {}),
    ...(isRecord(document.clientRoleMatrix.clients) ? { clients: Object.fromEntries(Object.entries(document.clientRoleMatrix.clients).map(([client, roles]) => [client, map(roles)])) } : {}),
  };
  if (isRecord(document.roleDefaults)) next.roleDefaults = Object.fromEntries(Object.entries(document.roleDefaults).map(([role, entry]) => [role, record(entry, ['preferredModel'])]));
  if (Array.isArray(document.routingRules)) next.routingRules = document.routingRules.map((entry) => record(entry, ['primary']));
  if (isRecord(document.intentRouting)) {
    next.intentRouting = { ...document.intentRouting };
    if (Array.isArray(document.intentRouting.intents)) next.intentRouting.intents = document.intentRouting.intents.map((entry) => record(entry, ['modelId']));
  }
  return next;
}

/** Editable projections use matrix rather than clientRoleMatrix. */
export function migrateEditableTargets(editable) {
  const next = migrateTargetRefs({ ...editable, ...(editable.matrix !== undefined ? { clientRoleMatrix: editable.matrix } : {}) });
  if (editable.matrix !== undefined) next.matrix = next.clientRoleMatrix;
  delete next.clientRoleMatrix;
  return next;
}

export function hasRoutingTarget(document, value) {
  const target = parseTargetRef(value, document);
  return !target || target.kind === 'auto' || Object.hasOwn(target.kind === 'group' ? document.routingGroups || {} : document.models || {}, target.id);
}

export function assignmentReferences(document) {
  const entries = [];
  const seen = new Set();
  const add = (value, path) => {
    const key = JSON.stringify([path, value]);
    if (typeof path === 'string' && typeof value === 'string' && value && !seen.has(key)) {
      seen.add(key);
      entries.push({ value, path });
    }
  };
  const roles = (map, at) => { for (const [key, value] of Object.entries(map || {})) add(value, `${at}.${key}`); };
  add(document.activeModel, 'activeModel');
  roles(document.clientDefaults, 'clientDefaults');
  roles(document.clientRoleMatrix?.default, 'clientRoleMatrix.default');
  for (const [client, map] of Object.entries(document.clientRoleMatrix?.clients || {})) roles(map, `clientRoleMatrix.clients.${client}`);
  const record = (row, at, field) => {
    if (!isRecord(row)) return;
    add(row?.[field], `${at}.${field}`);
    for (const [index, value] of (Array.isArray(row?.fallback) ? row.fallback : []).entries()) add(value, `${at}.fallback[${index}]`);
  };
  const nested = (value, at) => {
    if (typeof value === 'string') add(value, at);
    else for (const [key, row] of Object.entries(value || {})) nested(row, `${at}.${key}`);
  };
  nested(document.envModels, 'envModels');
  for (const [role, entry] of Object.entries(document.roleDefaults || {})) record(entry, `roleDefaults.${role}`, 'preferredModel');
  for (const [index, rule] of (document.routingRules || []).entries()) {
    record(rule, `routingRules[${index}]`, 'primary');
  }
  for (const [index, intent] of (document.intentRouting?.intents || []).entries()) record(intent, `intentRouting.intents[${index}]`, 'modelId');
  // Read-only context references are safe path/value pairs, never arbitrary metadata.
  for (const entry of document.targetReferences || []) {
    if (typeof entry?.path === 'string' && (entry.path.startsWith('envModels.') || /^roleDefaults\..+\.fallback\[\d+\]$/u.test(entry.path))) add(entry.value, entry.path);
  }
  return entries;
}

/** Find deletion blockers in all assignments, including disabled intents and legacy rule context. */
export function routingTargetReferences(document, targetRef) {
  const target = parseTargetRef(targetRef, { targetRefVersion: 1 });
  if (!target || target.kind === 'auto') return [];
  const matches = (entry) => entry?.ref === target.ref;
  const paths = assignmentReferences(document).filter(({ value }) => matches(parseTargetRef(value, document))).map(({ path }) => path);
  if (target.kind === 'model') {
    if (document.intentRouting?.classifierModel === target.id) paths.push('intentRouting.classifierModel');
    for (const [id, group] of Object.entries(document.routingGroups || {})) {
      if (Array.isArray(group?.models) && group.models.includes(target.id)) paths.push(`routingGroups.${id}.models`);
    }
  }
  return [...new Set(paths)];
}
