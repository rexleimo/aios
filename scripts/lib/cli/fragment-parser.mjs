import { parseArgs } from './parse-args.mjs';

export const AIOS_COMMAND_PREFIX = 'node scripts/aios.mjs ';

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

export function parseAiosCommandAction(action = '', { prefix = AIOS_COMMAND_PREFIX } = {}) {
  const trimmed = String(action || '').trim();
  if (!trimmed.startsWith(prefix)) return null;

  try {
    return parseArgs(tokenizeCliFragment(trimmed.slice(prefix.length)));
  } catch {
    return null;
  }
}
