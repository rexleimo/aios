import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runUpdate } from '../lib/lifecycle/update.mjs';

function fingerprintProjection(entry) {
  return createHash('sha256').update(JSON.stringify({
    schemaVersion: 1,
    projectionPath: entry.projectionPath,
    sourcePath: entry.sourcePath,
    entryType: entry.entryType,
    linkTarget: entry.linkTarget,
    createdAt: entry.createdAt,
    linkIdentity: entry.linkIdentity,
  })).digest('hex');
}

async function createOwnedProjectionFixture({ useFallbackHomes = false } = {}) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-surface-'));
  const fallbackHome = path.join(fixtureRoot, 'fallback-home');
  const codexHome = useFallbackHomes ? path.join(fallbackHome, '.codex') : path.join(fixtureRoot, 'codex-home');
  const agentsHome = useFallbackHomes ? path.join(fallbackHome, '.agents') : path.join(fixtureRoot, 'agents-home');
  const aiosHome = useFallbackHomes ? path.join(fallbackHome, '.aios') : path.join(fixtureRoot, 'aios-home');
  const sourceSkills = path.join(codexHome, 'superpowers', 'skills');
  const managedProjection = path.join(agentsHome, 'skills', 'superpowers');
  const ledgerPath = path.join(aiosHome, 'workflow-surfaces', 'rex-workflow-projections.json');
  const entry = {
    projectionPath: managedProjection,
    sourcePath: sourceSkills,
    entryType: 'symlink',
    linkTarget: sourceSkills,
    ownership: 'aios',
    ownershipVersion: 1,
    createdAt: '2026-07-19T00:00:00.000Z',
  };

  await mkdir(sourceSkills, { recursive: true });
  await writeFile(path.join(sourceSkills, 'source-marker.txt'), 'keep this source checkout\n');
  await mkdir(path.dirname(managedProjection), { recursive: true });
  await symlink(sourceSkills, managedProjection, 'dir');
  const linkIdentity = await lstat(managedProjection, { bigint: true });
  entry.linkIdentity = {
    device: String(linkIdentity.dev),
    inode: String(linkIdentity.ino),
    mode: String(linkIdentity.mode),
  };
  await mkdir(path.dirname(ledgerPath), { recursive: true });
  await writeFile(ledgerPath, `${JSON.stringify({
    schemaVersion: 1,
    entries: [{ ...entry, fingerprint: fingerprintProjection(entry) }],
  }, null, 2)}\n`);

  return {
    agentsHome,
    sourceSkills,
    managedProjection,
    ledgerPath,
    options: {
      homeDir: fallbackHome,
      env: useFallbackHomes ? {} : {
        CODEX_HOME: codexHome,
        AGENTS_HOME: agentsHome,
        AIOS_HOME: aiosHome,
      },
    },
  };
}

async function createUnmarkedLegacyLinkFixture() {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-surface-'));
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const agentsHome = path.join(fixtureRoot, 'agents-home');
  const aiosHome = path.join(fixtureRoot, 'aios-home');
  const sourceSkills = path.join(codexHome, 'superpowers', 'skills');
  const managedProjection = path.join(agentsHome, 'skills', 'superpowers');
  const ledgerPath = path.join(aiosHome, 'workflow-surfaces', 'rex-workflow-projections.json');

  await mkdir(sourceSkills, { recursive: true });
  await writeFile(path.join(sourceSkills, 'source-marker.txt'), 'keep this source checkout\n');
  await mkdir(path.dirname(managedProjection), { recursive: true });
  await symlink(sourceSkills, managedProjection, 'dir');

  return {
    sourceSkills,
    managedProjection,
    ledgerPath,
    options: {
      homeDir: path.join(fixtureRoot, 'fallback-home'),
      env: {
        CODEX_HOME: codexHome,
        AGENTS_HOME: agentsHome,
        AIOS_HOME: aiosHome,
      },
    },
  };
}

async function createClaudeLegacySkillFixture({ sourceKind = 'repo', skillName = 'writing-plans', sourceSkillName = skillName, writeSkill = true } = {}) {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-surface-'));
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const claudeHome = path.join(fixtureRoot, 'claude-home');
  const aiosHome = path.join(fixtureRoot, 'aios-home');
  const sourceSkills = sourceKind === 'plugin'
    ? path.join(claudeHome, 'plugins', 'cache', 'claude-plugins-official', 'superpowers', '4.2.0', 'skills', sourceSkillName)
    : path.join(codexHome, 'superpowers', 'skills', sourceSkillName);
  const managedProjection = path.join(claudeHome, 'skills', skillName);
  const ledgerPath = path.join(aiosHome, 'workflow-surfaces', 'rex-workflow-projections.json');

  await mkdir(sourceSkills, { recursive: true });
  if (writeSkill) {
    await writeFile(path.join(sourceSkills, 'SKILL.md'), '# legacy Superpowers skill\n');
  }
  await mkdir(path.dirname(managedProjection), { recursive: true });
  await symlink(sourceSkills, managedProjection, 'dir');

  return {
    sourceSkills,
    managedProjection,
    ledgerPath,
    options: {
      homeDir: path.join(fixtureRoot, 'fallback-home'),
      env: {
        CODEX_HOME: codexHome,
        CLAUDE_HOME: claudeHome,
        AIOS_HOME: aiosHome,
      },
    },
  };
}

