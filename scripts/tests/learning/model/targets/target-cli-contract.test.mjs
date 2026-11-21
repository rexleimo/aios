import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { parseModelRouterArgs } from '../../../../lib/tooling/cli/parse-args/govern/model-router.mjs';
import { runModelRouterCommand } from '../../../../lib/tooling/model-router/entry/command.mjs';
import { loadRegistrySnapshot, registryFilePath } from '../../../../lib/tooling/model-router/entry/registry.mjs';

test('connect parser retains exact --target reference and does not leak it to later parses', () => {
  for (const target of ['auto', 'model:model%3Afoo', 'group:team%2Fone']) {
    const parsed = parseModelRouterArgs(['model-router', 'connect', '--target', target, '--client', 'claude', '--dry-run']);
    assert.equal(parsed.mode, 'command');
    assert.equal(parsed.options.subcommand, 'connect');
    assert.equal(parsed.options.target, target);
    assert.equal(parsed.options.client, 'claude');
    assert.equal(parsed.options.dryRun, true);
    assert.equal(parseModelRouterArgs(['model-router', 'connect']).options.target, undefined);
  }
});

test('connect parser retains expected revision, including invalid input, without leaking to later parses', () => {
  for (const revision of ['a'.repeat(64), '', 'not-a-revision']) {
    const parsed = parseModelRouterArgs(['model-router', 'connect', '--expected-revision', revision]);
    assert.equal(parsed.options.expectedRevision, revision);
    assert.equal(parseModelRouterArgs(['model-router', 'connect']).options.expectedRevision, undefined);
  }
});

async function fixture(t, assignments = {}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'schema-command-'));
  t.after(() => rm(rootDir, { recursive: true, force: true }));
  const file = registryFilePath({ rootDir });
  const document = { targetRefVersion: 1, models: { concrete: { protocols: ['claude'] } }, routingGroups: { x: { models: ['concrete'], routing: 'ordered' } }, ...assignments };
  const text = `${JSON.stringify(document, null, 2)}\n`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
  const logs = [], errors = [];
  const io = { log: (text) => logs.push(text), error: (text) => errors.push(text) };
  return { rootDir, file, document, text, logs, errors, io };
}

test('new CLI groups default to ordered and migrate legacy assignments safely', async (t) => {
  const f = await fixture(t, { targetRefVersion: undefined, activeModel: 'group:x', extensionMetadata: 'auto' });
  const result = await runModelRouterCommand({ subcommand: 'group-add', id: 'new', models: 'concrete' }, { registryRoot: f.rootDir, io: f.io });
  assert.equal(result.exitCode, 0, f.errors.join('\n'));
  const saved = JSON.parse(await readFile(f.file, 'utf8'));
  assert.equal(saved.routingGroups.new.routing, 'ordered');
  assert.equal(saved.targetRefVersion, 1);
  assert.equal(saved.activeModel, 'model:group%3Ax');
  assert.equal(saved.extensionMetadata, 'auto');
});

const inUse = [
  { activeModel: 'group:x' },
  { clientDefaults: { claude: 'group:x' } },
  { envModels: { CUSTOM: 'group:x' } },
  { envModels: { CUSTOM: { nested: ['model:concrete', 'group:x'] } } },
  { clientRoleMatrix: { default: { planner: 'group:x' } } },
  { clientRoleMatrix: { clients: { claude: { planner: 'group:x' } } } },
  { roleDefaults: { planner: { preferredModel: 'group:x' } } },
  { roleDefaults: { planner: { preferredModel: '', fallback: ['group:x'] } } },
  { routingRules: [{ taskType: 'general', primary: 'group:x' }] },
  { routingRules: [{ taskType: 'general', primary: '', fallback: ['group:x'] }] },
  { intentRouting: { enabled: false, classifierModel: 'concrete', intents: [{ modelId: 'group:x' }] } },
  { intentRouting: { enabled: false, classifierModel: 'concrete', intents: [{ modelId: '', fallback: ['group:x'] }] } },
];

