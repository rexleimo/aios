// scripts/lib/cli/parse-args/integration.mjs — `aios integration` 参数解析。
import { Command } from 'commander';

const ALL_SUBCOMMANDS = ['list', 'add', 'doctor', 'remove'];

const SHARED_OPTIONS = [
  ['--json', 'Output as JSON'],
  ['--format <text|json>', 'Output format'],
  ['--clients <list>', 'Comma list of clients, or "all"'],
  ['--scope <scope>', 'MCP registration scope: global or project'],
  ['--dry-run', 'Preview without writing anything'],
  ['--skip-skills', 'Only touch the MCP plane'],
  ['--skip-mcp', 'Only touch the skill plane'],
  ['--project-root <path>', 'Project root for project-scoped registration and installs (default: current directory)'],
];

const program = new Command()
  .name('integration')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[args...]');

for (const name of ALL_SUBCOMMANDS) {
  const cmd = program
    .command(name)
    .description(`Integration ${name} command`)
    .helpOption(false)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument('[id]')
    .argument('[args...]');
  for (const [flags, desc] of SHARED_OPTIONS) {
    cmd.option(flags, desc);
  }
}

export function parseIntegrationArgs(argv = []) {
  const rest = argv.slice(1);
  const rawSubcommand = String(rest[0] || '').trim().toLowerCase();
  const help = argv.includes('-h') || argv.includes('--help') || rest.includes('help');
  const isKnownSub = ALL_SUBCOMMANDS.includes(rawSubcommand);
  const subcommand = help || !isKnownSub ? '' : rawSubcommand;

  const options = {
    subcommand,
    id: '',
    json: false,
    format: 'text',
    clients: '',
    scope: 'global',
    dryRun: false,
    skipSkills: false,
    skipMcp: false,
    projectRoot: '',
  };

  try {
    if (!subcommand) {
      if (rawSubcommand && !rawSubcommand.startsWith('-') && !help) {
        throw new Error('integration requires subcommand: list, add, doctor, or remove');
      }
      return { mode: 'help', help: true, command: 'integration', options };
    }

    const parsed = program.parse(rest, { from: 'user' });
    const matched = parsed.commands?.find((command) => command.name() === subcommand);
    const flags = matched?.opts ? matched.opts() : {};

    // 位置参数必须从子命令自己的 args 读：program 层的 args 会把子命令名和
    // 选项值（如 `--project-root .` 里的 `.`）一并带上，导致它们被误当成 id。
    const positional = (matched?.args || []).map((value) => String(value).trim()).filter(Boolean);
    options.id = String(positional[0] || '').trim();

    if (flags.json === true) options.json = true;
    if (flags.format) options.format = String(flags.format);
    if (flags.clients) options.clients = String(flags.clients);
    if (flags.scope) {
      const scope = String(flags.scope).trim().toLowerCase();
      if (!['global', 'project'].includes(scope)) {
        throw new Error(`--scope must be global or project (got ${flags.scope})`);
      }
      options.scope = scope;
    }
    if (flags.dryRun === true) options.dryRun = true;
    if (flags.skipSkills === true) options.skipSkills = true;
    if (flags.skipMcp === true) options.skipMcp = true;
    if (flags.projectRoot) options.projectRoot = String(flags.projectRoot);
    if (options.json) options.format = 'json';

    if (subcommand !== 'list' && !options.id) {
      throw new Error(`integration ${subcommand} requires an integration id (for example: typesafe)`);
    }
    if (subcommand === 'list' && options.id) {
      throw new Error(`integration list does not take an integration id (got "${options.id}")`);
    }

    return { mode: 'command', help: false, command: 'integration', options };
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('requires an integration id')
      || error.message.includes('requires subcommand')
      || error.message.includes('--scope must be')
      || error.message.includes('does not take an integration id')
    )) throw error;
    return { mode: 'help', help: true, command: 'integration', options };
  }
}