async function createAllClientLegacySkillFixture() {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-surface-'));
  const homeByClient = Object.fromEntries([
    'codex',
    'claude',
    'gemini',
    'opencode',
    'hermes',
    'grok',
  ].map((client) => [client, path.join(fixtureRoot, `${client}-home`)]));
  const sourceSkills = path.join(homeByClient.codex, 'superpowers', 'skills', 'writing-plans');
  const projections = Object.fromEntries(Object.entries(homeByClient).map(([client, home]) => [
    client,
    path.join(home, 'skills', 'writing-plans'),
  ]));

  await mkdir(sourceSkills, { recursive: true });
  await writeFile(path.join(sourceSkills, 'SKILL.md'), '# legacy Superpowers skill\n');
  await Promise.all(Object.values(projections).map(async (projection) => {
    await mkdir(path.dirname(projection), { recursive: true });
    await symlink(sourceSkills, projection, 'dir');
  }));

  return {
    fixtureRoot,
    legacySourceRoot: path.join(homeByClient.codex, 'superpowers'),
    projections,
    options: {
      homeDir: path.join(fixtureRoot, 'fallback-home'),
      env: {
        AIOS_HOME: path.join(fixtureRoot, 'aios-home'),
        CLAUDE_HOME: homeByClient.claude,
        CODEX_HOME: homeByClient.codex,
        GEMINI_HOME: homeByClient.gemini,
        GROK_HOME: homeByClient.grok,
        HERMES_HOME: homeByClient.hermes,
        OPENCODE_HOME: homeByClient.opencode,
      },
    },
  };
}

async function createAgentLegacySkillFixture() {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-surface-'));
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const agentsHome = path.join(fixtureRoot, 'agents-home');
  const skillNames = ['brainstorming', 'writing-plans'];
  const legacySourceRoot = path.join(codexHome, 'superpowers');
  const sourceSkillsRoot = path.join(legacySourceRoot, 'skills');
  const projections = Object.fromEntries(skillNames.map((skillName) => [
    skillName,
    path.join(agentsHome, 'skills', skillName),
  ]));

  for (const skillName of skillNames) {
    const sourceSkill = path.join(sourceSkillsRoot, skillName);
    await mkdir(sourceSkill, { recursive: true });
    await writeFile(path.join(sourceSkill, 'SKILL.md'), `# ${skillName}\n`);
    await mkdir(path.dirname(projections[skillName]), { recursive: true });
    await symlink(sourceSkill, projections[skillName], 'dir');
  }

  return {
    fixtureRoot,
    legacySourceRoot,
    projections,
    options: {
      homeDir: path.join(fixtureRoot, 'fallback-home'),
      env: {
        AIOS_HOME: path.join(fixtureRoot, 'aios-home'),
        AGENTS_HOME: agentsHome,
        CODEX_HOME: codexHome,
      },
    },
  };
}

async function runIsolatedUpdateReconciliation({ reconcileOptions, adoptLegacySuperpowers = false }) {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-update-rex-'));
  const reports = [];
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');
  try {
    await mkdir(path.join(runtimeRoot, 'scripts'), { recursive: true });
    await writeFile(path.join(runtimeRoot, 'scripts', 'aios.mjs'), '#!/usr/bin/env node\n', 'utf8');
    await runUpdate({
      components: ['skills'],
      selfUpdate: false,
      skipDoctor: true,
      adoptLegacySuperpowers,
    }, {
      rootDir: runtimeRoot,
      projectRoot: runtimeRoot,
      io: { log: () => {} },
      deps: {
        ensureRexHarness: async () => ({ ready: true, version: '0.4.2', missing: [], fixHint: '' }),
        reconcileRexWorkflowSurface: async (options) => {
          const report = await reconcileRexWorkflowSurface({ ...reconcileOptions, ...options });
          reports.push(report);
          return report;
        },
        installContextDbSkills: async () => {},
        installRexClientProjections: async () => {},
      },
    });
    assert.equal(reports.length, 1);
    return reports[0];
  } finally {
    await rm(runtimeRoot, { recursive: true, force: true });
  }
}

