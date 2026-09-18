import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { PRIMARY_BROWSER_ALIAS } from '../lib/components/browser/constants.mjs';
import { migrateOneGeminiJsonFile, normalizeGeminiServerEntry } from '../lib/components/browser/mcp-gemini.mjs';
import { getClientMcpTarget } from '../lib/clients/registry.mjs';

/* gemini 的真实 schema 取自 @google/gemini-cli bundle 的 McpServerConfigSchema。
   注意 timeout 的单位是毫秒（"Timeout in milliseconds for MCP requests."），
   且 schema 里没有 startupTimeoutSec —— 这正是 gemini 报
   "Unrecognized key(s) in object: 'startupTimeoutSec'" 的原因。 */
const GEMINI_SERVER_FIELDS = Object.freeze([
  'type', 'command', 'args', 'cwd', 'env', 'url', 'headers',
  'trust', 'timeout', 'description', 'includeTools', 'excludeTools',
]);

async function makeTemp() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'aios-gemini-mcp-'));
}

test('gemini: AIOS-managed servers are normalized to the gemini strict schema', () => {
  const entry = {
    type: 'stdio',
    command: 'node',
    args: ['script.mjs'],
    cwd: '/workspace',
    startupTimeoutSec: 60,
    env: { A: '1' },
  };

  const normalized = normalizeGeminiServerEntry(entry);

  // gemini 的严格校验会因为未知字段把整份 settings.json 判为无效配置。
  assert.equal(normalized.startupTimeoutSec, undefined, 'gemini rejects startupTimeoutSec');
  assert.equal(normalized.timeout, 60000, 'startup timeout must arrive as timeout in milliseconds');
  assert.equal(normalized.command, 'node');
  assert.equal(normalized.type, 'stdio');
  for (const key of Object.keys(normalized)) {
    assert.ok(GEMINI_SERVER_FIELDS.includes(key), `${key} must be in the gemini server schema`);
  }
});

test('gemini: writer repairs settings.json while preserving user-owned servers', async () => {
  const dir = await makeTemp();
  const filePath = path.join(dir, 'settings.json');
  await fs.writeFile(filePath, JSON.stringify({
    mcpServers: {
      'user-own-server': { command: 'uvx', args: ['own-mcp'], customField: 'keep-me' },
    },
  }, null, 2));

  const result = migrateOneGeminiJsonFile(filePath, process.cwd());
  assert.equal(result.status, 'updated');

  const parsed = JSON.parse(result.nextRaw);
  const browser = parsed.mcpServers[PRIMARY_BROWSER_ALIAS];
  assert.equal(browser.startupTimeoutSec, undefined, 'no unknown startupTimeoutSec field');
  assert.equal(browser.timeout, 60000, 'startup timeout translated to timeout in ms');
  assert.equal(parsed.mcpServers['user-own-server'].customField, 'keep-me', 'user servers stay byte-identical');
});

test('gemini: registry routes gemini MCP scopes through the normalizing format', () => {
  const target = getClientMcpTarget('gemini');
  // 与 zcode 同构：target 格式仍是 'json'，归一化写在 scope 层。
  assert.equal(target.format, 'json', 'target format stays generic json');
  assert.equal(target.namespace, 'mcpServers');
  for (const scope of target.scopes) {
    assert.equal(scope.format, 'gemini-json', `${scope.scope} scope must normalize; without this the fix is never applied`);
  }
});
