/* 中文注释：dispatch evidence 的通用纯函数只处理字符串、数组和路径格式。 */
import { contextDbRelativePath } from '../../aios/state-root.mjs';

import { normalizeText } from '../../../../src/shared/normalize.mjs';
export { normalizeText };

// 纯函数：字符串数组去重去空，保证 refs/workItemRefs 稳定。
export function uniqueStrings(values = []) {
  const seen = new Set();
  const results = [];
  for (const value of values) {
    const text = normalizeText(value);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    results.push(text);
  }
  return results;
}

export function normalizeStringArray(raw = []) {
  if (!Array.isArray(raw)) return [];
  return uniqueStrings(raw);
}

export function formatArtifactTimestamp(ts = new Date()) {
  return ts.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1Z');
}

export function buildArtifactPath(rootDir, sessionId, stamp) {
  return contextDbRelativePath(rootDir, 'sessions', sessionId, 'artifacts', `dispatch-run-${stamp}.json`);
}

export function normalizeDispatchMode(dispatchRun = {}) {
  const mode = String(dispatchRun?.mode || '').trim();
  return mode || 'dry-run';
}

export function formatRefsCsv(refs = []) {
  return normalizeStringArray(refs).join(',');
}
