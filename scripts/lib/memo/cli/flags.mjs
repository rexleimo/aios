import {
  DEFAULT_LIST_LIMIT,
  DEFAULT_RECALL_HIGHLIGHT_LIMIT,
} from './constants.mjs';
import { parsePositiveLimit } from './shared.mjs';

export function splitFlags(argv) {
  const flags = {
    limit: DEFAULT_LIST_LIMIT,
    semantic: false,
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
    positionals.push(arg);
  }
  return { positionals, flags };
}

export function splitRecallFlags(argv) {
  const flags = {
    limit: DEFAULT_LIST_LIMIT,
    highlightLimit: DEFAULT_RECALL_HIGHLIGHT_LIMIT,
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
    positionals.push(arg);
  }
  return { positionals, flags };
}
