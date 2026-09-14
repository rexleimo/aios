import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ALL_CLIENTS } from '../lib/clients/registry.mjs';
import { analyzeCatalogEntries, resolveCatalogEntries } from '../lib/components/skills/catalog.mjs';
import { doctorContextDbSkills, removeLegacySharedRootInstalls } from '../lib/components/skills/doctor.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeCanonicalSkill(rootDir, relativeSkillPath) {
  const skillDir = path.join(rootDir, 'skill-sources', relativeSkillPath);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), `# ${relativeSkillPath}\n`, 'utf8');
}

async function writeManifest(rootDir, skills) {
  await mkdir(path.join(rootDir, 'config'), { recursive: true });
  await writeFile(path.join(rootDir, 'config', 'skills-sync-manifest.json'), JSON.stringify({
    schemaVersion: 1,
    generatedRoots: { codex: '.codex/skills' },
    skills,
    legacyUnmanaged: [],
    legacyReplaceable: [],
  }, null, 2), 'utf8');
}

function catalogEntry(name, source, clients = ['codex'], scopes = ['global']) {
  return { name, source, clients, scopes };
}

test('catalog resolution is stable across manifest enumeration and six clients', async () => {
  const rootDir = await makeTemp('aios-skill-resolution-stable-');
  await writeCanonicalSkill(rootDir, 'provider-a');
  await writeCanonicalSkill(rootDir, 'provider-b');

  const catalog = [
    catalogEntry('provider-b', 'skill-sources/provider-b', ALL_CLIENTS),
    catalogEntry('provider-a', 'skill-sources/provider-a', ALL_CLIENTS),
  ];
  const reversed = [...catalog].reverse();
  const expected = ['provider-a', 'provider-b'];

  for (const clientName of ALL_CLIENTS) {
    const first = analyzeCatalogEntries({ rootDir, catalog, clientName, scope: 'global', selectedSkills: [], manifest: null });
    const second = analyzeCatalogEntries({ rootDir, catalog: reversed, clientName, scope: 'global', selectedSkills: [], manifest: null });
    assert.deepEqual(first.conflicts, []);
    assert.deepEqual(second.conflicts, []);
    assert.deepEqual(first.entries.map((entry) => entry.name), expected);
    assert.deepEqual(second.entries.map((entry) => entry.name), expected);
    assert.deepEqual(first.entries.map((entry) => entry.sourcePath), second.entries.map((entry) => entry.sourcePath));
  }
});

test('duplicate target names fail closed and Skills Doctor reports canonical provenance', async () => {
  const rootDir = await makeTemp('aios-skill-resolution-conflict-');
  await writeCanonicalSkill(rootDir, 'provider-a');
  await writeCanonicalSkill(rootDir, 'provider-b');
  const skills = [
    {
      relativeSkillPath: 'provider-a',
      installCatalogName: 'duplicate-provider',
      clients: ['codex'],
      scopes: ['global'],
      defaultInstall: { global: false, project: false },
      tags: [],
    },
    {
      relativeSkillPath: 'provider-b',
      installCatalogName: 'duplicate-provider',
      clients: ['codex'],
      scopes: ['global'],
      defaultInstall: { global: false, project: false },
      tags: [],
    },
  ];
  await writeManifest(rootDir, skills);

  const catalog = skills.map((entry) => catalogEntry(entry.installCatalogName, `skill-sources/${entry.relativeSkillPath}`));
  assert.throws(
    () => resolveCatalogEntries({ rootDir, catalog, clientName: 'codex', scope: 'global', selectedSkills: [], manifest: null }),
    /Ambiguous skills for codex scope=global: duplicate-provider/u
  );

  const logs = [];
  const result = await doctorContextDbSkills({
    rootDir,
    client: 'codex',
    homeMap: { codex: await makeTemp('aios-skill-resolution-home-') },
    io: { log: (line) => logs.push(String(line)) },
  });

  assert.equal(result.errors, 1);
  assert.equal(result.effectiveWarnings >= 1, true);
  const diagnostic = logs.find((line) => line.includes('ambiguous skill duplicate-provider')) || '';
  assert.match(diagnostic, /skill-sources[/\\]provider-a/u);
  assert.match(diagnostic, /skill-sources[/\\]provider-b/u);
  assert.match(diagnostic, /remove or rename one source/u);
});

