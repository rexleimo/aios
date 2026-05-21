import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { doctorCodemap, installCodemap } from '../lib/components/codemap.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function silentIo(logs = []) {
  return { log: (line) => logs.push(String(line)) };
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

test('codemap install writes client-readable MCP configs for all AIOS clients', async () => {
  const rootDir = await makeTemp('aios-codemap-install-root-');
  const projectRoot = await makeTemp('aios-codemap-install-project-');
  const codexHome = path.join(rootDir, 'home', '.codex');
  const claudeHome = path.join(rootDir, 'home', '.claude');
  const geminiHome = path.join(rootDir, 'home', '.gemini');
  const opencodeHome = path.join(rootDir, 'home', '.config', 'opencode');

  await mkdir(codexHome, { recursive: true });
  await mkdir(path.join(projectRoot, '.code-review-graph'), { recursive: true });
  await writeFile(path.join(codexHome, 'config.toml'), '[mcp_servers.existing]\ncommand = "npx"\n', 'utf8');
  await writeJson(path.join(projectRoot, '.mcp.json'), { mcpServers: { existing: { command: 'node', args: ['server.js'] } } });
  await writeJson(path.join(projectRoot, '.gemini', 'settings.json'), { mcpServers: { existing: { command: 'node' } } });
  await writeJson(path.join(opencodeHome, 'opencode.json'), { mcp: { existing: { type: 'local', command: ['node', 'server.js'] } } });

  const logs = [];
  const result = await installCodemap({
    rootDir,
    projectRoot,
    io: silentIo(logs),
    clientHomes: { codex: codexHome, claude: claudeHome, gemini: geminiHome, opencode: opencodeHome },
    skipCrgChecks: true,
    crgVersion: 'code-review-graph test',
  });

  assert.deepEqual(result.injectedClients.sort(), ['claude', 'codex', 'gemini', 'opencode']);

  const codexToml = await readFile(path.join(codexHome, 'config.toml'), 'utf8');
  assert.match(codexToml, /\[mcp_servers\.code-review-graph\]/);
  assert.match(codexToml, /command = "uvx"/);
  assert.match(codexToml, /args = \["code-review-graph", "serve"\]/);
  assert.match(codexToml, new RegExp(`cwd = "${projectRoot.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}"`));

  const claudeMcp = await readJson(path.join(projectRoot, '.mcp.json'));
  assert.equal(claudeMcp.mcpServers['code-review-graph'].cwd, projectRoot);
  assert.equal(claudeMcp.mcpServers['code-review-graph'].type, 'stdio');
  assert.equal(claudeMcp.mcpServers.existing.command, 'node');

  const geminiSettings = await readJson(path.join(projectRoot, '.gemini', 'settings.json'));
  assert.equal(geminiSettings.mcpServers['code-review-graph'].cwd, projectRoot);
  assert.equal(geminiSettings.mcpServers.existing.command, 'node');

  const opencodeConfig = await readJson(path.join(opencodeHome, 'opencode.json'));
  assert.deepEqual(opencodeConfig.mcp['code-review-graph'].command, ['uvx', 'code-review-graph', 'serve']);
  assert.equal(opencodeConfig.mcp['code-review-graph'].type, 'local');
  assert.equal(opencodeConfig.mcp['code-review-graph'].enabled, true);
  assert.deepEqual(opencodeConfig.mcp.existing.command, ['node', 'server.js']);

  assert.match(await readFile(path.join(projectRoot, 'CLAUDE.md'), 'utf8'), /MCP Tools: code-review-graph/);
  assert.match(await readFile(path.join(projectRoot, 'GEMINI.md'), 'utf8'), /MCP Tools: code-review-graph/);
  assert.match(await readFile(path.join(projectRoot, 'AGENTS.md'), 'utf8'), /MCP Tools: code-review-graph/);
});

test('codemap doctor reports missing per-client MCP config and --fix heals it', async () => {
  const rootDir = await makeTemp('aios-codemap-doctor-root-');
  const projectRoot = await makeTemp('aios-codemap-doctor-project-');
  const codexHome = path.join(rootDir, 'home', '.codex');
  const claudeHome = path.join(rootDir, 'home', '.claude');
  const geminiHome = path.join(rootDir, 'home', '.gemini');
  const opencodeHome = path.join(rootDir, 'home', '.config', 'opencode');
  await mkdir(path.join(projectRoot, '.code-review-graph'), { recursive: true });
  await mkdir(codexHome, { recursive: true });

  const clientHomes = { codex: codexHome, claude: claudeHome, gemini: geminiHome, opencode: opencodeHome };
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
  assert.ok(first.effectiveWarnings >= 4);
  assert.match(firstLogs.join('\n'), /code-review-graph missing in .*config\.toml \(codex\)/);
  assert.match(firstLogs.join('\n'), /code-review-graph missing in .*\.mcp\.json \(claude\)/);
  assert.match(firstLogs.join('\n'), /code-review-graph missing in .*\.gemini\/settings\.json \(gemini\)/);
  assert.match(firstLogs.join('\n'), /code-review-graph missing in .*opencode\.json \(opencode\)/);

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
  assert.match(secondLogs.join('\n'), /code-review-graph found in .*config\.toml \(codex\)/);
  assert.match(secondLogs.join('\n'), /code-review-graph found in .*\.mcp\.json \(claude\)/);
  assert.match(secondLogs.join('\n'), /code-review-graph found in .*\.gemini\/settings\.json \(gemini\)/);
  assert.match(secondLogs.join('\n'), /code-review-graph found in .*opencode\.json \(opencode\)/);
});
