import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const repoRoot = process.cwd();
const cliPath = path.join(repoRoot, 'scripts', 'aios.mjs');

function runMemo(workspaceRoot, args, options = {}) {
  return spawnSync('node', [cliPath, 'memo', ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...options.env,
    },
  });
}

function parseJsonLines(raw) {
  return String(raw || '')
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function withWorkspace(prefix, fn) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    await fn(workspaceRoot);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

test('aios memo add writes canonical file storage and legacy mirror metadata', async () => {
  await withWorkspace('aios-memo-cli-add-', async (workspaceRoot) => {
    const result = runMemo(workspaceRoot, ['add', 'ship canonical memo storage #ops']);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Memo added/i);

    const filePath = path.join(workspaceRoot, '.aios', 'memo', 'file', 'events.jsonl');
    const fileRecords = parseJsonLines(await fs.readFile(filePath, 'utf8'));
    assert.equal(fileRecords.length, 1);
    assert.equal(fileRecords[0].space, 'default');
    assert.equal(fileRecords[0].text, 'ship canonical memo storage #ops');
    assert.deepEqual(fileRecords[0].refs, ['ops']);

    const legacyPath = path.join(
      workspaceRoot,
      '.aios',
      'context-db',
      'sessions',
      'workspace-memory--default',
      'l2-events.jsonl'
    );
    const legacyRecords = parseJsonLines(await fs.readFile(legacyPath, 'utf8'));
    assert.equal(legacyRecords.length, 1);
    assert.equal(legacyRecords[0].kind, 'memo');
    assert.equal(legacyRecords[0].turn?.turnType, 'side');
    assert.equal(legacyRecords[0].turn?.environment, 'memo');
    assert.equal(legacyRecords[0].turn?.hindsightStatus, 'na');
    assert.equal(legacyRecords[0].turn?.outcome, 'success');
  });
});

test('aios memo pin writes active storage and mirrors pinned.md to .aios ContextDB path', async () => {
  await withWorkspace('aios-memo-cli-pin-', async (workspaceRoot) => {
    const set = runMemo(workspaceRoot, ['pin', 'set', 'Pinned canonical note']);
    assert.equal(set.status, 0, set.stderr || set.stdout);

    const add = runMemo(workspaceRoot, ['pin', 'add', 'Second pinned note']);
    assert.equal(add.status, 0, add.stderr || add.stdout);

    const canonicalPinned = await fs.readFile(
      path.join(workspaceRoot, '.aios', 'memo', 'file', 'pinned', 'default.md'),
      'utf8'
    );
    assert.match(canonicalPinned, /Pinned canonical note/);
    assert.match(canonicalPinned, /Second pinned note/);

    const legacyPinned = await fs.readFile(
      path.join(
        workspaceRoot,
        '.aios',
        'context-db',
        'sessions',
        'workspace-memory--default',
        'pinned.md'
      ),
      'utf8'
    );
    assert.equal(legacyPinned, canonicalPinned);

    const show = runMemo(workspaceRoot, ['pin', 'show']);
    assert.equal(show.status, 0, show.stderr || show.stdout);
    assert.match(show.stdout, /Pinned canonical note/);
    assert.match(show.stdout, /Second pinned note/);
  });
});

