import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { stripTypeScriptTypes, syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  commitRegistrySnapshot,
  readRegistrySnapshot,
  registryHash,
  withRegistryWriteLock,
} from '../../../../apps/shell/ui/src/lib/config/model-registry-store.mjs';
import { loadRegistry, saveRegistryDocument } from '../../../lib/tooling/model-router/entry/registry.mjs';
import { runConnect, runConnectInplace, runDisconnect } from '../../../lib/tooling/model-router/connect/command.mjs';

const commandUrl = new URL('../../../lib/tooling/model-router/entry/command.mjs', import.meta.url);
const storeUrl = new URL('../../../../apps/shell/ui/src/lib/config/model-registry-store.mjs', import.meta.url);
const routeUrl = new URL('../../../../apps/shell/ui/src/app/api/config/model-routing/route.ts', import.meta.url);
let source = fs.readFileSync(routeUrl, 'utf8');
for (const name of ['model-routing', 'model-registry-store']) {
  source = source.replace(`'../../../../lib/config/${name}.mjs'`, JSON.stringify(new URL(`${name}.mjs`, storeUrl).href));
}
const executable = stripTypeScriptTypes(source, { sourceUrl: routeUrl.href });
const { GET, PUT } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}`);

const serialize = (document) => `${JSON.stringify(document, null, 2)}\n`;
const base = () => ({
  models: { curated: { label: 'Curated', protocols: ['openai-response'], strengths: ['code'] } },
  providers: { relay: { baseUrl: 'https://fake.example.invalid', authMode: 'none', protocols: ['openai-response'], models: ['curated'] } },
  clientRoleMatrix: { default: { implementer: 'curated' }, clients: {} },
  extensionMetadata: { revision: 1 },
});

function fixture(t, seeded = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aios-model-routing-race-'));
  const file = path.join(root, 'memory/specs/model-registry.json');
  const seedFile = path.join(root, 'scripts/lib/tooling/specs/registry/model-registry.json');
  const backupDir = path.join(root, '.aios/config-backups');
  const text = serialize(base());
  fs.mkdirSync(path.dirname(seeded ? seedFile : file), { recursive: true });
  fs.writeFileSync(seeded ? seedFile : file, text);
  const previous = process.env.AIOS_PROJECT_ROOT;
  process.env.AIOS_PROJECT_ROOT = root;
  t.after(() => {
    if (previous === undefined) delete process.env.AIOS_PROJECT_ROOT;
    else process.env.AIOS_PROJECT_ROOT = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, file, seedFile, backupDir, text };
}

function worker(t, root, program) {
  const child = spawn(process.execPath, ['--input-type=module', '--eval', program], {
    cwd: root,
    env: { HOME: root, TMPDIR: os.tmpdir(), FIXTURE_ROOT: root },
    stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  });
  const ready = Promise.withResolvers();
  const done = Promise.withResolvers();
  const closed = Promise.withResolvers();
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data; });
  child.on('message', (message) => (message.type === 'ready' ? ready : done).resolve(message));
  child.on('error', (error) => { ready.reject(error); done.reject(error); closed.reject(error); });
  child.on('close', (code) => {
    if (code !== 0) {
      const error = new Error(`fixture child exited ${code}: ${stderr}`);
      ready.reject(error);
      done.reject(error);
    }
    closed.resolve();
  });
  t.after(async () => {
    if (child.exitCode === null) child.kill();
    await closed.promise;
  });
  return { child, ready: ready.promise, done: done.promise, closed: closed.promise };
}

function refreshWorker(t, root) {
  return worker(t, root, `
    import { once } from 'node:events';
    import { runModelRouterCommand } from ${JSON.stringify(commandUrl.href)};
    globalThis.fetch = async (url) => {
      if (url !== 'https://fake.example.invalid/openai/v1/models') throw new Error('unexpected fake URL');
      process.send({ type: 'ready' });
      await once(process, 'message');
      return new Response(JSON.stringify({ data: [{ id: 'new-discovered' }] }));
    };
    const logs = [], errors = [];
    const result = await runModelRouterCommand({ subcommand: 'models', refresh: true, json: true }, {
      registryRoot: process.env.FIXTURE_ROOT,
      io: { log: (text) => logs.push(text), error: (text) => errors.push(text) },
    });
    process.send({ type: 'done', result, logs, errors });
    process.disconnect();
  `);
}

const put = (editable, hash) => PUT(new Request('http://localhost/api/config/model-routing', {
  method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ editable, expectedHash: hash }),
}));
const backupNames = (f) => fs.existsSync(f.backupDir) ? fs.readdirSync(f.backupDir) : [];
const connectOptions = (f) => ({
  gatewayUrl: 'http://127.0.0.1:8686', stateDir: path.join(f.root, 'isolated-connect'),
  registryFile: f.file, baseRegistry: base(), clients: ['codex'], codexModel: 'curated',
  io: { log() {}, error() {} },
});

for (const seeded of [false, true]) {
  test(`CLI discovery awaiting fake fetch cannot overwrite a concurrent UI save (${seeded ? 'seeded' : 'saved'})`, { timeout: 15_000 }, async (t) => {
    const f = fixture(t, seeded);
    const loaded = await (await GET()).json();
    const refresh = refreshWorker(t, f.root);
    await refresh.ready;
    loaded.editable.providers[0].baseUrl = 'https://edited.example.invalid';
    loaded.editable.matrix.default.reviewer = 'curated';
    const saved = await put(loaded.editable, loaded.hash);
    assert.equal(saved.status, 200);
    const savedText = fs.readFileSync(f.file, 'utf8');
    refresh.child.send('finish-fake-fetch');
    const { result, logs, errors } = await refresh.done;
    await refresh.closed;
    assert.equal(result.exitCode, 1);
    assert.deepEqual(logs, [], 'a rejected discovery must not claim success');
    assert.match(errors.join('\n'), /registry changed.*reload/u);
    assert.equal(fs.readFileSync(f.file, 'utf8'), savedText, 'the complete concurrent UI document survives');
    assert.equal(backupNames(f).length, seeded ? 0 : 1, 'rejected discovery creates no backup');
    if (!seeded) assert.equal(fs.readFileSync(path.join(f.backupDir, backupNames(f)[0]), 'utf8'), f.text);
    assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
  });

  test(`CLI discovery commits atomically with correct backup semantics (${seeded ? 'seeded' : 'saved'})`, { timeout: 15_000 }, async (t) => {
    const f = fixture(t, seeded);
    const refresh = refreshWorker(t, f.root);
    await refresh.ready;
    refresh.child.send('finish-fake-fetch');
    const { result, logs, errors } = await refresh.done;
    await refresh.closed;
    assert.equal(result.exitCode, 0);
    assert.deepEqual(errors, []);
    assert.equal(JSON.parse(logs[0]).added, 1);
    const document = JSON.parse(fs.readFileSync(f.file, 'utf8'));
    assert.equal(document.models['new-discovered'].source, 'discovered');
    assert.equal(document.models['new-discovered'].provider, 'relay');
    assert.equal(document.models['new-discovered'].upstreamModel, 'new-discovered');
    assert.deepEqual(document.models['new-discovered'].protocols, ['openai-response']);
    assert.deepEqual(document.models.curated, base().models.curated);
    assert.equal(backupNames(f).length, seeded ? 0 : 1);
    if (!seeded) assert.equal(fs.readFileSync(path.join(f.backupDir, backupNames(f)[0]), 'utf8'), f.text);
    assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
  });
}

test('discovery rejects built-in drift while the registry is still missing', { timeout: 15_000 }, async (t) => {
  const f = fixture(t, true);
  const refresh = refreshWorker(t, f.root);
  await refresh.ready;
  fs.writeFileSync(f.seedFile, `${f.text}\n`);
  refresh.child.send('finish-fake-fetch');
  assert.equal((await refresh.done).result.exitCode, 1);
  await refresh.closed;
  assert.equal(fs.existsSync(f.file), false);
  assert.deepEqual(backupNames(f), []);
});

for (const writer of ['UI', 'CLI']) {
  test(`${writer} waits for another process's lock and checks fresh bytes after acquiring it`, { timeout: 15_000 }, async (t) => {
    const f = fixture(t);
    const loaded = await (await GET()).json();
    const holder = worker(t, f.root, `
      import { once } from 'node:events';
      import { withRegistryWriteLock, readRegistrySnapshot, commitRegistrySnapshot } from ${JSON.stringify(storeUrl.href)};
      const file = ${JSON.stringify(f.file)};
      await withRegistryWriteLock(file, async () => {
        const current = await readRegistrySnapshot(file);
        process.send({ type: 'ready' });
        await once(process, 'message');
        const next = JSON.parse(current.text);
        next.extensionMetadata.revision = 2;
        await commitRegistrySnapshot(current, JSON.stringify(next));
      });
      process.send({ type: 'done' });
      process.disconnect();
    `);
    await holder.ready;
    let entered = false;
    await assert.rejects(withRegistryWriteLock(f.file, () => { entered = true; }, { timeoutMs: 0 }), { code: 'REGISTRY_LOCKED' });
    assert.equal(entered, false, 'contention fails closed without stealing the lock');

    // Observe the real EEXIST, not a sleep: release the child only after the writer hits its lock.
    const contended = Promise.withResolvers();
    const mkdir = fs.promises.mkdir;
    fs.promises.mkdir = async (...args) => {
      try { return await mkdir(...args); } catch (error) {
        if (String(args[0]).endsWith('.write-lock') && error.code === 'EEXIST') contended.resolve();
        throw error;
      }
    };
    t.after(() => { fs.promises.mkdir = mkdir; });
    loaded.editable.matrix.default.reviewer = 'curated';
    const saving = writer === 'UI' ? put(loaded.editable, loaded.hash)
      : saveRegistryDocument({ ...base(), activeModel: 'curated' }, { rootDir: f.root, expectedHash: loaded.hash, backupDir: f.backupDir });
    const outcome = saving.then((value) => ({ value }), (error) => ({ error }));
    await contended.promise;
    fs.promises.mkdir = mkdir;
    holder.child.send('commit-and-release');
    const response = await outcome;
    if (writer === 'UI') assert.equal(response.value.status, 409);
    else assert.equal(response.error.code, 'REGISTRY_STALE');
    await holder.done;
    await holder.closed;
    assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).extensionMetadata.revision, 2);
    assert.deepEqual(backupNames(f), []);
    assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
  });
}

