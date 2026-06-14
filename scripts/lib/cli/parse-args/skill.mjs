import { takeValue } from './shared.mjs';

export function parseSkillArgs(argv = []) {
  const rest = argv.slice(1);
  const options = {
    subcommand: String(rest[0] || '').trim().toLowerCase(),
    json: false,
    format: 'text',
    dryRun: false,
    dashboard: false,
    client: 'codex',
  };
  let help = false;
  if (!options.subcommand) throw new Error('skill requires subcommand: comply or health');
  let start = 1;
  if (options.subcommand === 'comply') {
    options.path = rest[1] || '';
    start = 2;
    if (!options.path) throw new Error('skill comply requires a path');
  }
  for (let index = start; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '--json') {
      options.json = true;
      options.format = 'json';
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--dashboard') {
      options.dashboard = true;
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
  if (!['comply', 'health'].includes(options.subcommand)) {
    throw new Error('skill requires subcommand: comply or health');
  }
  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'skill',
    options,
  };
}
