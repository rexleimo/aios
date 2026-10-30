import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadSkillsCatalog } from '../../../../lib/tooling/components/skills/catalog.mjs';
import { installContextDbSkills } from '../../../../lib/tooling/components/skills/lifecycle/install.mjs';
import { uninstallContextDbSkills } from '../../../../lib/tooling/components/skills/lifecycle/uninstall.mjs';
import { buildInstalledSkillMetadata, writeInstalledSkillMetadata } from '../../../../lib/tooling/skills/install/install-metadata.mjs';

const oldName = 'aios-long-running-harness';
const newName = 'aios-harness';

function fixture(t) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-harness-rename-'));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  const skillDir = path.join(rootDir, 'skill-sources', newName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: ${newName}\nclients: [codex]\nscopes: [global]\nrepoTargets: [codex]\n---\n# Harness\n`);
  fs.mkdirSync(path.join(rootDir, 'config'));
  fs.writeFileSync(path.join(rootDir, 'config', 'skills-sync-manifest.json'), JSON.stringify({
    generatedRoots: { codex: '.codex/skills' },
  }));
  const clientHome = path.join(rootDir, 'client-home');
  const targetRoot = path.join(clientHome, 'skills');
  fs.mkdirSync(targetRoot, { recursive: true });
  const logs = [];
  return {
    rootDir, clientHome, targetRoot, logs,
    legacyPath: path.join(targetRoot, oldName),
    currentPath: path.join(targetRoot, newName),
    options: {
      rootDir, client: 'codex', scope: 'global', selectedSkills: [newName],
      homeMap: { codex: clientHome }, io: { log: (line) => logs.push(String(line)) },
    },
  };
}

function legacyCopy(f, overrides = {}) {
  fs.mkdirSync(f.legacyPath);
  fs.writeFileSync(path.join(f.legacyPath, 'SKILL.md'), '# Previous harness\n');
  writeInstalledSkillMetadata(f.legacyPath, buildInstalledSkillMetadata({
    skillName: oldName, relativeSkillPath: oldName,
    client: 'codex', scope: 'global', installMode: 'copy',
    catalogSource: `skill-sources/${oldName}`, ...overrides,
  }));
}

function archivedEntries(f) {
  const archiveRoot = path.join(f.clientHome, '.aios-retired-skills');
  return fs.existsSync(archiveRoot)
    ? fs.readdirSync(archiveRoot).map((name) => path.join(archiveRoot, name))
    : [];
}

test('repository catalog exposes a single canonical short-name harness', () => {
  const catalog = loadSkillsCatalog(process.cwd());
  assert.equal(catalog.filter((entry) => entry.name === newName).length, 1);
  assert.equal(catalog.filter((entry) => entry.name === oldName).length, 0);
});

test('old selector installs and uninstalls the short-name harness', async (t) => {
  const f = fixture(t);
  const options = { ...f.options, selectedSkills: [oldName] };
  await installContextDbSkills(options);
  assert.ok(fs.existsSync(path.join(f.currentPath, 'SKILL.md')));
  assert.ok(!fs.existsSync(f.legacyPath));
  await uninstallContextDbSkills(options);
  assert.ok(!fs.existsSync(f.currentPath));
});

test('successful install archives a managed legacy copy outside discovery and is idempotent', async (t) => {
  const f = fixture(t);
  legacyCopy(f);
  fs.writeFileSync(path.join(f.legacyPath, 'personal-notes.md'), 'Preserve these notes.\n');
  await installContextDbSkills(f.options);
  assert.deepEqual(fs.readdirSync(f.targetRoot), [newName]);
  const archives = archivedEntries(f);
  assert.equal(archives.length, 1);
  assert.equal(fs.readFileSync(path.join(archives[0], 'personal-notes.md'), 'utf8'), 'Preserve these notes.\n');
  assert.equal(fs.readFileSync(path.join(archives[0], 'SKILL.md'), 'utf8'), '# Previous harness\n');
  await installContextDbSkills(f.options);
  assert.deepEqual(archivedEntries(f), archives);
});

test('a broken link to the previous canonical source is archived without following it', async (t) => {
  const f = fixture(t);
  const previousSource = path.join(f.rootDir, 'skill-sources', oldName);
  fs.mkdirSync(previousSource);
  fs.symlinkSync(previousSource, f.legacyPath, process.platform === 'win32' ? 'junction' : 'dir');
  fs.rmdirSync(previousSource);
  await installContextDbSkills(f.options);
  assert.equal(archivedEntries(f).length, 1);
  assert.ok(fs.lstatSync(archivedEntries(f)[0]).isSymbolicLink());
  assert.ok(!fs.existsSync(previousSource));
  assert.ok(!fs.readdirSync(f.targetRoot).includes(oldName));
});

test('an unmanaged canonical blocker prevents retirement of the existing working harness', async (t) => {
  const f = fixture(t);
  legacyCopy(f);
  fs.mkdirSync(f.currentPath);
  fs.writeFileSync(path.join(f.currentPath, 'SKILL.md'), '# User skill\n');
  await installContextDbSkills({ ...f.options, force: true });
  assert.ok(fs.existsSync(path.join(f.legacyPath, 'SKILL.md')));
  assert.equal(fs.readFileSync(path.join(f.currentPath, 'SKILL.md'), 'utf8'), '# User skill\n');
  assert.deepEqual(archivedEntries(f), []);
});

for (const [label, overrides] of [
  ['another client', { client: 'claude' }],
  ['another source', { catalogSource: 'user/skill' }],
  ['another scope', { scope: 'project' }],
]) {
  test(`rename preserves an old directory owned by ${label}`, async (t) => {
    const f = fixture(t);
    legacyCopy(f, overrides);
    await installContextDbSkills(f.options);
    assert.ok(fs.existsSync(path.join(f.legacyPath, 'SKILL.md')));
    assert.deepEqual(archivedEntries(f), []);
  });
}

test('rename preserves an unmarked legacy directory and reports it', async (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.legacyPath);
  fs.writeFileSync(path.join(f.legacyPath, 'SKILL.md'), '# Personal harness\n');
  await installContextDbSkills(f.options);
  assert.equal(fs.readFileSync(path.join(f.legacyPath, 'SKILL.md'), 'utf8'), '# Personal harness\n');
  assert.deepEqual(archivedEntries(f), []);
  assert.ok(f.logs.some((line) => line.includes(oldName) && line.includes('unmanaged')));
});