for (const seeded of [false, true]) {
  test(`verification failure restores the ${seeded ? 'absent' : 'saved'} registry under the lock`, async (t) => {
    const f = fixture(t, seeded);
    await assert.rejects(withRegistryWriteLock(f.file, async () => {
      const current = await readRegistrySnapshot(f.file, f.seedFile);
      let validations = 0;
      return commitRegistrySnapshot(current, serialize({ ...base(), activeModel: 'curated' }), {
        backupDir: f.backupDir,
        validateText(text) {
          JSON.parse(text);
          if (++validations === 2) throw new Error('injected post-write verification failure');
        },
      });
    }), { code: 'REGISTRY_VERIFICATION_FAILED' });
    assert.equal(fs.existsSync(f.file), !seeded);
    assert.equal(fs.readFileSync(seeded ? f.seedFile : f.file, 'utf8'), f.text);
    assert.equal(backupNames(f).length, seeded ? 0 : 1);
    assert.deepEqual(fs.readdirSync(path.dirname(f.file)), seeded ? [] : ['model-registry.json']);
  });

  for (const writer of ['UI', 'CLI']) {
    test(`${writer} preserves an external replacement during verification (${seeded ? 'seeded' : 'saved'})`, async (t) => {
      const f = fixture(t, seeded);
      const externalText = serialize({ ...base(), clientDefaults: { codex: 'external-model' }, externalMetadata: true });
      const loaded = await (await GET()).json();
      loaded.editable.matrix.default.reviewer = 'curated';
      const readFile = fs.promises.readFile;
      let reads = 0;
      fs.promises.readFile = async (file, ...args) => {
        if (String(file) === f.file && ++reads === 2) fs.writeFileSync(f.file, externalText);
        return readFile(file, ...args);
      };
      try {
        if (writer === 'UI') assert.equal((await put(loaded.editable, loaded.hash)).status, 409);
        else await assert.rejects(saveRegistryDocument({ ...base(), activeModel: 'curated' }, {
          rootDir: f.root, expectedHash: registryHash(f.text), backupDir: f.backupDir,
        }), { code: 'REGISTRY_STALE' });
      } finally {
        fs.promises.readFile = readFile;
      }
      assert.equal(fs.readFileSync(f.file, 'utf8'), externalText, 'neither rollback nor seeded unlink may destroy external bytes');
      assert.equal(backupNames(f).length, seeded ? 0 : 1);
      assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
    });

    test(`${writer} preserves disk state when verification cannot read it (${seeded ? 'seeded' : 'saved'})`, async (t) => {
      const f = fixture(t, seeded);
      const next = { ...base(), activeModel: 'curated' };
      const readFile = fs.promises.readFile;
      let reads = 0;
      fs.promises.readFile = async (file, ...args) => {
        if (String(file) === f.file && ++reads === 2) throw Object.assign(new Error('injected unreadable verification'), { code: 'EACCES' });
        return readFile(file, ...args);
      };
      try {
        const saving = writer === 'CLI' ? saveRegistryDocument(next, { rootDir: f.root })
          : withRegistryWriteLock(f.file, async () => commitRegistrySnapshot(await readRegistrySnapshot(f.file, f.seedFile), serialize(next)));
        await assert.rejects(saving, { code: 'REGISTRY_VERIFICATION_FAILED' });
      } finally {
        fs.promises.readFile = readFile;
      }
      assert.equal(fs.readFileSync(f.file, 'utf8'), serialize(next), 'unknown verification state must not trigger a destructive rollback');
      assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
    });

    test(`real connect waits through ${writer} verification and merges the committed document (${seeded ? 'seeded' : 'saved'})`, { timeout: 15_000 }, async (t) => {
      const f = fixture(t, seeded);
      const loaded = await (await GET()).json();
      loaded.editable.matrix.default.reviewer = 'curated';
      const readFile = fs.promises.readFile;
      const mkdir = fs.promises.mkdir;
      const contended = Promise.withResolvers();
      let connecting;
      let reads = 0;
      fs.promises.mkdir = async (...args) => {
        try { return await mkdir(...args); } catch (error) {
          if (String(args[0]).endsWith('.write-lock') && error.code === 'EEXIST') contended.resolve();
          throw error;
        }
      };
      fs.promises.readFile = async (file, ...args) => {
        if (String(file) === f.file && ++reads === 2) {
          connecting = runConnect(connectOptions(f));
          // Observe real lock contention before allowing post-write verification to proceed.
          await contended.promise;
          assert.equal(fs.existsSync(path.join(connectOptions(f).stateDir, 'connect-state.json')), false);
        }
        return readFile(file, ...args);
      };
      try {
        if (writer === 'UI') assert.equal((await put(loaded.editable, loaded.hash)).status, 200);
        else await saveRegistryDocument({ ...base(), activeModel: 'curated' }, { rootDir: f.root, expectedHash: loaded.hash });
        assert.ok(connecting, 'connect must begin inside verification, not after save completion');
        assert.equal((await connecting).exitCode, 0);
      } finally {
        fs.promises.readFile = readFile;
        fs.promises.mkdir = mkdir;
      }
      const document = JSON.parse(fs.readFileSync(f.file, 'utf8'));
      assert.equal(document.clientDefaults.codex, 'curated');
      if (writer === 'UI') assert.equal(document.clientRoleMatrix.default.reviewer, 'curated');
      else assert.equal(document.activeModel, 'curated');
      assert.deepEqual(document.extensionMetadata, base().extensionMetadata);
      const state = JSON.parse(fs.readFileSync(path.join(connectOptions(f).stateDir, 'connect-state.json'), 'utf8'));
      assert.equal(state.codexModel, document.clientDefaults.codex, 'successful connect state and registry must agree');
      assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
    });
  }

  test(`async validation failure never rolls back a later external document (${seeded ? 'seeded' : 'saved'})`, async (t) => {
    const f = fixture(t, seeded);
    const externalText = serialize({ ...base(), clientDefaults: { codex: 'external-model' } });
    let validations = 0;
    await assert.rejects(withRegistryWriteLock(f.file, async () => commitRegistrySnapshot(
      await readRegistrySnapshot(f.file, f.seedFile), serialize({ ...base(), activeModel: 'curated' }), {
        async validateText(text) {
          JSON.parse(text);
          if (++validations === 2) {
            await fs.promises.writeFile(f.file, externalText);
            throw new Error('injected async validation failure');
          }
        },
      },
    )), { code: 'REGISTRY_STALE' });
    assert.equal(fs.readFileSync(f.file, 'utf8'), externalText);
  });
}