for (const [index, assignments] of inUse.entries()) {
  test(`group deletion refuses in-use assignment ${index + 1} before writes`, async (t) => {
    const f = await fixture(t, assignments);
    const result = await runModelRouterCommand({ subcommand: 'group-rm', id: 'x' }, { registryRoot: f.rootDir, io: f.io });
    assert.equal(result.exitCode, 1);
    assert.match(f.errors.join('\n'), /in use|referenc/i);
    assert.equal(await readFile(f.file, 'utf8'), f.text);
    assert.deepEqual(await readdir(path.dirname(f.file)), ['model-registry.json']);
  });
}

test('raw legacy group-looking IDs and concrete/classifier metadata do not block group deletion', async (t) => {
  for (const assignments of [
    { targetRefVersion: undefined, activeModel: 'group:x' },
    { activeModel: 'model:group%3Ax', models: { 'group:x': {} }, intentRouting: { classifierModel: 'group:x' }, extensionMetadata: 'group:x' },
    { activeModel: 'model:group%3Ax', roleDefaults: { scalar: 'group:x', list: [{ preferredModel: 'group:x' }] }, clientRoles: { planner: 'group:x' }, intentRouting: { rules: [{ modelId: 'group:x', fallback: ['group:x'] }] } },
  ]) {
    const f = await fixture(t, assignments);
    const result = await runModelRouterCommand({ subcommand: 'group-rm', id: 'x' }, { registryRoot: f.rootDir, io: f.io });
    assert.equal(result.exitCode, 0, f.errors.join('\n'));
    const saved = JSON.parse(await readFile(f.file, 'utf8'));
    assert.equal(saved.activeModel, 'model:group%3Ax');
    assert.deepEqual(saved.routingGroups, {});
  }
});

test('CLI rejects unsupported group routing and accidental overwrite without writing', async (t) => {
  // "rotate"/"usage" became supported routing modes; a bogus mode must be rejected.
  for (const options of [{ id: 'new', routing: 'bogus' }, { id: 'x', routing: 'ordered' }]) {
    const f = await fixture(t);
    const result = await runModelRouterCommand({ subcommand: 'group-add', models: 'concrete', ...options }, { registryRoot: f.rootDir, io: f.io });
    assert.equal(result.exitCode, 1);
    assert.equal(await readFile(f.file, 'utf8'), f.text);
  }
});

test('CLI validates ordered concrete group members before writing', async (t) => {
  for (const members of ['', 'missing', 'group:x']) {
    const f = await fixture(t);
    const before = await readdir(f.rootDir, { recursive: true });
    const result = await runModelRouterCommand({ subcommand: 'group-add', id: 'new', models: members }, { registryRoot: f.rootDir, io: f.io });
    assert.equal(result.exitCode, 1);
    assert.match(f.errors.join('\n'), /member|concrete/i);
    assert.equal(await readFile(f.file, 'utf8'), f.text);
    assert.deepEqual(await readdir(f.rootDir, { recursive: true }), before);
  }
});

test('CLI preserves ordered group members and treats smart as the legacy ordered mode', async (t) => {
  const f = await fixture(t, { models: { concrete: {}, alternate: {}, 'group:x': {} } });
  const result = await runModelRouterCommand({ subcommand: 'group-add', id: ' NEW ', models: 'alternate,concrete,group:x', routing: 'smart' }, { registryRoot: f.rootDir, io: f.io });
  assert.equal(result.exitCode, 0, f.errors.join('\n'));
  const saved = JSON.parse(await readFile(f.file, 'utf8'));
  assert.deepEqual(saved.routingGroups.new.models, ['alternate', 'concrete', 'group:x']);
  assert.equal(saved.routingGroups.new.routing, 'smart');
});

test('native route and matrix commands consume v1 refs without registry writes', async (t) => {
  const f = await fixture(t, {
    activeModel: 'model:model%3Afoo%252fbar',
    models: { 'model:foo%2fbar': { label: 'Literal percent', provider: 'claude', protocols: ['claude'] } },
    routingRules: [{ taskType: 'general', primary: 'model:model%3Afoo%252fbar', fallback: [] }],
    clientRoleMatrix: { default: { planner: 'model:model%3Afoo%252fbar' } },
  });
  const before = await readdir(f.rootDir, { recursive: true });
  for (const options of [{ subcommand: 'route', task: 'fixture task' }, { subcommand: 'matrix', client: 'claude', role: 'planner' }]) {
    f.logs.length = 0;
    const result = await runModelRouterCommand(options, { registryRoot: f.rootDir, io: f.io });
    assert.equal(result.exitCode, 0, f.errors.join('\n'));
    assert.equal(JSON.parse(f.logs[0]).modelId, 'model:foo%2fbar');
    assert.equal(await readFile(f.file, 'utf8'), f.text);
    assert.deepEqual(await readdir(f.rootDir, { recursive: true }), before);
  }
});

