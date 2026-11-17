import { buildUpdateCommand } from './install-source.mjs';
import { CLIENT_IDS, assertClientId, inspectClient, inventoryClients } from './inventory.mjs';
import { ClientManagementError, UPDATE_LIMITS, createRuntime, freeze, hash, runBounded } from './runtime.mjs';

export { CLIENT_IDS, ClientManagementError };
export { redact as redactClientOutput } from './runtime.mjs';

function assertRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new ClientManagementError('INVALID_REQUEST', 'Expected a client update request object.');
  }
  if (Object.keys(request).some((key) => !['client', 'confirm', 'expectedRevision'].includes(key))) {
    throw new ClientManagementError('INVALID_REQUEST', 'Unknown update request field.');
  }
  assertClientId(request.client);
  if (request.confirm !== true) throw new ClientManagementError('CONFIRM_REQUIRED', 'An explicit boolean confirm:true is required.');
  if (typeof request.expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(request.expectedRevision)) {
    throw new ClientManagementError('REVISION_REQUIRED', 'The exact preview revision is required.');
  }
}

function previewOf(client, runtime) {
  const command = client.update.supported ? buildUpdateCommand(client, runtime) : null;
  return freeze({
    client: client.id, supported: Boolean(command), reason: client.update.reason,
    source: client.source, evidence: client.executable ? [client.executable, ...client.source.evidence] : [],
    revision: client.revision, evidenceHash: hash({ executable: client.executable, source: client.source }),
    command, requiresConfirmation: true, version: client.version,
  });
}

/** No cache: every preview/commit reads PATH, link identities, metadata and --version anew. */
export function createClientManager(options = {}) {
  const runtime = createRuntime(options);
  let active = false;

  async function previewUpdate(client) {
    assertClientId(client);
    return previewOf(await inspectClient(client, runtime), runtime);
  }

  async function updateClient(request) {
    assertRequest(request);
    if (active) throw new ClientManagementError('CLIENTS_LOCKED', 'A client update is already in progress.');
    active = true;
    let locked = false;
    let attempted = false;
    let verified = false;
    try {
      try {
        await runtime.fs.mkdir(runtime.lockPath, { mode: 0o700 });
        locked = true;
      } catch {
        throw new ClientManagementError('CLIENTS_LOCKED', 'Cannot acquire the client update lock; no update was started.');
      }
      const before = await inspectClient(request.client, runtime);
      if (before.revision !== request.expectedRevision) {
        throw new ClientManagementError('STALE_REVISION', 'Client installation changed since preview. Request a new preview.');
      }
      const preview = previewOf(before, runtime);
      if (!preview.supported) throw new ClientManagementError('UPDATE_UNSUPPORTED', preview.reason);
      // A second fresh observation catches changes between confirmation readback and launch.
      const ready = await inspectClient(request.client, runtime);
      if (ready.revision !== before.revision) throw new ClientManagementError('STALE_REVISION', 'Client evidence changed before launch.');
      attempted = true;
      let output;
      try {
        output = await runBounded(preview.command, runtime, UPDATE_LIMITS);
      } catch (error) {
        throw new ClientManagementError('UPDATE_FAILED', 'Update failed or timed out; installation may be partially changed. Lock retained for inspection.', {
          output: error.output ?? '', lockRetained: true,
        });
      }
      const after = await inspectClient(request.client, runtime);
      if (!after.installed || !after.update.supported || after.source.kind !== before.source.kind
        || after.source.prefix !== before.source.prefix || after.source.packageName !== before.source.packageName) {
        throw new ClientManagementError('READBACK_FAILED', 'Update completed but installation readback could not be verified. Lock retained for inspection.', { lockRetained: true });
      }
      verified = true;
      return freeze({ client: request.client, command: preview.command, before, after, changed: before.version !== after.version, output });
    } finally {
      active = false;
      // A killed/failed updater can have partial writes or descendants. Never auto-reclaim its lock.
      if (locked && (!attempted || verified)) {
        try {
          await runtime.fs.rmdir(runtime.lockPath);
        } catch {
          throw new ClientManagementError('LOCK_RELEASE_FAILED', 'Client update lock could not be released. Inspect before retrying.', { lockRetained: true });
        }
      }
    }
  }

  return Object.freeze({ inventory: () => inventoryClients(runtime), previewUpdate, updateClient });
}
