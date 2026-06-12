import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadFacade, FACADE_FILENAME, generateFacadeFromSession } from '../lib/contextdb/facade.mjs';

test('loadFacade returns facade when file exists and is fresh', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'facade-test-'));
  const facadeDir = path.join(dir, '.aios', 'context-db');
  await mkdir(facadeDir, { recursive: true });
  const facadePath = path.join(facadeDir, FACADE_FILENAME);
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    ttlSeconds: 3600,
    sessionId: 'claude-code-20260419T000000-abc123',
    goal: 'test goal',
    status: 'running',
    lastCheckpointSummary: 'test summary',
    keyRefs: ['a.mjs'],
    handoffPath: '.aios/context-db/sessions/claude-code-20260419T000000-abc123/handoff.json',
  };
  await writeFile(facadePath, JSON.stringify(payload), 'utf8');

  const result = await loadFacade(dir);
  assert.equal(result.ok, true);
  assert.equal(result.facade.sessionId, payload.sessionId);

  await rm(dir, { recursive: true });
});

test('loadFacade returns ok=false when facade is expired', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'facade-test-'));
  const facadePath = path.join(dir, FACADE_FILENAME);
  const payload = {
    version: 1,
    generatedAt: new Date(Date.now() - 7200_000).toISOString(),
    ttlSeconds: 3600,
    sessionId: 'old',
    goal: 'old goal',
    status: 'running',
    lastCheckpointSummary: '',
    keyRefs: [],
    handoffPath: '',
  };
  await writeFile(facadePath, JSON.stringify(payload), 'utf8');

  const result = await loadFacade(dir);
  assert.equal(result.ok, false);

  await rm(dir, { recursive: true });
});

test('loadFacade returns ok=false when file missing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'facade-test-'));
  const result = await loadFacade(dir);
  assert.equal(result.ok, false);
  await rm(dir, { recursive: true });
});


test('loadFacade overlays continuity sidecar for fresh cached facade', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'facade-test-'));
  const sessionId = 'claude-code-20260425T000000-continuity';
  const facadeDir = path.join(dir, '.aios', 'context-db');
  const sessionDir = path.join(facadeDir, 'sessions', sessionId);
  await mkdir(sessionDir, { recursive: true });

  await writeFile(
    path.join(facadeDir, FACADE_FILENAME),
    JSON.stringify({
      version: 1,
      generatedAt: new Date().toISOString(),
      ttlSeconds: 3600,
      sessionId,
      goal: 'cached lazy session',
      status: 'running',
      lastCheckpointSummary: 'cached checkpoint',
      keyRefs: [],
      handoffPath: '.aios/context-db/sessions/claude-code-20260425T000000-continuity/handoff.json',
    }),
    'utf8'
  );
  await writeFile(
    path.join(sessionDir, 'continuity.json'),
    JSON.stringify({
      schemaVersion: 1,
      sessionId,
      intent: 'continue from cached facade',
      summary: 'Fresh continuity should be exposed without bootstrap refresh.',
      touchedFiles: ['scripts/lib/contextdb/facade.mjs'],
      nextActions: ['resume from sidecar'],
      updatedAt: '2026-04-25T00:00:00.000Z',
    }),
    'utf8'
  );

  const result = await loadFacade(dir);
  assert.equal(result.ok, true);
  assert.equal(result.facade.continuitySummary, 'Fresh continuity should be exposed without bootstrap refresh.');
  assert.deepEqual(result.facade.continuityNextActions, ['resume from sidecar']);
  assert.equal(result.facade.continuityUpdatedAt, '2026-04-25T00:00:00.000Z');

  await rm(dir, { recursive: true });
});

test('generateFacadeFromSession extracts header from latest session', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'facade-test-'));
  const sessionsDir = path.join(dir, '.aios', 'context-db', 'sessions');
  const sessionId = 'claude-code-20260419T000000-abc123';
  await mkdir(path.join(sessionsDir, sessionId), { recursive: true });
  const meta = {
    goal: 'shared session',
    status: 'running',
    updated_at: new Date().toISOString(),
    lastCheckpoint: { summary: 'checkpoint summary' },
  };
  await writeFile(
    path.join(sessionsDir, sessionId, 'meta.json'),
    JSON.stringify(meta),
    'utf8'
  );
  await writeFile(
    path.join(sessionsDir, sessionId, 'continuity.json'),
    JSON.stringify({
      schemaVersion: 1,
      sessionId,
      intent: 'continue facade test',
      summary: 'Facade should expose continuity.',
      touchedFiles: ['scripts/lib/contextdb/facade.mjs'],
      nextActions: ['show explicit resume summary'],
      updatedAt: '2026-04-25T00:00:00.000Z',
    }),
    'utf8'
  );

  const facade = await generateFacadeFromSession(dir, 'claude-code', 'aios');
  assert.equal(facade.sessionId, sessionId);
  assert.equal(facade.goal, 'shared session');
  assert.equal(facade.status, 'running');
  assert.equal(facade.lastCheckpointSummary, 'checkpoint summary');
  assert.equal(facade.continuitySummary, 'Facade should expose continuity.');
  assert.deepEqual(facade.continuityNextActions, ['show explicit resume summary']);

  await rm(dir, { recursive: true });
});
