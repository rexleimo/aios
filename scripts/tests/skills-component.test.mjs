import assert from 'node:assert/strict';
import { lstat, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  doctorContextDbSkills,
  installContextDbSkills,
  uninstallContextDbSkills,
} from '../lib/components/skills.mjs';

async function makeTemp(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeSkill(rootDir, relativeDir, body = '# sample\n') {
  const skillDir = path.join(rootDir, relativeDir);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), body, 'utf8');
}

async function writeCatalog(rootDir) {
  const catalogDir = path.join(rootDir, 'config');
  await mkdir(catalogDir, { recursive: true });
  await writeFile(path.join(catalogDir, 'skills-catalog.json'), JSON.stringify({
    version: 1,
    skills: [
      {
        name: 'find-skills',
        description: 'general',
        source: '.codex/skills/find-skills',
        clients: ['codex'],
        scopes: ['global', 'project'],
        defaultInstall: { global: true, project: false },
        tags: ['general'],
      },
      {
        name: 'xhs-ops-methods',
        description: 'project only',
        source: '.codex/skills/xhs-ops-methods',
        clients: ['codex'],
        scopes: ['project'],
        defaultInstall: { global: false, project: false },
        tags: ['xhs'],
      },
    ],
  }, null, 2), 'utf8');
}

async function writeCanonicalCatalog(rootDir, skills = [
  {
    name: 'find-skills',
    description: 'general',
    source: 'skill-sources/find-skills',
    clients: ['codex'],
    scopes: ['global', 'project'],
    defaultInstall: { global: true, project: false },
    tags: ['general'],
  },
]) {
  const catalogDir = path.join(rootDir, 'config');
  await mkdir(catalogDir, { recursive: true });
  await writeFile(path.join(catalogDir, 'skills-catalog.json'), JSON.stringify({
    version: 1,
    skills,
  }, null, 2), 'utf8');
}

test('default install mode copies skill trees and writes install metadata', async () => {
  const rootDir = await makeTemp('aios-skills-copy-root-');
  const codexHome = await makeTemp('aios-skills-copy-home-');
  await writeSkill(rootDir, 'skill-sources/find-skills');
  await writeCanonicalCatalog(rootDir);

  await installContextDbSkills({
    rootDir,
    client: 'codex',
    scope: 'global',
    homeMap: { codex: codexHome },
  });

  const targetDir = path.join(codexHome, 'skills', 'find-skills');
  const stat = await lstat(targetDir);
  assert.equal(stat.isSymbolicLink(), false);

  const metadata = JSON.parse(await readFile(path.join(targetDir, '.aios-skill-install.json'), 'utf8'));
  assert.equal(metadata.installMode, 'copy');
  assert.equal(metadata.skillName, 'find-skills');
  assert.equal(metadata.relativeSkillPath, 'find-skills');
  assert.equal(metadata.catalogSource, 'skill-sources/find-skills');
});

test('explicit link mode preserves symlink installs', async () => {
  const rootDir = await makeTemp('aios-skills-link-root-');
  const codexHome = await makeTemp('aios-skills-link-home-');
  await writeSkill(rootDir, 'skill-sources/find-skills');
  await writeCanonicalCatalog(rootDir);

  await installContextDbSkills({
    rootDir,
    client: 'codex',
    scope: 'global',
    installMode: 'link',
    homeMap: { codex: codexHome },
  });

  const targetDir = path.join(codexHome, 'skills', 'find-skills');
  const stat = await lstat(targetDir);
  assert.equal(stat.isSymbolicLink(), true);
});

