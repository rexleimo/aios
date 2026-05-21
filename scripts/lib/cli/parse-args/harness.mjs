import {
  createDefaultHarnessResumeOptions,
  createDefaultHarnessRunOptions,
  createDefaultHarnessStatusOptions,
  createDefaultHarnessStopOptions,
  createDefaultHudOptions,
  HARNESS_SUBCOMMANDS,
  SKILL_CANDIDATE_VIEWS,
  TEAM_PROVIDER_CLIENT_MAP,
  normalizeBaseRef,
  normalizeHarnessProfile,
  normalizeHudPreset,
  normalizeOrchestrateDispatchMode,
  normalizeOrchestrateExecutionMode,
  normalizeOrchestratePreflightMode,
  normalizeOrchestratorBlueprint,
  normalizeOrchestratorFormat,
  normalizeSkillCandidateView,
  normalizeSoloHarnessProvider,
  normalizeTeamProvider,
  parsePositiveInteger,
  parseTeamSpec,
  parseWatchInterval,
  takeValue,
} from "./shared.mjs";
export function parseHarnessArgs(argv) {
  const rest = argv.slice(1);
  if (rest[0] === '-h' || rest[0] === '--help') {
    return {
      mode: 'help',
      help: true,
      command: 'harness',
      options: createDefaultHarnessRunOptions(),
    };
  }
  const subcommand = rest[0] && !rest[0].startsWith('-') ? String(rest[0]).trim().toLowerCase() : 'run';
  if (!HARNESS_SUBCOMMANDS.has(subcommand)) {
    throw new Error(`harness subcommand must be one of: ${[...HARNESS_SUBCOMMANDS].join(', ')}`);
  }
  if (subcommand === 'run') return parseHarnessRunArgs(argv);
  if (subcommand === 'status') return parseHarnessStatusArgs(argv);
  if (subcommand === 'resume') return parseHarnessResumeArgs(argv);
  return parseHarnessStopArgs(argv);
}

function parseHarnessRunArgs(argv) {
  const rest = argv.slice(2);
  const options = createDefaultHarnessRunOptions();
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--objective':
        options.objective = takeValue(rest, index, '--objective');
        index += 1;
        break;
      case '--session':
        options.sessionId = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      case '--provider':
        options.provider = normalizeSoloHarnessProvider(takeValue(rest, index, '--provider'));
        index += 1;
        break;
      case '--profile':
        options.profile = normalizeHarnessProfile(takeValue(rest, index, '--profile'));
        index += 1;
        break;
      case '--worktree':
        options.worktree = true;
        break;
      case '--base-ref':
        options.baseRef = normalizeBaseRef(takeValue(rest, index, '--base-ref'));
        index += 1;
        break;
      case '--max-iterations':
        options.maxIterations = parsePositiveInteger(takeValue(rest, index, '--max-iterations'), '--max-iterations');
        index += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--hooks':
        options.lifecycleHooks = true;
        break;
      case '--no-hooks':
        options.lifecycleHooks = false;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'harness',
    options,
  };
}

function parseHarnessStatusArgs(argv) {
  const rest = argv.slice(2);
  const options = createDefaultHarnessStatusOptions();
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--session':
        options.sessionId = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'harness',
    options,
  };
}

function parseHarnessResumeArgs(argv) {
  const rest = argv.slice(2);
  const options = createDefaultHarnessResumeOptions();
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--session':
        options.sessionId = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      case '--max-iterations':
        options.maxIterations = parsePositiveInteger(takeValue(rest, index, '--max-iterations'), '--max-iterations');
        index += 1;
        break;
      case '--hooks':
        options.lifecycleHooks = true;
        break;
      case '--no-hooks':
        options.lifecycleHooks = false;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'harness',
    options,
  };
}

function parseHarnessStopArgs(argv) {
  const rest = argv.slice(2);
  const options = createDefaultHarnessStopOptions();
  let help = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') continue;
    if (arg === '-h' || arg === '--help') {
      help = true;
      continue;
    }

    switch (arg) {
      case '--session':
        options.sessionId = takeValue(rest, index, '--session');
        index += 1;
        break;
      case '--workspace':
        options.workspaceRoot = takeValue(rest, index, '--workspace');
        index += 1;
        break;
      case '--reason':
        options.reason = takeValue(rest, index, '--reason');
        index += 1;
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return {
    mode: help ? 'help' : 'command',
    help,
    command: 'harness',
    options,
  };
}
