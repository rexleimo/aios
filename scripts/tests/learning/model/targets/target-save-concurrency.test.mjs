import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { loadRegistrySnapshot, registryFilePath, saveRegistryDocument } from '../../../../lib/tooling/model-router/entry/registry.mjs';
import { runConnect, runDisconnect } from '../../../../lib/tooling/model-router/connect/command.mjs';

const serialize = (document) => `${JSON.stringify(document, null, 2)}\n`;

function fixture(t, seeded) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'target-save-race-'));
  t.after(() => fs.rmSync(rootDir, { recursive: true, force: true }));
  const file = registryFilePath({ rootDir });
  const seedFile = path.join(rootDir, 'scripts/lib/tooling/specs/registry/model-registry.json');
  const document = {
    activeModel: 'curated',
    models: { curated: { source: 'custom', provider: 'fixture', protocols: ['openai-response'] } },
    providers: { fixture: { baseUrl: 'http://127.0.0.1:9', authMode: 'none', protocols: ['openai-response'] } },
    clientRoleMatrix: { default: { implementer: 'curated' }, clients: {} },
    extensionMetadata: { revision: 1 },
  };
  fs.mkdirSync(path.dirname(seeded ? seedFile : file), { recursive: true });
  fs.writeFileSync(seeded ? seedFile : file, serialize(document));
  return { rootDir, file, seedFile, document, backupDir: path.join(rootDir, 'backups'), stateDir: path.join(rootDir, 'state') };
}

function canonical(document) {
  return {
    ...document, activeModel: 'model:curated', targetRefVersion: 1,
    clientRoleMatrix: { ...document.clientRoleMatrix, default: Object.fromEntries(Object.keys(document.clientRoleMatrix.default).map((role) => [role, 'model:curated'])) },
  };
}

for (const seeded of [false, true]) {
  test(`unreadable native verification preserves canonical committed bytes (${seeded ? 'seeded' : 'saved'})`, async (t) => {
    const f = fixture(t, seeded);
    const snapshot = await loadRegistrySnapshot(f);
    const next = { ...snapshot.document, extensionMetadata: { revision: 2 } };
    const readFile = fs.promises.readFile;
    let reads = 0;
    fs.promises.readFile = async (file, ...args) => {
      if (String(file) === f.file && ++reads === 2) throw Object.assign(new Error('injected unreadable verification'), { code: 'EACCES' });
      return readFile(file, ...args);
    };
    try {
      await assert.rejects(saveRegistryDocument(next, { ...f, expectedHash: snapshot.hash }), { code: 'REGISTRY_VERIFICATION_FAILED' });
    } finally {
      fs.promises.readFile = readFile;
    }
    assert.equal(fs.readFileSync(f.file, 'utf8'), serialize(canonical(next)));
    assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
    if (seeded) {
      assert.equal(fs.readFileSync(f.seedFile, 'utf8'), snapshot.text);
      assert.equal(fs.existsSync(f.backupDir), false);
    } else {
      const backups = fs.readdirSync(f.backupDir);
      assert.equal(backups.length, 1);
      assert.equal(fs.readFileSync(path.join(f.backupDir, backups[0]), 'utf8'), snapshot.text);
    }
  });

  test(`connect waits through native verification and preserves canonical assignments (${seeded ? 'seeded' : 'saved'})`, { timeout: 15_000 }, async (t) => {
    const f = fixture(t, seeded);
    const snapshot = await loadRegistrySnapshot(f);
    const next = {
      ...snapshot.document, extensionMetadata: { revision: 2 },
      clientRoleMatrix: { default: { implementer: 'curated', reviewer: 'curated' }, clients: {} },
    };
    const options = {
      gatewayUrl: 'http://127.0.0.1:8686', stateDir: f.stateDir, registryFile: f.file,
      baseRegistry: f.document, clients: ['codex'], codexModel: 'curated', io: { log() {}, error() {} },
    };
    const readFile = fs.promises.readFile;
    const mkdir = fs.promises.mkdir;
    const contended = Promise.withResolvers();
    let reads = 0;
    let connecting;
    fs.promises.mkdir = async (...args) => {
      try { return await mkdir(...args); } catch (error) {
        if (String(args[0]).endsWith('.write-lock') && error.code === 'EEXIST') contended.resolve();
        throw error;
      }
    };
    fs.promises.readFile = async (file, ...args) => {
      if (String(file) === f.file && ++reads === 2) {
        connecting = runConnect(options);
        await contended.promise;
        assert.equal(fs.existsSync(path.join(f.stateDir, 'connect-state.json')), false);
      }
      return readFile(file, ...args);
    };
    try {
      await saveRegistryDocument(next, { ...f, expectedHash: snapshot.hash });
      assert.ok(connecting, 'connect starts before native verification releases the lock');
      assert.equal((await connecting).exitCode, 0);
    } finally {
      fs.promises.readFile = readFile;
      fs.promises.mkdir = mkdir;
    }
    const document = JSON.parse(fs.readFileSync(f.file, 'utf8'));
    assert.deepEqual(document, { ...canonical(next), clientDefaults: { codex: 'model:curated' } });
    const state = JSON.parse(fs.readFileSync(path.join(f.stateDir, 'connect-state.json'), 'utf8'));
    assert.equal(state.targetRefVersion, 1);
    assert.deepEqual(state.targets, { codex: 'model:curated' });
    assert.deepEqual(state.resolvedModels, { codex: 'curated' });
    assert.equal(state.appliedCodexModel, document.clientDefaults.codex);
    assert.equal(state.codexDefaultStatus, 'applied');
    assert.deepEqual(fs.readdirSync(path.dirname(f.file)), ['model-registry.json']);
    assert.equal((await runDisconnect({ stateDir: f.stateDir, registryFile: f.file, io: options.io })).exitCode, 0);
    assert.deepEqual(JSON.parse(fs.readFileSync(f.file, 'utf8')), canonical(next));
  });
}
