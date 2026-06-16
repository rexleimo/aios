import { takeValue } from './shared.mjs';

function isHelpArg(arg) {
  return arg === '-h' || arg === '--help' || arg === 'help';
}

export function parseSkillArgs(argv = []) {
  const rest = argv.slice(1);
  const rawSubcommand = String(rest[0] || '').trim().toLowerCase();
  const options = {
    subcommand: isHelpArg(rawSubcommand) ? '' : rawSubcommand,
    json: false,
    format: 'text',
    dryRun: false,
    dashboard: false,
    changed: false,
    base: 'HEAD',
    client: 'codex',
  };
  let help = isHelpArg(rawSubcommand);
  let start = 1;
  if (options.subcommand === 'comply') {
    const pathArg = rest[1] || '';
    if (pathArg && !isHelpArg(pathArg) && !String(pathArg).startsWith('-')) {
      options.path = pathArg;
      start = 2;
    } else {
      options.path = '';
    }
  }
  for (let index = 1; index < rest.length; index += 1) {
    const arg = rest[index];
    if (index < start) {
      continue;
    }
    if (isHelpArg(arg)) {
      help = true;
      continue;
    } else if (arg === '--json') {
      options.json = true;
      options.format = 'json';
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--dashboard') {
      options.dashboard = true;
    } else if (arg === '--changed') {
      options.changed = true;
    } else if (arg === '--base') {
      options.base = takeValue(rest, index, '--base');
      index += 1;
    } else if (arg === '--client') {
      options.client = takeValue(rest, index, '--client');
      index += 1;
    } else if (arg === '--format') {
      options.format = takeValue(rest, index, '--format');
      options.json = options.format === 'json';
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (help) {
    return {
      mode: 'help',
      help: true,
      command: 'skill',
      options,
    };
  }
  if (!options.subcommand) throw new Error('skill requires subcommand: comply, health, or verify-training');
  if (options.subcommand === 'comply') {
    if (!options.path) throw new Error('skill comply requires a path');
  }
  if (!['comply', 'health', 'verify-training'].includes(options.subcommand)) {
    throw new Error('skill requires subcommand: comply, health, or verify-training');
  }
  return {
    mode: 'command',
    help: false,
    command: 'skill',
    options,
  };
}
