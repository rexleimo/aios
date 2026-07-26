import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { appendMemoEvent, listMemoEvents } from '../lib/memo/storage.mjs';
import {
  DEFAULT_HINT_THRESHOLD,
  filterTemporal,
  findSupersedeCandidates,
  foldTemporalLinks,
  isEventLiveAt,
  normalizeIsoTimestamp,
  proposeSupersedes,
  toSupersedes,
} from '../lib/memo/storage/temporal.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cliPath = path.resolve(here, '..', 'aios.mjs');

async function withTempRoot(prefix, fn) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    await fn(workspaceRoot);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

function runMemo(workspaceRoot, args, { env = {} } = {}) {
  return spawnSync(process.execPath, [cliPath, 'memo', ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: { ...process.env, AIOS_AGENT_ID: '', ...env },
  });
}

function addedEventId(result) {
  const match = String(result.stdout || '').match(/Memo added:\s*(\S+)/u);
  assert.ok(match, `expected an event id in: ${result.stdout}${result.stderr}`);
  return match[1];
}

function makeEvent(overrides) {
  return {
    eventId: 'e0',
    space: 'default',
    spaceKey: 'default',
    ts: '2026-01-01T00:00:00.000Z',
    validAt: '2026-01-01T00:00:00.000Z',
    text: 'fact',
    supersedes: [],
    ...overrides,
  };
}

test('normalizeIsoTimestamp keeps valid input and rejects junk', () => {
  assert.equal(normalizeIsoTimestamp('2026-01-01T00:00:00.000Z'), '2026-01-01T00:00:00.000Z');
  assert.equal(normalizeIsoTimestamp('2026-01-01'), '2026-01-01T00:00:00.000Z');
  assert.equal(normalizeIsoTimestamp('not-a-date'), '');
  assert.equal(normalizeIsoTimestamp(''), '');
  assert.equal(normalizeIsoTimestamp(undefined), '');
});

test('toSupersedes trims, drops blanks, and dedupes', () => {
  assert.deepEqual(toSupersedes(['a', ' b ', '', 'a', null]), ['a', 'b']);
  assert.deepEqual(toSupersedes('a'), []);
  assert.deepEqual(toSupersedes(), []);
});

test('foldTemporalLinks derives invalidAt and supersededBy without mutating input', () => {
  const older = makeEvent({ eventId: 'old', text: 'port is 3000' });
  const newer = makeEvent({
    eventId: 'new',
    text: 'port is 4000',
    ts: '2026-02-01T00:00:00.000Z',
    validAt: '2026-02-01T00:00:00.000Z',
    supersedes: ['old'],
  });

  const folded = foldTemporalLinks([older, newer]);
  const foldedOld = folded.find((event) => event.eventId === 'old');
  const foldedNew = folded.find((event) => event.eventId === 'new');

  assert.equal(foldedOld.invalidAt, '2026-02-01T00:00:00.000Z');
  assert.equal(foldedOld.supersededBy, 'new');
  assert.equal(foldedNew.invalidAt, undefined);
  assert.equal(older.invalidAt, undefined, 'input rows must not be mutated');
});

test('foldTemporalLinks ignores self-supersede and dangling targets', () => {
  const selfLink = makeEvent({ eventId: 'a', supersedes: ['a', 'missing'] });
  const [folded] = foldTemporalLinks([selfLink]);
  assert.equal(folded.invalidAt, undefined);
  assert.equal(folded.supersededBy, undefined);
});

test('foldTemporalLinks keeps the earliest supersede when several claim the same fact', () => {
  const older = makeEvent({ eventId: 'old' });
  const mid = makeEvent({ eventId: 'mid', validAt: '2026-02-01T00:00:00.000Z', supersedes: ['old'] });
  const late = makeEvent({ eventId: 'late', validAt: '2026-03-01T00:00:00.000Z', supersedes: ['old'] });

  for (const order of [[older, mid, late], [older, late, mid]]) {
    const folded = foldTemporalLinks(order);
    const foldedOld = folded.find((event) => event.eventId === 'old');
    assert.equal(foldedOld.invalidAt, '2026-02-01T00:00:00.000Z');
    assert.equal(foldedOld.supersededBy, 'mid');
  }
});

test('isEventLiveAt honours both ends of the validity window', () => {
  const event = makeEvent({ validAt: '2026-02-01T00:00:00.000Z', invalidAt: '2026-03-01T00:00:00.000Z' });
  assert.equal(isEventLiveAt(event, '2026-01-01T00:00:00.000Z'), false, 'not true yet');
  assert.equal(isEventLiveAt(event, '2026-02-15T00:00:00.000Z'), true);
  assert.equal(isEventLiveAt(event, '2026-03-01T00:00:00.000Z'), false, 'invalidAt is exclusive');
  assert.equal(isEventLiveAt(event, '2026-04-01T00:00:00.000Z'), false);
});

