import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  DEFAULT_MEMO_STORAGE,
  SUPPORTED_MEMO_STORAGES,
  appendMemoEvent,
  appendPinnedMemo,
  getActiveMemoStorage,
  getMemoStorageStatus,
  listMemoEvents,
  normalizeMemoStorageName,
  readPinnedMemo,
  rebuildMemoStorage,
  runMemoStorageDoctor,
  searchMemoEvents,
  setActiveMemoStorage,
  switchMemoStorage,
  writePinnedMemo,
} from '../lib/memo/storage.mjs';

async function withTempRoot(prefix, fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('default storage status uses file without creating canonical records', async () => {
  await withTempRoot('memo-storage-default-', async (root) => {
    const status = await getMemoStorageStatus(root);
    assert.equal(DEFAULT_MEMO_STORAGE, 'file');
    assert.deepEqual(SUPPORTED_MEMO_STORAGES, ['split', 'file']);
    assert.equal(status.active, 'file');
    assert.deepEqual(status.supported, ['split', 'file']);
    assert.equal(status.available.file.exists, false);
    await assert.rejects(() => fs.stat(path.join(root, '.aios', 'memo', 'file', 'events.jsonl')));
  });
});

test('active storage config normalizes supported names and rejects unsupported names', async () => {
  await withTempRoot('memo-storage-config-', async (root) => {
    assert.equal(normalizeMemoStorageName(' split '), 'split');
    assert.equal(normalizeMemoStorageName(' stream '), 'file');
    assert.equal(normalizeMemoStorageName('file-stream'), 'file');
    assert.equal(await getActiveMemoStorage(root), 'file');
    assert.equal(await setActiveMemoStorage(root, ' split '), 'split');
    assert.equal(await getActiveMemoStorage(root), 'split');
    await assert.rejects(
      () => setActiveMemoStorage(root, 'sqlite'),
      /storage must be one of: split, file/
    );
  });
});

test('file storage appends searchable memo records and rebuilds derived docs only', async () => {
  await withTempRoot('memo-storage-file-', async (root) => {
    const first = await appendMemoEvent({
      workspaceRoot: root,
      storage: 'file',
      space: 'default',
      text: 'alpha deployment note',
      refs: ['ops'],
    });
    const sourcePath = path.join(root, '.aios', 'memo', 'file', 'events.jsonl');
    const before = await fs.readFile(sourcePath, 'utf8');
    await rebuildMemoStorage(root, { storage: 'file' });
    const after = await fs.readFile(sourcePath, 'utf8');
    assert.equal(after, before);
    const rows = await searchMemoEvents(root, { storage: 'file', space: 'default', query: 'deployment', limit: 5 });
    assert.equal(rows[0].eventId, first.eventId);
  });
});

test('split storage writes one JSON file per event and supports pinned memo content', async () => {
  await withTempRoot('memo-storage-split-', async (root) => {
    await appendMemoEvent({ workspaceRoot: root, storage: 'split', space: 'default', text: 'split record one', refs: [] });
    await writePinnedMemo(root, { storage: 'split', space: 'default', content: 'Pinned split memo' });
    await appendPinnedMemo(root, { storage: 'split', space: 'default', content: 'Second pinned line' });
    const eventFiles = await fs.readdir(path.join(root, '.aios', 'memo', 'split', 'events', 'default'));
    assert.equal(eventFiles.length, 1);
    assert.equal(await readPinnedMemo(root, { storage: 'split', space: 'default' }), 'Pinned split memo\n\nSecond pinned line\n');
  });
});

test('listMemoEvents returns newest memo records first and respects limits', async () => {
  await withTempRoot('memo-storage-list-', async (root) => {
    const first = await appendMemoEvent({ workspaceRoot: root, storage: 'file', space: 'default', text: 'older record', refs: [] });
    const second = await appendMemoEvent({ workspaceRoot: root, storage: 'file', space: 'default', text: 'newer record', refs: [] });
    const rows = await listMemoEvents(root, { storage: 'file', space: 'default', limit: 1 });
    assert.deepEqual(rows.map((row) => row.eventId), [second.eventId]);
    assert.notEqual(first.eventId, second.eventId);
  });
});

test('switchMemoStorage converts records and rejects invalid storage names', async () => {
  await withTempRoot('memo-storage-switch-', async (root) => {
    await appendMemoEvent({ workspaceRoot: root, storage: 'file', space: 'default', text: 'portable record', refs: ['git'] });
    await switchMemoStorage(root, { target: 'split' });
    const rows = await searchMemoEvents(root, { storage: 'split', space: 'default', query: 'portable', limit: 5 });
    assert.equal(rows.length, 1);
    assert.equal(await getActiveMemoStorage(root), 'split');
    await assert.rejects(() => switchMemoStorage(root, { target: 'sqlite' }), /storage must be one of: split, file/);
  });
});

test('switchMemoStorage imports legacy workspace memo records when target has no data', async () => {
  await withTempRoot('memo-storage-legacy-', async (root) => {
    const legacyDir = path.join(root, '.aios', 'context-db', 'sessions', 'workspace-memory--default');
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, 'l2-events.jsonl'),
      `${JSON.stringify({
        seq: 7,
        ts: '2026-05-16T00:00:00.000Z',
        role: 'user',
        kind: 'memo',
        text: 'legacy imported record',
        refs: ['old'],
      })}\n${JSON.stringify({ seq: 8, kind: 'note', text: 'ignored note' })}\n`,
      'utf8'
    );

    await switchMemoStorage(root, { target: 'split' });
    const rows = await searchMemoEvents(root, { storage: 'split', space: 'default', query: 'legacy imported', limit: 5 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].eventId, 'legacy:workspace-memory--default#7');
  });
});

