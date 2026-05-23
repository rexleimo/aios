import {
  ensurePersonaLayer,
  getPersonaLayerDisplayName,
  readPersonaLayer,
  resolvePersonaPath,
  resolveUserProfilePath,
  writePersonaLayer,
} from '../../persona.mjs';
import { safePrintText, usageError } from '../shared.mjs';

export function handlePersonaCommand({ primary, secondary, rest, io, env = process.env }) {
  const layer = primary === 'persona' ? 'persona' : 'user';
  const action = String(secondary || '').toLowerCase();
  if (!action) {
    throw usageError(`Usage: memo ${primary} <show|set|add|init|path> ...`);
  }

  if (action === 'path') {
    const resolvedPath = layer === 'persona' ? resolvePersonaPath(env) : resolveUserProfilePath(env);
    io.log(resolvedPath);
    return true;
  }

  if (action === 'init') {
    const seeded = ensurePersonaLayer(layer, { env });
    io.log(`${getPersonaLayerDisplayName(layer)} ${seeded.created ? 'initialized' : 'already exists'}.`);
    io.log(`Path: ${seeded.path}`);
    return true;
  }

  if (action === 'show') {
    const state = readPersonaLayer(layer, { env });
    if (!state.exists || !String(state.content || '').trim()) {
      io.log('(none)');
      return true;
    }
    safePrintText(io, state.content);
    return true;
  }

  if (action !== 'set' && action !== 'add') {
    throw usageError(`Unknown ${primary} action: ${secondary}`);
  }
  const text = rest.join(' ').trim();
  if (!text) {
    throw usageError(`${primary} ${action} requires text`);
  }
  const updated = writePersonaLayer(layer, text, { mode: action, env });
  io.log(`${getPersonaLayerDisplayName(layer)} memory ${action === 'set' ? 'updated' : 'appended'}.`);
  io.log(`Path: ${updated.path}`);
  io.log(`Usage: ${updated.length}/${updated.maxChars} chars`);
  return true;
}