test('filterTemporal hides superseded facts by default and travels back with asOf', () => {
  const older = makeEvent({ eventId: 'old', text: 'port is 3000' });
  const newer = makeEvent({
    eventId: 'new',
    text: 'port is 4000',
    ts: '2026-02-01T00:00:00.000Z',
    validAt: '2026-02-01T00:00:00.000Z',
    supersedes: ['old'],
  });
  const events = [older, newer];

  assert.deepEqual(filterTemporal(events).map((e) => e.eventId), ['new']);
  assert.deepEqual(filterTemporal(events, { includeInvalid: true }).map((e) => e.eventId), ['old', 'new']);
  assert.deepEqual(
    filterTemporal(events, { asOf: '2026-01-15T00:00:00.000Z' }).map((e) => e.eventId),
    ['old'],
    'asOf before the replacement must return the fact that was true then',
  );
});

test('proposeSupersedes flags near-duplicates and leaves unrelated facts alone', () => {
  const events = [
    makeEvent({ eventId: 'a', text: 'deploy target is staging cluster east' }),
    makeEvent({ eventId: 'b', ts: '2026-02-01T00:00:00.000Z', validAt: '2026-02-01T00:00:00.000Z', text: 'deploy target is staging cluster west' }),
    makeEvent({ eventId: 'c', ts: '2026-03-01T00:00:00.000Z', validAt: '2026-03-01T00:00:00.000Z', text: 'owner of billing service is the payments team' }),
  ];

  const proposals = proposeSupersedes(events, { threshold: 0.7 });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].keep.eventId, 'b', 'the newest revision is kept');
  assert.deepEqual(proposals[0].supersedes.map((t) => t.eventId), ['a']);
});

test('proposeSupersedes never links facts across spaces', () => {
  const events = [
    makeEvent({ eventId: 'a', space: 'alpha', spaceKey: 'alpha', text: 'deploy target is staging cluster east' }),
    makeEvent({ eventId: 'b', space: 'beta', spaceKey: 'beta', ts: '2026-02-01T00:00:00.000Z', validAt: '2026-02-01T00:00:00.000Z', text: 'deploy target is staging cluster east' }),
  ];
  assert.deepEqual(proposeSupersedes(events, { threshold: 0.7 }), []);
});

test('memo add --supersedes hides the replaced fact from list and search', async () => {
  await withTempRoot('aios-memo-temporal-', async (workspaceRoot) => {
    const first = runMemo(workspaceRoot, ['add', 'deploy port is 3000', '--valid-at', '2026-01-01T00:00:00.000Z']);
    assert.equal(first.status, 0, first.stderr);
    const firstId = addedEventId(first);

    const second = runMemo(workspaceRoot, [
      'add',
      'deploy port is 4000',
      '--valid-at',
      '2026-02-01T00:00:00.000Z',
      '--supersedes',
      firstId,
    ]);
    assert.equal(second.status, 0, second.stderr);

    const listed = runMemo(workspaceRoot, ['list']);
    assert.equal(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, /4000/u);
    assert.doesNotMatch(listed.stdout, /3000/u, 'superseded fact must not surface by default');

    const searched = runMemo(workspaceRoot, ['search', 'deploy']);
    assert.equal(searched.status, 0, searched.stderr);
    assert.doesNotMatch(searched.stdout, /3000/u, 'search must respect the same temporal filter as list');
  });
});

test('memo list --include-invalid and --as-of recover superseded history', async () => {
  await withTempRoot('aios-memo-temporal-', async (workspaceRoot) => {
    const first = runMemo(workspaceRoot, ['add', 'deploy port is 3000', '--valid-at', '2026-01-01T00:00:00.000Z']);
    const firstId = addedEventId(first);
    runMemo(workspaceRoot, [
      'add',
      'deploy port is 4000',
      '--valid-at',
      '2026-02-01T00:00:00.000Z',
      '--supersedes',
      firstId,
    ]);

    const all = runMemo(workspaceRoot, ['list', '--include-invalid']);
    assert.equal(all.status, 0, all.stderr);
    assert.match(all.stdout, /3000/u);
    assert.match(all.stdout, /4000/u);

    const past = runMemo(workspaceRoot, ['list', '--as-of', '2026-01-15T00:00:00.000Z']);
    assert.equal(past.status, 0, past.stderr);
    assert.match(past.stdout, /3000/u);
    assert.doesNotMatch(past.stdout, /4000/u, 'a fact must not be visible before its validAt');
  });
});

