import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseArgs } from '../lib/cli/parse-args.mjs';
import { syncNativeEnhancements } from '../lib/native/sync.mjs';
import { runClientsCommand } from '../lib/lifecycle/clients.mjs';
import { evaluateSkillComplianceDryRun } from '../lib/skills/compliance.mjs';
import { buildSkillHealthReport, recordSkillObservation } from '../lib/skills/health.mjs';
import { recordSessionChangedFile, readSessionChangedFiles } from '../lib/session/changed-files.mjs';

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
    markers: { markdownBegin: '<!-- AIOS NATIVE BEGIN -->', markdownEnd: '<!-- AIOS NATIVE END -->' },
    clients: {
      codex: { tier: 'deep', metadataRoot: '.codex', outputs: ['AGENTS.md', '.codex/agents', '.codex/skills'] },
      claude: { tier: 'deep', metadataRoot: '.claude', outputs: ['CLAUDE.md', '.claude/settings.local.json', '.claude/agents', '.claude/skills'] },
      gemini: { tier: 'compatibility', metadataRoot: '.gemini', outputs: ['GEMINI.md', '.gemini/skills'] },
      opencode: {
        tier: 'compatibility',
        metadataRoot: '.opencode',
        outputs: ['AGENTS.md', '.opencode/agent/aios-build.md', '.opencode/agents', '.opencode/skills', 'opencode.json'],
      },
      crush: { tier: 'compatibility', metadataRoot: '.crush', outputs: ['AGENTS.md', '.crush/skills'] },
      antigravity: { tier: 'compatibility', metadataRoot: '.gemini', outputs: ['GEMINI.md', '.gemini/skills'] },
    },
  });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'codex', 'project'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'claude', 'project'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'gemini', 'project'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'opencode', 'project'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'crush', 'project'), { recursive: true });
  await mkdir(path.join(rootDir, 'client-sources', 'native-base', 'antigravity', 'project'), { recursive: true });
  for (const name of ['core-instructions', 'contextdb', 'client-capabilities', 'token-discipline', 'browser-mcp', 'superpowers', 'agent-routing', 'codemap', 'team-provider', 'model-router', 'harness']) {
    await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'shared', 'partials', `${name}.md`), `${name}\n`, 'utf8');
  }
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'opencode', 'project', 'AIOS.md'), 'OpenCode AIOS instructions.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'codex', 'project', 'AGENTS.md'), 'Codex.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'claude', 'project', 'CLAUDE.md'), 'Claude.\n', 'utf8');
  await writeJson(path.join(rootDir, 'client-sources', 'native-base', 'claude', 'project', 'settings.local.json'), {});
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'gemini', 'project', 'GEMINI.md'), 'Gemini.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'crush', 'project', 'AGENTS.md'), 'Crush.\n', 'utf8');
  await writeFile(path.join(rootDir, 'client-sources', 'native-base', 'antigravity', 'project', 'GEMINI.md'), 'Antigravity.\n', 'utf8');
  await writeJson(path.join(rootDir, 'config', 'skills-sync-manifest.json'), {
    schemaVersion: 1,
    generatedRoots: { opencode: '.opencode/skills' },
    skills: [{ relativeSkillPath: 'verification-loop', installCatalogName: 'verification-loop', repoTargets: ['opencode'] }],
    legacyUnmanaged: [],
  });
  await mkdir(path.join(rootDir, 'skill-sources', 'verification-loop'), { recursive: true });
  await writeFile(path.join(rootDir, 'skill-sources', 'verification-loop', 'SKILL.md'), '---\nname: verification-loop\ndescription: verify\n---\n# Verify\n', 'utf8');
  await writeJson(path.join(rootDir, 'agent-sources', 'manifest.json'), { schemaVersion: 1, generatedTargets: ['claude', 'codex', 'opencode', 'crush'] });
  for (const [id, role, handoffTarget] of [
    ['rex-planner', 'planner', 'next-phase'],
    ['rex-implementer', 'implementer', 'next-phase'],
    ['rex-reviewer', 'reviewer', 'merge-gate'],
    ['rex-security-reviewer', 'security-reviewer', 'merge-gate'],
  ]) {
    await writeJson(path.join(rootDir, 'agent-sources', 'roles', `${id}.json`), {
      schemaVersion: 1,
      id,
      role,
      name: id,
      description: role,
      tools: ['Read'],
      model: 'sonnet',
      handoffTarget,
      systemPrompt: role,
    });
  }
}

