import { takeValue } from './shared.mjs';

function isHelpArg(arg) {
  return arg === '-h' || arg === '--help' || arg === 'help';
}

export function parseSessionArgs(argv = []) {
  const rest = argv.slice(1);
  const rawSubcommand = String(rest[0] || '').trim().toLowerCase();
  const options = {
    subcommand: isHelpArg(rawSubcommand) ? '' : rawSubcommand,
    session: 'default',
    json: false,
    format: 'text',
  };
  let help = isHelpArg(rawSubcommand);
  for (let index = 1; index < rest.length; index += 1) {
    const arg = rest[index];
    if (isHelpArg(arg)) {
      help = true;
      continue;
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
  if (help) {
    return {
      mode: 'help',
      help: true,
      command: 'session',
      options,
    };
  }
  if (!options.subcommand) throw new Error('session requires subcommand: changed-files, close, start');
  if (!['changed-files', 'close', 'start'].includes(options.subcommand)) {
    throw new Error('session requires subcommand: changed-files, close, start');
  }
  return {
    mode: 'command',
    help: false,
    command: 'session',
    options,
  };
}
