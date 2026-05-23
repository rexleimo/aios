const WORD_RE = /[\p{L}\p{N}]+/gu;
const CJK_CHAR_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

// 纯函数：把中英文搜索词统一拆成 SQLite FTS 友好的 token。
export function tokenizeSearchQuery(query: string): string[] {
  const chunks = String(query || '').toLowerCase().match(WORD_RE) ?? [];
  const tokens: string[] = [];

  for (const chunk of chunks) {
    const token = chunk.trim();
    if (!token) continue;

    if (CJK_CHAR_RE.test(token)) {
      const chars = Array.from(token).filter((char) => CJK_CHAR_RE.test(char));
      if (chars.length === 1) {
        tokens.push(chars[0]);
        continue;
      }
      for (let index = 0; index < chars.length - 1; index += 1) {
        tokens.push(`${chars[index]}${chars[index + 1]}`);
      }
      if (token.length <= 8) tokens.push(token);
      continue;
    }

    if (token.length >= 2) tokens.push(token);
  }

  return Array.from(new Set(tokens));
}

// 纯函数：把 token 转成 FTS 前缀匹配表达式，查询层不用重复拼接。
export function toFtsMatchQuery(tokens: string[]): string {
  return tokens.map((token) => `${token}*`).join(' OR ');
}
