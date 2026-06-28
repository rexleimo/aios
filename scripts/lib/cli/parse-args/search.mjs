/* 中文注释：search 参数解析，基于 Commander 声明式 */
import { Command } from 'commander';

const program = new Command()
  .name('search')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[query...]')
  .option('--json', 'Output as JSON')
  .option('--format <text|json>', 'Output format')
  .option('--limit <n>', 'Result limit')
  .option('--source <list>', 'Source filter (alias: --sources)')
  .option('--scope <scope>', 'Search scope')
  .option('--agent <name>', 'Agent name')
  .option('--space <name>', 'Memory space (default: default)')
  .option('--workspace <path>', 'Workspace root')
  .option('--mode <mode>', 'Search mode: fts-only, hybrid')
  .option('--max-chars-per-memory <n>', 'Max chars per memory')
  .option('--max-total-chars <n>', 'Max total chars');

export function parseSearchArgs(argv = []) {
  const help = argv.includes('-h') || argv.includes('--help');
  const options = {
    query: '', limit: '20', sources: '', scope: '', agent: '', space: 'default',
    workspaceRoot: '', format: 'text', json: false, mode: 'hybrid',
    maxCharsPerMemory: '', maxTotalChars: '',
  };

  try {
    // argv = ['search', 'keyword1', 'keyword2', '--json']；跳过顶层命令
    const sliced = argv.slice(1);
    const parsed = program.parse(sliced, { from: 'user' });
    const flags = parsed.opts();

    // 收集查询词（剩余位置参数）
    const queryParts = (parsed.args || []).filter(a => !String(a).startsWith('-'));
    options.query = queryParts.join(' ').trim();

    if (flags.format) options.format = String(flags.format).trim().toLowerCase();
    if (flags.json === true) { options.json = true; options.format = 'json'; }
    if (flags.limit) options.limit = String(flags.limit);
    if (flags.source) options.sources = String(flags.source);
    if (flags.scope) options.scope = String(flags.scope);
    if (flags.agent) options.agent = String(flags.agent);
    if (flags.space) options.space = String(flags.space);
    if (flags.workspace) options.workspaceRoot = String(flags.workspace);
    if (flags.mode) {
      const mode = String(flags.mode).trim().toLowerCase();
      if (!['fts-only', 'hybrid'].includes(mode)) throw new Error('--mode must be one of: fts-only, hybrid');
      options.mode = mode;
    }
    if (flags.maxCharsPerMemory) options.maxCharsPerMemory = String(flags.maxCharsPerMemory);
    if (flags.maxTotalChars) options.maxTotalChars = String(flags.maxTotalChars);

    if (!['text', 'json'].includes(options.format)) throw new Error('--format must be one of: text, json');
    if (!help && !options.query) throw new Error('search requires query text');

    return { mode: help ? 'help' : 'command', help, command: 'search', options };
  } catch (e) {
    if (e instanceof Error && (e.message.includes('search requires query') || e.message.includes('--format'))) throw e;
    return { mode: 'help', help: true, command: 'search', options };
  }
}
