import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

function resolveRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

let canonicalRoleCache = null;

async function loadCanonicalRoleFixtures() {
  if (!canonicalRoleCache) {
    const sourceTree = await import('../lib/agents/source-tree.mjs');
    const source = await sourceTree.loadCanonicalAgents({ rootDir: resolveRepoRoot() });
    canonicalRoleCache = {
      planner: source.agentsById['rex-planner'],
      implementer: source.agentsById['rex-implementer'],
      reviewer: source.agentsById['rex-reviewer'],
      'security-reviewer': source.agentsById['rex-security-reviewer'],
    };
  }
  return canonicalRoleCache;
}

async function makeRootDir() {
  return mkdtemp(path.join(os.tmpdir(), 'aios-agents-source-tree-'));
}

async function writeJson(rootDir, relativePath, value) {
  const filePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function renderScalar(value) {
  return String(value ?? '');
}

function renderInlineArray(values = []) {
  return `[${values.map((value) => JSON.stringify(String(value))).join(', ')}]`;
}

function renderCanonicalRoleMarkdown(agent, overrides = {}) {
  const source = {
    ...agent,
    ...overrides,
  };
  const frontmatter = [
    '---',
    `schemaVersion: ${source.schemaVersion}`,
    `id: ${renderScalar(source.id)}`,
    `role: ${renderScalar(source.role)}`,
    `name: ${renderScalar(source.name)}`,
    `description: ${renderScalar(source.description)}`,
    `tools: ${renderInlineArray(source.tools)}`,
    `model: ${renderScalar(source.model)}`,
    `recommendedModel: ${renderScalar(source.recommendedModel)}`,
    `fallbackModel: ${renderScalar(source.fallbackModel)}`,
    `tokenProfile: ${renderScalar(source.tokenProfile)}`,
    `activationHints: ${renderInlineArray(source.activationHints)}`,
    `workflowSteps: ${renderInlineArray(source.workflowSteps)}`,
    `promptDefense: ${renderScalar(source.promptDefense)}`,
    `outputContract: ${renderScalar(source.outputContract)}`,
    `handoffTarget: ${renderScalar(source.handoffTarget)}`,
    '---',
    '',
    renderScalar(source.systemPrompt),
  ];
  return `${frontmatter.join('\n').trimEnd()}\n`;
}

async function writeRoleMarkdown(rootDir, relativePath, agent, overrides = {}) {
  const filePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, renderCanonicalRoleMarkdown(agent, overrides), 'utf8');
}

function buildManifest() {
  return {
    schemaVersion: 1,
    generatedTargets: ['claude', 'codex', 'opencode', 'grok'],
  };
}

async function writeCanonicalFixture(rootDir, options = {}, format = 'markdown') {
  const base = await loadCanonicalRoleFixtures();
  await writeJson(rootDir, 'agent-sources/manifest.json', buildManifest());
  const writeRole = async (agent, overrides = {}) => {
    const extension = format === 'json' ? 'json' : 'md';
    const relativePath = `agent-sources/roles/${agent.id}.${extension}`;
    if (format === 'markdown') {
      await writeRoleMarkdown(rootDir, relativePath, agent, overrides);
      return;
    }
    if (format === 'json') {
      await writeJson(rootDir, relativePath, {
        ...agent,
        ...overrides,
      });
      return;
    }
    throw new Error(`unsupported fixture format: ${format}`);
  };

  await writeRole(base.planner, options.plannerOverride);
  await writeRole(base.implementer, options.implementerOverride);
  await writeRole(base.reviewer, options.reviewerOverride);
  await writeRole(base['security-reviewer'], options.securityReviewerOverride);

  if (options.extraRoleFile) {
    await writeFile(path.join(rootDir, 'agent-sources', options.extraRoleFile), 'note\n', 'utf8');
  }

  if (options.extraRootDir) {
    await mkdir(path.join(rootDir, 'agent-sources', options.extraRootDir), { recursive: true });
  }
}

async function makeFixtureWithDuplicateId() {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir, {
    reviewerOverride: { id: 'rex-planner' },
  });
  return rootDir;
}

async function makeFixtureWithDuplicateRole() {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir, {
    reviewerOverride: { role: 'planner' },
  });
  return rootDir;
}

async function makeFixtureMissingRole(roleId) {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir);
  const roleFile = path.join(rootDir, 'agent-sources', 'roles', `rex-${roleId}.md`);
  await rm(roleFile);
  return rootDir;
}

async function makeFixtureWithFilenameMismatch() {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir, {
    plannerOverride: { id: 'wrong-id' },
  });
  return rootDir;
}

async function makeFixtureWithMultilineDescription() {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir, {
    plannerOverride: { description: 'line 1\nline 2' },
  }, 'json');
  return rootDir;
}

async function makeFixtureWithManagedMarker() {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir, {
    plannerOverride: { systemPrompt: '<!-- AIOS-GENERATED: orchestrator-agents v1 -->' },
  });
  return rootDir;
}

async function makeFixtureWithUppercaseId() {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir, {
    plannerOverride: { id: 'Rex-Planner' },
  });
  return rootDir;
}

async function makeFixtureWithUppercaseRole() {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir, {
    plannerOverride: { role: 'Planner' },
  });
  return rootDir;
}

async function makeFixtureWithNonStringTool() {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir, {
    plannerOverride: { tools: ['Read', 42] },
  }, 'json');
  return rootDir;
}

