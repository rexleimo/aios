/**
 * Dream command argument parser.
 * Supports: aios dream --preview | aios dream --apply
 */

export function parseDreamArgs(argv) {
  const rest = argv.slice(1);
  const options = {
    mode: 'preview',
    spaces: [],
  };
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }
    if (arg === '--preview') {
      options.mode = 'preview';
      continue;
    }
    if (arg === '--apply') {
      options.mode = 'apply';
      continue;
    }
    if (arg === '--space') {
      const value = rest[index + 1];
      if (!value || value.startsWith('-')) throw new Error('Missing value for --space');
      options.spaces.push(String(value).trim());
      index += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  // Default to 'default' space if none specified
  if (options.spaces.length === 0) {
    options.spaces = ['default'];
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'dream',
    options,
  };
}
