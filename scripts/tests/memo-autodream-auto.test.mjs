import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AUTODREAM_AUTO_ENV,
  AUTODREAM_IDLE_MINUTES_ENV,
  evaluateAutodreamTrigger,
  runAutodreamPhaseB,
} from '../lib/memo/autodream-auto.mjs';
import { runSessionClose } from '../lib/lifecycle/session-hooks/close.mjs';

const NOW = new Date('2026-09-09T12:00:00.000Z');

async function makeCorpusFixture(eventAgeMinutes) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'autodream-auto-'));
  const eventsDir = path.join(rootDir, '.aios', 'memo', 'file');
  await mkdir(eventsDir, { recursive: true });
  const ts = new Date(NOW.getTime() - eventAgeMinutes * 60000).toISOString();
  const events = [
    { schemaVersion: 1, eventId: 'ev-1', ts, space: 'default', role: 'user', kind: 'memo', text: 'autodream fixture fact one', refs: [], scope: 'project_shared', agent: '', claimStatus: 'verified' },
    { schemaVersion: 1, eventId: 'ev-2', ts, space: 'default', role: 'user', kind: 'memo', text: 'autodream fixture fact two', refs: [], scope: 'project_shared', agent: '', claimStatus: 'verified' },
  ];
  await writeFile(path.join(eventsDir, 'events.jsonl'), `${events.map((event) => JSON.stringify(event)).join('\n')}\n`, 'utf8');
  return rootDir;
}

test('phase b is opt-in: default off reports a reason and never runs', async () => {
  const rootDir = await makeCorpusFixture(600);
  try {
    const gate = await evaluateAutodreamTrigger({ rootDir, now: NOW, trigger: 'idle', env: {} });
    assert.equal(gate.enabled, false);
    assert.equal(gate.shouldRun, false);
    assert.match(gate.reason, /opt-in off/);

    const result = await runAutodreamPhaseB({ rootDir, now: NOW, env: {} });
    assert.equal(result.ran, false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('session-close trigger runs a preview-only dream when enabled', async () => {
  const rootDir = await makeCorpusFixture(0);
  try {
    const result = await runAutodreamPhaseB({ rootDir, now: NOW, trigger: 'session-close', env: { [AUTODREAM_AUTO_ENV]: '1' } });
    assert.equal(result.ran, true);
    assert.equal(result.mode, 'preview');
    assert.match(result.trigger, /session-close/);
    assert.ok(result.dream, 'dream preview result is returned for governance review');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('idle trigger respects the threshold on the newest memo event', async () => {
  const fresh = await makeCorpusFixture(5);
  try {
    const gate = await evaluateAutodreamTrigger({
      rootDir: fresh, now: NOW, trigger: 'idle',
      env: { [AUTODREAM_AUTO_ENV]: '1', [AUTODREAM_IDLE_MINUTES_ENV]: '30' },
    });
    assert.equal(gate.shouldRun, false);
    assert.match(gate.reason, /5m ago < 30m/);
  } finally {
    await rm(fresh, { recursive: true, force: true });
  }

  const stale = await makeCorpusFixture(120);
  try {
    const gate = await evaluateAutodreamTrigger({
      rootDir: stale, now: NOW, trigger: 'idle',
      env: { [AUTODREAM_AUTO_ENV]: '1' },
    });
    assert.equal(gate.shouldRun, true);
    assert.match(gate.reason, /120m >= 30m/);
  } finally {
    await rm(stale, { recursive: true, force: true });
  }
});

test('session close hook carries the autodream outcome without blocking the close', async () => {
  const rootDir = await makeCorpusFixture(0);
  try {
    const off = await runSessionClose({ session: 'default', json: true }, { rootDir, stdout: process.stdout, env: {} });
    assert.equal(off.exitCode, 0);
    assert.equal(off.autodream.ran, false);

    const on = await runSessionClose(
      { session: 'default', json: true },
      { rootDir, stdout: process.stdout, env: { [AUTODREAM_AUTO_ENV]: '1' } },
    );
    assert.equal(on.exitCode, 0);
    assert.equal(on.autodream.ran, true);
    assert.equal(on.autodream.mode, 'preview');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