test('doctor recognizes managed copy installs and legacy managed links', async () => {
  const rootDir = await makeTemp('aios-skills-doctor-modes-root-');
  const codexHome = await makeTemp('aios-skills-doctor-modes-home-');
  await writeSkill(rootDir, 'skill-sources/find-skills');
  await writeCanonicalCatalog(rootDir);
  await writeSkill(rootDir, '.codex/skills/find-skills');

  await installContextDbSkills({
    rootDir,
    client: 'codex',
    scope: 'global',
    homeMap: { codex: codexHome },
  });

  const copyLogs = [];
  await doctorContextDbSkills({
    rootDir,
    client: 'codex',
    scope: 'global',
    selectedSkills: ['find-skills'],
    homeMap: { codex: codexHome },
    io: { log: (line) => copyLogs.push(String(line)) },
  });
  assert.match(copyLogs.join('\n'), /managed copy install/);

  const legacyHome = await makeTemp('aios-skills-legacy-home-');
  await mkdir(path.join(legacyHome, 'skills'), { recursive: true });
  await import('node:fs').then(({ default: fs }) => {
    fs.symlinkSync(path.join(rootDir, '.codex', 'skills', 'find-skills'), path.join(legacyHome, 'skills', 'find-skills'));
  });

  const legacyLogs = [];
  await doctorContextDbSkills({
    rootDir,
    client: 'codex',
    scope: 'global',
    selectedSkills: ['find-skills'],
    homeMap: { codex: legacyHome },
    io: { log: (line) => legacyLogs.push(String(line)) },
  });
  assert.match(legacyLogs.join('\n'), /legacy managed link install/);
});

test('project installs reject the source repo root', async () => {
  const rootDir = await makeTemp('aios-skills-source-repo-root-');
  await writeSkill(rootDir, 'skill-sources/find-skills');
  await writeCanonicalCatalog(rootDir);

  await assert.rejects(
    installContextDbSkills({
      rootDir,
      projectRoot: rootDir,
      client: 'codex',
      scope: 'project',
      selectedSkills: ['find-skills'],
    }),
    /owned by sync-skills/
  );
});

test('global scope installs only global-eligible catalog skills', async () => {
  const rootDir = await makeTemp('aios-skills-catalog-root-');
  const codexHome = await makeTemp('aios-skills-catalog-home-');
  await writeSkill(rootDir, '.codex/skills/find-skills');
  await writeSkill(rootDir, '.codex/skills/xhs-ops-methods');
  await writeCatalog(rootDir);

  await installContextDbSkills({
    rootDir,
    client: 'codex',
    scope: 'global',
    homeMap: { codex: codexHome },
  });

  const globalSkillPath = path.join(codexHome, 'skills', 'find-skills', 'SKILL.md');
  const projectOnlyPath = path.join(codexHome, 'skills', 'xhs-ops-methods', 'SKILL.md');
  assert.match(await readFile(globalSkillPath, 'utf8'), /sample/);

  let missing = false;
  try {
    await readFile(projectOnlyPath, 'utf8');
  } catch {
    missing = true;
  }
  assert.equal(missing, true);
});

test('explicit selected skills limit installation candidates', async () => {
  const rootDir = await makeTemp('aios-skills-selected-root-');
  const projectRoot = await makeTemp('aios-skills-selected-project-');
  const codexHome = await makeTemp('aios-skills-selected-home-');
  await writeSkill(rootDir, 'skill-sources/find-skills');
  await writeSkill(rootDir, 'skill-sources/xhs-ops-methods');
  const catalogDir = path.join(rootDir, 'config');
  await mkdir(catalogDir, { recursive: true });
  await writeFile(path.join(catalogDir, 'skills-catalog.json'), JSON.stringify({
    version: 1,
    skills: [
      {
        name: 'find-skills',
        description: 'general',
        source: 'skill-sources/find-skills',
        clients: ['codex'],
        scopes: ['global', 'project'],
        defaultInstall: { global: true, project: false },
        tags: ['general'],
      },
      {
        name: 'xhs-ops-methods',
        description: 'project only',
        source: 'skill-sources/xhs-ops-methods',
        clients: ['codex'],
        scopes: ['project'],
        defaultInstall: { global: false, project: false },
        tags: ['xhs'],
      },
    ],
  }, null, 2), 'utf8');

  await installContextDbSkills({
    rootDir,
    projectRoot,
    client: 'codex',
    scope: 'project',
    selectedSkills: ['xhs-ops-methods'],
    homeMap: { codex: codexHome },
  });

  const selectedPath = path.join(projectRoot, '.codex', 'skills', 'xhs-ops-methods', 'SKILL.md');
  assert.match(await readFile(selectedPath, 'utf8'), /sample/);

  let installedUnexpectedly = true;
  try {
    await readFile(path.join(projectRoot, '.codex', 'skills', 'find-skills', 'SKILL.md'), 'utf8');
  } catch {
    installedUnexpectedly = false;
  }
  assert.equal(installedUnexpectedly, false);
});

