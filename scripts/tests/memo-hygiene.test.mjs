import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, readFile, writeFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  archiveStaleSessions,
  renderHygieneReport,
  rotateSessionEvents,
  surveyWorkspaceMemoryHygiene,
} from '../lib/memo/hygiene.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.resolve(HERE, '..', 'aios.mjs');
const NOW = new Date('2026-09-09T00:00:00.000Z');

function daysAgoIso(days) {
  return new Date(NOW.getTime() - days * 86400000).toISOString();
}

async function writeSessionFixture(dbRoot, sessionId, { status, updatedAt }, eventTexts = []) {
  const dir = path.join(dbRoot, 'sessions', sessionId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'meta.json'), JSON.stringify({
    schemaVersion: 1,
    sessionId,
    agent: 'fixture',
    status,
    createdAt: updatedAt,
    updatedAt,
  }, null, 2) + '\n', 'utf8');
  const lines = eventTexts.map((text, index) => JSON.stringify({
    seq: index + 1,
    ts: `2026-08-01T00:00:${String(index).padStart(2, '0')}.000Z`,
    text,
  }));
  if (lines.length > 0) {
    await writeFile(path.join(dir, 'l2-events.jsonl'), `${lines.join('\n')}\n`, 'utf8');
  } else {
    await writeFile(path.join(dir, 'l2-events.jsonl'), '', 'utf8');
  }
  return dir;
}

async function makeHygieneFixture() {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'memo-hygiene-'));
  const dbRoot = path.join(rootDir, '.aios', 'context-db');
  await mkdir(dbRoot, { recursive: true });
  await writeSessionFixture(dbRoot, 'codex-cli-20260101T000000-aaaaaaaa', {
    status: 'running', updatedAt: daysAgoIso(30),
  }, ['stale one', 'stale two', 'stale three']);
  await writeSessionFixture(dbRoot, 'agent-20260908T000000Z-bbbbbbbb', {
    status: 'running', updatedAt: daysAgoIso(1),
  }, ['fresh one']);
  await writeSessionFixture(dbRoot, 'workspace-memory--default', {
    status: 'running', updatedAt: daysAgoIso(400),
  }, ['live l1', 'live l2']);
  await writeSessionFixture(dbRoot, 'claude-code-20260501T000000-cccccccc', {
    status: 'closed', updatedAt: daysAgoIso(60),
  }, ['closed one']);
  const ghostDir = path.join(dbRoot, 'sessions', 'ghost-session');
  await mkdir(ghostDir, { recursive: true });
  await writeFile(path.join(ghostDir, 'l2-events.jsonl'), '', 'utf8');
  const pinnedDir = path.join(rootDir, '.aios', 'memo', 'file', 'pinned');
  await mkdir(pinnedDir, { recursive: true });
  await writeFile(path.join(pinnedDir, 'default.md'), `${'x'.repeat(6000)}\n`, 'utf8');
  return rootDir;
}

async function snapshotTree(rootDir) {
  const entries = [];
  async function walk(current) {
    for (const name of (await readdir(current, { withFileTypes: true }))) {
      const full = path.join(current, name.name);
      if (name.isDirectory()) await walk(full);
      else {
        const bytes = await readFile(full);
        entries.push(`${path.relative(rootDir, full).replaceAll('\\', '/')}:${createHash('sha256').update(bytes).digest('hex')}`);
      }
    }
  }
  await walk(rootDir);
  return entries.sort();
}

function findSession(report, sessionId) {
  return report.sessions.find((session) => session.sessionId === sessionId);
}

test('survey is read-only and classifies sessions, pinned, and event sizes', async () => {
  const rootDir = await makeHygieneFixture();
  const before = await snapshotTree(rootDir);
  const first = await surveyWorkspaceMemoryHygiene(rootDir, { now: NOW });
  const second = await surveyWorkspaceMemoryHygiene(rootDir, { now: NOW });
  assert.deepEqual(first, second, 'survey must be deterministic and read-only');
  assert.deepEqual(await snapshotTree(rootDir), before, 'survey must not mutate the tree');

  const stale = findSession(first, 'codex-cli-20260101T000000-aaaaaaaa');
  assert.equal(stale.status, 'running');
  assert.equal(stale.stale, true);
  assert.equal(stale.archivable, true);

  const live = findSession(first, 'workspace-memory--default');
  assert.equal(live.stale, false, 'space-level sessions are never stale despite age');
  assert.equal(live.archivable, false);

  const ghost = findSession(first, 'ghost-session');
  assert.equal(ghost.status, 'unknown');
  assert.equal(ghost.archivable, false, 'unclassifiable sessions are never archivable');

  assert.equal(findSession(first, 'agent-20260908T000000Z-bbbbbbbb').stale, false);
  assert.equal(findSession(first, 'claude-code-20260501T000000-cccccccc').stale, false);

  const pinned = first.pinned.find((entry) => entry.source === 'memo:file:default');
  assert.ok(pinned, `expected memo storage pinned entry in ${JSON.stringify(first.pinned)}`);
  assert.equal(pinned.truncated, true);
  assert.equal(pinned.chars, 6001);
  assert.equal(pinned.maxChars, 5000);
  assert.equal(pinned.remaining, 0);

  const retention = first.eventsRetention.find((entry) => entry.sessionId === 'workspace-memory--default');
  assert.ok(retention, 'expected retention entry for the live session log');
  assert.equal(retention.lines, 2);
  assert.equal(retention.oldestTs, '2026-08-01T00:00:00.000Z');
  assert.equal(retention.newestTs, '2026-08-01T00:00:01.000Z');

  const rendered = renderHygieneReport(first);
  assert.match(rendered, /codex-cli-20260101T000000-aaaaaaaa/);
  assert.match(rendered, /truncated/);
  assert.match(rendered, /bytes/);
});