test('aios memo storage use split converts file records and search reads active storage', async () => {
  await withWorkspace('aios-memo-cli-split-', async (workspaceRoot) => {
    const add = runMemo(workspaceRoot, ['add', 'portable memo for split storage #git']);
    assert.equal(add.status, 0, add.stderr || add.stdout);

    const useSplit = runMemo(workspaceRoot, ['storage', 'use', 'split']);
    assert.equal(useSplit.status, 0, useSplit.stderr || useSplit.stdout);
    assert.match(useSplit.stdout, /split/i);
    assert.match(useSplit.stdout, /Migrated records: 1/);
    assert.match(useSplit.stdout, /Rebuilt records: 1/);

    const splitEventsDir = path.join(workspaceRoot, '.aios', 'memo', 'split', 'events', 'default');
    const splitFiles = (await fs.readdir(splitEventsDir)).filter((name) => name.endsWith('.json'));
    assert.equal(splitFiles.length, 1);

    const search = runMemo(workspaceRoot, ['search', 'portable', '--limit', '5']);
    assert.equal(search.status, 0, search.stderr || search.stdout);
    assert.match(search.stdout, /portable memo for split storage/);
    assert.match(search.stdout, /#git/);
  });
});

test('aios memo storage doctor prints actionable stale-derived detail', async () => {
  await withWorkspace('aios-memo-cli-doctor-detail-', async (workspaceRoot) => {
    const add = runMemo(workspaceRoot, ['add', 'record before initial rebuild']);
    assert.equal(add.status, 0, add.stderr || add.stdout);

    const rebuild = runMemo(workspaceRoot, ['storage', 'rebuild']);
    assert.equal(rebuild.status, 0, rebuild.stderr || rebuild.stdout);

    const secondAdd = runMemo(workspaceRoot, ['add', 'record after rebuild makes derived stale']);
    assert.equal(secondAdd.status, 0, secondAdd.stderr || secondAdd.stdout);

    const doctor = runMemo(workspaceRoot, ['storage', 'doctor']);
    assert.notEqual(doctor.status, 0);
    assert.match(doctor.stdout, /derived-manifest: error - derived docs are stale/);
  });
});

test('aios memo storage rebuild preserves canonical source event bytes', async () => {
  await withWorkspace('aios-memo-cli-rebuild-', async (workspaceRoot) => {
    const add = runMemo(workspaceRoot, ['add', 'rebuild should not rewrite source bytes']);
    assert.equal(add.status, 0, add.stderr || add.stdout);

    const filePath = path.join(workspaceRoot, '.aios', 'memo', 'file', 'events.jsonl');
    const before = await fs.readFile(filePath, 'utf8');

    const rebuild = runMemo(workspaceRoot, ['storage', 'rebuild']);
    assert.equal(rebuild.status, 0, rebuild.stderr || rebuild.stdout);
    assert.match(rebuild.stdout, /rebuild/i);

    const after = await fs.readFile(filePath, 'utf8');
    assert.equal(after, before);
  });
});

test('aios memo storage doctor exits non-zero for malformed active file storage', async () => {
  await withWorkspace('aios-memo-cli-doctor-', async (workspaceRoot) => {
    const add = runMemo(workspaceRoot, ['add', 'healthy record before corruption']);
    assert.equal(add.status, 0, add.stderr || add.stdout);

    await fs.appendFile(
      path.join(workspaceRoot, '.aios', 'memo', 'file', 'events.jsonl'),
      '{bad-json\n',
      'utf8'
    );

    const doctor = runMemo(workspaceRoot, ['storage', 'doctor']);
    assert.notEqual(doctor.status, 0);
    assert.match(`${doctor.stdout}\n${doctor.stderr}`, /file-jsonl|malformed|error/i);
  });
});

test('aios memo recall emits readable digest from active storage records', async () => {
  await withWorkspace('aios-memo-cli-recall-', async (workspaceRoot) => {
    const add = runMemo(workspaceRoot, ['add', 'remember active storage recall evidence']);
    assert.equal(add.status, 0, add.stderr || add.stdout);

    const recall = runMemo(workspaceRoot, ['recall', 'storage', '--limit', '2', '--highlight-limit', '2']);
    assert.equal(recall.status, 0, recall.stderr || recall.stdout);
    assert.match(recall.stdout, /workspace-memory--default/);
    assert.match(recall.stdout, /score=/);
    assert.match(recall.stdout, /highlights:/);
    assert.match(recall.stdout, /active storage recall evidence/);
  });
});

/* ── Session close auto-memo & start timeline tests ── */

import { appendMemoEvent } from '../lib/memo/storage/events-write.mjs';
import { listMemoEvents } from '../lib/memo/storage/query.mjs';
import {
  autoMemoSessionClose,
  readSessionCloseCandidate,
  sessionCloseCandidatePath,
} from '../lib/lifecycle/session-hooks/close.mjs';
import { renderActivityTimeline } from '../lib/lifecycle/session-hooks/start-timeline.mjs';
import { recordSessionChangedFile } from '../lib/session/changed-files.mjs';
import { resolveContextDbRoot } from '../lib/aios/state-root.mjs';

function ensureDirSync(dir) {
  return fs.mkdir(dir, { recursive: true });
}

async function seedSessionEvents(rootDir, sessionId, events) {
  const contextDbRoot = resolveContextDbRoot(rootDir, { preferLegacyExisting: true });
  const sessionDir = path.join(contextDbRoot, 'sessions', sessionId);
  await ensureDirSync(sessionDir);
  const eventsPath = path.join(sessionDir, 'l2-events.jsonl');
  const lines = events.map((e) => JSON.stringify(e)).join('\n');
  await fs.writeFile(eventsPath, lines + '\n', 'utf8');
}

test('session close hook writes a reviewable candidate without publishing shared memo', async () => {
  await withWorkspace('aios-session-close-', async (workspaceRoot) => {
    const sessionId = 'test-session-close-1';

    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'user', text: 'Refactor the database module', ts: new Date().toISOString() },
      { role: 'assistant', text: 'I have refactored the database module and updated the connection pool.', ts: new Date().toISOString() },
      { role: 'tool', text: '{"status":"ok"}', ts: new Date().toISOString() },
    ]);
    await recordSessionChangedFile({ rootDir: workspaceRoot, sessionId, filePath: 'src/db/connection.mjs', changeType: 'modified' });
    await recordSessionChangedFile({ rootDir: workspaceRoot, sessionId, filePath: 'src/db/pool.mjs', changeType: 'created' });

    const candidate = await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });

    assert.equal(candidate.kind, 'session-close-memory-candidate');
    assert.equal(candidate.status, 'candidate');
    assert.equal(candidate.claimStatus, 'candidate');
    assert.equal(candidate.scope, 'project_shared');
    assert.equal(candidate.sessionId, sessionId);
    assert.ok(candidate.candidateId);
    assert.ok(candidate.createdAt);
    assert.ok(candidate.text.includes('Session test-session-close-1 completed.'));
    assert.ok(candidate.text.includes('Summary:'));
    assert.ok(candidate.text.includes('database'));
    assert.deepEqual(candidate.refs.sort(), ['src/db/connection.mjs', 'src/db/pool.mjs']);
    assert.equal(candidate.turn.expiryDays, 90);
    assert.equal(candidate.source.eventsPath, 'l2-events.jsonl');

    const persisted = await readSessionCloseCandidate({ rootDir: workspaceRoot, sessionId });
    assert.deepEqual(persisted, candidate);
    await fs.access(sessionCloseCandidatePath(workspaceRoot, sessionId));

    const recent = await listMemoEvents(workspaceRoot, { limit: 5 });
    assert.equal(recent.some((event) => event.text.includes('test-session-close-1')), false);
  });
});

