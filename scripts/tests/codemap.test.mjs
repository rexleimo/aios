import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { doctorCodemap, installCodemap } from '../lib/components/codemap.mjs';
import { collectCodemapMcpTargets } from '../lib/components/codemap/mcp-targets.mjs';
import {
  collectCodemapInstructionFiles,
  getCodemapInstructionSection,
  injectCrgIntoInstructionFiles,
} from '../lib/components/codemap/instructions.mjs';
import { AGENTS_MD_MARKERS } from '../lib/components/codemap/constants.mjs';
import { ensureOpencodePlugin } from '../lib/components/codemap/opencode-plugin.mjs';
import { getCodemapHelpText } from '../lib/cli/help/codemap.mjs';
import { buildCrgEntryForTarget } from '../lib/components/codemap/mcp-targets/entries.mjs';
import { getClientMcpTarget, getClientInstructionFileName, ALL_CLIENTS } from '../lib/clients/registry.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function silentIo(logs = []) {
  return { log: (line) => logs.push(String(line)) };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

test('codemap MCP targets agree with the client registry (single source of truth)', () => {
  const projectRoot = '/proj';
  const clientHomes = {
    codex: '/h/.codex',
    claude: '/h/.claude',
    gemini: '/h/.gemini',
    opencode: '/h/.config/opencode',
    hermes: '/h/.hermes',
    grok: '/h/.grok',
  };
  const targets = collectCodemapMcpTargets(projectRoot, clientHomes, 'all');
  const byClient = Object.fromEntries(targets.map((t) => [t.clientKey, t]));

  // Codemap uses the registry's native config format for every supported client.
  assert.ok(byClient.codex.path.endsWith(path.join('.codex', 'config.toml')));
  // 有 home 就走**用户级**：AIOS 的 MCP 注册不该往每个项目里塞配置（会被误提交、
  // 且换项目还得重写一遍）。只有拿不到 home 时才退回项目级（下一条断言）。
  assert.ok(byClient.claude.path.endsWith(path.join('.claude.json')), `claude 应走用户级：${byClient.claude.path}`);
  assert.ok(byClient.gemini.path.endsWith(path.join('.gemini', 'settings.json')), `gemini 应走用户级：${byClient.gemini.path}`);
  const projectScoped = collectCodemapMcpTargets(projectRoot, {}, 'all');
  const fallbackByClient = Object.fromEntries(projectScoped.map((t) => [t.clientKey, t]));
  assert.ok(
    fallbackByClient.claude.path.endsWith(path.join('proj', '.mcp.json')),
    '拿不到 home 时必须退回项目级，不能静默不写',
  );
  assert.ok(byClient.opencode.path.endsWith(path.join('opencode', 'opencode.json')));
  assert.ok(byClient.hermes.path.endsWith(path.join('.hermes', 'config.yaml')));
  assert.ok(byClient.grok.path.endsWith(path.join('.grok', 'config.toml')));

  // The registry descriptor must point at the same file basenames codemap actually writes.
  // Clients that share a dedup'd path are absent from byClient — that's correct because
  // the first writer already covers them.
  for (const client of ALL_CLIENTS) {
    const target = byClient[client];
    if (!target) continue; // dedup'd path — covered by another client
    const desc = getClientMcpTarget(client);
    // desc.scopes[].file 是相对各作用域基准目录（home / project）的路径；
    // 这里用 path.resolve 归一化后再比，才能表达 `../.claude.json` 这种“与 client home 同级”的真实落点。
    const home = clientHomes[client] ?? '';
    const scopePaths = desc.scopes.map((s) => path.resolve(s.scope === 'home' ? home : projectRoot, s.file));
    assert.ok(
      scopePaths.some((candidate) => path.resolve(target.path) === candidate),
      `${client}: registry scopes [${scopePaths}] must match codemap target ${target.path}`,
    );
  }
});

test('codemap help names code-review-graph and every supported client', () => {
  const help = getCodemapHelpText();
  assert.match(help, /code-review-graph/u);
  for (const client of ALL_CLIENTS) {
    assert.match(help, new RegExp(`\\b${client}\\b`, 'u'));
  }
});

test('codemap instruction filenames agree with the client registry instructionFileName', () => {
  const fileFor = (client) => collectCodemapInstructionFiles(client)[0]?.fileName;
  for (const client of ALL_CLIENTS) {
    assert.equal(fileFor(client), getClientInstructionFileName(client),
      `${client}: codemap instruction file must match registry instructionFileName`);
  }
});

