/* 中文注释：Refs 层把原始证据留在本地可召回存储，避免大文本直接进入模型上下文。 */
import { readdir, readFile, stat, unlink } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';

import { rawRefsSessionRoot } from './raw-ref-store.mjs';
import { resolveAiosStateRoot } from '../../aios/state-root.mjs';

/* 中文注释：read 是精准召回路径；优先按 session 查，没传 session 时跨 session 搜索。 */
export async function readInterceptionRef({ workspaceRoot, refId, sessionId = '' }) {
  const hit = await findRefPaths({ workspaceRoot, refId, sessionId });
  if (!hit) return null;
  const [raw, metaText] = await Promise.all([
    readFile(hit.rawPath, 'utf8'),
    readFile(hit.metaPath, 'utf8'),
  ]);
  return { raw, meta: JSON.parse(metaText), rawPath: hit.rawPath, metaPath: hit.metaPath };
}

/* 中文注释：grep 只返回 ref 命中信息，不把命中的大段 raw 直接打印回上下文。 */
export async function grepInterceptionRefs({ workspaceRoot, pattern, sessionId = '', limit = 20 }) {
  const regex = toRegex(pattern);
  const results = [];
  for (const session of await listSessionDirs(workspaceRoot, sessionId)) {
    for (const file of await safeReaddir(session.path)) {
      if (results.length >= limit) return results;
      if (!file.endsWith('.raw')) continue;
      const rawPath = path.join(session.path, file);
      const raw = await readFile(rawPath, 'utf8');
      if (!regex.test(raw)) continue;
      const refId = file.replace(/\.raw$/u, '');
      const meta = await readMeta(session.path, refId);
      results.push({ ref_id: refId, session: session.name, source: meta?.source || '', host: meta?.host || '', path: rawPath });
    }
  }
  return results;
}

/* 中文注释：list 用 meta 构建轻量索引视图，方便用户找到 ref 后再按需 read。 */
export async function listInterceptionRefs({ workspaceRoot, sessionId = '', limit = 20 }) {
  const results = [];
  for (const session of await listSessionDirs(workspaceRoot, sessionId)) {
    for (const file of await safeReaddir(session.path)) {
      if (results.length >= limit) return results;
      if (!file.endsWith('.meta.json')) continue;
      const meta = JSON.parse(await readFile(path.join(session.path, file), 'utf8'));
      results.push({ ref_id: meta.ref_id, session: session.name, source: meta.source, host: meta.host, bytes: meta.raw_bytes, path: path.join(session.path, `${meta.ref_id}.raw`) });
    }
  }
  return results;
}

/* 中文注释：prune 只按文件 mtime 清理旧 ref，不理解业务内容，避免误删当前 session 的新证据。 */
export async function pruneInterceptionRefs({ workspaceRoot, keepDays = 30 }) {
  const cutoff = Date.now() - Number(keepDays || 30) * 86400_000;
  let pruned = 0;
  let bytesFreed = 0;
  for (const session of await listSessionDirs(workspaceRoot, '')) {
    for (const file of await safeReaddir(session.path)) {
      const filePath = path.join(session.path, file);
      const st = await stat(filePath);
      if (st.mtimeMs >= cutoff) continue;
      bytesFreed += st.size;
      await unlink(filePath);
      pruned += 1;
    }
  }
  return { pruned, bytesFreed };
}

/* 中文注释：refId 查找同时要求 .raw 和 .meta.json 存在，防止坏引用被当成有效证据。 */
async function findRefPaths({ workspaceRoot, refId, sessionId }) {
  for (const session of await listSessionDirs(workspaceRoot, sessionId)) {
    const rawPath = path.join(session.path, `${sanitize(refId)}.raw`);
    const metaPath = path.join(session.path, `${sanitize(refId)}.meta.json`);
    if (fs.existsSync(rawPath) && fs.existsSync(metaPath)) return { rawPath, metaPath };
  }
  return null;
}

/* 中文注释：sessionId 为空表示跨 session 召回；这对 proof/doctor 和用户事后排查都很重要。 */
async function listSessionDirs(workspaceRoot, sessionId) {
  if (sessionId) {
    const sessionPath = rawRefsSessionRoot(workspaceRoot, sessionId);
    return fs.existsSync(sessionPath) ? [{ name: sanitize(sessionId), path: sessionPath }] : [];
  }
  const root = path.join(resolveAiosStateRoot(workspaceRoot), 'interception', 'refs');
  if (!fs.existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter(entry => entry.isDirectory()).map(entry => ({ name: entry.name, path: path.join(root, entry.name) }));
}

/* 中文注释：refs 可能被并发清理，目录读取失败时返回空数组，让列表/grep 保持可用。 */
async function safeReaddir(dir) {
  try { return await readdir(dir); }
  catch { return []; }
}

/* 中文注释：meta 损坏不能阻塞 grep 命中 raw；缺失字段用空值展示。 */
async function readMeta(dir, refId) {
  try { return JSON.parse(await readFile(path.join(dir, `${refId}.meta.json`), 'utf8')); }
  catch { return null; }
}

/* 中文注释：所有来自 CLI 的 ref/session 参数都先清洗再拼路径。 */
function sanitize(value) {
  return String(value || 'default').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128) || 'default';
}

/* 中文注释：优先尊重用户给的正则；正则非法时自动退回普通字符串匹配。 */
function toRegex(pattern) {
  try { return new RegExp(pattern, 'i'); }
  catch { return new RegExp(String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); }
}
