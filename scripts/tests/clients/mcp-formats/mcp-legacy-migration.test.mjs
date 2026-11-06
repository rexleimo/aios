// scripts/tests/clients/mcp-formats/mcp-legacy-migration.test.mjs — 旧 browser 写入器的三种方言迁移。
//
// 为什么这三份合成一份（原 `mcp-migration.test.mjs` / `mcp-opencode.test.mjs` / `mcp-toml.test.mjs`）：
// `scripts/tests/clients/mcp-formats/` 的目录预算上限是 8，w5a 新增了 replace/变换/rootKeys 的用例与共享
// fixture，两个新文件进来就必须有两个同族文件出去。这三个文件测的是**同一个组件**的三种落点方言
// （`browser/mcp/mcp-migration.mjs` 的 JSON、`formats/mcp-opencode.mjs`、`formats/mcp-toml.mjs`），
// 收编（w5b）时它们要么一起留、要么一起删——所以「一个文件一个责任」在这里就指「旧 browser 写入器迁移」。
// 拆成三份不是三个责任，是同一份作者的三个格式分支。
//
// 目录预算不是风格问题：`scripts/tests/clients/` 本身 8/8 顶格，不能再开子目录，所以搬家也不通。
// 本文件只做合并，用例内容与断言逐条保留（2026-11-05）。
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { migrateOneMcpJsonFile } from '../../../lib/tooling/components/browser/mcp/mcp-migration.mjs';
import { migrateOneMcpOpencodeJson } from '../../../lib/tooling/components/browser/mcp/formats/mcp-opencode.mjs';
import { migrateOneMcpToml } from '../../../lib/tooling/components/browser/mcp/formats/mcp-toml.mjs';
import {
  AUTH_TOOLS_ALIAS,
  PRIMARY_BROWSER_ALIAS,
  SHELL_ALIAS,
} from '../../../lib/tooling/components/browser/constants.mjs';

const makeTemp = () => mkdtemp(path.join(os.tmpdir(), 'aios-mcp-legacy-'));

const BRACKET = (alias) => `[mcp_servers.${alias}]`;
const ENV_BRACKET = (alias) => `[mcp_servers.${alias}.env]`;

const splitLines = (raw) => raw.split(/\r?\n/);

// ── JSON 方言（claude 家族） ────────────────────────────────────────────────

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

// ── opencode 方言（mcp + experimental.mcp_timeout） ─────────────────────────

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

// ── TOML 方言（codex mcp_servers） ──────────────────────────────────────────

test('migrateOneMcpToml creates codex mcp_servers sections for browser + auth aliases', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'config.toml');

  const result = migrateOneMcpToml(filePath, rootDir);
  assert.equal(result.status, 'created');
  assert.ok(result.nextRaw.includes(BRACKET(PRIMARY_BROWSER_ALIAS)));
  assert.ok(result.nextRaw.includes(BRACKET(AUTH_TOOLS_ALIAS)));
  assert.ok(result.nextRaw.includes(BRACKET(SHELL_ALIAS)));
  assert.match(result.nextRaw, /command = "/);
  assert.match(result.nextRaw, /args = \[/);
  assert.ok(result.nextRaw.includes(ENV_BRACKET(PRIMARY_BROWSER_ALIAS)));
  assert.doesNotMatch(result.nextRaw, /env = \{/);
});

test('migrateOneMcpToml keeps aios-shell proxy chain and adds startup timeout', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'config.toml');

  const result = migrateOneMcpToml(filePath, rootDir);
  assert.equal(result.status, 'created');
  // 代理链路保留：aios-shell 段含 aios-mcp-proxy.mjs + shell-mcp-server.mjs 上游
  const shellSection = splitLines(result.nextRaw).findIndex((line) => line === BRACKET(SHELL_ALIAS));
  assert.ok(shellSection >= 0, 'shell section present');
  const shellLines = splitLines(result.nextRaw).slice(shellSection, shellSection + 12).join('\n');
  assert.match(shellLines, /aios-mcp-proxy\.mjs/, 'proxy chain retained');
  assert.match(shellLines, /shell-mcp-server\.mjs/, 'upstream shell server retained');
  // 代理 env 保留（压缩/观测依赖这些变量）
  assert.match(shellLines, /AIOS_MCP_PROXY/, 'proxy env var retained');
  // 每个受管 server 都有 startup_timeout_sec 兜底
  for (const alias of [PRIMARY_BROWSER_ALIAS, AUTH_TOOLS_ALIAS, SHELL_ALIAS]) {
    const lines = splitLines(result.nextRaw);
    const section = lines.findIndex((line) => line === BRACKET(alias));
    assert.ok(section >= 0, `section ${alias} present`);
    const following = lines.slice(section, section + 8).join('\n');
    assert.match(following, /startup_timeout_sec = \d+/, `${alias} has startup timeout`);
  }
});

