import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { migrateOneMcpJsonFile } from '../lib/components/browser/mcp-migration.mjs';
import { migrateOneZcodeJsonFile, normalizeZcodeServerEntry } from '../lib/components/browser/mcp-zcode.mjs';
import { collectClientMcpTargets } from '../lib/components/browser/mcp-targets.mjs';
import { PRIMARY_BROWSER_ALIAS } from '../lib/components/browser/constants.mjs';
import { getClientMcpTarget } from '../lib/clients/native/index.mjs';

async function makeTemp() {
  return mkdtemp(path.join(os.tmpdir(), 'aios-zcode-mcp-'));
}

// ZCode CLI 运行时（安装包 resources/glm/zcode.cjs）里 mcp.servers 条目的 zod schema：
// discriminatedUnion("type", [stdio|http|sse])，三个分支都 .strict()。
//   stdio: type | command(必填) | args | cwd | env
//   http/sse: type | url(必填) | headers
//   公共: headers | enabled | timeoutMs | protocolVersion | oauth
// 未知字段不会让整个配置文件失效，但会让该 server 被丢弃并记 config_mcp_server_invalid 警告。
const ZCODE_SERVER_SCHEMA_FIELDS = Object.freeze([
  'type', 'command', 'args', 'cwd', 'env',
  'url',
  'headers', 'enabled', 'timeoutMs', 'protocolVersion', 'oauth',
]);

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
  // fixture 路径在不同平台必须是绝对路径：POSIX 下为 /proj、/home/.zcode，
  // Windows 下 path.resolve 会落到当前盘符。断言用同一绝对根推导，
  // 并额外钉住相对后缀，避免退化为与实现同义反复。
  const projectRoot = path.resolve(path.sep, 'proj');
  const zcodeHome = path.resolve(path.sep, 'home', '.zcode');
  const targets = collectClientMcpTargets({
    projectRoot,
    clientHomes: { zcode: zcodeHome },
  }).filter((target) => target.client === 'zcode');
  const slash = (value) => String(value).replace(/\\/g, '/');
  const suffix = (value) => {
    const abs = slash(value);
    const home = slash(zcodeHome).replace(/\/$/, '');
    const project = slash(projectRoot).replace(/\/$/, '');
    if (abs.startsWith(home)) return `~${abs.slice(home.length)}`;
    if (abs.startsWith(project)) return `$${abs.slice(project.length)}`;
    return abs;
  };

  assert.deepEqual(targets.map((target) => [target.scope, suffix(target.path), target.namespace, target.createIfMissing]), [
    ['home', '~/cli/config.json', 'mcp.servers', true],
    ['project', '$/.zcode/config.json', 'mcp.servers', true],
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
      ZCODE_SERVER_SCHEMA_FIELDS.includes(key),
      `field ${key} must be in the ZCode server schema allowlist`,
    );
  }
  assert.ok(parsed.mcp.servers['aios-shell'].timeoutMs >= 30000, 'shell proxy timeout normalized');
  // user-owned servers pass through untouched, including unknown fields
  assert.equal(parsed.mcp.servers['user-own-server'].customField, 'keep-me');
});

// ZCode CLI runtime schema (installation resources/glm/zcode.cjs): discriminatedUnion("type",
// [stdio|http|sse]) with every branch .strict(); the http/sse branch REQUIRES `url`.
// 2026-09-22 (v6.0.13): the allowlist used to be reverse-engineered from the stdio branch only,
// so it dropped `url` — any AIOS-managed HTTP server then lost its required field and ZCode
// discarded the whole server (config_mcp_server_invalid). This pins the fix.
test('normalizeZcodeServerEntry keeps the http branch fields (url) and drops unknown ones', () => {
  const normalized = normalizeZcodeServerEntry({
    type: 'http',
    url: 'https://docs.typesafe.ai/mcp',
    headers: { Authorization: 'Bearer x' },
    protocolVersion: 'auto',
    startupTimeoutSec: 45,
    unknownField: 'drop-me',
    transport: 'stdio',
  });
  assert.equal(normalized.url, 'https://docs.typesafe.ai/mcp', 'http branch requires url — it must survive normalization');
  assert.deepEqual(normalized.headers, { Authorization: 'Bearer x' });
  assert.equal(normalized.protocolVersion, 'auto');
  assert.equal(normalized.timeoutMs, 45000, 'startupTimeoutSec translated to timeoutMs');
  assert.equal(normalized.type, 'http');
  assert.equal(normalized.unknownField, undefined, 'unknown fields are dropped so ZCode keeps the server');
  assert.equal(normalized.transport, undefined, 'legacy alias keys are not in the schema');
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
