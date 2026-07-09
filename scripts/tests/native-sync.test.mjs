import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { readNativeSyncMetadata } from '../lib/native/install-metadata.mjs';
import { syncNativeEnhancements } from '../lib/native/sync.mjs';

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
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
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'superpowers.md'), 'Section SUPERPOWERS-CAP only.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'agent-routing.md'), 'Section AGENT-ROUTING-CAP only.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'codemap.md'), 'Section CODEMAP-NATIVE for all.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'team-provider.md'), 'Section TEAM-PROVIDER-CAP only.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'model-router.md'), 'Section MODEL-ROUTER-CAP only.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', 'harness.md'), 'Section HARNESS for all.\n', 'utf8');
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
}

test('native sync gates instruction sections by client capability', async () => {
  const rootDir = await makeTemp('aios-native-sync-capability-root-');
  await seedNativeRoot(rootDir);

  await syncNativeEnhancements({ rootDir, client: 'all' });

  const agentsDoc = await readFile(path.join(rootDir, 'AGENTS.md'), 'utf8');
  const geminiDoc = await readFile(path.join(rootDir, 'GEMINI.md'), 'utf8');

  // codex has superpowers + agents + native �?all gated sections present.
  assert.match(agentsDoc, /SUPERPOWERS-CAP/);
  assert.match(agentsDoc, /AGENT-ROUTING-CAP/);
  assert.match(agentsDoc, /CODEMAP-NATIVE/);

  // gemini has superpowers + native but NOT agents �?superpowers + codemap present, agent-routing absent.
  assert.match(geminiDoc, /SUPERPOWERS-CAP/);
  assert.doesNotMatch(geminiDoc, /AGENT-ROUTING-CAP/);
  assert.match(geminiDoc, /CODEMAP-NATIVE/);
});

test('native sync injects a managed block into AGENTS.md without deleting user text', async () => {
  const rootDir = await makeTemp('aios-native-sync-codex-root-');
  await seedNativeRoot(rootDir);
  await writeFile(path.join(rootDir, 'AGENTS.md'), 'User preface.\n\nUser tail.\n', 'utf8');

  const result = await syncNativeEnhancements({ rootDir, client: 'codex' });
  const agentsDoc = await readFile(path.join(rootDir, 'AGENTS.md'), 'utf8');

  assert.equal(result.ok, true);
  assert.match(agentsDoc, /User preface/);
  assert.match(agentsDoc, /User tail/);
  assert.match(agentsDoc, /AIOS NATIVE BEGIN/);
  assert.match(agentsDoc, /Codex native block/);
  assert.match(agentsDoc, /page\.extract_text/);
  assert.match(agentsDoc, /read -> act -> verify/i);
  assert.equal(readNativeSyncMetadata(path.join(rootDir, '.codex')).client, 'codex');
});

test('native sync merges claude settings.local.json without clobbering non-AIOS keys', async () => {
  const rootDir = await makeTemp('aios-native-sync-claude-root-');
  await seedNativeRoot(rootDir);
  await writeFile(path.join(rootDir, 'CLAUDE.md'), 'Local intro.\n', 'utf8');
  await writeJson(path.join(rootDir, '.claude', 'settings.local.json'), {
    permissions: {
      allow: ['Bash(git:*)'],
    },
    hooks: {
      PreToolUse: ['existing-hook'],
    },
  });

  await syncNativeEnhancements({ rootDir, client: 'claude' });
  const settings = JSON.parse(await readFile(path.join(rootDir, '.claude', 'settings.local.json'), 'utf8'));
  const claudeDoc = await readFile(path.join(rootDir, 'CLAUDE.md'), 'utf8');

  assert.deepEqual(settings.permissions.allow, ['Bash(git:*)']);
  assert.deepEqual(settings.hooks.PreToolUse, ['existing-hook']);
  assert.equal(Array.isArray(settings.aiosNative.hooks.SessionStart), true);
  assert.match(claudeDoc, /Local intro/);
  assert.match(claudeDoc, /AIOS NATIVE BEGIN/);
});

test('native sync writes compatibility docs for gemini and opencode', async () => {
  const rootDir = await makeTemp('aios-native-sync-compat-root-');
  await seedNativeRoot(rootDir);

  await syncNativeEnhancements({ rootDir, client: 'all' });

  assert.match(await readFile(path.join(rootDir, 'AGENTS.md'), 'utf8'), /Opencode compatibility/);
  assert.match(await readFile(path.join(rootDir, 'GEMINI.md'), 'utf8'), /Gemini compatibility/);
  // OpenCode reads AGENTS.md (managed by the shared Codex/OpenCode emitter); no separate AIOS.md file needed.
  assert.equal(readNativeSyncMetadata(path.join(rootDir, '.gemini')).tier, 'compatibility');
  assert.equal(readNativeSyncMetadata(path.join(rootDir, '.opencode')).tier, 'compatibility');
});

