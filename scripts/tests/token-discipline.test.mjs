import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseArgs } from '../lib/cli/parse-args.mjs';
import { runDoctorSuite } from '../lib/doctor/aggregate.mjs';
import { planSetup } from '../lib/lifecycle/setup.mjs';
import { planUpdate } from '../lib/lifecycle/update.mjs';
import { syncNativeEnhancements } from '../lib/native/sync.mjs';
import {
  loadTokenDisciplineConfig,
  planTokenDiscipline,
  planClientCostSettings,
} from '../lib/token-discipline/index.mjs';

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function seedNativeRoot(rootDir) {
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
  await writeJson(path.join(rootDir, 'config', 'skills-sync-manifest.json'), {
    schemaVersion: 1,
    generatedRoots: {
      codex: '.codex/skills',
      claude: '.claude/skills',
      gemini: '.gemini/skills',
      opencode: '.opencode/skills',
    },
    skills: [],
    legacyUnmanaged: [],
  });
  await cp(path.join(resolveRepoRoot(), 'agent-sources'), path.join(rootDir, 'agent-sources'), {
    recursive: true,
  });
  const partials = path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials');
  await mkdir(partials, { recursive: true });
  for (const name of ['core-instructions', 'contextdb', 'client-capabilities', 'token-discipline', 'agent-routing', 'codemap', 'browser-mcp', 'team-provider', 'model-router', 'harness']) {
    await writeFile(path.join(partials, `${name}.md`), `${name} partial\n`, 'utf8');
  }
  await writeFile(
    path.join(partials, 'token-discipline.md'),
    'AIOS Token Discipline: minimal | balanced | full. Use strategic compact after exploration, before implementation. Do not replace AIOS interception runtime.\n',
    'utf8',
  );
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'codex', 'project'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'claude', 'project'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'gemini', 'project'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'opencode', 'project'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'grok', 'project'), { recursive: true });
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'codex', 'project', 'AGENTS.md'), 'codex project\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'claude', 'project', 'CLAUDE.md'), 'claude project\n', 'utf8');
  await writeJson(path.join(rootDir, 'client-sources', 'native-base', 'claude', 'project', 'settings.local.json'), {});
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'gemini', 'project', 'GEMINI.md'), 'gemini project\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'opencode', 'project', 'AIOS.md'), 'opencode project\n', 'utf8');
  // Codex AGENTS.md composition appends Grok native notes (shared AGENTS.md surface).
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'grok', 'project', 'AGENTS.md'), 'grok project\n', 'utf8');
}

test('token profile parses for setup and update and rejects invalid values', () => {
  assert.equal(parseArgs(['setup', '--token-profile', 'minimal']).options.tokenProfile, 'minimal');
  assert.equal(parseArgs(['update', '--token-profile', 'full']).options.tokenProfile, 'full');
  assert.throws(() => parseArgs(['setup', '--token-profile', 'tiny']), /--token-profile must be one of: minimal, balanced, full/);
});

test('setup and update plans surface token profile and cost-setting opt-in', () => {
  const setup = planSetup({ tokenProfile: 'minimal', applyClientCostSettings: true });
  assert.equal(setup.options.tokenProfile, 'minimal');
  assert.equal(setup.options.applyClientCostSettings, true);
  assert.match(setup.preview, /--token-profile minimal/);
  assert.match(setup.preview, /--apply-client-cost-settings/);

  const update = planUpdate({ tokenProfile: 'full' });
  assert.equal(update.options.tokenProfile, 'full');
  assert.match(update.preview, /--token-profile full/);
});

test('token discipline planner applies ECC-style defaults without replacing AIOS interception', async () => {
  const rootDir = await makeTemp('aios-token-discipline-root-');
  await writeJson(path.join(rootDir, 'config', 'token-discipline.json'), {
    schemaVersion: 1,
    defaultProfile: 'balanced',
    mcpBudget: { maxEnabledServers: 2 },
  });
  const config = loadTokenDisciplineConfig(rootDir);
  const plan = planTokenDiscipline({ profile: 'minimal', config });

  assert.equal(plan.profile, 'minimal');
  assert.equal(plan.mcpBudget.maxEnabledServers, 2);
  assert.deepEqual(plan.compactTriggers, ['after-exploration', 'after-milestone', 'after-debugging', 'before-context-switch']);
  assert.equal(plan.interceptionRuntime, 'preserve-aios-native');
});

