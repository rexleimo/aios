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
} from '../../distribution/emitters/shared.mjs';

import { backupTarget, normalizeText, pathExists, summarizeMutation } from './fs-ops.mjs';

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function mergeArrayValues(existing, incoming) {
  const merged = [...existing];
  for (const item of incoming) {
    if (!merged.some((previous) => JSON.stringify(previous) === JSON.stringify(item))) {
      merged.push(item);
    }
  }
  return merged;
}

function deepMergeJsonObject(existing, fragment) {
  const next = { ...existing };
  for (const [key, value] of Object.entries(fragment || {})) {
    const previous = next[key];
    if (isPlainObject(previous) && isPlainObject(value)) {
      next[key] = deepMergeJsonObject(previous, value);
    } else if (Array.isArray(previous) && Array.isArray(value)) {
      next[key] = mergeArrayValues(previous, value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

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

export async function applyManagedExactFileOperation(targetPath, content, fsOps, backups, repair) {
  const previous = await fsOps.readTextTarget(targetPath);
  const existsBefore = previous.length > 0 || await pathExists(targetPath);
  const next = `${normalizeText(content).trimEnd()}\n`;

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

export async function applyJsonTopLevelMergeOperation(targetPath, fragment, fsOps, backups, repair) {
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
  const next = stringifyJsonObject(deepMergeJsonObject(parsed, fragment));
  if (normalizeText(previous) === normalizeText(next)) {
    return 'reused';
  }
  await backupTarget(targetPath, fsOps, backups);
  await fsOps.writeTextTarget(targetPath, next);
  return summarizeMutation(existsBefore, true);
}

function deepMergeJsonDefaults(existing, fragment) {
  const next = { ...existing };
  for (const [key, value] of Object.entries(fragment || {})) {
    if (!(key in next)) {
      next[key] = value;
      continue;
    }
    const previous = next[key];
    if (isPlainObject(previous) && isPlainObject(value)) {
      next[key] = deepMergeJsonDefaults(previous, value);
    }
    // 已存在且非对象：用户的取值优先，绝不覆盖。
  }
  return next;
}

/* 中文注释：`json-default-merge` 用于只有一个槽位的资源（Claude Code 的 statusLine）。
 * `json-top-level-merge` 会覆盖同名键；对 statusLine 来说那等于把用户自己的状态栏删掉，
 * 而这类冲突不能靠覆盖解决（upstream caveman 也拒绝覆盖既有 statusLine）。
 * 因此本操作只补缺、不覆盖：键已存在时保持用户取值，重复执行必然 reused。 */
export async function applyJsonDefaultMergeOperation(targetPath, fragment, fsOps, backups, repair) {
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
  const next = stringifyJsonObject(deepMergeJsonDefaults(parsed, fragment));
  if (normalizeText(previous) === normalizeText(next)) {
    return 'reused';
  }
  await backupTarget(targetPath, fsOps, backups);
  await fsOps.writeTextTarget(targetPath, next);
  return summarizeMutation(existsBefore, true);
}

// 纯函数：卸载时只收回“仍然是 AIOS 写的那个值”的顶层键。
// 用户改写过（或本来就拥有）的值一律保留——卸载不应删掉不是我们写的东西。
export function stripOwnedJsonDefaults(existingObject, fragment) {
  if (!isPlainObject(existingObject)) return existingObject;
  const next = { ...existingObject };
  for (const [key, value] of Object.entries(fragment || {})) {
    if (JSON.stringify(next[key]) === JSON.stringify(value)) delete next[key];
  }
  return next;
}

export async function removeOperation(targetPath, kind, fsOps, backups, content = {}) {
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

  if (kind === 'managed-file' || kind === 'managed-exact-file') {
    if (!previous || !hasManagedMarkdownBlock(previous)) {
      return 'reused';
    }
    await backupTarget(targetPath, fsOps, backups);
    await fsOps.removeTarget(targetPath);
    return 'removed';
  }

  if (kind === 'json-default-merge') {
    const owned = parseJsonObject(previous, targetPath);
    const nextObject = stripOwnedJsonDefaults(owned, content);
    if (JSON.stringify(nextObject) === JSON.stringify(owned)) {
      return 'reused';
    }
    const nextText = Object.keys(nextObject).length > 0 ? stringifyJsonObject(nextObject) : '';
    await backupTarget(targetPath, fsOps, backups);
    if (nextText) {
      await fsOps.writeTextTarget(targetPath, nextText);
    } else {
      await fsOps.removeTarget(targetPath);
    }
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