async function createHistoricalAiosSuperpowersFixture() {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-surface-'));
  const codexHome = path.join(fixtureRoot, 'codex-home');
  const claudeHome = path.join(fixtureRoot, 'claude-home');
  const agentsHome = path.join(fixtureRoot, 'agents-home');
  const aiosHome = path.join(fixtureRoot, 'aios-home');
  const legacySourceRoot = path.join(codexHome, 'superpowers');
  const sourceSkills = path.join(legacySourceRoot, 'skills');
  const agentsProjection = path.join(agentsHome, 'skills', 'superpowers');
  const claudeProjection = path.join(claudeHome, 'skills', 'writing-plans');
  const legacyRouter = path.join(agentsHome, 'skills', 'aios-workflow-router');

  await mkdir(path.join(sourceSkills, 'writing-plans'), { recursive: true });
  await writeFile(path.join(sourceSkills, 'writing-plans', 'SKILL.md'), '# legacy Superpowers skill\n');
  await mkdir(path.dirname(agentsProjection), { recursive: true });
  await symlink(sourceSkills, agentsProjection, 'dir');
  await mkdir(path.dirname(claudeProjection), { recursive: true });
  await symlink(path.join(sourceSkills, 'writing-plans'), claudeProjection, 'dir');
  await mkdir(legacyRouter, { recursive: true });
  await writeFile(path.join(legacyRouter, 'SKILL.md'), `---
name: aios-workflow-router
description: "Route tasks to appropriate superpowers workflows."
---

# AIOS Workflow Router

MUST invoke \`superpowers:brainstorming\` before implementation.
MUST invoke \`superpowers:verification-before-completion\` before completion.
`);

  return {
    agentsProjection,
    claudeProjection,
    legacyRouter,
    legacySourceRoot,
    options: {
      homeDir: path.join(fixtureRoot, 'fallback-home'),
      env: {
        CODEX_HOME: codexHome,
        CLAUDE_HOME: claudeHome,
        AGENTS_HOME: agentsHome,
        AIOS_HOME: aiosHome,
      },
    },
  };
}

test('reconciliation retires an explicitly adopted historical AIOS Superpowers surface', async () => {
  const {
    agentsProjection,
    claudeProjection,
    legacyRouter,
    legacySourceRoot,
    options,
  } = await createHistoricalAiosSuperpowersFixture();
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  const report = await reconcileRexWorkflowSurface({ ...options, adoptLegacySuperpowers: true });

  assert.equal(report.status, 'removed');
  assert.deepEqual(report.conflicts, []);
  assert.deepEqual(report.removed.sort(), [agentsProjection, claudeProjection, legacyRouter].sort());
  assert.equal(report.retired.length, 1);
  assert.notEqual(report.retired[0], legacySourceRoot);
  assert.match(report.retired[0], /aios-home/u);
  await assert.rejects(lstat(agentsProjection), { code: 'ENOENT' });
  await assert.rejects(lstat(claudeProjection), { code: 'ENOENT' });
  await assert.rejects(lstat(legacyRouter), { code: 'ENOENT' });
  await assert.rejects(lstat(legacySourceRoot), { code: 'ENOENT' });
  assert.equal(
    await readFile(path.join(report.retired[0], 'skills', 'writing-plans', 'SKILL.md'), 'utf8'),
    '# legacy Superpowers skill\n',
  );
});

test('reconciliation preserves a historical router with unrecognized extra files', async () => {
  const {
    agentsProjection,
    claudeProjection,
    legacyRouter,
    legacySourceRoot,
    options,
  } = await createHistoricalAiosSuperpowersFixture();
  await writeFile(path.join(legacyRouter, '.aios-skill-install.json'), `${JSON.stringify({
    schemaVersion: 1,
    managedBy: 'aios',
    kind: 'installed-skill',
    skillName: 'aios-workflow-router',
    relativeSkillPath: 'aios-workflow-router',
    client: 'claude',
    scope: 'global',
    installMode: 'copy',
    catalogSource: 'skill-sources/aios-workflow-router',
    generatedAt: '2026-06-18T23:47:44.303Z',
  }, null, 2)}\n`);
  await writeFile(path.join(legacyRouter, 'user-note.txt'), 'do not delete user content\n');
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  const report = await reconcileRexWorkflowSurface({ ...options, adoptLegacySuperpowers: true });

  assert.equal(report.status, 'legacy-workflow-conflict');
  assert.deepEqual(report.conflicts, [{
    path: legacyRouter,
    reason: 'legacy-router-contains-unrecognized-files',
  }]);
  await assert.rejects(lstat(agentsProjection), { code: 'ENOENT' });
  await assert.rejects(lstat(claudeProjection), { code: 'ENOENT' });
  assert.equal((await lstat(legacyRouter)).isDirectory(), true);
  assert.equal((await lstat(legacySourceRoot)).isDirectory(), true);
  assert.equal(await readFile(path.join(legacyRouter, 'user-note.txt'), 'utf8'), 'do not delete user content\n');
});

test('reconciliation removes a historical router with exact AIOS install metadata', async () => {
  const {
    legacyRouter,
    legacySourceRoot,
    options,
  } = await createHistoricalAiosSuperpowersFixture();
  await writeFile(path.join(legacyRouter, '.aios-skill-install.json'), `${JSON.stringify({
    schemaVersion: 1,
    managedBy: 'aios',
    kind: 'installed-skill',
    skillName: 'aios-workflow-router',
    relativeSkillPath: 'aios-workflow-router',
    client: 'claude',
    scope: 'global',
    installMode: 'copy',
    catalogSource: 'skill-sources/aios-workflow-router',
    generatedAt: '2026-06-18T23:47:44.303Z',
  }, null, 2)}\n`);
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  const report = await reconcileRexWorkflowSurface({ ...options, adoptLegacySuperpowers: true });

  assert.equal(report.status, 'removed');
  assert.deepEqual(report.conflicts, []);
  assert.ok(report.removed.includes(legacyRouter));
  await assert.rejects(lstat(legacyRouter), { code: 'ENOENT' });
  await assert.rejects(lstat(legacySourceRoot), { code: 'ENOENT' });
});