test('native route and matrix commands reject unsupported targets without writes', async (t) => {
  for (const target of ['group:x', 'auto']) {
    const f = await fixture(t, {
      activeModel: 'model:concrete',
      models: { concrete: {}, auto: {}, 'group:x': {} },
      routingRules: [{ taskType: 'general', primary: target, fallback: [] }],
      clientRoleMatrix: { default: { planner: target } },
    });
    const before = await readdir(f.rootDir, { recursive: true });
    for (const options of [{ subcommand: 'route', task: 'fixture task' }, { subcommand: 'matrix', client: 'claude', role: 'planner' }]) {
      f.errors.length = 0;
      const result = await runModelRouterCommand(options, { registryRoot: f.rootDir, io: f.io });
      assert.equal(result.exitCode, 1);
      assert.match(f.errors.join('\n'), /Native model routing does not support/);
      assert.deepEqual(f.logs, []);
      assert.equal(await readFile(f.file, 'utf8'), f.text);
      assert.deepEqual(await readdir(f.rootDir, { recursive: true }), before);
    }
  }
});

async function connectFixture(t) {
  const f = await fixture(t, {
    activeModel: 'model:concrete',
    models: Object.fromEntries(['concrete', 'alternate', 'group:x'].map((id) => [id, { source: 'custom', provider: 'fixture', protocols: ['claude'] }])),
    providers: { fixture: { baseUrl: 'http://127.0.0.1:9', authMode: 'none', protocols: ['claude'] } },
    routingGroups: { x: { models: ['alternate', 'concrete'], routing: 'ordered' } },
  });
  const home = path.join(f.rootDir, 'home');
  const settingsFile = path.join(home, '.claude', 'settings.json');
  const settingsText = '{"theme":"fixture"}\n';
  await mkdir(path.dirname(settingsFile), { recursive: true });
  await writeFile(settingsFile, settingsText);
  return { ...f, home, settingsFile, settingsText, stateDir: path.join(f.rootDir, 'state') };
}

for (const isolated of [false, true]) {
  for (const revision of ['stale', 'invalid', 'empty']) {
    test(`real parser-to-connect rejects ${revision} revision before writes (isolated=${isolated})`, async (t) => {
      const f = await connectFixture(t);
      const before = await readdir(f.rootDir, { recursive: true });
      const expected = revision === 'stale' ? '0'.repeat(64) : revision === 'empty' ? '' : 'bad';
      const parsed = parseModelRouterArgs(['model-router', 'connect', '--target', 'group:x', '--client', 'claude', '--expected-revision', expected, '--json', ...(isolated ? ['--isolated'] : [])]);
      const result = await runModelRouterCommand({ ...parsed.options, home: f.home, stateDir: f.stateDir }, { registryRoot: f.rootDir, io: f.io });
      assert.equal(result.exitCode, 1, f.logs.join('\n'));
      assert.match(f.errors.join('\n'), revision === 'stale' ? /registry changed|refresh/i : /SHA-256 revision/);
      assert.equal(await readFile(f.file, 'utf8'), f.text);
      assert.equal(await readFile(f.settingsFile, 'utf8'), f.settingsText);
      assert.deepEqual(await readdir(f.rootDir, { recursive: true }), before);
    });
  }

  test(`real parser-to-connect accepts current revision in temporary artifacts (isolated=${isolated})`, async (t) => {
    const f = await connectFixture(t);
    const revision = createHash('sha256').update(f.text).digest('hex');
    const parsed = parseModelRouterArgs(['model-router', 'connect', '--target', 'group:x', '--client', 'claude', '--expected-revision', revision, '--json', ...(isolated ? ['--isolated'] : [])]);
    const result = await runModelRouterCommand({ ...parsed.options, home: f.home, stateDir: f.stateDir }, { registryRoot: f.rootDir, io: f.io });
    assert.equal(result.exitCode, 0, [...f.errors, ...f.logs].join('\n'));
    const state = JSON.parse(await readFile(path.join(f.stateDir, 'connect-state.json'), 'utf8'));
    assert.deepEqual(state.targets, { claude: 'group:x' });
    assert.equal(await readFile(f.file, 'utf8'), f.text);
    const artifact = isolated ? path.join(f.stateDir, 'claude-settings.json') : f.settingsFile;
    assert.match(await readFile(artifact, 'utf8'), /aios\/group\/x/);
    if (isolated) assert.equal(await readFile(f.settingsFile, 'utf8'), f.settingsText);
  });

  test(`seeded revision uses the snapshot hash without materializing configuration (isolated=${isolated})`, async (t) => {
    const f = await connectFixture(t);
    const builtin = path.join(f.rootDir, 'scripts/lib/tooling/specs/registry/model-registry.json');
    await mkdir(path.dirname(builtin), { recursive: true });
    await writeFile(builtin, f.text);
    await rm(path.dirname(f.file), { recursive: true });
    const snapshot = await loadRegistrySnapshot({ rootDir: f.rootDir });
    assert.equal(snapshot.seeded, true);
    const before = await readdir(f.rootDir, { recursive: true });
    const parsed = parseModelRouterArgs(['model-router', 'connect', '--target', 'group:x', '--client', 'claude', '--expected-revision', snapshot.hash, '--dry-run', '--json', ...(isolated ? ['--isolated'] : [])]);
    const result = await runModelRouterCommand({ ...parsed.options, home: f.home, stateDir: f.stateDir }, { registryRoot: f.rootDir, io: f.io });
    assert.equal(result.exitCode, 0, [...f.errors, ...f.logs].join('\n'));
    assert.equal(JSON.parse(f.logs[0]).dryRun, true);
    assert.equal(await readFile(f.settingsFile, 'utf8'), f.settingsText);
    assert.deepEqual(await readdir(f.rootDir, { recursive: true }), before);
  });
}