test('doctor and uninstall respect project scope targets', async () => {
  const rootDir = await makeTemp('aios-skills-project-root-');
  const projectRoot = await makeTemp('aios-skills-project-workspace-');
  const codexHome = await makeTemp('aios-skills-project-home-');
  await writeSkill(rootDir, 'skill-sources/find-skills');
  await writeCatalog(rootDir);

  const catalog = {
    version: 1,
    skills: [
      {
        name: 'find-skills',
        description: 'general',
        source: 'skill-sources/find-skills',
        clients: ['codex'],
        scopes: ['global', 'project'],
        defaultInstall: { global: true, project: false },
        tags: ['general'],
      },
    ],
  };
  await mkdir(path.join(rootDir, 'config'), { recursive: true });
  await writeFile(path.join(rootDir, 'config', 'skills-catalog.json'), JSON.stringify(catalog, null, 2), 'utf8');

  const logs = [];
  const io = { log: (line) => logs.push(String(line)) };

  await installContextDbSkills({
    rootDir,
    projectRoot,
    client: 'codex',
    scope: 'project',
    selectedSkills: ['find-skills'],
    homeMap: { codex: codexHome },
    io,
  });

  const projectInstalledPath = path.join(projectRoot, '.codex', 'skills', 'find-skills', 'SKILL.md');
  assert.match(await readFile(projectInstalledPath, 'utf8'), /sample/);

  await doctorContextDbSkills({
    rootDir,
    projectRoot,
    client: 'codex',
    scope: 'project',
    selectedSkills: ['find-skills'],
    homeMap: { codex: codexHome },
    io,
  });
  assert.match(logs.join('\n'), /\.codex\/skills/);

  await uninstallContextDbSkills({
    rootDir,
    projectRoot,
    client: 'codex',
    scope: 'project',
    selectedSkills: ['find-skills'],
    homeMap: { codex: codexHome },
    io,
  });

  let missing = false;
  try {
    await readFile(projectInstalledPath, 'utf8');
  } catch {
    missing = true;
  }
  assert.equal(missing, true);
});

test('project scope installs and removes Kiro skills the same way as other clients', async () => {
  const rootDir = await makeTemp('aios-skills-kiro-project-root-');
  const projectRoot = await makeTemp('aios-skills-kiro-project-workspace-');
  const kiroHome = await makeTemp('aios-skills-kiro-project-home-');
  await writeSkill(rootDir, 'skill-sources/xhs-ops-methods');
  await writeCanonicalCatalog(rootDir, [
    {
      name: 'xhs-ops-methods',
      description: 'project only',
      source: 'skill-sources/xhs-ops-methods',
      clients: ['kiro'],
      scopes: ['project'],
      defaultInstall: { global: false, project: false },
      tags: ['xhs'],
    },
  ]);

  await installContextDbSkills({
    rootDir,
    projectRoot,
    client: 'kiro',
    scope: 'project',
    selectedSkills: ['xhs-ops-methods'],
    homeMap: { kiro: kiroHome },
  });

  const installedPath = path.join(projectRoot, '.kiro', 'skills', 'xhs-ops-methods', 'SKILL.md');
  assert.match(await readFile(installedPath, 'utf8'), /sample/);

  const logs = [];
  await doctorContextDbSkills({
    rootDir,
    projectRoot,
    client: 'kiro',
    scope: 'project',
    selectedSkills: ['xhs-ops-methods'],
    homeMap: { kiro: kiroHome },
    io: { log: (line) => logs.push(String(line)) },
  });
  assert.match(logs.join('\n'), /\.kiro\/skills/);
  assert.match(logs.join('\n'), /managed copy install/);

  await uninstallContextDbSkills({
    rootDir,
    projectRoot,
    client: 'kiro',
    scope: 'project',
    selectedSkills: ['xhs-ops-methods'],
    homeMap: { kiro: kiroHome },
  });

  let missing = false;
  try {
    await readFile(installedPath, 'utf8');
  } catch {
    missing = true;
  }
  assert.equal(missing, true);
});

