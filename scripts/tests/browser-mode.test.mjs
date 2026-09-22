/* 中文注释：浏览器 MCP 安装选型（none/playwright/bsk）与按 mode 门控注入的测试。
   覆盖 acceptance：mode 三态下 materialize 出的 mcp 配置，browser 条目有/无且互斥。 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  BROWSER_MODES,
  browserManagedServer,
  browserModeAppliesPlaywright,
  resolveBrowserMode,
  setBrowserModeInSettings,
  validateBrowserMode,
} from '../lib/components/browser/mcp-mode.mjs';
import { migrateOneMcpJsonFile } from '../lib/components/browser/mcp-migration.mjs';
import { migrateOneMcpToml } from '../lib/components/browser/mcp-toml.mjs';
import { migrateOneMcpOpencodeJson } from '../lib/components/browser/mcp-opencode.mjs';
import { migrateOneHermesYaml } from '../lib/components/browser/mcp-hermes-yaml.mjs';
import { resolveLocalBrowserMcpScript } from '../lib/components/browser/runtime-paths.mjs';

test('resolveBrowserMode 归一化字符串与非法值', () => {
  assert.equal(resolveBrowserMode('playwright'), 'playwright');
  assert.equal(resolveBrowserMode('bsk'), 'bsk');
  assert.equal(resolveBrowserMode('none'), 'none');
  assert.equal(resolveBrowserMode(' PLAYWRIGHT '), 'playwright', 'trim + lowercase');
  assert.equal(resolveBrowserMode('bogus'), 'none', '非法 → 默认 none');
  assert.equal(resolveBrowserMode(null), 'none');
  assert.equal(BROWSER_MODES.length, 3);
});

test('validateBrowserMode 只认三态', () => {
  for (const mode of BROWSER_MODES) {
    assert.equal(validateBrowserMode(mode), true);
    assert.equal(browserModeAppliesPlaywright(mode), mode === 'playwright');
  }
  assert.equal(browserModeAppliesPlaywright('none'), false);
  assert.equal(browserModeAppliesPlaywright('bsk'), false);
  assert.equal(browserModeAppliesPlaywright('garbage'), false);
});

test('browserManagedServer：mode 未注入 Playwright → null；默认沿用旧行为注入', () => {
  const rootDir = '/root';
  assert.equal(browserManagedServer(rootDir, {}, {}, 'none'), null);
  assert.equal(browserManagedServer(rootDir, {}, {}, 'bsk'), null);
  // 传入 mode 但未到 Playwright → null
  const playwright = browserManagedServer(rootDir, {}, {}, 'playwright');
  assert.equal(typeof playwright, 'object');
  assert.equal(playwright.command, 'node');
});

test('resolveBrowserMode 读 settings 对象 / config/settings.json / 缺失回 none', async () => {
  assert.equal(resolveBrowserMode({ browser: { mcp: 'bsk' } }), 'bsk');
  assert.equal(resolveBrowserMode({ mcp: 'playwright' }), 'playwright');
  assert.equal(resolveBrowserMode({}), 'none');
  assert.equal(resolveBrowserMode(null, { rootDir: '/missing' }), 'none');

  const rootDir = await mkdtemp('aios-browser-mode-settings-');
  await mkdir(path.join(rootDir, 'config'), { recursive: true });
  await writeFile(path.join(rootDir, 'config', 'settings.json'), '{"browser":{"mcp":"bsk"}}\n', 'utf8');
  assert.equal(resolveBrowserMode(null, { rootDir }), 'bsk');
});

test('setBrowserModeInSettings 写入后再读回一致（随时可改落点）', async () => {
  const rootDir = await mkdtemp('aios-browser-mode-write-');
  await mkdir(path.join(rootDir, 'config'), { recursive: true });

  setBrowserModeInSettings(rootDir, 'playwright');
  assert.equal(resolveBrowserMode(null, { rootDir }), 'playwright');

  // 重复切换：none 优先被解析，非法抛错
  setBrowserModeInSettings(rootDir, 'none');
  assert.equal(resolveBrowserMode(null, { rootDir }), 'none');
  assert.throws(() => setBrowserModeInSettings(rootDir, 'weird'));
});

// ── 各格式 writer 按 mode 门控注入 ──

test('JSON writer：none 不写入 browser 条目（auth/shell 仍注入），playwright 写入', async () => {
  const rootDir = await mkdtemp('aios-browser-mode-json-');

  const nonePath = path.join(rootDir, 'none.json');
  await writeFile(nonePath, JSON.stringify({}), 'utf8');
  const noneResult = migrateOneMcpJsonFile(nonePath, rootDir, { mode: 'none' });
  const noneParsed = JSON.parse(noneResult.nextRaw);
  assert.equal('mcp-browser-use' in noneParsed.mcpServers, false, 'none → 无 browser 条目');
  assert.equal('aios-auth-tools' in noneParsed.mcpServers, true);
  assert.equal('aios-shell' in noneParsed.mcpServers, true);

  const pwPath = path.join(rootDir, 'pw.json');
  await writeFile(pwPath, JSON.stringify({}), 'utf8');
  const pwResult = migrateOneMcpJsonFile(pwPath, rootDir, { mode: 'playwright' });
  const pwParsed = JSON.parse(pwResult.nextRaw);
  assert.equal('mcp-browser-use' in pwParsed.mcpServers, true, 'playwright → 有 browser 条目');
});

test('TOML writer：none 不写 [mcp_servers.mcp-browser-use] 段', async () => {
  const rootDir = await mkdtemp('aios-browser-mode-toml-');
  const filePath = path.join(rootDir, 'config.toml');
  await writeFile(filePath, 'model = "gpt-5"\n', 'utf8');

  const noneResult = migrateOneMcpToml(filePath, rootDir, { mode: 'none' });
  assert.match(noneResult.nextRaw, /model = "gpt-5"/, '保留用户配置');
  assert.match(noneResult.nextRaw, /mcp_servers\.aios-auth-tools\]/, 'auth 段在');
  assert.doesNotMatch(noneResult.nextRaw, /mcp_servers\.mcp-browser-use\]/, 'none → 无 browser 段');

  const pwResult = migrateOneMcpToml(filePath, rootDir, { mode: 'playwright' });
  assert.match(pwResult.nextRaw, /mcp_servers\.mcp-browser-use\]/, 'playwright → 有 browser 段');
});

test('opencode writer：none 不写 mcp[本 browser 命名空间] 条目', async () => {
  const rootDir = await mkdtemp('aios-browser-mode-opencode-');
  const filePath = path.join(rootDir, 'opencode.json');
  await writeFile(filePath, JSON.stringify({ theme: 'dark' }), 'utf8');

  const noneResult = migrateOneMcpOpencodeJson(filePath, rootDir, { mode: 'none' });
  const noneParsed = JSON.parse(noneResult.nextRaw);
  assert.equal(noneParsed.theme, 'dark');
  assert.equal('mcp-browser-use' in noneParsed.mcp, false, 'none → 无 browser 条目');
  assert.equal('aios-auth-tools' in noneParsed.mcp, true);

  const pwResult = migrateOneMcpOpencodeJson(filePath, rootDir, { mode: 'playwright' });
  const pwParsed = JSON.parse(pwResult.nextRaw);
  assert.equal('mcp-browser-use' in pwParsed.mcp, true);
});

test('Hermes YAML writer：none 不写 browser 段', async () => {
  const rootDir = await mkdtemp('aios-browser-mode-yaml-');
  const filePath = path.join(rootDir, 'config.yaml');
  await writeFile(filePath, 'model: test\n', 'utf8');

  const noneResult = migrateOneHermesYaml(filePath, rootDir, { mode: 'none' });
  const asYaml = noneResult.nextRaw;
  assert.doesNotMatch(asYaml, /mcp-browser-use/u, 'none → YAML 无 browser 段');

  const pwResult = migrateOneHermesYaml(filePath, rootDir, { mode: 'playwright' });
  assert.match(pwResult.nextRaw, /mcp-browser-use/u, 'playwright → YAML 有 browser 段');
});

// ── 顶层 migrate：mode 从 settings 解析，互斥下发 ──

async function makeMigrateRoot(rootDir, { withRuntime } = {}) {
  await mkdir(path.join(rootDir, 'scripts'), { recursive: true });
  await mkdir(path.join(rootDir, 'mcp-server'), { recursive: true });
  await mkdir(path.join(rootDir, 'config'), { recursive: true });
  await writeFile(path.join(rootDir, 'config', 'browser-profiles.json'),
    JSON.stringify({ profiles: { default: { cdpPort: 9333 } } }), 'utf8');
  await writeFile(path.join(rootDir, 'config', 'settings.json'),
    JSON.stringify({ browser: { mcp: withRuntime ? 'playwright' : 'none' } }), 'utf8');
  if (withRuntime) {
    await writeFile(path.join(rootDir, 'config', 'settings.json'),
      JSON.stringify({ browser: { mcp: 'playwright' } }), 'utf8');
    await writeFile(resolveLocalBrowserMcpScript(rootDir), '#!/usr/bin/env node\n', 'utf8');
    await writeFile(path.join(rootDir, 'mcp-server', 'package.json'), '{"name":"local-mcp"}\n', 'utf8');
  }
}

test('migrate 默认 none：client .mcp.json 有 auth/shell、无 browser（默认关闭验收）', async () => {
  const rootDir = await mkdtemp('aios-browser-migrate-none-');
  const codexHome = await mkdtemp('aios-browser-migrate-codex-');
  await mkdir(codexHome, { recursive: true });
  await writeFile(path.join(codexHome, 'config.toml'), 'model = "gpt"\n', 'utf8');

  await makeMigrateRoot(rootDir, { withRuntime: false });
  const logs = [];
  const result = await import('../lib/components/browser.mjs').then((m) => m.migrateBrowserMcpConfig({
    rootDir,
    io: { log: (line) => logs.push(String(line)) },
    clientHomes: { codex: codexHome },
  }));

  assert.equal(result.errors, 0);
  const codexToml = await readFile(path.join(codexHome, 'config.toml'), 'utf8');
  assert.doesNotMatch(codexToml, /mcp_servers\.mcp-browser-use\]/, 'none → 无 browser 段');
  assert.match(codexToml, /mcp_servers\.aios-auth-tools\]/, 'auth 段在');

  // 切到 playwright 后应出现 browser 段
  const p2 = await mkdtemp('aios-browser-migrate-pw-');
  await mkdir(path.join(p2, 'scripts'), { recursive: true });
  await mkdir(path.join(p2, 'mcp-server'), { recursive: true });
  await mkdir(path.join(p2, 'config'), { recursive: true });
  await writeFile(path.join(p2, 'config', 'browser-profiles.json'), JSON.stringify({ profiles: {} }), 'utf8');
  await writeFile(path.join(p2, 'config', 'settings.json'), JSON.stringify({ browser: { mcp: 'playwright' } }), 'utf8');
  await writeFile(resolveLocalBrowserMcpScript(p2), '#!/usr/bin/env node\n', 'utf8');
  await writeFile(path.join(p2, 'mcp-server', 'package.json'), '{"name":"local-mcp"}\n', 'utf8');
  const codexHome2 = await mkdtemp('aios-browser-migrate-codex2-');
  await mkdir(codexHome2, { recursive: true });
  await writeFile(path.join(codexHome2, 'config.toml'), 'model = "gpt"\n', 'utf8');
  await import('../lib/components/browser.mjs').then((m) => m.migrateBrowserMcpConfig({
    rootDir: p2, io: { log: () => {} }, clientHomes: { codex: codexHome2 },
  }));
  const codexToml2 = await readFile(path.join(codexHome2, 'config.toml'), 'utf8');
  assert.match(codexToml2, /mcp_servers\.mcp-browser-use\]/, 'playwright → 有 browser 段');
});
