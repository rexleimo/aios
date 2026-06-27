// 纯函数：生成稳定的 32 位哈希，避免测试数据依赖随机数。
// 纯函数：用 JSON 语义做深拷贝，适合当前策略快照这类纯数据对象。
export { computeHash, clone } from '../../../src/shared/normalize.mjs';

// 纯函数：统一数值边界裁剪，防止各策略模块重复写 NaN 保护。
export function clamp(value, min, max) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return min;
  }
  return Math.min(max, Math.max(min, normalized));
}

// 纯函数：统一安全除法，避免监控指标在 0 样本时出现 Infinity/NaN。
export function safeRatio(numerator, denominator) {
  const top = Number(numerator || 0);
  const bottom = Number(denominator || 0);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= 0) {
    return 0;
  }
  return top / bottom;
}

// 纯函数：把外部配置值规整成有限数值，不合法时使用兜底值。
export function toFiniteNumber(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}