test('native sync writes OpenCode opencode.json with explicit AIOS trigger surfaces', async () => {
  const rootDir = await makeTemp('aios-opencode-config-root-');
  await seedNativeRoot(rootDir);

  await syncNativeEnhancements({ rootDir, client: 'opencode' });

  const config = JSON.parse(await readFile(path.join(rootDir, 'opencode.json'), 'utf8'));
  assert.equal(config.default_agent, 'aios-build');
  assert.ok(config.instructions.includes('AGENTS.md'));
  assert.ok(config.instructions.includes('.opencode/agent/aios-build.md'));
  assert.deepEqual(config.skills.paths, ['.opencode/skills']);
  assert.equal(config.agent['aios-build'].mode, 'primary');
  assert.equal(config.agent['aios-build'].tools['changed-files'], true);
  assert.equal(config.command.verify.agent, 'aios-build');
  assert.equal(config.command['skill-comply'].agent, 'aios-build');
  assert.equal(config.command['skill-health'].agent, 'aios-build');

  const metadata = JSON.parse(await readFile(path.join(rootDir, '.opencode', '.aios-native-sync.json'), 'utf8'));
  assert.ok(metadata.managedTargets.includes('opencode.json'));
});

test('parseArgs accepts clients trigger-smoke and skill/session subcommands', () => {
  const trigger = parseArgs(['clients', 'trigger-smoke', '--client', 'opencode', '--json']);
  assert.equal(trigger.command, 'clients');
  assert.equal(trigger.options.subcommand, 'trigger-smoke');
  assert.equal(trigger.options.client, 'opencode');
  assert.equal(trigger.options.json, true);

  const comply = parseArgs(['skill', 'comply', 'skill-sources/search-first/SKILL.md', '--client', 'codex', '--dry-run', '--json']);
  assert.equal(comply.command, 'skill');
  assert.equal(comply.options.subcommand, 'comply');
  assert.equal(comply.options.path, 'skill-sources/search-first/SKILL.md');
  assert.equal(comply.options.client, 'codex');
  assert.equal(comply.options.dryRun, true);

  const health = parseArgs(['skill', 'health', '--dashboard']);
  assert.equal(health.options.subcommand, 'health');
  assert.equal(health.options.dashboard, true);

  const changed = parseArgs(['session', 'changed-files', '--session', 's1', '--json']);
  assert.equal(changed.command, 'session');
  assert.equal(changed.options.subcommand, 'changed-files');
  assert.equal(changed.options.session, 's1');
});

test('clients trigger-smoke verifies OpenCode opencode.json trigger surfaces without spawning a client', async () => {
  const rootDir = await makeTemp('aios-trigger-smoke-root-');
  await mkdir(path.join(rootDir, '.opencode', 'skills'), { recursive: true });
  await mkdir(path.join(rootDir, '.opencode', 'agent'), { recursive: true });
  await writeFile(path.join(rootDir, 'AGENTS.md'), '# instructions\n', 'utf8');
  await writeFile(path.join(rootDir, '.opencode', 'agent', 'aios-build.md'), '---\nname: aios-build\nmode: primary\n---\n', 'utf8');
  await writeJson(path.join(rootDir, 'opencode.json'), {
    default_agent: 'aios-build',
    instructions: ['AGENTS.md', '.opencode/agent/aios-build.md'],
    skills: { paths: ['.opencode/skills'] },
    command: { verify: { agent: 'aios-build' }, 'skill-comply': { agent: 'aios-build' }, 'skill-health': { agent: 'aios-build' } },
  });

  let output = '';
  const result = await runClientsCommand(
    { subcommand: 'trigger-smoke', client: 'opencode', json: true },
    { rootDir, stdout: { write: (chunk) => { output += String(chunk); } } }
  );

  assert.equal(result.exitCode, 0);
  const report = JSON.parse(output);
  assert.equal(report.clients[0].clientId, 'opencode');
  assert.equal(report.clients[0].status, 'pass');
  assert.equal(report.clients[0].checks.opencodeConfig.ok, true);
});

