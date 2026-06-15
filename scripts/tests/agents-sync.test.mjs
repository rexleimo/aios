import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const RICH_PROMPT_MARKERS = ['When to use', 'Mission', 'Workflow', 'Hard constraints', 'Evidence', 'Output contract'];

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

async function makeRootDir() {
  return mkdtemp(path.join(os.tmpdir(), 'aios-agents-sync-'));
}

async function writeText(rootDir, relativePath, content) {
  const filePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

async function copyCanonicalSource(rootDir) {
  await cp(path.join(resolveRepoRoot(), 'agent-sources'), path.join(rootDir, 'agent-sources'), {
    recursive: true,
  });
}

async function loadCanonicalFixture(rootDir = resolveRepoRoot()) {
  const mod = await import('../lib/agents/source-tree.mjs');
  return mod.loadCanonicalAgents({ rootDir });
}

async function canonicalAgent(role) {
  const source = await loadCanonicalFixture();
  return source.agentsById[source.roleMap[role]];
}

async function renderManagedAgent(agent, name = agent.name) {
  const mod = await import('../lib/harness/orchestrator-agents.mjs');
  return mod.renderAgentMarkdown({
    ...agent,
    name,
  });
}

async function seedManagedTargets(rootDir, { extraManagedFile = null } = {}) {
  const source = await loadCanonicalFixture();
  await copyCanonicalSource(rootDir);
  await writeText(
    rootDir,
    'scripts/lib/specs/orchestrator-agents.json',
    await readFile(path.join(resolveRepoRoot(), 'scripts/lib/specs', 'orchestrator-agents.json'), 'utf8')
  );

  for (const agent of Object.values(source.agentsById)) {
    await writeText(
      rootDir,
      path.join('.claude/agents', `${agent.name}.md`),
      await renderManagedAgent(agent)
    );
    const { renderCodexAgent } = await import('../lib/agents/emitters/codex.mjs');
    const rendered = renderCodexAgent(agent);
    await writeText(rootDir, rendered.targetRelPath, rendered.content);
  }

  if (extraManagedFile) {
    const planner = await canonicalAgent('planner');
    const extraName = path.basename(extraManagedFile, '.md');
    await writeText(rootDir, extraManagedFile, await renderManagedAgent(planner, extraName));
  }
}

function extractMarkdownAgentBody(content) {
  const normalized = String(content).replace(/\r\n/g, '\n');
  const frontmatterEnd = normalized.indexOf('\n---\n', 4);
  assert.ok(frontmatterEnd >= 0, 'markdown agent must include frontmatter');
  return normalized.slice(frontmatterEnd + '\n---\n'.length);
}

function extractCodexDeveloperInstructions(content) {
  const match = String(content).match(/^developer_instructions\s*=\s*("(?:\\.|[^"\\])*")$/m);
  assert.ok(match, 'Codex agent must include developer_instructions');
  return JSON.parse(match[1]);
}

function assertRichAgentInstructions(content, label) {
  assert.ok(content.length >= 2500, `${label} should preserve the rich ECC prompt`);
  for (const marker of RICH_PROMPT_MARKERS) {
    assert.match(content, new RegExp(marker, 'i'), `${label} missing ${marker}`);
  }
  assert.match(content, /single JSON object/i, `${label} missing JSON handoff contract`);
}

test('renderClaudeAgent matches the normative template', async () => {
  const source = await canonicalAgent('planner');
  const mod = await import('../lib/agents/emitters/claude.mjs');
  const rendered = mod.renderClaudeAgent(source);
  const md = rendered.content;

  assert.equal(md.endsWith('\n'), true);
  assert.equal(rendered.targetRelPath, '.claude/agents/rex-planner.md');
  assert.match(md, /^---\nname: rex-planner\n/);
  assert.match(md, /^([\s\S]*)<!-- END AIOS-GENERATED -->\n$/);
  assertRichAgentInstructions(extractMarkdownAgentBody(md), 'Claude agent body');
});

test('renderCodexAgent matches Codex TOML role contract', async () => {
  const source = await canonicalAgent('planner');
  const mod = await import('../lib/agents/emitters/codex.mjs');
  const rendered = mod.renderCodexAgent(source);
  const md = rendered.content;

  assert.equal(md.endsWith('\n'), true);
  assert.equal(rendered.targetRelPath, '.codex/agents/rex-planner.toml');
  assert.match(md, /^# <!-- AIOS-GENERATED: orchestrator-agents v1 -->\n/);
  assert.match(md, /^name = "rex-planner"$/m);
  assert.match(md, /^description = "Planner role card for AIOS orchestrations \(scope, risks, ordering\)."$/m);
  assert.match(md, /^developer_instructions = "/m);
  assert.doesNotMatch(md, /^---$/m);
  assertRichAgentInstructions(extractCodexDeveloperInstructions(md), 'Codex developer_instructions');
});

test('all client agent emitters preserve rich ECC role cards in generated outputs', async () => {
  const source = await canonicalAgent('reviewer');
  const emitters = [
    ['claude', '../lib/agents/emitters/claude.mjs', 'renderClaudeAgent', extractMarkdownAgentBody],
    ['codex', '../lib/agents/emitters/codex.mjs', 'renderCodexAgent', extractCodexDeveloperInstructions],
    ['opencode', '../lib/agents/emitters/opencode.mjs', 'renderOpencodeAgent', extractMarkdownAgentBody],
    ['crush', '../lib/agents/emitters/crush.mjs', 'renderCrushAgent', extractMarkdownAgentBody],
  ];

  for (const [client, modulePath, exportName, extractor] of emitters) {
    const mod = await import(modulePath);
    const rendered = mod[exportName](source);
    assertRichAgentInstructions(extractor(rendered.content), `${client} generated agent`);
  }
});

test('syncCanonicalAgents aborts before write on unmanaged conflict', async () => {
  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);
  await writeText(rootDir, '.claude/agents/rex-planner.md', 'manual\n');

  const mod = await import('../lib/agents/sync.mjs');
  await assert.rejects(() => mod.syncCanonicalAgents({ rootDir, targets: ['claude'] }), /unmanaged conflict/i);
});

test('syncCanonicalAgents rolls back replacements when final export write fails', async () => {
  const rootDir = await makeRootDir();
  await seedManagedTargets(rootDir);
  await writeText(
    rootDir,
    '.claude/agents/rex-planner.md',
    (await renderManagedAgent(await canonicalAgent('planner'))).replace('Role: planner', 'Role: planner (stale)')
  );

  const mod = await import('../lib/agents/sync.mjs');
  const beforeClaude = await readFile(path.join(rootDir, '.claude/agents/rex-planner.md'), 'utf8');
  const beforeCodex = await readFile(path.join(rootDir, '.codex/agents/rex-planner.toml'), 'utf8');
  const beforeExport = await readFile(path.join(rootDir, 'scripts/lib/specs/orchestrator-agents.json'), 'utf8');

  await assert.rejects(
    () => mod.syncCanonicalAgents({
      rootDir,
      targets: ['claude', 'codex'],
      fsOps: {
        writeCompatibilityExport: async () => {
          throw new Error('final export write');
        },
      },
    }),
    /final export write/i
  );

  assert.equal(await readFile(path.join(rootDir, '.claude/agents/rex-planner.md'), 'utf8'), beforeClaude);
  assert.equal(await readFile(path.join(rootDir, '.codex/agents/rex-planner.toml'), 'utf8'), beforeCodex);
  assert.equal(await readFile(path.join(rootDir, 'scripts/lib/specs/orchestrator-agents.json'), 'utf8'), beforeExport);
});

test('syncCanonicalAgents rolls back when stale managed backup move fails', async () => {
  const rootDir = await makeRootDir();
  await seedManagedTargets(rootDir, { extraManagedFile: '.claude/agents/old-agent.md' });

  const mod = await import('../lib/agents/sync.mjs');
  const beforePlanner = await readFile(path.join(rootDir, '.claude/agents/rex-planner.md'), 'utf8');
  const beforeStale = await readFile(path.join(rootDir, '.claude/agents/old-agent.md'), 'utf8');

  await assert.rejects(
    () => mod.syncCanonicalAgents({
      rootDir,
      targets: ['claude'],
      fsOps: {
        moveStaleManagedFile: async () => {
          throw new Error('backup move failed');
        },
      },
    }),
    /backup move failed/i
  );

  assert.equal(await readFile(path.join(rootDir, '.claude/agents/rex-planner.md'), 'utf8'), beforePlanner);
  assert.equal(await readFile(path.join(rootDir, '.claude/agents/old-agent.md'), 'utf8'), beforeStale);
});

test('syncCanonicalAgents rolls back when target replacement fails during commit', async () => {
  const rootDir = await makeRootDir();
  await seedManagedTargets(rootDir);
  await writeText(
    rootDir,
    '.claude/agents/rex-planner.md',
    (await renderManagedAgent(await canonicalAgent('planner'))).replace('Role: planner', 'Role: planner (stale)')
  );

  const mod = await import('../lib/agents/sync.mjs');
  const beforePlanner = await readFile(path.join(rootDir, '.claude/agents/rex-planner.md'), 'utf8');
  const beforeExport = await readFile(path.join(rootDir, 'scripts/lib/specs/orchestrator-agents.json'), 'utf8');

  await assert.rejects(
    () => mod.syncCanonicalAgents({
      rootDir,
      targets: ['claude'],
      fsOps: {
        replaceTargetFile: async () => {
          throw new Error('replace failed');
        },
      },
    }),
    /replace failed/i
  );

  assert.equal(await readFile(path.join(rootDir, '.claude/agents/rex-planner.md'), 'utf8'), beforePlanner);
  assert.equal(await readFile(path.join(rootDir, 'scripts/lib/specs/orchestrator-agents.json'), 'utf8'), beforeExport);
});

test('syncCanonicalAgents detects collisions before any file is written', async () => {
  const mod = await import('../lib/agents/sync.mjs');

  await assert.rejects(
    () => mod.syncCanonicalAgents({
      rootDir: resolveRepoRoot(),
      targets: ['claude', 'codex'],
      emitters: {
        claude: () => ({ targetRelPath: '.claude/agents/rex-planner.md', content: 'a\n' }),
        codex: () => ({ targetRelPath: '.claude/agents/rex-planner.md', content: 'b\n' }),
      },
    }),
    /collision/i
  );
});

test('syncCanonicalAgents removes stale managed files after successful sync', async () => {
  const rootDir = await makeRootDir();
  await seedManagedTargets(rootDir, { extraManagedFile: '.claude/agents/old-agent.md' });

  const mod = await import('../lib/agents/sync.mjs');
  await mod.syncCanonicalAgents({ rootDir, targets: ['claude'] });

  await assert.rejects(() => readFile(path.join(rootDir, '.claude/agents/old-agent.md'), 'utf8'));
});

test('syncCanonicalAgents migrates stale Codex markdown agents to TOML role files', async () => {
  const rootDir = await makeRootDir();
  await seedManagedTargets(rootDir);

  const mod = await import('../lib/agents/sync.mjs');
  await mod.syncCanonicalAgents({ rootDir, targets: ['codex'] });

  const content = await readFile(path.join(rootDir, '.codex/agents/rex-planner.toml'), 'utf8');
  assert.match(content, /developer_instructions = "/);
  assertRichAgentInstructions(extractCodexDeveloperInstructions(content), 'synced Codex agent');
});

test('syncCanonicalAgents rejects malformed marker-bearing files', async () => {
  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);
  await writeText(
    rootDir,
    '.claude/agents/rex-planner.md',
    '<!-- AIOS-GENERATED: orchestrator-agents v1 -->\nmanual\n'
  );

  const mod = await import('../lib/agents/sync.mjs');
  await assert.rejects(() => mod.syncCanonicalAgents({ rootDir, targets: ['claude'] }), /malformed managed file/i);
});

test('isManagedAgentMarkdown enforces the full ownership predicate', async () => {
  const mod = await import('../lib/agents/sync.mjs');
  const valid = await renderManagedAgent(await canonicalAgent('planner'));

  assert.equal(mod.isManagedAgentMarkdown(valid, 'rex-planner'), true);
  assert.equal(mod.isManagedAgentMarkdown(valid.replace('---\n', ''), 'rex-planner'), false);
  assert.equal(mod.isManagedAgentMarkdown(valid.replace('<!-- END AIOS-GENERATED -->\n', ''), 'rex-planner'), false);
  assert.equal(mod.isManagedAgentMarkdown(valid.replace('Role: planner', 'Role: reviewer'), 'rex-planner'), true);
  assert.equal(mod.isManagedAgentMarkdown(valid, 'rex-reviewer'), false);
});
