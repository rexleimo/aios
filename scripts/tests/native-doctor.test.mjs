import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runDoctorSuite } from '../lib/doctor/aggregate.mjs';
import { rollbackNativeRepair } from '../lib/native/repairs.mjs';
import { syncRouteTriggerCommands } from '../lib/native/route-commands.mjs';
import { syncNativeEnhancements } from '../lib/native/sync.mjs';

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

function silentIo() {
  return { log() {}, warn() {}, error() {} };
}

async function buildRouteHomeMap() {
  return {
    codex: await makeTemp('aios-native-doctor-codex-home-'),
    claude: await makeTemp('aios-native-doctor-claude-home-'),
    gemini: await makeTemp('aios-native-doctor-gemini-home-'),
    opencode: await makeTemp('aios-native-doctor-opencode-home-'),
  };
}

function buildRouteEnv(homeMap) {
  return {
    CODEX_HOME: homeMap.codex,
    CLAUDE_HOME: homeMap.claude,
    GEMINI_HOME: homeMap.gemini,
    OPENCODE_HOME: homeMap.opencode,
  };
}

async function seedRouteCommands(rootDir) {
  const homeMap = await buildRouteHomeMap();
  await syncRouteTriggerCommands({ rootDir, client: 'all', homeMap, io: silentIo() });
  return buildRouteEnv(homeMap);
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function writeNativeManifest(rootDir) {
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
      gemini: { tier: 'compatibility', metadataRoot: '.gemini', outputs: ['GEMINI.md', '.gemini/skills'] },
      opencode: { tier: 'compatibility', metadataRoot: '.opencode', outputs: ['AGENTS.md', '.opencode/agent/aios-build.md', '.opencode/agents', '.opencode/skills', 'opencode.json'] },
    },
  });
}

async function writeNativeSources(rootDir) {
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'codex', 'project'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'claude', 'project'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'gemini', 'project'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'opencode', 'project'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'grok', 'project'), { recursive: true });

  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'core-instructions.md'), 'Shared native instructions.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'contextdb.md'), 'ContextDB bridge enabled.\n', 'utf8');

  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'client-capabilities.md'), 'Client capability gates enabled.\n', 'utf8');  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'token-discipline.md'), 'AIOS Token Discipline: minimal | balanced | full. Use strategic compact after exploration, before implementation. Do not replace AIOS interception runtime.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'browser-mcp.md'), `Browser MCP is available through the repo-local AIOS server and should be preferred for browser work.

For browser tasks, use this operating pattern unless the user explicitly asks otherwise:
- Connect to a visible CDP browser first: \`chrome.launch_cdp\` then \`browser.connect_cdp\`.
- Before acting, read the page state with \`page.extract_text\`; use \`page.get_html\` only when text is insufficient.
- Work in short read -> act -> verify loops. Do not chain multiple blind browser actions.
- Prefer visible text or role-based targets. If a locator is not unique, inspect again and narrow the target instead of guessing.
- After navigation or major actions, use \`page.wait\` when a state transition is expected, then re-read the page.
- Use \`page.screenshot\` only as a visual fallback when text/HTML evidence is not enough.
- For complex browser tasks, first summarize the current page, then state the next single action, then execute it.
- When \`mcp-browser-use\` is available, use its browser-use toolchain (\`chrome.*\` / \`browser.*\` / \`page.*\`) for normal business flows instead of \`chrome-devtools\`.
`, 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'agent-routing.md'), 'Agent routing section.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'team-provider.md'), 'Team provider section.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'model-router.md'), 'Model router section.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'harness.md'), 'Harness section.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'codemap.md'), 'Codemap section.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'codex', 'project', 'AGENTS.md'), 'Codex native block.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'claude', 'project', 'CLAUDE.md'), 'Claude native block.\n', 'utf8');
  await writeJson(path.join(rootDir, 'client-sources', 'native-base', 'claude', 'project', 'settings.local.json'), {
    hooks: {
      SessionStart: ['node omc-hook.mjs'],
    },
  });
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'gemini', 'project', 'GEMINI.md'), 'Gemini compatibility instructions.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'opencode', 'project', 'AIOS.md'), 'Opencode compatibility instructions.\n', 'utf8');
  // Codex AGENTS.md composition appends Grok native notes (shared AGENTS.md surface).
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'grok', 'project', 'AGENTS.md'), 'Grok native block.\n', 'utf8');
}

