#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { ClientManagementError, createClientManager, redactClientOutput } from './lib/tooling/clients/index.mjs';

function invalid() {
  throw new ClientManagementError('INVALID_REQUEST', 'Use inventory, preview-update <client>, or update <client> --confirm --expected-revision <revision>.');
}

export function parseClientManagementArgs(args) {
  if (!Array.isArray(args) || args.some((item) => typeof item !== 'string')) return invalid();
  if (args.length === 1 && args[0] === 'inventory') return { action: 'inventory' };
  if (args.length === 2 && args[0] === 'preview-update') return { action: 'preview-update', client: args[1] };
  if (args.length === 5 && args[0] === 'update' && args[2] === '--confirm' && args[3] === '--expected-revision') {
    return { action: 'update', client: args[1], confirm: true, expectedRevision: args[4] };
  }
  return invalid();
}

export function clientManagementFailure(error) {
  if (!(error instanceof ClientManagementError)) {
    return { ok: false, error: { code: 'CLIENT_MANAGEMENT_FAILED', message: 'Client management failed safely.' } };
  }
  return {
    ok: false,
    error: { code: error.code, message: redactClientOutput(error.message),
      ...(error.lockRetained ? { lockRetained: true } : {}),
      ...(error.output ? { output: redactClientOutput(error.output).slice(0, 262_144) } : {}) },
  };
}

/** Importable entry for offline tests; importing this module never runs clients. */
export async function runClientManagementCli(args, options = {}) {
  try {
    const request = parseClientManagementArgs(args);
    const manager = options.manager ?? createClientManager(options.runtime);
    switch (request.action) {
      case 'inventory': return { ok: true, clients: await manager.inventory() };
      case 'preview-update': return { ok: true, preview: await manager.previewUpdate(request.client) };
      case 'update': return { ok: true, result: await manager.updateClient({ client: request.client, confirm: request.confirm, expectedRevision: request.expectedRevision }) };
      default: return invalid();
    }
  } catch (error) {
    return clientManagementFailure(error);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runClientManagementCli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
