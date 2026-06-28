/* 中文注释：session 参数解析，基于 Commander 声明式 */
import { Command } from 'commander';

const SESSION_SUBCOMMANDS = ['changed-files', 'close', 'start'];

const program = new Command()
  .name('session')
  .helpOption(false)
  .exitOverride();

for (const name of SESSION_SUBCOMMANDS) {
  const cmd = program
    .command(name)
    .description(`Session ${name} command`)
    .helpOption(false)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument('[args...]');
  cmd.option('--json', 'Output as JSON');
  cmd.option('--format <text|json>', 'Output format');
  cmd.option('--session <id>', 'Session ID (default: default)');
}

program.allowUnknownOption(true).allowExcessArguments(true).argument('[args...]');

export function parseSessionArgs(argv = []) {
  const help = argv.includes('-h') || argv.includes('--help');
  const rest = argv.slice(1);
  const rawSubcommand = String(rest[0] || '').trim().toLowerCase();
  const hasSub = !help && SESSION_SUBCOMMANDS.includes(rawSubcommand);
  const subcommand = hasSub ? rawSubcommand : '';

  const options = { subcommand, session: 'default', json: false, format: 'text' };

  try {
    if (rest.length === 0 || help) {
      return { mode: 'help', help: true, command: 'session', options };
    }

    // 无子命令或未知子命令
    if (!SESSION_SUBCOMMANDS.includes(rawSubcommand)) {
      if (rawSubcommand && !rawSubcommand.startsWith('-')) {
        throw new Error('session requires subcommand: changed-files, close, start');
      }
      throw new Error('session requires subcommand: changed-files, close, start');
    }

    const parsed = program.parse(rest, { from: 'user' });
    const flags = parsed.opts();

    // 如果子命令被 Commander 解析为子命令，从子命令对象获取 opts
    let effectiveFlags = flags;
    if (hasSub) {
      const matchedCmd = parsed.commands?.find((c) => c.name() === subcommand);
      if (matchedCmd?.opts) effectiveFlags = matchedCmd.opts();
    }

    if (effectiveFlags.json === true) { options.json = true; options.format = 'json'; }
    if (effectiveFlags.format) options.format = String(effectiveFlags.format);
    if (effectiveFlags.session) options.session = String(effectiveFlags.session);

    if (!subcommand) throw new Error('session requires subcommand: changed-files, close, start');

    return { mode: 'command', help: false, command: 'session', options };
  } catch (e) {
    if (e instanceof Error && (e.message.includes('requires subcommand') || e.message.includes('--format'))) throw e;
    return { mode: 'help', help: true, command: 'session', options };
  }
}
