import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { migrateOneMcpOpencodeJson } from '../lib/components/browser/mcp-opencode.mjs';
import {
  AUTH_TOOLS_ALIAS,
  PRIMARY_BROWSER_ALIAS,
  SHELL_ALIAS,
} from '../lib/components/browser/constants.mjs';

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
  assert.ok(parsed.mcp[SHELL_ALIAS], 'shell tool registered');
  const shell = parsed.mcp[SHELL_ALIAS];
  assert.equal(shell.type, 'local');
  assert.equal(shell.enabled, true);
  assert.ok(Array.isArray(shell.command), 'shell command is an array');
});

test('migrateOneMcpOpencodeJson keeps aios-shell proxy chain and injects mcp_timeout', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'opencode.json');

  const result = migrateOneMcpOpencodeJson(filePath, rootDir);
  assert.equal(result.status, 'created');
  const parsed = JSON.parse(result.nextRaw);

  // 代理链路保留：shell 命令含 aios-mcp-proxy.mjs + shell-mcp-server.mjs 上游
  const shellCommand = parsed.mcp[SHELL_ALIAS].command.join(' ');
  assert.ok(shellCommand.includes('aios-mcp-proxy.mjs'), 'proxy chain retained');
  assert.ok(shellCommand.includes('shell-mcp-server.mjs'), 'upstream shell server retained');
  // 代理 env 保留（压缩/观测依赖这些变量）
  const shellEnv = parsed.mcp[SHELL_ALIAS].environment || {};
  assert.equal(shellEnv.AIOS_MCP_PROXY, '1', 'proxy env var retained');
  assert.equal(shellEnv.AIOS_MCP_UPSTREAM_HOST, 'aios-shell', 'proxy host env retained');

  // 全局 opencode.json 注入 experimental.mcp_timeout 兜底，避免工具挂起时无限等待
  assert.ok(parsed.experimental, 'experimental namespace injected');
  assert.equal(parsed.experimental.mcp_timeout, 90_000, 'mcp_timeout default injected');

  // 用户已有的 mcp_timeout 不被覆盖
  const dir2 = await makeTemp();
  const filePath2 = path.join(dir2, 'opencode.json');
  await writeFile(filePath2, JSON.stringify({
    experimental: { mcp_timeout: 42_000 },
    mcp: {},
  }, null, 2), 'utf8');
  const kept = migrateOneMcpOpencodeJson(filePath2, rootDir);
  assert.equal(kept.status, 'updated');
  const keptParsed = JSON.parse(kept.nextRaw);
  assert.equal(keptParsed.experimental.mcp_timeout, 42_000, 'existing mcp_timeout preserved');
});

test('migrateOneMcpOpencodeJson preserves unrelated keys and is idempotent', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'opencode.json');
  await writeFile(filePath, JSON.stringify({
    theme: 'dark',
    mcp: {
      'user-server': { type: 'local', command: ['keep'], enabled: true },
    },
  }, null, 2), 'utf8');

  const first = migrateOneMcpOpencodeJson(filePath, rootDir);
  assert.equal(first.status, 'updated');
  const parsed = JSON.parse(first.nextRaw);
  assert.equal(parsed.theme, 'dark');                       // unrelated top-level preserved
  assert.ok(parsed.mcp['user-server']);                      // unrelated server preserved
  await writeFile(filePath, first.nextRaw, 'utf8');

  const second = migrateOneMcpOpencodeJson(filePath, rootDir);
  assert.equal(second.status, 'unchanged');
  assert.equal(await readFile(filePath, 'utf8'), first.nextRaw);
});

test('migrateOneMcpOpencodeJson migrates legacy browser aliases into only mcp-browser-use and preserves env', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'opencode.json');
  await writeFile(filePath, JSON.stringify({
    theme: 'dark',
    mcp: {
      'puppeteer-stealth': {
        type: 'local',
        command: ['legacy-browser.mjs'],
        enabled: true,
        environment: {
          CUSTOM_FLAG: 'from-puppeteer',
          KEEP_ME: 'yes',
          BROWSER_USE_CDP_URL: 'http://127.0.0.1:9333',
        },
      },
      'playwright-browser-mcp': {
        type: 'local',
        command: ['legacy-playwright.mjs'],
        enabled: true,
        environment: {
          CUSTOM_FLAG: 'from-playwright',
        },
      },
      'user-server': { type: 'local', command: ['keep'], enabled: true },
    },
  }, null, 2), 'utf8');

  const result = migrateOneMcpOpencodeJson(filePath, rootDir);
  assert.equal(result.status, 'updated');

  const parsed = JSON.parse(result.nextRaw);
  assert.equal(parsed.theme, 'dark');
  const browser = parsed.mcp[PRIMARY_BROWSER_ALIAS];
  assert.ok(browser, 'browser alias migrated');
  assert.equal(browser.environment.CUSTOM_FLAG, 'from-puppeteer');
  assert.equal(browser.environment.KEEP_ME, 'yes');
  assert.equal(browser.environment.BROWSER_USE_CDP_URL, 'http://127.0.0.1:9333');
  assert.ok(!parsed.mcp['puppeteer-stealth'], 'legacy puppeteer alias removed');
  assert.ok(!parsed.mcp['playwright-browser-mcp'], 'legacy playwright alias removed');
  assert.ok(parsed.mcp['user-server'], 'unrelated server preserved');
});
