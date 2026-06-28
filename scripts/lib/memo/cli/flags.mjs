import { Command } from 'commander';
import {
  DEFAULT_LIST_LIMIT,
  DEFAULT_RECALL_HIGHLIGHT_LIMIT,
} from './constants.mjs';
import { parsePositiveLimit } from './shared.mjs';

// 中文注释：memo list 的 flag 解析——Commander 声明式替代手写 for 循环。
const MEMO_LIST_CLI = new Command()
  .name('memo-list')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[keywords...]')
  .option('--limit <n>', 'Max results')
  .option('--semantic', 'Use semantic search')
  .option('--scope <name>', 'Memory scope')
  .option('--agent <name>', 'Agent namespace');

export function splitFlags(argv) {
  const doubleDashIdx = argv.indexOf('--');
  const help = argv.includes('-h') || argv.includes('--help');

  try {
    const parsed = MEMO_LIST_CLI.parse(argv, { from: 'user' });
    const flags = parsed.opts();

    // 提取 -- 后的 positionals
    let positionals;
    if (doubleDashIdx !== -1) {
      positionals = argv.slice(doubleDashIdx + 1);
    } else {
      positionals = parsed.args || [];
    }

    return {
      positionals,
      flags: {
        limit: flags.limit ? parsePositiveLimit(flags.limit) : DEFAULT_LIST_LIMIT,
        semantic: flags.semantic === true,
        scope: flags.scope || '',
        agent: flags.agent || '',
      },
    };
  } catch {
    return {
      positionals: [],
      flags: {
        limit: DEFAULT_LIST_LIMIT,
        semantic: false,
        scope: '',
        agent: '',
      },
    };
  }
}

// 中文注释：memo recall 的 flag 解析——Commander 声明式替代手写 for 循环。
const MEMO_RECALL_CLI = new Command()
  .name('memo-recall')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[keywords...]')
  .option('--limit <n>', 'Max results')
  .option('--highlight-limit <n>', 'Max highlighted results')
  .option('--scope <name>', 'Memory scope')
  .option('--agent <name>', 'Agent namespace')
  .option('--mode <mode>', 'Search mode: fts-only|hybrid')
  .option('--max-chars-per-memory <n>', 'Max chars per memory entry')
  .option('--max-total-chars <n>', 'Max total chars across all entries');

export function splitRecallFlags(argv) {
  const doubleDashIdx = argv.indexOf('--');

  try {
    const parsed = MEMO_RECALL_CLI.parse(argv, { from: 'user' });
    const flags = parsed.opts();

    let positionals;
    if (doubleDashIdx !== -1) {
      positionals = argv.slice(doubleDashIdx + 1);
    } else {
      positionals = parsed.args || [];
    }

    // --mode 校验（保持原有错误语义）
    let mode = 'hybrid';
    if (flags.mode) {
      const value = String(flags.mode).trim().toLowerCase();
      if (!['fts-only', 'hybrid'].includes(value)) {
        throw new Error('--mode must be one of: fts-only, hybrid');
      }
      mode = value;
    }

    return {
      positionals,
      flags: {
        limit: flags.limit ? parsePositiveLimit(flags.limit) : DEFAULT_LIST_LIMIT,
        highlightLimit: flags.highlightLimit
          ? parsePositiveLimit(flags.highlightLimit)
          : DEFAULT_RECALL_HIGHLIGHT_LIMIT,
        scope: flags.scope || '',
        agent: flags.agent || '',
        mode,
        maxCharsPerMemory: flags.maxCharsPerMemory || '',
        maxTotalChars: flags.maxTotalChars || '',
      },
    };
  } catch (e) {
    if (e instanceof Error && e.message.includes('--mode must be one of')) throw e;
    return {
      positionals: [],
      flags: {
        limit: DEFAULT_LIST_LIMIT,
        highlightLimit: DEFAULT_RECALL_HIGHLIGHT_LIMIT,
        scope: '',
        agent: '',
        mode: 'hybrid',
        maxCharsPerMemory: '',
        maxTotalChars: '',
      },
    };
  }
}