for (const isolated of [false, true]) {
  for (const [target, modelId] of [['auto', 'concrete'], ['model:alternate', 'alternate'], ['group:x', 'alternate'], ['model:group%3Ax', 'group:x']]) {
    test(`connect command forwards ${target} without writes (isolated=${isolated})`, async (t) => {
      const f = await connectFixture(t);
      const before = await readdir(f.rootDir, { recursive: true });
      const parsed = parseModelRouterArgs(['model-router', 'connect', '--target', target, '--client', 'claude', '--dry-run', '--json', ...(isolated ? ['--isolated'] : [])]);
      const result = await runModelRouterCommand({ ...parsed.options, home: f.home, stateDir: f.stateDir }, { registryRoot: f.rootDir, io: f.io });
      assert.equal(result.exitCode, 0, [...f.errors, ...f.logs].join('\n'));
      const preview = JSON.parse(f.logs[0]);
      assert.equal(preview.dryRun, true);
      assert.deepEqual(preview.targets, { claude: target });
      assert.deepEqual(preview.routes, { claude: modelId });
      assert.equal(await readFile(f.file, 'utf8'), f.text);
      assert.equal(await readFile(f.settingsFile, 'utf8'), f.settingsText);
      assert.deepEqual(await readdir(f.rootDir, { recursive: true }), before);
    });
  }

  test(`connect command rejects an empty target without falling back to Auto (isolated=${isolated})`, async (t) => {
    const f = await connectFixture(t);
    const before = await readdir(f.rootDir, { recursive: true });
    const parsed = parseModelRouterArgs(['model-router', 'connect', '--target', '', '--client', 'claude', '--dry-run', '--json', ...(isolated ? ['--isolated'] : [])]);
    assert.equal(parsed.options.target, '');
    const result = await runModelRouterCommand({ ...parsed.options, home: f.home, stateDir: f.stateDir }, { registryRoot: f.rootDir, io: f.io });
    assert.equal(result.exitCode, 1);
    const preview = JSON.parse(f.logs[0]);
    assert.equal(preview.error, 'invalid_target');
    assert.equal(preview.dryRun, true);
    assert.deepEqual(preview.routes, {});
    assert.equal(await readFile(f.file, 'utf8'), f.text);
    assert.equal(await readFile(f.settingsFile, 'utf8'), f.settingsText);
    assert.deepEqual(await readdir(f.rootDir, { recursive: true }), before);
  });
}