test('skills doctor reports legacy shared-root installs under the agents home', async () => {
  const rootDir = await makeTemp('aios-skill-resolution-legacy-');
  await writeCanonicalSkill(rootDir, 'provider-a');
  await writeManifest(rootDir, [
    {
      relativeSkillPath: 'provider-a',
      installCatalogName: 'provider-a',
      clients: ['codex'],
      scopes: ['global'],
      defaultInstall: { global: false, project: false },
      tags: [],
    },
  ]);
  const agentsHome = await makeTemp('aios-agents-home-');
  const legacyDir = path.join(agentsHome, 'skills', 'provider-a');
  await mkdir(legacyDir, { recursive: true });
  await writeFile(path.join(legacyDir, 'SKILL.md'), '# provider-a\n', 'utf8');
  await writeFile(path.join(legacyDir, '.aios-skill-install.json'), JSON.stringify({
    schemaVersion: 1,
    managedBy: 'aios',
    kind: 'installed-skill',
    skillName: 'provider-a',
    client: 'claude',
    scope: 'global',
    installMode: 'copy',
  }), 'utf8');
  // 用户自有目录（无 AIOS metadata）不应触发提示。
  const userOwnedDir = path.join(agentsHome, 'skills', 'user-owned');
  await mkdir(userOwnedDir, { recursive: true });
  await writeFile(path.join(userOwnedDir, 'SKILL.md'), '# user\n', 'utf8');

  const logs = [];
  const result = await doctorContextDbSkills({
    rootDir,
    client: 'codex',
    agentsHome,
    homeMap: { codex: await makeTemp('aios-skill-resolution-legacy-home-') },
    io: { log: (line) => logs.push(String(line)) },
  });

  const warning = logs.find((line) => line.includes('legacy shared-root skill install')) || '';
  assert.match(warning, /1 legacy shared-root skill install/u);
  assert.ok(logs.some((line) => line.includes('provider-a (client=claude)')));
  assert.ok(!logs.some((line) => line.includes('user-owned (')));
  assert.equal(result.warnings >= 1, true);
});

async function makeLegacyAgentsHome() {
  const agentsHome = await makeTemp('aios-agents-home-remove-');
  const legacyDir = path.join(agentsHome, 'skills', 'provider-a');
  await mkdir(legacyDir, { recursive: true });
  await writeFile(path.join(legacyDir, 'SKILL.md'), '# provider-a\n', 'utf8');
  await writeFile(path.join(legacyDir, '.aios-skill-install.json'), JSON.stringify({
    schemaVersion: 1,
    managedBy: 'aios',
    kind: 'installed-skill',
    skillName: 'provider-a',
    client: 'claude',
    scope: 'global',
    installMode: 'copy',
  }), 'utf8');
  const userOwnedDir = path.join(agentsHome, 'skills', 'user-owned');
  await mkdir(userOwnedDir, { recursive: true });
  await writeFile(path.join(userOwnedDir, 'SKILL.md'), '# user\n', 'utf8');
  return agentsHome;
}

test('legacy shared-root removal previews under dry-run without deleting', async () => {
  const agentsHome = await makeLegacyAgentsHome();
  const logs = [];
  const result = removeLegacySharedRootInstalls(agentsHome, {
    dryRun: true,
    io: { log: (line) => logs.push(String(line)) },
  });
  assert.deepEqual(result.removed, ['provider-a']);
  assert.ok(logs.some((line) => line.includes('[plan] would remove legacy shared-root skill: provider-a')));
  assert.ok(fs.existsSync(path.join(agentsHome, 'skills', 'provider-a', '.aios-skill-install.json')));
  assert.ok(fs.existsSync(path.join(agentsHome, 'skills', 'user-owned', 'SKILL.md')));
});

test('legacy shared-root removal deletes only AIOS-managed copies', async () => {
  const agentsHome = await makeLegacyAgentsHome();
  const result = removeLegacySharedRootInstalls(agentsHome);
  assert.deepEqual(result.removed, ['provider-a']);
  assert.deepEqual(result.missing, []);
  assert.ok(!fs.existsSync(path.join(agentsHome, 'skills', 'provider-a')));
  assert.ok(fs.existsSync(path.join(agentsHome, 'skills', 'user-owned', 'SKILL.md')));
});
