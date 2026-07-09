/* 中文注释：dream 命令参数解析——基于 Commander 声明式替代手写 for 循环。 */
import { Command } from 'commander';

const DREAM_CLI = new Command()
  .name('dream')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(false)
  .allowExcessArguments(false)
  .option('--preview', 'Preview consolidation plan (default)')
  .option('--apply', 'Apply consolidation changes')
  .option('--space <name>', 'Target consolidation space')
  .option('--to <pin|agents|both>', 'Export durable notes to pin memo and/or AGENTS.md');

export function parseDreamArgs(argv) {
  const rest = argv.slice(1);
  const help = rest.includes('-h') || rest.includes('--help');

  try {
    const parsed = DREAM_CLI.parse(rest, { from: 'user' });
    const flags = parsed.opts();
    const mode = flags.apply ? 'apply' : 'preview';
    const spaces = flags.space ? [String(flags.space).trim()] : ['default'];
    const to = flags.to ? String(flags.to).trim().toLowerCase() : '';

    return {
      mode: help ? 'help' : 'command',
      help,
      command: 'dream',
      options: { mode, spaces, to },
    };
  } catch {
    return {
      mode: 'help',
      help: true,
      command: 'dream',
      options: { mode: 'preview', spaces: ['default'], to: '' },
    };
  }
}