test('doctor reports malformed file JSONL and stale derived manifest', async () => {
  await withTempRoot('memo-storage-doctor-', async (root) => {
    await appendMemoEvent({ workspaceRoot: root, storage: 'file', space: 'default', text: 'healthy record', refs: [] });
    await rebuildMemoStorage(root, { storage: 'file' });
    await fs.appendFile(path.join(root, '.aios', 'memo', 'file', 'events.jsonl'), '{bad-json\n', 'utf8');
    const report = await runMemoStorageDoctor(root, { storage: 'file' });
    assert.equal(report.ok, false);
    assert.equal(report.checks.some((check) => check.id === 'file-jsonl' && check.status === 'error'), true);
    assert.equal(report.checks.some((check) => check.id === 'derived-manifest' && check.status === 'error'), true);
  });
});

test('rebuild succeeds for empty active storage and writes an empty derived manifest', async () => {
  await withTempRoot('memo-storage-empty-rebuild-', async (root) => {
    const manifest = await rebuildMemoStorage(root, { storage: 'file' });
    assert.equal(manifest.storage, 'file');
    assert.equal(manifest.records, 0);

    const docs = await fs.readFile(path.join(root, '.aios', 'memo', 'derived', 'file', 'docs.jsonl'), 'utf8');
    assert.equal(docs, '');
  });
});

test('doctor reports malformed split JSON files', async () => {
  await withTempRoot('memo-storage-split-doctor-', async (root) => {
    await appendMemoEvent({ workspaceRoot: root, storage: 'split', space: 'default', text: 'healthy split record', refs: [] });
    const corruptPath = path.join(root, '.aios', 'memo', 'split', 'events', 'default', '000000000002.json');
    await fs.writeFile(corruptPath, '{bad-json\n', 'utf8');

    const report = await runMemoStorageDoctor(root, { storage: 'split' });
    assert.equal(report.ok, false);
    assert.equal(report.checks.some((check) => check.id === 'split-json' && check.status === 'error'), true);
  });
});

test('sqlite cache files are ignored as canonical memo storage', async () => {
  await withTempRoot('memo-storage-sqlite-cache-', async (root) => {
    const sqliteCache = path.join(root, '.aios', 'context-db', 'index', 'context.db');
    await fs.mkdir(path.dirname(sqliteCache), { recursive: true });
    await fs.writeFile(sqliteCache, 'not canonical memo storage', 'utf8');

    const status = await getMemoStorageStatus(root);
    assert.equal(status.active, 'file');
    assert.equal(status.available.file.exists, false);
    assert.equal(status.available.file.records, 0);
    assert.equal(status.available.split.exists, false);
    assert.equal(status.available.split.records, 0);
  });
});

test('searchMemoEvents tokenizes unspaced Chinese so shared keywords still recall', async () => {
  await withTempRoot('memo-cjk-token-', async (root) => {
    // Memory written in the same surface words as a later natural-language query.
    await appendMemoEvent({
      workspaceRoot: root,
      space: 'default',
      text: 'mkdocs.blog.yml 的 nav 是硬编码清单，新文章必须登记到 nav.Posts 才会发布。',
      scope: 'project_shared',
    });
    // Query shares content words (发布/新文章) with the memory.
    const hit = await searchMemoEvents(root, { query: '新文章怎么发布', limit: 5 });
    assert.equal(hit.length, 1);
    // An unrelated question shares no content words and must not be recalled.
    const unrelated = await searchMemoEvents(root, { query: '午餐吃什么比较好', limit: 5 });
    assert.equal(unrelated.length, 0);
  });
});
