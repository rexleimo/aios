import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function makeRootDir() {
  return mkdtemp(path.join(os.tmpdir(), 'aios-agents-source-tree-'));
}

async function writeJson(rootDir, relativePath, value) {
  const filePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function buildManifest() {
  return {
    schemaVersion: 1,
    generatedTargets: ['claude', 'codex', 'opencode', 'crush'],
  };
}

function buildRole(role) {
  const base = {
    planner: {
      schemaVersion: 1,
      id: 'rex-planner',
      role: 'planner',
      name: 'rex-planner',
      description: 'Planner role card for AIOS orchestrations (scope, risks, ordering).',
      tools: ['Read', 'Grep', 'Glob'],
      model: 'sonnet',
      handoffTarget: 'next-phase',
      systemPrompt: 'You are the Planner. Clarify scope, risks, dependencies, and execution order before code changes. Produce a concrete plan that an implementer can follow.',
    },
    implementer: {
      schemaVersion: 1,
      id: 'rex-implementer',
      role: 'implementer',
      name: 'rex-implementer',
      description: 'Implementer role card for AIOS orchestrations (code changes + verification).',
      tools: ['Read', 'Grep', 'Glob', 'Bash', 'Edit'],
      model: 'sonnet',
      handoffTarget: 'next-phase',
      systemPrompt: 'You are the Implementer. Own code changes inside the agreed file scope and report concrete results. Prefer minimal diffs and include verification evidence.',
    },
    reviewer: {
      schemaVersion: 1,
      id: 'rex-reviewer',
      role: 'reviewer',
      name: 'rex-reviewer',
      description: 'Reviewer role card for AIOS orchestrations (correctness, regressions, tests).',
      tools: ['Read', 'Grep', 'Glob'],
      model: 'sonnet',
      handoffTarget: 'merge-gate',
      systemPrompt: 'You are the Reviewer. Review correctness, regressions, maintainability, and test coverage. Do not modify code; report findings and recommendations.',
    },
    'security-reviewer': {
      schemaVersion: 1,
      id: 'rex-security-reviewer',
      role: 'security-reviewer',
      name: 'rex-security-reviewer',
      description: 'Security reviewer role card for AIOS orchestrations (auth, secrets, unsafe automation).',
      tools: ['Read', 'Grep', 'Glob'],
      model: 'sonnet',
      handoffTarget: 'merge-gate',
      systemPrompt: 'You are the Security Reviewer. Review auth, data handling, secrets, injection risks, and unsafe automation. Do not modify code; report security findings and mitigations.',
    },
  };

  return structuredClone(base[role]);
}

async function writeCanonicalFixture(rootDir, options = {}) {
  await writeJson(rootDir, 'agent-sources/manifest.json', buildManifest());
  await writeJson(rootDir, 'agent-sources/roles/rex-planner.json', {
    ...buildRole('planner'),
    ...(options.plannerOverride || {}),
  });
  await writeJson(rootDir, 'agent-sources/roles/rex-implementer.json', {
    ...buildRole('implementer'),
    ...(options.implementerOverride || {}),
  });
  await writeJson(rootDir, 'agent-sources/roles/rex-reviewer.json', {
    ...buildRole('reviewer'),
    ...(options.reviewerOverride || {}),
  });
  await writeJson(rootDir, 'agent-sources/roles/rex-security-reviewer.json', {
    ...buildRole('security-reviewer'),
    ...(options.securityReviewerOverride || {}),
  });

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
  const roleFile = path.join(rootDir, 'agent-sources', 'roles', `rex-${roleId}.json`);
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
  });
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
  });
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

test('loadCanonicalAgents allows multiline systemPrompt content', async () => {
  const rootDir = await makeRootDir();
  await writeCanonicalFixture(rootDir, {
    plannerOverride: {
      systemPrompt: 'line 1\nline 2\nline 3',
    },
  });

  const mod = await import('../lib/agents/source-tree.mjs');
  const result = await mod.loadCanonicalAgents({ rootDir });

  assert.match(result.agentsById['rex-planner'].systemPrompt, /line 2/);
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
  await assert.rejects(async () => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithMultilineDescription() }), /single-line/i);
  await assert.rejects(async () => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithManagedMarker() }), /managed marker/i);
});

test('loadCanonicalAgents rejects uppercase ids, uppercase roles, and non-string tool items', async () => {
  const mod = await import('../lib/agents/source-tree.mjs');

  await assert.rejects(async () => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithUppercaseId() }), /kebab-case/i);
  await assert.rejects(async () => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithUppercaseRole() }), /role must be one of/i);
  await assert.rejects(async () => mod.loadCanonicalAgents({ rootDir: await makeFixtureWithNonStringTool() }), /array of strings/i);
});
