import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  EMBEDDER_ENV_VAR,
  cosineSimilarity,
  createHashLexicalEmbedder,
  resolveEmbedderFromEnv,
} from '../lib/memo/storage/embedding.mjs';
import { searchMemoEvents } from '../lib/memo/storage/query.mjs';

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
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'memo-embedding-'));
  const eventsDir = path.join(rootDir, '.aios', 'memo', 'file');
  await mkdir(eventsDir, { recursive: true });
  await writeFile(
    path.join(eventsDir, 'events.jsonl'),
    `${events.map((event) => JSON.stringify(event)).join('\n')}\n`,
    'utf8',
  );
  return rootDir;
}

const CORPUS = [
  row('ev-1', '2026-09-01T00:00:00.000Z', 'zylofix launcher caches credentials in keyvault'),
  // Shares one token with the query below but fails the token-match threshold,
  // so only the embedding coarse stage can pull it into the candidate pool.
  row('ev-2', '2026-09-02T00:00:00.000Z', 'zylofix nightly packaging moved to obsidian runners'),
  row('ev-3', '2026-09-03T00:00:00.000Z', 'unrelated note about frontend palette tokens'),
];

test('cosine similarity is 1 for identical and 0 for disjoint normalized vectors', async () => {
  const embedder = createHashLexicalEmbedder({ dims: 64 });
  const a = await embedder.embedText('alpha beta');
  const b = await embedder.embedText('alpha beta');
  const c = await embedder.embedText('gamma delta');
  assert.ok(Math.abs(cosineSimilarity(a, b) - 1) < 1e-6);
  assert.equal(cosineSimilarity(a, c), 0);
  assert.equal(cosineSimilarity(a, new Float32Array(3)), 0, 'dimension mismatch is treated as disjoint');
});

test('embedder resolution is off by default and rejects unknown names', () => {
  assert.equal(resolveEmbedderFromEnv({}), null);
  assert.equal(resolveEmbedderFromEnv({ [EMBEDDER_ENV_VAR]: 'off' }), null);
  const embedder = resolveEmbedderFromEnv({ [EMBEDDER_ENV_VAR]: 'hash-lexical' });
  assert.equal(embedder.name, 'hash-lexical');
  assert.throws(() => resolveEmbedderFromEnv({ [EMBEDDER_ENV_VAR]: 'gpt-web' }), /AIOS_MEMO_EMBEDDER/);
});

test('hash-lexical embedder is deterministic and L2-normalized', async () => {
  const embedder = createHashLexicalEmbedder();
  const first = await embedder.embedText('some memo text');
  const second = await embedder.embedText('some memo text');
  assert.deepEqual(first, second);
  let norm = 0;
  for (const value of first) norm += value * value;
  assert.ok(Math.abs(Math.sqrt(norm) - 1) < 1e-5);
  assert.ok(embedder.dims >= 16);
});

test('coarse stage is union-only: exact matches stay on top and partial matches join', async () => {
  const rootDir = await writeCorpus(CORPUS);
  try {
    const plain = await searchMemoEvents(rootDir, { storage: 'file', space: 'default', query: 'zylofix launcher keyvault', limit: 5 });
    assert.equal(plain[0]?.eventId, 'ev-1');
    assert.ok(!plain.some((event) => event.eventId === 'ev-2'), 'partial-overlap event stays out without the embedder');

    const coarse = await searchMemoEvents(rootDir, {
      storage: 'file',
      space: 'default',
      query: 'zylofix launcher keyvault',
      limit: 5,
      embedder: createHashLexicalEmbedder(),
      embeddingCandidates: 40,
    });
    assert.equal(coarse[0]?.eventId, 'ev-1', 'embedding candidates may not outrank exact matches');
    assert.ok(coarse.some((event) => event.eventId === 'ev-2'), 'coarse stage widens recall with the partial match');
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('disabling the embedder reproduces the legacy result exactly', async () => {
  const rootDir = await writeCorpus(CORPUS);
  try {
    const reference = await searchMemoEvents(rootDir, { storage: 'file', space: 'default', query: 'zylofix', limit: 5 });
    const off = await searchMemoEvents(rootDir, { storage: 'file', space: 'default', query: 'zylofix', limit: 5, embedder: null });
    assert.deepEqual(off, reference);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
