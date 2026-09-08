import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile, utimes } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { appendMemoEvent, setActiveMemoStorage } from '../lib/memo/storage.mjs';
import {
  clearMemoEventsCache,
  collectEvents,
  memoEventsCacheStats,
  readJsonlEvents,
  readSplitEvents,
} from '../lib/memo/storage/events-read.mjs';
import { fileEventsPath } from '../lib/memo/storage/paths.mjs';
import { searchMemoEvents } from '../lib/memo/storage/query.mjs';

async function withTempRoot(prefix, fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function eventLine(id, text) {
  return `${JSON.stringify({ eventId: id, kind: 'memo', text, ts: '2026-01-01T00:00:00.000Z' })}\n`;
}

async function writeCorpus(rootDir, count, textPrefix = 'cache-bench memory fact') {
  await setActiveMemoStorage(rootDir, 'file');
  const filePath = fileEventsPath(rootDir);
  await mkdir(path.dirname(filePath), { recursive: true });
  let body = '';
  for (let index = 0; index < count; index += 1) {
    body += eventLine(`evt-${index}`, `${textPrefix} number ${index} alpha beta`);
  }
  await writeFile(filePath, body, 'utf8');
  return filePath;
}

test('file backend cold and warm reads are identical and the second hits cache', async () => {
  await withTempRoot('memo-cache-identical-', async (rootDir) => {
    clearMemoEventsCache();
    await writeCorpus(rootDir, 20);
    const first = await collectEvents(rootDir, { storage: 'file', space: 'default' });
    const before = memoEventsCacheStats();
    const second = await collectEvents(rootDir, { storage: 'file', space: 'default' });
    const after = memoEventsCacheStats();
    assert.deepEqual(second, first);
    assert.equal(first.events.length, 20);
    assert.ok(after.hits > before.hits, 'second read must hit the parse cache');
  });
});

test('searchMemoEvents reuses the parse cache with identical ranking', async () => {
  await withTempRoot('memo-cache-search-', async (rootDir) => {
    clearMemoEventsCache();
    await writeCorpus(rootDir, 30);
    const first = await searchMemoEvents(rootDir, { storage: 'file', query: 'alpha beta' });
    const before = memoEventsCacheStats();
    const second = await searchMemoEvents(rootDir, { storage: 'file', query: 'alpha beta' });
    const after = memoEventsCacheStats();
    assert.deepEqual(second.map((item) => item.eventId), first.map((item) => item.eventId));
    assert.ok(after.hits > before.hits);
  });
});

test('appended events invalidate the cache', async () => {
  await withTempRoot('memo-cache-append-', async (rootDir) => {
    clearMemoEventsCache();
    await writeCorpus(rootDir, 5);
    const before = await collectEvents(rootDir, { storage: 'file', space: 'default' });
    assert.equal(before.events.length, 5);
    await appendMemoEvent({ workspaceRoot: rootDir, storage: 'file', text: 'cache invalidation sentinel xyzzy' });
    const after = await collectEvents(rootDir, { storage: 'file', space: 'default' });
    assert.equal(after.events.length, 6);
    const found = await searchMemoEvents(rootDir, { storage: 'file', query: 'xyzzy' });
    assert.ok(found.some((item) => item.text.includes('xyzzy')));
  });
});

test('same-size rewrite with a newer mtime invalidates the cache', async () => {
  await withTempRoot('memo-cache-rewrite-', async (rootDir) => {
    clearMemoEventsCache();
    const filePath = await writeCorpus(rootDir, 3, 'aaa rewrite probe');
    const first = await collectEvents(rootDir, { storage: 'file', space: 'default' });
    assert.ok(first.events.every((item) => item.text.includes('aaa')));
    const rewritten = eventLine('evt-0', 'bbb rewrite probe number 0 alpha beta')
      + eventLine('evt-1', 'aaa rewrite probe number 1 alpha beta')
      + eventLine('evt-2', 'aaa rewrite probe number 2 alpha beta');
    await writeFile(filePath, rewritten, 'utf8');
    const future = new Date(Date.now() + 5000);
    await utimes(filePath, future, future);
    const second = await collectEvents(rootDir, { storage: 'file', space: 'default' });
    assert.ok(second.events.some((item) => item.text.includes('bbb')));
  });
});

test('mutating a returned row never corrupts cached rows', async () => {
  await withTempRoot('memo-cache-isolation-', async (rootDir) => {
    clearMemoEventsCache();
    await writeCorpus(rootDir, 2);
    const first = await collectEvents(rootDir, { storage: 'file', space: 'default' });
    first.events[0].text = 'MUTATED';
    first.events.push({ eventId: 'fake', kind: 'memo', text: 'fake' });
    const second = await collectEvents(rootDir, { storage: 'file', space: 'default' });
    assert.equal(second.events.length, 2);
    assert.ok(!second.events.some((item) => item.text === 'MUTATED' || item.eventId === 'fake'));
  });
});

test('spaces do not cross-contaminate the cache', async () => {
  await withTempRoot('memo-cache-spaces-', async (rootDir) => {
    clearMemoEventsCache();
    await setActiveMemoStorage(rootDir, 'file');
    const filePath = fileEventsPath(rootDir);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      `${JSON.stringify({ eventId: 'a1', kind: 'memo', text: 'space alpha memory', space: 'alpha' })}\n`
      + `${JSON.stringify({ eventId: 'b1', kind: 'memo', text: 'space beta memory', space: 'beta' })}\n`,
      'utf8',
    );
    const alpha = await collectEvents(rootDir, { storage: 'file', space: 'alpha' });
    const beta = await collectEvents(rootDir, { storage: 'file', space: 'beta' });
    assert.deepEqual(alpha.events.map((item) => item.eventId), ['a1']);
    assert.deepEqual(beta.events.map((item) => item.eventId), ['b1']);
  });
});

