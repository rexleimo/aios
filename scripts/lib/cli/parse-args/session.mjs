import { takeValue } from './shared.mjs';

export function parseSessionArgs(argv = []) {
  const rest = argv.slice(1);
  const options = {
    subcommand: String(rest[0] || '').trim().toLowerCase(),
    session: 'default',
    json: false,
    format: 'text',
  };
  let help = false;
  if (!options.subcommand) throw new Error('session requires subcommand: changed-files');
  for (let index = 1; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '-h' || arg === '--help') {
      help = true;
    } else if (arg === '--json') {
      options.json = true;
      options.format = 'json';
    } else if (arg === '--session') {
      options.session = takeValue(rest, index, '--session');
      index += 1;
    } else if (arg === '--format') {
      options.format = takeValue(rest, index, '--format');
      options.json = options.format === 'json';
      index += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (options.subcommand !== 'changed-files') {
    throw new Error('session requires subcommand: changed-files');
  }
  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'session',
    options,
  };
}
