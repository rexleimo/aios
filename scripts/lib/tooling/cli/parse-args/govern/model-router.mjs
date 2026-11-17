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
  .option('--client <id>', 'Client id (matrix resolution)')
  .option('--role <name>', 'Role name (matrix resolution)')
  .option('--port <number>', 'Gateway listen port')
  .option('--passthrough', 'Gateway passthrough mode (no routing)')
  .option('--gateway-url <url>', 'Connect: gateway base URL (default http://127.0.0.1:<port>)')
  .option('--state-dir <path>', 'Connect: artifact state dir (default ~/.aios/gateway)')
  .option('--target <reference>', 'Connect: fixed model:<encoded-id>, group:<encoded-id>, or auto target')
  .option('--expected-revision <hash>', 'Connect: reject a changed registry snapshot before writing')
  .option('--codex-model <id>', 'Connect: explicit codex openai-response model (otherwise use configured route)')
  .option('--pi-model <id>', 'Connect: pi gateway model id (default gateway-default)')
  .option('--dry-run', 'Connect: validate readiness without changing clients, registry or state')
  .option('--isolated', 'Connect: use isolated artifacts + launch aliases instead of in-place real-config editing')
  .option('--home <path>', 'Connect: home dir whose client configs to edit in place (default real home)')
  .option('--id <id>', 'Group id')
  .option('--group-id <id>', 'Group id (alias)')
  .option('--models <list>', 'Comma-separated model ids')
  .option('--routing <mode>', 'Group routing mode (ordered; legacy smart is ordered)')
  .option('--refresh', 'Models: discover provider model lists and merge them into the registry')
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
      ...(flags.client ? { client: flags.client } : {}),
      ...(flags.role ? { role: flags.role } : {}),
      ...(flags.port ? { port: flags.port } : {}),
      ...(flags.passthrough ? { passthrough: true } : {}),
      ...(flags.gatewayUrl ? { gatewayUrl: flags.gatewayUrl } : {}),
      ...(flags.stateDir ? { stateDir: flags.stateDir } : {}),
      ...(flags.target !== undefined ? { target: flags.target } : {}),
      ...(flags.expectedRevision !== undefined ? { expectedRevision: flags.expectedRevision } : {}),
      ...(flags.codexModel ? { codexModel: flags.codexModel } : {}),
      ...(flags.piModel ? { piModel: flags.piModel } : {}),
      ...(flags.dryRun ? { dryRun: true } : {}),
      ...(flags.isolated ? { isolated: true } : {}),
      ...(flags.home ? { home: flags.home } : {}),
      ...(flags.id ? { id: flags.id } : {}),
      ...(flags.groupId ? { groupId: flags.groupId } : {}),
      ...(flags.models ? { models: flags.models } : {}),
      ...(flags.routing ? { routing: flags.routing } : {}),
      ...(flags.refresh ? { refresh: true } : {}),
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