test('loadCanonicalAgents validates manifest and returns four role-bound agents', async () => {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir);

  const mod = await import('../lib/agents/source-tree.mjs');
  const result = await mod.loadCanonicalAgents({ rootDir });

  assert.equal(result.manifest.schemaVersion, 1);
  assert.deepEqual(Object.keys(result.agentsById), [
    'rex-implementer',
    'rex-planner',
    'rex-reviewer',
    'rex-security-reviewer',
  ]);
  assert.equal(result.roleMap.planner, 'rex-planner');
});

test('loadCanonicalAgents reads ECC-style markdown frontmatter role sources', async () => {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir);

  const mod = await import('../lib/agents/source-tree.mjs');
  const result = await mod.loadCanonicalAgents({ rootDir });

  assert.equal(result.agentsById['rex-planner'].id, 'rex-planner');
  assert.equal(result.agentsById['rex-planner'].role, 'planner');
  assert.match(result.agentsById['rex-planner'].systemPrompt, /^# /);
  assert.match(result.agentsById['rex-planner'].systemPrompt, /Output contract/i);
  assert.equal(result.roleMap.securityReviewer, undefined);
  assert.equal(result.roleMap['security-reviewer'], 'rex-security-reviewer');
});

test('repository canonical role authoring files are markdown, not JSON', async () => {
  const roleEntries = await readdir(path.join(resolveRepoRoot(), 'agent-sources', 'roles'));

  assert.ok(roleEntries.some((entry) => entry.endsWith('.md')), 'agent-sources/roles should contain markdown role cards');
  assert.deepEqual(
    roleEntries.filter((entry) => entry.endsWith('.json')),
    [],
    'agent-sources/roles JSON files are compatibility data, not maintainable authoring sources'
  );
});

test('loadCanonicalAgents preserves legacy JSON role source compatibility', async () => {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir, {}, 'json');

  const mod = await import('../lib/agents/source-tree.mjs');
  const result = await mod.loadCanonicalAgents({ rootDir, allowLegacyJsonRoles: true });

  assert.equal(result.agentsById['rex-reviewer'].role, 'reviewer');
});

test('loadCanonicalAgents rejects legacy JSON role sources by default', async () => {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir, {}, 'json');

  const mod = await import('../lib/agents/source-tree.mjs');
  await assert.rejects(
    () => mod.loadCanonicalAgents({ rootDir }),
    /legacy JSON role sources require allowLegacyJsonRoles/i
  );
});

test('loadCanonicalAgents rejects duplicate markdown and JSON source for one role card', async () => {
  const rootDir = await makeRootDir();
  const base = await loadCanonicalRoleFixtures();
  await writeCanonicalFixture(rootDir, {}, 'json');
  await writeRoleMarkdown(rootDir, 'agent-sources/roles/rex-planner.md', base.planner);

  const mod = await import('../lib/agents/source-tree.mjs');
  await assert.rejects(
    () => mod.loadCanonicalAgents({ rootDir, allowLegacyJsonRoles: true }),
    /duplicate source/i
  );
});

test('loadCanonicalAgents allows multiline systemPrompt content', async () => {
  const rootDir = await makeRootDir();
  const canonicalPlanner = (await loadCanonicalRoleFixtures()).planner;
  await writeCanonicalFixture(rootDir, {
    plannerOverride: {
      systemPrompt: `${canonicalPlanner.systemPrompt}\n\nAdditional handoff line one.\nAdditional handoff line two.`,
    },
  });

  const mod = await import('../lib/agents/source-tree.mjs');
  const result = await mod.loadCanonicalAgents({ rootDir });

  assert.match(result.agentsById['rex-planner'].systemPrompt, /Additional handoff line two/);
});

test('loadCanonicalAgents rejects unknown keys and unexpected files', async () => {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir, {
    extraRoleFile: 'roles/notes.txt',
    extraRootDir: 'drafts',
    plannerOverride: { extra: true },
  });

  const mod = await import('../lib/agents/source-tree.mjs');
  await assert.rejects(
    () => mod.loadCanonicalAgents({ rootDir }),
    /unknown key|unexpected file/i
  );
});

test('loadCanonicalAgents rejects duplicate ids, duplicate roles, missing required roles, filename mismatch, multiline scalar fields, and managed-marker injection', async () => {
  const mod = await import('../lib/agents/source-tree.mjs');

  await assert.rejects(async () => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithDuplicateId() }), /duplicate id/i);
  await assert.rejects(async () => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithDuplicateRole() }), /duplicate role/i);
  await assert.rejects(async () => mod.loadCanonicalAgents({ rootDir: await makeFixtureMissingRole('reviewer') }), /missing required role/i);
  await assert.rejects(async () => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithFilenameMismatch() }), /filename/i);
  await assert.rejects(async () => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithMultilineDescription(), allowLegacyJsonRoles: true }), /single-line/i);
  await assert.rejects(async () => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithManagedMarker() }), /managed marker/i);
});

test('loadCanonicalAgents rejects uppercase ids, uppercase roles, and non-string tool items', async () => {
  const mod = await import('../lib/agents/source-tree.mjs');

  await assert.rejects(async () => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithUppercaseId() }), /kebab-case/i);
  await assert.rejects(async () => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithUppercaseRole() }), /role must be one of/i);
  await assert.rejects(async () => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithNonStringTool(), allowLegacyJsonRoles: true }), /array of strings/i);
});