test('doctor reports token discipline MCP budget warnings', async () => {
  const rootDir = await makeTemp('aios-token-discipline-doctor-root-');
  await writeJson(path.join(rootDir, 'config', 'token-discipline.json'), {
    schemaVersion: 1,
    defaultProfile: 'balanced',
    mcpBudget: { maxEnabledServers: 1 },
  });
  await writeJson(path.join(rootDir, '.mcp.json'), {
    mcpServers: {
      one: { command: 'node', args: ['one.js'] },
      two: { command: 'node', args: ['two.js'] },
    },
  });

  const logs = [];
  const result = await runDoctorSuite({
    rootDir,
    strict: false,
    profile: 'minimal',
    io: { log: (line) => logs.push(String(line)) },
    deps: {
      doctorContextDbShell: async () => ({ effectiveWarnings: 0 }),
      doctorContextDbSkills: async () => ({ effectiveWarnings: 0 }),
      doctorNativeEnhancements: async () => ({ effectiveWarnings: 0, errors: 0 }),
    },
  });

  const rendered = logs.join('\n');
  assert.equal(result.exitCode, 0);
  assert.match(rendered, /doctor-token-discipline/);
  assert.match(rendered, /enabledMcpServers=2; maxEnabledServers=1/);
  assert.match(rendered, /Use --token-profile minimal or disable low-value MCP servers/);
});

test('token discipline detects low-value MCP servers and plans opt-in cost settings', async () => {
  const rootDir = await makeTemp('aios-token-discipline-low-value-root-');
  await writeJson(path.join(rootDir, 'config', 'token-discipline.json'), {
    schemaVersion: 1,
    defaultProfile: 'balanced',
    mcpBudget: {
      maxEnabledServers: 4,
      lowValueServerNames: ['legacy-browser', 'unused-search'],
      noisyServerNames: ['raw-html'],
    },
    clientCostRecommendations: {
      claude: {
        model: 'sonnet',
        maxThinkingTokens: 10000,
        subagentModel: 'haiku',
      },
    },
  });
  await writeJson(path.join(rootDir, '.mcp.json'), {
    mcpServers: {
      'legacy-browser': { command: 'node', args: ['legacy.js'] },
      'raw-html': { command: 'node', args: ['raw.js'] },
      'mcp-browser-use': { command: 'node', args: ['scripts/aios-mcp-proxy.mjs', '--', 'browser.js'] },
      'browser-direct': { command: 'node', args: ['browser.js'] },
    },
  });

  const report = planTokenDiscipline({
    profile: 'minimal',
    config: loadTokenDisciplineConfig(rootDir),
    projectRoot: rootDir,
  });
  assert.equal(report.profile, 'minimal');
  assert.equal(report.lowValueMcpServers.length, 3);
  assert.ok(report.lowValueMcpServers.some((item) => item.name === 'legacy-browser' && item.reason === 'configured-low-value'));
  assert.ok(report.lowValueMcpServers.some((item) => item.name === 'raw-html' && item.reason === 'configured-noisy-output'));
  assert.ok(report.lowValueMcpServers.some((item) => item.name === 'browser-direct' && item.reason === 'not-routed-through-aios-proxy'));

  const dryRun = planClientCostSettings({ client: 'claude', config: loadTokenDisciplineConfig(rootDir), dryRun: true });
  assert.equal(dryRun.client, 'claude');
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.actions[0].model, 'sonnet');
  assert.equal(dryRun.actions[0].maxThinkingTokens, 10000);
  assert.equal(dryRun.actions[0].subagentModel, 'haiku');
});

test('native sync emits strategic compact and token profile guidance', async () => {
  const rootDir = await makeTemp('aios-token-discipline-native-root-');
  await seedNativeRoot(rootDir);

  await syncNativeEnhancements({ rootDir, client: 'codex' });
  const agents = await readFile(path.join(rootDir, 'AGENTS.md'), 'utf8');

  assert.match(agents, /AIOS Token Discipline/);
  assert.match(agents, /minimal \| balanced \| full/);
  assert.match(agents, /strategic compact/i);
  assert.match(agents, /after exploration, before implementation/i);
  assert.match(agents, /Do not replace AIOS interception runtime/i);
});
