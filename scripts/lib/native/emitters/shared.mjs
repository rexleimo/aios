import fs from 'node:fs';

import { stripManagedBlock } from '../../platform/fs.mjs';
import { resolveNativeSourcePath, resolveSharedNativePartialPath } from '../source-tree.mjs';

export const AIOS_NATIVE_BEGIN_MARK = '<!-- AIOS NATIVE BEGIN -->';
export const AIOS_NATIVE_END_MARK = '<!-- AIOS NATIVE END -->';
export const AIOS_NATIVE_JSON_KEY = 'aiosNative';

// AGENTS.md 是多个客户端共用的指令文件，一次同步只能由一个写入方负责，否则互相覆盖。
// 顺序即优先级：靠前者已选中时，靠后者不再重复写 AGENTS.md。
export const AGENTS_MD_COWRITERS = Object.freeze(['codex', 'opencode', 'grok', 'hermes', 'workbuddy', 'pi']);

// 纯函数：判断同批次里是否已有更高优先级的共写方负责 AGENTS.md。
export function isAgentsMdClaimedByPeer(selectedClients = [], self = '') {
  const selected = new Set(Array.isArray(selectedClients) ? selectedClients : []);
  return AGENTS_MD_COWRITERS.some((client) => client !== self && selected.has(client));
}

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
// Missing partials are skipped (not thrown): self-update can replace the install
// tree mid-process while an older in-memory SHARED_SECTION_PLAN still names a
// retired file such as superpowers.md.
export function readNativePartials(rootDir, fileNames = []) {
  return fileNames
    .map((fileName) => {
      const partialPath = resolveSharedNativePartialPath({ rootDir, fileName });
      if (!fs.existsSync(partialPath)) {
        return '';
      }
      return fs.readFileSync(partialPath, 'utf8').trim();
    })
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

// 中文注释：hooks 模板里的 `node scripts/aios.mjs ...` 是源码仓库相对路径，客户端工作区
// 没有 scripts/ 目录，原样写出必然执行失败。写入客户端前统一烘焙成安装根的绝对路径，
// 与 init 程序化添加的 save-guard/offload 钩子保持同一约定（GUI 启动的客户端不保证
// PATH 里有 ~/.aios/bin，钩子不能依赖 `aios` 命令解析）。
function bakeRuntimeCliPaths(content, rootDir) {
  return String(content).replaceAll('node scripts/aios.mjs', `node ${rootDir}/scripts/aios.mjs`);
}

export function readClientJsonSource(rootDir, client, fileName) {
  return JSON.parse(bakeRuntimeCliPaths(
    fs.readFileSync(resolveNativeSourcePath({ rootDir, client, fileName }), 'utf8'),
    rootDir,
  ));
}

export function readOptionalClientJson(rootDir, client, fileName) {
  try {
    return readClientJsonSource(rootDir, client, fileName);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export function joinMarkdownSections(sections = []) {
  return sections.map((item) => String(item || '').trim()).filter(Boolean).join('\n\n').trim();
}