test('migrateOneMcpToml preserves unrelated codex config and is idempotent', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'config.toml');
  await writeFile(filePath, 'model = "gpt-5"\n\n[history]\npersistence = "save-all"\n', 'utf8');

  const first = migrateOneMcpToml(filePath, rootDir);
  assert.equal(first.status, 'updated');
  assert.match(first.nextRaw, /model = "gpt-5"/);
  assert.match(first.nextRaw, /\[history\]/);
  assert.match(first.nextRaw, /persistence = "save-all"/);
  await writeFile(filePath, first.nextRaw, 'utf8');

  const second = migrateOneMcpToml(filePath, rootDir);
  assert.equal(second.status, 'unchanged');
  assert.equal(await readFile(filePath, 'utf8'), first.nextRaw);
});

test('migrateOneMcpToml writes only the primary browser alias', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'config.toml');
  await writeFile(filePath, [
    'model = "gpt-5"',
    '',
    'command = "node"',
    'args = ["old-legacy.js"]',
    '',
  ].join('\n'), 'utf8');

  const result = migrateOneMcpToml(filePath, rootDir);
  assert.equal(result.status, 'updated');
  assert.ok(result.nextRaw.includes(BRACKET(PRIMARY_BROWSER_ALIAS)));
  assert.match(result.nextRaw, /model = "gpt-5"/);
});

test('migrateOneMcpToml removes legacy browser aliases and preserves env from the first existing browser entry', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'config.toml');
  await writeFile(filePath, [
    'model = "gpt-5"',
    '',
    '[mcp_servers.puppeteer-stealth]',
    'type = "stdio"',
    'command = "node"',
    'args = ["legacy-browser.mjs"]',
    'env = { "CUSTOM_FLAG" = "from-puppeteer", "KEEP_ME" = "yes", "BROWSER_USE_CDP_URL" = "http://127.0.0.1:9333" }',
    '',
    '[mcp_servers.playwright-browser-mcp]',
    'type = "stdio"',
    'command = "node"',
    'args = ["legacy-playwright.mjs"]',
    'env = { "CUSTOM_FLAG" = "from-playwright" }',
    '',
  ].join('\n'), 'utf8');

  const result = migrateOneMcpToml(filePath, rootDir);
  assert.equal(result.status, 'updated');
  assert.match(result.nextRaw, /model = "gpt-5"/);
  assert.ok(result.nextRaw.includes(BRACKET(PRIMARY_BROWSER_ALIAS)));
  assert.doesNotMatch(result.nextRaw, /\[mcp_servers\.puppeteer-stealth\]/);
  assert.doesNotMatch(result.nextRaw, /\[mcp_servers\.playwright-browser-mcp\]/);
  assert.match(result.nextRaw, /CUSTOM_FLAG = "from-puppeteer"/);
  assert.match(result.nextRaw, /KEEP_ME = "yes"/);
  assert.match(result.nextRaw, /BROWSER_USE_CDP_URL = "http:\/\/127\.0\.0\.1:9333"/);
});

test('migrateOneMcpToml normalizes mixed inline and nested env tables without losing values', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'config.toml');
  await writeFile(filePath, [
    'model = "gpt-5"',
    '',
    BRACKET(PRIMARY_BROWSER_ALIAS),
    'type = "stdio"',
    'command = "node"',
    'args = ["legacy-browser.mjs"]',
    'env = { "INLINE_FLAG" = "inline" }',
    '',
    ENV_BRACKET(PRIMARY_BROWSER_ALIAS),
    'NESTED_FLAG = "nested"',
    '',
    '[mcp_servers.user-server]',
    'command = "node"',
    'args = ["keep.mjs"]',
    '',
  ].join('\n'), 'utf8');

  const result = migrateOneMcpToml(filePath, rootDir);

  assert.equal(result.status, 'updated');
  assert.ok(result.nextRaw.includes(ENV_BRACKET(PRIMARY_BROWSER_ALIAS)));
  assert.match(result.nextRaw, /INLINE_FLAG = "inline"/);
  assert.match(result.nextRaw, /NESTED_FLAG = "nested"/);
  assert.doesNotMatch(result.nextRaw, /env = \{/);
  assert.equal(result.nextRaw.split(ENV_BRACKET(PRIMARY_BROWSER_ALIAS)).length - 1, 1);
  assert.ok(result.nextRaw.includes('[mcp_servers.user-server]'));
});