test('disconnect waits for the cross-process registry lock and preserves unrelated fresh edits', { timeout: 15_000 }, async (t) => {
  const f = fixture(t);
  await runConnect(connectOptions(f));
  const holder = worker(t, f.root, `
    import { once } from 'node:events';
    import { withRegistryWriteLock, readRegistrySnapshot, commitRegistrySnapshot } from ${JSON.stringify(storeUrl.href)};
    await withRegistryWriteLock(${JSON.stringify(f.file)}, async () => {
      const current = await readRegistrySnapshot(${JSON.stringify(f.file)});
      const next = JSON.parse(current.text);
      next.extensionMetadata.revision = 3;
      next.clientDefaults.pi = 'fresh-pi-default';
      process.send({ type: 'ready' });
      await once(process, 'message');
      await commitRegistrySnapshot(current, JSON.stringify(next));
    });
    process.send({ type: 'done' });
    process.disconnect();
  `);
  await holder.ready;
  const mkdir = fs.promises.mkdir;
  const contended = Promise.withResolvers();
  fs.promises.mkdir = async (...args) => {
    try { return await mkdir(...args); } catch (error) {
      if (String(args[0]).endsWith('.write-lock') && error.code === 'EEXIST') contended.resolve();
      throw error;
    }
  };
  t.after(() => { fs.promises.mkdir = mkdir; });
  const disconnecting = runDisconnect(connectOptions(f));
  await contended.promise;
  holder.child.send('commit-and-release');
  assert.equal((await disconnecting).exitCode, 0);
  await holder.done;
  await holder.closed;
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file, 'utf8')), {
    ...base(), extensionMetadata: { revision: 3 }, clientDefaults: { pi: 'fresh-pi-default' },
  });
  assert.equal(fs.existsSync(connectOptions(f).stateDir), false);
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
});

