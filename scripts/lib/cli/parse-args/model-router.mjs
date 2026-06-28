/* 中文注释：model-router 解析独立于维护命令——基于 Commander 声明式替代手写 for 循环。 */
import { Command } from 'commander';

const MODEL_ROUTER_CLI = new Command()
  .name('model-router')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[subcommand]')
  .option('--task <text>', 'Task description (alias: --prompt)')
  .option('--prompt <text>', 'Prompt/task description')
  .option('--task-type <type>', 'Task type classification')
  .option('--format <fmt>', 'Output format')
  .option('--profile <name>', 'Model routing profile')
  .option('--explain', 'Explain routing decision')
  .option('--json', 'JSON output')
  .option('--workspace <path>', 'Workspace root');

export function parseModelRouterArgs(argv) {
  const rest = argv.slice(1);
  const help = rest.includes('-h') || rest.includes('--help');

  try {
    const parsed = MODEL_ROUTER_CLI.parse(rest, { from: 'user' });
    const flags = parsed.opts();
    const positionalArgs = parsed.args || [];
    const subcommand = positionalArgs[0] && !String(positionalArgs[0]).startsWith('-')
      ? String(positionalArgs[0]).trim().toLowerCase()
      : undefined;

    const options = {
      ...(subcommand ? { subcommand } : {}),
      ...(flags.task ? { task: flags.task } : {}),
      ...(flags.prompt ? { task: flags.prompt } : {}),
      ...(flags.taskType ? { taskType: flags.taskType } : {}),
      ...(flags.format ? { format: flags.format } : {}),
      ...(flags.profile ? { profile: flags.profile } : {}),
      ...(flags.explain ? { explain: true } : {}),
      ...(flags.json ? { json: true } : {}),
      ...(flags.workspace ? { workspaceRoot: flags.workspace } : {}),
    };

    return {
      mode: help ? 'help' : 'command',
      help,
      command: 'model-router',
      options,
    };
  } catch {
    return {
      mode: 'help',
      help: true,
      command: 'model-router',
      options: {},
    };
  }
}
