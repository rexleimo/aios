// scripts/lib/cli/parse-args/work.mjs — aios work 参数解析
// 中文注释：work 无子命令，只有选项 + 位置任务标题；解析后直接归一化，让 CLI 与运行入口共享同一契约。

import { Command } from 'commander';
import { normalizeWorkOptions } from '../../lifecycle/work/options.mjs';
import { parsePositiveInteger } from './shared.mjs';

const WORK_CLI = new Command()
  .name('work')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[task...]', 'Task title')
  .option('--task <text>', 'Task title')
  .option('--context <text>', 'Context summary')
  .option('--client <id>', 'Subagent client id')
  .option('--concurrency <n>', 'Subagent concurrency')
  .option('--serial', 'Force serial execution (concurrency=1)')
  .option('--dry-run', 'Zero-cost preview, no client spawn')
  .option('--blueprint <name>', 'Orchestrate blueprint')
  .option('--plan <path>', 'Plan file path')
  .option('--session <id>', 'ContextDB session id')
  .option('--resume <id>', 'Resume from session id')
  .option('--retry-blocked', 'Replay blocked jobs')
  .option('--force', 'Override safety guards')
  .option('--preflight <mode>', 'Preflight mode')
  .option('--format <fmt>', 'Output format')
  .option('--json', 'Output JSON');

export function parseWorkArgs(argv) {
  const rest = argv.slice(1);
  const help = rest.includes('-h') || rest.includes('--help');
  if (help) {
    return { mode: 'help', help: true, command: 'work', options: {} };
  }

  const parsed = WORK_CLI.parse(rest, { from: 'user' });
  const flags = parsed.opts();
  const positional = (parsed.args || []).filter((arg) => !String(arg).startsWith('-'));
  const positionalTask = positional.join(' ').trim();

  const options = normalizeWorkOptions({
    taskTitle: flags.task || positionalTask,
    contextSummary: flags.context,
    clientId: flags.client,
    concurrency: flags.concurrency ? parsePositiveInteger(flags.concurrency, '--concurrency') : undefined,
    serial: flags.serial === true,
    dryRun: flags.dryRun === true,
    blueprint: flags.blueprint,
    planPath: flags.plan,
    sessionId: flags.session,
    resumeSessionId: flags.resume,
    retryBlocked: flags.retryBlocked === true,
    force: flags.force === true,
    preflight: flags.preflight,
    format: flags.format,
    json: flags.json === true,
  }, process.env);

  return { mode: 'command', help: false, command: 'work', options };
}
