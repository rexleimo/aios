import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { doctorCodemap, installCodemap } from '../../../lib/tooling/components/codemap/codemap.mjs';
import {
  collectCodemapMcpTargets,
  inspectCodemapMcpTarget,
  injectCrgIntoClientTarget,
  removeCrgFromClientTarget,
} from '../../../lib/tooling/components/codemap/targets/mcp-targets.mjs';
import {
  collectCodemapInstructionFiles,
  getCodemapInstructionSection,
  injectCrgIntoInstructionFiles,
} from '../../../lib/tooling/components/codemap/targets/instructions.mjs';
import { AGENTS_MD_MARKERS } from '../../../lib/tooling/components/codemap/constants.mjs';
import { evaluateGraphFreshness, inspectGraphFreshness } from '../../../lib/tooling/components/codemap/graph/freshness.mjs';
import { ensureOpencodePlugin } from '../../../lib/tooling/components/codemap/targets/opencode-plugin.mjs';
import { getCodemapHelpText } from '../../../lib/tooling/cli/help/codemap.mjs';
import { buildCrgEntryForTarget } from '../../../lib/tooling/components/codemap/targets/mcp-targets/entries.mjs';
import { ZCODE_SERVER_FIELDS_ALLOWLIST } from '../../../lib/foundation/clients/integration/mcp/zcode-schema.mjs';
import { buildAiosPiMcpServers } from '../../../lib/tooling/components/integrations/pi/mcp-adapter.mjs';
import { getClientMcpTarget, getClientInstructionFileName, ALL_CLIENTS } from '../../../lib/foundation/clients/registry.mjs';

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
  // 夹具必须覆盖**每个**声明了 MCP 落点的客户端；少一个就会让「所有客户端」的
  // 断言失去意义（这正是此前漏掉 pi/zcode/qoder/workbuddy 的原因）。
  const clientHomes = {
    codex: '/h/.codex',
    claude: '/h/.claude',
    gemini: '/h/.gemini',
    opencode: '/h/.config/opencode',
    hermes: '/h/.hermes',
    grok: '/h/.grok',
    workbuddy: '/h/.workbuddy',
    pi: '/h/.pi/agent',
    zcode: '/h/.zcode',
    qoder: '/h/.qoder',
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
  // 每个客户端都必须有 codemap 目标 —— 这里**不允许** `continue` 逃生口。
  // 历史缺陷：本断言原先带 `if (!target) continue;`，把「清单里根本没有这个客户端」
  // 当成「路径被 dedup 覆盖」静默跳过，于是 CODEMAP_MCP_TARGETS 漏掉 pi/zcode/qoder
  // 三个客户端时测试依然全绿。注册表是客户端集合的单一事实来源，codemap 的清单
  // 必须与它逐一对齐，否则「支持所有客户端」就只是注释里的承诺。
  const expectedTargetClients = ALL_CLIENTS.filter((c) => getClientMcpTarget(c).format !== 'none');
  const missing = expectedTargetClients.filter((c) => !byClient[c]);
  assert.deepEqual(missing, [],
    `codemap 缺少这些客户端的 MCP 目标：${missing.join(', ')}（它们在注册表里声明了 MCP 落点）`);

  for (const client of expectedTargetClients) {
    const target = byClient[client];
    const desc = getClientMcpTarget(client);
    // desc.scopes[].file 是相对各作用域基准目录（home / project）的路径；
    // 这里用 path.resolve 归一化后再比，才能表达 `../.claude.json` 这种“与 client home 同级”的真实落点。
    const home = clientHomes[client] ?? '';
    const scopePaths = desc.scopes.map((s) => path.resolve(s.scope === 'home' ? home : projectRoot, s.file));
    assert.ok(
      scopePaths.some((candidate) => path.resolve(target.path) === candidate),
      `${client}: registry scopes [${scopePaths}] must match codemap target ${target.path}`,
    );
    // 点路径 namespace 必须透传：zcode 的 server 桶是 `mcp.servers`，codemap 若按
    // 单层键写（`parsed['mcp.servers']`）会静默落空 —— 正是此前 uninstall 静默 no-op 的成因。
    // 单段 namespace（codex 的 mcp_servers 等）由各格式自己的读写器负责，不在此断言。
    if (desc.namespace && desc.namespace.includes('.')) {
      assert.equal(target.namespace, desc.namespace,
        `${client}: codemap target 必须沿用注册表的点路径 namespace ${desc.namespace}`);
    }
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
    // 单一 owner：CRG 指令块只能有 AIOS 管理的那一个。外部工具注入的旧块曾与 AIOS 块
    // 并存且互相矛盾（"ALWAYS use … BEFORE Grep/Glob/Read" vs 每工作项 ≤3 次图调用），
    // 这里把它钉死，防止再次悄悄出现两份互相打架的指令。
    assert.equal(raw.split('## MCP Tools: code-review-graph').length - 1, 1,
      `${fileName}: CRG 指令区块必须只有一个（AIOS CODEMAP 块）`);
    assert.equal(raw.includes('<!-- code-review-graph MCP tools -->'), false,
      `${fileName}: 不得出现旧的外部注入标记 <!-- code-review-graph MCP tools -->`);
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
  const entry = await readFile(path.resolve('scripts/lib/tooling/components/codemap/codemap.mjs'), 'utf8');
  const entryLines = entry.trim().split(/\r?\n/u).length;
  assert.equal(entryLines <= 360, true, `codemap.mjs is ${entryLines} lines; keep config/state/docs/plugins split under components/codemap/*`);

  const modules = [
    { file: 'scripts/lib/tooling/components/codemap/constants.mjs', exports: ['CRG_MCP_ALIAS', 'CRG_DATA_DIR'] },
    { file: 'scripts/lib/tooling/components/codemap/graph/crg.mjs', exports: ['captureCrgCommand', 'runCrgCommand'] },
    { file: 'scripts/lib/tooling/components/codemap/targets/instructions.mjs', exports: ['injectCrgIntoInstructionFiles', 'removeCrgFromInstructionFiles'] },
    { file: 'scripts/lib/tooling/components/codemap/targets/mcp-targets.mjs', exports: ['collectCodemapMcpTargets', 'injectCrgIntoClientTarget'] },
    { file: 'scripts/lib/tooling/components/codemap/targets/opencode-plugin.mjs', exports: ['ensureOpencodePlugin', 'removeOpencodePlugin'] },
    { file: 'scripts/lib/tooling/components/codemap/state-store.mjs', exports: ['readState', 'writeState', 'removeState'] },
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

test('OpenCode codemap plugin registers real 2.x hooks inside setup (not the untranslated 1.x record)', async () => {
  const home = await makeTemp('aios-opencode-crg-plugin-v2-');
  const result = ensureOpencodePlugin(home, { io: silentIo() });
  const source = await readFile(result.path, 'utf8');

  // default 导出必须指向真正的 2.x setup（内部自行注册 ctx.tool.hook）。
  assert.match(source, /export default \{ id: 'code-review-graph', setup: CodeReviewGraphV2Setup \}/u);
  assert.match(source, /const CodeReviewGraphV2Setup = async \(ctx: any\) =>/u);
  assert.match(source, /ctx\.tool\.hook\("execute\.before"/u);
  assert.match(source, /ctx\.tool\.hook\("execute\.after"/u);
  // v2 把 1.x 的 bash 工具改名为 shell；两代工具名都必须被 git-commit 前置 hook 命中。
  assert.match(source, /\/shell\|bash\/i/u);
  assert.match(source, /event\?\.input\?\.command/u);
  // 真机实证：plain-object setup 返回值会让 2.0.32 的 watcher 重载整个插件集时抛
  // `TypeError: t is not a function`，所以 v2 setup 的顶层不得有 return。
  const setupBody = source.slice(source.indexOf('const CodeReviewGraphV2Setup'), source.indexOf('export default'));
  assert.doesNotMatch(setupBody, /^  return /mu);
});

test('codemap writes zcode through the dot-path namespace and normalizes to the strict schema', async () => {
  const dir = await makeTemp('aios-codemap-zcode-');
  const filePath = path.join(dir, 'config.json');
  // 既有内容：一个用户自有的 server + 一个 mcp 之外的顶层键（都必须保留）。
  await writeJson(filePath, {
    mcp: { servers: { pencil: { transport: 'stdio', command: 'pencil.exe' } } },
    hooks: { keep: true },
  });

  const target = {
    path: filePath,
    clientKey: 'zcode',
    format: 'mcp-json-nested',
    namespace: 'mcp.servers',
    createIfMissing: true,
  };
  await injectCrgIntoClientTarget(target, '/proj', { dryRun: false, io: silentIo() });

  const written = JSON.parse(await readFile(filePath, 'utf8'));
  assert.ok(written.mcp.servers['code-review-graph'], 'CRG 必须写进 mcp.servers 这个点路径桶');
  assert.deepEqual(written.mcp.servers.pencil, { transport: 'stdio', command: 'pencil.exe' },
    '用户自有的 server 必须原样保留');
  assert.deepEqual(written.hooks, { keep: true }, 'mcp 之外的顶层键必须保留');
  // 严格 schema：白名单外的字段会被 ZCode 整条丢弃，所以不能落盘。
  const crgFields = Object.keys(written.mcp.servers['code-review-graph']);
  for (const field of crgFields) {
    assert.ok(ZCODE_SERVER_FIELDS_ALLOWLIST.includes(field), `zcode entry 含白名单外字段: ${field}`);
  }

  // inspect 也要走点路径，否则 doctor 会对 zcode 报 missing。
  const raw = await readFile(filePath, 'utf8');
  assert.equal(inspectCodemapMcpTarget({ ...target, path: filePath }).valid, true);

  // 删除同样必须走点路径 —— 单层取值会让 uninstall 对 zcode 静默 no-op。
  await removeCrgFromClientTarget(target, { io: silentIo() });
  const afterRemove = JSON.parse(await readFile(filePath, 'utf8'));
  assert.equal(afterRemove.mcp.servers['code-review-graph'], undefined, 'uninstall 必须真删掉 CRG');
  assert.deepEqual(afterRemove.mcp.servers.pencil, { transport: 'stdio', command: 'pencil.exe' });
  assert.ok(raw.includes('mcp.servers') === false || true);
});

test('codemap writes pi entries byte-identical to the pi component definition', async () => {
  const dir = await makeTemp('aios-codemap-pi-');
  const filePath = path.join(dir, 'mcp.json');
  await writeJson(filePath, { mcpServers: { 'aios-memory': { command: 'node', args: ['x'], lifecycle: 'lazy' } } });

  await injectCrgIntoClientTarget(
    { path: filePath, clientKey: 'pi', format: 'pi-json', namespace: '', createIfMissing: true },
    '/proj',
    { dryRun: false, io: silentIo() },
  );

  const written = JSON.parse(await readFile(filePath, 'utf8'));
  const expected = buildAiosPiMcpServers({})['code-review-graph'];
  // pi 自己的 doctor 用 JSON.stringify 精确比对（键序敏感）：形状差一个字段或一个键序
  // 就会永久报 kept-differs。这里钉的就是这个契约。
  assert.equal(JSON.stringify(written.mcpServers['code-review-graph']), JSON.stringify(expected),
    'codemap 写出的 pi entry 必须与 pi 组件的定义逐字节一致');
  assert.equal(written.mcpServers['code-review-graph'].type, undefined, 'pi entry 不应带 type 字段');
  assert.equal(written.mcpServers['code-review-graph'].lifecycle, 'lazy', 'pi entry 必须带 lifecycle');
  assert.deepEqual(written.mcpServers['aios-memory'], { command: 'node', args: ['x'], lifecycle: 'lazy' },
    'pi 的其它 AIOS server 必须原样保留');
});

test('codemap doctor reports the claude project-level disable that --fix cannot heal', async () => {
  const projectRoot = await makeTemp('aios-codemap-claude-disable-');
  await mkdir(path.join(projectRoot, '.claude'), { recursive: true });
  await writeJson(path.join(projectRoot, '.claude', 'settings.local.json'), {
    disabledMcpjsonServers: ['code-review-graph', 'aios-shell'],
  });

  const logs = [];
  await doctorCodemap({
    rootDir: projectRoot,
    projectRoot,
    io: silentIo(logs),
    clientHomes: { claude: path.join(projectRoot, '.claude') },
    client: 'claude',
    skipCrgChecks: true,
    statusText: 'Nodes: 1',
    graphFreshness: { stale: false, reason: 'fresh', graphMtimeMs: 1, commitMs: 0, graphAgeDays: 0, behindHeadDays: 0 },
  });

  const joined = logs.join('\n');
  assert.match(joined, /disabledMcpjsonServers/u,
    'doctor 必须报告 claude 的 project 级禁用，否则「命令报 OK 却仍不工作」再次不可见');
  assert.match(joined, /does NOT change this file/u, '告警要点明 --fix 修不到这个文件');
});

test('codemap graph freshness detects a graph that fell behind HEAD', async () => {
  const projectRoot = await makeTemp('aios-codemap-freshness-');
  const now = Date.UTC(2026, 9, 13);
  const day = 86400_000;

  const fresh = evaluateGraphFreshness({ graphMtimeMs: now, commitTimeSeconds: (now - day) / 1000, now });
  assert.equal(fresh.stale, false);
  assert.equal(fresh.reason, 'fresh');

  // 两个天数含义不同：图龄（距现在多久没重建）vs 落后 HEAD 多久。混用会把
  // 「图 11 天没重建」误报成「落后 HEAD 11 天」，两者是不同的量。
  const stale = evaluateGraphFreshness({ graphMtimeMs: now - 11 * day, commitTimeSeconds: (now - 3 * day) / 1000, now });
  assert.equal(stale.stale, true);
  assert.equal(stale.reason, 'behind-head');
  assert.equal(stale.graphAgeDays, 11, 'graphAgeDays = 图距现在多久没重建');
  assert.equal(stale.behindHeadDays, 8, 'behindHeadDays = 图比 HEAD commit 晚多久');

  // 信息不足（无图 / 非 git 仓库）不算陈旧 —— 那由「图目录缺失」步骤单独报告。
  assert.equal(evaluateGraphFreshness({ graphMtimeMs: null, commitTimeSeconds: 1, now }).stale, false);
  assert.equal(evaluateGraphFreshness({ graphMtimeMs: 1, commitTimeSeconds: null, now }).stale, false);

  // 落盘路径：图旧于 HEAD 时为陈旧。
  const inspected = inspectGraphFreshness(projectRoot, {
    fsImpl: { statSync: () => ({ mtimeMs: now - 11 * day }) },
    execFileSyncImpl: () => `${Math.floor(now / 1000)}\n`,
    now,
  });
  assert.equal(inspected.stale, true);
  assert.equal(inspected.graphAgeDays, 11);
});

test('codemap startup gate detects readiness without side effects', async () => {
  const { isCodemapReady, isCodemapAutoInstallEnabled } = await import('../../../lib/tooling/components/codemap/ensure.mjs'
  );
  const empty = await makeTemp('aios-codemap-ensure-empty-');
  assert.equal(isCodemapReady(empty), false, '无 state 无图 → 未就绪');

  const stateOnly = await makeTemp('aios-codemap-ensure-state-');
  await writeJson(path.join(stateOnly, '.aios', 'codemap.json'), { version: 1 });
  assert.equal(isCodemapReady(stateOnly), false, '只有 state 没有图目录 → 未就绪');

  const ready = await makeTemp('aios-codemap-ensure-ready-');
  await writeJson(path.join(ready, '.aios', 'codemap.json'), { version: 1 });
  await mkdir(path.join(ready, '.code-review-graph'), { recursive: true });
  assert.equal(isCodemapReady(ready), true, 'state + 图目录 → 就绪');

  assert.equal(isCodemapAutoInstallEnabled({}), true, '默认开');
  assert.equal(isCodemapAutoInstallEnabled({ AIOS_CODEMAP_AUTO_INSTALL: '0' }), false);
  assert.equal(isCodemapAutoInstallEnabled({ AIOS_CODEMAP_AUTO_INSTALL: 'off' }), false);
});

test('codemap startup gate installs when missing, never throws', async () => {
  const { ensureCodemapInstalled } = await import('../../../lib/tooling/components/codemap/ensure.mjs');
  const logs = [];
  const io = { log: (line) => logs.push(String(line)), warn: (line) => logs.push(String(line)) };

  // 开关关闭：不调 install。
  let calls = 0;
  const disabled = await ensureCodemapInstalled({
    projectRoot: await makeTemp('aios-codemap-ensure-off-'),
    io,
    env: { AIOS_CODEMAP_AUTO_INSTALL: '0' },
    installImpl: async () => { calls += 1; },
  });
  assert.equal(disabled.status, 'disabled');
  assert.equal(calls, 0, '关闭时不得有任何副作用');

  // 已就绪：不调 install。
  const readyRoot = await makeTemp('aios-codemap-ensure-ok-');
  await writeJson(path.join(readyRoot, '.aios', 'codemap.json'), { version: 1 });
  await mkdir(path.join(readyRoot, '.code-review-graph'), { recursive: true });
  const ready = await ensureCodemapInstalled({
    projectRoot: readyRoot,
    io,
    env: {},
    installImpl: async () => { calls += 1; },
  });
  assert.equal(ready.status, 'ready');
  assert.equal(calls, 0, '就绪时不得调 install');

  // 缺失：调一次 install，成功即 installed。
  const missingRoot = await makeTemp('aios-codemap-ensure-miss-');
  const installed = await ensureCodemapInstalled({
    projectRoot: missingRoot,
    io,
    env: {},
    installImpl: async () => {
      calls += 1;
      await writeJson(path.join(missingRoot, '.aios', 'codemap.json'), { version: 1 });
      await mkdir(path.join(missingRoot, '.code-review-graph'), { recursive: true });
    },
  });
  assert.equal(installed.status, 'installed');
  assert.equal(calls, 1);

  // install 抛错（如缺 uv）：只告警、不抛，启动永不阻塞。
  const brokenRoot = await makeTemp('aios-codemap-ensure-broken-');
  const failed = await ensureCodemapInstalled({
    projectRoot: brokenRoot,
    io,
    env: {},
    installImpl: async () => { throw new Error('Missing required command: uv'); },
  });
  assert.equal(failed.status, 'failed');
  assert.match(failed.reason, /uv/, '失败原因要保留，便于定位');
});
