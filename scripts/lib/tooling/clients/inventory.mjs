import { CLIENT_DEFINITIONS } from '../../foundation/clients/selection/core/definitions.mjs';
import { buildUpdateCommand, classifySource, hasInventoryPolicy } from './install-source.mjs';
import { ClientManagementError, PROBE_LIMITS, freeze, hash, inspectExecutable, runBounded } from './runtime.mjs';

export const CLIENT_IDS = Object.freeze(['claude', 'codex', 'pi', ...Object.keys(CLIENT_DEFINITIONS).filter((id) => !hasInventoryPolicy(id))]);

export function assertClientId(id) {
  if (typeof id !== 'string' || !CLIENT_IDS.includes(id)) {
    throw new ClientManagementError('INVALID_CLIENT', 'Client must be a declared client ID.');
  }
}

function parseVersion(output) {
  const line = output.trim();
  // Only return a version, not arbitrary stdout which might include credentials.
  return /^(?:(?:claude(?:[ -]code)?|codex(?:-cli)?|pi(?:[ -]coding[ -]agent)?)\s+)?v?(\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?)(?:\s+\(Claude Code\))?$/i.exec(line)?.[1] ?? null;
}

async function resolveClient(id, runtime) {
  const definition = CLIENT_DEFINITIONS[id];
  for (const name of [definition.commandName, ...(definition.commandAliases ?? [])]) {
    const candidate = await runtime.resolveExecutable(name);
    if (candidate) return inspectExecutable(candidate, runtime);
  }
  return null;
}

function revisionOf(client, runtime) {
  return hash({ schema: 1, client, platform: runtime.platform, env: hash(runtime.env), cwd: runtime.cwd });
}

export async function inspectClient(id, runtime, { probe = true } = {}) {
  assertClientId(id);
  let executable;
  let source;
  let problem = null;
  try {
    executable = await resolveClient(id, runtime);
    source = executable ? await classifySource(id, executable, runtime)
      : { kind: 'missing', supported: false, reason: 'No executable was found in absolute PATH entries.', evidence: [] };
  } catch {
    problem = 'Executable inspection failed; installation state cannot be verified.';
    source = { kind: 'unknown', supported: false, reason: problem, evidence: [] };
  }
  let version = null;
  let versionStatus = executable ? 'unsupported' : 'missing';
  if (executable && probe && hasInventoryPolicy(id) && !/\.(?:cmd|bat)$/i.test(executable.realPath)) {
    try {
      const output = await runBounded({ file: executable.realPath, args: ['--version'] }, runtime, PROBE_LIMITS);
      version = parseVersion(output.stdout);
      versionStatus = version ? 'ok' : 'unrecognized';
    } catch {
      versionStatus = 'failed';
    }
  }
  // Re-read identities after the probe: never authorize an update from a torn observation.
  if (executable) {
    try {
      const readback = await inspectExecutable(executable.path, runtime);
      const sourceReadback = await classifySource(id, readback, runtime);
      if (hash(executable) !== hash(readback) || hash(source) !== hash(sourceReadback)) throw new Error('drift');
    } catch {
      problem = 'Executable or installer evidence changed during inspection. Refresh before updating.';
    }
  }
  if (problem) {
    version = null;
    versionStatus = 'unknown';
  }
  const client = {
    id, installed: problem ? null : Boolean(executable),
    executable: executable ?? null, version, versionStatus, source,
    inventorySupported: hasInventoryPolicy(id),
    update: { supported: false, reason: problem ?? source.reason },
  };
  const command = !problem && versionStatus === 'ok' ? buildUpdateCommand(client, runtime) : null;
  if (command) client.update = { supported: true, reason: null, command };
  else if (!client.update.reason) client.update.reason = 'A successful, recognized --version probe is required before updating.';
  client.revision = revisionOf(client, runtime);
  return freeze(client);
}

export async function inventoryClients(runtime) {
  // Sequential probes put a hard upper bound on simultaneous subprocesses and memory.
  const clients = [];
  for (const id of CLIENT_IDS) clients.push(await inspectClient(id, runtime));
  return freeze(clients);
}
