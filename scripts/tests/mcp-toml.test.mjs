import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { migrateOneMcpToml } from '../lib/components/browser/mcp-toml.mjs';
import { PRIMARY_BROWSER_ALIAS, AUTH_TOOLS_ALIAS } from '../lib/components/browser/constants.mjs';

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
  assert.match(result.nextRaw, /command = "/);
  assert.match(result.nextRaw, /args = \[/);
  assert.match(result.nextRaw, /env = \{/);
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
