import fs from 'node:fs';

import { stripManagedBlock } from '../../platform/fs.mjs';
import { resolveNativeSourcePath, resolveSharedNativePartialPath } from '../source-tree.mjs';

export const AIOS_NATIVE_BEGIN_MARK = '<!-- AIOS NATIVE BEGIN -->';
export const AIOS_NATIVE_END_MARK = '<!-- AIOS NATIVE END -->';
export const AIOS_NATIVE_JSON_KEY = 'aiosNative';

import { normalizeText } from '../../../../src/shared/normalize.mjs';

// 注：normalizeText 由 src/shared/normalize.mjs 提供（trim 语义），原 emitters 内联实现已被替换。

export function hasManagedMarkdownBlock(content) {
  const normalized = normalizeText(content);
  const hasBegin = normalized.includes(AIOS_NATIVE_BEGIN_MARK);
  const hasEnd = normalized.includes(AIOS_NATIVE_END_MARK);
  if (hasBegin !== hasEnd) {
    throw new Error('malformed managed markdown block');
  }
  return hasBegin && hasEnd;
}

export function wrapManagedMarkdown(body) {
  const normalized = normalizeText(body).trim();
  return `${AIOS_NATIVE_BEGIN_MARK}\n${normalized}\n${AIOS_NATIVE_END_MARK}\n`;
}

export function upsertManagedMarkdownBlock(existingContent, body) {
  const existing = normalizeText(existingContent);
  const block = wrapManagedMarkdown(body);
  const withoutManaged = hasManagedMarkdownBlock(existing)
    ? stripManagedBlock(existing, AIOS_NATIVE_BEGIN_MARK, AIOS_NATIVE_END_MARK).trimEnd()
    : existing.trimEnd();

  if (!withoutManaged) {
    return block;
  }

  return `${withoutManaged}\n\n${block}`;
}

export function removeManagedMarkdownBlock(existingContent) {
  const existing = normalizeText(existingContent);
  if (!hasManagedMarkdownBlock(existing)) {
    return existing;
  }
  const stripped = stripManagedBlock(existing, AIOS_NATIVE_BEGIN_MARK, AIOS_NATIVE_END_MARK).trimEnd();
  return stripped ? `${stripped}\n` : '';
}

export function parseJsonObject(content, targetPath) {
  const normalized = String(content || '').trim();
  if (!normalized) {
    return {};
  }
  const parsed = JSON.parse(normalized);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`expected JSON object for ${targetPath}`);
  }
  return parsed;
}

export function stringifyJsonObject(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function mergeManagedJsonFragment(existingObject, fragment) {
  return {
    ...existingObject,
    [AIOS_NATIVE_JSON_KEY]: fragment,
  };
}

export function removeManagedJsonFragment(existingObject) {
  if (!existingObject || typeof existingObject !== 'object' || Array.isArray(existingObject)) {
    return {};
  }
  const next = { ...existingObject };
  delete next[AIOS_NATIVE_JSON_KEY];
  return next;
}

export function readSharedMarkdownParts(rootDir) {
  return readNativePartials(rootDir, ['core-instructions.md', 'contextdb.md', 'browser-mcp.md']);
}

// 读取一组共享 native partials，按给定顺序返回非空段落，供能力感知渲染器选取。
export function readNativePartials(rootDir, fileNames = []) {
  return fileNames
    .map((fileName) => fs.readFileSync(resolveSharedNativePartialPath({ rootDir, fileName }), 'utf8').trim())
    .filter(Boolean);
}

export function readClientMarkdownSource(rootDir, client, fileName, { optional = false } = {}) {
  const sourcePath = resolveNativeSourcePath({ rootDir, client, fileName });
  if (!fs.existsSync(sourcePath)) {
    if (optional) return '';
    return fs.readFileSync(sourcePath, 'utf8').trim(); // throw ENOENT for required sources
  }
  return fs.readFileSync(sourcePath, 'utf8').trim();
}

export function readClientJsonSource(rootDir, client, fileName) {
  return JSON.parse(fs.readFileSync(resolveNativeSourcePath({ rootDir, client, fileName }), 'utf8'));
}

export function joinMarkdownSections(sections = []) {
  return sections.map((item) => String(item || '').trim()).filter(Boolean).join('\n\n').trim();
}
