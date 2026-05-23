import path from 'node:path';
import { getActiveMemoStorage } from './config.mjs';
import {
  collectRecursiveFiles,
  readTextIfExists,
  writeText,
} from './fs-io.mjs';
import {
  normalizeMemoStorageName,
  sanitizeSpace,
} from './normalizers.mjs';
import {
  filePinnedPath,
  memoRoot,
  splitPinnedPath,
} from './paths.mjs';

function pinnedFilePath(workspaceRoot, storage, space) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  const safeSpace = sanitizeSpace(space);
  return resolvedStorage === 'file'
    ? filePinnedPath(workspaceRoot, safeSpace)
    : splitPinnedPath(workspaceRoot, safeSpace);
}

export async function readPinnedMemo(workspaceRoot, { storage, space = 'default' } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  return await readTextIfExists(pinnedFilePath(workspaceRoot, resolvedStorage, space));
}

export async function writePinnedMemo(workspaceRoot, { storage, space = 'default', content = '' } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const normalized = String(content ?? '').trimEnd();
  const next = normalized ? `${normalized}\n` : '';
  await writeText(pinnedFilePath(workspaceRoot, resolvedStorage, space), next);
  return next;
}

export async function appendPinnedMemo(workspaceRoot, { storage, space = 'default', content = '' } = {}) {
  const resolvedStorage = storage ? normalizeMemoStorageName(storage) : await getActiveMemoStorage(workspaceRoot);
  const addition = String(content ?? '').trim();
  if (!addition) return await readPinnedMemo(workspaceRoot, { storage: resolvedStorage, space });
  const existing = (await readPinnedMemo(workspaceRoot, { storage: resolvedStorage, space })).trimEnd();
  const next = existing ? `${existing}\n\n${addition}\n` : `${addition}\n`;
  await writeText(pinnedFilePath(workspaceRoot, resolvedStorage, space), next);
  return next;
}

export async function readPinnedByStorage(workspaceRoot, storage) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  const pinnedRoot = path.join(memoRoot(workspaceRoot), resolvedStorage, 'pinned');
  const files = await collectRecursiveFiles(pinnedRoot, (filePath) => filePath.endsWith('.md'));
  const output = [];
  for (const filePath of files) {
    const safeSpace = path.basename(filePath, '.md');
    const content = await readTextIfExists(filePath);
    if (content) output.push({ safeSpace, content });
  }
  return output;
}

export async function writePinnedByStorage(workspaceRoot, storage, pinned) {
  const resolvedStorage = normalizeMemoStorageName(storage);
  for (const entry of pinned) {
    const targetPath = resolvedStorage === 'file'
      ? filePinnedPath(workspaceRoot, entry.safeSpace)
      : splitPinnedPath(workspaceRoot, entry.safeSpace);
    await writeText(targetPath, entry.content || '');
  }
}