for (const subcommand of ['group-add', 'group-rm', 'import-providers']) {
  test(`${subcommand} rejects its stale snapshot after waiting for a concurrent writer`, { timeout: 15_000 }, async (t) => {
    const f = fixture(t);
    fs.mkdirSync(path.join(f.root, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(f.root, '.claude/settings.json'), JSON.stringify({ env: { ANTHROPIC_BASE_URL: 'https://import.example.invalid' } }));
    let mutation;
    let committed;
    await withRegistryWriteLock(f.file, async () => {
      const current = await readRegistrySnapshot(f.file);
      mutation = worker(t, f.root, `
        import fs from 'node:fs';
        import { runModelRouterCommand } from ${JSON.stringify(commandUrl.href)};
        const mkdir = fs.promises.mkdir;
        let reported = false;
        fs.promises.mkdir = async (...args) => {
          try { return await mkdir(...args); } catch (error) {
            if (!reported && String(args[0]).endsWith('.write-lock') && error.code === 'EEXIST') {
              reported = true;
              process.send({ type: 'ready' });
            }
            throw error;
          }
        };
        const logs = [], errors = [];
        const result = await runModelRouterCommand({ subcommand: ${JSON.stringify(subcommand)}, id: 'fixture-group', models: 'curated', home: process.env.FIXTURE_ROOT }, {
          registryRoot: process.env.FIXTURE_ROOT,
          io: { log: text => logs.push(text), error: text => errors.push(text) },
        });
        process.send({ type: 'done', result, logs, errors });
        process.disconnect();
      `);
      await mutation.ready;
      committed = serialize({ ...base(), extensionMetadata: { revision: 4 }, clientDefaults: { codex: 'curated' } });
      await commitRegistrySnapshot(current, committed);
    });
    const { result, logs, errors } = await mutation.done;
    await mutation.closed;
    assert.equal(result.exitCode, 1);
    assert.deepEqual(logs, []);
    assert.match(errors.join('\n'), /registry changed.*reload/u);
    assert.equal(fs.readFileSync(f.file, 'utf8'), committed);
    assert.deepEqual(backupNames(f), []);
    assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
  });
}

test('in-place disconnect lock timeout preserves client backups and allows a complete retry', { timeout: 15_000 }, async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.file, serialize({ ...base(), clientDefaults: { codex: 'original-codex' } }));
  const options = { ...connectOptions(f), home: path.join(f.root, 'fixture-home') };
  await runConnectInplace(options);
  const files = [f.file, path.join(options.home, '.codex/config.toml'),
    path.join(options.stateDir, 'connect-state.json'), path.join(options.stateDir, 'connect-backup.json')];
  const before = files.map(file => fs.readFileSync(file, 'utf8'));
  const lock = `${f.file}.write-lock`;
  fs.mkdirSync(lock);
  try {
    await assert.rejects(runDisconnect(options), { code: 'REGISTRY_LOCKED' });
    assert.deepEqual(files.map(file => fs.readFileSync(file, 'utf8')), before, 'a timeout must not consume backups or change client/registry bytes');
  } finally {
    fs.rmdirSync(lock);
  }
  assert.equal((await runDisconnect(options)).exitCode, 0);
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).clientDefaults.codex, 'original-codex');
  assert.equal(fs.existsSync(path.join(options.home, '.codex/config.toml')), false);
  assert.equal(fs.existsSync(path.join(options.stateDir, 'connect-state.json')), false);
  assert.equal(fs.existsSync(path.join(options.stateDir, 'connect-backup.json')), false);
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
});