test('reconciliation preserves an unmarked exact legacy Superpowers link until ownership is proven', async () => {
  const { ledgerPath, managedProjection, options, sourceSkills } = await createUnmarkedLegacyLinkFixture();
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  const report = await reconcileRexWorkflowSurface(options);

  assert.equal(report.status, 'legacy-workflow-conflict');
  assert.deepEqual(report.removed, []);
  assert.deepEqual(report.conflicts, [{
    path: managedProjection,
    reason: 'unproven-legacy-superpowers-projection',
  }]);
  assert.equal((await lstat(managedProjection)).isSymbolicLink(), true);
  await assert.rejects(readFile(ledgerPath), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(sourceSkills, 'source-marker.txt'), 'utf8'), 'keep this source checkout\n');
});

test('reconciliation removes an exact legacy Superpowers link after explicit ownership adoption', async () => {
  const { managedProjection, options, sourceSkills } = await createUnmarkedLegacyLinkFixture();

  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');
  const report = await reconcileRexWorkflowSurface({ ...options, adoptLegacySuperpowers: true });

  assert.equal(report.status, 'removed');
  assert.deepEqual(report.removed, [managedProjection]);
  assert.deepEqual(report.conflicts, []);
  assert.equal(report.retired.length, 1);
  await assert.rejects(lstat(managedProjection), { code: 'ENOENT' });
  await assert.rejects(lstat(sourceSkills), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(report.retired[0], 'skills', 'source-marker.txt'), 'utf8'), 'keep this source checkout\n');
});

test('explicit ownership adoption dry-run neither records nor removes an exact legacy Superpowers link', async () => {
  const { ledgerPath, managedProjection, options, sourceSkills } = await createUnmarkedLegacyLinkFixture();
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  const report = await reconcileRexWorkflowSurface({
    ...options,
    adoptLegacySuperpowers: true,
    dryRun: true,
  });

  assert.equal(report.status, 'would-remove');
  assert.deepEqual(report.removed, [managedProjection]);
  assert.deepEqual(report.conflicts, []);
  assert.equal((await lstat(managedProjection)).isSymbolicLink(), true);
  await assert.rejects(readFile(ledgerPath), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(sourceSkills, 'source-marker.txt'), 'utf8'), 'keep this source checkout\n');
});

test('reconciliation removes an exact Claude legacy Superpowers skill link after explicit ownership adoption', async () => {
  const { managedProjection, options, sourceSkills } = await createClaudeLegacySkillFixture();
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  const report = await reconcileRexWorkflowSurface({ ...options, adoptLegacySuperpowers: true });

  assert.equal(report.status, 'removed');
  assert.deepEqual(report.removed, [managedProjection]);
  assert.deepEqual(report.conflicts, []);
  await assert.rejects(lstat(managedProjection), { code: 'ENOENT' });
  await assert.rejects(lstat(sourceSkills), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(report.retired[0], 'skills', 'writing-plans', 'SKILL.md'), 'utf8'), '# legacy Superpowers skill\n');
});

test('reconciliation reports but preserves unrecognized Superpowers-style skill links', async () => {
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  for (const linkKind of ['external', 'relative', 'dangling']) {
    const { managedProjection, options } = await createClaudeLegacySkillFixture();
    const externalSource = path.join(
      path.dirname(options.env.CLAUDE_HOME),
      `${linkKind}-superpowers`,
      'skills',
      'writing-plans',
    );
    if (linkKind !== 'dangling') {
      await mkdir(externalSource, { recursive: true });
      await writeFile(path.join(externalSource, 'SKILL.md'), '# external legacy skill\n');
    }
    await unlink(managedProjection);
    const linkTarget = linkKind === 'relative'
      ? path.relative(path.dirname(managedProjection), externalSource)
      : externalSource;
    await symlink(linkTarget, managedProjection, 'dir');

    const report = await reconcileRexWorkflowSurface(options);

    assert.equal(report.status, 'legacy-workflow-conflict', linkKind);
    assert.deepEqual(report.removed, [], linkKind);
    assert.ok(
      report.conflicts.some((conflict) => (
        conflict.path === managedProjection
        && conflict.reason === 'unrecognized-superpowers-skill-link'
      )),
      linkKind,
    );
    assert.equal((await lstat(managedProjection)).isSymbolicLink(), true, linkKind);
  }
});

test('reconciliation removes exact Claude repo and plugin Superpowers skill links after explicit ownership adoption', async () => {
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  for (const sourceKind of ['repo', 'plugin']) {
    const { ledgerPath, managedProjection, options, sourceSkills } = await createClaudeLegacySkillFixture({ sourceKind });
    const report = await reconcileRexWorkflowSurface({ ...options, adoptLegacySuperpowers: true });

    assert.equal(report.status, 'removed', sourceKind);
    assert.deepEqual(report.removed, [managedProjection], sourceKind);
    assert.deepEqual(report.conflicts, [], sourceKind);
    await assert.rejects(lstat(managedProjection), { code: 'ENOENT' }, sourceKind);
    assert.deepEqual(JSON.parse(await readFile(ledgerPath, 'utf8')), {
      schemaVersion: 1,
      entries: [],
    }, sourceKind);
    if (sourceKind === 'repo') {
      assert.equal(report.retired.length, 1, sourceKind);
      assert.equal(await readFile(path.join(report.retired[0], 'skills', 'writing-plans', 'SKILL.md'), 'utf8'), '# legacy Superpowers skill\n', sourceKind);
    } else {
      assert.equal(report.retired, undefined, sourceKind);
      assert.equal(await readFile(path.join(sourceSkills, 'SKILL.md'), 'utf8'), '# legacy Superpowers skill\n', sourceKind);
    }
  }
});

