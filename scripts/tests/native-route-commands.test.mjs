import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { installNativeEnhancements } from '../lib/components/native.mjs';
import {
  buildRouteTriggerCommandTargets,
  checkRouteTriggerCommandsSync,
  syncRouteTriggerCommands,
} from '../lib/native/route-commands.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function silentIo() {
  return { log() {}, warn() {}, error() {} };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatShellArg(value = '') {
  const text = String(value ?? '');
  if (text === '$PWD') return '"$PWD"';
  if (text === '${PWD##*/}') return '"${PWD##*/}"';
  if (/^[A-Za-z0-9_./:@=-]+$/u.test(text)) return text;
  return `'${text.replace(/'/g, "'\\''")}'`;
}

async function buildHomeMap() {
  return {
    codex: await makeTemp('aios-route-codex-home-'),
    claude: await makeTemp('aios-route-claude-home-'),
    gemini: await makeTemp('aios-route-gemini-home-'),
    opencode: await makeTemp('aios-route-opencode-home-'),
  };
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function seedMinimalNativeRoot(rootDir) {
  await writeJson(path.join(rootDir, 'config', 'native-sync-manifest.json'), {
    schemaVersion: 1,
    managedBy: 'aios',
    markers: {
      markdownBegin: '<!-- AIOS NATIVE BEGIN -->',
      markdownEnd: '<!-- AIOS NATIVE END -->',
    },
    clients: {
      codex: { tier: 'deep', metadataRoot: '.codex', outputs: ['AGENTS.md', '.codex/agents', '.codex/skills'] },
      claude: { tier: 'deep', metadataRoot: '.claude', outputs: ['CLAUDE.md', '.claude/settings.local.json', '.claude/agents', '.claude/skills'] },
      gemini: { tier: 'compatibility', metadataRoot: '.gemini', outputs: ['GEMINI.md', '.gemini/commands'] },
      opencode: { tier: 'compatibility', metadataRoot: '.opencode', outputs: ['AGENTS.md', '.opencode/skills'] },
    },
  });
  await writeJson(path.join(rootDir, 'config', 'skills-sync-manifest.json'), {
    schemaVersion: 1,
    generatedRoots: {
      codex: '.codex/skills',
      claude: '.claude/skills',
      gemini: '.gemini/commands',
      opencode: '.opencode/skills',
    },
    skills: [],
    legacyUnmanaged: [],
  });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials'), { recursive: true });
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'core-instructions.md'), 'core\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'contextdb.md'), 'contextdb\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'browser-mcp.md'), 'browser\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'superpowers.md'), 'superpowers\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'agent-routing.md'), 'agent-routing\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'codemap.md'), 'codemap\n', 'utf8');
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'gemini', 'project'), { recursive: true });
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'gemini', 'project', 'AIOS.md'), 'gemini native\n', 'utf8');
}

test('route trigger sync installs slash shortcuts in each client home', async () => {
  const rootDir = await makeTemp('aios-route-root-');
  const homeMap = await buildHomeMap();

  const result = await syncRouteTriggerCommands({
    rootDir,
    client: 'all',
    homeMap,
    io: silentIo(),
  });

  assert.equal(result.ok, true);
  assert.equal(result.results.reduce((sum, item) => sum + item.installed, 0), 16);

  const codexSubagent = await readFile(path.join(homeMap.codex, 'prompts', 'subagent.md'), 'utf8');
  assert.match(codexSubagent, /argument-hint: task/u);
  assert.match(codexSubagent, /\$ARGUMENTS/u);
  assert.match(codexSubagent, /AIOS \/prompts:subagent/u);
  assert.match(codexSubagent, /--route subagent/u);
  assert.match(
    codexSubagent,
    new RegExp(`node ${escapeRegExp(formatShellArg(path.join(rootDir, 'scripts', 'ctx-agent.mjs')))}`, 'u')
  );

  const claudeTeam = await readFile(path.join(homeMap.claude, 'commands', 'team.md'), 'utf8');
  assert.match(claudeTeam, /description: AIOS route: team/u);
  assert.match(claudeTeam, /\$ARGUMENTS/u);
  assert.match(claudeTeam, /--route team/u);

  const geminiHarness = await readFile(path.join(homeMap.gemini, 'commands', 'harness.toml'), 'utf8');
  assert.match(geminiHarness, /description = "AIOS route: harness"/u);
  assert.match(geminiHarness, /\{\{args\}\}/u);
  assert.match(geminiHarness, /--route harness/u);

  const opencodeSingle = await readFile(path.join(homeMap.opencode, 'commands', 'single.md'), 'utf8');
  assert.match(opencodeSingle, /description: AIOS route: single/u);
  assert.match(opencodeSingle, /\$ARGUMENTS/u);
  assert.match(opencodeSingle, /AIOS \/single/u);
  assert.match(opencodeSingle, /Continue in the current client/u);
});

