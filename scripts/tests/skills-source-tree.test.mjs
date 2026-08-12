import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  listCanonicalSkills,
  loadSkillsSyncManifest,
  materializeSkillTree,
  resolveGeneratedTargetPath,
} from '../lib/skills/source-tree.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

test('canonical relative path preserves namespaced skills and target overrides', async () => {
  const rootDir = await makeTemp('aios-skills-source-tree-root-');
  await writeJson(path.join(rootDir, 'config', 'skills-sync-manifest.json'), {
    schemaVersion: 1,
    generatedRoots: {
      codex: '.codex/skills',
      claude: '.claude/skills',
    },
    skills: [
      {
        relativeSkillPath: '.system/skill-creator',
        installCatalogName: null,
        repoTargets: ['codex', 'claude'],
        targetRelativePathBySurface: {
          codex: '.system/skill-creator',
          claude: 'skill-creator',
        },
      },
    ],
  });
  await mkdir(path.join(rootDir, 'skill-sources', '.system', 'skill-creator'), { recursive: true });
  await writeFile(path.join(rootDir, 'skill-sources', '.system', 'skill-creator', 'SKILL.md'), '# base\n', 'utf8');

  const manifest = loadSkillsSyncManifest(rootDir);
  const [entry] = listCanonicalSkills(rootDir, manifest);
  assert.equal(entry.relativeSkillPath, '.system/skill-creator');
  assert.equal(
    resolveGeneratedTargetPath({ rootDir, entry, surface: 'codex', manifest }),
    path.join(rootDir, '.codex', 'skills', '.system', 'skill-creator')
  );
  assert.equal(
    resolveGeneratedTargetPath({ rootDir, entry, surface: 'claude', manifest }),
    path.join(rootDir, '.claude', 'skills', 'skill-creator')
  );
});

test('materializeSkillTree copies base tree then overlays client-specific files', async () => {
  const rootDir = await makeTemp('aios-skills-materialize-root-');
  const skillDir = path.join(rootDir, 'skill-sources', 'sample-skill');
  await mkdir(path.join(skillDir, 'references'), { recursive: true });
  await mkdir(path.join(skillDir, 'clients', 'claude', 'references'), { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), '# base\n', 'utf8');
  await writeFile(path.join(skillDir, 'references', 'base.md'), 'base ref\n', 'utf8');
  await writeFile(path.join(skillDir, 'clients', 'claude', 'SKILL.md'), '# claude\n', 'utf8');
  await writeFile(path.join(skillDir, 'clients', 'claude', 'references', 'extra.md'), 'extra ref\n', 'utf8');

  const materialized = materializeSkillTree({ rootDir, relativeSkillPath: 'sample-skill', client: 'claude' });
  try {
    assert.match(await readFile(path.join(materialized.directoryPath, 'SKILL.md'), 'utf8'), /claude/);
    assert.match(await readFile(path.join(materialized.directoryPath, 'references', 'base.md'), 'utf8'), /base ref/);
    assert.match(await readFile(path.join(materialized.directoryPath, 'references', 'extra.md'), 'utf8'), /extra ref/);
  } finally {
    materialized.cleanup();
  }
});

