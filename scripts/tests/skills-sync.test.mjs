import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectUnexpectedSkillRootFindings } from '../lib/platform/fs.mjs';
import { readGeneratedSkillMetadata } from '../lib/skills/install-metadata.mjs';
import { checkGeneratedSkillsSync, syncGeneratedSkills } from '../lib/skills/sync.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function writeSkill(rootDir, relativeSkillPath, body = '# sample\n') {
  const skillDir = path.join(rootDir, 'skill-sources', relativeSkillPath);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), body, 'utf8');
}

test('syncGeneratedSkills writes managed repo-local skill trees with metadata', async () => {
  const rootDir = await makeTemp('aios-skills-sync-root-');
  await writeSkill(rootDir, 'find-skills');
  await writeJson(path.join(rootDir, 'config', 'skills-sync-manifest.json'), {
    schemaVersion: 1,
    generatedRoots: {
      codex: '.codex/skills',
      agents: '.agents/skills',
    },
    skills: [
      {
        relativeSkillPath: 'find-skills',
        installCatalogName: 'find-skills',
        repoTargets: ['codex', 'agents'],
      },
    ],
    legacyUnmanaged: [],
  });

  const result = await syncGeneratedSkills({ rootDir });
  assert.equal(result.ok, true);
  assert.match(await readFile(path.join(rootDir, '.codex', 'skills', 'find-skills', 'SKILL.md'), 'utf8'), /sample/);
  assert.match(await readFile(path.join(rootDir, '.agents', 'skills', 'find-skills', 'SKILL.md'), 'utf8'), /sample/);
  assert.deepEqual(readGeneratedSkillMetadata(path.join(rootDir, '.codex', 'skills', 'find-skills')), {
    schemaVersion: 1,
    managedBy: 'aios',
    kind: 'generated-skill',
    relativeSkillPath: 'find-skills',
    targetSurface: 'codex',
    targetRelativePath: 'find-skills',
    source: 'skill-sources/find-skills',
  });
});

test('syncGeneratedSkills skips unmanaged blockers and reports them', async () => {
  const rootDir = await makeTemp('aios-skills-sync-blocker-root-');
  await writeSkill(rootDir, 'find-skills');
  await writeJson(path.join(rootDir, 'config', 'skills-sync-manifest.json'), {
    schemaVersion: 1,
    generatedRoots: {
      codex: '.codex/skills',
    },
    skills: [
      {
        relativeSkillPath: 'find-skills',
        installCatalogName: 'find-skills',
        repoTargets: ['codex'],
      },
    ],
    legacyUnmanaged: [],
  });
  await mkdir(path.join(rootDir, '.codex', 'skills', 'find-skills'), { recursive: true });
  await writeFile(path.join(rootDir, '.codex', 'skills', 'find-skills', 'SKILL.md'), 'manual\n', 'utf8');

  const logs = [];
  const result = await syncGeneratedSkills({ rootDir, io: { log: (line) => logs.push(String(line)) } });
  assert.equal(result.results[0].skipped, 1);
  assert.match(logs.join('\n'), /skip unmanaged blocker/);
  assert.equal(await readFile(path.join(rootDir, '.codex', 'skills', 'find-skills', 'SKILL.md'), 'utf8'), 'manual\n');
});

test('syncGeneratedSkills can replace configured legacy targets', async () => {
  const rootDir = await makeTemp('aios-skills-sync-replace-root-');
  await writeSkill(rootDir, '.system/skill-creator', '# canonical\n');
  await writeJson(path.join(rootDir, 'config', 'skills-sync-manifest.json'), {
    schemaVersion: 1,
    generatedRoots: {
      claude: '.claude/skills',
    },
    skills: [
      {
        relativeSkillPath: '.system/skill-creator',
        installCatalogName: null,
        repoTargets: ['claude'],
        targetRelativePathBySurface: {
          claude: 'skill-creator',
        },
      },
    ],
    legacyUnmanaged: [],
    legacyReplaceable: ['.claude/skills/skill-creator'],
  });
  await mkdir(path.join(rootDir, '.claude', 'skills', 'skill-creator'), { recursive: true });
  await writeFile(path.join(rootDir, '.claude', 'skills', 'skill-creator', 'SKILL.md'), 'legacy\n', 'utf8');

  const logs = [];
  const result = await syncGeneratedSkills({ rootDir, io: { log: (line) => logs.push(String(line)) } });
  assert.equal(result.results[0].updated, 1);
  assert.match(logs.join('\n'), /replaced legacy target/);
  assert.match(await readFile(path.join(rootDir, '.claude', 'skills', 'skill-creator', 'SKILL.md'), 'utf8'), /canonical/);
  assert.equal(readGeneratedSkillMetadata(path.join(rootDir, '.claude', 'skills', 'skill-creator')).targetSurface, 'claude');
});

test('checkGeneratedSkillsSync reports stale generated outputs', async () => {
  const rootDir = await makeTemp('aios-skills-sync-check-root-');
  await writeSkill(rootDir, 'find-skills');
  await writeJson(path.join(rootDir, 'config', 'skills-sync-manifest.json'), {
    schemaVersion: 1,
    generatedRoots: {
      codex: '.codex/skills',
    },
    skills: [
      {
        relativeSkillPath: 'find-skills',
        installCatalogName: 'find-skills',
        repoTargets: ['codex'],
      },
    ],
    legacyUnmanaged: [],
  });

  await syncGeneratedSkills({ rootDir });
  await writeFile(path.join(rootDir, '.codex', 'skills', 'find-skills', 'SKILL.md'), 'drifted\n', 'utf8');
  const result = await checkGeneratedSkillsSync({ rootDir, io: { log() {} } });
  assert.equal(result.ok, false);
  assert.match(result.issues.join('\n'), /\[drift\]/);
});

test('syncGeneratedSkills can materialize generated roots into a separate target root', async () => {
  const rootDir = await makeTemp('aios-skills-sync-source-root-');
  const targetRootDir = await makeTemp('aios-skills-sync-target-root-');
  await writeSkill(rootDir, 'find-skills');
  await writeJson(path.join(rootDir, 'config', 'skills-sync-manifest.json'), {
    schemaVersion: 1,
    generatedRoots: {
      codex: '.codex/skills',
    },
    skills: [
      {
        relativeSkillPath: 'find-skills',
        installCatalogName: 'find-skills',
        repoTargets: ['codex'],
      },
    ],
    legacyUnmanaged: [],
  });

  const result = await syncGeneratedSkills({ rootDir, targetRootDir });
  assert.equal(result.ok, true);
  assert.match(await readFile(path.join(targetRootDir, '.codex', 'skills', 'find-skills', 'SKILL.md'), 'utf8'), /sample/);
  await assert.rejects(() => readFile(path.join(rootDir, '.codex', 'skills', 'find-skills', 'SKILL.md'), 'utf8'));

  const check = await checkGeneratedSkillsSync({ rootDir, targetRootDir, io: { log() {} } });
  assert.equal(check.ok, true);
});

test('collectUnexpectedSkillRootFindings does not warn on skill-sources', async () => {
  const rootDir = await makeTemp('aios-skills-sources-root-');
  await writeSkill(rootDir, 'find-skills');
  const findings = collectUnexpectedSkillRootFindings(rootDir);
  assert.equal(findings.length, 0);
});
