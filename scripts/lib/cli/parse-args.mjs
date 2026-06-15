/* 中文注释：参数解析层识别 interception/refs 子命令，并把它们交给专用分发器。 */
import { parseHarnessArgs, parseHudArgs, parseTeamArgs } from './parse-args/execution.mjs';
import { parseInterceptionArgs } from './parse-args/interception.mjs';
import {
  parseCanvasArgs,
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

const TOP_LEVEL_COMMANDS = new Set([
  'setup',
  'update',
  'uninstall',
  'doctor',
  'clients',
  'quality-gate',
  'orchestrate',
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
  return first;
}

function parseClientsArgs(argv) {
  const rest = argv.slice(1);
  const options = {
    subcommand: 'doctor',
    json: false,
    format: 'text',
  };
  let help = false;
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      options.format = 'json';
      continue;
    }
    if (arg === '--native-strict') {
      options.nativeStrict = true;
      continue;
    }
    if (arg === '--format') {
      const value = rest[index + 1];
      if (!value || value.startsWith('-')) throw new Error('Missing value for --format');
      options.format = String(value).trim().toLowerCase();
      options.json = options.format === 'json';
      index += 1;
      continue;
    }
    if (arg === '--client') {
      const value = rest[index + 1];
      if (!value || value.startsWith('-')) throw new Error('Missing value for --client');
      options.client = String(value).trim();
      index += 1;
      continue;
    }
    if (!String(arg || '').startsWith('-') && index === 0) {
      options.subcommand = String(arg || '').trim().toLowerCase();
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (!['doctor', 'smoke', 'trigger-smoke'].includes(options.subcommand)) {
    throw new Error('clients requires subcommand: doctor, smoke, or trigger-smoke');
  }
  if (!['text', 'json'].includes(options.format)) {
    throw new Error('--format must be one of: text, json');
  }
  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'clients',
    options,
  };
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
  if (first === 'clients') return parseClientsArgs(argv);

  const command = normalizeTopLevelCommand(first);
  if (!TOP_LEVEL_COMMANDS.has(command)) {
    throw new Error(`Unknown command: ${argv[0]}`);
  }

  return parseTopLevelArgs(command, argv);
}
