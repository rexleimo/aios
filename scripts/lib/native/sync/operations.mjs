import path from 'node:path';

import {
  hasManagedMarkdownBlock,
  mergeManagedJsonFragment,
  parseJsonObject,
  removeManagedJsonFragment,
  removeManagedMarkdownBlock,
  stringifyJsonObject,
  upsertManagedMarkdownBlock,
  wrapManagedMarkdown,
} from '../emitters/shared.mjs';

import { backupTarget, normalizeText, pathExists, summarizeMutation } from './fs-ops.mjs';

export async function applyMarkdownBlockOperation(targetPath, content, fsOps, backups) {
  const previous = await fsOps.readTextTarget(targetPath);
  const existsBefore = previous.length > 0 || await pathExists(targetPath);
  const next = upsertManagedMarkdownBlock(previous, content);
  if (normalizeText(previous) === normalizeText(next)) {
    return 'reused';
  }
  await backupTarget(targetPath, fsOps, backups);
  await fsOps.writeTextTarget(targetPath, next);
  return summarizeMutation(existsBefore, true);
}

export async function applyManagedFileOperation(targetPath, content, fsOps, backups, repair) {
  const previous = await fsOps.readTextTarget(targetPath);
  const existsBefore = previous.length > 0 || await pathExists(targetPath);
  const next = wrapManagedMarkdown(content);

  if (previous) {
    let managed = false;
    try {
      managed = hasManagedMarkdownBlock(previous);
    } catch {
      if (!repair.forceReplaceManagedFiles) {
        throw new Error(`malformed managed block: ${path.basename(targetPath)}`);
      }
    }
    if (!managed && !repair.forceReplaceManagedFiles) {
      throw new Error(`unmanaged conflict: ${path.basename(targetPath)}`);
    }
    if (managed && normalizeText(previous) === normalizeText(next)) {
      return 'reused';
    }
  }

  await backupTarget(targetPath, fsOps, backups);
  await fsOps.writeTextTarget(targetPath, next);
  return summarizeMutation(existsBefore, true);
}

export async function applyJsonMergeOperation(targetPath, fragment, fsOps, backups, repair) {
  const previous = await fsOps.readTextTarget(targetPath);
  const existsBefore = previous.length > 0 || await pathExists(targetPath);
  let parsed;
  try {
    parsed = parseJsonObject(previous, targetPath);
  } catch {
    if (!repair.resetInvalidJson) {
      throw new Error(`invalid json: ${path.basename(targetPath)}`);
    }
    parsed = {};
  }
  const next = stringifyJsonObject(mergeManagedJsonFragment(parsed, fragment));
  if (normalizeText(previous) === normalizeText(next)) {
    return 'reused';
  }
  await backupTarget(targetPath, fsOps, backups);
  await fsOps.writeTextTarget(targetPath, next);
  return summarizeMutation(existsBefore, true);
}

export async function removeOperation(targetPath, kind, fsOps, backups) {
  const previous = await fsOps.readTextTarget(targetPath);
  if (!previous && !(await pathExists(targetPath))) {
    return 'reused';
  }

  if (kind === 'markdown-block') {
    if (!previous || !hasManagedMarkdownBlock(previous)) {
      return 'reused';
    }
    const next = removeManagedMarkdownBlock(previous);
    await backupTarget(targetPath, fsOps, backups);
    if (next) {
      await fsOps.writeTextTarget(targetPath, next);
    } else {
      await fsOps.removeTarget(targetPath);
    }
    return 'removed';
  }

  if (kind === 'managed-file') {
    if (!previous || !hasManagedMarkdownBlock(previous)) {
      return 'reused';
    }
    await backupTarget(targetPath, fsOps, backups);
    await fsOps.removeTarget(targetPath);
    return 'removed';
  }

  const parsed = parseJsonObject(previous, targetPath);
  if (!(parsed && typeof parsed === 'object' && 'aiosNative' in parsed)) {
    return 'reused';
  }
  const nextObject = removeManagedJsonFragment(parsed);
  const nextText = Object.keys(nextObject).length > 0 ? stringifyJsonObject(nextObject) : '';
  await backupTarget(targetPath, fsOps, backups);
  if (nextText) {
    await fsOps.writeTextTarget(targetPath, nextText);
  } else {
    await fsOps.removeTarget(targetPath);
  }
  return 'removed';
}
