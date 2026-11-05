// The editable face of `config/host-capabilities.json`.
//
// This file is the declaration the whole matrix is built from, so editing it is editing
// the product's claim about itself. Three rules keep that honest:
//
//   1. Edits are applied onto the parsed document, never reconstructed from a form. Any
//      field the editor does not expose (`turnCompression`, `subagents`, future keys)
//      survives untouched — a form that rebuilds the file silently deletes what it does
//      not know about.
//   2. Validation is structural and refuses rather than repairs: an unknown level or a
//      non-string limit is an error with a path, not something to coerce.
//   3. The axis vocabulary is passed in, not duplicated. Its owner is
//      `scripts/client-capability-scorecard.mjs`, which reaches the shell through the
//      matrix payload; a second copy here would drift and let typos through.
export const EDITABLE_LEVELS = Object.freeze(['L0', 'L1', 'L2', 'L3']);

/** @typedef {{ targetLevel: string, capabilities: string[], limits: string[] }} EditableClient */

export class ConfigError extends Error {
  constructor(message, path) {
    super(path ? `${path}: ${message}` : message);
    this.name = 'ConfigError';
    this.path = path ?? null;
  }
}

/** Parse the file text, or explain why it is not JSON. */
export function parseDocument(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Structural validation. `axes` is the caller's vocabulary; an empty list means "do not
 * check axis names", which is what a read-only caller passes.
 *
 * @param {unknown} document
 * @param {{ axes?: string[] }} [options]
 * @returns {unknown}
 */
export function validateDocument(document, { axes = [] } = {}) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new ConfigError('the document must be an object');
  }
  if (typeof document.schemaVersion !== 'number') {
    throw new ConfigError('schemaVersion must be a number', 'schemaVersion');
  }
  if (!document.clients || typeof document.clients !== 'object' || Array.isArray(document.clients)) {
    throw new ConfigError('clients must be an object', 'clients');
  }
  const knownAxes = new Set(axes);
  for (const [clientId, entry] of Object.entries(document.clients)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ConfigError('must be an object', `clients.${clientId}`);
    }
    if (!EDITABLE_LEVELS.includes(entry.targetLevel)) {
      throw new ConfigError(
        `targetLevel must be one of ${EDITABLE_LEVELS.join(', ')}`,
        `clients.${clientId}.targetLevel`,
      );
    }
    if (!Array.isArray(entry.capabilities)) {
      throw new ConfigError('capabilities must be an array', `clients.${clientId}.capabilities`);
    }
    for (const axis of entry.capabilities) {
      if (typeof axis !== 'string' || axis.length === 0) {
        throw new ConfigError('capability entries must be non-empty strings', `clients.${clientId}.capabilities`);
      }
      if (knownAxes.size > 0 && !knownAxes.has(axis)) {
        throw new ConfigError(`unknown capability "${axis}"`, `clients.${clientId}.capabilities`);
      }
    }
    if (new Set(entry.capabilities).size !== entry.capabilities.length) {
      throw new ConfigError('duplicate capabilities', `clients.${clientId}.capabilities`);
    }
    if (!Array.isArray(entry.limits)) {
      throw new ConfigError('limits must be an array', `clients.${clientId}.limits`);
    }
    for (const limit of entry.limits) {
      if (typeof limit !== 'string') {
        throw new ConfigError('limits entries must be strings', `clients.${clientId}.limits`);
      }
    }
  }
  return document;
}

/** The subset the editor exposes, in a stable order. */
export function toEditable(document) {
  const clients = Object.entries(document.clients ?? {}).map(([clientId, entry]) => ({
    clientId,
    targetLevel: entry.targetLevel,
    capabilities: [...(entry.capabilities ?? [])],
    limits: [...(entry.limits ?? [])],
  }));
  clients.sort((left, right) => left.clientId.localeCompare(right.clientId));
  return clients;
}

/**
 * Apply the editable subset back onto a document, touching only the three fields it owns.
 * Returns a new object; the input is not mutated.
 */
export function applyEdits(document, edits) {
  const byId = new Map(edits.map((edit) => [edit.clientId, edit]));
  const clients = {};
  for (const [clientId, entry] of Object.entries(document.clients ?? {})) {
    const edit = byId.get(clientId);
    if (!edit) {
      clients[clientId] = entry;
      continue;
    }
    byId.delete(clientId);
    clients[clientId] = {
      ...entry,
      targetLevel: edit.targetLevel,
      capabilities: [...edit.capabilities],
      limits: [...edit.limits],
    };
  }
  // An edit for a client that does not exist would be silently dropped; refuse instead.
  if (byId.size > 0) {
    throw new ConfigError(`unknown client(s): ${[...byId.keys()].join(', ')}`, 'clients');
  }
  return { ...document, clients };
}

/** Which clients changed, and in which of the three fields. Used for the diff preview. */
export function diffEditable(before, after) {
  const changes = [];
  const beforeById = new Map(before.map((edit) => [edit.clientId, edit]));
  for (const edit of after) {
    const previous = beforeById.get(edit.clientId);
    if (!previous) {
      changes.push({ clientId: edit.clientId, fields: ['added'] });
      continue;
    }
    const fields = [];
    if (previous.targetLevel !== edit.targetLevel) fields.push('targetLevel');
    if (previous.capabilities.join(',') !== edit.capabilities.join(',')) fields.push('capabilities');
    if (previous.limits.join('\n') !== edit.limits.join('\n')) fields.push('limits');
    if (fields.length > 0) changes.push({ clientId: edit.clientId, fields });
  }
  return changes;
}