test('reconciliation removes exact legacy Superpowers skill links from every native client root after explicit ownership adoption', async () => {
  const { legacySourceRoot, options, projections } = await createAllClientLegacySkillFixture();
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  const report = await reconcileRexWorkflowSurface({ ...options, adoptLegacySuperpowers: true });

  assert.equal(report.status, 'removed');
  assert.deepEqual(report.conflicts, []);
  assert.deepEqual(report.removed.sort(), Object.values(projections).sort());
  for (const projection of Object.values(projections)) {
    await assert.rejects(lstat(projection), { code: 'ENOENT' });
  }
  await assert.rejects(lstat(legacySourceRoot), { code: 'ENOENT' });
  assert.equal(report.retired.length, 1);
});

test('reconciliation removes exact legacy Superpowers skill links from the shared agent root after explicit ownership adoption', async () => {
  const { legacySourceRoot, options, projections } = await createAgentLegacySkillFixture();
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  const report = await reconcileRexWorkflowSurface({ ...options, adoptLegacySuperpowers: true });

  assert.equal(report.status, 'removed');
  assert.deepEqual(report.conflicts, []);
  assert.deepEqual(report.removed.sort(), Object.values(projections).sort());
  for (const projection of Object.values(projections)) {
    await assert.rejects(lstat(projection), { code: 'ENOENT' });
  }
  await assert.rejects(lstat(legacySourceRoot), { code: 'ENOENT' });
  assert.equal(report.retired.length, 1);
});

test('update preserves unproven Superpowers links by default and removes adopted links across native and shared roots', async () => {
  const native = await createAllClientLegacySkillFixture();
  const shared = await createAgentLegacySkillFixture();
  try {
    for (const fixture of [native, shared]) {
      const report = await runIsolatedUpdateReconciliation({ reconcileOptions: fixture.options });
      assert.notEqual(report.status, 'removed');
      assert.deepEqual(report.removed, []);
      for (const projection of Object.values(fixture.projections)) {
        assert.equal((await lstat(projection)).isSymbolicLink(), true, projection);
      }
      assert.equal((await lstat(fixture.legacySourceRoot)).isDirectory(), true);
    }

    for (const fixture of [native, shared]) {
      const report = await runIsolatedUpdateReconciliation({
        reconcileOptions: fixture.options,
        adoptLegacySuperpowers: true,
      });
      assert.equal(report.status, 'removed');
      assert.deepEqual(report.conflicts, []);
      assert.deepEqual(report.removed.sort(), Object.values(fixture.projections).sort());
      for (const projection of Object.values(fixture.projections)) {
        await assert.rejects(lstat(projection), { code: 'ENOENT' });
      }
      await assert.rejects(lstat(fixture.legacySourceRoot), { code: 'ENOENT' });
      assert.equal(report.retired.length, 1);
    }
  } finally {
    await Promise.all([native.fixtureRoot, shared.fixtureRoot].map((fixtureRoot) => (
      rm(fixtureRoot, { recursive: true, force: true })
    )));
  }
});

test('reconciliation reports but preserves an unrecognized shared-agent Superpowers-style skill link', async () => {
  const { legacySourceRoot, options, projections } = await createAgentLegacySkillFixture();
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');
  const managedProjection = projections['writing-plans'];
  const externalSource = path.join(
    path.dirname(options.env.AGENTS_HOME),
    'external-superpowers',
    'skills',
    'writing-plans',
  );

  await unlink(projections.brainstorming);
  await unlink(managedProjection);
  await rm(legacySourceRoot, { recursive: true, force: true });
  await mkdir(externalSource, { recursive: true });
  await writeFile(path.join(externalSource, 'SKILL.md'), '# external legacy skill\n');
  await symlink(path.relative(path.dirname(managedProjection), externalSource), managedProjection, 'dir');

  const report = await reconcileRexWorkflowSurface(options);

  assert.equal(report.status, 'legacy-workflow-conflict');
  assert.deepEqual(report.removed, []);
  assert.ok(report.conflicts.some((conflict) => (
    conflict.path === managedProjection
    && conflict.reason === 'unrecognized-superpowers-skill-link'
  )));
  assert.equal((await lstat(managedProjection)).isSymbolicLink(), true);
});

