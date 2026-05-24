/* 中文注释：Refs 层把原始证据留在本地可召回存储，避免大文本直接进入模型上下文。 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { resolveAiosStateRoot } from '../../aios/state-root.mjs';

/* 中文注释：写 ref 时原文和 metadata 分开存，raw 用于召回，meta 用于列表、审计和过期清理。 */
export async function writeRawRef({ workspaceRoot, sessionId, host, kind, source, raw, command = '', toolName = '', cwd = '', strategy = '', now = () => new Date() }) {
  const root = rawRefsSessionRoot(workspaceRoot, sessionId);
  await mkdir(root, { recursive: true });

  /* 中文注释：refId 包含 kind、时间戳和 hash 前缀，既便于人工识别，也能降低同名碰撞概率。 */
  const rawText = String(raw ?? '');
  const sha256 = createHash('sha256').update(rawText).digest('hex');
  const refId = buildRefId({ kind, sha256, now });
  const rawPath = path.join(root, `${refId}.raw`);
  const metaPath = path.join(root, `${refId}.meta.json`);
  const rawBytes = Buffer.byteLength(rawText, 'utf8');

  const meta = {
    ref_id: refId,
    session_id: sanitizePathSegment(sessionId || 'default'),
    host,
    kind,
    source,
    command,
    tool: toolName,
    cwd,
    created_at: now().toISOString(),
    ttl_days: 30,
    raw_bytes: rawBytes,
    sha256,
    redaction_status: 'not_scanned',
    contains_secret_signal: false,
    privacy_level: 'unknown',
    strategy,
  };

  await writeFile(rawPath, rawText, 'utf8');
  await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');

  return { refId, rawPath, metaPath, sha256, rawBytes, meta };
}

/* 中文注释：召回必须同时读取 raw 和 meta；如果任一缺失，就让调用方看到文件系统错误而不是半真结果。 */
export async function readRawRef({ workspaceRoot, sessionId, refId }) {
  const root = rawRefsSessionRoot(workspaceRoot, sessionId);
  const safeRefId = sanitizePathSegment(refId);
  const rawPath = path.join(root, `${safeRefId}.raw`);
  const metaPath = path.join(root, `${safeRefId}.meta.json`);
  const [raw, metaText] = await Promise.all([
    readFile(rawPath, 'utf8'),
    readFile(metaPath, 'utf8'),
  ]);
  return { raw, meta: JSON.parse(metaText), rawPath, metaPath };
}

/* 中文注释：所有 interception refs 都落在 .aios/interception/refs/<session>，避免污染通用 offload 存储。 */
export function rawRefsSessionRoot(workspaceRoot, sessionId) {
  return path.join(resolveAiosStateRoot(workspaceRoot), 'interception', 'refs', sanitizePathSegment(sessionId || 'default'));
}

/* 中文注释：hash 只放短前缀给人读，完整 sha256 仍保存在 meta 中用于校验。 */
function buildRefId({ kind, sha256, now }) {
  const stamp = now().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const prefix = sanitizePathSegment(kind || 'raw').replace(/\./g, '-');
  return `${prefix}-${stamp}-${sha256.slice(0, 12)}`;
}

/* 中文注释：session/refId 会进入路径，必须收窄字符集防止路径穿越和平台不兼容字符。 */
function sanitizePathSegment(value) {
  return String(value || 'default').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128) || 'default';
}
