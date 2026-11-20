// scripts/lib/tooling/cli/parse-args/platform/plugin.mjs — `aios plugin` 参数解析。
const ALL_SUBCOMMANDS = ['list', 'install', 'remove', 'enable', 'disable', 'providers', 'models'];

function takeValue(args, index, flag) {
  const token = args[index];
  if (token === flag) {
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${flag} requires a value`);
    }
    return { value, consumed: 2 };
  }
  if (token.startsWith(`${flag}=`)) {
    return { value: token.slice(flag.length + 1), consumed: 1 };
  }
  return null;
}

export function parsePluginArgs(argv = []) {
  const rest = argv.slice(1);
  const rawSubcommand = String(rest[0] || '').trim().toLowerCase();
  const help = argv.includes('-h') || argv.includes('--help') || rest.includes('help');
  const isKnownSub = ALL_SUBCOMMANDS.includes(rawSubcommand);
  const subcommand = help || !isKnownSub ? '' : rawSubcommand;
  const options = { subcommand, action: subcommand, id: '', dir: '', json: false, format: 'text', projectRoot: '' };

  try {
    if (!subcommand) {
      if (rawSubcommand && !rawSubcommand.startsWith('-') && !help) {
        throw new Error(`plugin requires subcommand: ${ALL_SUBCOMMANDS.join(', ')}`);
      }
      return { mode: 'help', help: true, command: 'plugin', options };
    }
    for (let i = 1; i < rest.length; i += 1) {
      const token = rest[i];
      if (token === '--json') { options.json = true; continue; }
      let hit = takeValue(rest, i, '--id');
      if (hit) { options.id = hit.value; i += hit.consumed - 1; continue; }
      hit = takeValue(rest, i, '--dir');
      if (hit) { options.dir = hit.value; i += hit.consumed - 1; continue; }
      hit = takeValue(rest, i, '--manifest');
      if (hit) { options.dir = hit.value; i += hit.consumed - 1; continue; }
      hit = takeValue(rest, i, '--project-root');
      if (hit) { options.projectRoot = hit.value; i += hit.consumed - 1; continue; }
      // 位置参数作为 id（如 `aios plugin remove my-plugin`）
      if (token && !token.startsWith('--') && !options.id) options.id = token;
    }
    if (options.json) options.format = 'json';
    if (!['list', 'providers', 'models'].includes(subcommand) && !options.id) {
      throw new Error(`plugin ${subcommand} requires an id (--id <name> or positional)`);
    }
    return { mode: 'command', help: false, command: 'plugin', options };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('requires') || error.message.includes('requires a value'))) throw error;
    return { mode: 'help', help: true, command: 'plugin', options };
  }
}
