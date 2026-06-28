// 纯函数：统一文本与路径前缀规整，避免蓝图、work item、dispatch policy 各自处理空值。
// 注意：`export ... from` 不创建本地绑定，必须先 import 才能在本文件内调用。
import { normalizeText } from '../../../../src/shared/normalize.mjs';
export { normalizeText };

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
