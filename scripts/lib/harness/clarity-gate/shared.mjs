/* 中文注释：clarity gate 纯函数工具负责文本、数组和时间戳归一化。 */
// 注意：`export ... from` 不创建本地绑定，必须先 import 才能在本文件内调用。
import { normalizeText } from '../../../../src/shared/normalize.mjs';
export { normalizeText };

export function formatTurnStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1Z');
}

export function normalizeStringArray(raw = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const results = [];
  for (const item of raw) {
    const text = normalizeText(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    results.push(text);
  }
  return results;
}

export function normalizePositiveInteger(raw, fallback) {
  const value = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
