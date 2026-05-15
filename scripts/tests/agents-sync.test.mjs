import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
    'memory/specs/orchestrator-agents.json',
    await readFile(path.join(resolveRepoRoot(), 'memory/specs', 'orchestrator-agents.json'), 'utf8')
  );

  for (const targetRoot of ['.claude/agents', '.codex/agents']) {
    for (const agent of Object.values(source.agentsById)) {
      await writeText(
        rootDir,
        path.join(targetRoot, `${agent.name}.md`),
        await renderManagedAgent(agent)
      );
    }
  }

  if (extraManagedFile) {
    const planner = await canonicalAgent('planner');
    const extraName = path.basename(extraManagedFile, '.md');
    await writeText(rootDir, extraManagedFile, await renderManagedAgent(planner, extraName));
  }
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
});

test('renderCodexAgent matches the same deterministic template contract', async () => {
  const source = await canonicalAgent('planner');
  const mod = await import('../lib/agents/emitters/codex.mjs');
  const rendered = mod.renderCodexAgent(source);
  const md = rendered.content;

  assert.equal(md.endsWith('\n'), true);
  assert.equal(rendered.targetRelPath, '.codex/agents/rex-planner.md');
  assert.match(md, /^---\nname: rex-planner\n/);
});

test('renderKiroAgent emits deterministic Kiro custom agent JSON', async () => {
  const source = await canonicalAgent('planner');
  const mod = await import('../lib/agents/emitters/kiro.mjs');
  const rendered = mod.renderKiroAgent(source);
  const config = JSON.parse(rendered.content);

  assert.equal(rendered.targetRelPath, '.kiro/agents/rex-planner.json');
  assert.equal(rendered.content.endsWith('\n'), true);
  assert.equal(config.name, 'rex-planner');
  assert.equal(config.description, source.description);
  assert.match(config.prompt, /<!-- AIOS-GENERATED: orchestrator-agents v1 -->/);
  assert.match(config.prompt, /Role: planner/);
  assert.deepEqual(config.resources, [
    'file://.kiro/steering/**/*.md',
    'skill://.kiro/skills/**/SKILL.md',
    'skill://~/.kiro/skills/**/SKILL.md',
  ]);
  assert.equal(config.includeMcpJson, true);
  assert.deepEqual(config.tools, ['read', 'grep', 'glob']);
  assert.deepEqual(config.allowedTools, ['read', 'grep', 'glob']);
});

test('resolveAgentTargets supports kiro and includes it in all', async () => {
  const mod = await import('../lib/agents/sync.mjs');

  assert.deepEqual(mod.resolveAgentTargets('kiro'), ['kiro']);
  assert.deepEqual(mod.resolveAgentTargets('all'), ['claude', 'codex', 'kiro']);
});

test('syncCanonicalAgents defaults to all canonical targets including Kiro', async () => {
  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);

  const mod = await import('../lib/agents/sync.mjs');
  const result = await mod.syncCanonicalAgents({
    rootDir,
    writeCompatibilityExport: false,
    io: { log() {} },
  });

  assert.deepEqual(result.targets, ['claude', 'codex', 'kiro']);
  assert.equal(result.results.length, 3);
  assert.equal(result.results.find((item) => item.target === 'kiro')?.installed, 4);
  const agentJson = JSON.parse(await readFile(path.join(rootDir, '.kiro/agents/rex-planner.json'), 'utf8'));
  assert.equal(agentJson.name, 'rex-planner');
});

test('syncCanonicalAgents installs managed Kiro agent JSON files', async () => {
  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);

  const mod = await import('../lib/agents/sync.mjs');
  const result = await mod.syncCanonicalAgents({
    rootDir,
    targets: ['kiro'],
    writeCompatibilityExport: false,
    io: { log() {} },
  });

  const agentJson = JSON.parse(await readFile(path.join(rootDir, '.kiro/agents/rex-planner.json'), 'utf8'));
  assert.equal(result.results[0].targetRel, '.kiro/agents');
  assert.equal(result.results[0].installed, 4);
  assert.equal(agentJson.name, 'rex-planner');
  assert.match(agentJson.prompt, /<!-- END AIOS-GENERATED -->/);
});

test('syncCanonicalAgents rejects unmanaged Kiro JSON conflicts', async () => {
  const rootDir = await makeRootDir();
  await copyCanonicalSource(rootDir);
  await writeText(rootDir, '.kiro/agents/rex-planner.json', '{"name":"rex-planner"}\n');

  const mod = await import('../lib/agents/sync.mjs');
  await assert.rejects(
    () => mod.syncCanonicalAgents({
      rootDir,
      targets: ['kiro'],
      writeCompatibilityExport: false,
    }),
    /unmanaged conflict/i
  );
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
  const beforeCodex = await readFile(path.join(rootDir, '.codex/agents/rex-planner.md'), 'utf8');
  const beforeExport = await readFile(path.join(rootDir, 'memory/specs/orchestrator-agents.json'), 'utf8');

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
  assert.equal(await readFile(path.join(rootDir, '.codex/agents/rex-planner.md'), 'utf8'), beforeCodex);
  assert.equal(await readFile(path.join(rootDir, 'memory/specs/orchestrator-agents.json'), 'utf8'), beforeExport);
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
  const beforeExport = await readFile(path.join(rootDir, 'memory/specs/orchestrator-agents.json'), 'utf8');

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
  assert.equal(await readFile(path.join(rootDir, 'memory/specs/orchestrator-agents.json'), 'utf8'), beforeExport);
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
