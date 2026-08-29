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
  let selectedClients = resolveRexProjectionClients(client);
  const normalizedScope = normalizeScope(scope);
  const homes = resolveHomeMap(homeMap, env);
  const rex = await loadRexClientInstaller(rootDir);
  if (typeof rex.installClientProjection !== 'function' || typeof rex.supportedClients !== 'function') {
    throw new Error('bundled rex-harness does not expose the required client projection API');
  }

  const supported = new Set(rex.supportedClients());
  const unsupported = selectedClients.filter((clientId) => !supported.has(clientId));
  if (unsupported.length > 0) {
    // rex-harness may lag behind AIOS's client registry (e.g. a freshly added
    // client it has not learned to project yet). Skip those gracefully instead
    // of aborting the whole install; only hard-fail when it supports nothing.
    if (supported.size === 0) {
      throw new Error(`bundled rex-harness does not support any AIOS client projection(s): ${unsupported.join(', ')}`);
    }
    io.log(`[warn] skipping unsupported client projection(s): ${unsupported.join(', ')}`);
    selectedClients = selectedClients.filter((clientId) => supported.has(clientId));
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
    ...(result.conflictDetails?.find((detail) => detail.skillId === skill) || {}),
  })));
  const installed = results.flatMap((result) => result.installed.map((skill) => ({
    client: result.client,
    skill,
  })));
  const updated = results.flatMap((result) => (result.updated || []).map((skill) => ({
    client: result.client,
    skill,
  })));
  const adopted = results.flatMap((result) => (result.adopted || []).map((skill) => ({
    client: result.client,
    skill,
  })));
  const migrated = results.flatMap((result) => (result.migrated || []).map((skill) => ({
    client: result.client,
    skill,
  })));
  const errors = results.flatMap((result) => (result.errors || []).map((error) => ({
    client: result.client,
    ...error,
  })));
  const recoveries = results.flatMap((result) => (result.recoveries || []).map((recovery) => ({
    client: result.client,
    ...recovery,
  })));

  for (const result of results) {
    io.log(`[rex] ${result.client} workflow skills: ${result.status}`);
  }
  for (const conflict of conflicts) {
    const detail = conflict.reason ? ` (${conflict.reason})` : '';
    io.log(`[warn] Rex workflow skill retained because it is user-managed: ${conflict.client}/${conflict.skill}${detail}`);
  }

  return Object.freeze({
    kind: 'aios.rex-client-projections.v1',
    status: conflicts.length > 0 || errors.length > 0
      ? 'conflicts'
      : installed.length + updated.length + adopted.length + migrated.length > 0 ? 'installed' : 'unchanged',
    clients: selectedClients,
    installed: Object.freeze(installed),
    updated: Object.freeze(updated),
    adopted: Object.freeze(adopted),
    migrated: Object.freeze(migrated),
    conflicts: Object.freeze(conflicts),
    errors: Object.freeze(errors),
    recoveries: Object.freeze(recoveries),
    results: Object.freeze(results),
  });
}
