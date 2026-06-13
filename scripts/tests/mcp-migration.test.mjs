import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { migrateOneMcpJsonFile } from '../lib/components/browser/mcp-migration.mjs';
import { PRIMARY_BROWSER_ALIAS } from '../lib/components/browser/constants.mjs';

async function makeTemp() {
  return mkdtemp(path.join(os.tmpdir(), 'aios-mcp-migration-'));
}

test('migrateOneMcpJsonFile creates browser/auth/shell entries under mcpServers', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'mcp.json');

  const result = migrateOneMcpJsonFile(filePath, rootDir);
  assert.equal(result.status, 'created');

  const parsed = JSON.parse(result.nextRaw);
  assert.ok(parsed.mcpServers, 'has mcpServers namespace');
  assert.ok(parsed.mcpServers[PRIMARY_BROWSER_ALIAS], 'browser server created');
});

test('migrateOneMcpJsonFile migrates legacy browser aliases into only mcp-browser-use and preserves env', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'mcp.json');

  await writeFile(filePath, JSON.stringify({
    mcpServers: {
      'puppeteer-stealth': {
        type: 'stdio',
        command: 'node',
        args: ['legacy-browser.mjs'],
        env: {
          CUSTOM_FLAG: 'from-puppeteer',
          KEEP_ME: 'yes',
          BROWSER_USE_CDP_URL: 'http://127.0.0.1:9333',
        },
      },
      'playwright-browser-mcp': {
        type: 'stdio',
        command: 'node',
        args: ['legacy-playwright.mjs'],
        env: {
          CUSTOM_FLAG: 'from-playwright',
        },
      },
      'user-server': {
        type: 'stdio',
        command: 'node',
        args: ['keep.mjs'],
        env: {
          USER_FLAG: 'ok',
        },
      },
    },
  }, null, 2), 'utf8');

  const result = migrateOneMcpJsonFile(filePath, rootDir);
  assert.equal(result.status, 'updated');

  const parsed = JSON.parse(result.nextRaw);
  const servers = parsed.mcpServers;
  assert.ok(servers[PRIMARY_BROWSER_ALIAS], 'browser alias migrated');
  assert.equal(servers[PRIMARY_BROWSER_ALIAS].env.CUSTOM_FLAG, 'from-puppeteer');
  assert.equal(servers[PRIMARY_BROWSER_ALIAS].env.KEEP_ME, 'yes');
  assert.equal(servers[PRIMARY_BROWSER_ALIAS].env.BROWSER_USE_CDP_URL, 'http://127.0.0.1:9333');
  assert.ok(!servers['puppeteer-stealth'], 'legacy puppeteer alias removed');
  assert.ok(!servers['playwright-browser-mcp'], 'legacy playwright alias removed');
  assert.ok(servers['user-server'], 'unrelated server preserved');

  await writeFile(filePath, result.nextRaw, 'utf8');
  const second = migrateOneMcpJsonFile(filePath, rootDir);
  assert.equal(second.status, 'unchanged');
  assert.equal(await readFile(filePath, 'utf8'), result.nextRaw);
});
