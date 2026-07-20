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
