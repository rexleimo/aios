import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { resolveMemoRoot } from '../../aios/state-root.mjs';

export const MEMO_STORAGE_LOCK_TIMEOUT_CODE = 'AIOS_MEMO_STORAGE_LOCK_TIMEOUT';

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeLockName(lockName) {
  const normalized = String(lockName || '').trim();
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(normalized)) {
    throw new Error('memo root lock name must contain only lowercase letters, digits, and hyphens');
  }
  return normalized;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lockError(lockPath, timeoutMs) {
  const error = new Error(`memo root lock timed out after ${timeoutMs}ms: ${lockPath}`);
  error.code = MEMO_STORAGE_LOCK_TIMEOUT_CODE;
  error.lockPath = lockPath;
  error.timeoutMs = timeoutMs;
  return error;
}

export function resolveMemoRootLockPath(workspaceRoot, lockName, { env = process.env } = {}) {
  const normalizedName = normalizeLockName(lockName);
  return path.join(resolveMemoRoot(workspaceRoot, { env }), '.locks', `${normalizedName}.lock`);
}

export function resolveMemoStorageLockPath(workspaceRoot, { env = process.env } = {}) {
  return resolveMemoRootLockPath(workspaceRoot, 'canonical-events', { env });
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/**
 * Inspect lock ownership without deleting anything. A doctor can identify
 * locks left by a crashed process while preserving the no-steal write rule.
 */
export async function inspectMemoRootLocks(workspaceRoot, { env = process.env } = {}) {
  const locksDir = path.join(resolveMemoRoot(workspaceRoot, { env }), '.locks');
  let entries;
  try {
    entries = await readdir(locksDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return { locksDir, locks: [] };
    throw error;
  }

  const locks = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.lock')) continue;
    const lockPath = path.join(locksDir, entry.name);
    let metadata = null;
    let malformed = false;
    try {
      metadata = JSON.parse(await readFile(lockPath, 'utf8'));
    } catch {
      malformed = true;
    }
    const pid = Number(metadata?.pid);
    const active = malformed ? null : processIsAlive(pid);
    locks.push({
      name: entry.name.slice(0, -'.lock'.length),
      path: lockPath,
      pid: Number.isInteger(pid) && pid > 0 ? pid : 0,
      acquiredAt: String(metadata?.acquiredAt || ''),
      active,
      stale: active === false,
      malformed,
    });
  }
  return { locksDir, locks };
}

async function acquireLock(lockPath) {
  const handle = await open(lockPath, 'wx');
  try {
    await handle.writeFile(`${JSON.stringify({
      schemaVersion: 1,
      lockId: randomUUID(),
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    })}\n`, 'utf8');
  } catch (error) {
    await handle.close().catch(() => {});
    await rm(lockPath, { force: true });
    throw error;
  }
  await handle.close();
}

export async function withMemoRootLock({
  workspaceRoot,
  lockName,
  lockPath: explicitLockPath = '',
  timeoutMs = 45_000,
  pollMs = 20,
  env = process.env,
} = {}, task) {
  if (!workspaceRoot) throw new Error('withMemoRootLock requires workspaceRoot');
  if (typeof task !== 'function') throw new Error('withMemoRootLock requires a task callback');

  const lockPath = explicitLockPath || resolveMemoRootLockPath(workspaceRoot, lockName, { env });
  const timeout = Math.max(0, Number.isFinite(Number(timeoutMs)) ? Math.floor(Number(timeoutMs)) : 45_000);
  const poll = positiveInteger(pollMs, 20);
  const startedAt = Date.now();

  await mkdir(path.dirname(lockPath), { recursive: true });
  while (true) {
    try {
      await acquireLock(lockPath);
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      if (Date.now() - startedAt >= timeout) throw lockError(lockPath, timeout);
      await sleep(poll);
    }
  }

  try {
    return await task();
  } finally {
    // Never steal a stale memo-root lock; a timeout is safer than a lost write.
    await rm(lockPath, { force: true });
  }
}

export async function withMemoStorageLock({
  workspaceRoot,
  timeoutMs = 45_000,
  pollMs = 20,
  env = process.env,
} = {}, task) {
  const lockPath = resolveMemoStorageLockPath(workspaceRoot, { env });
  return await withMemoRootLock({
    workspaceRoot,
    lockName: 'canonical-events',
    lockPath,
    timeoutMs,
    pollMs,
    env,
  }, task);
}