test('concurrent in-place disconnect waits for connect state persistence before consuming client backups', { timeout: 15_000 }, async (t) => {
  const f = fixture(t);
  const original = { ...base(), clientDefaults: { codex: 'original-codex', pi: 'original-pi' } };
  fs.writeFileSync(f.file, serialize(original));
  const options = { ...connectOptions(f), home: path.join(f.root, 'fixture-home') };
  const stateFile = path.join(options.stateDir, 'connect-state.json');
  const rename = fs.promises.rename;
  const written = Promise.withResolvers();
  const release = Promise.withResolvers();
  fs.promises.rename = async (...args) => {
    const result = await rename(...args);
    if (args[1] === f.file) {
      written.resolve();
      await release.promise;
    }
    return result;
  };
  syncBuiltinESMExports();
  t.after(() => { fs.promises.rename = rename; syncBuiltinESMExports(); release.resolve(); });
  const connecting = runConnectInplace(options);
  await Promise.race([written.promise, connecting.then(() => { throw new Error('connect completed without the registry-write checkpoint'); })]);
  const pending = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(pending.codexDefaultStatus, 'pending', 'recovery ownership is durable before registry replacement completes');
  assert.deepEqual(pending.priorClientDefaults, original.clientDefaults);
  const files = [f.file, path.join(options.home, '.codex/config.toml'), path.join(options.stateDir, 'connect-backup.json'), stateFile];
  const before = files.map(file => fs.readFileSync(file, 'utf8'));
  const contender = worker(t, f.root, `
    import fs from 'node:fs';
    import { runDisconnect } from ${JSON.stringify(new URL('../../../lib/tooling/model-router/connect/command.mjs', import.meta.url).href)};
    const mkdir = fs.promises.mkdir;
    let reported = false;
    fs.promises.mkdir = async (...args) => {
      try { return await mkdir(...args); } catch (error) {
        if (!reported && String(args[0]).endsWith('.write-lock') && error.code === 'EEXIST') {
          reported = true;
          process.send({ type: 'ready' });
        }
        throw error;
      }
    };
    const result = await runDisconnect({ stateDir: ${JSON.stringify(options.stateDir)}, registryFile: ${JSON.stringify(f.file)}, io: { log() {}, error() {} } });
    process.send({ type: 'done', result });
    process.disconnect();
  `);
  await contender.ready;
  assert.deepEqual(files.map(file => fs.readFileSync(file, 'utf8')), before, 'waiting disconnect must not consume client backups');
  release.resolve();
  assert.equal((await connecting).exitCode, 0);
  assert.equal((await contender.done).result.exitCode, 0);
  await contender.closed;
  assert.deepEqual(JSON.parse(fs.readFileSync(f.file, 'utf8')), original);
  assert.equal(fs.existsSync(stateFile), false);
  assert.equal(fs.existsSync(files[1]), false);
  assert.equal(fs.existsSync(files[2]), false);
  assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
});

test('CLI reads fresh bytes and fails closed on invalid data rather than returning cached state', async (t) => {
  const f = fixture(t);
  assert.deepEqual(await loadRegistry({ rootDir: f.root }), base());
  fs.writeFileSync(f.file, '{bad');
  await assert.rejects(loadRegistry({ rootDir: f.root }), SyntaxError);
  await assert.rejects(saveRegistryDocument(base(), { rootDir: f.root, expectedHash: registryHash(f.text), backupDir: f.backupDir }), SyntaxError);
  assert.equal(fs.readFileSync(f.file, 'utf8'), '{bad');
  assert.deepEqual(backupNames(f), []);
});
