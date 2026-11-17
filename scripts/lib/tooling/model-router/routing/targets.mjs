// Catalog-independent target syntax. Legacy persisted strings are ALWAYS concrete
// model IDs; only an explicit schema version unlocks model:/group:/auto syntax.
export const TARGET_REF_VERSION = 1;

export class TargetReferenceError extends Error {
  constructor(message, code = 'INVALID_TARGET') {
    super(message);
    this.name = 'TargetReferenceError';
    this.code = code;
    this.status = 400;
  }
}

function encodeId(id) {
  if (typeof id !== 'string' || !id || id.length > 512 || /[\u0000-\u001f\u007f]/u.test(id)) {
    throw new TargetReferenceError('A nonempty target ID of at most 512 characters is required');
  }
  try { return encodeURIComponent(id); }
  catch { throw new TargetReferenceError('Invalid Unicode in target ID'); }
}

function decodeId(encoded) {
  try {
    const id = decodeURIComponent(encoded);
    const canonical = encodeId(id);
    const normalizeEscapes = (value) => value.replace(/%[0-9a-f]{2}/giu, (escape) => escape.toUpperCase());
    if (normalizeEscapes(encoded) !== canonical) throw new Error('Noncanonical encoding');
    return id;
  } catch { throw new TargetReferenceError('Target IDs must use encodeURIComponent encoding'); }
}

export function serializeTargetRef(target) {
  if (target?.kind === 'auto') return 'auto';
  if (!['model', 'group'].includes(target?.kind)) throw new TargetReferenceError('Unknown target kind');
  return `${target.kind}:${encodeId(target.id)}`;
}

function reference(kind, id) {
  const target = kind === 'auto' ? { kind } : { kind, id };
  return { ...target, ref: serializeTargetRef(target) };
}

export function parseTargetRef(value, { targetRefVersion } = {}) {
  if (targetRefVersion !== undefined && targetRefVersion !== TARGET_REF_VERSION) throw new TargetReferenceError('Unsupported target reference version');
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new TargetReferenceError('Target reference must be a string');
  if (targetRefVersion === TARGET_REF_VERSION) {
    if (value === 'auto') return reference('auto');
    const match = /^(model|group):(.*)$/u.exec(value);
    if (match) return reference(match[1], decodeId(match[2]));
  }
  return reference('model', value);
}

export function serializeWireTarget(target) {
  const ref = serializeTargetRef(target);
  return target.kind === 'auto' ? 'aios-auto' : `aios/${target.kind}/${ref.slice(target.kind.length + 1)}`;
}

// Ordinary client model aliases are placeholders even when they match a model.
export function parseWireTarget(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new TargetReferenceError('model must be a string');
  if (value === 'aios-auto') return reference('auto');
  const match = /^aios\/(model|group)\/(.*)$/u.exec(value);
  if (match) return reference(match[1], decodeId(match[2]));
  if (/^aios(?:[/-]|$)/u.test(value)) throw new TargetReferenceError('Unknown reserved AIOS target');
  return null;
}

export function resolveWireTarget({ model, headerTargets = [], pathModel } = {}) {
  const selectors = [parseWireTarget(model), parseWireTarget(pathModel)];
  for (const value of headerTargets) {
    if (value === undefined || value === null) continue;
    const selector = parseWireTarget(value);
    if (!selector) throw new TargetReferenceError('Target headers require an AIOS wire target');
    selectors.push(selector);
  }
  const explicit = selectors.filter(Boolean);
  if (explicit.some((target) => target.ref !== explicit[0].ref)) {
    throw new TargetReferenceError('Body, headers, and URL target selectors must agree', 'TARGET_SELECTOR_CONFLICT');
  }
  return explicit[0] || null;
}

// Only real assignment fields participate in deletion guards. Unknown metadata,
// classifier/member IDs and non-record role defaults are not target references.
export function assignmentReferences(document) {
  const entries = [];
  const add = (value, path) => {
    if (typeof value === 'string' && value) entries.push({ value, path });
  };
  const roles = (map, at) => {
    for (const [key, value] of Object.entries(map || {})) add(value, `${at}.${key}`);
  };
  const record = (row, at, field) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return;
    add(row[field], `${at}.${field}`);
    for (const [index, value] of (Array.isArray(row.fallback) ? row.fallback : []).entries()) add(value, `${at}.fallback[${index}]`);
  };
  const nested = (value, at) => {
    if (typeof value === 'string') add(value, at);
    else for (const [key, row] of Object.entries(value || {})) nested(row, `${at}.${key}`);
  };
  add(document.activeModel, 'activeModel');
  roles(document.clientDefaults, 'clientDefaults');
  roles(document.clientRoleMatrix?.default, 'clientRoleMatrix.default');
  for (const [client, map] of Object.entries(document.clientRoleMatrix?.clients || {})) roles(map, `clientRoleMatrix.clients.${client}`);
  nested(document.envModels, 'envModels');
  for (const [role, row] of Object.entries(document.roleDefaults || {})) record(row, `roleDefaults.${role}`, 'preferredModel');
  for (const [index, row] of (document.routingRules || []).entries()) record(row, `routingRules[${index}]`, 'primary');
  for (const [index, row] of (document.intentRouting?.intents || []).entries()) record(row, `intentRouting.intents[${index}]`, 'modelId');
  return entries;
}

// Migrate only runtime assignment fields in a new JSON-compatible document.
// Catalog/classifier/member IDs and unknown metadata (including clientRoles
// and intentRouting.rules) remain unchanged.
export function migrateTargetRefs(registry) {
  const next = structuredClone(registry);
  const options = { targetRefVersion: registry?.targetRefVersion };
  // Validate the version even for registries with no model assignments.
  parseTargetRef(null, options);
  const convert = (value) => {
    const target = parseTargetRef(value, options);
    return target ? serializeTargetRef(target) : value;
  };
  const mapAssignments = (value) => {
    if (typeof value === 'string') return convert(value);
    if (Array.isArray(value)) return value.map(mapAssignments);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapAssignments(item)]));
    return value;
  };
  const record = (value, fields) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const out = { ...value };
    for (const field of fields) {
      if (Object.hasOwn(out, field)) out[field] = convert(out[field]);
    }
    if (Array.isArray(out.fallback)) out.fallback = out.fallback.map(convert);
    return out;
  };
  if (Object.hasOwn(next, 'activeModel')) next.activeModel = convert(next.activeModel);
  for (const field of ['clientDefaults', 'envModels']) {
    if (next[field]) next[field] = mapAssignments(next[field]);
  }
  if (next.clientRoleMatrix) {
    if (next.clientRoleMatrix.default) next.clientRoleMatrix.default = mapAssignments(next.clientRoleMatrix.default);
    if (next.clientRoleMatrix.clients) next.clientRoleMatrix.clients = mapAssignments(next.clientRoleMatrix.clients);
  }
  if (next.roleDefaults) next.roleDefaults = Object.fromEntries(Object.entries(next.roleDefaults).map(([role, value]) => [role, record(value, ['preferredModel'])]));
  if (Array.isArray(next.routingRules)) next.routingRules = next.routingRules.map((value) => record(value, ['primary']));
  if (Array.isArray(next.intentRouting?.intents)) next.intentRouting.intents = next.intentRouting.intents.map((value) => record(value, ['modelId']));
  next.targetRefVersion = TARGET_REF_VERSION;
  return next;
}
