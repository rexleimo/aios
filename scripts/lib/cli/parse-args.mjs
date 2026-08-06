/* 中文注释：参数解析层识别 interception/refs 子命令，并把它们交给专用分发器。 */
import { Command } from 'commander';
import { parseHarnessArgs, parseHudArgs, parseTeamArgs } from './parse-args/execution.mjs';
import { parseInterceptionArgs } from './parse-args/interception.mjs';
import {
  parseCanvasArgs,
  parseDreamArgs,
  parsePlanArgs,
  parseInitArgs,
  parseInternalArgs,
  parseMemoArgs,
  parseModelRouterArgs,
  parsePerceptionArgs,
  parseRefsArgs,
  parseSearchArgs,
  parseSessionArgs,
  parseSkillArgs,
} from './parse-args/maintenance.mjs';
import { expandEqualsOptions } from './parse-args/shared.mjs';
import { parseTopLevelArgs } from './parse-args/top-level.mjs';

// 中文注释：通用简单命令解析器——消除 parseStatusArgs/parseClientsArgs/parseAgentsArgs/parseWorkflowArgs 里的手写 for 循环
function createSimpleCommandParser(name, subcommands, options = []) {
  const program = new Command()
    .name(name)
    .helpOption(false)
    .exitOverride();

  for (const [flags, desc] of options) {
    program.option(flags, desc);
  }

  if (subcommands && subcommands.length > 0) {
    for (const sub of subcommands) {
      const cmd = program
        .command(sub.name)
        .description(sub.description || '')
        .helpOption(false)
        .allowUnknownOption(true)
        .allowExcessArguments(true)
        .argument('[args...]');

      for (const [f, d] of sub.options || []) {
        cmd.option(f, d);
      }
    }
  } else {
    program.allowUnknownOption(true).allowExcessArguments(true).argument('[args...]');
  }

  return program;
}

const STATUS_CLI = createSimpleCommandParser('status', null, [
  ['--json', 'Output as JSON'],
  ['--format <text|json>', 'Output format'],
]);

const CLIENTS_CLI = createSimpleCommandParser('clients', [
  { name: 'doctor', description: 'Run client doctor checks', options: [['--json', 'JSON output'], ['--format <text|json>', 'Output format'], ['--native-strict', 'Strict native check'], ['--client <name>', 'Target client']] },
  { name: 'smoke', description: 'Run client smoke test', options: [['--json', 'JSON output'], ['--format <text|json>', 'Output format'], ['--native-strict', 'Strict native check'], ['--client <name>', 'Target client']] },
  { name: 'trigger-smoke', description: 'Trigger client smoke test', options: [['--json', 'JSON output'], ['--format <text|json>', 'Output format'], ['--native-strict', 'Strict native check'], ['--client <name>', 'Target client']] },
], [
  ['--json', 'Output as JSON'],
  ['--format <text|json>', 'Output format'],
  ['--native-strict', 'Strict native check'],
  ['--client <name>', 'Target client'],
]);

const AGENTS_CLI = createSimpleCommandParser('agents', [
  { name: 'doctor', description: 'Run agents doctor checks', options: [['--json', 'JSON output'], ['--format <text|json>', 'Format'], ['--strict', 'Strict check'], ['--dry-run', 'Dry run']] },
  { name: 'list', description: 'List agents', options: [['--json', 'JSON output'], ['--format <text|json>', 'Format']] },
  { name: 'smoke', description: 'Run agents smoke test', options: [['--json', 'JSON output'], ['--format <text|json>', 'Format'], ['--strict', 'Strict check'], ['--dry-run', 'Dry run'], ['--live', 'Run managed live client probes'], ['--client <name>', 'Client used for live probes'], ['--timeout-ms <ms>', 'Per-agent live probe timeout (default 30000, or AIOS_AGENT_SMOKE_TIMEOUT_MS)']] },
], [
  ['--json', 'Output as JSON'],
  ['--format <text|json>', 'Output format'],
  ['--strict', 'Strict check'],
  ['--dry-run', 'Dry run'],
  ['--live', 'Run managed live client probes'],
  ['--client <name>', 'Client used for live probes'],
  ['--timeout-ms <ms>', 'Per-agent live probe timeout (default 30000, or AIOS_AGENT_SMOKE_TIMEOUT_MS)'],
]);