test('session close hook handles empty session as a candidate', async () => {
  await withWorkspace('aios-session-close-empty-', async (workspaceRoot) => {
    const sessionId = 'empty-session';
    const candidate = await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });

    assert.equal(candidate.kind, 'session-close-memory-candidate');
    assert.equal(candidate.status, 'candidate');
    assert.ok(candidate.text.includes('Session empty-session completed.'));
    assert.deepEqual(candidate.refs, []);

    const recent = await listMemoEvents(workspaceRoot, { limit: 5 });
    assert.equal(recent.some((event) => event.text.includes('empty-session')), false);
    assert.deepEqual(await readSessionCloseCandidate({ rootDir: workspaceRoot, sessionId }), candidate);
  });
});

test('session close candidate write is idempotent for the same session', async () => {
  await withWorkspace('aios-session-close-repeat-', async (workspaceRoot) => {
    const sessionId = 'repeat-session';
    const first = await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });
    const second = await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });

    assert.equal(second.candidateId, first.candidateId);
    assert.deepEqual(await readSessionCloseCandidate({ rootDir: workspaceRoot, sessionId }), second);
    const recent = await listMemoEvents(workspaceRoot, { limit: 5 });
    assert.equal(recent.length, 0);
  });
});

test('session close rejects an unsafe session id before accessing its path', async () => {
  await withWorkspace('aios-session-close-unsafe-', async (workspaceRoot) => {
    await assert.rejects(
      autoMemoSessionClose({ rootDir: workspaceRoot, sessionId: '../outside' }),
      /unsafe sessionId/u,
    );
  });
});

