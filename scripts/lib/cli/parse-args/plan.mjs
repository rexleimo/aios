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
  .option('--status <status>', 'Plan/task status')
  .option('--note <text>', 'Optional status note')
  .option('--client <id>', 'Client id', 'all')
  .option('--session <id>', 'Client session id for continuation matching')
  .option('--policy-mode <adaptive|strict>', 'Workflow policy mode')
  .option('--dry-run', 'Evaluate without persisting a planned artifact')
  .option('--source <text>', 'Source label')
  .option('--force', 'Force (e.g. force done / replace links)')
  .option('--message <text>', 'User message for auto-gate')
  .option('--task-id <id>', 'Task id for plan task')
  .option('--acceptance <text>', 'Task acceptance criteria')
  .option('--kind <command|path|test|note>', 'Evidence kind')
  .option('--value <text>', 'Evidence value')
  .option('--activation <id>', 'Rex capability activation id')
  .option('--command-token <token>', 'Current Rex Provider Command execution token')
  .option('--evidence-kind <kind>', 'Rex capability evidence kind')
  .option('--evidence-ref <ref>', 'Rex capability evidence artifact or command ref')
  .option('--workspace <path>', 'Workspace root')
  .option('--html', 'Also write HTML plan review board')
  .option('--json', 'JSON output')
  .option('--format <text|json|html|both>', 'Output format');

export function parsePlanArgs(argv) {
  const rest = argv.slice(1);
  const help = rest.includes('-h') || rest.includes('--help');
  const subcommand = String(rest[0] || 'status').replace(/^-/, '') || 'status';
  const known = new Set([
    'start',
    'status',
    'show',
    'review',
    'set-status',
    'task',
    'add-evidence',
    'capability-evidence',
    'gate',
    'check-done',
    'inject',
    'auto-gate',
    'always-on',
    'hook-user-prompt',
    'project-skills',
    'repair-skills',
    'doctor',
    'discovery',
  ]);
  const sub = known.has(subcommand) ? subcommand : 'status';
  if (help) {
    return {
      mode: 'help',
      help: true,
      command: 'plan',
      options: { subcommand: sub },
    };
  }
  let parseArgv = known.has(subcommand) ? rest.slice(1) : rest;
  // plan task <id> --status done
  let positionalTaskId = '';
  if (sub === 'task' && parseArgv[0] && !String(parseArgv[0]).startsWith('-')) {
    positionalTaskId = String(parseArgv[0]);
    parseArgv = parseArgv.slice(1);
  }

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
        taskId: flags.taskId || positionalTaskId,
        taskTitle: flags.title,
        objective: flags.objective,
        message: flags.message || flags.task,
        status: flags.status,
        note: flags.note,
        acceptance: flags.acceptance,
        kind: flags.kind,
        value: flags.value,
        activationId: flags.activation,
        commandToken: flags.commandToken,
        evidenceKind: flags.evidenceKind,
        evidenceRef: flags.evidenceRef,
        client: flags.client,
        sessionId: flags.session,
        policyMode: flags.policyMode,
        dryRun: Boolean(flags.dryRun),
        source: flags.source,
        workspaceRoot: flags.workspace ? String(flags.workspace).trim() : '',
        force: Boolean(flags.force),
        html: Boolean(flags.html),
        json: Boolean(flags.json),
        format: flags.format || (flags.json ? 'json' : ''),
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
