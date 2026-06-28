/* 中文注释：interception 参数解析，基于 Commander 声明式 */
import { Command } from 'commander';

const INTERCEPTION_SUBCOMMANDS = new Set(['doctor', 'proof', 'tail', 'rewrite', 'mcp-migrate', 'audit']);

const program = new Command()
  .name('interception')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[args...]');

// 注册子命令——为了 Commander 能正确解析子命令级 options
for (const name of INTERCEPTION_SUBCOMMANDS) {
  const cmd = program
    .command(name)
    .description(`Interception ${name} command`)
    .helpOption(false)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument('[args...]');

  // 所有子命令共用这批 options
  const sharedOptions = [
    ['--session <id>', 'Session ID'],
    ['--json', 'Output as JSON'],
    ['--fix', 'Fix issues (doctor only)'],
    ['--dry-run', 'Dry run mode'],
    ['--enforce-turns', 'Enforce turn compression metrics (doctor only)'],
    ['--workspace <path>', 'Workspace root'],
    ['--command <text>', 'Command text (rewrite only)'],
    ['--hook <name>', 'Hook name: claude (rewrite only)'],
    ['--input <text>', 'Input text'],
    ['--latest', 'Get latest (tail only)'],
    ['--limit <n>', 'Limit count'],
    ['--timezone <tz>', 'Timezone'],
    ['--date <date>', 'Date filter'],
  ];
  for (const [flags, desc] of sharedOptions) {
    cmd.option(flags, desc);
  }
}

/* 中文注释：只解析 interception 的验证/修复入口 */
export function parseInterceptionArgs(argv) {
  const help = argv.includes('-h') || argv.includes('--help');
  const options = {
    subcommand: 'doctor', session: '', json: false, fix: false, dryRun: false,
    workspaceRoot: '', latest: false, limit: 10, enforceTurns: false,
    commandText: '', hook: '', input: '', timezone: 'UTC', date: '',
  };

  try {
    // argv = ['interception', 'proof', '--session', ...]；跳过第一个顶层命令
    const sliced = argv.slice(1);
    // 空参数：直接返回默认值
    if (sliced.length === 0) {
      options.subcommand = 'doctor';
      return { mode: 'command', help: false, command: 'interception', options };
    }
    const parsed = program.parse(sliced, { from: 'user' });
    const flags = parsed.opts();

    // 找到匹配的子命令对象来获取 opts（因为 program.opts() 可能为空）
    let matchedCmd = null;
    const firstArg = sliced[0];
    if (firstArg && !String(firstArg).startsWith('-') && INTERCEPTION_SUBCOMMANDS.has(firstArg)) {
      options.subcommand = String(firstArg).trim().toLowerCase();
      matchedCmd = parsed.commands?.find((c) => c.name() === options.subcommand);
    }
    const effectiveFlags = matchedCmd?.opts ? matchedCmd.opts() : flags;

    // 映射 Commander 的 camelCase flags 到 kebab-case options
    if (effectiveFlags.session) options.session = effectiveFlags.session;
    if (effectiveFlags.json === true) options.json = true;
    if (effectiveFlags.fix === true) options.fix = true;
    if (effectiveFlags.dryRun === true) options.dryRun = true;
    if (effectiveFlags.enforceTurns === true) options.enforceTurns = true;
    if (effectiveFlags.workspace) options.workspaceRoot = effectiveFlags.workspace;
    if (effectiveFlags.latest === true) options.latest = true;
    if (effectiveFlags.limit !== undefined) {
      const lim = Number.parseInt(effectiveFlags.limit, 10);
      if (!Number.isFinite(lim) || lim <= 0) throw new Error('--limit must be a positive integer');
      options.limit = lim;
    }
    if (effectiveFlags.command) options.commandText = effectiveFlags.command;
    if (effectiveFlags.hook) {
      const h = String(effectiveFlags.hook).trim().toLowerCase();
      if (h !== 'claude') throw new Error('--hook must be one of: claude');
      options.hook = h;
    }
    if (effectiveFlags.input) options.input = effectiveFlags.input;
    if (effectiveFlags.timezone) options.timezone = effectiveFlags.timezone;
    if (effectiveFlags.date) options.date = effectiveFlags.date;

    return { mode: help ? 'help' : 'command', help, command: 'interception', options };
  } catch (e) {
    if (e instanceof Error && (e.message.includes('positive integer') || e.message.includes('--hook'))) throw e;
    return { mode: 'help', help: true, command: 'interception', options };
  }
}
