// 纯函数：生成稳定哈希，用于 canary 分桶。
export { computeHash } from '../../../../src/shared/normalize.mjs';

export function clamp(value, min, max) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return min;
  }
  return Math.min(max, Math.max(min, normalized));
}

export function parseBoolean(value, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

export function normalizeMode(value = 'legacy') {
  const normalized = String(value || '').trim().toLowerCase();
  if (['legacy', 'off', 'observe', 'canary', 'full'].includes(normalized)) {
    return normalized;
  }
  return 'legacy';
}

export function safePositiveInteger(value, fallback) {
  const normalized = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    return fallback;
  }
  return normalized;
}