test('reconciliation fails closed for foreign, basename-mismatched, missing-source, or directory Claude skill paths', async () => {
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  {
    const { managedProjection, options, sourceSkills } = await createClaudeLegacySkillFixture();
    const foreignSource = `${sourceSkills}-foreign`;
    await mkdir(foreignSource, { recursive: true });
    await writeFile(path.join(foreignSource, 'SKILL.md'), '# foreign\n');
    await unlink(managedProjection);
    await symlink(foreignSource, managedProjection, 'dir');
    const report = await reconcileRexWorkflowSurface(options);
    assert.equal(report.status, 'legacy-workflow-conflict');
    assert.equal((await lstat(managedProjection)).isSymbolicLink(), true);
    assert.equal(await readFile(path.join(sourceSkills, 'SKILL.md'), 'utf8'), '# legacy Superpowers skill\n');
  }

  {
    const { managedProjection, options, sourceSkills } = await createClaudeLegacySkillFixture({ sourceSkillName: 'test-driven-development' });
    const report = await reconcileRexWorkflowSurface(options);
    assert.equal(report.status, 'legacy-workflow-conflict');
    assert.equal((await lstat(managedProjection)).isSymbolicLink(), true);
    assert.equal(await readFile(path.join(sourceSkills, 'SKILL.md'), 'utf8'), '# legacy Superpowers skill\n');
  }

  {
    const { managedProjection, options, sourceSkills } = await createClaudeLegacySkillFixture({ writeSkill: false });
    const report = await reconcileRexWorkflowSurface(options);
    assert.equal(report.status, 'legacy-workflow-conflict');
    assert.equal((await lstat(managedProjection)).isSymbolicLink(), true);
    await assert.rejects(readFile(path.join(sourceSkills, 'SKILL.md')),{ code: 'ENOENT' });
  }

  {
    const { managedProjection, options } = await createClaudeLegacySkillFixture();
    await unlink(managedProjection);
    await mkdir(managedProjection);
    const report = await reconcileRexWorkflowSurface(options);
    assert.equal(report.status, 'legacy-workflow-conflict');
    assert.equal((await lstat(managedProjection)).isDirectory(), true);
  }
});

test('reconciliation removes one ledger-owned link, retires its source, and is idempotent', async () => {
  const { managedProjection, options, sourceSkills } = await createOwnedProjectionFixture();

  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  const removed = await reconcileRexWorkflowSurface(options);
  assert.equal(removed.status, 'removed');
  assert.deepEqual(removed.removed, [managedProjection]);
  assert.deepEqual(removed.conflicts, []);
  assert.equal(removed.retired.length, 1);
  await assert.rejects(lstat(managedProjection), { code: 'ENOENT' });
  assert.equal(await readFile(path.join(removed.retired[0], 'skills', 'source-marker.txt'), 'utf8'), 'keep this source checkout\n');

  const repeated = await reconcileRexWorkflowSurface(options);
  assert.deepEqual(repeated, {
    kind: 'aios.rex-workflow-surface-reconciliation.v1',
    status: 'already-converged',
    removed: [],
    conflicts: [],
  });
  await assert.rejects(lstat(sourceSkills), { code: 'ENOENT' });
});

test('reconciliation dry-run reports an owned projection without mutating it', async () => {
  const { ledgerPath, managedProjection, options, sourceSkills } = await createOwnedProjectionFixture();
  const ledgerBefore = await readFile(ledgerPath, 'utf8');

  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');
  const report = await reconcileRexWorkflowSurface({ ...options, dryRun: true });

  assert.equal(report.status, 'would-remove');
  assert.deepEqual(report.removed, [managedProjection]);
  assert.deepEqual(report.conflicts, []);
  assert.equal(report.retired.length, 1);
  assert.equal((await lstat(managedProjection)).isSymbolicLink(), true);
  assert.equal(await readFile(ledgerPath, 'utf8'), ledgerBefore);
  assert.equal(await readFile(path.join(sourceSkills, 'source-marker.txt'), 'utf8'), 'keep this source checkout\n');
});

test('installed reconciliation entrypoint removes an owned projection and retires its source in an isolated home', async () => {
  const { managedProjection, options, sourceSkills } = await createOwnedProjectionFixture();
  const result = spawnSync(
    process.execPath,
    ['scripts/reconcile-rex-workflow-surface.mjs', '--root', process.cwd()],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, ...options.env },
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /removed 1 AIOS-managed legacy workflow projection/u);
  await assert.rejects(lstat(managedProjection), { code: 'ENOENT' });
  await assert.rejects(lstat(sourceSkills), { code: 'ENOENT' });
});

