import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { migrateOneMcpOpencodeJson } from '../lib/components/browser/mcp-opencode.mjs';
import { PRIMARY_BROWSER_ALIAS, AUTH_TOOLS_ALIAS, LEGACY_BROWSER_ALIAS } from '../lib/components/browser/constants.mjs';

async function makeTemp() {
  return mkdtemp(path.join(os.tmpdir(), 'aios-mcp-opencode-'));
}

test('migrateOneMcpOpencodeJson writes opencode local-shape entries under the mcp namespace', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'opencode.json');

  const result = migrateOneMcpOpencodeJson(filePath, rootDir);
  assert.equal(result.status, 'created');
  const parsed = JSON.parse(result.nextRaw);

  // opencode uses `mcp` (not mcpServers)
  assert.ok(parsed.mcp, 'has mcp namespace');
  const browser = parsed.mcp[PRIMARY_BROWSER_ALIAS];
  assert.equal(browser.type, 'local');
  assert.equal(browser.enabled, true);
  assert.ok(Array.isArray(browser.command), 'command is an array');
  // env must survive as `environment` (browser server requires CDP url etc.)
  assert.ok(browser.environment && browser.environment.BROWSER_USE_CDP_URL, 'env mapped to environment');
  assert.ok(parsed.mcp[AUTH_TOOLS_ALIAS], 'auth tools registered');
});

test('migrateOneMcpOpencodeJson preserves unrelated keys, drops legacy alias, is idempotent', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'opencode.json');
  await writeFile(filePath, JSON.stringify({
    theme: 'dark',
    mcp: {
      [LEGACY_BROWSER_ALIAS]: { type: 'local', command: ['x'], enabled: true },
      'user-server': { type: 'local', command: ['keep'], enabled: true },
    },
  }, null, 2), 'utf8');

  const first = migrateOneMcpOpencodeJson(filePath, rootDir);
  assert.equal(first.status, 'updated');
  const parsed = JSON.parse(first.nextRaw);
  assert.equal(parsed.theme, 'dark');                       // unrelated top-level preserved
  assert.ok(parsed.mcp['user-server']);                      // unrelated server preserved
  assert.equal(parsed.mcp[LEGACY_BROWSER_ALIAS], undefined); // legacy alias removed
  await writeFile(filePath, first.nextRaw, 'utf8');

  const second = migrateOneMcpOpencodeJson(filePath, rootDir);
  assert.equal(second.status, 'unchanged');
  assert.equal(await readFile(filePath, 'utf8'), first.nextRaw);
});
