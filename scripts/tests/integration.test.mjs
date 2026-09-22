import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { CLIENT_DEFINITIONS } from '../lib/clients/core/definitions.mjs';
import {
  INTEGRATION_CLIENT_TABLE,
  formatInvocation,
  getIntegrationClientEntry,
  resolveIntegrationClientCommand,
  resolveIntegrationClientOrder,
} from '../lib/integrations/clients.mjs';
import {
  checkSkillPlane,
  checkEnvVars,
  runIntegrationDoctor,
} from '../lib/integrations/doctor.mjs';
import {
  classifyIntegrationOwnership,
  fingerprintMcpEntry,
  isSkillOwnedByAios,
  normalizeMcpEntry,
  readIntegrationLedger,
  writeIntegrationLedger,
} from '../lib/integrations/ledger.mjs';
import {
  buildCatalogSkillContent,
  installSkillToCatalog,
  stagedFilesMatch,
  verifySkillFiles,
} from '../lib/integrations/skill.mjs';
import { upsertConfigEntry, readConfigEntryFor, buildDesiredMcpEntry } from '../lib/integrations/mcp.mjs';
import { defaultCommandExistsImpl } from '../lib/integrations/install.mjs';
import {
  IntegrationRegistryError,
  normalizeIntegrationRegistry,
  resolveIntegration,
} from '../lib/integrations/registry.mjs';
import { stripAiosFrontmatter } from '../lib/skills/frontmatter.mjs';
import { parseIntegrationArgs } from '../lib/cli/parse-args/integration.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const UPSTREAM_SKILL_MD = `---
name: demo-skill
license: MIT
description: >
  A demo vendor skill.
---

# Demo

