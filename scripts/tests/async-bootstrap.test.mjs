import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runAsyncBootstrap } from '../lib/contextdb/async-bootstrap.mjs';

test('async bootstrap writes .facade.json after pack', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'async-bootstrap-test-'));
  const exportsDir = path.join(dir, '.aios', 'context-db', 'exports');
  await mkdir(exportsDir, { recursive: true });

  await writeFile(
    path.join(exportsDir, 'latest-claude-code-context.md'),
    '# Context\n\nstale\n',
    'utf8'
  );

  const sessionsDir = path.join(dir, '.aios', 'context-db', 'sessions');
  const sessionId = 'claude-code-20260419T000000-abc123';
  await mkdir(path.join(sessionsDir, sessionId), { recursive: true });
  await writeFile(
    path.join(sessionsDir, sessionId, 'meta.json'),
    JSON.stringify({ goal: 'test', status: 'running', updated_at: new Date().toISOString() }),
    'utf8'
  );

  const mockPack = async () => ({
    ok: true,
    mode: 'fresh',
    packAbs: path.join(exportsDir, 'latest-claude-code-context.md'),
    contextText: '# Context\n\nfresh\n',
  });

  await runAsyncBootstrap(dir, {
    agent: 'claude-code',
    project: 'aios',
    safeContextPack: mockPack,
  });

  const facadePath = path.join(dir, '.aios', 'context-db', '.facade.json');
  const facadeText = await readFile(facadePath, 'utf8');
  const facade = JSON.parse(facadeText);
  assert.equal(facade.sessionId, sessionId);
  assert.equal(facade.hasStalePack, false);

  await rm(dir, { recursive: true });
});

test('async bootstrap skips refresh when facade is still fresh', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'async-bootstrap-fresh-'));
  const contextDir = path.join(dir, '.aios', 'context-db');
  await mkdir(contextDir, { recursive: true });

  const facadePath = path.join(contextDir, '.facade.json');
  const facade = {
    version: 1,
    generatedAt: new Date().toISOString(),
    ttlSeconds: 3600,
    sessionId: 'claude-code-20260419T000000-abc123',
    goal: 'fresh facade',
    status: 'running',
    lastCheckpointSummary: 'fresh',
    keyRefs: [],
    contextPacketPath: '.aios/context-db/exports/latest-claude-code-context.md',
    hasStalePack: false,
  };
  await writeFile(facadePath, `${JSON.stringify(facade, null, 2)}\n`, 'utf8');

  let packCalls = 0;
  const mockPack = async () => {
    packCalls += 1;
    return {
      ok: true,
      mode: 'fresh',
      packAbs: path.join(contextDir, 'exports', 'latest-claude-code-context.md'),
      contextText: '# Context\n\nfresh\n',
    };
  };

  await runAsyncBootstrap(dir, {
    agent: 'claude-code',
    project: 'aios',
    safeContextPack: mockPack,
  });

  assert.equal(packCalls, 0);
  const afterText = await readFile(facadePath, 'utf8');
  assert.equal(afterText, `${JSON.stringify(facade, null, 2)}\n`);

  await rm(dir, { recursive: true });
});

test('async bootstrap dedupes concurrent refresh runs with a workspace lock', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'async-bootstrap-lock-'));
  const exportsDir = path.join(dir, '.aios', 'context-db', 'exports');
  await mkdir(exportsDir, { recursive: true });

  const sessionsDir = path.join(dir, '.aios', 'context-db', 'sessions');
  const sessionId = 'claude-code-20260419T000000-lock';
  await mkdir(path.join(sessionsDir, sessionId), { recursive: true });
  await writeFile(
    path.join(sessionsDir, sessionId, 'meta.json'),
    JSON.stringify({ goal: 'test', status: 'running', updated_at: new Date().toISOString() }),
    'utf8'
  );

  let packCalls = 0;
  let releasePack = null;
  const waitForRelease = new Promise((resolve) => {
    releasePack = resolve;
  });
  const mockPack = async () => {
    packCalls += 1;
    await waitForRelease;
    return {
      ok: true,
      mode: 'fresh',
      packAbs: path.join(exportsDir, 'latest-claude-code-context.md'),
      contextText: '# Context\n\nfresh\n',
    };
  };

  const firstRun = runAsyncBootstrap(dir, {
    agent: 'claude-code',
    project: 'aios',
    safeContextPack: mockPack,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const secondRun = runAsyncBootstrap(dir, {
    agent: 'claude-code',
    project: 'aios',
    safeContextPack: mockPack,
  });
  releasePack();

  await Promise.all([firstRun, secondRun]);
  assert.equal(packCalls, 1);

  await rm(dir, { recursive: true });
});
