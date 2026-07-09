/* 中文注释：plan 命令参数解析 */
import { Command } from 'commander';

const PLAN_CLI = new Command()
  .name('plan')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(false)
  .allowExcessArguments(true)
  .option('--title <text>', 'Plan title')
  .option('--task <text>', 'Task / objective text')
  .option('--objective <text>', 'Objective text')
  .option('--status <status>', 'Plan status for set-status')
  .option('--note <text>', 'Optional status note')
  .option('--client <id>', 'Client id', 'all')
  .option('--source <text>', 'Source label')
  .option('--force', 'Force replace unmanaged skill links')
  .option('--message <text>', 'User message for auto-gate')
  .option('--json', 'JSON output')
  .option('--format <text|json>', 'Output format');

export function parsePlanArgs(argv) {
  const rest = argv.slice(1);
  const help = rest.includes('-h') || rest.includes('--help');
  const subcommand = String(rest[0] || 'status').replace(/^-/, '') || 'status';
  const known = new Set([
    'start',
    'status',
    'set-status',
    'inject',
    'auto-gate',
    'always-on',
    'hook-user-prompt',
    'project-skills',
    'doctor',
    'discovery',
  ]);
  const sub = known.has(subcommand) ? subcommand : 'status';
  const parseArgv = known.has(subcommand) ? rest.slice(1) : rest;

  try {
    const parsed = PLAN_CLI.parse(parseArgv, { from: 'user' });
    const flags = parsed.opts();
    return {
      mode: help ? 'help' : 'command',
      help,
      command: 'plan',
      options: {
        subcommand: sub,
        title: flags.title,
        task: flags.task || flags.message,
        objective: flags.objective,
        message: flags.message || flags.task,
        status: flags.status,
        note: flags.note,
        client: flags.client,
        source: flags.source,
        force: Boolean(flags.force),
        json: Boolean(flags.json),
        format: flags.format,
      },
    };
  } catch {
    return {
      mode: 'help',
      help: true,
      command: 'plan',
      options: { subcommand: 'status' },
    };
  }
}