Body text.
`;

function tempDir(prefix = 'aios-integration-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function readRegistry() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'integrations.json'), 'utf8'));
}

function validIntegration(overrides = {}) {
  return normalizeIntegrationRegistry({
    schemaVersion: 1,
    integrations: {
      demo: {
        displayName: 'Demo',
        vendor: 'demo',
        homepage: 'https://demo.example',
        skill: {
          repo: 'demo/skills',
          commit: 'a'.repeat(40),
          skillPath: 'skills/demo',
          entryFile: 'SKILL.md',
          sha256: 'b'.repeat(64),
          installName: 'demo',
          license: 'MIT',
        },
        mcp: { serverName: 'demo-docs', url: 'https://docs.demo.example/mcp', transport: 'http' },
        ...overrides,
      },
    },
  }).integrations.demo;
}

// ---------------------------------------------------------------- cli parsing

test('cli parsing: a global option value is never mistaken for the integration id', () => {
  // `--project-root .` 的值曾经被当作位置参数，导致 list 报 "does not take an integration id"。
  const list = parseIntegrationArgs(['integration', 'list', '--project-root', '.']);
  assert.equal(list.options.subcommand, 'list');
  assert.equal(list.options.id, '');
  assert.equal(list.options.projectRoot, '.');

  const add = parseIntegrationArgs(['integration', 'add', 'typesafe', '--dry-run', '--project-root', '/tmp/x']);
  assert.equal(add.options.id, 'typesafe');
  assert.equal(add.options.projectRoot, '/tmp/x');
  assert.equal(add.options.dryRun, true);

  assert.throws(
    () => parseIntegrationArgs(['integration', 'list', 'typesafe']),
    /does not take an integration id/u,
  );
  assert.throws(
    () => parseIntegrationArgs(['integration', 'add']),
    /requires an integration id/u,
  );
});

// ---------------------------------------------------------------- registry

test('integration registry: the shipped registry pins every skill by commit + hash', () => {
  const registry = normalizeIntegrationRegistry(readRegistry());
  const ids = Object.keys(registry.integrations);
  assert.ok(ids.includes('typesafe'), 'typesafe must be registered');
  for (const id of ids) {
    const entry = registry.integrations[id];
    assert.match(entry.skill.commit, /^[0-9a-f]{40}$/u, `${id} must pin a commit`);
    assert.match(entry.skill.sha256, /^[0-9a-f]{64}$/u, `${id} must pin a sha256`);
    assert.equal(new URL(entry.mcp.url).protocol, 'https:');
    assert.equal(entry.mcp.transport, 'http');
  }
});

test('integration registry: rejects an unpinned skill and a non-https endpoint', () => {
  const base = readRegistry();
  const noHash = structuredClone(base);
  delete noHash.integrations.typesafe.skill.sha256;
  assert.throws(() => normalizeIntegrationRegistry(noHash), IntegrationRegistryError);

  const noCommit = structuredClone(base);
  noCommit.integrations.typesafe.skill.commit = 'main';
  assert.throws(() => normalizeIntegrationRegistry(noCommit), IntegrationRegistryError);

  const insecure = structuredClone(base);
  insecure.integrations.typesafe.mcp.url = 'http://docs.typesafe.ai/mcp';
  assert.throws(() => normalizeIntegrationRegistry(insecure), IntegrationRegistryError);
});

test('integration registry: unknown ids fail loudly with the known list', () => {
  assert.throws(() => resolveIntegration({ rootDir: ROOT, id: 'nope' }), /unknown integration "nope"/);
  assert.equal(resolveIntegration({ rootDir: ROOT, id: 'TypeSafe' }).id, 'typesafe');
});

// ---------------------------------------------------------------- clients

test('integration clients: every AIOS client has a declared registration path', () => {
  const known = Object.keys(CLIENT_DEFINITIONS);
  assert.deepEqual([...resolveIntegrationClientOrder()].sort(), [...known].sort());
  for (const client of known) {
    const entry = getIntegrationClientEntry(client);
    assert.ok(entry, `${client} must have an integration table row`);
    assert.ok(['cli', 'config', 'manual'].includes(entry.transport), `${client} must declare a transport`);
    assert.equal(typeof entry.verified, 'boolean', `${client} must declare verification status`);
    assert.ok(String(entry.evidence || '').length > 10, `${client} must record its evidence`);
    if (entry.verified && entry.transport === 'cli') {
      assert.ok(entry.buildAdd, `${client} verified CLI clients must expose buildAdd`);
    }
    if (entry.transport === 'config') {
      assert.ok(entry.config, `${client} config clients must declare a target file`);
    }
    if (entry.transport === 'manual') {
      assert.ok(entry.config, `${client} manual clients must still declare a target file`);
      assert.ok(String(entry.placeholder || '').length > 0, `${client} manual clients must mark the unknown key`);
    }
    if (!entry.verified) {
      assert.ok(String(entry.unverifiedReason || '').length > 0, `${client} unverified clients must state why`);
    }
  }
});

test('integration clients: verified clients build the HTTP invocation we recorded', () => {
  assert.equal(
    formatInvocation(getIntegrationClientEntry('claude').buildAdd({ mcp: { serverName: 'x', url: 'https://d/mcp' }, scope: 'global' })),
    'claude mcp add --scope user --transport http x https://d/mcp',
  );
  assert.equal(
    formatInvocation(getIntegrationClientEntry('codex').buildAdd({ mcp: { serverName: 'x', url: 'https://d/mcp' } })),
    'codex mcp add x --url https://d/mcp',
  );
  assert.equal(
    formatInvocation(getIntegrationClientEntry('grok').buildAdd({ mcp: { serverName: 'x', url: 'https://d/mcp' }, scope: 'project' })),
    'grok mcp add -t http --scope project x https://d/mcp',
  );
  assert.equal(getIntegrationClientEntry('hermes').interactive, true, 'hermes must be marked interactive');
  assert.equal(getIntegrationClientEntry('pi').transport, 'config');

  // 2026-09-21 (v6.0.6): workbuddy 从 manual 升级为 config。实测 codebuddy 2.137.1 的
  // `mcp add` 没有 `--agent` 选项且支持 `-t http`，HTTP 条目形状为 {type:'http',url}，
  // 所以「键名未验证」的人工步骤前提消失了。
  const workbuddy = getIntegrationClientEntry('workbuddy');
  assert.equal(workbuddy.transport, 'config');
  assert.equal(workbuddy.verified, true);
  assert.deepEqual(
    workbuddy.config.buildEntry({ mcp: { serverName: 'x', url: 'https://d/mcp' } }),
    { type: 'http', url: 'https://d/mcp' },
  );
  assert.equal(workbuddy.config.namespace, 'mcpServers');

  // 2026-09-22 (v6.0.13): zcode 也从 manual 升级为 config。证据来自 ZCode 自带的 CLI 运行时
  // （安装包 resources/glm/zcode.cjs）里 mcp.servers 条目的 zod schema：
  // discriminatedUnion("type", [stdio|http|sse]) 且每分支 strict，http 分支要求 url。
  // 所以"HTTP transport 键名未验证"这个前提和 B1/C2 一样是错的：键名就是 type:"http" + url。
  const zcode = getIntegrationClientEntry('zcode');
  assert.equal(zcode.transport, 'config');
  assert.equal(zcode.verified, true);
  assert.deepEqual(
    zcode.config.buildEntry({ mcp: { serverName: 'x', url: 'https://d/mcp' } }),
    { type: 'http', url: 'https://d/mcp' },
  );
  assert.equal(zcode.config.namespace, 'mcp.servers');
  assert.deepEqual(zcode.config.file, ['cli', 'config.json']);
  assert.match(zcode.evidence, /discriminatedUnion/u);

  // manual 兜底仍然保留（"已知文件位置、未知键名就不编造键名"），但当前没有客户端走这条路：
  // 下一个证据不足的客户端必须落进这个形状，而不是被静默跳过或假装注册成功。
  assert.match(
    formatInvocation({ kind: 'manual-config', client: 'future', namespace: 'mcpServers', serverName: 'x', url: 'https://d/mcp', placeholder: '<transport-key>' }),
    /future: add x under mcpServers \(confirm the HTTP transport key name\)/u,
  );
});

// ---------------------------------------------------------------- ledger

test('integration ledger: ownership classification separates absent/owned/external/conflict', () => {
  const desired = { type: 'http', url: 'https://docs.example/mcp' };
  const fingerprint = fingerprintMcpEntry(normalizeMcpEntry(desired));

  assert.equal(classifyIntegrationOwnership({ actual: null, desired }).status, 'absent');
  assert.equal(
    classifyIntegrationOwnership({ actual: desired, desired, ledgerEntry: { fingerprint } }).status,
    'owned',
  );
  assert.equal(classifyIntegrationOwnership({ actual: desired, desired }).status, 'external');
  assert.equal(
    classifyIntegrationOwnership({
      actual: { type: 'http', url: 'https://evil.example/mcp' },
      desired,
      ledgerEntry: { fingerprint },
    }).status,
    'conflict',
  );
});

test('integration ledger: round-trips through disk without leaking secrets', async () => {
  const stateHome = tempDir();
  await writeIntegrationLedger('demo', {
    entries: { claude: { serverName: 'demo-docs', url: 'https://docs.demo/mcp', fingerprint: 'abc' } },
    skill: { installName: 'demo', repo: 'demo/skills', commit: 'a'.repeat(40), sha256: 'b'.repeat(64) },
  }, { env: { AIOS_HOME: stateHome } });
  const ledger = readIntegrationLedger('demo', { env: { AIOS_HOME: stateHome } });
  assert.equal(ledger.entries.claude.serverName, 'demo-docs');
  assert.ok(isSkillOwnedByAios(ledger, { installName: 'demo', sha256: 'b'.repeat(64) }));
  assert.ok(!isSkillOwnedByAios(ledger, { installName: 'demo', sha256: 'c'.repeat(64) }));

  const raw = fs.readFileSync(path.join(stateHome, 'integrations', 'demo.json'), 'utf8');
  assert.ok(!/TYPESAFE_API_KEY|api[_-]?key/iu.test(raw), 'the ledger must never contain credential material');
});

// ---------------------------------------------------------------- skill plane

test('skill plane: verification rejects a tampered entry file', () => {
  const skill = { entryFile: 'SKILL.md', sha256: 'f'.repeat(64), installName: 'demo' };
  assert.throws(
    () => verifySkillFiles({ files: { 'SKILL.md': Buffer.from('tampered') }, skill }),
    /sha256 mismatch/u,
  );
  assert.throws(
    () => verifySkillFiles({ files: { 'OTHER.md': Buffer.from('x') }, skill }),
    /entry file SKILL.md missing/u,
  );
});

test('skill plane: catalog frontmatter is injected for AIOS but stripped for clients', () => {
  const integration = validIntegration();
  const catalog = buildCatalogSkillContent(UPSTREAM_SKILL_MD, {
    integration,
    clients: ['codex', 'claude'],
  });
  assert.match(catalog, /installCatalogName: demo/u);
  assert.match(catalog, /clients: \[codex, claude\]/u);
  assert.match(catalog, /scopes: \[global, project\]/u);
  assert.match(catalog, /repoTargets: \[codex, claude, agents\]/u);

  // 客户端侧只能看到它认识的字段
  const clientFacing = stripAiosFrontmatter(catalog);
  for (const key of ['installCatalogName', 'clients', 'scopes', 'defaultInstall', 'tags', 'repoTargets']) {
    assert.ok(!clientFacing.includes(`${key}:`), `${key} must not reach the client`);
  }
  assert.match(clientFacing, /name: demo-skill/u);
  assert.match(clientFacing, /license: MIT/u);

  // 幂等：重复注入不会堆叠 AIOS 键
  const twice = buildCatalogSkillContent(catalog, { integration, clients: ['codex', 'claude'] });
  assert.equal((twice.match(/installCatalogName:/gu) || []).length, 1);
});

test('skill plane: an unmanaged catalog directory is never overwritten', async () => {
  const rootDir = tempDir();
  const stageDir = tempDir();
  const integration = validIntegration();
  fs.writeFileSync(path.join(stageDir, 'SKILL.md'), UPSTREAM_SKILL_MD);

  // 预先放一个用户自己的同名技能目录
  const catalogPath = path.join(rootDir, 'skill-sources', 'demo');
  fs.mkdirSync(catalogPath, { recursive: true });
  fs.writeFileSync(path.join(catalogPath, 'SKILL.md'), '---\nname: mine\n---\n\nuser owned\n');

  const result = await installSkillToCatalog({ rootDir, integration, stageDir, ledger: null });
  assert.equal(result.status, 'refused');
  assert.equal(result.reason, 'unmanaged-existing-catalog-directory');
  assert.match(fs.readFileSync(path.join(catalogPath, 'SKILL.md'), 'utf8'), /user owned/u);
});

test('skill plane: staged file comparison is line-ending agnostic', () => {
  assert.ok(stagedFilesMatch(
    { 'SKILL.md': Buffer.from('a\nb\n') },
    { 'SKILL.md': Buffer.from('a\r\nb\r\n') },
  ));
  assert.ok(!stagedFilesMatch(
    { 'SKILL.md': Buffer.from('a\nb\n') },
    { 'SKILL.md': Buffer.from('a\nc\n') },
  ));
});

test('skill plane: doctor distinguishes ok / modified / external / absent', () => {
  const rootDir = tempDir();
  const integration = validIntegration();
  const catalogPath = path.join(rootDir, 'skill-sources', 'demo');

  assert.equal(checkSkillPlane({ rootDir, integration, ledger: null }).status, 'absent');

  fs.mkdirSync(catalogPath, { recursive: true });
  fs.writeFileSync(path.join(catalogPath, 'SKILL.md'), '---\nname: demo\n---\n\nbody\n');
  assert.equal(checkSkillPlane({ rootDir, integration, ledger: null }).status, 'external');

  const bodyHash = createHash('sha256').update('---\nname: demo\n---\n\nbody\n').digest('hex');
  const pinned = normalizeIntegrationRegistry({
    schemaVersion: 1,
    integrations: {
      demo: {
        displayName: 'Demo',
        vendor: 'demo',
        homepage: 'https://demo.example',
        skill: {
          repo: 'demo/skills',
          commit: 'a'.repeat(40),
          skillPath: 'skills/demo',
          entryFile: 'SKILL.md',
          sha256: bodyHash,
          installName: 'demo',
          license: 'MIT',
        },
        mcp: { serverName: 'demo-docs', url: 'https://docs.demo.example/mcp', transport: 'http' },
      },
    },
  }).integrations.demo;
  const ledger = { skill: { installName: 'demo', sha256: bodyHash, commit: 'a'.repeat(40) } };
  assert.equal(checkSkillPlane({ rootDir, integration: pinned, ledger }).status, 'ok');

  fs.writeFileSync(path.join(catalogPath, 'SKILL.md'), '---\nname: demo\n---\n\nTAMPERED\n');
  assert.equal(checkSkillPlane({ rootDir, integration: pinned, ledger }).status, 'modified');
});

// ---------------------------------------------------------------- mcp plane

test('mcp plane: pi config upsert is idempotent and preserves foreign entries', () => {
  const clientHome = tempDir();
  const configPath = path.join(clientHome, 'mcp.json');
  fs.writeFileSync(configPath, JSON.stringify({ mcpServers: { other: { command: 'x' } } }, null, 2));

  const integration = validIntegration();
  const first = upsertConfigEntry({ client: 'pi', integration, clientHome });
  assert.ok(['written', 'updated'].includes(first.status));
  assert.equal(first.entry.lifecycle, 'lazy');
  const after = readConfigEntryFor({ client: 'pi', serverName: 'demo-docs', clientHome });
  assert.equal(after.entry.url, 'https://docs.demo.example/mcp');

  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.deepEqual(parsed.mcpServers.other, { command: 'x' }, 'foreign entries must survive');

  const second = upsertConfigEntry({ client: 'pi', integration, clientHome });
  assert.equal(second.writeStatus, 'unchanged', 're-running must not rewrite an identical file');
});

test('mcp plane: desired entry is the plain HTTP shape', () => {
  assert.deepEqual(buildDesiredMcpEntry({ mcp: { url: 'https://docs.demo/mcp' } }), {
    type: 'http',
    url: 'https://docs.demo/mcp',
  });
});

// ---------------------------------------------------------------- doctor

test('doctor: env check reports presence only', () => {
  const integration = validIntegration({ env: [{ name: 'DEMO_KEY', required: false }] });
  assert.equal(checkEnvVars(integration, { env: {} })[0].present, false);
  assert.equal(checkEnvVars(integration, { env: { DEMO_KEY: 'secret' } })[0].present, true);
  // 报告里不得出现值本身
  assert.ok(!JSON.stringify(checkEnvVars(integration, { env: { DEMO_KEY: 'secret' } })).includes('secret'));
});

test('doctor: live probe is the hard gate and reports unreachable servers', async () => {
  const rootDir = tempDir();
  const integration = validIntegration();

  const ok = await runIntegrationDoctor({
    rootDir,
    integration,
    clients: ['pi'],
    commandExistsImpl: () => true,
    probeImpl: async () => ({ status: 'verified', tools: ['a'], latencyMs: 3 }),
    env: {},
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.probe.status, 'verified');

  const down = await runIntegrationDoctor({
    rootDir,
    integration,
    clients: ['pi'],
    commandExistsImpl: () => true,
    probeImpl: async () => ({ status: 'unreachable', reason: 'timeout' }),
    env: {},
  });
  assert.equal(down.ok, false, 'an unreachable docs MCP must fail the doctor');

  const mismatch = await runIntegrationDoctor({
    rootDir,
    integration,
    clients: ['pi'],
    commandExistsImpl: () => true,
    probeImpl: async () => ({ status: 'capability-mismatch', missingTools: ['a'] }),
    env: {},
  });
  assert.equal(mismatch.ok, false, 'a missing declared tool must fail the doctor');
});

test('doctor: every client reports an actionable next step, never a silent skip', async () => {
  const rootDir = tempDir();
  const integration = validIntegration();
  const result = await runIntegrationDoctor({
    rootDir,
    integration,
    clients: resolveIntegrationClientOrder(),
    commandExistsImpl: (command) => command !== 'gemini',
    isTTY: false,
    probeImpl: async () => ({ status: 'verified', tools: [] }),
    env: {},
  });
  assert.equal(result.clients.length, 10, 'all ten clients must be reported');
  for (const item of result.clients) {
    assert.ok(item.status, `${item.client} must report a status`);
    assert.notEqual(item.status, 'unverified', `${item.client} must not fall back to a bare unverified state`);
  }
});

test('doctor: an uninstalled client and a config-plane client with no entry are reported distinctly', async () => {
  const rootDir = tempDir();
  const integration = validIntegration();
  const result = await runIntegrationDoctor({
    rootDir,
    integration,
    clients: ['zcode', 'gemini'],
    commandExistsImpl: (command) => command !== 'gemini',
    isTTY: false,
    probeImpl: async () => ({ status: 'verified', tools: [] }),
    env: {},
  });
  const byClient = Object.fromEntries(result.clients.map((item) => [item.client, item.status]));
  // zcode 自 v6.0.13 走 config 平面：没有 ledger 记录时如实报 absent，而不是人工步骤。
  assert.equal(byClient.zcode, 'absent');
  assert.equal(byClient.gemini, 'client-missing');
  assert.equal(result.summary.registered, 0);
});

test('doctor: probes the client definition command name, not the client id', async () => {
  // workbuddy 是唯一 client id ≠ 可执行名的客户端（CLIENT_DEFINITIONS.commandName = codebuddy）。
  // 它自 v6.0.6 起走 config 平面，doctor 不再探测它的二进制，但「探测必须用定义里的命令名」
  // 这条映射仍然是契约：任何把这种客户端当作 CLI 处理的路径，探测 client id 都会把
  // 已安装的客户端误报为 client-missing。
  assert.equal(resolveIntegrationClientCommand('workbuddy'), 'codebuddy');

  // doctor 层用真实 CLI 客户端验证探测的是解析后的命令名。
  const probed = [];
  const result = await runIntegrationDoctor({
    rootDir: tempDir(),
    integration: validIntegration(),
    clients: ['gemini'],
    commandExistsImpl: (command) => {
      probed.push(command);
      return false;
    },
    isTTY: false,
    probeImpl: async () => ({ status: 'verified', tools: [] }),
    env: {},
  });
  assert.deepEqual(probed, ['gemini']);
  assert.equal(result.clients[0].status, 'client-missing');
  assert.match(result.clients[0].reason, /gemini/);
});

test('defaultCommandExistsImpl: an AIOS shim is not evidence that the vendor client is installed', () => {
  const shimDir = tempDir();
  const emptyPath = tempDir();
  const shimName = process.platform === 'win32' ? 'gemini.CMD' : 'gemini';
  fs.writeFileSync(path.join(shimDir, shimName), '');
  const savedShimDir = process.env.AIOS_NATIVE_SHIM_DIR;
  const savedPath = process.env.PATH;
  process.env.AIOS_NATIVE_SHIM_DIR = shimDir;
  process.env.PATH = emptyPath;
  try {
    // AIOS 给全部客户端（含未安装的）预生成 shim，shim 存在不代表客户端装了。
    // 之前（2026-09-18）曾把 shim 目录当作已安装证据，导致 gemini/zcode 假阳性。
    assert.equal(defaultCommandExistsImpl('gemini'), false);
  } finally {
    if (savedShimDir === undefined) delete process.env.AIOS_NATIVE_SHIM_DIR;
    else process.env.AIOS_NATIVE_SHIM_DIR = savedShimDir;
    process.env.PATH = savedPath;
  }
});

test('gemini: registration goes through its own MCP CLI, not a hand-edited config', () => {
  const entry = getIntegrationClientEntry('gemini');
  // 证据：`gemini mcp add --help` 实测输出（2026-09-18，gemini 0.60.0）
  //   -t, --transport, --type  Transport type (stdio, sse, http)
  //   -s, --scope              Configuration scope (user or project)
  //   --timeout                Set connection timeout in milliseconds
  assert.equal(entry.transport, 'cli');
  assert.equal(entry.verified, true);

  const add = entry.buildAdd({ mcp: { serverName: 'typesafe-docs', url: 'https://docs.typesafe.ai/mcp' }, scope: 'global' });
  assert.equal(add.command, 'gemini');
  assert.deepEqual(add.args, [
    'mcp', 'add', '--scope', 'user', '--transport', 'http',
    'typesafe-docs', 'https://docs.typesafe.ai/mcp',
  ]);

  // gemini 的 scope 取值就是 user/project，与 AIOS 的 global->user 映射一致。
  const remove = entry.buildRemove({ mcp: { serverName: 'typesafe-docs' }, scope: 'project' });
  assert.deepEqual(remove.args, ['mcp', 'remove', '--scope', 'project', 'typesafe-docs']);

  // gemini 没有 `mcp get <name>`（只有 add/remove/list/enable/disable）。
  const probe = entry.buildProbe({ mcp: { serverName: 'typesafe-docs' } });
  assert.deepEqual(probe.args, ['mcp', 'list']);
});
