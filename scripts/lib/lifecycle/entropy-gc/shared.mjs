/* 中文注释：entropy-gc 通用纯函数只处理文本、路径、时间戳和记录格式化。 */
import path from 'node:path';

import { normalizeText } from '../../../../src/shared/normalize.mjs';
export { normalizeText };

// 纯函数：报告路径统一为 slash，保证 Windows/Linux 输出稳定。
export function normalizePath(value = '') {
  return String(value || '').split(path.sep).join('/');
}

// 纯函数：把绝对路径转为工作区相对路径，便于 manifest 可迁移。
export function toRelativePath(rootDir, absolutePath) {
  return normalizePath(path.relative(rootDir, absolutePath));
}

// 纯函数：entropy-gc 的整数参数允许非法值回退默认值，兼容旧 CLI 行为。
export function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

export function formatStamp(date = new Date()) {
  const iso = date.toISOString().replace(/[-:]/g, '');
  return iso.slice(0, 15).replace('T', 'T');
}

// 纯函数：维护事件 turnId 只由 sessionId 和时间戳组成，便于后续检索。
export function buildEntropyTurnId(report = {}) {
  const sessionId = normalizeText(report.sessionId).replace(/[^a-zA-Z0-9._:-]/g, '') || 'session';
  return `entropy:${sessionId}:${formatStamp()}`;
}

// 纯函数：把文件 stat 记录压缩成 manifest 使用的稳定结构。
export function buildCandidateRecord(rootDir, record) {
  return {
    path: toRelativePath(rootDir, record.absolutePath),
    sizeBytes: record.sizeBytes,
    mtimeMs: Math.floor(record.mtimeMs),
  };
}