test('supersede semantics are identical on file and split storage', async () => {
  for (const storage of ['file', 'split']) {
    await withTempRoot(`aios-memo-temporal-${storage}-`, async (workspaceRoot) => {
      const older = await appendMemoEvent({
        workspaceRoot,
        storage,
        text: 'deploy port is 3000',
        validAt: '2026-01-01T00:00:00.000Z',
      });
      await appendMemoEvent({
        workspaceRoot,
        storage,
        text: 'deploy port is 4000',
        validAt: '2026-02-01T00:00:00.000Z',
        supersedes: [older.eventId],
      });

      const live = await listMemoEvents(workspaceRoot, { storage });
      assert.deepEqual(live.map((row) => row.text), ['deploy port is 4000'], `storage=${storage}`);

      const withHistory = await listMemoEvents(workspaceRoot, { storage, includeInvalid: true });
      const replaced = withHistory.find((row) => row.eventId === older.eventId);
      assert.equal(replaced.invalidAt, '2026-02-01T00:00:00.000Z', `storage=${storage}`);
      assert.ok(replaced.supersededBy, `storage=${storage} must record who replaced the fact`);
    });
  }
});

// ---------------------------------------------------------------------------
// supersede hints (observation mode — never writes a link)
// ---------------------------------------------------------------------------

const OLD_FACT = 'deploy-region primary deployment region for the api tier is us-east-1';
const NEW_FACT = 'deploy-region primary deployment region for the api tier is eu-west-1';

test('findSupersedeCandidates ranks likely earlier revisions and ignores unrelated facts', () => {
  const events = [
    makeEvent({ eventId: 'e1', text: OLD_FACT }),
    makeEvent({ eventId: 'e2', text: 'support rotation handovers happen on tuesday mornings' }),
  ];
  const candidates = findSupersedeCandidates(events, NEW_FACT);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].eventId, 'e1');
  assert.ok(candidates[0].similarity >= DEFAULT_HINT_THRESHOLD);
});

test('findSupersedeCandidates never proposes the entry being written', () => {
  const events = [makeEvent({ eventId: 'e1', text: OLD_FACT })];
  assert.deepEqual(findSupersedeCandidates(events, OLD_FACT, { excludeEventId: 'e1' }), []);
});

test('memo add hints at a likely earlier revision without linking it', async () => {
  await withTempRoot('aios-memo-hint-', async (workspaceRoot) => {
    const first = addedEventId(runMemo(workspaceRoot, ['add', OLD_FACT]));
    const second = runMemo(workspaceRoot, ['add', NEW_FACT]);

    assert.match(second.stdout, /Hint: 1 existing fact\(s\) look like earlier revisions/u);
    assert.ok(second.stdout.includes(first), `expected the earlier event id in: ${second.stdout}`);
    assert.match(second.stdout, /No link was written/u);

    // The whole point of observation mode: recall is unchanged.
    const live = await listMemoEvents(workspaceRoot, { storage: 'file', space: 'default', limit: 20 });
    assert.equal(live.length, 2, 'a hint must not retire anything');
    assert.ok(live.every((event) => (event.supersedes || []).length === 0));
  });
});

test('memo add stays quiet when nothing resembles the new entry', async () => {
  await withTempRoot('aios-memo-hint-quiet-', async (workspaceRoot) => {
    runMemo(workspaceRoot, ['add', OLD_FACT]);
    const result = runMemo(workspaceRoot, ['add', 'the changelog is generated from commit subjects']);
    assert.doesNotMatch(result.stdout, /Hint:/u);
  });
});

test('memo add skips the hint when the writer already declared what it replaces', async () => {
  await withTempRoot('aios-memo-hint-declared-', async (workspaceRoot) => {
    const first = addedEventId(runMemo(workspaceRoot, ['add', OLD_FACT]));
    const result = runMemo(workspaceRoot, ['add', NEW_FACT, '--supersedes', first]);
    assert.doesNotMatch(result.stdout, /Hint:/u);
  });
});

test('the hint can be turned off by flag and by environment', async () => {
  await withTempRoot('aios-memo-hint-off-', async (workspaceRoot) => {
    runMemo(workspaceRoot, ['add', OLD_FACT]);
    assert.doesNotMatch(runMemo(workspaceRoot, ['add', NEW_FACT, '--no-supersede-hint']).stdout, /Hint:/u);
    assert.doesNotMatch(
      runMemo(workspaceRoot, ['add', NEW_FACT], { env: { AIOS_MEMO_SUPERSEDE_HINT: '0' } }).stdout,
      /Hint:/u,
    );
  });
});
