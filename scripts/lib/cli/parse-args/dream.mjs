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
  .option('--workspace <path>', 'Workspace root')
  .option('--json', 'Output as JSON')
  .option('--format <text|json>', 'Output format')
  .option('--to <pin|agents|both>', 'Export durable notes to pin memo and/or AGENTS.md')
  .option('--governance <action>', 'list|inspect|approve|reject|archive|restore|gc')
  .option('--proposal <id>', 'Dream proposal id')
  .option('--reason <text>', 'Governance decision reason')
  .option('--retention-days <n>', 'Retention days before GC');

export function parseDreamArgs(argv) {
  const rest = argv.slice(1);
  const help = rest.includes('-h') || rest.includes('--help');
  if (help) {
    return {
      mode: 'help',
      help: true,
      command: 'dream',
      options: { mode: 'preview', spaces: ['default'], to: '', governanceAction: '', proposalId: '', reason: '', retentionDays: 30, workspaceRoot: '', json: false, format: 'text' },
    };
  }

  try {
    const parsed = DREAM_CLI.parse(rest, { from: 'user' });
    const flags = parsed.opts();
    const mode = flags.apply ? 'apply' : 'preview';
    const spaces = flags.space ? [String(flags.space).trim()] : ['default'];
    const to = flags.to ? String(flags.to).trim().toLowerCase() : '';
    const governanceAction = flags.governance ? String(flags.governance).trim().toLowerCase() : '';
    if (governanceAction && !['list', 'inspect', 'approve', 'reject', 'archive', 'restore', 'gc'].includes(governanceAction)) {
      throw new Error('invalid Dream governance action');
    }
    let format = flags.format ? String(flags.format).trim().toLowerCase() : 'text';
    const json = Boolean(flags.json || format === 'json');
    if (json) format = 'json';

    return {
      mode: 'command',
      help: false,
      command: 'dream',
      options: {
        mode,
        spaces,
        to,
        governanceAction,
        proposalId: flags.proposal ? String(flags.proposal).trim() : '',
        reason: flags.reason ? String(flags.reason).trim() : '',
        retentionDays: flags.retentionDays ? Number.parseInt(flags.retentionDays, 10) : 30,
        workspaceRoot: flags.workspace ? String(flags.workspace).trim() : '',
        json,
        format,
      },
    };
  } catch {
    return {
      mode: 'help',
      help: true,
      command: 'dream',
      options: { mode: 'preview', spaces: ['default'], to: '', governanceAction: '', proposalId: '', reason: '', retentionDays: 30, workspaceRoot: '', json: false, format: 'text' },
    };
  }
}