async function writeSkillSources(rootDir) {
  await writeJson(path.join(rootDir, 'config', 'skills-sync-manifest.json'), {
    schemaVersion: 1,
    generatedRoots: {
      codex: '.codex/skills',
      claude: '.claude/skills',
      gemini: '.gemini/skills',
      opencode: '.opencode/skills',
    },
    skills: [
      { relativeSkillPath: 'find-skills', installCatalogName: 'find-skills', repoTargets: ['codex', 'claude', 'gemini', 'opencode'] },
    ],
    legacyUnmanaged: [],
  });
  await mkdir(path.join(rootDir, 'skill-sources', 'find-skills'), { recursive: true });
  await writeFile(path.join(rootDir, 'skill-sources', 'find-skills', 'SKILL.md'), '# native skill\n', 'utf8');
}

async function writeAgentSources(rootDir) {
  await cp(path.join(resolveRepoRoot(), 'agent-sources'), path.join(rootDir, 'agent-sources'), {
    recursive: true,
  });
}

async function seedNativeRoot(rootDir) {
  await writeNativeManifest(rootDir);
  await writeNativeSources(rootDir);
  await writeSkillSources(rootDir);
  await writeAgentSources(rootDir);
  await writeFile(path.join(rootDir, 'AGENTS.md'), 'Seed AGENTS\n', 'utf8');
  await writeFile(path.join(rootDir, 'CLAUDE.md'), 'Seed CLAUDE\n', 'utf8');
}

test('doctor --native runs only native checks', async () => {
  const rootDir = await makeTemp('aios-native-doctor-only-root-');
  await seedNativeRoot(rootDir);
  await syncNativeEnhancements({ rootDir, client: 'codex' });
  const env = await seedRouteCommands(rootDir);

  const logs = [];
  const result = await runDoctorSuite({
    rootDir,
    nativeOnly: true,
    io: { log: (line) => logs.push(String(line)) },
    env,
  });

  assert.equal(result.exitCode, 0);
  assert.match(logs.join('\n'), /doctor-native/);
  assert.doesNotMatch(logs.join('\n'), /doctor-contextdb-shell/);
  assert.doesNotMatch(logs.join('\n'), /doctor-browser-mcp/);
});

test('doctor --native respects client-specific compatibility targets', async () => {
  const rootDir = await makeTemp('aios-native-doctor-client-root-');
  await seedNativeRoot(rootDir);
  await syncNativeEnhancements({ rootDir, client: 'opencode' });
  const env = await seedRouteCommands(rootDir);

  const logs = [];
  const result = await runDoctorSuite({
    rootDir,
    client: 'opencode',
    nativeOnly: true,
    verbose: true,
    io: { log: (line) => logs.push(String(line)) },
    env,
  });

  const rendered = logs.join('\n');
  assert.equal(result.exitCode, 0);
  assert.match(rendered, /Client: opencode/);
  assert.match(rendered, /metadata=\.opencode\/\.aios-native-sync\.json present/);
  assert.doesNotMatch(rendered, /update --components native --client codex/);
});

test('doctor --native reports a missing OpenCode primary agent', async () => {
  const rootDir = await makeTemp('aios-native-doctor-opencode-primary-agent-root-');
  await seedNativeRoot(rootDir);
  await syncNativeEnhancements({ rootDir, client: 'opencode' });
  const env = await seedRouteCommands(rootDir);
  await rm(path.join(rootDir, '.opencode', 'agent', 'aios-build.md'), { force: true });

  const logs = [];
  const result = await runDoctorSuite({
    rootDir,
    client: 'opencode',
    nativeOnly: true,
    io: { log: (line) => logs.push(String(line)) },
    env,
  });

  const rendered = logs.join('\n');
  assert.equal(result.exitCode, 1);
  assert.match(rendered, /\[missing\] \.opencode\/agent\/aios-build\.md/u);
  assert.match(rendered, /node scripts\/aios\.mjs update --components native --client opencode/u);
});