test('codemap install writes client-readable MCP configs for all AIOS clients', async () => {
  const rootDir = await makeTemp('aios-codemap-install-root-');
  const projectRoot = await makeTemp('aios-codemap-install-project-');
  const codexHome = path.join(rootDir, 'home', '.codex');
  const claudeHome = path.join(rootDir, 'home', '.claude');
  const geminiHome = path.join(rootDir, 'home', '.gemini');
  const opencodeHome = path.join(rootDir, 'home', '.config', 'opencode');
  const hermesHome = path.join(rootDir, 'home', '.hermes');
  const grokHome = path.join(rootDir, 'home', '.grok');

  await mkdir(codexHome, { recursive: true });
  await mkdir(hermesHome, { recursive: true });
  await mkdir(grokHome, { recursive: true });
  await mkdir(path.join(projectRoot, '.code-review-graph'), { recursive: true });
  await mkdir(claudeHome, { recursive: true });
  await mkdir(geminiHome, { recursive: true });
  await writeFile(path.join(codexHome, 'config.toml'), '[mcp_servers.existing]\ncommand = "npx"\n', 'utf8');
  await writeFile(path.join(grokHome, 'config.toml'), '[mcp_servers.existing]\ncommand = "npx"\n', 'utf8');
  // claude / gemini 现在写用户级：夹具里的“已有条目”也必须放在用户级文件里。
  await writeJson(path.join(rootDir, 'home', '.claude.json'), { mcpServers: { existing: { command: 'node', args: ['server.js'] } } });
  await writeJson(path.join(geminiHome, 'settings.json'), { mcpServers: { existing: { command: 'node' } } });
  // 项目里的同名文件保持原样：它们**不应该**再被 AIOS 写入（否则每个项目都会被塞一份）。
  await writeJson(path.join(projectRoot, '.mcp.json'), { mcpServers: { existing: { command: 'node' } } });
  await writeJson(path.join(projectRoot, '.gemini', 'settings.json'), { mcpServers: { existing: { command: 'node' } } });
  await writeJson(path.join(opencodeHome, 'opencode.json'), { mcp: { existing: { type: 'local', command: ['node', 'server.js'] } } });
  await writeFile(path.join(hermesHome, 'config.yaml'), 'mcp_servers:\n  existing:\n    command: node\n', 'utf8');

  const logs = [];
  const result = await installCodemap({
    rootDir,
    projectRoot,
    io: silentIo(logs),
    clientHomes: { codex: codexHome, claude: claudeHome, gemini: geminiHome, opencode: opencodeHome, hermes: hermesHome, grok: grokHome },
    skipCrgChecks: true,
    crgVersion: 'code-review-graph test',
  });

  assert.deepEqual(result.injectedClients.sort(), ['claude', 'codex', 'gemini', 'grok', 'hermes', 'opencode']);

  const codexToml = await readFile(path.join(codexHome, 'config.toml'), 'utf8');
  assert.match(codexToml, /\[mcp_servers\.code-review-graph\]/);
  assert.match(codexToml, /command = "uvx"/);
  assert.match(codexToml, /args = \["code-review-graph", "serve"\]/);
  // 用户级配置**不得**钉 cwd：钉了就把全局注册锁在某个仓库上，换项目 CRG 还索引旧仓库。
  assert.doesNotMatch(codexToml, /cwd = /, '用户级 codex 配置不该带 cwd');

  const claudeMcp = await readJson(path.join(rootDir, 'home', '.claude.json'));
  assert.equal(claudeMcp.mcpServers['code-review-graph'].cwd, undefined, '用户级 claude 配置不该带 cwd');
  assert.equal(claudeMcp.mcpServers['code-review-graph'].type, 'stdio');
  assert.equal(claudeMcp.mcpServers.existing.command, 'node', '写入时必须保留其它 MCP 条目');

  const geminiSettings = await readJson(path.join(geminiHome, 'settings.json'));
  assert.equal(geminiSettings.mcpServers['code-review-graph'].cwd, undefined, '用户级 gemini 配置不该带 cwd');
  assert.equal(geminiSettings.mcpServers.existing.command, 'node');

  // 项目文件不得再被 AIOS 写入：项目级 `.mcp.json` / `.gemini/settings.json` 里只该有用户自己写的条目。
  const untouchedProjectClaude = await readJson(path.join(projectRoot, '.mcp.json'));
  assert.equal(untouchedProjectClaude.mcpServers['code-review-graph'], undefined, '用户级可用时不得再往项目里塞 claude 配置');
  assert.equal(untouchedProjectClaude.mcpServers.existing.command, 'node');
  const untouchedProjectGemini = await readJson(path.join(projectRoot, '.gemini', 'settings.json'));
  assert.equal(untouchedProjectGemini.mcpServers['code-review-graph'], undefined, '用户级可用时不得再往项目里塞 gemini 配置');

  // 项目级才是需要钉 cwd 的地方：那里配置本来就跟项目绑定。
  const projectEntry = buildCrgEntryForTarget('claude', projectRoot, path.join(projectRoot, '.mcp.json'));
  assert.equal(projectEntry.cwd, projectRoot, '项目级配置应钉 cwd');
  const userEntry = buildCrgEntryForTarget('claude', projectRoot, path.join(rootDir, 'home', '.claude.json'));
  assert.equal(userEntry.cwd, undefined, '用户级配置不得钉 cwd（否则换项目还索引旧仓库）');

  const grokToml = await readFile(path.join(grokHome, 'config.toml'), 'utf8');
  assert.match(grokToml, /\[mcp_servers\.code-review-graph\]/);
  assert.match(grokToml, /command = "uvx"/);

  const opencodeConfig = await readJson(path.join(opencodeHome, 'opencode.json'));
  assert.deepEqual(opencodeConfig.mcp['code-review-graph'].command, ['uvx', 'code-review-graph', 'serve']);
  assert.equal(opencodeConfig.mcp['code-review-graph'].type, 'local');
  assert.equal(opencodeConfig.mcp['code-review-graph'].enabled, true);
  assert.deepEqual(opencodeConfig.mcp.existing.command, ['node', 'server.js']);

  const hermesConfig = await readFile(path.join(hermesHome, 'config.yaml'), 'utf8');
  assert.match(hermesConfig, /code-review-graph:/u);
  assert.match(hermesConfig, /command: uvx/u);
  assert.match(hermesConfig, /- code-review-graph/u);
  assert.match(hermesConfig, /- serve/u);
  assert.match(hermesConfig, /existing:\n\s+command: node/u);

  assert.match(await readFile(path.join(projectRoot, 'CLAUDE.md'), 'utf8'), /MCP Tools: code-review-graph/);
  assert.match(await readFile(path.join(projectRoot, 'GEMINI.md'), 'utf8'), /MCP Tools: code-review-graph/);
  const agentsMd = await readFile(path.join(projectRoot, 'AGENTS.md'), 'utf8');
  assert.match(agentsMd, /MCP Tools: code-review-graph/);
  assert.match(agentsMd, /no more than three graph calls per work item/u);
  assert.match(agentsMd, /never follow them recursively/u);
  assert.doesNotMatch(agentsMd, /Use it at each decision point/u);
  assert.match(agentsMd, /aios_plan_task/u);
  assert.match(agentsMd, /confirm-context-candidates/u);
  assert.doesNotMatch(agentsMd, /[\u922b]\??/u);
});