test('skill compliance dry run extracts ordered requirements and three prompt strictness scenarios', async () => {
  const rootDir = await makeTemp('aios-skill-comply-root-');
  const skillPath = path.join(rootDir, 'skill-sources', 'search-first', 'SKILL.md');
  await mkdir(path.dirname(skillPath), { recursive: true });
  await writeFile(skillPath, `---\nname: search-first\ndescription: Search before building\n---\n# Search First\n\n1. Define the need\n2. Search locally\n3. Decide Adopt/Extend/Compose/Build\n`, 'utf8');

  const report = await evaluateSkillComplianceDryRun({ rootDir, targetPath: skillPath, client: 'opencode' });

  assert.equal(report.kind, 'skill-compliance.dry-run');
  assert.equal(report.client, 'opencode');
  assert.deepEqual(report.scenarios.map((scenario) => scenario.strictness), ['supportive', 'neutral', 'competing']);
  assert.match(report.expectedSequence[0].text, /Define the need/);
  assert.ok(report.hookPromotionRecommendations.some((item) => item.reason.includes('low-compliance')));
});

test('skill health records observations and reports success rate with failure clusters', async () => {
  const rootDir = await makeTemp('aios-skill-health-root-');
  await recordSkillObservation({ rootDir, skillId: 'search-first', status: 'success', failure: '', amendmentId: 'a1', at: '2026-06-14T01:00:00.000Z' });
  await recordSkillObservation({ rootDir, skillId: 'search-first', status: 'failure', failure: 'missed local search', amendmentId: 'a2', at: '2026-06-14T02:00:00.000Z' });
  await recordSkillObservation({ rootDir, skillId: 'verification-loop', status: 'failure', failure: 'claimed before test', amendmentId: '', at: '2026-06-14T03:00:00.000Z' });

  const report = await buildSkillHealthReport({ rootDir, now: new Date('2026-06-15T00:00:00.000Z') });

  assert.equal(report.kind, 'skill-health.report');
  assert.equal(report.skills['search-first'].total, 2);
  assert.equal(report.skills['search-first'].successRate, 0.5);
  assert.equal(report.skills['search-first'].pendingAmendments.length, 2);
  assert.equal(report.failurePatterns[0].failure, 'missed local search');
});

test('session changed-files ledger records latest operation per file', async () => {
  const rootDir = await makeTemp('aios-changed-files-root-');
  await recordSessionChangedFile({ rootDir, sessionId: 's1', filePath: 'src/a.ts', changeType: 'modified', at: '2026-06-14T01:00:00.000Z' });
  await recordSessionChangedFile({ rootDir, sessionId: 's1', filePath: 'src/a.ts', changeType: 'modified', at: '2026-06-14T01:01:00.000Z' });
  await recordSessionChangedFile({ rootDir, sessionId: 's1', filePath: 'src/b.ts', changeType: 'added', at: '2026-06-14T01:02:00.000Z' });

  const report = await readSessionChangedFiles({ rootDir, sessionId: 's1' });

  assert.equal(report.kind, 'session.changed-files');
  assert.deepEqual(report.files.map((file) => file.path), ['src/a.ts', 'src/b.ts']);
  assert.equal(report.files[0].count, 2);
  assert.equal(report.files[1].changeType, 'added');
});