test('project scope can target a workspace that differs from the catalog source repo', async () => {
  const rootDir = await makeTemp('aios-skills-source-root-');
  const projectRoot = await makeTemp('aios-skills-workspace-root-');
  await writeSkill(rootDir, 'skill-sources/find-skills');

  const catalogDir = path.join(rootDir, 'config');
  await mkdir(catalogDir, { recursive: true });
  await writeFile(path.join(catalogDir, 'skills-catalog.json'), JSON.stringify({
    version: 1,
    skills: [
      {
        name: 'find-skills',
        description: 'general',
        source: 'skill-sources/find-skills',
        clients: ['codex'],
        scopes: ['project'],
        defaultInstall: { global: false, project: true },
        tags: ['general'],
      },
    ],
  }, null, 2), 'utf8');

  await installContextDbSkills({
    rootDir,
    projectRoot,
    client: 'codex',
    scope: 'project',
    selectedSkills: ['find-skills'],
  });

  assert.match(
    await readFile(path.join(projectRoot, '.codex', 'skills', 'find-skills', 'SKILL.md'), 'utf8'),
    /sample/
  );
});

test('doctor warns about project overriding global even when scope=global', async () => {
  const rootDir = await makeTemp('aios-skills-override-global-root-');
  const projectRoot = await makeTemp('aios-skills-override-global-workspace-');
  const codexHome = await makeTemp('aios-skills-override-global-home-');
  await writeSkill(rootDir, 'skill-sources/find-skills');

  const catalogDir = path.join(rootDir, 'config');
  await mkdir(catalogDir, { recursive: true });
  await writeFile(path.join(catalogDir, 'skills-catalog.json'), JSON.stringify({
    version: 1,
    skills: [
      {
        name: 'find-skills',
        description: 'general',
        source: 'skill-sources/find-skills',
        clients: ['codex'],
        scopes: ['global', 'project'],
        defaultInstall: { global: true, project: false },
        tags: ['general'],
      },
    ],
  }, null, 2), 'utf8');

  await installContextDbSkills({ rootDir, client: 'codex', scope: 'global', homeMap: { codex: codexHome } });
  await installContextDbSkills({ rootDir, projectRoot, client: 'codex', scope: 'project', homeMap: { codex: codexHome } });

  const logs = [];
  await doctorContextDbSkills({
    rootDir,
    projectRoot,
    client: 'codex',
    scope: 'global',
    homeMap: { codex: codexHome },
    io: { log: (line) => logs.push(String(line)) },
  });

  assert.match(logs.join('\n'), /project install overrides global install/);
});

test('doctor warns about project overriding global even when scope=project', async () => {
  const rootDir = await makeTemp('aios-skills-override-project-root-');
  const projectRoot = await makeTemp('aios-skills-override-project-workspace-');
  const codexHome = await makeTemp('aios-skills-override-project-home-');
  await writeSkill(rootDir, 'skill-sources/find-skills');

  const catalogDir = path.join(rootDir, 'config');
  await mkdir(catalogDir, { recursive: true });
  await writeFile(path.join(catalogDir, 'skills-catalog.json'), JSON.stringify({
    version: 1,
    skills: [
      {
        name: 'find-skills',
        description: 'general',
        source: 'skill-sources/find-skills',
        clients: ['codex'],
        scopes: ['global', 'project'],
        defaultInstall: { global: true, project: false },
        tags: ['general'],
      },
    ],
  }, null, 2), 'utf8');

  await installContextDbSkills({ rootDir, client: 'codex', scope: 'global', homeMap: { codex: codexHome } });
  await installContextDbSkills({ rootDir, projectRoot, client: 'codex', scope: 'project', homeMap: { codex: codexHome } });

  const logs = [];
  await doctorContextDbSkills({
    rootDir,
    projectRoot,
    client: 'codex',
    scope: 'project',
    homeMap: { codex: codexHome },
    io: { log: (line) => logs.push(String(line)) },
  });

  assert.match(logs.join('\n'), /project install overrides global install/);
});