test('doctor --native checks projectRoot outputs when AIOS is installed elsewhere', async () => {
  const rootDir = await makeTemp('aios-native-doctor-source-root-');
  const projectRoot = await makeTemp('aios-native-doctor-project-root-');
  await seedNativeRoot(rootDir);
  await syncNativeEnhancements({ rootDir, targetRootDir: projectRoot, client: 'opencode' });
  const env = await seedRouteCommands(rootDir);

  const logs = [];
  const result = await runDoctorSuite({
    rootDir,
    projectRoot,
    client: 'opencode',
    nativeOnly: true,
    verbose: true,
    io: { log: (line) => logs.push(String(line)) },
    env,
  });

  const rendered = logs.join('\n');
  assert.equal(result.exitCode, 0);
  assert.ok(rendered.includes(`Project: ${projectRoot}`));
  assert.match(rendered, /metadata=\.opencode\/\.aios-native-sync\.json present/);
  await assert.rejects(() => readFile(path.join(rootDir, '.opencode', '.aios-native-sync.json'), 'utf8'));
});

test('doctor --native --verbose prints native explainability details', async () => {
  const rootDir = await makeTemp('aios-native-doctor-verbose-root-');
  await seedNativeRoot(rootDir);
  await syncNativeEnhancements({ rootDir, client: 'codex' });
  const env = await seedRouteCommands(rootDir);

  const logs = [];
  const result = await runDoctorSuite({
    rootDir,
    nativeOnly: true,
    verbose: true,
    io: { log: (line) => logs.push(String(line)) },
    env,
  });

  const rendered = logs.join('\n');
  assert.equal(result.exitCode, 0);
  assert.match(rendered, /metadata=\.codex\/\.aios-native-sync\.json present/);
  assert.match(rendered, /managedTargets\(expected\): AGENTS\.md, \.codex\/agents, \.codex\/skills/);
  assert.match(rendered, /operations: AGENTS\.md/);
});

test('doctor --native --fix installs env-scoped route commands', async () => {
  const rootDir = await makeTemp('aios-native-doctor-route-fix-root-');
  await seedNativeRoot(rootDir);
  await syncNativeEnhancements({ rootDir, client: 'codex' });
  const homeMap = await buildRouteHomeMap();
  const env = buildRouteEnv(homeMap);

  const logs = [];
  const result = await runDoctorSuite({
    rootDir,
    nativeOnly: true,
    fix: true,
    io: { log: (line) => logs.push(String(line)) },
    env,
  });

  assert.equal(result.exitCode, 0);
  assert.match(await readFile(path.join(homeMap.codex, 'prompts', 'team.md'), 'utf8'), /AIOS \/prompts:team/u);
  assert.match(await readFile(path.join(homeMap.claude, 'commands', 'team.md'), 'utf8'), /AIOS \/team/u);
  assert.match(await readFile(path.join(homeMap.gemini, 'commands', 'team.toml'), 'utf8'), /AIOS \/team/u);
  assert.match(await readFile(path.join(homeMap.opencode, 'commands', 'team.md'), 'utf8'), /AIOS \/team/u);
});

test('native doctor reports unmanaged conflicts with a concrete recovery command', async () => {
  const rootDir = await makeTemp('aios-native-doctor-conflict-root-');
  await seedNativeRoot(rootDir);
  await syncNativeEnhancements({ rootDir, client: 'codex' });
  const env = await seedRouteCommands(rootDir);
  await writeFile(path.join(rootDir, 'AGENTS.md'), 'manual overwrite\n', 'utf8');

  const logs = [];
  const result = await runDoctorSuite({
    rootDir,
    nativeOnly: true,
    io: { log: (line) => logs.push(String(line)) },
    env,
  });

  assert.equal(result.exitCode, 1);
  assert.match(logs.join('\n'), /unmanaged conflict/i);
  assert.match(logs.join('\n'), /node scripts\/aios\.mjs update --components native --client codex/);
});

test('native doctor reports sync drift when repo-local generated skills change', async () => {
  const rootDir = await makeTemp('aios-native-doctor-drift-root-');
  await seedNativeRoot(rootDir);
  await syncNativeEnhancements({ rootDir, client: 'gemini' });
  const env = await seedRouteCommands(rootDir);
  await writeFile(path.join(rootDir, '.gemini', 'skills', 'find-skills', 'SKILL.md'), 'drifted\n', 'utf8');

  const logs = [];
  const result = await runDoctorSuite({
    rootDir,
    nativeOnly: true,
    io: { log: (line) => logs.push(String(line)) },
    env,
  });

  assert.equal(result.exitCode, 1);
  assert.match(logs.join('\n'), /\[drift\]/);
  assert.match(await readFile(path.join(rootDir, '.gemini', 'skills', 'find-skills', 'SKILL.md'), 'utf8'), /drifted/);
});