test('native sync installs an OpenCode primary agent that fails closed on missing skills', async () => {
  const rootDir = await makeTemp('aios-native-sync-opencode-primary-agent-root-');
  await seedNativeRoot(rootDir);

  const result = await syncNativeEnhancements({ rootDir, client: 'opencode' });
  const primaryAgent = await readFile(path.join(rootDir, '.opencode', 'agent', 'aios-build.md'), 'utf8');
  const metadata = readNativeSyncMetadata(path.join(rootDir, '.opencode'));

  assert.equal(result.ok, true);
  assert.match(primaryAgent, /^---\nname: aios-build\n/m);
  assert.match(primaryAgent, /^mode: primary$/m);
  assert.match(primaryAgent, /invoke `using-superpowers` before any response or action/u);
  assert.match(primaryAgent, /`superpowers:brainstorming` -> `brainstorming`/u);
  assert.match(primaryAgent, /If a required skill is unavailable, stop/u);
  assert.equal(primaryAgent.startsWith('---\n'), true);
  assert.ok(metadata.managedTargets.includes('.opencode/agent/aios-build.md'));
});

test('native sync merges OpenCode config without clobbering user command buckets', async () => {
  const rootDir = await makeTemp('aios-native-sync-opencode-merge-root-');
  await seedNativeRoot(rootDir);
  await writeJson(path.join(rootDir, 'opencode.json'), {
    command: {
      custom: {
        description: 'User command',
        template: 'Keep this command',
        agent: 'general',
      },
    },
    agent: {
      general: {
        description: 'User agent',
        mode: 'primary',
      },
    },
    skills: {
      paths: ['custom-skills'],
    },
    permission: {
      bash: 'allow',
    },
  });

  await syncNativeEnhancements({ rootDir, client: 'opencode' });

  const config = JSON.parse(await readFile(path.join(rootDir, 'opencode.json'), 'utf8'));
  assert.equal(config.command.custom.template, 'Keep this command');
  assert.equal(config.command.verify.agent, 'aios-build');
  assert.equal(config.agent.general.description, 'User agent');
  assert.equal(config.agent['aios-build'].mode, 'primary');
  assert.deepEqual(config.skills.paths, ['custom-skills', '.opencode/skills']);
  assert.equal(config.permission.bash, 'allow');
  assert.equal(config.permission['mcp_*'], 'ask');
});