test('route trigger sync preserves unmanaged user commands', async () => {
  const rootDir = await makeTemp('aios-route-root-');
  const homeMap = await buildHomeMap();
  const unmanagedPath = path.join(homeMap.codex, 'prompts', 'subagent.md');
  await mkdir(path.dirname(unmanagedPath), { recursive: true });
  await writeFile(unmanagedPath, 'user custom prompt\n', 'utf8');

  const result = await syncRouteTriggerCommands({
    rootDir,
    client: 'codex',
    homeMap,
    io: silentIo(),
  });

  assert.equal(result.results[0].skipped, 1);
  assert.equal(await readFile(unmanagedPath, 'utf8'), 'user custom prompt\n');

  const check = await checkRouteTriggerCommandsSync({ rootDir, client: 'codex', homeMap });
  assert.equal(check.ok, false);
  assert.equal(check.issues.some((issue) => issue.includes('[unmanaged conflict]')), true);
});

test('route trigger command bodies shell-quote static paths', async () => {
  const homeMap = await buildHomeMap();
  const rootDir = "/tmp/aios root/$unsafe'sub";

  const targets = buildRouteTriggerCommandTargets({ rootDir, client: 'claude', homeMap });
  const team = targets.find((target) => target.route === 'team');

  assert.ok(team);
  assert.match(
    team.content,
    new RegExp(`node ${escapeRegExp(formatShellArg(path.join(rootDir, 'scripts', 'ctx-agent.mjs')))}`, 'u')
  );
  assert.match(team.content, /--workspace "\$PWD"/u);
  assert.match(team.content, /--project "\$\{PWD##\*\/\}"/u);
});

test('route trigger sync removes only managed route commands on uninstall', async () => {
  const rootDir = await makeTemp('aios-route-root-');
  const homeMap = await buildHomeMap();
  const unmanagedPath = path.join(homeMap.codex, 'prompts', 'custom.md');
  await mkdir(path.dirname(unmanagedPath), { recursive: true });
  await writeFile(unmanagedPath, 'keep me\n', 'utf8');

  await syncRouteTriggerCommands({ rootDir, client: 'codex', homeMap, io: silentIo() });
  const uninstall = await syncRouteTriggerCommands({
    rootDir,
    client: 'codex',
    homeMap,
    mode: 'uninstall',
    io: silentIo(),
  });

  assert.equal(uninstall.results[0].removed, 4);
  assert.equal(await readFile(unmanagedPath, 'utf8'), 'keep me\n');
  await assert.rejects(readFile(path.join(homeMap.codex, 'prompts', 'team.md'), 'utf8'), /ENOENT/u);
});

test('native component install provisions global route trigger commands', async () => {
  const rootDir = await makeTemp('aios-route-native-root-');
  const homeMap = await buildHomeMap();
  await seedMinimalNativeRoot(rootDir);

  await installNativeEnhancements({
    rootDir,
    client: 'gemini',
    homeMap,
    io: silentIo(),
  });

  const command = await readFile(path.join(homeMap.gemini, 'commands', 'subagent.toml'), 'utf8');
  assert.match(command, /--route subagent/u);
  assert.match(command, /\{\{args\}\}/u);
});