test('malformed semantics survive the cache in both orders', async () => {
  await withTempRoot('memo-cache-malformed-', async (rootDir) => {
    clearMemoEventsCache();
    const badPath = path.join(rootDir, 'bad.jsonl');
    await writeFile(badPath, `${JSON.stringify({ ok: 1 })}\nNOT-JSON\n`, 'utf8');
    await assert.rejects(() => readJsonlEvents(badPath), /Malformed memo JSONL/u);
    const tolerated = await readJsonlEvents(badPath, { tolerateMalformed: true });
    assert.equal(tolerated.events.length, 1);
    assert.equal(tolerated.malformed.length, 1);
    await assert.rejects(() => readJsonlEvents(badPath), /Malformed memo JSONL/u);
  });
  await withTempRoot('memo-cache-malformed-rev-', async (rootDir) => {
    clearMemoEventsCache();
    const badPath = path.join(rootDir, 'bad.jsonl');
    await writeFile(badPath, `${JSON.stringify({ ok: 1 })}\nNOT-JSON\n`, 'utf8');
    const tolerated = await readJsonlEvents(badPath, { tolerateMalformed: true });
    assert.equal(tolerated.malformed.length, 1);
    await assert.rejects(() => readJsonlEvents(badPath), /Malformed memo JSONL/u);
    const again = await readJsonlEvents(badPath, { tolerateMalformed: true });
    assert.deepEqual(again, tolerated);
  });
});

test('the cache is bounded by FIFO eviction', async () => {
  await withTempRoot('memo-cache-bound-', async (rootDir) => {
    clearMemoEventsCache();
    for (let index = 0; index < 60; index += 1) {
      const filePath = path.join(rootDir, `file-${index}.jsonl`);
      await writeFile(filePath, eventLine(`e${index}`, `eviction probe ${index}`), 'utf8');
      const result = await readJsonlEvents(filePath);
      assert.equal(result.events.length, 1);
    }
    const stats = memoEventsCacheStats();
    assert.ok(stats.size <= stats.maxEntries, `cache size ${stats.size} exceeds bound ${stats.maxEntries}`);
    assert.ok(stats.evictions > 0, 'expected evictions once entries exceed the bound');
  });
});

test('split backend caches parses and invalidates on new files', async () => {
  await withTempRoot('memo-cache-split-', async (rootDir) => {
    clearMemoEventsCache();
    await setActiveMemoStorage(rootDir, 'split');
    const dir = path.join(rootDir, '.aios', 'memo', 'split', 'events', 'default');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'a.json'), JSON.stringify({ eventId: 's-a', kind: 'memo', text: 'split alpha memory' }), 'utf8');
    await writeFile(path.join(dir, 'b.json'), JSON.stringify({ eventId: 's-b', kind: 'memo', text: 'split beta memory' }), 'utf8');
    const first = await readSplitEvents(rootDir, { space: 'default' });
    assert.equal(first.events.length, 2);
    const before = memoEventsCacheStats();
    const second = await readSplitEvents(rootDir, { space: 'default' });
    assert.deepEqual(second, first);
    assert.ok(memoEventsCacheStats().hits > before.hits);
    await writeFile(path.join(dir, 'c.json'), JSON.stringify({ eventId: 's-c', kind: 'memo', text: 'split gamma memory' }), 'utf8');
    const third = await readSplitEvents(rootDir, { space: 'default' });
    assert.equal(third.events.length, 3);
  });
});

test('200-event recall stays bounded: warm repeats beat the cold parse', async () => {
  await withTempRoot('memo-cache-bench-', async (rootDir) => {
    await writeCorpus(rootDir, 200);
    clearMemoEventsCache();
    const coldStart = process.hrtime.bigint();
    const cold = await searchMemoEvents(rootDir, { storage: 'file', query: 'alpha beta number' });
    const coldMs = Number(process.hrtime.bigint() - coldStart) / 1e6;
    assert.ok(cold.length > 0);
    let warmTotalMs = 0;
    const repeats = 5;
    for (let index = 0; index < repeats; index += 1) {
      const start = process.hrtime.bigint();
      const warm = await searchMemoEvents(rootDir, { storage: 'file', query: 'alpha beta number' });
      warmTotalMs += Number(process.hrtime.bigint() - start) / 1e6;
      assert.deepEqual(warm.map((item) => item.eventId), cold.map((item) => item.eventId));
    }
    const warmAvgMs = warmTotalMs / repeats;
    const stats = memoEventsCacheStats();
    assert.ok(stats.hits >= repeats, `expected cache hits, got ${JSON.stringify(stats)}`);
    assert.ok(warmAvgMs < coldMs, `warm avg ${warmAvgMs.toFixed(2)}ms must beat cold ${coldMs.toFixed(2)}ms`);
    console.log(`memo-cache-bench: cold=${coldMs.toFixed(2)}ms warmAvg=${warmAvgMs.toFixed(2)}ms hits=${stats.hits}`);
  });
});
