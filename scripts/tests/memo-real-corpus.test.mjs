import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildRealCorpusQueries,
  measureRealCorpus,
} from '../lib/memo/eval/real-corpus.mjs';
import { normalizeEventRows } from '../lib/memo/storage/normalizers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');

function row(eventId, ts, text, extra = {}) {
  return {
    schemaVersion: 1,
    eventId,
    ts,
    space: 'default',
    role: 'user',
    kind: 'memo',
    text,
    refs: [],
    scope: 'project_shared',
    agent: '',
    claimStatus: 'verified',
    ...extra,
  };
}

async function writeCorpus(events) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'memo-real-corpus-'));
  const eventsDir = path.join(rootDir, '.aios', 'memo', 'file');
  await mkdir(eventsDir, { recursive: true });
  await writeFile(
    path.join(eventsDir, 'events.jsonl'),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    'utf8',
  );
  return rootDir;
}

test('real-corpus queries point at distinct active events and measurements are sane', async () => {
  const events = normalizeEventRows([
    row('ev-1', '2026-09-01T00:00:00.000Z', 'zylofix launcher caches credentials in keyvault'),
    row('ev-2', '2026-09-02T00:00:00.000Z', 'quernbench renders latency graphs via wobserver'),
    row('ev-3', '2026-09-03T00:00:00.000Z', 'superseded stale fact about zylofix', { supersedes: ['ev-1'] }),
  ]);
  const queries = buildRealCorpusQueries(events);
  assert.equal(queries.length, 2, 'superseded events are excluded from the query set');
  const targets = new Set(queries.map((query) => query.eventId));
  assert.ok(!targets.has('ev-1'));

  const rootDir = await writeCorpus(events);
  try {
    const first = await measureRealCorpus(rootDir);
    const second = await measureRealCorpus(rootDir);
    assert.deepEqual(first, second, 'measurement must be deterministic');
    assert.equal(first.queries, 2);
    assert.equal(first.top1Accuracy, 1, 'distinctive-token queries should retrieve their own fact');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('real repo corpus produces a deterministic live baseline', async () => {
  const first = await measureRealCorpus(REPO_ROOT);
  if (first.empty) {
    assert.ok(true, 'no real corpus on this checkout; nothing to baseline');
    return;
  }
  const second = await measureRealCorpus(REPO_ROOT);
  assert.deepEqual(first, second, 'real-corpus baseline must be deterministic');
  assert.ok(first.queries > 0);
  assert.ok(first.top1Accuracy >= 0 && first.top1Accuracy <= 1);
  assert.ok(first.top5Accuracy !== null && first.top5Accuracy >= first.top1Accuracy);
});
