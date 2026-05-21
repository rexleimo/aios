import { parseHarnessArgs, parseHudArgs, parseTeamArgs } from './parse-args/execution.mjs';
import {
  parseCanvasArgs,
  parseInitArgs,
  parseInternalArgs,
  parseMemoArgs,
  parseModelRouterArgs,
  parsePerceptionArgs,
  parseRefsArgs,
} from './parse-args/maintenance.mjs';
import { expandEqualsOptions } from './parse-args/shared.mjs';
import { parseTopLevelArgs } from './parse-args/top-level.mjs';

const TOP_LEVEL_COMMANDS = new Set([
  'setup',
  'update',
  'uninstall',
  'doctor',
  'quality-gate',
  'orchestrate',
  'team',
  'hud',
  'harness',
  'learn-eval',
  'entropy-gc',
  'snapshot-rollback',
  'release-status',
  'refs',
  'canvas',
]);

function normalizeTopLevelCommand(first) {
  if (first === 'verify') return 'doctor';
  if (first === 'quality' || first === 'quality-gate') return 'quality-gate';
  if (first === 'entropy') return 'entropy-gc';
  if (first === 'rollback-snapshot') return 'snapshot-rollback';
  return first;
}

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
  if (first === 'canvas') return parseCanvasArgs(argv);
  if (first === 'internal') return parseInternalArgs(argv.slice(1));
  if (first === 'team') return parseTeamArgs(argv);
  if (first === 'hud') return parseHudArgs(argv);
  if (first === 'harness') return parseHarnessArgs(argv);
  if (first === 'init') return parseInitArgs(argv);

  const command = normalizeTopLevelCommand(first);
  if (!TOP_LEVEL_COMMANDS.has(command)) {
    throw new Error(`Unknown command: ${argv[0]}`);
  }

  return parseTopLevelArgs(command, argv);
}
