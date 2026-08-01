import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  installRexClientProjections,
  resolveRexProjectionClients,
} from '../lib/rex-harness/client-projection.mjs';
import {
  installRexClientSkills,
  parseRexClientProjectionArgs,
} from '../install-rex-client-projections.mjs';

const CLIENT_SKILL_ROOTS = Object.freeze({
  codex: '.codex/skills',
  claude: '.claude/skills',
  gemini: '.gemini/skills',
  opencode: '.opencode/skills',
  hermes: '.hermes/skills',
  grok: '.grok/skills',
});

test('Rex projection selection matches every supported AIOS client', () => {
  assert.deepEqual(resolveRexProjectionClients('all'), Object.keys(CLIENT_SKILL_ROOTS));
  assert.deepEqual(resolveRexProjectionClients('grok'), ['grok']);
});

test('Rex projects its workflow entry into every requested native client skill root', async () => {
  const rootDir = path.resolve('.');
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-projection-'));
  try {
    const result = await installRexClientProjections({
      rootDir,
      projectRoot,
      client: 'all',
      io: { log: () => {} },
    });

    assert.equal(result.status, 'installed');
    assert.deepEqual(result.clients, Object.keys(CLIENT_SKILL_ROOTS));
    for (const [client, skillRoot] of Object.entries(CLIENT_SKILL_ROOTS)) {
      const workflowPath = path.join(projectRoot, skillRoot, 'rex-workflow', 'SKILL.md');
      const workflow = await readFile(workflowPath, 'utf8');
      assert.match(workflow, /rex-harness CLI/u, `${client} should receive rex-workflow`);
    }
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('Rex projects to every client global discovery root when global scope is selected', async () => {
  const rootDir = path.resolve('.');
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-global-projection-'));
  const homeMap = Object.fromEntries(Object.keys(CLIENT_SKILL_ROOTS).map((client) => [
    client,
    path.join(fixtureRoot, `${client}-home`),
  ]));
  try {
    const result = await installRexClientProjections({
      rootDir,
      projectRoot: path.join(fixtureRoot, 'project'),
      client: 'all',
      scope: 'global',
      homeMap,
      io: { log: () => {} },
    });

    assert.equal(result.status, 'installed');
    for (const client of Object.keys(CLIENT_SKILL_ROOTS)) {
      const workflowPath = path.join(homeMap[client], 'skills', 'rex-workflow', 'SKILL.md');
      const workflow = await readFile(workflowPath, 'utf8');
      assert.match(workflow, /rex-harness CLI/u, `${client} should receive a global Rex workflow projection`);
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('AIOS reports identical unmarked Rex projections as adopted changes', async () => {
  const rootDir = path.resolve('.');
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-adopt-projection-'));
  const targetRoot = path.join(projectRoot, CLIENT_SKILL_ROOTS.claude);
  try {
    await cp(path.join(rootDir, 'rex-harness', 'skill-sources'), targetRoot, { recursive: true });

    const result = await installRexClientProjections({
      rootDir,
      projectRoot,
      client: 'claude',
      io: { log: () => {} },
    });

    assert.equal(result.status, 'installed');
    assert.deepEqual(result.installed, []);
    assert.equal(result.adopted.length, 13);
    assert.deepEqual(result.updated, []);
    assert.deepEqual(result.conflicts, []);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('standalone installer entrypoint defaults to an all-client global Rex projection', async () => {
  const calls = [];
  const result = await installRexClientSkills([], {
    installRexClientProjections: async (options) => {
      calls.push(options);
      return { status: 'installed' };
    },
    io: { log: () => {} },
  });

  assert.deepEqual(result, { status: 'installed' });
  assert.deepEqual(calls, [{
    rootDir: path.resolve('.'),
    projectRoot: path.resolve('.'),
    client: 'all',
    scope: 'global',
    io: calls[0].io,
  }]);
});

test('standalone installer entrypoint validates arguments and keeps help side-effect free', async () => {
  assert.deepEqual(parseRexClientProjectionArgs(['--root', '/tmp/aios', '--client', 'grok', '--scope', 'project']), {
    rootDir: path.resolve('/tmp/aios'),
    client: 'grok',
    scope: 'project',
  });
  assert.throws(() => parseRexClientProjectionArgs(['--unknown']), /unknown option: --unknown/u);

  const messages = [];
  const result = await installRexClientSkills(['--help'], {
    installRexClientProjections: () => assert.fail('help must not project skills'),
    io: { log: (message) => messages.push(message) },
  });
  assert.deepEqual(result, { status: 'help' });
  assert.equal(messages.length, 1);
});

test('standalone installer entrypoint runs when invoked through a canonicalized path', async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'aios-rex-projection-entrypoint-'));
  const linkPath = path.join(fixtureRoot, 'install-rex-client-projections.mjs');
  try {
    await symlink(path.resolve('scripts/install-rex-client-projections.mjs'), linkPath);
    const result = spawnSync(process.execPath, [linkPath, '--help'], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: node scripts\/install-rex-client-projections\.mjs/u);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