test('installed reconciliation entrypoint runs when invoked through a canonicalized path', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-reconcile-entrypoint-'));
  const linkPath = path.join(fixtureRoot, 'reconcile-rex-workflow-surface.mjs');
  try {
    const { options } = await createOwnedProjectionFixture();
    await symlink(path.resolve('scripts/reconcile-rex-workflow-surface.mjs'), linkPath);
    const result = spawnSync(process.execPath, [linkPath, '--root', process.cwd(), '--dry-run'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, ...options.env },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /would remove 1 AIOS-managed legacy workflow projection/u);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('installed reconciliation entrypoint documents explicit legacy adoption and rejects unknown options', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-reconcile-help-'));
  try {
    const help = spawnSync(process.execPath, [
      'scripts/reconcile-rex-workflow-surface.mjs', '--root', fixtureRoot, '--help',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    assert.equal(help.status, 0, help.stderr || help.stdout);
    assert.match(help.stdout, /--dry-run/u);
    assert.match(help.stdout, /--adopt-legacy-superpowers/u);
    assert.match(help.stdout, /--dry-run[\s\S]*--adopt-legacy-superpowers/u);

    const unknown = spawnSync(process.execPath, [
      'scripts/reconcile-rex-workflow-surface.mjs', '--root', fixtureRoot, '--not-a-real-option',
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
    });
    assert.notEqual(unknown.status, 0, unknown.stderr || unknown.stdout);
    assert.match(unknown.stderr, /unknown option: --not-a-real-option/u);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('installed reconciliation entrypoint does not adopt unproven legacy projections by default', async () => {
  const calls = [];
  const { reconcileInstalledRexWorkflowSurface } = await import('../reconcile-rex-workflow-surface.mjs');

  const result = await reconcileInstalledRexWorkflowSurface(['--root', process.cwd()], {
    prepareRexWorkflowSurface: async (options) => {
      calls.push(options);
      return {
        runtime: true,
        rex: { ready: true, version: '0.4.2' },
        reconciliation: { status: 'removed', removed: ['/tmp/superpowers'], conflicts: [] },
      };
    },
    io: { log: () => {} },
  });

  assert.equal(result.reconciliation.status, 'removed');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].adoptLegacySuperpowers, false);
});

test('installed reconciliation entrypoint forwards explicit legacy ownership adoption', async () => {
  const calls = [];
  const { reconcileInstalledRexWorkflowSurface } = await import('../reconcile-rex-workflow-surface.mjs');

  await reconcileInstalledRexWorkflowSurface([
    '--root', process.cwd(), '--adopt-legacy-superpowers', '--dry-run',
  ], {
    prepareRexWorkflowSurface: async (options) => {
      calls.push(options);
      return {
        runtime: true,
        rex: { ready: true, version: '0.4.2' },
        reconciliation: { status: 'would-remove', removed: ['/tmp/superpowers'], conflicts: [] },
      };
    },
    io: { log: () => {} },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].adoptLegacySuperpowers, true);
  assert.equal(calls[0].dryRun, true);
});

test('reconciliation durably recovers a stale owned ledger after the projection is removed', async () => {
  const { ledgerPath, managedProjection, options, sourceSkills } = await createOwnedProjectionFixture();
  await unlink(managedProjection);

  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  const recovered = await reconcileRexWorkflowSurface(options);
  assert.equal(recovered.status, 'removed');
  assert.deepEqual(recovered.removed, []);
  assert.deepEqual(recovered.conflicts, []);
  assert.equal(recovered.retired.length, 1);
  await assert.rejects(lstat(managedProjection), { code: 'ENOENT' });
  assert.deepEqual(JSON.parse(await readFile(ledgerPath, 'utf8')), {
    schemaVersion: 1,
    entries: [],
  });
  assert.equal(await readFile(path.join(recovered.retired[0], 'skills', 'source-marker.txt'), 'utf8'), 'keep this source checkout\n');

  const repeated = await reconcileRexWorkflowSurface(options);
  assert.deepEqual(repeated, {
    kind: 'aios.rex-workflow-surface-reconciliation.v1',
    status: 'already-converged',
    removed: [],
    conflicts: [],
  });
  assert.deepEqual(JSON.parse(await readFile(ledgerPath, 'utf8')), {
    schemaVersion: 1,
    entries: [],
  });
});

test('reconciliation preserves a same-target replacement of a ledger-owned link', async () => {
  const { agentsHome, managedProjection, options, sourceSkills } = await createOwnedProjectionFixture();
  const originalProjection = path.join(agentsHome, 'skills', 'superpowers-aios-original');

  // Keep the original inode allocated so the recreated link cannot reuse it.
  await rename(managedProjection, originalProjection);
  await symlink(sourceSkills, managedProjection, 'dir');

  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');
  const report = await reconcileRexWorkflowSurface(options);

  assert.equal(report.status, 'legacy-workflow-conflict');
  assert.deepEqual(report.removed, []);
  assert.equal((await lstat(managedProjection)).isSymbolicLink(), true);
  assert.equal((await lstat(originalProjection)).isSymbolicLink(), true);
  assert.equal(await readFile(path.join(sourceSkills, 'source-marker.txt'), 'utf8'), 'keep this source checkout\n');
});

test('reconciliation preserves incomplete and corrupt ownership records', async () => {
  const cases = [
    {
      name: 'missing creation identity',
      mutate: (ledger) => { delete ledger.entries[0].linkIdentity; },
      expectedStatus: 'legacy-workflow-conflict',
    },
    {
      name: 'invalid creation time',
      mutate: (ledger) => { ledger.entries[0].createdAt = 'not-a-timestamp'; },
      expectedStatus: 'legacy-workflow-conflict',
    },
    {
      name: 'bad fingerprint',
      mutate: (ledger) => { ledger.entries[0].fingerprint = 'not-a-fingerprint'; },
      expectedStatus: 'legacy-workflow-conflict',
    },
    {
      name: 'unsupported schema',
      mutate: (ledger) => { ledger.schemaVersion = 99; },
      expectedStatus: 'legacy-workflow-conflict',
    },
    {
      name: 'invalid JSON',
      mutate: null,
      expectedStatus: 'inspection-failed',
    },
  ];

  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');
  for (const scenario of cases) {
    const { ledgerPath, managedProjection, options, sourceSkills } = await createOwnedProjectionFixture();
    if (scenario.mutate) {
      const ledger = JSON.parse(await readFile(ledgerPath, 'utf8'));
      scenario.mutate(ledger);
      await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    } else {
      await writeFile(ledgerPath, '{ invalid JSON\n');
    }

    const report = await reconcileRexWorkflowSurface(options);
    assert.equal(report.status, scenario.expectedStatus, scenario.name);
    assert.deepEqual(report.removed, [], scenario.name);
    assert.equal((await lstat(managedProjection)).isSymbolicLink(), true, scenario.name);
    assert.equal(await readFile(path.join(sourceSkills, 'source-marker.txt'), 'utf8'), 'keep this source checkout\n', scenario.name);
  }
});

test('reconciliation fails closed for directory, foreign-link, dangling-source, and inspection-error states', async () => {
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  {
    const { managedProjection, options, sourceSkills } = await createOwnedProjectionFixture();
    await unlink(managedProjection);
    await mkdir(managedProjection);
    const report = await reconcileRexWorkflowSurface(options);
    assert.equal(report.status, 'legacy-workflow-conflict');
    assert.equal((await lstat(managedProjection)).isDirectory(), true);
    assert.equal(await readFile(path.join(sourceSkills, 'source-marker.txt'), 'utf8'), 'keep this source checkout\n');
  }

  {
    const { managedProjection, options, sourceSkills } = await createOwnedProjectionFixture();
    const foreignSource = `${sourceSkills}-foreign`;
    await mkdir(foreignSource, { recursive: true });
    await unlink(managedProjection);
    await symlink(foreignSource, managedProjection, 'dir');
    const report = await reconcileRexWorkflowSurface(options);
    assert.equal(report.status, 'legacy-workflow-conflict');
    assert.equal((await lstat(managedProjection)).isSymbolicLink(), true);
    assert.equal(await readFile(path.join(sourceSkills, 'source-marker.txt'), 'utf8'), 'keep this source checkout\n');
  }

  {
    const { managedProjection, options, sourceSkills } = await createOwnedProjectionFixture();
    await rm(sourceSkills, { recursive: true, force: true });
    const report = await reconcileRexWorkflowSurface(options);
    assert.equal(report.status, 'legacy-workflow-conflict');
    assert.equal((await lstat(managedProjection)).isSymbolicLink(), true);
  }

  {
    const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-surface-'));
    const codexHome = path.join(fixtureRoot, 'codex-home');
    const agentsHome = path.join(fixtureRoot, 'agents-home-file');
    const sourceSkills = path.join(codexHome, 'superpowers', 'skills');
    await mkdir(sourceSkills, { recursive: true });
    await writeFile(agentsHome, 'not a directory\n');
    const report = await reconcileRexWorkflowSurface({
      homeDir: path.join(fixtureRoot, 'fallback-home'),
      env: {
        CODEX_HOME: codexHome,
        AGENTS_HOME: agentsHome,
        AIOS_HOME: path.join(fixtureRoot, 'aios-home'),
      },
    });
    assert.equal(report.status, 'inspection-failed');
    assert.equal(await readFile(agentsHome, 'utf8'), 'not a directory\n');
  }
});

test('reconciliation resolves fallback homes without reading developer environment variables', async () => {
  const { managedProjection, options, sourceSkills } = await createOwnedProjectionFixture({ useFallbackHomes: true });
  const { reconcileRexWorkflowSurface } = await import('../lib/workflows/rex-workflow-surface-reconciliation.mjs');

  const report = await reconcileRexWorkflowSurface(options);

  assert.equal(report.status, 'removed');
  assert.ok(managedProjection.startsWith(options.homeDir));
  await assert.rejects(lstat(managedProjection), { code: 'ENOENT' });
  assert.equal(report.retired.length, 1);
  assert.equal(await readFile(path.join(report.retired[0], 'skills', 'source-marker.txt'), 'utf8'), 'keep this source checkout\n');
});

test('workflow preflight uses the same Rex workflow-surface reconciliation seam', async () => {
  const { runWorkflowCommand } = await import('../lib/lifecycle/workflow.mjs');
  const calls = [];
  let output = '';

  const result = await runWorkflowCommand({ subcommand: 'list', json: true }, {
    rootDir: process.cwd(),
    stdout: { write: (chunk) => { output += String(chunk); } },
    deps: {
      prepareRexWorkflowSurface: async (options) => {
        calls.push(options);
        return {
          runtime: true,
          rex: { ready: true, version: '0.4.2' },
          reconciliation: { status: 'already-converged', removed: [], conflicts: [] },
        };
      },
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].fix, true);
  assert.equal(calls[0].dryRun, false);
  assert.equal(result.report.workflowSurface.reconciliation.status, 'already-converged');
  assert.equal(JSON.parse(output).workflowSurface.reconciliation.status, 'already-converged');
});
