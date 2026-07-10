import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildDesiredHeadroomEntry,
  buildHeadroomMcpAddInvocation,
  buildHeadroomMcpRemoveInvocation,
} from '../lib/aios-init/headroom-mcp/commands.mjs';
import {
  ensureHeadroomMcpRegistration,
  removeOwnedHeadroomMcp,
} from '../lib/aios-init/headroom-mcp/lifecycle.mjs';
import {
  classifyHeadroomOwnership,
  fingerprintHeadroomEntry,
  readHeadroomLedger,
  resolveHeadroomLedgerPath,
  writeHeadroomLedger,
} from '../lib/aios-init/headroom-mcp/ownership.mjs';

test('official MCP add commands preserve the absolute executable as one argv item', () => {
  const executable = '/Users/test/Headroom Tools/headroom';
  assert.deepEqual(buildHeadroomMcpAddInvocation({ runtimeId: 'gemini-cli', headroomPath: executable }), {
    command: 'gemini',
    args: ['mcp', 'add', '--scope', 'user', '-e', 'HEADROOM_MCP_CLIENT=gemini-cli', '-e', 'HEADROOM_MCP_READ=off', 'headroom', executable, '--', 'mcp', 'serve'],
  });
  assert.deepEqual(buildHeadroomMcpAddInvocation({ runtimeId: 'hermes-agent', headroomPath: executable }), {
    command: 'hermes',
    args: ['mcp', 'add', 'headroom', '--command', executable, '--env', 'HEADROOM_MCP_CLIENT=hermes-agent', 'HEADROOM_MCP_READ=off', '--args', 'mcp', 'serve'],
  });
  assert.deepEqual(buildHeadroomMcpAddInvocation({ runtimeId: 'grok-build', headroomPath: executable }), {
    command: 'grok',
    args: ['mcp', 'add', '--scope', 'user', '-e', 'HEADROOM_MCP_CLIENT=grok-build', '-e', 'HEADROOM_MCP_READ=off', 'headroom', '--', executable, 'mcp', 'serve'],
  });
});

test('official MCP remove commands stay scoped and profile-aware', () => {
  assert.deepEqual(buildHeadroomMcpRemoveInvocation({ runtimeId: 'gemini-cli' }), {
    command: 'gemini',
    args: ['mcp', 'remove', '--scope', 'user', 'headroom'],
  });
  assert.deepEqual(buildHeadroomMcpRemoveInvocation({ runtimeId: 'hermes-agent', profile: 'research' }), {
    command: 'hermes',
    args: ['mcp', 'remove', 'headroom', '--profile', 'research'],
  });
  assert.deepEqual(buildHeadroomMcpRemoveInvocation({ runtimeId: 'grok-build' }), {
    command: 'grok',
    args: ['mcp', 'remove', '--scope', 'user', 'headroom'],
  });
});

test('ownership is fail-closed and never adopts an external matching entry', () => {
  const desired = buildDesiredHeadroomEntry('gemini-cli', '/opt/headroom');
  const fingerprint = fingerprintHeadroomEntry(desired);
  assert.equal(classifyHeadroomOwnership({ actual: null, desired, ledgerEntry: null }).status, 'absent');
  assert.equal(classifyHeadroomOwnership({ actual: desired, desired, ledgerEntry: null }).status, 'external');
  assert.equal(classifyHeadroomOwnership({ actual: desired, desired, ledgerEntry: { fingerprint } }).status, 'owned');
  assert.equal(classifyHeadroomOwnership({ actual: { ...desired, command: '/user/headroom' }, desired, ledgerEntry: { fingerprint } }).status, 'conflict');
});

