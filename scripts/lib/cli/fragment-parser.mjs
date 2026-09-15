import { parseArgs } from './parse-args.mjs';

export const AIOS_COMMAND_PREFIX = 'node scripts/aios.mjs ';

// 中文注释：agent 可见的命令提示统一为全局安装 CLI 形态（aios ...）；
// 解析端同时接受历史源码仓相对前缀与 ~/.aios/bin 绝对路径写法，保证旧计划/旧产物仍可解析。
const AIOS_COMMAND_PREFIXES = Object.freeze([
  'aios ',
  '~/.aios/bin/aios ',
  AIOS_COMMAND_PREFIX,
]);

export function tokenizeCliFragment(value = '') {
  const tokens = [];
  let token = '';
  let quote = '';
  let escaping = false;

  for (const char of String(value || '')) {
    if (escaping) {
      token += char;
      escaping = false;
      continue;
    }

    if (char === '\\' && quote) {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = '';
      } else {
        token += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (/\s/u.test(char)) {
      if (token) {
        tokens.push(token);
        token = '';
      }
      continue;
    }

    token += char;
  }

  if (token) {
    tokens.push(token);
  }
  return tokens;
}

export function parseAiosCommandAction(action = '', { prefix } = {}) {
  const trimmed = String(action || '').trim();
  const prefixes = prefix ? [prefix] : AIOS_COMMAND_PREFIXES;
  const matched = prefixes.find((candidate) => trimmed.startsWith(candidate));
  if (!matched) return null;

  try {
    return parseArgs(tokenizeCliFragment(trimmed.slice(matched.length)));
  } catch {
    return null;
  }
}