const WORKFLOW_CLI = createSimpleCommandParser('workflow', [
  { name: 'list', description: 'List workflows', options: [['--json', 'JSON output'], ['--format <text|json>', 'Format']] },
  { name: 'run', description: 'Run a workflow', options: [['--json', 'JSON output'], ['--format <text|json>', 'Format'], ['--dry-run', 'Dry run'], ['--task <text>', 'Task description']] },
], [
  ['--json', 'Output as JSON'],
  ['--format <text|json>', 'Output format'],
  ['--dry-run', 'Dry run'],
  ['--task <text>', 'Task description'],
]);

const TOP_LEVEL_COMMANDS = new Set([
  'dream',
  'plan',
  'setup',
  'update',
  'uninstall',
  'doctor',
  'status',
  'agents',
  'clients',
  'quality-gate',
  'orchestrate',
  'workflow',
  'team',
  'hud',
  'harness',
  'interception',
  'learn-eval',
  'entropy-gc',
  'snapshot-rollback',
  'release-status',
  'refs',
  'canvas',
  'search',
  'skill',
  'session',
]);

/* 中文注释：兼容别名在解析层归一化，分发层只处理标准命令名。 */
function normalizeTopLevelCommand(first) {
  if (first === 'verify') return 'doctor';
  if (first === 'quality' || first === 'quality-gate') return 'quality-gate';
  if (first === 'entropy') return 'entropy-gc';
  if (first === 'rollback-snapshot') return 'snapshot-rollback';
  if (first === 'consolidate') return 'dream';
  return first;
}

function parseClientsArgs(argv) {
  try {
    // 中文注释：argv = ['clients','doctor','--json']；Commander 会把 'clients' 当命令名，
    // 用 slice(1) 跳过顶层命令，让子命令解析正常工作
    const parsed = CLIENTS_CLI.parse(argv.slice(1), { from: 'user' });
    const flags = parsed.opts();
    const help = argv.includes('-h') || argv.includes('--help');
    const subcommand = parsed.args?.[0] || 'doctor';
    let format = flags.format || 'text';
    let json = flags.json === true || format === 'json';
    if (json) format = 'json';
    if (!['doctor', 'smoke', 'trigger-smoke'].includes(subcommand)) {
      throw new Error('clients requires subcommand: doctor, smoke, or trigger-smoke');
    }
    if (!['text', 'json'].includes(format)) {
      throw new Error('--format must be one of: text, json');
    }
    const options = { subcommand, json, format };
    if (flags.nativeStrict) options.nativeStrict = true;
    if (flags.client) options.client = flags.client;
    return { mode: help ? 'help' : 'command', help, command: 'clients', options };
  } catch (e) {
    if (e instanceof Error && (e.message.includes('requires subcommand') || e.message.includes('--format'))) throw e;
    return { mode: 'help', help: true, command: 'clients', options: { subcommand: 'doctor', json: false, format: 'text' } };
  }
}

function parseAgentsArgs(argv) {
  try {
    const parsed = AGENTS_CLI.parse(argv.slice(1), { from: 'user' });
    const flags = parsed.opts();
    const help = argv.includes('-h') || argv.includes('--help');
    const subcommand = parsed.args?.[0] || 'doctor';
    let format = flags.format || 'text';
    let json = flags.json === true || format === 'json';
    if (json) format = 'json';
    if (!['doctor', 'list', 'smoke'].includes(subcommand)) {
      throw new Error('agents requires subcommand: doctor, list, or smoke');
    }
    if (!['text', 'json'].includes(format)) {
      throw new Error('--format must be one of: text, json');
    }
    return {
      mode: help ? 'help' : 'command',
      help,
      command: 'agents',
      options: {
        subcommand,
        json,
        format,
        strict: flags.strict === true,
        dryRun: flags.dryRun === true,
        live: flags.live === true,
        clientId: flags.client || '',
        timeoutMs: flags.timeoutMs ? Number.parseInt(String(flags.timeoutMs), 10) : undefined,
      },
    };
  } catch (e) {
    if (e instanceof Error && (e.message.includes('requires subcommand') || e.message.includes('--format'))) throw e;
    return { mode: 'help', help: true, command: 'agents', options: { subcommand: 'doctor', json: false, format: 'text', strict: false, dryRun: false } };
  }
}