test('ledger path is under AIOS home and redacts unrelated fields', async () => {
  const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'headroom-ledger-home-'));
  const desired = buildDesiredHeadroomEntry('grok-build', '/opt/headroom');
  const ledger = {
    schemaVersion: 1,
    entries: {
      'grok-build': {
        runtimeId: 'grok-build',
        profile: '',
        configPath: '/home/u/.grok/config.toml',
        command: desired.command,
        args: desired.args,
        env: { ...desired.env, SECRET: 'nope' },
        fingerprint: fingerprintHeadroomEntry(desired),
        createdAt: '2026-07-10T00:00:00.000Z',
        lastVerifiedAt: '2026-07-10T00:00:00.000Z',
      },
    },
  };

  await writeHeadroomLedger(ledger, { homeDir, env: {} });
  const ledgerPath = resolveHeadroomLedgerPath({ homeDir, env: {} });
  assert.equal(ledgerPath, path.join(homeDir, '.aios', 'integrations', 'headroom-mcp.json'));
  const raw = await fs.readFile(ledgerPath, 'utf8');
  assert.doesNotMatch(raw, /SECRET/u);

  const readBack = await readHeadroomLedger({ homeDir, env: {} });
  assert.equal(readBack.entries['grok-build'].env.HEADROOM_MCP_READ, 'off');
});


test('Gemini/Grok registration never overwrites conflict and needs separate consent', async () => {
  const spawns = [];
  const base = {
    runtimeId: 'gemini-cli',
    headroomPath: '/opt/headroom',
    mode: 'auto',
    isTTY: false,
    runImpl: async (command, args) => { spawns.push([command, args]); return { status: 0 }; },
    readLedgerImpl: async () => ({ schemaVersion: 1, entries: {} }),
  };
  assert.equal((await ensureHeadroomMcpRegistration({ ...base, consent: false, inspectImpl: async () => ({ actual: null }) })).status, 'pending-consent');
  assert.equal((await ensureHeadroomMcpRegistration({ ...base, consent: true, inspectImpl: async () => ({ actual: { command: '/user/server', args: [], env: {} } }) })).status, 'conflict');
  assert.deepEqual(spawns, []);
});

test('post-add reread is authoritative and rollback only removes an unchanged entry created this run', async () => {
  const desired = buildDesiredHeadroomEntry('grok-build', '/opt/headroom');
  let reads = 0;
  const commands = [];
  const result = await ensureHeadroomMcpRegistration({
    runtimeId: 'grok-build',
    headroomPath: '/opt/headroom',
    mode: 'on',
    consent: true,
    isTTY: false,
    inspectImpl: async () => ({ actual: reads++ === 0 ? null : desired, projectShadow: false, configPath: '/home/u/.grok/config.toml' }),
    runImpl: async (command, args) => { commands.push([command, args]); return { status: 0 }; },
    probeImpl: async () => ({ status: 'failed', reason: 'handshake-failed' }),
    readLedgerImpl: async () => ({ schemaVersion: 1, entries: {} }),
    writeLedgerImpl: async () => {},
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.rolledBack, true);
  assert.deepEqual(commands.map(([command, args]) => [command, args.slice(0, 3)]), [
    ['grok', ['mcp', 'add', '--scope']],
    ['grok', ['mcp', 'remove', '--scope']],
  ]);
});

test('Hermes never adds or removes without a genuine TTY', async () => {
  const calls = [];
  const common = {
    runtimeId: 'hermes-agent',
    headroomPath: '/opt/headroom',
    consent: true,
    mode: 'on',
    isTTY: false,
    inspectImpl: async () => ({ actual: null, configPath: '/home/u/.hermes/config.yaml' }),
    runImpl: async (...args) => { calls.push(args); return { status: 0 }; },
    readLedgerImpl: async () => ({ schemaVersion: 1, entries: {} }),
  };
  assert.equal((await ensureHeadroomMcpRegistration(common)).status, 'pending-interactive');
  assert.equal((await removeOwnedHeadroomMcp({ ...common, ledgerEntry: { fingerprint: 'x' } })).status, 'pending-interactive');
  assert.deepEqual(calls, []);
});

test('Hermes exit zero is failure until config, enabled state and selected tools prove success', async () => {
  let reads = 0;
  const desired = buildDesiredHeadroomEntry('hermes-agent', '/opt/headroom');
  const result = await ensureHeadroomMcpRegistration({
    runtimeId: 'hermes-agent',
    headroomPath: '/opt/headroom',
    consent: true,
    mode: 'on',
    isTTY: true,
    inspectImpl: async () => ({ actual: reads++ === 0 ? null : desired, configPath: '/home/u/.hermes/config.yaml' }),
    runImpl: async () => ({ status: 0 }),
    readLedgerImpl: async () => ({ schemaVersion: 1, entries: {} }),
    writeLedgerImpl: async () => {},
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.reason, 'hermes-tools-not-enabled');
});
