// 纯函数：统一文本归一化，并允许调用方提供兜底值。
export function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}
