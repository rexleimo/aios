import assert from 'node:assert/strict';
import test from 'node:test';
import { parseClientManagementArgs, runClientManagementCli } from '../../../aios-client-management.mjs';
import { ClientManagementError } from '../../../lib/tooling/clients/index.mjs';
import { fixture, mutationCalls } from './fixtures.mjs';

test('CLI inventory and preview run the real manager with only fake FS/process adapters', async () => {
  const fx = fixture();
  fx.install('claude');
  const options = { runtime: fx.options };
  const inventory = await runClientManagementCli(['inventory'], options);
  assert.equal(inventory.ok, true);
  assert.equal(inventory.clients.find((entry) => entry.id === 'claude').installed, true);
  const result = await runClientManagementCli(['preview-update', 'claude'], options);
  assert.equal(result.ok, true);
  assert.equal(result.preview.client, 'claude');
  assert.equal(result.preview.command.shell, false);
  assert.equal(mutationCalls(fx).length, 0);
});

test('CLI confirmed update must use the exact revision from its preview', async () => {
  const fx = fixture();
  fx.install('pi');
  const options = { runtime: fx.options };
  const { preview } = await runClientManagementCli(['preview-update', 'pi'], options);
  const stale = await runClientManagementCli(['update', 'pi', '--confirm', '--expected-revision', 'a'.repeat(64)], options);
  assert.equal(stale.error.code, 'STALE_REVISION');
  const result = await runClientManagementCli(['update', 'pi', '--confirm', '--expected-revision', preview.revision], options);
  assert.equal(result.ok, true);
  assert.equal(result.result.client, 'pi');
  assert.equal(mutationCalls(fx).length, 1);
});

test('CLI rejects arbitrary commands, flags, clients and missing confirmation without mutation', async () => {
  const fx = fixture();
  const options = { runtime: fx.options };
  for (const args of [[], ['install', 'claude'], ['inventory', '--json'], ['preview-update', 'codex', '--force'],
    ['update', 'claude'], ['update', 'claude', '--confirm=true', '--expected-revision', 'a'.repeat(64)],
    ['update', 'claude', '--confirm', '--expected-revision', 'a'.repeat(64), '--force'],
    ['preview-update', 'claude;bad'], ['preview-update', '__proto__'],
    ['update', 'codex', '--confirm', '--expected-revision', 'bad']]) {
    const result = await runClientManagementCli(args, options);
    assert.equal(result.ok, false, JSON.stringify(args));
    assert.equal(typeof result.error.code, 'string');
    assert.equal(typeof result.error.message, 'string');
  }
  assert.equal(fx.calls.length, 0);
  assert.equal(fx.files.has('/locks/client.lock'), false);
  assert.throws(() => parseClientManagementArgs([null]), { code: 'INVALID_REQUEST' });
});

test('CLI error envelopes redact domain diagnostics and suppress unknown exceptions', async () => {
  for (const error of [new Error('api_key=hidden-one'),
    new ClientManagementError('UPDATE_FAILED', 'token=hidden-two', { output: 'Authorization: Bearer hidden-three', lockRetained: true })]) {
    const manager = { async inventory() { throw error; } };
    const result = await runClientManagementCli(['inventory'], { manager });
    assert.equal(result.ok, false);
    assert.doesNotMatch(JSON.stringify(result), /hidden/);
    assert.equal(result.error.code, error instanceof ClientManagementError ? 'UPDATE_FAILED' : 'CLIENT_MANAGEMENT_FAILED');
  }
});
