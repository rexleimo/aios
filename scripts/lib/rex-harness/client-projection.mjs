import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveClientSelection } from '../clients/registry.mjs';
import { resolveTargetRoot } from '../components/skills/catalog.mjs';
import { normalizeScope, resolveHomeMap } from '../components/skills/normalizers.mjs';

function unique(values) {
  return [...new Set(values)];
}

function requestedClients(client) {
  if (Array.isArray(client)) {
    return unique(client.flatMap((entry) => resolveClientSelection(entry)));
  }
  return resolveClientSelection(client);
}

async function loadRexClientInstaller(rootDir) {
  const modulePath = path.join(path.resolve(rootDir), 'rex-harness', 'src', 'index.mjs');
  try {
    return await import(pathToFileURL(modulePath).href);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`unable to load the bundled rex-harness client installer: ${message}`);
  }
}

/**
 * Resolve through the AIOS client registry so every lifecycle entry uses the
 * same six native client identifiers as the rest of the installer.
 */
export function resolveRexProjectionClients(client = 'all') {
  return Object.freeze(requestedClients(client));
}

/**
 * Rex owns the actual copy/conflict behavior. AIOS only selects clients and
 * maps its requested scope to the client discovery roots after the Rex kernel
 * has been prepared.
 */
export async function installRexClientProjections({
  rootDir,
  projectRoot = rootDir,
  client = 'all',
  scope = 'project',
  homeMap = {},
  env = process.env,
  io = console,
} = {}) {
  const selectedClients = resolveRexProjectionClients(client);
  const normalizedScope = normalizeScope(scope);
  const homes = resolveHomeMap(homeMap, env);
  const rex = await loadRexClientInstaller(rootDir);
  if (typeof rex.installClientProjection !== 'function' || typeof rex.supportedClients !== 'function') {
    throw new Error('bundled rex-harness does not expose the required client projection API');
  }

  const supported = new Set(rex.supportedClients());
  const unsupported = selectedClients.filter((clientId) => !supported.has(clientId));
  if (unsupported.length > 0) {
    throw new Error(`bundled rex-harness does not support AIOS client projection(s): ${unsupported.join(', ')}`);
  }

  const results = selectedClients.map((clientId) => rex.installClientProjection({
    client: clientId,
    rootDir: projectRoot,
    targetRoot: resolveTargetRoot({
      rootDir,
      projectRoot,
      clientName: clientId,
      scope: normalizedScope,
      homes,
    }),
  }));
  const conflicts = results.flatMap((result) => result.conflicts.map((skill) => ({
    client: result.client,
    skill,
  })));
  const installed = results.flatMap((result) => result.installed.map((skill) => ({
    client: result.client,
    skill,
  })));

  for (const result of results) {
    io.log(`[rex] ${result.client} workflow skills: ${result.status}`);
  }
  for (const conflict of conflicts) {
    io.log(`[warn] Rex workflow skill retained because it is user-managed: ${conflict.client}/${conflict.skill}`);
  }

  return Object.freeze({
    kind: 'aios.rex-client-projections.v1',
    status: conflicts.length > 0 ? 'conflicts' : installed.length > 0 ? 'installed' : 'unchanged',
    clients: selectedClients,
    installed: Object.freeze(installed),
    conflicts: Object.freeze(conflicts),
    results: Object.freeze(results),
  });
}
