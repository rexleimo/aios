// 纯函数：统一文本与路径前缀规整，避免蓝图、work item、dispatch policy 各自处理空值。
export function normalizeText(value) {
  return String(value ?? '').trim();
}

export function normalizeOwnedPathPrefixes(raw = null) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0 || item === '');
}

export function hasWildcardOwnedPrefix(prefixes = []) {
  return Array.isArray(prefixes) && prefixes.some((prefix) => prefix === '');
}
