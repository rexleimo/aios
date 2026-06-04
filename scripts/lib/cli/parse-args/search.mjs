import { takeValue } from './shared.mjs';

export function parseSearchArgs(argv = []) {
  const rest = argv.slice(1);
  const options = {
    query: '',
    limit: '20',
    sources: '',
    scope: '',
    agent: '',
    space: 'default',
    workspaceRoot: '',
    format: 'text',
    json: false,
  };
  const queryParts = [];
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
    if (arg === '--format') {
      const value = takeValue(rest, index, '--format');
      options.format = String(value).trim().toLowerCase();
      options.json = options.format === 'json';
      index += 1;
      continue;
    }
    if (arg === '--limit') {
      options.limit = takeValue(rest, index, '--limit');
      index += 1;
      continue;
    }
    if (arg === '--source' || arg === '--sources') {
      options.sources = takeValue(rest, index, arg);
      index += 1;
      continue;
    }
    if (arg === '--scope') {
      options.scope = takeValue(rest, index, '--scope');
      index += 1;
      continue;
    }
    if (arg === '--agent') {
      options.agent = takeValue(rest, index, '--agent');
      index += 1;
      continue;
    }
    if (arg === '--space') {
      options.space = takeValue(rest, index, '--space');
      index += 1;
      continue;
    }
    if (arg === '--workspace') {
      options.workspaceRoot = takeValue(rest, index, '--workspace');
      index += 1;
      continue;
    }
    if (String(arg || '').startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    queryParts.push(String(arg || ''));
  }

  if (!['text', 'json'].includes(options.format)) {
    throw new Error('--format must be one of: text, json');
  }
  options.query = queryParts.join(' ').trim();
  if (!help && !options.query) {
    throw new Error('search requires query text');
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'search',
    options,
  };
}
