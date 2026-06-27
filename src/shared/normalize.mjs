// src/shared/normalize.mjs — 统一文本/哈希/克隆工具函数
// 提取原因：normalizeText 在 37 个文件中各自定义、computeHash 在 9 个文件中各自定义、clone 在多处重复
// 实现差异：normalizeText 有两种变体（有 fallback / 无 fallback），统一为带 fallback 版本；
//           computeHash 全部使用 FNV-1a 算法（seed=2166136261, prime=16777619），保持一致

/** 统一文本归一化：null/undefined → fallback，trim */
export function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

/** 快速哈希（FNV-1a 非加密），用于轻量缓存/索引/采样 */
export function computeHash(value) {
  let hash = 2166136261
  const text = String(value)
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/** 深拷贝纯对象/数组（JSON serialization），不处理函数/Date/Map/Set */
export function clone(value) {
  if (value == null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value))
}