test('archive moves only archivable sessions into archive and refuses conflicts', async () => {
  const rootDir = await makeHygieneFixture();
  const result = await archiveStaleSessions(rootDir, { now: NOW });
  assert.equal(result.moved.length, 1);
  assert.equal(result.moved[0].sessionId, 'codex-cli-20260101T000000-aaaaaaaa');
  const dbRoot = path.join(rootDir, '.aios', 'context-db');
  assert.ok(!await readdir(path.join(dbRoot, 'sessions')).then((names) => names.includes('codex-cli-20260101T000000-aaaaaaaa')));
  await readFile(path.join(dbRoot, 'archive', 'sessions', 'codex-cli-20260101T000000-aaaaaaaa', 'meta.json'));
  for (const kept of ['workspace-memory--default', 'ghost-session', 'agent-20260908T000000Z-bbbbbbbb', 'claude-code-20260501T000000-cccccccc']) {
    assert.ok(await readdir(path.join(dbRoot, 'sessions')).then((names) => names.includes(kept)), `${kept} must stay`);
  }

  const again = await archiveStaleSessions(rootDir, { now: NOW });
  assert.equal(again.moved.length, 0, 'archiving is idempotent once nothing is stale');

  await writeSessionFixture(dbRoot, 'codex-cli-20260202T000000-dddddddd', {
    status: 'running', updatedAt: daysAgoIso(20),
  }, ['x']);
  await mkdir(path.join(dbRoot, 'archive', 'sessions', 'codex-cli-20260202T000000-dddddddd'), { recursive: true });
  await assert.rejects(
    () => archiveStaleSessions(rootDir, { now: NOW }),
    (error) => error.code === 'AIOS_MEMO_HYGIENE_CONFLICT',
  );
});

test('rotate keeps the newest events in place and archives the rest without loss', async () => {
  const rootDir = await makeHygieneFixture();
  const liveFile = path.join(rootDir, '.aios', 'context-db', 'sessions', 'codex-cli-20260101T000000-aaaaaaaa', 'l2-events.jsonl');
  const result = await rotateSessionEvents(rootDir, { maxEvents: 2, now: NOW });
  const rotated = result.rotated.find((entry) => entry.file.replaceAll('\\', '/').endsWith('codex-cli-20260101T000000-aaaaaaaa/l2-events.jsonl'));
  assert.ok(rotated, `expected rotation of the stale session log: ${JSON.stringify(result.rotated)}`);
  assert.equal(rotated.movedLines, 1);
  assert.equal(rotated.keptLines, 2);
  assert.equal(rotated.movedLines + rotated.keptLines, 3, 'no line may be lost');
  assert.ok(rotated.sha256Before && rotated.sha256After && rotated.sha256Before !== rotated.sha256After);
  assert.match(rotated.archiveFile.replaceAll('\\', '/'), /l2-events\.archive-.+\.jsonl$/u);

  const keptLines = String(await readFile(liveFile), 'utf8').trim().split('\n');
  assert.equal(keptLines.length, 2);
  assert.match(keptLines[0], /stale two/);
  const archivedLines = String(await readFile(path.join(rootDir, rotated.archiveFile)), 'utf8').trim().split('\n');
  assert.equal(archivedLines.length, 1);
  assert.match(archivedLines[0], /stale one/);

  const again = await rotateSessionEvents(rootDir, { maxEvents: 2, now: NOW });
  assert.equal(again.rotated.length, 0, 'rotation is idempotent at or below the keep threshold');
});

function runHygieneCli(rootDir, args) {
  return spawnSync(process.execPath, [CLI_PATH, 'memo', 'hygiene', ...args], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, AIOS_AGENT_ID: '' },
  });
}

test('cli default is a read-only survey with json mode and explicit actions', async () => {
  const rootDir = await makeHygieneFixture();
  const before = await snapshotTree(rootDir);

  const survey = runHygieneCli(rootDir, []);
  assert.equal(survey.status, 0, survey.stderr || survey.stdout);
  assert.match(String(survey.stdout || ''), /codex-cli-20260101T000000-aaaaaaaa/);
  assert.match(String(survey.stdout || ''), /truncated/);
  assert.deepEqual(await snapshotTree(rootDir), before, 'default run must not mutate anything');

  const json = runHygieneCli(rootDir, ['--json']);
  assert.equal(json.status, 0, json.stderr || json.stdout);
  const parsed = JSON.parse(String(json.stdout || ''));
  assert.ok(Array.isArray(parsed.sessions) && parsed.sessions.length >= 5);
  assert.ok(Array.isArray(parsed.pinned));
  assert.ok(Array.isArray(parsed.eventsRetention));

  const archive = runHygieneCli(rootDir, ['--archive-stale-sessions']);
  assert.equal(archive.status, 0, archive.stderr || archive.stdout);
  assert.match(String(archive.stdout || ''), /codex-cli-20260101T000000-aaaaaaaa/);

  const rotate = runHygieneCli(rootDir, ['--rotate-events', '--max-events', '2']);
  assert.equal(rotate.status, 0, rotate.stderr || rotate.stdout);
  assert.match(String(rotate.stdout || ''), /rotated/);

  const bad = runHygieneCli(rootDir, ['--frobnicate']);
  assert.notEqual(bad.status, 0);
  assert.match(`${bad.stderr}${bad.stdout}`, /Usage: memo hygiene/);
});
