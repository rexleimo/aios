import path from 'node:path';
import { getActiveMemoStorage } from './config.mjs';
import {
  collectRecursiveFiles,
  readTextIfExists,
  sha256Hex,
  writeText,
} from './fs-io.mjs';
import { withMemoStorageLock } from './lock.mjs';
import {
  normalizeMemoStorageName,
  sanitizeSpace,
} from './normalizers.mjs';
import {
  filePinnedPath,
  memoRoot,
  splitPinnedPath,
} from './paths.mjs';

function pinnedFilePath(workspaceRoot, storage, space, { env = process.env } = {}) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  const safeSpace = sanitizeSpace(space);
  return resolvedStorage === 'file'
    ? filePinnedPath(workspaceRoot, safeSpace, { env })
    : splitPinnedPath(workspaceRoot, safeSpace, { env });
}

/* B3 stale-write guard: pinned edits are read-modify-write. Callers that
 * read first pass `expectedHash` (from `pinnedContentHash` of what they
 * read); a concurrent landing in between is rejected with
 * AIOS_MEMO_PINNED_STALE carrying the fresh hash, so the writer re-reads
 * instead of silently clobbering. Without `expectedHash` the legacy
 * blind-overwrite behavior is preserved. Pure helpers stay outside the
 * lock; the check-and-write pair runs inside the memo storage lock. */
export function normalizePinnedContent(content = '') {
  const normalized = String(content ?? '').trimEnd();
  return normalized ? `${normalized}\n` : '';
}

export function pinnedContentHash(content = '') {
  return sha256Hex(normalizePinnedContent(content));
}

function staleWriteError(currentContent) {
  const error = new Error('pinned content changed since read; re-read and retry');
  error.code = 'AIOS_MEMO_PINNED_STALE';
  error.currentHash = pinnedContentHash(currentContent);
  return error;
}

async function guardedPinnedWrite(filePath, next, expectedHash) {
  if (expectedHash === undefined) {
    await writeText(filePath, next);
    return next;
  }
  const current = await readTextIfExists(filePath);
  if (pinnedContentHash(current) !== String(expectedHash)) throw staleWriteError(current);
  await writeText(filePath, next);
  return next;
}

export async function readPinnedMemo(workspaceRoot, { storage, space = 'default', env = process.env } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot, { env });
  return await readTextIfExists(pinnedFilePath(workspaceRoot, resolvedStorage, space, { env }));
}

export async function writePinnedMemo(workspaceRoot, { storage, space = 'default', content = '', expectedHash, env = process.env } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot, { env });
  const next = normalizePinnedContent(content);
  const filePath = pinnedFilePath(workspaceRoot, resolvedStorage, space, { env });
  return await withMemoStorageLock({ workspaceRoot, env }, async () => guardedPinnedWrite(filePath, next, expectedHash));
}

export async function appendPinnedMemo(workspaceRoot, { storage, space = 'default', content = '', expectedHash, env = process.env } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot, { env });
  const addition = String(content ?? '').trim();
  if (!addition) return await readPinnedMemo(workspaceRoot, { storage: resolvedStorage, space, env });
  const filePath = pinnedFilePath(workspaceRoot, resolvedStorage, space, { env });
  return await withMemoStorageLock({ workspaceRoot, env }, async () => {
    const existing = await readTextIfExists(filePath);
    if (expectedHash !== undefined && pinnedContentHash(existing) !== String(expectedHash)) {
      throw staleWriteError(existing);
    }
    const next = existing.trimEnd() ? `${existing.trimEnd()}\n\n${addition}\n` : `${addition}\n`;
    await writeText(filePath, next);
    return next;
  });
}

export async function readPinnedByStorage(workspaceRoot, storage, { env = process.env } = {}) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  const pinnedRoot = path.join(memoRoot(workspaceRoot, { env }), resolvedStorage, 'pinned');
  const files = await collectRecursiveFiles(pinnedRoot, (filePath) => filePath.endsWith('.md'));
  const output = [];
  for (const filePath of files) {
    const safeSpace = path.basename(filePath, '.md');
    const content = await readTextIfExists(filePath);
    if (content) output.push({ safeSpace, content });
  }
  return output;
}

export async function writePinnedByStorage(workspaceRoot, storage, pinned, { env = process.env } = {}) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  for (const entry of pinned) {
    const targetPath = resolvedStorage === 'file'
      ? filePinnedPath(workspaceRoot, entry.safeSpace, { env })
      : splitPinnedPath(workspaceRoot, entry.safeSpace, { env });
    await writeText(targetPath, entry.content || '');
  }
}
