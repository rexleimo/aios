const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const clients = ['claude', 'codex', 'pi'];

export function parseConnectState(text) {
  const value = JSON.parse(text);
  if (!record(value) || value.clients !== undefined && (!Array.isArray(value.clients) || value.clients.some((client) => !clients.includes(client)))) throw new SyntaxError('invalid connection state');
  for (const key of ['targets', 'catalogs', 'resolvedModels', 'gatewayUrls', 'artifactModels', 'artifactHashes', 'pendingArtifacts']) {
    if (value[key] !== undefined && !record(value[key])) throw new SyntaxError(`invalid connection state ${key}`);
  }
  return value;
}

export function parseConnectBackup(text) {
  const value = JSON.parse(text);
  if (!record(value) || !Array.isArray(value.entries) || value.entries.some((entry) => !record(entry) || !clients.includes(entry.client)
    || !(entry.client === 'pi' ? ['settings', 'models'] : ['main']).includes(entry.role) || typeof entry.file !== 'string' || !record(entry.backup))) {
    throw new SyntaxError('invalid connection backup');
  }
  return value;
}