test('materializeSkillTree strips AIOS frontmatter after applying client overlay', async () => {
  const rootDir = await makeTemp('aios-skills-overlay-frontmatter-root-');
  const skillDir = path.join(rootDir, 'skill-sources', 'sample-skill');
  await mkdir(path.join(skillDir, 'clients', 'claude'), { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), `---
name: sample-skill
description: Use when testing base frontmatter stripping
repoTargets: [codex, claude]
clients: [codex, claude]
---

# Base
`, 'utf8');
  await writeFile(path.join(skillDir, 'clients', 'claude', 'SKILL.md'), `---
name: sample-skill
description: Use when testing overlay frontmatter stripping
repoTargets: [claude]
targetRelativePathBySurface:
  claude: sample-skill
clients: [claude]
---

# Claude Overlay
`, 'utf8');

  const materialized = materializeSkillTree({ rootDir, relativeSkillPath: 'sample-skill', client: 'claude' });
  try {
    const content = await readFile(path.join(materialized.directoryPath, 'SKILL.md'), 'utf8');
    assert.match(content, /# Claude Overlay/);
    assert.match(content, /name: sample-skill/);
    assert.match(content, /description: Use when testing overlay frontmatter stripping/);
    assert.doesNotMatch(content, /repoTargets:/);
    assert.doesNotMatch(content, /targetRelativePathBySurface:/);
    assert.doesNotMatch(content, /clients:/);
  } finally {
    materialized.cleanup();
  }
});

test('materializeSkillTree excludes the clients subtree from emitted output', async () => {
  const rootDir = await makeTemp('aios-skills-no-clients-root-');
  const skillDir = path.join(rootDir, 'skill-sources', 'sample-skill');
  await mkdir(path.join(skillDir, 'clients', 'codex'), { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), '# base\n', 'utf8');
  await writeFile(path.join(skillDir, 'clients', 'codex', 'SKILL.md'), '# codex\n', 'utf8');

  const materialized = materializeSkillTree({ rootDir, relativeSkillPath: 'sample-skill', client: 'claude' });
  try {
    let missing = false;
    try {
      await readFile(path.join(materialized.directoryPath, 'clients', 'codex', 'SKILL.md'), 'utf8');
    } catch {
      missing = true;
    }
    assert.equal(missing, true);
  } finally {
    materialized.cleanup();
  }
});

test('workflow router is cataloged and generated for Grok with Rex-only guidance', async () => {
  const rootDir = path.resolve('.');
  const manifest = loadSkillsSyncManifest(rootDir);
  const router = manifest.skills.find((skill) => skill.relativeSkillPath === 'aios-workflow-router');

  assert.ok(router, 'expected the AIOS workflow router in the canonical skill catalog');
  assert.ok(router.clients.includes('grok'));
  assert.ok(router.repoTargets.includes('grok'));

  const grokRouter = resolveGeneratedTargetPath({ rootDir, entry: router, surface: 'grok', manifest });
  const content = await readFile(path.join(grokRouter, 'SKILL.md'), 'utf8');
  assert.match(content, /current rex-harness software Capability Command/u);
  assert.doesNotMatch(content, /superpowers:/u);
});

test('workflow router routes parallel dispatch to the aios work dispatch skill', async () => {
  const rootDir = path.resolve('.');
  const manifest = loadSkillsSyncManifest(rootDir);
  const router = manifest.skills.find((skill) => skill.relativeSkillPath === 'aios-workflow-router');
  const workDispatch = manifest.skills.find((skill) => skill.relativeSkillPath === 'aios-work-dispatch');

  assert.ok(router, 'expected the AIOS workflow router in the canonical skill catalog');
  assert.ok(workDispatch, 'expected the AIOS work dispatch skill in the canonical skill catalog');

  const routerSource = await readFile(path.join(rootDir, 'skill-sources', 'aios-workflow-router', 'SKILL.md'), 'utf8');
  const workDispatchSource = await readFile(path.join(rootDir, 'skill-sources', 'aios-work-dispatch', 'SKILL.md'), 'utf8');

  // Router must name the dispatch skill so agents can reach it from the disposition decision.
  for (const marker of ['aios-work-dispatch', '`aios work`', '独立可执行工作项']) {
    assert.match(routerSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  // Dispatch skill description must carry explicit trigger words so semantic matching
  // can fire it for parallel-dispatch tasks instead of routing those tasks to the router only.
  const description = workDispatchSource.match(/^description: (.+)$/m);
  assert.ok(description, 'expected a description line in aios-work-dispatch frontmatter');
  for (const trigger of ['aios work', 'parallel dispatch', 'independent work item']) {
    assert.match(description[1], new RegExp(trigger.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), trigger);
  }
});

test('aios work dispatch skill is cataloged for every client with safe agent trigger gates', async () => {
  const rootDir = path.resolve('.');
  const manifest = loadSkillsSyncManifest(rootDir);
  const workDispatch = manifest.skills.find((skill) => skill.relativeSkillPath === 'aios-work-dispatch');

  assert.ok(workDispatch, 'expected a canonical AIOS work dispatch skill');
  for (const client of ['codex', 'claude', 'gemini', 'opencode', 'hermes', 'grok']) {
    assert.ok(workDispatch.clients.includes(client), client);
    assert.ok(workDispatch.repoTargets.includes(client), client);
  }

  const content = await readFile(path.join(rootDir, 'skill-sources', 'aios-work-dispatch', 'SKILL.md'), 'utf8');
  for (const marker of [
    'Current AIOS disposition is `planned`',
    'at least two independently executable work items',
    'file ownership does not overlap',
    '`--dry-run --json`',
    'obtain explicit user approval',
    'may start real model clients, consume money, and modify files',
    'Rex workflow remains owner of staged Provider selection',
    'aios plan start',
    '--allow-write',
    'semicolon-separated',
  ]) {
    assert.match(content, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const surface of ['codex', 'claude', 'gemini', 'opencode', 'hermes', 'grok', 'agents']) {
    const target = resolveGeneratedTargetPath({ rootDir, entry: workDispatch, surface, manifest });
    const projected = await readFile(path.join(target, 'SKILL.md'), 'utf8');
    assert.match(projected, /# AIOS Work Dispatch/u, surface);
  }
});
