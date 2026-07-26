import { Command } from 'commander';
import { normalizeIsoTimestamp, toSupersedes } from '../storage/temporal.mjs';
import {
  DEFAULT_LIST_LIMIT,
  DEFAULT_RECALL_HIGHLIGHT_LIMIT,
} from './constants.mjs';
import { parsePositiveLimit, usageError } from './shared.mjs';

function parseIsoFlag(raw, flagName) {
  const value = String(raw || '').trim();
  if (!value) return '';
  const normalized = normalizeIsoTimestamp(value);
  if (!normalized) throw usageError(`${flagName} must be an ISO 8601 timestamp`);
  return normalized;
}

// --supersedes takes a comma-separated id list. It is parsed statelessly rather
// than through a Commander collector because these Command instances are module
// level and reused, so a collector's default array accumulates across parses.
function parseSupersedes(raw) {
  return toSupersedes(String(raw || '').split(','));
}

const EMPTY_TEMPORAL_FLAGS = { validAt: '', supersedes: [], asOf: '', includeInvalid: false, supersedeHint: true };

function temporalFlags(flags) {
  return {
    validAt: parseIsoFlag(flags.validAt, '--valid-at'),
    supersedes: parseSupersedes(flags.supersedes),
    asOf: parseIsoFlag(flags.asOf, '--as-of'),
    includeInvalid: flags.includeInvalid === true,
    supersedeHint: flags.supersedeHint !== false,
  };
}

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
  .option('--agent <name>', 'Agent namespace')
  .option('--valid-at <iso>', 'When the fact became true (defaults to now)')
  .option('--supersedes <ids>', 'Comma-separated event ids this entry replaces')
  .option('--as-of <iso>', 'Show the facts that were current at this time')
  .option('--include-invalid', 'Include facts that have been superseded')
  .option('--no-supersede-hint', 'Do not report likely earlier revisions when adding');

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
        ...temporalFlags(flags),
      },
    };
  } catch (error) {
    // 中文注释：flag 本身写错时要报错，不能静默退回默认值。
    if (error?.code === 'AIOS_MEMO_USAGE') throw error;
    return {
      positionals: [],
      flags: {
        limit: DEFAULT_LIST_LIMIT,
        semantic: false,
        scope: '',
        agent: '',
        ...EMPTY_TEMPORAL_FLAGS,
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
  .option('--as-of <iso>', 'Recall the facts that were current at this time')
  .option('--include-invalid', 'Include facts that have been superseded')
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
        asOf: parseIsoFlag(flags.asOf, '--as-of'),
        includeInvalid: flags.includeInvalid === true,
      },
    };
  } catch (e) {
    if (e instanceof Error && e.message.includes('--mode must be one of')) throw e;
    if (e?.code === 'AIOS_MEMO_USAGE') throw e;
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
        asOf: '',
        includeInvalid: false,
      },
    };
  }
}