function parseWorkflowArgs(argv) {
  try {
    const parsed = WORKFLOW_CLI.parse(argv.slice(1), { from: 'user' });
    const flags = parsed.opts();
    const help = argv.includes('-h') || argv.includes('--help');
    const args = parsed.args || [];
    const subcommand = args[0] && !String(args[0]).startsWith('-') ? String(args[0]).trim().toLowerCase() : 'list';
    let format = flags.format || 'text';
    let json = flags.json === true || format === 'json';
    if (json) format = 'json';
    if (!['list', 'run'].includes(subcommand)) {
      throw new Error('workflow requires subcommand: list or run');
    }
    const options = { subcommand, workflowId: '', task: flags.task || '', dryRun: flags.dryRun === true, executionMode: flags.dryRun ? 'dry-run' : 'live', json, format };
    if (subcommand === 'run') {
      const posId = args.slice(1).find(a => !String(a).startsWith('-'));
      if (posId) options.workflowId = String(posId);
    }
    if (subcommand === 'run' && !options.workflowId) {
      throw new Error('workflow run requires workflow id');
    }
    if (!['text', 'json'].includes(format)) {
      throw new Error('--format must be one of: text, json');
    }
    return { mode: help ? 'help' : 'command', help, command: 'workflow', options };
  } catch (e) {
    if (e instanceof Error && (e.message.includes('requires workflow id') || e.message.includes('--format') || e.message.includes('requires subcommand'))) throw e;
    return { mode: 'help', help: true, command: 'workflow', options: { subcommand: 'list', workflowId: '', task: '', dryRun: false, executionMode: 'dry-run', json: false, format: 'text' } };
  }
}

function parseStatusArgs(argv) {
  try {
    const parsed = STATUS_CLI.parse(argv, { from: 'user' });
    const flags = parsed.opts();
    const help = argv.includes('-h') || argv.includes('--help');
    let format = flags.format || 'text';
    let json = flags.json === true || format === 'json';
    if (!['text', 'json'].includes(format)) {
      throw new Error('--format must be one of: text, json');
    }
    if (json) format = 'json';
    return {
      mode: help ? 'help' : 'command',
      help,
      command: 'status',
      options: { json, format },
    };
  } catch {
    return {
      mode: 'help',
      help: true,
      command: 'status',
      options: { json: false, format: 'text' },
    };
  }
}

/* 中文注释：parseArgs 只做语法解析和轻校验，不做 IO；这样测试可以快速覆盖所有 CLI 入口。 */
export function parseArgs(argv = []) {
  argv = expandEqualsOptions(argv);
  if (argv.length === 0) {
    return {
      mode: 'interactive',
      help: false,
      command: 'tui',
      options: {},
    };
  }

  const first = String(argv[0] || '').trim().toLowerCase();
  if (first === '-v' || first === '--version' || first === 'version') {
    return {
      mode: 'command',
      help: false,
      command: 'version',
      options: {},
    };
  }

  if (first === '-h' || first === '--help' || first === 'help') {
    return {
      mode: 'help',
      help: true,
      command: 'root',
      options: {},
    };
  }

  if (first === 'memo') return parseMemoArgs(argv);
  if (first === 'plan') return parsePlanArgs(argv);
  if (first === 'dream' || normalizeTopLevelCommand(first) === 'dream') return parseDreamArgs(argv);
  if (first === 'perception') return parsePerceptionArgs(argv);
  if (first === 'model-router') return parseModelRouterArgs(argv);
  if (first === 'refs') return parseRefsArgs(argv);
  if (first === 'search') return parseSearchArgs(argv);
  if (first === 'skill') return parseSkillArgs(argv);
  if (first === 'session') return parseSessionArgs(argv);
  if (first === 'canvas') return parseCanvasArgs(argv);
  if (first === 'internal') return parseInternalArgs(argv.slice(1));
  if (first === 'team') return parseTeamArgs(argv);
  if (first === 'hud') return parseHudArgs(argv);
  if (first === 'harness') return parseHarnessArgs(argv);
  if (first === 'interception') return parseInterceptionArgs(argv);
  if (first === 'init') return parseInitArgs(argv);
  if (first === 'status') return parseStatusArgs(argv);
  if (first === 'agents') return parseAgentsArgs(argv);
  if (first === 'clients') return parseClientsArgs(argv);
  if (first === 'workflow') return parseWorkflowArgs(argv);

  const command = normalizeTopLevelCommand(first);
  if (!TOP_LEVEL_COMMANDS.has(command)) {
    throw new Error(`Unknown command: ${argv[0]}`);
  }

  return parseTopLevelArgs(command, argv);
}