test('tracked codemap instruction sections match the generator template exactly', async () => {
  const expected = [
    AGENTS_MD_MARKERS.begin,
    getCodemapInstructionSection(),
    AGENTS_MD_MARKERS.end,
  ].join('\n');
  for (const fileName of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']) {
    const raw = (await readFile(path.resolve(fileName), 'utf8')).split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
    const begin = raw.indexOf(AGENTS_MD_MARKERS.begin);
    const end = raw.indexOf(AGENTS_MD_MARKERS.end);
    assert.equal(raw.split(AGENTS_MD_MARKERS.begin).length - 1, 1, `${fileName} should have one begin marker`);
    assert.equal(raw.split(AGENTS_MD_MARKERS.end).length - 1, 1, `${fileName} should have one end marker`);
    assert.ok(begin >= 0 && end > begin, `${fileName} markers should be ordered`);
    assert.equal(
      raw.slice(begin, end + AGENTS_MD_MARKERS.end.length),
      expected,
      `${fileName} drifted from codemap template`,
    );
  }
});

test('tracked codemap instruction files have a dry-run drift guard', () => {
  const logs = [];
  injectCrgIntoInstructionFiles(path.resolve('.'), {
    dryRun: true,
    io: silentIo(logs),
    client: 'all',
  });
  assert.deepEqual(logs, [
    'OK   codemap AGENTS.md CRG section unchanged',
    'OK   codemap CLAUDE.md CRG section unchanged',
    'OK   codemap GEMINI.md CRG section unchanged',
  ]);
});

