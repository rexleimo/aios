/* 中文注释：perception 解析只负责内容反馈入口——基于 Commander 声明式替代手写 for 循环。 */
import { Command } from 'commander';

const PERCEPTION_CLI = new Command()
  .name('perception')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[subcommand]')
  .option('--space <name>', 'Content space')
  .option('--format <fmt>', 'Output format')
  .option('--json', 'JSON output')
  .option('--dry-run', 'Preview without writing')
  .option('--content-id <id>', 'Content identifier')
  .option('--platform <name>', 'Platform name')
  .option('--content-type <type>', 'Content type')
  .option('--title <text>', 'Content title')
  .option('--publish-time <iso>', 'Publish timestamp')
  .option('--snapshot-window <n>', 'Snapshot window')
  .option('--metrics <json>', 'Metrics JSON string')
  .option('--context <text>', 'Context description')
  .option('--max-chars <n>', 'Max characters')
  .option('--min-sample <n>', 'Minimum sample count')
  .option('--workspace <path>', 'Workspace root');

export function parsePerceptionArgs(argv) {
  const rest = argv.slice(1);
  const help = rest.includes('-h') || rest.includes('--help');

  try {
    const parsed = PERCEPTION_CLI.parse(rest, { from: 'user' });
    const flags = parsed.opts();
    const positionalArgs = parsed.args || [];
    const subcommand = positionalArgs[0] && !String(positionalArgs[0]).startsWith('-')
      ? String(positionalArgs[0]).trim().toLowerCase()
      : undefined;

    const options = {
      ...(subcommand ? { subcommand } : {}),
      ...(flags.space ? { space: flags.space } : {}),
      ...(flags.format ? { format: flags.format } : {}),
      ...(flags.json ? { json: true } : {}),
      ...(flags.dryRun ? { dryRun: true } : {}),
      ...(flags.contentId ? { contentId: flags.contentId } : {}),
      ...(flags.platform ? { platform: flags.platform } : {}),
      ...(flags.contentType ? { contentType: flags.contentType } : {}),
      ...(flags.title ? { title: flags.title } : {}),
      ...(flags.publishTime ? { publishTime: flags.publishTime } : {}),
      ...(flags.snapshotWindow ? { snapshotWindow: flags.snapshotWindow } : {}),
      ...(flags.metrics ? { metrics: flags.metrics } : {}),
      ...(flags.context ? { context: flags.context } : {}),
      ...(flags.maxChars ? { maxChars: flags.maxChars } : {}),
      ...(flags.minSample ? { minSample: flags.minSample } : {}),
      ...(flags.workspace ? { workspaceRoot: flags.workspace } : {}),
    };

    return {
      mode: help ? 'help' : 'command',
      help,
      command: 'perception',
      options,
    };
  } catch {
    return {
      mode: 'help',
      help: true,
      command: 'perception',
      options: {},
    };
  }
}
