import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { migrateOneMcpToml } from '../lib/components/browser/mcp-toml.mjs';
import {
  AUTH_TOOLS_ALIAS,
  PRIMARY_BROWSER_ALIAS,
  SHELL_ALIAS,
} from '../lib/components/browser/constants.mjs';

async function makeTemp() {
  return mkdtemp(path.join(os.tmpdir(), 'aios-mcp-toml-'));
}

test('migrateOneMcpToml creates codex mcp_servers sections for browser + auth aliases', async () => {
  const rootDir = process.cwd();
  const dir = await makeTemp();
  const filePath = path.join(dir, 'config.toml');

  const result = migrateOneMcpToml(filePath, rootDir);
  assert.equal(result.status, 'created');
  assert.match(result.nextRaw, new RegExp(`\\[mcp_servers\\.${PRIMARY_BROWSER_ALIAS}\\]`));
  assert.match(result.nextRaw, new RegExp(`\\[mcp_servers\\.${AUTH_TOOLS_ALIAS}\\]`));
  assert.match(result.nextRaw, new RegExp(`\\[mcp_servers\\.${SHELL_ALIAS}\\]`));
  assert.match(result.nextRaw, /command = "/);
  assert.match(result.nextRaw, /args = \[/);
  assert.match(result.nextRaw, new RegExp(`\\[mcp_servers\\.${PRIMARY_BROWSER_ALIAS}\\.env\\]`));
  assert.doesNotMatch(result.nextRaw, /env = \{/);
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
  assert.match(result.nextRaw, new RegExp(`\\[mcp_servers\\.${PRIMARY_BROWSER_ALIAS}\\]`));
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
  assert.match(result.nextRaw, new RegExp(`\\[mcp_servers\\.${PRIMARY_BROWSER_ALIAS}\\]`));
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
    `[mcp_servers.${PRIMARY_BROWSER_ALIAS}]`,
    'type = "stdio"',
    'command = "node"',
    'args = ["legacy-browser.mjs"]',
    'env = { "INLINE_FLAG" = "inline" }',
    '',
    `[mcp_servers.${PRIMARY_BROWSER_ALIAS}.env]`,
    'NESTED_FLAG = "nested"',
    '',
    '[mcp_servers.user-server]',
    'command = "node"',
    'args = ["keep.mjs"]',
    '',
  ].join('\n'), 'utf8');

  const result = migrateOneMcpToml(filePath, rootDir);

  assert.equal(result.status, 'updated');
  assert.match(result.nextRaw, new RegExp(`\\[mcp_servers\\.${PRIMARY_BROWSER_ALIAS}\\.env\\]`));
  assert.match(result.nextRaw, /INLINE_FLAG = "inline"/);
  assert.match(result.nextRaw, /NESTED_FLAG = "nested"/);
  assert.doesNotMatch(result.nextRaw, /env = \{/);
  assert.equal((result.nextRaw.match(new RegExp(`\\[mcp_servers\\.${PRIMARY_BROWSER_ALIAS}\\.env\\]`, 'gu')) || []).length, 1);
  assert.match(result.nextRaw, /\[mcp_servers\.user-server\]/);
});
