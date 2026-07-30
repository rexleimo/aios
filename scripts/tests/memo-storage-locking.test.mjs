import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { appendMemoEvent, listMemoEvents } from '../lib/memo/storage.mjs';
import {
  MEMO_STORAGE_LOCK_TIMEOUT_CODE,
  inspectMemoRootLocks,
  resolveMemoStorageLockPath,
  withMemoStorageLock,
} from '../lib/memo/storage/lock.mjs';

const workerPath = path.resolve(process.cwd(), 'scripts', 'tests', 'fixtures', 'memo-storage-append-worker.mjs');

async function withRoot(fn) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'memo-storage-locking-'));
  try {
    await fn(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function assertStoredBatch(stored, expectedIds) {
  const storedBatch = stored.filter((event) => expectedIds.has(event.eventId));
  assert.equal(storedBatch.length, expectedIds.size, 'every successfully returned event must remain readable');
  assert.equal(new Set(storedBatch.map((event) => event.seq)).size, expectedIds.size, 'canonical sequence values must be unique');
}

async function assertConcurrentAppends(rootDir, storage) {
  const count = 12;
  const results = await Promise.allSettled(Array.from({ length: count }, (_, index) => (
    appendMemoEvent({
      workspaceRoot: rootDir,
      storage,
      text: `${storage} concurrent memo ${index}`,
    })
  )));
  const rejected = results.filter((result) => result.status === 'rejected');
  assert.equal(rejected.length, 0, rejected.map((result) => String(result.reason)).join('\n'));

  const expectedIds = new Set(results.map((result) => result.value.eventId));
  const stored = await listMemoEvents(rootDir, { storage, limit: count + 1 });
  assertStoredBatch(stored, expectedIds);
}

function appendFromChild(rootDir, storage, index) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [workerPath, rootDir, storage, `${storage} child memo ${index}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(new Error(`append worker exited ${code}: ${stderr || stdout}`));
        return;
      }
      resolve(JSON.parse(stdout));
    });
  });
}

async function assertChildProcessAppends(rootDir, storage) {
  const count = 4;
  const returned = await Promise.all(Array.from({ length: count }, (_, index) => (
    appendFromChild(rootDir, storage, index)
  )));
  const expectedIds = new Set(returned.map((event) => event.eventId));
  const stored = await listMemoEvents(rootDir, { storage, limit: count + 1 });
  assertStoredBatch(stored, expectedIds);
}

test('concurrent file memo appends preserve every event with unique sequence values', async () => {
  await withRoot((rootDir) => assertConcurrentAppends(rootDir, 'file'));
});

test('concurrent split memo appends preserve every event with unique sequence values', async () => {
  await withRoot((rootDir) => assertConcurrentAppends(rootDir, 'split'));
});

test('canonical memo lock serializes concurrent child-process appends for file and split storage', async () => {
  for (const storage of ['file', 'split']) {
    await withRoot((rootDir) => assertChildProcessAppends(rootDir, storage));
  }
});

test('contended memo append fails closed without changing canonical events', async () => {
  await withRoot(async (rootDir) => {
    await withMemoStorageLock({ workspaceRoot: rootDir }, async () => {
      await assert.rejects(
        appendMemoEvent({
          workspaceRoot: rootDir,
          storage: 'file',
          text: 'must not be written',
          lockOptions: { timeoutMs: 30, pollMs: 2 },
        }),
        { code: MEMO_STORAGE_LOCK_TIMEOUT_CODE },
      );
      const stored = await listMemoEvents(rootDir, { storage: 'file', limit: 10 });
      assert.deepEqual(stored, []);
    });
  });
});

test('appendMemoEvent uses the injected custom state root for its storage lock', async () => {
  await withRoot(async (rootDir) => {
    const env = { ...process.env, AIOS_PROJECT_STATE_DIR: 'custom-state' };
    const eventsPath = path.join(rootDir, 'custom-state', 'memo', 'file', 'events.jsonl');
    await withMemoStorageLock({ workspaceRoot: rootDir, env }, async () => {
      await assert.rejects(
        appendMemoEvent({
          workspaceRoot: rootDir,
          storage: 'file',
          text: 'must not be written under a custom root',
          lockOptions: { timeoutMs: 30, pollMs: 2 },
          env,
        }),
        { code: MEMO_STORAGE_LOCK_TIMEOUT_CODE },
      );
      await assert.rejects(access(eventsPath), { code: 'ENOENT' });
    });

    await appendMemoEvent({
      workspaceRoot: rootDir,
      storage: 'file',
      text: 'custom root lock released',
      env,
    });
    await access(eventsPath);
  });
});

test('memo lock and append resolve through a custom project state root', async () => {
  await withRoot(async (rootDir) => {
    const previous = process.env.AIOS_PROJECT_STATE_DIR;
    process.env.AIOS_PROJECT_STATE_DIR = 'custom-state';
    try {
      const lockPath = resolveMemoStorageLockPath(rootDir);
      await withMemoStorageLock({ workspaceRoot: rootDir }, async () => {
        await access(lockPath);
      });

      const event = await appendMemoEvent({
        workspaceRoot: rootDir,
        storage: 'file',
        text: 'custom state root memo',
      });
      const stored = await listMemoEvents(rootDir, { storage: 'file', limit: 10 });
      assert.equal(stored.some((row) => row.eventId === event.eventId), true);
      await access(path.join(rootDir, 'custom-state', 'memo', 'file', 'events.jsonl'));
      await assert.rejects(access(path.join(rootDir, '.aios', 'memo', 'file', 'events.jsonl')), { code: 'ENOENT' });
    } finally {
      if (previous === undefined) delete process.env.AIOS_PROJECT_STATE_DIR;
      else process.env.AIOS_PROJECT_STATE_DIR = previous;
    }
  });
});

test('memo lock inspection reports a crashed owner without stealing the lock', async () => {
  await withRoot(async (rootDir) => {
    const lockPath = resolveMemoStorageLockPath(rootDir);
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(path.dirname(lockPath), { recursive: true });
    await writeFile(lockPath, `${JSON.stringify({ pid: 99999999, acquiredAt: '2026-07-29T00:00:00.000Z' })}\n`, 'utf8');

    const report = await inspectMemoRootLocks(rootDir);
    assert.equal(report.locks.length, 1);
    assert.equal(report.locks[0].stale, true);
    assert.equal(report.locks[0].path, lockPath);
    await access(lockPath);
  });
});