test('codemap doctor reports missing per-client MCP config and --fix heals it', async () => {
  const rootDir = await makeTemp('aios-codemap-doctor-root-');
  const projectRoot = await makeTemp('aios-codemap-doctor-project-');
  const codexHome = path.join(rootDir, 'home', '.codex');
  const claudeHome = path.join(rootDir, 'home', '.claude');
  const geminiHome = path.join(rootDir, 'home', '.gemini');
  const opencodeHome = path.join(rootDir, 'home', '.config', 'opencode');
  const hermesHome = path.join(rootDir, 'home', '.hermes');
  await mkdir(path.join(projectRoot, '.code-review-graph'), { recursive: true });
  await mkdir(codexHome, { recursive: true });

  const clientHomes = { codex: codexHome, claude: claudeHome, gemini: geminiHome, opencode: opencodeHome, hermes: hermesHome };
  const firstLogs = [];
  const first = await doctorCodemap({
    rootDir,
    projectRoot,
    io: silentIo(firstLogs),
    clientHomes,
    skipCrgChecks: true,
    statusText: 'nodes: 1',
  });

  assert.equal(first.errors, 0);
  assert.ok(first.effectiveWarnings >= 5);
  assert.match(firstLogs.join('\n'), /code-review-graph missing in .*config\.toml \(codex\)/);
  assert.match(firstLogs.join('\n'), /code-review-graph missing in .*\.claude\.json \(claude\)/);
  assert.match(firstLogs.join('\n').replace(/\\/g, '/'), /code-review-graph missing in .*\.gemini\/settings\.json \(gemini\)/);
  assert.match(firstLogs.join('\n'), /code-review-graph missing in .*opencode\.json \(opencode\)/);
  assert.match(firstLogs.join('\n').replace(/\\/g, '/'), /code-review-graph missing in .*\.hermes\/config\.yaml \(hermes\)/);

  const fixLogs = [];
  await doctorCodemap({
    rootDir,
    projectRoot,
    fix: true,
    io: silentIo(fixLogs),
    clientHomes,
    skipCrgChecks: true,
    statusText: 'nodes: 1',
    crgVersion: 'code-review-graph test',
  });

  const secondLogs = [];
  const second = await doctorCodemap({
    rootDir,
    projectRoot,
    io: silentIo(secondLogs),
    clientHomes,
    skipCrgChecks: true,
    statusText: 'nodes: 1',
  });

  assert.equal(second.errors, 0);
  assert.equal(second.effectiveWarnings, 0);
  const normalizedSecondLogs = secondLogs.join('\n').replace(/\\/g, '/');
  assert.match(normalizedSecondLogs, /code-review-graph found in .*config\.toml \(codex\)/);
  assert.match(normalizedSecondLogs, /code-review-graph found in .*\.claude\.json \(claude\)/);
  assert.match(normalizedSecondLogs, /code-review-graph found in .*\.gemini\/settings\.json \(gemini\)/);
  assert.match(normalizedSecondLogs, /code-review-graph found in .*opencode\.json \(opencode\)/);
  assert.match(normalizedSecondLogs, /code-review-graph found in .*\.hermes\/config\.yaml \(hermes\)/);
});

test('codemap component keeps client config responsibilities in focused modules', async () => {
  const entry = await readFile(path.resolve('scripts/lib/components/codemap.mjs'), 'utf8');
  const entryLines = entry.trim().split(/\r?\n/u).length;
  assert.equal(entryLines <= 360, true, `codemap.mjs is ${entryLines} lines; keep config/state/docs/plugins split under components/codemap/*`);

  const modules = [
    { file: 'scripts/lib/components/codemap/constants.mjs', exports: ['CRG_MCP_ALIAS', 'CRG_DATA_DIR'] },
    { file: 'scripts/lib/components/codemap/crg.mjs', exports: ['captureCrgCommand', 'runCrgCommand'] },
    { file: 'scripts/lib/components/codemap/instructions.mjs', exports: ['injectCrgIntoInstructionFiles', 'removeCrgFromInstructionFiles'] },
    { file: 'scripts/lib/components/codemap/mcp-targets.mjs', exports: ['collectCodemapMcpTargets', 'injectCrgIntoClientTarget'] },
    { file: 'scripts/lib/components/codemap/opencode-plugin.mjs', exports: ['ensureOpencodePlugin', 'removeOpencodePlugin'] },
    { file: 'scripts/lib/components/codemap/state-store.mjs', exports: ['readState', 'writeState', 'removeState'] },
  ];

  for (const moduleDef of modules) {
    const mod = await import(pathToFileURL(path.resolve(moduleDef.file)).href);
    for (const exportName of moduleDef.exports) {
      assert.equal(typeof mod[exportName], exportName === 'CRG_MCP_ALIAS' || exportName === 'CRG_DATA_DIR' ? 'string' : 'function', `${moduleDef.file} should export ${exportName}`);
    }
  }
});

test('OpenCode codemap plugin uses current hooks and bounds background graph commands', async () => {
  const home = await makeTemp('aios-opencode-crg-plugin-');
  const result = ensureOpencodePlugin(home, { io: silentIo() });
  const source = await readFile(result.path, 'utf8');

  assert.match(source, /export const CodeReviewGraphPlugin: Plugin/u);
  assert.match(source, /"tool\.execute\.after"/u);
  assert.match(source, /COMMAND_TIMEOUT_MS = 30_000/u);
  assert.match(source, /Bun\.spawn/u);
  assert.doesNotMatch(source, /app\.on\(/u);
});
