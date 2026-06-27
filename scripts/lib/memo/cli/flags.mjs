import {
  DEFAULT_LIST_LIMIT,
  DEFAULT_RECALL_HIGHLIGHT_LIMIT,
} from './constants.mjs';
import { parsePositiveLimit } from './shared.mjs';

export function splitFlags(argv) {
  const flags = {
    limit: DEFAULT_LIST_LIMIT,
    semantic: false,
    scope: '',
    agent: '',
  };
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '--limit') {
      flags.limit = parsePositiveLimit(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--semantic') {
      flags.semantic = true;
      continue;
    }
    if (arg === '--scope') {
      flags.scope = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--agent') {
      flags.agent = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    positionals.push(arg);
  }
  return { positionals, flags };
}

export function splitRecallFlags(argv) {
  const flags = {
    limit: DEFAULT_LIST_LIMIT,
    highlightLimit: DEFAULT_RECALL_HIGHLIGHT_LIMIT,
    scope: '',
    agent: '',
    mode: 'hybrid',
    maxCharsPerMemory: '',
    maxTotalChars: '',
  };
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '--limit') {
      flags.limit = parsePositiveLimit(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--highlight-limit') {
      flags.highlightLimit = parsePositiveLimit(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--scope') {
      flags.scope = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--agent') {
      flags.agent = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--mode') {
      const value = String(argv[i + 1] || '').trim().toLowerCase();
      if (!['fts-only', 'hybrid'].includes(value)) {
        throw new Error('--mode must be one of: fts-only, hybrid');
      }
      flags.mode = value;
      i += 1;
      continue;
    }
    if (arg === '--max-chars-per-memory') {
      flags.maxCharsPerMemory = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--max-total-chars') {
      flags.maxTotalChars = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    positionals.push(arg);
  }
  return { positionals, flags };
}
