import fs from 'node:fs';

import { stripManagedBlock } from '../../platform/fs.mjs';
import { ALL_CLIENTS } from '../../clients/core/definitions.mjs';
import { orderByPriority } from '../../clients/core/ordering.mjs';
import { getClientInstructionFileName } from '../../clients/native/index.mjs';
import { resolveNativeSourcePath, resolveSharedNativePartialPath } from '../source-tree.mjs';

export const AIOS_NATIVE_BEGIN_MARK = '<!-- AIOS NATIVE BEGIN -->';
export const AIOS_NATIVE_END_MARK = '<!-- AIOS NATIVE END -->';
export const AIOS_NATIVE_JSON_KEY = 'aiosNative';

// AGENTS.md 是多个客户端共用的指令文件，一次同步只能由一个写入方负责，否则互相覆盖。
// 顺序即优先级：靠前者已选中时，靠后者不再重复写 AGENTS.md。
// 成员=注册表中 instructionFileName 为 AGENTS.md 的客户端；priority 只保留既有的
// codex/opencode/grok 先于其余共写方这一相对顺序。
const AGENTS_MD_WRITERS = Object.freeze(ALL_CLIENTS.filter(
  (client) => getClientInstructionFileName(client) === 'AGENTS.md',
));
export const AGENTS_MD_COWRITERS = orderByPriority(AGENTS_MD_WRITERS, ['codex', 'opencode', 'grok']);

// 纯函数：只有排名更靠前的共写方在本次选择里时 self 才让位；不看排名会让 pi+zcode 这类
// 组合双方都让位、AGENTS.md 没人写。rank<=0 同时覆盖首位 codex 与非共写方（CLAUDE.md/GEMINI.md）。
export function isAgentsMdClaimedByPeer(selectedClients = [], self = '') {
  const rank = AGENTS_MD_COWRITERS.indexOf(self);
  if (rank <= 0) return false;
  const selected = new Set(Array.isArray(selectedClients) ? selectedClients : []);
  return AGENTS_MD_COWRITERS.slice(0, rank).some((client) => selected.has(client));
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
//
// 必须在 JSON 解析之后、字符串值层做替换，再交给 JSON.stringify 转义。早先在原文本上
// 直接 replaceAll 会把 Windows 安装根（`E:\\coding\\aios`）的反斜杠留在 JSON 字符串字面量里，
// `\c`、`\h` 属于非法转义，于是 JSON.parse 抛 "Bad escaped character"，整个 doctor:native
// 环节崩溃（POSIX 路径无反斜杠，因此该缺陷只在 Windows 暴露）。
export function bakeRuntimeCliValues(value, rootDir) {
  if (typeof value === 'string') {
    return value.replaceAll('node scripts/aios.mjs', `node ${rootDir}/scripts/aios.mjs`);
  }
  if (Array.isArray(value)) {
    return value.map((item) => bakeRuntimeCliValues(item, rootDir));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, bakeRuntimeCliValues(item, rootDir)]),
    );
  }
  return value;
}

export function readClientJsonSource(rootDir, client, fileName) {
  const source = fs.readFileSync(resolveNativeSourcePath({ rootDir, client, fileName }), 'utf8');
  return bakeRuntimeCliValues(JSON.parse(source), rootDir);
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