test('native sync can install codex project outputs outside the AIOS source root', async () => {
  const rootDir = await makeTemp('aios-native-sync-source-root-');
  const targetRootDir = await makeTemp('aios-native-sync-target-root-');
  await seedNativeRoot(rootDir);
  await writeFile(path.join(targetRootDir, 'AGENTS.md'), 'Project intro.\n', 'utf8');

  const result = await syncNativeEnhancements({ rootDir, targetRootDir, client: 'codex' });
  assert.equal(result.ok, true);

  const agentsDoc = await readFile(path.join(targetRootDir, 'AGENTS.md'), 'utf8');
  assert.match(agentsDoc, /Project intro/);
  assert.match(agentsDoc, /AIOS NATIVE BEGIN/);
  assert.match(agentsDoc, /Codex native block/);
  assert.match(await readFile(path.join(targetRootDir, '.codex', 'skills', 'find-skills', 'SKILL.md'), 'utf8'), /native skill/);
  assert.match(await readFile(path.join(targetRootDir, '.codex', 'agents', 'rex-planner.toml'), 'utf8'), /developer_instructions = "/);
  assert.equal(readNativeSyncMetadata(path.join(targetRootDir, '.codex')).client, 'codex');
  await assert.rejects(() => readFile(path.join(rootDir, 'AGENTS.md'), 'utf8'));
});

test('native sync can install all client project outputs outside the AIOS source root', async () => {
  const rootDir = await makeTemp('aios-native-sync-source-all-root-');
  const targetRootDir = await makeTemp('aios-native-sync-target-all-root-');
  await seedNativeRoot(rootDir);

  const result = await syncNativeEnhancements({ rootDir, targetRootDir, client: 'all' });
  assert.equal(result.ok, true);

  assert.match(await readFile(path.join(targetRootDir, 'AGENTS.md'), 'utf8'), /Codex native block/);
  assert.match(await readFile(path.join(targetRootDir, 'AGENTS.md'), 'utf8'), /Opencode compatibility/);
  assert.match(await readFile(path.join(targetRootDir, 'CLAUDE.md'), 'utf8'), /Claude native block/);
  assert.match(await readFile(path.join(targetRootDir, 'GEMINI.md'), 'utf8'), /Gemini compatibility/);
  assert.match(await readFile(path.join(targetRootDir, '.claude', 'skills', 'find-skills', 'SKILL.md'), 'utf8'), /native skill/);
  assert.match(await readFile(path.join(targetRootDir, '.gemini', 'skills', 'find-skills', 'SKILL.md'), 'utf8'), /native skill/);
  assert.match(await readFile(path.join(targetRootDir, '.opencode', 'skills', 'find-skills', 'SKILL.md'), 'utf8'), /native skill/);
  assert.match(await readFile(path.join(targetRootDir, '.opencode', 'agent', 'aios-build.md'), 'utf8'), /^mode: primary$/m);
  assert.equal(JSON.parse(await readFile(path.join(targetRootDir, 'opencode.json'), 'utf8')).default_agent, 'aios-build');
  assert.match(await readFile(path.join(targetRootDir, '.claude', 'agents', 'rex-planner.md'), 'utf8'), /AIOS-GENERATED/);
  assert.match(await readFile(path.join(targetRootDir, '.codex', 'agents', 'rex-planner.toml'), 'utf8'), /developer_instructions = "/);
  assert.equal(readNativeSyncMetadata(path.join(targetRootDir, '.opencode')).client, 'opencode');
  await assert.rejects(() => readFile(path.join(rootDir, 'AGENTS.md'), 'utf8'));
});

test('native sync can install opencode standalone instructions outside the AIOS source root', async () => {
  const rootDir = await makeTemp('aios-native-sync-source-opencode-root-');
  const targetRootDir = await makeTemp('aios-native-sync-target-opencode-root-');
  await seedNativeRoot(rootDir);

  const result = await syncNativeEnhancements({ rootDir, targetRootDir, client: 'opencode' });
  assert.equal(result.ok, true);

  const agentsDoc = await readFile(path.join(targetRootDir, 'AGENTS.md'), 'utf8');
  assert.match(agentsDoc, /AIOS NATIVE BEGIN/);
  assert.match(agentsDoc, /Opencode compatibility/);
  assert.doesNotMatch(agentsDoc, /Codex native block/);
  assert.match(await readFile(path.join(targetRootDir, '.opencode', 'skills', 'find-skills', 'SKILL.md'), 'utf8'), /native skill/);
  assert.match(await readFile(path.join(targetRootDir, '.opencode', 'agent', 'aios-build.md'), 'utf8'), /^mode: primary$/m);
  assert.equal(JSON.parse(await readFile(path.join(targetRootDir, 'opencode.json'), 'utf8')).skills.paths[0], '.opencode/skills');
  assert.equal(readNativeSyncMetadata(path.join(targetRootDir, '.opencode')).client, 'opencode');
  await assert.rejects(() => readFile(path.join(rootDir, 'AGENTS.md'), 'utf8'));
});

test('native sync upserts markdown block into existing GEMINI.md', async () => {
  const rootDir = await makeTemp('aios-native-sync-gemini-block-root-');
  await seedNativeRoot(rootDir);
  await writeFile(path.join(rootDir, 'GEMINI.md'), 'User preface.\n', 'utf8');

  const result = await syncNativeEnhancements({ rootDir, client: 'gemini' });
  assert.equal(result.ok, true);

  const repaired = await readFile(path.join(rootDir, 'GEMINI.md'), 'utf8');
  assert.match(repaired, /User preface/);
  assert.match(repaired, /AIOS NATIVE BEGIN/);
  assert.match(repaired, /Gemini compatibility/);
});

test('native sync repair mode can recover invalid claude settings.local.json', async () => {
  const rootDir = await makeTemp('aios-native-sync-repair-json-root-');
  await seedNativeRoot(rootDir);
  await mkdir(path.join(rootDir, '.claude'), { recursive: true });
  await writeFile(path.join(rootDir, '.claude', 'settings.local.json'), '{invalid-json', 'utf8');

  await assert.rejects(
    syncNativeEnhancements({ rootDir, client: 'claude' }),
    /invalid json/
  );

  await syncNativeEnhancements({
    rootDir,
    client: 'claude',
    repair: { force: true },
  });

  const repaired = JSON.parse(await readFile(path.join(rootDir, '.claude', 'settings.local.json'), 'utf8'));
  assert.equal(typeof repaired.aiosNative, 'object');
  assert.equal(Array.isArray(repaired.aiosNative.hooks.SessionStart), true);
});

test('native sync rolls back managed writes when a later target write fails', async () => {
  const rootDir = await makeTemp('aios-native-sync-rollback-root-');
  await seedNativeRoot(rootDir);
  await writeFile(path.join(rootDir, 'AGENTS.md'), 'Keep me.\n', 'utf8');

  await assert.rejects(
    syncNativeEnhancements({
      rootDir,
      client: 'codex',
      fsOps: {
        async writeTextTarget(targetPath, content) {
          if (targetPath === path.join(rootDir, 'AGENTS.md')) {
            await writeFile(targetPath, content, 'utf8');
            return;
          }
          throw new Error('boom');
        },
      },
    }),
    /boom/
  );

  assert.equal(await readFile(path.join(rootDir, 'AGENTS.md'), 'utf8'), 'Keep me.\n');
});
