import path from 'node:path';
import { getActiveMemoStorage } from './config.mjs';
import {
  PINNED_DEFAULT_MAX_CHARS,
  PINNED_HARD_MAX_CHARS,
  PINNED_MIN_MAX_CHARS,
} from './constants.mjs';
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

export { PINNED_DEFAULT_MAX_CHARS, PINNED_HARD_MAX_CHARS, PINNED_MIN_MAX_CHARS };

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

export function clampPinnedMaxChars(maxChars = PINNED_DEFAULT_MAX_CHARS) {
  const value = Math.floor(Number(maxChars));
  if (!Number.isFinite(value)) return PINNED_DEFAULT_MAX_CHARS;
  return Math.min(PINNED_HARD_MAX_CHARS, Math.max(PINNED_MIN_MAX_CHARS, value));
}

/* C3 limit projection for a pinned memory block. Pure: reads nothing, writes
 * nothing. `chars`/`remaining` account the rendered portion (the part that
 * fits the budget), so over-limit content reports truncated=true,
 * remaining=0 and the reader can still see the prefix instead of failing. */
export function renderPinnedBlock(content = '', { maxChars = PINNED_DEFAULT_MAX_CHARS } = {}) {
  const limit = clampPinnedMaxChars(maxChars);
  const normalized = normalizePinnedContent(content);
  let included = normalized;
  if (included.length > limit) {
    included = included.slice(0, limit);
    const lastNewline = included.lastIndexOf('\n');
    if (lastNewline >= 0) included = included.slice(0, lastNewline + 1);
  }
  const rows = included.split('\n');
  if (rows.length > 0 && rows[rows.length - 1] === '') rows.pop();
  const chars = included.length;
  return {
    maxChars: limit,
    lines: rows.map((text, index) => ({ no: index + 1, text })),
    truncated: normalized.length > limit,
    chars,
    remaining: limit - chars,
  };
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
