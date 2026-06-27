export function nowIso() {
  return new Date().toISOString();
}

import { normalizeText } from '../../../../src/shared/normalize.mjs';
export { normalizeText };

// 纯函数：清理缓存键中的分隔符，避免路径或 ID 中的双冒号污染组合键。
export function getCacheKeyPart(value) {
  return String(value ?? '').replaceAll('::', ':');
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

// 纯函数：裁剪长文本并使用明确省略号，避免日志和 HUD 输出乱码。
export function clipText(value, maxLen = 300) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

export function normalizeTurnStatus(value = '') {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'done' || normalized === 'completed' || normalized === 'simulated') return 'done';
  if (normalized === 'running') return 'running';
  if (normalized === 'blocked' || normalized === 'needs-input') return 'blocked';
  if (normalized === 'queued' || normalized === 'pending') return 'queued';
  return 'queued';
}

export function topEntries(map, limit = 5) {
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
    .slice(0, limit);
}