test('session start timeline renders recent events', async () => {
  await withWorkspace('aios-session-start-', async (workspaceRoot) => {
    // Write a few memo events so we have content to render
    await appendMemoEvent({ workspaceRoot, text: 'Initial project setup and configuration', refs: ['config'], scope: 'project_shared' });
    await appendMemoEvent({ workspaceRoot, text: 'Database schema design and migration planning', refs: ['db'], scope: 'project_shared' });
    await appendMemoEvent({ workspaceRoot, text: 'API endpoint implementation for user management', refs: ['api'], scope: 'project_shared' });

    // Render timeline
    const lines = await renderActivityTimeline({ rootDir: workspaceRoot, limit: 10 });

    assert.ok(Array.isArray(lines), 'should return an array of strings');
    assert.ok(lines.length >= 3, 'should render at least 3 events');

    // Each line should have an icon, relative time, and truncated text
    for (const line of lines) {
      assert.ok(typeof line === 'string' && line.length > 0, 'each line should be a non-empty string');
      // Should contain relative time pattern (e.g. "1m ago", "just now")
      assert.match(line, /(just now|\d+[mhd] ago)/, 'each line should have relative time');
    }

    // Verify content from our events is visible
    const allText = lines.join('\n');
    assert.ok(allText.includes('Initial project'), 'should contain first event text');
    assert.ok(allText.includes('Database schema'), 'should contain second event text');
    assert.ok(allText.includes('API endpoint'), 'should contain third event text');
  });
});

test('session start timeline handles empty state gracefully', async () => {
  await withWorkspace('aios-session-start-empty-', async (workspaceRoot) => {
    const lines = await renderActivityTimeline({ rootDir: workspaceRoot, limit: 10 });
    assert.ok(Array.isArray(lines), 'should return an array');
    assert.equal(lines.length, 0, 'should return empty array when no events exist');
  });
});

test('session close candidate summary is truncated to 200 chars', async () => {
  await withWorkspace('aios-session-close-trunc-', async (workspaceRoot) => {
    const sessionId = 'trunc-test';
    const longMsg = 'A'.repeat(500);

    await seedSessionEvents(workspaceRoot, sessionId, [
      { role: 'assistant', text: longMsg, ts: new Date().toISOString() },
    ]);

    const candidate = await autoMemoSessionClose({ rootDir: workspaceRoot, sessionId });
    // The extracted last assistant content is truncated to 200 chars
    const summaryContent = candidate.text;
    // The summary includes "Session <id> completed. Key files: ... Summary: <truncated>"
    // The truncated assistant content should be at most 200 chars
    const summaryMatch = summaryContent.match(/Summary: (.+)$/);
    assert.ok(summaryMatch, 'should have a Summary: part');
    assert.ok(summaryMatch[1].length <= 200, `summary content should be <= 200 chars, got ${summaryMatch[1].length}`);
  });
});
