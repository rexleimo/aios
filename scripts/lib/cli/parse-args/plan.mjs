/* 中文注释：plan 命令参数解析 */
import { Command } from 'commander';

function collectOptionValue(value, previous = []) {
  return [...(Array.isArray(previous) ? previous : []), String(value || '')];
}

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
  .option('--context <ref[:reason]>', 'Required context declaration; repeat to add more', collectOptionValue, [])
  .option('--target <path>', 'Declared task target; repeat to add more', collectOptionValue, [])
  .option('--allow-write <glob>', 'Allowed write glob; repeat to add more', collectOptionValue, [])
  .option('--propose-context', 'Derive context candidates from task targets and codemap')
  .option('--confirm-context-candidates', 'Human-confirm the current context candidate proposal')
  .option('--candidate-ref <ref>', 'Candidate ref to confirm; repeat to select a subset', collectOptionValue, [])
  .option('--confirmed-by <text>', 'Human confirmation label')
  .option('--kind <command|path|test|note>', 'Evidence kind')
  .option('--value <text>', 'Evidence value')
  .option('--activation <id>', 'Rex capability activation id')
  .option('--command-token <token>', 'Current Rex Provider Command execution token')
  .option('--evidence-kind <kind>', 'Rex capability evidence kind')
  .option('--evidence-ref <ref>', 'Rex capability evidence artifact or command ref')
  .option('--testability-file <path>', 'Typed Rex testability decision JSON file')
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
        contextRequirements: Array.isArray(flags.context) ? flags.context : [],
        targets: Array.isArray(flags.target) ? flags.target : [],
        allowedWrites: Array.isArray(flags.allowWrite) ? flags.allowWrite : [],
        proposeContext: Boolean(flags.proposeContext),
        confirmContextCandidates: Boolean(flags.confirmContextCandidates),
        candidateRefs: Array.isArray(flags.candidateRef) ? flags.candidateRef : [],
        confirmedBy: flags.confirmedBy ? String(flags.confirmedBy).trim() : '',
        kind: flags.kind,
        value: flags.value,
        activationId: flags.activation,
        commandToken: flags.commandToken,
        evidenceKind: flags.evidenceKind,
        evidenceRef: flags.evidenceRef,
        testabilityFile: flags.testabilityFile ? String(flags.testabilityFile).trim() : '',
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
