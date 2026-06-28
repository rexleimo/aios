/* 中文注释：refs/canvas 同属离线输出召回入口——基于 Commander 声明式替代手写 for 循环。 */
import { Command } from 'commander';

/* --- refs --- */
const REFS_CLI = new Command()
  .name('refs')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[pattern]', 'Search pattern (grep subcommand)')
  .argument('[nodeId]', 'Node ID (read subcommand)')
  .option('--session <id>', 'Session ID')
  .option('--limit <n>', 'Max results')
  .option('--keep-days <n>', 'Retention days')
  .option('--storage <path>', 'Storage path')
  .option('--workspace <path>', 'Workspace root');

export function parseRefsArgs(argv) {
  const rest = argv.slice(1);
  const help = rest.includes('-h') || rest.includes('--help');

  try {
    // 提取子命令（第一个非 - 参数）
    let subcommand = 'list';
    let subIndex = -1;
    if (rest[0] && !String(rest[0]).startsWith('-') && ['grep', 'read', 'list', 'prune'].includes(String(rest[0]).toLowerCase())) {
      subcommand = String(rest[0]).trim().toLowerCase();
      subIndex = 0;
    }

    // 跳过子命令 token 再让 Commander 解析
    const parseArgs = subIndex === 0 ? rest.slice(1) : rest;
    const parsed = REFS_CLI.parse(parseArgs, { from: 'user' });
    const flags = parsed.opts();
    const positionalArgs = parsed.args || [];

    const options = {
      subcommand,
      session: flags.session || '',
      limit: flags.limit || '20',
      keepDays: flags.keepDays || '30',
      pattern: '',
      nodeId: '',
      storage: flags.storage || '',
      workspaceRoot: flags.workspace || '',
    };

    if (subcommand === 'grep') {
      options.pattern = positionalArgs.find(a => !a.startsWith('-')) || '';
    }
    if (subcommand === 'read') {
      options.nodeId = positionalArgs.find(a => !a.startsWith('-')) || '';
    }

    return { mode: help ? 'help' : 'command', help, command: 'refs', options };
  } catch {
    return { mode: 'help', help: true, command: 'refs', options: { subcommand: 'list', session: '', limit: '20', keepDays: '30', pattern: '', nodeId: '', storage: '', workspaceRoot: '' } };
  }
}

/* --- canvas --- */
const CANVAS_CLI = new Command()
  .name('canvas')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .option('--session <id>', 'Session ID')
  .option('--format <fmt>', 'Output format')
  .option('--storage <path>', 'Storage path')
  .option('--client <name>', 'Client name')
  .option('-i, --input <path>', 'Input path')
  .option('--input-path <path>', 'Input path')
  .option('--workspace <path>', 'Workspace root');

export function parseCanvasArgs(argv) {
  const rest = argv.slice(1);
  const help = rest.includes('-h') || rest.includes('--help');

  try {
    // 提取子命令
    let subcommand = 'show';
    let subIndex = -1;
    if (rest[0] && !String(rest[0]).startsWith('-') && ['show', 'path', 'backfill'].includes(String(rest[0]).toLowerCase())) {
      subcommand = String(rest[0]).trim().toLowerCase();
      subIndex = 0;
    }

    const parseArgs = subIndex === 0 ? rest.slice(1) : rest;
    const parsed = CANVAS_CLI.parse(parseArgs, { from: 'user' });
    const flags = parsed.opts();

    const options = {
      subcommand,
      session: flags.session || 'default',
      format: flags.format || 'mmd',
      storage: flags.storage || '',
      client: flags.client || '',
      inputPath: flags.input || flags.inputPath || '',
      workspaceRoot: flags.workspace || '',
    };

    return { mode: help ? 'help' : 'command', help, command: 'canvas', options };
  } catch {
    return { mode: 'help', help: true, command: 'canvas', options: { subcommand: 'show', session: 'default', format: 'mmd', storage: '', client: '', inputPath: '', workspaceRoot: '' } };
  }
}
