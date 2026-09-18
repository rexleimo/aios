// scripts/lib/cli/parse-args/judgment.mjs — `aios judgment` 参数解析。
import { Command } from 'commander';

const ALL_SUBCOMMANDS = ['status', 'enable', 'disable', 'ask'];

const SHARED_OPTIONS = [
  ['--json', 'Output as JSON'],
  ['--format <text|json>', 'Output format'],
  ['--vendor <name>', 'Judgment vendor (default: typesafe)'],
  ['--config <path>', 'Override the judgment config path'],
];

const ENABLE_OPTIONS = [
  ['--model <alias>', 'Model alias to request (default: jev-latest)'],
  ['--act-floor <n>', 'Confidence at or above which the gate may act (0..1)'],
  ['--confirm-floor <n>', 'Confidence below which the gate aborts (0..1)'],
  ['--max-calls <n>', 'Session call budget'],
  ['--max-input-chars <n>', 'Request size budget in characters'],
  ['--probe', 'Send one real (metered) probe call after enabling'],
];

const ASK_OPTIONS = [
  ['--state <text|@file>', 'The state to evaluate'],
  ['--questions <json|@file>', 'JSON map of typed questions'],
  ['--risk <class>', 'Risk class: read-only, guarded, or destructive'],
];

const program = new Command()
  .name('judgment')
  .helpOption(false)
  .exitOverride()
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument('[args...]');

for (const name of ALL_SUBCOMMANDS) {
  const cmd = program
    .command(name)
    .description(`Judgment ${name} command`)
    .helpOption(false)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument('[vendor]')
    .argument('[args...]');
  for (const [flags, desc] of SHARED_OPTIONS) cmd.option(flags, desc);
  if (name === 'enable') for (const [flags, desc] of ENABLE_OPTIONS) cmd.option(flags, desc);
  if (name === 'ask') for (const [flags, desc] of ASK_OPTIONS) cmd.option(flags, desc);
}

export function parseJudgmentArgs(argv = []) {
  const rest = argv.slice(1);
  const rawSubcommand = String(rest[0] || '').trim().toLowerCase();
  const help = argv.includes('-h') || argv.includes('--help') || rest.includes('help');

  // `aios judgment` 不带子命令 = status（只读、安全）。
  const isKnownSub = ALL_SUBCOMMANDS.includes(rawSubcommand);
  const subcommand = help ? '' : (isKnownSub ? rawSubcommand : 'status');

  const options = {
    subcommand,
    vendor: '',
    json: false,
    format: 'text',
    configPath: '',
    model: undefined,
    actFloor: undefined,
    confirmFloor: undefined,
    maxCalls: undefined,
    maxInputChars: undefined,
    probe: false,
    state: '',
    questions: '',
    risk: 'guarded',
  };

  try {
    if (!subcommand) return { mode: 'help', help: true, command: 'judgment', options };

    const parseTarget = isKnownSub ? rest : ['status', ...rest];
    const parsed = program.parse(parseTarget, { from: 'user' });
    const matched = parsed.commands?.find((command) => command.name() === subcommand);
    const flags = matched?.opts ? matched.opts() : {};
    const positional = (matched?.args || []).map((value) => String(value).trim()).filter(Boolean);
    options.vendor = positional[0] || '';

    if (flags.json === true) options.json = true;
    if (flags.format) options.format = String(flags.format);
    if (flags.vendor) options.vendor = String(flags.vendor);
    if (flags.config) options.configPath = String(flags.config);
    if (flags.model !== undefined) options.model = String(flags.model);
    if (flags.actFloor !== undefined) options.actFloor = String(flags.actFloor);
    if (flags.confirmFloor !== undefined) options.confirmFloor = String(flags.confirmFloor);
    if (flags.maxCalls !== undefined) options.maxCalls = String(flags.maxCalls);
    if (flags.maxInputChars !== undefined) options.maxInputChars = String(flags.maxInputChars);
    if (flags.probe === true) options.probe = true;
    if (flags.state !== undefined) options.state = String(flags.state);
    if (flags.questions !== undefined) options.questions = String(flags.questions);
    if (flags.risk !== undefined) options.risk = String(flags.risk);
    if (options.json) options.format = 'json';

    // 数字参数在这里转，非法值直接报错而不是变成 NaN 传下去。
    for (const key of ['actFloor', 'confirmFloor']) {
      if (options[key] === undefined) continue;
      const value = Number(options[key]);
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(`--${key === 'actFloor' ? 'act-floor' : 'confirm-floor'} must be a number in [0, 1] (got ${options[key]})`);
      }
      options[key] = value;
    }
    for (const [key, flag] of [['maxCalls', 'max-calls'], ['maxInputChars', 'max-input-chars']]) {
      if (options[key] === undefined) continue;
      const value = Number(options[key]);
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`--${flag} must be a positive integer (got ${options[key]})`);
      }
      options[key] = value;
    }

    if ((subcommand === 'enable' || subcommand === 'disable') && !options.vendor) {
      throw new Error(`judgment ${subcommand} requires a vendor (known: typesafe)`);
    }
    if (subcommand === 'ask') {
      if (!options.state) throw new Error('judgment ask requires --state <text|@file>');
      if (!options.questions) throw new Error('judgment ask requires --questions <json|@file>');
    }

    return { mode: 'command', help: false, command: 'judgment', options };
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('requires a vendor')
      || error.message.includes('requires --state')
      || error.message.includes('requires --questions')
      || error.message.includes('must be a number in')
      || error.message.includes('must be a positive integer')
    )) throw error;
    return { mode: 'help', help: true, command: 'judgment', options };
  }
}