test('doctor --native --fix repairs unmanaged compatibility docs and exits cleanly', async () => {
  const rootDir = await makeTemp('aios-native-doctor-fix-managed-file-root-');
  await seedNativeRoot(rootDir);
  await syncNativeEnhancements({ rootDir, client: 'gemini' });
  const env = await seedRouteCommands(rootDir);
  await writeFile(path.join(rootDir, 'GEMINI.md'), 'manual overwrite\n', 'utf8');

  const logs = [];
  const result = await runDoctorSuite({
    rootDir,
    nativeOnly: true,
    fix: true,
    client: 'gemini',
    io: { log: (line) => logs.push(String(line)) },
    env,
  });

  assert.equal(result.exitCode, 0);
  assert.match(logs.join('\n'), /Native Auto-Fix/);
  assert.match(logs.join('\n'), /\[fix\] native gemini/);
  assert.match(logs.join('\n'), /\[repair\] changed total=\d+/);
  assert.match(logs.join('\n'), /\[repair\] changed file=GEMINI\.md \(updated\)/);
  assert.match(await readFile(path.join(rootDir, 'GEMINI.md'), 'utf8'), /AIOS NATIVE BEGIN/);
});

test('doctor --native --fix --dry-run only prints planned fixes without mutating files', async () => {
  const rootDir = await makeTemp('aios-native-doctor-fix-dry-run-root-');
  await seedNativeRoot(rootDir);
  await syncNativeEnhancements({ rootDir, client: 'gemini' });
  const env = await seedRouteCommands(rootDir);
  await writeFile(path.join(rootDir, 'GEMINI.md'), 'manual overwrite\n', 'utf8');

  const logs = [];
  const result = await runDoctorSuite({
    rootDir,
    nativeOnly: true,
    fix: true,
    dryRun: true,
    io: { log: (line) => logs.push(String(line)) },
    env,
  });

  assert.equal(result.exitCode, 1);
  assert.match(logs.join('\n'), /\[plan\] native gemini/);
  assert.match(logs.join('\n'), /\[plan\] native files total=\d+/);
  assert.match(logs.join('\n'), /\[plan\] native files file=GEMINI\.md/);
  assert.equal(await readFile(path.join(rootDir, 'GEMINI.md'), 'utf8'), 'manual overwrite\n');
});

test('doctor --native --fix records repair manifest and supports rollback', async () => {
  const rootDir = await makeTemp('aios-native-doctor-fix-rollback-root-');
  await seedNativeRoot(rootDir);
  await syncNativeEnhancements({ rootDir, client: 'gemini' });
  const env = await seedRouteCommands(rootDir);
  await writeFile(path.join(rootDir, 'GEMINI.md'), 'manual overwrite\n', 'utf8');

  const logs = [];
  const result = await runDoctorSuite({
    rootDir,
    nativeOnly: true,
    fix: true,
    client: 'gemini',
    io: { log: (line) => logs.push(String(line)) },
    env,
  });

  const rendered = logs.join('\n');
  assert.equal(result.exitCode, 0);
  assert.match(rendered, /\[repair\] id=/);
  assert.match(rendered, /\[repair\] manifest=\.aios\/repairs\/.+\/manifest\.json/);
  assert.match(rendered, /\[repair\] rollback: node scripts\/aios\.mjs internal native rollback --repair-id /);
  assert.match(await readFile(path.join(rootDir, 'GEMINI.md'), 'utf8'), /AIOS NATIVE BEGIN/);

  const repairLine = logs.find((line) => line.startsWith('[repair] id='));
  assert.ok(repairLine);
  const repairId = repairLine.slice('[repair] id='.length).trim();
  assert.match(repairId, /\d{8}T\d{6}Z-[0-9a-f]{6}/);

  const manifestPath = path.join(rootDir, '.aios', 'repairs', repairId, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.kind, 'native-repair');
  assert.equal(manifest.status, 'completed');
  assert.equal(Array.isArray(manifest.changedEntries), true);
  assert.ok(manifest.summary.totalChanged > 0);

  const rollbackResult = await rollbackNativeRepair({ rootDir, repairId });
  assert.equal(rollbackResult.ok, true);
  assert.equal(rollbackResult.repairId, repairId);
  assert.equal(await readFile(path.join(rootDir, 'GEMINI.md'), 'utf8'), 'manual overwrite\n');
});
