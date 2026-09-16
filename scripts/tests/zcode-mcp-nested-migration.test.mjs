import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { migrateOneMcpJsonFile } from '../lib/components/browser/mcp-migration.mjs';
import { migrateOneZcodeJsonFile } from '../lib/components/browser/mcp-zcode.mjs';
import { collectClientMcpTargets } from '../lib/components/browser/mcp-targets.mjs';
import { PRIMARY_BROWSER_ALIAS } from '../lib/components/browser/constants.mjs';
import { getClientMcpTarget } from '../lib/clients/native/index.mjs';

async function makeTemp() {
  return mkdtemp(path.join(os.tmpdir(), 'aios-zcode-mcp-'));
}

test('zcode MCP target declares nested mcp.servers in home and project scopes', () => {
  const target = getClientMcpTarget('zcode');
  assert.equal(target.format, 'json');
  assert.equal(target.namespace, 'mcp.servers');
  assert.deepEqual(target.scopes, [
    { scope: 'home', file: 'cli/config.json', format: 'zcode-json', namespace: 'mcp.servers', createIfMissing: true },
    { scope: 'project', file: '.zcode/config.json', format: 'zcode-json', namespace: 'mcp.servers' },
  ]);
});

test('collectClientMcpTargets resolves zcode dual scopes with nested namespace', () => {
  const targets = collectClientMcpTargets({
    projectRoot: '/proj',
    clientHomes: { zcode: '/home/.zcode' },
  }).filter((target) => target.client === 'zcode');
  const slash = (value) => String(value).replace(/\\/g, '/');

  assert.deepEqual(targets.map((target) => [target.scope, slash(target.path), target.namespace, target.createIfMissing]), [
    ['home', '/home/.zcode/cli/config.json', 'mcp.servers', true],
    ['project', '/proj/.zcode/config.json', 'mcp.servers', true],
  ]);
});

test('migrateOneMcpJsonFile writes nested mcp.servers and preserves sibling config keys', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'config.json');
  await writeFile(filePath, JSON.stringify({
    plugins: { 'zcode-guide': true },
    hooks: { enabled: true, events: {} },
  }, null, 2));

  const result = migrateOneMcpJsonFile(filePath, rootDir, { serversKey: 'mcp.servers' });
  assert.equal(result.status, 'updated');

  const parsed = JSON.parse(result.nextRaw);
  assert.ok(parsed.mcp?.servers?.[PRIMARY_BROWSER_ALIAS], 'browser server nested under mcp.servers');
  assert.deepEqual(parsed.plugins, { 'zcode-guide': true }, 'sibling top-level keys survive');
  assert.ok(parsed.hooks?.enabled, 'hooks config survives');

  const onDisk = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(onDisk.mcp, undefined, 'dry preview must not write until caller persists');
});

test('migrateOneZcodeJsonFile normalizes AIOS servers to ZCode strict schema', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'config.json');
  await writeFile(filePath, JSON.stringify({
    plugins: {},
    mcp: { servers: { 'user-own-server': { type: 'stdio', command: 'uvx', args: ['own-mcp'], customField: 'keep-me' } } },
  }, null, 2));

  const result = migrateOneZcodeJsonFile(filePath, rootDir);
  assert.equal(result.status, 'updated');

  const parsed = JSON.parse(result.nextRaw);
  const browser = parsed.mcp.servers[PRIMARY_BROWSER_ALIAS];
  // startupTimeoutSec (seconds) is not a ZCode field and would get the whole
  // server dropped by ZCode's strict schema; it must arrive as timeoutMs (ms).
  assert.equal(browser.startupTimeoutSec, undefined, 'no unknown startupTimeoutSec field');
  assert.equal(browser.timeoutMs, 60000, 'startup timeout translated to timeoutMs');
  for (const key of Object.keys(browser)) {
    assert.ok(
      ['type', 'command', 'args', 'cwd', 'env', 'headers', 'enabled', 'timeoutMs'].includes(key),
      `field ${key} must be in the ZCode server schema allowlist`,
    );
  }
  assert.ok(parsed.mcp.servers['aios-shell'].timeoutMs >= 30000, 'shell proxy timeout normalized');
  // user-owned servers pass through untouched, including unknown fields
  assert.equal(parsed.mcp.servers['user-own-server'].customField, 'keep-me');
});

test('migrateOneMcpJsonFile keeps unrelated zcode servers and is idempotent', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'config.json');
  await writeFile(filePath, JSON.stringify({
    mcp: { servers: { 'user-own-server': { type: 'stdio', command: 'uvx', args: ['own-mcp'] } } },
  }, null, 2));

  const first = migrateOneMcpJsonFile(filePath, rootDir, { serversKey: 'mcp.servers' });
  assert.equal(first.status, 'updated');
  const parsed = JSON.parse(first.nextRaw);
  assert.deepEqual(
    parsed.mcp.servers['user-own-server'],
    { type: 'stdio', command: 'uvx', args: ['own-mcp'] },
    'unrelated user servers must not be clobbered',
  );

  await writeFile(filePath, first.nextRaw);
  const second = migrateOneMcpJsonFile(filePath, rootDir, { serversKey: 'mcp.servers' });
  assert.equal(second.status, 'unchanged', 'second migration run is a no-op');
});
